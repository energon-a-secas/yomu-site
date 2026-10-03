#!/usr/bin/env node
/**
 * data/names/index.json and data/names/nNN.json, the names the second phase
 * reads a name guess with (docs/ANALYZER.md, "Data formats").
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, after tools/build-dict.mjs (it leaves out what the first
 * tier already has), commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-names.mjs        (or: make data)
 *
 * The source is JMnedict (tools/lib/sources.mjs), and tools/lib/jmnedict.mjs
 * says which names ship and with which reading. Two kinds ship:
 *
 *   attested  a surname, given name or place name the Tatoeba corpus contains
 *             at least once;
 *   evidence  one at least STRONG_EXT other JMnedict names use, counted the
 *             way tools/lib/jmnedict.mjs counts them (built on it, ending
 *             with it after a surname, or a longer given name), which is how
 *             石井, 前田 and 長谷川 get in: Tatoeba has none of them, and 31
 *             of the hundred commonest surnames would be missing without
 *             this rule (docs/ANALYZER.md has the measurement).
 *
 * A record is `{ r, n, f, s, S }`: the reading (absent for a katakana name,
 * which is read as written), the types (most evidenced first), the per-kanji
 * split of the reading as the dictionary's `f` is cut, `s: 1` for a strong
 * name and `S: 1` for one at least SURE_EXT names are built on. The index
 * carries the key filter inline, so the second phase learns which name shards
 * to fetch from one file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadZippedJson, loadBz2Text, upstream } from './lib/sources.mjs';
import { licenceBlock } from './lib/licence.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';
import { readingTable } from './lib/split.mjs';
import { sentencesOf } from './lib/freq.mjs';
import {
  candidates, surnames, countExtensions, attested, recordOf, STRONG_EXT, SURE_EXT,
} from './lib/jmnedict.mjs';
import { buildFilter } from '../js/bloom.js';

const TOOL = 'tools/build-names.mjs';
const OUT = path.join(SITE, 'data', 'names');
const FORMAT = 'yomu-names/1';
const INDEX_FORMAT = 'yomu-names-index/1';
const BITS_PER_KEY = 16;

/** Every first-tier key, read from the committed shards the page reads. */
function firstTierKeys() {
  const dir = path.join(SITE, 'data', 'dict');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const keys = new Set();
  for (const src of [index.core.src, ...index.shards.map((s) => s.src)]) {
    for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(SITE, src), 'utf8')).entries)) keys.add(k);
  }
  return keys;
}

/** Contiguous key ranges of at most MAX_BYTES, as the dictionary is cut. */
function pack(sorted, records, licence) {
  const header = Buffer.byteLength(serialize({ _licence: licence, format: FORMAT, first: '', last: '', entries: {} })) + 200;
  const shards = [];
  let cur = [];
  let size = header;
  for (const k of sorted) {
    const n = Buffer.byteLength(`${JSON.stringify(k)}: ${JSON.stringify(records.get(k))},\n`);
    if (cur.length && size + n > MAX_BYTES) { shards.push(cur); cur = []; size = header; }
    cur.push(k);
    size += n;
  }
  if (cur.length) shards.push(cur);
  return shards.map((keys) => ({
    _licence: licence,
    format: FORMAT,
    first: keys[0],
    last: keys[keys.length - 1],
    entries: Object.fromEntries(keys.map((k) => [k, records.get(k)])),
  }));
}

function main() {
  const t0 = Date.now();
  const jmnedict = loadZippedJson('jmnedict');
  const kanjidic = loadZippedJson('kanjidic');
  const sentences = sentencesOf(loadBz2Text('tatoebaJpn'));
  const table = readingTable(kanjidic);
  const first = firstTierKeys();

  const cands = candidates(jmnedict);
  countExtensions(jmnedict, cands, surnames(jmnedict));
  const open = new Set([...cands.keys()].filter((k) => !first.has(k)));
  const seen = attested(sentences, open);
  const records = new Map();
  const stats = {
    attested: 0, strongOnly: 0, kanji: 0, katakana: 0, strong: 0, sure: 0, star: 0, untyped: 0,
  };
  for (const text of [...open].sort()) {
    const { rec, evidence } = recordOf(text, cands.get(text), table);
    const inCorpus = seen.has(text);
    // The evidence reads it a way the tier cannot type (相模 さがみ): no name.
    if (!rec) { if (inCorpus) stats.untyped += 1; continue; }
    if (!inCorpus && evidence < STRONG_EXT) continue;
    records.set(text, rec);
    stats[inCorpus ? 'attested' : 'strongOnly'] += 1;
    stats[rec.r ? 'kanji' : 'katakana'] += 1;
    if (rec.s) stats.strong += 1;
    if (rec.S) stats.sure += 1;
    if (rec.f === '*') stats.star += 1;
  }

  const licence = licenceBlock('jmnedict', TOOL, {
    upstream: [upstream('jmnedict'), upstream('kanjidic'), upstream('tatoebaJpn')],
    inputs: [
      ['edrdg', 'f, the split of a name\'s reading over its kanji, from KANJIDIC readings'],
      ['tatoeba', 'which names ship: one the corpus contains at least once; no sentence ships'],
    ],
  });
  const sorted = [...records.keys()].sort();
  const docs = pack(sorted, records, licence);
  const written = [];
  const sizes = [];
  const shards = [];
  docs.forEach((doc, i) => {
    const name = `n${String(i).padStart(2, '0')}.json`;
    sizes.push(writeJson(path.join(OUT, name), doc));
    written.push(path.join(OUT, name));
    shards.push({ src: `data/names/${name}`, first: doc.first });
  });
  const { m, k, bytes } = buildFilter(new Set(sorted), BITS_PER_KEY);
  const indexBytes = writeJson(path.join(OUT, 'index.json'), {
    _licence: licence,
    format: INDEX_FORMAT,
    keys: sorted.length,
    maxKey: sorted.reduce((n, s) => Math.max(n, s.length), 0),
    filter: { n: sorted.length, m, k, bits: Buffer.from(bytes).toString('base64') },
    shards,
  }, 'shards');
  written.push(path.join(OUT, 'index.json'));
  const gone = pruneStale(OUT, /^n\d+\.json$/, written);

  const total = sizes.reduce((a, b) => a + b, 0);
  process.stdout.write(`${[
    `JMnedict spellings of two or more kanji or katakana, typed surname, given or place: ${cands.size}; not first-tier keys ${open.size}`,
    `names ${records.size}: in the corpus ${stats.attested}, by evidence only (${STRONG_EXT} or more other names use it) ${stats.strongOnly}; kanji ${stats.kanji}, katakana ${stats.katakana}; strong ${stats.strong}, sure (ext >= ${SURE_EXT}) ${stats.sure}; read as a whole (*) ${stats.star}`,
    `left out, in the corpus but best read as a type that does not ship: ${stats.untyped}`,
    `shards ${docs.length}: total ${fmtBytes(total)} (${total} B); index with its filter ${fmtBytes(indexBytes)} (${indexBytes} B)`,
    gone.length ? `removed stale shards: ${gone.join(' ')}` : 'no stale shards',
    `wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  ].join('\n')}\n`);
}

main();
