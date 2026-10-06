// The dictionary words a reading's kanji were met in, as [written, reading]
// pairs: what My kanji keeps per kanji (kanji-store.js `words`), and never
// anything longer. Moved out of kanji-store.js so it stays under the
// 500-line rule; kanji-store.js re-exports both functions. No DOM.

import { isKanji, hasKanji, toHira } from './kana.js';

/** A word or a reading longer than this is not a dictionary word. */
const MAX_FIELD = 24;

/** A [written, reading] pair as the store keeps it, or null. */
export function cleanPair(p) {
  if (!Array.isArray(p) || p.length !== 2) return null;
  const [w, r] = p;
  if (typeof w !== 'string' || typeof r !== 'string') return null;
  if (!w || !r || [...w].length > MAX_FIELD || [...r].length > MAX_FIELD) return null;
  if (!hasKanji(w)) return null;
  return [w, r];
}

/**
 * The dictionary word a token is, as [written, reading], or null. An
 * inflected token is stored as its dictionary form: 降っています was met as
 * 降る, read ふる. That reading is the stem's furigana plus the base's own
 * kana, unless the record's readings say the stem changed (来ました is 来る,
 * くる, not きる). A token with no dictionary record (a name, a number read
 * by rule, a guess) is not a dictionary word, and is left out.
 */
export function dictionaryWord(token) {
  if (!token || !token.entry || token.confidence === 'guess') return null;
  const surface = String(token.surface || '');
  const reading = String(token.reading || '');
  if (!hasKanji(surface) || !reading) return null;
  const base = String(token.base || '');
  if (token.kind !== 'inflected' || !base || base === surface) return cleanPair([surface, reading]);

  const s = [...surface];
  const b = [...base];
  let i = 0;
  while (i < s.length && i < b.length && s[i] === b[i]) i += 1;
  const tail = b.slice(i).join('');
  if (!i || hasKanji(tail)) return null;
  let stem = '';
  let at = 0;
  for (const p of Array.isArray(token.furigana) && token.furigana.length ? token.furigana : [{ text: surface }]) {
    if (at >= i) break;
    const chars = [...String(p.text || '')];
    if (at + chars.length <= i) stem += p.ruby || toHira(p.text);
    else if (p.ruby) return null;      // a ruby cannot be cut in two
    else stem += toHira(chars.slice(0, i - at).join(''));
    at += chars.length;
  }
  let read = stem + toHira(tail);
  const listed = Array.isArray(token.entry.r) ? token.entry.r.filter((x) => typeof x === 'string') : [];
  const fits = listed.filter((x) => x.endsWith(toHira(tail)) && x.length > tail.length);
  if (fits.length === 1 && !listed.includes(read)) read = fits[0];
  return cleanPair([base, read]);
}

/** kanji -> the dictionary words of these tokens it appears in, in text order. */
export function wordsByKanji(tokens) {
  const out = new Map();
  for (const token of tokens || []) {
    const pair = dictionaryWord(token);
    if (!pair) continue;
    for (const ch of new Set([...pair[0]].filter(isKanji))) {
      const list = out.get(ch) || [];
      if (!list.some(([w, r]) => w === pair[0] && r === pair[1])) list.push(pair);
      out.set(ch, list);
    }
  }
  return out;
}
