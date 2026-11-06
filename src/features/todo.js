// Personal to-dos at /userData/{uid}/todos/{pushId}. Keyed by id (not array index),
// so edits from two tabs can't hit the wrong task.

import { ref, onValue, push, update, remove, serverTimestamp } from 'firebase/database';
import { $, h, setMsg, stateLine } from '../lib/dom.js';
import { cleanText, LIMITS } from '../lib/validation.js';
import { dbErrorMessage } from '../lib/errors.js';

export function mountTodo({ db, user }) {
  const box = $('#todoList');
  const form = $('#todoForm');
  const input = $('#todoInput');
  const msg = $('#todoMsg');
  const base = `userData/${user.uid}/todos`;

  box.replaceChildren(stateLine('Loading tasks…'));

  const unsub = onValue(ref(db, base), (snap) => {
    const todos = [];
    snap.forEach((c) => { todos.push({ id: c.key, ...c.val() }); });
    todos.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (!todos.length) { box.replaceChildren(stateLine('No tasks yet. Add one above.')); return; }
    box.replaceChildren(...todos.map((t) => {
      const cbId = `todo-${t.id}`;
      return h('div', { class: 'todoRow' },
        h('label', { for: cbId },
          h('input', {
            type: 'checkbox', id: cbId, checked: !!t.done,
            onchange: (e) => update(ref(db, `${base}/${t.id}`), { done: e.target.checked })
              .catch((err) => setMsg(msg, dbErrorMessage(err))),
          }),
          h('span', { class: t.done ? 'done' : '' }, t.text)),
        h('button', {
          type: 'button', class: 'del', 'aria-label': `Delete task: ${t.text}`,
          onclick: () => remove(ref(db, `${base}/${t.id}`)).catch((err) => setMsg(msg, dbErrorMessage(err))),
        }, '✕'));
    }));
  }, (err) => box.replaceChildren(stateLine(dbErrorMessage(err), true)));

  async function onSubmit(e) {
    e.preventDefault();
    const { value, error } = cleanText(input.value, LIMITS.todoMax);
    if (error) { setMsg(msg, error); return; }
    try {
      await push(ref(db, base), { text: value, done: false, createdAt: serverTimestamp() });
      input.value = '';
      setMsg(msg, '');
    } catch (err) {
      setMsg(msg, dbErrorMessage(err));
    }
  }
  form.addEventListener('submit', onSubmit);

  return () => { unsub(); form.removeEventListener('submit', onSubmit); };
}
