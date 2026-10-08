// Two tabs of one browser, signed in to one account: js/account.js twice,
// over the same storage (My kanji, History, Play and the sync book), with
// the real js/sync.js against a fake Convex. A review found that a tab
// whose first sync failed retried the whole join ('adopt', or 'replace'
// after Use) even after the other tab had written this account into the
// book: the new book dropped the other tab's removals not yet pushed, and
// moved `joined` to now, so this browser's saves outranked every removal
// the account received in between. A book that already names the account
// is joined; every sync on it is an ordinary one. An answer to the account
// question is kept in the book as it is given, so a tab that answers
// second, or the page loaded again, finishes that answer.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startAccount } from '../js/account.js';
import { openBook, newBook, BOOK_KEY } from '../js/sync-book.js';
import { openKanji } from '../js/kanji-store.js';
import { openHistory } from '../js/history-store.js';
import { openPlay } from '../js/play-store.js';
import { fakeDb, fakeClient, memoryStore } from './helpers/fake-convex.mjs';
import { device, T } from './helpers/sync-device.mjs';

async function until(ok, what, ms = 10000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}
const listeners = () => {
  const l = {};
  return { addEventListener: (type, fn) => { (l[type] ||= []).push(fn); }, fire(type, ev) { for (const fn of l[type] || []) fn(ev); } };
};

/** One browser's storage, shared by its tabs, and a clock in ms that the test moves. */
function browser() {
  const clock = { t: T(0) };
  return { clock, now: () => clock.t, kanji: memoryStore(), history: memoryStore(), play: memoryStore(), book: memoryStore() };
}
const openKanjiOf = (b) => openKanji({ store: b.kanji, readRaw: () => null, keepRaw: () => {} }).load(b.now());

/**
 * One tab: the page's stores read from the browser's storage, the account
 * against the server as `subject`. `failing.on(name)` makes that call throw
 * as a lost connection does. The debounced push is held in `timers` until
 * the test runs it, the way a tab in the background holds it. `answers`
 * is what the learner picks when this tab asks about another account.
 */
function tab(b, server, subject, failing = { on: () => false }) {
  const auth = new Set();
  let state = { status: 'signed-out', signedIn: false, userId: null, label: '' };
  const NeoAuth = {
    onChange(fn) { auth.add(fn); queueMicrotask(() => fn(state)); return () => auth.delete(fn); },
    start: async () => state,
    convexToken: async () => 'a-token',
    bindConvex() {},
    requireSignIn: async () => true,
  };
  const kanji = openKanjiOf(b);
  const history = openHistory({ store: b.history, readRaw: () => null, keepRaw: () => {}, dropRaw: () => {} }).load();
  const play = openPlay({ store: b.play, readRaw: () => null, keepRaw: () => {} }).load();
  const prefs = { lang: 'en', furigana: true, romaji: 'said', highlights: true, unsaved: 'mark', slow: false, remember: 'ask', translate: 'off' };
  const painted = [];
  const timers = [];
  const answers = [];
  const doc = { ...listeners(), visibilityState: 'visible', querySelector: (s) => (s === 'meta[name="clerk-publishable-key"]' ? { content: 'pk_live_x' } : null) };
  const win = { ...listeners(), navigator: { onLine: true } };
  const account = startAccount({
    doc, win, embed: false,
    importKit: async () => ({ NeoAuth }),
    importClient: async () => ({ ConvexHttpClient: class { constructor() { return fakeClient(server, subject, { fail: (name) => failing.on(name) }); } } }),
    importEngine: async () => import('../js/sync.js'),
    kanji, history, play,
    prefs: { get: () => prefs, set: (c) => Object.assign(prefs, c), onSaved: () => () => {} },
    remembering: () => false,
    books: openBook({ store: b.book }),
    ui: { paint: (s) => painted.push(s), ask: async () => answers.shift() || null, dismiss() {}, refresh() {}, reason: () => 'Sign in.' },
    now: b.now,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer() {},
  });
  return {
    account, kanji, failing, answers, win, doc,
    last: () => painted.at(-1),
    signIn(label = 'Aiko') { state = { status: 'signed-in', signedIn: true, userId: subject, label }; for (const fn of auth) fn(state); },
    /**
     * The storage events of what the other tab wrote: this tab reads My
     * kanji again, as events-kanji.js does, and the account hears the
     * book's (js/account.js).
     */
    reload() { kanji.load(b.now()); win.fire('storage', { key: BOOK_KEY }); },
    /** The held push runs. */
    async push() { for (const fn of timers.splice(0)) fn(); await until(() => painted.at(-1).phase !== 'syncing', 'the push'); },
  };
}

const savedOn = (server, owner) => server.rowsOf(owner).kanji.filter((r) => r.saved).map((r) => r.char).sort();
const bookOf = (b) => JSON.parse(b.book.raw);

/** A browser that never synced, holding 天 and 地; tab 2's first pull fails, then tab 1 signs in and syncs. */
async function firstSignInOneFails() {
  const b = browser();
  const seed = openKanjiOf(b);
  seed.save('天', b.now());
  seed.save('地', b.now());
  b.clock.t = T(10);
  const server = fakeDb();
  const t1 = tab(b, server, 'user_a');
  const t2 = tab(b, server, 'user_a', { on: (name) => name === 'sync:pullKanji' });
  await t1.account.ready;
  await t2.account.ready;
  t2.signIn();
  await until(() => t2.last().phase === 'error', 'tab 2\'s failure');
  // Tab 2 keeps the join it decided, pending (this said "remembered no
  // account" until the join was kept in the book from the moment it is
  // decided), and tab 1 finishes it.
  assert.equal(bookOf(b).account, 'user_a');
  assert.ok(bookOf(b).pending, 'tab 2\'s join waits in the book');
  t1.signIn();
  await until(() => t1.last().phase === 'synced', 'tab 1\'s first sync');
  assert.deepEqual(savedOn(server, 'user_a'), ['地', '天']);
  return { b, server, t1, t2 };
}

test('two tabs, first sign-in: the failed tab\'s retry keeps the unsave the other tab has not pushed yet', async () => {
  const { b, server, t1, t2 } = await firstSignInOneFails();
  const joined = bookOf(b).joined;
  b.clock.t = T(11);
  t1.kanji.unsave('天');                        // tab 1's push is held
  assert.ok(bookOf(b).removed.kanji['天'], 'the removal is in the book');
  t2.reload();
  t2.failing.on = () => false;
  b.clock.t = T(12);
  t2.win.fire('online');
  await until(() => t2.last().phase === 'synced', 'tab 2\'s retry');
  assert.deepEqual(savedOn(server, 'user_a'), ['地'], 'tab 2\'s retry carried tab 1\'s removal');
  assert.equal(bookOf(b).joined, joined, 'the book was not joined again');
  assert.equal(t2.kanji.isSaved('天'), false);
  t1.reload();
  await t1.push();
  assert.deepEqual(savedOn(server, 'user_a'), ['地'], 'and tab 1\'s own push leaves it removed');
  assert.equal(t1.kanji.isSaved('天'), false);
});

test('two tabs, first sign-in: the failed tab shown again an hour later does not undo a removal made on another device since', async () => {
  const { b, server, t2 } = await firstSignInOneFails();
  b.clock.t = T(70);
  const other = device(server, 'user_a', { at: 70 });
  await other.signIn();
  other.kanji.unsave('地');
  await other.sync.flush();
  assert.deepEqual(savedOn(server, 'user_a'), ['天']);
  b.clock.t = T(80);
  t2.failing.on = () => false;
  t2.doc.fire('visibilitychange');
  await until(() => t2.last().phase === 'synced', 'tab 2 shown again');
  assert.deepEqual(savedOn(server, 'user_a'), ['天'], 'the other device\'s removal stands');
  assert.equal(t2.kanji.isSaved('地'), false, 'and reached this browser');
  assert.equal(bookOf(b).joined, T(10), 'joined is still the first join\'s');
});

test('two tabs asked about another account: Use answered in one after Add in the other is an ordinary sync', async () => {
  // The browser last synced with user_a; user_b signs in, and both tabs ask.
  const b = browser();
  const seed = openKanjiOf(b);
  seed.save('月', b.now());
  seed.save('火', b.now());
  b.book.save(newBook('user_a', T(0), {}));
  b.clock.t = T(10);
  const server = fakeDb();
  await fakeClient(server, 'user_b').mutation('sync:push', { kanji: [{ char: '雪', saved: { at: T(1), box: 0, due: '2023-11-14', reviews: 0, lapses: 0, s: T(1) }, removed: 0, seen: null }] });
  const t1 = tab(b, server, 'user_b');
  const t2 = tab(b, server, 'user_b');
  await t1.account.ready;
  await t2.account.ready;
  t2.signIn('Ben');                              // asked, and Not now
  await until(() => t2.last().phase === 'paused', 'tab 2\'s question');
  t1.answers.push('add');
  t1.signIn('Ben');
  await until(() => t1.last().phase === 'synced', 'tab 1\'s Add');
  assert.deepEqual(savedOn(server, 'user_b'), ['月', '火', '雪']);
  b.clock.t = T(11);
  t1.reload();
  t1.kanji.unsave('火');                         // tab 1's push is held
  t2.reload();
  t2.answers.push('use');
  b.clock.t = T(12);
  await t2.account.choose(null);
  await until(() => t2.last().phase === 'synced', 'tab 2\'s Use');
  assert.equal(bookOf(b).account, 'user_b');
  assert.deepEqual(savedOn(server, 'user_b'), ['月', '雪'], 'tab 1\'s removal reached the account');
  assert.ok(t2.kanji.isSaved('月'), 'what tab 1 added stays here: Use did not run twice');
  assert.equal(t2.kanji.isSaved('火'), false);
});

test('two tabs asked about another account: Use answered in one while the other\'s Add waits on a retry finishes the Add', async () => {
  // The first answer is kept in the book as it is given, so a tab that
  // answers second runs as an ordinary sync on it: here, the Add that the
  // other tab's failed pull left pending.
  const b = browser();
  const seed = openKanjiOf(b);
  seed.save('月', b.now());
  b.book.save(newBook('user_a', T(0), {}));
  b.clock.t = T(10);
  const server = fakeDb();
  await fakeClient(server, 'user_b').mutation('sync:push', { kanji: [{ char: '雪', saved: { at: T(1), box: 0, due: '2023-11-14', reviews: 0, lapses: 0, s: T(1) }, removed: 0, seen: null }] });
  const t1 = tab(b, server, 'user_b');
  const t2 = tab(b, server, 'user_b');
  await t1.account.ready;
  await t2.account.ready;
  t1.signIn('Ben');
  t2.signIn('Ben');
  await until(() => t1.last().phase === 'paused' && t2.last().phase === 'paused', 'both questions');
  t1.failing.on = (name) => name === 'sync:pullPhrases';
  t1.answers.push('add');
  await t1.account.choose(null);
  await until(() => t1.last().phase === 'error', 'tab 1\'s Add, failed at its pull');
  assert.equal(bookOf(b).pending, 'adopt');
  b.clock.t = T(11);
  t2.answers.push('use');
  await t2.account.choose(null);
  await until(() => t2.last().phase === 'synced', 'tab 2\'s answer');
  assert.equal(bookOf(b).pending, undefined);
  assert.deepEqual(savedOn(server, 'user_b'), ['月', '雪'], 'the Add was finished: this browser\'s kanji joined');
  t2.reload();
  assert.ok(t2.kanji.isSaved('月'), 'and Use did not take it away');
  t1.failing.on = () => false;
  t1.win.fire('online');
  await until(() => t1.last().phase === 'synced', 'tab 1\'s retry');
  t1.reload();
  assert.deepEqual(Object.keys(t1.kanji.data.saved).sort(), ['月', '雪']);
});

test('an answer whose sync failed is finished by the page loaded again, with what was saved since', async () => {
  const b = browser();
  const seed = openKanjiOf(b);
  seed.save('月', b.now());
  b.book.save(newBook('user_a', T(0), {}));
  b.clock.t = T(10);
  const server = fakeDb();
  await fakeClient(server, 'user_b').mutation('sync:push', { kanji: [{ char: '雪', saved: { at: T(1), box: 0, due: '2023-11-14', reviews: 0, lapses: 0, s: T(1) }, removed: 0, seen: null }] });
  const before = tab(b, server, 'user_b');
  await before.account.ready;
  before.signIn('Ben');
  await until(() => before.last().phase === 'paused', 'the question');
  before.failing.on = (name) => name === 'sync:pullMeta';
  before.answers.push('use');
  await before.account.choose(null);
  await until(() => before.last().phase === 'error', 'Use, failed at its pull');
  b.clock.t = T(11);
  before.kanji.save('星', b.now());
  const after = tab(b, server, 'user_b');           // the page loaded again
  await after.account.ready;
  after.signIn('Ben');
  await until(() => after.last().phase === 'synced', 'the sync after the reload');
  assert.deepEqual(Object.keys(after.kanji.data.saved).sort(), ['星', '雪'], 'Use finished, with the save made since');
  assert.deepEqual(savedOn(server, 'user_b'), ['星', '雪']);
  assert.equal(bookOf(b).pending, undefined);
});

// A tab paints what it says about the book from its own syncs. A review
// found a tab whose first pull failed still saying, after another tab had
// joined the account, that the account keeps its kanji, while a Clear all
// there emptied the account on every device. The book's storage event now
// paints it again from the book.

test('a tab hears the book another tab joined: its line and its Clear all words follow', async () => {
  const b = browser();
  openKanjiOf(b).save('天', b.now());
  b.clock.t = T(10);
  const server = fakeDb();
  await fakeClient(server, 'user_a').mutation('sync:push', { kanji: [{ char: '雪', saved: { at: T(1), box: 0, due: '2023-11-14', reviews: 0, lapses: 0, s: T(1) }, removed: 0, seen: null }] });
  const t1 = tab(b, server, 'user_a');
  const t2 = tab(b, server, 'user_a', { on: (name) => name === 'sync:pullKanji' });
  await t1.account.ready;
  await t2.account.ready;
  t2.signIn();
  await until(() => t2.last().phase === 'error', 'tab 2\'s first pull failing');
  assert.equal(t2.last().clears, 'joining', 'tab 2: only the kanji held here leave the account');
  t1.answers.push('add');
  t1.signIn();
  await until(() => t1.last().phase === 'synced', 'tab 1 joins');
  t2.reload();
  assert.deepEqual(Object.keys(t2.kanji.data.saved).sort(), ['天', '雪']);
  assert.equal(t2.last().clears, 'account', 'tab 2 now says the account empties');
  assert.equal(t2.last().synced, true);
  assert.equal(t2.last().at, bookOf(b).at, 'and when it last synced');
  b.clock.t = T(11);
  t2.kanji.clearAll(b.now());
  t2.failing.on = () => false;
  await t2.push();
  await until(() => t2.last().phase === 'synced', 'tab 2 synced');
  assert.equal(server.rowsOf('user_a').clears.length, 1, 'which its Clear all did');
});
