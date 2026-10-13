#!/usr/bin/env node
/**
 * The kanji page's data: data/strokes/ (how each kanji and kana is drawn) and
 * data/kpage/ (the words a kanji is met in, and the kanji it shares parts
 * with).
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-kanji-page.mjs        (after build-dict and build-kanji)
 *
 * data/strokes/sNN.json, `yomu-strokes/1`: every character KanjiVG draws
 * (6,702 in r20250816: the kanji and the kana), each as its stroke paths in
 * drawing order, the `d` of each `<path>` exactly as KanjiVG writes it on its
 * 109 by 109 grid. Range shards by first character, in plain JS string order,
 * like the dictionary's, so the page fetches one shard for one character.
 *
 * data/kpage/pNN.json, `yomu-kpage/1`, read from the committed data only:
 *   w  up to WORDS first-tier words written with the kanji, as [written,
 *      reading, first gloss], most frequent band first (a record's `q`),
 *      then shortest. A key that is another key plus a particle (`x`) and
 *      a key the first tier holds for the mixed rule alone (`m`) are left
 *      out: neither is a word a learner looks for under its kanji.
 *   p  for each of the kanji's parts (KanjiVG's, in data/kanji/), up to
 *      SIBLINGS listed kanji that have the same part, most frequent first.
 *   u  up to USED listed kanji that have this kanji as a part (日 is in 明).
 * "Listed" is the kanji shards' frequency-ranked part (data/kanji/index.json
 * names their characters), so the neighbours a page offers are ones a reader
 * meets; a kanji page that leads to 鬱 from 林 helps nobody.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadKanjiVgDir, upstream } from './lib/sources.mjs';
import { licenceBlock } from './lib/licence.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';

const TOOL = 'tools/build-kanji-page.mjs';
const DATA = path.join(SITE, 'data');
const WORDS = 10;
const SIBLINGS = 8;
const USED = 12;

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));
const WRITTEN = /^[\u3041-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々ー]+$/u;
const isKanji = (ch) => /[㐀-䶿一-鿿豈-﫿]/.test(ch);

// ── Strokes ───────────────────────────────────────────────────────────────

/** The `d` of each stroke path, in the file's order, which is KanjiVG's drawing order. */
function strokesOf(svg) {
  const start = svg.indexOf('kvg:StrokePaths');
  const end = svg.indexOf('kvg:StrokeNumbers');
  const body = svg.slice(start, end < 0 ? undefined : end);
  return [...body.matchAll(/<path\b[^>]*?\sd="([^"]+)"/g)].map((m) => m[1]);
}

function strokes(svgDir) {
  const out = new Map();
  for (const name of fs.readdirSync(svgDir)) {
    // Variants (05b66-Kaisho.svg) are other styles of the same character.
    const m = /^([0-9a-f]{5})\.svg$/.exec(name);
    if (!m) continue;
    const ch = String.fromCodePoint(parseInt(m[1], 16));
    const paths = strokesOf(fs.readFileSync(path.join(svgDir, name), 'utf8'));
    if (paths.length) out.set(ch, paths);
  }
  return out;
}

// ── Words and parts ───────────────────────────────────────────────────────

function firstTier() {
  const files = ['core.json', ...fs.readdirSync(path.join(DATA, 'dict')).filter((f) => /^w\d+\.json$/.test(f))];
  const out = [];
  for (const f of files) {
    const { entries } = readJson(`dict/${f}`);
    for (const [key, recs] of Object.entries(entries)) out.push([key, recs]);
  }
  return out;
}

function kanjiTable() {
  const index = readJson('kanji/index.json');
  const listed = [];
  const info = new Map();
  for (const s of index.shards) {
    const doc = JSON.parse(fs.readFileSync(path.join(SITE, s.src), 'utf8'));
    for (const [ch, e] of Object.entries(doc.entries)) info.set(ch, e);
    if (typeof s.chars === 'string') listed.push(...s.chars);
  }
  // Most frequent first; a listed kanji with no frequency (a jōyō kanji the
  // newspapers never ranked) after every ranked one, by stroke count.
  const rank = (ch) => (info.get(ch).f ?? 10000) * 100 + (info.get(ch).s || 0);
  listed.sort((a, b) => rank(a) - rank(b));
  return { info, listed };
}

function wordsByKanji(tier) {
  const by = new Map();
  for (const [key, recs] of tier) {
    const rec = recs[0];
    if (!rec || rec.x || rec.m || !Array.isArray(rec.g) || !rec.g.length) continue;
    // Kanji and kana only: １日 is 一日 again, in a digit.
    if (!WRITTEN.test(key)) continue;
    const reading = Array.isArray(rec.r) && rec.r.length ? rec.r[0] : key;
    const row = { key, reading, gloss: rec.g[0], q: rec.q || 6 };
    for (const ch of new Set([...key].filter(isKanji))) {
      if (!by.has(ch)) by.set(ch, []);
      by.get(ch).push(row);
    }
  }
  for (const [ch, rows] of by) {
    rows.sort((a, b) => a.q - b.q || a.key.length - b.key.length || (a.key < b.key ? -1 : 1));
    by.set(ch, rows.slice(0, WORDS).map((r) => [r.key, r.reading, r.gloss]));
  }
  return by;
}

function pageEntries() {
  const { info, listed } = kanjiTable();
  const words = wordsByKanji(firstTier());
  const withPart = new Map(); // part -> listed kanji that have it, most frequent first
  for (const ch of listed) {
    for (const p of info.get(ch).parts || []) {
      if (!withPart.has(p)) withPart.set(p, []);
      withPart.get(p).push(ch);
    }
  }
  const out = new Map();
  for (const [ch, e] of info) {
    const entry = {};
    const w = words.get(ch);
    if (w && w.length) entry.w = w;
    const p = {};
    for (const part of e.parts || []) {
      const sib = (withPart.get(part) || []).filter((x) => x !== ch).slice(0, SIBLINGS);
      if (sib.length) p[part] = sib.join('');
    }
    if (Object.keys(p).length) entry.p = p;
    const used = (withPart.get(ch) || []).filter((x) => x !== ch).slice(0, USED);
    if (used.length) entry.u = used.join('');
    if (Object.keys(entry).length) out.set(ch, entry);
  }
  return out;
}

// ── Packing ───────────────────────────────────────────────────────────────

function pack(map, format, licence) {
  const keys = [...map.keys()].sort();
  const header = Buffer.byteLength(serialize({ _licence: licence, format, first: keys[0], entries: {} }));
  const shards = [];
  let cur = [];
  let size = header;
  for (const k of keys) {
    const n = Buffer.byteLength(`${JSON.stringify(k)}: ${JSON.stringify(map.get(k))},\n`);
    if (cur.length && size + n > MAX_BYTES - 64) {
      shards.push(cur);
      cur = [];
      size = header;
    }
    cur.push(k);
    size += n;
  }
  if (cur.length) shards.push(cur);
  return shards.map((list) => ({
    _licence: licence, format, first: list[0], entries: Object.fromEntries(list.map((k) => [k, map.get(k)])),
  }));
}

function emit(dir, prefix, docs, indexFormat, licence) {
  const out = path.join(DATA, dir);
  const written = [];
  const sizes = [];
  const shards = docs.map((doc, i) => {
    const name = `${prefix}${String(i).padStart(2, '0')}.json`;
    const file = path.join(out, name);
    sizes.push(writeJson(file, doc));
    written.push(file);
    return { src: `data/${dir}/${name}`, first: doc.first };
  });
  const keys = docs.reduce((n, d) => n + Object.keys(d.entries).length, 0);
  const maxKey = Math.max(...docs.flatMap((d) => Object.keys(d.entries).map((k) => k.length)));
  writeJson(path.join(out, 'index.json'), {
    _licence: licence, format: indexFormat, keys, maxKey, shards,
  }, 'shards');
  const gone = pruneStale(out, new RegExp(`^${prefix}\\d+\\.json$`), written);
  const total = sizes.reduce((a, b) => a + b, 0);
  return `${dir}: ${keys} characters in ${docs.length} shards, ${fmtBytes(total)}${gone.length ? `; removed ${gone.join(' ')}` : ''}`;
}

function main() {
  const t0 = Date.now();
  const strokeLicence = licenceBlock('kanjivg', TOOL, { upstream: [upstream('kanjivg')] });
  const strokeMap = strokes(loadKanjiVgDir());
  const pageLicence = licenceBlock('edrdg', TOOL, {
    upstream: [upstream('jmdictFull'), upstream('kanjidic'), upstream('kanjivg')],
    inputs: [['kanjivg', 'parts, the named components under each character, and the kanji that share them']],
  });
  const lines = [
    emit('strokes', 's', pack(strokeMap, 'yomu-strokes/1', strokeLicence), 'yomu-strokes-index/1', strokeLicence),
    emit('kpage', 'p', pack(pageEntries(), 'yomu-kpage/1', pageLicence), 'yomu-kpage-index/1', pageLicence),
    `wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
