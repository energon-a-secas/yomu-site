// History's text helpers: what makes two texts the same text, the key a
// text is kept under, the cap on what is kept, and the sentence a kanji was
// last seen in. Pure, with no imports, so the History store
// (history-store.js), which re-exports all of it, stays under the 500-line
// rule.

/** The embed contract's cap on a text, applied to what is kept. */
export const MAX_TEXT = 2000;

// ── Keys ──────────────────────────────────────────────────────────────────

/** NFKC, every run of whitespace one space, trimmed: what makes two texts the same text. */
export function normalizeText(text) {
  return String(text ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

/**
 * cyrb53, by bryc (github.com/bryc/code, public domain): a fast 53-bit hash
 * with good spread. Not a cryptographic hash and not meant as one; a key
 * only has to tell a learner's few hundred texts apart.
 */
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The key a text is kept under. The same text, however it is spaced, has the same key. */
export function textKey(text) {
  return cyrb53(normalizeText(text)).toString(36);
}

/** At most MAX_TEXT UTF-16 units, never cutting a character in two. */
export function clipText(text) {
  const s = String(text ?? '');
  if (s.length <= MAX_TEXT) return s;
  const cut = s.charCodeAt(MAX_TEXT - 1);
  return s.slice(0, cut >= 0xd800 && cut <= 0xdbff ? MAX_TEXT - 1 : MAX_TEXT);
}

/** The longest last-seen sentence, kanji and ellipses included. */
export const MAX_AROUND = 60;

/**
 * The sentence `ch` was last met in, inside `text`: the sentence holding its
 * last occurrence (sentences end after 。！？!? and at a line break), trimmed,
 * then clipped to MAX_AROUND characters around the kanji with an ellipsis on
 * each side that was cut. Returns { before, ch, after }, so the page can draw
 * the kanji in a <mark>, or null when the text does not hold it.
 */
export function sentenceAround(text, ch) {
  const all = [...String(text ?? '')];
  const at = all.lastIndexOf(ch);
  if (!ch || at < 0) return null;
  const { before, after } = around(all, at, 1);
  return { before, ch, after };
}

/**
 * The sentence holding a word: `surface` at UTF-16 offset `start` of `text`
 * (an analysis token's start and surface, over the analyzed text), or its
 * first occurrence when the offset does not hold it. Found and clipped as
 * sentenceAround does for a kanji, the word always whole: { before, word,
 * after }, or null when the text does not hold the word.
 */
export function sentenceAt(text, start, surface) {
  const s = String(text ?? '');
  const w = String(surface ?? '');
  if (!w) return null;
  const at = Number.isInteger(start) && start >= 0 && s.startsWith(w, start) ? start : s.indexOf(w);
  if (at < 0) return null;
  const { before, after } = around([...s], [...s.slice(0, at)].length, [...w].length);
  return { before, word: w, after };
}

// The sentence around code points [at, at + len) of `all`: from the last
// sentence end or line break before it to the next after it, trimmed, then
// clipped to MAX_AROUND characters with the span whole and an ellipsis on
// each side that was cut.
function around(all, at, len) {
  const end = (c) => '。！？!?'.includes(c);
  const brk = (c) => c === '\n' || c === '\r';
  let from = at;
  while (from > 0 && !end(all[from - 1]) && !brk(all[from - 1])) from -= 1;
  let to = at + len;
  while (to < all.length && !brk(all[to]) && !end(all[to - 1])) to += 1;
  let left = all.slice(from, at);
  let right = all.slice(at + len, to);
  while (left.length && /\s/u.test(left[0])) left.shift();
  while (right.length && /\s/u.test(right[right.length - 1])) right.pop();
  const room = Math.max(0, MAX_AROUND - len);
  if (left.length + right.length > room) {
    let keepLeft = Math.min(left.length, Math.floor(room / 2));
    const keepRight = Math.min(right.length, room - keepLeft);
    keepLeft = Math.min(left.length, room - keepRight);
    const cutLeft = keepLeft < left.length;
    const cutRight = keepRight < right.length;
    left = left.slice(left.length - keepLeft);
    right = right.slice(0, keepRight);
    if (cutLeft) left = ['…', ...left.slice(1)];
    if (cutRight) right = [...right.slice(0, -1), '…'];
  }
  return { before: left.join(''), after: right.join('') };
}
