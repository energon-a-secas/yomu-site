// Kanji cards: a free drill over any set of kanji, with boxes of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KanjiCards, cardEntry, ROUND_SIZE, QUIZ_CHOICES } from '../js/kanji-cards.js';

const TODAY = '2026-11-06';
const LABELS = { 日: 'day', 月: 'month', 火: 'fire', 水: 'water', 木: 'tree', 金: 'gold', 土: 'soil' };
const SET = Object.keys(LABELS);

/**
 * Play a whole round, first answers by `firstOk(kanji)`. A kanji answered
 * Again keeps coming back until it is answered right, so a repeat is right.
 */
function play(cards, firstOk) {
  const met = new Set();
  const ok = (ch) => met.has(ch) || firstOk(ch);
  let v = cards.view();
  for (let guard = 0; v.status === 'playing'; guard += 1) {
    assert.ok(guard < 200, 'the round never ended');
    const { id, ch } = v.session.card;
    const right = ok(ch);
    met.add(ch);
    if (v.session.mode === 'flip') {
      cards.act('show', { id });
      v = cards.act(right ? 'got' : 'again', { id });
    } else {
      const pick = right ? ch : v.session.card.options.find((o) => o.ch !== ch).ch;
      cards.act('answer', { id, pick });
      v = cards.act('next', { id });
    }
  }
  return v;
}

test('a card is Tomoshibi\'s: label, plain meanings, short reading lists, example word', () => {
  const rec = { on: ['ニチ', 'ジツ'], kun: ['ひ', '-び', '-か'], m: ['day', 'sun', 'Japan', 'counter for days', 'radical (no.72)'], s: 4, g: 1 };
  assert.deepEqual(cardEntry(rec, { level: 5, row: ['日', 'day, sun', '一日', 'いちにち', 'one day'] }), {
    label: 'day', m: ['day', 'sun', 'Japan', 'counter for days'],
    on: [['ニチ', 'nichi'], ['ジツ', 'jitsu']], kun: [['ひ', 'hi'], ['び', '-bi'], ['か', '-ka']],
    s: 4, g: 1, n: 5, w: ['一日', 'いちにち', 'one day'],
  });
  const plain = cardEntry({ on: [], kun: [], m: ['one radical (no.1)', 'one'], s: 1 });
  assert.equal(plain.label, 'one', 'a radical name is no answer');
  assert.equal('w' in plain || 'n' in plain || 'g' in plain, false);
  assert.equal(cardEntry(null), null);
});

test('a card round shows, then moves each kanji once, on its first answer', () => {
  const cards = new KanjiCards();
  let v = cards.start({ deck: 'n5', chars: ['日', '月', '火'], today: TODAY, seed: 1 });
  const first = v.session.card;
  assert.equal(v.status, 'playing');
  assert.equal(first.shown, false);
  assert.equal(cards.act('got', { id: first.id }).session.card.id, first.id, 'an answer before turning over is refused');
  cards.act('show', { id: first.id });
  v = cards.act('again', { id: first.id });
  assert.equal(cards.cards[first.ch].box, 1, 'Again files the kanji in box 1');
  assert.equal(cards.cards[first.ch].due, '2026-11-07');
  v = play(cards, () => true);
  assert.equal(v.status, 'complete');
  assert.deepEqual(v.session.result, { reviewed: 3, got: 2, again: [first.ch], stronger: 2 });
  assert.equal(cards.cards[first.ch].box, 1, 'the repeat after Again does not move it again');
});

test('a stale or doubled tap changes nothing', () => {
  const cards = new KanjiCards();
  const v = cards.start({ deck: 'n5', chars: ['日', '月'], today: TODAY, seed: 2 });
  const { id } = v.session.card;
  cards.act('show', { id });
  cards.act('got', { id });
  const after = cards.act('got', { id });
  assert.equal(after.session.position, 2, 'the second Got it on the old card was ignored');
  assert.equal(Object.keys(cards.cards).length, 1);
});

test('a round deals due kanji first, then new ones, then practice ahead, at most a round', () => {
  const cards = new KanjiCards({ v: 1, cards: { 月: { box: 2, due: '2026-11-01', reviews: 3, lapses: 0 }, 火: { box: 4, due: '2026-12-01', reviews: 6, lapses: 0 } }, session: null });
  const v = cards.start({ deck: 'n5', chars: ['日', '月', '火'], today: TODAY, seed: 3 });
  assert.equal(v.session.card.ch, '月', 'the overdue kanji comes first');
  assert.deepEqual(cards.session.chars, ['月', '日', '火']);
  assert.deepEqual(cards.session.ahead, ['火']);
  const many = Array.from({ length: 60 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  const big = new KanjiCards().start({ deck: 'n1', chars: many, today: TODAY, seed: 4 });
  assert.equal(big.session.total, ROUND_SIZE);
});

test('the quiz offers the answer and three kanji with other meanings', () => {
  const cards = new KanjiCards();
  const v = cards.start({ deck: 'mine', chars: SET, mode: 'quiz', labels: LABELS, today: TODAY, seed: 5 });
  for (const ch of cards.session.chars) {
    const options = cards.session.quiz.options[ch];
    assert.equal(options.length, QUIZ_CHOICES);
    assert.ok(options.includes(ch));
    assert.equal(new Set(options.map((o) => LABELS[o])).size, QUIZ_CHOICES, 'no two options mean the same');
  }
  const card = v.session.card;
  assert.equal(card.picked, null);
  const wrong = card.options.find((o) => o.ch !== card.ch).ch;
  let after = cards.act('answer', { id: card.id, pick: wrong });
  assert.equal(after.session.card.right, false);
  assert.equal(after.session.card.shown, true, 'the pick turns the card over');
  assert.equal(cards.act('answer', { id: card.id, pick: card.ch }).session.card.picked, wrong, 'the first pick stands');
  after = cards.act('next', { id: card.id });
  assert.equal(cards.cards[card.ch].box, 1, 'Next files a wrong pick as Again');
  const now = after.session.card;
  cards.act('reveal', { id: now.id });
  cards.act('next', { id: now.id });
  assert.equal(cards.cards[now.ch].box, 1, 'a revealed answer counts as Again');
});

test('the quiz needs four different meanings, and says so', () => {
  const cards = new KanjiCards();
  const three = { 日: 'day', 月: 'month', 火: 'fire', 曜: 'day' };
  assert.throws(() => cards.start({ deck: 'mine', chars: Object.keys(three), mode: 'quiz', labels: three, today: TODAY }), /needs 4 kanji with different meanings/);
  const o = cards.overview({ chars: Object.keys(three), mode: 'quiz', labels: three, today: TODAY });
  assert.equal(o.ready, false);
  assert.equal(o.fresh, 4);
  assert.equal(cards.overview({ chars: [], today: TODAY }).ready, false);
});

test('a whole quiz round completes and its summary counts the misses', () => {
  const cards = new KanjiCards();
  cards.start({ deck: 'mine', chars: SET, mode: 'quiz', labels: LABELS, today: TODAY, seed: 6 });
  const v = play(cards, (ch) => ch !== '水');
  assert.equal(v.status, 'complete');
  assert.equal(v.session.result.reviewed, SET.length);
  assert.deepEqual(v.session.result.again, ['水']);
});

test('the document survives a round trip, mid-round, in both modes', () => {
  for (const mode of ['flip', 'quiz']) {
    const cards = new KanjiCards();
    const v = cards.start({ deck: 'g1', chars: SET, mode, labels: LABELS, today: TODAY, seed: 7 });
    const { id } = v.session.card;
    if (mode === 'flip') { cards.act('show', { id }); cards.act('again', { id }); } else { cards.act('answer', { id, pick: v.session.card.ch }); }
    const again = new KanjiCards(JSON.parse(JSON.stringify(cards.dump())));
    assert.equal(again.recovered, false);
    assert.deepEqual(again.view(), cards.view());
  }
});

test('a damaged document keeps what is valid and says it was recovered', () => {
  const cards = new KanjiCards({ v: 1, cards: { 日: { box: 2, due: TODAY, reviews: 1, lapses: 0 }, あ: { box: 1, due: TODAY, reviews: 1, lapses: 0 }, 月: { box: 9 } }, session: { id: 'x' } });
  assert.equal(cards.recovered, true);
  assert.deepEqual(Object.keys(cards.cards), ['日'], 'kana and impossible boxes are dropped');
  assert.equal(cards.session, null);
  const quiz = new KanjiCards();
  quiz.start({ deck: 'mine', chars: SET, mode: 'quiz', labels: LABELS, today: TODAY, seed: 8 });
  const doc = quiz.dump();
  doc.session.shown = true; // turned over with no pick: not a state the quiz can reach
  assert.equal(new KanjiCards(doc).session, null);
  assert.equal(new KanjiCards('nonsense').recovered, true);
});
