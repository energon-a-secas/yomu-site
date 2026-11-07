// Personalized kana drills: what each kana's record keeps, how weak kana are
// chosen, and how a drill round is built, stored and checked on relaunch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KanaGames, WEAK_LIMIT } from '../js/kana-games.js';

const vowels = ['あ', 'い', 'う', 'え', 'お'];
const record = (seen, missed, recent, ms, timed) => ({ seen, missed, recent, ms, timed });
const right = (ms = 1000) => () => ({ kind: 'right', ms });

/** Plays a whole round; `decide(target, n)` says how question n is answered. */
function play(g, decide) {
  const asked = [];
  for (let n = 0; n < 10; n++) {
    const r = g.dump().round, question = r.questions[r.at], id = g.view().round.question.id;
    const how = decide(question.target, n);
    asked.push({ target: question.target, ...how });
    if (how.kind === 'hint') g.act('hint', { id });
    if (how.kind === 'skip') g.act('skip', { id });
    else {
      const pick = how.kind === 'wrong' ? question.options.find((o) => o !== question.target) : question.target;
      g.act('answer', { id, pick, ms: how.ms });
    }
    g.act('next', { id });
  }
  assert.equal(g.view().status, 'complete');
  return asked;
}

test('a kana record counts every question, its misses, and the pace of right unaided answers only', () => {
  const g = new KanaGames();
  g.start({ selected: vowels, seed: 5 });
  const asked = play(g, (target, n) => [
    { kind: 'right', ms: 1000 },
    { kind: 'right', ms: 100 }, // a stray tap: too fast to be reading
    { kind: 'hint', ms: 900 }, // helped, so not timed and a miss
    { kind: 'skip' },
    { kind: 'right', ms: 40000 }, // looked away: not timed
    { kind: 'wrong', ms: 700 }, // a wrong guess sets no pace
  ][n] || { kind: 'right', ms: 1200 + n * 10 });

  // The same arithmetic, written out: running averages with weight 0.35.
  const expected = {};
  for (const a of asked) {
    const k = expected[a.target] ||= record(0, 0, 0, null, 0);
    const missed = a.kind !== 'right';
    k.seen += 1;
    if (missed) k.missed += 1;
    k.recent = Math.round(k.recent + 0.35 * ((missed ? 1000 : 0) - k.recent));
    if (!missed && a.ms >= 200 && a.ms <= 30000) {
      k.ms = k.ms === null ? a.ms : Math.round(k.ms + 0.35 * (a.ms - k.ms));
      k.timed += 1;
    }
  }
  const kept = g.dump().kana;
  assert.deepEqual(Object.keys(kept).sort(), Object.keys(expected).map((id) => `hiragana:${id}`).sort());
  for (const [id, k] of Object.entries(expected)) assert.deepEqual(kept[`hiragana:${id}`], k, id);
  const total = (field) => Object.values(kept).reduce((sum, k) => sum + k[field], 0);
  assert.equal(total('seen'), 10);
  assert.equal(total('missed'), 3);
  assert.equal(total('timed'), 5);
});

test('listening answers are counted but not timed, since their time includes the recording', () => {
  const g = new KanaGames();
  g.start({ selected: vowels, mode: 'listen', seed: 9 });
  play(g, right(1500));
  const kept = Object.values(g.dump().kana);
  assert.equal(kept.reduce((sum, k) => sum + k.seen, 0), 10);
  assert.ok(kept.every((k) => k.ms === null && k.timed === 0));
});

test('weak kana: missed lately, or slow against the learner\'s own median', () => {
  const g = new KanaGames({ v: 1, stats: {}, kana: {
    'hiragana:あ': record(10, 0, 0, 1000, 10),
    'hiragana:い': record(10, 0, 0, 1100, 10),
    'hiragana:う': record(10, 0, 0, 900, 10),
    'hiragana:え': record(10, 0, 0, 2400, 8), // slow: 2.4 times the median
    'hiragana:お': record(4, 3, 700, 1000, 1), // missed lately
    'hiragana:か': record(10, 1, 300, 1000, 9), // missed last time
    'hiragana:く': record(20, 5, 100, 1000, 18), // missed long ago, right since
    'hiragana:き': record(6, 0, 0, 5000, 1), // slow once is not a pattern
    'katakana:え': record(3, 3, 900, null, 0), // the other script keeps its own list
  } });
  assert.equal(g.recovered, false);
  const weak = g.weakKana({ script: 'hiragana' });
  assert.equal(weak.median, 1000);
  assert.deepEqual(weak.kana.map((k) => k.id), ['え', 'お', 'か']);
  assert.deepEqual(weak.kana[0], { id: 'え', kana: 'え', sound: 'e', seen: 10, missed: 0, ms: 2400, missing: false, slow: true });
  assert.deepEqual([weak.kana[1].missing, weak.kana[1].slow], [true, false]);
  assert.equal(weak.ready, true);

  const kata = g.weakKana({ script: 'katakana' });
  assert.deepEqual(kata.kana.map((k) => [k.id, k.kana]), [['え', 'エ']]);
  assert.equal(kata.median, null);
  assert.equal(kata.ready, false, 'one weak kana is not a drill');
});

test('a kana leaves the weak list after a few right answers; its lifetime counts stay', () => {
  const g = new KanaGames();
  g.start({ selected: ['あ', 'い'], seed: 2 });
  const missed = play(g, () => ({ kind: 'skip' })).filter((a) => a.target === 'あ').length;
  const before = g.weakKana();
  assert.deepEqual(before.kana.map((k) => k.id).sort(), ['あ', 'い']);
  assert.equal(before.ready, true);
  g.start({ selected: ['あ', 'い'], seed: 3 });
  const answered = play(g, right()).filter((a) => a.target === 'あ').length;
  assert.deepEqual(g.weakKana().kana, []);
  assert.deepEqual([g.dump().kana['hiragana:あ'].seen, g.dump().kana['hiragana:あ'].missed], [missed + answered, missed]);
});

test('with fewer than four timed kana there is no median, so only misses count', () => {
  const g = new KanaGames({ v: 1, stats: {}, kana: {
    'hiragana:あ': record(5, 0, 0, 900, 5),
    'hiragana:い': record(5, 0, 0, 9000, 5),
    'hiragana:う': record(5, 2, 500, 1000, 3),
  } });
  const weak = g.weakKana({ script: 'hiragana' });
  assert.equal(weak.median, null);
  assert.deepEqual(weak.kana.map((k) => k.id), ['う']);
});

test('weak kana that share one sound are not a drill, and the list stops at the limit', () => {
  const same = new KanaGames({ v: 1, stats: {}, kana: { 'hiragana:お': record(2, 1, 350, null, 0), 'hiragana:を': record(2, 2, 580, null, 0) } });
  assert.equal(same.weakKana().kana.length, 2);
  assert.equal(same.weakKana().ready, false);

  const many = {};
  for (const id of ['か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ']) many[`hiragana:${id}`] = record(4, 2, 500, null, 0);
  const g = new KanaGames({ v: 1, stats: {}, kana: many });
  assert.equal(g.weakKana().kana.length, WEAK_LIMIT);
  assert.deepEqual(g.weakKana().kana.slice(0, 2).map((k) => k.id), ['か', 'き'], 'ties keep chart order');
  assert.equal(g.weakKana({ limit: 3 }).kana.length, 3);
  assert.deepEqual(g.weakKana({ script: 'cyrillic' }), { script: 'cyrillic', median: null, kana: [], ready: false });
});

test('a drill asks only its focus kana, with wrong answers from the whole selection', () => {
  const selected = [...vowels, 'か', 'き', 'く'];
  const g = new KanaGames();
  const view = g.start({ selected, focus: ['か', 'え'], seed: 11 });
  assert.equal(view.round.drill, true);
  const r = g.dump().round;
  assert.deepEqual(r.focus, ['え', 'か'], 'kept in chart order');
  assert.ok(r.questions.every((q) => r.focus.includes(q.target)));
  assert.ok(r.questions.every((q) => q.options.length === 4), 'a drill of two still offers four choices');
  assert.ok(r.questions.some((q) => q.options.some((id) => !r.focus.includes(id))));

  const restored = new KanaGames(JSON.parse(JSON.stringify(g.dump())));
  assert.equal(restored.recovered, false);
  assert.equal(restored.view().round.drill, true);

  const tampered = JSON.parse(JSON.stringify(g.dump()));
  tampered.round.questions[0] = { target: 'あ', options: ['あ', 'い', 'う', 'え'] };
  const reopened = new KanaGames(tampered);
  assert.equal(reopened.recovered, true, 'a question outside the focus is not this drill');
  assert.equal(reopened.view().status, 'idle');

  assert.equal(new KanaGames().start({ selected }).round.drill, false);
});

test('a perfect drill counts as a round but is not a best score', () => {
  const g = new KanaGames();
  g.start({ selected: vowels, focus: ['あ', 'い'], seed: 4 });
  play(g, right());
  assert.deepEqual([g.dump().stats['hiragana:read'].rounds, g.dump().stats['hiragana:read'].best], [1, 0]);
  g.start({ selected: vowels, seed: 4 });
  play(g, right());
  assert.equal(g.dump().stats['hiragana:read'].best, 10);
});

test('a drill needs focus kana from the selection with two different sounds', () => {
  const selected = [...vowels, 'を'];
  for (const focus of [[], 'え', ['さ'], ['お', 'を'], ['え']]) {
    assert.throws(() => new KanaGames().start({ selected, focus, seed: 1 }), /drill/, JSON.stringify(focus));
  }
  // Telling apart asks only kana with a look-alike in the selection.
  assert.throws(() => new KanaGames().start({ selected: ['ぬ', 'め', 'あ', 'い'], mode: 'apart', focus: ['あ', 'い'], seed: 1 }), /drill/);
  assert.equal(new KanaGames().start({ selected: ['ぬ', 'め', 'あ'], mode: 'apart', focus: ['ぬ', 'め'], seed: 1 }).round.drill, true);
});

test('kana records survive a relaunch; a damaged record is dropped and flagged', () => {
  const g = new KanaGames();
  g.start({ selected: vowels, seed: 3 });
  play(g, right(1300));
  const again = new KanaGames(JSON.parse(JSON.stringify(g.dump())));
  assert.equal(again.recovered, false);
  assert.deepEqual(again.dump().kana, g.dump().kana);

  assert.equal(new KanaGames({ v: 1, stats: {}, round: null }).recovered, false, 'a document from before drills');

  const damaged = new KanaGames({ v: 1, stats: {}, kana: {
    'hiragana:あ': record(3, 1, 350, 1200, 2),
    'hiragana:zz': record(1, 0, 0, null, 0),
    'hiragana:い': record(1, 2, 650, null, 0),
    'hiragana:う': record(2, 0, 0, 50, 1),
    'hiragana:え': record(2, 0, 0, null, 1),
    'hiragana:お': record(2, 0, 0, 1000, 0),
    'hiragana:か': record(1.5, 0, 0, null, 0),
    'hiragana:き': record(2, 0, 350, null, 0),
    'hiragana:く': record(2, 1, 1001, null, 0),
  } });
  assert.equal(damaged.recovered, true);
  assert.deepEqual(damaged.dump().kana, { 'hiragana:あ': record(3, 1, 350, 1200, 2) });
  const notObject = new KanaGames({ v: 1, stats: {}, kana: [] });
  assert.equal(notObject.recovered, true);
  assert.deepEqual(notObject.dump().kana, {});
});

test('a stored answer time belongs to a right, unaided answer', () => {
  const g = new KanaGames();
  g.start({ selected: vowels, seed: 21 });
  const id = g.view().round.question.id, target = g.dump().round.questions[0].target;
  g.act('hint', { id });
  g.act('answer', { id, pick: target, ms: 800 });
  assert.equal(g.dump().round.picks[0].ms, undefined, 'a hinted answer is not timed');
  for (const pick of [{ id: target, hint: true, ms: 800 }, { id: target, hint: false, ms: 50 }, { id: null, hint: false, ms: 800 }]) {
    const doc = JSON.parse(JSON.stringify(g.dump()));
    doc.round.picks[0] = pick;
    assert.equal(new KanaGames(doc).recovered, true, JSON.stringify(pick));
  }
  const ok = JSON.parse(JSON.stringify(g.dump()));
  ok.round.picks[0] = { id: target, hint: false, ms: 800 };
  assert.equal(new KanaGames(ok).recovered, false);
});
