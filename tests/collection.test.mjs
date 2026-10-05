// The kanji collection under plain node: the jōyō list as the page reads it,
// what counts as collected, the shelves' progress, the kanji to look out
// for, and the milestones a read crosses. The list is the committed
// data/kanji/joyo.json; the logic cases use a list of a few kanji so each
// rule is visible.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  parseJoyo, loadJoyo, resetJoyo, progress, nextToCollect, crossed, MILESTONES, GRADES, JOYO_SRC,
} from '../js/collection.js';

const COMMITTED = JSON.parse(await readFile(new URL('../data/kanji/joyo.json', import.meta.url), 'utf8'));

/** A list of three grades' worth of kanji, the rest of the grades one kanji each. */
function smallDoc(over = {}) {
  const grades = { 1: '日一人', 2: '国会', 3: '事', 4: '議', 5: '政', 6: '党', 8: '歳', ...over };
  const count = Object.values(grades).reduce((n, s) => n + [...s].length, 0);
  return { format: 'yomu-joyo/1', count, grades };
}
const SMALL = parseJoyo(smallDoc());

/** A seen map as the kanji store keeps it. */
function seenOf(pairs) {
  const out = {};
  for (const [ch, n, last = '2026-10-01'] of pairs) out[ch] = { n, first: '2026-09-01', last, words: [] };
  return out;
}

beforeEach(() => resetJoyo());

// ── The list ──────────────────────────────────────────────────────────────

test('the committed list reads as seven grades of the 2010 sizes, 2,136 kanji', () => {
  const joyo = parseJoyo(COMMITTED);
  assert.deepEqual(joyo.grades.map((g) => g.grade), [...GRADES]);
  assert.deepEqual(joyo.grades.map((g) => g.chars.length), [80, 160, 200, 202, 193, 191, 1110]);
  assert.equal(joyo.total, 2136);
  assert.equal(joyo.gradeOf.get('雨'), 1);
  assert.equal(joyo.gradeOf.get('鬱'), 8);
  assert.equal(joyo.gradeOf.has('鰻'), false, 'not jōyō');
  // A kanji outside the BMP is one character, not two halves.
  assert.equal(joyo.gradeOf.get('𠮟'), 8);
  assert.equal(joyo.grades[0].chars[0], '日', 'grade 1 starts with the most frequent');
});

test('a list that is not a yomu-joyo/1 document is refused, naming the file', () => {
  const bad = [
    null,
    [],
    { ...smallDoc(), format: 'yomu-joyo/2' },
    { format: 'yomu-joyo/1', count: 0 },
    smallDoc({ 3: '' }),
    smallDoc({ 1: '日一a' }),
    smallDoc({ 2: '国日' }),
    { ...smallDoc(), count: 99 },
    { ...smallDoc(), grades: { ...smallDoc().grades, 7: '七' } },
  ];
  for (const doc of bad) {
    assert.throws(() => parseJoyo(doc), (err) => err.message.startsWith(`${JOYO_SRC}: `), JSON.stringify(doc));
  }
});

test('the list is fetched once per page, and a failure is not kept', async () => {
  let calls = 0;
  const ok = async (src) => { calls += 1; assert.equal(src, JOYO_SRC); return smallDoc(); };
  const [a, b] = await Promise.all([loadJoyo(ok), loadJoyo(ok)]);
  assert.equal(a, b);
  assert.equal(calls, 1);
  assert.equal(await loadJoyo(ok), a);
  assert.equal(calls, 1);

  resetJoyo();
  let tries = 0;
  const flaky = async () => { tries += 1; if (tries === 1) throw new Error('offline'); return smallDoc(); };
  await assert.rejects(loadJoyo(flaky), /offline/);
  const again = await loadJoyo(flaky);
  assert.equal(tries, 2, 'the retry fetched again');
  assert.equal(again.total, SMALL.total);
});

// ── Progress ──────────────────────────────────────────────────────────────

test('collected means met in a text at least once, shelf by shelf', () => {
  const p = progress(SMALL, seenOf([['日', 3], ['一', 1], ['国', 2], ['人', 0]]));
  assert.equal(p.total, SMALL.total);
  assert.equal(p.have, 3, 'n 0 is not collected');
  assert.deepEqual(p.byGrade[0], { grade: 1, total: 3, have: 2, complete: false });
  assert.deepEqual(p.byGrade[1], { grade: 2, total: 2, have: 1, complete: false });
  assert.deepEqual(progress(SMALL, seenOf([['日', 1], ['一', 1], ['人', 1]])).byGrade[0].complete, true);
});

test('kanji outside the list go to Extra, most seen first, then the latest met', () => {
  const p = progress(SMALL, seenOf([['鰻', 2, '2026-09-01'], ['薔', 5], ['鯖', 2, '2026-09-30'], ['日', 9], ['鮭', 2, '2026-09-30']]));
  assert.deepEqual(p.extra, ['薔', '鮭', '鯖', '鰻']);
  assert.equal(p.have, 1);
  assert.deepEqual(progress(SMALL, {}).extra, []);
});

test('the kanji to look out for: the first uncollected, in list order, on the lowest shelf not complete', () => {
  assert.deepEqual(nextToCollect(SMALL, {}), ['日', '一', '人']);
  assert.deepEqual(nextToCollect(SMALL, seenOf([['一', 1]]), 2), ['日', '人']);
  assert.deepEqual(nextToCollect(SMALL, seenOf([['日', 1], ['一', 1], ['人', 1]])), ['国', '会']);
  const all = seenOf([...SMALL.gradeOf.keys()].map((ch) => [ch, 1]));
  assert.deepEqual(nextToCollect(SMALL, all), []);
  const real = parseJoyo(COMMITTED);
  assert.deepEqual(nextToCollect(real, {}, 6), real.grades[0].chars.slice(0, 6));
});

// ── Milestones ────────────────────────────────────────────────────────────

test('the milestones are the counts the toast names, ending at the whole list', () => {
  assert.deepEqual([...MILESTONES], [10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 2136]);
});

test('a read crosses the counts it passes and the grades it completes, and nothing else', () => {
  const at = (have, complete = []) => ({ have, byGrade: GRADES.map((grade) => ({ grade, complete: complete.includes(grade) })) });
  assert.deepEqual(crossed(at(9), at(10)), { counts: [10], grades: [] });
  assert.deepEqual(crossed(at(8), at(30, [1])), { counts: [10, 25], grades: [1] });
  assert.deepEqual(crossed(at(10, [1]), at(12, [1])), { counts: [], grades: [] }, 'reaching 10 again is not crossing it');
  assert.deepEqual(crossed(at(2135, [1, 2, 3, 4, 5, 6]), at(2136, [1, 2, 3, 4, 5, 6, 8])), { counts: [2136], grades: [8] });

  const before = progress(SMALL, seenOf([['日', 1], ['一', 1]]));
  const after = progress(SMALL, seenOf([['日', 1], ['一', 1], ['人', 1]]));
  assert.deepEqual(crossed(before, after), { counts: [], grades: [1] });
});
