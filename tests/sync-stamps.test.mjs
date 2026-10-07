// When a save, a removal and a Clear all count as made, for sync
// (js/sync-watch.js stamps them into the book, js/sync-local.js reads the
// stamps back). Two rules, each found by a review:
//
// Import is a choice made now. A save it brings back keeps its backup's
// schedule and counts but counts as saved now, after any removal or Clear
// all this browser knows: restoring a backup after Clear all used to be
// undone by the very next sync, because the imported save kept its old time.
//
// A device's clock may run behind another's. A removal or Clear all made
// here is stamped one past the newest save of that row this browser knows,
// and a save made here one past the newest removal it knows, so what the
// learner just did on the screen is what syncs. Before, a device an hour
// behind could unsave a kanji and see it come straight back.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeDb } from './helpers/fake-convex.mjs';
import { device, today } from './helpers/sync-device.mjs';
import { parseImport } from '../js/kanji-backup.js';
import { textKey } from '../js/history-store.js';

/** Lend History to My kanji, as events-collect.js does, so Export and Import carry the saved phrases. */
function lend(d) {
  d.kanji.lendPhrases({ out: () => d.history.phrases(), merge: (p) => d.history.mergePhrases(p) });
  return d;
}
const backup = (d) => JSON.stringify(d.kanji.exportDoc(today(d)));
function restore(d, file) {
  const r = parseImport(file);
  assert.equal(r.ok, true);
  return d.kanji.merge(r.data);
}
const savedChars = (d) => Object.keys(d.kanji.data.saved).sort();
const schedule = (rec) => rec && { box: rec.box, due: rec.due, reviews: rec.reviews, lapses: rec.lapses };

// ── Import after a removal ────────────────────────────────────────────────

test('Export, Clear all, then Import the same file: the next sync keeps every kanji, with its schedule and counts, here and on another device', async () => {
  const server = fakeDb();
  const a = lend(device(server, 'user_a'));
  for (const ch of ['一', '二', '三']) a.kanji.save(ch, a.now());
  a.read(['一', '二', '三', '四'], { 一: [['一つ', 'ひとつ']] });
  a.tick(1440);
  a.kanji.answer('一', true, today(a));
  a.kanji.answer('二', false, today(a));
  await a.signIn();
  a.tick(5);
  const file = backup(a);
  const before = { 一: schedule(a.kanji.data.saved['一']), 二: schedule(a.kanji.data.saved['二']), seen: a.kanji.seenOf('四') };
  a.kanji.clearAll(a.now());
  await a.sync.flush();
  assert.deepEqual(savedChars(a), []);
  a.tick(1);
  restore(a, file);
  assert.deepEqual(savedChars(a), ['一', '三', '二']);
  await a.sync.flush();
  await a.sync.sync('same');
  assert.deepEqual(savedChars(a), ['一', '三', '二'], 'the sync after Import keeps what it restored');
  assert.deepEqual(schedule(a.kanji.data.saved['一']), before.一, 'its schedule is the backup\'s');
  assert.deepEqual(schedule(a.kanji.data.saved['二']), before.二);
  assert.deepEqual(a.kanji.seenOf('四'), before.seen, 'and so are its counts');
  assert.deepEqual(a.books.read().saves.kanji, {}, 'the stamps are forgotten once the account holds them');
  await a.sync.sync('same');
  assert.deepEqual(savedChars(a), ['一', '三', '二'], 'and the sync after that, with the stamps gone');

  const b = device(server, 'user_a', { at: 1500 });
  await b.signIn();
  assert.deepEqual(savedChars(b), ['一', '三', '二'], 'another device gets them too');
  assert.deepEqual(schedule(b.kanji.data.saved['一']), before.一);
});

test('a phrase brought back by Import after it was unsaved stays saved after the next sync, everywhere', async () => {
  const server = fakeDb();
  const t = '駅はどこですか。';
  const key = textKey(t);
  const a = lend(device(server, 'user_a'));
  a.saveText(t);
  await a.signIn();
  a.tick(2);
  const file = backup(a);
  a.history.unsave(key, true);
  await a.sync.flush();
  assert.equal(a.history.isSaved(key), false);
  a.tick(1);
  restore(a, file);
  assert.equal(a.history.isSaved(key), true);
  await a.sync.flush();
  await a.sync.sync('same');
  assert.equal(a.history.isSaved(key), true, 'the sync after Import keeps the phrase');
  const b = device(server, 'user_a', { at: 10 });
  await b.signIn();
  assert.equal(b.history.isSaved(key), true);
  assert.equal(b.history.savedList()[0].t, t);
});

test('Import while signed out, in a browser that keeps its book, is kept at the next sign-in', async () => {
  const server = fakeDb();
  const a = lend(device(server, 'user_a'));
  a.kanji.save('天', a.now());
  await a.signIn();
  a.tick(1);
  const file = backup(a);
  a.kanji.clearAll(a.now());
  await a.sync.flush();
  a.sync.stop();               // signed out; the book stays
  a.tick(1);
  restore(a, file);
  await a.signIn();
  assert.ok(a.kanji.isSaved('天'));
  assert.ok(server.rowsOf('user_a').kanji.find((r) => r.char === '天' && r.saved));
});

test('a removal made after the Import still removes, here and on another device', async () => {
  const server = fakeDb();
  const a = lend(device(server, 'user_a'));
  a.kanji.save('天', a.now());
  await a.signIn();
  a.tick(1);
  const file = backup(a);
  a.kanji.clearAll(a.now());
  await a.sync.flush();
  a.tick(1);
  restore(a, file);
  await a.sync.flush();
  a.tick(1);
  a.kanji.unsave('天');
  await a.sync.flush();
  await a.sync.sync('same');
  assert.equal(a.kanji.isSaved('天'), false);
  const b = device(server, 'user_a', { at: 10 });
  await b.signIn();
  assert.equal(b.kanji.isSaved('天'), false);
});

test('Import counts as saved now even against a Clear all this browser had not heard of, and its counts follow that clear', async () => {
  const server = fakeDb();
  const a = lend(device(server, 'user_a'));
  a.kanji.save('天', a.now());
  a.read(['天']);
  await a.signIn();
  const file = backup(a);
  const b = device(server, 'user_a', { at: 1 });
  await b.signIn();
  b.tick(5);
  b.kanji.clearAll(b.now());   // T(6), on a device a has not synced with since
  await b.sync.flush();
  a.tick(10);
  restore(a, file);            // T(10): after the clear, by the clocks
  await a.sync.flush();
  await a.sync.sync('same');
  await b.sync.sync('same');
  assert.ok(a.kanji.isSaved('天') && b.kanji.isSaved('天'), 'the save is restored everywhere');
  // A count has no time of its own: one this browser had counted, or brought
  // back, under an older clear goes with the clear (CLAUDE.md, "Clear all").
  assert.equal(a.kanji.seenOf('天'), null);
});

// ── Clocks that disagree ──────────────────────────────────────────────────

test('a device whose clock runs an hour behind unsaves what another saved: it stays unsaved on both', async () => {
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 100 });
  x.kanji.save('天', x.now());              // T(100)
  await x.signIn();
  const y = device(server, 'user_a', { at: 40 });   // later in real time, an hour behind
  await y.signIn();
  assert.ok(y.kanji.isSaved('天'));
  y.tick(1);
  y.kanji.unsave('天');                     // T(41), before the save by the clocks
  assert.ok(y.books.read().removed.kanji['天'] > x.kanji.data.saved['天'].at, 'stamped after the save it removes');
  await y.sync.flush();
  await y.sync.sync('same');
  await x.sync.sync('same');
  assert.equal(y.kanji.isSaved('天'), false, 'the learner just unsaved it here');
  assert.equal(x.kanji.isSaved('天'), false);
});

test('behind, with the account\'s save newer than the one the store shows: the removal still wins', async () => {
  // Saved on Z at T0 and on X at T100: the account holds one save, shown as
  // T0 (the earliest), whose `s` is T100. Y, an hour behind, sees T0 only
  // in its store; the account's copy is what says how late the save is.
  const server = fakeDb();
  const z = device(server, 'user_a', { at: 0 });
  z.kanji.save('天', z.now());
  await z.signIn();
  const x = device(server, 'user_a', { at: 100 });
  x.kanji.save('天', x.now());
  await x.signIn();
  const y = device(server, 'user_a', { at: 40 });
  await y.signIn();
  assert.equal(y.kanji.data.saved['天'].at, z.kanji.data.saved['天'].at);
  y.tick(1);
  y.kanji.unsave('天');
  await y.sync.flush();
  await y.sync.sync('same');
  await x.sync.sync('same');
  await z.sync.sync('same');
  for (const d of [x, y, z]) assert.equal(d.kanji.isSaved('天'), false);
});

test('a Clear all on the device behind empties what the device ahead saved', async () => {
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 100 });
  for (const ch of ['一', '二']) x.kanji.save(ch, x.now());
  await x.signIn();
  const y = device(server, 'user_a', { at: 40 });
  await y.signIn();
  assert.deepEqual(savedChars(y), ['一', '二']);
  y.tick(1);
  y.kanji.clearAll(y.now());
  await y.sync.flush();
  await y.sync.sync('same');
  await x.sync.sync('same');
  assert.deepEqual(savedChars(y), []);
  assert.deepEqual(savedChars(x), []);
});

test('a phrase unsaved on the device behind stays unsaved', async () => {
  const server = fakeDb();
  const t = '天気がいい。';
  const key = textKey(t);
  const x = device(server, 'user_a', { at: 100 });
  x.saveText(t);
  await x.signIn();
  const y = device(server, 'user_a', { at: 40 });
  await y.signIn();
  assert.ok(y.history.isSaved(key));
  y.tick(1);
  y.history.unsave(key, true);
  await y.sync.flush();
  await y.sync.sync('same');
  await x.sync.sync('same');
  assert.equal(y.history.isSaved(key), false);
  assert.equal(x.history.isSaved(key), false);
});

test('the device behind saves again after its own removal or Clear all: the new save stands', async () => {
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 100 });
  for (const ch of ['天', '一']) x.kanji.save(ch, x.now());
  await x.signIn();
  const y = device(server, 'user_a', { at: 40 });
  await y.signIn();
  y.tick(1);
  y.kanji.unsave('天');               // stamped after T(100), ahead of y's clock
  y.tick(1);
  y.kanji.save('天', y.now());       // T(42): after the removal, whatever the clocks say
  await y.sync.flush();
  await y.sync.sync('same');
  assert.ok(y.kanji.isSaved('天'));
  y.tick(1);
  y.kanji.clearAll(y.now());
  y.tick(1);
  y.kanji.save('雨', y.now());
  await y.sync.flush();
  await y.sync.sync('same');
  await x.sync.sync('same');
  assert.deepEqual(savedChars(y), ['雨']);
  assert.deepEqual(savedChars(x), ['雨']);
});

test('the device behind saves what the device ahead removed: the save stands', async () => {
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 100 });
  x.kanji.save('天', x.now());
  await x.signIn();
  x.tick(1);
  x.kanji.unsave('天');               // T(101)
  await x.sync.flush();
  const y = device(server, 'user_a', { at: 40 });
  await y.signIn();
  y.tick(1);
  y.kanji.save('天', y.now());       // T(41), after the removal it pulled
  await y.sync.flush();
  await y.sync.sync('same');
  await x.sync.sync('same');
  assert.ok(y.kanji.isSaved('天'));
  assert.ok(x.kanji.isSaved('天'));
});

// ── Joining an account whose clocks ran ahead ─────────────────────────────
//
// A browser that never synced brings all of its own data when it joins with
// Add (CLAUDE.md). The join used to stamp `joined` at this clock's now, so
// a Clear all or a removal stamped by a device an hour ahead outranked
// everything the joining browser brought, and its first sign-in emptied it
// with nothing on screen to say why. `joined` is now one past the account's
// clear and past its removal of anything the browser brings.

test('a browser that never synced joins after a Clear all stamped an hour ahead: it keeps every kanji it brings', async () => {
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 100 });   // an hour ahead: real time 40
  x.kanji.save('一', x.now());
  await x.signIn();
  x.tick(1);
  x.kanji.clearAll(x.now());                          // stamped T(101), at real T(41)
  await x.sync.flush();
  const z = device(server, 'user_a', { at: 45 });     // a correct clock, real T(45)
  z.kanji.save('天', z.now() - 3 * 60_000);
  z.kanji.save('地', z.now());
  z.read(['地']);
  await z.signIn();
  assert.deepEqual(savedChars(z), ['地', '天'], 'the first sign-in emptied nothing');
  assert.ok(z.books.read().joined > server.rowsOf('user_a').clears[0].at, 'joined after the account\'s clear');
  assert.ok(z.kanji.seenOf('地'), 'and the counts it made came along');
  await x.sync.sync('same');
  assert.deepEqual(savedChars(x), ['地', '天'], 'and the account holds them');
});

test('a browser that never synced joins after a removal stamped an hour ahead: the kanji and the phrase it brings stay saved', async () => {
  const server = fakeDb();
  const t = '天気がいい。';
  const key = textKey(t);
  const x = device(server, 'user_a', { at: 100 });
  x.kanji.save('天', x.now());
  x.saveText(t);
  await x.signIn();
  x.tick(1);
  x.kanji.unsave('天');                               // T(101)
  x.history.unsave(key, true);
  await x.sync.flush();
  const z = device(server, 'user_a', { at: 45 });
  z.kanji.save('天', z.now());
  z.saveText(t);
  await z.signIn();
  assert.ok(z.kanji.isSaved('天'));
  assert.ok(z.history.isSaved(key));
  await x.sync.sync('same');
  assert.ok(x.kanji.isSaved('天'), 'the account took the joining browser\'s kanji');
  assert.ok(x.history.isSaved(key), 'and its phrase');
});

test('a removal of a row the joining browser does not bring leaves `joined` at now', async () => {
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 100 });
  x.kanji.save('雨', x.now());
  await x.signIn();
  x.tick(1);
  x.kanji.unsave('雨');                               // T(101), and this browser never held 雨
  await x.sync.flush();
  const z = device(server, 'user_a', { at: 45 });
  z.kanji.save('天', z.now());
  await z.signIn();
  assert.equal(z.books.read().joined, z.now());
  assert.equal(z.kanji.isSaved('雨'), false);
});
