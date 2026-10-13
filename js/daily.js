// The kanji of the day, for the empty page. No DOM.
//
// data/kpage/daily.json (tools/build-kanji-page.mjs) holds 1,000 kanji in
// frequency order. A day picks one by a fixed permutation of the list, so
// every visitor sees the same kanji on the same day, and the list is gone
// through once before any kanji comes round again.

/** A step coprime with the list's length, so day after day visits every row. */
const STEP = 7919;

/** Days since 1970-01-01 for a YYYY-MM-DD day, or 0 for anything else. */
export function dayNumber(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) : 0;
}

/** The row a day shows, out of `n`. */
export function dailyIndex(day, n) {
  if (!(n > 0)) return -1;
  return ((dayNumber(day) * STEP) % n + n) % n;
}

/** The day's row as { ch, meaning, word, reading, gloss }, or null. */
export function dailyOf(doc, day) {
  const rows = doc && Array.isArray(doc.rows) ? doc.rows : [];
  const r = rows[dailyIndex(day, rows.length)];
  if (!r) return null;
  const [ch, meaning, word, reading, gloss] = r;
  return Object.freeze({ ch, meaning, word, reading, gloss });
}
