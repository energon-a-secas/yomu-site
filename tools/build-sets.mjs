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
 *
 * No JLPT or Kanken lists: neither upstream holds word levels, and KANJIDIC's
 * JLPT field is the four levels the test dropped in 2010 (queue #143).
 */
import path from 'node:path';
import { loadZippedJson, upstream } from './lib/sources.mjs';
import { licenceBlock, unshippable } from './lib/licence.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';

const TOOL = 'tools/build-sets.mjs';
const OUT = path.join(SITE, 'data', 'sets');
/** The set ids, in the order the tab offers them, and the JMdict tag each collects. */
export const SETS = Object.freeze([['yoji', 'yoji'], ['proverb', 'proverb'], ['idiom', 'id']]);
const GLOSSES = 2;
/** Spellings that stand aside for another: search-only, rare, irregular, old. */
const ASIDE = new Set(['sK', 'rK', 'iK', 'oK', 'sk', 'rk', 'ik', 'ok']);
/** Senses a learner browsing a list should not meet unasked. */
const AVOID = new Set(['vulg', 'X']);

const applies = (kana, kanjiText) => !kana.appliesToKanji || kana.appliesToKanji.includes('*') || kana.appliesToKanji.includes(kanjiText);

function rowOf(w, tag) {
  // An idiom is a phrase (足を洗う), not one word used figuratively (嵐 "uproar").
  const senses = w.sense.filter((s) => s.misc.includes(tag) && (tag !== 'id' || s.partOfSpeech.includes('exp')));
  if (!senses.length || w.sense.some((s) => s.misc.some((m) => AVOID.has(m)))) return null;
  const glosses = senses.map((s) => s.gloss.filter((g) => g.lang === 'eng' && !unshippable(g.text)).map((g) => g.text).join('; '))
    .filter(Boolean).slice(0, GLOSSES);
  if (!glosses.length) return null;
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
  for (const [id, rows] of collect()) {
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
  const gone = pruneStale(OUT, /^[a-z]+\d+\.json$/, written);
  if (gone.length) lines.push(`removed ${gone.join(' ')}`);
  lines.push(`wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
