/**
 * The Spanish meanings' rules, shared by the builder (tools/build-spanish.mjs)
 * and the checker (tools/lib/spanish-check.mjs): which Spanish a JMdict entry
 * or a KANJIDIC character shows, the formats of data/es/, and the digest that
 * ties a Spanish file to the English file it mirrors.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 */
import { createHash } from 'node:crypto';
import { EM_DASH } from './licence.mjs';
import { trimGloss } from './records.mjs';

export { esSrc } from '../../js/es-files.js';

export const ES_DICT = 'yomu-dict-es/1';
export const ES_KANJI = 'yomu-kanji-es/1';
export const ES_KPAGE = 'yomu-kpage-es/1';
export const ES_DAILY = 'yomu-daily-es/1';
export const ES_FORMATS = [ES_DICT, ES_KANJI, ES_KPAGE, ES_DAILY];

/** At most this many Spanish meanings, as the English shows three. */
export const MAX_ES = 3;
/** A meaning's length, as records.mjs cuts an English gloss. */
export const MAX_ES_CHARS = 60;
/** At most this many of a sense's glosses in one meaning: 学生 "estudiante, alumno". */
const PER_SENSE = 2;

/** How many parentheses a text leaves open; negative when one closes before it opens. */
function depth(text) {
  let d = 0;
  for (const ch of text) {
    if (ch === '(') d += 1;
    else if (ch === ')' && --d < 0) return -1;
  }
  return d;
}

/**
 * A Spanish gloss worth showing: not empty, not a fragment such as "etc." or
 * ")", and every parenthesis it opens closed.
 */
export function usableGloss(text) {
  const s = String(text || '').trim();
  if (!s || s.includes(EM_DASH) || /^[\s.,;:()¡!¿?-]*$/.test(s) || /^\(?etc\.?\)?$/i.test(s)) return false;
  return depth(s) === 0;
}

/**
 * One Spanish sense's glosses as JMdict's Spanish meant them. Its glosses
 * reach jmdict-simplified split at their commas, parentheses or not, so
 * "(eng: grey, gray) gris" arrives as "(eng: grey" and "gray) gris": the
 * pieces are joined again until the parentheses close, and an "(eng: ...)"
 * note on the English a gloss was translated from is dropped (グレー is
 * "gris"). A parenthesis the source never closes is a stray one when it
 * opens a gloss, and is dropped ("(por eso" is だから's "por eso"), and is
 * cut with what follows it later in one ("submarino (eng: submarine"); a
 * part-of-speech code that leaked in ("n) hemisferio") goes too. What is
 * left that is no meaning ("etc.", ")") is left out.
 */
function senseGlosses(sense) {
  const out = [];
  const take = (text) => {
    const s = text.replace(/\(eng:[^()]*\)/g, ' ').replace(/^[a-z]{1,4}\)\s*/, '').replace(/\s+/g, ' ').trim();
    if (usableGloss(s) && !/^eng:/.test(s) && !out.includes(s)) out.push(s);
  };
  let chain = [];
  for (const g of sense.gloss || []) {
    if (g.lang !== 'spa') continue;
    chain.push(String(g.text).trim());
    if (depth(chain.join(', ')) > 0) continue;
    take(chain.join(', '));
    chain = [];
  }
  for (const piece of chain) take(piece.startsWith('(') ? piece.slice(1) : piece.replace(/\s*\([^()]*$/, ''));
  return out;
}

/**
 * A JMdict entry's Spanish meanings, one per Spanish sense as the English
 * shows one per sense: the sense's first two glosses, joined with a comma
 * when both fit in MAX_ES_CHARS (the first is cut as an English gloss is
 * cut), for the first MAX_ES senses that say something new. JMdict keeps its
 * Spanish in senses of its own, not aligned with the English ones, so
 * nothing here pairs a Spanish meaning with an English one.
 */
export function spanishGlosses(entry) {
  const out = [];
  for (const sense of (entry && entry.sense) || []) {
    const glosses = senseGlosses(sense);
    if (!glosses.length) continue;
    let item = glosses[0];
    for (const g of glosses.slice(1, PER_SENSE)) {
      const next = `${item}, ${g}`;
      if (next.length <= MAX_ES_CHARS) item = next;
    }
    item = trimGloss(item);
    if (!out.includes(item)) out.push(item);
    if (out.length === MAX_ES) break;
  }
  return out;
}

/** A KANJIDIC character's Spanish meanings, the first three in its order, as `m` keeps three English ones. */
export function spanishMeanings(character) {
  const out = [];
  for (const group of character?.readingMeaning?.groups || []) {
    for (const m of group.meanings || []) {
      const v = String(m.value || '').trim();
      if (m.lang === 'es' && v && !v.includes(EM_DASH) && !out.includes(v)) out.push(v);
    }
  }
  return out.slice(0, MAX_ES);
}

/**
 * What a Spanish file records of the English file it mirrors: the SHA-256 of
 * its `entries` (`rows` for the kanji of the day) as JSON.stringify writes
 * them. A rebuild of the English data that moves a record moves the digest,
 * and the checker then fails the Spanish file until it is built again, so a
 * Spanish meaning can never sit beside the wrong record.
 */
export function bodyDigest(doc) {
  const body = doc && (doc.entries !== undefined ? doc.entries : doc.rows);
  return createHash('sha256').update(JSON.stringify(body === undefined ? null : body)).digest('hex');
}
