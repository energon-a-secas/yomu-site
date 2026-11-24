// Sync for a client that is not a page (js/sync-host.js): the iOS app's
// side of an account. An app-shaped device is built from what the host
// module gives (stores over documents, the phrase book as History, a
// preference mirror, a client over a transport) and syncs beside a
// browser-shaped one (helpers/sync-device.mjs) against the real server
// handlers (helpers/fake-convex.mjs). The joins themselves are held by the
// other sync suites; this one holds that the host supplies them faithfully.
//
//   node --test tests/sync-host.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeDb, fakeClient } from './helpers/fake-convex.mjs';
import { device, T } from './helpers/sync-device.mjs';
import { documentStore, prefsMirror, hostKit, signedInAs, signedOut, startHost, pageless, clientModule } from '../js/sync-host.js';
import * as engine from '../js/sync.js';

const { createSync } = engine;
import { storesAdapter, watchStores } from '../js/sync-watch.js';
import { openBook } from '../js/sync-book.js';
import { openKanji } from '../js/kanji-store.js';
import { openPlay } from '../js/play-store.js';
import { openWords } from '../js/word-store.js';
import { PhraseBook, phraseKey } from '../js/phrase-book.js';

const LIBRARY = { dialogues: [], phrases: [] };
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 20; i += 1) await tick(); }

/** The app's stores, as its bridge opens them: each over a document the host writes to a file. */
function appStores(now) {
  const files = {};
  const wrote = (name) => (doc) => { files[name] = doc; };
  const quiet = { readRaw: () => null, keepRaw: () => {} };
  return {
    files,
    wrote,
    kanji: openKanji({ store: documentStore(null, wrote('kanji')), ...quiet }).load(now()),
    words: openWords({ store: documentStore(null, wrote('words')), ...quiet }).load(),
    play: openPlay({ store: documentStore(null, wrote('play')), ...quiet }).load(),
    phrases: new PhraseBook(LIBRARY, null, 'en'),
    prefs: prefsMirror(null, wrote('prefs')),
  };
}

/** One app-shaped device on the sync engine alone, wired as js/account.js wires a page's. */
function appDevice(server, subject, { at = 0 } = {}) {
  let clock = T(at);
  const now = () => clock;
  const s = appStores(now);
  const local = storesAdapter({ kanji: s.kanji, history: s.phrases, play: s.play, words: s.words, prefs: s.prefs, remembering: () => true });
  const books = openBook({ store: documentStore(null, s.wrote('book')) });
  let sync = null;
  let changes = 0;
  watchStores({
    kanji: s.kanji, history: s.phrases, play: s.play, words: s.words, books, local, now,
    onPrefsSaved: s.prefs.onSaved,
    changed: () => { changes += 1; },
    known: (kind, id) => sync.known(kind, id),
  });
  const client = fakeClient(server, subject);
  sync = createSync({ client, local, book: books, now });
  return {
    ...s, books, client, sync, now,
    get changes() { return changes; },
    tick(n = 1) { clock += n * 60_000; return clock; },
    async signIn({ answer = 'adopt' } = {}) {
      const b = await sync.begin();
      if (b.mode === 'ask' && b.first && answer) { sync.choose(answer); return sync.sync(answer); }
      if (b.mode === 'ask') return b;
      return sync.sync(b.mode);
    },
    mutations: () => client.calls.filter((c) => c.kind === 'mutation'),
  };
}

const savedTexts = (list) => list.map((e) => e.t).sort();

test('an app-shaped device and a browser converge on kanji, phrases, words and Play', async () => {
  const server = fakeDb();
  const web = device(server, 'user_a');
  const app = appDevice(server, 'user_a', { at: 1 });

  web.kanji.save('日', web.now());
  web.saveText('今日は雨です。');
  web.words.save({ w: '食べる', r: 'たべる', g: 'to eat' }, web.now());
  web.play.finish('which', 7);
  await web.signIn();

  app.kanji.save('雨', app.now());
  app.phrases.save('コーヒーをください。', null, app.now());
  app.words.save({ w: '猫', r: 'ねこ', g: 'cat' }, app.now());
  app.play.finish('spaces', 21);
  // Both sides hold saves, so a first sign-in is asked about; the learner adds.
  const asked = await app.signIn({ answer: null });
  assert.equal(asked.mode, 'ask');
  assert.ok(asked.first);
  await app.signIn({ answer: 'adopt' });

  web.tick(3);
  await web.sync.sync('same');

  for (const d of [web, app]) {
    assert.ok(d.kanji.isSaved('日') && d.kanji.isSaved('雨'));
    assert.ok(d.words.isSaved('食べる', 'たべる') && d.words.isSaved('猫', 'ねこ'));
    assert.equal(d.play.best('which'), 7);
    assert.equal(d.play.best('spaces'), 21);
  }
  assert.deepEqual(savedTexts(app.phrases.savedList()), savedTexts(web.history.savedList()));
  assert.equal(app.phrases.savedList().length, 2);
  // The host heard every write: its files hold what the stores hold.
  assert.ok(app.files.kanji.saved['日'] && app.files.kanji.saved['雨']);
  assert.ok(app.files.book && app.files.book.account === 'user_a');

  // A sync with nothing new writes nothing, from the app as from a page.
  const before = app.mutations().length;
  app.tick();
  await app.sync.sync('same');
  assert.equal(app.mutations().length, before);
});

test('an unsave made in the app reaches the browser, and one made in the browser reaches the app', async () => {
  const server = fakeDb();
  const web = device(server, 'user_a');
  const app = appDevice(server, 'user_a', { at: 1 });
  web.kanji.save('日', web.now());
  web.saveText('今日は雨です。');
  web.words.save({ w: '食べる', r: 'たべる', g: 'to eat' }, web.now());
  await web.signIn();
  await app.signIn();
  assert.ok(app.kanji.isSaved('日'));

  app.tick(5);
  app.kanji.unsave('日');
  const eat = app.words.list().find((w) => w.w === '食べる');
  app.words.unsave(eat.id);
  await app.sync.sync('same');
  web.tick(10);
  await web.sync.sync('same');
  assert.ok(!web.kanji.isSaved('日'), 'the app unsaved it after the browser saved it');
  assert.ok(!web.words.isSaved('食べる', 'たべる'));

  const key = phraseKey('今日は雨です。');
  assert.ok(app.phrases.isSaved(key));
  web.tick(2);
  web.history.unsave(key, true);
  await web.sync.sync('same');
  app.tick(20);
  await app.sync.sync('same');
  assert.ok(!app.phrases.isSaved(key), 'the browser unsaved the phrase and the app let it go');
  assert.equal(app.phrases.savedList().length, 0);

  // Saved again in the app after that removal: the later save wins everywhere.
  app.tick();
  app.phrases.save('今日は雨です。', null, app.now());
  await app.sync.sync('same');
  web.tick(30);
  await web.sync.sync('same');
  assert.ok(web.history.isSaved(key));
});

test('the app carries the account\'s display preferences through and never sets one', async () => {
  const server = fakeDb();
  const web = device(server, 'user_a');
  const app = appDevice(server, 'user_a', { at: 1 });
  web.kanji.save('日', web.now());
  web.tick();
  web.setPref('romaji', 'off');
  await web.signIn();
  await app.signIn();
  assert.equal(app.prefs.get().romaji, 'off', 'the mirror holds what the account says');
  assert.equal(app.files.prefs.romaji, 'off');

  web.tick(2);
  web.setPref('slow', true);
  await web.sync.sync('same');
  app.tick(5);
  app.kanji.save('雨', app.now());
  await app.sync.sync('same');
  web.tick(5);
  await web.sync.sync('same');
  assert.equal(web.state.prefs.slow, true);
  assert.equal(web.state.prefs.romaji, 'off');
  assert.equal(app.prefs.get().slow, true);
  // Nothing the app pushed changed a preference the browser had set.
  for (const m of app.mutations()) {
    if (!m.args.prefs) continue;
    for (const [k, p] of Object.entries(m.args.prefs.values)) assert.equal(p.v, web.state.prefs[k], k);
  }
});

test('the phrase book tells sync what History tells it', () => {
  const book = new PhraseBook(LIBRARY, null, 'en');
  const heard = [];
  const off = book.onChange((e) => heard.push(e));
  const text = '今日は雨です。';
  const key = phraseKey(text);
  book.save(text, null, T(1));
  assert.deepEqual(heard, [{ type: 'save', key, at: T(1) }]);
  assert.ok(book.isSaved(key));
  book.save(text, null, T(2));
  assert.equal(heard.length, 1, 'a phrase saved already is not saved again');
  book.remove(key);
  assert.deepEqual(heard[1], { type: 'unsave', key, saved: T(1) });
  assert.ok(!book.isSaved(key));
  assert.equal(book.unsave(key), false);
  assert.equal(heard.length, 2, 'nothing to unsave, nothing said');

  const other = new PhraseBook(LIBRARY, null, 'en');
  other.save('コーヒーをください。', null, T(3));
  const sum = book.mergePhrases(other.dump().phrases);
  assert.equal(sum.added, 1);
  assert.deepEqual(heard[2], { type: 'change' });
  assert.deepEqual(savedTexts(book.savedList()), ['コーヒーをください。']);
  off();
  book.save(text, null, T(4));
  assert.equal(heard.length, 3, 'a listener taken off hears no more');
  // A book read from its document tells nobody while it loads.
  const loaded = new PhraseBook(LIBRARY, book.dump(), 'en');
  assert.equal(loaded.savedList().length, 2);
});

test('startHost runs the account steps with no page: a join, a change pushed, the app shown again, a sign-out', async () => {
  const server = fakeDb();
  const web = device(server, 'user_a');
  web.kanji.save('日', web.now());
  await web.signIn();

  let clock = T(5);
  const now = () => clock;
  const s = appStores(now);
  const client = fakeClient(server, 'user_a');
  const kit = hostKit({ token: async () => 'a-token' });
  const painted = [];
  const asked = [];
  let refreshed = 0;
  const host = startHost({
    key: 'pk_test_host',
    kit,
    engine,
    transport: (kind, name, args, url) => { assert.ok(/^https:\/\/.+\.convex\.cloud$/.test(url)); return client[kind](name, args); },
    kanji: s.kanji, words: s.words, phrases: s.phrases, play: s.play, prefs: s.prefs,
    book: documentStore(null, s.wrote('book')),
    ui: {
      paint: (status) => painted.push(status),
      ask: async (info) => { asked.push(info); return 'add'; },
      dismiss() {},
      refresh() { refreshed += 1; },
      reason: () => '',
    },
    now,
    setTimer: (fn) => { fn(); return 1; },
    clearTimer() {},
  });
  assert.ok(host.account, 'a key makes accounts available');
  await host.account.ready;
  await settle();
  assert.equal(painted.at(-1).signedIn, false);
  assert.equal(client.calls.length, 0, 'signed out, nothing is asked of the server');

  kit.become(signedInAs('user_a', 'Aiko'));
  await settle();
  assert.equal(painted.at(-1).phase, 'synced', JSON.stringify(painted.at(-1)));
  assert.equal(painted.at(-1).label, 'Aiko');
  assert.ok(s.kanji.isSaved('日'), 'the account\'s kanji arrived');
  assert.ok(refreshed > 0, 'the host is told its stores changed');
  assert.equal(asked.length, 0, 'an empty device joins without a question');
  assert.equal(s.files.book.account, 'user_a');

  clock += 60_000;
  s.kanji.save('雨', now());
  await settle();
  web.tick(10);
  await web.sync.sync('same');
  assert.ok(web.kanji.isSaved('雨'), 'a save in the app was pushed by the account\'s own timer');

  // The app leaves the screen and comes back a while later: a pull.
  web.tick();
  web.kanji.save('本', web.now());
  await web.sync.sync('same');
  host.shown(false);
  clock += 5 * 60_000;
  host.shown(true);
  await settle();
  assert.ok(s.kanji.isSaved('本'), 'coming back to the front pulled');
  host.online(false);
  host.online(true);
  await settle();

  kit.become(signedOut());
  await settle();
  assert.equal(painted.at(-1).signedIn, false);
  const calls = client.calls.length;
  clock += 60_000;
  s.kanji.save('読', now());
  await settle();
  assert.equal(client.calls.length, calls, 'signed out, a save stays on the device');
  assert.ok(s.kanji.isSaved('読'));
});

test('a host with data and an account with data is asked, and the answer is the learner\'s', async () => {
  const server = fakeDb();
  const web = device(server, 'user_a');
  web.kanji.save('日', web.now());
  await web.signIn();

  let clock = T(5);
  const now = () => clock;
  const s = appStores(now);
  s.kanji.save('雨', now());
  const client = fakeClient(server, 'user_a');
  const kit = hostKit({ state: signedInAs('user_a', 'Aiko'), token: async () => 'a-token' });
  const asked = [];
  const painted = [];
  const host = startHost({
    key: 'pk_test_host', kit, engine,
    transport: (kind, name, args) => client[kind](name, args),
    kanji: s.kanji, words: s.words, phrases: s.phrases, play: s.play, prefs: s.prefs,
    book: documentStore(null, s.wrote('book')),
    ui: { paint: (status) => painted.push(status), ask: async (info) => { asked.push(info); return 'use'; }, dismiss() {}, refresh() {}, reason: () => '' },
    now, setTimer: (fn) => { fn(); return 1; }, clearTimer() {},
  });
  await host.account.ready;
  await settle();
  assert.equal(asked.length, 1);
  assert.ok(asked[0].first, 'a first sign-in\'s question');
  assert.equal(painted.at(-1).phase, 'synced');
  assert.ok(s.kanji.isSaved('日'));
  assert.ok(!s.kanji.isSaved('雨'), 'Use leaves behind what the device held');
});

test('the host\'s parts: no key, no accounts; a lost connection is offline; a transport sees each call', async () => {
  const s = appStores(() => T(0));
  const none = startHost({
    key: '', kit: hostKit(), engine, transport: async () => { throw new Error('never called'); },
    kanji: s.kanji, words: s.words, phrases: s.phrases, play: s.play, prefs: s.prefs,
    book: documentStore(), ui: { paint() {}, ask: async () => null, dismiss() {}, refresh() {}, reason: () => '' },
    now: () => T(0), setTimer: () => 1, clearTimer() {},
  });
  assert.equal(none.account, null);

  const page = pageless('pk_test_host');
  assert.equal(page.doc.querySelector('meta[name="clerk-publishable-key"]').content, 'pk_test_host');
  assert.equal(page.doc.querySelector('meta[name="other"]'), null);
  page.shown(false);
  assert.equal(page.doc.visibilityState, 'hidden');
  page.online(false);
  assert.equal(page.win.navigator.onLine, false);

  const seen = [];
  const { ConvexHttpClient } = clientModule(async (kind, name, args, url) => { seen.push([kind, name, url]); return { ok: true, args }; });
  const c = new ConvexHttpClient('https://example.convex.cloud');
  c.setAuth('ignored');
  assert.deepEqual(await c.query('sync:whoami', {}), { ok: true, args: {} });
  await c.mutation('sync:push', { clear: 1 });
  assert.deepEqual(seen, [['query', 'sync:whoami', 'https://example.convex.cloud'], ['mutation', 'sync:push', 'https://example.convex.cloud']]);

  // The store's storage hands back what it was given and says what it wrote.
  const wrote = [];
  const store = documentStore({ a: 1 }, (doc) => wrote.push(doc));
  assert.deepEqual(store.load(null), { a: 1 });
  store.save({ a: 2 });
  store.clear();
  assert.deepEqual(wrote, [{ a: 2 }, null]);
  assert.equal(store.load('none'), 'none');
  // The host read its file again: the next load is that, and no write is heard.
  store.put({ a: 3 });
  assert.deepEqual(store.load(null), { a: 3 });
  assert.equal(wrote.length, 2);
});
