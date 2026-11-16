// Deleting an account's data (convex/model/sync.ts erase, js/sync.js
// eraseAll): everything of the caller's goes from every table, nobody
// else's is touched, a large account goes in batches, and a caller with no
// identity is refused. The handlers are the real ones, over the in-memory
// database (helpers/fake-convex.mjs).
//
//   node --test tests/sync-erase.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeDb, fakeClient } from './helpers/fake-convex.mjs';
import { device } from './helpers/sync-device.mjs';
import { eraseAll, FN, SyncError } from '../js/sync.js';
import { ERASE_BATCH } from '../convex/model/sync.ts';

const count = (rows) => Object.values(rows).reduce((n, list) => n + list.length, 0);

async function filled(server, subject) {
  const d = device(server, subject);
  d.kanji.save('日', d.now());
  d.kanji.save('雨', d.now());
  d.read(['本'], { 本: [['本', 'ほん']] });
  d.saveText('今日は雨です。');
  d.words.save({ w: '食べる', r: 'たべる', g: 'to eat' }, d.now());
  d.play.finish('which', 7);
  d.tick();
  d.setPref('romaji', 'off');
  await d.signIn();
  // A Clear all is the account's only once the device has joined it
  // (convex/README.md): made now, it leaves the account its one clears row.
  d.tick();
  d.kanji.clearAll(d.now());
  d.tick();
  d.kanji.save('日', d.now());
  d.kanji.save('雨', d.now());
  await d.sync.sync('same');
  return d;
}

test('erase takes every row of the caller, in every table, and nobody else\'s', async () => {
  const server = fakeDb();
  await filled(server, 'user_a');
  await filled(server, 'user_b');
  const before = server.rowsOf('user_a');
  for (const table of ['kanji', 'phrases', 'words', 'play', 'prefs', 'clears']) {
    assert.ok(before[table].length > 0, `the account holds ${table} before`);
  }
  const theirs = JSON.stringify(server.rowsOf('user_b'));

  const client = fakeClient(server, 'user_a');
  const deleted = await eraseAll(client);
  assert.equal(deleted, count(before));
  assert.equal(count(server.rowsOf('user_a')), 0);
  assert.equal(JSON.stringify(server.rowsOf('user_b')), theirs, 'another account keeps every row');
  assert.deepEqual(client.calls.map((c) => [c.kind, c.name]), [['mutation', FN.erase]]);

  // Again, on what is now an empty account: nothing to delete, and it says so.
  assert.equal(await eraseAll(client), 0);
});

test('a device that signs in after the erase finds an empty account', async () => {
  const server = fakeDb();
  await filled(server, 'user_a');
  await eraseAll(fakeClient(server, 'user_a'));
  const fresh = device(server, 'user_a');
  await fresh.signIn();
  assert.equal(Object.keys(fresh.kanji.data.saved).length, 0);
  assert.equal(fresh.history.savedList().length, 0);
  assert.equal(fresh.words.list().length, 0);
});

test('an account larger than one batch goes in several calls, each within the batch', async () => {
  const server = fakeDb();
  const rows = ERASE_BATCH * 2 + 37;
  for (let i = 0; i < rows; i += 1) {
    await server.db.insert('kanji', { owner: 'user_a', char: String.fromCodePoint(0x4e00 + i), removed: 0, saved: null, seen: null });
  }
  await server.db.insert('play', { owner: 'user_a', games: {}, mixed: [] });
  await server.db.insert('kanji', { owner: 'user_b', char: '日', removed: 0, saved: null, seen: null });

  const client = fakeClient(server, 'user_a');
  const first = await client.mutation(FN.erase, {});
  assert.deepEqual(first, { ok: true, deleted: ERASE_BATCH, done: false });
  assert.equal(server.rowsOf('user_a').play.length, 1, 'the single rows wait for the last call');

  const deleted = await eraseAll(client);
  assert.equal(deleted, rows - ERASE_BATCH + 1);
  assert.equal(count(server.rowsOf('user_a')), 0);
  assert.equal(server.rowsOf('user_b').kanji.length, 1);
  assert.ok(client.calls.length >= 3);
});

test('an account of exactly one batch is done on the call that finds nothing left', async () => {
  const server = fakeDb();
  for (let i = 0; i < ERASE_BATCH; i += 1) {
    await server.db.insert('words', { owner: 'user_a', key: `k${String(i).padStart(5, '0')}`, removed: 0, word: null });
  }
  const client = fakeClient(server, 'user_a');
  assert.equal(await eraseAll(client), ERASE_BATCH);
  assert.equal(client.calls.length, 2, 'a full batch cannot say it was the last');
  assert.equal(count(server.rowsOf('user_a')), 0);
});

test('no identity, no erase: the call is refused and nothing is deleted', async () => {
  const server = fakeDb();
  await filled(server, 'user_a');
  const before = JSON.stringify(server.rowsOf('user_a'));
  const anonymous = fakeClient(server, null);
  assert.deepEqual(await anonymous.mutation(FN.erase, {}), { ok: false, error: 'not-authenticated', deleted: 0, done: false });
  await assert.rejects(eraseAll(anonymous), (err) => err instanceof SyncError && err.code === 'not-authenticated');
  assert.equal(JSON.stringify(server.rowsOf('user_a')), before);
});

test('a lost connection in the middle leaves the rest for the next try', async () => {
  const server = fakeDb();
  for (let i = 0; i < ERASE_BATCH + 5; i += 1) {
    await server.db.insert('kanji', { owner: 'user_a', char: String.fromCodePoint(0x4e00 + i), removed: 0, saved: null, seen: null });
  }
  let calls = 0;
  const flaky = fakeClient(server, 'user_a', { fail: () => { calls += 1; return calls === 2; } });
  await assert.rejects(eraseAll(flaky), TypeError);
  assert.equal(server.rowsOf('user_a').kanji.length, 5);
  assert.equal(await eraseAll(flaky), 5);
  assert.equal(count(server.rowsOf('user_a')), 0);
});
