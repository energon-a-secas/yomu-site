// Play's scores and its mix-ups: one Persist kit store, 'yomu-site:play'
// version 1. No DOM.
//
//   games  { which|odd|oddFree|twins|names|spaces: { best, rounds } }
//   mixed  { 'シ|ツ': 3 }   how often each pair was mixed up, characters sorted
//
// `odd` is Odd one out against the clock (grids found in 60 seconds) and
// `oddFree` the untimed ten, kept apart because the two scores do not
// compare. `spaces` is "Where are the spaces?", whose score is the spaces
// placed right minus the extras over ten lines (play-spaces.js), so its top
// is no fixed ten either. Every key of `mixed` is two characters from the games' own content
// (kana from play-kana.js and play-twins.js, kanji from the look-alikes);
// no text a learner wrote or read is ever kept here, and the test reads the
// raw store to prove it.
//
// Read field by field like the kanji store: whatever does not fit is left out
// and counted, a store that is not a store at all starts empty with a note,
// and the raw value is copied to DAMAGED_KEY first, so starting empty never
// destroys anything. The pure functions take the data object, so
// tests/play.test.mjs runs them under plain node.

import { createStore, safeGet, safeSet } from './neorgon-persist.js';
import { isKana, isKanji } from './kana.js';

export const KEY = 'yomu-site:play';
export const VERSION = 1;
export const DAMAGED_KEY = `${KEY}:damaged`;
export const GAME_IDS = Object.freeze(['which', 'odd', 'oddFree', 'twins', 'names', 'spaces']);
/** The highest score a round can give, per game; the timed round and the spaces have no fixed top. */
export const TOP = Object.freeze({ which: 10, odd: 999, oddFree: 10, twins: 10, names: 10, spaces: 999 });
/** Pairs kept at most; the least mixed go first. */
export const MAX_MIXED = 400;
const MAX_COUNT = 9999;

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (n) => Number.isInteger(n) && n >= 0;
/** One character of the games: a kana, ー, or a kanji. */
const isPlayChar = (ch) => typeof ch === 'string' && [...ch].length === 1 && (isKana(ch) || isKanji(ch) || ch === 'ー');

export function emptyData() {
  return { games: {}, mixed: {} };
}

/** The key of a pair: its two characters, sorted, with a bar between. Null for anything else. */
export function pairKey(a, b) {
  if (!isPlayChar(a) || !isPlayChar(b) || a === b) return null;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The two characters of a key, or null. */
export function pairOf(key) {
  const parts = typeof key === 'string' ? key.split('|') : [];
  if (parts.length !== 2 || pairKey(parts[0], parts[1]) !== key) return null;
  return parts;
}

function cleanGame(id, v) {
  if (!isObject(v) || !isCount(v.best) || !isCount(v.rounds)) return null;
  if (v.best > TOP[id] || v.rounds > MAX_COUNT || (v.best > 0 && v.rounds === 0)) return null;
  return { best: v.best, rounds: v.rounds };
}

/** Keep the MAX_MIXED most mixed pairs: the ones a round should draw more often. */
function capMixed(mixed) {
  const list = Object.entries(mixed);
  if (list.length <= MAX_MIXED) return mixed;
  list.sort(([ka, a], [kb, b]) => b - a || (ka < kb ? -1 : 1));
  return Object.fromEntries(list.slice(0, MAX_MIXED));
}

/**
 * A plain data object from whatever was stored. `dropped` counts what was
 * left out; `damaged` says the whole thing was not a store at all.
 */
export function validate(raw) {
  const data = emptyData();
  if (!isObject(raw)) return { data, dropped: 0, damaged: raw !== null && raw !== undefined };
  let dropped = 0;
  if (isObject(raw.games)) {
    for (const [id, v] of Object.entries(raw.games)) {
      const ok = GAME_IDS.includes(id) ? cleanGame(id, v) : null;
      if (ok) data.games[id] = ok;
      else dropped += 1;
    }
  } else if (raw.games !== undefined) dropped += 1;
  if (isObject(raw.mixed)) {
    for (const [k, n] of Object.entries(raw.mixed)) {
      if (pairOf(k) && Number.isInteger(n) && n >= 1 && n <= MAX_COUNT) data.mixed[k] = n;
      else dropped += 1;
    }
    data.mixed = capMixed(data.mixed);
  } else if (raw.mixed !== undefined) dropped += 1;
  return { data, dropped, damaged: false };
}

/** A round finished: one more round, and the best if it beat it. Returns { best, isBest }. */
export function recordRound(data, game, score) {
  if (!GAME_IDS.includes(game) || !isCount(score)) return null;
  const was = data.games[game] || { best: 0, rounds: 0 };
  const s = Math.min(score, TOP[game]);
  const isBest = s > was.best;
  data.games[game] = { best: Math.max(was.best, s), rounds: Math.min(was.rounds + 1, MAX_COUNT) };
  return { best: data.games[game].best, isBest };
}

/** One mix-up of a and b. Returns the pair's count, or 0 when the pair is not one. */
export function recordMixed(data, a, b) {
  const k = pairKey(a, b);
  if (!k) return 0;
  data.mixed[k] = Math.min((data.mixed[k] || 0) + 1, MAX_COUNT);
  data.mixed = capMixed(data.mixed);
  return data.mixed[k] || 0;
}

export function mixedCount(data, a, b) {
  const k = pairKey(a, b);
  return k ? data.mixed[k] || 0 : 0;
}

/**
 * The data, kept, the way kanji-store.js keeps its own: every change writes
 * through at once, a write that fails leaves the page working on what it
 * holds and `writable` says so, and `note` is 'damaged' or 'partial' when what
 * was stored could not be read whole.
 */
export function openPlay({ store = createStore({ key: KEY, version: VERSION }), readRaw = () => safeGet(KEY), keepRaw = (s) => safeSet(DAMAGED_KEY, s) } = {}) {
  let data = emptyData();
  let note = null;
  let dropped = 0;
  let writable = true;

  function load() {
    const raw = readRaw();
    const loaded = store.load(null);
    note = null;
    dropped = 0;
    if (raw !== null && raw !== undefined && loaded === null) {
      keepRaw(raw);
      data = emptyData();
      note = 'damaged';
      return api;
    }
    const v = validate(loaded);
    data = v.data;
    dropped = v.dropped;
    if (v.damaged || v.dropped) {
      if (raw !== null && raw !== undefined) keepRaw(raw);
      note = v.damaged ? 'damaged' : 'partial';
    }
    return api;
  }

  function commit() {
    writable = store.save(data);
  }

  const api = {
    load,
    get data() { return data; },
    get note() { return note; },
    get dropped() { return dropped; },
    get writable() { return writable; },
    best: (game) => (data.games[game] ? data.games[game].best : 0),
    rounds: (game) => (data.games[game] ? data.games[game].rounds : 0),
    finish(game, score) {
      const r = recordRound(data, game, score);
      if (r) commit();
      return r;
    },
    mixed(a, b) {
      const n = recordMixed(data, a, b);
      if (n) commit();
      return n;
    },
    mixedCount: (a, b) => mixedCount(data, a, b),
  };
  return api;
}

let page = null;

/** The page's store, opened on first use. */
export function myPlay() {
  if (!page) page = openPlay().load();
  return page;
}
