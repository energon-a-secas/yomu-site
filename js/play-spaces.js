// "Where are the spaces?": the lines, a round, the marks and the score. No
// DOM and no clock, and every draw goes through the `rand` it is given, so
// tests/play.test.mjs runs whole rounds under plain node.
//
// The lines are data/play/spaces.json (yomu-spaces/1), emitted by
// tools/build-spaces.mjs from the phrase library and the compound lines,
// with Yomu's own analysis as the answer key: each line's gaps, each with
// the reason js/gaps.js gives it. A question is one line shown with no
// gaps; the learner marks the positions between characters where a word
// ends (slotsOf), then checks. Only the first check counts, as in the other
// games. A round is ROUND lines, the easy ones first: hiragana sentences,
// where the particles are the clue, then lines with kanji and katakana, then
// the katakana compounds.
//
// The score of a line is the gaps placed right minus the extras, never
// below 0 (gaps.js checkLine); the round's is their sum, out of every gap
// its lines hold.

import { fetchJson } from './reader.js';
import { slotsOf, checkLine, REASONS } from './gaps.js';
import { ROUND, shuffle, createRound, current, answeredNow } from './play-rounds.js';

export const SPACES_SRC = 'data/play/spaces.json';
export const SPACES_FORMAT = 'yomu-spaces/1';
/** How many lines of each tier a round asks, in this order. A tier short of lines lends its turn to the next. */
export const DRAW = Object.freeze([[1, 4], [2, 4], [3, 2]]);

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

/** One line of the file, checked, or null: every gap at a position between two characters, in order. */
export function cleanLine(l) {
  if (!l || typeof l !== 'object' || !isText(l.id) || !isText(l.ja) || ![1, 2, 3].includes(l.tier)) return null;
  if (!Array.isArray(l.gaps) || !l.gaps.length) return null;
  const slots = slotsOf(l.ja);
  const open = new Set(slots);
  let last = 0;
  for (const g of l.gaps) {
    if (!g || !Number.isInteger(g.at) || !open.has(g.at) || g.at <= last || !REASONS.includes(g.why)) return null;
    last = g.at;
  }
  const out = { id: l.id, of: isText(l.of) ? l.of : l.id, tier: l.tier, ja: l.ja, gaps: l.gaps, slots, key: l.gaps.map((g) => g.at) };
  if (isText(l.en) && isText(l.es)) out.meaning = { en: l.en, es: l.es };
  return out;
}

/** The file, checked: { lines, dropped }. */
export function parseSpaces(doc) {
  if (!doc || typeof doc !== 'object' || doc.format !== SPACES_FORMAT) throw new Error(`${SPACES_SRC}: format is not ${SPACES_FORMAT}`);
  if (!Array.isArray(doc.lines)) throw new Error(`${SPACES_SRC}: no lines`);
  const lines = [];
  let dropped = 0;
  for (const l of doc.lines) {
    const ok = cleanLine(l);
    if (ok) lines.push(ok);
    else dropped += 1;
  }
  return { lines, dropped };
}

let file = null;

/** The lines, fetched once. A failure is not kept: the next call asks again. */
export function loadSpaces(fetcher = fetchJson) {
  if (!file) {
    file = Promise.resolve()
      .then(() => fetcher(SPACES_SRC))
      .then(parseSpaces)
      .catch((err) => { file = null; throw err; });
  }
  return file;
}

/** For tests: forget the file. */
export function resetSpaces() {
  file = null;
}

/**
 * ROUND lines: DRAW[t] of each tier in turn, shuffled within the tier, and
 * never two spellings of one sentence (its kana and its kanji) in a round,
 * since the first would give the second away.
 */
export function spacesRound(lines, { rand = Math.random } = {}) {
  const used = new Set();
  const out = [];
  let owed = 0;
  for (const [tier, n] of DRAW) {
    const want = n + owed;
    const got = [];
    for (const l of shuffle(lines.filter((x) => x.tier === tier), rand)) {
      if (got.length >= want) break;
      if (used.has(l.of)) continue;
      used.add(l.of);
      got.push(l);
    }
    owed = want - got.length;
    out.push(...got);
  }
  // A file with too few hard lines still makes a round of ROUND, from what is left.
  for (const l of shuffle(lines, rand)) {
    if (out.length >= ROUND) break;
    if (!used.has(l.of)) { used.add(l.of); out.push(l); }
  }
  return createRound('spaces', out.slice(0, ROUND).sort((a, b) => a.tier - b.tier), { marks: [] });
}

/** The positions marked on the line on screen. */
export function marksOf(r) {
  if (!r || !current(r)) return new Set();
  if (!r.marks[r.at]) r.marks[r.at] = new Set();
  return r.marks[r.at];
}

/** Put a space at a position, or take it away. Refused once the line is checked, or off a position. */
export function toggleMark(r, at) {
  const q = current(r);
  if (!q || answeredNow(r) || !q.slots.includes(at)) return false;
  const m = marksOf(r);
  if (m.has(at)) m.delete(at);
  else m.add(at);
  return true;
}

/** Check the line on screen: the first check is the one that counts. */
export function checkMarks(r) {
  const q = current(r);
  if (!q || answeredNow(r)) return null;
  const pick = [...marksOf(r)].sort((a, b) => a - b);
  const got = checkLine(q.key, pick);
  // `right` is whether the line is whole, as every game's picks say; the
  // positions placed right are `hit`.
  const p = {
    pick, hit: got.right, extra: got.extra, missing: got.missing, score: got.score, right: !got.extra.length && !got.missing.length,
  };
  r.picks.push(p);
  return p;
}

/** The round's score: every line's, summed. */
export function spacesScore(r) {
  return r ? r.picks.reduce((n, p) => n + (p.score || 0), 0) : 0;
}

/** Every gap the round's lines hold: what a perfect round scores. */
export function spacesTotal(r) {
  return r ? r.questions.reduce((n, q) => n + q.key.length, 0) : 0;
}

/** The gaps placed right and the extras, over the round. */
export function spacesCounts(r) {
  const right = r ? r.picks.reduce((n, p) => n + p.hit.length, 0) : 0;
  const extra = r ? r.picks.reduce((n, p) => n + p.extra.length, 0) : 0;
  return { right, extra, of: spacesTotal(r) };
}

/** The lines checked with a gap missed or one too many, in order: the round's mix-ups. */
export function missedLines(r) {
  return r ? r.questions.filter((q, i) => r.picks[i] && !r.picks[i].right) : [];
}
