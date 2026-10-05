// Play's rounds: the questions of each game, the options, the grids, the
// answers and the score. No DOM and no clock, and every random draw goes
// through the `rand` it is given, so tests/play.test.mjs runs whole rounds
// under plain node with a seeded generator.
//
// A round is ROUND questions (Odd one out against the clock is the one
// exception: grids until the time runs out). A question is answered once;
// the first answer is the one that counts. A wrong answer is a mix-up of two
// characters, and the store counts each pair (play-store.js), which is how
// a pair that was mixed up comes round more often later: `weight` gives it
// up to WEIGHT_TOP times the chance of a pair never mixed up.

import { spelled } from './kana.js';
import { SCRIPTS } from './play-twins.js';

export const ROUND = 10;
/** Grids of Odd one out: 4x4 at first, 5x5 from the fourth found, 6x6 from the seventh. */
export const GRID_STEPS = Object.freeze([[0, 4], [3, 5], [6, 6]]);
const WEIGHT_TOP = 11;

// ── Chance ────────────────────────────────────────────────────────────────

/** A seeded generator (mulberry32): the same seed draws the same round. */
export function makeRand(seed = 1) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rand = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** How much more often a pair mixed up `n` times is drawn: 1 for never, up to WEIGHT_TOP. */
export function weightOf(n) {
  return 1 + 2 * Math.min(Math.max(0, n | 0), (WEIGHT_TOP - 1) / 2);
}

/** Up to `k` distinct items, each drawn with chance in proportion to `weight(item)`. */
export function drawWeighted(items, k, weight = () => 1, rand = Math.random) {
  const left = items.map((item) => ({ item, w: Math.max(0, weight(item)) }));
  const out = [];
  while (out.length < k && left.length) {
    const total = left.reduce((n, x) => n + x.w, 0);
    let at = rand() * total;
    let i = 0;
    while (i < left.length - 1 && at >= left[i].w) { at -= left[i].w; i += 1; }
    out.push(left[i].item);
    left.splice(i, 1);
  }
  return out;
}

// ── A round ───────────────────────────────────────────────────────────────

export function createRound(game, questions, extra = {}) {
  return { game, questions, at: 0, picks: [], ...extra };
}

export function current(r) {
  return r && r.at < r.questions.length ? r.questions[r.at] : null;
}

export function answeredNow(r) {
  return !!r && r.picks.length > r.at;
}

export function finished(r) {
  return !r || r.at >= r.questions.length;
}

/** Answer the question on screen. The first answer counts; a second is refused (null). */
export function answer(r, pick) {
  const q = current(r);
  if (!q || answeredNow(r)) return null;
  const right = pick === q.answer;
  r.picks.push({ pick, right });
  return { right, answer: q.answer };
}

/** The next question, once this one is answered. */
export function next(r) {
  if (answeredNow(r)) r.at += 1;
  return current(r);
}

export function score(r) {
  return r ? r.picks.filter((p) => p.right).length : 0;
}

/**
 * The pairs this round mixed up, in order, each once: [right, picked] for a
 * wrong answer, the two characters a question was about. A question whose
 * answer is not a character (a script, a spelling) names its pair in
 * `q.pair` instead.
 */
export function mixUps(r) {
  const seen = new Set();
  const out = [];
  r.picks.forEach((p, i) => {
    if (p.right) return;
    const q = r.questions[i];
    const pair = q.pair || [q.answer, p.pick];
    const k = [...pair].sort().join('|');
    if (seen.has(k)) return;
    seen.add(k);
    out.push(pair);
  });
  return out;
}

// ── Which one? kana ───────────────────────────────────────────────────────

/** Each kana in each set, as { ch, set }: a kana in two sets is asked about with either. */
export function kanaEntries(sets) {
  return sets.flatMap((s, set) => s.chars.map(([ch]) => ({ ch, set })));
}

/**
 * Four kana for one question: the kana, the others of its set, then those of
 * the sets that share a kana with it, then the sets nearest it in the list,
 * of the same script, never two with the same romaji.
 */
export function kanaOptions(sets, entry, rand = Math.random, n = 4) {
  const home = sets[entry.set];
  const romaji = new Set([spelled(entry.ch)]);
  const out = [entry.ch];
  const take = (ch) => {
    const ro = spelled(ch);
    if (out.length >= n || out.includes(ch) || romaji.has(ro)) return;
    out.push(ch);
    romaji.add(ro);
  };
  for (const [ch] of shuffle(home.chars, rand)) take(ch);
  const mine = new Set(home.chars.map(([ch]) => ch));
  const near = sets
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i !== entry.set && s.script === home.script)
    .sort((a, b) => {
      const sa = a.s.chars.some(([ch]) => mine.has(ch)) ? 0 : 1;
      const sb = b.s.chars.some(([ch]) => mine.has(ch)) ? 0 : 1;
      return sa - sb || Math.abs(a.i - entry.set) - Math.abs(b.i - entry.set) || a.i - b.i;
    });
  for (const { s } of near) for (const [ch] of shuffle(s.chars, rand)) take(ch);
  return shuffle(out, rand);
}

/** A kana round: ROUND kana, each kana once, the ones mixed up before drawn more often. */
export function kanaRound(sets, { mixed = () => 0, rand = Math.random } = {}) {
  const entries = kanaEntries(sets);
  const weight = (e) => weightOf(sets[e.set].chars.reduce((n, [o]) => n + (o === e.ch ? 0 : mixed(e.ch, o)), 0));
  const picked = [];
  for (const e of drawWeighted(entries, entries.length, weight, rand)) {
    if (picked.length >= ROUND) break;
    if (!picked.some((p) => p.ch === e.ch)) picked.push(e);
  }
  return picked.map((e) => {
    const hint = sets[e.set].chars.find(([ch]) => ch === e.ch)[1];
    return { kind: 'kana', answer: e.ch, romaji: spelled(e.ch), set: e.set, hint, options: kanaOptions(sets, e, rand) };
  });
}

// ── Which one? kanji ──────────────────────────────────────────────────────

/**
 * Four kanji for one question: the kanji, its look-alikes best first, their
 * look-alikes, then the pool's kanji closest in strokes (`strokes(ch)`, or
 * null when unknown), so a kanji with one look-alike still has four options.
 */
export function kanjiOptions(map, ch, { pool = [], strokes = () => null, rand = Math.random, n = 4 } = {}) {
  const out = [ch];
  const take = (x) => { if (out.length < n && x && !out.includes(x)) out.push(x); };
  const first = map.get(ch) || [];
  for (const x of first) take(x);
  for (const x of first) for (const y of map.get(x) || []) take(y);
  const s = strokes(ch);
  const rest = shuffle(pool.filter((x) => !out.includes(x)), rand)
    .sort((a, b) => (s === null ? 0 : Math.abs((strokes(a) ?? 99) - s) - Math.abs((strokes(b) ?? 99) - s)));
  for (const x of rest) take(x);
  return shuffle(out, rand);
}

/** A kanji round over `pool` (kanji with look-alikes), the ones mixed up before drawn more often. */
export function kanjiRound(pool, map, { mixed = () => 0, strokes = () => null, rand = Math.random } = {}) {
  const weight = (ch) => weightOf((map.get(ch) || []).reduce((n, o) => n + mixed(ch, o), 0));
  return drawWeighted(pool, ROUND, weight, rand).map((ch) => ({
    kind: 'kanji', answer: ch, options: kanjiOptions(map, ch, { pool, strokes, rand }),
  }));
}

/**
 * The kanji a round asks about: those of the learner's collection that have
 * look-alikes, or, when that is fewer than ROUND, those and then the 1st and
 * 2nd grade kanji that have look-alikes. `filled` says the second happened.
 */
export function kanjiPool(collected, map, lowGrades) {
  const mine = [...new Set(collected)].filter((ch) => map.has(ch));
  if (mine.length >= ROUND) return { pool: mine, filled: false };
  const more = [...new Set(lowGrades)].filter((ch) => map.has(ch) && !mine.includes(ch));
  return { pool: [...mine, ...more], filled: true, own: mine.length };
}

// ── Odd one out ───────────────────────────────────────────────────────────

/** The grid's side once `found` grids are found. */
export function gridSize(found) {
  let size = GRID_STEPS[0][1];
  for (const [from, s] of GRID_STEPS) if (found >= from) size = s;
  return size;
}

/** Every pair Odd one out can draw: two kana of a set, and each pool kanji with each of its look-alikes. */
export function oddPairs(sets, map, pool = []) {
  const seen = new Set();
  const out = [];
  const add = (a, b, kind) => {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (a === b || seen.has(k)) return;
    seen.add(k);
    out.push({ a, b, kind });
  };
  for (const s of sets) {
    const chars = s.chars.map(([ch]) => ch);
    for (let i = 0; i < chars.length; i += 1) for (let j = i + 1; j < chars.length; j += 1) add(chars[i], chars[j], 'kana');
  }
  for (const ch of pool) for (const o of map.get(ch) || []) add(ch, o, 'kanji');
  return out;
}

/** One grid: `size` x `size` of one character with the other hidden once. */
export function oddGrid(pair, size, rand = Math.random) {
  const [base, odd] = rand() < 0.5 ? [pair.a, pair.b] : [pair.b, pair.a];
  return { base, odd, size, at: Math.floor(rand() * size * size), kind: pair.kind, misses: 0 };
}

/** The next pair to draw: the ones mixed up before more often, never the last one twice running. */
export function nextOddPair(pairs, { mixed = () => 0, last = null, rand = Math.random } = {}) {
  const pool = pairs.length > 1 && last ? pairs.filter((p) => !(p.a === last.a && p.b === last.b)) : pairs;
  return drawWeighted(pool, 1, (p) => weightOf(mixed(p.a, p.b)), rand)[0] || null;
}

/**
 * Odd one out, one sitting: 'timed' (grids until the clock, kept by the
 * page, runs out; the score is the grids found) or 'free' (ROUND grids; the
 * score is the grids found with no wrong tap). `grid` is the one on screen.
 */
export function createOdd(mode) {
  return { game: 'odd', mode: mode === 'free' ? 'free' : 'timed', found: 0, clean: 0, grid: null, last: null, over: false, mixups: [] };
}

/**
 * A tap on cell `ix`: 'found', 'miss', or null when there is nothing to tap.
 * A grid's first miss is a mix-up of its two characters.
 */
export function tapOdd(o, ix) {
  const g = o.grid;
  if (!g || g.solved || o.over) return null;
  if (ix === g.at) {
    g.solved = true;
    o.found += 1;
    if (!g.misses) o.clean += 1;
    if (o.mode === 'free' && o.found >= ROUND) o.over = true;
    return 'found';
  }
  g.misses += 1;
  if (g.misses === 1 && !o.mixups.some(([x, y]) => (x === g.odd && y === g.base) || (x === g.base && y === g.odd))) o.mixups.push([g.odd, g.base]);
  return 'miss';
}

export function oddScore(o) {
  return o.mode === 'free' ? o.clean : o.found;
}

// ── Twins across scripts ──────────────────────────────────────────────────

/**
 * A twins round: ROUND / 2 pairs, and from each a word of both sides, so the
 * same shape is met in both scripts in the round. The answer is a script.
 */
export function twinsRound(pairs, rand = Math.random) {
  const chosen = shuffle(pairs, rand).slice(0, Math.ceil(ROUND / 2));
  const qs = [];
  for (const p of chosen) {
    for (const [k, side] of p.sides.entries()) {
      const other = p.sides[1 - k];
      const [word, reading, meaning] = side.words[Math.floor(rand() * side.words.length)];
      qs.push({
        kind: 'twin', id: p.id, ch: side.ch, word, reading, meaning, answer: side.script, pair: [side.ch, other.ch], options: SCRIPTS,
      });
    }
  }
  return shuffle(qs, rand).slice(0, ROUND);
}

// ── Name decoder ──────────────────────────────────────────────────────────

const firstLetter = (s) => String(s).normalize('NFD').charAt(0).toLowerCase();
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Four spellings for one name: the right one and three others of the same
 * type (given, surname, place), the closest first: the same first letter,
 * then the nearest length. Another type fills in when one runs short.
 */
export function nameOptions(rows, row, rand = Math.random, n = 4) {
  const [kata, orig, type] = row;
  const len = orig.length;
  const others = shuffle(rows.filter((r) => r[0] !== kata && !same(r[1], orig)), rand);
  const near = (r) => (r[2] === type ? 0 : 10) + (firstLetter(r[1]) === firstLetter(orig) ? 0 : 3) + Math.min(Math.abs(r[1].length - len), 3);
  const out = [orig];
  for (const r of others.sort((a, b) => near(a) - near(b))) {
    if (out.length >= n) break;
    if (!out.some((o) => same(o, r[1]))) out.push(r[1]);
  }
  return shuffle(out, rand);
}

/** A names round: ROUND names from the `top` most used, each with its four spellings. */
export function namesRound(rows, { rand = Math.random, top = 300 } = {}) {
  const pool = rows.slice(0, Math.max(top, ROUND));
  const seen = new Set();
  const picked = [];
  for (const r of shuffle(pool, rand)) {
    if (picked.length >= ROUND) break;
    if (seen.has(r[0])) continue;
    seen.add(r[0]);
    picked.push(r);
  }
  return picked.map((r) => ({
    kind: 'name', kata: r[0], answer: r[1], type: r[2], spelled: spelled(r[0]), options: nameOptions(rows, r, rand), pair: [r[0], r[1]],
  }));
}
