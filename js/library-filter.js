// Shared by native clients: search the authored library with the same
// Japanese / romaji / English and Spanish rules as the idiom shelves
// (sets.js rowMatches: English in the English lines, Spanish in the Spanish
// ones, accents folded, so perdon finds Perdón, and romaji however it is
// typed), plus the line's said romaji. That is compared loosely
// (search-latin.js looseRomaji: arigato finds arigatoo) only for a query of
// three letters or more once loosened: ii is i then, which every line says.
// No browser globals.
import { rowMatches } from './sets.js';
import { looseRomaji } from './search-latin.js';
import { said, toHira } from './kana.js';

/** Most loosened letters a query needs before it is compared loosely. */
const LOOSE_MIN = 3;

export function filterLibrary(library, query = '') {
  if (!String(query).trim()) return library;
  // A text in one language: a string of {en, es}, or a list of them.
  const inLang = (value, lang) => [(value || {})[lang]].flat().filter((s) => typeof s === 'string');
  const loose = looseRomaji(query);
  const roman = loose.length >= LOOSE_MIN ? looseRomaji : (text) => String(text).toLowerCase().replace(/[^a-z]/g, '');
  const romanQuery = roman(query);
  const match = (ja, kana, en, es) => {
    if (rowMatches([ja || '', kana || '', en, 0, '', es], query)) return true;
    if (!/^[a-z\s'-]+$/i.test(String(query)) || !romanQuery) return false;
    const reading = toHira(kana || ja || '');
    const romaji = said(reading, { finalWa: /^(こんにちは|こんばんは)[\s。！!]*$/u.test(reading) });
    return roman(romaji).includes(romanQuery);
  };
  const phrases = library.phrases.filter((p) => match(p.ja, p.kana,
    [p.en, ...inLang(p.situation, 'en'), ...inLang(p.note, 'en')].filter(Boolean),
    [p.es, ...inLang(p.situation, 'es'), ...inLang(p.note, 'es')].filter(Boolean)));
  const ids = new Set(phrases.map((p) => p.id));
  const categories = library.categories.map((c) => ({ ...c, items: c.items.filter((id) => ids.has(id)) }))
    .filter((c) => c.items.length);
  const dialogues = library.dialogues.filter((d) => match(
    d.lines.map((l) => l.ja).join(' '), d.lines.map((l) => l.kana || l.ja).join(' '),
    [...inLang(d.title, 'en'), ...inLang(d.scene, 'en'), ...inLang(d.translation, 'en')],
    [...inLang(d.title, 'es'), ...inLang(d.scene, 'es'), ...inLang(d.translation, 'es')],
  ));
  return { ...library, phrases, categories, dialogues };
}
