// My progress (js/progress.js): every figure from the stores as they are.
//
//   node --test tests/progress.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { progressOf, newByTime, periodStart, MONTHS } from '../js/progress.js';

const joyo = {
  total: 4,
  gradeOf: new Map([['一', 1], ['二', 1], ['三', 1], ['語', 2]]),
  grades: [{ grade: 1, chars: ['一', '二', '三'] }, { grade: 2, chars: ['語'] }],
};
const ms = (day) => new Date(`${day}T12:00:00`).getTime();
const kanji = {
  seen: {
    一: { n: 3, first: '2026-10-01', last: '2026-10-14', words: [] },
    二: { n: 1, first: '2026-10-13', last: '2026-10-13', words: [] },
    語: { n: 2, first: '2026-08-20', last: '2026-09-01', words: [] },
  },
  saved: {
    一: { at: ms('2026-10-12'), box: 2, due: '2026-10-16', reviews: 3, lapses: 0 },
    語: { at: ms('2026-08-21'), box: 0, due: '2026-10-14', reviews: 0, lapses: 0 },
  },
};
const entries = { a: { first: ms('2026-10-10'), last: ms('2026-10-14') }, b: { first: ms('2026-09-01'), last: ms('2026-09-02') } };

test('a week counts what happened in its seven days, ending today', () => {
  const p = progressOf({ kanji, entries, joyo, today: '2026-10-14', period: 'week', due: 1 });
  assert.equal(periodStart('2026-10-14', 'week'), '2026-10-08');
  assert.deepEqual([p.texts, p.met, p.fresh, p.saved], [1, 2, 1, 1]);
  assert.equal(p.bars.length, 7);
  assert.deepEqual(p.bars.map((b) => b.n), [0, 0, 0, 0, 0, 1, 0]);
  assert.deepEqual(p.boxes, [1, 0, 1, 0, 0, 0]);
  assert.deepEqual(p.grades.map((g) => [g.grade, g.have, g.total]), [[1, 2, 3], [2, 1, 1]]);
  assert.deepEqual(p.next, ['三'], 'the lowest shelf not complete, in its order');
});

test('all time counts everything, by month from the first kanji met', () => {
  const p = progressOf({ kanji, entries, joyo, today: '2026-10-14', period: 'all' });
  assert.deepEqual([p.texts, p.met, p.fresh, p.saved], [2, 3, 3, 2]);
  assert.deepEqual(p.bars, [{ label: '2026-08', n: 1 }, { label: '2026-09', n: 0 }, { label: '2026-10', n: 2 }]);
  assert.ok(newByTime({ x: { n: 1, first: '2020-01-01', last: '2020-01-01' } }, '2026-10-14', 'all').length === MONTHS);
});

test('nothing read yet draws zeros, and the shelves wait for the list', () => {
  const p = progressOf({ kanji: { seen: {}, saved: {} }, today: '2026-10-14', period: 'month' });
  assert.equal(p.bars.length, 30);
  assert.ok(p.bars.every((b) => b.n === 0));
  assert.equal(p.grades, null);
  assert.deepEqual(p.next, []);
});
