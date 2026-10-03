/**
 * Which KANJIDIC characters Yomu ships, and their readings by type.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * Shared by the two builders because they must agree: build-kanji.mjs ships
 * these characters, and build-dict.mjs prices a kana word by its kanji
 * spelling with the same characters' kun readings (a one-kanji spelling
 * whose first kun is a verb stem is discounted), which the page used to do
 * against the shipped kanji shards.
 */

export const JOYO_GRADES = new Set([1, 2, 3, 4, 5, 6, 8]);

/** Every reading of one type (ja_on, ja_kun), in KANJIDIC order, once each. */
export function readingsOfType(character, type) {
  const out = [];
  for (const group of character.readingMeaning?.groups || []) {
    for (const r of group.readings) if (r.type === type && !out.includes(r.value)) out.push(r.value);
  }
  return out;
}

/**
 * Every joyo kanji and every character with a newspaper frequency rank, in
 * frequency order, most frequent first; unranked last, in KANJIDIC order.
 */
export function selection(kanjidic) {
  const chosen = kanjidic.characters
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => JOYO_GRADES.has(c.misc.grade) || c.misc.frequency != null);
  const rank = ({ c }) => (c.misc.frequency == null ? Infinity : c.misc.frequency);
  chosen.sort((a, b) => rank(a) - rank(b) || a.i - b.i);
  return chosen.map(({ c }) => c);
}

/**
 * Every KANJIDIC character selection() leaves out, in plain JS string order
 * (UTF-16 code units, the order js/dict.js compares in): 7,784 characters no
 * joyo list and no newspaper count includes, kept in contiguous ranges so a
 * rare kanji in a pasted text is found by the range it sorts into, and the
 * index does not have to list them one by one.
 */
export function theRest(kanjidic) {
  const chosen = new Set(selection(kanjidic).map((c) => c.literal));
  return kanjidic.characters
    .filter((c) => !chosen.has(c.literal))
    .sort((a, b) => (a.literal < b.literal ? -1 : a.literal > b.literal ? 1 : 0));
}
