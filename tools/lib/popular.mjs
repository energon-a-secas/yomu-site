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
 * spaces, hyphens, apostrophes), one type (`given` for JMnedict's given, masc
 * and fem, `surname`, `place`: the first of the record's types that is one,
 * since they are listed most evidenced first), and how many Tatoeba sentences
 * hold the name as a whole katakana run, the count the names tier is attested
 * by. Highest count first, then the spelling in plain JS string order; only
 * names the corpus has at least once, at most POPULAR_MAX rows.
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

/** A name's JMnedict type as one of the three a row may carry. */
export const POPULAR_TYPES = Object.freeze({
  given: 'given', masc: 'given', fem: 'given', surname: 'surname', place: 'place',
});

const KATAKANA_ROW = /^[ァ-ヺー・]+$/u;

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

const byCount = (a, b) => b[3] - a[3] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/**
 * Every row a name of the tier could make, in the file's order, before the
 * builder keeps the first POPULAR_MAX that the page reads as names: from the
 * names tier's records (spelling -> record) and the corpus counts of
 * katakana runs.
 */
export function popularCandidates(records, counts) {
  const rows = [];
  for (const [text, rec] of records) {
    if (!rec || !rec.o || rec.r) continue;
    const type = popularType(rec.n);
    const n = counts.get(text) || 0;
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
    if (!['given', 'surname', 'place'].includes(type)) out.push(`${at}: type ${JSON.stringify(type)} is not given, surname or place`);
    if (!Number.isInteger(n) || n < 1) out.push(`${at}: count ${JSON.stringify(n)} is not a whole number of at least 1`);
    if (seen.has(text)) out.push(`${at}: ${text} is listed twice`);
    seen.add(text);
    if (k > 0 && Array.isArray(rows[k - 1]) && byCount(rows[k - 1], row) > 0) out.push(`${at}: out of order after ${JSON.stringify(rows[k - 1][0])}`);
    if (names && typeof text === 'string') {
      const rec = names.get(text);
      if (!rec) out.push(`${at}: ${text} is no name the names tier ships`);
      else if (rec.o !== o) out.push(`${at}: ${text} is ${JSON.stringify(rec.o)} in the names tier`);
      else if (popularType(rec.n) !== type) out.push(`${at}: ${text} is a ${popularType(rec.n)} first in the names tier, not a ${type}`);
    }
  });
  return out;
}
