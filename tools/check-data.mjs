#!/usr/bin/env node
/**
 * Every JSON file under data/, held to the rules the page relies on.
 *
 *   node tools/check-data.mjs        (or: make validate)
 *   node tools/check-data.mjs <dir>  a copy of data/ elsewhere, which is how
 *                                    tests/data.test.mjs proves each failure
 *
 * Unlike the builders this reads only the committed files, needs no network
 * and no cache, and is cheap, so it is the thing to run before a commit that
 * touches data/. It fails (exit 1) naming the file and the reason on:
 *
 *   - a file over 140 KB, or one that does not parse
 *   - a missing or incomplete `_licence` block: `source`, `spdx` and
 *     `screen`, and an `acknowledgement` whenever the screen is required;
 *     every entry of `_licence.inputs` is held to the same rule
 *   - a `format` this file does not know
 *   - a dictionary shard whose keys are not sorted in plain JS string order,
 *     or that holds a key outside [its first, the next shard's first), which
 *     is the rule the page uses to pick a shard (docs/ANALYZER.md)
 *   - an index that does not list every shard file, or lists one that is
 *     not there, or disagrees with a shard about its first key or characters
 *   - a key in both the dictionary core and a range shard, or a range key
 *     the key filter would call absent (the page would never fetch it)
 *   - a string anywhere, object keys included, carrying U+2014
 *   - a dictionary record with an empty `g`
 *
 * A new kind of data file gets its format id and a checker in FORMATS below,
 * in the same commit that adds the file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { walkStrings, EM_DASH } from './lib/licence.mjs';
import { MAX_BYTES, SITE, fmtBytes } from './lib/emit.mjs';
import { readFilter } from '../js/bloom.js';

const DATA = process.argv[2] ? path.resolve(process.argv[2]) : path.join(SITE, 'data');
// Paths are reported, and index `src` values resolved, relative to the
// directory that holds data/, the same way the page resolves them.
const ROOT = path.dirname(DATA);
const failures = [];
const fail = (file, reason) => failures.push(`${file}: ${reason}`);

function listJson(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJson(p));
    else if (ent.name.endsWith('.json')) out.push(p);
  }
  return out.sort();
}

function checkLicence(rel, block, at = '_licence') {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    fail(rel, `${at} is missing`);
    return;
  }
  for (const field of ['source', 'spdx', 'screen']) {
    if (typeof block[field] !== 'string' || !block[field].trim()) fail(rel, `${at}.${field} is missing`);
  }
  if (block.screen === 'required'
      && (typeof block.acknowledgement !== 'string' || !block.acknowledgement.trim())) {
    fail(rel, `${at}.screen is required but ${at}.acknowledgement is missing`);
  }
  if (block.inputs !== undefined) {
    if (!Array.isArray(block.inputs)) fail(rel, `${at}.inputs is not a list`);
    else block.inputs.forEach((inp, i) => checkLicence(rel, inp, `${at}.inputs[${i}]`));
  }
}

// ── Per-format checks ─────────────────────────────────────────────────────

const RECORD_FIELDS = new Set(['r', 'g', 'p', 'f', 'k', 'u', 'x', 'q', 'w', 'o', 'b', 'c', 't']);

function checkDictShard(rel, doc) {
  const keys = Object.keys(doc.entries || {});
  if (!keys.length) { fail(rel, 'no entries'); return; }
  for (let i = 1; i < keys.length; i += 1) {
    if (!(keys[i - 1] < keys[i])) {
      fail(rel, `keys out of order: ${JSON.stringify(keys[i - 1])} before ${JSON.stringify(keys[i])}`);
      break;
    }
  }
  if (doc.first !== keys[0]) fail(rel, `first is ${JSON.stringify(doc.first)} but the first key is ${JSON.stringify(keys[0])}`);
  if (doc.last !== keys[keys.length - 1]) fail(rel, `last is ${JSON.stringify(doc.last)} but the last key is ${JSON.stringify(keys[keys.length - 1])}`);
  for (const [key, recs] of Object.entries(doc.entries)) {
    if (!Array.isArray(recs) || !recs.length) { fail(rel, `${key}: no records`); continue; }
    recs.forEach((rec, i) => {
      if (!Array.isArray(rec.g) || !rec.g.length || rec.g.some((g) => typeof g !== 'string' || !g)) {
        fail(rel, `${key}[${i}]: empty g`);
      }
      for (const f of Object.keys(rec)) if (!RECORD_FIELDS.has(f)) fail(rel, `${key}[${i}]: unknown field ${f}`);
    });
  }
}

function checkKanjiShard(rel, doc) {
  const entries = Object.entries(doc.entries || {});
  if (!entries.length) fail(rel, 'no entries');
  for (const [ch, e] of entries) {
    if ([...ch].length !== 1) fail(rel, `${JSON.stringify(ch)} is not one character`);
    for (const f of ['on', 'kun', 'm', 'parts']) if (!Array.isArray(e[f])) fail(rel, `${ch}: ${f} is not a list`);
    if (!Number.isInteger(e.s)) fail(rel, `${ch}: no stroke count`);
    if (!e.m || !e.m.length) fail(rel, `${ch}: no meaning`);
  }
}

// A null checker means the generic rules above are the whole check here:
// the indexes are checked against their shards below, and the phrase library
// is authored by hand and has its own test (tests/library.test.mjs).
const FORMATS = {
  'yomu-dict-index/1': null,
  'yomu-dict-index/2': null,
  'yomu-dict/1': checkDictShard,
  'yomu-dict-core/1': checkDictShard,
  'yomu-dict-filter/1': null,
  'yomu-kanji-index/1': null,
  'yomu-kanji/1': checkKanjiShard,
  'yomu-library/1': null,
};

// ── Indexes against their shards ──────────────────────────────────────────

function shardFiles(docs, format) {
  return [...docs].filter(([, d]) => d.format === format).map(([rel]) => rel);
}

function checkDictIndex(docs) {
  const rel = 'data/dict/index.json';
  const index = docs.get(rel);
  const files = shardFiles(docs, 'yomu-dict/1');
  if (!index) { if (files.length) fail(rel, 'missing, but dictionary shards exist'); return; }
  const listed = index.shards || [];
  const srcs = listed.map((s) => s.src);
  for (const f of files) if (!srcs.includes(f)) fail(rel, `does not list ${f}`);
  let total = 0;
  let longest = 0;
  listed.forEach((s, i) => {
    const doc = docs.get(s.src);
    if (!doc) { fail(rel, `lists ${s.src}, which is not there`); return; }
    if (doc.format !== 'yomu-dict/1') { fail(rel, `lists ${s.src}, which is ${doc.format}`); return; }
    if (i > 0 && !(listed[i - 1].first < s.first)) fail(rel, `shard firsts out of order at ${s.src}`);
    if (doc.first !== s.first) fail(rel, `says ${s.src} starts at ${JSON.stringify(s.first)}, the shard says ${JSON.stringify(doc.first)}`);
    const next = listed[i + 1] && listed[i + 1].first;
    for (const key of Object.keys(doc.entries || {})) {
      total += 1;
      longest = Math.max(longest, key.length);
      if (key < s.first || (next !== undefined && key >= next)) {
        fail(s.src, `${JSON.stringify(key)} is outside [${JSON.stringify(s.first)}, ${next === undefined ? 'end' : JSON.stringify(next)})`);
      }
    }
  });
  // The core (yomu-dict-index/2) holds keys no range shard may hold, and
  // the filter must let every range key through: a key it called absent
  // would never be fetched and would read as unknown.
  const coreDoc = index.core && docs.get(index.core.src);
  if (index.core && !coreDoc) fail(rel, `lists the core ${index.core.src}, which is not there`);
  if (coreDoc) {
    const rangeKeys = new Set(listed.flatMap((s) => Object.keys((docs.get(s.src) || {}).entries || {})));
    const coreKeys = Object.keys(coreDoc.entries || {});
    for (const key of coreKeys) {
      total += 1;
      longest = Math.max(longest, key.length);
      if (rangeKeys.has(key)) fail(index.core.src, `${JSON.stringify(key)} is in a range shard as well`);
    }
    if (index.core.keys !== coreKeys.length) fail(rel, `says the core holds ${index.core.keys} keys, it holds ${coreKeys.length}`);
  }
  if (index.filter) {
    const doc = docs.get(index.filter.src);
    let bloom = null;
    try { bloom = doc && readFilter(doc); } catch (err) { fail(index.filter.src, err.message); }
    if (!doc) fail(rel, `lists the filter ${index.filter.src}, which is not there`);
    let missed = 0;
    if (bloom) {
      for (const s of listed) {
        for (const key of Object.keys((docs.get(s.src) || {}).entries || {})) {
          if (!bloom.has(key)) { missed += 1; if (missed <= 3) fail(index.filter.src, `calls ${JSON.stringify(key)} absent`); }
        }
      }
    }
  }
  if (index.keys !== total) fail(rel, `keys is ${index.keys}, the shards hold ${total}`);
  if (index.maxKey !== longest) fail(rel, `maxKey is ${index.maxKey}, the longest key is ${longest}`);
}

function checkKanjiIndex(docs) {
  const rel = 'data/kanji/index.json';
  const index = docs.get(rel);
  const files = shardFiles(docs, 'yomu-kanji/1');
  if (!index) { if (files.length) fail(rel, 'missing, but kanji shards exist'); return; }
  const listed = index.shards || [];
  const srcs = listed.map((s) => s.src);
  for (const f of files) if (!srcs.includes(f)) fail(rel, `does not list ${f}`);
  const seen = new Set();
  for (const s of listed) {
    const doc = docs.get(s.src);
    if (!doc) { fail(rel, `lists ${s.src}, which is not there`); continue; }
    const chars = Object.keys(doc.entries || {}).join('');
    if (chars !== s.chars) fail(rel, `chars for ${s.src} do not match the shard`);
    for (const ch of Object.keys(doc.entries || {})) {
      if (seen.has(ch)) fail(s.src, `${ch} is in more than one shard`);
      seen.add(ch);
    }
  }
  if (index.count !== undefined && index.count !== seen.size) fail(rel, `count is ${index.count}, the shards hold ${seen.size}`);
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  const files = listJson(DATA);
  const docs = new Map();
  let bytes = 0;
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const text = fs.readFileSync(abs, 'utf8');
    const size = Buffer.byteLength(text);
    bytes += size;
    if (size > MAX_BYTES) fail(rel, `${fmtBytes(size)} is over the ${fmtBytes(MAX_BYTES)} cap`);
    let doc;
    try { doc = JSON.parse(text); } catch (err) { fail(rel, `does not parse: ${err.message}`); continue; }
    docs.set(rel, doc);
    checkLicence(rel, doc._licence);
    for (const [at, s] of walkStrings(doc)) {
      if (s.includes(EM_DASH)) { fail(rel, `U+2014 at ${at}`); break; }
    }
    if (!Object.hasOwn(FORMATS, doc.format)) { fail(rel, `unknown format ${JSON.stringify(doc.format)}`); continue; }
    const check = FORMATS[doc.format];
    if (check) check(rel, doc);
  }
  checkDictIndex(docs);
  checkKanjiIndex(docs);

  if (failures.length) {
    for (const f of failures.slice(0, 50)) process.stderr.write(`FAIL ${f}\n`);
    if (failures.length > 50) process.stderr.write(`... and ${failures.length - 50} more\n`);
    process.exit(1);
  }
  process.stdout.write(`check-data: ${files.length} files, ${fmtBytes(bytes)}, all pass\n`);
}

main();
