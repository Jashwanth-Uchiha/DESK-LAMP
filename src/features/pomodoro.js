// Pomodoro timer + streak heatmap. Streak counts are private at /userData/{uid}/streak/{YYYY-MM-DD}
// and incremented with a transaction so two tabs finishing at once both count.

import { ref, onValue, runTransaction } from 'firebase/database';
import { $, $$, h, setMsg } from '../lib/dom.js';
import { createCountdown, formatMMSS } from '../lib/timer.js';
import { localDayKey, lastNDays, streakStats, heatLevel, toWeeks } from '../lib/dates.js';
import { dbErrorMessage } from '../lib/errors.js';

export function mountPomodoro({ db, user }) {
  const timeEl = $('#pomoTime');
  const startBtn = $('#pomoStart');
  const resetBtn = $('#pomoReset');
  const label = $('#pomoLabel');
  const msg = $('#pomoMsg');
  const modes = $$('.pomoModes button');
  const streakPath = `userData/${user.uid}/streak`;

  let isFocus = true;
  const timer = createCountdown({ durationMs: 25 * 60 * 1000 });
  let tick = null;

  function render() {
    timeEl.textContent = formatMMSS(timer.remainingMs());
    startBtn.textContent = timer.running ? 'Pause' : 'Start';
    document.title = timer.running ? `${formatMMSS(timer.remainingMs())} · Desk Lamp` : 'Desk Lamp';
  }

  async function finish() {
    stopTicking();
    timer.pause();
    render();
    if (!isFocus) { setMsg(msg, 'Break over.', true); return; }
    const key = localDayKey(new Date());
    try {
      await runTransaction(ref(db, `${streakPath}/${key}`), (n) => Math.min(100, (n || 0) + 1));
      setMsg(msg, 'Focus session recorded.', true);
    } catch (err) {
      setMsg(msg, `Session finished but not recorded: ${dbErrorMessage(err)}`);
    }
  }

  function startTicking() {
    stopTicking();
    tick = setInterval(() => { render(); if (timer.isDone()) finish(); }, 250);
  }
  function stopTicking() { if (tick) clearInterval(tick); tick = null; }

  function onStart() {
    if (timer.running) { timer.pause(); stopTicking(); }
    else { setMsg(msg, ''); timer.start(); startTicking(); }
    render();
  }
  function onReset() { stopTicking(); timer.reset(); setMsg(msg, ''); render(); }
  function onMode(e) {
    const b = e.currentTarget;
    modes.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    isFocus = b.dataset.focus === 'true';
    label.textContent = b.textContent;
    stopTicking();
    timer.reset(Number(b.dataset.len) * 60 * 1000);
    setMsg(msg, '');
    render();
  }

  startBtn.addEventListener('click', onStart);
  resetBtn.addEventListener('click', onReset);
  modes.forEach((b) => b.addEventListener('click', onMode));
  render();

  const unsub = onValue(ref(db, streakPath), (snap) => renderStreak(snap.val() || {}),
    (err) => setMsg(msg, dbErrorMessage(err)));

  return () => {
    unsub();
    stopTicking();
    document.title = 'Desk Lamp';
    startBtn.removeEventListener('click', onStart);
    resetBtn.removeEventListener('click', onReset);
    modes.forEach((b) => b.removeEventListener('click', onMode));
  };
}

function renderStreak(map) {
  const today = new Date();
  const days = lastNDays(today, 365);
  const weeks = toWeeks(days);
  const grid = $('#heatmap');
  const months = $('#heatMonths');
  let lastMonth = -1;
  const cols = [];
  const labels = [];
  for (const week of weeks) {
    const firstReal = week.find(Boolean);
    cols.push(h('div', { class: 'heatcol' }, ...week.map((d) => {
      if (!d) return h('div', { class: 'heatcell' });
      const c = Number(map[localDayKey(d)]) || 0;
      const lvl = heatLevel(c);
      return h('div', { class: lvl ? `heatcell l${lvl}` : 'heatcell', title: `${localDayKey(d)}: ${c} session${c === 1 ? '' : 's'}` });
    })));
    const m = firstReal ? firstReal.getMonth() : -1;
    labels.push(h('span', {}, m !== lastMonth && m !== -1 ? new Date(2000, m, 1).toLocaleString('en', { month: 'short' }) : ''));
    if (m !== -1) lastMonth = m;
  }
  grid.replaceChildren(...cols);
  months.replaceChildren(...labels);
  const s = streakStats(map, today);
  $('#streakTotal').textContent = String(s.total);
  $('#streakDays').textContent = String(s.activeDays);
  $('#streakMax').textContent = String(s.maxStreak);
  $('#streakCur').textContent = String(s.currentStreak);
}
