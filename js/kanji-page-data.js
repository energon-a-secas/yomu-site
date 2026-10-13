// The kanji page's data, loaded only when a kanji page or a kana chart asks:
// how a character is drawn (data/strokes/, KanjiVG) and, for a kanji, the
// words it is met in and the kanji it shares parts with (data/kpage/). Both
// are range shards found the way the dictionary's are (range-store.js), so
// one character costs one shard of each. No DOM.
//
// Written by tools/build-kanji-page.mjs; its header says what each field
// holds. A character with no entry reads as null, never as an error: KanjiVG
// draws 6,702 characters and KANJIDIC lists 10,384.

import { createRangeStore } from './range-store.js';

/**
 * @param {{ fetchJson: (path: string) => Promise<any>, base?: string }} o
 *   `base` is the data/ directory; a published src starts with "data/".
 */
export function createPageData({ fetchJson, base = 'data/' }) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const resolve = (src) => (src.startsWith('data/') ? dir + src.slice(5) : src);
  const strokes = createRangeStore({
    fetchJson, resolve, indexPath: `${dir}strokes/index.json`, what: 'The stroke index',
  });
  const pages = createRangeStore({
    fetchJson, resolve, indexPath: `${dir}kpage/index.json`, what: 'The kanji page index',
  });

  /** The stroke paths of each character, in drawing order: Map ch -> string[]. */
  async function strokesOf(chars) {
    const list = [...new Set(chars)];
    await strokes.need(list);
    return new Map(list.map((ch) => [ch, strokes.get(ch) || null]));
  }

  /** One kanji's page: { words, parts, used, variants }, with empty lists where the data has none. */
  async function pageOf(ch) {
    await pages.need([ch]);
    const e = pages.get(ch) || {};
    return Object.freeze({
      words: (e.w || []).map(([written, reading, gloss]) => Object.freeze({ written, reading, gloss })),
      parts: Object.freeze(Object.fromEntries(Object.entries(e.p || {}).map(([part, list]) => [part, [...list]]))),
      used: [...(e.u || '')],
      variants: [...(e.v || '')],
    });
  }

  return Object.freeze({ strokesOf, pageOf });
}
