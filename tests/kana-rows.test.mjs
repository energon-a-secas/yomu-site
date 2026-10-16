// The kana rows a text uses (js/kana-rows.js), and the phrase library read
// through them: "Only phrases I can read".
//
//   node --test tests/kana-rows.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { KANA_ROWS, rowOf, rowsOf, missingRows, canRead } from '../js/kana-rows.js';

test('a kana belongs to its row in either script: voiced to plain, small to big, っ to た, ん to わ', () => {
  assert.equal(rowOf('が'), 'か');
  assert.equal(rowOf('パ'), 'は');
  assert.equal(rowOf('ゃ'), 'や');
  assert.equal(rowOf('ッ'), 'た');
  assert.equal(rowOf('ん'), 'わ');
  assert.equal(rowOf('ー'), null, 'the bar repeats a vowel and has no row');
  assert.equal(rowOf('雨'), null);
  assert.deepEqual(rowsOf('きょうはあめがふっています'), ['あ', 'か', 'さ', 'た', 'は', 'ま', 'や']);
  assert.deepEqual(missingRows('かさをもってでかけましょう', ['あ', 'か', 'さ', 'た', 'は', 'ま']), ['や', 'わ']);
});

test('the phrase library: every phrase with every row, none with none, and a few with the first five', () => {
  const lib = JSON.parse(readFileSync(new URL('../data/phrases/library.json', import.meta.url), 'utf8'));
  const phrases = lib.phrases;
  assert.ok(phrases.length > 50);
  assert.ok(phrases.every((p) => canRead(p, KANA_ROWS)), 'every phrase is spelled in the chart\'s rows');
  assert.ok(phrases.every((p) => !canRead(p, [])));
  const five = phrases.filter((p) => canRead(p, ['あ', 'か', 'さ', 'た', 'な']));
  for (const p of five) assert.deepEqual(missingRows(p.kana, ['あ', 'か', 'さ', 'た', 'な']), [], p.ja);
});
