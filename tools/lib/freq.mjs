/**
 * The `q` field: how often a dictionary key turns up in real sentences.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * jmdict-eng-common marks an entry common or not, which is one bit. A reader
 * wants more than that: whether a word is one a learner meets every day or one
 * that is merely printed in newspapers. Tatoeba's Japanese sentences are a large,
 * openly licensed corpus of everyday Japanese, so the keys are counted
 * over them and the count becomes a band.
 *
 * The count is a greedy longest match, the crudest segmenter there is: at each
 * position take the longest key that starts there, count it, jump past it. It
 * over-counts short kana keys that are really pieces of longer words and it
 * never deinflects, so 食べた is never counted as 食べる. That is acceptable for a
 * band (the band is five buckets, not a rank), and it is the reason the band
 * edges are wide. Nothing of the corpus ships: only the band.
 */

export const BANDS = [
  [1, 1000],
  [2, 3000],
  [3, 8000],
  [4, 20000],
];

/** Count greedy longest matches of `keys` over every sentence. */
export function countKeys(sentences, keys) {
  // Lengths that exist per first character, longest first, so a position
  // tries only the lengths some key starting with that character has.
  const byFirst = new Map();
  for (const k of keys) {
    const f = k[0];
    if (!byFirst.has(f)) byFirst.set(f, new Set());
    byFirst.get(f).add(k.length);
  }
  const lengths = new Map();
  for (const [f, set] of byFirst) lengths.set(f, [...set].sort((a, b) => b - a));

  const counts = new Map();
  for (const text of sentences) {
    let i = 0;
    while (i < text.length) {
      const ls = lengths.get(text[i]);
      let hit = 0;
      if (ls) {
        for (const n of ls) {
          if (i + n <= text.length && keys.has(text.slice(i, i + n))) { hit = n; break; }
        }
      }
      if (hit) {
        const k = text.slice(i, i + hit);
        counts.set(k, (counts.get(k) || 0) + 1);
        i += hit;
      } else {
        i += 1;
      }
    }
  }
  return counts;
}

/**
 * Counts to bands. Ranked by count, ties broken by plain string order so two
 * runs over the same corpus give the same file. A key never matched has no
 * band at all, which the page reads as "unranked", not as "rare".
 */
export function bandsOf(counts) {
  const ranked = [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out = new Map();
  ranked.forEach(([k], rank) => {
    const band = BANDS.find(([, edge]) => rank < edge);
    out.set(k, band ? band[0] : 5);
  });
  return out;
}

/** The text column of a Tatoeba per-language export: id, lang, text. */
export function sentencesOf(tsv) {
  const out = [];
  for (const line of tsv.split('\n')) {
    const tab = line.indexOf('\t', line.indexOf('\t') + 1);
    if (tab > 0) out.push(line.slice(tab + 1).trim());
  }
  return out;
}
