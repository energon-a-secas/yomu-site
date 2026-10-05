// Odd one out: a sitting's grids, its clock, its taps and its arrows. Split
// out of events-play.js, which keeps the routes, the other games and the
// keys, so both stay under the 500-line rule.
//
// Against the clock: 60 seconds that start only when the learner presses
// Start the clock (never on arrival), a wrong tap costs 3 seconds, and the
// next grid comes at once after one is found. Untimed (WCAG 2.2.1, chosen by
// default under prefers-reduced-motion): ten grids, each found one followed
// by its reason and Next. The clock is a deadline, not a count of ticks, and
// it stands still while the page is hidden.
//
// A cycle on purpose, and a safe one: events-play.js imports these functions
// and this file imports its painting and data helpers from there; neither
// touches the other while it loads.

import { $ } from './utils.js';
import { ui } from './strings.js';
import { myPlay } from './play-store.js';
import { KANA_SETS } from './play-kana.js';
import {
  createOdd, tapOdd, oddScore, oddGrid, oddPairs, nextOddPair, gridSize, ROUND,
} from './play-rounds.js';
import { play, resultOf } from './render-play.js';
import {
  show, repaint, ensureInfo, lookalikes, kanjiPoolNow, mixed, onPlay,
} from './events-play.js';

const TIMED_MS = 60 * 1000;
const PENALTY_MS = 3 * 1000;

let clock = null;
let deadline = 0;
let paused = false;
let pairs = null;           // this sitting's pairs; null while they load

export function newOddSitting() {
  stopClock();
  Object.assign(play.odd, {
    sit: createOdd(play.odd.mode), left: TIMED_MS, running: false, line: '', last: null, cursor: 0, wantClock: false,
  });
}

/** A new sitting. `stale()` says a newer round began while this one loaded. */
export async function startOdd(stale) {
  if (!play.odd.mode) play.odd.mode = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'free' : 'timed';
  newOddSitting();
  // A clock started before the pairs are in waits for them (startClock).
  pairs = null;
  const map = await lookalikes();
  if (stale()) return;
  const pool = map ? (await kanjiPoolNow(map)).pool : [];
  if (stale()) return;
  pairs = oddPairs(KANA_SETS, map || new Map(), pool);
  if (play.odd.mode === 'free') nextGrid();
  else if (play.odd.wantClock) startClock();
}

/** The next grid of the sitting, its size by how many are found. */
function nextGrid() {
  const s = play.odd.sit;
  if (!s || !pairs || !pairs.length) return;
  const pair = nextOddPair(pairs, { mixed, last: s.last });
  s.last = pair;
  s.grid = oddGrid(pair, gridSize(s.found));
  s.grid.missed = new Set();
  play.odd.cursor = 0;
  ensureInfo([s.grid.base, s.grid.odd]);
}

function tick() {
  const o = play.odd;
  if (!o.running || paused) return;
  const left = Math.max(0, deadline - Date.now());
  const was = Math.ceil(o.left / 1000);
  o.left = left;
  const el = $('pl-timer');
  if (el && Math.ceil(left / 1000) !== was) el.textContent = ui('timeLeft', { n: Math.ceil(left / 1000) });
  if (left <= 0) endOdd();
}

export function startClock() {
  const o = play.odd;
  if (o.running) return;
  if (!pairs) { o.wantClock = true; return; }
  o.wantClock = false;
  o.running = true;
  paused = false;
  deadline = Date.now() + o.left;
  clock = setInterval(tick, 200);
  nextGrid();
  show();
  const cell = document.querySelector('#pl-body .pl-cell[tabindex="0"]');
  if (cell) cell.focus({ preventScroll: true });
}

export function stopClock() {
  if (clock) clearInterval(clock);
  clock = null;
  play.odd.running = false;
}

function endOdd() {
  const s = play.odd.sit;
  if (!s) return;
  const timed = play.odd.mode === 'timed';
  stopClock();
  s.over = true;
  const rec = myPlay().finish(timed ? 'odd' : 'oddFree', oddScore(s));
  play.result = resultOf('odd', null, rec, { score: oddScore(s), timed, of: ROUND, mixups: s.mixups });
  ensureInfo(s.mixups.flat());
  show();
}

export function tapCell(ix) {
  const o = play.odd;
  const s = o.sit;
  if (!s || !s.grid || (o.mode === 'timed' && !o.running)) return;
  const g = s.grid;
  const got = tapOdd(s, ix);
  if (!got) return;
  o.cursor = ix;
  if (got === 'miss') {
    g.missed.add(ix);
    if (g.misses === 1) myPlay().mixed(g.odd, g.base);
    if (o.mode === 'timed') { deadline -= PENALTY_MS; tick(); }
    o.line = ui(o.mode === 'timed' ? 'oddMissTimed' : 'oddMissFree');
    if (s.grid !== g || !onPlay() || play.result) return;
    repaint();
    return;
  }
  if (o.mode === 'timed') {
    // The next grid at once, the cell at the same place keeping focus.
    o.line = ui('oddFound');
    o.last = g;
    nextGrid();
    o.cursor = ix;
    repaint();
    return;
  }
  o.line = '';
  show();
}

/** Enter or Space, or Next, once an untimed grid is found. */
export function oddGoOn() {
  const s = play.odd.sit;
  if (!s || !s.grid || !s.grid.solved || play.odd.mode !== 'free') return;
  if (s.over) { endOdd(); return; }
  nextGrid();
  show();
}

/** The arrows, Home and End move between a grid's cells, which keep one tab stop. */
export function moveInGrid(e) {
  const cell = e.target.closest && e.target.closest('.pl-cell');
  const g = play.odd.sit && play.odd.sit.grid;
  if (!cell || !g) return false;
  const n = g.size;
  const at = Number(cell.dataset.ix);
  let to = null;
  if (e.key === 'ArrowRight') to = at + 1;
  else if (e.key === 'ArrowLeft') to = at - 1;
  else if (e.key === 'ArrowDown') to = at + n;
  else if (e.key === 'ArrowUp') to = at - n;
  else if (e.key === 'Home') to = at - (at % n);
  else if (e.key === 'End') to = at - (at % n) + n - 1;
  else return false;
  e.preventDefault();
  if (to < 0 || to >= n * n) return true;
  play.odd.cursor = to;
  for (const b of document.querySelectorAll('#pl-body .pl-cell')) b.tabIndex = Number(b.dataset.ix) === to ? 0 : -1;
  const next = document.querySelector(`#pl-body .pl-cell[data-ix="${to}"]`);
  if (next) next.focus();
  return true;
}

/** The page left open in another tab is not a minute lost. */
export function onVisibility() {
  const o = play.odd;
  if (!o.running) return;
  if (document.visibilityState === 'hidden') {
    o.left = Math.max(0, deadline - Date.now());
    paused = true;
  } else if (paused) {
    deadline = Date.now() + o.left;
    paused = false;
  }
}
