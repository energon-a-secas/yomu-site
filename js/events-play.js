// Play: its routes' screens, its actions and its keys, bound once from
// bindEvents. Odd one out's grid and clock are events-odd.js's.
//
// The routes themselves are events-kanji.js's (routes.js names them): it
// shows the section, stamps the history entry and walks Back, then calls the
// hook below, which draws the screen and moves focus. Entering a game always
// begins a new round; leaving one, by Back, Escape or any other route,
// abandons it and stops the clock, and nothing of an abandoned round is kept.
//
// Keys follow the review's discipline (events-kanji.js onKey): only on a
// game's route, never while a dialog is open, an IME composes, a modifier is
// held or the key lands in a field. 1 to 4 answer (1 to 3 for Twins), Enter
// or Space goes on once a question is answered, the arrows move in Odd one
// out's grid, and Escape leaves, with its default prevented so an embedded
// Yomu does not also close the host's sheet (js/embed.js).

import { $ } from './utils.js';
import { kanjiInfo } from './reader.js';
import { myKanji } from './kanji-store.js';
import { loadJoyo } from './collection.js';
import { view } from './render-mykanji.js';
import { paintDueCount } from './render-save.js';
import { afterPaintAll } from './render.js';
import { canSpeak, speak, voicesReady, cancel } from './speech.js';
import { describe } from './events-read.js';
import {
  onRoute, currentRoute, applyRoute, leave,
} from './events-kanji.js';
import { HASH, isPlay, gameOf } from './routes.js';
import { myPlay, KEY as PLAY_KEY } from './play-store.js';
import { KANA_SETS } from './play-kana.js';
import { TWINS } from './play-twins.js';
import { loadLookalikes, loadNames } from './play-data.js';
import {
  createRound, current, answer, answeredNow, next, finished, score, kanaRound, kanjiRound, kanjiPool,
  twinsRound, namesRound,
} from './play-rounds.js';
import { play, paintPlay, playFocus, resultOf } from './render-play.js';
import {
  startOdd, newOddSitting, startClock, stopClock, tapCell, moveInGrid, oddGoOn, onVisibility, watchView,
} from './events-odd.js';
import {
  startSpaces, spacesRoundNow, spacesKey, lendPaint, SPACES_ACTIONS,
} from './events-spaces.js';
import { spacesScore, spacesTotal, spacesCounts, missedLines } from './play-spaces.js';

let epoch = 0;              // a new round or a new route makes older async work stale

export const onPlay = () => isPlay(currentRoute());

// ── Painting, with focus kept ─────────────────────────────────────────────

/** What is focused inside Play, described well enough to find it again. */
function focusKey() {
  const a = document.activeElement;
  const sec = $('play');
  if (!a || !sec || !sec.contains(a)) return null;
  const d = a.dataset || {};
  return { id: a.id || null, act: d.act || null, ix: d.ix ?? null, mode: d.mode || null, game: d.game || null };
}

function refocus(key) {
  if (!key) return;
  let el = key.id ? $(key.id) : null;
  if (!el && key.act) {
    const same = [...document.querySelectorAll(`#pl-body [data-act="${key.act}"]`)];
    el = same.find((b) => (key.mode ? b.dataset.mode === key.mode : true)
      && (key.game ? b.dataset.game === key.game : true)
      && (key.ix !== null ? b.dataset.ix === key.ix : true)) || null;
  }
  if (el) el.focus({ preventScroll: true });
}

/**
 * Bring `el` into what shows, with the least scroll: the feedback after an
 * answer (the reason and Next), a new grid, a question, a result's heading.
 *
 * In an embed this is the host's sheet that has to move. Measured
 * 2026-10-05 in Runcible's sheet at 390x844, from inside the cross-origin
 * frame: scrollIntoView({ block: 'nearest' }) scrolls the sheet in Chromium
 * and Firefox, and in WebKit it does not (neither does focus()), which is
 * why play.css keeps Next on the feedback's first row and a found grid's
 * feedback above the grid. The frame is as tall as its page only once the
 * host has read yomu:height, so in an embed it runs again on the frame's
 * next resize: below the frame's old height the element could not be
 * reached, and a frame that shrank (a result after a grid) lets the sheet
 * clamp its scroll and tuck the heading under its header.
 */
export function reveal(el) {
  if (!el || !el.isConnected) return;
  const go = () => { if (el.isConnected) el.scrollIntoView({ block: 'nearest' }); };
  const embedded = document.documentElement.dataset.embed === '1';
  if (!embedded || el.getBoundingClientRect().bottom <= window.innerHeight + 1) go();
  if (!embedded) return;
  let done = false;
  const again = () => {
    if (done) return;
    done = true;
    window.removeEventListener('resize', again);
    go();
  };
  window.addEventListener('resize', again);
  setTimeout(again, 600);
}

/** What a paint shows the learner next: the feedback, the result, a grid to search, a question. */
function nextUp(el) {
  if ($('pl-feedback')) return $('pl-feedback');
  if ($('pl-done')) return $('pl-done');
  return document.querySelector('#pl-body .pl-grid') || document.querySelector('#pl-body .pl-q') || el;
}

/** Repaint, keeping focus where it was when that control is still there. */
export function repaint({ again = false } = {}) {
  if (!onPlay()) return;
  const key = focusKey();
  play.speech = canSpeak();
  paintPlay();
  refocus(key);
  // Meanings that arrived after an answer can make its feedback taller.
  if (again && $('pl-feedback')) reveal($('pl-feedback'));
}

/** Repaint and put focus where the screen says it belongs now. */
export function show() {
  if (!onPlay()) return;
  play.speech = canSpeak();
  paintPlay();
  const el = playFocus();
  if (el) el.focus({ preventScroll: true });
  reveal(nextUp(el));
}

// ── Data the games need ───────────────────────────────────────────────────

/** Meanings and readings for these kanji, once each, then the screen again. */
export async function ensureInfo(chars) {
  const missing = [...new Set(chars)].filter((ch) => /\p{Script=Han}/u.test(ch) && !view.info.has(ch));
  if (!missing.length) return;
  try {
    const got = await kanjiInfo(missing);
    for (const ch of missing) view.info.set(ch, got.get(ch) || null);
  } catch (err) {
    console.error('[yomu]', err);
    return;
  }
  repaint({ again: true });
}

export async function lookalikes() {
  if (play.look.state === 'ready') return play.look.map;
  play.look.state = 'loading';
  try {
    play.look.map = await loadLookalikes();
    play.look.state = 'ready';
  } catch (err) {
    console.error('[yomu]', err);
    const why = describe(err);
    play.look.state = 'error';
    play.look.error = why.file ? `${why.file}: ${why.detail}` : why.detail;
  }
  return play.look.map;
}

/** The kanji a round asks about: the learner's collection, or the 1st and 2nd grade too. */
export async function kanjiPoolNow(map) {
  const seen = Object.entries(myKanji().data.seen).filter(([, s]) => s && s.n >= 1).map(([ch]) => ch);
  let low = [];
  if (seen.filter((ch) => map.has(ch)).length < 10) {
    try {
      const joyo = await loadJoyo();
      low = joyo.grades.filter((g) => g.grade <= 2).flatMap((g) => g.chars);
    } catch (err) {
      console.error('[yomu]', err);
    }
  }
  return kanjiPool(seen, map, low);
}

async function names() {
  if (play.names.state === 'ready' || play.names.state === 'missing') return;
  play.names.state = 'loading';
  try {
    const got = await loadNames();
    play.names.state = got.state;
    play.names.rows = got.rows || null;
  } catch (err) {
    console.error('[yomu]', err);
    const why = describe(err);
    play.names.state = 'error';
    play.names.error = why.file ? `${why.file}: ${why.detail}` : why.detail;
  }
}

// ── Rounds ────────────────────────────────────────────────────────────────

export const mixed = (a, b) => myPlay().mixedCount(a, b);

async function startWhich(mine) {
  const w = play.which;
  w.round = null;
  if (w.mode === 'kana') {
    w.round = createRound('which', kanaRound(KANA_SETS, { mixed }));
    return;
  }
  const map = await lookalikes();
  if (mine !== epoch || !map) return;
  const { pool, filled, own } = await kanjiPoolNow(map);
  if (mine !== epoch) return;
  Object.assign(w, { pool, filled, own: own || 0 });
  await ensureInfo(pool);
  if (mine !== epoch) return;
  const strokes = (ch) => (view.info.get(ch) && Number.isInteger(view.info.get(ch).s) ? view.info.get(ch).s : null);
  w.round = createRound('which', kanjiRound(pool, map, { mixed, strokes }));
  ensureInfo(w.round.questions.flatMap((q) => q.options));
}

async function startGame(game, { focus = true } = {}) {
  epoch += 1;
  const mine = epoch;
  cancel();
  play.result = null;
  play.note = '';
  if (game === 'which') await startWhich(mine);
  else if (game === 'odd') await startOdd(() => mine !== epoch);
  else if (game === 'twins') play.twins.round = createRound('twins', twinsRound(TWINS));
  else if (game === 'spaces') await startSpaces(() => mine !== epoch);
  else if (game === 'names') {
    play.name.round = null;
    await names();
    if (mine !== epoch) return;
    if (play.names.state === 'ready' && play.names.rows.length >= 4) play.name.round = createRound('names', namesRound(play.names.rows));
  }
  if (mine !== epoch || gameOf(currentRoute()) !== game) return;
  // A clock the learner started meanwhile has put focus in the grid: keep it there.
  if (focus && !(game === 'odd' && play.odd.running)) show();
  else repaint();
}

function roundOf(game) {
  return {
    which: play.which.round, twins: play.twins.round, names: play.name.round, spaces: spacesRoundNow(),
  }[game] || null;
}

/** The round is over: count it, keep the best, show the result. */
function finish(game, r) {
  if (game === 'spaces') {
    const points = spacesScore(r);
    play.result = resultOf(game, r, myPlay().finish(game, points), {
      score: points, of: spacesTotal(r), counts: spacesCounts(r), mixups: missedLines(r),
    });
    show();
    return;
  }
  const rec = myPlay().finish(game, score(r));
  play.result = resultOf(game, r, rec, { score: score(r), of: r.questions.length });
  ensureInfo(play.result.mixups.flat());
  show();
}

function pick(ix) {
  const game = gameOf(currentRoute());
  const r = roundOf(game);
  const q = current(r);
  if (!q || answeredNow(r)) return;
  const opt = q.options[ix];
  if (opt === undefined) return;
  const got = answer(r, opt);
  if (got && !got.right && game !== 'names') myPlay().mixed(...(q.pair || [q.answer, opt]));
  show();
}

function goOn() {
  const game = gameOf(currentRoute());
  if (game === 'odd') { oddGoOn(); return; }
  const r = roundOf(game);
  if (!r || !answeredNow(r)) return;
  next(r);
  if (game === 'spaces') play.spaces.cursor = 0;
  if (finished(r)) { finish(game, r); return; }
  show();
}

// ── Keys ──────────────────────────────────────────────────────────────────

function onKey(e) {
  const route = currentRoute();
  const game = gameOf(route);
  if (!game || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
  if (document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (e.key === 'Escape') { e.preventDefault(); leave(); return; }
  if (play.result && play.result.game === game) return;
  if (game === 'odd' && moveInGrid(e)) return;
  if (game === 'spaces' && spacesKey(e)) return;
  const onButton = !!(t && t.closest && t.closest('button, a'));
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    if (onButton) return;            // the button does what it says
    e.preventDefault();
    goOn();
    return;
  }
  if (game === 'odd' || game === 'spaces') return;
  const r = roundOf(game);
  const q = current(r);
  if (!q || answeredNow(r) || !/^[1-9]$/.test(e.key)) return;
  const ix = Number(e.key) - 1;
  if (ix >= q.options.length) return;
  e.preventDefault();
  pick(ix);
}

// ── Actions ───────────────────────────────────────────────────────────────

function savedToggle(b) {
  const ch = play.saveList[Number(b.dataset.ix)];
  if (!ch) return;
  myKanji().toggle(ch, new Date());
  const on = myKanji().isSaved(ch);
  play.saveList.forEach((x, i) => {
    if (x !== ch) return;
    const t = document.querySelector(`#pl-body [data-act="pl-save"][data-ix="${i}"]`);
    if (t) t.setAttribute('aria-pressed', String(on));
  });
  paintDueCount();
}

export const PLAY_ACTIONS = {
  'pl-back': () => leave(),
  // The route is applied now: hashchange comes a task later, and a key
  // pressed in between would land on the list.
  'pl-start': (b) => {
    const hash = HASH[`play-${b.dataset.game}`];
    if (!hash) return;
    location.hash = hash;
    applyRoute();
  },
  'pl-mode': (b) => {
    if (!['kana', 'kanji'].includes(b.dataset.mode) || play.which.mode === b.dataset.mode) return;
    play.which.mode = b.dataset.mode;
    play.which.round = null;
    repaint();
    startGame('which');
  },
  'pl-oddmode': (b) => {
    if (!['timed', 'free'].includes(b.dataset.mode) || play.odd.mode === b.dataset.mode) return;
    play.odd.mode = b.dataset.mode;
    newOddSitting();
    repaint();
    startGame('odd');
  },
  'pl-pick': (b) => pick(Number(b.dataset.ix)),
  'pl-next': () => goOn(),
  'pl-again': () => startGame(gameOf(currentRoute())),
  'pl-retry': () => {
    if (play.look.state === 'error') play.look.state = 'idle';
    if (play.names.state === 'error') play.names.state = 'idle';
    if (play.spaces.state === 'error') play.spaces.state = 'idle';
    startGame(gameOf(currentRoute()));
  },
  'pl-hear': () => {
    const game = gameOf(currentRoute());
    const q = current(roundOf(game));
    if (q) speak(q.kind === 'name' ? q.kata : q.answer);
  },
  'pl-clock': () => startClock(),
  'pl-cell': (b) => tapCell(Number(b.dataset.ix)),
  'pl-save': savedToggle,
  ...SPACES_ACTIONS,
};

/** Bind once, from bindEvents, before the route the page opened at is shown. */
export function bindPlay() {
  lendPaint({ repaint, show });
  onRoute((next, prev, { boot = false } = {}) => {
    if (gameOf(prev) && next !== prev) { epoch += 1; stopClock(); cancel(); }
    if (!isPlay(next)) return;
    play.route = next;
    const game = gameOf(next);
    if (game) {
      paintPlay();
      startGame(game, { focus: !boot });
      return;
    }
    // The list: what is not available yet says so on its row.
    play.result = null;
    play.speech = canSpeak();
    paintPlay();
    const back = gameOf(prev) && document.querySelector(`#pl-body [data-act="pl-start"][data-game="${gameOf(prev)}"]`);
    if (!boot) (back || $('pl-title')).focus({ preventScroll: true });
    names().then(() => { if (currentRoute() === 'play') repaint(); });
  });
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  watchView();
  // Another tab finished a round: read the store again rather than letting
  // this tab's next write put the old copy back.
  addEventListener('storage', (e) => {
    if (e.key !== PLAY_KEY && e.key !== null) return;
    myPlay().load();
    if (currentRoute() === 'play') repaint();
  });
  afterPaintAll(() => repaint());
  voicesReady().then(() => repaint());
}
