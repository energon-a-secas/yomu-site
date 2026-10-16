/**
 * Jonathan Waller's JLPT kanji lists: reading his archived pages, and the
 * rules the yomu-jlpt/1 document keeps (tools/build-jlpt.mjs writes it,
 * tools/check-data.mjs holds it to them, js/levels.js reads it).
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * Only which kanji each level holds is kept, in the order his page lists
 * them. His pages also give readings and meanings; the page has its own from
 * KANJIDIC, so none of his is copied.
 */
import { JLPT_FORMAT, JLPT_LEVELS, JLPT_SIZES } from '../../js/levels.js';

export { JLPT_FORMAT, JLPT_LEVELS, JLPT_SIZES };

/** The kanji of one archived list page: the first cell of each row of the table headed Kanji. */
export function wallerKanji(html) {
  const at = html.indexOf('<th>Kanji</th>');
  if (at < 0) throw new Error('no table headed Kanji');
  return [...html.slice(at).matchAll(/<tr><td><a [^>]*>([^<]+)<\/a><\/td>/g)].map((m) => m[1].trim());
}

/** The yomu-jlpt/1 document: `levels` maps n5 to n1 to its kanji, as one string each. */
export function jlptDoc(levels, licence) {
  const out = {};
  for (const id of JLPT_LEVELS) out[id] = (levels[id] || []).join('');
  const count = JLPT_LEVELS.reduce((n, id) => n + [...out[id]].length, 0);
  return { _licence: licence, format: JLPT_FORMAT, count, levels: out };
}

/**
 * What is wrong with a yomu-jlpt/1 document, as sentences: the levels and
 * their sizes, a character that is not one kanji, a kanji in two levels, the
 * count, and (with `known`, the characters the kanji shards hold) a kanji
 * the page could not show.
 */
export function jlptProblems(doc, known = null) {
  const out = [];
  const levels = doc && doc.levels;
  if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return ['levels is not an object'];
  if (Object.keys(levels).join() !== JLPT_LEVELS.join()) out.push(`levels are ${JSON.stringify(Object.keys(levels))}, not ${JSON.stringify(JLPT_LEVELS)}`);
  const seen = new Map();
  let total = 0;
  for (const id of JLPT_LEVELS) {
    if (typeof levels[id] !== 'string') { out.push(`${id} is not a string`); continue; }
    const chars = [...levels[id]];
    if (chars.length !== JLPT_SIZES[id]) out.push(`${id} holds ${chars.length} kanji, not ${JLPT_SIZES[id]}`);
    for (const ch of chars) {
      if (!/^\p{Script=Han}$/u.test(ch)) out.push(`${id}: ${ch} is not a kanji`);
      if (seen.has(ch)) out.push(`${ch} is in ${seen.get(ch)} and ${id}`);
      else seen.set(ch, id);
      if (known && !known.has(ch)) out.push(`${id}: ${ch} is in no kanji shard`);
    }
    total += chars.length;
  }
  if (doc.count !== total) out.push(`count is ${doc.count}, and the levels hold ${total}`);
  return out;
}
