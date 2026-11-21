// The filters over what a learner keeps: a saved kanji, a saved word and a
// text (History, a saved reading). One rule for each, shared by the page
// (render-mykanji.js, render-history.js) and the iOS app's bridge, which
// filters My collection with them. No DOM.
//
// Kana is folded to hiragana, romaji is read as kana however it is typed
// (search-latin.js romajiKanas: spaces, a long vowel left out, a particle
// written as said, so watashiwa finds わたしは and gakko 学校's がっこう), and
// a meaning matches with its accents folded on both sides (accion finds
// acción), in English and in the Spanish a caller passes.

import { toHira } from './kana.js';
import { foldLatin, romajiKanas } from './search-latin.js';
import { normalizeText } from './history-store.js';

/** Meanings as the filter reads them: strings only, accents folded, ñ as n. */
const foldedMeanings = (list) => list.filter((m) => typeof m === 'string' && m).map((m) => foldLatin(m, { enye: false }));

/**
 * Whether any string of `hay` holds the query: as typed (lower case), with
 * its accents folded, as hiragana, or as any kana its romaji reads as.
 */
function holds(hay, raw) {
  const q = raw.toLowerCase();
  const kana = toHira(q);
  const folded = foldLatin(q, { enye: false });
  const kanas = romajiKanas(raw);
  return hay.some((x) => x.includes(q) || x.includes(folded) || (kana && x.includes(kana)) || kanas.some((k) => x.includes(k)));
}

/**
 * Does a saved kanji match the filter: its character, a meaning (and a
 * Spanish one, `info.es.m`, where the info carries it), an on or kun
 * reading, or a word it was met in, so "ten", "てん" and "テン" all find 天.
 */
export function kanjiMatches(ch, info, seen, query) {
  const raw = String(query || '').trim();
  if (!raw) return true;
  const meanings = info ? [...(Array.isArray(info.m) ? info.m : []), ...(info.es && Array.isArray(info.es.m) ? info.es.m : [])] : [];
  const hay = [
    ch,
    ...foldedMeanings(meanings),
    ...(info ? [...(info.on || []), ...(info.kun || [])].map((r) => toHira(String(r)).replace(/[.-]/g, '')) : []),
    ...(seen && Array.isArray(seen.words) ? seen.words.flat() : []),
  ];
  return holds(hay, raw);
}

/**
 * Does a text match the filter: the words in it, so "ame", "あめ" and "アメ"
 * all find 雨 written as あめ. A text is what was pasted, with no reading
 * kept, so romaji finds its kana and never its kanji.
 */
export function textMatches(text, query) {
  const q = normalizeText(query).toLowerCase();
  if (!q) return true;
  const hay = toHira(normalizeText(text).toLowerCase());
  const kana = toHira(q);
  return hay.includes(q) || hay.includes(kana) || romajiKanas(q).some((k) => hay.includes(k));
}

/**
 * Does a saved word (word-store.js: `w`, `r`, `g` and the sentence it was
 * saved from, `from`) match the filter: its spelling, its reading, its
 * meaning or the Spanish of it a caller passes (`es`, a list), or its
 * sentence, read as textMatches reads a text. ame and あめ find 雨, and
 * lluvia finds it where `es` says so.
 */
export function wordMatches(word, query, es = null) {
  const raw = String(query || '').trim();
  if (!raw) return true;
  if (!word || typeof word !== 'object') return false;
  const hay = [
    String(word.w || ''),
    toHira(String(word.r || '')),
    ...foldedMeanings([word.g, ...(Array.isArray(es) ? es : [])]),
  ];
  if (holds(hay, raw)) return true;
  const from = word.from;
  return !!from && typeof from === 'object'
    && textMatches(`${from.before || ''}${from.word || ''}${from.after || ''}`, raw);
}
