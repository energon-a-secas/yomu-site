// Sound rule drills: the sound rules (notes-sounds.js) as cards to go
// through one at a time, quickly, as Naninani's owner asked on build 15 ("to
// memorize them or review them one by one, very fast"): each card is one
// rule, its first example said on arrival, with Back, Next and Replay, and
// the rule's other examples and its exception as the words that go with it.
// A drill to memorize and review, not a quiz: no score, no schedule and
// nothing kept. In the order the sound rules are listed, or mixed with a
// seed. Pure functions, no DOM (docs/LEARNING.md, Sound rule drills).

import { SOUND_NOTES, noteFor } from './notes.js';
import { currentLang } from './strings.js';
import { makeRand, shuffle } from './play-rounds.js';

/** The rules, in the order Sound rules lists them (kana-detail.js soundRules). */
export const DRILL_RULES = Object.freeze(Object.keys(SOUND_NOTES));
export const DRILL_ORDERS = Object.freeze(['rules', 'mixed']);

/**
 * The drill's cards, one per sound rule that has an example: { id, title,
 * rule, example, related, exception }, `example` the one said on arrival
 * and `related` the rule's other examples, each { ja, said, spelled, gloss,
 * kana } as the note has it. `order` 'rules' keeps the list's order and
 * 'mixed' shuffles it with `seed`; anything else is 'rules'. In `lang`,
 * the current language by default.
 */
export function soundDrill({ lang = currentLang(), order = 'rules', seed = 1 } = {}) {
  const mixed = order === 'mixed';
  const ids = mixed ? shuffle(DRILL_RULES, makeRand(seed)) : [...DRILL_RULES];
  const cards = [];
  for (const id of ids) {
    const note = noteFor('sound', id, lang);
    const examples = note && Array.isArray(note.examples) ? note.examples.filter((e) => e && typeof e.ja === 'string' && e.ja) : [];
    if (!examples.length) continue;
    cards.push({ id, title: note.title, rule: note.rule || '', example: examples[0], related: examples.slice(1), exception: note.exception || null });
  }
  return { order: mixed ? 'mixed' : 'rules', cards };
}
