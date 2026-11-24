// Sync for a client that is not a page: the iOS app, which runs this code in
// a bare JavaScript engine through its bridge (yomu-ios bridge/entry.js).
// js/account.js and js/sync.js take everything they need as arguments; this
// file builds those arguments from documents, callbacks and a clock, where a
// page has storage, a DOM, the Auth Kit and Convex's client. No rule lives
// here: the joins are js/sync-rules.js, the plan js/sync-local.js, the
// stamps js/sync-watch.js and the steps js/account.js, and the host runs
// them as they are.
//
// No DOM, no localStorage, no timer of its own, and no import of Clerk,
// Convex, esm.sh or the sync client: the host hands over js/sync.js itself
// (`engine`), as a page imports it only once someone signs in, so the rule
// tests/sync-account.test.mjs keeps for every module holds here too.
// tests/sync-host.test.mjs runs it under plain node beside browser-shaped
// devices, against the real server handlers.

import { startAccount } from './account.js';
import { openBook } from './sync-book.js';
import { PREF_KEYS } from './sync-rules.js';

/**
 * A store's storage over one document the host keeps (its file). It is what
 * neorgon-persist.js createStore() is to a page: load, save, clear.
 * `wrote(document)` hears every save and every clear (null), so the host
 * writes its file then. The document is handed over, not copied: a store
 * rebuilds what it loads and owns what it saves. `put(document)` is the host
 * having read its file again (a restored backup): what the store loads
 * next, with no write heard, since the file already holds it.
 */
export function documentStore(initial = null, wrote = () => {}) {
  let doc = initial === undefined ? null : initial;
  return {
    load: (fallback = null) => (doc === null ? fallback : doc),
    save(data) { doc = data; wrote(doc); return true; },
    clear() { doc = null; wrote(null); return true; },
    put(next) { doc = next === undefined ? null : next; },
    get document() { return doc; },
  };
}

/**
 * The display preferences of a client that keeps its own settings. It holds
 * the account's six values as sync hands them over and gives them back
 * unchanged, so the account's row passes through this device untouched; it
 * never saves one of its own, so nothing here is ever stamped as a change.
 * `wrote(values)` hears what sync set, for the host to keep.
 */
export function prefsMirror(initial = null, wrote = () => {}) {
  const values = {};
  for (const k of PREF_KEYS) if (initial && Object.hasOwn(initial, k)) values[k] = initial[k];
  return {
    get: () => values,
    set(changes) {
      for (const k of PREF_KEYS) if (changes && Object.hasOwn(changes, k)) values[k] = changes[k];
      wrote({ ...values });
    },
    onSaved: () => () => {},
  };
}

export const signedOut = () => ({ status: 'signed-out', signedIn: false, userId: null, label: '' });
export const signedInAs = (userId, label = '') => ({ status: 'signed-in', signedIn: true, userId, label });

/**
 * The Auth Kit as js/account.js uses it, for a host that signs in by itself
 * (Clerk's iOS SDK). `become(state)` is the host saying who is signed in
 * now; `token()` answers whether a Convex token can be had (the host's
 * transport fetches a fresh one for every call, so none is kept here);
 * `signIn()` opens the host's own sign-in.
 */
export function hostKit({ state = signedOut(), token = async () => null, signIn = async () => false } = {}) {
  const listeners = new Set();
  let now = state;
  const NeoAuth = {
    onChange(fn) { listeners.add(fn); Promise.resolve().then(() => fn(now)); return () => listeners.delete(fn); },
    start: async () => now,
    convexToken: () => token(),
    bindConvex() {},
    requireSignIn: (opts) => signIn(opts),
  };
  return {
    NeoAuth,
    become(next) { now = next; for (const fn of listeners) fn(next); },
    get state() { return now; },
  };
}

/**
 * Convex's client as js/account.js loads it: every query and mutation goes
 * to the host's `transport(kind, name, args, url)`, which answers with the
 * function's value or throws. A lost connection is a TypeError, as fetch's
 * is (js/account.js failureKind reads 'offline' from that); anything the
 * deployment says goes into the error's message as it came, since
 * js/sync.js isMissingFunction reads it.
 */
export function clientModule(transport) {
  return {
    ConvexHttpClient: class {
      constructor(url) { this.url = url; }
      setAuth() {}
      query(name, args) { return transport('query', name, args, this.url); }
      mutation(name, args) { return transport('mutation', name, args, this.url); }
    },
  };
}

/**
 * What a page is to js/account.js, with no page: the meta that names the
 * Clerk key, and the two events a host can tell of. `shown(true)` is the
 * app coming to the front and `shown(false)` its leaving, what
 * visibilitychange is to a tab; `online(true)` is the network coming back.
 * No storage event: one process owns the book.
 */
export function pageless(key) {
  const heard = { doc: {}, win: {} };
  const listen = (side) => (type, fn) => { (heard[side][type] ||= []).push(fn); };
  const doc = {
    visibilityState: 'visible',
    querySelector: (sel) => (sel === 'meta[name="clerk-publishable-key"]' && key ? { content: key } : null),
    addEventListener: listen('doc'),
  };
  const win = { navigator: { onLine: true }, addEventListener: listen('win') };
  return {
    doc,
    win,
    shown(visible) {
      doc.visibilityState = visible ? 'visible' : 'hidden';
      for (const fn of heard.doc.visibilitychange || []) fn();
    },
    online(is) {
      win.navigator.onLine = !!is;
      if (is) for (const fn of heard.win.online || []) fn();
    },
  };
}

/**
 * Accounts and sync for a host. `kanji`, `words` and `play` are the stores
 * (openKanji, openWords, openPlay over documentStore()), `phrases` the
 * phrase book (js/phrase-book.js, which speaks History's part), `prefs` a
 * prefsMirror(), `book` a documentStore() for the sync book, `kit` a
 * hostKit(), `transport` as clientModule() takes it, `engine` the module
 * js/sync.js (the host imports it; this file never does), `ui` as
 * js/account.js says ({ paint, ask, dismiss, refresh, reason }), and `now`,
 * `setTimer` and `clearTimer` the host's clock and timers.
 *
 * Returns { account, shown, online }: `account` is startAccount()'s
 * ({ ready, signIn, choose, status }), or null with no key.
 */
export function startHost({ key, kit, transport, engine, kanji, words = null, phrases, play, prefs, remembering = () => true, book, ui, now, setTimer, clearTimer }) {
  const page = pageless(key);
  const account = startAccount({
    doc: page.doc,
    win: page.win,
    embed: false,
    importKit: async () => kit,
    importClient: async () => clientModule(transport),
    importEngine: async () => engine,
    kanji,
    history: phrases,
    play,
    words,
    prefs,
    remembering,
    books: openBook({ store: book }),
    ui,
    now,
    setTimer,
    clearTimer,
  });
  return { account, shown: page.shown, online: page.online };
}
