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
 * So an entry outside the common set ships for one of four reasons, each
 * narrow enough to measure, and only under the keys its reason names (the
 * fourth, mixed, is selectMixed at the end of this file):
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
 *             so 十分おきに had no "every" (置き). 何 and a counter (何階,
 *             何個) is held to every test but the run of common keys: the
 *             analyzer reads it as one number token whatever the key says,
 *             and the key lends that token its gloss ("what floor").
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
 * A spelling the corpus has as a strong name read another way (上野 うえの,
 * not the province こうずけ) is no evidence either: see `nameOf` below.
 *
 * A spelling of a common entry is never a candidate, even when that spelling
 * is not itself common: 君達 is きみたち's, and shipping it as the key of
 * another entry read 君達 as きんだち, "court nobles". Kana-only and
 * katakana spellings are never evidence: the counter matches kana fragments
 * across word boundaries (は|おと counted for 羽音), and katakana in this
 * corpus is mostly names (ジョン, John, is an entry for a Korean dish).
 */
import {
  hasKanji, toHira, toKata, isKanji, isHiragana,
} from '../../js/kana.js';
import { deinflect, deinflectStem, posMatches } from '../../js/deinflect.js';
import { countedEnd } from '../../js/numbers.js';
import { countKeys } from './freq.mjs';

/**
 * The fewest greedy matches that count as evidence, chosen by measurement
 * (docs/ANALYZER.md, "Data formats", has the table). YOMU_MIN_MATCHES
 * overrides it for a measuring run; the committed data is built without it,
 * and the builder prints the N it used.
 */
export const MIN_MATCHES = Number(process.env.YOMU_MIN_MATCHES || 5);

/**
 * Rules switched off for a measuring run, by name: `mixed` (selectMixed) and
 * `asked` (何 and a counter on evidence), comma separated in YOMU_RULES_OFF.
 * docs/ANALYZER.md measured each against the build without it; the committed
 * data is built with every rule on.
 */
export const RULES_OFF = new Set(String(process.env.YOMU_RULES_OFF || '').split(',').filter(Boolean));

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
 * @param {(s: string) => ({ r?: string[], s?: number } | null)} [nameOf]
 *   the names-tier record a spelling would have (tools/lib/jmnedict.mjs)
 * @returns {{ extras: Map<number, Set<string>>, stats: object }} per entry
 *   index in `jmdict.words`, the keys it ships under
 */
export function selectExtra(jmdict, sentences, kanjidic, shipped, nameOf = () => null) {
  const { words } = jmdict;
  const { pos, readings, owned, vs } = commonIndex(words);
  const freq = new Map(kanjidic.characters.filter((c) => c.misc.frequency != null)
    .map((c) => [c.literal, c.misc.frequency]));
  const extras = new Map();
  const add = (index, key) => {
    if (!extras.has(index)) extras.set(index, new Set());
    extras.get(index).add(key);
  };
  const stats = {
    candidates: 0, evidence: 0, suffix: 0, under: 0, kana: 0, suru: 0, named: [], asked: [],
  };

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
      // 何 and a counter (何階 "what floor", 何個) is read by rule as one
      // number token, whatever the dictionary has (js/numbers.js), so its
      // parts reading the same way says nothing: as a key it never takes the
      // span from the number (a key spelled like a counted number pays
      // COST.numberKey), it lends the number token its gloss.
      const asked = !RULES_OFF.has('asked') && s[0] === '何' && countedEnd(s, 0) === s.length;
      if (!asked && own.some((r) => readsAsParts(s, r, readings))) continue;
      if (!cand.has(s)) cand.set(s, []);
      cand.get(s).push({ index, suffix, asked });
    }
  });
  stats.candidates = cand.size;
  const counts = countKeys(sentences, new Set([...pos.keys(), ...cand.keys()]));
  for (const [s, list] of cand) {
    if ((counts.get(s) || 0) < MIN_MATCHES) continue;
    // The corpus counts a spelling, not a word: 上野 is matched for Ueno, the
    // place and surname, and shipped under its one dictionary entry it read
    // every 上野 as Kōzuke, a former province (こうずけ). A spelling that is
    // a name nearly every text means (`S` in tools/lib/jmnedict.mjs, the
    // same bar js/rare.js sets for a name to beat a word read another way),
    // read another way than every entry here, is not evidence for them; it
    // stays out of the first tier, and the second phase reads it.
    const name = nameOf(s);
    if (name && name.S && name.r && !list.some(({ index }) => kanaOf(words[index])
      .some((r) => applies(r.appliesToKanji, s) && toHira(r.text) === name.r[0]))) {
      stats.named.push(`${s} ${name.r[0]}`);
      continue;
    }
    for (const { index, suffix, asked } of list) {
      add(index, s);
      if (asked) stats.asked.push(s);
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

// ── mixed ─────────────────────────────────────────────────────────────────

/** Kanji, then one run of hiragana, then kanji: あめ色, ひと昔前, 国じゅう. */
const isMixed = (s) => {
  const cs = [...s];
  return cs.some(isKanji) && cs.some(isHiragana) && cs.every((ch) => isKanji(ch) || isHiragana(ch));
};

/** The fewest kana the hiragana part of a mixed spelling needs: one kana is a particle or a sound as often as a word. */
const MIXED_MIN_KANA = 2;

/**
 * Where a mixed spelling writes in hiragana what an all-kanji spelling of
 * the same entry writes in kanji: あめ色 and 飴色 share 色, and あめ is 飴.
 * Returns { at, kana, kanji } (`at` is where the kana starts) or null.
 */
function kanaFor(s, spellings) {
  for (const k of spellings) {
    let p = 0;
    while (p < s.length && p < k.length && s[p] === k[p]) p += 1;
    let q = 0;
    while (q < s.length - p && q < k.length - p && s[s.length - 1 - q] === k[k.length - 1 - q]) q += 1;
    const kana = s.slice(p, s.length - q);
    // 々 repeats the kanji before it: 程ほど is 程々, and its ほど is 程.
    const kanji = [...k.slice(p, k.length - q)].map((ch, n) => (ch === '々' ? (n ? k[p + n - 1] : k[p - 1]) : ch)).join('');
    if (kana && kanji && [...kana].every(isHiragana) && [...kanji].every(isKanji)) return { at: p, kana, kanji };
  }
  return null;
}

/**
 * The fourth reason, read after the first three have been built, because it
 * asks what the first tier does with a word's kana.
 *
 *   mixed  a spelling that writes part of a word in hiragana and the rest
 *          in kanji (あめ色 for 飴色, amber), from an entry outside the
 *          common set that is no expression, where the first tier would read
 *          the hiragana part as another word: its first record there (the
 *          one a context-free first pass picks, `firstRecord`) is spelled
 *          with another kanji than the one the entry writes there. あめ is
 *          雨 "rain" first, so あめ色のバッグ read "rain" and 色 with no
 *          guess anywhere, and the second phase, which reads only guesses,
 *          never saw it. The evidence rule leaves such a spelling out on
 *          purpose (its parts are common keys read the way the word is
 *          read), which is right where the parts mean what the word means
 *          and wrong here. The hiragana part needs MIXED_MIN_KANA kana, and
 *          the spelling passes every other test of the evidence rule but
 *          the corpus count: no common spelling, no honorific prefix, no
 *          conjugation or stem of a common key, no common key with a
 *          particle. No count is asked for, because the spellings this is
 *          for are the ones the corpus has too few of to argue for (あめ色
 *          is in no Tatoeba sentence, アメ色 in one).
 *
 *          The same spelling with its hiragana part in katakana (アメ色)
 *          ships too, folded onto the hiragana one: the same records under
 *          a key JMdict does not list, unless the key is already a spelling
 *          of some JMdict entry. People write the colour アメ色, and in
 *          katakana the first pass guessed アメ, and the second phase found
 *          the prefix アメ, "American".
 *
 *          Which entry a spelling means is asked apart from whether it
 *          ships (`claim`, below): JMdict spells several words the same.
 *
 * @param {object} jmdict
 * @param {(kana: string) => (object | undefined)} firstRecord  the first
 *   tier's first record of a hiragana key, as the first three reasons built it
 * @param {Set<string>} taken  every key the first tier already has
 * @param {string[]} [sentences]  the corpus, for `claim`; without it every
 *   entry the test chose keeps its spelling
 * @returns {{ extras: Map<number, Set<string>>, folds: Map<string, { index: number, spelling: string }>, stats: object }}
 */
export function selectMixed(jmdict, firstRecord, taken, sentences = []) {
  const { words } = jmdict;
  const { pos, owned } = commonIndex(words);
  const spelled = new Set();
  for (const e of words) for (const k of [...e.kanji, ...e.kana]) spelled.add(k.text);
  const extras = new Map();
  const folds = new Map();
  const stats = {
    mixed: 0, folded: 0, sample: [], claimed: [],
  };
  if (RULES_OFF.has('mixed')) return { extras, folds, stats };
  words.forEach((e, index) => {
    if (isCommon(e) || e.sense[0].partOfSpeech.includes('exp')) return;
    const whole = kanjiOf(e).map((k) => k.text).filter((s) => [...s].every(isKanji));
    if (!whole.length) return;
    for (const k of kanjiOf(e)) {
      const s = k.text;
      if (!isMixed(s) || owned.has(s) || taken.has(s) || PREFIXES.some((p) => s.startsWith(p)) || readAlready(s, pos)) continue;
      const cut = kanaFor(s, whole);
      if (!cut || [...cut.kana].length < MIXED_MIN_KANA) continue;
      // Kana that start with a particle right after a kanji are the particle
      // in nearly every text: 何がし "a certain amount" read 何がしたい as
      // 何がし|たい, and 友達がい "true friendship" 友達がいなかった.
      if (cut.at > 0 && PARTICLES.has(cut.kana[0])) continue;
      const rec = firstRecord(cut.kana);
      if (!rec || !rec.k || !rec.k.length || rec.k[0] === cut.kanji) continue;
      if (!extras.has(index)) extras.set(index, new Set());
      extras.get(index).add(s);
      stats.mixed += 1;
      if (stats.sample.length < 12) stats.sample.push(`${s} (${cut.kana} is ${rec.k[0]} first)`);
      const fold = s.slice(0, cut.at) + toKata(cut.kana) + s.slice(cut.at + cut.kana.length);
      if (!spelled.has(fold) && !taken.has(fold) && !folds.has(fold)) {
        folds.set(fold, { index, spelling: s });
        stats.folded += 1;
      }
    }
  });
  claim(words, extras, folds, sentences, taken, stats);
  return { extras, folds, stats };
}

/**
 * The entries a shipped mixed spelling belongs to. The test above asks a
 * question of the spelling (does the first tier read its kana as another
 * word?), and every entry JMdict spells that way shares the answer; but the
 * test reaches an entry only through an all-kanji spelling it may show, and
 * 付き物 "something that always comes with it" has one, 付物, marked
 * search-only. So つき物 shipped for 憑き物 "evil spirit" alone, and
 * 疲労がつき物 read as one. Here every entry outside the common set that is
 * no expression and lists the spelling is weighed by how often the corpus
 * matches its other spellings, greedily among the first tier's keys (付き物
 * twice, 憑き物 never), and the spelling and its fold go to those matched
 * most. Where none is matched (かん水, sprinkling or lye water), the entries
 * the test chose keep it, as before.
 */
function claim(words, extras, folds, sentences, taken, stats) {
  const chosen = new Map();
  for (const [index, keys] of extras) {
    for (const s of keys) {
      if (!chosen.has(s)) chosen.set(s, new Set());
      chosen.get(s).add(index);
    }
  }
  const listers = new Map();
  words.forEach((e, index) => {
    if (isCommon(e) || e.sense[0].partOfSpeech.includes('exp')) return;
    for (const k of kanjiOf(e)) {
      if (!chosen.has(k.text)) continue;
      if (!listers.has(k.text)) listers.set(k.text, []);
      listers.get(k.text).push(index);
    }
  });
  const contested = [...listers].filter(([, list]) => list.length > 1);
  if (!contested.length || !sentences.length) return;
  const others = (index, s) => kanjiOf(words[index]).map((k) => k.text).filter((t) => t !== s);
  const counts = countKeys(sentences, new Set([...taken, ...contested.flatMap(([s, list]) => list.flatMap((i) => others(i, s)))]));
  for (const [s, list] of contested) {
    const score = new Map(list.map((i) => [i, others(i, s).reduce((n, t) => n + (counts.get(t) || 0), 0)]));
    const best = Math.max(...score.values());
    if (!best) continue;
    const win = list.filter((i) => score.get(i) === best);
    const was = chosen.get(s);
    if (win.length === was.size && win.every((i) => was.has(i))) continue;
    for (const i of was) {
      extras.get(i).delete(s);
      if (!extras.get(i).size) extras.delete(i);
    }
    for (const i of win) {
      if (!extras.has(i)) extras.set(i, new Set());
      extras.get(i).add(s);
    }
    for (const fold of folds.values()) if (fold.spelling === s && !win.includes(fold.index)) [fold.index] = win;
    stats.claimed.push(`${s} ${kanjiOf(words[win[0]])[0].text}`);
  }
}
