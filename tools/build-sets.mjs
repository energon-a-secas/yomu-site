#!/usr/bin/env node
/**
 * data/sets/: the collections Search's Collections tab browses, every JMdict
 * entry a sense of which JMdict tags as one of SETS: four-character idioms
 * (yoji-jukugo, 一石二鳥), proverbs (猿も木から落ちる) and idiomatic phrases
 * (足を洗う). Read from the pinned full JMdict, so the reader's dictionary
 * (data/dict/) is untouched and no reading changes.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-sets.mjs
 *
 * data/sets/<set>N.json, `yomu-set/1`: `rows`, each [written, reading,
 *   glosses, common]. An idiom is a tagged sense that is an expression
 *   (`exp`): JMdict tags one word used figuratively (嵐, uproar) too.
 *   `written` is the entry's first kanji spelling JMdict
 *   does not mark rare, irregular, old or search-only (its first kana where
 *   it has no kanji), `reading` the first kana that applies to it ('' when
 *   it is the written form), `glosses` the tagged senses' English, at most
 *   GLOSSES, and `common` 1 when JMdict marks a spelling common. Common
 *   entries first, then by reading. A set fills as many files as the cap
 *   asks.
 * data/sets/index.json, `yomu-sets-index/1`: each set's id, count and files.
 * data/sets/wNN.json, `yomu-sets-words/1`, index data/sets/words.json: each
 *   first-tier key with a kanji in it to up to IN_WORD rows that contain it,
 *   [set, written, reading, gloss], common first, then the shortest: the
 *   Word panel's "In idioms and proverbs", and the mark a Search result
 *   carries when it is one (its own row). Range shards by key.
 *
 * No JLPT or Kanken lists: neither upstream holds word levels, and KANJIDIC's
 * JLPT field is the four levels the test dropped in 2010 (queue #143).
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadZippedJson, upstream } from './lib/sources.mjs';
import { licenceBlock, unshippable } from './lib/licence.mjs';
import { AVOID_EXPLICIT } from './lib/avoid.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';

const TOOL = 'tools/build-sets.mjs';
const OUT = path.join(SITE, 'data', 'sets');
/** The set ids, in the order the tab offers them, and the JMdict tag each collects. */
export const SETS = Object.freeze([['yoji', 'yoji'], ['proverb', 'proverb'], ['idiom', 'id']]);
const GLOSSES = 2;
const IN_WORD = 3;
const IN_GLOSS = 90;
const HAS_KANJI = /[\p{Script=Han}々]/u;
/** Spellings that stand aside for another: search-only, rare, irregular, old. */
const ASIDE = new Set(['sK', 'rK', 'iK', 'oK', 'sk', 'rk', 'ik', 'ok']);
/** Senses a learner browsing a list should not meet unasked; AVOID_EXPLICIT reads the English too. */
const AVOID_TAGS = new Set(['vulg', 'X']);

const applies = (kana, kanjiText) => !kana.appliesToKanji || kana.appliesToKanji.includes('*') || kana.appliesToKanji.includes(kanjiText);

function rowOf(w, tag) {
  // An idiom is a phrase (足を洗う), not one word used figuratively (嵐 "uproar").
  const senses = w.sense.filter((s) => s.misc.includes(tag) && (tag !== 'id' || s.partOfSpeech.includes('exp')));
  if (!senses.length || w.sense.some((s) => s.misc.some((m) => AVOID_TAGS.has(m)))) return null;
  const glosses = senses.map((s) => s.gloss.filter((g) => g.lang === 'eng' && !unshippable(g.text)).map((g) => g.text).join('; '))
    .filter(Boolean).slice(0, GLOSSES);
  if (!glosses.length || glosses.some((g) => AVOID_EXPLICIT.test(g))) return null;
  // A sense may hold for some spellings only (嚏's charm is くさめ, not くしゃみ).
  const only = (list, allowed) => (allowed.includes('*') ? list : list.filter((x) => allowed.includes(x.text)));
  const kanjis = only(w.kanji, senses[0].appliesToKanji);
  const kanas = only(w.kana, senses[0].appliesToKana);
  if (!kanas.length) return null;
  const kanji = kanjis.find((k) => !k.tags.some((t) => ASIDE.has(t))) || kanjis[0];
  const kanaFor = (text) => kanas.find((k) => !k.tags.some((t) => ASIDE.has(t)) && (!text || applies(k, text))) || kanas[0];
  const written = kanji ? kanji.text : kanaFor(null).text;
  const reading = kanji ? kanaFor(kanji.text).text : '';
  if (unshippable(written) || unshippable(reading)) return null;
  const common = kanjis.some((k) => k.common) || kanas.some((k) => k.common) ? 1 : 0;
  return [written, reading, glosses, common];
}

function collect() {
  const jm = loadZippedJson('jmdictFull');
  const out = new Map(SETS.map(([id]) => [id, []]));
  for (const w of jm.words) {
    for (const [id, tag] of SETS) {
      const row = rowOf(w, tag);
      if (row) out.get(id).push(row);
    }
  }
  for (const rows of out.values()) {
    rows.sort((a, b) => b[3] - a[3] || ((a[1] || a[0]) < (b[1] || b[0]) ? -1 : (a[1] || a[0]) > (b[1] || b[0]) ? 1 : 0) || (a[0] < b[0] ? -1 : 1));
  }
  return out;
}

/** First-tier keys with a kanji in them, from the committed dictionary. */
function firstTierKeys() {
  const dir = path.join(SITE, 'data', 'dict');
  const keys = new Set();
  for (const f of ['core.json', ...fs.readdirSync(dir).filter((x) => /^w\d+\.json$/.test(x))]) {
    for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).entries)) if (HAS_KANJI.test(k)) keys.add(k);
  }
  return keys;
}

const short = (g) => (g.length <= IN_GLOSS ? g : `${g.slice(0, g.lastIndexOf(' ', IN_GLOSS - 1)).replace(/[\s,;:(]+$/, '')}\u2026`);

/** Each first-tier key to the rows whose written form holds it: every substring of a row, looked up. */
function wordsIn(sets) {
  const keys = firstTierKeys();
  const max = Math.max(...[...keys].map((k) => k.length));
  const by = new Map();
  for (const [id, rows] of sets) {
    for (const [written, reading, glosses, common] of rows) {
      const found = new Set();
      for (let i = 0; i < written.length; i += 1) {
        for (let j = i + 1; j <= Math.min(written.length, i + max); j += 1) {
          const k = written.slice(i, j);
          if (keys.has(k)) found.add(k);
        }
      }
      for (const k of found) {
        if (!by.has(k)) by.set(k, []);
        by.get(k).push({ row: [id, written, reading, short(glosses[0])], common, len: written.length, self: written === k });
      }
    }
  }
  const out = new Map();
  for (const [k, list] of by) {
    // The word's own row first (一石二鳥 is itself a four-kanji idiom), then
    // the best of each collection (common, then short), so 雨 finds a proverb
    // and not three four-kanji idioms, then the rest.
    list.sort((a, b) => b.self - a.self || b.common - a.common || a.len - b.len || (a.row[1] < b.row[1] ? -1 : 1));
    const picked = list.filter((x) => x.self).slice(0, 1);
    for (const [id] of SETS) {
      const best = list.find((x) => x.row[0] === id && !picked.includes(x));
      if (best && picked.length < IN_WORD) picked.push(best);
    }
    for (const x of list) if (picked.length < IN_WORD && !picked.includes(x)) picked.push(x);
    out.set(k, picked.map((x) => x.row));
  }
  return out;
}

/** Range shards of a key map, under the cap, in plain JS string order. */
function packKeys(map, format, licence) {
  const keys = [...map.keys()].sort();
  const header = Buffer.byteLength(serialize({ _licence: licence, format, first: keys[0], entries: {} }));
  const shards = [];
  let cur = [];
  let size = header;
  for (const k of keys) {
    const n = Buffer.byteLength(`${JSON.stringify(k)}: ${JSON.stringify(map.get(k))},\n`);
    if (cur.length && size + n > MAX_BYTES - 64) { shards.push(cur); cur = []; size = header; }
    cur.push(k);
    size += n;
  }
  if (cur.length) shards.push(cur);
  return shards.map((list) => ({ _licence: licence, format, first: list[0], entries: Object.fromEntries(list.map((k) => [k, map.get(k)])) }));
}

/** A set's rows in files under the cap, in order. */
function pack(id, rows, licence) {
  const header = Buffer.byteLength(serialize({ _licence: licence, format: 'yomu-set/1', set: id, rows: [] }, 'rows'));
  const files = [];
  let cur = [];
  let size = header;
  for (const row of rows) {
    const n = Buffer.byteLength(`${JSON.stringify(row)},\n`);
    if (cur.length && size + n > MAX_BYTES - 64) { files.push(cur); cur = []; size = header; }
    cur.push(row);
    size += n;
  }
  if (cur.length) files.push(cur);
  return files.map((list) => ({ _licence: licence, format: 'yomu-set/1', set: id, rows: list }));
}

function main() {
  const t0 = Date.now();
  const licence = licenceBlock('edrdg', TOOL, { upstream: [upstream('jmdictFull')] });
  const written = [];
  const sets = [];
  const lines = [];
  const all = collect();
  for (const [id, rows] of all) {
    const docs = pack(id, rows, licence);
    let bytes = 0;
    const files = docs.map((doc, i) => {
      const name = `${id}${i}.json`;
      const file = path.join(OUT, name);
      bytes += writeJson(file, doc, 'rows');
      written.push(file);
      return `data/sets/${name}`;
    });
    sets.push({ id, n: rows.length, files });
    lines.push(`${id}: ${rows.length} entries (${rows.filter((r) => r[3]).length} common) in ${files.length} files, ${fmtBytes(bytes)}`);
  }
  writeJson(path.join(OUT, 'index.json'), { _licence: licence, format: 'yomu-sets-index/1', sets }, 'sets');
  const inDocs = packKeys(wordsIn(all), 'yomu-sets-words/1', licence);
  let inBytes = 0;
  const shards = inDocs.map((doc, i) => {
    const name = `w${String(i).padStart(2, '0')}.json`;
    inBytes += writeJson(path.join(OUT, name), doc);
    written.push(path.join(OUT, name));
    return { src: `data/sets/${name}`, first: doc.first };
  });
  const inKeys = inDocs.reduce((n, d) => n + Object.keys(d.entries).length, 0);
  writeJson(path.join(OUT, 'words.json'), {
    _licence: licence, format: 'yomu-sets-words-index/1', keys: inKeys,
    maxKey: Math.max(...inDocs.flatMap((d) => Object.keys(d.entries).map((k) => k.length))), shards,
  }, 'shards');
  lines.push(`words: ${inKeys} first-tier keys in ${shards.length} shards, ${fmtBytes(inBytes)}`);
  const gone = pruneStale(OUT, /^[a-z]+\d+\.json$/, written);
  if (gone.length) lines.push(`removed ${gone.join(' ')}`);
  lines.push(`wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
