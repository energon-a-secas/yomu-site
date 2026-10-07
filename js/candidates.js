// Candidates: every node the lattice could place at one position of a run.
//
// Split out of lattice.js, which keeps the Viterbi pass and the tokens, so
// both stay under the 500-line rule. A node here is a dictionary key that
// matches (directly, conjugated, or as a verb stem standing as a noun), a
// closed-class particle or copula form, a number with its counter, a
// katakana run, a kanji stretch read as a name, or one unknown character so
// a path always exists. Its `cost` is the node's own; what it costs to sit
// next to its neighbours is costs.js's `connect`.

import { isKanji, isKatakana, isKana, hasKanji, isHiragana } from './kana.js';
import { deinflect, deinflectStem, posMatches } from './deinflect.js';
import { numberAt, counterAt, readCounted, readNumber, numberBends, readQuestion, countedEnd, countedParts } from './numbers.js';
import { PARTICLE, COPULA, COST, classOf, homographCost, bandOf } from './costs.js';
import { unsupported, wholeNameAt } from './names.js';
import { refused } from './key-rules.js';
import { kanaHomographCost } from './spellings.js';

const isDigitish = (ch) => (ch >= '0' && ch <= '9') || ch === ',';
export const NO_CHAIN = Object.freeze([]);

/**
 * Every key the lattice might look up in this run: each substring up to the
 * longest key, the base of each deinflection of those that end in kana, and
 * the verb behind each stem that could be a noun (焼き, 召し上がり).
 * analyze.js hands this to dict.need() before segmenting.
 */
export function keysForRun(run, maxKey = 12) {
  const keys = new Set();
  for (let i = 0; i < run.length; i++) {
    for (let len = 1; len <= maxKey && i + len <= run.length; len++) {
      const s = run.slice(i, i + len);
      const last = s[s.length - 1];
      if (isDigitish(last)) break;
      keys.add(s);
      if (!isKana(last)) continue;
      for (const d of deinflect(s)) if (d.base.length <= maxKey) keys.add(d.base);
      if (hasKanji(s)) for (const d of deinflectStem(s)) if (d.base.length <= maxKey) keys.add(d.base);
    }
  }
  return keys;
}

/**
 * The class a conjugated word connects as is the class of its last ending,
 * not of its dictionary form: 食べたい and 行かない end like adjectives
 * (-20 before です), and 降りそう like a na-adjective, which takes です and
 * never a particle. 降りそうですね read 降りそう|で|すね, "shin", while it
 * connected as a verb.
 */
function chainClass(chain, cls) {
  const top = chain.length ? chain[0].rule : null;
  if (top === 'sou' || top === 'adj-sou') return 'noun';
  if (cls === 'verb' && ADJ_ENDINGS.has(top)) return 'adj';
  return cls;
}

const ADJ_ENDINGS = new Set(['tai', 'negative', 'yasui', 'nikui']);

function qCost(q) {
  return COST.q[q >= 1 && q <= 5 ? q : 0];
}

/**
 * One dictionary word as a node: `rec` under `key`, covering [i, j) of the
 * run as the surface `s`, reached through `chain`. The second phase builds
 * its rare words with this too (js/rare.js), so a rare word pays every cost
 * a common one pays, and then its own.
 */
export function wordNode(s, i, j, rec, key, chain, cuts, whole, env) {
  const cls = chainClass(chain, classOf(rec.p));
  if (refused(s, key, rec, cls, i === 0 && !env.after, env.dict)) return null;
  let cost = COST.word + qCost(bandOf(key, rec, env.dict)) + COST.step * chain.length
    + homographCost(key, rec, env.dict) + kanaHomographCost(key, rec, env.dict);
  const kanaSpelled = !!(rec.k && rec.k.length && !rec.u && !hasKanji(s) && !isKatakana(s[0]));
  if (kanaSpelled) cost += COST.kanaForKanji;
  // Not for a prefix: お and ご can only lead a noun (costs.js), and as
  // one-kana words at the full price おすすめ read as おす|すめ, "push, live!".
  if (j - i === 1 && isKana(s) && cls !== 'pref') cost += COST.oneKana;
  // A key that is another key plus a particle (今日は) is split so the
  // particle is taught, except where JMdict calls the whole an adverb:
  // いつも is "always", not いつ "when" plus も, and 実は is "actually",
  // not 実 "fruit" plus the topic marker.
  if (rec.x && !whole && !/(^| )adv( |$)/.test(rec.p || '')) cost += COST.xSplit;
  if (cls === 'aux') cost += COST.aux;
  return { i, j, s, cls, rec, key, chain, cuts, cost, kanaSpelled };
}

/**
 * A verb's stem standing as a noun (卵|焼き, お|召し上がり), from a surface
 * with a kanji in it. It connects as a noun and costs COST.stemNoun on top
 * of the word, which keeps it behind every conjugated reading of the same
 * characters: 焼きます is still one token.
 */
function stemNouns(s, i, j, dict, whole, env) {
  const out = [];
  for (const d of deinflectStem(s)) {
    for (const rec of dict.get(d.base) || []) {
      if (!posMatches(d.type, rec.p, d.base, true)) continue;
      const node = wordNode(s, i, j, rec, d.base, d.chain, d.cuts, whole, env);
      if (!node) continue;
      node.cls = 'noun';
      node.cost += COST.stemNoun;
      out.push(node);
    }
  }
  return out;
}

/** A band from the corpus: a key the corpus never matched has none. */
const banded = (rec) => rec.q >= 1 && rec.q <= 5;

/**
 * Whether the hiragana a key ends in, after a kanji, are only the start of a
 * longer word of the text: 秋りん (秋霖, the long autumn rains, a mixed
 * spelling tools/lib/extra.mjs ships) in 毎秋りんご園, where りんご "apple"
 * starts at its りん and runs on past it. The longer word must be a key the
 * corpus banded, and must run past the key by more than a particle or a
 * copula form, which follow such a key as readily as they end a word:
 * 大ごとになる is 大ごと|に, not 大|ごとに "one by one", and 世間なみだ is
 * 世間なみ|だ, not なみだ "tears". It is a substring of the run, so
 * keysForRun has already asked for it.
 */
function endsInsideWord(run, i, j, dict, maxKey) {
  let k = j;
  while (k > i && isHiragana(run[k - 1])) k--;
  if (k === j || k === i) return false;
  const prev = /[\uDC00-\uDFFF]/.test(run[k - 1]) ? run.codePointAt(k - 2) : run.codePointAt(k - 1);
  if (!isKanji(String.fromCodePoint(prev))) return false;
  for (let e = j + 1; e <= run.length && e - k <= maxKey; e++) {
    const rest = run.slice(j, e);
    if (PARTICLE.has(rest) || COPULA[rest]) continue;
    const recs = dict.get(run.slice(k, e));
    if (recs && recs.some(banded)) return true;
  }
  return false;
}

export function candidates(run, i, dict, env) {
  const out = [];
  const push = (node) => { if (node) out.push(node); };
  const maxLen = Math.min(env.maxKey, run.length - i);
  // A key spelled exactly like a number and its counter (五分, 三時, 何分)
  // keeps the span only when it is among the most frequent words: 十分 is
  // じゅうぶん, "enough", but 五分 is ごふん, not ごぶ "half", and 何分 is
  // なんぷん, not なにぶん "anyway". The library's 五分ぐらいです forced it.
  const counted = countedEnd(run, i);
  for (let len = 1; len <= maxLen; len++) {
    const j = i + len;
    const s = run.slice(i, j);
    const last = s[len - 1];
    if (isDigitish(last)) break;
    const whole = i === 0 && j === run.length;
    let inside = null;
    for (const rec of dict.get(s) || []) {
      const node = wordNode(s, i, j, rec, s, NO_CHAIN, NO_CHAIN, whole, env);
      if (node && j === counted) {
        if (rec.q !== 1) node.cost += COST.numberKey;
        else node.countLike = true;
      }
      if (node && !banded(rec)) {
        if (inside === null) inside = endsInsideWord(run, i, j, dict, env.maxKey);
        if (inside) node.cost += COST.endsInsideWord;
      }
      push(node);
    }
    if (isKana(last)) {
      for (const d of deinflect(s)) {
        const recs = dict.get(d.base);
        if (!recs) continue;
        for (const rec of recs) {
          if (posMatches(d.type, rec.p, d.base, true)) push(wordNode(s, i, j, rec, d.base, d.chain, d.cuts, whole, env));
        }
      }
      if (hasKanji(s)) for (const node of stemNouns(s, i, j, dict, whole, env)) push(node);
    } else if (len === 1 && env.stems && isKanji(last)) {
      // An ichidan verb's stem is its kanji alone: 見に行く is 見る's 見, and
      // without this node the only way through 見 was a guessed name read
      // けん. Only in the second phase (rare.js sets `stems`), which asks
      // for the verb behind a kanji the first pass guessed alone: asking for
      // one behind every kanji of every text is a key per kanji, each a
      // chance for the filter to let a shard through for nothing.
      // It costs what any stem as a noun costs, so it wins only where nothing
      // but a guess covers the kanji.
      for (const node of stemNouns(s, i, j, dict, whole, env)) push(node);
    }
    if (PARTICLE.has(s)) out.push({ i, j, s, cls: 'prt', closed: true, cost: COST.particle });
    if (COPULA[s]) out.push({ i, j, s, cls: 'cop', closed: true, cost: COST.copula });
  }

  const c0 = run[i];
  const ask = c0 === '何' ? counterAt(run, i + 1) : null;
  const asked = ask ? readQuestion(ask) : null;
  if (asked) {
    out.push({
      i, j: i + 1 + ask.length, s: run.slice(i, i + 1 + ask.length), cls: 'num', cost: COST.numberKanji,
      reading: asked.reading, counterChange: asked.changed, parts: countedParts(c0, ask, asked),
    });
  }
  const num = numberAt(run, i);
  if (num) {
    const counter = counterAt(run, num.end);
    const base = num.kanji ? COST.numberKanji : COST.number;
    const read = counter ? readCounted(num.value, counter) : null;
    if (read) {
      out.push({
        i, j: num.end + counter.length, s: run.slice(i, num.end + counter.length), cls: 'num', cost: base,
        reading: read.reading, counterChange: read.changed || numberBends(num.value),
        parts: countedParts(run.slice(i, num.end), counter, read),
      });
    }
    if (!num.kanji || num.end - i > 1) {
      const reading = readNumber(num.value);
      out.push({
        i, j: num.end, s: run.slice(i, num.end), cls: 'num', cost: base + COST.bareNumber,
        reading, counterChange: numberBends(num.value), parts: [{ text: run.slice(i, num.end), ruby: reading }],
      });
    }
  }
  if (isKatakana(c0)) {
    let j = i;
    while (j < run.length && isKatakana(run[j])) j++;
    out.push({ i, j, s: run.slice(i, j), cls: 'kata', cost: COST.kataRun });
  }
  const cp = String.fromCodePoint(run.codePointAt(i));
  if (isKanji(cp)) {
    // A name candidate for every stretch of kanji from here, up to six. A
    // stretch no dictionary key touches is priced to beat reading it as one
    // single-kanji word per character (names.js); any other stretch is the
    // last resort it always was.
    const known = wholeNameAt(run, i);
    if (known) out.push({ i, j: i + known, s: run.slice(i, i + known), cls: 'name', cost: COST.nameRun });
    let j = i;
    for (let n = 1; n <= 6 && j < run.length; n++) {
      const ch = String.fromCodePoint(run.codePointAt(j));
      if (!isKanji(ch)) break;
      j += ch.length;
      const cost = n >= 2 && unsupported(run, i, j, dict, env.maxKey, env)
        ? COST.nameRun + COST.nameRunPerChar * (n - 2)
        : COST.name + COST.namePerChar * n;
      out.push({ i, j, s: run.slice(i, j), cls: 'name', cost });
    }
  } else {
    out.push({ i, j: i + cp.length, s: cp, cls: 'unk', cost: COST.unkKana });
  }
  if (isKana(c0) && /[っッ]/.test(run[i + 1] || '') && i + 2 === run.length) {
    out.push({ i, j: i + 2, s: run.slice(i, i + 2), cls: 'exp', tsu: true, cost: COST.tsu });
  }
  return out;
}
