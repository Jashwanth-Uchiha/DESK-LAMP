// Countdown timer driven by wall-clock time instead of counting interval ticks,
// so it stays accurate when the browser throttles background tabs.

export function createCountdown({ durationMs, now = () => Date.now() }) {
  let duration = durationMs;
  let remainingWhenPaused = durationMs;
  let endsAt = null; // epoch ms while running

  return {
    get running() { return endsAt !== null; },
    remainingMs() {
      if (endsAt === null) return remainingWhenPaused;
      return Math.max(0, endsAt - now());
    },
    isDone() { return this.remainingMs() === 0; },
    start() {
      if (endsAt !== null || remainingWhenPaused === 0) return;
      endsAt = now() + remainingWhenPaused;
    },
    pause() {
      if (endsAt === null) return;
      remainingWhenPaused = Math.max(0, endsAt - now());
      endsAt = null;
    },
    reset(newDurationMs = duration) {
      duration = newDurationMs;
      remainingWhenPaused = newDurationMs;
      endsAt = null;
    },
  };
}

export function formatMMSS(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
