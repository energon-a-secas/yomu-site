// The phrase library's lines a kanji appears in, for a kanji's page: the
// expressions first, then the dialogue lines, each with the source reference
// phrase-book.js follows back to the library (phraseSource). No DOM, and
// nothing authored here: every line, reading and meaning is the library's
// own CC0 text (data/phrases/library.json). This file's comments are CC0 too.
// `lang` picks the library's English or Spanish, and defaults to the current
// language (strings.js useLang).

import { currentLang } from './strings.js';
import { oneKanji } from './kanji-store.js';

/**
 * Up to `limit` lines of `library` that contain the kanji `ch`:
 * [{ ja, kana, meaning, title, source: { kind, id, line? } }]. An expression
 * is titled by its meaning; a dialogue line by its dialogue, with that line's
 * translation as the meaning and its kana when the data has them (else null).
 * A dialogue line that repeats an expression already listed is left out.
 * Anything but exactly one kanji gives [].
 */
export function phrasesWithKanji(library, ch, { limit = 6, lang = currentLang() } = {}) {
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
  if (!oneKanji(ch) || !max || !library) return [];
  const out = [];
  const listed = new Set();
  for (const p of library.phrases || []) {
    if (out.length >= max) return out;
    if (typeof p.ja !== 'string' || !p.ja.includes(ch)) continue;
    const meaning = p[lang] || p.en || null;
    out.push({ ja: p.ja, kana: p.kana || null, meaning, title: meaning || p.ja, source: { kind: 'expression', id: p.id } });
    listed.add(p.ja);
  }
  for (const d of library.dialogues || []) {
    const title = d.title?.[lang] || d.title?.en || d.id;
    const meanings = d.translation?.[lang] || d.translation?.en || [];
    for (const [line, l] of (d.lines || []).entries()) {
      if (out.length >= max) return out;
      if (typeof l.ja !== 'string' || !l.ja.includes(ch) || listed.has(l.ja)) continue;
      out.push({ ja: l.ja, kana: l.kana || null, meaning: meanings[line] || null, title, source: { kind: 'conversation', id: d.id, line } });
      listed.add(l.ja);
    }
  }
  return out;
}
