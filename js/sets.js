// The Collections tab's logic: JMdict's four-character idioms, proverbs and
// idiomatic phrases (data/sets/, tools/build-sets.mjs), each set loaded whole
// on first view, and the filter over one. No DOM.
//
// A row is [written, reading, glosses, common, said, es?]; `reading` is ''
// when it is the written form, `said` the reader's romaji ('' where it
// guessed), `es` the row's Spanish where the dictionary has it. The filter
// reads a query the way Search does: Japanese (either script) is looked for
// in the written form and the reading; English as words the English glosses
// have words starting with, and Spanish as words the Spanish has words
// starting with, accents folded on both sides (perdon finds Perdón, nino
// niño) and Spanish's stop words left out of the query unless it is one
// alone (como); romaji as kana in the reading, however it is typed (a
// particle as said, a long vowel left out: search-latin.js); and a query
// that reads as both romaji and a meaning (time) is both. The said line is
// not searched: as letters run together, aku is in shikoosakugo.

import { queryKind, glossWords } from './search.js';
import {
  foldLatin, spanishWords, plainN, romajiKanas, STOP_ES,
} from './search-latin.js';
import { createRangeStore } from './range-store.js';
import { plainJson } from './other-forms.js';
import { toHira } from './kana.js';

/** The sets the tab offers, in its order; their names are strings `set_<id>`. */
export const SET_IDS = Object.freeze(['yoji', 'proverb', 'idiom']);

const HAS_KANJI = /[\p{Script=Han}々]/u;

/** Rows shown before "Show more", and how many more each press adds. */
export const SET_PAGE = 50;

/** Readings of a romaji filter tried, and the most edits each: a filter runs on every row, every keystroke. */
const FILTER_READINGS = 32;
const FILTER_EDITS = 2;

/** Spanish stop words a query of one may still mean: cómo and qué. */
const ASKED_ES = new Set(['como', 'que']);
/** A Spanish text's words for the filter: folded, ñ as n, parentheses and stop words left out but cómo and qué. */
const spanishHay = (texts) => foldLatin(texts.join(' ')).replace(/\([^)]*\)/g, ' ')
  .split(/[^a-zñ]+/).filter((w) => w && (!STOP_ES.has(w) || ASKED_ES.has(w))).map(plainN);
/** A Spanish query's words: two letters or more, and a stop word alone only when it asks (como; el is no search). */
function spanishAsked(q) {
  const words = spanishWords(q, { alone: true }).filter((w) => w.length > 1);
  return words.length === 1 && STOP_ES.has(words[0]) && !ASKED_ES.has(words[0]) ? [] : words.map(plainN);
}
/** An English text's words for the filter: accents folded (café is cafe), ñ kept, so año is no English. */
const englishHay = (texts) => glossWords(foldLatin(texts.join(' ')));
const startsAll = (words, hay) => words.every((w) => hay.some((x) => x.startsWith(w)));

/** What a query asks of every row, worked out once for the last query. */
let asked = { q: null };
function askOf(q) {
  if (asked.q === q) return asked;
  const kind = queryKind(q);
  const s = String(q).trim();
  asked = {
    q,
    kind,
    s,
    en: kind === 'ja' ? [] : englishHay([s]),
    es: kind === 'ja' ? [] : spanishAsked(s),
    kanas: kind === 'romaji' ? romajiKanas(s, { limit: FILTER_READINGS, most: FILTER_EDITS }) : [],
  };
  return asked;
}

/** Whether a row answers a query; an empty query keeps every row. */
export function rowMatches(row, q) {
  const a = askOf(q);
  if (a.kind === 'empty') return true;
  const [written, reading, glosses, , , es] = row;
  const kana = toHira(reading || written);
  if (a.kind === 'ja') return written.includes(a.s) || kana.includes(toHira(a.s));
  if (a.en.length && startsAll(a.en, englishHay(glosses || []))) return true;
  if (a.es.length && Array.isArray(es) && es.length && startsAll(a.es, spanishHay(es))) return true;
  if (a.kind !== 'romaji') return false;
  const plain = kana.replace(/\s+/g, '');
  return a.kanas.some((k) => plain.includes(k));
}

/** @param {{ fetchJson: Function, base?: string }} o */
export function createSets({ fetchJson, base = 'data/' }) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const resolve = (src) => (src.startsWith('data/') ? dir + src.slice(5) : src);
  let index = null;
  const loaded = new Map(); // id -> Promise of rows

  async function sets() {
    if (!index) {
      index = fetchJson(`${dir}sets/index.json`).then((doc) => {
        if (!doc || !Array.isArray(doc.sets)) throw new Error('The collections index has no sets[]');
        return doc.sets;
      }).catch((e) => { index = null; throw e; });
    }
    return index;
  }

  /** A set's rows, in the builder's order (common first, then by reading). */
  function rows(id) {
    if (!loaded.has(id)) {
      const p = sets().then(async (list) => {
        const set = list.find((s) => s.id === id);
        if (!set) throw new Error(`No collection ${id}`);
        const docs = await Promise.all(set.files.map((f) => fetchJson(resolve(f))));
        return Object.freeze(docs.flatMap((d) => d.rows || []));
      }).catch((e) => { loaded.delete(id); throw e; });
      loaded.set(id, p);
    }
    return loaded.get(id);
  }

  return Object.freeze({ sets, rows });
}

/**
 * The idioms and proverbs that hold a word (data/sets/words.json, wNN):
 * up to three rows [set, written, reading, gloss], the word's own row first.
 * Loaded like the examples (one shard per word, plain fetch), only when the
 * Word panel or Search asks.
 */
export function createSetWords({ fetchJson, base = 'data/' }) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const resolve = (src) => (src.startsWith('data/') ? dir + src.slice(5) : src);
  const store = createRangeStore({
    fetchJson, resolve, indexPath: `${dir}sets/words.json`, what: 'The idioms index',
  });
  const asked = new Set();
  // Only keys with a kanji are filed: a kana word fetches nothing and holds none.
  const filed = (k) => HAS_KANJI.test(k);
  async function need(keys) {
    await store.need(keys.filter(filed));
    for (const k of keys) asked.add(k);
  }
  /** The rows holding `key`, [] for none, or undefined while its shard has not been asked for. */
  function inOf(key) {
    if (!filed(key)) return [];
    if (!asked.has(key)) return undefined;
    return (store.get(key) || []).map(([set, written, reading, gloss]) => Object.freeze({
      set, written, reading, gloss,
    }));
  }
  return Object.freeze({ need, inOf });
}

let shared = null;

/** The one loader the page shares. */
export function pageSetWords() {
  if (!shared) shared = createSetWords({ fetchJson: plainJson });
  return shared;
}
