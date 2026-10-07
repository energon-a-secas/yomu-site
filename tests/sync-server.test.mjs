// The Convex handlers (convex/model/sync.ts) over an in-memory database:
// who may call them, whose rows each caller reaches, and that a push writes
// only what the stored rows lack. The same calls run on the dev deployment
// with `npx convex run --identity` (convex/README.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeDb, fakeClient } from './helpers/fake-convex.mjs';
import { MAX_KANJI } from '../convex/model/sync.ts';
import { textKey } from '../js/history-text.js';

const T = (n) => 1_700_000_000_000 + n * 1000;
const kanjiRow = (char, fields = {}) => ({ char, saved: null, removed: 0, seen: null, ...fields });
const saved = (at) => ({ at, box: 0, due: '2026-10-07', reviews: 0, lapses: 0, s: at });
const seen = (n, e = 0) => ({ n, first: '2026-10-01', last: '2026-10-07', words: [['天気', 'てんき', '2026-10-07']], src: 'paste', e });

test('every function refuses a caller with no identity, and whoami says null', async () => {
  const server = fakeDb();
  const anon = fakeClient(server, null);
  assert.equal(await anon.query('sync:whoami', {}), null);
  for (const [kind, name, args] of [
    ['query', 'sync:pullKanji', { cursor: null }],
    ['query', 'sync:pullPhrases', { cursor: null }],
    ['query', 'sync:pullMeta', {}],
    ['mutation', 'sync:push', { kanji: [kanjiRow('天', { saved: saved(T(1)) })] }],
  ]) {
    const res = await anon[kind](name, args);
    assert.equal(res.ok, false, name);
    assert.equal(res.error, 'not-authenticated', name);
  }
  assert.equal(server.writes, 0, 'nothing was written');
});

test('user_b never reads or changes user_a\'s rows', async () => {
  const server = fakeDb();
  const a = fakeClient(server, 'user_a');
  const b = fakeClient(server, 'user_b');
  const t = '駅はどこですか。';
  await a.mutation('sync:push', {
    kanji: [kanjiRow('天', { saved: saved(T(1)), seen: seen(2) })],
    phrases: [{ key: textKey(t), removed: 0, phrase: { t, first: T(1), last: T(1), n: 1, src: 'paste', saved: T(1), s: T(1) } }],
    play: { games: { which: { best: 7, rounds: 2 } }, mixed: [] },
    prefs: { values: { lang: { v: 'es', at: T(1) } } },
    clear: T(0.5),
  });
  assert.deepEqual((await b.query('sync:pullKanji', { cursor: null })).rows, []);
  assert.deepEqual((await b.query('sync:pullPhrases', { cursor: null })).rows, []);
  const meta = await b.query('sync:pullMeta', {});
  assert.deepEqual([meta.play, meta.prefs, meta.clear], [null, null, 0]);
  // user_b writing the same kanji makes a row of its own.
  await b.mutation('sync:push', { kanji: [kanjiRow('天', { removed: T(12) })], clear: T(9) });
  const rowsA = (await a.query('sync:pullKanji', { cursor: null })).rows;
  assert.equal(rowsA.length, 1);
  assert.ok(rowsA[0].saved, 'user_b\'s removal and clear did not reach user_a');
  assert.equal(server.rowsOf('user_a').kanji.length, 1);
  assert.equal(server.rowsOf('user_b').kanji.length, 1);
  assert.ok(!JSON.stringify(server.rowsOf('user_b')).includes(t));
});

test('a push writes only what the stored rows lack: the same push twice writes nothing', async () => {
  const server = fakeDb();
  const a = fakeClient(server, 'user_a');
  const args = { kanji: [kanjiRow('天', { saved: saved(T(1)), seen: seen(2) }), kanjiRow('雨', { seen: seen(1) })] };
  const first = await a.mutation('sync:push', args);
  assert.equal(first.wrote, 2);
  const again = await a.mutation('sync:push', args);
  assert.equal(again.wrote, 0);
  const less = await a.mutation('sync:push', { kanji: [kanjiRow('天', { seen: seen(1) })] });
  assert.equal(less.wrote, 0, 'a copy with less in it changes nothing');
});

test('a row the rules cannot read is skipped and counted, and too many rows are refused', async () => {
  const server = fakeDb();
  const a = fakeClient(server, 'user_a');
  const res = await a.mutation('sync:push', { kanji: [kanjiRow('a', { seen: seen(1) }), kanjiRow('天', { seen: seen(1) })] });
  assert.equal(res.skipped, 1);
  assert.equal(res.wrote, 1);
  const many = Array.from({ length: MAX_KANJI + 1 }, () => kanjiRow('天', { seen: seen(1) }));
  assert.equal((await a.mutation('sync:push', { kanji: many })).ok, false);
});

test('a Clear all reaches every row: what it covers is not pulled again, and a stale copy pushed later stays out', async () => {
  const server = fakeDb();
  const a = fakeClient(server, 'user_a');
  await a.mutation('sync:push', { kanji: [kanjiRow('天', { saved: saved(T(1)), seen: seen(4) }), kanjiRow('雨', { seen: seen(2) })] });
  await a.mutation('sync:push', { clear: T(5), kanji: [kanjiRow('雪', { saved: saved(T(6)), seen: seen(1, T(5)) })] });
  const rows = (await a.query('sync:pullKanji', { cursor: null })).rows;
  assert.deepEqual(rows.map((r) => r.char), ['雪']);
  // A device that never heard of the clear pushes its old counts.
  const stale = await a.mutation('sync:push', { kanji: [kanjiRow('天', { saved: saved(T(1)), seen: seen(9, 0) })] });
  assert.equal(stale.clear, T(5));
  assert.deepEqual((await a.query('sync:pullKanji', { cursor: null })).rows.map((r) => r.char), ['雪']);
  assert.equal(server.rowsOf('user_a').kanji.length, 2, 'the stale row touched was deleted: 雨 is left until a push touches it');
});

test('pulls come in pages, and every row arrives once', async () => {
  const server = fakeDb();
  const a = fakeClient(server, 'user_a');
  const chars = Array.from({ length: 900 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  for (let i = 0; i < chars.length; i += MAX_KANJI) {
    await a.mutation('sync:push', { kanji: chars.slice(i, i + MAX_KANJI).map((c) => kanjiRow(c, { seen: seen(1) })) });
  }
  const got = [];
  let cursor = null;
  for (;;) {
    const page = await a.query('sync:pullKanji', { cursor });
    got.push(...page.rows.map((r) => r.char));
    if (page.done) break;
    cursor = page.cursor;
  }
  assert.equal(got.length, 900);
  assert.equal(new Set(got).size, 900);
});
