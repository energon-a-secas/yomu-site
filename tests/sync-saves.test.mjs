// A save keeps its own time through every merge. A review found a save lost
// with every clock correct: B saved 二 at T20, not holding it, and synced
// with a pull first. The join keeps the earlier `at` of two live copies, so
// the store took A's T10; the plan after the merge then saw the same `at` as
// the account's and borrowed the account's `s` (T10). The push carried T10,
// and A's offline unsave at T15 won over a save made after it.
//
// Every save made here is now stamped in the book (`saves`) with its own
// time, or one past the newest removal it knows, and the stamp is forgotten
// only once a push has carried it. A row's `s` is the latest of that stamp
// and what it may borrow, so no merge lowers it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeDb } from './helpers/fake-convex.mjs';
import { device, T } from './helpers/sync-device.mjs';
import { newBook } from '../js/sync-book.js';
import { textKey } from '../js/history-store.js';

const kanjiRow = (server, owner, ch) => server.rowsOf(owner).kanji.find((r) => r.char === ch);
const phraseRow = (server, owner, key) => server.rowsOf(owner).phrases.find((r) => r.key === key);
const offline = () => true;
const online = () => false;

/** A and B on one account; A saves 二 at T10 and syncs, then unsaves it at T15 offline. */
async function savedThenUnsavedOffline() {
  const server = fakeDb();
  const b = device(server, 'user_a', { at: 5 });
  await b.signIn();                                  // B last pulled at T5
  const a = device(server, 'user_a', { at: 6 });
  await a.signIn();
  a.tick(4);
  a.kanji.save('二', a.now());                        // T10
  await a.sync.flush();
  a.tick(5);
  a.failing.on = offline;
  a.kanji.unsave('二');                               // T15, not pushed
  await a.sync.flush().catch(() => {});
  return { server, a, b };
}

test('a save made after another device\'s offline unsave wins, though this device did not hold the kanji', async () => {
  const { server, a, b } = await savedThenUnsavedOffline();
  b.tick(15);
  b.kanji.save('二', b.now());                        // T20
  await b.sync.sync('same');                         // a pull first: the page shown again
  assert.equal(kanjiRow(server, 'user_a', '二').saved.s, T(20), 'the account holds the save at its own time');
  assert.equal(kanjiRow(server, 'user_a', '二').saved.at, T(10), 'shown at the earliest, as before');
  assert.deepEqual(b.books.read().saves.kanji, {}, 'the stamp is forgotten once the push carried it');
  a.tick(10);
  a.failing.on = online;
  await a.sync.sync('same');                         // T25: A's removal (T15) arrives
  await b.sync.sync('same');
  assert.ok(b.kanji.isSaved('二'), 'B\'s save at T20 is later than A\'s unsave at T15');
  assert.ok(a.kanji.isSaved('二'), 'and reached A');
  assert.equal(kanjiRow(server, 'user_a', '二').saved.s, T(20), 'and no sync lowered its time');
});

test('the same when B saved offline and its retry pulls first', async () => {
  const { server, a, b } = await savedThenUnsavedOffline();
  b.tick(15);
  b.failing.on = offline;
  b.kanji.save('二', b.now());                        // T20, B offline too
  await b.sync.flush().catch(() => {});
  assert.equal(b.books.read().saves.kanji['二'], T(20), 'kept until a push carries it');
  b.tick(1);
  b.failing.on = online;
  await b.sync.sync('same');                         // the online event runs a whole sync
  a.tick(10);
  a.failing.on = online;
  await a.sync.sync('same');
  await b.sync.sync('same');
  assert.ok(b.kanji.isSaved('二'));
  assert.ok(a.kanji.isSaved('二'));
  assert.equal(kanjiRow(server, 'user_a', '二').saved.s, T(20));
});

test('a phrase saved after another device\'s offline unsave wins, though this device did not hold it', async () => {
  const server = fakeDb();
  const t = '雨がふる。';
  const key = textKey(t);
  const b = device(server, 'user_a', { at: 5 });
  await b.signIn();
  const a = device(server, 'user_a', { at: 6 });
  await a.signIn();
  a.tick(4);
  a.saveText(t);                                      // T10
  await a.sync.flush();
  a.tick(5);
  a.failing.on = offline;
  a.history.unsave(key, true);                        // T15
  await a.sync.flush().catch(() => {});
  b.tick(15);
  b.saveText(t);                                      // T20
  await b.sync.sync('same');
  assert.equal(phraseRow(server, 'user_a', key).phrase.s, T(20));
  assert.equal(b.history.entry(key).saved, T(10), 'History keeps the earliest save, as before');
  a.tick(10);
  a.failing.on = online;
  await a.sync.sync('same');
  await b.sync.sync('same');
  assert.ok(b.history.isSaved(key));
  assert.ok(a.history.isSaved(key));
});

/** user_b holds 雪 from device W; this browser, last on user_a, answers the question, and its pull fails. */
async function answeredWhileWRemoves(answer) {
  const server = fakeDb();
  const w = device(server, 'user_b', { at: 1 });
  w.kanji.save('雪', w.now());
  await w.signIn();
  const z = device(server, 'user_b', { at: 10 });
  z.books.write(newBook('user_a', T(0), {}));
  z.kanji.save('月', T(2));
  assert.equal((await z.sync.begin()).mode, 'ask');
  z.sync.choose(answer);                             // T10
  z.failing.on = (name) => name === 'sync:pullMeta';
  await assert.rejects(z.sync.sync(answer));
  w.tick(11);
  w.failing.on = offline;
  w.kanji.unsave('雪');                               // T12, not pushed
  await w.sync.flush().catch(() => {});
  z.tick(5);
  z.kanji.save('雪', z.now());                        // T15: after the answer and after W's unsave
  z.tick(1);
  z.failing.on = online;
  await z.sync.sync('same');                         // the retry finishes the answer
  w.tick(10);
  w.failing.on = online;
  await w.sync.sync('same');
  await z.sync.sync('same');
  return { server, w, z };
}

test('a save made after Add was answered, before its retry, keeps its own time', async () => {
  const { server, w, z } = await answeredWhileWRemoves('adopt');
  assert.ok(z.kanji.isSaved('雪'), 'the save at T15 is later than W\'s unsave at T12');
  assert.ok(w.kanji.isSaved('雪'));
  assert.equal(kanjiRow(server, 'user_b', '雪').saved.s, T(15));
});

test('a save made after Use was answered, before its retry, keeps its own time', async () => {
  const { server, w, z } = await answeredWhileWRemoves('replace');
  assert.ok(z.kanji.isSaved('雪'));
  assert.ok(w.kanji.isSaved('雪'));
  assert.equal(kanjiRow(server, 'user_b', '雪').saved.s, T(15));
  assert.equal(z.kanji.isSaved('月'), false, 'Use: what was here at the answer stayed behind');
});
