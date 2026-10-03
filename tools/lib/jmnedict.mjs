/**
 * Which JMnedict names ship, and which reading each one ships with.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * JMnedict lists 743,624 names, each a spelling, a reading and one or more
 * types, and it lists every reading a spelling has ever been given: 田中 is
 * たなか, and also たんか, だなか, でんちゅう and six more, in kana order.
 * Nothing in the file says which reading is the usual one, and a names tier
 * that read 田中 as でんちゅう would be worse than the guess it replaces. So
 * the reading is chosen by evidence the file does hold: how many other names
 * in it are built on this one with this reading. 田中 たなか starts 463 longer
 * names (田中角栄 たなかかくえい, 田中町 たなかまち), たんか starts none; 清水
 * しみず starts 350, きよみず 14. That count is `ext`, and it decides first.
 * When it ties (given names are rarely built on), a reading the characters'
 * own KANJIDIC readings can spell wins over one they cannot (秀樹 ひでき, not
 * ほつき), then the reading with more types (広子 ひろこ, a surname as well),
 * then JMnedict's order.
 *
 * What ships: spellings of two or more characters, all kanji (and 々) or all
 * katakana, typed surname, given, masc, fem or place, that the Tatoeba corpus
 * contains at least once, and that are not first-tier dictionary keys (the
 * first pass reads those as words, so the second phase never asks). One kanji
 * alone is left out: it is a word as often as a name (森, 林, 東), and the
 * first pass guesses a lone kanji only where its okurigana is unusual
 * (称える, 恐くて), never where a name is meant.
 *
 * A name is `strong` when `ext` reaches STRONG_EXT: a surname or place other
 * names are built on. The second phase lets a strong name beat a rare word
 * spelled the same (清水 しみず, not "spring water") and a weak one lose to
 * it (陸地 is りくち "land", not the place かちじ) (js/rare.js).
 */
import { isKanji, isKatakana, toHira } from '../../js/kana.js';
import { splitReading } from './split.mjs';

/** The types that ship, and the gloss id each becomes (js/names.js NAME_TYPES). */
export const KEEP_TYPES = Object.freeze({
  surname: 'surname', given: 'given', masc: 'masc', fem: 'fem', place: 'place',
});

/** The fewest names built on a reading that make it a strong name. Measured: docs/ANALYZER.md. */
export const STRONG_EXT = Number(process.env.YOMU_STRONG_EXT || 5);

const nameKanji = (ch) => isKanji(ch) && ch !== 'ヶ' && ch !== '〆';

/** A spelling the second phase can meet as one stretch: all kanji, or all katakana. */
export function shippable(text) {
  const chars = [...text];
  if (chars.length < 2) return false;
  if (chars.every(nameKanji)) return chars[0] !== '々';
  return chars.every(isKatakana) && chars[0] !== 'ー';
}

/** Every (spelling, reading) a JMnedict entry gives, with the entry's types. */
function* pairsOf(word) {
  const types = word.translation.flatMap((t) => t.type);
  if (!word.kanji.length) {
    for (const r of word.kana) yield { text: r.text, reading: r.text, types };
    return;
  }
  for (const k of word.kanji) {
    for (const r of word.kana) {
      if (r.appliesToKanji.includes('*') || r.appliesToKanji.includes(k.text)) yield { text: k.text, reading: r.text, types };
    }
  }
}

/**
 * The candidates: spelling -> reading -> { types, order }, for the spellings
 * `shippable` allows and the types KEEP_TYPES keeps.
 */
export function candidates(jmnedict) {
  const out = new Map();
  let order = 0;
  for (const w of jmnedict.words) {
    for (const p of pairsOf(w)) {
      order += 1;
      const kept = [...new Set(p.types.filter((t) => KEEP_TYPES[t]))];
      if (!kept.length || !shippable(p.text)) continue;
      if (!out.has(p.text)) out.set(p.text, new Map());
      const byReading = out.get(p.text);
      const reading = toHira(p.reading);
      if (!byReading.has(reading)) byReading.set(reading, { types: new Set(), order, ext: 0 });
      for (const t of kept) byReading.get(reading).types.add(t);
    }
  }
  return out;
}

/**
 * `ext` for every candidate reading: each longer JMnedict name (any type,
 * full names of people included) whose spelling starts with a candidate's
 * spelling and whose reading starts with one of its readings counts once,
 * for the longest such reading, so 美咲 みさき is credited with 美咲子
 * みさきこ and the shorter みさ is not.
 */
export function countExtensions(jmnedict, cands) {
  for (const w of jmnedict.words) {
    for (const p of pairsOf(w)) {
      const chars = [...p.text];
      const reading = toHira(p.reading);
      for (let n = 2; n < chars.length; n += 1) {
        const byReading = cands.get(chars.slice(0, n).join(''));
        if (!byReading) continue;
        let best = null;
        for (const r of byReading.keys()) {
          if (r.length < reading.length && reading.startsWith(r) && (!best || r.length > best.length)) best = r;
        }
        if (best) byReading.get(best).ext += 1;
      }
    }
  }
}

/**
 * Every spelling the corpus has at least once: a kanji name as a plain
 * substring, a katakana name only as a whole katakana run. A substring is
 * no evidence for katakana: アン is in every アンケート and パソ in every
 * パソコン, and a name found that way would carve a guessed run into pieces.
 */
export function attested(sentences, spellings) {
  const kanji = new Set([...spellings].filter((s) => !isKatakana(s[0])));
  const seen = substrings(sentences, kanji);
  const runs = new Set();
  for (const text of sentences) for (const m of text.matchAll(KATAKANA_RUN)) runs.add(m[0]);
  for (const s of spellings) if (isKatakana(s[0]) && runs.has(s)) seen.add(s);
  return seen;
}

const KATAKANA_RUN = /[\u30a1-\u30faー\u30fd\u30fe]+/g;

/** Every spelling that occurs in the corpus at least once, as a plain substring. */
function substrings(sentences, spellings) {
  // The lengths that exist per first character, so a position tries only those.
  const byFirst = new Map();
  for (const s of spellings) {
    if (!byFirst.has(s[0])) byFirst.set(s[0], new Set());
    byFirst.get(s[0]).add(s.length);
  }
  const seen = new Set();
  for (const text of sentences) {
    for (let i = 0; i < text.length; i += 1) {
      const lengths = byFirst.get(text[i]);
      if (!lengths) continue;
      for (const n of lengths) {
        if (i + n > text.length) continue;
        const s = text.slice(i, i + n);
        if (spellings.has(s)) seen.add(s);
      }
    }
  }
  return seen;
}

/**
 * The one reading a spelling ships with, and its record:
 * `{ r: [reading], n: 'surname place', f?, s? }`.
 *
 * @param {string} text
 * @param {Map<string, { types: Set<string>, order: number, ext: number }>} byReading
 * @param {Map} table  tools/lib/split.mjs readingTable
 */
export function recordOf(text, byReading, table) {
  const kanji = isKanji([...text][0]);
  const score = [...byReading].map(([reading, v]) => {
    const f = kanji ? splitReading(text, reading, table) : null;
    return { reading, v, f, spelled: !kanji || (f && f !== '*') ? 1 : 0 };
  });
  score.sort((a, b) => b.v.ext - a.v.ext || b.spelled - a.spelled
    || b.v.types.size - a.v.types.size || a.v.order - b.v.order);
  const best = score[0];
  const order = Object.keys(KEEP_TYPES);
  // A katakana name is read as it is written, so like a kana dictionary key
  // it carries no `r`.
  const rec = kanji ? { r: [best.reading] } : {};
  rec.n = [...best.v.types].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(' ');
  if (best.f) rec.f = best.f;
  if (best.v.ext >= STRONG_EXT) rec.s = 1;
  return { rec, ext: best.v.ext, readings: score.length };
}
