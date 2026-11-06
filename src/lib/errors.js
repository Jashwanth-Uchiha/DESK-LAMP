// Map Firebase error codes to messages that are helpful but don't leak
// whether an account exists (sign-in and reset use deliberately generic text).

const AUTH_MESSAGES = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact an administrator.',
  'auth/email-already-in-use': 'Could not create the account. If you already have one, sign in or reset your password.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/password-does-not-meet-requirements': 'Password does not meet the requirements.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/requires-recent-login': 'Please sign in again to continue.',
  'auth/operation-not-allowed': 'Email sign-in is not enabled for this project.',
};

export function authErrorMessage(err) {
  const code = err && err.code;
  return AUTH_MESSAGES[code] || 'Something went wrong. Please try again.';
}

export function isPermissionDenied(err) {
  const s = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
  return s.includes('permission_denied') || s.includes('permission-denied') || s.includes('permission denied');
}

/** Message for a failed database write. */
export function dbErrorMessage(err, { denied } = {}) {
  if (isPermissionDenied(err)) {
    return denied || "You don't have permission to do that. If your email isn't verified or your account is restricted, that's why.";
  }
  if (`${err?.message || ''}`.toLowerCase().includes('network')) return 'Network error — your change was not saved.';
  return 'Could not save. Please try again.';
}
