import { v } from "convex/values";

// The rows of js/sync-rules.js as Convex validators: the shape only. What a
// value may be (a kanji, a day, a count in range) is checked by the rules'
// clean* functions, which the page runs too. A kanji, a kana pair and a text
// are values here, never object keys: Convex keys are ASCII.

export const savedV = v.object({
  at: v.number(),
  box: v.number(),
  due: v.string(),
  reviews: v.number(),
  lapses: v.number(),
  s: v.number(),
});

export const seenV = v.object({
  n: v.number(),
  first: v.string(),
  last: v.string(),
  words: v.array(v.array(v.string())),
  src: v.optional(v.string()),
  h: v.optional(v.string()),
  e: v.number(),
});

export const kanjiFields = {
  char: v.string(),
  saved: v.union(savedV, v.null()),
  removed: v.number(),
  seen: v.union(seenV, v.null()),
};
export const kanjiRowV = v.object(kanjiFields);

export const phraseV = v.object({
  t: v.string(),
  first: v.number(),
  last: v.number(),
  n: v.number(),
  src: v.string(),
  saved: v.number(),
  s: v.number(),
});

export const phraseFields = {
  key: v.string(),
  removed: v.number(),
  phrase: v.union(phraseV, v.null()),
};
export const phraseRowV = v.object(phraseFields);

const gameV = v.optional(v.object({ best: v.number(), rounds: v.number() }));

export const playFields = {
  games: v.object({ which: gameV, odd: gameV, oddFree: gameV, twins: gameV, names: gameV, spaces: gameV }),
  mixed: v.array(v.object({ k: v.string(), n: v.number() })),
};
export const playV = v.object(playFields);

const textPref = v.optional(v.object({ v: v.string(), at: v.number() }));
const flagPref = v.optional(v.object({ v: v.boolean(), at: v.number() }));

export const prefsFields = {
  values: v.object({
    lang: textPref,
    furigana: flagPref,
    romaji: textPref,
    highlights: flagPref,
    unsaved: textPref,
    slow: flagPref,
  }),
};
export const prefsV = v.object(prefsFields);
