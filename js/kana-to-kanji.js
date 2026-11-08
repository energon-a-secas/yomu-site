// Kana to kanji: a word written in hiragana, and its kanji spelling to pick
// among real words. The words are the kanji page's (data/kpage, JMdict's first
// tier), and the wrong answers share a kanji with the answer where they can,
// so がっこう among 学校, 学生, 高校 and 大学 asks for the reading, not the
// shape. Every choice reads differently, and none can be read as the prompt,
// so exactly one answer is right. A round is ten questions and the first
// answer counts, as in the kana games. Its messages are { en, es } through
// strings.js; the meanings are JMdict's English, with their Spanish beside
// them (`es`: { gloss }) where the caller's words carry it (docs/ANALYZER.md,
// "Spanish meanings"). No DOM, audio player or storage.
import { ROUND, makeRand, shuffle, drawWeighted, weightOf } from './play-rounds.js';
import { t } from './strings.js';

export const SPELL_CHOICES = 4;
const MISSES_KEPT = 500;
const HIRAGANA = 'ぁ-ゖゝゞー';
const KANJI_CHARS = '㐀-䶿一-鿿豈-﫿々';
const READING = new RegExp(`^[${HIRAGANA}]{1,20}$`, 'u');
const WRITTEN = new RegExp(`^[${HIRAGANA}${KANJI_CHARS}]{1,12}$`, 'u');
const KANJI = new RegExp(`[${KANJI_CHARS}]`, 'u');
const DECK = /^[a-z0-9-]{1,40}$/;
const count = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000 ? n : 0;
const emptyStats = () => ({ rounds: 0, best: 0, correct: 0, answered: 0, assisted: 0, misses: {} });

/** A word's identity in a round and in the misses: its spelling and reading. */
export const wordKey = (w) => `${w.written}|${w.reading}`;
const kanjiOf = (written) => [...written].filter((ch) => KANJI.test(ch));

/** A word's Spanish meaning beside its English one: `es` absent, or { gloss } with a short gloss. */
const validEs = (es) => es === undefined
  || (Boolean(es) && typeof es === 'object' && typeof es.gloss === 'string' && es.gloss.length > 0 && es.gloss.length <= 200);

/** A word the game can ask: kanji (and hiragana) read in hiragana alone. */
function validWord(w) {
  return Boolean(w) && typeof w === 'object' && typeof w.written === 'string' && typeof w.reading === 'string'
    && typeof w.gloss === 'string' && w.gloss.length <= 200 && validEs(w.es)
    && WRITTEN.test(w.written) && KANJI.test(w.written) && READING.test(w.reading);
}

function validKey(key) {
  const [written, reading, more] = key.split('|');
  return more === undefined && validWord({ written, reading, gloss: '' });
}

/**
 * The words a set can ask: each kanji page word of the set's kanji, written
 * only with kanji the learner is taken to know (`known`, the set itself unless
 * given) and hiragana, read in hiragana, once per spelling and reading.
 * `pages` maps a kanji to its page's words, `{ written, reading, gloss }`,
 * each with `es`: { gloss } where the caller gave it the Spanish.
 */
export function spellingPool(chars, pages, known = new Set(chars)) {
  const out = new Map();
  for (const ch of chars) for (const w of pages.get(ch) || []) {
    const gloss = typeof w.gloss === 'string' ? w.gloss.slice(0, 200) : '';
    const word = { written: w.written, reading: w.reading, gloss };
    const es = w.es && typeof w.es.gloss === 'string' && w.es.gloss ? w.es.gloss.slice(0, 200) : '';
    if (es) word.es = { gloss: es };
    if (!validWord(word) || kanjiOf(word.written).some((k) => !known.has(k))) continue;
    if (!out.has(wordKey(word))) out.set(wordKey(word), word);
  }
  return [...out.values()];
}

/** Whether a set's words make a round: four different readings at least. */
export function spellingSetup(words) {
  const pool = (Array.isArray(words) ? words : []).filter(validWord);
  const readings = new Set(pool.map((w) => w.reading)).size;
  return {
    count: pool.length,
    ready: readings >= SPELL_CHOICES,
    message: t({
      en: 'This set needs words with at least four different readings. Save more kanji, or choose a level.',
      es: 'Este grupo necesita palabras con al menos cuatro lecturas distintas. Guarda más kanji o elige un nivel.',
    }),
  };
}

/**
 * The answer and up to three wrong spellings, best first: words that share a
 * kanji with the answer, then words as long, then any. A spelling the pool
 * also reads as the prompt is never a wrong answer (今日 for こんにち, when
 * きょう is in the set too), and no two choices read alike.
 */
function questionFor(target, pool, rand) {
  const readableAs = new Set(pool.filter((w) => w.reading === target.reading).map((w) => w.written));
  const kanji = new Set(kanjiOf(target.written)), length = [...target.written].length;
  const sharing = [], sameLength = [], rest = [];
  for (const w of pool) {
    if (w.reading === target.reading || readableAs.has(w.written)) continue;
    if (kanjiOf(w.written).some((k) => kanji.has(k))) sharing.push(w);
    else if ([...w.written].length === length) sameLength.push(w);
    else rest.push(w);
  }
  const options = [target];
  for (const tier of [sharing, sameLength, rest]) {
    for (const w of shuffle(tier, rand)) {
      if (options.length === SPELL_CHOICES) break;
      if (options.every((o) => o.reading !== w.reading && o.written !== w.written)) options.push(w);
    }
  }
  return { target, options: shuffle(options, rand) };
}

function validQuestion(q) {
  if (!q || !validWord(q.target) || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > SPELL_CHOICES) return false;
  if (!q.options.every(validWord) || !q.options.some((o) => wordKey(o) === wordKey(q.target))) return false;
  return new Set(q.options.map((o) => o.reading)).size === q.options.length
    && new Set(q.options.map((o) => o.written)).size === q.options.length;
}

/** The document holds bounded counters per set and a resumable round of dictionary words, never user text. */
export class KanaToKanji {
  constructor(document) {
    this.stats = {};
    this.round = null;
    this.recovered = false;
    if (document == null) return;
    if (document.v !== 1 || !document.stats || typeof document.stats !== 'object' || Array.isArray(document.stats)) { this.recovered = true; return; }
    for (const [deck, value] of Object.entries(document.stats)) {
      if (!DECK.test(deck) || !value || typeof value !== 'object' || Array.isArray(value)) { this.recovered = true; continue; }
      const misses = {};
      if (!value.misses || typeof value.misses !== 'object' || Array.isArray(value.misses)) this.recovered = true;
      for (const [key, n] of Object.entries(value.misses || {})) {
        if (validKey(key) && n === count(n) && n > 0) misses[key] = n;
        else this.recovered = true;
      }
      const answered = count(value.answered), correct = Math.min(answered, count(value.correct));
      const normalized = { rounds: count(value.rounds), best: Math.min(ROUND, count(value.best)), correct, answered, assisted: Math.min(answered - correct, count(value.assisted)), misses };
      if (['rounds', 'best', 'correct', 'answered', 'assisted'].some((k) => value[k] !== normalized[k])) this.recovered = true;
      this.stats[deck] = normalized;
    }
    if (document.round != null) {
      if (this.validRound(document.round)) this.round = JSON.parse(JSON.stringify(document.round));
      else this.recovered = true;
    }
  }

  validRound(r) {
    if (!r || typeof r !== 'object' || typeof r.deck !== 'string' || !DECK.test(r.deck) || typeof r.id !== 'string' || r.id.length > 80) return false;
    if (!Number.isInteger(r.at) || r.at < 0 || r.at > ROUND || !Array.isArray(r.questions) || r.questions.length !== ROUND || !Array.isArray(r.picks)) return false;
    if (r.picks.length < r.at || r.picks.length > Math.min(ROUND, r.at + 1) || typeof r.hinted !== 'boolean') return false;
    return r.questions.every((q, i) => {
      if (!validQuestion(q)) return false;
      const pick = r.picks[i];
      return i >= r.picks.length || (pick && typeof pick.hint === 'boolean' && (pick.id === null || q.options.some((o) => wordKey(o) === pick.id)));
    });
  }

  /** Ten questions from `words`, the set's pool (spellingPool); missed words come up more often. */
  start({ deck, words = [], seed = Date.now() } = {}) {
    if (this.round && this.round.at < ROUND) throw new Error(t({ en: 'Finish or leave the current round first.', es: 'Termina o deja primero la ronda actual.' }));
    if (typeof deck !== 'string' || !DECK.test(deck)) throw new Error(t({ en: 'Unknown kanji set', es: 'Grupo de kanji desconocido' }));
    const pool = [...new Map((Array.isArray(words) ? words : []).filter(validWord).map((w) => [wordKey(w), w])).values()];
    if (!spellingSetup(pool).ready) throw new Error(t({ en: 'This set needs words with at least four different readings.', es: 'Este grupo necesita palabras con al menos cuatro lecturas distintas.' }));
    const rand = makeRand(seed), misses = (this.stats[deck] || emptyStats()).misses;
    const questions = [];
    let remaining = [];
    for (let n = 0; n < ROUND; n++) {
      if (!remaining.length) remaining = [...pool];
      const last = questions.at(-1)?.target.reading;
      const eligible = remaining.filter((w) => w.reading !== last);
      const word = drawWeighted(eligible.length ? eligible : remaining, 1, (w) => weightOf(misses[wordKey(w)] || 0), rand)[0];
      remaining = remaining.filter((w) => w !== word);
      questions.push(questionFor(word, pool, rand));
    }
    this.round = { id: `${deck}:${Number(seed) >>> 0}`, deck, questions, at: 0, picks: [], hinted: false };
    return this.view();
  }

  act(action, { id, pick } = {}) {
    const r = this.round;
    if (!r) return this.view();
    if (action === 'leave') { this.round = null; return this.view(); }
    if (r.at >= ROUND || id !== `${r.id}:${r.at}`) return this.view();
    const q = r.questions[r.at], answer = wordKey(q.target);
    const answered = r.picks.length > r.at;
    if (action === 'hint' && !answered) r.hinted = true;
    if ((action === 'answer' || action === 'skip') && !answered) {
      if (action === 'answer' && !q.options.some((o) => wordKey(o) === pick)) return this.view();
      r.picks.push({ id: action === 'skip' ? null : pick, hint: r.hinted });
      // A missed word comes back three questions later, its choices turned
      // one place, so the answer is not where it was.
      if (pick !== answer && r.at + 3 < ROUND) {
        r.questions[r.at + 3] = { target: q.target, options: [...q.options.slice(1), q.options[0]] };
      }
    }
    if (action === 'next' && answered) {
      r.at += 1; r.hinted = false;
      if (r.at === ROUND) this.record();
    }
    return this.view();
  }

  record() {
    const r = this.round, s = this.stats[r.deck] || emptyStats(), result = this.result();
    s.rounds = Math.min(1000000, s.rounds + 1);
    s.best = Math.max(s.best, result.correct);
    s.correct = Math.min(1000000, s.correct + result.correct);
    s.answered = Math.min(1000000, s.answered + ROUND);
    s.assisted = Math.min(1000000, s.assisted + result.assisted);
    r.picks.forEach((p, i) => {
      const key = wordKey(r.questions[i].target);
      if (p.id !== key || p.hint) s.misses[key] = Math.min(1000000, (s.misses[key] || 0) + 1);
    });
    const kept = Object.entries(s.misses);
    if (kept.length > MISSES_KEPT) s.misses = Object.fromEntries(kept.sort((a, b) => b[1] - a[1]).slice(0, MISSES_KEPT));
    this.stats[r.deck] = s;
  }

  result() {
    const r = this.round;
    return {
      correct: r.picks.filter((p, i) => p.id === wordKey(r.questions[i].target) && !p.hint).length,
      assisted: r.picks.filter((p) => p.hint).length,
      skipped: r.picks.filter((p) => p.id === null).length,
      total: ROUND,
    };
  }

  view() {
    const base = { recovered: this.recovered, stats: this.stats, status: 'idle', round: null };
    const r = this.round;
    if (!r) return base;
    const details = { deck: r.deck, position: Math.min(r.at + 1, ROUND), total: ROUND, result: this.result(), question: null };
    if (r.at === ROUND) return { ...base, status: 'complete', round: details };
    const q = r.questions[r.at], pick = r.picks[r.at], answer = wordKey(q.target), revealed = Boolean(pick);
    details.question = {
      id: `${r.id}:${r.at}`,
      prompt: q.target.reading,
      // The spelling finds the word's own recording (雨 plays 雨|あめ, never
      // 飴); the screen shows it only once answered.
      written: q.target.written,
      answered: revealed, hinted: r.hinted,
      hint: r.hinted && !revealed ? q.target.gloss : null,
      // The hint's Spanish beside it, where the word has one.
      ...(r.hinted && !revealed && q.target.es ? { es: { hint: q.target.es.gloss } } : {}),
      correctId: revealed ? answer : null, pickedId: pick?.id ?? null,
      right: revealed ? pick.id === answer : null,
      options: q.options.map((o) => ({
        id: wordKey(o), written: o.written, reading: revealed ? o.reading : null, gloss: revealed ? o.gloss : null,
        ...(revealed && o.es ? { es: { gloss: o.es.gloss } } : {}),
      })),
    };
    return { ...base, status: 'playing', round: details };
  }

  dump() { return { v: 1, stats: this.stats, round: this.round }; }
}
