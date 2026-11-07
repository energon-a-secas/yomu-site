// Quick kana review: a short self-graded pass over the learner's selected
// kana of one script, so the weak ones come back sooner than the strong ones.
// No DOM, audio player, storage or clock: today and the seed are arguments,
// and the document is plain data the native file layer keeps.
//
// Each kana has a Leitner box on the same schedule as My kanji
// (kanji-store.js schedule): Got it moves it up a box (1, 2, 4, 8, 16 days),
// Again sends it back to box 1, due tomorrow. A review is review.js itself:
// a card is hidden until shown, Again puts the kana at the end of the queue
// so it comes round again before the summary, and only a kana's first answer
// in a review moves its schedule.
//
// The document, version 1:
//   cards    { 'hiragana:か': { box, due, reviews, lapses } }  every kana answered at least once
//   session  null, or the review in progress or just finished (Session, below)
// A card key is a script and a chart cell id (kana-chart.js). Cell ids are
// hiragana in both scripts, so 'katakana:か' is カ. Small tsu and the
// long-vowel bar need a word, so they are never cards (kana-games.js gameKana).
// Nothing a learner typed is kept. The sounds and the shape reminders are
// kana-games.js's; the few sentences written here are original and, like
// them, dedicated to CC0. They are { en, es } and resolve to the current
// language (strings.js useLang) when they are said.

import { t } from './strings.js';
import { gameKana } from './kana-games.js';
import { kanaChart } from './kana-chart.js';
import { makeRand, shuffle } from './play-rounds.js';
import { schedule, dayOf, TOP_BOX } from './kanji-store.js';
import { createReview, current, finished, show, isRepeat, position, answer, summary } from './review.js';

/** The most kana one quick review holds. */
export const QUICK_SIZE = 20;
/** A kana in this box or higher is strong: it waits 8 or 16 days between reviews. */
const STRONG_BOX = 4;
const SCRIPTS = ['hiragana', 'katakana'];
const CAP = 1000000;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const CARD_FIELDS = ['box', 'due', 'reviews', 'lapses'];

const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (n) => Number.isSafeInteger(n) && n >= 0 && n <= CAP;
const isDay = (v) => typeof v === 'string' && DAY.test(v);
const earlier = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (script, id) => `${script}:${id}`;
const bounded = (rec) => ({ box: rec.box, due: rec.due, reviews: Math.min(CAP, rec.reviews), lapses: Math.min(CAP, rec.lapses) });

// The ids a card can have, per script, worked out on first use.
const pools = {};
function poolOf(script) {
  if (!pools[script]) {
    pools[script] = new Set(kanaChart(script).filter((s) => s.id !== 'timing').flatMap((s) => s.cells).filter((c) => c.kana).map((c) => c.id));
  }
  return pools[script];
}

function validKey(key) {
  const at = key.indexOf(':');
  const script = key.slice(0, at);
  return at > 0 && SCRIPTS.includes(script) && poolOf(script).has(key.slice(at + 1));
}

/** A card read field by field: null when it cannot be used, `extra` when unknown fields were left out. */
function cleanCard(v) {
  if (!object(v) || !Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX) return null;
  if (!isDay(v.due) || !isCount(v.reviews) || !isCount(v.lapses)) return null;
  return { card: { box: v.box, due: v.due, reviews: v.reviews, lapses: v.lapses }, extra: Object.keys(v).some((k) => !CARD_FIELDS.includes(k)) };
}

/** A, B y C: a Spanish list. */
const listEs = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

/** Ready when the selection holds two kana that sound different, and what to do when it does not. */
function readiness(script, pool) {
  if (!SCRIPTS.includes(script)) return { ready: false, message: t({ en: 'Choose hiragana or katakana.', es: 'Elige hiragana o katakana.' }) };
  const sounds = new Set(pool.map((c) => c.sound));
  if (sounds.size >= 2) {
    return {
      ready: true,
      message: t({
        en: `Due kana come first, then new ones, up to ${QUICK_SIZE} in one review.`,
        es: `Primero van los kana que tocan repaso y luego los nuevos, hasta ${QUICK_SIZE} por repaso.`,
      }),
    };
  }
  if (!pool.length) {
    return {
      ready: false,
      message: t({
        en: 'Choose at least two kana with different sounds. Small tsu and the long-vowel bar need a word, so they stay in reading practice.',
        es: 'Elige al menos dos kana con sonidos distintos. La tsu pequeña y la barra de vocal larga necesitan una palabra, así que se quedan en la práctica de lectura.',
      }),
    };
  }
  const sound = pool[0].sound;
  if (pool.length === 1) {
    return {
      ready: false,
      message: t({
        en: `Choose at least one more kana with a sound other than ${sound}.`,
        es: `Elige al menos un kana más, con un sonido distinto de ${sound}.`,
      }),
    };
  }
  const kana = pool.map((c) => c.kana);
  return {
    ready: false,
    message: t({
      en: `${kana.join(' and ')} ${pool.length === 2 ? 'both' : 'all'} sound ${sound}. Choose one more kana with a different sound.`,
      es: `${listEs(kana)} suenan igual: ${sound}. Elige un kana más con otro sonido.`,
    }),
  };
}

// ── Session ─────────────────────────────────────────────────────────────
//
// As kept in the document:
//   id       script:today:seed, so a card's id (id:answers so far) names one step
//   script, today   the review's script, and the day it began: every answer
//                   in it is scheduled from that day
//   kana     the review's kana in the order first shown; answers so far are
//            first.length + repeats, which is what makes each step's id new
//   queue, shown, first, repeats   review.js's review, first as [id, ok] pairs
//   before   { id: box } before this review, -1 for a kana never answered
//   ahead    kana that were not due when the review began (practice ahead)
//
// A kana's first answers go in queue order, and Again only sends a kana to
// the back, so `first` is always a prefix of `kana`, and the queue is the
// rest of `kana` followed by kana answered Again. A session that breaks
// that shape cannot be resumed and is dropped.

function cleanSession(s) {
  if (!object(s) || typeof s.id !== 'string' || !s.id || s.id.length > 80 || !SCRIPTS.includes(s.script) || !isDay(s.today)) return null;
  const pool = poolOf(s.script);
  const ids = (v) => Array.isArray(v) && v.every((id) => typeof id === 'string' && pool.has(id)) && new Set(v).size === v.length;
  if (!ids(s.kana) || !s.kana.length || s.kana.length > QUICK_SIZE || !ids(s.queue) || !ids(s.ahead)) return null;
  if (!Array.isArray(s.first) || !s.first.every((p) => Array.isArray(p) && p.length === 2 && typeof p[1] === 'boolean')) return null;
  const answered = s.first.map(([id]) => id);
  if (answered.some((id, i) => id !== s.kana[i])) return null;
  const waiting = s.kana.slice(answered.length);
  if (waiting.some((id, i) => s.queue[i] !== id)) return null;
  const first = new Map(s.first);
  const back = s.queue.slice(waiting.length);
  if (back.some((id) => first.get(id) !== false)) return null;
  if (!isCount(s.repeats) || typeof s.shown !== 'boolean' || (s.shown && !s.queue.length)) return null;
  // A kana answered Again that has left the queue was answered again later.
  if (s.first.filter(([id, ok]) => !ok && !back.includes(id)).length > s.repeats) return null;
  if (!object(s.before) || Object.keys(s.before).length !== s.kana.length) return null;
  if (!s.kana.every((id) => Number.isInteger(s.before[id]) && s.before[id] >= -1 && s.before[id] <= TOP_BOX)) return null;
  if (s.ahead.some((id) => !s.kana.includes(id) || s.before[id] < 0)) return null;
  return {
    id: s.id, script: s.script, today: s.today, kana: [...s.kana],
    before: Object.fromEntries(s.kana.map((id) => [id, s.before[id]])), ahead: [...s.ahead],
    review: { queue: [...s.queue], total: s.kana.length, shown: s.shown, first, repeats: s.repeats },
  };
}

// A kana's first answer in a review. A due or never-answered kana takes the
// My kanji schedule from the review's day. A kana practised ahead, which was
// not due when the review began, keeps its box and its day on Got it, with
// only one more review counted: a right answer before the day is no reason
// to stretch the interval. Again is a lapse whenever it comes, so it files
// the kana in box 1, due tomorrow, as for any other kana.
function moveCard(cards, s, cellId, ok) {
  const key = keyOf(s.script, cellId);
  const card = cards[key];
  if (card && s.ahead.includes(cellId)) {
    cards[key] = ok ? { ...card, reviews: Math.min(CAP, card.reviews + 1) } : bounded(schedule(card, false, s.today));
  } else {
    cards[key] = bounded(schedule(card || { box: 0, due: s.today, reviews: 0, lapses: 0 }, ok, s.today));
  }
}

const stepId = (s) => `${s.id}:${s.review.first.size + s.review.repeats}`;
const cellsOf = (script, ids) => new Map(gameKana(script, ids).map((c) => [c.id, c]));

export class KanaReview {
  constructor(document) {
    this.cards = {};
    this.session = null;
    this.recovered = false;
    if (document == null) return;
    if (!object(document) || document.v !== 1 || !object(document.cards)) { this.recovered = true; return; }
    for (const [key, value] of Object.entries(document.cards)) {
      const clean = validKey(key) ? cleanCard(value) : null;
      if (!clean || clean.extra) this.recovered = true;
      if (clean) this.cards[key] = clean.card;
    }
    if (document.session != null) {
      this.session = cleanSession(document.session);
      if (!this.session) this.recovered = true;
    }
  }

  /**
   * The selected kana of `script` and where each stands on `today`. The four
   * counts split `total`: fresh (never answered), due (answered, due today or
   * earlier), strong (not due, box 4 or 5) and learning (the rest).
   */
  overview({ script = 'hiragana', selected = [], today = dayOf(Date.now()) } = {}) {
    if (!isDay(today)) throw new Error('Expected today as YYYY-MM-DD.');
    const pool = SCRIPTS.includes(script) ? gameKana(script, selected) : [];
    const counts = { due: 0, fresh: 0, learning: 0, strong: 0 };
    const cells = pool.map((c) => {
      const card = this.cards[keyOf(script, c.id)];
      counts[!card ? 'fresh' : card.due <= today ? 'due' : card.box >= STRONG_BOX ? 'strong' : 'learning'] += 1;
      return { id: c.id, kana: c.kana, box: card ? card.box : -1 };
    });
    const { ready, message } = readiness(script, pool);
    return { script, total: pool.length, ...counts, ready, message, cells };
  }

  /**
   * Up to QUICK_SIZE kana: the due ones first (the longest overdue, then the
   * lower box, then chart order), then those never answered, in chart order,
   * and only when that is still short, practice ahead: kana not due yet, the
   * lowest box first, then the soonest due. That order picks the kana; each
   * group is then shuffled with `seed`, and the groups keep their order.
   */
  start({ script = 'hiragana', selected = [], today = dayOf(Date.now()), seed = Date.now() } = {}) {
    if (this.session && !finished(this.session.review)) {
      throw new Error(t({ en: 'Finish or leave the current review first.', es: 'Primero termina el repaso actual o sal de él.' }));
    }
    if (!isDay(today)) throw new Error('Expected today as YYYY-MM-DD.');
    const pool = SCRIPTS.includes(script) ? gameKana(script, selected) : [];
    if (!readiness(script, pool).ready) {
      throw new Error(t({ en: 'Choose at least two kana with different sounds.', es: 'Elige al menos dos kana con sonidos distintos.' }));
    }
    const order = new Map(pool.map((c, i) => [c.id, i]));
    const card = (c) => this.cards[keyOf(script, c.id)];
    const due = pool.filter((c) => card(c) && card(c).due <= today)
      .sort((a, b) => earlier(card(a).due, card(b).due) || card(a).box - card(b).box || order.get(a.id) - order.get(b.id));
    const fresh = pool.filter((c) => !card(c));
    const ahead = pool.filter((c) => card(c) && card(c).due > today)
      .sort((a, b) => card(a).box - card(b).box || earlier(card(a).due, card(b).due) || order.get(a.id) - order.get(b.id));
    const rand = makeRand(seed);
    const chosen = [];
    for (const group of [due, fresh, ahead]) chosen.push(...shuffle(group.slice(0, QUICK_SIZE - chosen.length), rand));
    const kana = chosen.map((c) => c.id);
    this.session = {
      id: `${script}:${today}:${Number(seed) >>> 0}`, script, today, kana,
      before: Object.fromEntries(chosen.map((c) => [c.id, card(c) ? card(c).box : -1])),
      ahead: chosen.filter((c) => card(c) && card(c).due > today).map((c) => c.id),
      review: createReview(kana),
    };
    return this.view();
  }

  /**
   * 'show', 'again', 'got' or 'leave'. Every action but leave names the card
   * on screen by its `id` (view().session.card.id); any other id is a stale
   * or double tap and changes nothing. An answer before 'show' is refused.
   * Leaving discards the review; the kana already answered keep their schedule.
   */
  act(action, { id } = {}) {
    const s = this.session;
    if (!s) return this.view();
    if (action === 'leave') { this.session = null; return this.view(); }
    if (finished(s.review) || id !== stepId(s)) return this.view();
    if (action === 'show') show(s.review);
    else if (action === 'again' || action === 'got') answer(s.review, action === 'got', (cellId, ok) => moveCard(this.cards, s, cellId, ok));
    return this.view();
  }

  /**
   * status 'idle', 'playing' or 'complete'. Playing: the card on screen, its
   * sound and shape reminder only once shown, and `box` as it was before this
   * review (-1 never answered). Complete: what the summary says, until
   * 'leave' or a new start. `stronger` counts kana whose first answer was Got
   * it and moved them up a box (never practice ahead, never the top box).
   */
  view() {
    const base = { recovered: this.recovered, status: 'idle', session: null };
    const s = this.session;
    if (!s) return base;
    const r = s.review;
    const { at, of } = position(r);
    const cells = cellsOf(s.script, s.kana);
    if (finished(r)) {
      const sum = summary(r);
      const stronger = [...r.first].filter(([id, ok]) => ok && !s.ahead.includes(id) && s.before[id] < TOP_BOX).length;
      return {
        ...base, status: 'complete',
        session: { script: s.script, position: of, total: of, result: { reviewed: sum.reviewed, got: sum.got, again: sum.again.map((id) => cells.get(id).kana), stronger } },
      };
    }
    const cellId = current(r);
    const cell = cells.get(cellId);
    return {
      ...base, status: 'playing',
      session: {
        script: s.script, position: at, total: of, isRepeat: isRepeat(r),
        card: {
          id: stepId(s), cellId, kana: cell.kana, shown: r.shown,
          sound: r.shown ? cell.sound : null, spoken: cell.spoken, hint: r.shown ? cell.hint : null, box: s.before[cellId],
        },
      },
    };
  }

  dump() {
    const s = this.session;
    return {
      v: 1,
      cards: { ...this.cards },
      session: s && {
        id: s.id, script: s.script, today: s.today, kana: [...s.kana],
        queue: [...s.review.queue], shown: s.review.shown, first: [...s.review.first], repeats: s.review.repeats,
        before: { ...s.before }, ahead: [...s.ahead],
      },
    };
  }
}
