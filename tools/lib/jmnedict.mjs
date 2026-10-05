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
 * in it use this one with this reading. Two counts, added together:
 *
 *   ext  longer names that start with it: a full name (田中角栄 たなかかくえい),
 *        a place or a station named after it (田中町 たなかまち). 田中 たなか
 *        starts 463, たんか none; 清水 しみず 350, きよみず 14. Another given
 *        name does not count (美咲央 みさお is not 美咲 and 央, and 26 of
 *        them made 美咲 みさ), nor does a name JMnedict left unclassified;
 *        a katakana name counts only as the first word of a full name
 *        (ジョン・ウェイン, ジョンウェイン), because バグダッド is not built
 *        on バグ and made バグ look like a name a word should lose to;
 *   suf  full names that end with it after a surname: 宇佐美恵子 うさみけいこ
 *        is 宇佐美 and 恵子 けいこ. Given names are rarely built on, so this
 *        is their evidence: 恵子 けいこ 31, えこ none, where the tie went to
 *        えこ for having two types.
 *
 * When the evidence ties, a reading the characters' own KANJIDIC readings
 * can spell wins over one they cannot (秀樹 ひでき, not ほつき), then the
 * reading with more types, then JMnedict's order. A spelling whose best
 * reading is one of the types that do not ship (相模 さがみ is typed only
 * `person`; さがみこ, a surname, has 6 against its 42) does not ship at all:
 * a guess the page calls a guess is better than the wrong name read with
 * confidence.
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
 * it (陸地 is りくち "land", not the place かちじ) (js/rare.js). `S` marks
 * the ones built on at least SURE_EXT times, by people as well as places,
 * which beat a rare word read another way too (金子 かねこ, not きんす
 * "money"; 中吉, with 8, is ちゅうきち, a fortune slip's "middling luck").
 */
import { isKanji, isKatakana, toHira } from '../../js/kana.js';
import { unshippable } from './licence.mjs';
import { splitReading } from './split.mjs';

/** The types that ship, and the gloss id each becomes (js/names.js NAME_TYPES). */
export const KEEP_TYPES = Object.freeze({
  surname: 'surname', given: 'given', masc: 'masc', fem: 'fem', place: 'place',
});

/**
 * A type that ships for a katakana spelling only: JMnedict's `person`, the
 * name of one particular person (ナポレオン, アイスキュロス). A kanji spelling
 * typed only `person` stays out, as before: 相模 さがみ is typed so, and a
 * kanji compound JMnedict lists as someone is a word as often as not.
 */
export const KATAKANA_TYPES = Object.freeze({ person: 'person' });

/**
 * A name as it is written in Latin letters: letters of the Latin script
 * (accented ones too: José, Zürich), single spaces, hyphens and apostrophes
 * between them (Abu Dhabi, Jean-Paul, O'Brien). data/names/popular.json and
 * tools/check-data.mjs hold the `o` of a name record to it.
 */
export const LATIN_NAME = /^\p{Script=Latin}+(?:(?: |-|'|’)\p{Script=Latin}+)*$/u;

/**
 * A katakana name's spellings in Latin letters: its JMnedict translations,
 * in order, that are a name in Latin letters once one trailing parenthesis
 * is cut off (ハナ "Hana (Hawaii)" is Hana; JMnedict glosses most places
 * so), read only from the translations of a type that ships (ジル is "Gil"
 * unclassified and "Jill, Jiru" a woman's name, and ships as the woman's).
 * A name whose translations are all something else (イエメン "(Republic of)
 * Yemen") has none, and the page shows only its types.
 */
export function latinOf(word, kept) {
  return [...latinTypesOf(word, kept).keys()];
}

/**
 * The same spellings, in the same order, each with the types of the
 * translations (JMnedict's senses) that list it, kept types only: キャシー is
 * "Casei" a surname and "Cathy, Kathy, Cassie" a woman's name, so Cathy is
 * `fem` and not `surname`; リヨン is "Lyon" a place and "Riyon" a woman's
 * name. A record's types lead with the ones of the sense its `o` came from
 * (recordOf), which is what the Word panel names first and the game's type.
 */
export function latinTypesOf(word, kept) {
  const out = new Map();
  for (const t of word.translation) {
    const types = (t.type || []).filter(kept);
    if (!types.length) continue;
    for (const x of t.translation || []) {
      const s = String(x.text || '').replace(/\s*\([^()]*\)$/, '').trim();
      if (!LATIN_NAME.test(s) || unshippable(s)) continue;
      if (!out.has(s)) out.set(s, new Set());
      for (const ty of types) out.get(s).add(ty);
    }
  }
  return out;
}

/**
 * The spelling a name shows when the corpus says nothing: the first of
 * latinOf. JMnedict's order is no evidence (ケイト is "Keito, Cate, Kate",
 * マリア "Malhia, Maria"), so tools/build-names.mjs chooses among the
 * spellings by the English translations of the sentences that hold the
 * name (tools/lib/original.mjs) and falls back to this.
 */
export function originalOf(word, kept) {
  return latinOf(word, kept)[0] || null;
}

/** The fewest names built on a reading that make it a strong name. Measured: docs/ANALYZER.md. */
export const STRONG_EXT = Number(process.env.YOMU_STRONG_EXT || 5);

/**
 * The fewest names built on a surname that let it beat a rare word read
 * another way. Judged over the 198 strong surnames that are also a rare word
 * with another reading (docs/ANALYZER.md): from about 20 the name is what a
 * text means (金子, 神田, 山形, 下田, 飛鳥, 利根); below it the word is as
 * often meant (中吉, 大安, 市井, 日当, 平原, 落石).
 */
export const SURE_EXT = Number(process.env.YOMU_SURE_EXT || 20);

/** Types of a longer name that say nothing about a shorter one it starts with. */
const NOT_BUILT_ON = new Set(['given', 'masc', 'fem', 'unclass']);

/** JMnedict's given-name types. */
const GIVEN_TYPES = new Set(['given', 'masc', 'fem']);

/** What separates the words of a katakana full name: ジョン・ウェイン, ジャン＝ポール. */
const SEPARATOR = /[・＝=]/;

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
 * The candidates: spelling -> reading -> { types, order, ext, suf, by }, for
 * the spellings `shippable` allows that have at least one reading of a type
 * KEEP_TYPES keeps. Every reading of such a spelling is a candidate, kept
 * types or not (`types` then empty), so that a reading the evidence prefers
 * and the tier cannot type still stops a weaker one shipping (相模).
 */
export function candidates(jmnedict) {
  const out = new Map();
  let order = 0;
  for (const w of jmnedict.words) {
    for (const p of pairsOf(w)) {
      order += 1;
      if (!shippable(p.text)) continue;
      if (!out.has(p.text)) out.set(p.text, new Map());
      const byReading = out.get(p.text);
      const reading = toHira(p.reading);
      if (!byReading.has(reading)) {
        byReading.set(reading, {
          types: new Set(), order, ext: 0, suf: 0, gext: 0, by: { surname: 0, place: 0 },
        });
      }
      const v = byReading.get(reading);
      const katakana = isKatakana(p.text[0]);
      let kept = false;
      for (const t of p.types) {
        if (KEEP_TYPES[t] || (katakana && KATAKANA_TYPES[t])) { v.types.add(t); kept = true; }
      }
      // The first entry, in JMnedict's order, that types the spelling as a
      // name that ships and spells it in Latin letters gives its `o`.
      // Every spelling in Latin letters, entry by entry in JMnedict's order
      // (`latin`); the first is `o` until the corpus chooses another.
      // `latinTypes` keeps, for each spelling, the types of the senses that
      // list it, over every entry of the spelling.
      if (katakana && kept) {
        if (!v.latin) { v.latin = []; v.latinTypes = new Map(); }
        for (const [o, types] of latinTypesOf(w, (t) => KEEP_TYPES[t] || KATAKANA_TYPES[t])) {
          if (!v.latin.includes(o)) { v.latin.push(o); v.latinTypes.set(o, new Set()); }
          for (const t of types) v.latinTypes.get(o).add(t);
        }
        if (v.o === undefined && v.latin.length) v.o = v.latin[0];
      }
    }
  }
  for (const [text, byReading] of out) {
    if (![...byReading.values()].some((v) => v.types.size)) out.delete(text);
  }
  return out;
}

/**
 * Every surname spelling of kanji, one character or more, with its readings:
 * where a full name of a person splits into a surname and a given name.
 */
export function surnames(jmnedict) {
  const out = new Map();
  for (const w of jmnedict.words) {
    for (const p of pairsOf(w)) {
      if (!p.types.includes('surname') || ![...p.text].every(nameKanji)) continue;
      if (!out.has(p.text)) out.set(p.text, new Set());
      out.get(p.text).add(toHira(p.reading));
    }
  }
  return out;
}

/** The longest candidate reading of `byReading` that `reading` extends, or null. */
function extended(byReading, reading) {
  let best = null;
  for (const r of byReading.keys()) {
    if (r.length < reading.length && reading.startsWith(r) && (!best || r.length > best.length)) best = r;
  }
  return best;
}

/**
 * `ext` and `suf` for every candidate reading (see the top of this file),
 * and `by`, which of its types the ext came from: a full name or a surname
 * built on it is evidence for `surname`, a place or a station for `place`.
 *
 * @param {object} jmnedict
 * @param {Map} cands     from candidates()
 * @param {Map} family    from surnames()
 */
export function countExtensions(jmnedict, cands, family = new Map()) {
  for (const w of jmnedict.words) {
    for (const p of pairsOf(w)) {
      const chars = [...p.text];
      const reading = toHira(p.reading);
      const builtOn = p.types.some((t) => !NOT_BUILT_ON.has(t));
      const person = p.types.includes('person');
      if (isKatakana(chars[0])) {
        if (builtOn) creditKatakana(p.text, person, cands);
        continue;
      }
      const given = !builtOn && p.types.some((t) => GIVEN_TYPES.has(t));
      if (builtOn || given) {
        for (let n = 2; n < chars.length; n += 1) {
          const byReading = cands.get(chars.slice(0, n).join(''));
          if (!byReading) continue;
          const best = extended(byReading, reading);
          if (!best || cutInside(chars, n, reading, cands)) continue;
          const v = byReading.get(best);
          if (given) { v.gext += 1; continue; }
          v.ext += 1;
          if (person || p.types.includes('surname')) v.by.surname += 1;
          if (p.types.includes('place') || p.types.includes('station')) v.by.place += 1;
        }
      }
      if (person) creditGiven(chars, reading, cands, family);
    }
  }
}

/**
 * Whether a longer name is better cut inside its first `n` characters: a
 * later part of it, from inside them to its end, is itself a candidate read
 * the way the longer name ends. 東大井 ひがしおおい is 東 and 大井, not 東大
 * and 井, and the places named 東 + something made 東大 read ひがしおお
 * (154 of them) instead of とうだい.
 */
function cutInside(chars, n, reading, cands) {
  for (let m = 1; m < n; m += 1) {
    const tail = cands.get(chars.slice(m).join(''));
    if (tail && [...tail.keys()].some((r) => r.length < reading.length && reading.endsWith(r))) return true;
  }
  return false;
}

/**
 * A katakana full name credits its first word: up to the separator where
 * it has one, else the longest candidate it starts with (トムハンクス is トム,
 * アンナカレーニナ is アンナ and not アン). Anything else that starts with a
 * katakana name was not built on it: バグダッド, バラク, アイザック.
 */
function creditKatakana(text, person, cands) {
  const cut = text.search(SEPARATOR);
  let first = null;
  if (cut > 0) first = text.slice(0, cut);
  else if (person) {
    for (let n = text.length - 1; n >= 2; n -= 1) {
      if (cands.has(text.slice(0, n))) { first = text.slice(0, n); break; }
    }
  }
  if (!first || !cands.has(first)) return;
  const v = cands.get(first).get(toHira(first));
  if (v) v.ext += 1;
}

/**
 * A full name of a person credits its given name: every way it splits into
 * a JMnedict surname (read one of its surname readings) and a candidate
 * read with what is left of the reading. Each given name once per full name.
 */
function creditGiven(chars, reading, cands, family) {
  const seen = new Set();
  for (let m = 1; m <= chars.length - 2; m += 1) {
    const given = cands.get(chars.slice(m).join(''));
    const readings = family.get(chars.slice(0, m).join(''));
    if (!given || !readings) continue;
    for (const r of readings) {
      if (!reading.startsWith(r)) continue;
      const v = given.get(reading.slice(r.length));
      if (v && !seen.has(v)) { v.suf += 1; seen.add(v); }
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
 * `{ r: [reading], n: 'surname place', f?, s?, S? }`, or null when the
 * reading the evidence chooses is of a type the tier does not ship.
 *
 * The types are listed most evidenced first, so the page names a place a
 * place before it names it a surname (函館 is built on by places, 田中 by
 * full names, 花子 ends full names), and the order KEEP_TYPES gives breaks
 * a tie.
 *
 * @param {string} text
 * @param {Map<string, { types: Set<string>, order: number, ext: number, suf: number, by: object }>} byReading
 * @param {Map} table  tools/lib/split.mjs readingTable
 */
export function recordOf(text, byReading, table) {
  const kanji = isKanji([...text][0]);
  const score = [...byReading].map(([reading, v]) => {
    const f = kanji && v.types.size ? splitReading(text, reading, table) : null;
    return { reading, v, f, spelled: !kanji || (f && f !== '*') ? 1 : 0 };
  });
  score.sort((a, b) => (b.v.ext + b.v.suf) - (a.v.ext + a.v.suf) || b.v.gext - a.v.gext
    || b.spelled - a.spelled || b.v.types.size - a.v.types.size || a.v.order - b.v.order);
  const best = score[0];
  const evidence = best.v.ext + best.v.suf + best.v.gext;
  if (!best.v.types.size) return { rec: null, evidence, readings: score.length };
  const order = [...Object.keys(KEEP_TYPES), ...Object.keys(KATAKANA_TYPES)];
  const weight = (t) => (t === 'surname' ? best.v.by.surname : t === 'place' ? best.v.by.place : best.v.suf);
  // A katakana name is read as it is written, so like a kana dictionary key
  // it carries no `r`; it carries `o`, how it is written in Latin letters.
  const rec = kanji ? { r: [best.reading] } : {};
  // A katakana name's types lead with those of the sense its `o` came from:
  // キャシー Cathy is a woman's name before a surname (Casei is the surname).
  const lead = (!kanji && best.v.o && best.v.latinTypes && best.v.latinTypes.get(best.v.o)) || new Set();
  rec.n = [...best.v.types].sort((a, b) => (lead.has(b) ? 1 : 0) - (lead.has(a) ? 1 : 0)
    || weight(b) - weight(a) || order.indexOf(a) - order.indexOf(b)).join(' ');
  if (best.f) rec.f = best.f;
  if (!kanji && best.v.o) rec.o = best.v.o;
  if (best.v.ext >= STRONG_EXT) rec.s = 1;
  // Sure: built on often, and by people, not only by places: 東大 starts 50
  // place names (東 + 大井 and the like that cutInside does not catch) and
  // one full name, and is とうだい, the university, in every text.
  if (best.v.ext >= SURE_EXT && best.v.by.surname >= STRONG_EXT) rec.S = 1;
  return { rec, evidence, readings: score.length };
}
