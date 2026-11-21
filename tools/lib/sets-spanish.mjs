/**
 * The Spanish of a collection row (data/sets/, tools/build-sets.mjs): the
 * meanings data/es/dict holds for the dictionary record the row is. Shared by
 * the builder and the checker, which holds every row to it.
 *
 * A row is JMdict's entry for an idiom, a proverb or a four-character idiom;
 * the dictionary files the same entry as a record under the row's written
 * form, in the first tier or the second, and tools/build-spanish.mjs put that
 * record's Spanish beside it. Records carry no JMdict id, so the record is
 * the one that reads the row's reading, and of two, the one whose first
 * gloss opens the row's. Its Spanish is its entry's, never paired with the
 * row's English senses (docs/ANALYZER.md, "Which Spanish"), at most SET_ES
 * meanings as the English keeps two.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 */
import { toHira } from '../../js/kana.js';
import { esSrc } from './spanish.mjs';

/** At most this many Spanish meanings on a row, as it keeps two English ones. */
export const SET_ES = 2;

const opens = (gloss, g) => !!g && String(gloss).startsWith(String(g).replace(/…$/, ''));

/**
 * The Spanish meanings of a row [written, reading, glosses], or null.
 * @param {(key: string) => ({ recs: object[], es: (string[]|0)[] } | null)} recordsOf
 *   a key's records and their Spanish, in the files' order
 */
export function rowSpanish([written, reading, glosses], recordsOf) {
  const found = recordsOf(written);
  if (!found || !Array.isArray(found.es)) return null;
  const want = toHira(reading || written);
  const first = (glosses && glosses[0]) || '';
  const fits = found.recs.map((rec, i) => ({ rec, i }))
    .filter(({ rec }) => (Array.isArray(rec.r) ? rec.r.map(toHira) : [toHira(written)]).includes(want))
    .sort((a, b) => opens(first, (b.rec.g || [])[0]) - opens(first, (a.rec.g || [])[0]) || a.i - b.i);
  for (const { i } of fits) {
    const es = found.es[i];
    if (Array.isArray(es) && es.length) return es.slice(0, SET_ES);
  }
  return null;
}

/**
 * recordsOf over files a caller reads: `read(src)` returns a parsed data
 * file or null. The first tier first, then the rare words; a key in both is
 * the first tier's, as the reader reads it.
 * @param {(src: string) => object|null} read
 * @param {Set<string>} keys  the keys to keep
 */
export function recordsFrom(read, keys) {
  const out = new Map();
  const index = read('data/dict/index.json');
  const rare = read('data/dict/rare.json');
  const files = [
    ...(index ? [index.core.src, ...index.shards.map((s) => s.src)] : []),
    ...(rare ? rare.shards.map((s) => s.src) : []),
  ];
  for (const src of files) {
    const doc = read(src);
    const es = read(esSrc(src));
    if (!doc) continue;
    for (const key of Object.keys(doc.entries)) {
      if (!keys.has(key) || out.has(key)) continue;
      out.set(key, { recs: doc.entries[key], es: (es && es.entries[key]) || [] });
    }
  }
  return (key) => out.get(key) || null;
}
