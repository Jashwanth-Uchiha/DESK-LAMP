import { describe, it, expect } from 'vitest';
import { localDayKey, lastNDays, streakStats, heatLevel, toWeeks } from '../../src/lib/dates.js';
import { createCountdown, formatMMSS } from '../../src/lib/timer.js';
import { toItem, sortItems } from '../../src/features/feed.js';

describe('localDayKey', () => {
  it('uses the local calendar day, not UTC (legacy IST bug)', () => {
    // 00:30 local time on 6 Nov. In IST that is 5 Nov 19:00 UTC; the key must still be the 6th.
    const d = new Date(2026, 10, 6, 0, 30);
    expect(localDayKey(d)).toBe('2026-11-06');
  });
  it('today is always the last day of the window and matches the recording key', () => {
    const now = new Date(2026, 10, 6, 23, 59);
    const days = lastNDays(now, 365);
    expect(days).toHaveLength(365);
    expect(localDayKey(days[364])).toBe(localDayKey(now));
  });
});

describe('streakStats', () => {
  const today = new Date(2026, 10, 6, 12);
  it('counts totals, active days, max and current streak', () => {
    const map = {
      '2026-11-06': 2, '2026-11-05': 1, '2026-11-04': 1, // current run of 3
      '2026-10-01': 1, '2026-10-02': 1, '2026-10-03': 1, '2026-10-04': 5, // run of 4
    };
    expect(streakStats(map, today)).toEqual({ total: 12, activeDays: 7, maxStreak: 4, currentStreak: 3 });
  });
  it('keeps the current streak alive if today has no session yet', () => {
    const map = { '2026-11-05': 1, '2026-11-04': 1 };
    expect(streakStats(map, today).currentStreak).toBe(2);
  });
  it('handles empty / malformed maps', () => {
    expect(streakStats({}, today)).toEqual({ total: 0, activeDays: 0, maxStreak: 0, currentStreak: 0 });
    expect(streakStats(null, today).total).toBe(0);
    expect(streakStats({ '2026-11-06': 'x' }, today).total).toBe(0);
  });
});

describe('heatmap helpers', () => {
  it('maps counts to levels', () => {
    expect([0, 1, 2, 3, 4, 5, 99].map(heatLevel)).toEqual([0, 1, 2, 3, 3, 4, 4]);
  });
  it('pads the first week to Sunday', () => {
    const days = lastNDays(new Date(2026, 10, 6), 365);
    const weeks = toWeeks(days);
    expect(weeks[0].filter((d) => d === null)).toHaveLength(days[0].getDay());
    expect(weeks.flat().filter(Boolean)).toHaveLength(365);
  });
});

describe('countdown timer', () => {
  it('uses wall-clock time, so throttled ticks do not slow it down', () => {
    let t = 0;
    const c = createCountdown({ durationMs: 25 * 60_000, now: () => t });
    c.start();
    t += 10 * 60_000; // a background tab that never ticked for 10 minutes
    expect(c.remainingMs()).toBe(15 * 60_000);
    c.pause();
    t += 60_000;
    expect(c.remainingMs()).toBe(15 * 60_000);
    c.start();
    t += 20 * 60_000;
    expect(c.remainingMs()).toBe(0);
    expect(c.isDone()).toBe(true);
  });
  it('reset changes duration and stops', () => {
    let t = 0;
    const c = createCountdown({ durationMs: 1000, now: () => t });
    c.start();
    c.reset(5 * 60_000);
    expect(c.running).toBe(false);
    expect(c.remainingMs()).toBe(5 * 60_000);
  });
  it('formats mm:ss rounding up partial seconds', () => {
    expect(formatMMSS(25 * 60_000)).toBe('25:00');
    expect(formatMMSS(59_001)).toBe('01:00');
    expect(formatMMSS(0)).toBe('00:00');
  });
});

describe('feed items', () => {
  it('normalizes records defensively', () => {
    const i = toItem('a', { uid: 'u', name: 'N', text: 'T', createdAt: 5, votes: { x: true, y: true } });
    expect(i).toMatchObject({ id: 'a', voteCount: 2, hidden: false });
    const bad = toItem('b', { name: 42, votes: 'nope' });
    expect(bad).toMatchObject({ name: 'Unknown', text: '', voteCount: 0, createdAt: 0 });
  });
  it('sorts by newest or by votes', () => {
    const items = [toItem('a', { createdAt: 1, votes: { x: true } }), toItem('b', { createdAt: 2 }), toItem('c', { createdAt: 3, votes: { x: true } })];
    expect(sortItems(items, 'new').map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect(sortItems(items, 'top').map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });
});
