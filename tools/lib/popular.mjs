/**
 * data/names/popular.json: the katakana names the corpus uses most, each
 * with how it is written in Latin letters, for a game that asks a learner to
 * read one (トム is Tom).
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * Emitted by tools/build-names.mjs from the names it ships, never written by
 * hand, and held to the same rules by tools/check-data.mjs, which imports
 * `popularProblems` from here so the builder and the checker cannot disagree
 * on the format:
 *
 *   { "_licence": <the JMnedict block the names shards carry>,
 *     "format": "yomu-names-popular/1",
 *     "names": [ ["トム", "Tom", "given", 412], ... ] }
 *
 * A row is the katakana spelling (letters of the katakana block, ー and ・
 * only), the original spelling (`o` of the name's record: Latin letters,
 * spaces, hyphens, apostrophes, and a capital first: JMnedict spells
 * エイヴォン "avon", and a game that offers four spellings must not offer
 * one that reads as no name), one type, and how many Tatoeba sentences hold
 * the name as a whole katakana run, the count the names tier is attested
 * by. Highest count first, then the spelling in plain JS string order; only
 * names the corpus has at least once, at most POPULAR_MAX rows.
 *
 * The type is `given` (JMnedict's given, masc and fem), `surname`, `person`
 * (JMnedict's one particular person) or `place`: the first of the record's
 * types that is one, and a katakana record lists first the types of the
 * sense its `o` came from (tools/lib/jmnedict.mjs recordOf), so キャシー
 * Cathy is `given` (Casei is the surname) and リヨン Lyon a `place` (Riyon is
 * the woman's name). JMnedict types many a well-known name only `place`
 * (スミス, ロミオ, フランツ, ゴッホ), so a `place` the corpus uses as a
 * person is a `person` here (`usedAsPerson`): a Japanese sentence that puts
 * an honorific after it (スミスさん) or an English one linked to it that
 * puts Mr., Mrs., Ms. or Dr. before its spelling (Mr. Smith), in at least
 * PERSON_MIN sentences and PERSON_SHARE of its count. The names tier, and
 * so the Word panel, keeps JMnedict's own types; only this file's row moves.
 *
 * A name the corpus writes only as the stem of a language or a people
 * (ベルベル語, ベルベル人: Berber, in all 15 of its sentences) is no name of
 * a place or a person, and is left out (`usedAsWord`). Measured 2026-10-05
 * over every katakana name with a spelling the corpus confirmed: three are
 * never met without 語 or 人 after them, ベルベル, タタール (3 of 3) and
 * タガログ (2 of 2), and the nearest after them are places (アラビア 29 of 36,
 * ノルウェー 4 of 7, グルジア 1 of 2), so the rule asks for every sentence.
 *
 * Only names the page reads as names: the builder reads each candidate on
 * its own with the analyzer and keeps it when it comes back as one name
 * token with the same original spelling. バラ is a name in JMnedict, and 126
 * Tatoeba sentences have it, every one of them a rose: the katakana spelling
 * of a common word beats a name (js/rare.js), so the page says "rose" and
 * the game must not say "Bara".
 */
import { LATIN_NAME } from './jmnedict.mjs';

export const POPULAR_FORMAT = 'yomu-names-popular/1';
export const POPULAR_MAX = 1000;

/** A name's JMnedict type as one of the four a row may carry. */
export const POPULAR_TYPES = Object.freeze({
  given: 'given', masc: 'given', fem: 'given', surname: 'surname', person: 'person', place: 'place',
});

/** The types a row may carry; all but `place` are a person's name to the game. */
export const ROW_TYPES = Object.freeze(['given', 'surname', 'person', 'place']);

const KATAKANA_ROW = /^[ァ-ヺー・]+$/u;
const CAPITAL = /^\p{Lu}/u;

/** The honorifics that, after a katakana name, say a person is meant. */
export const HONORIFICS = Object.freeze(['さん', '先生', '氏', '君', '様', 'ちゃん']);
/** The fewest sentences, and the share of the name's count, that make a place a person. */
export const PERSON_MIN = 2;
export const PERSON_SHARE = 0.2;

const RUN = /[ァ-ヺーヽヾ]+/g;
const STEM = /^[語人]/;
const escape = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every whole katakana run in the corpus and how many sentences hold it. */
export function katakanaRunCounts(sentences) {
  const out = new Map();
  for (const text of sentences) {
    const runs = new Set(text.match(/[ァ-ヺーヽヾ]+/g) || []);
    for (const r of runs) out.set(r, (out.get(r) || 0) + 1);
  }
  return out;
}

/** The row type of a record's `n`, or null when none of its types is one. */
export function popularType(n) {
  for (const t of String(n || '').split(' ')) if (POPULAR_TYPES[t]) return POPULAR_TYPES[t];
  return null;
}

/**
 * Whether a record's name may be a row at all: it has a type the names tier
 * ships for any spelling (given, masc, fem, surname, place). A name typed
 * only `person` (ナポレオン, ハンプティダンプティ) stays out of the game, as
 * it always did; `person` is a row's type only when the sense that spells it
 * says so (ガンジー Gandhi, a place too as Ghanzi) or the corpus does.
 */
export function rowWorthy(n) {
  return String(n || '').split(' ').some((t) => POPULAR_TYPES[t] && t !== 'person');
}

const byCount = (a, b) => b[3] - a[3] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/**
 * How the corpus uses one katakana name, sentence by sentence:
 * `{ n, person, word }`: the sentences measured, those that use it as a
 * person's name (an honorific after it, or a linked English sentence with a
 * title before `spelling`) and those that hold it only as the stem of 語 or
 * 人.
 *
 * @param {string} name       the katakana spelling
 * @param {string} spelling   its original spelling (the record's `o`)
 * @param {Array<[string, string[]]>} sentences  [Japanese text, linked English lines]
 */
export function usageOf(name, spelling, sentences) {
  const title = new RegExp(`(?<![\\p{L}])(?:Mr|Mrs|Ms|Dr)\\.?\\s+${escape(spelling)}(?![\\p{L}\\p{M}\\p{N}])`, 'u');
  let person = 0;
  let word = 0;
  for (const [text, english] of sentences) {
    let honorific = false;
    let alone = false;
    let stem = false;
    for (const m of text.matchAll(RUN)) {
      if (m[0] !== name) continue;
      const after = text.slice(m.index + name.length);
      if (HONORIFICS.some((h) => after.startsWith(h))) honorific = true;
      if (STEM.test(after)) stem = true;
      else alone = true;
    }
    if (honorific || (english || []).some((e) => title.test(e))) person += 1;
    if (stem && !alone) word += 1;
  }
  return { n: sentences.length, person, word };
}

/** A place the corpus uses as a person: PERSON_MIN sentences and PERSON_SHARE of its count. */
export const usedAsPerson = (u, count) => !!u && u.person >= PERSON_MIN && u.person >= PERSON_SHARE * count;

/**
 * A name the corpus holds only as the stem of a language or a people: 語 or
 * 人 after it in every sentence that has it (`n`, the sentences measured).
 * Every one, not a share: アラビア (29 of 36), ノルウェー (4 of 7) and
 * グルジア (1 of 2) are places whose language and people are written so.
 */
export const usedAsWord = (u) => !!u && u.n > 0 && u.word === u.n;

/**
 * The row type a record's name takes, and why: `{ type, by }`, `by` one of
 * 'jmnedict' (the record's own first type), 'corpus' (a place the corpus
 * uses as a person) or 'word' (no name: `type` is null). `usage` is
 * usageOf's answer for it, or null when it was not measured.
 */
export function rowType(rec, count, usage = null) {
  const type = popularType(rec.n);
  if (!type || !rowWorthy(rec.n)) return { type: null, by: 'jmnedict' };
  if (usedAsWord(usage)) return { type: null, by: 'word' };
  if (type === 'place' && usedAsPerson(usage, count)) return { type: 'person', by: 'corpus' };
  return { type, by: 'jmnedict' };
}

/**
 * Every row a name of the tier could make, in the file's order, before the
 * builder keeps the first POPULAR_MAX that the page reads as names: from the
 * names tier's records (spelling -> record) and the corpus counts of
 * katakana runs. `confirmed` is the set of names whose spelling the linked
 * English sentences chose (tools/lib/original.mjs, `by: 'evidence'`): the
 * game asks for the spelling, so a name whose spelling is only JMnedict's
 * first (レイラ Reira, ヨハネ Ioannes, バレ Bale, the slang verb's stem) is
 * left out of it while the Word panel still shows it.
 */
export function popularCandidates(records, counts, confirmed, usage = new Map()) {
  const rows = [];
  for (const [text, rec] of records) {
    if (!rec || !rec.o || rec.r || !confirmed.has(text) || !CAPITAL.test(rec.o)) continue;
    const n = counts.get(text) || 0;
    const { type } = rowType(rec, n, usage.get(text) || null);
    if (!type || n < 1 || !KATAKANA_ROW.test(text)) continue;
    rows.push([text, rec.o, type, n]);
  }
  return rows.sort(byCount);
}

/**
 * What is wrong with a popular.json document, as reasons; empty when
 * nothing is. `names` (spelling -> names-tier record), when given, is the
 * tier the rows must agree with: each row a katakana name the tier ships,
 * with the same original spelling and a type it has. `licence` is the block
 * the names shards carry, which this file must carry too.
 */
export function popularProblems(doc, { names = null, licence = null } = {}) {
  const out = [];
  if (licence && JSON.stringify(doc._licence) !== JSON.stringify(licence)) {
    out.push('_licence is not the block the names shards carry');
  }
  if (!doc._licence || doc._licence.id !== 'jmnedict') out.push('_licence is not the JMnedict block');
  const rows = doc.names;
  if (!Array.isArray(rows) || !rows.length) { out.push('names is not a list of rows'); return out; }
  if (rows.length > POPULAR_MAX) out.push(`${rows.length} rows, more than ${POPULAR_MAX}`);
  const seen = new Set();
  rows.forEach((row, k) => {
    const at = `names[${k}]`;
    if (!Array.isArray(row) || row.length !== 4) { out.push(`${at} is not [katakana, original, type, count]`); return; }
    const [text, o, type, n] = row;
    if (typeof text !== 'string' || !KATAKANA_ROW.test(text)) out.push(`${at}: ${JSON.stringify(text)} is not katakana`);
    if (typeof o !== 'string' || !LATIN_NAME.test(o)) out.push(`${at}: ${JSON.stringify(o)} is not a name in Latin letters`);
    else if (!CAPITAL.test(o)) out.push(`${at}: ${JSON.stringify(o)} does not begin with a capital`);
    if (!ROW_TYPES.includes(type)) out.push(`${at}: type ${JSON.stringify(type)} is not given, surname, person or place`);
    if (!Number.isInteger(n) || n < 1) out.push(`${at}: count ${JSON.stringify(n)} is not a whole number of at least 1`);
    if (seen.has(text)) out.push(`${at}: ${text} is listed twice`);
    seen.add(text);
    if (k > 0 && Array.isArray(rows[k - 1]) && byCount(rows[k - 1], row) > 0) out.push(`${at}: out of order after ${JSON.stringify(rows[k - 1][0])}`);
    if (names && typeof text === 'string') {
      const rec = names.get(text);
      if (!rec) out.push(`${at}: ${text} is no name the names tier ships`);
      else if (rec.o !== o) out.push(`${at}: ${text} is ${JSON.stringify(rec.o)} in the names tier`);
      else if (!rowWorthy(rec.n)) out.push(`${at}: ${text} is typed only ${JSON.stringify(rec.n)} in the names tier`);
      // A `person` may be a `place` of the tier: the corpus moved it
      // (usedAsPerson), which only the builder, holding the corpus, can measure.
      else if (popularType(rec.n) !== type && !(type === 'person' && popularType(rec.n) === 'place')) {
        out.push(`${at}: ${text} is a ${popularType(rec.n)} first in the names tier, not a ${type}`);
      }
    }
  });
  return out;
}
