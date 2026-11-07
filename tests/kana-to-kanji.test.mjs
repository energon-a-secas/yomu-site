// Kana to kanji: the word pool, fair choices (one right answer, never a
// spelling the set also reads as the prompt), first-answer accounting, and
// the document read back field by field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KanaToKanji, spellingPool, spellingSetup, wordKey, SPELL_CHOICES } from '../js/kana-to-kanji.js';

const W = (written, reading, gloss = '') => ({ written, reading, gloss });
const words = [
  W('学校', 'がっこう', 'school'), W('学生', 'がくせい', 'student'), W('大学', 'だいがく', 'university'),
  W('高校', 'こうこう', 'high school'), W('先生', 'せんせい', 'teacher'), W('今日', 'きょう', 'today'),
  W('今日', 'こんにち', 'these days'), W('明日', 'あした', 'tomorrow'), W('明日', 'あす', 'tomorrow'),
  W('橋', 'はし', 'bridge'), W('箸', 'はし', 'chopsticks'), W('山', 'やま', 'mountain'),
  W('川', 'かわ', 'river'), W('雨', 'あめ', 'rain'), W('飴', 'あめ', 'candy'),
];
const at = (g) => g.dump().round.questions[g.dump().round.at];
const id = (g) => g.view().round.question.id;

test('the pool keeps words written with known kanji and read in hiragana, once each', () => {
  const pages = new Map([
    ['学', [W('学校', 'がっこう', 'school'), W('学生', 'がくせい', 'student'), W('化学', 'かがく', 'chemistry'), W('学', 'がく', 'learning')]],
    ['校', [W('学校', 'がっこう', 'school'), W('高校', 'こうこう', 'high school')]],
    ['水', [W('水', 'みず', 'water'), W('水曜日', 'すいようび', 'Wednesday'), W('お水', 'おみず', 'water'), W('水ガス', 'みずがす'), W('水', 'ミズ'), W('水', 'すい', 'x'.repeat(300))]],
  ]);
  const known = new Set([...'学校水高生']);
  const pool = spellingPool([...'学校水'], pages, known);
  assert.deepEqual(pool.map(wordKey), ['学校|がっこう', '学生|がくせい', '学|がく', '高校|こうこう', '水|みず', 'お水|おみず', '水|すい']);
  assert.equal(pool.at(-1).gloss.length, 200, 'a long gloss is cut, not dropped');
  assert.deepEqual(spellingPool(['学'], pages).map(wordKey), ['学|がく'], 'by default only the set\'s own kanji count as known');
  assert.deepEqual(spellingPool(['無'], pages), []);
});

test('a set makes a round with four different readings', () => {
  assert.equal(spellingSetup(words).ready, true);
  assert.equal(spellingSetup([W('橋', 'はし'), W('箸', 'はし'), W('山', 'やま'), W('川', 'かわ')]).ready, false, 'two of four read alike');
  assert.equal(spellingSetup([]).ready, false);
  assert.equal(spellingSetup('nonsense').count, 0);
  assert.throws(() => new KanaToKanji().start({ deck: 'mine', words: words.slice(9, 12) }), /four different readings/);
  assert.throws(() => new KanaToKanji().start({ deck: 'Not a deck', words }), /Unknown kanji set/);
});

test('every question has one right answer: no choice reads like the prompt, none is the prompt\'s other spelling', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = new KanaToKanji();
    g.start({ deck: 'n5', words, seed });
    for (const q of g.dump().round.questions) {
      assert.ok(q.options.length >= 2 && q.options.length <= SPELL_CHOICES);
      assert.equal(q.options.filter((o) => wordKey(o) === wordKey(q.target)).length, 1);
      assert.equal(new Set(q.options.map((o) => o.reading)).size, q.options.length);
      assert.equal(new Set(q.options.map((o) => o.written)).size, q.options.length);
      for (const o of q.options) {
        if (wordKey(o) === wordKey(q.target)) continue;
        assert.ok(!words.some((w) => w.written === o.written && w.reading === q.target.reading),
          `${o.written} can be read ${q.target.reading}`);
      }
    }
  }
});

test('wrong answers share a kanji with the answer where the set has them', () => {
  let seen = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = new KanaToKanji();
    g.start({ deck: 'n5', words, seed });
    for (const q of g.dump().round.questions.filter((q) => q.target.written === '学校')) {
      seen += 1;
      assert.deepEqual(q.options.map((o) => o.written).sort(), ['大学', '学校', '学生', '高校'].sort());
    }
  }
  assert.ok(seen > 0);
});

test('the first answer counts; the choices show their readings once answered', () => {
  const g = new KanaToKanji();
  g.start({ deck: 'n5', words, seed: 3 });
  const q = g.view().round.question;
  assert.equal(q.prompt, at(g).target.reading);
  assert.ok(q.options.every((o) => o.reading === null && o.gloss === null));
  assert.equal(q.hint, null);
  g.act('hint', { id: id(g) });
  assert.equal(g.view().round.question.hint, at(g).target.gloss);
  g.act('answer', { id: id(g), pick: wordKey(at(g).target) });
  const done = g.view().round.question;
  assert.deepEqual([done.right, done.hinted, done.hint], [true, true, null]);
  assert.ok(done.options.every((o) => o.reading && typeof o.gloss === 'string'));
  const before = JSON.stringify(g.dump());
  g.act('skip', { id: id(g) });
  g.act('answer', { id: 'stale', pick: 'x' });
  assert.equal(JSON.stringify(g.dump()), before, 'second answers and stale taps change nothing');
  assert.equal(g.view().round.result.assisted, 1);
});

test('a missed word comes back three questions later with its choices turned', () => {
  const g = new KanaToKanji();
  g.start({ deck: 'n5', words, seed: 5 });
  const missed = at(g);
  g.act('answer', { id: id(g), pick: wordKey(missed.options.find((o) => wordKey(o) !== wordKey(missed.target))) });
  assert.equal(g.view().round.question.right, false);
  const later = g.dump().round.questions[3];
  assert.equal(wordKey(later.target), wordKey(missed.target));
  assert.deepEqual(later.options.map(wordKey), [...missed.options.slice(1), missed.options[0]].map(wordKey));
});

test('a round records per set, keeps its missed words, and a finished round lets the next begin', () => {
  const g = new KanaToKanji();
  g.start({ deck: 'n5', words, seed: 9 });
  for (let n = 0; n < 10; n++) {
    if (n % 2) g.act('skip', { id: id(g) });
    else g.act('answer', { id: id(g), pick: wordKey(at(g).target) });
    g.act('next', { id: id(g) });
  }
  const view = g.view();
  assert.equal(view.status, 'complete');
  assert.deepEqual(view.round.result, { correct: 5, assisted: 0, skipped: 5, total: 10 });
  const stats = g.dump().stats.n5;
  assert.deepEqual([stats.rounds, stats.best, stats.correct, stats.answered], [1, 5, 5, 10]);
  const skipped = g.dump().round.questions.filter((_, n) => n % 2).map((q) => wordKey(q.target));
  assert.deepEqual(Object.keys(stats.misses).sort(), [...new Set(skipped)].sort());
  assert.equal(g.dump().stats.mine, undefined);
  assert.equal(new KanaToKanji(g.dump()).start({ deck: 'n5', words, seed: 2 }).status, 'playing');
});

test('missed words are asked more often in later rounds: here, in every round', () => {
  const missed = { '川|かわ': 5, '山|やま': 5 };
  let withMisses = 0, without = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const weighted = new KanaToKanji({ v: 1, stats: { n5: { rounds: 1, best: 0, correct: 0, answered: 10, assisted: 0, misses: missed } } });
    weighted.start({ deck: 'n5', words, seed });
    withMisses += weighted.dump().round.questions.filter((q) => wordKey(q.target) in missed).length;
    const plain = new KanaToKanji();
    plain.start({ deck: 'n5', words, seed });
    without += plain.dump().round.questions.filter((q) => wordKey(q.target) in missed).length;
  }
  // A word is asked once per pass through the set, so two missed words can
  // be asked at most twice a round.
  assert.equal(withMisses, 2 * 60);
  assert.ok(without < withMisses * 0.8, `${without} of ${withMisses}`);
});

test('the document survives a relaunch; damage is dropped and flagged, never trusted', () => {
  const g = new KanaToKanji();
  g.start({ deck: 'g1', words, seed: 11 });
  g.act('answer', { id: id(g), pick: wordKey(at(g).target) });
  const saved = JSON.parse(JSON.stringify(g.dump()));
  const again = new KanaToKanji(saved);
  assert.equal(again.recovered, false);
  assert.deepEqual(again.view(), g.view());

  for (const damage of [
    (d) => { d.round.questions[0].options[1] = { ...d.round.questions[0].options[0] }; },
    (d) => { d.round.questions[2].options[0].reading = 'ガッコウ'; },
    (d) => { d.round.questions[4].options = d.round.questions[4].options.filter((o) => wordKey(o) !== wordKey(d.round.questions[4].target)); },
    (d) => { d.round.picks[0].id = 'nothing|なし'; },
    (d) => { d.round.at = 4; },
    (d) => { d.round.deck = '../etc'; },
  ]) {
    const d = JSON.parse(JSON.stringify(saved));
    damage(d);
    const opened = new KanaToKanji(d);
    assert.equal(opened.recovered, true);
    assert.equal(opened.view().status, 'idle');
  }

  const counters = new KanaToKanji({ v: 1, stats: { n5: { rounds: 2, best: 12, correct: 3, answered: 2, assisted: 0, misses: { '山|やま': 2, 'bad': 1, '川|かわ': -1 } } } });
  assert.equal(counters.recovered, true);
  assert.deepEqual(counters.dump().stats.n5, { rounds: 2, best: 10, correct: 2, answered: 2, assisted: 0, misses: { '山|やま': 2 } });
  assert.equal(new KanaToKanji({ v: 2, stats: {} }).recovered, true);
  assert.equal(new KanaToKanji(null).recovered, false);
});

test('misses keep the 500 most missed words', () => {
  const misses = {};
  for (let n = 0; n < 600; n++) misses[`山${String.fromCharCode(0x4e00 + n)}|やま${String.fromCharCode(0x3041 + (n % 80))}`] = (n % 7) + 1;
  const g = new KanaToKanji({ v: 1, stats: { n5: { rounds: 1, best: 0, correct: 0, answered: 10, assisted: 0, misses } } });
  assert.equal(g.recovered, false);
  g.start({ deck: 'n5', words, seed: 1 });
  for (let n = 0; n < 10; n++) { g.act('skip', { id: id(g) }); g.act('next', { id: id(g) }); }
  const kept = g.dump().stats.n5.misses;
  assert.equal(Object.keys(kept).length, 500);
  assert.ok(Object.values(kept).every((n) => n >= 2), 'the least missed go first');
});
