// The counters reference (js/counters.js): its readings are numbers.js's, so
// these are the readings a textbook gives, checked through the rows the page
// draws.
//
//   node --test tests/counters.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COUNTER_LIST, counterRow } from '../js/counters.js';
import { COUNTERS } from '../js/numbers.js';

const readings = (c) => counterRow(c).cells.map((x) => x.reading);

test('every counter listed is one the reader knows, once, with what it counts in both languages', () => {
  const seen = new Set();
  for (const { c, what } of COUNTER_LIST) {
    assert.ok(COUNTERS[c], c);
    assert.ok(!seen.has(c), `${c} twice`);
    seen.add(c);
    assert.ok(what.en && what.es, c);
  }
});

test('the sound changes a textbook teaches', () => {
  assert.deepEqual(readings('本'), ['いっぽん', 'にほん', 'さんぼん', 'よんほん', 'ごほん', 'ろっぽん', 'ななほん', 'はっぽん', 'きゅうほん', 'じゅっぽん']);
  assert.deepEqual(readings('人').slice(0, 4), ['ひとり', 'ふたり', 'さんにん', 'よにん']);
  assert.deepEqual(readings('つ'), ['ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ', 'むっつ', 'ななつ', 'やっつ', 'ここのつ', '']);
  assert.equal(readings('日')[0], 'ついたち');
  assert.equal(readings('時')[3], 'よじ');
  assert.equal(counterRow('本').question.reading, 'なんぼん');
  assert.equal(counterRow('つ').question, null, 'いくつ, not 何つ');
});

test('a bend is marked where the reading differs from number plus counter', () => {
  const hon = counterRow('本').cells;
  assert.deepEqual(hon.filter((x) => x.changed).map((x) => x.n), [1, 3, 6, 8, 10]);
  assert.ok(!counterRow('枚').cells.some((x) => x.changed));
});
