/**
 * The lines of "Where are the spaces?" (data/play/spaces.json,
 * yomu-spaces/1) and their answer key, which is Yomu's own analysis of each
 * line: the edges js/gaps.js finds in the tokens, each with its reason.
 *
 * Read by tools/build-spaces.mjs, which writes the file, and by
 * tests/spaces.test.mjs, which builds it again in memory and fails a file
 * that is not this output, so a change to the analyzer that moves an edge
 * fails `npm test` until the file is rebuilt.
 *
 * Where the lines come from, in the order a round asks them:
 *
 *   tier 1  hiragana sentences, where the particles are the clue: the
 *           library's own lines written all in hiragana, and the kana
 *           spellings of the others (the library's `kana`, with its
 *           punctuation put back), when that spelling is all hiragana
 *   tier 2  the library's lines as written, with kanji and katakana
 *   tier 3  lines with a katakana compound (tools/lib/compound-lines.mjs):
 *           on 2026-10-07 the library holds none
 *
 * A dialogue turn is cut into its sentences, and each is one question. A
 * line is left out, and counted, when
 *
 *   reading   the analyzer's reading of it is not the library's `kana`
 *             (tests/library-reading.test.mjs allows one such line): the
 *             two disagree about what the words are
 *   set       the library marks the phrase a set phrase (`chunk`), or the
 *             line holds a set phrase the analysis cuts inside: the library
 *             says it is learned whole, so where its words part is not
 *             settled (お|元気|です|か, ごちそうさま|でした)
 *   prefix    a prefix stands as a word of its own (お|元気, ご|注文): the
 *             dictionary writes お名前 as one word and お元気 as two, so
 *             whether a prefix is its own word is not settled either
 *   joined    two or more neighbouring tokens, none a particle or a copula
 *             form, spell one dictionary word of either tier read the way
 *             the line reads them (卵|焼き is 卵焼き, 作り|方 is 作り方): a
 *             learner who writes the word whole is right too
 *   counter   a number's counter and the word after it spell one dictionary
 *             word (何番|線, where 番線 is the counter)
 *   tail      a word ends in a particle after a dictionary word read the
 *             same (何と in 何と言いますか, where と quotes; 一緒に, 何か), or
 *             after a form of the copula (だっけ, だ and the particle っけ):
 *             the language splits it as readily as the analysis joins it.
 *             Only where what comes before the particle holds a kanji or is
 *             the copula: in kana every short stretch is some word (こ|の,
 *             しご|と)
 *   two       one token the grammar writes as two words: a te-form and the
 *             verb it lends (持って|いきます, 作って|みます, して|います), a
 *             copula form said in two (じゃ|ありません), or an expression
 *             the dictionary lists whole that is a word and a conjugated form
 *             (お願い|します, where the same file splits 連絡|します;
 *             ありがとう|ございました)
 *   kana      its kana spelling reads with edges the written line does not
 *             have: the kanji settled where the words part, the kana alone
 *             do not
 *   base      its kana spelling reads a word of the written line as another
 *             word (いって as 要る where the line says 行って, さとう as 砂糖
 *             where it says 佐藤): the reason would name the wrong word
 *   guess     a token, or a part of a compound, has no dictionary support
 *   none      it has no edge to find (ありがとうございます。, はい、どうぞ。)
 *   long      it has more than MAX_SLOTS positions, more than a phone's
 *             board holds in a few rows
 *   twice     the same text came already
 *
 * A written line left out takes its kana spelling with it: the two are the
 * same words, so what is not settled in one is not settled in the other.
 * The checks of the dictionary (joined, counter, tail, two, base) are
 * tools/lib/spaces-settled.mjs; each reads the analysis and both tiers of
 * the dictionary, and none is a list of lines.
 */
import {
  gapsOf, slotsOf, codePointAt, isWordToken, isWordChar, isGuess, isPrefix, REASONS,
} from '../../js/gaps.js';
import {
  isKana, isKatakana, isHiragana, toHira,
} from '../../js/kana.js';
import { unsettled, otherWord } from './spaces-settled.mjs';

export { dictWords, unsettled, otherWord } from './spaces-settled.mjs';

export const SPACES_FORMAT = 'yomu-spaces/1';
export const SPACES_SRC = 'data/play/spaces.json';
/** Positions between characters a line may offer: three rows of a 390px board. */
export const MAX_SLOTS = 18;
export const LEFT_OUT = Object.freeze([
  'reading', 'set', 'prefix', 'joined', 'counter', 'tail', 'two', 'kana', 'base', 'guess', 'none', 'long', 'twice',
]);
/** The fields a gap may carry besides `at` and `why`. */
export const GAP_VARS = Object.freeze(['w', 'k', 'from', 'to', 'o', 'a', 'b', 'f', 'base', 'part']);

const SENTENCE_END = /[。？！?!]/u;
const fold = (s) => toHira([...String(s || '')].filter((ch) => isKana(ch)).join(''));
const allKatakana = (s) => s.length > 0 && [...s].every((ch) => isKatakana(ch));

/** A line cut after each 。, ？ or ！, the mark kept with its sentence. */
export function sentencesOf(text) {
  const out = [];
  let cur = '';
  for (const ch of String(text || '')) {
    cur += ch;
    if (SENTENCE_END.test(ch)) { out.push(cur.trim()); cur = ''; }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** An English or Spanish translation cut into sentences the same way, or null. */
function translationSentences(s) {
  if (typeof s !== 'string' || !s.trim()) return null;
  return s.trim().split(/(?<=[.!?])\s+(?=[¿¡A-ZÁÉÍÓÚÑ"'])/u).map((x) => x.trim()).filter(Boolean);
}

/** The edges of an analysis, in code points, each as a gap record for the file. */
export function edgesOf(r) {
  return gapsOf(r.tokens).map((g) => {
    const rec = { at: codePointAt(r.text, g.at), why: g.why };
    for (const k of GAP_VARS) if (k !== 'part' && g[k] !== undefined) rec[k] = g[k];
    if (g.part !== null) rec.part = 1;
    return rec;
  });
}

function hasGuess(r) {
  return r.tokens.some((t) => isWordToken(t) && (isGuess(t) || (Array.isArray(t.parts) && t.parts.some((p) => !p.entry))));
}

function hasCompound(r) {
  return r.tokens.some((t) => Array.isArray(t.parts) && t.parts.length > 1);
}

/** Every token edge of an analysis in code points, the line's ends included. */
function tokenEdges(r) {
  const out = new Set([0, [...r.text].length]);
  for (const t of r.tokens) { out.add(codePointAt(r.text, t.start)); out.add(codePointAt(r.text, t.end)); }
  return out;
}

/**
 * Does the analysis cut inside a set phrase the line holds, or across one of
 * its ends. `sets` are the library's set phrases, punctuation left out.
 */
function cutsASet(r, sets) {
  const chars = [...r.text];
  const edges = new Set(edgesOf(r).map((g) => g.at));
  const ends = tokenEdges(r);
  for (const set of sets) {
    const want = [...set];
    for (let s = 0; s + want.length <= chars.length; s += 1) {
      if (want.some((ch, k) => chars[s + k] !== ch)) continue;
      const e = s + want.length;
      if (!ends.has(s) || !ends.has(e)) return true;
      for (const at of edges) if (at > s && at < e) return true;
    }
  }
  return false;
}

/** The line spelled in kana: katakana stays, punctuation stays, the rest is its reading. */
function kanaSpelling(r) {
  return r.tokens.map((t) => {
    if (!isWordToken(t) || !t.reading) return t.surface;
    return allKatakana(t.surface) ? t.surface : t.reading;
  }).join('');
}

/** The written line's edges moved into its kana spelling, token by token. */
function edgesInKana(r) {
  const out = [];
  let at = 0;
  for (const t of r.tokens) {
    const kana = !isWordToken(t) || !t.reading || allKatakana(t.surface) ? t.surface : t.reading;
    if (Array.isArray(t.parts) && t.parts.length > 1) {
      let inner = at;
      for (const p of t.parts.slice(0, -1)) { inner += [...p.surface].length; out.push(inner); }
    }
    at += [...kana].length;
    out.push(at);
  }
  // Only the edges between two words: drop the line's end and the edges beside punctuation.
  const slots = new Set(slotsOf(kanaSpelling(r)));
  return out.filter((p) => slots.has(p));
}

/** Every character words are made of is hiragana (punctuation aside). */
function isAllHiragana(text) {
  const w = [...text].filter(isWordChar);
  return w.length > 0 && w.every((ch) => isHiragana(ch));
}

/**
 * Build the file. `analyze(text)` is the analyzer (analyze.js with a
 * dictionary over the committed shards); `words` what the checks read of
 * the dictionary (`dictWords`, over a dictionary of its own); `library` the
 * parsed phrase library;
 * `compounds` the authored compound lines; `licence` the block the file
 * carries. Returns `{ doc, report }`: the report counts the sentences, what
 * was kept by tier and source, and lists what was left out with why (`at`,
 * for the checks of the dictionary, names the words that showed it).
 */
export async function spacesDoc({
  library, compounds = [], analyze: analyzeLine, words, licence = null,
}) {
  if (!words || typeof words.lookup !== 'function' || typeof words.read !== 'function') {
    throw new TypeError('spacesDoc needs the words the checks read (dictWords)');
  }
  const report = {
    sentences: 0, spelled: 0, kept: { 1: 0, 2: 0, 3: 0 }, sources: {}, left: Object.fromEntries(LEFT_OUT.map((k) => [k, 0])), leftOut: [],
  };
  const sets = (library.phrases || []).filter((p) => p && p.chunk).flatMap((p) => sentencesOf(p.ja))
    .map((x) => [...x].filter(isWordChar).join('')).filter((x) => [...x].length >= 2);
  const tr = (d, lang, n) => (d.translation && Array.isArray(d.translation[lang]) ? d.translation[lang][n] : null);
  const items = [
    ...(library.phrases || []).map((p) => ({ id: p.id, src: 'phrase', ja: p.ja, kana: p.kana, set: !!p.chunk, en: p.en, es: p.es })),
    ...(library.dialogues || []).flatMap((d) => d.lines.map((l, n) => ({
      id: `${d.id}#${n}`, src: 'dialogue', ja: l.ja, kana: l.kana, set: false, en: tr(d, 'en', n), es: tr(d, 'es', n),
    }))),
    ...compounds.map((c) => ({ id: c.id, src: 'compound', ja: c.ja, kana: c.kana, set: false, en: c.en, es: c.es })),
  ];
  const lines = [];
  const seen = new Set();
  const leave = (why, id, text, at = null) => {
    report.left[why] += 1;
    report.leftOut.push(at ? { id, why, text, at } : { id, why, text });
  };

  const keep = (line, r, edges, tier) => {
    if (!edges.length) return leave('none', line.id, r.text);
    if (slotsOf(r.text).length > MAX_SLOTS) return leave('long', line.id, r.text);
    if (seen.has(r.text)) return leave('twice', line.id, r.text);
    seen.add(r.text);
    lines.push({ ...line, tier, ja: r.text, gaps: edges });
    report.kept[tier] += 1;
    report.sources[line.src] = (report.sources[line.src] || 0) + 1;
    return true;
  };

  for (const it of items) {
    const parts = sentencesOf(it.ja);
    report.sentences += parts.length;
    const results = [];
    for (const x of parts) results.push(await analyzeLine(x));
    const ids = parts.map((_, n) => (parts.length > 1 ? `${it.id}/${n}` : it.id));
    // The reading of the whole turn against the kana written for it.
    const read = fold(results.map((r) => r.tokens.map((t) => t.reading || '').join('')).join(''));
    if (read !== fold(it.kana)) { parts.forEach((x, n) => leave('reading', ids[n], x)); continue; }
    if (it.set) { parts.forEach((x, n) => leave('set', ids[n], x)); continue; }
    const en = translationSentences(it.en);
    const es = translationSentences(it.es);
    const paired = en && es && en.length === parts.length && es.length === parts.length;
    for (let n = 0; n < parts.length; n += 1) {
      const r = results[n];
      const id = ids[n];
      const meaning = paired ? { en: en[n], es: es[n] } : parts.length === 1 && it.en && it.es ? { en: it.en, es: it.es } : {};
      if (hasGuess(r)) { leave('guess', id, r.text); continue; }
      if (cutsASet(r, sets)) { leave('set', id, r.text); continue; }
      if (r.tokens.some(isPrefix)) { leave('prefix', id, r.text); continue; }
      const open = await unsettled(r, words);
      if (open) { leave(open.why, id, r.text, open.at); continue; }
      const edges = edgesOf(r);
      const tier = hasCompound(r) ? 3 : isAllHiragana(r.text) ? 1 : 2;
      if (keep({ id, src: it.src, ...meaning }, r, edges, tier) !== true || tier === 1) continue;
      // The same sentence in kana, when that is all hiragana: its edges must
      // be the written line's, or the kanji were what settled them.
      const kana = kanaSpelling(r);
      if (!isAllHiragana(kana)) continue;
      report.spelled += 1;
      const k = await analyzeLine(kana);
      const kid = `${id}~kana`;
      if (hasGuess(k)) { leave('guess', kid, k.text); continue; }
      if (k.tokens.some(isPrefix)) { leave('prefix', kid, k.text); continue; }
      const got = edgesOf(k);
      if (got.map((g) => g.at).join() !== edgesInKana(r).join()) { leave('kana', kid, k.text); continue; }
      const other = otherWord(r, k);
      if (other) { leave('base', kid, k.text, other); continue; }
      const openK = await unsettled(k, words);
      if (openK) { leave(openK.why, kid, k.text, openK.at); continue; }
      keep({ id: kid, src: 'kana', of: id, ...meaning }, k, got, 1);
    }
  }
  lines.sort((a, b) => a.tier - b.tier);
  const reasons = Object.fromEntries(REASONS.map((w) => [w, 0]));
  for (const l of lines) for (const g of l.gaps) reasons[g.why] += 1;
  report.reasons = reasons;
  report.lines = lines.length;
  const doc = {
    _licence: licence,
    format: SPACES_FORMAT,
    count: lines.length,
    tiers: { 1: report.kept[1], 2: report.kept[2], 3: report.kept[3] },
    lines,
  };
  return { doc, report };
}

/**
 * The file's licence block. The lines are ours (CC0); where the words part,
 * and the names behind the name reason, come from the analysis over JMdict
 * and JMnedict, so the block is the dictionary's, as the look-alikes' is
 * KANJIDIC's, with the names and the authored lines as inputs.
 */
export function spacesLicence(dict, names) {
  const { inputs, generated_by: _by, ...primary } = dict || {};
  const { inputs: _n, upstream: _u, generated_by: _nb, generated_at: _na, derived: _d, links: _l, ...jmnedict } = names || {};
  return {
    ...primary,
    inputs: [
      { ...jmnedict, use: 'which runs are names, read by the analysis behind the name reason' },
      {
        id: 'authored',
        source: 'Written for Yomu: the phrase library (data/phrases/library.json) and the lines in tools/lib/compound-lines.mjs',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        spdx: 'CC0-1.0',
        screen: 'none',
        use: 'the lines, their kana and their translations',
      },
    ],
    generated_by: 'tools/build-spaces.mjs',
  };
}

/**
 * What is wrong with a spaces file, as sentences; [] when nothing is. The
 * shape only: tests/spaces.test.mjs compares the file with a fresh build.
 */
export function spacesProblems(doc) {
  const out = [];
  if (!doc || doc.format !== SPACES_FORMAT) return [`format is not ${SPACES_FORMAT}`];
  if (!Array.isArray(doc.lines)) return ['no lines'];
  if (doc.count !== doc.lines.length) out.push(`count is ${doc.count}, the file holds ${doc.lines.length}`);
  const ids = new Set();
  const texts = new Set();
  let tier = 1;
  doc.lines.forEach((l, n) => {
    const at = `lines[${n}]`;
    if (!l || typeof l.id !== 'string' || !l.id) { out.push(`${at} has no id`); return; }
    if (ids.has(l.id)) out.push(`${at}: the id ${l.id} twice`);
    ids.add(l.id);
    if (![1, 2, 3].includes(l.tier)) out.push(`${at}: tier ${l.tier}`);
    else if (l.tier < tier) out.push(`${at}: tier ${l.tier} after tier ${tier}`);
    else tier = l.tier;
    if (typeof l.ja !== 'string' || !l.ja) { out.push(`${at} has no text`); return; }
    if (texts.has(l.ja)) out.push(`${at}: the text twice`);
    texts.add(l.ja);
    const slots = new Set(slotsOf(l.ja));
    if (slots.size > MAX_SLOTS) out.push(`${at}: ${slots.size} positions, over ${MAX_SLOTS}`);
    if (!Array.isArray(l.gaps) || !l.gaps.length) { out.push(`${at} has no gap`); return; }
    let last = 0;
    for (const g of l.gaps) {
      if (!g || !Number.isInteger(g.at) || !slots.has(g.at)) out.push(`${at}: a gap at ${g && g.at}, which is no position between two characters`);
      else if (g.at <= last) out.push(`${at}: gaps out of order at ${g.at}`);
      else last = g.at;
      if (!g || !REASONS.includes(g.why)) out.push(`${at}: the reason ${g && g.why}`);
      for (const k of Object.keys(g || {})) if (k !== 'at' && k !== 'why' && !GAP_VARS.includes(k)) out.push(`${at}: a gap field ${k}`);
    }
    for (const k of ['en', 'es']) if (l[k] !== undefined && (typeof l[k] !== 'string' || !l[k].trim())) out.push(`${at}: ${k} is empty`);
    if ((l.en === undefined) !== (l.es === undefined)) out.push(`${at}: a translation in one language only`);
  });
  for (const t of [1, 2, 3]) {
    const n = doc.lines.filter((l) => l && l.tier === t).length;
    if (!doc.tiers || doc.tiers[t] !== n) out.push(`tiers.${t} is ${doc.tiers && doc.tiers[t]}, the file holds ${n}`);
  }
  return out;
}
