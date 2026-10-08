// What this browser knows about its account: one Persist kit store,
// 'yomu-site:sync' version 1, written once a sign-in joins an account (a
// first sign-in, from the moment the kit says who signed in, or the
// learner's answer to the account question), and kept from then on. A
// visitor who never signs in never has one.
//
//   account   the Clerk subject this browser syncs with. A first sign-in's
//             pending join is written for the kit's user id (the same Clerk
//             id) before whoami answers; begin() checks it against whoami,
//             and a join is only ever settled for whoami's subject
//   pending   'first' while a first sign-in has not settled which way it
//             joins (sync.js begin() asks when both sides hold data); then
//             'adopt' (joining as is, or Add) or 'replace' (Use) while that
//             join waits for its first sync; absent once a sync has joined
//             the account
//   joined    when this browser joined that account (ms): when the join was
//             settled (begin() decided it, or the learner answered), or one
//             past the account's Clear all when a clock ahead of this one
//             made it (with Use, the time of the answer, which starts the
//             book afresh: the saves stamped in `saves` since are the
//             learner's own in the account, and the rest stays behind)
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
//   heard     { kanji: { 天: [s, removed] }, phrases: { key: [s, removed] } }:
//             the account's newest save and removal of each row, as this
//             browser last pulled or pushed it (a row with neither is left
//             out), so a removal, a save or a Clear all made after a reload,
//             before the page's first pull, is still stamped past them
//             (sync-watch.js); the account's Clear all is `epoch`
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
/** A first sign-in's join, its way not settled: begin() decides, may ask. */
export const FIRST = 'first';

/** A book for `account`, joined at `now`: nothing brought or changed yet. */
export function newBook(account, now, prefs, epoch = 0) {
  return {
    account, joined: now, epoch, at: 0,
    brought: { kanji: {}, phrases: {} }, removed: { kanji: {}, phrases: {} }, saves: { kanji: {}, phrases: {} },
    heard: { kanji: {}, phrases: {} }, prefsAt: {}, prefsVal: syncedPrefs(prefs),
  };
}

/**
 * A join kept from the moment it is decided: a first sign-in's, or the
 * learner's answer to the account question. A book for the account, the
 * join pending until a sync finishes it. What the learner removes, clears
 * or changes before then goes into this book, so the retry carries it to
 * that account.
 */
export function answeredBook(account, mode, now, prefs) {
  return { ...newBook(account, now, prefs), pending: mode };
}

/**
 * The book an answer writes. A first sign-in still waiting on it (`had`,
 * pending FIRST for this account) keeps what the learner did since signing
 * in when the answer is Add, so it goes to the account with the rest of
 * this browser; Use starts afresh, and what was here stays behind. Any
 * other answer starts a book for the account.
 */
export function answerBook(had, account, mode, now, prefs) {
  if (had && had.account === account && had.pending === FIRST && mode === 'adopt') return { ...had, pending: mode, joined: now };
  return answeredBook(account, mode, now, prefs);
}

/**
 * What a Clear all does with this book, which words its dialog
 * (render-sync.js): 'account' once a join has brought the account's data
 * here, which empties the account on every device; 'joining' while a
 * first sign-in or an Add waits for that data, when only the kanji held
 * here are removed, and reach the account if this browser's data is added
 * (sync-watch.js); 'here' with no book, under a pending Use, and while
 * someone other than the book's account is signed in (`who`, whoami's
 * subject or the kit's id; null signed out): another account's question
 * open or put off, or whoami still out after a switch. Then nothing of it
 * reaches any account: an answer starts a book for the new one, and in the
 * old one's book it would wait for a sign-in to that account after Not now.
 */
export function clearsOf(book, who = null) {
  if (!book || book.pending === 'replace') return 'here';
  if (who !== null && book.account !== who) return 'here';
  return book.pending ? 'joining' : 'account';
}

function cleanMap(raw, keyOk) {
  const out = {};
  if (isObject(raw)) for (const [k, v] of Object.entries(raw)) if (keyOk(k) && isTime(v)) out[k] = v;
  return out;
}

/** A `heard` map: [s, removed] per row, two stamps, at least one a time. */
function cleanHeard(raw, keyOk) {
  const out = {};
  if (!isObject(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (keyOk(k) && Array.isArray(v) && v.length === 2 && v.every(isStamp) && (v[0] > 0 || v[1] > 0)) out[k] = [v[0], v[1]];
  }
  return out;
}

export function cleanBook(raw) {
  if (!isObject(raw) || typeof raw.account !== 'string' || !raw.account || raw.account.length > 200 || !isTime(raw.joined)) return null;
  const brought = isObject(raw.brought) ? raw.brought : {};
  const removed = isObject(raw.removed) ? raw.removed : {};
  const saves = isObject(raw.saves) ? raw.saves : {};
  const heard = isObject(raw.heard) ? raw.heard : {};
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
    heard: { kanji: cleanHeard(heard.kanji, oneKanji), phrases: cleanHeard(heard.phrases, (k) => HISTORY_KEY.test(k)) },
    prefsAt,
    prefsVal: syncedPrefs(raw.prefsVal),
  };
  if (PENDING.includes(raw.pending) || raw.pending === FIRST) book.pending = raw.pending;
  return book;
}

/**
 * The account's rows as a sync left them (`server`: kanji and phrases as
 * Maps of rows), in the shape `heard` keeps: each row's newest save and
 * removal, rows with neither left out.
 */
export function heardFrom(server) {
  const out = { kanji: {}, phrases: {} };
  for (const [ch, row] of server.kanji) {
    const s = row.saved ? row.saved.s : 0;
    if (s > 0 || row.removed > 0) out.kanji[ch] = [s, row.removed];
  }
  for (const [key, row] of server.phrases) {
    const s = row.phrase ? row.phrase.s : 0;
    if (s > 0 || row.removed > 0) out.phrases[key] = [s, row.removed];
  }
  return out;
}

/**
 * The account's newest save (`s`) and removal of one row as the book last
 * heard them; for 'kanji' with no id, the newest save of any kanji (what a
 * Clear all is stamped past). Zeros for a row it never heard of.
 */
export function heardOf(book, kind, id) {
  const map = book.heard[kind];
  if (kind === 'kanji' && (id === null || id === undefined)) {
    let s = 0;
    for (const [t] of Object.values(map)) s = Math.max(s, t);
    return { s, removed: 0 };
  }
  const row = Object.hasOwn(map, id) ? map[id] : null;
  return row ? { s: row[0], removed: row[1] } : { s: 0, removed: 0 };
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
