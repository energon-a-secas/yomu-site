// The words of a query in English and in Spanish, as looked up and as typed,
// and how the keys its words name are put together (js/search.js asks). No
// DOM, no data: the builder (tools/build-search.mjs) splits glosses with the
// same glossWords. docs/ANALYZER.md, "Search in Spanish, and romaji however
// it is typed".

import {
  foldLatin, spanishWords, spanishWordsTyped, spanishForms, typedWords, STOP_ES,
} from './search-latin.js';

/** Words that say nothing a learner searches for. The builder splits glosses with the same list. */
const STOP = new Set(`a an the to of in on at by for with from as or and be is are was
  one's someone something oneself etc e g i e s t esp usu`.split(/\s+/));

/** A gloss's (or a query's) words, lower case, with what it puts in parentheses left out. */
export function glossWords(text) {
  return String(text).toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[^a-z']+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/**
 * The words a query asks the English index for, each as typed (`shown`) and
 * as looked up (`folded`, glossWords of the query with its accents off: café
 * is cafe); on a Spanish page Spanish's stop words are no English (el gato).
 */
export function englishWordsTyped(q, lang = 'en') {
  return typedWords(q, { fold: (ch) => foldLatin(ch, { enye: false }), letter: /^[a-z']+$/ })
    .map((w) => ({ shown: w.shown.replace(/^'+|'+$/g, ''), folded: w.folded.replace(/^'+|'+$/g, '') }))
    .filter((w) => w.folded.length > 1 && !STOP.has(w.folded) && (lang !== 'es' || !STOP_ES.has(w.folded)));
}

/**
 * The words a meaning was looked up by, as the learner typed them, for a page
 * to name ("Spanish: días", "English: café"): folding is for matching only,
 * and a word shown with its accents taken off reads as a spelling mistake.
 * render-search.js and the iOS app's bridge both show these.
 */
export function askedWords(q, lang = 'en') {
  return {
    english: englishWordsTyped(q, lang).map((w) => w.shown).join(' '),
    spanish: spanishWordsTyped(q, { alone: true }).join(' '),
  };
}

/** English finding fewer common words than this asks the rare words too. */
export const RARE_WHEN = 5;

/** Keys every list names, ranked by the sum of their places; [] when none is shared. */
export function shared(lists) {
  if (!lists.length) return [];
  const score = new Map();
  lists[0].forEach((k, i) => score.set(k, i));
  for (const list of lists.slice(1)) {
    const here = new Map(list.map((k, i) => [k, i]));
    for (const k of [...score.keys()]) {
      if (here.has(k)) score.set(k, score.get(k) + here.get(k));
      else score.delete(k);
    }
  }
  return [...score].sort((a, b) => a[1] - b[1]).map(([k]) => k);
}

/** Keys every list names; the first list alone when none is shared (English). */
export function intersect(lists) {
  if (!lists.length) return [];
  const both = shared(lists);
  return both.length ? both : lists[0];
}

/** Spanish pronouns that come before a verb: the word after one is read as a verb first. */
export const CLITIC_ES = new Set(['me', 'te', 'nos', 'os']);

/** Every key the lists name, by its best place in any of them, an earlier list first among equals. */
export function byPlace(lists) {
  const best = new Map();
  lists.forEach((list, li) => list.forEach((k, i) => {
    const score = i * 64 + li;
    if (!best.has(k) || best.get(k) > score) best.set(k, score);
  }));
  return [...best].sort((a, b) => a[1] - b[1]).map(([k]) => k);
}

/**
 * A Spanish query's keys: those every word names, then, where that is
 * fewer than RARE_WHEN, those its words other than WEAK_ES name together
 * (tengo hambre is hambre's; muy bien is 詳しい, then bien's よく); and where
 * the words share nothing, each one's by place (tomar agua).
 */
export function combineSpanish(lists, weak) {
  const named = lists.filter((l) => l.length);
  const strong = lists.filter((l, i) => l.length && !weak[i]);
  const out = [...shared(named)];
  if (out.length < RARE_WHEN && strong.length && strong.length < named.length) out.push(...shared(strong));
  if (!out.length) out.push(...byPlace(strong.length ? strong : named));
  return [...new Set(out)];
}

/**
 * Whether a result's Spanish (from `dict`, createDict()'s) says the query
 * whole: one of its glosses (each comma-separated part of a sense, as the
 * index counts them) is the query's words, or the plural, feminine or verb
 * they are a form of (gatos is gato), ñ read as n. True where the Spanish
 * cannot be read, which leaves the order as it was.
 */
export async function spanishExact(dict, res, q) {
  if (typeof dict.needEs !== 'function' || typeof dict.esOf !== 'function') return true;
  const words = spanishWords(q, { alone: true });
  if (!words.length) return true;
  await dict.needEs(res.recs);
  const glosses = res.recs.flatMap((r) => dict.esOf(r) || []).flatMap((g) => String(g).split(','));
  if (!glosses.length) return true;
  // ñ counts as n, as the index files año under ano: ano is 年's año.
  const bare = (w) => w.replace(/ñ/g, 'n');
  const fits = (asked, said) => bare(asked) === bare(said)
    || Object.values(spanishForms(asked)).some((list) => list.some((x) => bare(x) === bare(said)));
  return glosses.some((g) => {
    const said = spanishWords(g, { alone: true });
    return said.length === words.length && said.every((w, i) => fits(words[i], w));
  });
}

/** Whether one of a result's English glosses is the query's words exactly (東京 is Tokyo). */
export function englishExact(res, words) {
  return words.length > 0 && res.recs.some((r) => (r.g || []).some((g) => {
    const said = glossWords(foldLatin(g, { enye: false }));
    return said.length === words.length && said.every((w, i) => w === words[i]);
  }));
}
