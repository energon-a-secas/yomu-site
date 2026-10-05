// The segmenter: one Japanese run in, the cheapest sequence of tokens out.
//
// Every place a word could start gets candidates: each dictionary key that
// matches there, each deinflection of what is there that the dictionary
// confirms, the closed-class particles and copula forms (costs.js), a number
// with its counter, a katakana run, a kanji run read as a name (names.js), and
// a one-character unknown so a path always exists. Each candidate has a cost;
// each pair of neighbours has a connection cost; the path with the lowest
// total wins. That is a Viterbi pass over a lattice, and it is the whole
// algorithm.
//
// The costs started in Runcible's reader research (2026-09-28), where they
// passed 66 of 66 designed cases on a hand lexicon. They live in costs.js
// now, and every change since is written next to the number it changed, with
// the case that forced it.
//
// This module knows no DOM and loads nothing: `dict` must already hold the
// shards for `keysForRun(run)` (analyze.js does that), and `dict.get` is
// synchronous.

import { isKatakana, isAllKana, hasKanji, toHira } from './kana.js';
import { deinflect, adjIxReading, kuruReading } from './deinflect.js';
import { COPULA, FINAL_WA, connect } from './costs.js';
import { guessName, wholeName } from './names.js';
import { candidates } from './candidates.js';
import { kanaCuts } from './spellings.js';

// The closed classes and the price list moved to costs.js, and the
// candidates to candidates.js; they are re-exported so nothing that read
// them from here has to change.
export { PARTICLES, PARTICLE_PAIRS, SENTENCE_FINAL, COPULA, COST } from './costs.js';
export { keysForRun } from './candidates.js';

/**
 * The cheapest path through `run`. `exclude` drops candidates spanning all of
 * it.
 *
 * The second phase (js/rare.js) reads one stretch of a run again, between
 * two nodes the first pass already placed, so the search can be narrowed:
 * `env.from` and `env.to` are the stretch, `env.left` and `env.right` the
 * nodes on either side (each connected exactly as the first pass connected
 * it), and `env.candidatesAt` the candidates to place, in place of
 * candidates.js. With none of them the search is the first pass, unchanged.
 */
export function bestPath(run, dict, env) {
  const from = env.from || 0;
  const n = env.to === undefined ? run.length : env.to;
  if (n <= from) return [];
  const gen = env.candidatesAt || candidates;
  const ends = Array.from({ length: n + 1 }, () => []);
  const bos = { i: from, j: from, cls: env.after || 'bos', total: 0, back: null, start: true };
  ends[from].push(bos);
  const leftOf = (prev) => (!prev.start ? prev : env.left !== undefined ? env.left : edge(prev));
  for (let i = from; i < n; i++) {
    if (!ends[i].length) continue;
    for (const node of gen(run, i, dict, env)) {
      if (node.j > n) continue;
      if (env.exclude && node.i === from && node.j === n) continue;
      let best = null;
      let bestCost = Infinity;
      for (const prev of ends[i]) {
        const c = prev.total + connect(leftOf(prev), node) + node.cost;
        if (c < bestCost) { bestCost = c; best = prev; }
      }
      node.total = bestCost;
      node.back = best;
      ends[node.j].push(node);
    }
  }
  let best = null;
  let bestCost = Infinity;
  for (const node of ends[n]) {
    const end = env.right !== undefined ? connect(node, env.right) : env.before ? 0 : connect(node, null);
    const c = node.total + end;
    if (c < bestCost) { bestCost = c; best = node; }
  }
  const path = [];
  for (let x = best; x && !x.start; x = x.back) path.unshift(x);
  return path;
}

/**
 * The start of a run is not always the start of a sentence: after latin text
 * (ABCです) or a bare number the run continues a noun phrase. `after` names
 * the class to connect as; anything else is the plain start.
 */
function edge(bos) {
  return bos.cls === 'bos' ? null : { cls: bos.cls, s: '' };
}

// ── Tokens ────────────────────────────────────────────────────────────────

function commonPrefix(a, b) {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}

/** 何 is なん before a d, t or n sound, a counter or 曜日, なに elsewhere. */
function nanReading(next) {
  if (!next) return 'なに';
  if (next.cls === 'num' || next.cls === 'suf' || next.s.startsWith('曜')) return 'なん';
  const first = toHira(next.s)[0] || '';
  return 'だでどたてとなにぬねの'.includes(first) ? 'なん' : 'なに';
}

function readingOf(node, next) {
  if (node.reading !== undefined) return node.reading;
  const s = node.s;
  const rs = node.rec && node.rec.r;
  if (!node.rec || !hasKanji(s) || !rs || !rs.length) return toHira(s);
  if (!node.chain.length) {
    // The data splits 何 into a なに record and a なん record; which one is
    // said depends on the next sound, not on which record won.
    if (node.key === '何') return nanReading(next);
    // The data keeps katakana where the word has it (アメリカ人 is アメリカじん);
    // a token's reading is hiragana, always.
    return toHira(rs[0]);
  }
  const lemma = node.key;
  const lr = /\badj-ix\b/.test(node.rec.p) ? adjIxReading(rs) : rs[0];
  const p = commonPrefix(lemma, s);
  let head = lr.slice(0, Math.max(0, lr.length - (lemma.length - p)));
  if (lemma.endsWith('来る') && /\bvk\b/.test(node.rec.p) && p > 0 && s[p - 1] === '来') {
    head = head.slice(0, -1) + kuruReading(s);
  }
  return toHira(head + s.slice(p));
}

/** Offsets that split the said line into words, when one token is several. */
function wordsOf(node, reading, dict, env) {
  if (node.rec) {
    const joined = joinWords(node, reading, dict);
    if (joined) return joined;
  }
  if (node.cls === 'cop' && node.closed) {
    const words = COPULA[node.s];
    if (words.length < 2) return null;
    let at = 0;
    return words.map((w) => { const span = [at, at + w.length]; at += w.length; return span; });
  }
  // A greeting built from a greeting word and a polite verb is said as two
  // words, the way a textbook writes it: おはよう|ございます, どう|いたしまして,
  // よろしく|お願いします, ごちそうさま|でした. The left piece must be a
  // greeting, adverb or expression, not a noun, and written in kana (so its
  // reading is its spelling); the right piece must be the copula or end in
  // a polite ます form. おやすみなさい and しつれいします stay one word each
  // (おや|すみなさい once passed a looser test and was said "oya suminasai"),
  // and a key that ends in a particle (こんにちは, w) is never split.
  if (!node.rec || node.chain.length || node.rec.x || node.rec.w) return null;
  const tags = String(node.rec.p).split(' ');
  if (!(tags.includes('exp') || tags.includes('int'))) return null;
  const inner = bestPath(node.s, dict, { ...env, exclude: true, after: undefined, before: false });
  if (inner.length !== 2) return null;
  const [left, right] = inner;
  const lt = left.rec ? String(left.rec.p).split(' ') : [];
  const leftOk = left.rec && !left.chain.length && !lt.includes('n') && !lt.includes('pn')
    && ['int', 'adv', 'exp'].some((t) => lt.includes(t)) && left.s.length >= 2
    && isAllKana(left.s) && reading.startsWith(toHira(left.s));
  const rightOk = (right.cls === 'cop' && right.closed)
    || (right.rec && ['verb', 'exp'].includes(right.cls) && POLITE_END.test(right.s));
  return leftOk && rightOk ? [[0, left.j], [left.j, reading.length]] : null;
}

const POLITE_END = /ま(す|した|せん|して|しょう)$/;

/** Verbs a te-form leans on to make one expression: 持って|いく, 行って|くる. */
const TE_AUX = new Set(['いる', 'いく', 'くる', 'おく', 'しまう', 'みる', 'ある', 'あげる', 'くれる', 'もらう']);

/**
 * Where, inside one key, a te-form meets the verb it leans on: 持っていく is
 * 持って|いく, 行ってきます is 行って|きます. -1 when it does not.
 */
function teAuxJoin(key) {
  for (let c = 2; c < key.length - 1; c++) {
    if (key[c - 1] !== 'て' && key[c - 1] !== 'で') continue;
    const rest = key.slice(c);
    if (!isAllKana(rest)) continue;
    if (TE_AUX.has(rest) || deinflect(rest).some((d) => TE_AUX.has(d.base))) return c;
  }
  return -1;
}

/** The te-form helpers a textbook writes as a word of their own, by first kana. */
const TE_JOINS = [['te-iru', 'い'], ['te-shimau', 'し'], ['te-miru', 'み']];

/**
 * A verb is one token, but a textbook's romaji sometimes writes it as two
 * words: 読んで|います (yonde imasu), 食べません|でした (tabemasen deshita),
 * 持って|いきます (motte ikimasu). The joins are ones the grammar proves: the
 * い of ている in the chain, the でした of ませんでした, and a te-form meeting
 * its auxiliary inside the dictionary key. Without the split, 持っていきます
 * was said "motteekimasu", a long e across two words. The contracted てる is
 * written as one word, so 待ってる stays matteru. Every join sits in the kana
 * tail, where a surface offset counted from the end is a reading offset
 * counted from the end.
 */
function joinWords(node, reading, dict) {
  const rules = new Set((node.chain || []).map((c) => c.rule));
  const s = node.s;
  const at = new Set();
  const fromEnd = (c) => (isAllKana(s.slice(c)) ? reading.length - (s.length - c) : -1);
  for (const [rule, head] of TE_JOINS) {
    if (!rules.has(rule)) continue;
    for (const c of node.cuts) if ((s[c - 1] === 'て' || s[c - 1] === 'で') && s[c] === head) at.add(fromEnd(c));
  }
  if (rules.has('masu-past-negative') && s.endsWith('でした')) at.add(reading.length - 3);
  const tags = String(node.rec.p).split(' ');
  if (tags.some((t) => /^v/.test(t)) || tags.includes('exp')) {
    const c = teAuxJoin(node.key);
    if (c > 0 && c <= commonPrefix(node.key, s)) at.add(fromEnd(c));
  }
  const cuts = [...at].filter((c) => c > 0 && c < reading.length).sort((x, y) => x - y);
  if (!cuts.length) return null;
  return [0, ...cuts].map((c, n, all) => [c, n + 1 < all.length ? all[n + 1] : reading.length]);
}

/**
 * The record of a number and its counter that is a dictionary key too (何名
 * "how many people", 何分 "what minute"), read the way the number is read,
 * so the page can say what the dictionary says. The token stays a number
 * read by rule, with its own reading and notes; 十分 read じゅっぷん takes
 * nothing from 十分 じゅうぶん, "enough". The key is a substring of the run,
 * so the first pass already asked for it.
 */
function countedRecord(s, reading, dict) {
  const recs = (dict.get(s) || []).filter((r) => Array.isArray(r.r));
  return recs.find((r) => r.r[0] === reading) || recs.find((r) => r.r.includes(reading)) || null;
}

function toToken(node, path, k, run, dict, env) {
  const next = path[k + 1];
  const reading = readingOf(node, next);
  const rec = node.rec || null;
  let kind;
  let confidence;
  let entry = rec;
  let base = node.s;
  if (rec) {
    confidence = 'dict';
    base = node.key;
    if (node.cls === 'prt') kind = 'particle';
    else if (node.cls === 'cop') kind = 'copula';
    else if (node.cls === 'name') kind = 'name';
    else if (node.chain.length) kind = 'inflected';
    else if ([...node.s].every(isKatakana)) kind = 'katakana';
    else kind = 'word';
  } else if (node.cls === 'prt' || node.cls === 'cop') {
    kind = node.cls === 'prt' ? 'particle' : 'copula';
    confidence = 'rule';
    const tag = node.cls === 'prt' ? 'prt' : 'cop';
    entry = (dict.get(node.s) || []).find((r) => String(r.p).split(' ').includes(tag)) || null;
    // After a na-adjective, な and で are the copula (静かな町, 静かで), and
    // the dictionary's particle records gloss them "don't" and "at". No
    // gloss is better than those; the grammar note says what they are.
    const before = path[k - 1];
    if (node.cls === 'prt' && (node.s === 'な' || node.s === 'で') && before && before.rec
      && String(before.rec.p).split(' ').includes('adj-na') && !before.chain.length) entry = null;
    if (node.cls === 'cop') base = 'だ';
  } else if (node.cls === 'num') {
    kind = 'number';
    confidence = 'rule';
    entry = countedRecord(node.s, reading, dict);
  } else if (node.cls === 'kata') {
    kind = 'katakana';
    confidence = 'guess';
  } else if (node.cls === 'name') {
    kind = 'name';
    confidence = 'guess';
  } else if (node.tsu) {
    kind = 'word';
    confidence = 'rule';
  } else {
    kind = 'unknown';
    confidence = 'guess';
  }

  const token = {
    kind, surface: node.s, start: node.i, end: node.j, base, reading,
    // A rare word or a name counts its own tier's records (js/rare.js sets it).
    entry, alts: node.alts !== undefined ? node.alts : rec ? Math.max(0, (dict.get(node.key) || []).length - 1) : 0,
    chain: node.chain ? [...node.chain] : [], confidence,
  };
  if (kind === 'number') token.counterChange = !!node.counterChange;

  // What analyze.js needs to build furigana and the said line, and nothing
  // the page should keep: analyze removes `aid` once it has used it.
  const aid = { f: rec ? rec.f : undefined, cuts: [...(node.cuts || []), ...kanaCuts(node)], parts: node.parts || null };
  aid.v5u = !!rec && !node.chain.length && /\bv5u(-s)?\b/.test(rec.p) && node.s.endsWith('う');
  aid.finalWa = !!rec && (!!rec.w || (!!rec.x && node.key.endsWith('は')) || FINAL_WA.has(node.key));
  if (!rec && FINAL_WA.has(node.s)) aid.finalWa = true;
  // A name the names tier knows (js/rare.js) is read like a word, from its
  // record; only a guessed one is read from the characters.
  if (kind === 'name' && !rec && wholeName(node.s)) {
    token.reading = wholeName(node.s);
    aid.f = '*';
  } else if (kind === 'name' && !rec) {
    const pieces = guessName(node.s, env.kanji);
    token.reading = pieces.join('');
    aid.f = pieces.every(Boolean) ? pieces.join('|') : undefined;
  }
  aid.words = wordsOf(node, token.reading, dict, env);
  aid.waAt = particleWa(node, dict, env);
  token.aid = aid;
  return token;
}

/**
 * Where, inside one expression, a は is the particle and is said wa:
 * ではまた, ということは, それはさておき, もしくは. The data marks the last
 * は of a few keys (`w`, `x`) and never one inside, so all of these were
 * said "ha". The expression is read again as its pieces, and a は the
 * pieces make a particle is one. Kana only, so an offset into the surface
 * is an offset into the reading; てにはいる keeps its は, because its pieces
 * are て|に|はいる.
 */
function particleWa(node, dict, env, depth = 0) {
  const s = node.s;
  if (!node.rec || node.chain.length || !isAllKana(s) || s.indexOf('は', 1) < 0) return [];
  const tags = String(node.rec.p).split(' ');
  if (!tags.includes('exp') && !tags.includes('conj')) return [];
  const out = [];
  for (const x of bestPath(s, dict, { ...env, exclude: true, after: undefined, before: false })) {
    // Every は in a particle or a copula form (では, ではない) is the
    // particle; a piece the data marks is too (では is `w`); and a piece
    // that is an expression itself (ということは) is read the same way.
    if (x.cls === 'prt' || x.cls === 'cop') {
      for (let k = 0; k < x.s.length; k++) if (x.s[k] === 'は') out.push(x.i + k);
    } else if (x.rec && x.s.endsWith('は') && (x.rec.w || x.rec.x)) out.push(x.j - 1);
    else if (depth < 2) for (const k of particleWa(x, dict, env, depth + 1)) out.push(x.i + k);
  }
  return out;
}

/**
 * Segment one run of Japanese (kana, kanji and digits, no punctuation).
 *
 * @param {string} run
 * @param {object} dict  from createDict, with this run's keys already loaded
 * @param {object} [opts]
 * @param {Map} [opts.kanji]   char -> kanji info, for reading names
 * @param {string} [opts.after] 'noun' when the run directly follows latin
 *                              text or a number, so ABCです connects as a noun
 * @returns {object[]} tokens with offsets relative to the run, and an `aid`
 *   field analyze.js consumes
 */
export function segmentRun(run, dict, opts = {}) {
  const { path, env } = pathOf(run, dict, opts);
  return tokensOf(run, path, dict, env);
}

/**
 * The first pass over one run, as nodes: what segmentRun reads before it
 * builds tokens, and what the second phase (js/rare.js) reads again where it
 * holds guesses. `env` is the run's context, which tokensOf needs back.
 */
export function pathOf(run, dict, opts = {}) {
  const env = { maxKey: dict.maxKey || 12, kanji: opts.kanji, after: opts.after, before: opts.before, dict };
  return { path: bestPath(run, dict, env), env };
}

/** Tokens for a path through `run`, offsets relative to the run. */
export function tokensOf(run, path, dict, env) {
  return path.map((node, k) => toToken(node, path, k, run, dict, env));
}
