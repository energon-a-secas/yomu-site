// The kanji of the day (js/daily.js over data/kpage/daily.json).
//
//   node --test tests/daily.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { dailyIndex, dailyOf, dayNumber } from '../js/daily.js';
import { DATA } from './helpers/disk.mjs';

const doc = JSON.parse(readFileSync(`${DATA}/kpage/daily.json`, 'utf8'));

test('one day, one kanji, the same for everyone', () => {
  assert.equal(dayNumber('1970-01-02'), 1);
  assert.equal(dailyIndex('2026-10-13', 1000), dailyIndex('2026-10-13', 1000));
  const day = dailyOf(doc, '2026-10-13');
  assert.ok(day && day.word.includes(day.ch) && day.reading && day.gloss && day.meaning);
});

test('a thousand days in a row show a thousand different kanji', () => {
  const n = doc.rows.length;
  const start = dayNumber('2026-01-01');
  const seen = new Set();
  for (let d = 0; d < n; d += 1) {
    const day = new Date((start + d) * 86400000).toISOString().slice(0, 10);
    seen.add(dailyIndex(day, n));
  }
  assert.equal(seen.size, n);
});

test('no radical number is shown as a meaning', () => {
  assert.ok(!doc.rows.some((r) => /radical \(no\./.test(r[1])));
});
