// Shared by native clients: search the authored library with the same
// Japanese / romaji / English rules as the idiom shelves. No browser globals.
import { rowMatches } from './sets.js';
import { said, toHira } from './kana.js';

export function filterLibrary(library, query = '') {
  if (!String(query).trim()) return library;
  const text = (value) => Object.values(value || {}).filter((s) => typeof s === 'string');
  const romanQuery = String(query).toLowerCase().replace(/[^a-z]/g, '');
  const match = (ja, kana, glosses) => {
    if (rowMatches([ja || '', kana || '', glosses], query)) return true;
    if (!/^[a-z\s'-]+$/i.test(String(query)) || !romanQuery) return false;
    const reading = toHira(kana || ja || '');
    const romaji = said(reading, { finalWa: /^(こんにちは|こんばんは)[\s。！!]*$/u.test(reading) });
    return romaji.replace(/[^a-z]/g, '').includes(romanQuery);
  };
  const phrases = library.phrases.filter((p) => match(p.ja, p.kana,
    [p.en, p.es, ...text(p.situation), ...text(p.note)].filter(Boolean)));
  const ids = new Set(phrases.map((p) => p.id));
  const categories = library.categories.map((c) => ({ ...c, items: c.items.filter((id) => ids.has(id)) }))
    .filter((c) => c.items.length);
  const dialogues = library.dialogues.filter((d) => match(
    d.lines.map((l) => l.ja).join(' '), d.lines.map((l) => l.kana || l.ja).join(' '),
    [...text(d.title), ...text(d.scene), ...Object.values(d.translation || {}).flat()],
  ));
  return { ...library, phrases, categories, dialogues };
}
