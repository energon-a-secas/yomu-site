/**
 * The jōyō list the My kanji collection is shelved by: data/kanji/joyo.json,
 * format yomu-joyo/1.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * One function builds the document, so its two callers cannot disagree:
 * tools/build-kanji.mjs writes it at the end of a full build, from the
 * KANJIDIC entries it has just made, and tools/build-joyo.mjs writes it from
 * the committed kanji shards, which carry the same `g` and `f`. Given the
 * same entries both write the same bytes, and tools/check-data.mjs rebuilds
 * it in memory from the shards to prove the committed file is that output.
 *
 *   { _licence, format: 'yomu-joyo/1', count: 2136,
 *     grades: { '1': '日一人...', ..., '6': '...', '8': '...' } }
 *
 * A grade is one string of kanji: KANJIDIC's school grades 1 to 6, and 8 for
 * the rest of the jōyō list, taught in secondary school. Within a grade the
 * kanji run by KANJIDIC's newspaper frequency rank `f`, most frequent first,
 * and the few with no rank come last, by code point, so the page's "look out
 * for" tiles are the kanji a learner is likeliest to meet next.
 */

export const JOYO_FORMAT = 'yomu-joyo/1';

/** The grades, in shelf order. 7 is not a KANJIDIC grade; 9 and 10 are jinmeiyō, not jōyō. */
export const JOYO_GRADES = Object.freeze([1, 2, 3, 4, 5, 6, 8]);

/** How many kanji each grade holds in the 2010 list, as KANJIDIC files them. */
export const JOYO_SIZES = Object.freeze({ 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191, 8: 1110 });

export const JOYO_TOTAL = 2136;

const byRank = ([a, ea], [b, eb]) => {
  const fa = Number.isInteger(ea.f) ? ea.f : Infinity;
  const fb = Number.isInteger(eb.f) ? eb.f : Infinity;
  if (fa !== fb) return fa - fb;
  return a.codePointAt(0) - b.codePointAt(0);
};

/**
 * The yomu-joyo/1 document. `entries` is a Map or a plain object of
 * character to kanji entry (`g` grade, `f` frequency rank); `licence` is the
 * block the kanji shards carry, copied as it is.
 */
export function joyoDoc(entries, licence) {
  const list = entries instanceof Map ? [...entries] : Object.entries(entries || {});
  const grades = {};
  let count = 0;
  for (const grade of JOYO_GRADES) {
    const chars = list.filter(([, e]) => e && e.g === grade).sort(byRank).map(([ch]) => ch);
    grades[String(grade)] = chars.join('');
    count += chars.length;
  }
  return { _licence: licence, format: JOYO_FORMAT, count, grades };
}

/** The size of each grade in a document, by code point, as { '1': 80, ... }. */
export function gradeSizes(doc) {
  const out = {};
  for (const [grade, chars] of Object.entries((doc && doc.grades) || {})) out[grade] = [...String(chars)].length;
  return out;
}
