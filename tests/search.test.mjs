// Search (js/search.js) over the committed data, read from disk the way the
// page fetches it, and data/search/ (tools/build-search.mjs).
//
//   node --test tests/search.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSearch, queryKind, byParts, glossWords, japaneseKeys,
} from '../js/search.js';
import { dict, fetchJson, DATA } from './helpers/disk.mjs';

const s = createSearch({ dict: dict(), fetchJson, base: `${DATA}/` });
const keys = async (q) => (await s.search(q)).words.map((w) => w.key);

test('a query is Japanese, romaji, English or empty', () => {
  assert.equal(queryKind(''), 'empty');
  assert.equal(queryKind('  '), 'empty');
  assert.equal(queryKind('食べる'), 'ja');
  assert.equal(queryKind('taberu'), 'romaji');
  assert.equal(queryKind('eat'), 'en');
  assert.equal(queryKind('hot water'), 'en');
});

test('a gloss and a query split into the same words', () => {
  assert.deepEqual(glossWords('to eat (e.g. a meal)'), ['eat']);
  assert.deepEqual(glossWords("one's own HOME"), ['own', 'home']);
});

test('Japanese: as typed, in either script, and back to its dictionary form', async () => {
  assert.ok((await keys('食べた')).includes('食べる'));
  assert.ok((await keys('ねこ')).includes('ねこ'));
  assert.ok(japaneseKeys('ねこ').keys.includes('ネコ'));
  const went = (await s.search('行った')).words.find((w) => w.key === '行く');
  assert.ok(went && went.via === 'form');
  assert.ok(!(await keys('行った')).includes('行る'), 'a form the record does not admit is no result');
});

test('nothing common: the rare words, then the names', async () => {
  const tanaka = (await s.search('田中')).words;
  assert.ok(tanaka.some((w) => w.via === 'name'));
});

test('romaji is searched as kana, and as English when it is both', async () => {
  assert.equal((await keys('taberu'))[0], 'たべる');
  const sake = await keys('sake');
  assert.equal(sake[0], 'さけ');
  assert.ok(sake.includes('日本酒'), 'sake is English too');
});

test('English: the word a gloss leads with, first; several words keep what they share', async () => {
  const eat = await keys('eat');
  assert.equal(eat[0], '食べる');
  assert.ok(!eat.includes('たべる'), 'one word is one result, not its kana key too');
  assert.ok((await keys('cat')).includes('猫'));
  const hot = await keys('hot water');
  assert.equal(hot[0], '湯');
  assert.ok((await s.search('tree')).kanji.includes('木'));
  assert.deepEqual(await keys('qwxzv'), []);
});

test('kanji by parts: every chosen part, at any depth, and only parts that still lead somewhere', async () => {
  const data = await s.loadParts();
  assert.ok(data.list.length > 200);
  const both = byParts(['口', '言'], data);
  assert.ok(both.kanji.includes('語'), '語 is 言 and 吾, and 吾 has 口');
  assert.ok(both.kanji.every((ch) => data.map.get('口').includes(ch) && data.map.get('言').includes(ch)));
  assert.ok(both.open.has('口') && both.open.has('言'));
  const inResult = new Set(both.kanji);
  assert.ok([...both.open].every((p) => data.map.get(p).some((ch) => inResult.has(ch))));
  assert.deepEqual(byParts([], data), { kanji: [], open: null });
});
