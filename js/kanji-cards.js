// Kanji cards: a quick pass over any set of kanji (a JLPT study level, a
// school grade, the learner's own collection) in Tomoshibi's two ways: turn
// the card over and say how it went, or pick its meaning from four. A free
// drill: each kanji keeps a Leitner box of its own here, so a weak one comes
// back sooner, and nothing here moves My kanji's review schedule
// (kanji-store.js). No DOM, storage or clock: today and the seed are
// arguments, and the document is plain data the native file layer keeps.
//
// A round is review.js, as in kana-review.js: a card is hidden until it is
// turned over (or answered, in the quiz), Again sends it to the back of the
// queue so it comes round again before the summary, and only a kanji's first
// answer in a round moves its box, on My kanji's schedule (1, 2, 4, 8, 16
// days) but in this drill's own file. In the quiz a pick turns the card over
// and shows the verdict; Next is the answer that moves the box.
//
// The document, version 1:
//   cards    { '日': { box, due, reviews, lapses } }  every kanji answered at least once
//   session  null, or the round in progress or just finished (Session, below)
//
// cardEntry is Tomoshibi's card, shared with the watch app: the short label,
// meanings, readings and an example word the site's own data gives a kanji.

import { readingKana, readingRomaji, hasKanji } from './kana.js';
import { makeRand, shuffle } from './play-rounds.js';
import { schedule, dayOf, TOP_BOX } from './kanji-store.js';
import { createReview, current, finished, show, isRepeat, position, answer, summary } from './review.js';

/** The most kanji one round holds. */
export const ROUND_SIZE = 20;
/** Turn the card over, or pick its meaning from four. */
export const MODES = Object.freeze(['flip', 'quiz']);
export const CARD_READINGS = 3;
export const CARD_MEANINGS = 4;
export const QUIZ_CHOICES = 4;

const CAP = 1000000;
const STRONG_BOX = 4;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DECK = /^[a-z0-9-]{1,40}$/;
const CARD_FIELDS = ['box', 'due', 'reviews', 'lapses'];

const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (n) => Number.isSafeInteger(n) && n >= 0 && n <= CAP;
const isDay = (v) => typeof v === 'string' && DAY.test(v);
const isKanji = (ch) => typeof ch === 'string' && [...ch].length === 1 && hasKanji(ch);
const earlier = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const bounded = (rec) => ({ box: rec.box, due: rec.due, reviews: Math.min(CAP, rec.reviews), lapses: Math.min(CAP, rec.lapses) });
const labelKey = (label) => String(label || '').trim().toLowerCase();

/**
 * A kanji's card from its KANJIDIC record (`rec`: on, kun, m, s, g), its JLPT
 * study level (`level`, Waller's unofficial lists) and its kanji-of-the-day
 * row (`row`: [kanji, 'gloss, gloss', written, reading, gloss]) when it has
 * one. The label is the row's first gloss, else the first meaning. KANJIDIC
 * appends a radical's own name ("one radical (no.1)"), which is no answer to
 * choose from, so those meanings are left out.
 */
export function cardEntry(rec, { level = null, row = null } = {}) {
  if (!object(rec)) return null;
  const m = (rec.m || []).filter((x) => !/radical/i.test(x)).slice(0, CARD_MEANINGS);
  return {
    label: row ? String(row[1]).split(',')[0].trim() : m[0] || '',
    m,
    on: (rec.on || []).slice(0, CARD_READINGS).map((r) => [r.replace(/[.-]/g, ''), readingRomaji(r)]),
    kun: (rec.kun || []).slice(0, CARD_READINGS).map((r) => [readingKana(r), readingRomaji(r)]),
    s: Number.isInteger(rec.s) ? rec.s : 0,
    ...(rec.g ? { g: rec.g } : {}),
    ...(level ? { n: level } : {}),
    ...(row ? { w: [row[2], row[3], row[4]] } : {}),
  };
}

/** How many of `chars` have a label no other of them has said already. */
function distinctLabels(chars, labels) {
  return new Set(chars.map((ch) => labelKey(labels[ch])).filter(Boolean)).size;
}

/** Ready when a round can be dealt from `pool`, and what to do when it cannot. */
function readiness(mode, pool, labels) {
  if (!MODES.includes(mode)) return { ready: false, message: 'Choose cards or the quiz.' };
  if (!pool.length) return { ready: false, message: 'There are no kanji in this set yet.' };
  if (mode === 'quiz' && distinctLabels(pool, labels) < QUIZ_CHOICES) {
    return { ready: false, message: `The quiz needs ${QUIZ_CHOICES} kanji with different meanings. Turn cards over instead, or add kanji to this set.` };
  }
  return { ready: true, message: mode === 'quiz' ? 'Pick each kanji\'s meaning from four.' : 'Turn each card over and say how it went.' };
}

/** A card read field by field: null when it cannot be used, `extra` when unknown fields were left out. */
function cleanCard(v) {
  if (!object(v) || !Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX) return null;
  if (!isDay(v.due) || !isCount(v.reviews) || !isCount(v.lapses)) return null;
  return { card: { box: v.box, due: v.due, reviews: v.reviews, lapses: v.lapses }, extra: Object.keys(v).some((k) => !CARD_FIELDS.includes(k)) };
}

/** Three other kanji whose labels differ from the answer's and each other's, shuffled in with it. */
function choicesFor(ch, pool, labels, rand) {
  const taken = new Set([labelKey(labels[ch])]);
  const others = [];
  for (const other of shuffle(pool.filter((c) => c !== ch), rand)) {
    const key = labelKey(labels[other]);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    others.push(other);
    if (others.length === QUIZ_CHOICES - 1) break;
  }
  return shuffle([ch, ...others], rand);
}

// ── Session ─────────────────────────────────────────────────────────────
//
// As kept in the document:
//   id       deck:mode:today:seed, so a card's id (id:answers so far) names one step
//   deck, mode, today   the round's set, its way, and the day it began: every
//                       answer in it is scheduled from that day
//   chars    the round's kanji in the order first shown
//   queue, shown, first, repeats   review.js's round, first as [kanji, ok] pairs
//   before   { kanji: box } before this round, -1 for a kanji never answered
//   ahead    kanji that were not due when the round began (practice ahead)
//   quiz     null in a card round; else { options: { kanji: [four kanji] },
//            labels: { kanji: label } } for every kanji among the options
//   picked   the quiz's pick for the card on screen: null before it, '' when
//            the answer was revealed without one
//
// Answers go in queue order and Again only sends a kanji to the back, so
// `first` is a prefix of `chars` and the queue is the rest of `chars`
// followed by kanji answered Again. A session that breaks that shape cannot
// be resumed and is dropped.

function cleanQuiz(q, chars) {
  if (!object(q) || !object(q.options) || !object(q.labels)) return null;
  const options = {};
  for (const ch of chars) {
    const list = q.options[ch];
    if (!Array.isArray(list) || list.length !== QUIZ_CHOICES || !list.includes(ch) || new Set(list).size !== list.length || !list.every(isKanji)) return null;
    options[ch] = [...list];
  }
  const labels = {};
  for (const ch of new Set(Object.values(options).flat())) {
    const label = q.labels[ch];
    if (typeof label !== 'string' || !label.trim() || label.length > 80) return null;
    labels[ch] = label;
  }
  return { options, labels };
}

function cleanSession(s) {
  if (!object(s) || typeof s.id !== 'string' || !s.id || s.id.length > 80) return null;
  if (typeof s.deck !== 'string' || !DECK.test(s.deck) || !MODES.includes(s.mode) || !isDay(s.today)) return null;
  const unique = (v) => Array.isArray(v) && v.every(isKanji) && new Set(v).size === v.length;
  if (!unique(s.chars) || !s.chars.length || s.chars.length > ROUND_SIZE || !unique(s.queue) || !unique(s.ahead)) return null;
  if (!Array.isArray(s.first) || !s.first.every((p) => Array.isArray(p) && p.length === 2 && typeof p[1] === 'boolean')) return null;
  const answered = s.first.map(([ch]) => ch);
  if (answered.some((ch, i) => ch !== s.chars[i])) return null;
  const waiting = s.chars.slice(answered.length);
  if (waiting.some((ch, i) => s.queue[i] !== ch)) return null;
  const first = new Map(s.first);
  const back = s.queue.slice(waiting.length);
  if (back.some((ch) => first.get(ch) !== false)) return null;
  if (!isCount(s.repeats) || typeof s.shown !== 'boolean' || (s.shown && !s.queue.length)) return null;
  if (s.first.filter(([ch, ok]) => !ok && !back.includes(ch)).length > s.repeats) return null;
  if (!object(s.before) || Object.keys(s.before).length !== s.chars.length) return null;
  if (!s.chars.every((ch) => Number.isInteger(s.before[ch]) && s.before[ch] >= -1 && s.before[ch] <= TOP_BOX)) return null;
  if (s.ahead.some((ch) => !s.chars.includes(ch) || s.before[ch] < 0)) return null;
  const quiz = s.mode === 'quiz' ? cleanQuiz(s.quiz, s.chars) : null;
  if (s.mode === 'quiz' && !quiz) return null;
  if (s.mode === 'flip' && s.quiz != null) return null;
  // In the quiz only a pick or a reveal turns the card over, so the two agree.
  let picked = null;
  if (s.mode === 'quiz') {
    if (s.shown !== (s.picked != null)) return null;
    if (s.picked != null) {
      if (typeof s.picked !== 'string' || (s.picked !== '' && !quiz.options[s.queue[0]].includes(s.picked))) return null;
      picked = s.picked;
    }
  } else if (s.picked != null) return null;
  return {
    id: s.id, deck: s.deck, mode: s.mode, today: s.today, chars: [...s.chars],
    before: Object.fromEntries(s.chars.map((ch) => [ch, s.before[ch]])), ahead: [...s.ahead], quiz, picked,
    review: { queue: [...s.queue], total: s.chars.length, shown: s.shown, first, repeats: s.repeats },
  };
}

// A kanji's first answer in a round. A due or never-answered kanji takes the
// box schedule from the round's day. A kanji practised ahead keeps its box and
// its day on Got it, with one more review counted: a right answer before the
// day is no reason to stretch the interval. Again is a lapse whenever it comes.
function moveCard(cards, s, ch, ok) {
  const card = cards[ch];
  if (card && s.ahead.includes(ch)) {
    cards[ch] = ok ? { ...card, reviews: Math.min(CAP, card.reviews + 1) } : bounded(schedule(card, false, s.today));
  } else {
    cards[ch] = bounded(schedule(card || { box: 0, due: s.today, reviews: 0, lapses: 0 }, ok, s.today));
  }
}

const stepId = (s) => `${s.id}:${s.review.first.size + s.review.repeats}`;

export class KanjiCards {
  constructor(document) {
    this.cards = {};
    this.session = null;
    this.recovered = false;
    if (document == null) return;
    if (!object(document) || document.v !== 1 || !object(document.cards)) { this.recovered = true; return; }
    for (const [ch, value] of Object.entries(document.cards)) {
      const clean = isKanji(ch) ? cleanCard(value) : null;
      if (!clean || clean.extra) this.recovered = true;
      if (clean) this.cards[ch] = clean.card;
    }
    if (document.session != null) {
      this.session = cleanSession(document.session);
      if (!this.session) this.recovered = true;
    }
  }

  /**
   * Where a set's kanji stand on `today`. The four counts split `total`: fresh
   * (never answered here), due (answered, due today or earlier), strong (not
   * due, box 4 or 5) and learning (the rest).
   */
  overview({ chars = [], mode = 'flip', labels = {}, today = dayOf(Date.now()) } = {}) {
    if (!isDay(today)) throw new Error('Expected today as YYYY-MM-DD.');
    const pool = [...new Set(chars.filter(isKanji))];
    const counts = { due: 0, fresh: 0, learning: 0, strong: 0 };
    for (const ch of pool) {
      const card = this.cards[ch];
      counts[!card ? 'fresh' : card.due <= today ? 'due' : card.box >= STRONG_BOX ? 'strong' : 'learning'] += 1;
    }
    return { total: pool.length, ...counts, ...readiness(mode, mode === 'quiz' ? pool.filter((ch) => labelKey(labels[ch])) : pool, labels) };
  }

  /**
   * Up to ROUND_SIZE kanji of `chars`: the due ones first (the longest
   * overdue, then the lower box, then the set's order), then those never
   * answered, in the set's order, and only when that is still short, practice
   * ahead (the lowest box, then the soonest due). Each group is shuffled with
   * `seed`; the groups keep their order. The quiz needs `labels` for the set.
   */
  start({ deck, chars = [], mode = 'flip', labels = {}, today = dayOf(Date.now()), seed = Date.now() } = {}) {
    if (this.session && !finished(this.session.review)) throw new Error('Finish or leave the current round first.');
    if (typeof deck !== 'string' || !DECK.test(deck)) throw new Error('Expected a set id.');
    if (!isDay(today)) throw new Error('Expected today as YYYY-MM-DD.');
    let pool = [...new Set(chars.filter(isKanji))];
    if (mode === 'quiz') pool = pool.filter((ch) => labelKey(labels[ch]));
    const { ready, message } = readiness(mode, pool, labels);
    if (!ready) throw new Error(message);
    const order = new Map(pool.map((ch, i) => [ch, i]));
    const card = (ch) => this.cards[ch];
    const due = pool.filter((ch) => card(ch) && card(ch).due <= today)
      .sort((a, b) => earlier(card(a).due, card(b).due) || card(a).box - card(b).box || order.get(a) - order.get(b));
    const fresh = pool.filter((ch) => !card(ch));
    const ahead = pool.filter((ch) => card(ch) && card(ch).due > today)
      .sort((a, b) => card(a).box - card(b).box || earlier(card(a).due, card(b).due) || order.get(a) - order.get(b));
    const rand = makeRand(seed);
    const chosen = [];
    for (const group of [due, fresh, ahead]) chosen.push(...shuffle(group.slice(0, ROUND_SIZE - chosen.length), rand));
    let quiz = null;
    if (mode === 'quiz') {
      const options = Object.fromEntries(chosen.map((ch) => [ch, choicesFor(ch, pool, labels, rand)]));
      const shown = new Set(Object.values(options).flat());
      quiz = { options, labels: Object.fromEntries([...shown].map((ch) => [ch, String(labels[ch]).trim()])) };
    }
    this.session = {
      id: `${deck}:${mode}:${today}:${Number(seed) >>> 0}`, deck, mode, today, chars: chosen,
      before: Object.fromEntries(chosen.map((ch) => [ch, card(ch) ? card(ch).box : -1])),
      ahead: chosen.filter((ch) => card(ch) && card(ch).due > today),
      quiz, picked: null,
      review: createReview(chosen),
    };
    return this.view();
  }

  /**
   * Cards: 'show', then 'again' or 'got'. Quiz: 'answer' with `pick` (a
   * kanji among the options) or 'reveal', then 'next'. Every action but leave
   * names the card on screen by its `id`; any other id is a stale or double
   * tap and changes nothing. Leaving discards the round; kanji already
   * answered keep their boxes.
   */
  act(action, { id, pick } = {}) {
    const s = this.session;
    if (!s) return this.view();
    if (action === 'leave') { this.session = null; return this.view(); }
    if (finished(s.review) || id !== stepId(s)) return this.view();
    const r = s.review;
    const move = (ch, ok) => moveCard(this.cards, s, ch, ok);
    if (s.mode === 'flip') {
      if (action === 'show') show(r);
      else if (action === 'again' || action === 'got') answer(r, action === 'got', move);
    } else if (action === 'answer' && s.picked === null && s.quiz.options[current(r)].includes(pick)) {
      s.picked = pick;
      show(r);
    } else if (action === 'reveal' && s.picked === null) {
      s.picked = '';
      show(r);
    } else if (action === 'next' && s.picked !== null) {
      const ok = s.picked === current(r);
      s.picked = null;
      answer(r, ok, move);
    }
    return this.view();
  }

  /**
   * status 'idle', 'playing' or 'complete'. Playing: the card on screen and
   * its box before this round (-1 never answered); in the quiz its four
   * options with their labels, the pick and whether it was right. Complete:
   * what the summary says, until 'leave' or a new start. `stronger` counts
   * kanji whose first answer moved them up a box (never practice ahead).
   */
  view() {
    const base = { recovered: this.recovered, status: 'idle', session: null };
    const s = this.session;
    if (!s) return base;
    const r = s.review;
    const { at, of } = position(r);
    if (finished(r)) {
      const sum = summary(r);
      const stronger = [...r.first].filter(([ch, ok]) => ok && !s.ahead.includes(ch) && s.before[ch] < TOP_BOX).length;
      return { ...base, status: 'complete', session: { deck: s.deck, mode: s.mode, position: of, total: of, result: { reviewed: sum.reviewed, got: sum.got, again: sum.again, stronger } } };
    }
    const ch = current(r);
    const card = { id: stepId(s), ch, shown: r.shown, box: s.before[ch] };
    if (s.mode === 'quiz') {
      card.options = s.quiz.options[ch].map((c) => ({ ch: c, label: s.quiz.labels[c] }));
      card.picked = s.picked;
      card.right = s.picked === null ? null : s.picked === ch;
    }
    return { ...base, status: 'playing', session: { deck: s.deck, mode: s.mode, position: at, total: of, isRepeat: isRepeat(r), card } };
  }

  dump() {
    const s = this.session;
    return {
      v: 1,
      cards: { ...this.cards },
      session: s && {
        id: s.id, deck: s.deck, mode: s.mode, today: s.today, chars: [...s.chars],
        queue: [...s.review.queue], shown: s.review.shown, first: [...s.review.first], repeats: s.review.repeats,
        before: { ...s.before }, ahead: [...s.ahead], quiz: s.quiz, picked: s.picked,
      },
    };
  }
}
