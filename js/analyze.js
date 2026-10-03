// The analyzer pipeline: pasted text in, tokens out (docs/ANALYZER.md).
//
//   normalize ─▶ pieces (Japanese runs, latin, numbers, punctuation, space)
//             ─▶ dict.need(every key the runs might look up) + kanji info
//             ─▶ the first pass per run (lattice.js pathOf)
//             ─▶ the second phase, only where the first pass guessed
//                (rare.js: rare words and names, fetched for those stretches)
//             ─▶ tokens, katakana pieces that touch joined into one
//                compound with parts (compounds.js)
//             ─▶ enrich each token ─▶ sounds and loanword rules, grammar
//
// It is async only because shards load on demand, and it loads them once:
// what a key needs to know about another key (the band of a kana word's
// kanji spelling, where that spelling cuts it, how far down its reading
// lists a kanji spelling) is shipped on the record, so no second fetch
// follows the first. Given the same text and the same data it returns the
// same tokens, and it never touches the DOM, so `npm test` runs it under
// node with the shards read from disk.
//
// `analyzeCore` is everything except the two annotation passes owned by
// sounds.js and grammar.js; `analyze` is the entry point the page calls.

import { beats, said, spelled, toKata, isKanji, isJapanese, isAllKana } from './kana.js';
import { keysForRun, pathOf, tokensOf } from './lattice.js';
import { weakSpans, spanKeys, refine } from './rare.js';
import { align, splitByKanji } from './furigana.js';
import { createDict } from './dict.js';
import { detectSounds } from './sounds.js';
import { annotateGrammar } from './grammar.js';
import { NAME_VARIANTS } from './names.js';
import { joinKatakana } from './compounds.js';

/** The kinds that are Japanese words, as opposed to what sits between them. */
export const JAPANESE_KINDS = Object.freeze(new Set([
  'word', 'inflected', 'particle', 'copula', 'katakana', 'name', 'unknown', 'number',
]));

/** Punctuation that ends a sentence, which is where a final す is whispered. */
const SENTENCE_END = new Set(['。', '.', '!', '?', '…', '‥', '｡']);
/** Closing brackets and quotes, which sit between a sentence and its end. */
const CLOSERS = new Set(['」', '』', ')', '）', '〉', '》', '】', '"', "'", '’', '”']);
/** The said line writes Japanese punctuation the way English would. */
const PUNCT_SAID = Object.freeze({ '。': '.', '、': ',', '「': '"', '」': '"', '『': '"', '』': '"', '・': ' ' });

/**
 * NFKC, so full-width digits and letters become ASCII and half-width katakana
 * becomes full width (ｺｰﾋｰ is コーヒー), and one kind of line break. Offsets
 * in every token refer to this string, which is returned as `text`.
 */
export function normalize(text) {
  // Zero-width spaces, word joiners and a byte-order mark are invisible and
  // mean nothing to a reader; left in, わたし\u200bは split the word and
  // said the は "ha". The zero-width joiner stays: emoji are built with it.
  return String(text ?? '').normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[\u200b\u2060\ufeff]/g, '');
}

const isDigit = (ch) => ch >= '0' && ch <= '9';

/** A digit group separator: a comma between a digit and exactly three digits. */
function isGroupComma(text, i) {
  return text[i] === ',' && isDigit(text[i - 1] || '') && /^\d{3}(?!\d)/.test(text.slice(i + 1, i + 5));
}

/**
 * Split the text into Japanese runs and everything else. A run is kana, kanji
 * and digits together, so 3時 and 2026年 reach the lattice whole and a number
 * can take its counter.
 */
function pieces(text) {
  const out = [];
  const n = text.length;
  // Where each user-perceived character starts, so an emoji built from
  // several code points (a ZWJ family, a flag, a skin tone) stays one piece
  // instead of one punctuation token per code point.
  const starts = typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Set([...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)].map((g) => g.index)) : null;
  let i = 0;
  const cp = (k) => String.fromCodePoint(text.codePointAt(k));
  const inRun = (k) => { const ch = cp(k); return isJapanese(ch) || isDigit(ch) || isGroupComma(text, k); };
  while (i < n) {
    const ch = cp(i);
    let j = i + ch.length;
    let type;
    if (ch === '\n') {
      type = 'newline';
    } else if (/\s/u.test(ch)) {
      type = 'space';
      while (j < n && text[j] !== '\n' && /\s/u.test(text[j])) j++;
    } else if (inRun(i)) {
      type = 'jp';
      while (j < n && inRun(j)) j += cp(j).length;
    } else if (/[\p{L}\p{M}]/u.test(ch)) {
      type = 'latin';
      while (j < n && /[\p{L}\p{M}'’]/u.test(cp(j)) && !isJapanese(cp(j))) j += cp(j).length;
    } else {
      type = 'punct';
      while (starts && j < n && !starts.has(j)) j++;
    }
    out.push({ type, start: i, end: j, text: text.slice(i, j) });
    i = j;
  }
  return out;
}

/** A token for anything that is not a Japanese word. */
function plainToken(p) {
  const kind = p.type;
  let saidLine = '';
  if (kind === 'punct') saidLine = PUNCT_SAID[p.text] ?? p.text;
  else if (kind === 'latin') saidLine = p.text;
  return {
    kind, surface: p.text, start: p.start, end: p.end, base: p.text, reading: '',
    furigana: [{ text: p.text }], morae: [],
    romaji: { said: saidLine, spelled: kind === 'latin' ? p.text : '' },
    entry: null, alts: 0, chain: [], sounds: [], grammar: [], kanji: [], confidence: 'rule',
  };
}

/**
 * Marks that sit in kanji runs and are no characters to learn: 々 repeats,
 * ヶ is a small ke, 〆 a closing mark (締め) KANJIDIC does not hold, which
 * the table listed as a kanji to save.
 */
const MARKS = new Set(['々', 'ヶ', '〆']);

/** Kanji a learner would look up. */
function kanjiOf(surface) {
  return [...surface].filter((ch) => isKanji(ch) && !MARKS.has(ch));
}

/**
 * The said line of one token, split into words where the lattice said so.
 * `waAt` are offsets of a は inside the token that is the particle (ではまた),
 * which is said わ; the swap is one kana for one, so no offset moves.
 */
function saidOf(reading, cuts, words, particle, finalWa, waAt) {
  const kana = waAt && waAt.length
    ? [...reading].map((ch, k) => (waAt.includes(k) && (ch === 'は' || ch === 'ハ') ? 'わ' : ch)).join('')
    : reading;
  if (!words) return said(kana, { cuts, particle, finalWa });
  return words.map(([a, b]) => said(kana.slice(a, b), {
    cuts: cuts.filter((c) => c > a && c < b).map((c) => c - a),
    particle,
    finalWa: finalWa && b === kana.length,
  })).join(' ');
}

/**
 * Furigana and cuts for a number, whose parts the lattice already knows. A
 * part with kana in it (the か of 一か月) is aligned like any word, so the
 * ruby sits over 月 alone; a part read as a whole (八日 ようか) keeps the flag.
 */
function numberFurigana(parts) {
  const furigana = [];
  const cuts = [];
  let at = 0;
  for (const part of parts) {
    if (!part.text) continue;
    if (at) cuts.push(at);
    const ruby = part.ruby || '';
    if (isAllKana(part.text) || !ruby) furigana.push({ text: part.text });
    else if (part.whole) furigana.push({ text: part.text, ruby, whole: true });
    else {
      const inner = align(part.text, ruby);
      furigana.push(...inner.furigana);
      for (const c of inner.cuts) cuts.push(at + c);
    }
    at += (ruby || part.text).length;
  }
  return { furigana, cuts };
}

/** Everything a Japanese token carries beyond what the lattice decided. */
function enrich(t) {
  const aid = t.aid || {};
  delete t.aid;
  const fur = aid.parts ? numberFurigana(aid.parts) : align(t.surface, t.reading, aid.f, { cuts: aid.cuts, v5u: aid.v5u });
  t.furigana = fur.furigana;
  t.morae = beats(t.reading);
  // A katakana word is said from its katakana: ソウル keeps its u (souru)
  // where そうる would be sooru. kana.js only rewrites エイ in katakana.
  const kana = t.kind === 'katakana' ? toKata(t.reading) : t.reading;
  const particle = t.kind === 'particle' || t.kind === 'copula';
  t.romaji = { said: saidOf(kana, fur.cuts, aid.words, particle, aid.finalWa, aid.waAt), spelled: spelled(t.reading) };
  t.kanji = kanjiOf(t.surface);
  t.sounds = [];
  t.grammar = [];
  // The same cuts and the same は go to sounds.js, so a long vowel the said
  // line keeps apart is not taught as one, and a は said wa is explained.
  SAID.set(t, { cuts: fur.cuts, finalWa: !!aid.finalWa, waAt: aid.waAt || [] });
}

/** Per token, what the said line was built from; analyze() hands it to sounds.js. */
const SAID = new WeakMap();

/**
 * For each Japanese token, whether it is the last one before the end of its
 * sentence: sentence-ending punctuation, a line break or the end of the text,
 * with closing brackets and spaces allowed in between.
 */
function finals(tokens) {
  const out = tokens.map(() => false);
  tokens.forEach((t, k) => {
    if (!JAPANESE_KINDS.has(t.kind)) return;
    for (let m = k + 1; m <= tokens.length; m++) {
      const n = tokens[m];
      if (!n || n.kind === 'newline') { out[k] = true; return; }
      if (n.kind === 'space') continue;
      if (n.kind === 'punct' && CLOSERS.has(n.surface)) continue;
      out[k] = n.kind === 'punct' && SENTENCE_END.has(n.surface);
      return;
    }
  });
  return out;
}

/**
 * Per-character readings inside one token, from its furigana, as
 * [char, reading, run] where `run` is set only for a reading that belongs to
 * a whole run (the ruby carries `whole`: 今日 is きょう, and neither 今 nor 日
 * is read きょう alone). A ruby over a run of several kanji is otherwise split
 * with kanji data when it can be; 々 lends its reading to the kanji it
 * repeats (人々: ひと and びと both belong to 人).
 */
function kanjiReadings(t, kanjiInfo) {
  const out = [];
  for (const f of t.furigana) {
    if (!f.ruby) continue;
    const chars = [...f.text];
    if (!chars.every((ch) => isKanji(ch))) continue;
    if (f.whole) {
      for (const ch of new Set(chars)) if (!MARKS.has(ch)) out.push([ch, f.ruby, f.text]);
      continue;
    }
    const split = chars.length === 1 ? [f.ruby] : splitByKanji(f.text, f.ruby, kanjiInfo);
    if (!split) continue;
    chars.forEach((ch, n) => {
      const owner = ch === '々' ? chars[n - 1] || (out.length ? out[out.length - 1][0] : null) : ch;
      if (owner) out.push([owner, split[n], null]);
    });
  }
  return out;
}

/**
 * Every kanji in the text, in order of first appearance: its data, the
 * readings this text gives it, and the tokens it sits in. A reading that
 * belongs to a whole word is listed like any other and flagged, so the page
 * can say "read as a whole" rather than teach きょう as a reading of 今:
 * `whole` is true when any listed reading is one, and `wholeRuns` names each
 * with the run it belongs to.
 */
function kanjiList(tokens, kanjiInfo) {
  const list = [];
  const byChar = new Map();
  tokens.forEach((t, idx) => {
    if (!t.kanji || !t.kanji.length) return;
    for (const ch of t.kanji) {
      let e = byChar.get(ch);
      if (!e) {
        e = { char: ch, info: kanjiInfo.get(ch) || null, readings: [], whole: false, wholeRuns: [], tokens: [] };
        byChar.set(ch, e);
        list.push(e);
      }
      if (!e.tokens.includes(idx)) e.tokens.push(idx);
    }
    for (const [ch, reading, run] of kanjiReadings(t, kanjiInfo)) {
      const e = byChar.get(ch);
      if (!e || !reading) continue;
      if (!e.readings.includes(reading)) e.readings.push(reading);
      if (run && !e.wholeRuns.some((w) => w.run === run && w.reading === reading)) {
        e.whole = true;
        e.wholeRuns.push({ run, reading });
      }
    }
  });
  return list;
}

/**
 * The second phase (rare.js), in place on each run's first-pass path: the
 * stretches the first pass guessed, read again once the rare words and names
 * they could be are loaded. A run with no guess is not touched and asks for
 * nothing, and a text with none fetches no file of either tier. If those
 * files cannot be loaded the first pass's reading stands: a guess the page
 * already calls a guess is better than no reading at all.
 */
async function secondPhase(parts, firsts, dict) {
  const none = parts.map(() => null);
  if (typeof dict.needRare !== 'function') return none;
  const spans = firsts.map((x, k) => (x ? weakSpans(parts[k].text, x.path) : []));
  if (!spans.some((list) => list.length)) return none;
  const keys = { rare: new Set(), names: new Set(), first: new Set() };
  spans.forEach((list, k) => spanKeys(parts[k].text, list, keys, firsts[k] && firsts[k].env.kanji));
  try {
    // The first tier is asked again only for the ichidan verb behind a kanji
    // guessed alone (見 of 見る), which only this phase offers.
    await Promise.all([
      dict.needRare(keys.rare), dict.needNames(keys.names), keys.first.size ? dict.need(keys.first) : null,
    ]);
  } catch {
    return none;
  }
  return spans.map((list, k) => (list.length ? refine(parts[k].text, firsts[k].path, list, dict, firsts[k].env) : null));
}

/**
 * One run's tokens. Every node the first pass placed outside a guessed
 * stretch keeps the token the first pass built for it, with the first
 * pass's neighbours: a particle after a word the second phase found keeps
 * its gloss, and 何 keeps its なに or なん. Only the stretches the second
 * phase read again are built from its path, in that path's context.
 */
function runTokens(run, first, second, dict) {
  const before = tokensOf(run, first.path, dict, first.env);
  if (!second) return before;
  const kept = new Map(first.path.map((node, k) => [node, before[k]]));
  const after = tokensOf(run, second, dict, first.env);
  return second.map((node, k) => kept.get(node) || after[k]);
}

/**
 * Tokens, kanji and the unknown count, without the sound and grammar passes.
 * @param {string} input
 * @param {{ dict: object }} opts  a dictionary from createDict
 */
export async function analyzeCore(input, { dict } = {}) {
  if (!dict) throw new TypeError('analyze needs a dict (createDict)');
  const text = normalize(input);
  const parts = pieces(text);
  await dict.ready();

  const keys = new Set();
  for (const p of parts) if (p.type === 'jp') for (const k of keysForRun(p.text, dict.maxKey)) keys.add(k);
  // A variant a name may use (𠮷) is read from the character it varies.
  const chars = [...new Set([...text].filter((ch) => isKanji(ch)).flatMap((ch) => (NAME_VARIANTS[ch] ? [ch, NAME_VARIANTS[ch]] : [ch])))];
  const [, kanjiInfo] = await Promise.all([
    dict.need(keys),
    chars.length ? dict.kanji(chars) : Promise.resolve(new Map()),
  ]);

  const runOpts = parts.map((p, k) => {
    if (p.type !== 'jp') return null;
    const prev = parts[k - 1];
    const next = parts[k + 1];
    // After latin text or a closing quote the run continues a noun phrase:
    // ABCです, and 「やさしい」は, whose は is the topic particle and was
    // read as a word (said ha) while a run could not open on one.
    const quoted = prev && prev.type === 'punct' && CLOSERS.has(prev.text);
    return {
      kanji: kanjiInfo,
      after: prev && (prev.type === 'latin' || quoted) ? 'noun' : undefined,
      before: !!(next && next.type === 'latin'),
    };
  });
  const firsts = parts.map((p, k) => (runOpts[k] ? pathOf(p.text, dict, runOpts[k]) : null));
  const seconds = await secondPhase(parts, firsts, dict);
  const tokens = [];
  parts.forEach((p, k) => {
    if (!firsts[k]) { tokens.push(plainToken(p)); return; }
    // Katakana pieces that touch are one compound with parts (compounds.js),
    // joined after both passes so neither pass's search changes.
    for (const t of joinKatakana(runTokens(p.text, firsts[k], seconds[k], dict))) {
      t.start += p.start;
      t.end += p.start;
      enrich(t);
      tokens.push(t);
    }
  });
  tokens.forEach((t, i) => { t.i = i; });

  const unknown = tokens.filter((t) => t.confidence === 'guess' || t.kind === 'unknown').length;
  return { text, tokens, kanji: kanjiList(tokens, kanjiInfo), unknown };
}

/**
 * The page's one entry point. Without a dict it reads the shards from data/
 * next to the page.
 */
export async function analyze(input, { dict } = {}) {
  const d = dict || defaultDict();
  const result = await analyzeCore(input, { dict: d });
  const fin = finals(result.tokens);
  result.tokens.forEach((t, k) => {
    if (JAPANESE_KINDS.has(t.kind)) t.sounds = detectSounds(t, { final: fin[k], ...SAID.get(t) });
  });
  annotateGrammar(result.tokens);
  return result;
}

let shared = null;

/** One dictionary per page, so shards fetched for one paste serve the next. */
export function defaultDict() {
  if (!shared) {
    if (typeof fetch !== 'function') throw new TypeError('analyze needs a dict outside the browser');
    shared = createDict({
      fetchJson: (url) => fetch(url, { credentials: 'omit' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      base: 'data/',
    });
  }
  return shared;
}
