// The words a learner saves for review, from the Word panel's bookmark:
// each its dictionary form and reading, its first meaning for the review
// card, and the review schedule a saved kanji has (kanji-store.js
// schedule). Pure functions plus the store, no DOM.
//
// One store, localStorage['yomu-site:words'], Persist kit version 1:
// { saved: { id: { w, r, g, at, box, due, reviews, lapses } } }, `id` the
// cyrb53 of the written form and the reading (wordId), so a key is short and
// ASCII, which sync needs. A dictionary word and its gloss are all it holds:
// no sentence and no pasted text. A store that does not read degrades to
// empty, its raw value copied to `yomu-site:words:damaged` first, as the
// kanji store does.
//
// A review holds kanji and words together (events-kanji.js): a word's place
// in its queue is REVIEW_PREFIX and its id, which no kanji (one character)
// can be.

import { createStore, safeGet, safeSet } from './neorgon-persist.js';
import { cyrb53 } from './history-text.js';
import { cleanGloss, MAX_GLOSS } from './sync-rules.js';
import {
  schedule, isDue, dayOf, isObject, TOP_BOX, myKanji,
} from './kanji-store.js';

export const KEY = 'yomu-site:words';
export const VERSION = 1;
export const DAMAGED_KEY = `${KEY}:damaged`;
/**
 * At most this many words saved here: the next save, or a word Import would
 * add, is refused. What sync brings is kept whole: two devices may each hold
 * their own 2,000, and a cap on what the account sends was applied again on
 * every sync.
 */
export const MAX_SAVED_WORDS = 2000;
/** kanji-words.js MAX_FIELD: a word or a reading longer than this is no dictionary word. */
export const MAX_FIELD = 24;
export { cleanGloss, MAX_GLOSS };
export const REVIEW_PREFIX = 'w:';

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const KANA = /^[ぁ-ゖァ-ヺー]+$/;
const isCount = (n) => Number.isInteger(n) && n >= 0;
const len = (s) => [...s].length;

/** A word's key: the same written form and reading, the same key. */
export function wordId(w, r) {
  return cyrb53(`${w}\u0000${r}`).toString(36);
}

/** A saved word as stored, or null. */
export function cleanWord(v) {
  if (!isObject(v) || typeof v.w !== 'string' || typeof v.r !== 'string') return null;
  if (!v.w || !v.r || len(v.w) > MAX_FIELD || len(v.r) > MAX_FIELD || !KANA.test(v.r)) return null;
  if (!Number.isFinite(v.at) || v.at <= 0 || !Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX) return null;
  if (!DAY.test(v.due) || !isCount(v.reviews) || !isCount(v.lapses)) return null;
  return { w: v.w, r: v.r, g: cleanGloss(v.g), at: v.at, box: v.box, due: v.due, reviews: v.reviews, lapses: v.lapses };
}

/** A plain data object from whatever was stored: `dropped` what was left out, `damaged` not a store at all. */
export function validate(raw) {
  const data = { saved: {} };
  if (!isObject(raw)) return { data, dropped: 0, damaged: raw !== null && raw !== undefined };
  let dropped = 0;
  if (raw.saved !== undefined && !isObject(raw.saved)) return { data, dropped: 1, damaged: false };
  for (const [id, v] of Object.entries(raw.saved || {})) {
    const rec = cleanWord(v);
    if (rec && wordId(rec.w, rec.r) === id) data.saved[id] = rec;
    else dropped += 1;
  }
  return { data, dropped, damaged: false };
}

/** Saved now, in box 0, due today. Returns its id, or null when it was saved already, is no word, or the list is full. */
export function saveWord(data, { w, r, g } = {}, now) {
  const rec = cleanWord({ w, r, g, at: +now, box: 0, due: dayOf(now), reviews: 0, lapses: 0 });
  if (!rec) return null;
  const id = wordId(rec.w, rec.r);
  if (data.saved[id] || Object.keys(data.saved).length >= MAX_SAVED_WORDS) return null;
  data.saved[id] = rec;
  return id;
}

export function unsaveWord(data, id) {
  if (!data.saved[id]) return false;
  delete data.saved[id];
  return true;
}

/** Saved words due on `today`, in the order a saved kanji's are: the longest overdue, the lower box, the first saved. */
export function dueWords(data, today) {
  return Object.entries(data.saved)
    .filter(([, rec]) => isDue(rec, today))
    .sort(([, a], [, b]) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.box - b.box || a.at - b.at))
    .map(([id]) => id);
}

/** The first day after `today` a word is due, and how many then, or null. */
export function nextDueWords(data, today) {
  let day = null;
  let n = 0;
  for (const rec of Object.values(data.saved)) {
    if (rec.due <= today) continue;
    if (day === null || rec.due < day) { day = rec.due; n = 1; } else if (rec.due === day) n += 1;
  }
  return day ? { day, n } : null;
}

/** The saved words, the most recently saved first. */
export function listWords(data) {
  return Object.entries(data.saved).sort(([ia, a], [ib, b]) => b.at - a.at || (ia < ib ? -1 : 1)).map(([id, rec]) => ({ id, ...rec }));
}

/**
 * A backup's words merged in: a word not here is added, one here keeps the
 * schedule with more reviews behind it and the earlier save, as a kanji's
 * does (kanji-backup.js mergeInto). Returns how many were added and updated.
 */
export function mergeWords(data, list) {
  const sum = { added: 0, updated: 0, full: 0 };
  for (const v of Array.isArray(list) ? list : []) {
    const rec = cleanWord(v);
    if (!rec) continue;
    const id = wordId(rec.w, rec.r);
    const had = data.saved[id];
    if (!had) {
      if (Object.keys(data.saved).length >= MAX_SAVED_WORDS) { sum.full += 1; continue; }
      data.saved[id] = rec;
      sum.added += 1;
      continue;
    }
    const lead = rec.reviews > had.reviews ? rec : had;
    const next = { ...lead, g: had.g || rec.g, at: Math.min(had.at, rec.at), lapses: Math.max(had.lapses, rec.lapses) };
    if (JSON.stringify(next) !== JSON.stringify(had)) { data.saved[id] = next; sum.updated += 1; }
  }
  return sum;
}

// ── The store ─────────────────────────────────────────────────────────────

/** The data, kept: every change writes through at once, as the kanji store's does. */
export function openWords({ store = createStore({ key: KEY, version: VERSION }), readRaw = () => safeGet(KEY), keepRaw = (s) => safeSet(DAMAGED_KEY, s) } = {}) {
  let data = { saved: {} };
  let note = null;
  let writable = true;
  const listeners = new Set();
  function commit(changed = true, event = { type: 'change' }) {
    if (!changed) return false;
    writable = store.save(data);
    for (const fn of listeners) fn(event);
    return true;
  }
  const api = {
    load() {
      // As the kanji store: a value the kit cannot read is damaged, and kept
      // aside before anything here could overwrite it; nothing is written
      // until the learner changes something.
      const raw = readRaw();
      const loaded = store.load(null);
      const v = validate(loaded);
      data = v.data;
      const damaged = v.damaged || (raw !== null && raw !== undefined && loaded === null);
      note = damaged ? 'damaged' : v.dropped ? 'partial' : null;
      if (note && raw !== null && raw !== undefined) keepRaw(raw);
      return api;
    },
    get data() { return data; },
    get note() { return note; },
    get writable() { return writable; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isSaved: (w, r) => !!data.saved[wordId(w, r)],
    byId: (id) => data.saved[id] || null,
    get size() { return Object.keys(data.saved).length; },
    list: () => listWords(data),
    save(word, now) {
      const id = saveWord(data, word, now);
      return commit(id !== null, { type: 'save', id, at: +now });
    },
    unsave(id) {
      const rec = data.saved[id];
      return commit(unsaveWord(data, id), { type: 'unsave', id, rec });
    },
    /** Save or unsave; true when it is saved after. A full list refuses and says false. */
    toggle(word, now) {
      const id = wordId(word.w, word.r);
      if (data.saved[id]) { api.unsave(id); return false; }
      return api.save(word, now);
    },
    answer(id, ok, today) {
      if (!data.saved[id]) return null;
      data.saved[id] = schedule(data.saved[id], ok, today);
      commit();
      return data.saved[id];
    },
    due: (today) => dueWords(data, today),
    nextDue: (today) => nextDueWords(data, today),
    exportList: () => listWords(data).map(({ id, ...rec }) => rec),
    /**
     * Import: the event names every word of the backup, changed or not, as
     * the kanji store's does, so each counts as saved now (sync-watch.js): an
     * unchanged word was stamped nowhere, and another device's older unsave
     * then won over the Import.
     */
    merge(list) {
      const sum = mergeWords(data, list);
      const ids = (Array.isArray(list) ? list : []).map((v) => (v && typeof v.w === 'string' && typeof v.r === 'string' ? wordId(v.w, v.r) : null)).filter(Boolean);
      commit(true, { type: 'import', ids });
      return sum;
    },
    /** What sync decided: per id a record, or null to remove it, read through this store's own validation. */
    adopt(changes = {}) {
      const raw = { saved: { ...data.saved } };
      for (const [id, rec] of Object.entries(changes)) { if (rec) raw.saved[id] = rec; else delete raw.saved[id]; }
      data = validate(raw).data;
      return commit(true, { type: 'sync' });
    },
  };
  return api;
}

let page = null;

/** The page's store, opened on first use. */
export function myWords() {
  if (!page) page = openWords().load();
  return page;
}

// ── One review of kanji and words ─────────────────────────────────────────

export const isWordReview = (rid) => typeof rid === 'string' && rid.startsWith(REVIEW_PREFIX);
export const wordOfReview = (rid) => (isWordReview(rid) ? rid.slice(REVIEW_PREFIX.length) : null);

/** Everything due on `today`: the kanji first, then the words, each in its own order. */
export function dueAll(today, kanji = myKanji(), words = myWords()) {
  return [...kanji.due(today), ...words.due(today).map((id) => REVIEW_PREFIX + id)];
}

/** The next day anything is due, kanji or word, and how many then, or null. */
export function nextDueAll(today, kanji = myKanji(), words = myWords()) {
  const a = kanji.nextDue(today);
  const b = words.nextDue(today);
  if (!a || !b) return a || b;
  if (a.day === b.day) return { day: a.day, n: a.n + b.n };
  return a.day < b.day ? a : b;
}

/** Move the schedule of the kanji or word on a review card. */
export function answerAny(rid, ok, today, kanji = myKanji(), words = myWords()) {
  const id = wordOfReview(rid);
  return id === null ? kanji.answer(rid, ok, today) : words.answer(id, ok, today);
}
