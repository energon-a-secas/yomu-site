// English spelled against katakana, one consonant at a time, for the
// loanword rules (loanwords.js).
//
// A katakana loanword keeps the consonants of the word it came from and
// changes everything else: it adds vowels, holds some consonants with ッ,
// writes long vowels with ー, folds l into r, v into b and th into s. So the
// two are lined up by their consonants: every katakana beat that has a
// consonant must be matched to one of the English word's, in order, and
// every English consonant must be matched or be one English does not say
// (the r of form, the gh of light). Vowels are not matched at all; they are
// what the rules then read between the matched consonants.
//
// This is evidence, not a guess at the source. A line-up that needs more than
// one loose step is no line-up, and a word whose gloss is a description
// (アルバイト, "part-time job") simply has none: loanwords.js then says
// nothing English-based about it. Missing a rule costs a note; a rule read
// off a line-up that is not there teaches something false.

import { beats, beatRomaji } from './kana.js';

// ── The katakana side ────────────────────────────────────────────────────

/** A katakana onset (beatRomaji's consonants) to the class English is matched against. */
const ONSET = Object.freeze({
  k: 'K', ky: 'K', g: 'G', gy: 'G', s: 'S', sh: 'SH', z: 'Z', j: 'J',
  t: 'T', ch: 'CH', ts: 'TS', d: 'D', dy: 'D', n: 'N', ny: 'N',
  h: 'H', hy: 'H', f: 'F', b: 'B', by: 'B', v: 'V', p: 'P', py: 'P',
  m: 'M', my: 'M', y: 'Y', r: 'R', ry: 'R', w: 'W',
});

/**
 * The beats of a katakana word, each with its offsets and what the line-up
 * needs: `type` is 'cv' (a consonant and a vowel), 'vowel', 'nasal' (ン),
 * 'gem' (ッ), 'long' (ー) or 'other' (a beat with no English counterpart this
 * module knows, which stops the line-up).
 */
export function kataBeats(kata) {
  let at = 0;
  return beats(kata).map((kana) => {
    const b = { kana, at, end: at + kana.length };
    at = b.end;
    if (kana === 'ッ' || kana === 'っ') return { ...b, type: 'gem' };
    if (kana === 'ー') return { ...b, type: 'long' };
    if (kana === 'ン' || kana === 'ん') return { ...b, type: 'nasal', cls: 'NN' };
    const romaji = beatRomaji(kana);
    const m = /^([^aiueo]*)([aiueo])$/.exec(romaji);
    if (!m) return { ...b, type: 'other' };
    if (!m[1]) return { ...b, type: 'vowel', vowel: m[2], romaji };
    const cls = ONSET[m[1]];
    return cls ? { ...b, type: 'cv', cls, vowel: m[2], romaji } : { ...b, type: 'other' };
  });
}

// ── The English side ─────────────────────────────────────────────────────

const VOWEL = /[aeiou]/;
const isVowel = (ch) => !!ch && VOWEL.test(ch);

/** Single letters, and the katakana onsets each may be written with (and at what cost). */
const MATCH = Object.freeze({
  B: { B: 0 },
  K: { K: 0 },
  G: { G: 0 },
  GJ: { G: 0, J: 0 },       // g before e, i, y: get ゲット, gym ジム
  J: { J: 0 },
  S: { S: 0, Z: 0, SH: 0 }, // a voiced s (rose ローズ), si as シ (cinema)
  SH: { SH: 0 },
  CH: { CH: 0, K: 0, SH: 0 },
  TH: { S: 0, Z: 0, T: 1 },
  T: { T: 0, CH: 0, TS: 0 },
  TI: { SH: 0, T: 0, CH: 0 }, // station ステーション
  SI: { SH: 0, J: 0, S: 0, Z: 0 }, // mission ミッション, vision ビジョン
  D: { D: 0, J: 0 },        // radio ラジオ
  F: { F: 0, H: 1 },        // coffee コーヒー, and スマホ: old, and rarer
  H: { H: 0 },
  L: { R: 0 },
  R: { R: 0 },
  M: { M: 0, NN: 0 },       // camp キャンプ
  N: { N: 0, NN: 0 },
  P: { P: 0 },
  V: { B: 0, V: 0 },
  W: { W: 0 },
  Y: { Y: 0 },
  Z: { Z: 0, J: 0 },
});

const SINGLE = Object.freeze({
  b: 'B', c: 'K', d: 'D', f: 'F', g: 'G', h: 'H', j: 'J', k: 'K', l: 'L', m: 'M',
  n: 'N', p: 'P', q: 'K', r: 'R', s: 'S', t: 'T', v: 'V', w: 'W', y: 'Y', z: 'Z',
});

/**
 * One English word as consonant units, in order: `{ cls, from, to, double,
 * soft }`, `from`/`to` letter offsets in the word. `soft` is what skipping
 * the unit costs when no katakana beat matches it (undefined: it must be
 * matched): an r after a vowel and before a consonant or the end (form,
 * car), gh (light), the g of a final ng, an l after a or o before k, f or m
 * (walk, half). A w or a consonant y may be dropped at a cost of one.
 */
export function englishUnits(word) {
  const w = String(word);
  const out = [];
  const push = (cls, from, to, extra = {}) => out.push({ cls, from, to, double: false, ...extra });
  let i = 0;
  while (i < w.length) {
    const ch = w[i];
    const next = w[i + 1] || '';
    const two = w.slice(i, i + 2);
    if (isVowel(ch) || (ch === 'y' && i > 0)) { i++; continue; }
    if (ch === 'y') { push('Y', i, i + 1, isVowel(next) ? { soft: 1 } : {}); i++; continue; }
    if (w.slice(i, i + 3) === 'tch') { push('CH', i, i + 3, { double: true }); i += 3; continue; }
    if (two === 'ch') { push('CH', i, i + 2); i += 2; continue; }
    if (two === 'sh') { push('SH', i, i + 2); i += 2; continue; }
    if (two === 'th') { push('TH', i, i + 2); i += 2; continue; }
    if (two === 'ph') { push('F', i, i + 2); i += 2; continue; }
    if (two === 'gh') { push('F', i, i + 2, { soft: 0 }); i += 2; continue; }
    if (two === 'ck') { push('K', i, i + 2, { double: true }); i += 2; continue; }
    if (two === 'qu') { push('K', i, i + 1); push('W', i + 1, i + 2, { soft: 0 }); i += 2; continue; }
    if (two === 'wh') { push('W', i, i + 2); i += 2; continue; }
    if (two === 'wr') { push('R', i, i + 2); i += 2; continue; }
    if (two === 'kn' && i === 0) { push('N', i, i + 2); i += 2; continue; }
    if (two === 'mb' && i + 2 === w.length) { push('M', i, i + 2); i += 2; continue; }
    if (w.slice(i, i + 3) === 'dge') { push('J', i, i + 2, { double: true }); i += 2; continue; }
    if (two === 'ng') {
      push('N', i, i + 1);
      push('G', i + 1, i + 2, isVowel(w[i + 2]) ? {} : { soft: 0 });
      i += 2;
      continue;
    }
    if (ch === 'x') { push('K', i, i + 1); push('S', i, i + 1); i++; continue; }
    if (ch === 'c' && /[eiy]/.test(next)) { push('S', i, i + 1); i++; continue; }
    if (ch === 'c' && next === 'c' && /[eiy]/.test(w[i + 2] || '')) { push('K', i, i + 1); push('S', i + 1, i + 2); i += 2; continue; }
    if (ch === 'g' && /[eiy]/.test(next)) { push('GJ', i, i + 1); i++; continue; }
    // -tion, -ssion, -sion, -sure: シ and ジ (station ステーション, vision ビジョン)
    if ((ch === 't' || ch === 's') && /^(s?i[oa]|s?ure)/.test(w.slice(i + 1))) {
      const dbl = next === 's' && ch === 's';
      push(ch === 't' ? 'TI' : 'SI', i, dbl ? i + 2 : i + 1, { double: dbl });
      i += dbl ? 2 : 1;
      continue;
    }
    const cls = SINGLE[ch];
    if (!cls) return null;
    const dbl = next === ch;
    const to = dbl ? i + 2 : i + 1;
    const unit = { double: dbl };
    if (ch === 'r' && i > 0 && isVowel(w[i - 1]) && !isVowel(w[to]) && w[to] !== 'y') unit.soft = 0;
    if (ch === 'r' && i > 0 && isVowel(w[i - 1]) && w.slice(to) === 'e') unit.soft = 0;
    // British -re after a consonant is the -er of centre センター, theatre シアター
    if (ch === 'r' && i > 0 && !isVowel(w[i - 1]) && w.slice(to) === 'e' && i + 2 === w.length) unit.soft = 0;
    // a plural s after a consonant, which a gloss has and the katakana does not (graphics)
    if (ch === 's' && !dbl && to === w.length && i > 0 && !isVowel(w[i - 1]) && w[i - 1] !== 's') unit.soft = 1;
    if (ch === 'l' && /[ao]/.test(w[i - 1] || '') && /[kfm]/.test(w[to] || '')) unit.soft = 0;
    if (ch === 'w') unit.soft = 1;
    if (ch === 'h' && i === 0) unit.soft = 1;
    push(cls, i, to, unit);
    i = to;
  }
  return out;
}

/**
 * The English an entry offers to line up against, each with its `rank`: 0
 * for the source word JMdict names (ls), when it is English, then 1, 2, 3
 * for the glosses in order. A gloss is cut to what could be a word's
 * source: no parenthesis, nothing after a semicolon, no leading "to" or
 * article, letters only, at most four words.
 */
export function englishOf(entry) {
  if (!entry) return [];
  const raw = [];
  if (Array.isArray(entry.ls) && entry.ls[0] === 'eng' && typeof entry.ls[1] === 'string') raw.push([entry.ls[1], 0]);
  (Array.isArray(entry.g) ? entry.g : []).forEach((g, k) => raw.push([g, k + 1]));
  const out = [];
  for (const [r, rank] of raw) {
    const s = String(r).replace(/\([^)]*\)/g, ' ').split(';')[0].toLowerCase()
      .replace(/[-/]/g, ' ').replace(/[’']/g, '').trim().replace(/^(to|a|an|the) /, '');
    if (!s || /[^a-z ]/.test(s)) continue;
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > 4) continue;
    const key = words.join(' ');
    if (!out.some((x) => x.text === key)) out.push({ text: key, words, rank });
  }
  return out;
}

// ── Lining up ────────────────────────────────────────────────────────────

/** The most a line-up may cost (one loose step: an h for f, a dropped w). */
export const MAX_COST = 1;

/** The longest katakana word lined up, in beats. */
const MAX_BEATS = 24;

/**
 * The cheapest line-up of katakana beats `kb[a..b)` with the units `us`.
 * With `prefix`, the beats may stop before the English does (a shortened
 * word): every beat must still be matched, but units may be left over at the
 * end. Returns `{ cost, map, used }` or null: `map[k]` is the unit index beat
 * a + k is matched to, or -1; `used` is how many units were consumed.
 */
function lineUp(kb, a, b, us, prefix) {
  const nk = b - a;
  const nu = us.length;
  const INF = Infinity;
  const cost = Array.from({ length: nk + 1 }, () => new Array(nu + 1).fill(INF));
  const back = Array.from({ length: nk + 1 }, () => new Array(nu + 1).fill(null));
  cost[0][0] = 0;
  const relax = (i, j, ni, nj, c, how) => {
    if (c < cost[ni][nj]) { cost[ni][nj] = c; back[ni][nj] = { i, j, how }; }
  };
  for (let i = 0; i <= nk; i++) {
    for (let j = 0; j <= nu; j++) {
      const c = cost[i][j];
      if (c === INF) continue;
      const beat = i < nk ? kb[a + i] : null;
      const unit = j < nu ? us[j] : null;
      if (unit && unit.soft !== undefined) relax(i, j, i, j + 1, c + unit.soft, 'skip');
      if (!beat) continue;
      if (beat.type === 'vowel' || beat.type === 'gem' || beat.type === 'long') {
        relax(i, j, i + 1, j, c, 'free');
        if (beat.type === 'vowel' && unit && (unit.cls === 'W' || unit.cls === 'Y')) relax(i, j, i + 1, j + 1, c, 'match');
        continue;
      }
      if (beat.type === 'other' || !unit) continue;
      const w = MATCH[unit.cls] && MATCH[unit.cls][beat.cls];
      if (w !== undefined) relax(i, j, i + 1, j + 1, c + w, 'match');
      // ツ for an English ts: cats キャッツ
      if (beat.cls === 'TS' && unit.cls === 'T' && us[j + 1] && us[j + 1].cls === 'S') relax(i, j, i + 1, j + 2, c, 'match2');
    }
  }
  let best = null;
  for (let j = prefix ? 1 : nu; j <= nu; j++) {
    if (cost[nk][j] <= MAX_COST && (!best || cost[nk][j] < best.cost)) best = { cost: cost[nk][j], used: j };
  }
  if (!best) return null;
  const map = new Array(nk).fill(-1);
  let i = nk;
  let j = best.used;
  while (i > 0 || j > 0) {
    const s = back[i][j];
    if (!s) return null;
    if (s.how === 'match' || s.how === 'match2') map[s.i] = s.j;
    i = s.i;
    j = s.j;
  }
  return { cost: best.cost, map, used: best.used };
}

/** Units of a phrase, each carrying its word, and where each word starts in the list. */
function phraseUnits(words) {
  const units = [];
  for (let n = 0; n < words.length; n++) {
    const us = englishUnits(words[n]);
    if (!us) return null;
    for (const u of us) units.push({ ...u, word: n });
  }
  return units;
}

const hard = (u) => u.soft === undefined;

/** How many katakana consonants a line-up matched. */
const matchedCount = (map) => map.filter((x) => x >= 0).length;

/**
 * The whole katakana word against the whole of one English phrase: the word
 * is that phrase, written in katakana. Null unless every consonant on both
 * sides is accounted for, at most one step loosely, and at least one was
 * matched.
 */
export function alignFull(kb, cand) {
  const units = phraseUnits(cand.words);
  if (!units || !units.some(hard)) return null;
  const r = lineUp(kb, 0, kb.length, units, false);
  if (!r || matchedCount(r.map) < 1) return null;
  return { mode: 'full', cost: r.cost, map: r.map, units, words: cand.words, text: cand.text };
}

/**
 * A shortened word: the katakana is the first beats of each English word in
 * turn (パソ|コン from personal computer, デパート from department store),
 * words left over only at the end. Each piece matches the start of its word;
 * at least two consonants are matched over all, and at least two English
 * consonants are left unsaid, or it is not shorter than the word.
 */
export function alignShort(kb, cand) {
  const per = cand.words.map((w) => englishUnits(w));
  if (per.some((us) => !us)) return null;
  const n = kb.length;
  let best = null;
  const walk = (a, t, pieces, cost) => {
    if (a === n) {
      if (best && cost >= best.cost) return;
      best = { cost, pieces: pieces.slice() };
      return;
    }
    if (t >= per.length) return;
    for (let b = a + 1; b <= n; b++) {
      const r = lineUp(kb, a, b, per[t], true);
      if (!r || cost + r.cost > MAX_COST) continue;
      const m = matchedCount(r.map);
      // A piece with no consonant (エア for air) counts only beside one with two.
      if (!m && !(b < n && /^[aeiou]/.test(cand.words[t]))) continue;
      pieces.push({ a, b, word: t, map: r.map, used: r.used, matched: m });
      walk(b, t + 1, pieces, cost + r.cost);
      pieces.pop();
    }
  };
  walk(0, 0, [], 0);
  if (!best) return null;
  const matched = best.pieces.reduce((s, p) => s + p.matched, 0);
  const lastWord = best.pieces[best.pieces.length - 1].word;
  let left = 0;
  per.forEach((us, t) => {
    const piece = best.pieces.find((p) => p.word === t);
    const rest = piece ? us.slice(piece.used) : t > lastWord ? us : [];
    left += rest.filter(hard).length;
  });
  if (matched < 2 || left < 2) return null;
  if (best.pieces.some((p, k) => !p.matched && !(best.pieces[k + 1] && best.pieces[k + 1].matched >= 2))) return null;
  // One map over every beat, against the units of all the words in a row.
  const units = [];
  const start = [];
  per.forEach((us, t) => { start.push(units.length); for (const u of us) units.push({ ...u, word: t }); });
  const map = new Array(n).fill(-1);
  for (const p of best.pieces) p.map.forEach((x, k) => { if (x >= 0) map[p.a + k] = start[p.word] + x; });
  return { mode: 'short', cost: best.cost, map, units, words: cand.words, text: cand.text, clipped: true };
}

/**
 * The best line-up of a katakana word with an entry's English: a full one if
 * any candidate gives one (the cheapest winning, the earlier on a tie),
 * otherwise a shortened one, otherwise null.
 *
 * Which English counts: the source named in `ls` and the first gloss always;
 * a later gloss only for a word the dictionary does not call usually written
 * in kana (`u`). A word with `u` has a kanji spelling it is usually not
 * written with, which a native word has (サバ is 鯖, and its second sense,
 * "server", lined up as v written バ for a mackerel). A shortened word is
 * read only off the source or the first gloss: a later sense is what a word
 * also means, never what it was cut from (サル "monkey" lined up with "sly
 * person" as sl(y)).
 */
export function alignEntry(kata, entry) {
  const kb = kataBeats(kata);
  // Past 24 beats a katakana word is a phrase run together, and the
  // shortened-word search grows with the cube of its length.
  if (kb.length < 2 || kb.length > MAX_BEATS || kb.some((b) => b.type === 'other')) return null;
  const cands = englishOf(entry).filter((c) => c.rank <= 1 || !entry.u);
  let best = null;
  for (const c of cands) {
    const r = alignFull(kb, c);
    if (r && (!best || r.cost < best.cost)) best = r;
  }
  if (best) return { ...best, kb };
  const source = cands.some((c) => c.rank === 0);
  for (const c of cands.filter((x) => (source ? x.rank === 0 : x.rank === 1))) {
    const r = alignShort(kb, c);
    if (r && (!best || r.cost < best.cost)) best = r;
  }
  return best ? { ...best, kb } : null;
}
