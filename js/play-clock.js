// Odd one out's clock: a deadline that stands still while the game is not
// on screen. No DOM and no timer: the page passes the time (performance.now()
// and an IntersectionObserver entry's `time` share that origin) and says
// when the game is hidden or shown, so tests/play.test.mjs runs it under node.
//
// Each thing that hides the game is a reason of its own: the page itself
// (visibilitychange, 'page'), the game leaving what the top page shows
// ('view', an IntersectionObserver with no root) and a frame its host no
// longer draws ('frame'). The last two are what an embed needs: when
// Runcible closes its sheet the frame stays visible as far as
// visibilityState goes, and a clock that only heard visibilitychange ran
// out behind the closed sheet and recorded a round of 0. Chromium and
// WebKit tell the observer; Firefox does not, and its frame's viewport reads
// 0 by 0 instead (events-odd.js checks both).
//
// The time a round has left is spent only while nothing hides it, and a
// round ends only while nothing hides it (`over`): a deadline that passed
// while hidden is not one the learner missed.

/** A clock of `ms`, not started, shown. */
export function createClock(ms) {
  return { ms, left: ms, deadline: 0, running: false, hidden: new Set() };
}

/** Whether something hides the game now. */
export function isHidden(c) {
  return c.hidden.size > 0;
}

/** Start it at `now`; while hidden, the deadline is set when it is shown. */
export function startClock(c, now) {
  if (c.running) return;
  c.running = true;
  if (!isHidden(c)) c.deadline = now + c.left;
}

/** Stop it for good: the round is over or abandoned. */
export function stopClock(c) {
  c.running = false;
}

/** What is left at `now`. */
export function leftAt(c, now) {
  if (!c.running || isHidden(c)) return c.left;
  return Math.max(0, c.deadline - now);
}

/**
 * Something hid the game at `at` (a time no later than now: an
 * IntersectionObserver entry says when it saw the change). The first reason
 * stops the clock where it stood then.
 */
export function hide(c, why, at) {
  if (c.hidden.has(why)) return;
  const was = isHidden(c);
  c.hidden.add(why);
  if (c.running && !was) c.left = Math.max(0, c.deadline - at);
}

/** That reason is gone at `now`; with none left, the clock runs again from where it stood. */
export function show(c, why, now) {
  if (!c.hidden.delete(why)) return;
  if (c.running && !isHidden(c)) c.deadline = now + c.left;
}

/** A wrong tap costs `ms`, whether or not the game is on screen at that instant. */
export function penalize(c, ms, now) {
  if (!c.running) return;
  if (isHidden(c)) c.left = Math.max(0, c.left - ms);
  else c.left = Math.max(0, (c.deadline -= ms) - now);
}

/** A tick at `now`: `{ left, over }`, `over` only when it ran out with nothing hiding it. */
export function tickClock(c, now) {
  if (!c.running) return { left: c.left, over: false };
  if (isHidden(c)) return { left: c.left, over: false };
  c.left = Math.max(0, c.deadline - now);
  return { left: c.left, over: c.left <= 0 };
}
