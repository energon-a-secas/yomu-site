// Spanish meanings beside the English ones, for the analysis and for the
// lookups a screen makes (docs/ANALYZER.md, "Spanish meanings").
//
// A meaning never changes language. Its Spanish sits beside it in `es`, an
// object holding the Spanish of the English fields around it under the same
// names: a dictionary record's `es` is { g } beside its `g`, a kanji's { m }
// beside its `m`, a word on a kanji page { gloss } beside its `gloss`. Where
// JMdict or KANJIDIC has no Spanish, the field (or `es` itself) is missing,
// and the English beside it is the meaning to show, said to be English.
// Records and kanji are shared by every text that meets them, so whatever
// carries `es` is a copy: no shard is ever written to.
//
// No DOM. analyze.js calls addSpanish only when it is asked for Spanish
// (analyze(text, { meanings: 'es' })), so nothing here runs for a reader in
// English, and no Spanish file is fetched for one.

import { NAME_TYPES } from './name-types.js';
import { wordsSpelled } from './rare.js';

/** `obj` with `es` beside its English, or `obj` itself when there is no Spanish. */
export function withEs(obj, es) {
  return es && typeof es === 'object' && Object.keys(es).length ? { ...obj, es } : obj;
}

/** A name's types in Spanish (name-types.js), beside the English its entry carries as `g`. */
function nameTypesEs(nt) {
  const g = [...new Set(nt.filter((t) => NAME_TYPES[t]).map((t) => NAME_TYPES[t].es))];
  return g.length ? { g } : null;
}

/**
 * The analysis with Spanish beside its English: each token's dictionary
 * record, each part of a katakana compound and the parts' meanings joined,
 * a name's types and the word a name is also, and each kanji's meanings.
 * Loads the Spanish files those need, once each, and never rejects for one
 * it cannot load: those meanings stay English.
 *
 * @param {{ tokens: object[], kanji: object[] }} result  analyze()'s result, changed in place
 * @param {object} dict  the dictionary the analysis read (createDict)
 */
export async function addSpanish(result, dict) {
  if (!dict || typeof dict.needEs !== 'function') return result;
  const records = new Set();
  const alsoOf = new Map(); // a name's entry -> the rare word its `also` is
  for (const t of result.tokens) {
    const e = t.entry;
    if (e) {
      records.add(e);
      if (e.also) {
        const w = wordsSpelled(t.surface, dict)[0];
        if (w) { alsoOf.set(e, w); records.add(w); }
      }
    }
    for (const p of t.parts || []) if (p.entry) records.add(p.entry);
  }
  const chars = result.kanji.map((k) => k.char);
  const [, kanjiEs] = await Promise.all([
    dict.needEs([...records]),
    chars.length ? dict.kanjiEs(chars) : Promise.resolve(new Map()),
  ]);

  const copies = new Map();
  const entryEs = (e) => {
    if (!copies.has(e)) {
      const name = e.p === 'n-pr' && Array.isArray(e.nt);
      const g = name ? null : dict.esOf(e);
      let out = withEs(e, name ? nameTypesEs(e.nt) : g && { g });
      const also = alsoOf.get(e);
      const ag = also ? dict.esOf(also) : null;
      if (ag) out = { ...out, also: { ...e.also, es: { g: ag.slice(0, 2) } } };
      copies.set(e, out);
    }
    return copies.get(e);
  };

  for (const t of result.tokens) {
    if (t.entry) t.entry = entryEs(t.entry);
    if (!Array.isArray(t.parts)) continue;
    t.parts = t.parts.map((p) => {
      const entry = p.entry ? entryEs(p.entry) : null;
      return entry && entry.es && entry.es.g ? { ...p, entry, es: { gloss: entry.es.g[0] } } : p;
    });
    // As the English `gloss` joins every part's (tennis + tournament), only
    // when each part has one.
    if (t.parts.length && t.parts.every((p) => p.es)) t.es = { gloss: t.parts.map((p) => p.es.gloss).join(' + ') };
  }
  for (const k of result.kanji) {
    const m = kanjiEs.get(k.char);
    if (m && k.info) k.info = { ...k.info, es: { m } };
  }
  return result;
}

/**
 * A kanji page's words (kanji-page-data.js pageOf) with the Spanish of each
 * (wordsEs, in the same order) beside its gloss.
 */
export function wordsWithEs(words, list) {
  return words.map((w, i) => (Array.isArray(list) && typeof list[i] === 'string' && list[i] ? { ...w, es: { gloss: list[i] } } : w));
}
