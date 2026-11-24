// A romaji sentence typed together (watashiwagakuseidesu), read the way the
// reader reads a text: js/search-romaji.js asks for it when no single word
// explains the whole query, and imports this module only then, so the page
// loads no analyzer module for a search (reader.js loads them on the first text).
//
// The kana the romaji spells may be wrong where the learner wrote a particle
// as said (watashiwa is わたしわ) or left a long vowel out (gakko); each such
// place is an edit (search-latin.js romajiEdits). The reading kept is the one
// the analyzer is surest of: fewest guesses, then the lowest cost of its
// first pass (lattice.js) with each edit's price added, then fewest tokens.
// Cost before tokens because the fewest tokens read kyouwaamedesu as
// 共和|雨|です (3) over 今日|は|雨|です (4), at a cost of 345 against 315.
// An edit has a price because the lattice alone would rather add a letter
// the learner never typed: ashitagakkoueikimasu read as 明日|が|悪口|へ|行きます
// costs 430, and 明日|学校|へ|行きます 440. A particle written as said is what
// a learner types, so it is cheapest (10); oo for おう costs 20, and a kana
// put in 40 (EDIT_PRICE). A loanword typed in romaji is hiragana the lattice
// has no word for (てれび is 照れ|美), so search-romaji.js also offers its katakana
// (テレビ) as an edit, at the price of a long vowel spelled another way.
// Edits are tried one at a time, each kept only when the analyzer is surer
// with it (a climb, not every set of edits), and a kana is put in only beside
// a guess or a particle the text opens with (と|今日 for ときょう: no sentence
// opens with と), so a step costs a first pass for each particle-like kana,
// each katakana word and each guess's few places, at most SENTENCE_BUDGET in all.
// Never beside a one-kana word: 目を見ます costs 460 and 姪を見ます 270.

import { keysForRun, pathOf } from './lattice.js';
import { analyzeCore } from './analyze.js';
import { applyEdits, kanaForms } from './search-latin.js';
import { toHira, isKanji } from './kana.js';

/** At most this many first passes for one query, and this many edits kept. */
export const SENTENCE_BUDGET = 48;
export const SENTENCE_STEPS = 4;
/** What an edit adds to the cost of a reading: a particle as written, a long vowel spelled another way, a kana put in. */
export const EDIT_PRICE = Object.freeze({
  particle: 10, sub: 20, kata: 20, ins: 40,
});

const priceOf = (edit, option) => {
  if (edit.kind === 'ins') return EDIT_PRICE.ins;
  if (edit.kind === 'kata') return EDIT_PRICE.kata;
  return 'はをへ'.includes(edit.options[option]) ? EDIT_PRICE.particle : EDIT_PRICE.sub;
};

/** The kana an edit covers, [from, to): an insertion covers none, at its place. */
const spanOf = (e) => (e.kind === 'ins' ? [e.at, e.at] : [e.at, e.at + (e.kind === 'kata' ? e.len : 1)]);

/** Whether two edits touch the same kana: a katakana word and a kana put in or changed inside it. */
function overlaps(a, b) {
  const [a0, a1] = spanOf(a);
  const [b0, b1] = spanOf(b);
  if (a.kind === 'ins' && b.kind === 'ins') return false;
  if (a.kind === 'ins') return a0 > b0 && a0 < b1;
  if (b.kind === 'ins') return b0 > a0 && b0 < a1;
  return a0 < b1 && b0 < a1;
}

/** Tokens that are words a learner looks up: not particles, punctuation or guesses. */
const WORD_KINDS = new Set(['word', 'inflected', 'katakana', 'copula', 'number']);

/**
 * How sure the first pass is of `kana` with `price` of edits: `score`
 * [guesses, cost, tokens], lower is surer; `guessed`, the spans of `kana` it
 * guessed; and `doubtful`, those and a particle the text opens with, where a
 * kana put in is worth a try.
 */
function sureness(kana, dict, price) {
  const { path } = pathOf(kana, dict, {});
  const guessed = path.filter((n) => !n.rec && !n.tsu && !['prt', 'cop', 'num'].includes(n.cls)).map((n) => [n.i, n.j]);
  const opening = path.length > 1 && path[0].cls === 'prt' ? [[path[0].i, path[0].j]] : [];
  const cost = path.length ? path[path.length - 1].total + price : Infinity;
  return { score: [guessed.length, cost, path.length], guessed, doubtful: [...guessed, ...opening] };
}

const priceOfChoice = (edits, choice) => [...choice].reduce((n, [i, o]) => n + priceOf(edits[i], o), 0);

const better = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * A token written as the analyzer reads it, in its record's usual spelling
 * where the record has one and is not usually kana: たべました under 食べる
 * is 食べました, the kana ending kept.
 */
export function writtenToken(t) {
  const rec = t.entry;
  if (!rec || rec.u || !Array.isArray(rec.k) || !rec.k.length || [...t.surface].some(isKanji)) return t.surface;
  const spelling = rec.k[0];
  const base = toHira(t.base || t.surface);
  let tail = 0;
  while (tail < spelling.length && tail < base.length && spelling[spelling.length - 1 - tail] === base[base.length - 1 - tail]) tail += 1;
  const stem = base.slice(0, base.length - tail);
  const surface = toHira(t.surface);
  if (!surface.startsWith(stem) || tail === spelling.length) return t.surface;
  return spelling.slice(0, spelling.length - tail) + t.surface.slice(stem.length);
}

/**
 * The best reading of `kana` and its words.
 *
 * @param {string} kana  what the romaji spells
 * @param {object[]} edits  search-latin.js romajiEdits(kana)
 * @param {object} dict  createDict()'s, shared with the reader
 * @param {{ forced?: Map<number, number>, budget?: number }} [o]  edits the learner
 *   typed apart, applied from the start; the first passes this read may spend
 * @returns {Promise<{ kana: string, tokens: object[], guesses: number, tried: number, edits: object[], written: Function }>}
 *   `edits` are the edits kept, each with the `option` chosen (its `at` is a
 *   place in `kana` as given); `written` writes a token as the analyzer reads
 *   it (writtenToken).
 */
export async function readSentence(kana, edits, dict, { forced = new Map(), budget = SENTENCE_BUDGET } = {}) {
  await dict.ready();
  const choice = new Map(forced);
  let text = applyEdits(kana, edits, choice);
  // Each key is asked for once: a neighbour shares all but a few of them.
  const asked = new Set();
  const need = (texts) => {
    const fresh = [];
    for (const t of texts) for (const k of keysForRun(t, dict.maxKey)) if (!asked.has(k)) { asked.add(k); fresh.push(k); }
    return fresh.length ? dict.need(fresh) : Promise.resolve();
  };
  await need([text]);
  let best = sureness(text, dict, 0);
  let tried = 1;
  const free = priceOfChoice(edits, forced);
  // Where a place sits in the text as it stands, after the kana put in before it.
  const placeOf = (e) => e.at + [...choice].filter(([i]) => edits[i].kind === 'ins' && edits[i].at < e.at).length;
  for (let step = 0; step < SENTENCE_STEPS && tried < budget; step += 1) {
    // A particle, a long vowel spelled another way or a katakana word is
    // tried anywhere; a kana put in only beside what the analyzer guessed
    // (gakko's っ alone) or a particle the text opens with, which keeps a
    // sentence of twenty places to a few passes a step.
    const near = (e) => best.doubtful.some(([i, j]) => placeOf(e) >= i - 2 && placeOf(e) <= j + 2);
    const next = [];
    for (let i = 0; i < edits.length; i += 1) {
      if (choice.has(i) || (edits[i].kind === 'ins' && !near(edits[i]))) continue;
      if ([...choice.keys()].some((k) => overlaps(edits[k], edits[i]))) continue;
      for (let o = 0; o < edits[i].options.length; o += 1) {
        const c = new Map(choice).set(i, o);
        next.push({ c, text: applyEdits(kana, edits, c) });
      }
    }
    const batch = next.slice(0, budget - tried);
    if (!batch.length) break;
    await need(batch.map((n) => n.text));
    let won = null;
    for (const n of batch) {
      n.sure = sureness(n.text, dict, priceOfChoice(edits, n.c) - free);
      tried += 1;
      if (better(n.sure.score, (won ? won.sure : best).score) < 0) won = n;
    }
    if (!won) break;
    choice.clear();
    for (const [k, v] of won.c) choice.set(k, v);
    text = won.text;
    best = won.sure;
  }
  const a = await analyzeCore(text, { dict });
  return {
    kana: text,
    tokens: a.tokens,
    guesses: a.unknown,
    tried,
    edits: [...choice].map(([i, option]) => ({ ...edits[i], option })),
    written: writtenToken,
  };
}

/**
 * The katakana words a stretch of hiragana may be (てれび is テレビ, こうひい
 * コーヒー), as edits for readSentence: only where the hiragana is no key,
 * and kana for kana, so no place moves. `dict` is createDict()'s.
 */
export async function katakanaEdits(text, dict, from = 2, to = 8) {
  const small = /^[ぁぃぅぇぉゃゅょゎっんー]/;
  const spans = [];
  for (let a = 0; a < text.length; a += 1) {
    if (small.test(text[a])) continue;
    for (let len = from; len <= to && a + len <= text.length; len += 1) {
      const hira = text.slice(a, a + len);
      if (!/^[ぁ-ゖ]+$/.test(hira) || /^[ぁぃぅぇぉゃゅょゎ]/.test(text[a + len] || '')) continue;
      spans.push({
        a, len, hira, forms: kanaForms(hira).slice(1).filter((f) => f.length === len),
      });
    }
  }
  await dict.need([...new Set(spans.flatMap((x) => [x.hira, ...x.forms]))]);
  return spans.filter((x) => !dict.get(x.hira)).flatMap((x) => {
    const f = x.forms.find((k) => dict.get(k));
    return f ? [{
      at: x.a, kind: 'kata', len: x.len, options: [f],
    }] : [];
  });
}

/** `text` read by the analyzer's first two passes (analyze.js analyzeCore), for search-romaji.js. */
export function analyzeText(text, dict) {
  return analyzeCore(text, { dict });
}

/** The tokens of a reading a learner looks up as words: those with a dictionary record. */
export function sentenceWords(tokens) {
  return tokens.filter((t) => WORD_KINDS.has(t.kind) && t.entry && t.confidence !== 'guess');
}
