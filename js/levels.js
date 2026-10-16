// Kanji by level, for Search's Browse (events-levels.js): the jōyō kanji by
// the school year they are taught in (data/kanji/joyo.json, collection.js)
// and the kanji for names (data/kanji/jinmeiyo.json, tools/lib/joyo.mjs),
// each in newspaper frequency order, and the JLPT levels N5 to N1 on
// Jonathan Waller's unofficial lists (data/kanji/jlpt.json, in his order;
// tools/build-jlpt.mjs). No DOM. Fetched when the shelf opens; the JLPT
// lists also when a kanji page opens, to name its level.

import { loadJoyo } from './collection.js';
import { fetchJson } from './reader.js';

/** The levels the picker offers, in its order: a school year (`grade`), the name kanji, or a JLPT level (`jlpt`). */
export const LEVELS = Object.freeze([
  { id: 'g1', grade: 1 }, { id: 'g2', grade: 2 }, { id: 'g3', grade: 3 }, { id: 'g4', grade: 4 },
  { id: 'g5', grade: 5 }, { id: 'g6', grade: 6 }, { id: 'g8', grade: 8 }, { id: 'names', grade: null },
  { id: 'n5', jlpt: 5 }, { id: 'n4', jlpt: 4 }, { id: 'n3', jlpt: 3 }, { id: 'n2', jlpt: 2 }, { id: 'n1', jlpt: 1 },
]);

/** Rows shown before "Show more", and how many a practice takes. */
export const LEVEL_PAGE = 50;
export const PRACTICE_SIZE = 20;

export const JINMEIYO_SRC = 'data/kanji/jinmeiyo.json';
export const JINMEIYO_FORMAT = 'yomu-jinmeiyo/1';

// Jonathan Waller's JLPT kanji lists (tools/build-jlpt.mjs), unofficial:
// the JLPT has published no lists since 2010. The sizes are his.
export const JLPT_SRC = 'data/kanji/jlpt.json';
export const JLPT_FORMAT = 'yomu-jlpt/1';
export const JLPT_LEVELS = Object.freeze(['n5', 'n4', 'n3', 'n2', 'n1']);
export const JLPT_SIZES = Object.freeze({ n5: 79, n4: 166, n3: 367, n2: 367, n1: 1232 });

let names = null;

/** The name kanji, as an array, fetched once; a failure is forgotten, so a retry fetches again. */
export function loadNames(fetcher = fetchJson) {
  if (!names) {
    names = Promise.resolve().then(() => fetcher(JINMEIYO_SRC)).then((doc) => {
      if (!doc || doc.format !== JINMEIYO_FORMAT || typeof doc.kanji !== 'string') throw new Error(`${JINMEIYO_SRC}: not ${JINMEIYO_FORMAT}`);
      return Object.freeze([...doc.kanji]);
    }).catch((e) => { names = null; throw e; });
  }
  return names;
}

let jlpt = null;

/**
 * The JLPT lists, fetched once: each level's kanji (`n5` to `n1`, arrays) and
 * `levelOf`, a kanji to its level's number (5 for N5). A failure is
 * forgotten, so a retry fetches again.
 */
export function loadJlpt(fetcher = fetchJson) {
  if (!jlpt) {
    jlpt = Promise.resolve().then(() => fetcher(JLPT_SRC)).then((doc) => {
      if (!doc || doc.format !== JLPT_FORMAT || !doc.levels) throw new Error(`${JLPT_SRC}: not ${JLPT_FORMAT}`);
      const out = { levelOf: new Map() };
      for (const id of JLPT_LEVELS) {
        if (typeof doc.levels[id] !== 'string') throw new Error(`${JLPT_SRC}: no ${id}`);
        out[id] = Object.freeze([...doc.levels[id]]);
        for (const ch of out[id]) out.levelOf.set(ch, Number(id.slice(1)));
      }
      return Object.freeze(out);
    }).catch((e) => { jlpt = null; throw e; });
  }
  return jlpt;
}

/** A level's kanji, in its order. */
export async function charsOf(id, { joyo = loadJoyo, jinmeiyo = loadNames, lists = loadJlpt } = {}) {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) return [];
  if (level.jlpt) return (await lists())[level.id];
  if (level.grade === null) return jinmeiyo();
  const list = await joyo();
  const shelf = list.grades.find((g) => g.grade === level.grade);
  return shelf ? shelf.chars : [];
}

/**
 * What a practice of a level takes: the first PRACTICE_SIZE kanji not saved
 * yet, in the level's order, or its first ones when every one is saved.
 */
export function practiceOf(chars, isSaved) {
  const fresh = chars.filter((ch) => !isSaved(ch));
  return (fresh.length ? fresh : chars).slice(0, PRACTICE_SIZE);
}
