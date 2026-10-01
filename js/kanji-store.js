// My kanji: the kanji a learner keeps for review, and every kanji they meet.
//
// One Persist kit store, 'yomu-site:kanji' version 1, holding three things:
//
//   saved    { char: { at, box, due, reviews, lapses } }   kept for review
//   seen     { char: { n, first, last, words } }           met in a text
//   session  { id, counted: [char] }                       the text being read
//
// "Times seen" counts texts, not keystrokes. A reading session begins when
// the box gets new content all at once (a paste, an example, a phrase or a
// dialogue, a #t= link, a yomu:load) or after it was emptied, and within one
// session each kanji counts once, whenever its read settles, including a
// kanji typed in later. The session's counted set is kept here, beside the
// counts, so a reload that restores the saved text finds those kanji already
// counted and counts nothing.
//
// What is never kept here: the text, a sentence, or anything longer than a
// dictionary word. `words` holds up to MAX_WORDS [written, reading] pairs per
// kanji, each one a dictionary form the analyzer found, so the review can show
// where a kanji was met without this store ever holding what was pasted.
//
// The functions below are pure over a plain data object and take the date as
// an argument, so tests/kanji-store.test.mjs runs them with no clock and no
// DOM. openKanji() wraps them around the store; myKanji() is the page's one.

import { createStore, safeGet, safeSet } from './neorgon-persist.js';
import { isKanji, hasKanji, toHira } from './kana.js';

export const KEY = 'yomu-site:kanji';
export const VERSION = 1;
/** A store this page could not read is copied here once, never thrown away. */
export const DAMAGED_KEY = `${KEY}:damaged`;
export const EXPORT_FORMAT = 'yomu-kanji-export/1';
export const MAX_WORDS = 8;
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

export function emptyData() {
  return { saved: {}, seen: {}, session: { id: 0, counted: [] } };
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

const minDay = (a, b) => (a <= b ? a : b);
const maxDay = (a, b) => (a >= b ? a : b);

// ── Reading what was kept ─────────────────────────────────────────────────
//
// Nothing saved is trusted: a hand-edited store, a store from a newer page or
// a half-written one is read field by field, and whatever does not fit is
// left out and counted, never assigned onto the page's data.

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (n) => Number.isInteger(n) && n >= 0;

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

function cleanSeen(v) {
  if (!isObject(v) || !Number.isInteger(v.n) || v.n < 1) return null;
  if (!DAY.test(v.first) || !DAY.test(v.last)) return null;
  return { n: v.n, first: minDay(v.first, v.last), last: maxDay(v.first, v.last), words: addWords([], Array.isArray(v.words) ? v.words : []) };
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
 * left out; `damaged` says the whole thing was not a store at all.
 */
export function validate(raw) {
  const data = emptyData();
  if (!isObject(raw)) return { data, dropped: 0, damaged: raw !== null && raw !== undefined };
  const saved = cleanMap(raw.saved, cleanSaved);
  const seen = cleanMap(raw.seen, cleanSeen);
  data.saved = saved.out;
  data.seen = seen.out;
  let dropped = saved.dropped + seen.dropped;
  const s = raw.session;
  if (isObject(s) && isCount(s.id) && Array.isArray(s.counted)) {
    data.session = { id: s.id, counted: [...new Set(s.counted.filter(oneKanji))].slice(0, MAX_COUNTED) };
  } else if (s !== undefined) {
    dropped += 1;
  }
  return { data, dropped, damaged: false };
}

// ── Sessions and counting ─────────────────────────────────────────────────

/** A new reading session: nothing counted in it yet. */
export function beginSession(data) {
  data.session = { id: data.session.id + 1, counted: [] };
  return data.session.id;
}

/**
 * One settled read. `chars` are the text's kanji in order; `words` maps a
 * kanji to the dictionary words it was met in. A kanji not yet counted in
 * this session is counted now; one already counted only learns new words,
 * which is idempotent, so reading the same text twice changes nothing.
 * Returns the kanji counted by this call, and whether anything changed.
 */
export function recordReading(data, chars, words, today) {
  const counted = new Set(data.session.counted);
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
    const list = addWords(s.words, wordsOf(ch));
    if (list.length !== s.words.length || list.some((p, k) => p !== s.words[k])) learned += 1;
    data.seen[ch] = { ...s, words: list };
  }
  data.session = { id: data.session.id, counted: [...counted].slice(0, MAX_COUNTED) };
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

// ── Backup ────────────────────────────────────────────────────────────────

/** What Export writes: the saved and seen maps, never the session. */
export function exportDoc(data, today) {
  return { format: EXPORT_FORMAT, exported: today, site: 'https://yomu.neorgon.com/', saved: data.saved, seen: data.seen };
}

/** The largest backup Import reads; a real one is a few hundred KB at most. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/**
 * Read a backup file's text. { ok: true, data, dropped } or
 * { ok: false, reason: 'json' | 'format' | 'empty' }. The entries go through
 * the same checks as the store itself.
 */
export function parseImport(text) {
  let doc;
  try { doc = JSON.parse(String(text)); } catch { return { ok: false, reason: 'json' }; }
  if (!isObject(doc) || doc.format !== EXPORT_FORMAT) return { ok: false, reason: 'format' };
  const { data, dropped } = validate({ saved: doc.saved, seen: doc.seen });
  if (!Object.keys(data.saved).length && !Object.keys(data.seen).length) return { ok: false, reason: 'empty', dropped };
  return { ok: true, data, dropped };
}

/**
 * Merge an imported backup into `data`. A count keeps the higher number and a
 * first-seen day the earlier, so importing the same file twice, or two
 * devices' files in either order, ends in the same place. Of two schedules
 * for one saved kanji, the one with more reviews behind it wins; the earlier
 * save date is kept.
 */
export function mergeInto(data, incoming) {
  const sum = { savedAdded: 0, savedUpdated: 0, seenAdded: 0, seenUpdated: 0 };
  for (const [ch, b] of Object.entries(incoming.seen || {})) {
    const a = data.seen[ch];
    if (!a) { data.seen[ch] = { ...b, words: b.words.slice() }; sum.seenAdded += 1; continue; }
    const next = { n: Math.max(a.n, b.n), first: minDay(a.first, b.first), last: maxDay(a.last, b.last), words: addWords(a.words, b.words) };
    if (JSON.stringify(next) !== JSON.stringify(a)) sum.seenUpdated += 1;
    data.seen[ch] = next;
  }
  for (const [ch, b] of Object.entries(incoming.saved || {})) {
    const a = data.saved[ch];
    if (!a) { data.saved[ch] = { ...b }; sum.savedAdded += 1; continue; }
    const lead = b.reviews > a.reviews ? b : a;
    const next = { at: Math.min(a.at, b.at), box: lead.box, due: lead.due, reviews: Math.max(a.reviews, b.reviews), lapses: Math.max(a.lapses, b.lapses) };
    if (JSON.stringify(next) !== JSON.stringify(a)) sum.savedUpdated += 1;
    data.saved[ch] = next;
  }
  return sum;
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
    beginSession() { beginSession(data); return commit(); },
    record(chars, words, today) {
      const r = recordReading(data, chars, words, today);
      commit(r.changed);
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
    exportDoc: (today) => exportDoc(data, today),
    merge(incoming) { const sum = mergeInto(data, incoming); commit(); return sum; },
    clearAll() {
      data = { saved: {}, seen: {}, session: { id: data.session.id + 1, counted: [] } };
      note = null;
      return commit();
    },
  };
  return api;
}

let page = null;

/** The page's store, opened on first use. */
export function myKanji() {
  if (!page) page = openKanji().load();
  return page;
}
