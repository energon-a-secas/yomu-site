// What the page draws of a kanji's KANJIDIC meanings (reader.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shownMeanings } from '../js/reader.js';
import { dict } from './helpers/disk.mjs';

test('a radical number is left out while another meaning remains', () => {
  assert.deepEqual(shownMeanings(['one', 'one radical (no.1)']), ['one']);
  assert.deepEqual(shownMeanings(['two', 'two radical (no. 7)']), ['two']);
  assert.deepEqual(shownMeanings(['jar', 'jar radical (no. 121)', 'can']), ['jar', 'can']);
});

test('a meaning that is only a radical number stays, and other radicals stay', () => {
  assert.deepEqual(shownMeanings(['jar radical (no. 121)']), ['jar radical (no. 121)']);
  assert.deepEqual(shownMeanings(['root', 'radical']), ['root', 'radical']);
  assert.deepEqual(shownMeanings(['left-side radical']), ['left-side radical']);
  assert.equal(shownMeanings(undefined), undefined);
});

test('一 and 二 as the committed kanji data gives them lose only the index', async () => {
  const got = await dict().kanji(['一', '二']);
  assert.ok(got.get('一').m.some((m) => /radical \(no/.test(m)), 'the data still holds the index');
  assert.deepEqual(shownMeanings(got.get('一').m), got.get('一').m.filter((m) => !/radical \(no/.test(m)));
  assert.ok(!shownMeanings(got.get('二').m).some((m) => /radical/.test(m)));
});
