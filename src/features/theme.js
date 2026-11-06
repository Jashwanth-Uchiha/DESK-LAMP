import { $, h } from '../lib/dom.js';

export const THEMES = {
  desklamp: { label: 'Desk Lamp', bg: '#12151c', panel: '#191d27', panel2: '#1f2430', line: '#2b3141', accent: '#e8a33d', accentDim: '#8a6528', text: '#e9e7e1', textDim: '#8b90a0', green: '#6fae8c', mine: '#25532f' },
  daylight: { label: 'Daylight', bg: '#f2f0e8', panel: '#ffffff', panel2: '#eae7db', line: '#d9d5c6', accent: '#3f6b5e', accentDim: '#5d7a70', text: '#242320', textDim: '#5f5e55', green: '#3f6b5e', mine: '#d4e6d8' },
  forest: { label: 'Forest', bg: '#0f1712', panel: '#152019', panel2: '#1b2a21', line: '#26392c', accent: '#8fbf6d', accentDim: '#5f8f49', text: '#e7ece4', textDim: '#8fa08c', green: '#8fbf6d', mine: '#25532f' },
  ocean: { label: 'Ocean', bg: '#0b1420', panel: '#101d2e', panel2: '#152437', line: '#1f3247', accent: '#5ec8d8', accentDim: '#3a8a96', text: '#e7f2f5', textDim: '#7ea0ac', green: '#5ec8d8', mine: '#1d4a5a' },
  sunset: { label: 'Sunset', bg: '#1c1018', panel: '#241621', panel2: '#2c1b28', line: '#3d2436', accent: '#e6875a', accentDim: '#a85f3c', text: '#f3e6e0', textDim: '#b08a90', green: '#e6875a', mine: '#5a2f3a' },
};

const VARS = { bg: '--bg', panel: '--panel', panel2: '--panel-2', line: '--line', accent: '--amber', accentDim: '--amber-dim', text: '--text', textDim: '--text-dim', green: '--green', mine: '--mine' };

export function applyTheme(name) {
  const key = THEMES[name] ? name : 'desklamp';
  const t = THEMES[key];
  const s = document.documentElement.style;
  for (const [k, v] of Object.entries(VARS)) s.setProperty(v, t[k]);
  document.querySelectorAll('.themeDot').forEach((d) => d.setAttribute('aria-checked', String(d.dataset.theme === key)));
  try { localStorage.setItem('theme', key); } catch { /* storage unavailable */ }
}

export function initThemePicker() {
  const row = $('#themeRow');
  row.replaceChildren(...Object.entries(THEMES).map(([key, t]) => h('button', {
    type: 'button', role: 'radio', class: 'themeDot', 'data-theme': key,
    'aria-label': `${t.label} theme`, title: t.label, 'aria-checked': 'false',
    style: { background: t.accent, boxShadow: `inset 0 0 0 7px ${t.bg}` },
    onclick: () => applyTheme(key),
  })));
  let saved = 'desklamp';
  try { saved = localStorage.getItem('theme') || 'desklamp'; } catch { /* ignore */ }
  applyTheme(saved);
}
