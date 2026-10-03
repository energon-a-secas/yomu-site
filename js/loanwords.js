// Loanword rules: why an English word looks the way it does in katakana.
//
// Found per katakana token, from the katakana itself and, where the
// dictionary has it, the English the word came from: the source JMdict names
// (`ls`) or the gloss, lined up consonant by consonant (loan-align.js). Each
// rule is a sound entry like the special sounds, `{ type, at, spans, detail }`
// with spans into the token's reading, so the page lights the kana a rule is
// about and groups the rules under their own heading. A token carries ids;
// notes-loan.js says what each one means.
//
// Conservative the way sounds.js is: a rule is emitted only where the evidence
// is clear. One that needs English needs a line-up of every consonant (a
// gloss that is a description, アルバイト "part-time job", gives none), and a
// word JMdict says came from another language gets none of the English ones
// (ビール is Dutch bier, not English beer). Only the f rule and the wasei rule
// read the katakana and the record alone.
//
// A compound (compounds.js) is read part by part, each against its own record,
// and its spans are offset into the compound's reading.

import { isKatakana } from './kana.js';
import { kataBeats, alignEntry } from './loan-align.js';

/** Every type loanRules can emit, in the order a lesson would meet them. */
export const LOAN_TYPES = Object.freeze([
  'loan-vowel', 'loan-double', 'loan-long', 'loan-f', 'loan-lr', 'loan-v',
  'loan-th', 'loan-si', 'loan-wasei', 'loan-short',
]);

const TYPE_SET = new Set(LOAN_TYPES);

/** Whether a sound type is a loanword rule. */
export function isLoanType(type) {
  return TYPE_SET.has(type);
}

/** Small vowels after フ that make an English f before a, i, e, o. */
const F_SMALL = /^フ[ァィェォ]$/;

/** English vowel spellings that ー stands for: a long vowel, or two vowels said as one. */
const LONG_GROUPS = new Set(['ee', 'ea', 'oo', 'ai', 'ay', 'oa', 'ue', 'ui', 'ie', 'ei', 'ey', 'au', 'aw', 'ou', 'ew', 'eu']);

/** Consonants a short vowel does not hold with ッ: they are said long or nasal already. */
const NO_DOUBLE = new Set(['L', 'R', 'M', 'N', 'W', 'Y', 'H']);

const isVowelLetter = (ch) => !!ch && /[aeiouy]/.test(ch);

/** The English word a unit sits in, and the letters around it. */
function around(al, u) {
  const unit = al.units[u];
  const word = al.words[unit.word];
  const ws = al.units.filter((x) => x.word === unit.word);
  const k = ws.indexOf(unit);
  return { unit, word, before: ws[k - 1] || null, after: ws.slice(k + 1), rest: word.slice(unit.to) };
}

/** The unit is the word's last said consonant: after it only a silent e, or soft units. */
function lastConsonant(al, u) {
  const { after, rest, unit } = around(al, u);
  if (al.clipped && al.units[u + 1] && al.units[u + 1].word === unit.word) return false;
  return (rest === '' || rest === 'e') && after.every((x) => x.soft !== undefined);
}

/** The vowel letters between a unit and the previous consonant unit of its word. */
function vowelsBefore(al, u) {
  const { before, word, unit } = around(al, u);
  return word.slice(before ? before.to : 0, unit.from);
}

/**
 * The English letters a ー after beat `k` stands for: from the end of the
 * unit beat k matched to the start of the next unit any beat matched (the
 * soft units between, the r of form, are inside it), or to the word's end.
 */
function vowelsAfter(al, k) {
  const u = al.map[k];
  if (u < 0) return null;
  const unit = al.units[u];
  const word = al.words[unit.word];
  let next = null;
  for (let m = k + 1; m < al.map.length; m++) {
    if (al.map[m] >= 0) { next = al.units[al.map[m]]; break; }
  }
  const end = next && next.word === unit.word ? next.from : word.length;
  return { letters: word.slice(unit.to, end), next: next && next.word === unit.word ? next : null, word };
}

/** What a ー says about the English: 'r' (form, car, computer), 'long' (team, game), or null. */
function longKind(al, k) {
  const v = vowelsAfter(al, k);
  if (!v || !v.letters) return null;
  const s = v.letters;
  if (/^[aeiou]{1,2}r+e?$/.test(s)) return { kind: 'r', detail: s.replace(/e$/, '') };
  if (s === 're') return { kind: 'r', detail: 're' };
  if (LONG_GROUPS.has(s)) return { kind: 'long', detail: s };
  if (/^[aeiou]$/.test(s) && v.next) {
    const after = v.word.slice(v.next.to);
    // game, cake, home: a vowel, one consonant, a silent e (table: le)
    if (!v.next.double && (after === 'e' || after === 'es' || after === 'le')) return { kind: 'long', detail: `${s}-e` };
    // table, paper, computer: a vowel ending its syllable
    if (!v.next.double && v.next.to - v.next.from === 1 && isVowelLetter(after[0])) return { kind: 'long', detail: s };
    // ball, call
    if (s === 'a' && v.next.cls === 'L') return { kind: 'long', detail: 'al' };
  }
  return null;
}

/** The rules one katakana word (or one part of a compound) shows, with spans offset by `offset`. */
function rulesOf(kata, entry, offset) {
  const out = [];
  const add = (type, a, b, detail) => out.push({ type, at: [offset + a, offset + b], detail });
  const kb = kataBeats(kata);

  // f: フ with a small vowel is an f before a, i, e or o, whatever the source.
  for (const b of kb) if (F_SMALL.test(b.kana)) add('loan-f', b.at, b.end, b.romaji);

  if (entry && entry.ws) add('loan-wasei', 0, kata.length, entry.ls && entry.ls[1] ? entry.ls[1] : null);

  const foreign = entry && Array.isArray(entry.ls) && entry.ls[0] !== 'eng';
  const al = entry && !foreign ? alignEntry(kata, entry) : null;
  if (!al) return out;
  if (al.mode === 'short') add('loan-short', 0, kata.length, al.text);

  const n = kb.length;
  kb.forEach((b, k) => {
    const u = al.map[k];
    const unit = u >= 0 ? al.units[u] : null;
    if (b.type === 'cv' && unit) {
      if (unit.cls === 'L' && b.cls === 'R') add('loan-lr', b.at, b.end, 'l');
      if (unit.cls === 'V' && (b.cls === 'B' || b.cls === 'V')) add('loan-v', b.at, b.end, b.cls === 'V' ? 'v' : 'b');
      if (unit.cls === 'TH' && (b.cls === 'S' || b.cls === 'Z')) add('loan-th', b.at, b.end, b.cls === 'S' ? 's' : 'z');
      if (b.kana === 'フ' && unit.cls === 'F' && unit.soft === undefined) add('loan-f', b.at, b.end, 'fu');
      const next = around(al, u).rest;
      if (b.kana === 'シ' && unit.cls === 'S' && /^(i|y|ee|ea)/.test(next)) add('loan-si', b.at, b.end, 'shi');
      if (b.kana === 'ティ' && unit.cls === 'T') add('loan-si', b.at, b.end, 'ti');
      if (b.kana === 'チ' && unit.cls === 'T') add('loan-si', b.at, b.end, 'chi');
      if (b.kana === 'ディ' && unit.cls === 'D') add('loan-si', b.at, b.end, 'di');
      if (b.kana === 'ジ' && unit.cls === 'D') add('loan-si', b.at, b.end, 'ji');
      // an added vowel: the word's last consonant, with u (o after t and d),
      // and nothing of the same word after it (a compound's next word may follow)
      const ends = k === n - 1 || (al.map[k + 1] >= 0 && al.units[al.map[k + 1]].word > unit.word);
      if (ends && lastConsonant(al, u) && (b.vowel === 'u' || (b.vowel === 'o' && (b.cls === 'T' || b.cls === 'D')))) {
        add('loan-vowel', b.at, b.end, b.vowel);
      }
    }
    if (b.type === 'gem' && k + 1 < n && al.map[k + 1] >= 0) {
      const v = al.map[k + 1];
      const held = al.units[v];
      const short = vowelsBefore(al, v);
      const final = lastConsonant(al, v) && around(al, v).rest === '';
      if (/^[aeiou]$/.test(short) && !NO_DOUBLE.has(held.cls) && (final || held.double)) {
        add('loan-double', b.at, b.end, kb[k + 1].romaji[0] === 'c' ? 't' : kb[k + 1].romaji[0]);
      }
    }
    if (b.type === 'long' && k > 0 && kb[k - 1].type === 'cv') {
      const hit = longKind(al, k - 1);
      if (hit) add('loan-long', b.at, b.end, hit.detail);
    }
  });
  return out;
}

/**
 * One entry per rule per token, with every place it applies in `spans` and
 * the first in `at`, the way sounds.js groups the two voiced marks. `detail`
 * lists each different detail once, space separated (form and computer:
 * "or er").
 */
function grouped(list) {
  const byType = new Map();
  for (const r of list) {
    const g = byType.get(r.type);
    if (g) {
      g.spans.push(r.at);
      if (r.detail && !String(g.detail || '').split(' ').includes(r.detail)) g.detail = g.detail ? `${g.detail} ${r.detail}` : r.detail;
      continue;
    }
    byType.set(r.type, { type: r.type, at: r.at, spans: [r.at], detail: r.detail || null });
  }
  return [...byType.values()];
}

const allKatakana = (s) => s.length > 0 && [...s].every(isKatakana);

/**
 * The loanword rules a token shows, as sound entries into its reading. Only a
 * katakana word (kind 'katakana', a compound included) has any: a name in
 * katakana is no loanword, and a word in kanji or hiragana is not written the
 * way these rules describe.
 *
 * @param {object} token  a token in the shape docs/ANALYZER.md gives
 * @returns {{ type: string, at: [number, number], spans: number[][], detail: string|null }[]}
 */
export function loanRules(token) {
  if (!token || token.kind !== 'katakana') return [];
  const surface = String(token.surface || '');
  const reading = String(token.reading || '');
  if (!allKatakana(surface) || surface.length !== reading.length) return [];
  const parts = Array.isArray(token.parts) && token.parts.length
    ? token.parts
    : [{ surface, entry: token.entry || null }];
  const list = [];
  let offset = 0;
  for (const p of parts) {
    list.push(...rulesOf(p.surface, p.entry || null, offset));
    offset += p.surface.length;
  }
  return grouped(list);
}
