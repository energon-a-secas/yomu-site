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
 *   - a dictionary record with an empty `g`, or a field it does not know
 *   - the second tier (data/dict/rare.json) or the names (data/names/) held
 *     to the same range rule, a key in a filter part that calls it absent,
 *     and a name record outside its shape
 *   - a kanji shard ranged by first and last character that holds a
 *     character outside its range, or one a listed shard holds too
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

const RECORD_FIELDS = new Set(['r', 'g', 'p', 'f', 'k', 'u', 'x', 'q', 'w', 'o', 'b', 'c', 't', 'ls', 'ws', 'e']);

/** `ls` is [language, source word or null]; `ws` and `e` are 1 when present. */
function checkRecordMarks(rel, key, i, rec) {
  if (rec.ls !== undefined) {
    const ok = Array.isArray(rec.ls) && rec.ls.length === 2 && typeof rec.ls[0] === 'string' && rec.ls[0]
      && (rec.ls[1] === null || (typeof rec.ls[1] === 'string' && rec.ls[1]));
    if (!ok) fail(rel, `${key}[${i}]: ls is not [language, source or null]`);
  }
  for (const f of ['ws', 'e']) if (rec[f] !== undefined && rec[f] !== 1) fail(rel, `${key}[${i}]: ${f} is not 1`);
  if (rec.ws && !rec.ls) fail(rel, `${key}[${i}]: ws without ls`);
}

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
      checkRecordMarks(rel, key, i, rec);
    });
  }
}

const NAME_TYPES = new Set(['surname', 'given', 'masc', 'fem', 'place']);
const NAME_FIELDS = new Set(['r', 'n', 'f', 's']);

/** A names shard: sorted keys, one record each, `{ r?, n, f?, s? }`. */
function checkNamesShard(rel, doc) {
  const keys = Object.keys(doc.entries || {});
  if (!keys.length) { fail(rel, 'no entries'); return; }
  for (let i = 1; i < keys.length; i += 1) {
    if (!(keys[i - 1] < keys[i])) { fail(rel, `keys out of order at ${JSON.stringify(keys[i])}`); break; }
  }
  if (doc.first !== keys[0] || doc.last !== keys[keys.length - 1]) fail(rel, 'first or last does not match its keys');
  for (const [key, rec] of Object.entries(doc.entries)) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) { fail(rel, `${key}: not a record`); continue; }
    for (const f of Object.keys(rec)) if (!NAME_FIELDS.has(f)) fail(rel, `${key}: unknown field ${f}`);
    const types = typeof rec.n === 'string' ? rec.n.split(' ') : [];
    if (!types.length || types.some((t) => !NAME_TYPES.has(t))) fail(rel, `${key}: n is not a list of name types`);
    if (rec.r !== undefined && (!Array.isArray(rec.r) || rec.r.length !== 1 || typeof rec.r[0] !== 'string' || !rec.r[0])) {
      fail(rel, `${key}: r is not one reading`);
    }
    if (rec.f !== undefined && (typeof rec.f !== 'string' || !rec.r)) fail(rel, `${key}: f without a reading`);
    if (rec.s !== undefined && rec.s !== 1) fail(rel, `${key}: s is not 1`);
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
  'yomu-dict-rare-index/1': null,
  'yomu-dict-rare/1': checkDictShard,
  'yomu-names-index/1': null,
  'yomu-names/1': checkNamesShard,
  'yomu-kanji-index/1': null,
  'yomu-kanji-index/2': null,
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

/**
 * The kanji index: shards that list their characters (`chars`), then, from
 * yomu-kanji-index/2, shards ranged by `first` and `last` in plain string
 * order. A character is in one shard only, and a listed character never
 * sorts into a ranged shard's range as well, because the page looks a
 * character up in the listed shards first and would never reach the range.
 */
function checkKanjiIndex(docs) {
  const rel = 'data/kanji/index.json';
  const index = docs.get(rel);
  const files = shardFiles(docs, 'yomu-kanji/1');
  if (!index) { if (files.length) fail(rel, 'missing, but kanji shards exist'); return; }
  const listed = index.shards || [];
  const srcs = listed.map((s) => s.src);
  for (const f of files) if (!srcs.includes(f)) fail(rel, `does not list ${f}`);
  const seen = new Set();
  let prevLast = null;
  for (const s of listed) {
    const doc = docs.get(s.src);
    if (!doc) { fail(rel, `lists ${s.src}, which is not there`); continue; }
    const chars = Object.keys(doc.entries || {});
    if (s.chars !== undefined) {
      if (chars.join('') !== s.chars) fail(rel, `chars for ${s.src} do not match the shard`);
    } else if (index.format === 'yomu-kanji-index/2') {
      if (s.first !== chars[0] || s.last !== chars[chars.length - 1]) fail(rel, `first or last for ${s.src} do not match the shard`);
      for (let i = 1; i < chars.length; i += 1) {
        if (!(chars[i - 1] < chars[i])) { fail(s.src, `characters out of order at ${chars[i]}`); break; }
      }
      if (prevLast !== null && !(prevLast < s.first)) fail(rel, `${s.src} overlaps the range before it`);
      prevLast = s.last;
    } else {
      fail(rel, `${s.src} has no chars`);
    }
    for (const ch of chars) {
      if (seen.has(ch)) fail(s.src, `${ch} is in more than one shard`);
      seen.add(ch);
    }
  }
  if (index.count !== undefined && index.count !== seen.size) fail(rel, `count is ${index.count}, the shards hold ${seen.size}`);
}

/** The last entry of `list` whose `first` is <= key, or null. */
function rangeOf(list, key) {
  let hit = null;
  for (const s of list) if (s.first <= key) hit = s; else break;
  return hit;
}

/**
 * An index of range shards held to the dictionary's rule: every shard file of
 * `format` listed, firsts in order, each key inside its range, `keys` and
 * `maxKey` true, and every key let through by the filter that covers it
 * (`filters` parts ranged like the shards, or one inline `filter`).
 * Returns the number of keys.
 */
function checkRangeIndex(docs, rel, format) {
  const index = docs.get(rel);
  const files = shardFiles(docs, format);
  if (!index) { if (files.length) fail(rel, `missing, but ${format} shards exist`); return 0; }
  const listed = index.shards || [];
  const srcs = listed.map((s) => s.src);
  for (const f of files) if (!srcs.includes(f)) fail(rel, `does not list ${f}`);
  const parts = [];
  for (const f of index.filters || []) {
    try {
      parts.push({ first: f.first, last: f.last, bloom: readFilter(docs.get(f.src) || {}) });
    } catch (err) { fail(f.src, err.message); }
  }
  for (let i = 1; i < parts.length; i += 1) if (!(parts[i - 1].first < parts[i].first)) fail(rel, 'filter parts out of order');
  // The part covering a key, as js/range-store.js finds it, or null.
  const partOf = (key) => {
    const hit = rangeOf(parts, key);
    if (!hit) return null;
    const last = hit === parts[parts.length - 1] && hit.last !== undefined;
    return !last || key <= hit.last ? hit : null;
  };
  let inline = null;
  if (index.filter) {
    try { inline = readFilter(index.filter); } catch (err) { fail(rel, `filter: ${err.message}`); }
  }
  let total = 0;
  let longest = 0;
  let missed = 0;
  listed.forEach((s, i) => {
    const doc = docs.get(s.src);
    if (!doc) { fail(rel, `lists ${s.src}, which is not there`); return; }
    if (doc.format !== format) { fail(rel, `lists ${s.src}, which is ${doc.format}`); return; }
    if (i > 0 && !(listed[i - 1].first < s.first)) fail(rel, `shard firsts out of order at ${s.src}`);
    if (doc.first !== s.first) fail(rel, `says ${s.src} starts at ${JSON.stringify(s.first)}, the shard says ${JSON.stringify(doc.first)}`);
    const next = listed[i + 1] && listed[i + 1].first;
    for (const key of Object.keys(doc.entries || {})) {
      total += 1;
      longest = Math.max(longest, key.length);
      if (key < s.first || (next !== undefined && key >= next)) {
        fail(s.src, `${JSON.stringify(key)} is outside [${JSON.stringify(s.first)}, ${next === undefined ? 'end' : JSON.stringify(next)})`);
      }
      const part = parts.length ? partOf(key) : null;
      const bloom = part ? part.bloom : inline;
      if ((part || inline) && !(bloom && bloom.has(key))) {
        missed += 1;
        if (missed <= 3) fail(s.src, `the filter calls ${JSON.stringify(key)} absent`);
      }
    }
  });
  if (index.keys !== total) fail(rel, `keys is ${index.keys}, the shards hold ${total}`);
  if (index.maxKey !== longest) fail(rel, `maxKey is ${index.maxKey}, the longest key is ${longest}`);
  return total;
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
    // A file whose text holds the character neither as itself nor as an
    // escape has no string holding it; only a file that does is walked,
    // to say where. Walking all fifty megabytes was a third of the run.
    if (text.includes(EM_DASH) || /\\u2014/i.test(text)) {
      for (const [at, s] of walkStrings(doc)) {
        if (s.includes(EM_DASH)) { fail(rel, `U+2014 at ${at}`); break; }
      }
    }
    if (!Object.hasOwn(FORMATS, doc.format)) { fail(rel, `unknown format ${JSON.stringify(doc.format)}`); continue; }
    const check = FORMATS[doc.format];
    if (check) check(rel, doc);
  }
  checkDictIndex(docs);
  checkKanjiIndex(docs);
  checkRangeIndex(docs, 'data/dict/rare.json', 'yomu-dict-rare/1');
  checkRangeIndex(docs, 'data/names/index.json', 'yomu-names/1');

  if (failures.length) {
    for (const f of failures.slice(0, 50)) process.stderr.write(`FAIL ${f}\n`);
    if (failures.length > 50) process.stderr.write(`... and ${failures.length - 50} more\n`);
    process.exit(1);
  }
  process.stdout.write(`check-data: ${files.length} files, ${fmtBytes(bytes)}, all pass\n`);
}

main();
