// Quick kana review (js/kana-review.js): the schedule each kana moves on, the
// review's rules from review.js, the overview, and documents that resume or
// recover.
//
//   node --test tests/kana-review.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KanaReview, QUICK_SIZE, QUICK_MAX } from '../js/kana-review.js';
import { kanaChart } from '../js/kana-chart.js';
import { schedule, addDays } from '../js/kanji-store.js';
import { useLang } from '../js/strings.js';

/** The character is named, never written, so this file passes its own rule. */
const EM_DASH = String.fromCharCode(0x2014);

/** `fn` with every string in Spanish (strings.js useLang), then English again. */
function inSpanish(fn) {
  useLang('es');
  try { return fn(); } finally { useLang('en'); }
}

const DAY = '2026-11-02';
const SCRIPTS = ['hiragana', 'katakana'];
/** Every chart cell a card can be, in chart order. */
const all = (script) => kanaChart(script).filter((s) => s.id !== 'timing').flatMap((s) => s.cells).filter((c) => c.kana).map((c) => c.id);
const card = (q) => q.view().session.card;
const reload = (q) => new KanaReview(JSON.parse(JSON.stringify(q.dump())));
const doc = (cards, session = null) => ({ v: 1, cards, session });
const rec = (box, due, reviews = 1, lapses = 0) => ({ box, due, reviews, lapses });
const set = (list) => new Set(list);

/** Show and answer every card; `pick(cellId, isRepeat)` says 'got' or 'again'. */
function play(q, pick) {
  for (let guard = 0; q.view().status === 'playing'; guard += 1) {
    assert.ok(guard < 200, 'the review ends');
    const c = card(q);
    q.act('show', { id: c.id });
    q.act(pick(c.cellId, q.view().session.isRepeat), { id: c.id });
  }
  return q.view();
}

for (const script of SCRIPTS) {
  test(`${script}: due and new kana move on the My kanji schedule at their first answer`, () => {
    const q = new KanaReview(doc({
      [`${script}:か`]: rec(2, DAY, 3, 0),
      [`${script}:き`]: rec(3, '2026-10-30', 5, 1),
    }));
    const before = q.dump().cards;
    q.start({ script, selected: ['か', 'き', 'く', 'け'], today: DAY, seed: 11 });
    assert.deepEqual(set(q.dump().session.kana.slice(0, 2)), set(['か', 'き']), 'due kana come first');
    assert.deepEqual(set(q.dump().session.kana.slice(2)), set(['く', 'け']), 'then the new ones');
    const view = play(q, (id, repeat) => (repeat || ['か', 'く'].includes(id) ? 'got' : 'again'));
    const cards = q.dump().cards;
    assert.deepEqual(cards[`${script}:か`], schedule(before[`${script}:か`], true, DAY));
    assert.deepEqual(cards[`${script}:き`], schedule(before[`${script}:き`], false, DAY));
    assert.deepEqual(cards[`${script}:く`], { box: 1, due: addDays(DAY, 1), reviews: 1, lapses: 0 });
    assert.deepEqual(cards[`${script}:け`], { box: 1, due: addDays(DAY, 1), reviews: 1, lapses: 1 });
    assert.equal(cards[`${script}:か`].due, addDays(DAY, 4), 'box 3 waits 4 days');
    assert.equal(view.status, 'complete');
    const kana = new Map(kanaChart(script).flatMap((s) => s.cells).map((c) => [c.id, c.kana]));
    assert.deepEqual(view.session.result.again.sort(), ['き', 'け'].map((id) => kana.get(id)).sort());
    assert.deepEqual({ ...view.session.result, again: null }, { reviewed: 4, got: 2, again: null, stronger: 2 });
    assert.equal(view.session.position, 4);
    assert.equal(view.session.total, 4);
  });
}

test('practice ahead: Got it keeps the box and the day and counts a review, Again is a lapse', () => {
  const q = new KanaReview(doc({ 'hiragana:か': rec(2, addDays(DAY, 3), 4, 1), 'hiragana:き': rec(4, addDays(DAY, 5), 9, 0) }));
  const before = q.dump().cards;
  q.start({ selected: ['か', 'き'], today: DAY, seed: 3 });
  assert.deepEqual(set(q.dump().session.ahead), set(['か', 'き']), 'nothing due and nothing new: both are early');
  assert.deepEqual(card(q).box, before[`hiragana:${card(q).cellId}`].box, 'the card shows its box before the review');
  const view = play(q, (id, repeat) => (repeat || id === 'か' ? 'got' : 'again'));
  const cards = q.dump().cards;
  assert.deepEqual(cards['hiragana:か'], { box: 2, due: addDays(DAY, 3), reviews: 5, lapses: 1 });
  assert.deepEqual(cards['hiragana:き'], schedule(before['hiragana:き'], false, DAY));
  assert.deepEqual(cards['hiragana:き'], { box: 1, due: addDays(DAY, 1), reviews: 10, lapses: 1 });
  assert.equal(view.session.result.stronger, 0, 'an early Got it is not a step up');
  assert.deepEqual(view.session.result.again, ['き']);
});

test('Again sends a kana to the back of the queue, and only its first answer moves the schedule', () => {
  const q = new KanaReview();
  q.start({ selected: ['か', 'き', 'く'], today: DAY, seed: 5 });
  const order = q.dump().session.kana;
  const ids = new Set();
  let c = card(q);
  ids.add(c.id);
  assert.equal(c.cellId, order[0]);
  assert.equal(c.shown, false);
  assert.equal(c.sound, null);
  assert.equal(c.hint, null);
  assert.equal(c.box, -1);
  q.act('show', { id: c.id });
  assert.equal(card(q).shown, true);
  assert.ok(card(q).sound && card(q).hint);
  q.act('again', { id: c.id });
  assert.deepEqual(q.dump().session.queue, [order[1], order[2], order[0]]);
  const once = q.dump().cards[`hiragana:${order[0]}`];
  assert.deepEqual(once, { box: 1, due: addDays(DAY, 1), reviews: 1, lapses: 1 });
  for (const n of [1, 2]) {
    c = card(q); ids.add(c.id);
    assert.equal(c.cellId, order[n]);
    assert.equal(q.view().session.position, n + 1);
    assert.equal(q.view().session.isRepeat, false);
    q.act('show', { id: c.id }); q.act('got', { id: c.id });
  }
  c = card(q); ids.add(c.id);
  assert.equal(c.cellId, order[0]);
  assert.equal(q.view().session.isRepeat, true);
  assert.equal(q.view().session.position, 1, 'a repeat shows the number of the kana it repeats');
  assert.equal(c.box, -1, 'the box before the review, not the one Again set');
  q.act('show', { id: c.id }); q.act('again', { id: c.id });
  c = card(q); ids.add(c.id);
  assert.equal(c.cellId, order[0], 'still the only kana left');
  q.act('show', { id: c.id }); q.act('got', { id: c.id });
  assert.equal(ids.size, 5, 'every step has its own id, the same kana included');
  assert.deepEqual(q.dump().cards[`hiragana:${order[0]}`], once, 'repeats are practice: the schedule moved once');
  const view = q.view();
  assert.equal(view.status, 'complete');
  assert.deepEqual(view.session.result, { reviewed: 3, got: 2, again: [order[0]], stronger: 2 });
  assert.equal(q.dump().session.repeats, 2);
});

test('a stale or double tap changes nothing, and a card must be shown before it is answered', () => {
  const q = new KanaReview();
  assert.equal(q.act('show', { id: 'x' }).status, 'idle', 'nothing to act on');
  q.start({ selected: ['か', 'き', 'く'], today: DAY, seed: 9 });
  const unchanged = (fn, why) => { const before = JSON.stringify(q.dump()); fn(); assert.equal(JSON.stringify(q.dump()), before, why); };
  const c = card(q);
  unchanged(() => q.act('got', { id: c.id }), 'an answer before show is refused');
  unchanged(() => q.act('again', { id: c.id }), 'an answer before show is refused');
  unchanged(() => q.act('show', { id: 'hiragana:2026-11-02:9:7' }), 'a wrong id');
  unchanged(() => q.act('show'), 'no id');
  unchanged(() => q.act('flip', { id: c.id }), 'an unknown action');
  q.act('show', { id: c.id });
  unchanged(() => q.act('show', { id: c.id }), 'show twice is the same card shown');
  q.act('got', { id: c.id });
  unchanged(() => q.act('got', { id: c.id }), 'a double tap cannot answer the next card');
  unchanged(() => q.act('show', { id: c.id }), 'a late tap cannot show the next card');
  assert.equal(card(q).shown, false);
  // A kana answered Again comes back as the next card, and an old tap still cannot answer it.
  const last = () => { const k = card(q); q.act('show', { id: k.id }); q.act('got', { id: k.id }); };
  last();
  const k = card(q);
  q.act('show', { id: k.id }); q.act('again', { id: k.id });
  assert.equal(card(q).cellId, k.cellId);
  unchanged(() => { q.act('show', { id: k.id }); q.act('got', { id: k.id }); }, 'the same kana, a new step');
});

test('a card plays its spoken kana from the start; its sound and shape reminder wait for show', () => {
  const q = new KanaReview();
  q.start({ script: 'katakana', selected: ['を', 'か'], today: DAY, seed: 1 });
  while (card(q).cellId !== 'を') { const c = card(q); q.act('show', { id: c.id }); q.act('got', { id: c.id }); }
  const c = card(q);
  assert.equal(c.kana, 'ヲ');
  assert.equal(c.spoken, 'お', 'を is said お');
  assert.equal(c.sound, null);
  q.act('show', { id: c.id });
  assert.equal(card(q).sound, 'o');
  assert.match(card(q).hint, /wo/);
});

for (const script of SCRIPTS) {
  test(`${script}: the overview counts each selected kana once, in chart order`, () => {
    const q = new KanaReview(doc({
      [`${script}:か`]: rec(1, DAY),
      [`${script}:き`]: rec(4, addDays(DAY, 6)),
      [`${script}:く`]: rec(2, addDays(DAY, 1)),
      [`${script}:け`]: rec(5, '2026-10-01'),
      [`${script}:さ`]: rec(5, DAY),
    }));
    const o = q.overview({ script, selected: ['こ', 'け', 'く', 'っ', 'ー', 'nope', 'き', 'か'], today: DAY });
    assert.deepEqual(o.cells.map((c) => c.id), ['か', 'き', 'く', 'け', 'こ']);
    assert.deepEqual(o.cells.map((c) => c.box), [1, 4, 2, 5, -1]);
    const chart = new Map(kanaChart(script).flatMap((s) => s.cells).map((c) => [c.id, c.kana]));
    assert.deepEqual(o.cells.map((c) => c.kana), o.cells.map((c) => chart.get(c.id)));
    // The plan: both due kana, the new one, then the two not due yet (practice ahead).
    assert.deepEqual({ ...o, cells: null, message: null }, {
      script, total: 5, due: 2, fresh: 1, learning: 1, strong: 1, ready: true, message: null, cells: null,
      plan: { due: 2, fresh: 1, ahead: 2, total: 5 },
    });
    assert.equal(o.due + o.fresh + o.learning + o.strong, o.total);
    assert.equal(typeof o.message, 'string');
    assert.throws(() => q.overview({ script, selected: ['か'], today: '2026-11-32' }));
  });
}

test('fewer than two sounds is not ready, says how to fix it, and cannot start', () => {
  const q = new KanaReview();
  const cases = [
    ['hiragana', [], /two kana/],
    ['hiragana', ['っ', 'ー'], /long-vowel bar/],
    ['hiragana', ['あ'], /one more kana/],
    ['hiragana', ['お', 'を'], /^お and を both sound o\./],
    ['katakana', ['じ', 'ぢ'], /^ジ and ヂ both sound ji\./],
    ['katakana', ['ず', 'づ'], /ズ and ヅ/],
    ['romaji', ['か', 'き'], /hiragana or katakana/],
  ];
  for (const [script, selected, says] of cases) {
    const o = q.overview({ script, selected, today: DAY });
    assert.equal(o.ready, false, selected.join(''));
    assert.match(o.message, says);
    assert.ok(/[.]$/.test(o.message), 'a plain sentence');
    assert.throws(() => q.start({ script, selected, today: DAY }), /two kana/);
  }
  assert.equal(q.overview({ selected: ['お', 'を', 'か'], today: DAY }).ready, true);
  assert.equal(q.view().status, 'idle');
  assert.throws(() => q.start({ selected: ['あ', 'い'], today: 'today' }));
});

test('a review holds QUICK_SIZE kana: due first, then new ones in chart order, then practice ahead', () => {
  const ids = all('hiragana');
  assert.equal(QUICK_SIZE, 20);
  // Five due, ten not due yet, the rest new.
  const due = { 'ぬ': rec(1, '2026-10-01'), 'あ': rec(3, DAY), 'に': rec(2, '2026-10-20'), 'き': rec(1, '2026-10-20'), 'ぽ': rec(5, '2026-11-01') };
  const ahead = Object.fromEntries(ids.slice(40, 50).map((id, i) => [id, rec(1 + (i % 5), addDays(DAY, 1 + i))]));
  const cards = Object.fromEntries(Object.entries({ ...due, ...ahead }).map(([id, r]) => [`hiragana:${id}`, r]));
  const q = new KanaReview(doc(cards));
  q.start({ selected: ids, today: DAY, seed: 21 });
  const kana = q.dump().session.kana;
  assert.equal(kana.length, QUICK_SIZE);
  assert.deepEqual(set(kana.slice(0, 5)), set(Object.keys(due)));
  const fresh = ids.filter((id) => !cards[`hiragana:${id}`]);
  assert.deepEqual(set(kana.slice(5)), set(fresh.slice(0, 15)), 'the first new kana in chart order');
  assert.deepEqual(q.dump().session.ahead, []);
  // The same seed draws the same review; another seed only reorders within groups.
  const again = new KanaReview(doc(cards));
  again.start({ selected: ids, today: DAY, seed: 21 });
  assert.deepEqual(again.dump().session.kana, kana);
  const other = new KanaReview(doc(cards));
  other.start({ selected: ids, today: DAY, seed: 22 });
  assert.deepEqual(set(other.dump().session.kana.slice(0, 5)), set(kana.slice(0, 5)));
  assert.notDeepEqual(other.dump().session.kana, kana);
});

test('a learner can choose the size; the overview says what a review of that size holds, group by group', () => {
  const ids = all('hiragana');
  // Five due, ten not due yet, the rest new.
  const due = { 'ぬ': rec(1, '2026-10-01'), 'あ': rec(3, DAY), 'に': rec(2, '2026-10-20'), 'き': rec(1, '2026-10-20'), 'ぽ': rec(5, '2026-11-01') };
  const ahead = Object.fromEntries(ids.slice(40, 50).map((id, i) => [id, rec(1 + (i % 5), addDays(DAY, 1 + i))]));
  const cards = Object.fromEntries(Object.entries({ ...due, ...ahead }).map(([id, r]) => [`hiragana:${id}`, r]));
  const fresh = ids.filter((id) => !cards[`hiragana:${id}`]).length;
  const expect = (size) => {
    const d = Math.min(5, size);
    const f = Math.min(fresh, size - d);
    const a = Math.min(10, size - d - f);
    return { due: d, fresh: f, ahead: a, total: d + f + a };
  };
  for (const size of [3, 10, 20, 30, ids.length, QUICK_MAX]) {
    const q = new KanaReview(doc(cards));
    const { plan } = q.overview({ selected: ids, today: DAY, size });
    assert.deepEqual(plan, expect(size), `size ${size}`);
    q.start({ selected: ids, today: DAY, seed: 5, size });
    const session = q.dump().session;
    assert.equal(session.kana.length, plan.total, `a review of ${size} holds what the plan said`);
    assert.ok(session.kana.slice(0, plan.due).every((id) => due[id]), 'the due kana come first');
    assert.equal(session.kana.filter((id) => due[id]).length, plan.due);
    assert.equal(session.ahead.length, plan.ahead);
  }
  // Every selected kana fits in the largest review, practice ahead included.
  assert.equal(new KanaReview(doc(cards)).overview({ selected: ids, today: DAY, size: QUICK_MAX }).plan.total, ids.length);
  // No size, or one out of range, is the usual twenty.
  for (const size of [undefined, 0, -4, 2.5, QUICK_MAX + 1, '10']) {
    const q = new KanaReview(doc(cards));
    assert.equal(q.overview({ selected: ids, today: DAY, size }).plan.total, QUICK_SIZE, `size ${String(size)}`);
    q.start({ selected: ids, today: DAY, seed: 5, size });
    assert.equal(q.dump().session.kana.length, QUICK_SIZE);
  }
  // A size that has not changed draws the same review as before sizes existed.
  const plain = new KanaReview(doc(cards));
  plain.start({ selected: ids, today: DAY, seed: 21 });
  const sized = new KanaReview(doc(cards));
  sized.start({ selected: ids, today: DAY, seed: 21, size: QUICK_SIZE });
  assert.deepEqual(sized.dump().session.kana, plain.dump().session.kana);
});

test('the most overdue kana make the cut, and practice ahead takes the lowest box, then the soonest day', () => {
  const ids = all('hiragana');
  const overdue = Object.fromEntries(ids.slice(0, 25).map((id, i) => [`hiragana:${id}`, rec(i % 2 ? 1 : 3, addDays('2026-10-01', i))]));
  const q = new KanaReview(doc(overdue));
  q.start({ selected: ids.slice(0, 25), today: DAY, seed: 4 });
  assert.deepEqual(set(q.dump().session.kana), set(ids.slice(0, 20)), 'the twenty longest overdue');
  // A tie on the day goes to the lower box.
  const tie = new KanaReview(doc({ 'hiragana:あ': rec(5, '2026-10-01'), 'hiragana:い': rec(1, '2026-10-01'), ...Object.fromEntries(ids.slice(2, 21).map((id) => [`hiragana:${id}`, rec(2, '2026-10-01')])) }));
  tie.start({ selected: ids.slice(0, 21), today: DAY, seed: 4 });
  assert.ok(!tie.dump().session.kana.includes('あ'), 'box 5 waits when the day ties');
  // Three due and two new leave fifteen places for practice ahead.
  const early = ids.slice(10, 40);
  const cards = {
    'hiragana:あ': rec(2, DAY), 'hiragana:い': rec(2, DAY), 'hiragana:う': rec(2, DAY),
    ...Object.fromEntries(early.map((id, i) => [`hiragana:${id}`, rec(1 + (i % 3), addDays(DAY, 30 - i))])),
  };
  const p = new KanaReview(doc(cards));
  p.start({ selected: [...ids.slice(0, 5), ...early], today: DAY, seed: 8 });
  const kana = p.dump().session.kana;
  assert.deepEqual(set(kana.slice(0, 3)), set(['あ', 'い', 'う']));
  assert.deepEqual(set(kana.slice(3, 5)), set(['え', 'お']));
  const rank = [...early].sort((a, b) => cards[`hiragana:${a}`].box - cards[`hiragana:${b}`].box
    || (cards[`hiragana:${a}`].due < cards[`hiragana:${b}`].due ? -1 : 1));
  assert.deepEqual(set(kana.slice(5)), set(rank.slice(0, 15)));
  assert.deepEqual(set(p.dump().session.ahead), set(rank.slice(0, 15)));
});

test('leaving discards the review but keeps what was answered; a finished review stays until left or replaced', () => {
  const q = new KanaReview();
  const config = { selected: ['か', 'き', 'く'], today: DAY, seed: 2 };
  q.start(config);
  const c = card(q);
  q.act('show', { id: c.id }); q.act('got', { id: c.id });
  assert.throws(() => q.start(config), /Finish or leave/);
  q.act('leave');
  assert.equal(q.view().status, 'idle');
  assert.equal(q.dump().session, null);
  assert.deepEqual(Object.keys(q.dump().cards), [`hiragana:${c.cellId}`]);
  q.start(config);
  assert.equal(q.view().session.position, 1);
  play(q, () => 'got');
  assert.equal(q.view().status, 'complete');
  const restored = reload(q);
  assert.equal(restored.view().status, 'complete');
  assert.deepEqual(restored.view(), q.view());
  restored.act('got', { id: c.id });
  assert.deepEqual(restored.view(), q.view(), 'nothing to answer once complete');
  restored.start({ ...config, seed: 3 });
  assert.equal(restored.view().status, 'playing', 'a finished review can be replaced');
  restored.act('leave');
  assert.equal(restored.view().status, 'idle');
});

test('a dumped review resumes exactly where it stopped, card shown or not', () => {
  const ids = all('katakana');
  const cards = Object.fromEntries(ids.slice(0, 6).map((id, i) => [`katakana:${id}`, rec(i % 5, addDays(DAY, i - 3))]));
  let q = new KanaReview(doc(cards));
  let twin = new KanaReview(doc(cards));
  const config = { script: 'katakana', selected: ids.slice(0, 12), today: DAY, seed: 77 };
  q.start(config); twin.start(config);
  const pick = (id, n) => ((id.charCodeAt(0) + n) % 3 ? 'got' : 'again');
  for (let n = 0; q.view().status === 'playing'; n += 1) {
    assert.ok(n < 100);
    const c = card(q);
    for (const action of ['show', pick(c.cellId, n)]) {
      q.act(action, { id: c.id });
      twin.act(action, { id: c.id });
      q = reload(q);
      assert.equal(q.view().recovered, false);
      assert.deepEqual(q.view(), twin.view());
      assert.deepEqual(q.dump(), twin.dump());
    }
  }
  assert.equal(q.view().status, 'complete');
  assert.deepEqual(reload(q).view(), twin.view());
});

test('damaged documents keep the valid cards and flag a recovery', () => {
  for (const document of [false, 'x', [], {}, { v: 2, cards: {} }, { v: 1 }, { v: 1, cards: [] }, { v: 1, cards: 'none' }]) {
    const q = new KanaReview(document);
    assert.equal(q.view().recovered, true, JSON.stringify(document));
    assert.equal(q.view().status, 'idle');
    assert.deepEqual(q.dump(), { v: 1, cards: {}, session: null });
  }
  assert.equal(new KanaReview(null).view().recovered, false, 'no document is a first visit');
  assert.equal(new KanaReview(doc({ 'hiragana:か': rec(1, DAY) })).view().recovered, false);
  const q = new KanaReview(doc({
    'hiragana:か': rec(1, DAY),
    'katakana:きゃ': rec(5, DAY, 9, 2),
    'hiragana:こ': { ...rec(2, DAY), note: 'extra' },
    'hiragana:っ': rec(1, DAY),
    'katakana:zz': rec(1, DAY),
    'romaji:か': rec(1, DAY),
    'hiragana:き': rec(9, DAY),
    'hiragana:く': rec(1, '2026-13-01'),
    'hiragana:け': rec(1, DAY, -1),
    'hiragana:さ': rec(1, DAY, 1.5),
    'hiragana:し': null,
  }));
  assert.equal(q.view().recovered, true);
  assert.deepEqual(q.dump().cards, { 'hiragana:か': rec(1, DAY), 'katakana:きゃ': rec(5, DAY, 9, 2), 'hiragana:こ': rec(2, DAY) });
});

test('a damaged review is dropped and the cards are kept', () => {
  const q = new KanaReview(doc({ 'hiragana:か': rec(1, DAY) }));
  q.start({ selected: ['か', 'き', 'く', 'け'], today: DAY, seed: 6 });
  let c = card(q);
  q.act('show', { id: c.id }); q.act('again', { id: c.id });
  c = card(q);
  q.act('show', { id: c.id });
  const good = JSON.parse(JSON.stringify(q.dump()));
  assert.equal(new KanaReview(good).view().recovered, false);
  const damages = [
    (s) => { s.kana.push(s.kana[0]); },
    (s) => { s.kana = []; s.queue = []; s.first = []; s.before = {}; },
    (s) => { s.first = [[s.kana[1], true]]; },
    (s) => { s.first[0][1] = 'no'; },
    (s) => { s.queue = s.queue.slice(1); },
    (s) => { s.queue = [...s.queue.slice(0, -1), 'た']; },
    (s) => { s.first[0][1] = true; },
    (s) => { s.shown = 'yes'; },
    (s) => { s.repeats = -1; },
    (s) => { delete s.before[s.kana[2]]; },
    (s) => { s.before[s.kana[2]] = 6; },
    (s) => { s.ahead = [s.kana.find((id) => s.before[id] === -1)]; },
    (s) => { s.script = 'romaji'; },
    (s) => { s.today = 'tomorrow'; },
    (s) => { s.id = ''; },
    (s) => { s.kana = [...s.kana, ...all('hiragana').filter((id) => !s.kana.includes(id)).slice(0, QUICK_SIZE)]; },
    (s) => { s.kana[3] = 'っ'; },
  ];
  for (const [n, damage] of damages.entries()) {
    const document = JSON.parse(JSON.stringify(good));
    damage(document.session);
    const loaded = new KanaReview(document);
    assert.equal(loaded.view().recovered, true, `damage ${n}`);
    assert.equal(loaded.view().status, 'idle', `damage ${n}`);
    assert.deepEqual(loaded.dump().cards, good.cards, `damage ${n}`);
  }
  // A finished review with an empty queue cannot be shown.
  const done = new KanaReview();
  done.start({ selected: ['か', 'き'], today: DAY, seed: 1 });
  play(done, () => 'got');
  const finished = JSON.parse(JSON.stringify(done.dump()));
  assert.equal(new KanaReview(finished).view().status, 'complete');
  finished.session.shown = true;
  assert.equal(new KanaReview(finished).view().recovered, true);
});

test('in Spanish, the overview says how to fix a selection, naming its kana and their sound', () => {
  const q = new KanaReview();
  const cases = [
    ['hiragana', [], 'Elige al menos dos kana con sonidos distintos. La tsu pequeña y la barra de vocal larga necesitan una palabra, así que se quedan en la práctica de lectura.'],
    ['hiragana', ['あ'], 'Elige al menos un kana más, con un sonido distinto de a.'],
    ['hiragana', ['お', 'を'], 'お y を suenan igual: o. Elige un kana más con otro sonido.'],
    ['katakana', ['じ', 'ぢ'], 'ジ y ヂ suenan igual: ji. Elige un kana más con otro sonido.'],
    ['romaji', ['か', 'き'], 'Elige hiragana o katakana.'],
  ];
  inSpanish(() => {
    for (const [script, selected, says] of cases) {
      const o = q.overview({ script, selected, today: DAY });
      assert.equal(o.ready, false, selected.join(''));
      assert.equal(o.message, says);
      assert.throws(() => q.start({ script, selected, today: DAY }), { message: 'Elige al menos dos kana con sonidos distintos.' });
    }
    assert.equal(q.overview({ selected: ['か', 'き'], today: DAY }).message, `Primero van los kana que tocan repaso y luego los nuevos, hasta ${QUICK_SIZE} por repaso.`);
    q.start({ selected: ['か', 'き', 'く'], today: DAY, seed: 2 });
    assert.throws(() => q.start({ selected: ['か', 'き'], today: DAY }), { message: 'Primero termina el repaso actual o sal de él.' });
  });
  q.act('leave');
  assert.match(q.overview({ selected: ['お', 'を'], today: DAY }).message, /^お and を both sound o\./, 'English again');
});

test('every Spanish message of the review is written, differs from the English, and has no em dash', () => {
  const selections = [['hiragana', []], ['hiragana', ['あ']], ['hiragana', ['お', 'を']], ['katakana', ['ず', 'づ']], ['romaji', ['か']], ['hiragana', ['か', 'き']]];
  const say = () => {
    const q = new KanaReview();
    const said = selections.map(([script, selected]) => q.overview({ script, selected, today: DAY }).message);
    const attempts = [
      () => q.start({ selected: ['あ'], today: DAY }),
      () => { q.start({ selected: ['か', 'き'], today: DAY, seed: 1 }); q.start({ selected: ['か', 'き'], today: DAY }); },
    ];
    for (const attempt of attempts) {
      try { attempt(); } catch (error) { said.push(error.message); }
    }
    return said;
  };
  const english = say();
  const spanish = inSpanish(say);
  assert.equal(spanish.length, selections.length + 2);
  spanish.forEach((es, i) => {
    assert.ok(es.trim(), `message ${i} is empty`);
    assert.notEqual(es, english[i], `message ${i} is still English`);
    assert.ok(!es.includes(EM_DASH), `message ${i}: a dash`);
    assert.ok(/[.]$/.test(es), `message ${i}: a plain sentence`);
  });
  assert.ok(!fs.readFileSync(new URL('../js/kana-review.js', import.meta.url), 'utf8').includes(EM_DASH));
});
