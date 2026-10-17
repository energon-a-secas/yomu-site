import test from 'node:test';
import assert from 'node:assert/strict';
import { KanaGames, KANA_GAME_MODES, gameKana, kanaGameSetup } from '../js/kana-games.js';
import { kanaChart } from '../js/kana-chart.js';

const selected = kanaChart().filter((s) => s.id !== 'timing').flatMap((s) => s.cells).filter((c) => c.kana).map((c) => c.id);
const config = { selected, seed: 107 };
const q = (g) => g.view().round.question;
function answer(g, action = 'answer', extra = {}) {
  const question = q(g);
  return g.act(action, { id: question.id, pick: g.dump().round.questions[g.dump().round.at].target, ...extra });
}
const advance = (g) => g.act('next', { id: q(g).id });

for (const script of ['hiragana', 'katakana']) for (const mode of KANA_GAME_MODES) {
  test(`${script} ${mode}: ten questions finish once, every answer is unambiguous and selected`, () => {
    const g = new KanaGames();
    g.start({ ...config, script, mode });
    const cells = new Map(gameKana(script, selected).map((c) => [c.id, c]));
    for (let n = 0; n < 10; n++) {
      const question = q(g), internal = g.dump().round.questions[n];
      assert.equal(question.correctId, null);
      assert.equal(question.options.every((c) => c.hint === null && c.romaji === null), true);
      assert.equal(new Set(internal.options.map((id) => cells.get(id).sound)).size, internal.options.length);
      assert.ok(internal.options.length >= 2);
      assert.ok(internal.options.every((id) => selected.includes(id)));
      if (mode === 'listen') assert.equal(question.prompt, null);
      answer(g);
      assert.equal(q(g).right, true);
      assert.ok(q(g).options.every((c) => c.kana && c.romaji && c.hint));
      const before = JSON.stringify(g.dump());
      answer(g, 'skip');
      assert.equal(JSON.stringify(g.dump()), before, 'second answers do not change progress');
      advance(g);
    }
    assert.equal(g.view().status, 'complete');
    assert.equal(g.view().round.result.correct, 10);
    const stats = g.dump().stats[`${script}:${mode}`];
    assert.equal(stats.rounds, 1);
    assert.equal(stats.best, 10);
    const restored = new KanaGames(JSON.parse(JSON.stringify(g.dump())));
    assert.equal(restored.view().status, 'complete');
    restored.act('next', { id: 'stale' });
    assert.equal(restored.dump().stats[`${script}:${mode}`].rounds, 1);
  });
}

test('two selected sounds work; none, one, equivalent sounds or timing marks give guidance', () => {
  for (const group of [[], ['あ'], ['お', 'を'], ['じ', 'ぢ'], ['ず', 'づ'], ['っ', 'ー']]) {
    for (const mode of ['read', 'listen']) assert.equal(kanaGameSetup({ selected: group, mode }).ready, false);
  }
  assert.equal(kanaGameSetup({ selected: ['あ', 'い'] }).ready, true);
  assert.equal(kanaGameSetup({ selected: ['あ', 'い'], mode: 'apart' }).ready, false);
  assert.equal(kanaGameSetup({ selected: ['ぬ', 'め'], mode: 'apart' }).ready, true);
  const g = new KanaGames();
  g.start({ selected: ['き', 'きゃ'], mode: 'listen', seed: 3 });
  assert.ok(g.dump().round.questions.every((q) => q.options.length === 2));
});

test('hint assistance, skip, wrong teaching, stale taps and relaunch keep first-answer accounting', () => {
  let g = new KanaGames(); g.start(config);
  answer(g, 'hint');
  assert.ok(q(g).hint);
  answer(g);
  const oldId = q(g).id;
  advance(g);
  g.act('answer', { id: oldId, pick: 'あ' });
  assert.equal(q(g).answered, false);
  answer(g, 'skip'); advance(g);
  const target = g.dump().round.questions[2].target;
  answer(g, 'answer', { pick: q(g).options.find((o) => o.id !== target).id });
  assert.equal(q(g).right, false);
  assert.equal(g.dump().round.questions[5].target, target, 'missed shape returns later');
  g = new KanaGames(JSON.parse(JSON.stringify(g.dump())));
  assert.equal(q(g).answered, true);
  assert.equal(q(g).right, false);
  advance(g);
  for (let n = 3; n < 10; n++) { answer(g); advance(g); }
  assert.deepEqual(g.view().round.result, { correct: 7, assisted: 1, skipped: 1, total: 10 });
  const s = g.dump().stats['hiragana:read'];
  assert.equal(s.correct, 7); assert.equal(s.assisted, 1); assert.equal(s.answered, 10);
  assert.ok(s.misses[target] > 0);
});

test('leaving discards an unfinished round without changing completed progress', () => {
  const g = new KanaGames(); g.start(config); answer(g); advance(g);
  assert.throws(() => g.start(config));
  g.act('leave');
  assert.equal(g.view().status, 'idle');
  assert.deepEqual(g.dump().stats, {});
  g.start(config);
  assert.equal(g.view().round.position, 1);
});

test('invalid documents and damaged rounds cannot create false completions or crash loading', () => {
  for (const doc of [false, 'bad', {}, { v: 99 }, { v: 1, stats: {} , round: {} }]) {
    const g = new KanaGames(doc); assert.equal(g.view().status, 'idle'); assert.equal(g.view().recovered, true);
  }
  const g = new KanaGames(); g.start(config);
  for (const damage of [
    (r) => { r.at = 9; },
    (r) => { r.questions[0].options = ['じ', 'ぢ']; },
    (r) => { r.picks = [null]; },
    (r) => { r.questions[0].target = 'unknown'; },
  ]) {
    const doc = JSON.parse(JSON.stringify(g.dump())); damage(doc.round);
    const loaded = new KanaGames(doc);
    assert.equal(loaded.view().status, 'idle'); assert.equal(loaded.view().recovered, true);
  }
});

test('seeded selection is repeatable, and changing preferences does not mutate an active round', () => {
  const a = new KanaGames(), b = new KanaGames(); a.start(config); b.start(config);
  assert.deepEqual(a.dump(), b.dump());
  const before = JSON.stringify(a.dump());
  kanaGameSetup({ script: 'katakana', selected: [] });
  assert.equal(JSON.stringify(a.dump()), before);
});

test('damaged counters preserve valid fields and signal a recovery backup', () => {
  const g = new KanaGames({ v: 1, stats: { 'hiragana:read': { rounds: 2, best: 90, answered: 20, correct: 30, assisted: 'many', misses: { 'ぬ': 2, 'unknown': 4 } } }, round: null });
  assert.equal(g.view().recovered, true);
  assert.deepEqual(g.dump().stats['hiragana:read'], { rounds: 2, best: 10, answered: 20, correct: 20, assisted: 0, misses: { 'ぬ': 2 } });
});
