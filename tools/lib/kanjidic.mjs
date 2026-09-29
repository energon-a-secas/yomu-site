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
