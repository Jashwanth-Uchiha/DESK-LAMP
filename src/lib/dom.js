// Tiny DOM helpers. User-supplied data is only ever inserted with textContent
// (via string children) — never innerHTML — which closes the legacy XSS holes.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * h('div', {class: 'x', onclick: fn, 'aria-label': 'y'}, 'text', childNode)
 * Strings become text nodes. `on*` keys become event listeners.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function show(el, visible = true) { el.classList.toggle('hidden', !visible); }

export function setMsg(el, text, ok = false) {
  el.textContent = text || '';
  el.classList.toggle('ok', !!ok);
}

export function stateLine(text, isError = false) {
  return h('p', { class: isError ? 'state error' : 'state' }, text);
}

/** Wire a set of role=tab buttons; calls onSelect(value). */
export function wireTabs(buttons, attr, onSelect) {
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    onSelect(b.dataset[attr], b);
  }));
}

const AVATAR_COLORS = ['#c96a5a', '#5a8fc9', '#6fae8c', '#c9a15a', '#9a6ac9', '#5ac9b8', '#c95a95'];
export function colorFor(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}
export function initials(name) { return String(name || '?').trim().slice(0, 2).toUpperCase(); }
