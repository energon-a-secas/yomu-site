#!/usr/bin/env node
/**
 * Search's data: data/search/eNN.json (English to Japanese) and
 * data/search/parts.json (kanji by their parts).
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-search.mjs        (after build-dict, build-kanji, build-kanji-page)
 *
 * Read from the committed data only, so it needs no upstream.
 *
 * data/search/eNN.json, `yomu-search/1`: each English word a gloss uses, to
 *   w  up to WORDS first-tier keys, best first. A key ranks by how early the
 *      word comes in its glosses (the first sense's first word before a
 *      fifth sense's), whether a gloss is that word alone ("to eat" is eat
 *      alone once its "to" goes), and the key's frequency band (`q`). The
 *      page looks each key up in the dictionary for its reading and glosses,
 *      so the index carries keys only.
 *   k  up to KANJI listed kanji whose KANJIDIC meanings use the word, most
 *      frequent first.
 * Range shards by word, in plain JS string order. Only the first tier is
 * indexed: the rare words are 44 MB and a learner searching "eat" wants
 * 食べる, not 喰らう.
 *
 * data/search/parts.json, `yomu-parts/1`: for each part (a KanjiVG component)
 * the kanji that contain it at any depth, most frequent first: 語 is 言 and
 * 吾, and 吾 is 五 and 口, so 口 finds 語. `list` is the parts the picker
 * shows, those in at least MIN_PART kanji, by stroke count (KanjiVG's own
 * drawing of the part, where it has one) and then by how many kanji use them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { licenceBlock } from './lib/licence.mjs';
import { glossWords } from '../js/search.js';
import { upstream } from './lib/sources.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';

const TOOL = 'tools/build-search.mjs';
const DATA = path.join(SITE, 'data');
const OUT = path.join(DATA, 'search');
const WORDS = 24;
const KANJI = 10;
const MIN_PART = 6;
const DEPTH = 4;

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));

function firstTier() {
  const files = ['core.json', ...fs.readdirSync(path.join(DATA, 'dict')).filter((f) => /^w\d+\.json$/.test(f))];
  const out = [];
  for (const f of files) for (const [key, recs] of Object.entries(readJson(`dict/${f}`).entries)) out.push([key, recs]);
  return out;
}

function kanjiTable() {
  const index = readJson('kanji/index.json');
  const info = new Map();
  const listed = [];
  for (const s of index.shards) {
    const doc = JSON.parse(fs.readFileSync(path.join(SITE, s.src), 'utf8'));
    for (const [ch, e] of Object.entries(doc.entries)) info.set(ch, e);
    if (typeof s.chars === 'string') listed.push(...s.chars);
  }
  return { info, listed };
}

// ── English ───────────────────────────────────────────────────────────────

/**
 * Whether a key is the spelling a word is listed under: one word is one
 * result, not 食べる and たべる. A kana key with a kanji spelling (`k`) stands
 * aside for it unless the word is usually written in kana (`u`); a kanji key
 * of a word usually written in kana stands aside for its kana key.
 */
function listedSpelling(key, rec, keys) {
  const kana = !/[\u3400-\u9fff々]/.test(key);
  if (kana) return !(Array.isArray(rec.k) && rec.k.some((k) => keys.has(k))) || !!rec.u;
  return !(rec.u && Array.isArray(rec.r) && keys.has(rec.r[0]));
}

function english(tier, info, listed) {
  const by = new Map(); // word -> Map(key -> score)
  const keys = new Set(tier.map(([key]) => key));
  for (const [key, recs] of tier) {
    // A key that is another key plus a particle (今日は) is found as that key.
    if (recs.every((r) => r.x)) continue;
    if (!listedSpelling(key, recs[0], keys)) continue;
    recs.forEach((rec, ri) => {
      (rec.g || []).forEach((gloss, si) => {
        const words = glossWords(gloss);
        const alone = words.length === 1;
        words.forEach((w, wi) => {
          const score = (rec.q || 6) * 4 + (ri + si) * 3 + Math.min(wi, 4) + (alone ? 0 : 3);
          if (!by.has(w)) by.set(w, new Map());
          const m = by.get(w);
          if (!m.has(key) || m.get(key) > score) m.set(key, score);
        });
      });
    });
  }
  const kanjiBy = new Map();
  listed.forEach((ch, rank) => {
    for (const meaning of info.get(ch).m || []) {
      for (const w of new Set(glossWords(meaning))) {
        if (!kanjiBy.has(w)) kanjiBy.set(w, []);
        const list = kanjiBy.get(w);
        if (list.length < KANJI && !list.includes(ch)) list.push(ch);
      }
    }
    return rank;
  });
  const out = new Map();
  for (const w of new Set([...by.keys(), ...kanjiBy.keys()])) {
    const e = {};
    const keys = by.get(w);
    if (keys) {
      e.w = [...keys].sort((a, b) => a[1] - b[1] || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1))
        .slice(0, WORDS).map(([k]) => k);
    }
    if (kanjiBy.has(w)) e.k = kanjiBy.get(w).join('');
    out.set(w, e);
  }
  return out;
}

// ── Parts ─────────────────────────────────────────────────────────────────

function strokeCounts() {
  const index = readJson('strokes/index.json');
  const counts = new Map();
  for (const s of index.shards) {
    for (const [ch, paths] of Object.entries(JSON.parse(fs.readFileSync(path.join(SITE, s.src), 'utf8')).entries)) counts.set(ch, paths.length);
  }
  return counts;
}

function parts(info, listed) {
  const rank = new Map(listed.map((ch, i) => [ch, i]));
  const deep = (ch, depth = 0, seen = new Set()) => {
    const direct = (info.get(ch) && info.get(ch).parts) || [];
    for (const p of direct) {
      // KanjiVG names some parts by a code (CDP-8BC4) or a layout (⿱日隹): not a character to pick.
      if (p === ch || seen.has(p) || [...p].length !== 1) continue;
      seen.add(p);
      if (depth < DEPTH) deep(p, depth + 1, seen);
    }
    return seen;
  };
  const by = new Map();
  for (const ch of info.keys()) {
    for (const p of deep(ch)) {
      if (!by.has(p)) by.set(p, []);
      by.get(p).push(ch);
    }
  }
  // Listed kanji first, by frequency, then the rest in string order.
  const order = (a, b) => (rank.get(a) ?? 1e6) - (rank.get(b) ?? 1e6) || (a < b ? -1 : 1);
  const strokes = strokeCounts();
  const map = {};
  for (const [p, list] of by) map[p] = list.sort(order).join('');
  const shown = [...by.keys()].filter((p) => by.get(p).length >= MIN_PART)
    .sort((a, b) => (strokes.get(a) ?? 99) - (strokes.get(b) ?? 99) || by.get(b).length - by.get(a).length);
  return { map, list: shown.map((p) => [p, strokes.get(p) ?? null]) };
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

function main() {
  const t0 = Date.now();
  const licence = licenceBlock('edrdg', TOOL, {
    upstream: [upstream('jmdictFull'), upstream('kanjidic'), upstream('kanjivg')],
    inputs: [['kanjivg', 'parts, the named components under each character, followed to their own parts']],
  });
  const { info, listed } = kanjiTable();
  const docs = pack(english(firstTier(), info, listed), 'yomu-search/1', licence);
  const written = [];
  const sizes = [];
  const shards = docs.map((doc, i) => {
    const name = `e${String(i).padStart(2, '0')}.json`;
    const file = path.join(OUT, name);
    sizes.push(writeJson(file, doc));
    written.push(file);
    return { src: `data/search/${name}`, first: doc.first };
  });
  const keys = docs.reduce((n, d) => n + Object.keys(d.entries).length, 0);
  const maxKey = Math.max(...docs.flatMap((d) => Object.keys(d.entries).map((k) => k.length)));
  writeJson(path.join(OUT, 'index.json'), {
    _licence: licence, format: 'yomu-search-index/1', keys, maxKey, shards,
  }, 'shards');
  const { map, list } = parts(info, listed);
  const partBytes = writeJson(path.join(OUT, 'parts.json'), {
    _licence: licence, format: 'yomu-parts/1', list, parts: map,
  }, 'parts');
  const gone = pruneStale(OUT, /^e\d+\.json$/, written);
  process.stdout.write([
    `english: ${keys} words in ${docs.length} shards, ${fmtBytes(sizes.reduce((a, b) => a + b, 0))}${gone.length ? `; removed ${gone.join(' ')}` : ''}`,
    `parts: ${Object.keys(map).length} parts, ${list.length} in the picker, ${fmtBytes(partBytes)}`,
    `wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  ].join('\n') + '\n');
}

main();
