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
import { createEsFiles } from './es-files.js';

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

  // The Spanish of the words (data/es/kpage/, docs/ANALYZER.md "Spanish
  // meanings"), fetched only by wordsEs.
  const es = createEsFiles({ fetchJson, resolve });

  /**
   * The Spanish of one kanji page's words, in pageOf's order: a meaning, or
   * 0 where JMdict has none (a shorter list leaves the rest without).
   * Empty when none has any, or when the file cannot be loaded.
   */
  async function wordsEs(ch) {
    await pages.need([ch]);
    const src = pages.srcOf(ch);
    const entries = src ? await es.load(src) : null;
    const list = entries && Object.prototype.hasOwnProperty.call(entries, ch) ? entries[ch] : null;
    return Array.isArray(list) ? list : [];
  }

  return Object.freeze({ strokesOf, pageOf, wordsEs });
}
