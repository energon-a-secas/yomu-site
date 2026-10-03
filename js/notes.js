// Every learner-facing explanation, { en, es }, and the one function that
// picks a language.
//
// Tokens carry ids (sounds[].type, grammar[].id); this module turns an id into
// words. The notes themselves live in notes-sounds.js, notes-loan.js and
// notes-grammar.js so no file passes the 500-line rule; import them from here,
// never directly, so there is one place that decides what a missing
// translation looks like.
//
// A loanword rule (loanwords.js) is a sound entry on the token, so the page
// lights its kana the way it lights a special sound; its note is found under
// the kind 'sound' as well as under 'loan'.
//
// A missing Spanish string falls back to English and says so: noteFor returns
// `fallback: true`, and the page shows the same honesty line it shows for any
// other untranslated text. An English string is never missing; the test
// asserts it.

import { SOUND_NOTES } from './notes-sounds.js';
import { GRAMMAR_NOTES } from './notes-grammar.js';
import { LOAN_NOTES } from './notes-loan.js';

export { SOUND_NOTES, GRAMMAR_NOTES, LOAN_NOTES };

/** The table a kind's ids are looked up in; a sound id may be a loanword rule. */
function tableFor(kind, id) {
  const has = (t) => Object.prototype.hasOwnProperty.call(t, id);
  if (kind === 'sound') return has(SOUND_NOTES) ? SOUND_NOTES : has(LOAN_NOTES) ? LOAN_NOTES : null;
  if (kind === 'loan') return has(LOAN_NOTES) ? LOAN_NOTES : null;
  if (kind === 'grammar') return has(GRAMMAR_NOTES) ? GRAMMAR_NOTES : null;
  return null;
}

export const LANGS = Object.freeze(['en', 'es']);

/**
 * Resolve one note into plain strings.
 *
 * @param {'sound'|'loan'|'grammar'} kind
 * @param {string} id     a sound type (a loanword rule included) or a grammar id
 * @param {string} lang   'en' or 'es'; anything else reads as English
 * @returns {object|null} the note with every { en, es } replaced by a string,
 *          plus `fallback`, true when any string was missing in `lang`; null
 *          for an unknown kind or id
 */
export function noteFor(kind, id, lang = 'en') {
  const table = tableFor(kind, id);
  if (!table) return null;
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
  const out = table === GRAMMAR_NOTES ? resolveGrammar(note, pick) : resolveSound(note, pick);
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
