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
 * else is. The same holds for the people listed after them, each read from
 * its own sentences.
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
  // Read by hand on 2026-10-07 from each row's linked English sentences:
  // people JMnedict types only as places, each in one to three sentences,
  // too few for the cues. Chester (a constituency), Selma and Cana (places),
  // Randolph (a company) and Bismarck (a battleship) stay as they are.
  Object.freeze({ name: 'パークス', o: 'Parks', type: 'person', reason: 'Rosa Parks in all three sentences' }),
  Object.freeze({ name: 'カイリー', o: 'Kylie', type: 'person', reason: 'Kylie Minogue, the singer' }),
  Object.freeze({ name: 'ゲーリー', o: 'Gary', type: 'person', reason: 'a man who plays football' }),
  Object.freeze({ name: 'ダグラス', o: 'Douglas', type: 'person', reason: 'a man introducing himself' }),
  Object.freeze({ name: 'デービス', o: 'Davis', type: 'person', reason: 'Sammy Davis, the singer' }),
  Object.freeze({ name: 'ハリントン', o: 'Harrington', type: 'person', reason: 'Mr. Harrington' }),
  Object.freeze({ name: 'ハーパー', o: 'Harper', type: 'person', reason: 'a writer whose description remains imperfect' }),
  Object.freeze({ name: 'パーマー', o: 'Palmer', type: 'person', reason: 'Sally Palmer' }),
  Object.freeze({ name: 'プーシキン', o: 'Pushkin', type: 'person', reason: 'the poet, as in the Pushkin of Second Avenue' }),
  Object.freeze({ name: 'マーリー', o: 'Marley', type: 'person', reason: 'Marley, who saved Tim' }),
  Object.freeze({ name: 'ミッチェル', o: 'Mitchel', type: 'person', reason: 'Mr. Mitchel' }),
  Object.freeze({ name: 'メーソン', o: 'Mason', type: 'person', reason: 'people agreed with Mason' }),
  Object.freeze({ name: 'ロレンス', o: 'Lawrence', type: 'person', reason: 'D. H. Lawrence, the novelist' }),
  Object.freeze({ name: 'バリー', o: 'Barry', type: 'person', reason: 'Barry Taylor, put forward for chairman' }),
  Object.freeze({ name: 'カストロ', o: 'Castro', type: 'person', reason: 'Fidel Castro of Cuba' }),
  Object.freeze({ name: 'クレイトン', o: 'Creighton', type: 'person', reason: 'John Creighton, the shuttle commander' }),
  Object.freeze({ name: 'バートン', o: 'Burton', type: 'person', reason: 'R. Burton, the author of the Historical Collections' }),
  Object.freeze({ name: 'ケント', o: 'Kent', type: 'person', reason: 'a man called a born leader' }),
  Object.freeze({ name: 'アルマ', o: 'Alma', type: 'person', reason: 'a sister named Alma' }),
  Object.freeze({ name: 'マグダレナ', o: 'Magdalena', type: 'person', reason: 'a woman with blonde hair' }),
  Object.freeze({ name: 'エステバン', o: 'Esteban', type: 'person', reason: 'a man the town was named after' }),
]);

const BY_NAME = new Map(NAME_CLASSES.map((e) => [e.name, e]));

/** The authored entry for a row's katakana and Latin spellings, or null. */
export function authoredClass(name, o) {
  const e = BY_NAME.get(name);
  return e && e.o === o ? e : null;
}
