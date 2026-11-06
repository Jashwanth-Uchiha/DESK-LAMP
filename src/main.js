import { auth, db, configError, usingEmulators } from './firebase.js';
import {
  watchAuth, signIn, signUp, createProfile, loadProfile, loadRole, loadRestriction,
  requestPasswordReset, resendVerification, refreshVerification, signOutUser, UserFacingError,
} from './auth.js';
import { $, $$, show, setMsg, wireTabs } from './lib/dom.js';
import { initThemePicker } from './features/theme.js';
import { mountChat } from './features/chat.js';
import { mountDiscuss } from './features/discuss.js';
import { mountTodo } from './features/todo.js';
import { mountPomodoro } from './features/pomodoro.js';

const VIEWS = ['config', 'loading', 'auth', 'profile', 'main'];
function showView(name) { VIEWS.forEach((v) => show($(`#view-${v}`), v === name)); }

let unmounts = [];
let routing = 0;           // increments per route() so stale async results are ignored
let signupInProgress = false;

function unmountAll() { unmounts.forEach((fn) => { try { fn(); } catch { /* ignore */ } }); unmounts = []; }

const friendly = (e) => (e instanceof UserFacingError ? e.message : 'Something went wrong. Please try again.');

/** Run an async form action with a disabled submit button and a message area. */
function bindForm(form, action) {
  const msg = form.querySelector('.form-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    setMsg(msg, '');
    try {
      const okText = await action(new FormData(form), form);
      if (okText) setMsg(msg, okText, true);
    } catch (err) {
      if (!(err instanceof UserFacingError)) console.error(err);
      setMsg(msg, friendly(err));
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------------- Static UI wiring (once) ----------------

function setAuthView(view) {
  ['signin', 'signup', 'reset'].forEach((v) => show($(`#form-${v}`), v === view));
  $$('[role=tab][data-authview]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.authview === view)));
  const first = $(`#form-${view} input`);
  if (first) first.focus();
}

function wireStaticUi() {
  initThemePicker();
  $$('[data-authview]').forEach((b) => b.addEventListener('click', () => setAuthView(b.dataset.authview)));

  bindForm($('#form-signin'), async (fd) => {
    await signIn({ email: fd.get('email'), password: fd.get('password'), remember: $('#siRemember').checked });
    // onAuthStateChanged takes over from here.
  });

  bindForm($('#form-signup'), async (fd) => {
    signupInProgress = true;
    try {
      await signUp({
        email: fd.get('email'), password: fd.get('password'), password2: fd.get('password2'),
        displayName: fd.get('displayName'), rollNumber: fd.get('rollNumber'),
      });
    } catch (err) {
      if (!auth.currentUser) throw err; // account not created: show error on this form
      // Account exists but profile failed (e.g. roll number taken): continue on the profile screen.
      signupInProgress = false;
      $('#pfName').value = fd.get('displayName') || '';
      $('#pfRoll').value = fd.get('rollNumber') || '';
      await route(auth.currentUser);
      setMsg($('#form-profile .form-msg'), friendly(err));
      return;
    } finally {
      signupInProgress = false;
    }
    await route(auth.currentUser);
  });

  bindForm($('#form-reset'), async (fd) => {
    await requestPasswordReset(fd.get('email'));
    return 'If an account exists for that email, a reset link is on its way.';
  });

  bindForm($('#form-profile'), async (fd) => {
    const u = auth.currentUser;
    if (!u) return;
    await createProfile(u.uid, { displayName: fd.get('displayName'), rollNumber: fd.get('rollNumber') });
    route(u);
  });

  $$('[data-action=signout]').forEach((b) => b.addEventListener('click', async () => {
    unmountAll();
    await signOutUser();
  }));

  $('#resendVerify').addEventListener('click', async () => {
    try { await resendVerification(); setMsg($('#verifyMsg'), 'Sent. Check your inbox (and spam).', true); }
    catch (e) { setMsg($('#verifyMsg'), friendly(e)); }
  });
  $('#checkVerify').addEventListener('click', async () => {
    try {
      const ok = await refreshVerification();
      if (ok) route(auth.currentUser);
      else setMsg($('#verifyMsg'), 'Not verified yet. Open the link in the email first.');
    } catch { setMsg($('#verifyMsg'), 'Could not check right now. Try again.'); }
  });

  // Main tabs
  wireTabs($$('nav.tabs [data-tab]'), 'tab', (tab) => {
    $$('#view-main > section.panel').forEach((s) => show(s, s.id === `tab-${tab}`));
  });
  // Chat sub-views
  wireTabs($$('[data-chatview]'), 'chatview', (v) => {
    show($('#chatRoomView'), v === 'room');
    show($('#chatTrendView'), v === 'trending');
  });
  // Discussion sort tabs (aria state only; discuss.js listens for the value)
  wireTabs($$('[data-sort]'), 'sort', () => {});
  // Pomodoro mode buttons manage their own aria-checked in pomodoro.js
}

// ---------------- Routing on auth state ----------------

async function route(user) {
  const my = ++routing;
  unmountAll();
  if (!user) { showView('auth'); setAuthView('signin'); return; }
  if (signupInProgress) return; // signup handler routes when it finishes

  showView('loading');
  let profile;
  try {
    profile = await loadProfile(user.uid);
  } catch (e) {
    console.error(e);
    if (my !== routing) return;
    showView('auth');
    setMsg($('#form-signin .form-msg'), 'Could not load your profile. Check your connection and sign in again.');
    await signOutUser();
    return;
  }
  if (my !== routing) return;
  if (!profile) { showView('profile'); $('#pfName').focus(); return; }

  const [role, restriction] = await Promise.all([loadRole(user.uid), loadRestriction(user.uid)]);
  if (my !== routing) return;

  $('#whoami').textContent = profile.displayName;
  const badge = $('#roleBadge');
  badge.textContent = role;
  show(badge, role !== 'student');

  const verified = user.emailVerified;
  show($('#verifyBanner'), !verified);
  setMsg($('#verifyMsg'), '');
  const banner = $('#suspendedBanner');
  if (restriction) {
    banner.textContent = restriction.kind === 'suspended'
      ? `Your account is suspended: ${restriction.reason}. You can still use your private tasks and timer.`
      : `Your account is muted: ${restriction.reason}. You can read but not post.`;
  }
  show(banner, !!restriction);

  const ctx = { db, user, profile, role, canPost: verified };
  unmounts = [mountChat(ctx), mountDiscuss(ctx), mountTodo(ctx), mountPomodoro(ctx)];
  showView('main');
}

// ---------------- Boot ----------------

if (configError) {
  $('#configMsg').textContent = configError;
  showView('config');
} else {
  wireStaticUi();
  if (usingEmulators) console.info('[Desk Lamp] Using local Firebase emulators.');
  watchAuth((u) => route(u));
}
