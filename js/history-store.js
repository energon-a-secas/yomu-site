// History: the texts a learner read, kept only when they asked for it.
//
// One Persist kit store, 'yomu-site:history' version 1, which the page opens
// only while the preference `remember` is 'on' (state.js), and never writes
// otherwise:
//
//   entries  { key: { t, first, last, n, src, s } }   one per text read
//   session  { id, key, before } | null              the text being read now
//
// `key` is textKey(text): a 53-bit hash of the text, normalized, in base36.
// It is the only thing the kanji store (kanji-store.js `h`) keeps about a
// text, which is how a kanji can say the sentence it was last seen in while
// that store stays free of text. `t` is the text as read, clipped to 2,000
// characters; `first` and `last` are timestamps; `n` counts reading sessions;
// `src` is the kind of the latest (kanji-store.js SOURCES); `s` is the
// session that created it.
//
// A reading session is the kanji store's: the same text read again in the
// same session changes nothing, so a reload counts nothing, the same rule My
// kanji keeps. Within a session the text may be edited, so each settled read
// may bring a new key: the entry the edit left behind is deleted when this
// session created it and nobody read it in any other (a draft), and kept
// otherwise. `before` is what the store knew about this text before this
// session read it: the entry as it was, or, for a text never read whole, the
// most recent remembered text it is part of or that is part of it. It is
// kept with the session, so the reader's "You read this before" survives a
// reload of the same session.
//
// The functions below are pure over a plain data object and take the time as
// an argument, so tests/history-store.test.mjs runs them with no clock and no
// DOM. openHistory() wraps them around the store; myHistory() is the page's.

import { createStore, safeGet, safeSet, safeRemove } from './neorgon-persist.js';
import { SOURCES, HISTORY_KEY } from './kanji-store.js';

export const KEY = 'yomu-site:history';
export const VERSION = 1;
/** A store this page could not read is copied here, as My kanji does. Forget all removes it too. */
export const DAMAGED_KEY = `${KEY}:damaged`;
/** The embed contract's cap on a text, applied to what is kept. */
export const MAX_TEXT = 2000;
export const MAX_ENTRIES = 300;
export const MAX_CHARS = 300000;
/** The shortest text a partial match is looked for in, or with: shorter is a word, not a text. */
export const MIN_PARTIAL = 6;

export function emptyHistory() {
  return { entries: {}, session: null };
}

// ── Keys ──────────────────────────────────────────────────────────────────

/** NFKC, every run of whitespace one space, trimmed: what makes two texts the same text. */
export function normalizeText(text) {
  return String(text ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

/**
 * cyrb53, by bryc (github.com/bryc/code, public domain): a fast 53-bit hash
 * with good spread. Not a cryptographic hash and not meant as one; a key
 * only has to tell a learner's few hundred texts apart.
 */
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The key a text is kept under. The same text, however it is spaced, has the same key. */
export function textKey(text) {
  return cyrb53(normalizeText(text)).toString(36);
}

/** At most MAX_TEXT UTF-16 units, never cutting a character in two. */
export function clipText(text) {
  const s = String(text ?? '');
  if (s.length <= MAX_TEXT) return s;
  const cut = s.charCodeAt(MAX_TEXT - 1);
  return s.slice(0, cut >= 0xd800 && cut <= 0xdbff ? MAX_TEXT - 1 : MAX_TEXT);
}

const chars = (s) => [...s].length;

// ── Reading what was kept ─────────────────────────────────────────────────

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isTime = (v) => Number.isFinite(v) && v > 0;
const isCount = (n) => Number.isInteger(n) && n >= 0;

function cleanEntry(key, v) {
  if (!HISTORY_KEY.test(key) || !isObject(v)) return null;
  if (typeof v.t !== 'string' || !v.t.trim() || v.t.length > MAX_TEXT) return null;
  if (!isTime(v.first) || !isTime(v.last) || !Number.isInteger(v.n) || v.n < 1) return null;
  if (!SOURCES.includes(v.src) || !isCount(v.s)) return null;
  // A key that is not its text's key would answer for another text.
  if (textKey(v.t) !== key) return null;
  return { t: v.t, first: Math.min(v.first, v.last), last: Math.max(v.first, v.last), n: v.n, src: v.src, s: v.s };
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
 * The remembered text this one is part of (`inside`), or that is part of it
 * (`holds`), read most recently. This session's own drafts do not count: a
 * text is not "part of a text you read" because it was typed a moment ago.
 */
export function partialMatch(data, norm, sessionId) {
  const long = chars(norm) >= MIN_PARTIAL;
  let best = null;
  for (const e of Object.values(data.entries)) {
    if (e.s === sessionId) continue;
    const other = normOf(e.t);
    if (!other || other === norm) continue;
    let kind = null;
    if (long && other.includes(norm)) kind = 'inside';
    else if (chars(other) >= MIN_PARTIAL && norm.includes(other)) kind = 'holds';
    if (kind && (!best || e.last > best.last)) best = { kind, last: e.last, n: e.n };
  }
  return best ? { partial: best } : null;
}

/** Drop the least recently read entries, never `keep`, until the store is within both caps. */
export function evict(data, keep) {
  let count = Object.keys(data.entries).length;
  let size = Object.values(data.entries).reduce((n, e) => n + e.t.length, 0);
  const gone = [];
  while (count > MAX_ENTRIES || size > MAX_CHARS) {
    let oldest = null;
    for (const [k, e] of Object.entries(data.entries)) {
      if (k !== keep && (oldest === null || e.last < data.entries[oldest].last)) oldest = k;
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
 * One settled read of `text` in reading session `sessionId`, of kind `src`,
 * at `now` (ms). Returns `before`: null, the entry's { n, first, last, src }
 * as it was before this session read it, or { partial: { kind, last, n } }.
 */
export function recordText(data, text, sessionId, src, now) {
  const key = textKey(text);
  const s = data.session;
  if (s && s.id === sessionId && s.key === key) return s.before;
  if (s && s.id === sessionId) {
    const left = data.entries[s.key];
    if (left && left.s === sessionId && left.n === 1) delete data.entries[s.key];
  }
  const kind = SOURCES.includes(src) ? src : 'typed';
  const had = data.entries[key];
  const before = had
    ? { n: had.n, first: had.first, last: had.last, src: had.src }
    : partialMatch(data, normalizeText(text), sessionId);
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

/** Forget every text, keeping only which text this session is on. */
export function forgetAll(data) {
  data.entries = {};
  if (data.session) data.session = { ...data.session, before: null };
}

/** Every entry with its key, the most recently read first. */
export function list(data) {
  return Object.entries(data.entries)
    .map(([key, e]) => ({ key, ...e }))
    .sort((a, b) => b.last - a.last || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The longest last-seen sentence, kanji and ellipses included. */
export const MAX_AROUND = 60;

/**
 * The sentence `ch` was last met in, inside `text`: the sentence holding its
 * last occurrence (sentences end after 。！？!? and at a line break), trimmed,
 * then clipped to MAX_AROUND characters around the kanji with an ellipsis on
 * each side that was cut. Returns { before, ch, after }, so the page can draw
 * the kanji in a <mark>, or null when the text does not hold it.
 */
export function sentenceAround(text, ch) {
  const all = [...String(text ?? '')];
  const at = all.lastIndexOf(ch);
  if (!ch || at < 0) return null;
  const end = (c) => '。！？!?'.includes(c);
  const brk = (c) => c === '\n' || c === '\r';
  let from = at;
  while (from > 0 && !end(all[from - 1]) && !brk(all[from - 1])) from -= 1;
  let to = at + 1;
  while (to < all.length && !brk(all[to]) && !end(all[to - 1])) to += 1;
  let left = all.slice(from, at);
  let right = all.slice(at + 1, to);
  while (left.length && /\s/u.test(left[0])) left.shift();
  while (right.length && /\s/u.test(right[right.length - 1])) right.pop();
  const room = MAX_AROUND - 1;
  if (left.length + right.length > room) {
    let keepLeft = Math.min(left.length, Math.floor(room / 2));
    const keepRight = Math.min(right.length, room - keepLeft);
    keepLeft = Math.min(left.length, room - keepRight);
    const cutLeft = keepLeft < left.length;
    const cutRight = keepRight < right.length;
    left = left.slice(left.length - keepLeft);
    right = right.slice(0, keepRight);
    if (cutLeft) left = ['…', ...left.slice(1)];
    if (cutRight) right = [...right.slice(0, -1), '…'];
  }
  return { before: left.join(''), ch, after: right.join('') };
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

  function commit() {
    writable = store.save(data);
    return true;
  }

  const api = {
    load,
    get data() { return data; },
    get note() { return note; },
    get dropped() { return dropped; },
    get writable() { return writable; },
    get size() { return Object.keys(data.entries).length; },
    entry: (key) => (key && Object.hasOwn(data.entries, key) ? data.entries[key] : null),
    /** The `before` of the text this session is on, if `key` is that text. */
    beforeOf(sessionId, key) {
      const s = data.session;
      return s && s.id === sessionId && s.key === key ? s.before : null;
    },
    record(text, sessionId, src, now) {
      const s = data.session;
      const key = textKey(text);
      if (s && s.id === sessionId && s.key === key) return s.before;
      const before = recordText(data, text, sessionId, src, now);
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
    list: () => list(data),
  };
  return api;
}

let page = null;

/** The page's store, opened on first use. Callers open it only while remembering is on. */
export function myHistory() {
  if (!page) page = openHistory().load();
  return page;
}
