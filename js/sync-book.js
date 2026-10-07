// What this browser knows about its account: one Persist kit store,
// 'yomu-site:sync' version 1, written once the browser has synced with an
// account, or once the learner has answered which way to sync with one. A
// visitor who never signs in never has one.
//
//   account   the Clerk subject this browser syncs with (the server's
//             whoami, never the browser's own say)
//   pending   'adopt' (Add) or 'replace' (Use) while that answer waits for
//             its first sync; absent once a sync has joined the account
//   joined    when this browser joined that account (ms): now, or one past
//             the account's Clear all when a clock ahead of this one made
//             it; while an answer is pending, when the learner gave it
//             (with Use, a save counted after it is the learner's own in the
//             new account, and the rest stays behind)
//   brought   { kanji: { 天: ms }, phrases: { key: ms } }: each save this
//             browser held when it joined, and when it counts as saved: no
//             earlier than `joined`, and one past the account's removal of
//             that row then (sync.js joinStamps), so a removal or a Clear
//             all the account made before the join does not take it back
//             out. What the join received from the account is not here: it
//             keeps the account's own stamp. An unsave, a new save or a
//             Clear all of the row here drops it (sync-watch.js)
//   epoch     the latest Clear all of My kanji this browser has applied (ms)
//   at        the last sync that finished (ms), for the My kanji line
//   removed   { kanji: { 天: ms }, phrases: { key: ms } }: removals made here
//             and not yet known to have reached the account
//   saves     { kanji: { 天: ms }, phrases: { key: ms } }: when each save
//             made here counts as made, until a push carries it: its own
//             time, or one past a removal or Clear all this browser knows
//             when that is later; and a save brought back by Import (saved
//             now, after any removal known). Kept here because the store
//             cannot keep it: a merge moves the store's save time back to
//             the earliest copy's (sync-watch.js)
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

/** The two answers a book can be waiting on: Add and Use. */
export const PENDING = Object.freeze(['adopt', 'replace']);

/** A book for `account`, joined at `now`: nothing brought or changed yet. */
export function newBook(account, now, prefs, epoch = 0) {
  return {
    account, joined: now, epoch, at: 0,
    brought: { kanji: {}, phrases: {} }, removed: { kanji: {}, phrases: {} }, saves: { kanji: {}, phrases: {} },
    prefsAt: {}, prefsVal: syncedPrefs(prefs),
  };
}

/**
 * The learner's answer to the account question, kept from the moment it is
 * given: a book for the new account, the answer pending until a sync
 * finishes it. What the learner removes, clears or changes before then goes
 * into this book, so the retry carries it to the new account.
 */
export function answeredBook(account, mode, now, prefs) {
  return { ...newBook(account, now, prefs), pending: mode };
}

function cleanMap(raw, keyOk) {
  const out = {};
  if (isObject(raw)) for (const [k, v] of Object.entries(raw)) if (keyOk(k) && isTime(v)) out[k] = v;
  return out;
}

export function cleanBook(raw) {
  if (!isObject(raw) || typeof raw.account !== 'string' || !raw.account || raw.account.length > 200 || !isTime(raw.joined)) return null;
  const brought = isObject(raw.brought) ? raw.brought : {};
  const removed = isObject(raw.removed) ? raw.removed : {};
  const saves = isObject(raw.saves) ? raw.saves : {};
  const prefsAt = {};
  for (const k of PREF_KEYS) if (isObject(raw.prefsAt) && isStamp(raw.prefsAt[k])) prefsAt[k] = raw.prefsAt[k];
  const book = {
    account: raw.account,
    joined: raw.joined,
    epoch: isStamp(raw.epoch) ? raw.epoch : 0,
    at: isStamp(raw.at) ? raw.at : 0,
    brought: { kanji: cleanMap(brought.kanji, oneKanji), phrases: cleanMap(brought.phrases, (k) => HISTORY_KEY.test(k)) },
    removed: { kanji: cleanMap(removed.kanji, oneKanji), phrases: cleanMap(removed.phrases, (k) => HISTORY_KEY.test(k)) },
    saves: { kanji: cleanMap(saves.kanji, oneKanji), phrases: cleanMap(saves.phrases, (k) => HISTORY_KEY.test(k)) },
    prefsAt,
    prefsVal: syncedPrefs(raw.prefsVal),
  };
  if (PENDING.includes(raw.pending)) book.pending = raw.pending;
  return book;
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

/** The removals and save stamps a sync plans with, copied: what pruneCarried may forget once its push is in. */
export function carriedOf(book) {
  const copy = (m) => ({ kanji: { ...m.kanji }, phrases: { ...m.phrases } });
  return { removed: copy(book.removed), saves: copy(book.saves) };
}

/**
 * Forget what a finished sync carried to the account: each removal and save
 * stamp no newer than what the sync had in hand (`carried`, carriedOf(book)
 * when it planned). One made while the sync ran is newer, and stays for the
 * next one. A save stamp can go because the account now holds that save's
 * `s` at least as late, and sync-local.js borrows it from there.
 */
export function pruneCarried(book, carried) {
  for (const part of ['removed', 'saves']) {
    for (const kind of ['kanji', 'phrases']) {
      for (const [id, t] of Object.entries(carried[part][kind] || {})) {
        if (book[part][kind][id] !== undefined && book[part][kind][id] <= t) delete book[part][kind][id];
      }
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
