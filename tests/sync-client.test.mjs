// The sync client (js/sync.js) deciding what to pull, merge and push, run
// against a fake Convex (tests/helpers/fake-convex.mjs) that runs the real
// server handlers. Each "device" is the page's real stores (My kanji,
// History, Play), opened over memory, wired the way js/account.js wires
// them, so every merge goes through the stores' own validation and merge
// functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeDb, fakeClient, memoryStore } from './helpers/fake-convex.mjs';
import { createSync, decide, SyncError } from '../js/sync.js';
import { storesAdapter, watchStores } from '../js/sync-watch.js';
import { openBook, newBook } from '../js/sync-book.js';
import { openKanji } from '../js/kanji-store.js';
import { openHistory, textKey } from '../js/history-store.js';
import { openPlay } from '../js/play-store.js';

const T = (n) => 1_700_000_000_000 + n * 60_000;
const day = (n) => new Date(T(n)).toISOString().slice(0, 10);

function device(server, subject, { at = 0, remember = 'on', fail } = {}) {
  let clock = T(at);
  const now = () => clock;
  const kanji = openKanji({ store: memoryStore(), readRaw: () => null, keepRaw: () => {} }).load(now());
  const history = openHistory({ store: memoryStore(), readRaw: () => null, keepRaw: () => {}, dropRaw: () => {} }).load();
  const play = openPlay({ store: memoryStore(), readRaw: () => null, keepRaw: () => {} }).load();
  const state = { prefs: { lang: 'en', furigana: true, romaji: 'said', highlights: true, unsaved: 'mark', slow: false, remember, translate: 'off' } };
  const prefsListeners = new Set();
  const savePrefs = () => { for (const fn of prefsListeners) fn(state.prefs); };
  const local = storesAdapter({
    kanji, history, play,
    prefs: { get: () => state.prefs, set: (c) => { Object.assign(state.prefs, c); savePrefs(); } },
    remembering: () => state.prefs.remember === 'on',
  });
  const bookStore = memoryStore();
  const books = openBook({ store: bookStore });
  let pushes = 0;
  watchStores({
    kanji, history, play, books, local, now,
    onPrefsSaved: (fn) => { prefsListeners.add(fn); return () => prefsListeners.delete(fn); },
    changed: () => { pushes += 1; },
  });
  const failing = { on: fail || (() => false) };
  const client = fakeClient(server, subject, { fail: (...a) => failing.on(...a) });
  const sync = createSync({ client, local, book: books, now });
  return {
    kanji, history, play, state, books, bookStore, client, sync, failing,
    get changes() { return pushes; },
    tick(n = 1) { clock += n * 60_000; return clock; },
    now,
    setPref(k, v) { state.prefs[k] = v; savePrefs(); },
    /** Read a text: count its kanji and their words, as events-read.js noteKanji does. */
    read(chars, words = {}) {
      kanji.beginSession('paste', now());
      kanji.record(chars, new Map(Object.entries(words)), day(clock / 60_000 - T(0) / 60_000));
    },
    saveText(text) { return history.save(text, kanji.sessionId, 'paste', now()); },
    async signIn() {
      const b = await sync.begin();
      if (b.mode === 'ask') return b;
      return sync.sync(b.mode);
    },
    mutations: () => client.calls.filter((c) => c.kind === 'mutation'),
  };
}

const today = (d) => day(Math.round((d.now() - T(0)) / 60_000));

test('the account decision: a browser that never synced merges, the same account merges, another is asked', () => {
  assert.equal(decide(null, 'user_a'), 'adopt');
  assert.equal(decide(newBook('user_a', T(1), {}), 'user_a'), 'same');
  assert.equal(decide(newBook('user_a', T(1), {}), 'user_b'), 'ask');
});

test('the first sign-in on a browser that never synced merges this browser into the account, then pulls nothing new', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a');
  a.kanji.save('天', a.now());
  a.read(['天', '雨'], { 天: [['天気', 'てんき']] });
  const before = JSON.stringify(a.kanji.data);
  const r = await a.signIn();
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(a.kanji.data), before, 'this browser keeps what it had');
  assert.equal(a.books.read().account, 'user_a', 'the account is remembered');
  const rows = server.rowsOf('user_a').kanji;
  assert.deepEqual(rows.map((x) => x.char).sort(), ['天', '雨']);
  assert.ok(rows.find((x) => x.char === '天').saved);
  // Nothing changed since: a second sync sends nothing.
  const pushed = a.mutations().length;
  await a.sync.sync('same');
  assert.equal(a.mutations().length, pushed, 'a sync with nothing new makes no push');
});

test('a second device gets the first one\'s kanji, phrases, scores and display, and gives its own', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a', { at: 0 });
  a.kanji.save('天', a.now());
  a.read(['天'], { 天: [['天気', 'てんき']] });
  a.saveText('天気がいい。');
  a.play.finish('which', 7);
  a.setPref('lang', 'es');
  await a.signIn();

  const b = device(server, 'user_a', { at: 5 });
  b.kanji.save('雪', b.now());
  b.read(['雪', '天'], { 天: [['雨天', 'うてん']] });
  b.play.finish('which', 9);
  await b.signIn();
  assert.ok(b.kanji.isSaved('天') && b.kanji.isSaved('雪'));
  assert.equal(b.kanji.seenOf('天').n, 1, 'the higher count, not a sum: both met it in one text');
  assert.deepEqual(b.kanji.seenOf('天').words.map((w) => w[0]).sort(), ['天気', '雨天']);
  assert.equal(b.history.savedList().length, 1);
  assert.equal(b.history.savedList()[0].t, '天気がいい。');
  assert.equal(b.play.best('which'), 9);
  assert.equal(b.state.prefs.lang, 'es', 'a browser that never synced takes the account\'s display');

  await a.sync.sync('same');
  assert.ok(a.kanji.isSaved('雪'));
  assert.equal(a.play.best('which'), 9);
  assert.deepEqual(a.kanji.seenOf('天').words.map((w) => w[0]).sort(), ['天気', '雨天']);
});

test('unsaving a kanji on one device removes it on the other, and an old copy pushed later does not bring it back', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a');
  a.kanji.save('天', a.now());
  await a.signIn();
  const b = device(server, 'user_a', { at: 1 });
  await b.signIn();
  assert.ok(b.kanji.isSaved('天'));

  a.tick(10);
  a.kanji.unsave('天');
  assert.ok(a.books.read().removed.kanji['天'], 'the removal is kept until a sync carries it');
  await a.sync.flush();
  assert.deepEqual(a.books.read().removed.kanji, {}, 'carried, and forgotten here');

  // b has not synced since: its copy is older than the removal.
  b.tick(20);
  await b.sync.flush();           // b pushes its stale copy first
  await b.sync.sync('same');
  assert.equal(b.kanji.isSaved('天'), false);
  await a.sync.sync('same');
  assert.equal(a.kanji.isSaved('天'), false);
});

test('a removal made while signed out reaches the account at the next sign-in', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a');
  a.kanji.save('天', a.now());
  a.kanji.save('雨', a.now());
  await a.signIn();
  a.sync.stop();                 // signed out
  a.tick(3);
  a.kanji.unsave('雨');
  await a.signIn();
  const b = device(server, 'user_a', { at: 9 });
  await b.signIn();
  assert.ok(b.kanji.isSaved('天'));
  assert.equal(b.kanji.isSaved('雨'), false);
});

test('saving again after a removal wins over the removal', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a');
  a.kanji.save('天', a.now());
  await a.signIn();
  const b = device(server, 'user_a', { at: 1 });
  await b.signIn();
  a.tick(5);
  a.kanji.unsave('天');
  await a.sync.flush();
  await b.sync.sync('same');
  b.tick(10);
  b.kanji.save('天', b.now());
  await b.sync.flush();
  await a.sync.sync('same');
  assert.ok(a.kanji.isSaved('天'));
  assert.equal(a.kanji.savedOf('天').reviews, 0);
});

test('Clear all on one device clears the others when they sync, and what each did after it stays', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a');
  a.kanji.save('天', a.now());
  a.read(['天', '雨']);
  await a.signIn();
  const b = device(server, 'user_a', { at: 1 });
  b.read(['雪']);
  await b.signIn();
  assert.ok(b.kanji.seenOf('雨'));

  a.tick(10);
  a.kanji.clearAll(a.now());
  a.tick(1);
  a.kanji.save('月', a.now());
  await a.sync.flush();
  assert.deepEqual(Object.keys(a.kanji.data.saved), ['月']);

  b.tick(30);
  await b.sync.sync('same');
  assert.deepEqual(Object.keys(b.kanji.data.saved), ['月'], 'saves before the clear go, the one after stays');
  assert.deepEqual(Object.keys(b.kanji.data.seen), [], 'every count made before b heard of the clear goes');
  b.read(['花']);
  await b.sync.flush();
  await a.sync.sync('same');
  assert.deepEqual(Object.keys(a.kanji.data.seen), ['花'], 'counts made after it travel as before');
  assert.ok(a.kanji.isSaved('月'));
});

test('a save made before a Clear all stays gone when the same kanji is saved again after it', async () => {
  // Found by the three-device run: b's copy of 雨, saved before a's clear,
  // borrowed the newer save's time from the server's row and came back,
  // review schedule and all, merged into the save made after the clear.
  const server = fakeDb();
  const a = device(server, 'user_a');
  a.kanji.save('雨', a.now());
  await a.signIn();
  const b = device(server, 'user_a', { at: 1 });
  await b.signIn();
  a.tick(5);
  a.kanji.clearAll(a.now());
  a.tick(1);
  a.kanji.save('雨', a.now());
  await a.sync.flush();
  const fresh = a.kanji.savedOf('雨');
  b.tick(10);
  b.kanji.answer('雨', true, today(b));   // b has not heard of the clear
  await b.sync.flush();
  await b.sync.sync('same');
  assert.deepEqual(b.kanji.savedOf('雨'), fresh, 'b holds the save made after the clear, not its own older one');
  await a.sync.sync('same');
  assert.deepEqual(a.kanji.savedOf('雨'), fresh);
});

test('a browser joining an account keeps its own data even when the account was cleared before it joined', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a', { at: 0 });
  a.read(['天']);
  await a.signIn();
  a.tick(5);
  a.kanji.clearAll(a.now());
  await a.sync.flush();
  const b = device(server, 'user_a', { at: 1 });  // b's data is older than the clear
  b.kanji.save('雨', b.now());
  b.read(['雨']);
  b.tick(20);
  await b.signIn();
  assert.ok(b.kanji.isSaved('雨'));
  assert.ok(b.kanji.seenOf('雨'));
  await a.sync.sync('same');
  assert.ok(a.kanji.isSaved('雨'), 'b\'s data joined the account');
});

test('saved phrases travel; unsaving one reaches the other device; History\'s other texts never leave', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a');
  a.read(['駅']);
  a.history.record('今日は寒いですね。', a.kanji.sessionId, 'paste', a.now(), true, a.kanji.sessionAt);
  a.saveText('駅はどこですか。');
  await a.signIn();
  const raw = JSON.stringify(server.rowsOf('user_a'));
  assert.ok(raw.includes('駅はどこですか。'));
  assert.ok(!raw.includes('今日は寒いですね。'), 'a text read and not saved stays in this browser');

  const b = device(server, 'user_a', { at: 2, remember: 'off' });
  await b.signIn();
  const key = textKey('駅はどこですか。');
  assert.ok(b.history.isSaved(key));
  b.tick(5);
  b.history.unsave(key, false);
  await b.sync.flush();
  assert.equal(server.rowsOf('user_a').phrases[0].phrase, null, 'the account keeps the removal, and no text');
  assert.ok(!JSON.stringify(server.rowsOf('user_a')).includes('駅はどこですか。'));
  await a.sync.sync('same');
  assert.equal(a.history.isSaved(key), false);
  assert.ok(a.history.entry(key), 'with Remember on, the text stays in a\'s History as an ordinary entry');
});

test('a phrase saved again elsewhere, met here as an ordinary History text, ends the same on both sides in one sync', async () => {
  // History's own merge folds this browser's reads of the text into the
  // phrase it saves again, so what the account lacks is worked out after the
  // merge. Worked out before it, the account kept the older count until a
  // second sync (found by the three-device run).
  const server = fakeDb();
  const t = '雨が降っています。';
  const key = textKey(t);
  const a = device(server, 'user_a', { remember: 'on' });
  a.read(['雨']);
  a.saveText(t);
  await a.signIn();
  const b = device(server, 'user_a', { at: 1 });
  await b.signIn();
  a.tick(2);
  a.history.unsave(key, true);               // Remember on: the text stays, unsaved
  a.tick(1);
  a.read(['雨']);
  a.history.record(t, a.kanji.sessionId, 'paste', a.now(), true, a.kanji.sessionAt);
  await a.sync.flush();
  b.tick(10);
  await b.sync.sync('same');
  b.saveText(t);                              // saved again on b, after a's removal
  await b.sync.flush();
  await a.sync.sync('same');
  const here = a.history.entry(key);
  const there = server.rowsOf('user_a').phrases.find((r) => r.key === key).phrase;
  assert.ok(here.saved, 'saved again here');
  assert.deepEqual([there.n, there.last], [here.n, here.last], 'the account holds what this browser holds');
  const pushed = a.mutations().length;
  await a.sync.sync('same');
  assert.equal(a.mutations().length, pushed, 'and the next sync has nothing to send');
});

test('display preferences: the later change wins per preference; remember and translate never travel', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a');
  await a.signIn();
  const b = device(server, 'user_a', { at: 1 });
  await b.signIn();
  a.tick(2);
  a.setPref('lang', 'es');
  a.setPref('remember', 'off');
  b.tick(3);
  b.setPref('furigana', false);
  b.setPref('translate', 'on');
  await a.sync.flush();
  await b.sync.sync('same');
  await a.sync.sync('same');
  for (const d of [a, b]) {
    assert.equal(d.state.prefs.lang, 'es');
    assert.equal(d.state.prefs.furigana, false);
  }
  assert.equal(b.state.prefs.remember, 'on');
  assert.equal(a.state.prefs.translate, 'off');
  assert.ok(!JSON.stringify(server.rowsOf('user_a').prefs).match(/remember|translate/));
});

test('a failed pull changes nothing here and remembers no account; a failed push leaves the merge, and the retry finishes it', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a');
  a.kanji.save('天', a.now());
  await a.signIn();
  const b = device(server, 'user_a', { at: 1 });
  b.kanji.save('雨', b.now());
  b.failing.on = (name) => name === 'sync:pullKanji';
  const before = JSON.stringify([b.kanji.data, b.history.data, b.play.data, b.state.prefs]);
  await assert.rejects(b.signIn(), (err) => err instanceof TypeError || err instanceof SyncError);
  assert.equal(JSON.stringify([b.kanji.data, b.history.data, b.play.data, b.state.prefs]), before, 'untouched');
  assert.equal(b.bookStore.raw, null, 'no account is remembered after a failed first sync');

  b.failing.on = (name) => name === 'sync:push';
  await assert.rejects(b.signIn());
  assert.ok(b.kanji.isSaved('天') && b.kanji.isSaved('雨'), 'the account\'s data was merged in before the push failed');
  assert.equal(server.rowsOf('user_a').kanji.length, 1, 'the account does not have 雨 yet');
  b.failing.on = () => false;
  await b.sync.sync('same');
  assert.equal(server.rowsOf('user_a').kanji.length, 2);
});

test('another account signing in is asked about, and either answer leaves the first account as it was', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a');
  a.kanji.save('天', a.now());
  a.saveText('天気がいい。');
  await a.signIn();
  const accountA = JSON.stringify(server.rowsOf('user_a'));

  // user_b's account, from another browser.
  const other = device(server, 'user_b', { at: 1 });
  other.kanji.save('雪', other.now());
  await other.signIn();

  const add = device(server, 'user_b', { at: 2 });
  add.books.write(a.books.read());      // this browser last synced with user_a
  add.kanji.save('月', add.now());
  const asked = await add.sync.begin();
  assert.equal(asked.mode, 'ask');
  assert.deepEqual(asked.counts, { account: { kanji: 1, phrases: 0 }, here: { kanji: 1, phrases: 0 } });
  assert.deepEqual(Object.keys(add.kanji.data.saved), ['月'], 'asking changes nothing here');
  assert.equal(add.mutations().length, 0, 'and sends nothing');
  await add.sync.sync('adopt');          // Add this browser's data to user_b
  assert.deepEqual(Object.keys(add.kanji.data.saved).sort(), ['月', '雪']);
  assert.deepEqual(server.rowsOf('user_b').kanji.map((r) => r.char).sort(), ['月', '雪']);
  assert.equal(add.books.read().account, 'user_b');

  const use = device(server, 'user_b', { at: 3 });
  use.books.write(a.books.read());
  use.kanji.save('星', use.now());
  use.read(['星']);
  use.saveText('星がきれい。');
  use.play.finish('twins', 4);
  await use.sync.begin();
  await use.sync.sync('replace');        // Use the account's data instead
  assert.deepEqual(Object.keys(use.kanji.data.saved).sort(), ['月', '雪']);
  assert.deepEqual(Object.keys(use.kanji.data.seen), []);
  assert.equal(use.history.savedList().length, 0);
  assert.equal(use.play.best('twins'), 0);
  assert.ok(!JSON.stringify(server.rowsOf('user_b')).includes('星'), 'nothing of this browser went to user_b');
  assert.equal(JSON.stringify(server.rowsOf('user_a')), accountA, 'user_a\'s account is untouched');
});

test('after a sync, a change pushes only the rows it touched, and a removal made while a pull is out is kept', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a');
  for (const ch of ['一', '二', '三', '四']) a.kanji.save(ch, a.now());
  await a.signIn();
  a.tick(1);
  a.kanji.answer('二', true, today(a));
  await a.sync.flush();
  const last = a.mutations().at(-1);
  assert.deepEqual(last.args.kanji.map((r) => r.char), ['二']);

  // The pull waits; the learner removes a kanji meanwhile.
  let release;
  let reached;
  const gate = new Promise((r) => { release = r; });
  const atGate = new Promise((r) => { reached = r; });
  const pull = a.client.query;
  a.client.query = async (name, args) => { if (name === 'sync:pullKanji') { reached(); await gate; } return pull(name, args); };
  const running = a.sync.sync('same');
  await atGate;                               // the pull is out
  a.tick(1);
  a.kanji.unsave('三');
  release();
  await running;
  assert.equal(a.kanji.isSaved('三'), false, 'the pull did not bring it back');
  assert.equal(server.rowsOf('user_a').kanji.find((r) => r.char === '三').saved, null);
});

test('three devices in any order of changes and syncs end the same, and one more sync sends nothing', async () => {
  let seed = 20261007;
  const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (list) => list[Math.floor(r() * list.length)];
  for (let round = 0; round < 40; round += 1) {
    const server = fakeDb();
    const devices = [device(server, 'user_a', { at: 0 }), device(server, 'user_a', { at: 0 }), device(server, 'user_a', { at: 0 })];
    for (const d of devices) await d.signIn();
    for (let step = 0; step < 60; step += 1) {
      const d = pick(devices);
      d.tick(1 + Math.floor(r() * 3));
      const ch = pick(['天', '雨', '雪', '月', '花']);
      const act = r();
      if (act < 0.25) d.kanji.toggle(ch, d.now());
      else if (act < 0.5) d.read([ch, pick(['天', '雨'])], { [ch]: [[`${ch}気`, 'き']] });
      else if (act < 0.6) d.kanji.answer(ch, r() < 0.5, today(d));
      else if (act < 0.63) d.kanji.clearAll(d.now());
      else if (act < 0.72) { const t = pick(['一つ。', '二つ。']); if (d.history.isSaved(textKey(t))) d.history.unsave(textKey(t), true); else d.saveText(t); }
      else if (act < 0.78) d.play.finish(pick(['which', 'twins']), Math.floor(r() * 10));
      else if (act < 0.82) d.setPref('romaji', pick(['said', 'spelled', 'off']));
      else if (act < 0.92) await d.sync.flush();
      else await d.sync.sync('same');
    }
    for (let pass = 0; pass < 2; pass += 1) for (const d of devices) await d.sync.sync('same');
    const view = (d) => JSON.stringify({
      saved: Object.keys(d.kanji.data.saved).sort().map((c) => [c, d.kanji.data.saved[c]]),
      seen: Object.keys(d.kanji.data.seen).sort().map((c) => [c, d.kanji.data.seen[c].n, d.kanji.data.seen[c].first, d.kanji.data.seen[c].last]),
      phrases: d.history.savedList().map((e) => [e.key, e.n, e.saved]),
      play: Object.keys(d.play.data.games).sort().map((g) => [g, d.play.data.games[g]]),
      romaji: d.state.prefs.romaji,
    });
    assert.equal(view(devices[1]), view(devices[0]), `round ${round}: device 2`);
    assert.equal(view(devices[2]), view(devices[0]), `round ${round}: device 3`);
    const writes = server.writes;
    for (const d of devices) await d.sync.sync('same');
    assert.equal(server.writes, writes, `round ${round}: a sync with nothing new wrote something`);
  }
});
