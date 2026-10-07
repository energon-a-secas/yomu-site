// What a join stamps. A browser joining an account (a first sign-in, or Add)
// brings its own saves in as saved when it joined, on purpose (CLAUDE.md).
// A review found the join stamping every save the stores held once the
// merge was in, the ones it had just received from the account too, and
// pushing them all back: a removal or a Clear all another device made
// offline before the join, pushed after it, then lost to a save stamped
// later than itself, and nothing reported it. With a clock an hour ahead
// somewhere, the received rows landed an hour in the future as well.
//
// Only the rows this browser brings are stamped, each on its own: the book
// keeps them (`brought`) from the moment the merge is applied, so a retry
// or a reload stamps the same rows again and no others.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeDb } from './helpers/fake-convex.mjs';
import { device, T } from './helpers/sync-device.mjs';
import { textKey } from '../js/history-store.js';

const savedOn = (server) => server.rowsOf('user_a').kanji.filter((r) => r.saved).map((r) => r.char).sort();
const sOf = (server, ch) => server.rowsOf('user_a').kanji.find((r) => r.char === ch).saved.s;
const offline = () => true;
const online = () => false;

test('a first sign-in that brings nothing does not undo an offline unsave made before it', async () => {
  const server = fakeDb();
  const w = device(server, 'user_a', { at: 0 });
  w.kanji.save('地', w.now());
  w.kanji.save('雨', w.now());
  await w.signIn();
  w.tick(40);
  w.failing.on = offline;
  w.kanji.unsave('地');                            // T40, not pushed
  await w.sync.flush().catch(() => {});
  const z = device(server, 'user_a', { at: 45 });   // holds nothing
  await z.signIn();
  assert.equal(sOf(server, '地'), T(0), 'the join sent back nothing it only received');
  w.tick(10);
  w.failing.on = online;
  await w.sync.sync('same');
  assert.equal(w.kanji.isSaved('地'), false, 'the unsave stands');
  assert.deepEqual(savedOn(server), ['雨']);
  await z.sync.sync('same');
  assert.equal(z.kanji.isSaved('地'), false);
});

test('an offline Clear all made before an empty browser\'s first sign-in still clears', async () => {
  const server = fakeDb();
  const w = device(server, 'user_a', { at: 0 });
  for (const ch of ['一', '二', '三']) w.kanji.save(ch, w.now());
  await w.signIn();
  w.tick(40);
  w.failing.on = offline;
  w.kanji.clearAll(w.now());
  await w.sync.flush().catch(() => {});
  const z = device(server, 'user_a', { at: 45 });
  await z.signIn();
  w.tick(10);
  w.failing.on = online;
  await w.sync.sync('same');
  assert.deepEqual(Object.keys(w.kanji.data.saved), []);
  await z.sync.sync('same');
  assert.deepEqual(Object.keys(z.kanji.data.saved), [], 'and the browser that joined in between heard it');
});

test('an offline phrase unsave made before an empty browser\'s first sign-in stays unsaved', async () => {
  const server = fakeDb();
  const t = '雨がふる。';
  const w = device(server, 'user_a', { at: 0 });
  w.saveText(t);
  await w.signIn();
  w.tick(40);
  w.failing.on = offline;
  w.history.unsave(textKey(t), true);
  await w.sync.flush().catch(() => {});
  const z = device(server, 'user_a', { at: 45 });
  await z.signIn();
  w.tick(10);
  w.failing.on = online;
  await w.sync.sync('same');
  assert.equal(w.history.isSaved(textKey(t)), false);
  await z.sync.sync('same');
  assert.equal(z.history.isSaved(textKey(t)), false);
});

test('a row the account sent to the joining browser keeps its own stamp, however far ahead the join is', async () => {
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 60 });   // real T0, an hour ahead
  x.kanji.save('天', x.now());
  await x.signIn();
  const w = device(server, 'user_a', { at: 20 });   // correct
  w.kanji.save('地', w.now());
  await w.signIn();
  x.tick(41);
  x.kanji.unsave('天');                              // stamped T101 at real T41
  await x.sync.flush();
  // Correct, never synced, and it brings 天 only.
  const z = device(server, 'user_a', { at: 45 });
  z.kanji.save('天', z.now());
  await z.signIn();
  assert.ok(z.kanji.isSaved('天'), 'what it brought stays saved');
  assert.ok(sOf(server, '天') > T(101), 'stamped past the removal it outlived');
  assert.equal(sOf(server, '地'), T(20), 'what it received kept its own stamp');
  assert.equal(z.books.read().brought.kanji['地'], undefined);
  w.tick(30);                                       // real T50
  w.kanji.unsave('地');
  await w.sync.flush();
  w.tick(1);
  await w.sync.sync('same');
  assert.equal(w.kanji.isSaved('地'), false, 'a correct clock\'s unsave after the join stands');
});

test('each row the joining browser brings is stamped on its own: a removal stamped ahead moves no other', async () => {
  const server = fakeDb();
  const w = device(server, 'user_a', { at: 0 });
  w.kanji.save('地', w.now());
  await w.signIn();
  const x = device(server, 'user_a', { at: 100 });  // an hour ahead: real T40
  x.kanji.save('天', x.now());
  await x.signIn();
  x.tick(1);
  x.kanji.unsave('天');                              // stamped T101 at real T41
  await x.sync.flush();
  const z = device(server, 'user_a', { at: 45 });
  z.kanji.save('天', z.now());
  z.kanji.save('地', z.now());
  await z.signIn();
  assert.ok(sOf(server, '天') > T(101));
  assert.equal(sOf(server, '地'), T(45), '地 joined when the browser did, not past 天\'s removal');
  w.tick(50);                                       // real T50
  w.kanji.unsave('地');
  await w.sync.flush();
  w.tick(1);
  await w.sync.sync('same');
  assert.equal(w.kanji.isSaved('地'), false, 'the unsave of 地 at T50 stands');
  assert.deepEqual(savedOn(server), ['天']);
});

test('a join whose push failed is finished by the next sync, stamping the same rows and no others', async () => {
  const server = fakeDb();
  const w = device(server, 'user_a', { at: 0 });
  w.kanji.save('地', w.now());
  await w.signIn();
  w.tick(40);
  w.failing.on = offline;
  w.kanji.unsave('地');                            // T40, not pushed
  await w.sync.flush().catch(() => {});
  const z = device(server, 'user_a', { at: 45 });
  z.kanji.save('天', z.now());
  z.failing.on = (name) => name === 'sync:push';
  await assert.rejects(z.signIn());
  const book = z.books.read();
  assert.deepEqual(Object.keys(book.brought.kanji), ['天'], 'the book names what this browser brought');
  assert.ok(z.kanji.isSaved('地'), 'the merge is in');
  z.tick(5);
  z.failing.on = online;
  await z.sync.sync('same');
  assert.equal(sOf(server, '天'), T(45));
  assert.equal(sOf(server, '地'), T(0), 'the retry sent back nothing it only received');
  w.tick(10);
  w.failing.on = online;
  await w.sync.sync('same');
  assert.deepEqual(savedOn(server), ['天']);
});

test('an unsave made signed out, with no pull since, outranks the join stamp of the row it removes', async () => {
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 100 });  // an hour ahead
  x.kanji.save('天', x.now());
  await x.signIn();
  x.tick(1);
  x.kanji.unsave('天');                              // T101
  await x.sync.flush();
  const z = device(server, 'user_a', { at: 45 });
  z.kanji.save('天', z.now());
  await z.signIn();
  assert.ok(sOf(server, '天') > T(101));
  z.sync.stop();                                    // signed out
  z.tick(5);
  z.kanji.unsave('天');                              // T50 by this clock
  await z.signIn();
  assert.equal(z.kanji.isSaved('天'), false);
  assert.deepEqual(savedOn(server), [], 'the unsave reached the account');
});

// A first sign-in keeps its join in the book from the moment it is decided,
// pending, the way an answer to the account question is kept. A review found
// that a first pull that failed wrote nothing, so an unsave made while the
// line said Yomu would try again was recorded nowhere, and the retry brought
// the account's copy back.

test('a first sign-in whose pull fails: an unsave made before the retry stands, here and in the account', async () => {
  const server = fakeDb();
  const w = device(server, 'user_a', { at: 0 });
  w.kanji.save('天', w.now());
  await w.signIn();
  const z = device(server, 'user_a', { at: 10 });
  z.kanji.save('天', z.now());
  z.kanji.save('地', z.now());
  z.failing.on = (name) => name === 'sync:pullMeta';
  await assert.rejects(z.signIn());
  z.tick(5);
  z.kanji.unsave('天');                              // T15, signed in, before the retry
  assert.ok(z.books.read().removed.kanji['天'], 'the removal is in the pending join');
  z.failing.on = online;
  z.tick(1);
  await z.sync.sync('adopt');                       // the retry continues the join
  assert.equal(z.kanji.isSaved('天'), false, 'the unsave stands here');
  assert.deepEqual(savedOn(server), ['地'], 'and in the account');
  assert.equal(z.books.read().pending, undefined, 'the join is finished');
});

test('a first sign-in whose pull fails: a save another device made in between does not undo a later unsave here', async () => {
  const server = fakeDb();
  const z = device(server, 'user_a', { at: 10 });
  z.kanji.save('天', z.now());
  z.kanji.save('地', z.now());
  z.failing.on = (name) => name === 'sync:pullPhrases';
  await assert.rejects(z.signIn());
  const w = device(server, 'user_a', { at: 12 });
  w.kanji.save('天', w.now());                       // T12, in the account before the retry
  await w.signIn();
  z.tick(5);
  z.kanji.unsave('天');                              // T15
  z.failing.on = online;
  z.tick(1);
  await z.sync.sync('same');                        // account.js retries the step that failed
  assert.equal(z.kanji.isSaved('天'), false);
  assert.deepEqual(savedOn(server), ['地']);
  await w.sync.sync('same');
  assert.equal(w.kanji.isSaved('天'), false, 'the unsave at T15 is the last action');
});
