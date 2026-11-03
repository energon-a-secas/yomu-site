// Words by level, for Search's Browse (events-word-levels.js): Jonathan
// Waller's JLPT vocabulary lists, N5 to N1, unofficial as his kanji lists
// are (levels.js), from data/words/ (tools/build-jlpt-words.mjs). A row is
// [written, reading, glosses] in his order: his spelling and reading,
// `reading` '' when it is the written form, and the glosses of the
// dictionary record that word is. His English is read by the builder only
// to tell the records of one spelling apart (あの "that", not the filler)
// and is not kept: every meaning the shelf shows, and the one Save keeps,
// is the dictionary's. No DOM.
//
// The shelf is offered only once JLPT_WORD_SIZES is pinned. Those are the
// sizes the builder counts on the first run over his archived pages, and
// pinning them is the step that ships the lists: until then data/words/ is
// not there, and tools/check-data.mjs fails a data/words/ that is.

import { JLPT_LEVELS } from './levels.js';
import { fetchJson as readerJson } from './reader.js';

export const WORDS_SRC = 'data/words/jlpt.json';
export const WORDS_INDEX_FORMAT = 'yomu-jlpt-words-index/1';
export const WORDS_FORMAT = 'yomu-jlpt-words/1';
export const WORD_LEVELS = JLPT_LEVELS;

/**
 * How many words each level ships, as the builder counted them, or null
 * while his pages have not been read. Pin all five together, from the
 * builder's own report (tools/build-jlpt-words.mjs).
 */
export const JLPT_WORD_SIZES = Object.freeze({ n5: null, n4: null, n3: null, n2: null, n1: null });

/** True once every size is pinned: the shelf shows, and the checker asks for data/words/. */
export const WORD_LEVELS_READY = WORD_LEVELS.every((id) => Number.isInteger(JLPT_WORD_SIZES[id]));

/** Rows shown before "Show more", and how many more each press adds. */
export const WORD_PAGE = 50;

/** word-store.js's rule for a reading: kana and the long-vowel bar only. */
const KANA = /^[ぁ-ゖァ-ヺー]+$/;
export const isKanaWord = (s) => typeof s === 'string' && KANA.test(s);

/** What Save keeps for a row (word-store.js): its spelling, its reading and the first meaning; null for a row out of shape. */
export function savableRow(row) {
  if (!Array.isArray(row)) return null;
  const [written, reading, glosses] = row;
  const r = reading || written;
  const g = Array.isArray(glosses) ? glosses[0] : '';
  return written && isKanaWord(r) && g ? { w: written, r, g } : null;
}

/**
 * The lists, loaded on first view: `levels()` the index's levels and their
 * files, `rows(id)` a level's rows, frozen, in his order, and `peek(id)`
 * those rows once they have arrived (null before), so a repaint can draw
 * them at once instead of a moment of "Loading". Each level is kept under
 * the id it was asked for, whatever order its files arrive in. A failure is
 * forgotten, so a retry fetches again.
 * @param {{ fetchJson: Function, base?: string }} o
 */
export function createWordLevels({ fetchJson, base = 'data/' }) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const resolve = (src) => (src.startsWith('data/') ? dir + src.slice(5) : src);
  let index = null;
  const loaded = new Map(); // level id -> Promise of rows
  const arrived = new Map(); // level id -> its rows, once loaded

  function levels() {
    if (!index) {
      index = Promise.resolve().then(() => fetchJson(resolve(WORDS_SRC))).then((doc) => {
        if (!doc || doc.format !== WORDS_INDEX_FORMAT || !doc.levels) throw new Error(`${WORDS_SRC}: not ${WORDS_INDEX_FORMAT}`);
        for (const id of WORD_LEVELS) {
          if (!doc.levels[id] || !Array.isArray(doc.levels[id].files)) throw new Error(`${WORDS_SRC}: no ${id}`);
        }
        return doc.levels;
      }).catch((e) => { index = null; throw e; });
    }
    return index;
  }

  function rows(id) {
    if (!WORD_LEVELS.includes(id)) return Promise.resolve(Object.freeze([]));
    if (!loaded.has(id)) {
      const p = levels().then(async (all) => {
        const docs = await Promise.all(all[id].files.map((f) => fetchJson(resolve(f))));
        for (const d of docs) {
          if (!d || d.format !== WORDS_FORMAT || d.level !== id || !Array.isArray(d.rows)) throw new Error(`${id}: not ${WORDS_FORMAT}`);
        }
        const list = Object.freeze(docs.flatMap((d) => d.rows));
        arrived.set(id, list);
        return list;
      }).catch((e) => { loaded.delete(id); throw e; });
      loaded.set(id, p);
    }
    return loaded.get(id);
  }

  const peek = (id) => arrived.get(id) || null;

  return Object.freeze({ levels, rows, peek });
}

let shared = null;

/** The one loader the page shares, fetching through reader.js as the kanji lists and the collections do. */
export function pageWordLevels() {
  if (!shared) shared = createWordLevels({ fetchJson: readerJson });
  return shared;
}
