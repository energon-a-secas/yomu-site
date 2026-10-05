// The two data files Play reads, each fetched once per page and checked.
// No DOM.
//
// data/play/lookalikes.json (yomu-lookalikes/1, tools/build-lookalikes.mjs):
// each jōyō kanji that has look-alikes, mapped to them, best first.
//
// data/names/popular.json (yomu-names-popular/1, emitted by the dictionary
// build): katakana names with their original spelling, most used first,
//   [katakana, original, 'given' | 'surname' | 'place', count]
// A row that is not that shape is left out and counted. Before the build
// that emits it, the file is not there: a 404 reads as 'missing', which the
// Play screen says in words, and is never thrown. Asking is the only way a
// static page can learn a file is missing, so that one request is a 404 in
// the network log until the file ships.
//
// Both go through reader.js fetchJson, the path every data file takes, so a
// failure names the file.

import { fetchJson } from './reader.js';
import { isKanji } from './kana.js';

export const LOOKALIKES_SRC = 'data/play/lookalikes.json';
export const LOOKALIKES_FORMAT = 'yomu-lookalikes/1';
export const NAMES_SRC = 'data/names/popular.json';
export const NAMES_FORMAT = 'yomu-names-popular/1';
export const NAME_TYPES = Object.freeze(['given', 'surname', 'place']);

const KATAKANA_NAME = /^[ァ-ヺー・]+$/;
const LATIN_NAME = /^[\p{Script=Latin}][\p{Script=Latin} '’-]*$/u;

function bad(file, detail) {
  return new Error(`${file}: ${detail}`);
}

/** The look-alikes, checked: a Map of kanji to its look-alikes, best first. */
export function parseLookalikes(doc) {
  if (!doc || typeof doc !== 'object' || doc.format !== LOOKALIKES_FORMAT) throw bad(LOOKALIKES_SRC, `format is not ${LOOKALIKES_FORMAT}`);
  const raw = doc.kanji;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad(LOOKALIKES_SRC, 'no kanji');
  const map = new Map();
  for (const [ch, v] of Object.entries(raw)) {
    if (!isKanji(ch) || typeof v !== 'string') continue;
    const list = [...new Set([...v])].filter((x) => x !== ch && isKanji(x));
    if (list.length) map.set(ch, list);
  }
  return map;
}

/** One row of the names file, or null when it is not one. */
export function cleanNameRow(row) {
  if (!Array.isArray(row) || row.length !== 4) return null;
  const [kata, orig, type, n] = row;
  if (typeof kata !== 'string' || !KATAKANA_NAME.test(kata) || [...kata].length > 24) return null;
  if (typeof orig !== 'string' || !LATIN_NAME.test(orig) || orig.length > 40) return null;
  if (!NAME_TYPES.includes(type) || !Number.isInteger(n) || n < 1) return null;
  return [kata, orig, type, n];
}

/** The names, checked: { rows, dropped }, most used first as the file has them. */
export function parseNames(doc) {
  if (!doc || typeof doc !== 'object' || doc.format !== NAMES_FORMAT) throw bad(NAMES_SRC, `format is not ${NAMES_FORMAT}`);
  if (!Array.isArray(doc.names)) throw bad(NAMES_SRC, 'no names');
  const rows = [];
  let dropped = 0;
  for (const row of doc.names) {
    const ok = cleanNameRow(row);
    if (ok) rows.push(ok);
    else dropped += 1;
  }
  return { rows, dropped };
}

let lookalikes = null;
let names = null;

/** The look-alikes, fetched once. A failure is not kept: the next call asks again. */
export function loadLookalikes(fetcher = fetchJson) {
  if (!lookalikes) {
    lookalikes = Promise.resolve()
      .then(() => fetcher(LOOKALIKES_SRC))
      .then(parseLookalikes)
      .catch((err) => { lookalikes = null; throw err; });
  }
  return lookalikes;
}

/**
 * The names, fetched once: { state: 'ready', rows, dropped }, or
 * { state: 'missing' } while the file is not there (a 404), which is kept,
 * since it will not appear before the page reloads. Any other failure
 * rejects and is not kept.
 */
export function loadNames(fetcher = fetchJson) {
  if (!names) {
    names = Promise.resolve()
      .then(() => fetcher(NAMES_SRC))
      .then((doc) => ({ state: 'ready', ...parseNames(doc) }))
      .catch((err) => {
        if (err && /\b404\b/.test(String(err.detail || err.message))) return { state: 'missing' };
        names = null;
        throw err;
      });
  }
  return names;
}

/** For tests: forget both files. */
export function resetPlayData() {
  lookalikes = null;
  names = null;
}
