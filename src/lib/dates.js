// Date helpers for the streak heatmap. Everything uses the user's LOCAL calendar
// day. (The legacy app mixed UTC and local time, so in IST today's sessions were
// stored under a key the grid never displayed.)

const pad = (n) => String(n).padStart(2, '0');

export function localDayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Array of `n` local-midnight Dates ending with today (oldest first). */
export function lastNDays(today, n) {
  const end = startOfLocalDay(today);
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

/**
 * @param {Record<string, number>} map day key → focus sessions
 * @returns {{total:number, activeDays:number, maxStreak:number, currentStreak:number}}
 */
export function streakStats(map, today = new Date(), windowDays = 365) {
  const days = lastNDays(today, windowDays);
  let total = 0, activeDays = 0, run = 0, maxStreak = 0;
  for (const d of days) {
    const c = Number(map?.[localDayKey(d)]) || 0;
    if (c > 0) { activeDays++; total += c; run++; if (run > maxStreak) maxStreak = run; }
    else run = 0;
  }
  // Current streak: count back from today; if nothing yet today, start from yesterday
  // so the streak isn't shown as broken before the day is over.
  let currentStreak = 0;
  let i = days.length - 1;
  if (!(Number(map?.[localDayKey(days[i])]) > 0)) i--;
  for (; i >= 0; i--) {
    if (Number(map?.[localDayKey(days[i])]) > 0) currentStreak++;
    else break;
  }
  return { total, activeDays, maxStreak, currentStreak };
}

export function heatLevel(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

/** Group days into Sunday-first weeks, padding the first week with nulls. */
export function toWeeks(days) {
  const padded = Array(days[0].getDay()).fill(null).concat(days);
  const weeks = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  return weeks;
}
