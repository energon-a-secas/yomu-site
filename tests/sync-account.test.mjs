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
 * `clock.t` is the page's now, which a test may move; `setPref` saves a
 * display preference as the page's setter does.
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
  const clock = { t: 1_759_800_000_000 };
  const prefsSaved = new Set();
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
    prefs: { get: () => prefs, set: (c) => Object.assign(prefs, c), onSaved: (fn) => { prefsSaved.add(fn); return () => prefsSaved.delete(fn); } },
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
    now: () => clock.t,
    setTimer: (fn) => { fn(); return 1; },
    clearTimer() {},
  });
  return {
    account, imported, painted, asked, answers, bookStore, kanji, history, kit, server, doc, win, failing, held, dismissed, clock, prefs,
    setPref(k, v) { prefs[k] = v; for (const fn of prefsSaved) fn(prefs); },
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

/**
 * Every static import and re-export in a module's source, as specifiers:
 * `import x from '...'`, `import { a } from "..."` across lines, the
 * side-effect `import '...';`, and `export ... from '...'`, in either quote,
 * with or without spaces (`import{a}from'...'`), and with comments between
 * the braces, before the specifier (`import /* c *\/ '...'`, `from // c`
 * then the specifier on the next line) or before the `import` on its line.
 * A comment is taken whole (a line comment to its end, a block comment to
 * its first close), so an apostrophe in one does not end the clause and a
 * `from '...'` written in one is never read as the import. A dynamic
 * import('...') is not one, with a comment before it or not: that is the
 * guard.
 */
const COMMENT = String.raw`\/\/[^\n]*$|\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/`;
const BLOCK = String.raw`\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/`;
/** Between two parts of the statement: spaces, line breaks and comments. */
const GAP = String.raw`(?:\s|${COMMENT})*`;
const STATIC_IMPORT = new RegExp(String.raw`^[ \t]*(?:${BLOCK}[ \t]*)*(?:import|export)${GAP}(?:(?:[^'"\x60;()/]|${COMMENT})*?\bfrom${GAP})?(['"])([^'"\n]+)\1`, 'gm');
const staticSpecifiers = (src) => [...src.matchAll(STATIC_IMPORT)].map((m) => m[2]);
/** What only a signed-in page may load: the kit, the sync client, the page's sign-in, esm.sh, the Convex package. */
const SIGNED_IN_ONLY = /neorgon-auth\.js$|(^|\/)sync\.js$|events-sync\.js$|esm\.sh|^convex(\/|$)/;
/** A specifier names the module before any query or fragment: `./sync.js?v=1` is ./sync.js. */
const signedInOnly = (spec) => SIGNED_IN_ONLY.test(spec.replace(/[?#].*$/, ''));

test('the import guard finds every kind of static import, in either quote, and no dynamic one', () => {
  const planted = [
    "import './sync.js';",
    'import "./sync.js";',
    "import { createSync } from './sync.js';",
    'import { createSync } from "./sync.js";',
    "import {\n  NeoAuth,\n} from './neorgon-auth.js';",
    "import * as kit from './neorgon-auth.js'",
    "export { startAccounts } from './events-sync.js';",
    'export * from "https://esm.sh/convex@1.46.0/browser";',
    "import { ConvexHttpClient } from 'convex/browser';",
    // Found by a review: no spaces, a comment with an apostrophe inside the braces, a query on the specifier.
    "import{createSync}from'./sync.js';",
    'export{startAccounts}from"./events-sync.js"',
    "import {\n  // the client's half\n  createSync,\n} from './sync.js';",
    "import { /* it's */ NeoAuth } from './neorgon-auth.js';",
    "import { createSync } from './sync.js?v=1';",
    "import './neorgon-auth.js#kit';",
    // Found by the next review: a comment before the specifier or the import.
    "import /* the client */ './sync.js';",
    "import { createSync } from /* here */ './sync.js';",
    "import { createSync } from // the client\n  './sync.js';",
    "/* sign-in only */ import './neorgon-auth.js';",
    "export * from /* the kit */ './neorgon-auth.js';",
    "import\n  './sync.js';",
  ];
  for (const line of planted) {
    const found = staticSpecifiers(`// a module\n${line}\nconst x = 1;\n`);
    assert.equal(found.length, 1, line);
    assert.ok(signedInOnly(found[0]), `${line} -> ${found[0]}`);
  }
  const fine = [
    "const m = await import('./sync.js');",
    "  import('./events-sync.js').then((m) => m.startAccounts());",
    "import { h } from './utils.js';",
    "import './sync-watch.js';",
    "import {\n  // not from './sync.js'\n  h,\n} from './utils.js';",
    "import { /* from './sync.js' */ h } from './utils.js';",
    "import { h } from './utils.js'; // like './sync.js'",
    "export function from() { return import('./sync.js'); }",
    "export const a = 1; // from './sync.js'",
    "const m = await import(/* the client */ './sync.js');",
    "import /* dynamic */ ('./sync.js').then(() => {});",
  ];
  for (const line of fine) {
    assert.ok(staticSpecifiers(line).every((s) => !signedInOnly(s)), line);
  }
});

test('no module imports the kit, the sync client or esm.sh at its top: only inside the guard', () => {
  const js = join(SITE, 'js');
  const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []));
  let seen = 0;
  for (const file of files(js)) {
    for (const spec of staticSpecifiers(readFileSync(file, 'utf8'))) {
      seen += 1;
      assert.ok(!signedInOnly(spec), `${file.slice(js.length + 1)} imports ${spec} at its top`);
    }
  }
  assert.ok(seen > 100, `only ${seen} static imports found: the pattern is not reading the modules`);
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
  // The answer is kept as it is given. This said "nothing was decided for
  // the new account yet" until a review found that an unsave, a Clear all
  // or a preference change made before the retry then went into the old
  // account's book and was dropped: the book now names the new account,
  // with the answer pending until a sync finishes it.
  assert.equal(JSON.parse(p.bookStore.raw).account, 'user_b', 'the answer is kept for the new account');
  assert.equal(JSON.parse(p.bookStore.raw).pending, 'adopt', 'and waits for a sync to finish it');
  assert.deepEqual(p.server.rowsOf('user_b').kanji, [], 'nothing was merged yet');
  p.failing.on = () => false;
  p.win.fire('online');
  await until(() => p.last().phase === 'synced', 'the retry');
  assert.equal(p.asked.length, asked, 'the answer is not asked for again');
  assert.equal(JSON.parse(p.bookStore.raw).account, 'user_b');
  assert.equal(JSON.parse(p.bookStore.raw).pending, undefined, 'the answer is finished');
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

// What the learner does between an answer and the retry that finishes it
// belongs to the new account. A review found the answer was held only in
// the page: after Use a save made before the retry was wiped by it, and
// after Add an unsave, a Clear all or a preference change went into the old
// account's book and was dropped. Each test fails the pull once.

const kanjiRow = (char, at) => ({ char, saved: { at, box: 0, due: '2025-10-07', reviews: 0, lapses: 0, s: at }, removed: 0, seen: null });
const savedIn = (server, owner) => server.rowsOf(owner).kanji.filter((r) => r.saved).map((r) => r.char).sort();

/** user_b holds `chars` and English; this browser, last on user_a, `here`. */
async function answeredThenFailed(answer, chars, here) {
  const server = fakeDb();
  await fakeClient(server, 'user_b').mutation('sync:push', { kanji: chars.map((ch) => kanjiRow(ch, 5)), prefs: { values: { lang: { v: 'en', at: 5 } } } });
  const p = page({ server, subject: 'user_b', book: newBook('user_a', 1, {}) });
  for (const ch of here) p.kanji.save(ch, 2);
  await p.account.ready;
  p.kit.become(signedIn('user_b', 'Ben'));
  await until(() => p.asked.length === 1 && p.last().phase === 'paused', 'the question');
  p.failing.on = offline('sync:pullMeta');
  p.answers.push(answer);
  await p.account.choose(null);
  await until(() => p.last().phase === 'error', `the failure after ${answer}`);
  p.clock.t += 60_000;
  return p;
}
async function retried(p) {
  p.failing.on = () => false;
  p.win.fire('online');
  await until(() => p.last().phase === 'synced', 'the retry');
}

test('after Use fails at its pull, a save and a preference made before the retry are kept, and nothing older joins', async () => {
  const p = await answeredThenFailed('use', ['雪'], ['月']);
  p.kanji.save('星', p.clock.t);
  p.setPref('lang', 'es');
  await retried(p);
  assert.deepEqual(Object.keys(p.kanji.data.saved).sort(), ['星', '雪'], 'the account\'s data, and the save made since');
  assert.deepEqual(savedIn(p.server, 'user_b'), ['星', '雪'], 'the save reached the account');
  assert.equal(p.prefs.lang, 'es', 'the preference changed since stands here');
  assert.equal(p.server.rowsOf('user_b').prefs[0].values.lang.v, 'es', 'and in the account');
  assert.ok(!p.server.rowsOf('user_b').kanji.find((r) => r.char === '月'), 'what was here at the answer stayed behind');
});

test('after Add fails at its pull, an unsave and a preference made before the retry reach the new account', async () => {
  const p = await answeredThenFailed('add', ['火'], ['月', '火']);
  p.kanji.unsave('火');
  p.setPref('lang', 'es');
  await retried(p);
  assert.equal(p.kanji.isSaved('火'), false, 'the unsave stands here');
  assert.deepEqual(savedIn(p.server, 'user_b'), ['月'], 'and removed the account\'s copy');
  assert.equal(p.prefs.lang, 'es');
  assert.equal(p.server.rowsOf('user_b').prefs[0].values.lang.v, 'es');
});

test('after Add fails at its pull, a Clear all made before the retry clears the new account too', async () => {
  const p = await answeredThenFailed('add', ['雪'], ['月']);
  const at = p.clock.t;
  p.kanji.clearAll(at);
  await retried(p);
  assert.deepEqual(Object.keys(p.kanji.data.saved), [], 'nothing came back here');
  assert.ok(p.server.rowsOf('user_b').clears.some((c) => c.at >= at), 'the account holds the Clear all');
  const other = page({ server: p.server, subject: 'user_b', book: newBook('user_b', 1, {}) });
  await other.account.ready;
  other.kit.become(signedIn('user_b', 'Ben'));
  await until(() => other.last().phase === 'synced', 'another device\'s sync');
  assert.deepEqual(Object.keys(other.kanji.data.saved), [], 'another device of the account sees it cleared');
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
