// What this browser knows about its account: one Persist kit store,
// 'yomu-site:sync' version 1, written only once the browser has synced with
// an account. A visitor who never signs in never has one.
//
//   account   the Clerk subject this browser last synced with (the server's
//             whoami, never the browser's own say)
//   joined    when this browser's data joined that account (ms): what it
//             held then counts as saved then, so a removal made in the
//             account before the browser joined does not take it back out;
//             1 when the browser took the account's data instead, since
//             then nothing of its own joined
//   epoch     the latest Clear all of My kanji this browser has applied (ms)
//   at        the last sync that finished (ms), for the My kanji line
//   removed   { kanji: { 天: ms }, phrases: { key: ms } }: removals made here
//             and not yet known to have reached the account
//   prefsAt   { lang: ms, ... }: when each synced preference last changed here
//   prefsVal  { lang: 'es', ... }: its value then, to tell a change from a save
//
// Read field by field, like every store on the page: a value that does not
// fit is left out, and a book that does not read at all is no book, which
// makes the next sign-in a first one (it merges; it never empties anything).

import { createStore } from './neorgon-persist.js';
import { PREFS, PREF_KEYS, HISTORY_KEY, oneKanji } from './sync-rules.js';

export const BOOK_KEY = 'yomu-site:sync';
export const BOOK_VERSION = 1;

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isTime = (v) => Number.isFinite(v) && v > 0;
const isStamp = (v) => Number.isFinite(v) && v >= 0;

/** The synced preferences as they stand, valid ones only. */
export function syncedPrefs(prefs) {
  const out = {};
  for (const k of PREF_KEYS) if (prefs && PREFS[k].includes(prefs[k])) out[k] = prefs[k];
  return out;
}

/** A book for `account`, joined at `now`, with no preference changed yet. */
export function newBook(account, now, prefs, epoch = 0) {
  return { account, joined: now, epoch, at: 0, removed: { kanji: {}, phrases: {} }, prefsAt: {}, prefsVal: syncedPrefs(prefs) };
}

function cleanMap(raw, keyOk) {
  const out = {};
  if (isObject(raw)) for (const [k, v] of Object.entries(raw)) if (keyOk(k) && isTime(v)) out[k] = v;
  return out;
}

export function cleanBook(raw) {
  if (!isObject(raw) || typeof raw.account !== 'string' || !raw.account || raw.account.length > 200 || !isTime(raw.joined)) return null;
  const removed = isObject(raw.removed) ? raw.removed : {};
  const prefsAt = {};
  for (const k of PREF_KEYS) if (isObject(raw.prefsAt) && isStamp(raw.prefsAt[k])) prefsAt[k] = raw.prefsAt[k];
  return {
    account: raw.account,
    joined: raw.joined,
    epoch: isStamp(raw.epoch) ? raw.epoch : 0,
    at: isStamp(raw.at) ? raw.at : 0,
    removed: { kanji: cleanMap(removed.kanji, oneKanji), phrases: cleanMap(removed.phrases, (k) => HISTORY_KEY.test(k)) },
    prefsAt,
    prefsVal: syncedPrefs(raw.prefsVal),
  };
}

/** A removal made here (`kind` is 'kanji' or 'phrases'), kept until a sync carries it. */
export function noteRemoval(book, kind, id, at) {
  book.removed[kind][id] = Math.max(book.removed[kind][id] || 0, at);
}

/** Clear all of My kanji, made here: one tombstone for every kanji, which covers the single ones before it. */
export function noteClear(book, at) {
  book.epoch = Math.max(book.epoch, at);
  for (const [ch, t] of Object.entries(book.removed.kanji)) if (t <= book.epoch) delete book.removed.kanji[ch];
}

/** A preference saved here: stamped only when its value changed, so a save of the same value is no change. */
export function notePrefs(book, prefs, at) {
  let changed = false;
  for (const [k, v] of Object.entries(syncedPrefs(prefs))) {
    if (book.prefsVal[k] === v) continue;
    book.prefsVal[k] = v;
    book.prefsAt[k] = at;
    changed = true;
  }
  return changed;
}

/**
 * Forget the removals a finished sync carried: each one no newer than what
 * the sync had in hand (`carried`, the book's removals when it planned). A
 * removal made while the sync ran is newer, and stays for the next one.
 */
export function pruneRemovals(book, carried) {
  for (const kind of ['kanji', 'phrases']) {
    for (const [id, t] of Object.entries(carried[kind] || {})) {
      if (book.removed[kind][id] !== undefined && book.removed[kind][id] <= t) delete book.removed[kind][id];
    }
  }
}

/**
 * The store. Every read goes to storage, never to a copy in memory: another
 * tab may have written a removal since, and a sync planned on an old copy
 * would bring the removed kanji back.
 */
export function openBook({ store = createStore({ key: BOOK_KEY, version: BOOK_VERSION }) } = {}) {
  return {
    read: () => cleanBook(store.load(null)),
    write: (book) => store.save(book),
    /** Change the book, if there is one: what a removal or a preference does while the browser has an account. */
    update(fn) {
      const book = cleanBook(store.load(null));
      if (!book) return null;
      fn(book);
      store.save(book);
      return book;
    },
  };
}
