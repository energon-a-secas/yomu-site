// The Collections tab's logic: JMdict's four-character idioms, proverbs and
// idiomatic phrases (data/sets/, tools/build-sets.mjs), each set loaded whole
// on first view, and the filter over one. No DOM.
//
// A row is [written, reading, glosses, common]; `reading` is '' when it is
// the written form. The filter reads a query the way Search does: Japanese
// (either script) is looked for in the written form and the reading, romaji
// as kana in the reading, English as words a gloss has words starting with,
// and a query that reads as both romaji and English (time) is both.

import { queryKind, glossWords } from './search.js';
import { toHiragana } from './vendor/wanakana.js';
import { toHira } from './kana.js';

/** The sets the tab offers, in its order; their names are strings `set_<id>`. */
export const SET_IDS = Object.freeze(['yoji', 'proverb', 'idiom']);

/** Rows shown before "Show more", and how many more each press adds. */
export const SET_PAGE = 50;

/** Whether a row answers a query; an empty query keeps every row. */
export function rowMatches(row, q) {
  const kind = queryKind(q);
  if (kind === 'empty') return true;
  const [written, reading, glosses] = row;
  const s = String(q).trim();
  const kana = toHira(reading || written);
  if (kind === 'ja') return written.includes(s) || kana.includes(toHira(s));
  const words = glossWords(s);
  const english = words.length > 0 && (() => {
    const hay = glossWords(glosses.join(' '));
    return words.every((w) => hay.some((x) => x.startsWith(w)));
  })();
  if (english) return true;
  if (kind !== 'romaji') return false;
  const asKana = toHiragana(s.toLowerCase().replace(/\s+/g, ''));
  return !!asKana && kana.replace(/\s+/g, '').includes(asKana);
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
