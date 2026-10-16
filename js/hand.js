// The handwritten form: Klee One, a textbook hand (fonts/klee/,
// tools/build-font.mjs), for the kanji page's large character and the kana
// chart. Print and handwriting differ (さ, き, 令), and the hand is the one a
// learner copies. Nothing loads until the switch is first turned on: then the
// index, whose slices are registered with the FontFace API, and the browser
// fetches a slice (about 55 KB) only when it draws one of its characters.
// The font is served by Yomu itself, so no request leaves for a font host.
// No DOM until loadHand() runs.

import { plainJson } from './other-forms.js';

export const HAND_FORMAT = 'yomu-font/1';
export const HAND_FAMILY = 'Yomu Klee One';
export const HAND_SRC = 'fonts/klee/index.json';

let loading = null;
let covered = null;

/**
 * `chars` as a CSS unicode-range: each run of consecutive code points as
 * one range (U+3041-3096), the rest one by one.
 */
export function rangeOf(chars) {
  const cps = [...new Set([...chars].map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cps.length; i += 1) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j += 1;
    const hex = (n) => n.toString(16).toUpperCase();
    out.push(j > i ? `U+${hex(cps[i])}-${hex(cps[j])}` : `U+${hex(cps[i])}`);
    i = j;
  }
  return out.join(',');
}

/**
 * Fetch the index once and register each slice as a face of HAND_FAMILY
 * (none is downloaded yet). Resolves to the set of characters the hand has;
 * a failure is forgotten, so a retry fetches again.
 */
export function loadHand(fetcher = plainJson, fonts = typeof document !== 'undefined' ? document.fonts : null) {
  if (!loading) {
    loading = Promise.resolve().then(() => fetcher(HAND_SRC)).then((doc) => {
      if (!doc || doc.format !== HAND_FORMAT || !Array.isArray(doc.slices)) throw new Error(`${HAND_SRC}: not ${HAND_FORMAT}`);
      if (fonts && typeof FontFace === 'function') {
        for (const s of doc.slices) {
          fonts.add(new FontFace(HAND_FAMILY, `url(${s.src})`, { unicodeRange: rangeOf(s.chars), display: 'swap' }));
        }
      }
      covered = new Set(doc.slices.flatMap((s) => [...s.chars]));
      return covered;
    }).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

/** Whether the hand has `ch`: null until loadHand() resolved. */
export function hasHand(ch) {
  return covered ? covered.has(ch) : null;
}
