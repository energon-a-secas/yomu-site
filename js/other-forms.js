// The other ways a word is written (data/spell/, tools/build-spellings.mjs):
// 喰べる beside 食べる, 鮨 and 寿司 beside すし, each with JMdict's tag for
// it. No DOM. Loaded only when the Word panel or Search asks, one shard per
// word; a word with no other spelling reads as an empty list.

import { createRangeStore } from './range-store.js';

/** JMdict's spelling tags, in the order the page explains them. */
export const SPELL_TAGS = Object.freeze(['oK', 'rK', 'iK', 'io', 'ateji', 'sK']);

export function createOtherForms({ fetchJson, base = 'data/' }) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const resolve = (src) => (src.startsWith('data/') ? dir + src.slice(5) : src);
  const store = createRangeStore({
    fetchJson, resolve, indexPath: `${dir}spell/index.json`, what: 'The spellings index',
  });
  const asked = new Set();

  /** Load what these keys need. */
  async function need(keys) {
    await store.need(keys);
    for (const k of keys) asked.add(k);
  }

  /**
   * The other spellings of `key` read `reading`, as [{ written, tag }], or
   * undefined while its shard has not been asked for. Without a reading, or
   * with one the data does not list, every reading's spellings, once each.
   */
  function formsOf(key, reading) {
    if (!asked.has(key)) return undefined;
    const rows = store.get(key) || [];
    const hit = rows.find(([r]) => r === reading);
    const pick = hit ? [hit] : rows;
    const seen = new Set();
    const out = [];
    for (const [, forms] of pick) {
      for (const [written, tag] of forms) {
        if (seen.has(written)) continue;
        seen.add(written);
        out.push(Object.freeze({ written, tag }));
      }
    }
    return out;
  }

  return Object.freeze({ need, formsOf });
}

/** Fetches a file the way a static page does; the spellings never count toward a read's progress. */
export const plainJson = (p) => fetch(new URL(p, document.baseURI)).then((r) => { if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); });
let shared = null;

/** The one loader the page shares, so the Word panel and Search fetch a shard once. */
export function pageForms() {
  if (!shared) shared = createOtherForms({ fetchJson: plainJson });
  return shared;
}
