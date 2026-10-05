/**
 * Which of a katakana name's JMnedict spellings a learner is shown: the one
 * Tatoeba's English translations write.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * JMnedict lists a katakana name's translations in no useful order: ケイト
 * is "Keito, Cate, Kate", マリア "Malhia, Maria, Mariya, Marya", トム "Tom,
 * Thom, Tomu". Taking the first taught Keito and Malhia; counting a
 * translation across every JMnedict entry favours the Japanese
 * romanizations (Keito 73 entries, Kate 4). The corpus has better
 * evidence: a Japanese sentence that holds トム is linked to English
 * sentences that write Tom. So, for each name, over the English sentences
 * linked to the Japanese sentences that hold it as a whole katakana run
 * (the way the names tier counts a katakana name as attested), each
 * spelling counts the sentences it appears in as a whole word, case and
 * all, capitalised; the most frequent wins, a tie goes to JMnedict's order,
 * and a name no spelling of which is ever seen keeps the first
 * (jmnedict.mjs originalOf). Nothing of the corpus ships: the spelling is
 * JMnedict's, only the choice among its spellings is Tatoeba's.
 */

const KATAKANA_RUN = /[ァ-ヺーヽヾ]+/g;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A whole-word, case-sensitive pattern for one spelling, its first letter
 * capitalised: Tom matches "Tom" and "Tom's", never "Tomorrow" or "tom".
 */
export function spellingPattern(spelling) {
  const cap = spelling.charAt(0).toUpperCase() + spelling.slice(1);
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escape(cap)}(?![\\p{L}\\p{M}\\p{N}])`, 'u');
}

/**
 * The spelling the English sentences use most, from `spellings` (JMnedict's
 * Latin translations of the name, in its order), and how it was decided:
 * `{ o, by: 'evidence', seen }` when some spelling is seen (`seen`, the
 * number of sentences the chosen one is in), `{ o, by: 'first', seen: 0 }`
 * when none is, or there are no sentences.
 */
export function chooseOriginal(spellings, english) {
  const list = [...new Set(spellings)];
  if (!list.length) return null;
  let best = null;
  if (english && english.length) {
    for (const s of list) {
      const re = spellingPattern(s);
      let n = 0;
      for (const text of english) if (re.test(text)) n += 1;
      if (n && (!best || n > best.seen)) best = { o: s, by: 'evidence', seen: n };
    }
  }
  return best || { o: list[0], by: 'first', seen: 0 };
}

/** Rows of a Tatoeba per-language export, `id \t lang \t text`, as [id, text]. */
export function sentenceRows(tsv) {
  const out = [];
  for (const line of tsv.split('\n')) {
    const a = line.indexOf('\t');
    const b = line.indexOf('\t', a + 1);
    if (a > 0 && b > a) out.push([line.slice(0, a), line.slice(b + 1).trim()]);
  }
  return out;
}

/**
 * For the katakana spellings asked about, the English sentences linked to
 * the Japanese sentences that hold each as a whole katakana run, each
 * English sentence once per name.
 *
 * @param {Set<string>} names     katakana spellings
 * @param {Array<[string, string]>} japanese  [id, text]
 * @param {string} links    jpn-eng_links.tsv: Japanese id \t English id
 * @param {string} englishTsv  eng_sentences.tsv
 * @returns {Map<string, string[]>}
 */
export function englishFor(names, japanese, links, englishTsv) {
  const byName = new Map();
  for (const [id, text] of japanese) {
    for (const run of new Set(text.match(KATAKANA_RUN) || [])) {
      if (!names.has(run)) continue;
      if (!byName.has(run)) byName.set(run, []);
      byName.get(run).push(id);
    }
  }
  const linked = new Map();
  for (const line of links.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const j = line.slice(0, tab);
    if (!linked.has(j)) linked.set(j, []);
    linked.get(j).push(line.slice(tab + 1).trim());
  }
  const wanted = new Set();
  for (const ids of byName.values()) for (const j of ids) for (const e of linked.get(j) || []) wanted.add(e);
  const english = new Map();
  for (const [id, text] of sentenceRows(englishTsv)) if (wanted.has(id)) english.set(id, text);
  const out = new Map();
  for (const [name, ids] of byName) {
    const seen = new Set();
    for (const j of ids) for (const e of linked.get(j) || []) if (english.has(e)) seen.add(e);
    out.set(name, [...seen].map((e) => english.get(e)));
  }
  return out;
}
