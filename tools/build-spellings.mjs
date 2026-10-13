#!/usr/bin/env node
/**
 * data/spell/sNN.json, `yomu-spell/1`: every other way JMdict writes a
 * first-tier word, rare and old ones included, so the Word panel and Search
 * can show 喰べる beside 食べる and say what kind of spelling it is.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-spellings.mjs        (after build-dict)
 *
 * Each first-tier key that has another spelling maps to a list of
 * [reading, [[written, tag], ...]]: per reading, because a key is spelled
 * once per word (方 read かた and ほう are two words), and the page knows the
 * reading a token was read with. `written` is another kanji spelling of the
 * same JMdict entry that the reading applies to (for a kana key, every kanji
 * spelling of its entry); `tag` is JMdict's own word for it, the first of
 * TAGS it carries, or '' for an ordinary spelling. Kana spellings are not
 * listed: the reading is already on the page.
 *
 * Range shards by key, in plain JS string order, as the dictionary's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadZippedJson, upstream } from './lib/sources.mjs';
import { licenceBlock } from './lib/licence.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';

const TOOL = 'tools/build-spellings.mjs';
const DATA = path.join(SITE, 'data');
const OUT = path.join(DATA, 'spell');
/** JMdict's spelling tags, the one shown first when a spelling has several. */
export const TAGS = Object.freeze(['oK', 'rK', 'iK', 'io', 'ateji', 'sK']);
const MAX_FORMS = 6;

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));

function firstTierReadings() {
  const files = ['core.json', ...fs.readdirSync(path.join(DATA, 'dict')).filter((f) => /^w\d+\.json$/.test(f))];
  const out = new Map(); // key -> Set of readings its records give
  for (const f of files) {
    for (const [key, recs] of Object.entries(readJson(`dict/${f}`).entries)) {
      const rs = new Set();
      for (const r of recs) for (const x of (Array.isArray(r.r) && r.r.length ? r.r : [key])) rs.add(x);
      out.set(key, rs);
    }
  }
  return out;
}

const tagOf = (tags) => TAGS.find((t) => (tags || []).includes(t)) || '';
const applies = (kana, kanjiText) => !kana.appliesToKanji || kana.appliesToKanji.includes('*') || kana.appliesToKanji.includes(kanjiText);

function spellings(tier) {
  const jm = loadZippedJson('jmdictFull');
  const by = new Map(); // key -> Map(reading -> Map(written -> tag))
  const add = (key, reading, written, tag) => {
    if (!by.has(key)) by.set(key, new Map());
    const m = by.get(key);
    if (!m.has(reading)) m.set(reading, new Map());
    if (!m.get(reading).has(written)) m.get(reading).set(written, tag);
  };
  for (const w of jm.words) {
    if (w.kanji.length < 1) continue;
    for (const kana of w.kana) {
      const forms = w.kanji.filter((k) => applies(kana, k.text));
      if (forms.length < 1) continue;
      // A kanji key: the entry's other kanji spellings with this reading.
      for (const k of forms) {
        const rs = tier.get(k.text);
        if (!rs || !rs.has(kana.text)) continue;
        for (const o of forms) if (o.text !== k.text) add(k.text, kana.text, o.text, tagOf(o.tags));
      }
      // A kana key: every kanji spelling it applies to.
      const rs = tier.get(kana.text);
      if (rs && rs.has(kana.text)) for (const o of forms) add(kana.text, kana.text, o.text, tagOf(o.tags));
    }
  }
  const out = new Map();
  for (const [key, readings] of by) {
    const rows = [];
    for (const [reading, forms] of readings) {
      // Ordinary spellings first, then by how rare JMdict says each is.
      const list = [...forms].sort((a, b) => (a[1] ? TAGS.indexOf(a[1]) + 1 : 0) - (b[1] ? TAGS.indexOf(b[1]) + 1 : 0)).slice(0, MAX_FORMS);
      if (list.length) rows.push([reading, list]);
    }
    if (rows.length) out.set(key, rows);
  }
  return out;
}

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
  const licence = licenceBlock('edrdg', TOOL, { upstream: [upstream('jmdictFull')] });
  const docs = pack(spellings(firstTierReadings()), 'yomu-spell/1', licence);
  const written = [];
  const sizes = [];
  const shards = docs.map((doc, i) => {
    const name = `s${String(i).padStart(2, '0')}.json`;
    sizes.push(writeJson(path.join(OUT, name), doc));
    written.push(path.join(OUT, name));
    return { src: `data/spell/${name}`, first: doc.first };
  });
  const keys = docs.reduce((n, d) => n + Object.keys(d.entries).length, 0);
  const maxKey = Math.max(...docs.flatMap((d) => Object.keys(d.entries).map((k) => k.length)));
  writeJson(path.join(OUT, 'index.json'), {
    _licence: licence, format: 'yomu-spell-index/1', keys, maxKey, shards,
  }, 'shards');
  const gone = pruneStale(OUT, /^s\d+\.json$/, written);
  process.stdout.write(`spell: ${keys} keys in ${docs.length} shards, ${fmtBytes(sizes.reduce((a, b) => a + b, 0))}${gone.length ? `; removed ${gone.join(' ')}` : ''}\nwall time ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}

main();
