// The Collections tab's logic (js/sets.js) over the committed data/sets/
// (tools/build-sets.mjs).
//
//   node --test tests/sets.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSets, rowMatches, SET_IDS } from '../js/sets.js';
import { fetchJson, DATA } from './helpers/disk.mjs';

const sets = createSets({ fetchJson, base: `${DATA}/` });

test('every set the tab offers is in the index, and loads whole', async () => {
  const index = await sets.sets();
  assert.deepEqual(index.map((s) => s.id), SET_IDS);
  for (const s of index) assert.equal((await sets.rows(s.id)).length, s.n, s.id);
});

test('each set holds what its name says, common entries first', async () => {
  const yoji = await sets.rows('yoji');
  assert.ok(yoji.some(([w]) => w === '一石二鳥'));
  const firstRare = yoji.findIndex((r) => !r[3]);
  assert.ok(firstRare > 0 && yoji.slice(firstRare).every((r) => !r[3]), 'common first');
  assert.ok((await sets.rows('proverb')).some(([w]) => w === '猿も木から落ちる'));
  const idioms = await sets.rows('idiom');
  assert.ok(idioms.some(([w]) => w === '足を洗う'));
  assert.ok(!idioms.some(([w]) => w === '嵐'), 'one word used figuratively is no idiom');
});

test('the filter reads Japanese, romaji and English', () => {
  const row = ['一石二鳥', 'いっせきにちょう', ['killing two birds with one stone'], 1];
  assert.ok(rowMatches(row, ''));
  assert.ok(rowMatches(row, '鳥'));
  assert.ok(rowMatches(row, 'いっせき'));
  assert.ok(rowMatches(row, 'イッセキ'), 'katakana finds the hiragana reading');
  assert.ok(rowMatches(row, 'issekini'), 'romaji as kana');
  assert.ok(rowMatches(row, 'stone'));
  assert.ok(rowMatches(row, 'two bir'), 'every English word, as the start of a gloss word');
  assert.ok(!rowMatches(row, 'stone cat'));
  assert.ok(!rowMatches(row, '猫'));
});
