// History: the texts a learner read, kept only when they asked for it.
//
// One Persist kit store, 'yomu-site:history' version 1. While the preference
// `remember` is 'on' (state.js) every text read is kept; otherwise the page
// reads the store for the phrases saved on purpose, and writes it only to
// save or unsave one, or to count a saved one read again:
//
//   entries  { key: { t, first, last, n, src, s, saved? } }   one per text read
//   session  { id, key, before } | null                      the text being read now
//
// `key` is textKey(text): a 53-bit hash of the text, normalized, in base36.
// It is the only thing the kanji store (kanji-store.js `h`) keeps about a
// text, which is how a kanji can say the sentence it was last seen in while
// that store stays free of text. `t` is the text as read, clipped to 2,000
// characters; `first` and `last` are timestamps; `n` counts reading sessions;
// `src` is the kind of the latest (kanji-store.js SOURCES); `s` is the
// session that created it. `saved` is when the learner saved the text on
// purpose (the reader's bookmark, or one on a History row), absent otherwise.
//
// A saved text is kept whatever Remember says. It is never evicted (the caps
// count only the texts not saved), Forget all and Turn off keep it, and a
// later read of it is counted even with Remember off; no other text is, then.
// At most MAX_SAVED are saved, and the next one is refused, never swapped in.
// Unsaving with Remember on leaves an ordinary entry; with it off, nothing
// else keeps the text, so it is forgotten.
//
// A reading session is the kanji store's: the same text read again in the
// same session changes nothing, so a reload counts nothing, the same rule My
// kanji keeps. Within a session the text may be edited, so each settled read
// may bring a new key: the entry the edit left behind is deleted when this
// session created it and nobody read it in any other (a draft), and kept
// otherwise. Created in this session takes the id and the start (the kanji
// store's `at`), since a kanji store that starts empty counts its ids from 0
// again; a session whose start is unknown deletes nothing. `before` is what
// the store knew about this text before this session read it: the entry as
// it was, or, for a text never read whole, the most recent remembered text it
// is part of or that is part of it. It is kept with the session, so the
// reader's "You read this before" survives a reload of the same session.
//
// The functions below are pure over a plain data object and take the time as
// an argument, so tests/history-store.test.mjs runs them with no clock and no
// DOM. openHistory() wraps them around the store; myHistory() is the page's.
// What makes two texts the same text, and the sentence a kanji was last seen
// in, are history-text.js.

import { createStore, safeGet, safeSet, safeRemove } from './neorgon-persist.js';
import { SOURCES, HISTORY_KEY } from './kanji-store.js';
import { MAX_TEXT, normalizeText, textKey, clipText } from './history-text.js';

// The text helpers live in history-text.js; every module and test that
// imports them from here still does.
export { MAX_TEXT, MAX_AROUND, normalizeText, cyrb53, textKey, clipText, sentenceAround } from './history-text.js';

export const KEY = 'yomu-site:history';
export const VERSION = 1;
/** A store this page could not read is copied here, as My kanji does. Forget all removes it too. */
export const DAMAGED_KEY = `${KEY}:damaged`;
/** The two caps on the texts not saved. Saved ones count toward neither. */
export const MAX_ENTRIES = 300;
export const MAX_CHARS = 300000;
/** The most phrases saved on purpose. */
export const MAX_SAVED = 500;
/** The shortest text a partial match is looked for in, or with: shorter is a word, not a text. */
export const MIN_PARTIAL = 6;

export function emptyHistory() {
  return { entries: {}, session: null };
}

const chars = (s) => [...s].length;

// ── Reading what was kept ─────────────────────────────────────────────────

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isTime = (v) => Number.isFinite(v) && v > 0;
const isCount = (n) => Number.isInteger(n) && n >= 0;

/** Whether an entry was saved on purpose. */
export const isSaved = (e) => !!e && isTime(e.saved);

/** A bad `saved` drops the flag, never the entry: the text was read either way. */
function cleanEntry(key, v) {
  if (!HISTORY_KEY.test(key) || !isObject(v)) return null;
  if (typeof v.t !== 'string' || !v.t.trim() || v.t.length > MAX_TEXT) return null;
  if (!isTime(v.first) || !isTime(v.last) || !Number.isInteger(v.n) || v.n < 1) return null;
  if (!SOURCES.includes(v.src) || !isCount(v.s)) return null;
  // A key that is not its text's key would answer for another text.
  if (textKey(v.t) !== key) return null;
  const e = { t: v.t, first: Math.min(v.first, v.last), last: Math.max(v.first, v.last), n: v.n, src: v.src, s: v.s };
  if (isTime(v.saved)) e.saved = v.saved;
  return e;
}

/** More than MAX_SAVED saved (a hand edit): the earliest saved keep the flag. */
function capSaved(entries) {
  const saved = Object.entries(entries).filter(([, e]) => isSaved(e));
  if (saved.length <= MAX_SAVED) return;
  saved.sort(([ka, a], [kb, b]) => a.saved - b.saved || (ka < kb ? -1 : 1));
  for (const [k] of saved.slice(MAX_SAVED)) delete entries[k].saved;
}

const KINDS = ['inside', 'holds'];

function cleanBefore(b) {
  if (b === null || b === undefined) return null;
  if (!isObject(b)) return undefined;
  if (isObject(b.partial)) {
    const p = b.partial;
    return KINDS.includes(p.kind) && isTime(p.last) && Number.isInteger(p.n) && p.n >= 1
      ? { partial: { kind: p.kind, last: p.last, n: p.n } } : undefined;
  }
  return Number.isInteger(b.n) && b.n >= 1 && isTime(b.first) && isTime(b.last) && SOURCES.includes(b.src)
    ? { n: b.n, first: b.first, last: b.last, src: b.src } : undefined;
}

/** A plain data object from whatever was stored, as kanji-store.js validate() reads its own. */
export function validate(raw) {
  const data = emptyHistory();
  if (!isObject(raw)) return { data, dropped: 0, damaged: raw !== null && raw !== undefined };
  let dropped = 0;
  if (isObject(raw.entries)) {
    for (const [key, v] of Object.entries(raw.entries)) {
      const ok = cleanEntry(key, v);
      if (ok) data.entries[key] = ok;
      else dropped += 1;
    }
  } else if (raw.entries !== undefined) dropped += 1;
  capSaved(data.entries);
  const s = raw.session;
  if (isObject(s) && isCount(s.id) && HISTORY_KEY.test(s.key) && cleanBefore(s.before) !== undefined) {
    data.session = { id: s.id, key: s.key, before: cleanBefore(s.before) };
  } else if (s !== undefined && s !== null) dropped += 1;
  return { data, dropped, damaged: false };
}

// ── Recording ─────────────────────────────────────────────────────────────

// Each settled read compares the text with every one kept, so their
// normalized forms are kept too, by text, and dropped wholesale when the
// cache outgrows the store: up to 300 texts of 2,000 characters through
// NFKC on every keystroke's read was the slow part.
const normCache = new Map();
function normOf(t) {
  let n = normCache.get(t);
  if (n === undefined) {
    if (normCache.size >= MAX_ENTRIES * 2) normCache.clear();
    n = normalizeText(t);
    normCache.set(t, n);
  }
  return n;
}

/**
 * Whether `e` may have been created in session `id`, begun at `at` (ms): the
 * same id, and not first read before `at` when that is known. An id alone can
 * be an older session's, after a kanji store that started empty.
 */
const madeIn = (e, id, at) => e.s === id && !(isTime(at) && e.first < at);

/**
 * The remembered text this one is part of (`inside`), or that is part of it
 * (`holds`), read most recently. This session's own drafts do not count: a
 * text is not "part of a text you read" because it was typed a moment ago.
 */
export function partialMatch(data, norm, sessionId, sessionAt) {
  const long = chars(norm) >= MIN_PARTIAL;
  let best = null;
  for (const e of Object.values(data.entries)) {
    if (madeIn(e, sessionId, sessionAt)) continue;
    const other = normOf(e.t);
    if (!other || other === norm) continue;
    let kind = null;
    if (long && other.includes(norm)) kind = 'inside';
    else if (chars(other) >= MIN_PARTIAL && norm.includes(other)) kind = 'holds';
    if (kind && (!best || e.last > best.last)) best = { kind, last: e.last, n: e.n };
  }
  return best ? { partial: best } : null;
}

/**
 * Drop the least recently read texts not saved, never `keep`, until those
 * texts are within both caps. A saved text is never dropped and counts
 * toward neither cap.
 */
export function evict(data, keep) {
  const loose = Object.values(data.entries).filter((e) => !isSaved(e));
  let count = loose.length;
  let size = loose.reduce((n, e) => n + e.t.length, 0);
  const gone = [];
  while (count > MAX_ENTRIES || size > MAX_CHARS) {
    let oldest = null;
    for (const [k, e] of Object.entries(data.entries)) {
      if (k !== keep && !isSaved(e) && (oldest === null || e.last < data.entries[oldest].last)) oldest = k;
    }
    if (oldest === null) break;
    size -= data.entries[oldest].t.length;
    count -= 1;
    delete data.entries[oldest];
    gone.push(oldest);
  }
  return gone;
}

/**
 * One settled read of `text` in reading session `sessionId`, begun at
 * `sessionAt` (ms, or null when unknown), of kind `src`, at `now` (ms).
 * Returns `before`: null, the entry's { n, first, last, src } as it was
 * before this session read it, or { partial: { kind, last, n } }.
 * With `remembering` false (Remember off, or not answered yet) only a saved
 * text is counted; any other read changes nothing and returns null.
 */
export function recordText(data, text, sessionId, src, now, remembering = true, sessionAt = null) {
  const key = textKey(text);
  const s = data.session;
  if (s && s.id === sessionId && s.key === key) return s.before;
  const had = data.entries[key];
  if (!remembering && !isSaved(had)) return null;
  if (s && s.id === sessionId) {
    // The draft an edit leaves behind goes, unless it was saved on purpose.
    const left = data.entries[s.key];
    if (left && isTime(sessionAt) && madeIn(left, sessionId, sessionAt) && left.n === 1 && !isSaved(left)) delete data.entries[s.key];
  }
  const kind = SOURCES.includes(src) ? src : 'typed';
  const before = had
    ? { n: had.n, first: had.first, last: had.last, src: had.src }
    : partialMatch(data, normalizeText(text), sessionId, sessionAt);
  data.entries[key] = had
    ? { ...had, t: clipText(text), last: now, n: had.n + 1, src: kind }
    : { t: clipText(text), first: now, last: now, n: 1, src: kind, s: sessionId };
  data.session = { id: sessionId, key, before };
  evict(data, key);
  return before;
}

/** Forget one text. The session keeps its key, so a reload does not bring the text back. */
export function forget(data, key) {
  if (!data.entries[key]) return false;
  delete data.entries[key];
  if (data.session && data.session.key === key) data.session = { ...data.session, before: null };
  return true;
}

/**
 * Forget every text not saved, keeping which text this session is on: what
 * Forget all does, and Turn off when anything is saved. The session's
 * `before` stays only while its text is kept and the before is its own.
 */
export function forgetAll(data) {
  for (const [k, e] of Object.entries(data.entries)) if (!isSaved(e)) delete data.entries[k];
  if (data.session) {
    const b = data.session.before;
    data.session = { ...data.session, before: data.entries[data.session.key] && b && !b.partial ? b : null };
  }
}

const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Every entry with its key, the most recently read first. */
export function list(data) {
  return Object.entries(data.entries)
    .map(([key, e]) => ({ key, ...e }))
    .sort((a, b) => b.last - a.last || byKey(a, b));
}

/** The texts read and not saved, the most recently read first: History's "Texts you read". */
export function unsavedList(data) {
  return list(data).filter((e) => !isSaved(e));
}

/** The saved phrases, the most recently saved first. */
export function savedList(data) {
  return list(data).filter(isSaved).sort((a, b) => b.saved - a.saved || byKey(a, b));
}

export function savedCount(data) {
  let n = 0;
  for (const e of Object.values(data.entries)) if (isSaved(e)) n += 1;
  return n;
}

// ── Saving on purpose ─────────────────────────────────────────────────────

/**
 * Save `text`. A text already kept (Remember on) is marked; one that is not
 * (Remember off, or not answered) becomes an entry of its own, read once,
 * now, in this session, which the session then points at, so a reload of
 * the same session counts nothing again. No other text is recorded.
 * { ok, key, changed }, or { ok: false, reason: 'full' } past MAX_SAVED,
 * with nothing changed.
 */
export function saveText(data, text, sessionId, src, now) {
  const key = textKey(text);
  const had = data.entries[key];
  if (isSaved(had)) return { ok: true, key, changed: false };
  if (savedCount(data) >= MAX_SAVED) return { ok: false, key, reason: 'full' };
  if (had) {
    data.entries[key] = { ...had, saved: now };
  } else {
    data.entries[key] = { t: clipText(text), first: now, last: now, n: 1, src: SOURCES.includes(src) ? src : 'typed', s: sessionId, saved: now };
    data.session = { id: sessionId, key, before: null };
  }
  return { ok: true, key, changed: true };
}

/**
 * Unsave a text. With Remember on it stays, an ordinary entry again, and the
 * caps apply to it from now (never to evict it at once). With Remember off
 * nothing else keeps it, so it is forgotten.
 */
export function unsaveText(data, key, remembering) {
  const e = data.entries[key];
  if (!isSaved(e)) return false;
  if (!remembering) return forget(data, key);
  const { saved, ...rest } = e;
  data.entries[key] = rest;
  evict(data, key);
  return true;
}

// ── Saved phrases in a backup (kanji-backup.js) ───────────────────────────

/** The saved phrases as a backup carries them: never the key, the session or `s`. */
export function phrasesOf(data) {
  return savedList(data).map(({ t, first, last, n, src, saved }) => ({ t, first, last, n, src, saved }));
}

function cleanPhrase(v) {
  if (!isObject(v) || typeof v.t !== 'string' || !v.t.trim() || v.t.length > MAX_TEXT) return null;
  if (!isTime(v.first) || !isTime(v.last) || !Number.isInteger(v.n) || v.n < 1) return null;
  if (!SOURCES.includes(v.src) || !isTime(v.saved)) return null;
  return { t: v.t, first: Math.min(v.first, v.last), last: Math.max(v.first, v.last), n: v.n, src: v.src, saved: v.saved };
}

/**
 * A backup's `phrases`, checked as the store checks an entry: { phrases,
 * dropped }. Absent is none and nothing dropped; anything but an array is
 * one thing dropped; a phrase with no valid `saved` is not a saved phrase.
 */
export function cleanPhrases(raw) {
  if (raw === undefined || raw === null) return { phrases: [], dropped: 0 };
  if (!Array.isArray(raw)) return { phrases: [], dropped: 1 };
  const phrases = [];
  let dropped = 0;
  for (const v of raw) {
    const ok = cleanPhrase(v);
    if (ok) phrases.push(ok);
    else dropped += 1;
  }
  return { phrases, dropped };
}

/**
 * Merge a backup's phrases, as My kanji merges its counts: the higher count,
 * the earlier first read, the later last read (whose kind of text goes with
 * it; on the same instant this browser's stands), the earlier save. A text
 * kept here unsaved becomes saved. Past MAX_SAVED the rest are left out and
 * counted as `full`. The same file twice changes nothing more.
 */
export function mergePhrases(data, phrases) {
  const sum = { added: 0, updated: 0, full: 0 };
  for (const p of phrases || []) {
    const key = textKey(p.t);
    const a = data.entries[key];
    if (!isSaved(a) && savedCount(data) >= MAX_SAVED) { sum.full += 1; continue; }
    if (!a) {
      data.entries[key] = { t: p.t, first: p.first, last: p.last, n: p.n, src: p.src, s: 0, saved: p.saved };
      sum.added += 1;
      continue;
    }
    const next = {
      ...a,
      first: Math.min(a.first, p.first),
      last: Math.max(a.last, p.last),
      n: Math.max(a.n, p.n),
      src: p.last > a.last ? p.src : a.src,
      saved: isSaved(a) ? Math.min(a.saved, p.saved) : p.saved,
    };
    if (JSON.stringify(next) !== JSON.stringify(a)) sum.updated += 1;
    data.entries[key] = next;
  }
  return sum;
}

// ── The store ─────────────────────────────────────────────────────────────

/**
 * The data, kept, with kanji-store.js openKanji()'s rules: every change is
 * written at once, a write that fails leaves the page working on what it
 * holds (`writable`), and a stored value that does not read whole is copied
 * to DAMAGED_KEY before the page starts on what it could read (`note`).
 * erase() removes the store and its damaged copy: what Turn off does.
 */
export function openHistory({
  store = createStore({ key: KEY, version: VERSION }),
  readRaw = () => safeGet(KEY),
  keepRaw = (s) => safeSet(DAMAGED_KEY, s),
  dropRaw = () => safeRemove(DAMAGED_KEY),
} = {}) {
  let data = emptyHistory();
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
      data = emptyHistory();
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

  /** A listener hears { type: 'unsave', key } for a phrase unsaved, { type: 'change' } for the rest. */
  function commit(event = { type: 'change' }) {
    writable = store.save(data);
    for (const fn of listeners) fn(event);
    return true;
  }

  const api = {
    load,
    get data() { return data; },
    get note() { return note; },
    get dropped() { return dropped; },
    get writable() { return writable; },
    get size() { return Object.keys(data.entries).length; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    entry: (key) => (key && Object.hasOwn(data.entries, key) ? data.entries[key] : null),
    /** The `before` of the text this session is on, if `key` is that text. */
    beforeOf(sessionId, key) {
      const s = data.session;
      return s && s.id === sessionId && s.key === key ? s.before : null;
    },
    /** A read; `remembering` false counts a saved text only, and writes nothing otherwise. */
    record(text, sessionId, src, now, remembering = true, sessionAt = null) {
      const s = data.session;
      const key = textKey(text);
      if (s && s.id === sessionId && s.key === key) return s.before;
      if (!remembering && !isSaved(data.entries[key])) return null;
      const before = recordText(data, text, sessionId, src, now, remembering, sessionAt);
      commit();
      return before;
    },
    forget(key) { return forget(data, key) ? commit() : false; },
    forgetAll() { forgetAll(data); note = null; dropRaw(); return commit(); },
    erase() {
      data = emptyHistory();
      note = null;
      dropRaw();
      writable = store.clear();
      return writable;
    },
    /** Turn off: the texts not saved are forgotten; with none saved, the store itself goes. */
    turnOff() { return savedCount(data) ? api.forgetAll() : api.erase(); },
    isSaved: (key) => isSaved(api.entry(key)),
    get savedCount() { return savedCount(data); },
    save(text, sessionId, src, now) {
      const r = saveText(data, text, sessionId, src, now);
      if (r.changed) commit();
      return r;
    },
    unsave(key, remembering) { return unsaveText(data, key, remembering) ? commit({ type: 'unsave', key }) : false; },
    mergePhrases(phrases) {
      const sum = mergePhrases(data, phrases);
      if (sum.added || sum.updated) commit();
      return sum;
    },
    phrases: () => phrasesOf(data),
    list: () => list(data),
    savedList: () => savedList(data),
    unsavedList: () => unsavedList(data),
  };
  return api;
}

let page = null;

/**
 * The page's store, opened on first use. Opening reads; with Remember off it
 * is opened for the saved phrases, and nothing is written but a save, an
 * unsave, or a saved text read again.
 */
export function myHistory() {
  if (!page) page = openHistory().load();
  return page;
}
