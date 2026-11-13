// A gap's reason in words, with no page: the string a reason is said with,
// and the sentence as parts, the words of the text it names marked as
// Japanese. render-gaps.js draws the parts as nodes; the iOS app (yomu-ios,
// through its bridge) shows them as one line of text, so both say the same.

import { ui } from './strings.js';

const KEY = Object.freeze({
  particle: 'gapParticle',
  copula: 'gapCopula',
  script: 'gapScript',
  loan: 'gapLoan',
  nostart: 'gapNostart',
  guess: 'gapGuess',
  compound: 'gapCompound',
  'nostart-extra': 'gapExtraNostart',
  inside: 'gapExtraInside',
});
const WORD_KEY = Object.freeze({ form: 'gapWordForm', number: 'gapWordNumber', prefix: 'gapWordPrefix' });
const SCRIPT_KEY = Object.freeze({
  kanji: 'gapScriptKanji', hiragana: 'gapScriptHiragana', katakana: 'gapScriptKatakana', latin: 'gapScriptLatin', digit: 'gapScriptDigit',
});

/** The string a reason is said with. */
export function reasonKey(g) {
  if (!g) return null;
  if (g.why === 'name') return g.o ? 'gapNameO' : 'gapName';
  if (g.why === 'guess' && g.k) return 'gapGuessNostart';
  if (g.why === 'word') return WORD_KEY[g.f] || 'gapWord';
  return KEY[g.why] || null;
}

/**
 * A gap's reason, one sentence, as parts: strings, and `{ ja }` for each
 * word of the text it names. When a guessed word touches the gap and another
 * reason won, the sentence says the guess too ("...; the reading here is a
 * guess."), so a reader who cannot see the dashed line still learns it.
 */
export function reasonParts(g) {
  const key = reasonKey(g);
  if (!key) return [];
  const raw = ui(key);
  const out = [];
  let at = 0;
  for (const m of raw.matchAll(/\{(\w+)\}/g)) {
    if (m.index > at) out.push(raw.slice(at, m.index));
    const name = m[1];
    if (name === 'from' || name === 'to') out.push(ui(SCRIPT_KEY[g[name]] || 'gapScriptKanji'));
    else if (name === 'o') out.push(String(g.o || ''));
    else out.push({ ja: String(g[name] ?? '') });
    at = m.index + m[0].length;
  }
  if (at < raw.length) out.push(raw.slice(at));
  if (g.guess && g.why !== 'guess') {
    const last = out[out.length - 1];
    if (typeof last === 'string' && last.endsWith('.')) out[out.length - 1] = last.slice(0, -1);
    out.push(ui('gapGuessToo'));
  }
  return out;
}

/** A gap's reason as one line of text. */
export function reasonText(g) {
  return reasonParts(g).map((p) => (typeof p === 'string' ? p : p.ja)).join('');
}
