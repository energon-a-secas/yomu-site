// Search: a word by its Japanese, its romaji, its English or its Spanish,
// and a kanji by its parts. No DOM.
//
// Japanese is looked up the way the reader reads a word: the key as typed,
// in hiragana and in katakana, and every dictionary form deinflect.js finds
// for it (食べた finds 食べる), in the first tier, then the rare words and
// the names. A Japanese query is read as Japanese only.
//
// Latin letters are tried in every reading that can apply, and the results
// merged: what the letters spell as typed first, then a meaning every word
// of the query names (the learner's language first), then what romaji
// spells with an edit, so in English house is 家 before 法制 (ほうせい, a
// long vowel put in), and in Spanish gato is 猫. A word romaji spells as
// typed stays first (sake is さけ; in Spanish it follows the first meaning:
// manga is 袖, then 漫画).
//
// - Romaji is turned into kana however it is typed (search-latin.js): spaces
//   do not matter, a particle written as said or a long vowel left out is
//   an edit, and the reading with the fewest edits that a first-tier word
//   spells whole wins (konnichiwa is こんにちは, gakko 学校). When no word
//   spells it whole, it is a sentence typed together and the reader's own
//   analyzer reads it (search-romaji.js, search-sentence.js): its words come back in order,
//   with the sentence, so a page can offer to read it. A sentence is
//   offered only where it reads as one: no guess, a word and a particle,
//   the copula or an inflection, and no meaning index that names every
//   word of the query (agua is Spanish, not ああ具ああ); and only where the
//   reading is one to trust, since a wrong sentence is worse than none
//   (search-grammar.js trusted). A sure name reads as the name (tanaka is
//   田中), and a syllable still being typed is held back (kyouw is kyou).
// - English goes through data/search/ (tools/build-search.mjs): each word of
//   the query names the dictionary keys whose glosses use it, and a query
//   of several words keeps the keys every word names. When nothing common
//   is found, the rare words' index (data/search/xNNN.json) adds up to
//   RARE_MAX more, each drawn from its index row, so no rare shard is fetched.
// - Spanish goes through data/search/es.json and sNN.json the same way,
//   from JMdict's and KANJIDIC's Spanish (data/es/), its words folded
//   (search-latin.js spanishWords) and each also read as the words it may be
//   a form of (spanishForms: libros, roja, bebo). The rare words have no
//   Spanish index: their Spanish covers one key in eight (docs/ANALYZER.md).
//   An English learner sees Spanish only where English and romaji found
//   nothing, and a Spanish one English only where it names every word. The
//   kanji the first Spanish words share come first (comer: 食), and a word
//   the query only sits inside the Spanish of does not lead over one whose
//   English or romaji is the query (tokyo is 東京 before 東京証券取引所).
//
// Every result keeps its records as the dictionary has them (English `g`),
// and says how it was reached (`via`); showing a meaning in Spanish is the
// page's (render-search.js) and the app's. The query is never stored and
// never put in the address.

import { createRangeStore } from './range-store.js';
import {
  toHira, toKata, isJapanese, isKanji,
} from './kana.js';
import { deinflect, posMatches } from './deinflect.js';
import { currentLang } from './strings.js';
import {
  spanishWords, spanishForms, romajiReading, heldRomaji, WEAK_ES,
} from './search-latin.js';
import {
  englishWordsTyped, askedWords, intersect, byPlace, combineSpanish, spanishExact, englishExact, CLITIC_ES, RARE_WHEN,
} from './search-meaning.js';
import { createRomajiSearch } from './search-romaji.js';

export {
  foldLatin, spanishWords, spanishWordsTyped, romajiKana, romajiKanas, romajiReading, romajiVariants, heldRomaji, looseRomaji, STOP_ES,
} from './search-latin.js';
export {
  glossWords, englishWordsTyped, askedWords, RARE_WHEN,
} from './search-meaning.js';


/**
 * How a result is written and read: a kana key under its usual kanji
 * spelling (the record's first `k`), unless the dictionary says the word is
 * usually written in kana (`u`); then its key, read as its record says. Here,
 * not in render-search.js, so the iOS app's bridge asks the same rule.
 */
export function writtenOf(res, rec = (res.recs && res.recs[0]) || {}) {
  const kana = ![...res.key].some(isKanji);
  const written = kana && Array.isArray(rec.k) && rec.k.length && !rec.u ? rec.k[0] : res.key;
  const reading = written === res.key ? (Array.isArray(rec.r) && rec.r[0]) || res.key : res.key;
  return { written, reading };
}

/**
 * One card per word: a kana key whose records are different words (さけ is
 * 酒 and 鮭) gives one result per record, each written its own way.
 */
export function byWord(results) {
  return results.flatMap((res) => {
    const kana = ![...res.key].some(isKanji);
    if (res.via === 'name' || !kana || res.recs.length < 2) return [res];
    const spelled = res.recs.map((r) => writtenOf(res, r).written);
    if (new Set(spelled).size < 2) return [res];
    return res.recs.map((r) => Object.freeze({ ...res, recs: [r] }));
  });
}

/** At most this many words in one answer. */
export const MAX_RESULTS = 40;
/** At most this many rare words in one English answer. */
export const RARE_MAX = 10;
/** At most this many kanji offered for a meaning. */
export const KANJI_MAX = 10;
export { ROMAJI_READINGS, ROMAJI_EDITS, SENTENCE_MAX } from './search-romaji.js';

/**
 * A record drawn from a rare index row [key, reading, glosses, pos, more]:
 * enough for a card, never a dictionary record (no furigana split, no tier
 * fields the reader reads).
 */
export function rareRecord(row) {
  const [, reading, g, p, more] = row;
  return Object.freeze({
    ...(reading ? { r: [reading] } : {}), g: [...g], p, tier: 2, more: more || 0,
  });
}

/**
 * What a query is: `ja` (it has Japanese in it), `romaji` (Latin letters
 * that spell kana, which may be English or Spanish too), `en` (Latin letters
 * that are not romaji: English or Spanish), or `empty`.
 */
export function queryKind(q) {
  const s = String(q || '').trim();
  if (!s) return 'empty';
  if ([...s].some(isJapanese)) return 'ja';
  return romajiReading(s) ? 'romaji' : 'en';
}

/** The keys a Japanese query asks for: as typed, in both scripts, and its dictionary forms. */
export function japaneseKeys(q) {
  const s = String(q || '').trim();
  const keys = new Set([s, toHira(s), toKata(s)]);
  const bases = [];
  for (const d of deinflect(s)) {
    if (!keys.has(d.base)) bases.push(d);
    keys.add(d.base);
  }
  return { keys: [...keys].filter(Boolean), bases };
}

/** How a record of a result is written and read, as one string: a card shown twice is one card. */
const cardOf = (res, rec) => {
  if (res.via === 'name') return `name:${res.key}`;
  const { written, reading } = writtenOf(res, rec);
  return `${written}|${toHira(reading)}`;
};

/**
 * `lists` of results as one list, each card once, the first list's first: a
 * word a reading already found is left out of a later one, and a kana key's
 * record another reading found is left out of its records (sake: 酒 by its
 * Spanish, then さけ by its romaji keeps 鮭). Records are the dictionary's.
 */
export function mergeResults(lists) {
  const seen = new Set();
  const keys = new Set();
  const out = [];
  for (const list of lists) {
    for (const res of list || []) {
      if (keys.has(res.key) && res.via !== 'name') continue;
      const recs = res.recs.filter((rec) => !seen.has(cardOf(res, rec)));
      if (!recs.length) continue;
      for (const rec of recs) seen.add(cardOf(res, rec));
      keys.add(res.key);
      out.push(recs.length === res.recs.length ? res : Object.freeze({ ...res, recs }));
    }
  }
  return out;
}


/** How many of a Spanish answer's first words are read for the kanji they share. */
export const SHARED_KANJI_FROM = 6;

/**
 * The kanji at least half of the first `n` words share, written as the page
 * writes them (writtenOf), the most shared first: comer's 食べる, 食事, 食う,
 * 外食 and 間食 share 食. Two of six is often a compound's partner (baño's
 * お風呂 and 風呂場 share 風 and 呂).
 */
export function sharedKanji(words, n = SHARED_KANJI_FROM) {
  const count = new Map();
  for (const res of words.slice(0, n)) {
    for (const ch of new Set([...writtenOf(res).written].filter(isKanji))) count.set(ch, (count.get(ch) || 0) + 1);
  }
  return [...count].filter(([, c]) => c * 2 >= n).sort((a, b) => b[1] - a[1]).map(([ch]) => ch);
}


/**
 * @param {{ dict: object, fetchJson: Function, base?: string }} o
 *   `dict` is createDict()'s, shared with the reader so a shard loads once.
 */
export function createSearch({ dict, fetchJson, base = 'data/' }) {
  const dir = base.endsWith('/') ? base : `${base}/`;
  const resolve = (src) => (src.startsWith('data/') ? dir + src.slice(5) : src);
  const english = createRangeStore({
    fetchJson, resolve, indexPath: `${dir}search/index.json`, what: 'The search index',
  });
  const rareEnglish = createRangeStore({
    fetchJson, resolve, indexPath: `${dir}search/rare.json`, what: 'The rare words\' search index',
  });
  const spanish = createRangeStore({
    fetchJson, resolve, indexPath: `${dir}search/es.json`, what: 'The Spanish search index',
  });
  let parts = null;

  /** One result: the key, its records, and how the query reached it. */
  const result = (key, recs, via, extra = {}) => Object.freeze({
    key, recs, via, ...extra,
  });

  /** First-tier results for `keys` (a japaneseKeys()), each key once. */
  function common({ keys, bases }, seen = new Set()) {
    const out = [];
    for (const k of keys) {
      const recs = dict.get(k);
      if (!recs || seen.has(k)) continue;
      // A dictionary form found by taking an ending off counts only where
      // its part of speech admits that ending (行った is 行く, not 行る).
      const d = bases.find((x) => x.base === k);
      const ok = d ? recs.filter((r) => posMatches(d.type, r.p, k, true)) : recs;
      if (!ok.length) continue;
      seen.add(k);
      out.push(result(k, ok, d ? 'form' : 'exact', d ? { chain: d.chain } : {}));
    }
    return out;
  }

  /** The rare words, then the names, spelled by `keys`. */
  async function rareAndNames(keys) {
    const out = [];
    const seen = new Set();
    await dict.needRare(keys);
    for (const k of keys) {
      const recs = dict.rare(k);
      if (recs && !seen.has(k)) { seen.add(k); out.push(result(k, recs, 'rare')); }
    }
    await dict.needNames(keys);
    for (const k of keys) {
      const rec = dict.name(k);
      if (rec && !seen.has(`name:${k}`)) { seen.add(`name:${k}`); out.push(result(k, [rec], 'name')); }
    }
    return out;
  }

  async function japanese(q, extra = []) {
    const found = japaneseKeys(q);
    const keys = { keys: [...new Set([...found.keys, ...extra])], bases: found.bases };
    await dict.need(keys.keys);
    const out = common(keys);
    if (out.length) return out;
    // Nothing common: the rare words, then the names.
    return rareAndNames(keys.keys);
  }

  const { romajiWords, readRomaji, ownWord } = createRomajiSearch({
    dict, japanese, common, result, japaneseKeys, loadNames: () => fetchJson(`${dir}search/names.json`),
  });


  // ── English and Spanish ─────────────────────────────────────────────────

  /**
   * The first-tier results and kanji of index entries, one per query word.
   * `complete` says every word had an entry: a romaji sentence's words are
   * no English, and wa alone named 昭和 for konnichi wa.
   */
  async function fromIndex(entries, via, keys, kanji) {
    await dict.need(keys);
    const out = [];
    for (const k of keys) {
      const recs = dict.get(k);
      if (recs) out.push(result(k, recs, via));
    }
    const complete = entries.every((e) => (e.w && e.w.length) || e.k);
    return { words: out, kanji, complete, direct: complete && entries.every((e) => e.direct !== false) };
  }

  async function inEnglish(q, lang) {
    // An accent says nothing in the English index, whose words are a to z: café is cafe.
    // On a Spanish page, a Spanish article is no English word (el gato is no El Salvador).
    const words = englishWordsTyped(q, lang).map((w) => w.folded);
    if (!words.length) return { words: [], kanji: [], asked: [], complete: false };
    await english.need(words);
    const entries = words.map((w) => english.get(w) || {});
    const keys = intersect(entries.map((e) => e.w || []).filter((l) => l.length)).slice(0, MAX_RESULTS);
    const kanji = intersect(entries.map((e) => [...(e.k || '')]).filter((l) => l.length));
    return { ...await fromIndex(entries, 'english', keys, kanji), asked: words };
  }

  /**
   * Spanish: each word's entry and those of its plural or feminine forms
   * (spanishForms: libros is libro too), each key by its best place in any,
   * the word's own first among equals; the words with ñ the index lists any
   * of them under (`n`: nino is niño), before the word's own where the ñ word
   * names more (ano is año first); then the verb a form belongs to (bebo is
   * beber), after all of those, so nombre is 名前 before nombrar's 任命.
   */
  async function inSpanish(q) {
    const words = spanishWords(q, { alone: true });
    if (!words.length) return { words: [], kanji: [], complete: false };
    const asked = words.map((w) => {
      const { nouns, verbs } = spanishForms(w);
      return { own: w, nouns, verbs };
    });
    await spanish.need(asked.flatMap((a) => [a.own, ...a.nouns, ...a.verbs]));
    const withN = asked.map((a) => [...new Set([a.own, ...a.nouns, ...a.verbs].flatMap((w) => (spanish.get(w) || {}).n || []))]);
    if (withN.flat().length) await spanish.need(withN.flat());
    const entries = asked.map((a, i) => {
      const own = spanish.get(a.own) || {};
      const nouns = a.nouns.map((x) => spanish.get(x)).filter(Boolean);
      const verbs = a.verbs.map((x) => spanish.get(x)).filter(Boolean);
      const enye = withN[i].map((x) => spanish.get(x)).filter(Boolean);
      const more = enye.filter((e) => (e.w || []).length > (own.w || []).length);
      const order = [...more, own, ...nouns, ...enye.filter((e) => !more.includes(e))];
      const listed = (list, field) => list.map((e) => (field === 'w' ? e.w || [] : [...(e.k || '')]));
      // After me, te or nos a word is a verb (te amo is amar's 愛する before amo's 主人).
      const verb = i > 0 && CLITIC_ES.has(words[i - 1]);
      const of = (field) => {
        const [a, b] = verb ? [verbs, order] : [order, verbs];
        return [...new Set([...byPlace(listed(a, field)), ...byPlace(listed(b, field))])];
      };
      // direct: the word or its plural names something, not only a verb it may be a form of.
      return { w: of('w'), k: of('k').join(''), direct: order.some((e) => (e.w && e.w.length) || e.k) };
    });
    const weak = words.map((w) => WEAK_ES.has(w) && words.some((x) => !WEAK_ES.has(x)));
    const keys = combineSpanish(entries.map((e) => e.w), weak).slice(0, MAX_RESULTS);
    const kanji = combineSpanish(entries.map((e) => [...e.k]), weak);
    const found = await fromIndex(entries.filter((e, i) => !weak[i]), 'spanish', keys, kanji);
    // KANJIDIC's Spanish names a kanji in few words (食 is alimento, comida,
    // eclipse; 喫 consumir, comer). A kanji most of the first words share
    // leads where the index names it (días: 日, then 旬), or where none the
    // index names is written in them (comer: 食, then 喫; escuela adds no 学).
    const written = found.words.slice(0, SHARED_KANJI_FROM).map((res) => writtenOf(res).written).join('');
    const adds = found.kanji.length > 0 && !found.kanji.some((ch) => written.includes(ch));
    const lead = sharedKanji(found.words).filter((ch) => adds || found.kanji.includes(ch));
    return { ...found, kanji: [...new Set([...lead, ...found.kanji])] };
  }

  /** The rare words every word of the query names, from their index rows. */
  async function rareInEnglish(words) {
    await rareEnglish.need(words);
    const lists = words.map((w) => rareEnglish.get(w) || []).filter((l) => l.length);
    const rows = new Map(lists.flat().map((row) => [row[0], row]));
    return intersect(lists.map((l) => l.map((row) => row[0]))).slice(0, RARE_MAX)
      .map((k) => result(k, [rareRecord(rows.get(k))], 'rare'));
  }

  /**
   * @param {string} q
   * @param {{ lang?: string }} [o]  the learner's language, 'en' or 'es'
   *   (strings.js currentLang() by default): its meanings rank first
   * @returns {Promise<{ kind: string, words: object[], kanji: string[], asked?: { english: string, spanish: string }, held?: string, sentence?: { kana: string, text: string } }>}
   *   `kanji` are the kanji to offer pages for: those typed, or those whose
   *   meanings use the words (in Spanish the kanji the first words share
   *   first). `asked` is the words a meaning was looked up by, as typed
   *   (askedWords), for a page to name. `held` is the letters of a syllable
   *   still being typed, held back from the romaji (kyouw is read as kyou).
   *   `sentence` is a romaji sentence's reading, offered only where it is
   *   one to trust (search-grammar.js trusted).
   */
  async function search(q, { lang = currentLang() } = {}) {
    const kind = queryKind(q);
    if (kind === 'empty') return { kind, words: [], kanji: [] };
    if (kind === 'ja') {
      const words = await japanese(q);
      return {
        kind, words: words.slice(0, MAX_RESULTS), kanji: [...new Set([...q].filter(isKanji))], asked: askedWords(q, lang),
      };
    }
    const none = {
      typed: [], edited: [], asTyped: [], names: [], namesAfter: false, sentence: null,
    };
    let reading = kind === 'romaji' ? romajiReading(q) : null;
    const [rw0, en0, es0] = await Promise.all([
      reading ? romajiWords(reading) : none,
      inEnglish(q, lang),
      inSpanish(q),
    ]);
    // A sentence where a meaning names every word of the query is that
    // meaning's (agua, tea), unless a particle only Japanese types was typed
    // on its own (sore wa).
    const meaning = en0.complete || es0.complete;
    // A syllable still being typed (kyouw, konnich, taber) is held back, so
    // the answer does not empty after every consonant; only where no meaning
    // names every word (dog and tab are English).
    // Only where what is left is a word of three kana or more or a sentence
    // to trust: gat (gato, half typed) is no が, amig no 網.
    let rw = rw0;
    let read = null;
    let held = !reading && !meaning ? heldRomaji(q) : null;
    if (held) {
      const left = await romajiWords(held.reading);
      const heldRead = left.sentence ? await readRomaji(held.reading, left.sentence) : null;
      if ((left.typed.length && [...held.reading.kana].length >= 3) || (heldRead && heldRead.sentence)) {
        reading = held.reading;
        rw = left;
        read = heldRead;
      } else held = null;
    }
    // A reading not to trust (no `sentence`) still lists its words, and no
    // meaning that does not name every word (sure, below).
    if (!held) read = rw.sentence && (!meaning || rw.sentence.strong) ? await readRomaji(reading, rw.sentence) : null;
    const said = read ? read.words : [];
    const own = rw.asTyped.filter((r) => ownWord(r, rw.edited));
    const rest = rw.asTyped.filter((r) => !own.includes(r));
    // Where the romaji found a word as typed, or a sentence, a meaning counts
    // only if every word of the query is one the index knows (sake is English
    // too; konnichi wa is not, and wa alone named 昭和).
    const sure = said.length > 0 || rw.typed.length > 0 || rw.names.length > 0;
    const meant = (x) => (!sure || x.complete ? x : { ...x, words: [], kanji: [] });
    const firstTierRomaji = said.length + rw.typed.length + rw.edited.length;
    let en = meant(en0);
    let es = meant(es0);
    // An English learner sees Spanish only where English and romaji found
    // nothing (sales is no 塩); a Spanish one sees English where it names
    // every word or Spanish found nothing.
    const romajiAny = firstTierRomaji + rw.asTyped.length + rw.names.length;
    const englishToo = lang !== 'es' || en0.complete || !es.words.length;
    if (!englishToo) en = { ...en, words: [], kanji: [] };
    if (lang !== 'es' && (en.words.length || romajiAny)) es = { ...es, words: [], kanji: [] };
    const commonFound = firstTierRomaji + en.words.length + es.words.length;
    const rare = englishToo && en.asked.length && en.words.length < RARE_WHEN && commonFound < RARE_WHEN && (!romajiAny || en0.complete)
      ? await rareInEnglish(en.asked) : [];
    // What the letters spell as typed leads, then a meaning that names every
    // word, then what an edit spells; in Spanish the meaning's first word
    // goes before even the romaji's (manga is 袖, then 漫画).
    const [mine, other] = lang === 'es' ? [es, en] : [en, es];
    // A Spanish word read only as a verb form (ame as amar's) does not go before
    // the romaji it spells as typed (ame is 雨).
    const lead = lang === 'es' && es.complete && (es.direct || !rw.typed.length) ? [es.words.slice(0, 1), rw.typed.slice(0, 1)] : [];
    // Nor does one the query only sits inside of: tokyo is in the Spanish of
    // 東京証券取引所, "Tokyo Stock Exchange (Bolsa de Tokio)", and 東京's
    // English is Tokyo. A word the romaji spells as typed, or whose English is
    // the query exactly, goes first.
    if (lead.length && es.words.length && !(await spanishExact(dict, es.words[0], q))) {
      const exact = [...rw.typed.filter((r) => r.via === 'exact'), ...(en0.complete ? en0.words.filter((r) => englishExact(r, en0.asked)) : [])];
      if (exact.length) lead.unshift(exact.slice(0, 1));
    }
    // A name a typed word also spells follows it (satou is 砂糖, then 佐藤).
    const [namesFirst, namesAfter] = rw.namesAfter ? [[], rw.names] : [rw.names, []];
    const lists = [
      ...lead,
      said, namesFirst, rw.typed, namesAfter,
      mine.complete ? mine.words : [],
      other.complete ? other.words : [],
      own, rw.edited, rest,
      mine.complete ? [] : mine.words,
      other.complete ? [] : other.words,
      rare,
    ];
    const kanji = [...new Set([...mine.kanji, ...other.kanji])].slice(0, KANJI_MAX);
    return {
      kind: held ? 'romaji' : kind,
      words: mergeResults(lists).slice(0, MAX_RESULTS),
      kanji,
      asked: askedWords(q, lang),
      ...(held ? { held: held.held } : {}),
      ...(read && read.sentence ? { sentence: read.sentence } : {}),
    };
  }


  /** The parts picker's data: { list: [[part, strokes|null]], map: part -> kanji[] }. */
  async function loadParts() {
    if (parts) return parts;
    const doc = await fetchJson(`${dir}search/parts.json`);
    const map = new Map(Object.entries(doc.parts || {}).map(([p, s]) => [p, [...s]]));
    parts = Object.freeze({ list: doc.list || [], map });
    return parts;
  }

  return Object.freeze({ search, loadParts });
}

/**
 * Kanji that have every chosen part, in the order of the first part's list
 * (most frequent first), and the parts still worth offering: those that
 * appear in at least one of them, so a pick never leads to nothing.
 */
export function byParts(chosen, data) {
  const picks = [...chosen];
  if (!picks.length) return { kanji: [], open: null };
  const lists = picks.map((p) => data.map.get(p) || []);
  const sets = lists.slice(1).map((l) => new Set(l));
  const kanji = lists[0].filter((ch) => sets.every((s) => s.has(ch)));
  const inResult = new Set(kanji);
  const open = new Set();
  for (const [p, list] of data.map) if (list.some((ch) => inResult.has(ch))) open.add(p);
  return { kanji, open };
}
