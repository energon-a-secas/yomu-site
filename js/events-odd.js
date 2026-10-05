// Odd one out: a sitting's grids, its clock, its taps and its arrows. Split
// out of events-play.js, which keeps the routes, the other games and the
// keys, so both stay under the 500-line rule.
//
// Against the clock: 60 seconds that start only when the learner presses
// Start the clock (never on arrival), a wrong tap costs 3 seconds, and the
// next grid comes at once after one is found. Untimed (WCAG 2.2.1, chosen by
// default under prefers-reduced-motion): ten grids, each found one followed
// by its reason and Next. The clock is a deadline, not a count of ticks
// (play-clock.js), and it stands still while the game is not on screen: the
// page hidden (visibilitychange), #pl-body out of what the top page shows
// (an IntersectionObserver with no root), or a frame its host no longer
// draws. A host closing its sheet leaves visibilityState visible; measured
// 2026-10-05 in Runcible's sheet, Chromium and WebKit report it to the
// observer, and Firefox reports nothing there but reads the frame's
// viewport as 0 by 0, which every tick checks. A round that runs out ends
// only once an observer has just seen the game on screen.
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
import {
  createClock, startClock as runClock, stopClock as haltClock, hide, show as unhide, penalize, tickClock, isHidden,
} from './play-clock.js';

const TIMED_MS = 60 * 1000;
const PENALTY_MS = 3 * 1000;

let timer = null;
let clk = createClock(TIMED_MS);
let ending = null;          // the observer asked, at the deadline, whether the game is on screen
let drawnAt = 0;            // the last tick that found the frame drawn
let pairs = null;           // this sitting's pairs; null while they load
const now = () => performance.now();
/** Firefox draws no frame its host hides, and its viewport reads 0 by 0 then. */
const drawn = () => window.innerWidth > 0 && window.innerHeight > 0;

/** The frame drawn or not, at `t`: an undrawn one hides the game from the last tick that saw it. */
function checkDrawn(t) {
  if (drawn()) { unhide(clk, 'frame', t); drawnAt = t; return true; }
  hide(clk, 'frame', drawnAt || t);
  return false;
}

export function newOddSitting() {
  stopClock();
  const hidden = clk.hidden;
  clk = createClock(TIMED_MS);
  clk.hidden = hidden;      // what hides the game is the page's, not the sitting's
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

/** The timer's words, when the whole seconds changed. */
function paintLeft(left) {
  const o = play.odd;
  const was = Math.ceil(o.left / 1000);
  o.left = left;
  const el = $('pl-timer');
  if (el && Math.ceil(left / 1000) !== was) el.textContent = ui('timeLeft', { n: Math.ceil(left / 1000) });
}

function tick() {
  if (!play.odd.running) return;
  checkDrawn(now());
  const t = tickClock(clk, now());
  paintLeft(t.left);
  if (t.over) confirmEnd();
}

/**
 * The deadline passed with nothing known to hide the game: end the round
 * once an observer has just seen it on screen. Its first report is now; a
 * sheet closed a moment ago has hidden the clock (watchView) before this
 * report arrives, since both observers report in the order they were made.
 */
function confirmEnd() {
  if (ending) return;
  const target = $('pl-body');
  if (typeof IntersectionObserver !== 'function' || !target) { endOdd(); return; }
  ending = new IntersectionObserver((entries) => {
    const seen = entries[entries.length - 1];
    ending.disconnect();
    ending = null;
    if (!play.odd.running || !checkDrawn(now()) || isHidden(clk) || document.visibilityState === 'hidden') return;
    if (seen && seen.isIntersecting && tickClock(clk, now()).over) endOdd();
  });
  ending.observe(target);
}

export function startClock() {
  const o = play.odd;
  if (o.running) return;
  if (!pairs) { o.wantClock = true; return; }
  o.wantClock = false;
  o.running = true;
  checkDrawn(now());
  runClock(clk, now());
  timer = setInterval(tick, 200);
  nextGrid();
  show();
  const cell = document.querySelector('#pl-body .pl-cell[tabindex="0"]');
  if (cell) cell.focus({ preventScroll: true });
}

export function stopClock() {
  if (timer) clearInterval(timer);
  timer = null;
  if (ending) { ending.disconnect(); ending = null; }
  haltClock(clk);
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
    if (o.mode === 'timed') { penalize(clk, PENALTY_MS, now()); tick(); }
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
  if (document.visibilityState === 'hidden') hide(clk, 'page', now());
  else unhide(clk, 'page', now());
  if (play.odd.running) paintLeft(tickClock(clk, now()).left);
}

/**
 * Nor is a game out of what the top page shows: scrolled away, or a host's
 * sheet closed over its frame (visibilityState stays visible then). Bound
 * once, on #pl-body, which every Play screen draws into.
 */
export function watchView() {
  const target = $('pl-body');
  if (typeof IntersectionObserver !== 'function' || !target) return;
  new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    if (!e) return;
    if (e.isIntersecting) unhide(clk, 'view', now());
    else hide(clk, 'view', Math.min(e.time, now()));
    if (play.odd.running) paintLeft(tickClock(clk, now()).left);
  }).observe(target);
}
