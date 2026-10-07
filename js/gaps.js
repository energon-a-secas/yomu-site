// Where one word ends and the next begins, and the one reason a reader can
// see it. No DOM.
//
// Japanese is written with no spaces, so a reader finds the edges of words
// from what is on the page: a particle, a change of script, a name, a kana
// no word starts with, the way a loanword ends. The reading's Gaps option
// (render-gaps.js) draws a gap at every edge between two words and a
// hairline between the parts of a katakana compound; the game "Where are the
// spaces?" (play-spaces.js) asks for the same edges and shows the same
// reasons, read from data/play/spaces.json, which tools/build-spaces.mjs
// emits through this module. Both read the analysis and nothing else: the
// token kinds, the parts, the confidence and the characters themselves.
//
// One reason per edge, the first of this list that holds:
//
//   particle   the word after the edge, or before it, is a particle (は, を, か)
//   copula     the word after the edge, or before it, is a form of the copula (です, だ)
//   name       the word before the edge, or after it, is a name the dictionary knows
//   script     the script changes across the edge (kanji to hiragana, ...)
//   loan       katakana on both sides, and the word before ends the way a
//              loanword does: ド, ト, ス, ク, グ or ル after a consonant sound
//   nostart    the word before ends in ン, ッ, ー or a small kana: no word
//              starts with one, so the word ran on through it to the edge
//   guess      the word before is a guess, with no dictionary word behind it,
//              or the word after starts with a kana no word starts with (す|ご|ー|いね):
//              the edge is the analysis guessing, whatever the scripts say
//   compound   the edge is between two parts of one katakana compound
//   word       the word before is a word the dictionary knows (or a number
//              and its counter, a form of a dictionary word, or a prefix
//              such as お that the dictionary lists on its own)
//
// Whatever the reason, `guess` on a gap says whether a guessed word touches
// it, and the words a learner reads say so too (render-gaps.js), not only the
// dashed line.
//
// A token carries ids, never prose (docs/ANALYZER.md), and so does a gap: the
// strings are strings-gaps.js's.

import { isHiragana, isKatakana, isKanji, isKana } from './kana.js';

export const REASONS = Object.freeze(['particle', 'copula', 'name', 'script', 'loan', 'nostart', 'guess', 'compound', 'word']);
export const SCRIPTS = Object.freeze(['kanji', 'hiragana', 'katakana', 'latin', 'digit']);

/** Tokens that are not words: no gap is drawn beside them. */
const PLAIN = new Set(['punct', 'space', 'newline', 'latin']);

/** Kana no word starts with: the moraic n, the small tsu, the bar, the small kana. */
export const NOSTART = Object.freeze(new Set([...'んンっッーゃゅょャュョぁぃぅぇぉァィゥェォゎヮ']));
/** How a loanword often ends, after a consonant sound: bed ベッド, test テスト, pink ピンク. */
const LOAN_FINAL = new Set([...'ドトスクグル']);
/** A katakana beat that stands for a bare consonant in a loanword, or ン and ッ. */
const CONSONANT = new Set([...'ンックグスズツヅヌフブプムルトド']);

/** The script of one character, or null for what has none here (punctuation, symbols). */
export function scriptOf(ch) {
  if (!ch) return null;
  if (isKanji(ch)) return 'kanji';
  if (isHiragana(ch)) return 'hiragana';
  if (isKatakana(ch)) return 'katakana';
  if (/\p{Nd}/u.test(ch)) return 'digit';
  if (/\p{Script=Latin}/u.test(ch)) return 'latin';
  return null;
}

/**
 * The script a word ends in. ー takes the script of the kana it lengthens
 * (すごーい is hiragana), so a word that is only ー has none of its own: it
 * lengthens the word before it, whichever script that is (す|ご|ー|いね).
 */
function lastScript(surface) {
  const chars = [...String(surface || '')];
  for (let k = chars.length - 1; k >= 0; k -= 1) if (chars[k] !== 'ー') return scriptOf(chars[k]);
  return null;
}

function firstScript(surface) {
  const ch = [...String(surface || '')][0];
  return scriptOf(ch);
}

const lastChar = (s) => { const c = [...String(s || '')]; return c[c.length - 1] || ''; };
const firstChar = (s) => [...String(s || '')][0] || '';

/** No dictionary word behind it. */
export function isGuess(u) {
  return !!u && (u.confidence === 'guess' || u.kind === 'unknown');
}

/**
 * A prefix the dictionary lists on its own (お, ご): the first part of speech
 * on its record is `pref`. Only the first: また is "adv conj pref", an
 * adverb first.
 */
export function isPrefix(u) {
  const p = u && u.entry && typeof u.entry.p === 'string' ? u.entry.p.split(' ') : [];
  return !!u && u.kind === 'word' && p[0] === 'pref';
}

/** Can a gap be drawn beside this token. */
export function isWordToken(token) {
  return !!token && !PLAIN.has(token.kind) && typeof token.surface === 'string' && token.surface.length > 0;
}

/**
 * The parts of a token as units: a katakana compound's parts (compounds.js),
 * each a dictionary word or a guess, or the token itself.
 */
export function unitsOf(token) {
  if (!Array.isArray(token.parts) || token.parts.length < 2) return [token];
  return token.parts.map((p) => ({
    kind: 'katakana', surface: p.surface, entry: p.entry || null, confidence: p.entry ? 'dict' : 'guess', part: true,
  }));
}

/**
 * The reason for the edge between two units, as `{ why, ...vars }`. `vars`
 * are what the sentence names: `w` a word, `k` a kana, `from` and `to`
 * scripts, `o` a name's spelling, `a` and `b` the two parts, `f` the kind of
 * word ('number', 'form', with `base`).
 */
export function reasonOf(left, right, { inside = false } = {}) {
  if (right.kind === 'particle') return { why: 'particle', w: right.surface };
  if (right.kind === 'copula') return { why: 'copula', w: right.surface };
  if (left.kind === 'particle') return { why: 'particle', w: left.surface };
  if (left.kind === 'copula') return { why: 'copula', w: left.surface };
  // An edge before a kana no word starts with is the analysis guessing: the
  // script that seems to change there (ご|ー) is the bar lengthening ご.
  const head = firstChar(right.surface);
  if (NOSTART.has(head)) return { why: 'guess', k: head };
  const named = [left, right].find((u) => u.kind === 'name' && u.confidence === 'dict');
  if (named) {
    const o = named.name && typeof named.name.o === 'string' && named.name.o ? named.name.o : null;
    return o ? { why: 'name', w: named.surface, o } : { why: 'name', w: named.surface };
  }
  const from = lastScript(left.surface);
  const to = firstScript(right.surface);
  if (from && to && from !== to) return { why: 'script', from, to };
  const end = lastChar(left.surface);
  const chars = [...String(left.surface || '')];
  if (from === 'katakana' && to === 'katakana' && LOAN_FINAL.has(end) && chars.length >= 2 && CONSONANT.has(chars[chars.length - 2])) {
    return { why: 'loan', w: left.surface, k: end };
  }
  if (NOSTART.has(end)) return { why: 'nostart', k: end };
  if (isGuess(left)) return { why: 'guess' };
  if (inside) return { why: 'compound', a: left.surface, b: right.surface };
  if (left.kind === 'number') return { why: 'word', w: left.surface, f: 'number' };
  if (isPrefix(left)) return { why: 'word', w: left.surface, f: 'prefix' };
  if (left.kind === 'inflected' && left.base && left.base !== left.surface) return { why: 'word', w: left.surface, f: 'form', base: left.base };
  return { why: 'word', w: left.surface };
}

/**
 * Every edge in a list of tokens, in order: one between two word tokens
 * that touch, and one between two parts inside a katakana compound.
 *
 *   { at, i, j, part, guess, why, ...vars }
 *
 * `at` is the offset of the edge in the analyzed text (UTF-16, as a token's
 * `start` is), `i` and `j` the tokens on each side (the same token for a
 * part's edge), `part` the index of the part after the edge or null, and
 * `guess` whether a guess touches the edge, whatever its reason.
 */
export function gapsOf(tokens) {
  const out = [];
  const list = Array.isArray(tokens) ? tokens : [];
  list.forEach((t, n) => {
    if (!isWordToken(t)) return;
    const units = unitsOf(t);
    if (units.length > 1) {
      let at = t.start;
      for (let k = 1; k < units.length; k += 1) {
        at += units[k - 1].surface.length;
        out.push({
          at, i: t.i ?? n, j: t.i ?? n, part: k, guess: isGuess(units[k - 1]) || isGuess(units[k]), ...reasonOf(units[k - 1], units[k], { inside: true }),
        });
      }
    }
    const next = list[n + 1];
    if (!isWordToken(next) || next.start !== t.end) return;
    const left = units[units.length - 1];
    const right = unitsOf(next)[0];
    out.push({
      at: next.start, i: t.i ?? n, j: next.i ?? n + 1, part: null, guess: isGuess(left) || isGuess(right), ...reasonOf(left, right),
    });
  });
  return out.sort((a, b) => a.at - b.at);
}

/**
 * What stands beside token `i` on one side (`'before'` or `'after'`), for the
 * Word panel's line where no gap is: 'start' or 'end' of the line,
 * 'punct', 'space', 'latin', or 'other' (a word that does not touch it).
 */
export function besideOf(tokens, i, side) {
  const list = Array.isArray(tokens) ? tokens : [];
  const here = list.findIndex((t) => t && t.i === i);
  const at = here >= 0 ? here : i;
  const t = list[side === 'before' ? at - 1 : at + 1];
  if (!t || t.kind === 'newline') return side === 'before' ? 'start' : 'end';
  if (t.kind === 'punct' || t.kind === 'space' || t.kind === 'latin') return t.kind;
  return 'other';
}

/** The gaps on each side of a token and inside it, for the Word panel. */
export function gapsAround(gaps, i) {
  return {
    before: gaps.find((g) => g.j === i && g.part === null) || null,
    inside: gaps.filter((g) => g.i === i && g.part !== null),
    after: gaps.find((g) => g.i === i && g.part === null) || null,
  };
}

// ── Positions in a line (the game) ────────────────────────────────────────

/** A character a word is made of: kana, kanji, a letter or a digit. Punctuation is not. */
export function isWordChar(ch) {
  return !!ch && (isKana(ch) || isKanji(ch) || /[\p{L}\p{N}]/u.test(ch));
}

/**
 * The positions between characters of a line where an edge could go, in
 * code points: between two characters words are made of. Next to
 * punctuation the edge is already written, so no position is offered there.
 */
export function slotsOf(text) {
  const chars = [...String(text || '')];
  const out = [];
  for (let k = 1; k < chars.length; k += 1) if (isWordChar(chars[k - 1]) && isWordChar(chars[k])) out.push(k);
  return out;
}

/** A UTF-16 offset in `text` as a code point position. */
export function codePointAt(text, offset) {
  return [...String(text || '').slice(0, offset)].length;
}

/**
 * Marks for one answer: the edges placed right, the ones placed where there
 * is none, and the ones missed. The score is the edges placed right minus
 * the extras, and never below 0, so marking every position scores nothing.
 */
export function checkLine(key, picks) {
  const want = new Set(key);
  const got = new Set(picks);
  const right = [...got].filter((p) => want.has(p)).sort((a, b) => a - b);
  const extra = [...got].filter((p) => !want.has(p)).sort((a, b) => a - b);
  const missing = [...want].filter((p) => !got.has(p)).sort((a, b) => a - b);
  return { right, extra, missing, score: Math.max(0, right.length - extra.length) };
}

/**
 * The words of a line whose edges are `key` (code points): each stretch of
 * characters words are made of, cut at every edge, as `{ from, to, text }`.
 * Punctuation is in none of them.
 */
export function wordsOf(text, key) {
  const chars = [...String(text || '')];
  const cuts = new Set(key);
  const out = [];
  let cur = null;
  chars.forEach((ch, k) => {
    if (!isWordChar(ch)) { cur = null; return; }
    if (!cur || cuts.has(k)) { cur = { from: k, to: k, text: '' }; out.push(cur); }
    cur.to = k + 1;
    cur.text += ch;
  });
  return out;
}

/** The word that ends at an edge and the one that starts there, as text. */
export function pairAt(text, key, at) {
  const words = wordsOf(text, key);
  const a = words.find((w) => w.to === at);
  const b = words.find((w) => w.from === at);
  return [a ? a.text : '', b ? b.text : ''];
}

/**
 * Why there is no edge at position `at` of a line whose edges are `key`:
 * the kana after it starts no word, or it falls inside one word, which is
 * named. Positions are code points.
 */
export function extraReason(text, key, at) {
  const next = [...String(text || '')][at];
  if (NOSTART.has(next)) return { why: 'nostart-extra', k: next };
  const word = wordsOf(text, key).find((w) => w.from < at && w.to > at);
  return { why: 'inside', w: word ? word.text : '' };
}
