// Search: a word by its Japanese, its romaji or its English, and a kanji by
// its parts. No DOM.
//
// Japanese is looked up the way the reader reads a word: the key as typed,
// in hiragana and in katakana, and every dictionary form deinflect.js finds
// for it (食べた finds 食べる), in the first tier, then the rare words and
// the names. Romaji is turned into kana and searched as Japanese. English
// goes through data/search/ (tools/build-search.mjs): each word of the query
// names the dictionary keys whose glosses use it, and a query of several
// words keeps the keys every word names. A query that reads as both (sake,
// kami) is searched both ways, the Japanese first.
//
// The query is never stored and never put in the address.

import { createRangeStore } from './range-store.js';
import { toHiragana, isRomaji } from './vendor/wanakana.js';
import {
  toHira, toKata, isJapanese, isKanji,
} from './kana.js';
import { deinflect, posMatches } from './deinflect.js';

/** Words that say nothing a learner searches for. The builder splits glosses with the same list. */
const STOP = new Set(`a an the to of in on at by for with from as or and be is are was
  one's someone something oneself etc e g i e s t esp usu`.split(/\s+/));

/** A gloss's (or a query's) words, lower case, with what it puts in parentheses left out. */
export function glossWords(text) {
  return String(text).toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[^a-z']+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** At most this many words in one answer. */
export const MAX_RESULTS = 40;

/**
 * What a query is: `ja` (it has Japanese in it), `romaji` (Latin letters
 * that spell kana, which may be English too), `en`, or `empty`.
 */
export function queryKind(q) {
  const s = String(q || '').trim();
  if (!s) return 'empty';
  if ([...s].some(isJapanese)) return 'ja';
  const kana = toHiragana(s.toLowerCase());
  if (isRomaji(s) && kana && ![...kana].some((ch) => /[a-z]/i.test(ch))) return 'romaji';
  return 'en';
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
  let parts = null;

  /** One result: the key, its records, and how the query reached it. */
  const result = (key, recs, via, extra = {}) => Object.freeze({
    key, recs, via, ...extra,
  });

  async function japanese(q) {
    const { keys, bases } = japaneseKeys(q);
    await dict.need(keys);
    const out = [];
    const seen = new Set();
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
    if (out.length) return out;
    // Nothing common: the rare words, then the names.
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

  /** Keys every word of the query names, ranked by the sum of their places; the first word's alone when none is shared. */
  function intersect(lists) {
    if (!lists.length) return [];
    const score = new Map();
    lists[0].forEach((k, i) => score.set(k, i));
    for (const list of lists.slice(1)) {
      const here = new Map(list.map((k, i) => [k, i]));
      for (const k of [...score.keys()]) {
        if (here.has(k)) score.set(k, score.get(k) + here.get(k));
        else score.delete(k);
      }
    }
    const shared = [...score].sort((a, b) => a[1] - b[1]).map(([k]) => k);
    return shared.length ? shared : lists[0];
  }

  async function inEnglish(q) {
    const words = glossWords(q);
    if (!words.length) return { words: [], kanji: [] };
    await english.need(words);
    const entries = words.map((w) => english.get(w) || {});
    const keys = intersect(entries.map((e) => e.w || []).filter((l) => l.length)).slice(0, MAX_RESULTS);
    const kanji = intersect(entries.map((e) => [...(e.k || '')]).filter((l) => l.length));
    await dict.need(keys);
    const out = [];
    for (const k of keys) {
      const recs = dict.get(k);
      if (recs) out.push(result(k, recs, 'english'));
    }
    return { words: out, kanji };
  }

  /**
   * @returns {Promise<{ kind: string, words: object[], kanji: string[] }>}
   *   `kanji` are the kanji to offer pages for: those typed, or those whose
   *   meanings use the English.
   */
  async function search(q) {
    const kind = queryKind(q);
    if (kind === 'empty') return { kind, words: [], kanji: [] };
    if (kind === 'ja') {
      const words = await japanese(q);
      return { kind, words: words.slice(0, MAX_RESULTS), kanji: [...new Set([...q].filter(isKanji))] };
    }
    if (kind === 'romaji') {
      const kana = toHiragana(String(q).trim().toLowerCase());
      const [ja, en] = await Promise.all([japanese(kana), inEnglish(q)]);
      const seen = new Set(ja.map((r) => r.key));
      // A word found through the romaji says the kana it was read as.
      const read = ja.map((r) => Object.freeze({ ...r, romaji: kana }));
      return { kind, words: [...read, ...en.words.filter((r) => !seen.has(r.key))].slice(0, MAX_RESULTS), kanji: en.kanji };
    }
    const en = await inEnglish(q);
    return { kind, ...en };
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
