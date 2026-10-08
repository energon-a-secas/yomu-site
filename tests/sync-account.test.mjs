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
  // The account's side also says what it removed and whether it cleared,
  // which a first sign-in is asked about (sync.js accountHolds).
  assert.deepEqual(p.asked[0].counts, { account: { kanji: 0, phrases: 0, removed: { kanji: 0, phrases: 0 }, cleared: false }, here: { kanji: 1, phrases: 0 } });
  assert.equal(p.last().phase, 'paused', 'Not now leaves sync paused');
  assert.deepEqual(p.server.rowsOf('user_b').kanji, []);
  p.answers.push('add');
  await p.account.choose(null);
  await until(() => p.last().phase === 'synced', 'the sync after Add');
  assert.ok(p.server.rowsOf('user_b').kanji.find((r) => r.char === '月'));
});

test('a first sign-in into an account that holds data, with data here too, is asked first, worded for a first sign-in', async () => {
  for (const choice of ['add', 'use']) {
    const server = fakeDb();
    await fakeClient(server, 'user_a').mutation('sync:push', { kanji: [kanjiRow('雪', 5)] });
    const p = page({ server });
    p.kanji.save('月', 2);
    await p.account.ready;
    p.kit.become(signedIn('user_a'));
    await until(() => p.asked.length === 1 && p.last().phase === 'paused', 'the question');
    assert.equal(p.asked[0].first, true);
    assert.equal(p.asked[0].since, 0, 'no earlier sync to name');
    // The account's side also says what it removed and whether it cleared,
    // which a first sign-in is asked about (sync.js accountHolds).
    assert.deepEqual(p.asked[0].counts, { account: { kanji: 1, phrases: 0, removed: { kanji: 0, phrases: 0 }, cleared: false }, here: { kanji: 1, phrases: 0 } });
    assert.deepEqual(savedIn(server, 'user_a'), ['雪'], 'nothing moved before the answer');
    assert.equal(p.last().synced, false, 'nothing here syncs yet');
    p.answers.push(choice);
    await p.account.choose(null);
    await until(() => p.last().phase === 'synced', `the sync after ${choice}`);
    const here = Object.keys(p.kanji.data.saved).sort();
    if (choice === 'add') {
      assert.deepEqual(here, ['月', '雪']);
      assert.deepEqual(savedIn(server, 'user_a'), ['月', '雪']);
    } else {
      assert.deepEqual(here, ['雪'], 'Use: this browser\'s own stayed behind');
      assert.deepEqual(savedIn(server, 'user_a'), ['雪']);
    }
  }
});

test('the first sign-in\'s question has its own words, in both languages, and names no earlier sync', async () => {
  const { askParts } = await import('../js/render-sync.js');
  const { useLang } = await import('../js/strings.js');
  const counts = { account: { kanji: 3, phrases: 1 }, here: { kanji: 2, phrases: 0 } };
  try {
    for (const lang of ['en', 'es']) {
      useLang(lang);
      const first = askParts({ label: 'Aiko', counts, since: 123, first: true });
      const other = askParts({ label: 'Aiko', counts, since: 123, first: false });
      assert.deepEqual([first.title, first.how], ['syncFirstTitle', 'syncFirstHow']);
      assert.deepEqual([other.title, other.how], ['syncAskTitle', 'syncAskHow']);
      assert.equal(first.since, null);
      assert.ok(other.since, 'an account switch names its last sync');
      assert.notEqual(first.body, other.body);
      assert.match(first.counts, /3/);
    }
    useLang('en');
    assert.equal(askParts({ label: 'A', counts, first: true }).body, 'This browser has kanji and phrases from before you signed in. Add them to your account, or use your account\'s data here?');
  } finally {
    useLang('en');
  }
});

test('a first sign-in\'s question names the account\'s removals and its Clear all, which are why it is asked', async () => {
  const { askParts } = await import('../js/render-sync.js');
  const { useLang } = await import('../js/strings.js');
  const none = { kanji: 0, phrases: 0 };
  const counts = (removed, cleared) => ({ account: { kanji: 0, phrases: 0, removed, cleared }, here: { kanji: 1, phrases: 0 } });
  try {
    useLang('en');
    const both = askParts({ label: 'Aiko', counts: counts({ kanji: 2, phrases: 1 }, true), first: true });
    assert.equal(both.removed, 'Removed in Aiko\'s account: kanji 2, phrases 1.');
    assert.equal(both.cleared, 'In Aiko\'s account, My kanji was cleared.');
    const plain = askParts({ label: 'Aiko', counts: counts(none, false), first: true });
    assert.deepEqual([plain.removed, plain.cleared], [null, null], 'nothing to name');
    const other = askParts({ label: 'Aiko', counts: counts({ kanji: 2, phrases: 1 }, true), first: false });
    assert.deepEqual([other.removed, other.cleared], [null, null], 'an account switch keeps its own words');
    const before = askParts({ label: 'Aiko', counts: { account: none, here: none }, first: true });
    assert.deepEqual([before.removed, before.cleared], [null, null], 'counts without the new fields');
    useLang('es');
    assert.equal(askParts({ label: 'Aiko', counts: counts({ kanji: 2, phrases: 1 }, true), first: true }).removed, 'Quitados en la cuenta de Aiko: kanji 2, frases 1.');
  } finally {
    useLang('en');
  }
});

test('a first sign-in into an account that holds only counts is not asked, through the page', async () => {
  const server = fakeDb();
  await fakeClient(server, 'user_a').mutation('sync:push', {
    kanji: [{ char: '山', saved: null, removed: 0, seen: { n: 2, first: '2025-10-01', last: '2025-10-02', words: [], e: 0 } }],
  });
  const p = page({ server });
  p.kanji.save('一', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'synced', 'the first sync');
  assert.equal(p.asked.length, 0, 'an account that saved nothing is not asked about');
  assert.deepEqual(savedIn(server, 'user_a'), ['一']);
});

test('no question on a first sign-in when this browser holds nothing saved, or the account holds nothing', async () => {
  const server = fakeDb();
  await fakeClient(server, 'user_a').mutation('sync:push', { kanji: [kanjiRow('雪', 5)] });
  const empty = page({ server });
  await empty.account.ready;
  empty.kit.become(signedIn('user_a'));
  await until(() => empty.last().phase === 'synced', 'an empty browser\'s first sync');
  assert.equal(empty.asked.length, 0);
  assert.ok(empty.kanji.isSaved('雪'));
  const first = page();
  first.kanji.save('月', 2);
  await first.account.ready;
  first.kit.become(signedIn('user_a'));
  await until(() => first.last().phase === 'synced', 'a first device\'s sync');
  assert.equal(first.asked.length, 0);
  assert.ok(first.server.rowsOf('user_a').kanji.find((r) => r.char === '月'));
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
 * A statement starts a line, or follows a `;` or a `}` on it (`const a = 1;
 * import '...'`, `;import '...'`), and a file may open with a byte order
 * mark. A comment is taken whole (a line comment to its end, a block
 * comment to its first close), so an apostrophe in one does not end the
 * clause and a `from '...'` written in one is never read as the import. A
 * dynamic import('...') is not one, with a comment before it or not: that
 * is the guard.
 */
const COMMENT = String.raw`\/\/[^\n]*$|\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/`;
const BLOCK = String.raw`\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/`;
/** Between two parts of the statement: spaces, line breaks and comments. */
const GAP = String.raw`(?:\s|${COMMENT})*`;
/** Where a statement may start: a line's start, or after a `;` or `}` on it. */
const START = String.raw`(?:^|[;}])[ \t\uFEFF]*(?:${BLOCK}[ \t]*)*`;
const STATIC_IMPORT = new RegExp(String.raw`${START}(?:import|export)\b${GAP}(?:(?:[^'"\x60;()/]|${COMMENT})*?\bfrom${GAP})?(['"])([^'"\n]+)\1`, 'gm');
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
    // Found by the review after: a statement before it on the same line.
    "const a = 1; import './sync.js';",
    ";import './sync.js';",
    "function f() {} import './sync.js';",
    "let b = 2; export * from './neorgon-auth.js';",
    "\uFEFFimport './sync.js';",
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
    "const a = 1; const m = await import('./sync.js');",
    "x = 1; import('./events-sync.js').then((m) => m.startAccounts());",
    "const important = 1; exported(); // not from './sync.js'",
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
  // This said a first sign-in that failed remembered no account, until a
  // review found an unsave made before the retry recorded nowhere: the join
  // is kept in the book from the moment it is decided, pending.
  const kept = JSON.parse(p.bookStore.raw);
  assert.equal(kept.account, 'user_a', 'the join waits in the book');
  assert.ok(kept.pending, 'pending until a sync finishes it');
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

test('after Add fails at its pull, a Clear all made before the retry removes the kanji held here from the new account, and only those', async () => {
  // This said the Clear all cleared the new account too, until a review
  // found it emptying, on every device, kanji of the account's this
  // browser never showed, while the dialog spoke of this browser's data:
  // before the account's data arrives, a Clear all is a removal of each
  // kanji it emptied here.
  const p = await answeredThenFailed('add', ['雪', '月'], ['月', '星']);
  assert.equal(p.last().clears, 'joining', 'the dialog says only the kanji held here leave the account');
  p.kanji.clearAll(p.clock.t);
  assert.equal(p.bookStore.raw && JSON.parse(p.bookStore.raw).epoch, 0, 'no Clear all of the account is kept');
  await retried(p);
  assert.deepEqual(p.server.rowsOf('user_b').clears, [], 'the account was not cleared');
  assert.deepEqual(savedIn(p.server, 'user_b'), ['雪'], 'it keeps 雪, which this browser never held, and loses 月');
  assert.deepEqual(Object.keys(p.kanji.data.saved), ['雪'], 'and 雪 reaches this browser');
  assert.equal(p.last().clears, 'account', 'from here a Clear all empties the account');
  const other = page({ server: p.server, subject: 'user_b', book: newBook('user_b', 1, {}) });
  await other.account.ready;
  other.kit.become(signedIn('user_b', 'Ben'));
  await until(() => other.last().phase === 'synced', 'another device\'s sync');
  assert.deepEqual(Object.keys(other.kanji.data.saved), ['雪'], 'another device of the account agrees');
});

// Under Use, the learner could not have seen the account's rows before
// they arrived here: a removal or a Clear all made until then is of this
// browser's own data, which Use leaves behind, so it never reaches the
// account. Under Add it does, as the two tests above hold. A review found
// Use carrying it, which could clear kanji of the account's that this
// browser never showed.

const savedHere = (p) => Object.keys(p.kanji.data.saved).sort();

test('after Use fails at its pull, an unsave made before the account\'s data arrived applies here only', async () => {
  const p = await answeredThenFailed('use', ['火'], ['月', '火']);
  p.kanji.unsave('火');
  await retried(p);
  assert.deepEqual(savedIn(p.server, 'user_b'), ['火'], 'the account keeps its own 火');
  assert.deepEqual(savedHere(p), ['火'], 'and this browser takes the account\'s data');
});

test('after Use fails at its pull, a Clear all made before the account\'s data arrived applies here only', async () => {
  const p = await answeredThenFailed('use', ['雪'], ['月']);
  p.kanji.clearAll(p.clock.t);
  await retried(p);
  assert.deepEqual(p.server.rowsOf('user_b').clears, [], 'the account was not cleared');
  assert.deepEqual(savedIn(p.server, 'user_b'), ['雪']);
  assert.deepEqual(savedHere(p), ['雪']);
});

test('once Use has brought the account\'s data here, an unsave and a Clear all reach the account as usual', async () => {
  const p = await answeredThenFailed('use', ['雪', '火'], ['月']);
  await retried(p);
  assert.deepEqual(savedHere(p), ['火', '雪']);
  p.clock.t += 60_000;
  p.kanji.unsave('火');
  await until(() => savedIn(p.server, 'user_b').length === 1, 'the unsave reaching the account');
  assert.deepEqual(savedIn(p.server, 'user_b'), ['雪']);
  p.clock.t += 60_000;
  p.kanji.clearAll(p.clock.t);
  await until(() => p.server.rowsOf('user_b').clears.length === 1, 'the Clear all reaching the account');
});

test('Use after a first sign-in\'s pull failed: an unsave made before the account\'s data arrived applies here only', async () => {
  const server = fakeDb();
  await fakeClient(server, 'user_a').mutation('sync:push', { kanji: [kanjiRow('火', 5)] });
  const p = page({ server, fail: offline('sync:pullKanji') });
  p.kanji.save('火', 2);
  p.kanji.save('月', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'error', 'the first pull failing');
  p.failing.on = () => false;
  p.win.fire('online');
  await until(() => p.asked.length === 1 && p.last().phase === 'paused', 'the question');
  p.failing.on = offline('sync:pullMeta');
  p.answers.push('use');
  await p.account.choose(null);
  await until(() => p.last().phase === 'error', 'Use, failed at its pull');
  assert.equal(p.last().synced, false, 'the Clear all dialog says this browser only');
  p.clock.t += 60_000;
  p.kanji.unsave('火');
  await retried(p);
  assert.deepEqual(savedIn(server, 'user_a'), ['火']);
  assert.deepEqual(savedHere(p), ['火']);
  assert.equal(p.last().synced, true);
});

test('a first sign-in whose pull fails: an unsave and a preference made before the retry count', async () => {
  // A review found that a first pull that failed wrote no book, so what the
  // learner did while the line said Yomu would try again was recorded
  // nowhere: the account's copy of an unsaved kanji came back, and the
  // account's display won over a change made here.
  const p = page({ fail: offline('sync:pullKanji') });
  p.kanji.save('天', p.clock.t - 60_000);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'error', 'the failure');
  // Another device puts 天 and English in the account meanwhile.
  await fakeClient(p.server, 'user_a').mutation('sync:push', {
    kanji: [kanjiRow('天', p.clock.t)], prefs: { values: { lang: { v: 'en', at: p.clock.t } } },
  });
  p.clock.t += 60_000;
  p.kanji.unsave('天');
  p.setPref('lang', 'es');
  await retried(p);
  assert.equal(p.kanji.isSaved('天'), false, 'the unsave stands here');
  assert.deepEqual(savedIn(p.server, 'user_a'), [], 'and removed the account\'s copy');
  assert.equal(p.prefs.lang, 'es', 'the preference changed here stands');
  assert.equal(p.server.rowsOf('user_a').prefs[0].values.lang.v, 'es');
});

// A Clear all made before the account's data has arrived here clears only
// what this browser held. A review found one made while a first sign-in
// waited (its pull lost) clearing the whole account on every device, kanji
// this browser never showed included, while the dialog said "in this
// browser"; Not now, Clear all, then Add did the same.

test('a first sign-in whose pull fails: a Clear all made before the retry removes the kanji held here, and the account keeps the rest', async () => {
  const server = fakeDb();
  await fakeClient(server, 'user_a').mutation('sync:push', { kanji: [kanjiRow('一', 5), kanjiRow('二', 5)] });
  const p = page({ server, fail: offline('sync:pullKanji') });
  p.kanji.save('一', 2);
  p.kanji.save('三', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'error', 'the first pull failing');
  assert.equal(JSON.parse(p.bookStore.raw).pending, 'first');
  assert.equal(p.last().clears, 'joining', 'the dialog says only the kanji held here leave the account');
  p.clock.t += 60_000;
  p.kanji.clearAll(p.clock.t);
  const book = JSON.parse(p.bookStore.raw);
  assert.deepEqual([book.epoch, Object.keys(book.removed.kanji).sort()], [0, ['一', '三']], 'a removal of each kanji it emptied, and no clear');
  await retried(p);
  assert.equal(p.asked.length, 0, 'nothing saved here any more, so nothing is asked');
  assert.deepEqual(server.rowsOf('user_a').clears, [], 'the account was not cleared');
  assert.deepEqual(savedIn(server, 'user_a'), ['二'], 'it keeps 二, which this browser never held, and loses 一, which it did');
  assert.deepEqual(savedHere(p), ['二']);
  assert.equal(p.last().clears, 'account');
});

test('the Clear all dialog\'s words follow what a Clear all does: this browser, the kanji held here, or the whole account', async () => {
  const { clearBodyKey } = await import('../js/render-sync.js');
  const { STRINGS } = await import('../js/strings.js');
  const server = fakeDb();
  await fakeClient(server, 'user_b').mutation('sync:push', { kanji: [kanjiRow('雪', 5)] });
  const p = page({ server, subject: 'user_b', book: newBook('user_a', 1, {}) });
  const seen = [];
  const note = () => { const s = p.last(); seen.push(s.clears); return clearBodyKey(s); };
  p.kanji.save('月', 2);
  await p.account.ready;
  assert.equal(note(), 'clearBodySynced', 'signed out, a joined book still carries a Clear all to its account');
  p.kit.become(signedIn('user_b', 'Ben'));
  await until(() => p.asked.length === 1 && p.last().phase === 'paused', 'the question');
  p.failing.on = offline('sync:pullMeta');
  p.answers.push('use');
  await p.account.choose(null);
  await until(() => p.last().phase === 'error', 'Use, failed at its pull');
  assert.equal(note(), 'clearBody', 'under a pending Use, a Clear all stays here');
  await retried(p);
  assert.equal(note(), 'clearBodySynced');
  const anon = page();
  await anon.account.ready;
  assert.equal(clearBodyKey(anon.last()), 'clearBody', 'no account at all');
  const joining = page({ fail: offline('sync:pullKanji') });
  await joining.account.ready;
  joining.kit.become(signedIn('user_a'));
  await until(() => joining.last().phase === 'error', 'a first pull failing');
  assert.equal(clearBodyKey(joining.last()), 'clearBodyJoining', 'a first sign-in waiting for the account\'s data');
  assert.deepEqual(seen, ['account', 'here', 'account']);
  for (const key of ['clearBody', 'clearBodyJoining', 'clearBodySynced']) assert.ok(Object.hasOwn(STRINGS, key), key);
  assert.equal(clearBodyKey({}), 'clearBody', 'a status from before it said, read as this browser only');
});

// While someone other than the book's account is signed in (another
// account's question open or put off, or whoami still out after the
// switch), a Clear all is this browser's only. A review found the dialog
// saying the account it syncs with empties on every device while the clear
// went into the old account's book as its Clear all: an answer replaces
// that book, so it reached neither account, and only Not now and a sign-in
// to the old account would ever have delivered it.

for (const when of ['answered Add', 'answered Use', 'Not now', 'whoami out, then Add']) {
  test(`another account signed in, ${when}: the Clear all dialog says this browser only, and the clear reaches no account`, async () => {
    const server = fakeDb();
    await fakeClient(server, 'user_b').mutation('sync:push', { kanji: [kanjiRow('雪', 5)] });
    await fakeClient(server, 'user_a').mutation('sync:push', { kanji: [kanjiRow('月', 2)] });
    let whoami = null;
    const out = when.startsWith('whoami');
    const p = page({
      server, subject: 'user_b', book: newBook('user_a', 1, {}),
      answer: (name) => (out && name === 'sync:whoami' && !whoami ? new Promise((r) => { whoami = r; }) : undefined),
    });
    p.held.on = true;
    p.kanji.save('月', 2);
    await p.account.ready;
    p.kit.become(signedIn('user_b', 'Ben'));
    if (out) await until(() => whoami, 'whoami sent');
    else await until(() => p.held.open && p.last().phase === 'paused', 'the question, open');
    assert.equal(p.last().clears, 'here', 'the dialog says this browser only');
    p.clock.t += 60_000;
    p.kanji.clearAll(p.clock.t);
    const book = JSON.parse(p.bookStore.raw);
    assert.deepEqual([book.account, book.epoch, book.removed.kanji], ['user_a', 0, {}], 'nothing of it is kept for the old account');
    if (out) {
      whoami({ subject: 'user_b' });
      await until(() => p.held.open, 'the question, after whoami');
      assert.equal(p.last().clears, 'here');
    }
    const answer = when.includes('Add') ? 'add' : when.includes('Use') ? 'use' : null;
    const done = p.held.open;
    p.held.open = null;
    done(answer);
    if (answer) await until(() => p.last().phase === 'synced', 'the answer\'s sync');
    else await settle();
    assert.deepEqual(server.rowsOf('user_b').clears, [], 'the new account was not cleared');
    assert.deepEqual(savedIn(server, 'user_b'), ['雪'], 'and keeps 雪, which this browser never held');
    if (answer) return;
    // Not now, then the old account signs in here again: still nothing of it.
    const again = page({ server, subject: 'user_a', book: JSON.parse(p.bookStore.raw) });
    await again.account.ready;
    again.kit.become(signedIn('user_a'));
    await until(() => again.last().phase === 'synced', 'the old account\'s sync');
    assert.deepEqual(server.rowsOf('user_a').clears, [], 'the old account was not cleared');
    assert.deepEqual(savedIn(server, 'user_a'), ['月']);
  });
}

// A Clear all acts on what its dialog said when it opened. A review found
// the words relabelled under an open dialog when the first sync landed
// (from the kanji held here to the whole account), and the click then read
// the book, so words read at opening promised less than the click did.

test('a Clear all does what its dialog said when it opened, though the first sync landed under it', async () => {
  const server = fakeDb();
  const seen = { n: 5, first: '2025-10-01', last: '2025-10-01', words: [], e: 0 };
  await fakeClient(server, 'user_a').mutation('sync:push', { kanji: [{ ...kanjiRow('雪', 5), seen }, kanjiRow('月', 5)] });
  let hold = null;
  const p = page({ server, answer: (name) => (name === 'sync:pullKanji' && !hold ? new Promise((r) => { hold = r; }) : undefined) });
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => hold, 'the first pull out');
  p.kanji.save('月', p.clock.t);
  const said = p.last().clears;          // the learner opens Clear all now
  assert.equal(said, 'joining');
  hold(fakeClient(server, 'user_a').query('sync:pullKanji', { cursor: null }));
  await until(() => p.last().phase === 'synced' && savedHere(p).length === 2, 'the first sync, under the open dialog');
  assert.equal(p.last().clears, 'account');
  p.clock.t += 60_000;
  p.kanji.clearAll(p.clock.t, said);     // the click, with the words it opened with
  await until(() => savedIn(server, 'user_a').length === 1 || server.rowsOf('user_a').clears.length, 'the clear reaching the account');
  assert.deepEqual(server.rowsOf('user_a').clears, [], 'the account was not cleared');
  assert.deepEqual(savedIn(server, 'user_a'), ['雪'], 'it keeps 雪, which was not here at the opening, and loses 月, which was');
  assert.equal(server.rowsOf('user_a').kanji.find((r) => r.char === '雪').seen.n, 5, 'and keeps its counts');
});

test('a Clear all whose dialog said the account does no more than what a Clear all does now', async () => {
  // Opened signed out over a joined book (the account), clicked once
  // another account's question is open (this browser only).
  const server = fakeDb();
  await fakeClient(server, 'user_a').mutation('sync:push', { kanji: [kanjiRow('月', 2)] });
  const p = page({ server, subject: 'user_b', book: newBook('user_a', 1, {}) });
  p.held.on = true;
  p.kanji.save('月', 2);
  await p.account.ready;
  const said = p.last().clears;
  assert.equal(said, 'account');
  p.kit.become(signedIn('user_b', 'Ben'));
  await until(() => p.held.open, 'the question');
  p.clock.t += 60_000;
  p.kanji.clearAll(p.clock.t, said);
  const book = JSON.parse(p.bookStore.raw);
  assert.deepEqual([book.epoch, book.removed.kanji], [0, {}], 'nothing kept for the old account');
});

test('the Clear all dialog keeps the words it opened with, and the click is handed them', async () => {
  const { paintSync, openClearWords, clearWords } = await import('../js/render-sync.js');
  const el = (more = {}) => ({ dataset: {}, textContent: '', ...more });
  const closers = [];
  const dialog = el({ open: false, addEventListener: (type, fn) => { if (type === 'close') closers.push(fn); } });
  const els = { 'mk-clear-body': el(), 'pl-lead': el(), 'mk-clear-dialog': dialog };
  const before = globalThis.document;
  globalThis.document = { getElementById: (id) => els[id] || null };
  try {
    const status = (clears) => ({ available: true, signedIn: true, label: 'Aiko', phase: 'syncing', at: 0, synced: true, clears, error: null });
    paintSync(status('joining'));
    assert.equal(els['mk-clear-body'].dataset.ui, 'clearBodyJoining');
    assert.equal(clearWords(), null, 'no dialog open');
    assert.equal(openClearWords(), 'joining');
    dialog.open = true;
    paintSync(status('account'));        // the first sync lands while it is open
    assert.equal(els['mk-clear-body'].dataset.ui, 'clearBodyJoining', 'the words stay as opened');
    assert.equal(clearWords(), 'joining', 'and the click is handed them');
    dialog.open = false;
    for (const fn of closers.splice(0)) fn();
    assert.equal(els['mk-clear-body'].dataset.ui, 'clearBodySynced', 'closed, they follow again');
    assert.equal(clearWords(), null);
  } finally {
    globalThis.document = before;
  }
  // The page opens the dialog through openClearWords, and the click passes
  // clearWords() to the clear.
  const src = readFileSync(join(SITE, 'js/events-kanji.js'), 'utf8');
  assert.match(src, /'mk-clear': \(b\) => \{ openClearWords\(\); openDialog\(/);
  assert.match(src, /myKanji\(\)\.clearAll\(Date\.now\(\), clearWords\(\)\)/);
});

// What the learner does from the moment the kit says "signed in" counts.
// A review found it recorded nowhere until begin() wrote the join: an
// unsave made while the Convex client failed to load, while whoami was out
// or lost, or while the token was refused was lost, and the join brought
// the account's copy back, while the line said Yomu would try again.

for (const [what, opts, mend] of [
  ['the Convex client fails to load', { clientFails: 1 }, () => {}],
  ['whoami is lost', { fail: offline('sync:whoami') }, (p) => { p.failing.on = () => false; }],
  ['the token is refused', { answer: (name) => (name === 'sync:whoami' ? null : undefined) }, (p) => { p.failing.answer = () => undefined; }],
]) {
  test(`a first sign-in where ${what}: an unsave, a save and a preference made before whoami answers count`, async () => {
    const server = fakeDb();
    await fakeClient(server, 'user_a').mutation('sync:push', {
      kanji: [kanjiRow('一', 5), kanjiRow('二', 5)], prefs: { values: { lang: { v: 'en', at: 5 } } },
    });
    const p = page({ server, ...opts });
    p.kanji.save('一', 2);
    p.kanji.save('三', 2);
    await p.account.ready;
    p.kit.become(signedIn('user_a'));
    await until(() => p.last().phase === 'error', 'the failure');
    const kept = JSON.parse(p.bookStore.raw);
    assert.deepEqual([kept.account, kept.pending], ['user_a', 'first'], 'the join waits in the book from the kit\'s sign-in');
    assert.equal(p.last().clears, 'joining');
    mend(p);
    p.answers.push('add');
    p.clock.t += 60_000;
    p.kanji.unsave('一');
    p.kanji.save('四', p.clock.t);
    p.setPref('lang', 'es');
    await until(() => p.last().phase === 'synced', 'the retry');
    assert.equal(p.asked.length, 1, 'asked, as both sides hold kanji');
    assert.deepEqual(savedIn(server, 'user_a'), ['三', '二', '四'], 'the unsave of 一 reached the account, and the saves did');
    assert.deepEqual(savedHere(p), ['三', '二', '四']);
    assert.equal(p.prefs.lang, 'es');
    assert.equal(server.rowsOf('user_a').prefs[0].values.lang.v, 'es');
  });
}

test('a Clear all made before whoami answers removes the kanji held here, and the account keeps the rest', async () => {
  const server = fakeDb();
  await fakeClient(server, 'user_a').mutation('sync:push', { kanji: [kanjiRow('一', 5), kanjiRow('二', 5)] });
  const p = page({ server, clientFails: 1 });
  p.kanji.save('一', 2);
  p.kanji.save('三', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_a'));
  await until(() => p.last().phase === 'error', 'the client failing to load');
  p.clock.t += 60_000;
  p.kanji.clearAll(p.clock.t);
  await until(() => p.last().phase === 'synced', 'the retry');
  assert.deepEqual(server.rowsOf('user_a').clears, [], 'the account was not cleared');
  assert.deepEqual(savedIn(server, 'user_a'), ['二']);
  assert.deepEqual(savedHere(p), ['二']);
});

test('the kit\'s user and whoami disagree: the join begins again for whoami\'s subject, and nothing kept for the other reaches it', async () => {
  const server = fakeDb();
  await fakeClient(server, 'user_a').mutation('sync:push', { kanji: [kanjiRow('一', 5)] });
  const p = page({ server, clientFails: 1 });
  p.kanji.save('一', 2);
  await p.account.ready;
  p.kit.become(signedIn('user_x'));
  await until(() => p.last().phase === 'error', 'the client failing to load');
  assert.deepEqual([JSON.parse(p.bookStore.raw).account, JSON.parse(p.bookStore.raw).pending], ['user_x', 'first']);
  p.clock.t += 60_000;
  p.kanji.unsave('一');
  await until(() => p.last().phase === 'synced', 'the retry');
  const book = JSON.parse(p.bookStore.raw);
  assert.deepEqual([book.account, book.pending], ['user_a', undefined], 'the book follows whoami, as another account would');
  assert.deepEqual(savedIn(server, 'user_a'), ['一'], 'the unsave kept for user_x did not reach user_a');
  assert.ok(p.kanji.isSaved('一'), 'and user_a\'s 一 is here');
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
