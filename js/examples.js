// Example sentences for a word (data/sent/, tools/build-sentences.mjs), from
// the Tatoeba Project: up to three per word and reading, each with its
// English translation and where the word sits in it, and up to seven more
// behind More (data/sent/more/), fetched only when the learner asks. No DOM.
// Loaded only when the Word panel or Search asks, one shard per word, with
// plain fetch (other-forms.js), so they never count toward a read's progress.

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
  const moreStore = createRangeStore({
    fetchJson, resolve, indexPath: `${dir}sent/more/index.json`, what: 'The more examples index',
  });
  const asked = new Set();
  const askedMore = new Set();

  async function need(keys) {
    await store.need(keys);
    for (const k of keys) asked.add(k);
  }

  async function needMore(keys) {
    await moreStore.need(keys);
    for (const k of keys) askedMore.add(k);
  }

  const sentences = (list) => list.map(([id, ja, en, start, end]) => Object.freeze({
    id, ja, en, start, end,
  }));

  /** The row of `key` read `reading` in `rows`, or the only row when no reading is given. */
  const rowOf = (rows, reading) => rows.find(([r]) => r === reading) || (rows.length === 1 && !reading ? rows[0] : null);

  /**
   * The examples of `key` read `reading`, as [{ id, ja, en, start, end }],
   * or undefined while its shard has not been asked for. A reading the data
   * does not list has none: an example read another way would teach it.
   */
  function examplesOf(key, reading) {
    if (!asked.has(key)) return undefined;
    const hit = rowOf(store.get(key) || [], reading);
    return hit ? sentences(hit[1]) : [];
  }

  /** How many more examples sit behind More for `key` read `reading`: 0 when none, or before its shard is in. */
  function moreCountOf(key, reading) {
    if (!asked.has(key)) return 0;
    const hit = rowOf(store.get(key) || [], reading);
    return (hit && hit[2]) || 0;
  }

  /** The examples behind More, in the shape of examplesOf, or undefined until needMore loaded them. */
  function moreOf(key, reading) {
    if (!askedMore.has(key)) return undefined;
    const hit = rowOf(moreStore.get(key) || [], reading);
    return hit ? sentences(hit[1]) : [];
  }

  return Object.freeze({
    need, examplesOf, moreCountOf, needMore, moreOf,
  });
}

let shared = null;

/** The one loader the page shares. */
export function pageExamples() {
  if (!shared) shared = createExamples({ fetchJson: plainJson });
  return shared;
}
