// Kanji by level, for Search's Browse (events-levels.js): the jōyō kanji by
// the school year they are taught in (data/kanji/joyo.json, collection.js)
// and the kanji for names (data/kanji/jinmeiyo.json, tools/lib/joyo.mjs),
// each in newspaper frequency order. No DOM. Fetched when the shelf opens.

import { loadJoyo } from './collection.js';
import { fetchJson } from './reader.js';

/** The levels the picker offers, in its order: a school year (`grade`) or the name kanji. */
export const LEVELS = Object.freeze([
  { id: 'g1', grade: 1 }, { id: 'g2', grade: 2 }, { id: 'g3', grade: 3 }, { id: 'g4', grade: 4 },
  { id: 'g5', grade: 5 }, { id: 'g6', grade: 6 }, { id: 'g8', grade: 8 }, { id: 'names', grade: null },
]);

/** Rows shown before "Show more", and how many a practice takes. */
export const LEVEL_PAGE = 50;
export const PRACTICE_SIZE = 20;

export const JINMEIYO_SRC = 'data/kanji/jinmeiyo.json';
export const JINMEIYO_FORMAT = 'yomu-jinmeiyo/1';

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

/** A level's kanji, in its order. */
export async function charsOf(id, { joyo = loadJoyo, jinmeiyo = loadNames } = {}) {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) return [];
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
