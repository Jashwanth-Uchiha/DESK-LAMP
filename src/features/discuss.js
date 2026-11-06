import { $, $$, h, setMsg, stateLine } from '../lib/dom.js';
import { cleanText, LIMITS } from '../lib/validation.js';
import { dbErrorMessage } from '../lib/errors.js';
import { subscribeFeed, addItem, setVote, sortItems } from './feed.js';

const PATH = 'posts';
const LIMIT = 200;

export function mountDiscuss({ db, user, profile, canPost }) {
  const list = $('#postList');
  const form = $('#postForm');
  const input = $('#postInput');
  const msg = $('#postMsg');
  const sortButtons = $$('[data-sort]');
  let items = [];
  let mode = sortButtons.find((b) => b.getAttribute('aria-selected') === 'true')?.dataset.sort || 'new';

  if (!canPost) {
    list.replaceChildren(stateLine('Verify your email to read and write posts.'));
    form.querySelectorAll('textarea,button').forEach((el) => { el.disabled = true; });
    return () => form.querySelectorAll('textarea,button').forEach((el) => { el.disabled = false; });
  }

  list.replaceChildren(stateLine('Loading posts…'));

  function render() {
    if (!items.length) { list.replaceChildren(stateLine('No posts yet. Ask the first doubt!')); return; }
    list.replaceChildren(...sortItems(items, mode).map((p) => {
      const voted = !!p.votes[user.uid];
      return h('article', { class: 'post' },
        h('div', { class: 'lift' },
          h('button', {
            type: 'button', 'aria-pressed': String(voted), disabled: p.hidden,
            'aria-label': voted ? 'Remove lift' : 'Lift this post',
            onclick: async () => {
              try { await setVote(db, PATH, p.id, user.uid, !voted); setMsg(msg, ''); }
              catch (e) { setMsg(msg, dbErrorMessage(e)); }
            },
          }, '▲'),
          h('div', { class: 'count' }, String(p.voteCount))),
        h('div', { class: 'body' },
          h('div', { class: 'meta' }, `${p.name} · ${p.createdAt ? new Date(p.createdAt).toLocaleString() : 'just now'}`),
          p.hidden ? h('div', { class: 'text dim' }, 'Hidden by a moderator') : h('div', { class: 'text' }, p.text)));
    }));
  }

  const unsub = subscribeFeed(db, PATH, LIMIT, (l) => { items = l; render(); },
    (err) => list.replaceChildren(stateLine(dbErrorMessage(err, { denied: "You can't read posts right now. Make sure your email is verified, then sign out and back in." }), true)));

  function onSort(e) { mode = e.currentTarget.dataset.sort; render(); }
  sortButtons.forEach((b) => b.addEventListener('click', onSort));

  async function onSubmit(e) {
    e.preventDefault();
    const { value, error } = cleanText(input.value, LIMITS.postMax);
    if (error) { setMsg(msg, error); return; }
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await addItem(db, PATH, { uid: user.uid, name: profile.displayName, text: value });
      input.value = '';
      setMsg(msg, 'Posted.', true);
    } catch (err) {
      setMsg(msg, dbErrorMessage(err, { denied: 'Your post was not published. Your account may be muted or suspended.' }));
    } finally {
      btn.disabled = false;
    }
  }
  form.addEventListener('submit', onSubmit);

  return () => {
    unsub();
    form.removeEventListener('submit', onSubmit);
    sortButtons.forEach((b) => b.removeEventListener('click', onSort));
  };
}
