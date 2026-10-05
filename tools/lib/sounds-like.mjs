/**
 * The sound-alike word list and its odds, worked out from the committed
 * dictionary shards (js/sounds-like.js says what the page does with them).
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. It reads data/dict/ as committed,
 * both tiers, and nothing upstream: no download, no cache, no corpus. The
 * builder (tools/build-sounds-like.mjs) and the measurement
 * (tools/measure-sounds-like.mjs) share these functions, so what is measured
 * is what ships.
 *
 *   words     every English word a record uses as a whole gloss, cut the way
 *             the loanword rules cut one (`englishOf` in js/loan-align.js:
 *             no parenthesis, nothing after a semicolon, no leading "to" or
 *             article), with how many records use it. A word inside a longer
 *             gloss does not count, and the five words the house style bans
 *             are left out.
 *   loanwords the katakana records whose English it is fair to ask for: a
 *             katakana key whose first record has no kanji spelling and is
 *             not usually written in kana, whose `ls` is absent or English,
 *             whose hiragana is no key with a kanji spelling (カメ is 亀, a
 *             Japanese word written in katakana), and whose first gloss is
 *             one English word: ショップ "shop".
 *   pieces    for each loanword whose gloss lines up with its own katakana
 *             (`lineUp` in js/sounds-like.js), what each English spelling
 *             was written with: `{ english: { katakana: count } }`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { englishOf } from '../../js/loan-align.js';
import { isKatakana, toHira } from '../../js/kana.js';
import { lineUp } from '../../js/sounds-like.js';
import { BANNED_WORDS } from './licence.mjs';

const allKatakana = (s) => s.length > 0 && [...s].every(isKatakana);

/** Every record of the committed dictionary, both tiers: key -> records. */
export function readDictionary(dataDir) {
  const dir = path.join(dataDir, 'dict');
  const out = new Map();
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/^(core|w\d+|r\d+)\.json$/.test(name)) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    for (const [key, recs] of Object.entries(doc.entries || {})) out.set(key, (out.get(key) || []).concat(recs));
  }
  return out;
}

/** A gloss as one English word, cut the way the loanword rules cut it, or null. */
export function oneWord(gloss) {
  const [cut] = englishOf({ g: [gloss] });
  return cut && cut.words.length === 1 ? cut.text : null;
}

/** The words the records of `dict` use as a whole gloss, with how many records use each, less the keys in `held`. */
export function glossWords(dict, held = new Set()) {
  const out = new Map();
  for (const [key, recs] of dict) {
    if (held.has(key)) continue;
    for (const rec of recs) {
      const seen = new Set((rec.g || []).map(oneWord).filter((w) => w && w.length > 1 && !BANNED_WORDS.test(w)));
      for (const w of seen) out.set(w, (out.get(w) || 0) + 1);
    }
  }
  return out;
}

/** The loanwords (see the header): `{ key, gold }`, gold the first gloss's word and an English `ls` word. */
export function loanwords(dict) {
  const out = [];
  for (const [key, recs] of dict) {
    if (!allKatakana(key) || [...key].length < 2) continue;
    const rec = recs[0];
    if (rec.k || rec.u || (rec.ls && rec.ls[0] !== 'eng')) continue;
    if ((dict.get(toHira(key)) || []).some((r) => r.k)) continue;
    const word = oneWord((rec.g || [])[0] || '');
    if (!word) continue;
    const gold = [word];
    const source = rec.ls && rec.ls[1] ? oneWord(rec.ls[1]) : null;
    if (source && source !== word) gold.push(source);
    out.push({ key, gold });
  }
  return out;
}

/** The pieces of every loanword in `list` whose first gloss lines up with its katakana. */
export function countPieces(list) {
  const counts = {};
  let lined = 0;
  for (const { key, gold } of list) {
    const al = lineUp(key, gold[0]);
    if (!al) continue;
    lined += 1;
    for (const [eng, kana] of al.pieces) {
      const row = (counts[eng] ||= {});
      row[kana] = (row[kana] || 0) + 1;
    }
  }
  return { counts, lined };
}

/**
 * Which half of the measurement a loanword is in, by a hash of its key, so
 * the split never moves: half `train` (the odds are counted on it), a
 * quarter `dev` (the rule was set on it) and a quarter `test` (read once).
 */
export function splitOf(key) {
  return ['train', 'train', 'dev', 'test'][createHash('sha1').update(key).digest()[0] % 4];
}
