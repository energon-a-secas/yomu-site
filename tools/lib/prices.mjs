/**
 * What a record learns from other keys, worked out once here and shipped on
 * the record, so the page never fetches a second key to price the first.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * Until 2026-09-29 the page did this itself: it segmented a text, fetched the
 * kanji spelling of every kana word on that path, read their bands, and
 * segmented again; and before either pass it fetched the kana reading of
 * every kanji key with several records. A kana sentence loaded up to 20 of 27
 * shards that way, most of them for keys it never showed. Every input here is
 * in the dictionary the builder already holds, so the answer is too:
 *
 *   o  on a record of a kanji key with several records: how far down its
 *      reading's kana records this spelling sits (本 is the ほん record's
 *      first spelling and the もと record's second), 3 when the reading is
 *      a key that lists it nowhere. costs.js `homographCost` reads it.
 *   b  on a record of a kana key with several records: the band of its kanji
 *      spelling, with the discounts `spellingBand` explains. Omitted when it
 *      is the fallback the page assumes, the key's own band two worse.
 *      spellings.js `kanaHomographCost` reads it.
 *   c  on a record of a hiragana key: where its kanji spelling says one
 *      morpheme ends and the next begins, kept only where that splits a
 *      pair the said line would merge (o+う, e+い): そのうち is その|内, so
 *      it is said sonouchi. spellings.js `kanaCuts` reads it.
 */
import { hasKanji, isHiragana, isAllKana, isKatakana } from '../../js/kana.js';
import { homographCost, COST } from '../../js/costs.js';
import { bandPrice, MERGEABLE } from '../../js/spellings.js';
import { align } from '../../js/furigana.js';
import { readingsOfType, selection } from './kanjidic.mjs';

/** A band that sorts after every real one: the key was never matched. */
const UNRANKED = 6;

/** Each shipped kanji's kun readings, which spellingBand reads for its stem rule. */
export function kunTable(kanjidic) {
  return new Map(selection(kanjidic).map((c) => [c.literal, { kun: readingsOfType(c, 'ja_kun') }]));
}

/** Kanji spellings a record lists, at most two, as the builder keeps them. */
const spellingsOf = (rec) => (rec && Array.isArray(rec.k) ? rec.k.slice(0, 2) : []);

/** The band the page assumes for a record that carries no `b`. */
export const fallbackBand = (rec) => (rec.q || 6) + 2;

/**
 * `o` for one record of a kanji key: the place of `key` in the kanji lists
 * of its first reading's records, 3 when the reading is a key that does not
 * list it, and 0 when the reading is no key at all (nothing to go by).
 */
export function homographPlace(key, rec, dict) {
  const kana = rec.r && rec.r.length ? dict.get(rec.r[0]) : null;
  if (!kana) return 0;
  const places = kana.map((x) => (x.k || []).indexOf(key)).filter((n) => n >= 0);
  return places.length ? Math.min(...places) : 3;
}

/**
 * A spelling of one kanji whose first kun reading is the stem of a verb or
 * an adjective, which KANJIDIC writes with okurigana (うご.く for 動,
 * かた.い for 難). tools/lib/freq.mjs matches greedily and never deinflects,
 * so every 動いて and 難しかった in the corpus was counted as 動 or 難: both
 * are q1, and どう read "motion" and なん "difficulty". Such a band is taken
 * two worse. Only the first kun: 後 is first のち and あと, and its rare
 * おく.れる did not make the counter credit it with anything. A kanji the
 * page does not ship counts as a stem, as it did when the page looked it up.
 */
function stemKanji(s, kanjiInfo) {
  if ([...s].length !== 1) return false;
  const info = kanjiInfo && kanjiInfo.get(s);
  const first = info && Array.isArray(info.kun) ? info.kun[0] : null;
  return !info || String(first || '').includes('.');
}

/**
 * A kana record's band, from its kanji spelling: the spelling's band, two
 * worse when that spelling is read some other way more often (入る is q1
 * because of はいる, which says nothing about いる), one worse when as often
 * (上 is うえ as readily as かみ), and two worse for a one-kanji stem
 * (stemKanji), and two worse when this kana is not the spelling's first
 * reading (五 is ご first, then いつ). A record with no spelling in the data has only the kana
 * key's band, which every homophone shares, so it takes that band two worse:
 * いくら "how much" ties with the salmon roe, written イクラ. A word usually
 * written in kana takes the better of the two, because its spelling is rare
 * by definition: 事 for こと is q1, 蛙 for かえる q3, and 嘴 (beak, usually
 * kana) no longer beats 橋.
 *
 * @param {{ get(key: string): any }} dict  the records, with `o` set
 * @param {Map<string, { kun: string[] }>} kanjiInfo  the shipped kanji
 */
export function spellingBand(key, rec, dict, kanjiInfo) {
  const shared = fallbackBand(rec);
  let best = Infinity;
  for (const s of spellingsOf(rec)) {
    const recs = dict.get(s);
    const own = recs && recs.find((r) => Array.isArray(r.r) && r.r.includes(key));
    if (!own) continue;
    let band = (own.q || 6) + (stemKanji(s, kanjiInfo) ? 2 : 0);
    // One record can hold several readings, and its band is the spelling's,
    // earned mostly by the first: 五 is q2 as ご, which says nothing about
    // いつ, and いつ "when" (何時) lost to it once every kana key was priced.
    // The same two bands as a reading that sits in a record of its own.
    if (own.r[0] !== key) band += 2;
    if (recs.length > 1) {
      if (homographCost(s, own, dict) > 0) band += 2;
      else if (recs.some((r) => r !== own && homographCost(s, r, dict) === 0)) band += 1;
    }
    best = Math.min(best, band);
  }
  if (best === Infinity) return shared;
  return rec.u ? Math.min(best, shared) : best;
}

/** One record's price under its kana key: its band in steps, less an auxiliary's tie. */
export function kanaRecordPrice(key, rec, dict, kanjiInfo) {
  return bandPrice(spellingBand(key, rec, dict, kanjiInfo), rec);
}

/** MERGEABLE, anchored to exactly one pair. */
const PAIR = new RegExp(`^(?:${MERGEABLE.source})$`);

/**
 * `c` for one record of a hiragana key: where its first kanji spelling says
 * one morpheme ends and another begins, as offsets into the key. そのうち is
 * その|内, ていれ is 手|入れ, でいりぐち is 出|入り|口. Only the cut before a
 * kanji is taken from a word usually written in kana, because its okurigana
 * can be fused into the word (ありがとう is 有り難う, and its とう is one
 * long o). Empty unless the key holds a pair the said line would merge.
 */
export function kanaCutsOf(key, rec, dict) {
  if (!MERGEABLE.test(key) || ![...key].every(isHiragana)) return [];
  const spelling = spellingsOf(rec)[0];
  if (!spelling || !hasKanji(spelling)) return [];
  const own = (dict.get(spelling) || []).find((r) => Array.isArray(r.r) && r.r[0] === key);
  const { furigana } = align(spelling, key, own ? own.f : undefined);
  const out = [];
  let at = 0;
  furigana.forEach((f, n) => {
    if (n > 0 && (f.ruby || !rec.u)) out.push(at);
    at += (f.ruby || f.text).length;
  });
  // Only a cut between the two beats of a pair the said line would merge
  // changes anything (kana.js lengthens inside a segment and nowhere else),
  // so only those ship: 5,249 records carried a cut before this filter.
  return out.filter((c) => c > 0 && c < key.length && PAIR.test(key.slice(c - 1, c + 1)));
}

function byRank(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * A kana key's records in the order the corpus supports, before the cap.
 *
 * Each record is priced the way the page prices it in kana text: the band
 * of its own kanji spelling (spellingBand), plus COST.kanaForKanji when the
 * word is normally written in kanji. Common first, then that price, then
 * JMdict order. A kanji key keeps JMdict order: its records share one string
 * and so one count, and nothing in the corpus tells them apart.
 *
 * Before this, かく led with 掻く "to scratch" (usually kana, so first by
 * the kana-word rule) and 書く "to write", q1, was the seventh record and was
 * cut, so かきます read "to scratch".
 *
 * @param {{ f: object, rec: object }[]} list  in JMdict order
 */
export function byEvidence(key, list, dict, kanjiInfo) {
  if (list.length < 2 || !isAllKana(key)) return list;
  const hiragana = !isKatakana(key[0]);
  const price = ({ f, rec }) => {
    if (f.kind !== 'kana') return 0;
    // A word with no kanji spelling at all (the particle は, the
    // sentence-final もの) is what the kana key counted, so the key's band
    // is its own. The page prices it two bands worse, as a word with no
    // evidence of its own; a particle never reaches that price, because the
    // closed class supplies it (costs.js), so only the order here needs it.
    if (!rec.k) return bandPrice(rec.q || UNRANKED, rec);
    const spelled = hiragana && !rec.u ? COST.kanaForKanji : 0;
    return kanaRecordPrice(key, rec, dict, kanjiInfo) + spelled;
  };
  return list
    .map((x, n) => ({ x, order: [x.f.common ? 0 : 1, price(x), n] }))
    .sort((a, b) => byRank(a.order, b.order))
    .map(({ x }) => x);
}

/** Set `o` on every record of every kanji key with several records. */
export function stampPlaces(view) {
  const dict = { get: (k) => view.get(k) };
  for (const [key, recs] of view) {
    if (recs.length < 2 || !hasKanji(key)) continue;
    for (const rec of recs) {
      const o = homographPlace(key, rec, dict);
      if (o) rec.o = o; else delete rec.o;
    }
  }
}

/**
 * Stamp `o`, `b` and `c` on the records the page is shipped, computed from
 * those same records, so they say what the page would have worked out from
 * the shards itself.
 */
export function stampShipped(entries, kanjiInfo) {
  stampPlaces(entries);
  const dict = { get: (k) => entries.get(k) };
  const stats = { o: 0, b: 0, c: 0 };
  for (const [key, recs] of entries) {
    for (const rec of recs) {
      if (rec.o) stats.o += 1;
      if (!hasKanji(key) && recs.length > 1) {
        const b = spellingBand(key, rec, dict, kanjiInfo);
        if (b !== fallbackBand(rec)) { rec.b = b; stats.b += 1; }
      }
      const c = kanaCutsOf(key, rec, dict);
      if (c.length) { rec.c = c; stats.c += 1; }
    }
  }
  return stats;
}
