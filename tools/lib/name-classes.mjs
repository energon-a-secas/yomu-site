/**
 * The Name decoder's class for a few katakana names, written by hand where
 * no evidence the corpus holds can reach them (data/names/popular.json,
 * tools/lib/popular.mjs rowType).
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * JMnedict types ロミオ, フランツ and ノラ only `place`, and neither measured
 * rule moves them (docs/ANALYZER.md, "The popular names"): no sentence puts
 * an honorific after them or a title before them, and their English holds
 * too few cues of one kind. ロミオ has one person cue and one place cue,
 * フランツ none (the surname follows the name every time), and ノラ is in a
 * single English sentence, which can never make the two cues a verdict
 * needs. A rule tuned until it reached them would be fitted to three rows,
 * so their class is written down here, each with its reason, and nothing
 * else is.
 *
 * An entry names both spellings, the katakana and the Latin one the row
 * must carry: a rebuild that spells the name another way does not inherit
 * the class, and the build log says the entry was not applied. The authored
 * class decides before the honorifics and the English cues, and only the
 * class: it never puts a row in the file or keeps one out, and it is held to
 * the checker's bounds like any other (popularProblems: `person` over a
 * person's name or a place of the tier, `place` only over a spelling the
 * tier types a place among its types). The names tier, and so the Word
 * panel, keeps JMnedict's types.
 *
 * Written for Yomu and public domain (CC0). No sentence of the corpus is
 * copied here.
 */

/** `{ name, o, type, reason }`: katakana, Latin spelling, the row type, why. */
export const NAME_CLASSES = Object.freeze([
  Object.freeze({ name: 'ロミオ', o: 'Romeo', type: 'person', reason: 'Romeo of Romeo and Juliet, the play most of its sentences name' }),
  Object.freeze({ name: 'フランツ', o: 'Franz', type: 'person', reason: 'a man\'s given name: Franz Liszt, the composer, in every sentence' }),
  Object.freeze({ name: 'ノラ', o: 'Nora', type: 'person', reason: 'a woman\'s name: its one sentence is about Nora and her mother' }),
]);

const BY_NAME = new Map(NAME_CLASSES.map((e) => [e.name, e]));

/** The authored entry for a row's katakana and Latin spellings, or null. */
export function authoredClass(name, o) {
  const e = BY_NAME.get(name);
  return e && e.o === o ? e : null;
}
