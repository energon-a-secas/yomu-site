/**
 * Which JMdict entries outside the common set are shipped, and under which
 * keys.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * jmdict-eng-common is every entry with one spelling on a newspaper or word
 * list, which leaves out words a learner meets early: すもも "plum", 置き in
 * 十分おきに "every ten minutes", 帰社 in きしゃしました "went back to the
 * office". The full release has them and 196,000 other entries. Shipping
 * every kanji spelling the corpus matches three times, less the plain
 * conjugations, added 5,679 keys and 679 KB, and over 3,016 texts it made
 * the reading worse as often as better: the full release lists phrases
 * (計画を実行する), verb stems as nouns (愛し, read for every はし), words
 * with an honorific (ご注文) and compounds the analyzer already reads piece
 * by piece, and each of those, as one key, hides the pieces the notes
 * explain (docs/ANALYZER.md has the measurements).
 *
 * So an entry outside the common set ships for one of three reasons, each
 * narrow enough to measure, and only under the keys its reason names:
 *
 *   evidence  a kanji spelling of two or more characters that the corpus
 *             matches at least MIN_MATCHES times (tools/lib/freq.mjs counts
 *             it against every common key and every candidate at once), of
 *             an entry that is not an expression, and that the analyzer does
 *             not already read: no conjugation or verb or adjective stem of a
 *             common key, no common key with a particle, no honorific prefix
 *             at all, no run of common keys read the way the entry is read.
 *             The spelling becomes a key. A suffix (its first part of speech
 *             `suf` or `ctr`) whose hiragana reading is a common key is also
 *             added under that reading, which is the gap: おき was only 沖,
 *             so 十分おきに had no "every" (置き).
 *   kana      a word usually written in kana, spelled with one kanji the
 *             page ships, whose hiragana (three or more kana) is no key and
 *             no reading the analyzer already has: すもも (李). Only the kana
 *             becomes a key; 李 alone is a surname as often as a plum.
 *   suru      a common hiragana key none of whose records takes する, and the
 *             one entry outside the common set that does and is spelled with
 *             the most frequent kanji (KANJIDIC's newspaper rank): きしゃ
 *             gains 帰社 rather than 喜捨. Without it, きしゃしました has no
 *             verb to be. Only under the kana key.
 *
 * A spelling of a common entry is never a candidate, even when that spelling
 * is not itself common: 君達 is きみたち's, and shipping it as the key of
 * another entry read 君達 as きんだち, "court nobles". Kana-only and
 * katakana spellings are never evidence: the counter matches kana fragments
 * across word boundaries (は|おと counted for 羽音), and katakana in this
 * corpus is mostly names (ジョン, John, is an entry for a Korean dish).
 */
import { hasKanji, toHira } from '../../js/kana.js';
import { deinflect, deinflectStem, posMatches } from '../../js/deinflect.js';
import { countKeys } from './freq.mjs';

/**
 * The fewest greedy matches that count as evidence, chosen by measurement
 * (docs/ANALYZER.md, "Data formats", has the table). YOMU_MIN_MATCHES
 * overrides it for a measuring run; the committed data is built without it,
 * and the builder prints the N it used.
 */
export const MIN_MATCHES = Number(process.env.YOMU_MIN_MATCHES || 5);

const SKIP_KANJI = new Set(['sK', 'iK', 'oK', 'rK']);
const SKIP_KANA = new Set(['sk', 'ik', 'ok', 'rk']);
const PARTICLES = new Set([...'はにでともがをへかのや']);
const PREFIXES = ['お', 'ご', '御'];
/**
 * The first part of speech of a word that only attaches after a number or a
 * noun. Not n-suf, which is a noun as well and stands alone in the lattice:
 * 放し "leaving on" (n-suf, usually kana) read every はなし as itself.
 */
const SUFFIXES = new Set(['suf', 'ctr']);
const HIRAGANA = /^[ぁ-ゟ]+$/;

/** An entry with any spelling marked common: exactly jmdict-eng-common. */
export const isCommon = (e) => e.kanji.some((k) => k.common) || e.kana.some((k) => k.common);

const kanjiOf = (e) => e.kanji.filter((k) => !k.tags.some((t) => SKIP_KANJI.has(t)));
const kanaOf = (e) => e.kana.filter((k) => !k.tags.some((t) => SKIP_KANA.has(t)));
const posOf = (e) => e.sense.flatMap((s) => s.partOfSpeech).join(' ');
const applies = (list, text) => list.includes('*') || list.includes(text);

/**
 * What the common set already knows: each common spelling with its parts of
 * speech and its readings, every spelling a common entry has (common or
 * not), and the hiragana keys some record of which takes する.
 */
function commonIndex(words) {
  const pos = new Map();
  const readings = new Map();
  const owned = new Set();
  const vs = new Set();
  const addReading = (text, r) => {
    if (!readings.has(text)) readings.set(text, new Set());
    readings.get(text).add(toHira(r));
  };
  for (const e of words) {
    if (!isCommon(e)) continue;
    const p = posOf(e);
    const suru = e.sense.some((s) => s.partOfSpeech.includes('vs'));
    for (const k of [...e.kanji, ...e.kana]) owned.add(k.text);
    for (const k of [...e.kanji, ...e.kana]) {
      if (!k.common) continue;
      pos.set(k.text, `${pos.get(k.text) || ''} ${p}`);
      if (suru && !e.kanji.includes(k)) vs.add(k.text);
    }
  }
  // Every reading a key has in the data, which is every common entry that
  // spells it, common spelling or not: 何時 is a key because なんじ spells it
  // so, and its records include the いつ entry, which spells it 何時 too.
  for (const e of words) {
    if (!isCommon(e)) continue;
    for (const k of e.kanji) {
      if (!pos.has(k.text)) continue;
      for (const r of e.kana) if (applies(r.appliesToKanji, k.text)) addReading(k.text, r.text);
    }
    for (const k of e.kana) if (pos.has(k.text)) addReading(k.text, k.text);
  }
  return { pos, readings, owned, vs };
}

/**
 * Whether the analyzer already reads `s`: a conjugation of a common key, a
 * verb's stem standing as a noun (聞き, 焼き, 取り, which the lattice reads
 * as 聞く, 焼く and 取る), an adjective's stem (小さ), or a common key with a
 * particle after it or an honorific prefix before it.
 */
function readAlready(s, pos, depth = 0) {
  if (pos.has(s) && depth) return true;
  if (PARTICLES.has(s[s.length - 1]) && pos.has(s.slice(0, -1))) return true;
  if (/\badj-i\b/.test(pos.get(`${s}い`) || '')) return true;
  const known = (d) => pos.has(d.base) && posMatches(d.type, pos.get(d.base), d.base, true);
  if (deinflect(s).some(known) || deinflectStem(s).some(known)) return true;
  // and the same with a particle before it (と言った) or an honorific
  // prefix (お召し, the stem of 召す), once
  if (depth) return false;
  const rest = PARTICLES.has(s[0]) ? [s.slice(1)] : [];
  for (const p of PREFIXES) if (s.startsWith(p)) rest.push(s.slice(p.length));
  return rest.some((r) => r && readAlready(r, pos, 1));
}

/**
 * Whether `s` splits into two or more common keys whose readings, joined,
 * are `reading`: 天然資源 is 天然|資源 and reads てんねんしげん either way,
 * so the key would add nothing. 犬小屋 is いぬごや, not いぬ + こや, so it
 * stays a candidate: the compound voices, and only the dictionary knows.
 */
function readsAsParts(s, reading, readings, memo = new Map()) {
  const id = `${s}\u0000${reading}`;
  if (memo.has(id)) return memo.get(id);
  let ok = false;
  for (let n = 1; n < s.length && !ok; n++) {
    const head = readings.get(s.slice(0, n));
    if (!head) continue;
    for (const r of head) {
      if (!reading.startsWith(r)) continue;
      const rest = s.slice(n);
      const left = reading.slice(r.length);
      const whole = readings.get(rest);
      if ((whole && whole.has(left)) || readsAsParts(rest, left, readings, memo)) { ok = true; break; }
    }
  }
  memo.set(id, ok);
  return ok;
}

/** The newspaper rank of the rarest kanji in `s`; Infinity when one is unranked. */
function rarestKanji(s, freq) {
  let worst = 0;
  for (const ch of s) if (hasKanji(ch)) worst = Math.max(worst, freq.get(ch) ?? Infinity);
  return worst;
}

/**
 * @param {object} jmdict       the full release
 * @param {string[]} sentences  the corpus, one sentence per string
 * @param {object} kanjidic     for each kanji's newspaper rank
 * @param {Set<string>} shipped the characters build-kanji.mjs ships
 * @returns {{ extras: Map<number, Set<string>>, stats: object }} per entry
 *   index in `jmdict.words`, the keys it ships under
 */
export function selectExtra(jmdict, sentences, kanjidic, shipped) {
  const { words } = jmdict;
  const { pos, readings, owned, vs } = commonIndex(words);
  const freq = new Map(kanjidic.characters.filter((c) => c.misc.frequency != null)
    .map((c) => [c.literal, c.misc.frequency]));
  const extras = new Map();
  const add = (index, key) => {
    if (!extras.has(index)) extras.set(index, new Set());
    extras.get(index).add(key);
  };
  const stats = { candidates: 0, evidence: 0, suffix: 0, under: 0, kana: 0, suru: 0 };

  // evidence and suffix
  const cand = new Map();
  words.forEach((e, index) => {
    if (isCommon(e) || e.sense[0].partOfSpeech.includes('exp')) return;
    // A suffix counts only when its reading is written in kana as a key the
    // common set has for another word, which is the gap: おき is 沖 alone,
    // so 十分おきに had no "every". A suffix that voices (取り read どり,
    // 離れ read ばなれ) is no such gap, and as a key it read 取り下げます as
    // "samurai paid in rice" and 下げます.
    const suffix = SUFFIXES.has(e.sense[0].partOfSpeech[0])
      && kanaOf(e).some((r) => HIRAGANA.test(r.text) && pos.has(r.text));
    for (const k of kanjiOf(e)) {
      const s = k.text;
      // The honorific prefix is read as a word of its own, so its note shows
      // (ご注文 is ご|注文): a key that starts with one would hide it.
      if ([...s].length < 2 || !hasKanji(s) || owned.has(s) || PREFIXES.some((p) => s.startsWith(p))) continue;
      if (!suffix && readAlready(s, pos)) continue;
      const own = kanaOf(e).filter((r) => applies(r.appliesToKanji, s)).map((r) => toHira(r.text));
      if (own.some((r) => readsAsParts(s, r, readings))) continue;
      if (!cand.has(s)) cand.set(s, []);
      cand.get(s).push({ index, suffix });
    }
  });
  stats.candidates = cand.size;
  const counts = countKeys(sentences, new Set([...pos.keys(), ...cand.keys()]));
  for (const [s, list] of cand) {
    if ((counts.get(s) || 0) < MIN_MATCHES) continue;
    for (const { index, suffix } of list) {
      add(index, s);
      if (!suffix) { stats.evidence += 1; continue; }
      stats.suffix += 1;
      for (const k of kanaOf(words[index])) {
        if (pos.has(k.text) && HIRAGANA.test(k.text) && applies(k.appliesToKanji, s)) { add(index, k.text); stats.under += 1; }
      }
    }
  }

  // kana
  words.forEach((e, index) => {
    if (isCommon(e) || !e.sense[0].misc.includes('uk')) return;
    if (!kanjiOf(e).some((k) => [...k.text].length === 1 && shipped.has(k.text))) return;
    for (const k of kanaOf(e)) {
      if (!HIRAGANA.test(k.text) || k.text.length < 3 || pos.has(k.text) || readAlready(k.text, pos)) continue;
      add(index, k.text);
      stats.kana += 1;
    }
  });

  // suru
  const best = new Map();
  words.forEach((e, index) => {
    if (isCommon(e) || !e.sense.some((s) => s.partOfSpeech.includes('vs'))) return;
    const spellings = kanjiOf(e).filter((k) => [...k.text].every((ch) => !hasKanji(ch) || shipped.has(ch)));
    if (!spellings.length) return;
    const rank = Math.min(...spellings.map((k) => rarestKanji(k.text, freq)));
    for (const k of kanaOf(e)) {
      const key = k.text;
      if (!HIRAGANA.test(key) || !pos.has(key) || vs.has(key)) continue;
      const cur = best.get(key);
      if (!cur || rank < cur.rank) best.set(key, { index, rank });
    }
  });
  for (const [key, { index }] of best) { add(index, key); stats.suru += 1; }

  return { extras, stats };
}
