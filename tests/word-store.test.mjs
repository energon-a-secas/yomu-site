// Saved words (js/word-store.js): the record, the store, the schedule a
// saved kanji has, and one review holding kanji and words together.
//
//   node --test tests/word-store.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  wordId, cleanWord, cleanGloss, validate, saveWord, unsaveWord, dueWords, nextDueWords, listWords, mergeWords,
  openWords, dueAll, nextDueAll, answerAny, wordOfReview, isWordReview, REVIEW_PREFIX, MAX_SAVED_WORDS, MAX_GLOSS,
} from '../js/word-store.js';
import { createReview, show, answer, summary } from '../js/review.js';

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 9, 16, 9);
const eat = { w: '食べる', r: 'たべる', g: 'to eat' };

/** A store in memory: what was saved last, and how many writes. */
function memory(initial = null) {
  const m = { value: initial, writes: 0 };
  m.store = { load: (fb) => (m.value === null ? fb : JSON.parse(JSON.stringify(m.value))), save: (d) => { m.value = JSON.parse(JSON.stringify(d)); m.writes += 1; return true; } };
  return m;
}

test('a word is its dictionary form and reading, keyed short and ASCII, with one line of gloss', () => {
  assert.match(wordId('食べる', 'たべる'), /^[0-9a-z]{1,16}$/);
  assert.equal(wordId('食べる', 'たべる'), wordId('食べる', 'たべる'));
  assert.notEqual(wordId('方', 'かた'), wordId('方', 'ほう'), 'one spelling read two ways is two words');
  assert.equal(cleanGloss(' to  eat\n(food) '), 'to eat (food)');
  assert.equal([...cleanGloss('x'.repeat(300))].length, MAX_GLOSS);
  const rec = { ...eat, at: T0, box: 0, due: '2026-10-16', reviews: 0, lapses: 0 };
  assert.deepEqual(cleanWord(rec), rec);
  assert.equal(cleanWord({ ...rec, r: 'taberu' }), null, 'a reading is kana');
  assert.equal(cleanWord({ ...rec, w: 'あ'.repeat(25) }), null, 'longer than a dictionary word');
  assert.equal(cleanWord({ ...rec, box: 6 }), null);
  assert.equal(cleanWord({ ...rec, due: '2026-13-01' }), null);
});

test('saving puts a word in box 0, due today; a word saved twice, or past the cap, changes nothing', () => {
  const data = { saved: {} };
  const id = saveWord(data, eat, T0);
  assert.equal(id, wordId(eat.w, eat.r));
  assert.deepEqual(data.saved[id], { ...eat, at: T0, box: 0, due: '2026-10-16', reviews: 0, lapses: 0 });
  assert.equal(saveWord(data, eat, T0 + 1), null);
  assert.equal(saveWord(data, { w: '', r: 'た' }, T0), null);
  const full = { saved: {} };
  for (let i = 0; i < MAX_SAVED_WORDS; i += 1) full.saved[`k${i}`] = data.saved[id];
  assert.equal(saveWord(full, { w: '飲む', r: 'のむ' }, T0), null, 'the list is full');
  assert.ok(unsaveWord(data, id));
  assert.ok(!unsaveWord(data, id));
});

test('what was stored is read field by field; a record under another word\'s key is left out', () => {
  const id = wordId(eat.w, eat.r);
  const rec = { ...eat, at: T0, box: 2, due: '2026-10-20', reviews: 3, lapses: 1 };
  const v = validate({ saved: { [id]: rec, wrongkey: rec, [wordId('猫', 'ねこ')]: { w: '猫' } } });
  assert.deepEqual(Object.keys(v.data.saved), [id]);
  assert.equal(v.dropped, 2);
  assert.deepEqual(validate('not a store'), { data: { saved: {} }, dropped: 0, damaged: true });
});

test('due words come in the kanji\'s order, and the next day is named with how many', () => {
  const data = { saved: {} };
  const a = saveWord(data, { w: '雨', r: 'あめ' }, T0);
  const b = saveWord(data, { w: '猫', r: 'ねこ' }, T0 + 1);
  const c = saveWord(data, { w: '水', r: 'みず' }, T0 + 2);
  data.saved[a].due = '2026-10-14';
  data.saved[c].due = '2026-10-18';
  assert.deepEqual(dueWords(data, '2026-10-16'), [a, b], 'the longest overdue first, then the first saved');
  assert.deepEqual(nextDueWords(data, '2026-10-16'), { day: '2026-10-18', n: 1 });
  assert.deepEqual(listWords(data).map((x) => x.id), [c, b, a], 'the most recently saved first');
});

test('the store writes through, a damaged value is kept aside, and nothing is written for a first visit', () => {
  const m = memory();
  const page = openWords({ store: m.store, readRaw: () => null, keepRaw: () => assert.fail('nothing to keep') }).load();
  assert.equal(m.writes, 0, 'a first visit writes nothing');
  const heard = [];
  page.onChange((e) => heard.push(e.type));
  assert.equal(page.toggle(eat, T0), true);
  assert.ok(page.isSaved('食べる', 'たべる'));
  assert.equal(m.writes, 1);
  const id = wordId(eat.w, eat.r);
  const after = page.answer(id, true, '2026-10-16');
  assert.equal(after.box, 1);
  assert.equal(after.due, '2026-10-17');
  assert.equal(page.toggle(eat, T0), false);
  assert.deepEqual(heard, ['save', 'change', 'unsave']);
  let kept = null;
  const broken = openWords({ store: { load: () => null, save: () => true }, readRaw: () => '{"v":9,"broken"', keepRaw: (s) => { kept = s; } }).load();
  assert.equal(broken.note, 'damaged');
  assert.equal(kept, '{"v":9,"broken"');
  assert.equal(broken.size, 0);
});

test('a backup merges by more reviews, the earlier save, the higher lapses', () => {
  const data = { saved: {} };
  const id = saveWord(data, eat, T0 + DAY);
  const sum = mergeWords(data, [
    { ...eat, at: T0, box: 3, due: '2026-10-30', reviews: 4, lapses: 2 },
    { w: '猫', r: 'ねこ', g: 'cat', at: T0, box: 0, due: '2026-10-16', reviews: 0, lapses: 0 },
    { w: 'bad' },
  ]);
  assert.deepEqual(sum, { added: 1, updated: 1, full: 0 });
  assert.deepEqual(data.saved[id], { ...eat, at: T0, box: 3, due: '2026-10-30', reviews: 4, lapses: 2 });
  assert.deepEqual(mergeWords(data, [data.saved[id]]), { added: 0, updated: 0, full: 0 }, 'the same backup twice changes nothing');
});

test('one review holds the due kanji, then the due words, and each answer moves its own schedule', () => {
  const answered = [];
  const kanji = { due: () => ['雨', '猫'], nextDue: () => ({ day: '2026-10-18', n: 2 }), answer: (ch, ok) => answered.push(['kanji', ch, ok]) };
  const words = { due: () => ['abc'], nextDue: () => ({ day: '2026-10-18', n: 1 }), answer: (id, ok) => answered.push(['word', id, ok]) };
  const queue = dueAll('2026-10-16', kanji, words);
  assert.deepEqual(queue, ['雨', '猫', `${REVIEW_PREFIX}abc`]);
  assert.ok(isWordReview(queue[2]) && !isWordReview('雨'));
  assert.equal(wordOfReview(queue[2]), 'abc');
  assert.deepEqual(nextDueAll('2026-10-16', kanji, words), { day: '2026-10-18', n: 3 });
  const r = createReview(queue);
  for (const ok of [true, false, true]) { show(r); answer(r, ok, (rid, ok2) => answerAny(rid, ok2, '2026-10-16', kanji, words)); }
  assert.deepEqual(answered, [['kanji', '雨', true], ['kanji', '猫', false], ['word', 'abc', true]]);
  assert.equal(summary(r).reviewed, 3);
});
