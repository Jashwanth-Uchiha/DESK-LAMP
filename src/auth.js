// Authentication + profile service. UI code calls these; nothing here touches the DOM.
//
// Trust model: everything the browser decides here (role, verified, suspended) is for
// DISPLAY ONLY. database.rules.json re-checks every read and write on the server.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { ref, get, update, serverTimestamp } from 'firebase/database';
import { auth, db } from './firebase.js';
import {
  normalizeRoll, validateRoll, normalizeDisplayName, validateDisplayName,
  validateEmail, validatePassword, isValidRole,
} from './lib/validation.js';
import { authErrorMessage, isPermissionDenied } from './lib/errors.js';

class UserFacingError extends Error {}
export { UserFacingError };

function fail(msg) { throw new UserFacingError(msg); }

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signIn({ email, password, remember }) {
  const e = validateEmail(email); if (e) fail(e);
  if (!password) fail('Enter your password.');
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch (err) {
    fail(authErrorMessage(err));
  }
}

/**
 * Creates the Auth account, sends a verification email, then writes the profile.
 * If the profile write fails (e.g. roll number already claimed) the account still
 * exists; the app will show the "finish setting up" screen on next load.
 */
export async function signUp({ email, password, password2, displayName, rollNumber }) {
  const err =
    validateDisplayName(displayName) || validateRoll(rollNumber) ||
    validateEmail(email) || validatePassword(password, password2);
  if (err) fail(err);

  let user;
  try {
    await setPersistence(auth, browserLocalPersistence);
    user = (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
  } catch (e) {
    fail(authErrorMessage(e));
  }
  // Best effort: account creation already succeeded.
  sendEmailVerification(user).catch(() => {});
  await createProfile(user.uid, { displayName, rollNumber });
  return user;
}

/** Atomic multi-path write: private profile + public profile + roll-number claim. */
export async function createProfile(uid, { displayName, rollNumber }) {
  const err = validateDisplayName(displayName) || validateRoll(rollNumber);
  if (err) fail(err);
  const name = normalizeDisplayName(displayName);
  const roll = normalizeRoll(rollNumber);
  try {
    await update(ref(db), {
      [`users/${uid}`]: { displayName: name, rollNumber: roll, createdAt: serverTimestamp() },
      [`publicProfiles/${uid}`]: { displayName: name },
      [`rollIndex/${roll}`]: uid,
    });
  } catch (e) {
    if (isPermissionDenied(e)) {
      fail('That roll number is already registered. If it is yours, contact an administrator.');
    }
    fail('Could not save your profile. Check your connection and try again.');
  }
  return { displayName: name, rollNumber: roll };
}

export async function loadProfile(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? snap.val() : null;
}

/** Role for display only. Missing → 'student'. */
export async function loadRole(uid) {
  try {
    const snap = await get(ref(db, `roles/${uid}`));
    const r = snap.val();
    return isValidRole(r) ? r : 'student';
  } catch {
    return 'student';
  }
}

/** Returns the suspension/mute record visible to the user, or null. */
export async function loadRestriction(uid) {
  for (const kind of ['suspended', 'muted']) {
    try {
      const snap = await get(ref(db, `moderation/${kind}/${uid}`));
      if (snap.exists()) return { kind, ...snap.val() };
    } catch { /* not readable → treat as none */ }
  }
  return null;
}

export async function requestPasswordReset(email) {
  const e = validateEmail(email); if (e) fail(e);
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    // Don't reveal whether the account exists; only surface rate-limit / network errors.
    if (['auth/too-many-requests', 'auth/network-request-failed', 'auth/invalid-email'].includes(err?.code)) {
      fail(authErrorMessage(err));
    }
  }
}

export async function resendVerification() {
  if (!auth.currentUser) return;
  try {
    await sendEmailVerification(auth.currentUser);
  } catch (err) {
    fail(authErrorMessage(err));
  }
}

/** Reload the user and force a new ID token so rules see email_verified=true. */
export async function refreshVerification() {
  const u = auth.currentUser;
  if (!u) return false;
  await u.reload();
  await u.getIdToken(true);
  return auth.currentUser.emailVerified;
}

export async function signOutUser() {
  await signOut(auth);
}
