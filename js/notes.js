// Every learner-facing explanation, { en, es }, and the one function that
// picks a language.
//
// Tokens carry ids (sounds[].type, grammar[].id); this module turns an id into
// words. The notes themselves live in notes-sounds.js and notes-grammar.js so
// no file passes the 500-line rule; import them from here, never directly, so
// there is one place that decides what a missing translation looks like.
//
// A missing Spanish string falls back to English and says so: noteFor returns
// `fallback: true`, and the page shows the same honesty line it shows for any
// other untranslated text. An English string is never missing; the test
// asserts it.

import { SOUND_NOTES } from './notes-sounds.js';
import { GRAMMAR_NOTES } from './notes-grammar.js';

export { SOUND_NOTES, GRAMMAR_NOTES };

export const LANGS = Object.freeze(['en', 'es']);

/**
 * Resolve one note into plain strings.
 *
 * @param {'sound'|'grammar'} kind
 * @param {string} id     a sound type or a grammar id
 * @param {string} lang   'en' or 'es'; anything else reads as English
 * @returns {object|null} the note with every { en, es } replaced by a string,
 *          plus `fallback`, true when any string was missing in `lang`; null
 *          for an unknown kind or id
 */
export function noteFor(kind, id, lang = 'en') {
  const table = kind === 'sound' ? SOUND_NOTES : kind === 'grammar' ? GRAMMAR_NOTES : null;
  if (!table || !Object.prototype.hasOwnProperty.call(table, id)) return null;
  const want = LANGS.includes(lang) ? lang : 'en';
  let fallback = want !== lang;
  const pick = (v) => {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') return v;
    if (typeof v[want] === 'string' && v[want]) return v[want];
    if (want !== 'en') fallback = true;
    return typeof v.en === 'string' ? v.en : '';
  };
  const note = table[id];
  const out = kind === 'sound' ? resolveSound(note, pick) : resolveGrammar(note, pick);
  return { kind, id, lang: want, ...out, fallback };
}

function resolveSound(note, pick) {
  const example = (e) => {
    const r = { ja: e.ja, said: e.said, spelled: e.spelled, gloss: pick(e.gloss) };
    if (e.kana) r.kana = e.kana;
    if (e.whispered) r.whispered = e.whispered;
    return r;
  };
  const side = (s) => ({ ja: s.ja, said: s.said, gloss: pick(s.gloss) });
  const out = { title: pick(note.title), rule: pick(note.rule), examples: (note.examples || []).map(example) };
  if (note.pair) out.pair = { with: side(note.pair.with), without: side(note.pair.without) };
  if (note.exception) out.exception = pick(note.exception);
  return out;
}

function resolveGrammar(note, pick) {
  return {
    title: pick(note.title),
    pattern: pick(note.pattern),
    meaning: pick(note.meaning),
    example: { ja: note.example.ja, translation: pick(note.example) },
  };
}
