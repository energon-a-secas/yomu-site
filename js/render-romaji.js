// Romaji beside Japanese, both lines at once: the said line and the spelled
// line, each a span the page shows or hides by html[data-romaji] (said,
// spelled or off, the reader's Romaji switch, set in render-chrome.js). So a
// switch repaints nothing, and every screen follows the one choice: the
// kanji page, My kanji, Search, the Idioms shelves.

import { h } from './utils.js';
import { said, spelled, readingRomaji } from './kana.js';

/** Two spans, the said line and the spelled line, with `extra` classes on both. */
export function romajiPair(saidText, spelledText, extra = '') {
  const cls = (which) => `rom rom--${which}${extra ? ` ${extra}` : ''}`;
  return [
    h('span', { class: cls('said'), lang: 'ja-Latn' }, saidText),
    h('span', { class: cls('spelled'), lang: 'ja-Latn' }, spelledText),
  ];
}

/** A word's romaji from its kana reading; a phrase may pass the reader's own said line. */
export function wordRomaji(reading, { saidLine = '', extra = '' } = {}) {
  return romajiPair(saidLine || said(reading), spelled(reading), extra);
}

/** A KANJIDIC reading's romaji (ひと.つ, -び, ジッ): kana.js readingRomaji. */
export function readingRomajiPair(reading, extra = '') {
  return romajiPair(readingRomaji(reading, 'said'), readingRomaji(reading, 'spelled'), extra);
}
