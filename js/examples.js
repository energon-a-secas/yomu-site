// Example sentences for a word (data/sent/, tools/build-sentences.mjs), from
// the Tatoeba Project: up to three per word and reading, each with its
// English translation and where the word sits in it. No DOM. Loaded only
// when the Word panel or Search asks, one shard per word, with plain fetch
// (other-forms.js), so they never count toward a read's progress.

import { createRangeStore } from './range-store.js';
import { plainJson } from './other-forms.js';

/** A sentence's page on tatoeba.org, which is the credit CC BY 2.0 FR asks for. */
export const tatoebaUrl = (id) => `https://tatoeba.org/en/sentences/show/${encodeURIComponent(id)}`;

export function createExamples({ fetchJson, base = 'data/' }) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const resolve = (src) => (src.startsWith('data/') ? dir + src.slice(5) : src);
  const store = createRangeStore({
    fetchJson, resolve, indexPath: `${dir}sent/index.json`, what: 'The example sentence index',
  });
  const asked = new Set();

  async function need(keys) {
    await store.need(keys);
    for (const k of keys) asked.add(k);
  }

  /**
   * The examples of `key` read `reading`, as [{ id, ja, en, start, end }],
   * or undefined while its shard has not been asked for. A reading the data
   * does not list has none: an example read another way would teach it.
   */
  function examplesOf(key, reading) {
    if (!asked.has(key)) return undefined;
    const rows = store.get(key) || [];
    const hit = rows.find(([r]) => r === reading) || (rows.length === 1 && !reading ? rows[0] : null);
    return hit ? hit[1].map(([id, ja, en, start, end]) => Object.freeze({
      id, ja, en, start, end,
    })) : [];
  }

  return Object.freeze({ need, examplesOf });
}

let shared = null;

/** The one loader the page shares. */
export function pageExamples() {
  if (!shared) shared = createExamples({ fetchJson: plainJson });
  return shared;
}
