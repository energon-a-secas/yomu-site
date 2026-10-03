// Katakana compounds: one word on the page, made of the words the lattice
// found inside it.
//
// A katakana run with no record of its own (テニストーナメント,
// インフォームショップ) is split by the lattice into the dictionary words it
// is written with: the first pass where every piece is a first-tier word, the
// second phase (rare.js) where it had to guess, with the rest of JMdict. That
// search is the cost-minimising one, and its floors are measured: a piece of a
// katakana run needs three kana as a common word and four as a rare one,
// because shorter words carved stubs out of longer ones (イン|フォーム read
// "in (tennis), form", カート|ライト read the surname Cartwright as "cart,
// light"). This module does not search again. It takes the pieces the
// lattice placed side by side and gives the page one token, because Japanese
// writes a compound as one word and so does Genki's romaji (koohiishoppu,
// infoomushoppu), with the pieces kept as `parts`.
//
// A part the lattice could only guess is kept as a guess, with no gloss: the
// page says "not in the dictionary" for it rather than inventing one, and
// the compound as a whole stays a guess. When every part is a dictionary
// word the compound is built by rule from them, like a number and its
// counter, and its `gloss` joins theirs: "tennis + tournament".
//
// It runs on one run's tokens before analyze.js enriches them, so the
// furigana, beats and said line are built for the compound as a whole, with
// a morpheme cut between the parts (no long vowel is made across two words).

import { isKatakana } from './kana.js';

const allKatakana = (s) => s.length > 0 && [...s].every(isKatakana);

/** A token that can be a piece of a katakana compound. */
function joinable(t) {
  return !!t && t.kind === 'katakana' && allKatakana(t.surface);
}

/**
 * One part of a compound, from the token the lattice built for it. `tier` is
 * 1 for a first-tier word, 2 for a rare word (entry.tier), null for a guess;
 * `gloss` is the record's first gloss. `entry` is the record itself, which
 * the loanword rules read (its glosses and its `ls` and `ws`).
 */
export function partOf(t) {
  const e = t.entry || null;
  return {
    surface: t.surface,
    reading: t.reading,
    gloss: e && Array.isArray(e.g) && e.g[0] ? e.g[0] : null,
    tier: e ? (e.tier === 2 ? 2 : 1) : null,
    entry: e,
  };
}

/** One token for katakana pieces that touch: the compound. */
function compound(group) {
  const parts = group.map(partOf);
  const reading = parts.map((p) => p.reading).join('');
  const cuts = [];
  let at = 0;
  for (const p of parts.slice(0, -1)) { at += p.reading.length; cuts.push(at); }
  const covered = parts.every((p) => p.entry);
  const first = group[0];
  const last = group[group.length - 1];
  const surface = group.map((t) => t.surface).join('');
  return {
    kind: 'katakana',
    surface,
    start: first.start,
    end: last.end,
    base: surface,
    reading,
    entry: null,
    alts: 0,
    chain: [],
    confidence: covered ? 'rule' : 'guess',
    parts,
    gloss: parts.every((p) => p.gloss) ? parts.map((p) => p.gloss).join(' + ') : null,
    // What analyze.js's enrich() reads; nothing the page keeps.
    aid: { f: undefined, cuts, parts: null, v5u: false, finalWa: false, words: null, waAt: [] },
  };
}

/**
 * One run's tokens, with every stretch of two or more katakana tokens that
 * touch joined into one compound. Everything else is returned as it was, the
 * same objects in the same order.
 *
 * @param {object[]} tokens  one run's tokens from lattice.js tokensOf, with `aid`
 * @returns {object[]}
 */
export function joinKatakana(tokens) {
  const out = [];
  for (let k = 0; k < tokens.length; k++) {
    let m = k + 1;
    if (joinable(tokens[k])) {
      while (m < tokens.length && joinable(tokens[m]) && tokens[m].start === tokens[m - 1].end) m++;
    }
    out.push(m - k > 1 ? compound(tokens.slice(k, m)) : tokens[k]);
    k = m - 1;
  }
  return out;
}
