// js/account.js, the page's sign-in and sync, under plain node with fakes for
// the document, the Auth Kit and the Convex client. What it holds: an
// anonymous visit imports nothing that talks to Clerk, Convex or esm.sh; an
// embed and a page with no key import nothing at all; another account is
// asked about before anything moves; a failure is said on the line and
// leaves the stores alone. And the page's CSP lets through exactly what the
// code fetches.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startAccount, accountsWanted, CONVEX_URL, CONVEX_CLIENT } from '../js/account.js';
import { openBook, newBook } from '../js/sync-book.js';
import { openKanji } from '../js/kanji-store.js';
import { openHistory } from '../js/history-store.js';
import { openPlay } from '../js/play-store.js';
import { fakeDb, fakeClient, memoryStore } from './helpers/fake-convex.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'pk_live_Y2xlcmsubmVvcmdvbi5jb20k';
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 20; i += 1) await tick(); }
/**
 * Wait for what the test is about, not for a number of ticks: signing in
 * imports js/sync.js for real, which under the whole suite's load can take
 * longer than any fixed count (one run failed that way).
 */
async function until(ok, what, ms = 10000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

function fakeDoc(key) {
  const listeners = {};
  return {
    visibilityState: 'visible',
    querySelector: (sel) => (sel === 'meta[name="clerk-publishable-key"]' && key ? { content: key } : null),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    fire(type) { for (const fn of listeners[type] || []) fn(); },
  };
}

function fakeKit(first) {
  const listeners = new Set();
  let now = first;
  const NeoAuth = {
    onChange(fn) { listeners.add(fn); queueMicrotask(() => fn(now)); return () => listeners.delete(fn); },
    start: async () => now,
    convexToken: async () => (now.signedIn ? 'a-token' : null),
    bindConvex() {},
    requireSignIn: async () => true,
  };
  return { NeoAuth, become(s) { now = s; for (const fn of listeners) fn(s); } };
}
const SIGNED_OUT = { status: 'signed-out', signedIn: false, userId: null, label: '' };
const signedIn = (userId, label = 'Aiko') => ({ status: 'signed-in', signedIn: true, userId, label });

function fakeWin() {
  const listeners = {};
  return {
    navigator: { onLine: true },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    fire(type) { for (const fn of listeners[type] || []) fn(); },
  };
}

/**
 * The page, with fakes. `fail(name)` true makes that call throw as a lost
 * connection does, and the test may swap it later (`failing.on`);
 * `answer(name, args)` returning something answers that call in the
 * server's place; `clientFails` makes loading the Convex client throw that
 * many times first. An answer queued in `answers` is what the learner
 * chooses; `held` keeps the question open until the test settles it.
 */
function page({ key = KEY, embed = false, kit = fakeKit(SIGNED_OUT), server = fakeDb(), subject = 'user_a', fail, answer, book, clientFails = 0 } = {}) {
  const imported = [];
  const painted = [];
  const asked = [];
  const dismissed = [];
  const bookStore = memoryStore();
  if (book) bookStore.save(book);
  const kanji = openKanji({ store: memoryStore(), readRaw: () => null, keepRaw: () => {} }).load(1);
  const history = openHistory({ store: memoryStore(), readRaw: () => null, keepRaw: () => {}, dropRaw: () => {} }).load();
  const play = openPlay({ store: memoryStore(), readRaw: () => null, keepRaw: () => {} }).load();
  const prefs = { lang: 'en', furigana: true, romaji: 'said', highlights: true, unsaved: 'mark', slow: false, remember: 'ask', translate: 'off' };
  const doc = fakeDoc(key);
  const win = fakeWin();
  const answers = [];
  const failing = { on: fail || (() => false), answer: answer || (() => undefined), client: clientFails };
  const held = { open: null };
  let clients = 0;
  const account = startAccount({
    doc, win, embed,
    importKit: async () => { imported.push('kit'); return kit; },
    importClient: async () => {
      imported.push('convex');
      if (failing.client > 0) { failing.client -= 1; throw new TypeError('Failed to fetch dynamically imported module'); }
      return {
        ConvexHttpClient: class {
          constructor(url) {
            assert.equal(url, CONVEX_URL);
            clients += 1;
            const base = fakeClient(server, subject, { fail: (...a) => failing.on(...a) });
            const call = (kind) => async (name, args) => { const r = failing.answer(name, args); return r === undefined ? base[kind](name, args) : r; };
            return { ...base, query: call('query'), mutation: call('mutation') };
          }
        },
      };
    },
    importEngine: async () => { imported.push('engine'); return import('../js/sync.js'); },
    kanji, history, play,
    prefs: { get: () => prefs, set: (c) => Object.assign(prefs, c), onSaved: () => () => {} },
    remembering: () => prefs.remember === 'on',
    books: openBook({ store: bookStore }),
    ui: {
      paint: (s) => painted.push(s),
      ask: (info) => {
        asked.push(info);
        if (answers.length) return Promise.resolve(answers.shift());
        if (!held.on) return Promise.resolve(null);
        return new Promise((resolve) => { held.open = resolve; });
      },
      dismiss() { dismissed.push(true); if (held.open) { const done = held.open; held.open = null; done(null); } },
      refresh() {},
      reason: () => 'Sign in to keep your kanji.',
    },
    now: () => 1_759_800_000_000,
    setTimer: (fn) => { fn(); return 1; },
    clearTimer() {},
  });
  return {
    account, imported, painted, asked, answers, bookStore, kanji, history, kit, server, doc, win, failing, held, dismissed,
    get clients() { return clients; },
    last: () => painted.at(-1),
  };
}

test('no key, or an embed: nothing is imported, nothing is drawn, nothing is stored', async () => {
  for (const opts of [{ key: '' }, { embed: true }]) {
    const p = page(opts);
    assert.equal(p.account, null);
    await settle();
    assert.deepEqual(p.imported, []);
    assert.deepEqual(p.painted, []);
    assert.equal(p.bookStore.raw, null);
  }
  assert.equal(accountsWanted(fakeDoc(KEY), false), true);
  assert.equal(accountsWanted(fakeDoc(KEY), true), false, 'an embedded frame never starts the kit');
});

test('an anonymous visit loads the kit and nothing else: no Convex client, no sync, no account stored', async () => {
  const p = page();
  await p.account.ready;
  await settle();
  assert.deepEqual(p.imported, ['kit']);
  assert.equal(p.last().available, true);
  assert.equal(p.last().signedIn, false);
  p.kanji.save('天', 2);
  p.kanji.unsave('天');
  await settle();
  assert.equal(p.bookStore.raw, null, 'a browser that never synced keeps no book, even of a removal');
  assert.deepEqual(p.imported, ['kit']);
});

test('signing in imports the Convex client and sync, and merges this browser into the account', async () => {
  const p = page();
  p.kanji.save('天', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'synced', 'the first sync');
  assert.deepEqual(p.imported, ['kit', 'convex', 'engine']);
  assert.equal(p.last().phase, 'synced');
  assert.equal(p.last().label, 'Aiko');
  assert.ok(p.server.rowsOf('user_a').kanji.find((r) => r.char === '天'));
  // Signing out stops, and keeps everything here.
  p.kit.become(SIGNED_OUT);
  await until(() => p.last().signedIn === false, 'signing out');
  assert.ok(p.kanji.isSaved('天'));
  assert.equal(JSON.parse(p.bookStore.raw).account, 'user_a', 'the account this browser synced with is remembered');
});

test('another account signing in is asked about first, and nothing moves until it answers', async () => {
  const p = page({ subject: 'user_b', book: newBook('user_a', 1, {}) });
  p.kanji.save('月', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_b', 'Ben'));
  await until(() => p.asked.length === 1 && p.last().phase === 'paused', 'the question');
  assert.equal(p.asked[0].label, 'Ben');
  assert.deepEqual(p.asked[0].counts, { account: { kanji: 0, phrases: 0 }, here: { kanji: 1, phrases: 0 } });
  assert.equal(p.last().phase, 'paused', 'Not now leaves sync paused');
  assert.deepEqual(p.server.rowsOf('user_b').kanji, []);
  p.answers.push('add');
  await p.account.choose(null);
  await until(() => p.last().phase === 'synced', 'the sync after Add');
  assert.ok(p.server.rowsOf('user_b').kanji.find((r) => r.char === '月'));
});

test('a failure is said on the line once, as offline or as the server\'s error, and the stores stay as they were', async () => {
  const p = page({ fail: (name) => name === 'sync:pullKanji' });
  p.kanji.save('天', 2);
  const before = JSON.stringify(p.kanji.data);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'error', 'the failure');
  assert.equal(p.last().error.kind, 'offline');
  assert.equal(JSON.stringify(p.kanji.data), before);
});

test('no module imports the kit, the sync client or esm.sh at its top: only inside the guard', () => {
  const js = join(SITE, 'js');
  const staticImport = /^\s*import\s[^;]*?from\s*'([^']+)'/gm;
  for (const file of readdirSync(js).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(join(js, file), 'utf8');
    for (const m of src.matchAll(staticImport)) {
      assert.ok(!/neorgon-auth\.js$|\/sync\.js$|^\.\/sync\.js$|events-sync\.js$|esm\.sh/.test(m[1]), `${file} imports ${m[1]} at its top`);
    }
  }
  const app = readFileSync(join(js, 'app.js'), 'utf8');
  assert.match(app, /import\('\.\/events-sync\.js'\)/, 'app.js imports sign-in dynamically');
  assert.ok(app.indexOf("import('./events-sync.js')") > app.indexOf('if (state.embed)'), 'and only after an embed has returned');
});

test('the CSP allows the Convex deployment and the pinned client the code uses, and the pin is package.json\'s', () => {
  const html = readFileSync(join(SITE, 'index.html'), 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const dir = (name) => (csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name) || []).slice(1);
  assert.ok(dir('connect-src').includes(CONVEX_URL), `connect-src lacks ${CONVEX_URL}`);
  const pin = CONVEX_CLIENT.match(/^(https:\/\/esm\.sh\/convex@[\d.]+\/)browser$/);
  assert.ok(pin && dir('script-src').includes(pin[1]), 'script-src lacks the pinned client path');
  assert.ok(!dir('script-src').includes('https://esm.sh'), 'never the whole of esm.sh');
  const pkg = JSON.parse(readFileSync(join(SITE, 'package.json'), 'utf8'));
  assert.equal(pin[1].match(/@([\d.]+)\//)[1], pkg.dependencies.convex.replace(/^\^/, ''));
  assert.match(html, /<meta name="clerk-publishable-key" content="pk_live_/);
  assert.match(html, /<div class="neo-auth" data-neo-auth data-keep-mobile hidden><\/div>\s*(<!--[^>]*-->\s*)?<a class="header-home"/);
});

// ── Retries run the step that failed ──────────────────────────────────────
//
// Every retry used to be an ordinary sync, which js/sync.js refuses until a
// sync has written the account into the book: a first sign-in that failed
// once never recovered without a reload, and the account question was never
// asked. Each test fails one step once, then lets the server answer.

const offline = (name) => (call) => call === name;

test('a first sign-in whose pull fails once completes on the online event, with nothing lost', async () => {
  const p = page({ fail: offline('sync:pullKanji') });
  p.kanji.save('天', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'error', 'the failure');
  assert.equal(p.bookStore.raw, null, 'a first sign-in that failed remembers no account');
  p.failing.on = () => false;
  p.win.fire('online');
  await until(() => p.last().phase === 'synced', 'the retry');
  assert.ok(p.server.rowsOf('user_a').kanji.find((r) => r.char === '天'), 'this browser\'s kanji reached the account');
  assert.equal(JSON.parse(p.bookStore.raw).account, 'user_a');
  // From here a change is an ordinary push.
  p.kanji.save('雨', 3);
  await until(() => p.server.rowsOf('user_a').kanji.length === 2, 'the push after a change');
  assert.equal(p.last().phase, 'synced');
});

test('a first sign-in that fails once is retried by the next change too, and by the page shown again', async () => {
  for (const retry of ['change', 'visible']) {
    const p = page({ fail: offline('sync:pullMeta') });
    p.kanji.save('天', 2);
    await p.account.ready;
    p.kit.become(signedIn('user_a'));
    await until(() => p.last().phase === 'error', 'the failure');
    p.failing.on = () => false;
    if (retry === 'change') p.kanji.save('雪', 3);
    else p.doc.fire('visibilitychange');
    await until(() => p.last().phase === 'synced', `the retry on ${retry}`);
    assert.ok(p.server.rowsOf('user_a').kanji.find((r) => r.char === '天'), retry);
  }
});

test('whoami failing once (offline at sign-in): the retry asks the server again and syncs', async () => {
  const p = page({ fail: offline('sync:whoami') });
  p.kanji.save('天', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'error', 'the failure');
  p.failing.on = () => false;
  p.win.fire('online');
  await until(() => p.last().phase === 'synced', 'the retry');
  assert.ok(p.server.rowsOf('user_a').kanji.find((r) => r.char === '天'));
});

test('the Convex client failing to load is retried: a later attempt loads it and syncs', async () => {
  const p = page({ clientFails: 1 });
  p.kanji.save('天', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'error', 'the failure');
  assert.equal(p.last().error.kind, 'offline');
  p.win.fire('online');
  await until(() => p.last().phase === 'synced', 'the retry');
  assert.equal(p.clients, 1, 'one client, made once it loaded');
  assert.ok(p.server.rowsOf('user_a').kanji.find((r) => r.char === '天'));
});

test('another account: the pull behind the question fails once, and the retry asks it, merging nothing first', async () => {
  const p = page({ subject: 'user_b', book: newBook('user_a', 1, {}), fail: offline('sync:pullKanji') });
  p.kanji.save('月', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_b', 'Ben'));
  await until(() => p.last().phase === 'error', 'the failure');
  assert.equal(p.asked.length, 0);
  p.failing.on = () => false;
  p.win.fire('online');
  await until(() => p.asked.length === 1 && p.last().phase === 'paused', 'the question');
  assert.equal(p.last().error, null, 'the line no longer says the pull failed');
  assert.deepEqual(p.server.rowsOf('user_b').kanji, [], 'never merged without an answer');
  assert.equal(JSON.parse(p.bookStore.raw).account, 'user_a', 'the book still names the old account');
});

test('a sync after Add that fails once is retried as Add, not as an ordinary sync', async () => {
  const p = page({ subject: 'user_b', book: newBook('user_a', 1, {}) });
  p.kanji.save('月', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_b', 'Ben'));
  await until(() => p.asked.length === 1 && p.last().phase === 'paused', 'the question');
  p.failing.on = offline('sync:pullPhrases');
  p.answers.push('add');
  await p.account.choose(null);
  await until(() => p.last().phase === 'error', 'the failure after Add');
  const asked = p.asked.length;     // the first question (Not now) and Choose's
  assert.equal(JSON.parse(p.bookStore.raw).account, 'user_a', 'nothing was decided for the new account yet');
  p.failing.on = () => false;
  p.win.fire('online');
  await until(() => p.last().phase === 'synced', 'the retry');
  assert.equal(p.asked.length, asked, 'the answer is not asked for again');
  assert.equal(JSON.parse(p.bookStore.raw).account, 'user_b');
  assert.ok(p.server.rowsOf('user_b').kanji.find((r) => r.char === '月'), 'Add brought this browser\'s kanji in');
});

test('a sync after Use that fails once is retried as Use: this browser ends with the account\'s data only', async () => {
  const server = fakeDb();
  await fakeClient(server, 'user_b').mutation('sync:push', { kanji: [{ char: '雪', saved: { at: 5, box: 0, due: '2026-10-07', reviews: 0, lapses: 0, s: 5 }, removed: 0, seen: null }] });
  const p = page({ server, subject: 'user_b', book: newBook('user_a', 1, {}) });
  p.kanji.save('月', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_b', 'Ben'));
  await until(() => p.asked.length === 1 && p.last().phase === 'paused', 'the question');
  p.failing.on = offline('sync:pullMeta');
  p.answers.push('use');
  await p.account.choose(null);
  await until(() => p.last().phase === 'error', 'the failure after Use');
  assert.ok(p.kanji.isSaved('月'), 'a failed Use changes nothing here');
  p.failing.on = () => false;
  p.win.fire('online');
  await until(() => p.last().phase === 'synced', 'the retry');
  assert.ok(p.kanji.isSaved('雪'));
  assert.ok(!p.kanji.isSaved('月'), 'Use replaced this browser\'s data');
  assert.ok(!p.server.rowsOf('user_b').kanji.find((r) => r.char === '月'), 'and brought none of it in');
});

test('a push that fails after the pull wrote the book is finished by an ordinary sync', async () => {
  const p = page({ fail: (name) => name === 'sync:push' });
  p.kanji.save('天', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'error', 'the failure');
  assert.equal(JSON.parse(p.bookStore.raw).account, 'user_a', 'the merge and the account are kept');
  p.failing.on = () => false;
  p.win.fire('online');
  await until(() => p.last().phase === 'synced', 'the retry');
  assert.ok(p.server.rowsOf('user_a').kanji.find((r) => r.char === '天'));
});

// ── What the line says about a failure ────────────────────────────────────

test('a failure is a plain sentence in both languages, never a code or a Convex request id', async () => {
  const { lineParts } = await import('../js/render-sync.js');
  const { useLang } = await import('../js/strings.js');
  const convexError = new Error('[CONVEX Q(sync:pullKanji)] [Request ID: 5f1c0a7e2b9d4c11] Server Error');
  const cases = [
    { kind: 'signin', opts: { subject: null } },
    { kind: 'refused', opts: { answer: (name) => (name === 'sync:push' ? { ok: false, error: 'too-many-rows', wrote: 0 } : undefined) } },
    { kind: 'server', opts: { answer: (name) => { if (name === 'sync:pullKanji') throw convexError; return undefined; } } },
    { kind: 'server', opts: { answer: (name) => (name === 'sync:pullMeta' ? { ok: false, error: 'something-new' } : undefined) } },
    { kind: 'offline', opts: { fail: offline('sync:pullMeta') } },
  ];
  const raw = /account-changed|not-authenticated|too-many-rows|something-new|Request ID|CONVEX|\(|\)/;
  try {
    for (const { kind, opts } of cases) {
      const p = page(opts);
      p.kanji.save('天', 2);
      await p.account.ready;
      p.kit.become(signedIn('user_a'));
      await until(() => p.last().phase === 'error', `the ${kind} failure`);
      assert.deepEqual(p.last().error, { kind }, `${kind}: the status carries the kind and nothing of the error`);
      for (const lang of ['en', 'es']) {
        useLang(lang);
        const { text } = lineParts(p.last());
        assert.ok(text.includes('Aiko'), `${kind} ${lang}: ${text}`);
        assert.ok(!raw.test(text), `${kind} ${lang}: ${text}`);
      }
      useLang('en');
    }
    // Another tab writes another account into the book: 'switched', and the retry decides again.
    const p = page();
    await p.account.ready;
    p.kit.become(signedIn('user_a'));
    await until(() => p.last().phase === 'synced', 'the first sync');
    p.bookStore.save(newBook('user_b', 2, {}));
    p.kanji.save('天', 3);
    await until(() => p.last().phase === 'error', 'the push refused');
    assert.deepEqual(p.last().error, { kind: 'switched' });
    for (const lang of ['en', 'es']) { useLang(lang); assert.ok(!raw.test(lineParts(p.last()).text), lang); }
    useLang('en');
    assert.equal(p.asked.length, 0);
    p.win.fire('online');
    await until(() => p.asked.length === 1, 'the question, since the book now names another account');
    assert.deepEqual(p.server.rowsOf('user_a').kanji, [], 'nothing pushed into either account without an answer');
  } finally {
    useLang('en');
  }
});

// ── Signing out while the question is open ────────────────────────────────

test('signing out closes the account question, and an answer given after it applies to nobody', async () => {
  const p = page({ subject: 'user_b', book: newBook('user_a', 1, {}) });
  p.held.on = true;
  p.kanji.save('月', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_b', 'Ben'));
  await until(() => p.asked.length === 1 && p.held.open, 'the question, open');
  const answerLater = p.held.open;
  p.held.open = null;              // keep the resolver: the dialog's late click
  const before = p.dismissed.length;
  p.kit.become(SIGNED_OUT);
  await until(() => p.last().signedIn === false, 'signing out');
  assert.equal(p.dismissed.length, before + 1, 'stop() closed the dialog');
  answerLater('add');
  await settle();
  assert.deepEqual(p.server.rowsOf('user_b').kanji, [], 'the late Add merged nothing');
  assert.equal(JSON.parse(p.bookStore.raw).account, 'user_a');
  assert.equal(p.last().phase, 'idle');
});

test('the page stamps an unsave after the account\'s newest save of it, whatever this clock says', async () => {
  // Another device, its clock an hour ahead, saved 天 again: the account's
  // save is shown at its first time but counts from an hour from now here.
  const NOW = 1_759_800_000_000;
  const server = fakeDb();
  await fakeClient(server, 'user_a').mutation('sync:push', {
    kanji: [{ char: '天', saved: { at: NOW - 60_000, box: 0, due: '2025-10-07', reviews: 0, lapses: 0, s: NOW + 3_600_000 }, removed: 0, seen: null }],
  });
  const p = page({ server });
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'synced', 'the first sync');
  assert.ok(p.kanji.isSaved('天'));
  p.kanji.unsave('天');
  await until(() => !server.rowsOf('user_a').kanji.find((r) => r.char === '天' && r.saved), 'the removal reaching the account');
  assert.equal(p.kanji.isSaved('天'), false);
});
