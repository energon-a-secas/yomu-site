// The merge rules of sync: what a row is, and how two copies of it become
// one. Pure, no DOM, no clock, no Convex. Three callers import this one file:
// the page (js/sync.js, js/sync-local.js), the Convex functions
// (convex/model/sync.ts, which bundles it), and the node tests. A rule
// changed here changes on both sides at once, which is why it is not a .ts
// file: a browser cannot strip types.
//
// Every join is commutative and idempotent, so two devices that sync in
// either order, or one that pushes the same row twice, end in the same
// place, and a sync that has nothing new writes nothing. The rules are
// js/kanji-backup.js mergeInto's and History's mergePhrases', made exact
// where those leave a tie to "this browser":
//
//   seen kanji   n the max, first the earliest, last the latest, words a
//                union of at most 8 (the most recently met kept), and where
//                it was last met (src, h) from the copy with the later last
//   saved kanji  the schedule with more reviews behind it (ties: the later
//                due, then the higher box), lapses the max, the earliest save
//   phrase       n the max, first the earliest, last the latest (its text
//                and src go with it), the earliest save
//   Play         the max per game and per pair, the 400 most mixed pairs kept
//   prefs        per preference, the later change wins (ties: by value)
//
// Removals are tombstones, and kept. A saved kanji or phrase carries `s`,
// the latest time it was saved (never shown; `at` and `saved` stay the
// earliest), and a row carries `removed`, the latest time it was unsaved. A
// copy whose `s` is not newer than `removed` is dead and leaves nothing
// behind: a removal newer than the save wins, and a save newer than the
// removal wins. Clear all of My kanji is one more tombstone for every kanji
// at once, the owner's `clear`: it kills every save not newer than it, and
// every seen count made by a device that had not heard of it (a seen record
// carries `e`, the clear its device knew), since a count has no time of its
// own to compare. CLAUDE.md, "Accounts and sync", says what each means for
// the learner.

import { textKey, MAX_TEXT } from './history-text.js';

/** kanji-store.js SOURCES; tests/sync-rules.test.mjs holds the two equal. */
export const SOURCES = Object.freeze(['paste', 'typed', 'example', 'phrase', 'link', 'host', 'history']);
export const HISTORY_KEY = /^[0-9a-z]{1,16}$/;
export const TOP_BOX = 5;
export const MAX_WORDS = 8;
/** kanji-words.js MAX_FIELD: a word or a reading longer than this is not a dictionary word. */
const MAX_FIELD = 24;
/** play-store.js TOP, MAX_MIXED and its count cap. */
export const GAMES = Object.freeze({ which: 10, odd: 999, oddFree: 10, twins: 10, names: 10 });
export const GAME_IDS = Object.freeze(Object.keys(GAMES));
export const MAX_MIXED = 400;
const MAX_COUNT = 9999;
/** The display preferences that follow an account, with what each may hold (state.js). */
export const PREFS = Object.freeze({
  lang: ['en', 'es'],
  furigana: [true, false],
  romaji: ['said', 'spelled', 'off'],
  highlights: [true, false],
  unsaved: ['mark', 'off'],
  slow: [true, false],
});
export const PREF_KEYS = Object.freeze(Object.keys(PREFS));

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isTime = (v) => Number.isFinite(v) && v > 0;
const isStamp = (v) => Number.isFinite(v) && v >= 0;
const isCount = (n) => Number.isInteger(n) && n >= 0;
const len = (s) => [...s].length;
const minOf = (a, b) => (a <= b ? a : b);
const maxOf = (a, b) => (a >= b ? a : b);
/** -1, 0 or 1 over two lists of numbers or strings, compared in order. */
function cmp(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/** kana.js isKanji, repeated so the server bundles no wanakana; the tests hold the two equal. */
export const isKanji = (ch) => /\p{Script=Han}/u.test(ch) || ch === '々' || ch === '〆' || ch === 'ヶ';
export const oneKanji = (ch) => typeof ch === 'string' && len(ch) === 1 && isKanji(ch);
const hasKanji = (s) => [...s].some(isKanji);

/** Two canonical values are the same row. Every clean and join below builds its keys in one order. */
export function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ── Kanji ─────────────────────────────────────────────────────────────────
//
// { char, saved: { at, box, due, reviews, lapses, s } | null, removed,
//   seen: { n, first, last, words: [[written, reading, day]], src?, h?, e } | null }
//
// A word's day is when it was last met as far as sync knows (the seen
// record's last day on the device that sent it), so the eight kept are the
// eight met most recently, as on the device, and not the eight that sort
// first. The page keeps [written, reading] only, in that order.

const wordKey = (w) => `${w[0]}\u0000${w[1]}`;

function cleanWord(p) {
  if (!Array.isArray(p) || p.length !== 3) return null;
  const [w, r, d] = p;
  if (typeof w !== 'string' || typeof r !== 'string' || !w || !r || len(w) > MAX_FIELD || len(r) > MAX_FIELD) return null;
  return hasKanji(w) && DAY.test(d) ? [w, r, d] : null;
}

/**
 * The words kept: one per [written, reading], at its latest day, the
 * MAX_WORDS latest (ties by the word itself), oldest first.
 */
export function rankWords(list) {
  const best = new Map();
  for (const w of list) {
    const k = wordKey(w);
    const had = best.get(k);
    if (!had || w[2] > had[2]) best.set(k, w);
  }
  const ranked = [...best.values()].sort((a, b) => cmp([b[2], wordKey(a)], [a[2], wordKey(b)]));
  return ranked.slice(0, MAX_WORDS).sort((a, b) => cmp([a[2], wordKey(a)], [b[2], wordKey(b)]));
}

export function cleanSaved(v) {
  if (!isObject(v) || !isTime(v.at) || !Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX) return null;
  if (!DAY.test(v.due) || !isCount(v.reviews) || !isCount(v.lapses)) return null;
  return { at: v.at, box: v.box, due: v.due, reviews: v.reviews, lapses: v.lapses, s: isTime(v.s) ? maxOf(v.s, v.at) : v.at };
}

export function cleanSeen(v) {
  if (!isObject(v) || !Number.isInteger(v.n) || v.n < 1 || !DAY.test(v.first) || !DAY.test(v.last)) return null;
  const out = {
    n: v.n,
    first: minOf(v.first, v.last),
    last: maxOf(v.first, v.last),
    words: rankWords((Array.isArray(v.words) ? v.words : []).map(cleanWord).filter(Boolean)),
  };
  if (SOURCES.includes(v.src)) out.src = v.src;
  if (typeof v.h === 'string' && HISTORY_KEY.test(v.h)) out.h = v.h;
  out.e = isStamp(v.e) ? v.e : 0;
  return out;
}

/** A kanji row as sync carries it, or null. A bad part is left out, the row kept. */
export function cleanKanjiRow(v) {
  if (!isObject(v) || !oneKanji(v.char)) return null;
  return { char: v.char, saved: cleanSaved(v.saved), removed: isStamp(v.removed) ? v.removed : 0, seen: cleanSeen(v.seen) };
}

function joinSaved(x, y) {
  // The schedule with more reviews behind it, as mergeInto; a tie that
  // mergeInto leaves to this browser goes to the later due, then the higher box.
  const lead = cmp([x.reviews, x.due, x.box], [y.reviews, y.due, y.box]) >= 0 ? x : y;
  return { at: minOf(x.at, y.at), box: lead.box, due: lead.due, reviews: lead.reviews, lapses: maxOf(x.lapses, y.lapses), s: maxOf(x.s, y.s) };
}

const placeOf = (x) => [x.last, x.src || '', x.h || ''];

function joinSeen(x, y, e) {
  const place = cmp(placeOf(x), placeOf(y)) >= 0 ? x : y;
  const out = { n: maxOf(x.n, y.n), first: minOf(x.first, y.first), last: maxOf(x.last, y.last), words: rankWords([...x.words, ...y.words]) };
  if (place.src) out.src = place.src;
  if (place.h) out.h = place.h;
  out.e = e;
  return out;
}

/**
 * One kanji row from two copies of it (either may be null) under the
 * owner's latest Clear all (`clear`, ms, 0 for none). Null when nothing is
 * left: no live save, no count, and no removal the clear does not cover.
 */
export function joinKanji(a, b, clear = 0) {
  if (!a && !b) return null;
  const char = (a || b).char;
  const E = Math.max(clear, a && a.seen ? a.seen.e : 0, b && b.seen ? b.seen.e : 0);
  const removed = Math.max(a ? a.removed : 0, b ? b.removed : 0);
  const R = Math.max(removed, E);
  const live = [a && a.saved, b && b.saved].filter((x) => x && x.s > R);
  const saved = live.length === 2 ? joinSaved(live[0], live[1]) : live[0] || null;
  const counts = [a && a.seen, b && b.seen].filter((x) => x && x.e >= E);
  const seen = counts.length === 2 ? joinSeen(counts[0], counts[1], E) : counts[0] ? { ...counts[0], e: E } : null;
  // A removal the clear covers says nothing more, so a row the clear emptied is no row at all.
  const kept = removed > E ? removed : 0;
  if (!saved && !seen && !kept) return null;
  return { char, saved, removed: kept, seen };
}

// ── Saved phrases ─────────────────────────────────────────────────────────
//
// { key, removed, phrase: { t, first, last, n, src, saved, s } | null }
//
// Only a saved History entry is a phrase here. A dead row keeps its key and
// its removal, never its text.

export function cleanPhrase(v) {
  if (!isObject(v) || typeof v.t !== 'string' || !v.t.trim() || v.t.length > MAX_TEXT) return null;
  if (!isTime(v.first) || !isTime(v.last) || !Number.isInteger(v.n) || v.n < 1) return null;
  if (!SOURCES.includes(v.src) || !isTime(v.saved)) return null;
  return {
    t: v.t, first: minOf(v.first, v.last), last: maxOf(v.first, v.last), n: v.n, src: v.src, saved: v.saved,
    s: isTime(v.s) ? maxOf(v.s, v.saved) : v.saved,
  };
}

/** A phrase row, or null. A text that is not its key's text is left out, the removal kept. */
export function cleanPhraseRow(v) {
  if (!isObject(v) || typeof v.key !== 'string' || !HISTORY_KEY.test(v.key)) return null;
  const phrase = cleanPhrase(v.phrase);
  return { key: v.key, removed: isStamp(v.removed) ? v.removed : 0, phrase: phrase && textKey(phrase.t) === v.key ? phrase : null };
}

const phrasePlace = (x) => [x.last, x.src, x.t];

export function joinPhrase(a, b) {
  if (!a && !b) return null;
  const key = (a || b).key;
  const removed = Math.max(a ? a.removed : 0, b ? b.removed : 0);
  const live = [a && a.phrase, b && b.phrase].filter((x) => x && x.s > removed);
  let phrase = live[0] || null;
  if (live.length === 2) {
    const [x, y] = live;
    const place = cmp(phrasePlace(x), phrasePlace(y)) >= 0 ? x : y;
    phrase = {
      t: place.t, first: minOf(x.first, y.first), last: maxOf(x.last, y.last), n: maxOf(x.n, y.n), src: place.src,
      saved: minOf(x.saved, y.saved), s: maxOf(x.s, y.s),
    };
  }
  if (!phrase && !removed) return null;
  return { key, removed, phrase };
}

// ── Play ──────────────────────────────────────────────────────────────────
//
// { games: { which?: { best, rounds }, ... }, mixed: [{ k: 'シ|ツ', n }] }
// A pair is a value, not a key: Convex keys are ASCII.

function cleanGame(id, v) {
  if (!isObject(v) || !isCount(v.best) || !isCount(v.rounds)) return null;
  if (v.best > GAMES[id] || v.rounds > MAX_COUNT || (v.best > 0 && v.rounds === 0)) return null;
  return { best: v.best, rounds: v.rounds };
}

function pairOk(k) {
  const parts = typeof k === 'string' ? k.split('|') : [];
  return parts.length === 2 && len(parts[0]) === 1 && len(parts[1]) === 1 && parts[0] < parts[1];
}

/** The MAX_MIXED most mixed (ties by the pair), in the pairs' order. play-store.js capMixed keeps the same ones. */
function capPairs(map) {
  const list = [...map].map(([k, n]) => ({ k, n }));
  list.sort((a, b) => b.n - a.n || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return list.slice(0, MAX_MIXED).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
}

function addPairs(map, list) {
  for (const p of list) if (!map.has(p.k) || p.n > map.get(p.k)) map.set(p.k, p.n);
  return map;
}

export function cleanPlay(v) {
  if (!isObject(v)) return null;
  const games = {};
  for (const id of GAME_IDS) {
    const g = isObject(v.games) ? cleanGame(id, v.games[id]) : null;
    if (g) games[id] = g;
  }
  const pairs = (Array.isArray(v.mixed) ? v.mixed : []).filter((p) => isObject(p) && pairOk(p.k) && Number.isInteger(p.n) && p.n >= 1 && p.n <= MAX_COUNT);
  return { games, mixed: capPairs(addPairs(new Map(), pairs)) };
}

export function joinPlay(a, b) {
  if (!a && !b) return null;
  if (!a || !b) return a || b;
  const games = {};
  for (const id of GAME_IDS) {
    const x = a.games[id];
    const y = b.games[id];
    if (x || y) games[id] = { best: Math.max(x ? x.best : 0, y ? y.best : 0), rounds: Math.max(x ? x.rounds : 0, y ? y.rounds : 0) };
  }
  return { games, mixed: capPairs(addPairs(addPairs(new Map(), a.mixed), b.mixed)) };
}

// ── Preferences ───────────────────────────────────────────────────────────
//
// { values: { lang?: { v, at }, ... } }: `at` is when this preference was
// last changed on the device that set it, 0 when it never was.

export function cleanPrefs(v) {
  if (!isObject(v)) return null;
  const values = {};
  for (const k of PREF_KEYS) {
    const p = isObject(v.values) ? v.values[k] : null;
    if (isObject(p) && PREFS[k].includes(p.v) && isStamp(p.at)) values[k] = { v: p.v, at: p.at };
  }
  return { values };
}

export function joinPrefs(a, b) {
  if (!a && !b) return null;
  if (!a || !b) return a || b;
  const values = {};
  for (const k of PREF_KEYS) {
    const x = a.values[k];
    const y = b.values[k];
    if (!x || !y) { if (x || y) values[k] = x || y; continue; }
    values[k] = cmp([x.at, JSON.stringify(x.v)], [y.at, JSON.stringify(y.v)]) >= 0 ? x : y;
  }
  return { values };
}

/** The owner's Clear all, as a time; anything else is none. */
export const cleanClear = (v) => (isStamp(v) ? v : 0);
