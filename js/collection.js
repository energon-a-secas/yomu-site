// The kanji collection: every kanji a learner has read, shelved by the jōyō
// list's school grades. No DOM, and no store of its own.
//
// Collected means counted: a kanji is in the collection once My kanji has
// met it in a text (kanji-store.js `seen`, `n >= 1`). So the collection is
// derived, never written: clearing My kanji empties it, importing a backup
// fills it, and there is nothing that could disagree with the counts. The
// shelves are data/kanji/joyo.json (format yomu-joyo/1, emitted by
// tools/build-joyo.mjs from the committed kanji shards), grades 1 to 6 and 8
// (secondary school), each in newspaper frequency order. A kanji outside the
// list is still collected; it goes on the Extra shelf.
//
// The list is fetched when first needed (a read that collects a kanji, or the
// Collection screen), never on boot, through reader.js fetchJson, the path
// every data file takes, so a failure names the file.

import { fetchJson } from './reader.js';
import { isKanji } from './kana.js';

export const JOYO_SRC = 'data/kanji/joyo.json';
export const JOYO_FORMAT = 'yomu-joyo/1';
export const GRADES = Object.freeze([1, 2, 3, 4, 5, 6, 8]);
/** Counts of jōyō kanji that earn a word in the toast. The last is the whole list. */
export const MILESTONES = Object.freeze([10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 2136]);

/** A data file that is not what it should be, named the way a LoadError names one. */
function bad(detail) {
  return new Error(`${JOYO_SRC}: ${detail}`);
}

/**
 * The list, checked: { grades: [{ grade, chars }], gradeOf: Map, total }.
 * Throws an Error naming the file for anything else.
 */
export function parseJoyo(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw bad('not a JSON object');
  if (doc.format !== JOYO_FORMAT) throw bad(`format is ${JSON.stringify(doc.format)}, not ${JOYO_FORMAT}`);
  const raw = doc.grades;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('no grades');
  const gradeOf = new Map();
  const grades = GRADES.map((grade) => {
    const s = raw[String(grade)];
    if (typeof s !== 'string' || !s) throw bad(`grade ${grade} is missing`);
    const chars = [...s];
    for (const ch of chars) {
      if (!isKanji(ch)) throw bad(`grade ${grade} holds ${JSON.stringify(ch)}, which is not a kanji`);
      if (gradeOf.has(ch)) throw bad(`${ch} is listed twice`);
      gradeOf.set(ch, grade);
    }
    return { grade, chars };
  });
  if (Object.keys(raw).length !== GRADES.length) throw bad('holds a grade the list does not have');
  if (doc.count !== gradeOf.size) throw bad(`count is ${doc.count}, the grades hold ${gradeOf.size}`);
  return { grades, gradeOf, total: gradeOf.size };
}

let joyoPromise = null;

/**
 * The list, fetched once per page. A failure is not kept, so the next call
 * (a Retry, the next read) fetches again. `fetcher` is for tests.
 */
export function loadJoyo(fetcher = fetchJson) {
  if (!joyoPromise) {
    joyoPromise = Promise.resolve()
      .then(() => fetcher(JOYO_SRC))
      .then(parseJoyo)
      .catch((err) => {
        joyoPromise = null;
        throw err;
      });
  }
  return joyoPromise;
}

/** For tests: forget the fetched list. */
export function resetJoyo() {
  joyoPromise = null;
}

const collected = (seen, ch) => !!seen && Object.hasOwn(seen, ch) && !!seen[ch] && seen[ch].n >= 1;

/**
 * How much of the list a learner has: { total, have, byGrade: [{ grade,
 * total, have, complete }], extra }. `seen` is the kanji store's map;
 * `extra` is every collected kanji the list does not name, most seen first,
 * then the latest met, then by code point.
 */
export function progress(joyo, seen) {
  const byGrade = joyo.grades.map(({ grade, chars }) => {
    const have = chars.reduce((n, ch) => n + (collected(seen, ch) ? 1 : 0), 0);
    return { grade, total: chars.length, have, complete: have === chars.length };
  });
  const extra = Object.keys(seen || {})
    .filter((ch) => collected(seen, ch) && !joyo.gradeOf.has(ch))
    .sort((a, b) => seen[b].n - seen[a].n
      || (seen[a].last < seen[b].last ? 1 : seen[a].last > seen[b].last ? -1 : 0)
      || a.codePointAt(0) - b.codePointAt(0));
  return { total: joyo.total, have: byGrade.reduce((n, g) => n + g.have, 0), byGrade, extra };
}

/**
 * The next `k` kanji to look out for: the first ones not collected, in
 * frequency order, on the lowest shelf that is not complete. Empty when the
 * whole list is collected.
 */
export function nextToCollect(joyo, seen, k = 6) {
  for (const { chars } of joyo.grades) {
    const missing = chars.filter((ch) => !collected(seen, ch));
    if (missing.length) return missing.slice(0, k);
  }
  return [];
}

/**
 * What a read crossed, between two progress() results: the milestone counts
 * passed (`counts`) and the grades completed (`grades`), each in order.
 */
export function crossed(before, after) {
  const counts = MILESTONES.filter((m) => before.have < m && after.have >= m);
  const was = new Map(before.byGrade.map((g) => [g.grade, g.complete]));
  const grades = after.byGrade.filter((g) => g.complete && !was.get(g.grade)).map((g) => g.grade);
  return { counts, grades };
}
