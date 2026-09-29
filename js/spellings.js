// What a word written in kana learns from its kanji spelling.
//
// A kana key's records share one q band, the count of the kana string, so
// nothing under すき says it is 好き far more often than 隙, and nothing under
// かう says 買う before 飼う: all of them tied, and the upstream's order chose
// "gap" and "to keep (a pet)". Each record's own frequency is on its kanji
// spelling, which is another key. The same spelling also knows where one
// morpheme ends inside the word: そのうち is その|内, so its o and u are two
// words' vowels (sono uchi, not sonoochi), and ていれ is 手|入れ.
//
// Until 2026-09-29 the page segmented every text twice to learn this: once
// to find its kana words, then again after fetching their kanji spellings,
// which cost a kana sentence up to 20 of the 27 shards. The builder now
// works both answers out from the whole dictionary and ships them on the
// kana record (tools/lib/prices.mjs): `b`, the band of its spelling, and
// `c`, the cuts. This file reads them, so one pass is enough and the result
// cannot depend on what an earlier paste happened to load.

import { hasKanji, isHiragana } from './kana.js';
import { classOf } from './costs.js';

/** A said line merges o + う and e + い; only those need a spelling's cuts. */
export const MERGEABLE = /[おこそとのほもよろごぞどぼぽょ]う|[えけせてねへめれげぜでべぺ]い/;

/** The price of one band between two records of one kana key. */
const BAND_STEP = 16;
/** Among records of one band, the auxiliary verb (居る, the いる of ている, over 要る) wins by this. */
const AUX_TIE = 8;
const isAuxiliary = (r) => classOf(r.p) === 'verb' && String(r.p).split(' ').includes('aux-v');

/** A band in price steps, less the tie an auxiliary wins. */
export function bandPrice(band, rec) {
  return BAND_STEP * band + (isAuxiliary(rec) ? 0 : AUX_TIE);
}

/**
 * The band a record under a kana key is priced at: its spelling's, as the
 * builder shipped it in `b`, or when there is no `b`, the kana key's own
 * band two worse, which is what the builder leaves out to save the bytes.
 */
export function recordBand(rec) {
  return rec.b !== undefined ? rec.b : (rec.q || 6) + 2;
}

/**
 * What a record under a kana key pays against the key's best record: 隙 pays
 * four bands against 好き, 飼う two against 買う. Records of one band tie,
 * except that an auxiliary wins, because the grammar leans on it.
 * COST.kanaForKanji still applies on top: a word usually written in kana is
 * the likelier reading of kana, which is what keeps うち "one's house" (家,
 * usually kana) ahead of 内.
 *
 * @param {string} key   a kana key
 * @param {object} rec   one of its records
 * @param {{ get(key: string): any }} dict
 */
export function kanaHomographCost(key, rec, dict) {
  if (hasKanji(key)) return 0;
  const recs = dict.get(key);
  if (!recs || recs.length < 2 || !recs.includes(rec)) return 0;
  const raw = recs.map((r) => bandPrice(recordBand(r), r));
  return raw[recs.indexOf(rec)] - Math.min(...raw);
}

/**
 * Where a hiragana word's kanji spelling says one morpheme ends and another
 * begins, as offsets into the word (the builder's `c`): そのうち is その|内,
 * ていれ is 手|入れ, でいりぐち is 出|入り|口. A conjugated word keeps only
 * the cuts inside the part it shares with its dictionary form.
 *
 * @param {object} node  a lattice node: surface `s`, `key`, `rec`
 * @returns {number[]}
 */
export function kanaCuts(node) {
  const s = node.s;
  const cuts = node.rec && node.rec.c;
  if (!Array.isArray(cuts) || !MERGEABLE.test(s) || ![...s].every(isHiragana)) return [];
  let same = 0;
  while (same < s.length && s[same] === node.key[same]) same++;
  return cuts.filter((c) => c > 0 && c < same);
}
