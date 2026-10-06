// My kanji: the kanji a learner keeps for review, and every kanji they meet.
//
// One Persist kit store, 'yomu-site:kanji' version 1, holding three things:
//
//   saved    { char: { at, box, due, reviews, lapses } }   kept for review
//   seen     { char: { n, first, last, words, src?, h? } } met in a text
//   session  { id, counted: [char], src?, h?, at? }        the text being read
//
// Every kanji met is also a kanji collected: the collection (collection.js)
// is these counts read against the jōyō list, with nothing stored of its own.
// `src` says what kind of text a kanji was last met in (SOURCES: pasted,
// typed, an example, a phrase, a link, a text the host sent, History), and
// `h` is the key of that text in the History store (history-store.js), kept
// while the learner has Remember on, or saved that text. A key is a hash, not
// the text, and a key whose text was forgotten is harmless: the page falls
// back to `src`.
//
// "Times seen" counts texts, not keystrokes. A reading session begins when
// the box gets new content all at once (a paste, an example, a phrase or a
// dialogue, a #t= link, a yomu:load) or after it was emptied, and within one
// session each kanji counts once, whenever its read settles, including a
// kanji typed in later. The session's counted set is kept here, beside the
// counts, so a reload that restores the saved text finds those kanji already
// counted and counts nothing. `at` is when the session began (ms), which
// History needs to tell this session's drafts from an older session's texts:
// a store that starts empty counts its ids from 0 again. A session kept by
// a page from before `at` has none, and History then deletes no draft.
//
// What is never kept here: the text, a sentence, or anything longer than a
// dictionary word or a history key. `words` holds up to MAX_WORDS [written, reading] pairs per
// kanji, each one a dictionary form the analyzer found, so the review can show
// where a kanji was met without this store ever holding what was pasted.
//
// The functions below are pure over a plain data object and take the date as
// an argument, so tests/kanji-store.test.mjs runs them with no clock and no
// DOM. openKanji() wraps them around the store; myKanji() is the page's one.

import { createStore, safeGet, safeSet } from './neorgon-persist.js';
import { isKanji, hasKanji, toHira } from './kana.js';
// A cycle on purpose, and a safe one: kanji-backup.js uses this module's
// functions only when it is called, never while it loads.
import { exportDoc, mergeInto } from './kanji-backup.js';

export const KEY = 'yomu-site:kanji';
export const VERSION = 1;
/** A store this page could not read is copied here once, never thrown away. */
export const DAMAGED_KEY = `${KEY}:damaged`;
export const MAX_WORDS = 8;
/**
 * Where a reading session's text came from. Version 1 still: a store from
 * before these fields reads as it did, and a session with no `src` is typed.
 */
export const SOURCES = Object.freeze(['paste', 'typed', 'example', 'phrase', 'link', 'host', 'history']);
/** A History key (history-store.js textKey): base36, never the text. */
export const HISTORY_KEY = /^[0-9a-z]{1,16}$/;
export const TOP_BOX = 5;
/**
 * Days to the next review, by the box a kanji lands in after an answer.
 * Box 0 is saved and not reviewed yet, so it is due the day it was saved;
 * Got it moves a kanji up one box (1, 2, 4, 8, 16 days), Again sends it back
 * to box 1, due tomorrow. The top box repeats every 16 days.
 */
export const INTERVALS = Object.freeze([0, 1, 2, 4, 8, 16]);

/** A word or a reading longer than this is not a dictionary word. */
const MAX_FIELD = 24;
/** The embed contract caps a text at 2,000 characters, so a session cannot count more kanji. */
const MAX_COUNTED = 2000;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Nothing kept. With `at` (ms) the session starts then: one the page could not read starts when it loads. */
export function emptyData(at) {
  return { saved: {}, seen: {}, session: startedAt({ id: 0, counted: [] }, at) };
}

// ── Days ──────────────────────────────────────────────────────────────────
//
// Due dates are days, not instants: a kanji due "tomorrow" is due from the
// learner's midnight, wherever the clock says the hour is. Kept as local
// YYYY-MM-DD strings, which also sort as strings.

const pad = (n) => String(n).padStart(2, '0');

/** The local day of a Date or a timestamp, as YYYY-MM-DD. */
export function dayOf(when) {
  const d = when instanceof Date ? when : new Date(when);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return dayOf(new Date(y, m - 1, d + n));
}

export const minDay = (a, b) => (a <= b ? a : b);
export const maxDay = (a, b) => (a >= b ? a : b);

// ── Reading what was kept ─────────────────────────────────────────────────
//
// Nothing saved is trusted: a hand-edited store, a store from a newer page or
// a half-written one is read field by field, and whatever does not fit is
// left out and counted, never assigned onto the page's data.

export const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (n) => Number.isInteger(n) && n >= 0;
const isTime = (v) => Number.isFinite(v) && v > 0;
/** `session` with its start `at` (ms), or as it is when `at` is not a time. */
function startedAt(session, at) { return isTime(at) ? { ...session, at } : session; }
const isSource = (v) => SOURCES.includes(v);
const isHistoryKey = (v) => typeof v === 'string' && HISTORY_KEY.test(v);

/**
 * `rec` with `src` and `h` taken from `from`, each set only when valid and
 * left out otherwise, so a record with neither keeps exactly the fields it
 * had before these two existed. Returns `rec` itself when nothing moves.
 */
export function withPlace(rec, from) {
  const src = from && isSource(from.src) ? from.src : undefined;
  const h = from && isHistoryKey(from.h) ? from.h : undefined;
  if (rec.src === src && rec.h === h) return rec;
  const out = { ...rec };
  delete out.src;
  delete out.h;
  if (src !== undefined) out.src = src;
  if (h !== undefined) out.h = h;
  return out;
}

export function oneKanji(ch) {
  return typeof ch === 'string' && [...ch].length === 1 && isKanji(ch);
}

function cleanPair(p) {
  if (!Array.isArray(p) || p.length !== 2) return null;
  const [w, r] = p;
  if (typeof w !== 'string' || typeof r !== 'string') return null;
  if (!w || !r || [...w].length > MAX_FIELD || [...r].length > MAX_FIELD) return null;
  if (!hasKanji(w)) return null;
  return [w, r];
}

/** Append the pairs `more` adds to `list`, oldest dropped past MAX_WORDS. */
export function addWords(list, more) {
  const out = (list || []).slice();
  for (const p of more || []) {
    const pair = cleanPair(p);
    if (pair && !out.some(([w, r]) => w === pair[0] && r === pair[1])) out.push(pair);
  }
  return out.slice(-MAX_WORDS);
}

/** A bad `src` or `h` is left out and the record kept: neither is worth a count. */
function cleanSeen(v) {
  if (!isObject(v) || !Number.isInteger(v.n) || v.n < 1) return null;
  if (!DAY.test(v.first) || !DAY.test(v.last)) return null;
  return withPlace({ n: v.n, first: minDay(v.first, v.last), last: maxDay(v.first, v.last), words: addWords([], Array.isArray(v.words) ? v.words : []) }, v);
}

function cleanSaved(v) {
  if (!isObject(v) || !Number.isFinite(v.at) || v.at <= 0) return null;
  if (!Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX) return null;
  if (!DAY.test(v.due) || !isCount(v.reviews) || !isCount(v.lapses)) return null;
  return { at: v.at, box: v.box, due: v.due, reviews: v.reviews, lapses: v.lapses };
}

function cleanMap(raw, clean) {
  const out = {};
  let dropped = 0;
  if (raw === undefined || raw === null) return { out, dropped };
  if (!isObject(raw)) return { out, dropped: 1 };
  for (const [ch, v] of Object.entries(raw)) {
    const ok = oneKanji(ch) ? clean(v) : null;
    if (ok) out[ch] = ok;
    else dropped += 1;
  }
  return { out, dropped };
}

/**
 * A plain data object from whatever was stored. `dropped` counts what was
 * left out; `damaged` says the whole thing was not a store at all. A session
 * that is not read from it starts at `now` (ms), when given; a bad `at` is
 * left out and the session kept.
 */
export function validate(raw, now) {
  const data = emptyData(now);
  if (!isObject(raw)) return { data, dropped: 0, damaged: raw !== null && raw !== undefined };
  const saved = cleanMap(raw.saved, cleanSaved);
  const seen = cleanMap(raw.seen, cleanSeen);
  data.saved = saved.out;
  data.seen = seen.out;
  let dropped = saved.dropped + seen.dropped;
  const s = raw.session;
  if (isObject(s) && isCount(s.id) && Array.isArray(s.counted)) {
    data.session = withPlace(startedAt({ id: s.id, counted: [...new Set(s.counted.filter(oneKanji))].slice(0, MAX_COUNTED) }, s.at), s);
  } else if (s !== undefined) {
    dropped += 1;
  }
  return { data, dropped, damaged: false };
}

// ── Sessions and counting ─────────────────────────────────────────────────

/**
 * A new reading session, begun at `now` (ms): nothing counted in it yet, and
 * the kind of text it reads (SOURCES; typed when not given). No history key
 * until the session's text is remembered.
 */
export function beginSession(data, src, now) {
  data.session = startedAt({ id: data.session.id + 1, counted: [], src: isSource(src) ? src : 'typed' }, now);
  return data.session.id;
}

/** The session's kind of text. A session kept by a page from before sources were kept is typed. */
export function sessionSource(data) {
  return isSource(data.session.src) ? data.session.src : 'typed';
}

/**
 * Point the session at a History key, or at none (null). The key moves while
 * a learner edits the text within one session. Returns whether it changed.
 */
export function setSessionText(data, h) {
  const next = withPlace(data.session, { src: data.session.src, h: h || undefined });
  if (next === data.session) return false;
  data.session = next;
  return true;
}

/**
 * One settled read. `chars` are the text's kanji in order; `words` maps a
 * kanji to the dictionary words it was met in. A kanji not yet counted in
 * this session is counted now; one already counted only learns new words,
 * which is idempotent, so reading the same text twice changes nothing.
 * Either way the kanji takes the session's `src` and `h`, since it was last
 * met in this text, as it now stands: a learner editing the text in one
 * session moves its history key, and the kanji follow it without being
 * counted again. Returns the kanji counted by this call, and whether
 * anything changed.
 */
export function recordReading(data, chars, words, today) {
  const counted = new Set(data.session.counted);
  const place = { src: sessionSource(data), h: data.session.h };
  const fresh = [];
  let learned = 0;
  const wordsOf = (ch) => (words && typeof words.get === 'function' ? words.get(ch) : null) || [];
  for (const ch of new Set(chars || [])) {
    if (!oneKanji(ch)) continue;
    let s = data.seen[ch];
    if (!counted.has(ch)) {
      counted.add(ch);
      fresh.push(ch);
      s = s
        ? { ...s, n: s.n + 1, first: minDay(s.first, today), last: maxDay(s.last, today) }
        : { n: 1, first: today, last: today, words: [] };
    }
    if (!s) continue;           // counted in this session, then cleared away
    const placed = withPlace(s, place);
    const list = addWords(s.words, wordsOf(ch));
    if (placed !== s || list.length !== s.words.length || list.some((p, k) => p !== s.words[k])) learned += 1;
    data.seen[ch] = { ...placed, words: list };
  }
  data.session = { ...data.session, counted: [...counted].slice(0, MAX_COUNTED) };
  return { counted: fresh, changed: fresh.length > 0 || learned > 0 };
}

/**
 * The dictionary word a token is, as [written, reading], or null. An
 * inflected token is stored as its dictionary form: 降っています was met as
 * 降る, read ふる. That reading is the stem's furigana plus the base's own
 * kana, unless the record's readings say the stem changed (来ました is 来る,
 * くる, not きる). A token with no dictionary record (a name, a number read
 * by rule, a guess) is not a dictionary word, and is left out.
 */
export function dictionaryWord(token) {
  if (!token || !token.entry || token.confidence === 'guess') return null;
  const surface = String(token.surface || '');
  const reading = String(token.reading || '');
  if (!hasKanji(surface) || !reading) return null;
  const base = String(token.base || '');
  if (token.kind !== 'inflected' || !base || base === surface) return cleanPair([surface, reading]);

  const s = [...surface];
  const b = [...base];
  let i = 0;
  while (i < s.length && i < b.length && s[i] === b[i]) i += 1;
  const tail = b.slice(i).join('');
  if (!i || hasKanji(tail)) return null;
  let stem = '';
  let at = 0;
  for (const p of Array.isArray(token.furigana) && token.furigana.length ? token.furigana : [{ text: surface }]) {
    if (at >= i) break;
    const chars = [...String(p.text || '')];
    if (at + chars.length <= i) stem += p.ruby || toHira(p.text);
    else if (p.ruby) return null;      // a ruby cannot be cut in two
    else stem += toHira(chars.slice(0, i - at).join(''));
    at += chars.length;
  }
  let read = stem + toHira(tail);
  const listed = Array.isArray(token.entry.r) ? token.entry.r.filter((x) => typeof x === 'string') : [];
  const fits = listed.filter((x) => x.endsWith(toHira(tail)) && x.length > tail.length);
  if (fits.length === 1 && !listed.includes(read)) read = fits[0];
  return cleanPair([base, read]);
}

/** kanji -> the dictionary words of these tokens it appears in, in text order. */
export function wordsByKanji(tokens) {
  const out = new Map();
  for (const token of tokens || []) {
    const pair = dictionaryWord(token);
    if (!pair) continue;
    for (const ch of new Set([...pair[0]].filter(isKanji))) {
      const list = out.get(ch) || [];
      if (!list.some(([w, r]) => w === pair[0] && r === pair[1])) list.push(pair);
      out.set(ch, list);
    }
  }
  return out;
}

// ── Saving and the review schedule ────────────────────────────────────────

/** Saved today, in box 0, due today: a kanji saved is one to review now. */
export function saveKanji(data, ch, now) {
  if (!oneKanji(ch) || data.saved[ch]) return false;
  data.saved[ch] = { at: +now, box: 0, due: dayOf(now), reviews: 0, lapses: 0 };
  return true;
}

export function unsaveKanji(data, ch) {
  if (!data.saved[ch]) return false;
  delete data.saved[ch];
  return true;
}

/** The record after one answer. Got it: one box up. Again: box 1, due tomorrow. */
export function schedule(rec, ok, today) {
  const box = ok ? Math.min(TOP_BOX, rec.box + 1) : 1;
  return {
    ...rec,
    box,
    due: addDays(today, INTERVALS[box]),
    reviews: rec.reviews + 1,
    lapses: rec.lapses + (ok ? 0 : 1),
  };
}

export function isDue(rec, today) {
  return !!rec && rec.due <= today;
}

/** Saved kanji due on `today`: the longest overdue first, then the lower box, then the first saved. */
export function dueList(data, today) {
  return Object.entries(data.saved)
    .filter(([, rec]) => isDue(rec, today))
    .sort(([, a], [, b]) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.box - b.box || a.at - b.at))
    .map(([ch]) => ch);
}

/** The first day after `today` anything is due, and how many are due then, or null. */
export function nextDue(data, today) {
  let day = null;
  let n = 0;
  for (const rec of Object.values(data.saved)) {
    if (rec.due <= today) continue;
    if (day === null || rec.due < day) { day = rec.due; n = 1; } else if (rec.due === day) n += 1;
  }
  return day ? { day, n } : null;
}

/** The kanji met most often that are not saved, most met first. */
export function oftenUnsaved(data, limit = 20) {
  return Object.entries(data.seen)
    .filter(([ch]) => !data.saved[ch])
    .sort(([ca, a], [cb, b]) => b.n - a.n || (a.last < b.last ? 1 : a.last > b.last ? -1 : ca < cb ? -1 : 1))
    .slice(0, limit)
    .map(([ch]) => ch);
}

// ── The store ─────────────────────────────────────────────────────────────

/**
 * The data, kept. Every change writes through at once: a learner who saves a
 * kanji and closes the tab has saved it. A write that fails (private mode,
 * quota) leaves the page working on what it holds, and `writable` says so.
 *
 * `note` is set when what was stored could not be read whole: 'damaged' (none
 * of it) or 'partial' (`dropped` entries left out). The raw value is copied to
 * DAMAGED_KEY first, so the page starting empty never destroys anything.
 */
export function openKanji({ store = createStore({ key: KEY, version: VERSION }), readRaw = () => safeGet(KEY), keepRaw = (s) => safeSet(DAMAGED_KEY, s) } = {}) {
  let data = emptyData();
  let note = null;
  let dropped = 0;
  let writable = true;
  const listeners = new Set();
  // History's saved phrases go in the same backup. History is another store,
  // so the page lends this one the two calls (events-collect.js); a store lent
  // none, as in most tests, exports none and leaves them out of a merge.
  let phrases = null;

  /** `now` (ms) is when a session the store does not hold starts. */
  function load(now) {
    const raw = readRaw();
    const loaded = store.load(null);
    note = null;
    dropped = 0;
    if (raw !== null && raw !== undefined && loaded === null) {
      keepRaw(raw);
      data = emptyData(now);
      note = 'damaged';
      return api;
    }
    const v = validate(loaded, now);
    data = v.data;
    dropped = v.dropped;
    if (v.damaged || v.dropped) {
      if (raw !== null && raw !== undefined) keepRaw(raw);
      note = v.damaged ? 'damaged' : 'partial';
    }
    return api;
  }

  function commit(changed = true) {
    if (!changed) return false;
    writable = store.save(data);
    for (const fn of listeners) fn();
    return true;
  }

  const api = {
    load,
    get data() { return data; },
    get note() { return note; },
    get dropped() { return dropped; },
    get writable() { return writable; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isSaved: (ch) => !!data.saved[ch],
    seenOf: (ch) => data.seen[ch] || null,
    savedOf: (ch) => data.saved[ch] || null,
    get sessionId() { return data.session.id; },
    get sessionSource() { return sessionSource(data); },
    /** When this session began (ms), or null for one an older page began. */
    get sessionAt() { return isTime(data.session.at) ? data.session.at : null; },
    /** Counted for the first time ever in this session: the reader's "New" chip. */
    isNew: (ch) => !!data.seen[ch] && data.seen[ch].n === 1 && data.session.counted.includes(ch),
    beginSession(src, now) { beginSession(data, src, now); return commit(); },
    /**
     * `opts.h`, when given, points the session at that History key first (null
     * for none), so the kanji this read counts point at the text they were met
     * in. One write for both.
     */
    record(chars, words, today, opts) {
      const moved = opts && 'h' in opts ? setSessionText(data, opts.h) : false;
      const r = recordReading(data, chars, words, today);
      commit(r.changed || moved);
      return r.counted;
    },
    save: (ch, now) => commit(saveKanji(data, ch, now)),
    unsave: (ch) => commit(unsaveKanji(data, ch)),
    toggle(ch, now) { return data.saved[ch] ? (api.unsave(ch), false) : (api.save(ch, now), true); },
    answer(ch, ok, today) {
      if (!data.saved[ch]) return null;
      data.saved[ch] = schedule(data.saved[ch], ok, today);
      commit();
      return data.saved[ch];
    },
    due: (today) => dueList(data, today),
    nextDue: (today) => nextDue(data, today),
    often: (limit) => oftenUnsaved(data, limit),
    lendPhrases(calls) { phrases = calls; },
    exportDoc: (today) => exportDoc(data, today, phrases ? phrases.out() : undefined),
    merge(incoming) {
      const sum = mergeInto(data, incoming);
      commit();
      if (phrases && incoming && incoming.phrases) sum.phrases = phrases.merge(incoming.phrases);
      return sum;
    },
    clearAll(now) {
      data = { saved: {}, seen: {}, session: startedAt({ id: data.session.id + 1, counted: [] }, now) };
      note = null;
      return commit();
    },
  };
  return api;
}

let page = null;

/** The page's store, opened on first use. */
export function myKanji() {
  if (!page) page = openKanji().load(Date.now());
  return page;
}
