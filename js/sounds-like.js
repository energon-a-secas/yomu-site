// Sounds like English: for a katakana part the dictionary has no record of
// (インフォーム in インフォームショップ), the English word it most likely
// spells, guessed from its sound and said to be a guess.
//
// loan-align.js holds the loanword rules forwards: given an English word, it
// lines its consonants up with the katakana's (l with the r column, v with
// the b column, th with s). This module runs them backwards. The katakana's
// first consonant says which English consonants it may stand for (MATCH,
// reversed), so only the words filed under those are read; each is lined up
// with the katakana by the same `alignFull` the rules use, and a word that
// does not line up is no candidate. A candidate is a word JMdict itself uses
// as an English gloss (data/like/, emitted by tools/build-sounds-like.mjs from
// the committed shards); nothing here makes a word up.
//
// Lining up says nothing about vowels, and インフォーム lines up with
// "inform", "informer" and "uniform" alike. So each candidate is priced by
// what the vowels and the consonants did between the two spellings (the or
// of inform written オー, the u added after its m), with the odds counted
// over the JMdict loanwords whose one-word gloss lines up with their own
// katakana (`pieces` in data/like/index.json), plus how often JMdict uses the
// word. The best candidate is offered only when it is clearly ahead of the
// next and nothing in its line-up is a stretch (docs/ANALYZER.md, "Sounds
// like English", has the measurement).
//
// The page shows it as a guess from the sound, on its own line, and never as
// a gloss: a part with a guess keeps `gloss: null`.

import { kataBeats, englishUnits, alignFull, MATCH } from './loan-align.js';

/**
 * The rule for offering a guess, chosen on the measurement's development
 * quarter (the rule that answered most while every length it answered was
 * right 80 times in 100 or more) and then read once on the held-out quarter
 * (tools/measure-sounds-like.mjs): `minKana` katakana at least; ahead of the
 * next word by `margin` in log-odds, or by `shortMargin` for a part under
 * `long` katakana, which more words line up with; no piece of the line-up
 * under `worst`; a step the rules allow only loosely (an h for an f) costing
 * `loose`; and the log of how many records gloss with the word weighed by
 * `common`. `smooth` and `floor` are the model's smoothing.
 */
export const LIKE = Object.freeze({
  minKana: 4, long: 6, shortMargin: 4, margin: 1, worst: -5, loose: 3, common: 1, smooth: 1, floor: 0.01,
});

/** For a katakana onset class, the English unit classes it may be written for: MATCH, reversed. */
export const GROUPS_FOR = (() => {
  const out = {};
  for (const [eng, kata] of Object.entries(MATCH)) {
    for (const k of Object.keys(kata)) (out[k] ||= []).push(eng);
  }
  // ツ for an English ts (cats キャッツ), which loan-align.js matches to a T unit and an S
  (out.TS ||= []).push('T');
  for (const k of Object.keys(out)) out[k] = Object.freeze([...new Set(out[k])].sort());
  return Object.freeze(out);
})();

const isWY = (u) => u.cls === 'W' || u.cls === 'Y';

/**
 * The groups an English word is filed under: the class of the unit a
 * katakana word's first consonant would be matched to. That is its first
 * unit, or a later one when every unit before it may be skipped (soft: the
 * h of hour, the w of wood) or matched by a vowel beat (a W or a Y, the wh of
 * whisky written ウ). A word with no unit that must be matched is in none.
 */
export function groupsOfWord(word) {
  const us = englishUnits(word);
  if (!us || !us.some((u) => u.soft === undefined)) return [];
  const out = [];
  for (const u of us) {
    if (!out.includes(u.cls)) out.push(u.cls);
    if (u.soft === undefined && !isWY(u)) break;
  }
  return out;
}

/** The groups a katakana word needs: those its first consonant may be written for. */
export function groupsOfKana(kana) {
  const kb = kataBeats(kana);
  if (kb.some((b) => b.type === 'other')) return [];
  const first = kb.find((b) => b.type === 'cv' || b.type === 'nasal');
  return first ? [...(GROUPS_FOR[first.cls] || [])] : [];
}

/** A katakana beat as the pieces write it: its vowel, - for ー, Q for ッ. */
function beatPiece(b) {
  if (b.type === 'long') return '-';
  if (b.type === 'gem') return 'Q';
  return b.vowel || '';
}

/**
 * What a line-up pairs, as [english, katakana] pieces: the letters before
 * the first matched unit with the beats before the first matched beat (`^`
 * marks it); for each matched consonant, the letters after it up to the next
 * matched unit (vowels, and any letter the line-up skipped, the r of form;
 * `$` marks the end of the word) with its own vowel and any ー, ッ or vowel
 * beat before the next matched beat; and the consonant itself, `#` and its
 * letters with the katakana class it was written with (th with S).
 */
export function pieces(al) {
  const { kb, map, units } = al;
  const word = al.words[0];
  const matched = [];
  map.forEach((u, k) => { if (u >= 0) matched.push([k, u]); });
  if (!matched.length) return [];
  const out = [[`^${word.slice(0, units[matched[0][1]].from)}`, kb.slice(0, matched[0][0]).map(beatPiece).join('')]];
  matched.forEach(([k, u], n) => {
    const next = matched[n + 1];
    const eng = word.slice(units[u].to, next ? units[next[1]].from : word.length) + (next ? '' : '$');
    out.push([eng, (kb[k].vowel || '') + kb.slice(k + 1, next ? next[0] : kb.length).map(beatPiece).join('')]);
    out.push([`#${word.slice(units[u].from, units[u].to)}`, kb[k].cls || 'V']);
  });
  return out;
}

/**
 * The line-up of `kana` with one English word, with its pieces, or null.
 * `kb` is kataBeats(kana), passed in by a caller that lines up many words.
 */
export function lineUp(kana, word, kb = kataBeats(kana)) {
  const al = alignFull(kb, { words: [word], text: word });
  return al ? { word, cost: al.cost, pieces: pieces({ ...al, kb }) } : null;
}

/**
 * A piece's back-off class, for an English spelling the counts never met:
 * the head mark, the first vowel letter, whether an r was skipped, the end
 * mark; a consonant by its first two letters.
 */
export function coarseOf(eng) {
  if (eng[0] === '#') return `#${eng.slice(1, 3)}`;
  return (eng[0] === '^' ? '^' : '') + (eng.replace(/[^aeiouy]/g, '')[0] || '') + (eng.includes('r') ? 'r' : '') + (eng.endsWith('$') ? '$' : '');
}

/**
 * The odds of each piece, from `{ english: { katakana: count } }`: the
 * counted share, smoothed toward the share its back-off class gives, so a
 * spelling met once is not certain and one never met is not impossible.
 * @returns {(eng: string, kana: string) => number} a natural log
 */
export function createModel(counts, p = LIKE) {
  const fine = new Map();
  const coarse = new Map();
  const add = (m, a, b, n) => {
    if (!m.has(a)) m.set(a, { total: 0, by: new Map() });
    const x = m.get(a);
    x.total += n;
    x.by.set(b, (x.by.get(b) || 0) + n);
  };
  for (const [eng, row] of Object.entries(counts || {})) {
    for (const [kana, n] of Object.entries(row)) { add(fine, eng, kana, n); add(coarse, coarseOf(eng), kana, n); }
  }
  const memo = new Map();
  return (eng, kana) => {
    const id = `${eng}\u0000${kana}`;
    if (!memo.has(id)) memo.set(id, odds(eng, kana));
    return memo.get(id);
  };
  function odds(eng, kana) {
    const c = coarse.get(coarseOf(eng));
    const back = c ? ((c.by.get(kana) || 0) + p.floor) / (c.total + 1) : p.floor / 10;
    const f = fine.get(eng);
    if (!f) return Math.log(back);
    return Math.log(((f.by.get(kana) || 0) + p.smooth * back) / (f.total + p.smooth));
  }
}

/**
 * Every word of `words` that lines up with `kana`, best first, each with its
 * score, the log-odds of its pieces and the worst of them. Ties go to the
 * word that sorts first, so the order of `words` decides nothing.
 * @param {string} kana  katakana
 * @param {Iterable<[string, number]>} words  [word, how many records gloss with it]
 * @param {(eng: string, kana: string) => number} logp  from createModel
 * @param {object} [p]  LIKE, overridden only by the measurement's search
 */
export function rank(kana, words, logp, p = LIKE) {
  const out = [];
  const seen = new Set();
  const kb = kataBeats(kana);
  for (const [word, n] of words) {
    if (seen.has(word)) continue;
    seen.add(word);
    const al = lineUp(kana, word, kb);
    if (!al) continue;
    const odds = al.pieces.map(([e, k]) => logp(e, k));
    const lp = odds.reduce((s, x) => s + x, 0);
    out.push({ word, lp, worst: Math.min(...odds), score: lp - p.loose * al.cost + p.common * Math.log(Math.max(n, 1)) });
  }
  return out.sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : 1));
}

/**
 * Whether `ranked` (from `rank`) offers its first word: long enough, clearly
 * ahead of the next, and no piece of its line-up a stretch. `p` overrides
 * LIKE, for the measurement's search only.
 */
export function decide(kana, ranked, p = LIKE) {
  const n = [...kana].length;
  if (n < p.minKana || !ranked.length) return null;
  const [top, next] = ranked;
  if (next && top.score - next.score < (n < p.long ? p.shortMargin : p.margin)) return null;
  if (top.worst < p.worst) return null;
  return top.word;
}

/** The guess for one katakana part, or null when there is none worth offering. */
export function soundsLike(kana, words, logp) {
  if ([...kana].length < LIKE.minKana) return null;
  return decide(kana, rank(kana, words, logp));
}

const MODELS = new WeakMap();

/** createModel, once per loaded `pieces` object. */
export function modelFor(counts) {
  if (!MODELS.has(counts)) MODELS.set(counts, createModel(counts));
  return MODELS.get(counts);
}

/**
 * Sounds like English for every katakana part of a compound that no record
 * covers (compounds.js), in place: such a part gains `soundsLike`, the word,
 * when there is one worth offering. Its `gloss` stays null, and nothing else
 * of any token changes. A text with no such part asks for nothing; when the
 * files cannot be loaded, no part gains a guess and the reading stands.
 * @param {object[]} tokens  the analysis' tokens
 * @param {object} dict  from createDict
 */
export async function guessParts(tokens, dict) {
  if (!dict || typeof dict.needLike !== 'function') return;
  const parts = tokens.flatMap((t) => (Array.isArray(t.parts) ? t.parts : []))
    .filter((p) => !p.entry && [...p.surface].length >= LIKE.minKana);
  const groups = new Set(parts.flatMap((p) => groupsOfKana(p.surface)));
  if (!groups.size) return;
  try {
    await dict.needLike(groups);
  } catch {
    return;
  }
  const data = dict.like();
  if (!data) return;
  const logp = modelFor(data.pieces);
  for (const p of parts) {
    const word = soundsLike(p.surface, groupsOfKana(p.surface).flatMap((g) => data.words(g)), logp);
    if (word) p.soundsLike = word;
  }
}
