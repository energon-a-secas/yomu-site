/**
 * The second tier: every JMdict entry and spelling the first tier does not
 * ship, in range shards of its own behind key filters of its own.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * The first tier is jmdict-eng-common and the few entries outside it that
 * tools/lib/extra.mjs argues for, and it is what every text is read with.
 * Letting the rest of JMdict into that lattice made the reading worse (at
 * N=3 はし read 愛し and くじ read 九時), so the rest goes here instead, and
 * the page reads it only in a second phase, only for the stretches the first
 * pass could not read (a name guess, a katakana run with no record, a kana
 * nothing explains), and never for a token the first pass read from the
 * first tier (js/rare.js). A text with no guess never fetches a file of it.
 *
 * "Not shipped" is per spelling: an entry whose common spelling is a first
 * tier key ships its other spellings here (リンゴ, the katakana spelling of
 * 林檎, which is りんご in the first tier), and a first tier key that hides
 * records past the six-record cap, or rare entries spelled the same, has
 * them here under the same key. Search-only spellings (sK, sk), which the
 * first tier never makes keys, are keys here (see ODD).
 *
 * Records are the first tier's (tools/lib/records.mjs) with two marks: `e`
 * when the key is a kana spelling of a common word (リンゴ, カギ, ブドウ: the
 * word is everyday, only the script is not, so it deserves more trust than a
 * rare word), and `t`, the record's place among its key's records after the
 * first, which the second phase prices so that no reading depends on the
 * order the array happens to have. A kanji spelling of a common word gets no
 * `e`: 上気 is a rare way to write 浮気 "infidelity", and with the mark it
 * read 顔が上気した ("her face flushed") as an affair.
 *
 * The order `t` encodes is evidence, strongest first: a spelling JMdict does
 * not tag irregular, outdated or rarely used; a spelling that is its entry's
 * headword (上気 is じょうき's own, and only a variant of 浮気); `e`; how often
 * the corpus matched the record's own spelling; then JMdict's order.
 */
import { isAllKana, hasKanji } from '../../js/kana.js';
import { recordFor, rank, byRank, stats } from './records.mjs';
import { isCommon } from './extra.mjs';

export const RARE_FORMAT = 'yomu-dict-rare/1';
export const RARE_INDEX_FORMAT = 'yomu-dict-rare-index/1';

/**
 * The most records a second-tier key keeps. Measured: the keys with the
 * most entries are sounds of a syllable or two (こう 51 in all of JMdict,
 * かん 41, し 40, しょう 40), which the second phase never offers in a
 * stretch of kana (a word there needs three kana) and rarely meets as
 * anything else; twelve keeps every record of all but 82 of the 432,897 keys.
 */
export const MAX_RARE_RECORDS = 12;

/**
 * Every spelling of every entry, minus the (entry, spelling) pairs the first
 * tier shipped. `shipped` holds `${index}\t${key}` for each.
 *
 * @returns {Map<string, object[]>} key -> the forms that will be its records
 */
export function rareForms(words, shipped) {
  const forms = new Map();
  const push = (text, f) => {
    if (shipped.has(`${f.index}\t${text}`)) return;
    if (!forms.has(text)) forms.set(text, []);
    forms.get(text).push(f);
  };
  words.forEach((entry, index) => {
    const entryCommon = isCommon(entry);
    entry.kanji.forEach((k, n) => {
      push(k.text, {
        entry, index, kind: 'kanji', common: k.common, entryCommon, head: n === 0, odd: k.tags.some((t) => ODD.has(t)),
      });
    });
    entry.kana.forEach((k, n) => {
      push(k.text, {
        entry, index, kind: 'kana', common: k.common, entryCommon, head: n === 0, odd: k.tags.some((t) => ODD.has(t)),
      });
    });
  });
  return forms;
}

/**
 * Spellings JMdict tags irregular (iK, ik), outdated (oK, ok), rarely used
 * (rK, rk) or search-only (sK, sk). The first tier ships none of them as a
 * key; here they ship and are filed last. Search-only is how JMdict marks
 * ホント and ギョウザ, which are what people write: a dictionary searches
 * them, and a reader meets them, so this tier reads them as 本当 and 餃子.
 */
const ODD = new Set(['iK', 'ik', 'oK', 'ok', 'rK', 'rk', 'sK', 'sk']);

/** How often the corpus matched a record's own spelling: the key, or for a kana key its kanji spellings. */
function matched(key, rec, counts) {
  if (!isAllKana(key) || !rec.k) return counts.get(key) || 0;
  return Math.max(0, ...rec.k.filter(hasKanji).map((s) => counts.get(s) || 0));
}

/**
 * The second tier's records, key by key, filed by evidence and capped.
 *
 * @param {Map<string, object[]>} forms  from rareForms
 * @param {Map} table              tools/lib/split.mjs readingTable
 * @param {Map<string, number>} counts  greedy corpus matches over both tiers' keys
 * @returns {{ entries: Map<string, object[]>, capped: number, records: number }}
 */
export function rareEntries(forms, table, counts) {
  const entries = new Map();
  let capped = 0;
  let records = 0;
  for (const [key, list] of forms) {
    const recs = [];
    for (const f of list) {
      const rec = recordFor(key, f, table);
      if (!rec.g.length) { stats.emptyG += 1; continue; }
      if (f.entryCommon && f.kind === 'kana' && !f.odd) rec.e = 1;
      recs.push({ f, rec, n: matched(key, rec, counts) });
    }
    if (!recs.length) continue;
    const order = ({ f, rec, n }) => [f.odd ? 1 : 0, f.head ? 0 : 1, rec.e ? 0 : 1, -n];
    recs.sort((a, b) => byRank(order(a), order(b)) || byRank(rank(a.f, key), rank(b.f, key)));
    if (recs.length > MAX_RARE_RECORDS) capped += 1;
    const kept = recs.slice(0, MAX_RARE_RECORDS).map(({ rec }, t) => (t ? { ...rec, t } : rec));
    records += kept.length;
    entries.set(key, kept);
  }
  return { entries, capped, records };
}

/**
 * Filter parts over sorted keys, `perPart` contiguous keys each, so a lookup
 * fetches the one part whose range holds its key. A part covers from its
 * `first` to the next part's, and the last part to its own `last`; a key
 * past that is covered by no filter, and its shard is fetched on sight.
 *
 * @param {string[]} keys  sorted in plain JS string order
 * @returns {{ first: string, last: string, keys: Set<string> }[]}
 */
export function filterParts(keys, perPart) {
  const parts = [];
  for (let i = 0; i < keys.length; i += perPart) {
    const slice = keys.slice(i, i + perPart);
    parts.push({ first: slice[0], last: slice[slice.length - 1], keys: new Set(slice) });
  }
  return parts;
}
