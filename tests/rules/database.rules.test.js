// Security-rules tests. Run with: npm run test:rules (starts the Database emulator).
import { readFileSync } from 'node:fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

const TS = { '.sv': 'timestamp' };
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-desk-lamp',
    // RULES_FILE lets you run the suite against a deliberately broken ruleset to prove it catches regressions.
    database: { rules: readFileSync(process.env.RULES_FILE || 'database.rules.json', 'utf8') },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearDatabase(); });

const db = (uid, verified = true) => env.authenticatedContext(uid, { email_verified: verified, email: `${uid}@college.test` }).database();
const anonDb = () => env.unauthenticatedContext().database();
const seed = (data) => env.withSecurityRulesDisabled((ctx) => ctx.database().ref().update(data));

const roll = (uid) => `${uid.toUpperCase()}01`;
const profileWrite = (uid, name = uid, r = roll(uid)) => ({
  [`users/${uid}`]: { displayName: name, rollNumber: r, createdAt: TS },
  [`publicProfiles/${uid}`]: { displayName: name },
  [`rollIndex/${r}`]: uid,
});
async function seedUser(uid, role) {
  await seed({
    [`users/${uid}`]: { displayName: uid, rollNumber: roll(uid), createdAt: 1 },
    [`publicProfiles/${uid}`]: { displayName: uid },
    [`rollIndex/${roll(uid)}`]: uid,
    ...(role ? { [`roles/${uid}`]: role } : {}),
  });
}
const latest = (d, path = 'rooms/general/messages', n = 100) => d.ref(path).orderByChild('createdAt').limitToLast(n).once('value');
const msg = (uid, text = 'hello', name = uid) => ({ uid, name, text, createdAt: TS });

// ------------------------------------------------------------------

describe('default deny', () => {
  it('unauthenticated users can read and write nothing', async () => {
    await seedUser('alice');
    await assertFails(anonDb().ref().once('value'));
    await assertFails(anonDb().ref('users/alice').once('value'));
    await assertFails(anonDb().ref('publicProfiles/alice').once('value'));
    await assertFails(latest(anonDb()));
    await assertFails(anonDb().ref('posts/x').set(msg('alice')));
    await assertFails(anonDb().ref('somethingElse').set(1));
  });
  it('signed-in users cannot write to unknown paths or read the root', async () => {
    await assertFails(db('alice').ref('user:alice').set({ password: 'x' }));
    await assertFails(db('alice').ref().once('value'));
  });
});

describe('profiles and roll numbers', () => {
  it('a user can create their own profile with a free roll number', async () => {
    await assertSucceeds(db('alice').ref().update(profileWrite('alice')));
  });
  it('a second account cannot claim the same roll number', async () => {
    await assertSucceeds(db('alice').ref().update(profileWrite('alice', 'Alice', '21CS001')));
    await assertFails(db('mallory').ref().update(profileWrite('mallory', 'Mallory', '21CS001')));
  });
  it('cannot claim a roll number without a matching profile', async () => {
    await assertFails(db('mallory').ref('rollIndex/21CS999').set('mallory'));
  });
  it('cannot write someone else\'s profile', async () => {
    await assertFails(db('mallory').ref().update(profileWrite('alice')));
    await assertFails(db('mallory').ref('users/alice').set({ displayName: 'x', rollNumber: 'ALICE01', createdAt: TS }));
  });
  it('rejects invalid roll numbers and display names', async () => {
    await assertFails(db('alice').ref().update(profileWrite('alice', 'Alice', 'a/b')));
    await assertFails(db('alice').ref().update(profileWrite('alice', '<script>', 'ALICE01')));
    await assertFails(db('alice').ref().update(profileWrite('alice', 'x'.repeat(41), 'ALICE01')));
    const withPassword = profileWrite('alice');
    withPassword['users/alice'] = { ...withPassword['users/alice'], password: 'hunter2' };
    await assertFails(db('alice').ref().update(withPassword));
  });
  it('rejects a client-chosen createdAt', async () => {
    const w = profileWrite('alice');
    w['users/alice'] = { ...w['users/alice'], createdAt: 123 };
    await assertFails(db('alice').ref().update(w));
  });
  it('roll number is immutable and profiles cannot be deleted by the owner', async () => {
    await seedUser('alice');
    await assertFails(db('alice').ref('users/alice/rollNumber').set('NEWROLL'));
    await assertFails(db('alice').ref('users/alice').remove());
    await assertFails(db('alice').ref('publicProfiles/alice').remove());
  });
  it('public display name must match the private one', async () => {
    await seedUser('alice');
    await assertFails(db('alice').ref('publicProfiles/alice/displayName').set('Admin Team'));
  });
  it('private profile (roll number) is owner/admin-only; public profile readable by signed-in users', async () => {
    await seedUser('alice');
    await seedUser('bob');
    await seedUser('root', 'admin');
    await assertSucceeds(db('alice').ref('users/alice').once('value'));
    await assertFails(db('bob').ref('users/alice').once('value'));
    await assertFails(db('bob').ref('users').once('value'));
    await assertSucceeds(db('root').ref('users').once('value'));
    await assertSucceeds(db('bob').ref('publicProfiles/alice').once('value'));
    await assertFails(db('bob').ref('publicProfiles').once('value')); // not listable
    await assertFails(db('bob').ref('rollIndex/ALICE01').once('value')); // no enumeration
  });
});

describe('roles', () => {
  beforeEach(async () => {
    await seedUser('alice');
    await seedUser('mod', 'moderator');
    await seedUser('root', 'admin');
  });
  it('students and moderators cannot grant roles (including to themselves)', async () => {
    await assertFails(db('alice').ref('roles/alice').set('admin'));
    await assertFails(db('alice').ref('roles/bob').set('moderator'));
    await assertFails(db('mod').ref('roles/alice').set('moderator'));
    await assertFails(db('mod').ref('roles/mod').set('admin'));
  });
  it('admins can set valid roles for others but not invalid ones or their own', async () => {
    await assertSucceeds(db('root').ref('roles/alice').set('senior'));
    await assertSucceeds(db('root').ref('roles/alice').set('counselor'));
    await assertFails(db('root').ref('roles/alice').set('superuser'));
    await assertFails(db('root').ref('roles/root').set('student'));
  });
  it('users can read their own role only', async () => {
    await assertSucceeds(db('mod').ref('roles/mod').once('value'));
    await assertFails(db('alice').ref('roles/mod').once('value'));
    await assertFails(db('alice').ref('roles').once('value'));
    await assertSucceeds(db('root').ref('roles').once('value'));
  });
  it('forged token claims do not grant admin (roles come from /roles)', async () => {
    // Role checks read /roles, not token claims — a forged claim does nothing.
    const forged = env.authenticatedContext('alice', { email_verified: true, role: 'admin', admin: true }).database();
    await assertFails(forged.ref('roles/bob').set('admin'));
  });
});

describe('chat messages', () => {
  beforeEach(async () => {
    await seedUser('alice');
    await seedUser('bob');
    await seedUser('mod', 'moderator');
  });

  it('verified users can read the latest messages with a bounded query only', async () => {
    await assertSucceeds(latest(db('alice')));
    await assertFails(db('alice').ref('rooms/general/messages').once('value')); // unbounded
    await assertFails(latest(db('alice'), 'rooms/general/messages', 500));
  });
  it('unverified users cannot read or post', async () => {
    await assertFails(latest(db('alice', false)));
    await assertFails(db('alice', false).ref('rooms/general/messages').push(msg('alice')));
  });
  it('users without a profile cannot post', async () => {
    await assertFails(db('ghost').ref('rooms/general/messages').push(msg('ghost')));
  });
  it('a verified user can post as themselves', async () => {
    await assertSucceeds(db('alice').ref('rooms/general/messages').push(msg('alice')));
  });
  it('cannot impersonate: uid and name must match the signed-in user', async () => {
    await assertFails(db('alice').ref('rooms/general/messages').push(msg('bob', 'hi', 'bob')));
    await assertFails(db('alice').ref('rooms/general/messages').push(msg('alice', 'hi', 'bob')));
  });
  it('rejects empty, oversized, extra-field and client-timestamped messages', async () => {
    const d = db('alice');
    await assertFails(d.ref('rooms/general/messages').push(msg('alice', '')));
    await assertFails(d.ref('rooms/general/messages').push(msg('alice', 'x'.repeat(1001))));
    await assertFails(d.ref('rooms/general/messages').push({ ...msg('alice'), isAdmin: true }));
    await assertFails(d.ref('rooms/general/messages').push({ ...msg('alice'), createdAt: 1 }));
    await assertFails(d.ref('rooms/other/messages').push(msg('alice')));
  });
  it('the whole chat cannot be wiped or overwritten', async () => {
    await seed({ 'rooms/general/messages/m1': { uid: 'bob', name: 'bob', text: 'hi', createdAt: 1 } });
    await assertFails(db('alice').ref('rooms/general/messages').set(null));
    await assertFails(db('alice').ref('rooms/general/messages').set({}));
    await assertFails(db('alice').ref('rooms/general').remove());
  });
  it('messages are immutable; only the author or a moderator can delete', async () => {
    await seed({ 'rooms/general/messages/m1': { uid: 'bob', name: 'bob', text: 'hi', createdAt: 1 } });
    await assertFails(db('alice').ref('rooms/general/messages/m1/text').set('edited'));
    await assertFails(db('bob').ref('rooms/general/messages/m1/text').set('edited'));
    await assertFails(db('alice').ref('rooms/general/messages/m1').remove());
    await assertSucceeds(db('bob').ref('rooms/general/messages/m1').remove());
    await seed({ 'rooms/general/messages/m2': { uid: 'bob', name: 'bob', text: 'bad', createdAt: 2 } });
    await assertSucceeds(db('mod').ref('rooms/general/messages/m2').remove());
  });
  it('votes: one per user, only as yourself, only on existing messages', async () => {
    await seed({ 'rooms/general/messages/m1': { uid: 'bob', name: 'bob', text: 'hi', createdAt: 1 } });
    await assertSucceeds(db('alice').ref('rooms/general/messages/m1/votes/alice').set(true));
    await assertSucceeds(db('alice').ref('rooms/general/messages/m1/votes/alice').remove());
    await assertFails(db('alice').ref('rooms/general/messages/m1/votes/bob').set(true));
    await assertFails(db('alice').ref('rooms/general/messages/m1/votes/alice').set(5));
    await assertFails(db('alice').ref('rooms/general/messages/missing/votes/alice').set(true));
    await assertFails(db('alice').ref('rooms/general/messages').push({ ...msg('alice'), votes: { bob: true, carol: true } }));
  });
  it('only moderators can hide messages', async () => {
    await seed({ 'rooms/general/messages/m1': { uid: 'bob', name: 'bob', text: 'hi', createdAt: 1 } });
    await assertFails(db('alice').ref('rooms/general/messages/m1/hidden').set({ by: 'alice', at: TS }));
    await assertFails(db('mod').ref('rooms/general/messages/m1/hidden').set({ by: 'alice', at: TS }));
    await assertSucceeds(db('mod').ref('rooms/general/messages/m1/hidden').set({ by: 'mod', at: TS }));
  });
});

describe('discussion posts', () => {
  beforeEach(async () => { await seedUser('alice'); await seedUser('bob'); });
  it('allows long posts up to the limit, rejects beyond', async () => {
    await assertSucceeds(db('alice').ref('posts').push(msg('alice', 'x'.repeat(4000))));
    await assertFails(db('alice').ref('posts').push(msg('alice', 'x'.repeat(4001))));
  });
  it('bounded reads only; no wipe; no impersonation', async () => {
    await assertSucceeds(latest(db('alice'), 'posts', 200));
    await assertFails(db('alice').ref('posts').once('value'));
    await assertFails(db('alice').ref('posts').set(null));
    await assertFails(db('alice').ref('posts').push(msg('bob')));
  });
});

describe('suspension and mute', () => {
  beforeEach(async () => {
    await seedUser('alice');
    await seedUser('bob');
    await seedUser('mod', 'moderator');
    await seedUser('mod2', 'moderator');
    await seedUser('root', 'admin');
    await seed({ 'rooms/general/messages/m1': { uid: 'bob', name: 'bob', text: 'hi', createdAt: 1 } });
  });
  const restriction = (by) => ({ reason: 'spam', by, at: TS });

  it('students cannot suspend anyone, or lift their own suspension', async () => {
    await assertFails(db('alice').ref('moderation/suspended/bob').set(restriction('alice')));
    await seed({ 'moderation/suspended/alice': { reason: 'x', by: 'mod', at: 1 } });
    await assertFails(db('alice').ref('moderation/suspended/alice').remove());
  });
  it('moderators can restrict students but not other moderators or admins', async () => {
    await assertSucceeds(db('mod').ref('moderation/suspended/alice').set(restriction('mod')));
    await assertSucceeds(db('mod').ref('moderation/muted/bob').set(restriction('mod')));
    await assertFails(db('mod').ref('moderation/suspended/mod2').set(restriction('mod')));
    await assertFails(db('mod').ref('moderation/suspended/root').set(restriction('mod')));
    await assertFails(db('mod').ref('moderation/suspended/alice').set(restriction('someoneElse')));
    await assertSucceeds(db('root').ref('moderation/suspended/mod2').set(restriction('root')));
  });
  it('suspended users cannot post or vote, but keep private data', async () => {
    await seed({ 'moderation/suspended/alice': { reason: 'x', by: 'mod', at: 1 } });
    await assertFails(db('alice').ref('rooms/general/messages').push(msg('alice')));
    await assertFails(db('alice').ref('posts').push(msg('alice')));
    await assertFails(db('alice').ref('rooms/general/messages/m1/votes/alice').set(true));
    await assertSucceeds(db('alice').ref('userData/alice/todos').push({ text: 'study', done: false, createdAt: TS }));
    await assertSucceeds(db('alice').ref('moderation/suspended/alice').once('value'));
  });
  it('muted users cannot post but can still vote', async () => {
    await seed({ 'moderation/muted/alice': { reason: 'x', by: 'mod', at: 1 } });
    await assertFails(db('alice').ref('rooms/general/messages').push(msg('alice')));
    await assertSucceeds(db('alice').ref('rooms/general/messages/m1/votes/alice').set(true));
  });
  it('restriction lists are visible to moderators, not students', async () => {
    await assertFails(db('alice').ref('moderation/suspended').once('value'));
    await assertSucceeds(db('mod').ref('moderation/suspended').once('value'));
  });
});

describe('private productivity data', () => {
  beforeEach(async () => { await seedUser('alice'); await seedUser('bob'); await seedUser('root', 'admin'); });

  it('only the owner can read or write their todos and streak — not even admins', async () => {
    await assertSucceeds(db('alice').ref('userData/alice/todos').push({ text: 'study', done: false, createdAt: TS }));
    await assertFails(db('bob').ref('userData/alice').once('value'));
    await assertFails(db('bob').ref('userData/alice/todos/x').set({ text: 'hi', done: false, createdAt: TS }));
    await assertFails(db('root').ref('userData/alice').once('value'));
  });
  it('works without email verification (private data only)', async () => {
    await assertSucceeds(db('alice', false).ref('userData/alice/streak/2026-11-06').set(1));
  });
  it('validates todo and streak shapes', async () => {
    const d = db('alice');
    await assertFails(d.ref('userData/alice/todos/x').set({ text: '', done: false, createdAt: TS }));
    await assertFails(d.ref('userData/alice/todos/x').set({ text: 'x'.repeat(501), done: false, createdAt: TS }));
    await assertFails(d.ref('userData/alice/todos/x').set({ text: 'ok', done: 'yes', createdAt: TS }));
    await assertFails(d.ref('userData/alice/streak/not-a-date').set(1));
    await assertFails(d.ref('userData/alice/streak/2026-11-06').set(1.5));
    await assertFails(d.ref('userData/alice/streak/2026-11-06').set(1000));
    await assertFails(d.ref('userData/alice/other').set(1));
    await assertSucceeds(d.ref('userData/alice/streak/2026-11-06').set(3));
  });
  it('toggling a todo only touches `done`', async () => {
    await seed({ 'userData/alice/todos/t1': { text: 'study', done: false, createdAt: 1 } });
    await assertSucceeds(db('alice').ref('userData/alice/todos/t1').update({ done: true }));
  });
});
