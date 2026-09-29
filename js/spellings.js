// What a word written in kana learns from its kanji spelling.
//
// A kana key's records share one q band, the count of the kana string, so
// nothing under すき says it is 好き far more often than 隙, and nothing under
// かう says 買う before 飼う: all of them tied, and the upstream's order chose
// "gap" and "to keep (a pet)". Each record's own frequency is on its kanji
// spelling, in another shard. The same spelling also knows where one
// morpheme ends inside the word: そのうち is その|内, so its o and u are two
// words' vowels (sono uchi, not sonoochi), and ていれ is 手|入れ.
//
// So analyze.js segments a text once, asks `spellingKeys` which spellings
// the kana words on that path have, loads them, and segments again with
// `spelled` set; the lattice then prices kana homographs by their spellings
// (`kanaHomographCost`) and cuts kana words where their spellings do
// (`kanaCuts`). Only spellings requested for this text are ever read, so the
// result never depends on what an earlier paste happened to load.

import { hasKanji, isHiragana, isAllKana } from './kana.js';
import { homographCost, classOf } from './costs.js';
import { align } from './furigana.js';

/** A said line merges o + う and e + い; only those need a spelling's cuts. */
const MERGEABLE = /[おこそとのほもよろごぞどぼぽょ]う|[えけせてねへめれげぜでべぺ]い/;

/** Kanji spellings a record lists, at most two, as the builder keeps them. */
const spellingsOf = (rec) => (rec && Array.isArray(rec.k) ? rec.k.slice(0, 2) : []);

/**
 * The spellings to load after a first segmentation: every spelling of every
 * record under a kana key with several records (so they can be ranked), and
 * the first spelling of a hiragana word whose reading holds a vowel pair
 * the said line would merge (so it can be cut).
 *
 * @param {object[]} tokens  the first pass's tokens (entry and base set)
 * @param {{ get(key: string): any }} dict
 * @returns {{ keys: Set<string>, kana: Set<string> }} `keys` to dict.need,
 *   `kana` the kana keys whose records may now be ranked
 */
export function spellingKeys(tokens, dict) {
  const keys = new Set();
  const kana = new Set();
  for (const t of tokens) {
    const key = t.base;
    if (!t.entry || !key || hasKanji(key) || !isAllKana(key)) continue;
    const recs = dict.get(key) || [];
    if (recs.length > 1) {
      kana.add(key);
      for (const r of recs) for (const k of spellingsOf(r)) keys.add(k);
    }
    if (MERGEABLE.test(t.reading || '') && [...t.surface].every(isHiragana)) {
      for (const k of spellingsOf(t.entry).slice(0, 1)) keys.add(k);
    }
  }
  return { keys, kana };
}

/**
 * A kana record's band, from its kanji spelling: the spelling's band, two
 * worse when that spelling is read some other way more often (入る is q1
 * because of はいる, which says nothing about いる), one worse when as often
 * (上 is うえ as readily as かみ), and two worse for a one-kanji stem
 * (stemKanji). A record with no spelling in the data has only the kana
 * key's band, which every homophone shares, so it takes that band two worse:
 * いくら "how much" ties with the salmon roe, written イクラ, and the order
 * the lattice had before decides. A word usually written in kana takes the
 * better of the two, because its spelling is rare by definition: 事 for こと
 * is q1, 蛙 for かえる q3, and 嘴 (beak, usually kana) no longer beats 橋.
 */
export function spellingBand(key, rec, dict, loaded, kanjiInfo) {
  const shared = (rec.q || 6) + 2;
  let best = Infinity;
  for (const s of spellingsOf(rec)) {
    if (!loaded.has(s)) continue;
    const recs = dict.get(s);
    const own = recs && recs.find((r) => Array.isArray(r.r) && r.r.includes(key));
    if (!own) continue;
    let band = (own.q || 6) + (stemKanji(s, kanjiInfo) ? 2 : 0);
    if (recs.length > 1) {
      if (homographCost(s, own, dict) > 0) band += 2;
      else if (recs.some((r) => r !== own && homographCost(s, r, dict) === 0)) band += 1;
    }
    best = Math.min(best, band);
  }
  if (best === Infinity) return shared;
  return rec.u ? Math.min(best, shared) : best;
}

/**
 * A spelling of one kanji whose first kun reading is the stem of a verb or
 * an adjective, which KANJIDIC writes with okurigana (うご.く for 動,
 * かた.い for 難). tools/lib/freq.mjs matches greedily and never deinflects,
 * so every 動いて and 難しかった in the corpus was counted as 動 or 難: both
 * are q1, and どう read "motion" and なん "difficulty". Such a band is taken
 * two worse. Only the first kun: 後 is first のち and あと, and its rare
 * おく.れる did not make the counter credit it with anything.
 */
function stemKanji(s, kanjiInfo) {
  if ([...s].length !== 1) return false;
  const info = kanjiInfo && kanjiInfo.get(s);
  const first = info && Array.isArray(info.kun) ? info.kun[0] : null;
  return !info || String(first || '').includes('.');
}

/** The one-kanji spellings among `keys`, whose kanji data stemKanji reads. */
export function spellingKanji(keys) {
  return [...keys].filter((k) => [...k].length === 1 && hasKanji(k));
}

/** The price of one band between two records of one kana key. */
const BAND_STEP = 16;
/** Among records of one band, the auxiliary verb (居る, the いる of ている, over 要る) wins by this. */
const AUX_TIE = 8;
const isAuxiliary = (r) => classOf(r.p) === 'verb' && String(r.p).split(' ').includes('aux-v');

/**
 * What a record under a kana key pays against the key's best record, once
 * the key's spellings are loaded: 隙 pays four bands against 好き, 飼う two
 * against 買う. Records of one band tie, except that an auxiliary wins,
 * because the grammar leans on it. COST.kanaForKanji still applies on top:
 * a word usually written in kana is the likelier reading of kana, which is
 * what keeps うち "one's house" (家, usually kana) ahead of 内.
 *
 * @param {string} key   a kana key
 * @param {object} rec   one of its records
 * @param {{ get(key: string): any }} dict
 * @param {{ kana: Set<string>, keys: Set<string>, kanji?: Map }} [spelled]  from
 *   spellingKeys, with `kanji` the kanji data of the one-kanji spellings
 */
export function kanaHomographCost(key, rec, dict, spelled) {
  if (!spelled || !spelled.kana.has(key) || hasKanji(key)) return 0;
  const recs = dict.get(key);
  if (!recs || recs.length < 2 || !recs.includes(rec)) return 0;
  const raw = recs.map((r) => kanaRecordPrice(key, r, dict, spelled.keys, spelled.kanji));
  return raw[recs.indexOf(rec)] - Math.min(...raw);
}

/**
 * One record's price under its kana key, before it is made relative to the
 * key's best record: its spelling's band in steps, and the tie an auxiliary
 * wins. tools/build-dict.mjs orders a kana key's records by this before the
 * cap, so the records the page is shipped are the ones it would pick.
 */
export function kanaRecordPrice(key, rec, dict, loaded, kanjiInfo) {
  return bandPrice(spellingBand(key, rec, dict, loaded, kanjiInfo), rec);
}

/** A band in price steps, less the tie an auxiliary wins. */
export function bandPrice(band, rec) {
  return BAND_STEP * band + (isAuxiliary(rec) ? 0 : AUX_TIE);
}

/**
 * Where a hiragana word's kanji spelling says one morpheme ends and another
 * begins, as offsets into the word: そのうち is その|内, ていれ is 手|入れ,
 * でいりぐち is 出|入り|口. Only the cut before a kanji is taken from a word
 * usually written in kana, because its okurigana can be fused into the word
 * (ありがとう is 有り難う, and its とう is one long o).
 *
 * @param {object} node  a lattice node: surface `s`, `key`, `rec`, `chain`
 * @param {{ get(key: string): any }} dict
 * @param {{ keys: Set<string> }} [spelled]
 * @returns {number[]}
 */
export function kanaCuts(node, dict, spelled) {
  const s = node.s;
  if (!spelled || !node.rec || !MERGEABLE.test(s) || ![...s].every(isHiragana)) return [];
  const spelling = spellingsOf(node.rec)[0];
  if (!spelling || !spelled.keys.has(spelling)) return [];
  const own = (dict.get(spelling) || []).find((r) => Array.isArray(r.r) && r.r[0] === node.key);
  const { furigana } = align(spelling, node.key, own ? own.f : undefined);
  const out = [];
  let at = 0;
  furigana.forEach((f, n) => {
    const kanjiStarts = !!f.ruby;
    if (n > 0 && (kanjiStarts || !node.rec.u)) out.push(at);
    at += (f.ruby || f.text).length;
  });
  // A conjugated word keeps only the cuts inside the part it shares with
  // its dictionary form.
  let same = 0;
  while (same < s.length && s[same] === node.key[same]) same++;
  return out.filter((c) => c > 0 && c < same);
}
