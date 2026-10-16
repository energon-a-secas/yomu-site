// What tells two look-alikes apart, from what the data says of each: their
// KanjiVG parts (data/kanji `parts`) and KANJIDIC's stroke counts (`s`). No
// DOM. The kanji page's "Looks like" draws one line per look-alike from it
// (render-kanji-page.js), and the look-alikes are Play's
// (data/play/lookalikes.json, tools/lib/lookalikes.mjs).
//
// The order of the tests is the order a learner would look: one inside the
// other (白 has 日 in it), then a part swapped for another (持 has 扌 where
// 待 has 彳, both ending in 寺), then the stroke count (目 has 5, 日 has 4).
// Two kanji with the same parts and strokes (未 末, 人 入) are said to differ
// in how the strokes run, which is all the data can say: KanjiVG's parts do
// not record that 未's top line is the shorter, or which stroke of 入 leads.

/** A kanji's parts that are single characters: KanjiVG also names some by a code or a layout. */
function partsOf(ch, info) {
  return info && Array.isArray(info.parts) ? info.parts.filter((p) => p && p !== ch && [...p].length === 1) : [];
}

/**
 * How `other` differs from `ch`.
 * @param {string} ch      the page's kanji
 * @param {string} other   one of its look-alikes
 * @param {(c: string) => object|undefined} infoOf  kanjiInfo() of a kanji
 * @returns {{ kind: string, shared?: string[], theirs?: string[], mine?: string[], n?: number, m?: number }}
 *   kind: 'has' (other holds ch), 'in' (ch holds other), 'swap' (parts in
 *   common, one differs), 'strokes' (a different stroke count), 'same' (the
 *   same parts and strokes), or 'look' (nothing the data can name).
 */
export function apartOf(ch, other, infoOf) {
  const a = infoOf(ch);
  const b = infoOf(other);
  const mine = partsOf(ch, a);
  const theirs = partsOf(other, b);
  if (theirs.includes(ch)) return { kind: 'has' };
  if (mine.includes(other)) return { kind: 'in' };
  const shared = mine.filter((p) => theirs.includes(p));
  const onlyTheirs = theirs.filter((p) => !mine.includes(p));
  const onlyMine = mine.filter((p) => !theirs.includes(p));
  if (shared.length && onlyTheirs.length && onlyMine.length) {
    return { kind: 'swap', shared, theirs: onlyTheirs, mine: onlyMine };
  }
  const n = b && Number.isInteger(b.s) ? b.s : null;
  const m = a && Number.isInteger(a.s) ? a.s : null;
  if (n !== null && m !== null && n !== m) return { kind: 'strokes', n, m };
  if (n !== null && m !== null) return { kind: 'same' };
  return { kind: 'look' };
}
