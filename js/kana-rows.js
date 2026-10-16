// Which rows of the kana chart a text uses, and whether a learner who knows
// some rows can read it (the phrase library's "Only phrases I can read",
// events-kana-rows.js). No DOM.
//
// A kana belongs to its row of the gojūon chart, in either script: a voiced
// or half-voiced kana to its plain row (が and ぱ to か and は), a small kana
// to its big one's (ゃ to や, ぁ to あ), っ to た, and ん, with を, to わ.
// The long-vowel bar belongs to none: it repeats the vowel before it.

import { toHira } from './kana.js';

/** The rows, in the chart's order, each named by its first kana. */
export const KANA_ROWS = Object.freeze(['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ']);

const ROW_OF = new Map();
[
  'あいうえおぁぃぅぇぉゔ', 'かきくけこがぎぐげごゕゖ', 'さしすせそざじずぜぞ', 'たちつてとだぢづでどっ', 'なにぬねの',
  'はひふへほばびぶべぼぱぴぷぺぽ', 'まみむめも', 'やゆよゃゅょ', 'らりるれろ', 'わをんゎゐゑ',
].forEach((s, i) => { for (const ch of s) ROW_OF.set(ch, KANA_ROWS[i]); });

/** The row of one kana, in either script, or null for anything else. */
export function rowOf(ch) {
  return ROW_OF.get(toHira(ch)) || null;
}

/** The rows a text's kana use, in the chart's order. */
export function rowsOf(text) {
  const used = new Set();
  for (const ch of String(text || '')) { const r = rowOf(ch); if (r) used.add(r); }
  return KANA_ROWS.filter((r) => used.has(r));
}

/** The rows a text needs that `known` lacks; empty when it can be read. */
export function missingRows(text, known) {
  const have = new Set(known || []);
  return rowsOf(text).filter((r) => !have.has(r));
}

/** A phrase can be read when its kana (or its text, when that is all kana) needs no row not known. */
export function canRead(phrase, known) {
  const kana = (phrase && (phrase.kana || phrase.ja)) || '';
  return !!kana && missingRows(kana, known).length === 0;
}
