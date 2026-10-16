// Saved words in sync (docs/SYNC.md): the row and how two copies join, the
// server's two functions of their own, and devices made of the real stores
// that save, unsave and join with words, also against a deployment from
// before those functions existed.
//
//   node --test tests/sync-words.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanWordRow, joinWord, same, WORD_KEY } from '../js/sync-rules.js';
import { wordId, MAX_GLOSS as STORE_GLOSS } from '../js/word-store.js';
import { MAX_GLOSS as RULES_GLOSS } from '../js/sync-rules.js';
import { fakeDb, fakeClient } from './helpers/fake-convex.mjs';
import { device, T } from './helpers/sync-device.mjs';

const eat = { w: '食べる', r: 'たべる', g: 'to eat' };
const KEY = wordId(eat.w, eat.r);
const word = (over = {}) => ({ ...eat, at: T(0), box: 0, due: '2023-11-14', reviews: 0, lapses: 0, s: T(0), ...over });
const row = (over = {}, removed = 0) => ({ key: KEY, removed, word: over === null ? null : word(over) });
const MISSING = ['sync:pullWords', 'sync:pushWords'];

test('a word row is read field by field; a word under another key is left out, its removal kept', () => {
  assert.equal(RULES_GLOSS, STORE_GLOSS, 'the rules and the store cut a gloss at the same length');
  assert.match(KEY, WORD_KEY);
  assert.deepEqual(cleanWordRow(row()), row());
  assert.deepEqual(cleanWordRow({ ...row(), key: wordId('猫', 'ねこ') }), { key: wordId('猫', 'ねこ'), removed: 0, word: null });
  assert.equal(cleanWordRow({ ...row(), key: 'NOT ASCII 鍵' }), null);
  assert.equal(cleanWordRow(row({ r: 'taberu' })).word, null, 'a reading is kana');
  assert.equal(cleanWordRow(row({ box: 9 })).word, null);
  assert.equal(cleanWordRow(row({ s: 1 })).word.s, T(0), 'a save is never older than its own time');
  assert.deepEqual(cleanWordRow({ key: KEY, removed: T(3), word: null }), { key: KEY, removed: T(3), word: null });
});

test('two copies: a removal newer than the save wins, a newer save wins, two saves keep the schedule with more reviews', () => {
  assert.equal(joinWord(row({}, 0), row(null, T(5))).word, null, 'unsaved after the save');
  assert.deepEqual(joinWord(row({ s: T(9) }), row(null, T(5))).word, word({ s: T(9) }), 'saved again after the unsave');
  const a = row({ box: 2, due: '2023-11-20', reviews: 3, lapses: 0, s: T(2) });
  const b = row({ box: 1, due: '2023-11-15', reviews: 1, lapses: 1, at: T(-5), s: T(4) });
  assert.deepEqual(joinWord(a, b).word, word({ box: 2, due: '2023-11-20', reviews: 3, lapses: 1, at: T(-5), s: T(4) }));
  assert.equal(joinWord(row(null, 0), null), null, 'nothing left: no row');
});

test('the join is commutative and idempotent; saved or not is the same in any grouping, and with no removal so is the row', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const any = () => {
    if (rnd(4) === 0) return null;
    const removed = rnd(3) === 0 ? T(rnd(10)) : 0;
    if (rnd(3) === 0) return row(null, removed);
    return row({
      g: ['to eat', 'to live on', ''][rnd(3)], at: T(rnd(5)), box: rnd(6), due: `2023-11-${String(14 + rnd(10)).padStart(2, '0')}`,
      reviews: rnd(5), lapses: rnd(3), s: T(5 + rnd(10)),
    }, removed);
  };
  for (let i = 0; i < 3000; i += 1) {
    const [a, b, c] = [any(), any(), any()];
    assert.ok(same(joinWord(a, b), joinWord(b, a)), 'commutative');
    const ab = joinWord(a, b);
    assert.ok(same(joinWord(ab, ab), joinWord(ab, null)), 'idempotent');
    const left = joinWord(joinWord(a, b), c);
    const right = joinWord(a, joinWord(b, c));
    // As a kanji's and a phrase's (docs/SYNC.md, "Two joins depend on the
    // grouping"): a copy a removal kills may have lent its earliest save and
    // its lapses to a live copy it met first. Whether the word is saved is
    // the newest save against the newest removal, both maxima, so that holds
    // in any grouping; with no removal at all, the whole row does.
    assert.equal(!!(left && left.word), !!(right && right.word), 'saved in either grouping, or in neither');
    if (![a, b, c].some((x) => x && x.removed)) assert.ok(same(left, right), 'associative with no removal');
  }
});

test('the server keeps each owner\'s words apart, and a push sent twice writes nothing', async () => {
  const server = fakeDb();
  const a = fakeClient(server, 'user_a');
  const b = fakeClient(server, 'user_b');
  const first = await a.mutation('sync:pushWords', { words: [row()] });
  assert.equal(first.wrote, 1);
  assert.equal((await a.mutation('sync:pushWords', { words: [row()] })).wrote, 0);
  assert.deepEqual((await a.query('sync:pullWords', { cursor: null })).rows, [row()]);
  assert.deepEqual((await b.query('sync:pullWords', { cursor: null })).rows, [], 'user_b sees none of user_a\'s');
  assert.equal((await fakeClient(server, null).query('sync:pullWords', { cursor: null })).ok, false);
});

test('a word saved on one device reaches another, and an unsave reaches it too', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a', { at: 0 });
  a.words.save(eat, a.now());
  await a.signIn();
  const b = device(server, 'user_a', { at: 1 });
  await b.signIn();
  assert.ok(b.words.isSaved(eat.w, eat.r), 'B has A\'s word');
  b.tick();
  b.words.unsave(KEY);
  await b.sync.flush();
  a.tick(2);
  await a.sync.sync('same');
  assert.ok(!a.words.isSaved(eat.w, eat.r), 'A heard B\'s unsave');
  // and saved again on A after that, it comes back on B
  a.tick();
  a.words.save(eat, a.now());
  await a.sync.flush();
  b.tick(3);
  await b.sync.sync('same');
  assert.ok(b.words.isSaved(eat.w, eat.r));
});

test('a first sign-in holding only saved words is asked when the account holds words, and Use leaves them behind', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a', { at: 0 });
  a.words.save({ w: '猫', r: 'ねこ', g: 'cat' }, a.now());
  await a.signIn();
  const b = device(server, 'user_a', { at: 2 });
  b.words.save(eat, b.now());
  const q = await b.signIn({ answer: null });
  assert.equal(q.mode, 'ask');
  assert.equal(q.first, true);
  assert.equal(q.counts.account.words, 1);
  assert.equal(q.counts.here.words, 1);
  b.sync.choose('replace');
  await b.sync.sync('replace');
  assert.ok(b.words.isSaved('猫', 'ねこ'), 'Use takes the account\'s');
  assert.ok(!b.words.isSaved(eat.w, eat.r), 'and leaves this browser\'s behind');
});

test('a deployment without the words functions syncs the rest, and the words wait for one that has them', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a', { at: 0, missing: MISSING });
  a.words.save(eat, a.now());
  a.kanji.save('雨', a.now());
  const res = await a.signIn();
  assert.equal(res.ok, true, 'the sync finished');
  assert.equal(server.rowsOf('user_a').kanji.length, 1, 'the kanji reached the account');
  assert.equal(server.rowsOf('user_a').words.length, 0);
  assert.ok(a.words.isSaved(eat.w, eat.r), 'the word stays here');
  // The deployment gains the functions; the next sync carries the word.
  const again = a.reload({ missing: [] });
  again.tick();
  await again.sync.begin();
  await again.sync.sync('same');
  assert.equal(server.rowsOf('user_a').words.length, 1);
});

test('three devices saving, unsaving and reviewing words in any order end the same, and one more sync sends nothing', async () => {
  let seed = 20261016;
  const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (list) => list[Math.floor(r() * list.length)];
  const WORDS = [eat, { w: '猫', r: 'ねこ', g: 'cat' }, { w: '方', r: 'かた', g: 'person' }, { w: '方', r: 'ほう', g: 'direction' }];
  for (let round = 0; round < 30; round += 1) {
    const server = fakeDb();
    const devices = [device(server, 'user_a', { at: 0 }), device(server, 'user_a', { at: 0 }), device(server, 'user_a', { at: 0 })];
    for (const d of devices) await d.signIn();
    for (let step = 0; step < 50; step += 1) {
      const d = pick(devices);
      d.tick(1 + Math.floor(r() * 3));
      const w = pick(WORDS);
      const act = r();
      if (act < 0.4) d.words.toggle(w, d.now());
      else if (act < 0.55) d.words.answer(wordId(w.w, w.r), r() < 0.5, new Date(d.now()).toISOString().slice(0, 10));
      else if (act < 0.65) d.kanji.toggle(pick(['天', '雨']), d.now());
      else if (act < 0.85) await d.sync.flush();
      else await d.sync.sync('same');
    }
    for (let pass = 0; pass < 2; pass += 1) for (const d of devices) await d.sync.sync('same');
    const view = (d) => JSON.stringify({
      words: d.words.list().map(({ id, w, r: rd, box, due, reviews }) => [id, w, rd, box, due, reviews]),
      kanji: Object.keys(d.kanji.data.saved).sort(),
    });
    assert.equal(view(devices[1]), view(devices[0]), `round ${round}: device 2`);
    assert.equal(view(devices[2]), view(devices[0]), `round ${round}: device 3`);
    const writes = server.writes;
    for (const d of devices) await d.sync.sync('same');
    assert.equal(server.writes, writes, `round ${round}: a sync with nothing new wrote something`);
  }
});

test('an unsave on a clock behind the device that saved still wins: it is stamped past the save it saw', async () => {
  const server = fakeDb();
  const ahead = device(server, 'user_a', { at: 60 });
  ahead.words.save(eat, ahead.now());
  await ahead.signIn();
  const behind = device(server, 'user_a', { at: 0 });
  await behind.signIn();
  assert.ok(behind.words.isSaved(eat.w, eat.r));
  behind.tick();
  behind.words.unsave(KEY);
  await behind.sync.flush();
  ahead.tick();
  await ahead.sync.sync('same');
  assert.ok(!ahead.words.isSaved(eat.w, eat.r), 'the learner\'s last action wins, whatever the clocks say');
});

test('Add on a first sign-in brings back a word the account had removed, here and everywhere', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a', { at: 0 });
  a.words.save(eat, a.now());
  await a.signIn();
  a.tick();
  a.words.unsave(KEY);
  await a.sync.flush();
  const b = device(server, 'user_a', { at: 5 });
  b.words.save(eat, T(1));
  const q = await b.signIn({ answer: null });
  assert.equal(q.counts.account.removed.words, 1, 'the question names the removal');
  b.sync.choose('adopt');
  await b.sync.sync('adopt');
  assert.ok(b.words.isSaved(eat.w, eat.r), 'kept here');
  a.tick(10);
  await a.sync.sync('same');
  assert.ok(a.words.isSaved(eat.w, eat.r), 'and back on the other device: the learner chose to bring it');
});

test('Export, unsave, Import: the word is saved again after the next sync', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a', { at: 0 });
  a.words.save(eat, a.now());
  await a.signIn();
  const backup = a.words.exportList();
  a.tick();
  a.words.unsave(KEY);
  await a.sync.flush();
  a.tick();
  a.words.merge(backup);
  await a.sync.flush();
  const b = device(server, 'user_a', { at: 10 });
  await b.signIn();
  assert.ok(b.words.isSaved(eat.w, eat.r), 'Import is a choice made now');
});

// ── Found by the adversarial review of 2026-10-16 ─────────────────────────

test('Use against a deployment without the words functions still leaves this browser\'s words behind, and they never enter the account', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a', { at: 0, missing: MISSING });
  a.kanji.save('雨', a.now());
  await a.signIn();
  const b = device(server, 'user_a', { at: 2, missing: MISSING });
  b.kanji.save('雪', b.now());
  b.words.save(eat, b.now());
  const q = await b.signIn({ answer: null });
  assert.equal(q.counts.account.words, null, 'the account\'s words are not known, so not counted');
  b.sync.choose('replace');
  b.tick();
  b.words.save({ w: '猫', r: 'ねこ', g: 'cat' }, b.now());   // after the answer: this one stays
  await b.sync.sync('replace');
  assert.ok(!b.words.isSaved(eat.w, eat.r), 'Use left the word saved before the answer behind');
  assert.ok(b.words.isSaved('猫', 'ねこ'), 'and kept the one saved since');
  const later = b.reload({ missing: [] });
  later.tick();
  await later.sync.begin();
  await later.sync.sync('same');
  const keys = server.rowsOf('user_a').words.map((w) => w.key);
  assert.deepEqual(keys, [wordId('猫', 'ねこ')], 'only the word saved since the answer reached the account');
});

test('an Import that changes nothing still counts as saved now, as a kanji\'s does', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a', { at: 0 });
  a.words.save(eat, a.now());
  await a.signIn();
  const backup = a.words.exportList();
  const b = device(server, 'user_a', { at: 1 });
  await b.signIn();
  b.tick(2);
  b.words.unsave(KEY);
  await b.sync.flush();
  a.tick(5);
  a.words.merge(backup);   // a still holds the word, unchanged: the merge changes nothing
  await a.sync.sync('same');
  assert.ok(a.words.isSaved(eat.w, eat.r), 'the Import, made after the unsave, keeps the word');
});

test('a gloss is one canonical line on both sides, so a sync with nothing new applies nothing', async () => {
  assert.equal(cleanWordRow(row({ g: '  to   eat ' })).word.g, 'to eat');
  const server = fakeDb();
  await fakeClient(server, 'user_a').mutation('sync:pushWords', { words: [row({ g: 'to eat ' })] });
  const a = device(server, 'user_a', { at: 0 });
  await a.signIn();
  assert.equal(a.words.byId(KEY).g, 'to eat');
  a.tick();
  const again = await a.sync.sync('same');
  assert.equal(again.applied, false, 'nothing applied a second time');
});

test('the account\'s words are kept whole past the cap on saving here, and a second sync applies nothing', async () => {
  const { MAX_SAVED_WORDS } = await import('../js/word-store.js');
  const server = fakeDb();
  const client = fakeClient(server, 'user_a');
  const kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねの';
  const many = [];
  for (let i = 0; i < MAX_SAVED_WORDS + 10; i += 1) {
    const r = kana[i % 25] + kana[Math.floor(i / 25) % 25] + kana[Math.floor(i / 625) % 25];
    many.push({ key: wordId(r, r), removed: 0, word: { w: r, r, g: 'x', at: T(0), box: 0, due: '2023-11-14', reviews: 0, lapses: 0, s: T(0) } });
  }
  for (let i = 0; i < many.length; i += 200) await client.mutation('sync:pushWords', { words: many.slice(i, i + 200) });
  const a = device(server, 'user_a', { at: 1 });
  await a.signIn();
  assert.equal(a.words.size, MAX_SAVED_WORDS + 10);
  a.tick();
  assert.equal((await a.sync.sync('same')).applied, false);
  assert.equal(a.words.save({ w: '猫', r: 'ねこ', g: 'cat' }, a.now()), false, 'a new save here is still refused past the cap');
});

test('a second tab reads the store again, so its next save keeps the first tab\'s', async () => {
  const { openWords } = await import('../js/word-store.js');
  const { memoryStore } = await import('./helpers/fake-convex.mjs');
  const shared = memoryStore();
  const tab1 = openWords({ store: shared, readRaw: () => null, keepRaw: () => {} }).load();
  const tab2 = openWords({ store: shared, readRaw: () => null, keepRaw: () => {} }).load();
  tab1.save(eat, T(0));
  tab2.load();   // what events-words.js bindWords does on the storage event
  tab2.save({ w: '猫', r: 'ねこ', g: 'cat' }, T(1));
  const third = openWords({ store: shared, readRaw: () => null, keepRaw: () => {} }).load();
  assert.ok(third.isSaved(eat.w, eat.r) && third.isSaved('猫', 'ねこ'));
});
