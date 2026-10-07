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

function page({ key = KEY, embed = false, kit = fakeKit(SIGNED_OUT), server = fakeDb(), subject = 'user_a', fail, book } = {}) {
  const imported = [];
  const painted = [];
  const asked = [];
  const bookStore = memoryStore();
  if (book) bookStore.save(book);
  const kanji = openKanji({ store: memoryStore(), readRaw: () => null, keepRaw: () => {} }).load(1);
  const history = openHistory({ store: memoryStore(), readRaw: () => null, keepRaw: () => {}, dropRaw: () => {} }).load();
  const play = openPlay({ store: memoryStore(), readRaw: () => null, keepRaw: () => {} }).load();
  const prefs = { lang: 'en', furigana: true, romaji: 'said', highlights: true, unsaved: 'mark', slow: false, remember: 'ask', translate: 'off' };
  const doc = fakeDoc(key);
  const answers = [];
  const account = startAccount({
    doc, win: { navigator: { onLine: true }, addEventListener() {} }, embed,
    importKit: async () => { imported.push('kit'); return kit; },
    importClient: async () => {
      imported.push('convex');
      return { ConvexHttpClient: class { constructor(url) { assert.equal(url, CONVEX_URL); return fakeClient(server, subject, { fail }); } } };
    },
    importEngine: async () => { imported.push('engine'); return import('../js/sync.js'); },
    kanji, history, play,
    prefs: { get: () => prefs, set: (c) => Object.assign(prefs, c), onSaved: () => () => {} },
    remembering: () => prefs.remember === 'on',
    books: openBook({ store: bookStore }),
    ui: {
      paint: (s) => painted.push(s),
      ask: async (info) => { asked.push(info); return answers.shift() ?? null; },
      refresh() {},
      reason: () => 'Sign in to keep your kanji.',
    },
    now: () => 1_759_800_000_000,
    setTimer: (fn) => { fn(); return 1; },
    clearTimer() {},
  });
  return { account, imported, painted, asked, answers, bookStore, kanji, kit, server, doc, last: () => painted.at(-1) };
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
