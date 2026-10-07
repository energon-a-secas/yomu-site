// "Where are the spaces?": loading its lines, beginning a round, the marks
// and the check, and its keys. events-play.js owns the route, the rounds'
// way on (Next, the result) and Escape, and calls in here.
//
// Keys on the board, as the review's discipline has them (events-play.js
// onKey decides whether a key is Play's at all): the arrows, Home and End
// move between the places, which hold one tab stop between them; Space marks
// a place or clears it, which is the button's own press; Enter checks the
// line, its press prevented so it does not mark the place it is on. Once the
// line is checked, focus is on the feedback, and Enter or Space goes on.

import { describe } from './events-read.js';
import { play } from './render-play.js';
import { current, answeredNow } from './play-rounds.js';
import {
  loadSpaces, spacesRound, toggleMark, checkMarks,
} from './play-spaces.js';

let repaintFn = () => {};
let showFn = () => {};

/** events-play.js lends its two ways to draw the screen: keeping focus, or moving it on. */
export function lendPaint({ repaint, show }) {
  repaintFn = repaint;
  showFn = show;
}

/** The lines, once per page; a failure says so on the screen with Retry. */
async function lines() {
  const d = play.spaces;
  if (d.state === 'ready') return;
  d.state = 'loading';
  try {
    d.lines = (await loadSpaces()).lines;
    d.state = 'ready';
  } catch (err) {
    console.error('[yomu]', err);
    const why = describe(err);
    d.state = 'error';
    d.error = why.file ? `${why.file}: ${why.detail}` : why.detail;
  }
}

/** A new round. `stale()` says the learner left meanwhile. */
export async function startSpaces(stale) {
  const d = play.spaces;
  d.round = null;
  d.cursor = 0;
  await lines();
  if (stale() || d.state !== 'ready') return;
  if (d.lines.length >= 1) d.round = spacesRound(d.lines);
}

/** The round on screen, for events-play.js's way on and its result. */
export function spacesRoundNow() {
  return play.spaces.round;
}

function slots() {
  return [...document.querySelectorAll('#pl-body .sp-slot')];
}

/** Move the one tab stop to place `ix`, and focus it, without a repaint. */
function moveTo(ix) {
  const all = slots();
  if (!all.length) return;
  const at = Math.max(0, Math.min(ix, all.length - 1));
  play.spaces.cursor = at;
  all.forEach((b, i) => { b.tabIndex = i === at ? 0 : -1; });
  all[at].focus();
}

function check() {
  const r = play.spaces.round;
  if (!r || !current(r) || answeredNow(r)) return;
  checkMarks(r);
  showFn();
}

/** A key on the board. True when it was this game's to act on. */
export function spacesKey(e) {
  const slot = e.target && e.target.closest ? e.target.closest('#pl-body .sp-slot') : null;
  if (!slot) return false;
  const r = play.spaces.round;
  if (!r || answeredNow(r)) return false;
  const ix = Number(slot.dataset.ix);
  if (e.key === 'Enter') { e.preventDefault(); check(); return true; }
  let to = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = ix + 1;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = ix - 1;
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = slots().length - 1;
  if (to === null) return false;
  e.preventDefault();
  moveTo(to);
  return true;
}

export const SPACES_ACTIONS = {
  'sp-slot': (b) => {
    const r = play.spaces.round;
    const q = current(r);
    const ix = Number(b.dataset.ix);
    if (!q || !Number.isInteger(ix) || !toggleMark(r, q.slots[ix])) return;
    // The repaint keeps focus on the same place, found by its data-ix.
    play.spaces.cursor = ix;
    repaintFn();
  },
  'sp-check': () => check(),
};
