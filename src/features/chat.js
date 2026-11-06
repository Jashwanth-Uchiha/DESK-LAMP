import { $, h, setMsg, stateLine, colorFor, initials } from '../lib/dom.js';
import { cleanText, LIMITS } from '../lib/validation.js';
import { dbErrorMessage } from '../lib/errors.js';
import { subscribeFeed, addItem, setVote, sortItems } from './feed.js';

const PATH = 'rooms/general/messages';
const LIMIT = 100;

export function mountChat({ db, user, profile, canPost }) {
  const log = $('#chatLog');
  const trend = $('#chatTrendView');
  const form = $('#chatForm');
  const input = $('#chatInput');
  const msg = $('#chatMsg');
  let items = [];
  let pinnedToBottom = true;

  if (!canPost) {
    log.replaceChildren(stateLine('Verify your email to join the chat.'));
    trend.replaceChildren();
    form.querySelectorAll('input,button').forEach((el) => { el.disabled = true; });
    return () => form.querySelectorAll('input,button').forEach((el) => { el.disabled = false; });
  }

  log.replaceChildren(stateLine('Loading messages…'));
  log.addEventListener('scroll', onScroll);
  function onScroll() { pinnedToBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40; }

  function voteButton(m, label) {
    const voted = !!m.votes[user.uid];
    return h('button', {
      type: 'button', class: 'liftMini', 'aria-pressed': String(voted),
      'aria-label': voted ? 'Remove lift' : 'Lift this message',
      onclick: async () => {
        try { await setVote(db, PATH, m.id, user.uid, !voted); setMsg(msg, ''); }
        catch (e) { setMsg(msg, dbErrorMessage(e)); }
      },
    }, label);
  }

  function renderRoom() {
    if (!items.length) { log.replaceChildren(stateLine('No messages yet — say hello.')); return; }
    log.replaceChildren(...items.map((m) => {
      const mine = m.uid === user.uid;
      return h('div', { class: mine ? 'msg mine' : 'msg' },
        h('div', { class: 'avatar', style: { background: colorFor(m.uid || m.name) }, 'aria-hidden': 'true' }, initials(m.name)),
        h('div', { class: 'col' },
          mine ? null : h('div', { class: 'name' }, m.name),
          h('div', { class: 'bubbleRow' },
            m.hidden
              ? h('div', { class: 'bubble removed' }, 'Hidden by a moderator')
              : h('div', { class: 'bubble' }, m.text),
            m.hidden ? null : voteButton(m, '▲')),
          h('div', { class: 'votes' }, `${m.voteCount} lift${m.voteCount === 1 ? '' : 's'}`)));
    }));
    if (pinnedToBottom) log.scrollTop = log.scrollHeight;
  }

  function renderTrending() {
    const top = sortItems(items.filter((m) => m.voteCount > 0 && !m.hidden), 'top').slice(0, 30);
    if (!top.length) { trend.replaceChildren(stateLine('No lifted messages yet — vote a message in the Room to see it here.')); return; }
    trend.replaceChildren(...top.map((m) => h('div', { class: 'trendMsg' },
      h('div', {}, h('div', { class: 'n' }, m.name), h('div', { class: 't' }, m.text)),
      voteButton(m, `▲ ${m.voteCount}`))));
  }

  const unsub = subscribeFeed(db, PATH, LIMIT, (list) => {
    items = list;
    renderRoom();
    renderTrending();
  }, (err) => {
    log.replaceChildren(stateLine(dbErrorMessage(err, { denied: "You can't read the chat right now. Make sure your email is verified, then sign out and back in." }), true));
  });

  async function onSubmit(e) {
    e.preventDefault();
    const { value, error } = cleanText(input.value, LIMITS.chatMax);
    if (error) { setMsg(msg, error); return; }
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await addItem(db, PATH, { uid: user.uid, name: profile.displayName, text: value });
      input.value = '';
      setMsg(msg, '');
      pinnedToBottom = true;
    } catch (err) {
      setMsg(msg, dbErrorMessage(err, { denied: 'Your message was not sent. Your account may be muted or suspended.' }));
    } finally {
      btn.disabled = false;
      input.focus();
    }
  }
  form.addEventListener('submit', onSubmit);

  return () => {
    unsub();
    form.removeEventListener('submit', onSubmit);
    log.removeEventListener('scroll', onScroll);
  };
}
