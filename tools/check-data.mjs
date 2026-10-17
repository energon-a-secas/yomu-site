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
 *   - an `m` (a mixed spelling's mark) in the second tier, on a key that is
 *     not kanji with one run of two or more hiragana, or on some of a key's
 *     records and not the others
 *   - the second tier (data/dict/rare.json) or the names (data/names/) held
 *     to the same range rule, a key in a filter part that calls it absent,
 *     and a name record outside its shape
 *   - a popular-names file (data/names/popular.json) whose rows are not
 *     [katakana, Latin letters, given | surname | person | place, a count of
 *     at least 1], highest count first, at most 1,000, or disagree with the
 *     names tier beside it (its spelling, and its first type, or a `person`
 *     over a tier `place`, or a `place` over a spelling the tier types a
 *     place among its types), or give a row tools/lib/name-classes.mjs
 *     authors another class, or that does not carry the tier's licence block
 *   - a kanji shard ranged by first and last character that holds a
 *     character outside its range, or one a listed shard holds too
 *   - a jōyō list (data/kanji/joyo.json) whose grades are not the seven
 *     KANJIDIC grades with the sizes of the 2010 list, that repeats a kanji,
 *     names one no kanji shard holds or one the shards file under another
 *     grade, or is not what tools/lib/joyo.mjs builds from the shards
 *   - a sound-alike group (data/like/) holding anything but lowercase
 *     English words with a count, a word the page would never look for in
 *     that group, or one the house style bans; and an index that does not
 *     list every group file, or miscounts one, or whose odds are not counts
 *   - Play's kanji look-alikes (data/play/lookalikes.json) keyed by anything
 *     but a jōyō kanji, listing a kanji the shards do not hold, more than
 *     five, one twice or a kanji as its own, a pair between two jōyō kanji
 *     one way only, or anything but what tools/lib/lookalikes.mjs builds
 *     from the shards
 *   - the lines of "Where are the spaces?" (data/play/spaces.json) missing
 *     beside the phrase library, or not in the shape tools/lib/spaces.mjs
 *     emits: tiers in order, every gap at a position between two characters
 *     words are made of, in order, with a reason js/gaps.js knows, and no
 *     text or id twice. Whether the gaps are the analyzer's is
 *     tests/spaces.test.mjs's to say, since that needs the analyzer
 *   - example sentences (data/sent/) held to the range rule, more than three
 *     to a reading, an id that is not a number, or a span outside its sentence
 *   - other spellings (data/spell/) held to the range rule, a spelling
 *     that is the key itself, or a tag JMdict does not give
 *   - search's English index (data/search/) held to the range rule, a word
 *     that is not lower-case English, a key the first tier does not hold,
 *     and a parts picker (data/search/parts.json) out of its shape
 *   - the collections (data/sets/): a row out of its shape, a set the index
 *     does not list, or a count the files do not hold
 *   - the kanji page's files (data/strokes/, data/kpage/) held to the range
 *     rule, a stroke that is not SVG path data, a page word that does not
 *     contain its kanji, or a kanji listed among its own neighbours
 *
 * A new kind of data file gets its format id and a checker in FORMATS below,
 * in the same commit that adds the file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { walkStrings, EM_DASH } from './lib/licence.mjs';
import { MAX_BYTES, SITE, fmtBytes } from './lib/emit.mjs';
import { readFilter } from '../js/bloom.js';
import { isKanji, isHiragana } from '../js/kana.js';
import {
  joyoDoc, JOYO_FORMAT, JOYO_GRADES, JOYO_SIZES, JOYO_TOTAL, jinmeiyoDoc, JINMEIYO_FORMAT,
} from './lib/joyo.mjs';
import { jlptProblems, JLPT_FORMAT } from './lib/jlpt.mjs';
import { groupsOfWord } from '../js/sounds-like.js';
import { BANNED_WORDS } from './lib/licence.mjs';
import { LOOKALIKES_FORMAT, LOOKALIKES_SRC, lookalikesProblems } from './lib/lookalikes.mjs';
import { KATAKANA_TYPES, LATIN_NAME } from './lib/jmnedict.mjs';
import { popularProblems, POPULAR_FORMAT } from './lib/popular.mjs';
import { SPACES_FORMAT, SPACES_SRC, spacesProblems } from './lib/spaces.mjs';

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

const RECORD_FIELDS = new Set(['r', 'g', 'p', 'f', 'k', 'u', 'x', 'q', 'w', 'o', 'b', 'c', 't', 'ls', 'ws', 'e', 'm']);

/** `ls` is [language, source word or null]; `ws`, `e` and `m` are 1 when present. */
function checkRecordMarks(rel, key, i, rec) {
  if (rec.ls !== undefined) {
    const ok = Array.isArray(rec.ls) && rec.ls.length === 2 && typeof rec.ls[0] === 'string' && rec.ls[0]
      && (rec.ls[1] === null || (typeof rec.ls[1] === 'string' && rec.ls[1]));
    if (!ok) fail(rel, `${key}[${i}]: ls is not [language, source or null]`);
  }
  for (const f of ['ws', 'e', 'm']) if (rec[f] !== undefined && rec[f] !== 1) fail(rel, `${key}[${i}]: ${f} is not 1`);
  if (rec.ws && !rec.ls) fail(rel, `${key}[${i}]: ws without ls`);
}

/** Kanji and one run of two or more hiragana, the shape of a spelling the mixed rule ships (あめ色, ひと昔前). */
function mixedShape(key) {
  const shape = [...key].map((ch) => (isKanji(ch) ? 'k' : isHiragana(ch) ? 'h' : '?')).join('');
  return /^k*hh+k*$/.test(shape) && shape.includes('k');
}

/**
 * `m` marks a key the first tier holds for the mixed rule alone, so it is a
 * property of the key: on every record or on none, only in the first tier,
 * and only on a key of that shape (tools/build-dict.mjs).
 */
function checkMixedMark(rel, key, recs, rare) {
  const marked = recs.filter((rec) => rec.m !== undefined).length;
  if (!marked) return;
  if (rare) fail(rel, `${key}: m in the second tier`);
  if (marked !== recs.length) fail(rel, `${key}: m on ${marked} of ${recs.length} records`);
  if (!mixedShape(key)) fail(rel, `${key}: m on a key that is no mixed spelling`);
}

function checkDictShard(rel, doc, rare = false) {
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
    checkMixedMark(rel, key, recs, rare);
  }
}

const NAME_TYPES = new Set(['surname', 'given', 'masc', 'fem', 'place']);
const NAME_FIELDS = new Set(['r', 'n', 'f', 's', 'S', 'o']);

/** A names shard: sorted keys, one record each, `{ r?, n, f?, s?, S?, o? }`. */
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
    // `person` ships for a katakana name only (tools/lib/jmnedict.mjs KATAKANA_TYPES)
    const katakana = !rec.r;
    if (!types.length || types.some((t) => !NAME_TYPES.has(t) && !(katakana && KATAKANA_TYPES[t]))) fail(rel, `${key}: n is not a list of name types`);
    // `o`, the original spelling, is a katakana name's, in Latin letters
    if (rec.o !== undefined && (!katakana || typeof rec.o !== 'string' || !LATIN_NAME.test(rec.o))) fail(rel, `${key}: o is not a katakana name's spelling in Latin letters`);
    if (rec.r !== undefined && (!Array.isArray(rec.r) || rec.r.length !== 1 || typeof rec.r[0] !== 'string' || !rec.r[0])) {
      fail(rel, `${key}: r is not one reading`);
    }
    if (rec.f !== undefined && (typeof rec.f !== 'string' || !rec.r)) fail(rel, `${key}: f without a reading`);
    if (rec.s !== undefined && rec.s !== 1) fail(rel, `${key}: s is not 1`);
    // S (sure) is a strong name built on often enough: never without s
    if (rec.S !== undefined && (rec.S !== 1 || rec.s !== 1)) fail(rel, `${key}: S is not 1 on a strong name`);
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

/** The list on its own: seven grades of the right sizes, 2,136 kanji, none twice. */
function checkJoyoDoc(rel, doc) {
  const grades = doc.grades;
  if (!grades || typeof grades !== 'object' || Array.isArray(grades)) { fail(rel, 'grades is not an object'); return; }
  const want = JOYO_GRADES.map(String);
  const have = Object.keys(grades);
  if (have.join() !== want.join()) fail(rel, `grades are ${JSON.stringify(have)}, not ${JSON.stringify(want)}`);
  const all = new Set();
  let total = 0;
  for (const grade of want) {
    if (typeof grades[grade] !== 'string') { fail(rel, `grade ${grade} is not a string`); continue; }
    const chars = [...grades[grade]];
    if (chars.length !== JOYO_SIZES[grade]) fail(rel, `grade ${grade} holds ${chars.length} kanji, not ${JOYO_SIZES[grade]}`);
    for (const ch of chars) {
      if (all.has(ch)) fail(rel, `${ch} is listed twice`);
      all.add(ch);
    }
    total += chars.length;
  }
  if (doc.count !== JOYO_TOTAL || total !== JOYO_TOTAL) fail(rel, `count is ${doc.count} and the grades hold ${total}, not ${JOYO_TOTAL}`);
}

/**
 * A sound-alike group: lowercase English words, each with how many records
 * gloss with it, each filed where js/sounds-like.js looks for it (a word in
 * the wrong group would never be offered), and none the house style bans.
 */
function checkLikeGroup(rel, doc) {
  const words = doc.words && typeof doc.words === 'object' && !Array.isArray(doc.words) ? Object.entries(doc.words) : [];
  if (!words.length) { fail(rel, 'no words'); return; }
  for (const [w, n] of words) {
    if (!/^[a-z]{2,}$/.test(w)) { fail(rel, `${JSON.stringify(w)} is not a lowercase English word`); continue; }
    if (!Number.isInteger(n) || n < 1) fail(rel, `${w}: count is not a positive integer`);
    if (!groupsOfWord(w).includes(doc.group)) fail(rel, `${w} is not filed under ${doc.group} by js/sounds-like.js`);
    if (BANNED_WORDS.test(w)) fail(rel, `${w} is a word the house style bans`);
  }
}

// A null checker means the generic rules above are the whole check here:
// the indexes are checked against their shards below, and the phrase library
// is authored by hand and has its own test (tests/library.test.mjs).
// The recorded voices (tools/build-audio.mjs, docs/AUDIO.md): the index names
// its voices and key shards; every shard holds keys of its own range only;
// every clip a voice's bit promises is a file, and every file is one some
// bit promises. A clip a voice failed its check for has no bit, so it must
// not be on disk, and the page can never play a recording that did not say
// what Yomu shows.
const CLIP_ID = /^[0-9a-z]+$/;
const AUDIO_SHARD = /^data\/audio\/k\d{2}\.json$/;
function checkAudioIndex(rel, doc) {
  const voices = Array.isArray(doc.voices) ? doc.voices : [];
  if (!voices.length) fail(rel, 'no voices');
  if (voices.length > 30) fail(rel, `${voices.length} voices, more than a mask holds`);
  for (const v of voices) {
    if (!/^[a-z]+$/.test(v.id || '') || !v.label || !v.label.en || !v.label.es) fail(rel, `voice ${JSON.stringify(v.id)} needs an id and an en and es label`);
  }
  const shards = Array.isArray(doc.shards) ? doc.shards : [];
  if (!shards.length) fail(rel, 'no shards');
  shards.forEach((sh, n) => {
    if (!sh || typeof sh.first !== 'string' || !AUDIO_SHARD.test(sh.src || '')) fail(rel, `shards[${n}] needs a first key and a data/audio/kNN.json src`);
    else if (n && !(shards[n - 1].first < sh.first)) fail(rel, `shards[${n}] starts at or before the shard before it`);
  });
}
function checkAudioShard(rel, doc) {
  for (const [key, entry] of Object.entries(doc.clips || {})) {
    if (!key || !Array.isArray(entry) || entry.length !== 2 || !CLIP_ID.test(entry[0]) || !Number.isInteger(entry[1]) || entry[1] <= 0) {
      fail(rel, `clip ${JSON.stringify(key)} is not [id, mask]`);
    }
  }
}
function checkAudio(docs) {
  const rel = 'data/audio/index.json';
  const index = docs.get(rel);
  const dir = path.join(DATA, 'audio');
  if (!index) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.json'))) fail(rel, 'missing, but data/audio/ has shards');
    return;
  }
  const voices = index.voices || [];
  const want = voices.map(() => new Set());
  const shards = index.shards || [];
  shards.forEach((sh, n) => {
    const doc = docs.get(sh.src);
    if (!doc) { fail(rel, `${sh.src} is listed but missing`); return; }
    const next = shards[n + 1] && shards[n + 1].first;
    for (const [key, [id, mask]] of Object.entries(doc.clips || {})) {
      if (key < sh.first || (next !== undefined && key >= next)) fail(sh.src, `${JSON.stringify(key)} is outside its range`);
      if (mask >> voices.length) fail(sh.src, `${JSON.stringify(key)} names a voice the index has not`);
      voices.forEach((v, i) => { if (mask & (1 << i)) want[i].add(`${id}.mp3`); });
    }
  });
  const listed = new Set(shards.map((sh) => sh.src));
  for (const f of fs.readdirSync(dir)) {
    if (/^k\d+\.json$/.test(f) && !listed.has(`data/audio/${f}`)) fail(`data/audio/${f}`, 'a shard the index does not list');
  }
  voices.forEach((v, i) => {
    const vdir = path.join(dir, v.id);
    const have = new Set(fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => f.endsWith('.mp3')) : []);
    for (const f of want[i]) {
      if (!have.has(f)) { fail(rel, `${v.id}/${f} is promised but not on disk`); continue; }
      const size = fs.statSync(path.join(vdir, f)).size;
      if (size > MAX_BYTES) fail(`data/audio/${v.id}/${f}`, `${fmtBytes(size)} is over the ${fmtBytes(MAX_BYTES)} cap`);
    }
    for (const f of have) if (!want[i].has(f)) fail(`data/audio/${v.id}/${f}`, 'on disk but no shard promises it (a clip that failed its check, or one no line needs)');
  });
}

const FORMATS = {
  'yomu-dict-index/1': null,
  'yomu-dict-index/2': null,
  'yomu-dict/1': checkDictShard,
  'yomu-dict-core/1': checkDictShard,
  'yomu-dict-filter/1': null,
  'yomu-dict-rare-index/1': null,
  'yomu-dict-rare/1': (rel, doc) => checkDictShard(rel, doc, true),
  'yomu-names-index/1': null,
  'yomu-names/1': checkNamesShard,
  [POPULAR_FORMAT]: null,
  'yomu-kanji-index/1': null,
  'yomu-kanji-index/2': null,
  'yomu-kanji/1': checkKanjiShard,
  'yomu-library/1': null,
  'yomu-audio/2': checkAudioIndex,
  'yomu-audio-clips/1': checkAudioShard,
  [JOYO_FORMAT]: checkJoyoDoc,
  [JINMEIYO_FORMAT]: null,
  [JLPT_FORMAT]: (rel, doc) => { for (const p of jlptProblems(doc)) fail(rel, p); },
  'yomu-strokes-index/1': null,
  'yomu-strokes/1': checkStrokes,
  'yomu-kpage-index/1': null,
  'yomu-kpage/1': checkKpage,
  'yomu-daily/1': checkDaily,
  'yomu-sentences-index/1': null,
  'yomu-sentences/1': checkSentences,
  'yomu-sentences-more-index/1': null,
  'yomu-sentences-more/1': checkSentencesMore,
  'yomu-spell-index/1': null,
  'yomu-spell/1': checkSpell,
  'yomu-search-index/1': null,
  'yomu-search/1': checkSearchShard,
  'yomu-search-rare-index/1': null,
  'yomu-search-rare/1': checkSearchRare,
  'yomu-parts/1': checkParts,
  'yomu-sets-index/1': null,
  'yomu-set/1': checkSet,
  'yomu-sets-words-index/1': null,
  'yomu-sets-words/1': checkSetWords,
  'yomu-like-index/1': null,
  'yomu-like/1': checkLikeGroup,
  [LOOKALIKES_FORMAT]: null,
  [SPACES_FORMAT]: (rel, doc) => { for (const why of spacesProblems(doc)) fail(rel, why); },
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

/**
 * The jōyō list against the kanji shards: every kanji in it is in a shard,
 * filed under the same grade, every shard kanji of a jōyō grade is in it,
 * and the list is what tools/lib/joyo.mjs builds from the shards (its order
 * included), so a hand edit cannot pass.
 */
function checkJoyo(docs) {
  const rel = 'data/kanji/joyo.json';
  const doc = docs.get(rel);
  const shards = shardFiles(docs, 'yomu-kanji/1');
  if (!doc) { if (shards.length) fail(rel, 'missing, but kanji shards exist'); return; }
  if (doc.format !== JOYO_FORMAT || !doc.grades || typeof doc.grades !== 'object') return;
  const entries = new Map();
  for (const src of shards) for (const [ch, e] of Object.entries(docs.get(src).entries || {})) entries.set(ch, e);
  for (const [grade, chars] of Object.entries(doc.grades)) {
    for (const ch of [...String(chars)]) {
      const e = entries.get(ch);
      if (!e) fail(rel, `${ch} is in no kanji shard`);
      else if (String(e.g) !== grade) fail(rel, `${ch} is listed in grade ${grade}, the shards file it under ${e.g === undefined ? 'no grade' : e.g}`);
    }
  }
  const built = joyoDoc(entries, doc._licence);
  for (const grade of JOYO_GRADES.map(String)) {
    if (built.grades[grade] !== doc.grades[grade]) {
      fail(rel, `grade ${grade} is not what the shards give; run node tools/build-joyo.mjs`);
    }
  }
}

/** The name kanji: the shards' grades 9 and 10, in the builder's order, nothing else. */
function checkJinmeiyo(docs) {
  const rel = 'data/kanji/jinmeiyo.json';
  const doc = docs.get(rel);
  const shards = shardFiles(docs, 'yomu-kanji/1');
  if (!doc) { if (shards.length) fail(rel, 'missing, but kanji shards exist'); return; }
  const entries = new Map();
  for (const src of shards) for (const [ch, e] of Object.entries(docs.get(src).entries || {})) entries.set(ch, e);
  const built = jinmeiyoDoc(entries, doc._licence);
  if (typeof doc.kanji !== 'string' || doc.kanji !== built.kanji || doc.count !== built.count) {
    fail(rel, `is not what the shards give (${built.count} kanji of grades 9 and 10); run node tools/build-joyo.mjs`);
  }
}

/** The JLPT lists: every kanji one the kanji shards hold, so its page can show it. */
function checkJlpt(docs) {
  const rel = 'data/kanji/jlpt.json';
  const doc = docs.get(rel);
  const shards = shardFiles(docs, 'yomu-kanji/1');
  if (!doc) { if (shards.length) fail(rel, 'missing, but kanji shards exist; run node tools/build-jlpt.mjs'); return; }
  const known = new Set();
  for (const src of shards) for (const ch of Object.keys(docs.get(src).entries || {})) known.add(ch);
  for (const p of jlptProblems(doc, known)) if (p.endsWith('in no kanji shard')) fail(rel, p);
}

/**
 * The sound-alike index: every group file listed under its own group, each
 * count true, and the odds a map of English spellings to katakana counts.
 */
function checkLikeIndex(docs) {
  const rel = 'data/like/index.json';
  const index = docs.get(rel);
  const files = shardFiles(docs, 'yomu-like/1');
  if (!index) { if (files.length) fail(rel, 'missing, but sound-alike groups exist'); return; }
  const listed = Object.entries(index.groups || {});
  const srcs = listed.map(([, g]) => g.src);
  for (const f of files) if (!srcs.includes(f)) fail(rel, `does not list ${f}`);
  const all = new Set();
  for (const [id, g] of listed) {
    const doc = docs.get(g.src);
    if (!doc) { fail(rel, `lists ${g.src}, which is not there`); continue; }
    if (doc.format !== 'yomu-like/1' || doc.group !== id) { fail(rel, `lists ${g.src} as ${id}, which it is not`); continue; }
    const words = Object.keys(doc.words || {});
    if (g.words !== words.length) fail(rel, `says ${g.src} holds ${g.words} words, it holds ${words.length}`);
    for (const w of words) all.add(w);
  }
  if (index.words !== all.size) fail(rel, `words is ${index.words}, the groups hold ${all.size}`);
  const pieces = index.pieces && typeof index.pieces === 'object' ? Object.entries(index.pieces) : [];
  if (!pieces.length) fail(rel, 'no pieces');
  for (const [eng, row] of pieces) {
    const counts = row && typeof row === 'object' ? Object.values(row) : [];
    if (!counts.length || counts.some((n) => !Number.isInteger(n) || n < 1)) fail(rel, `pieces.${eng} is not a map of counts`);
  }
}

/** Play's look-alikes against the kanji shards and the jōyō list (tools/lib/lookalikes.mjs). */
function checkLookalikes(docs) {
  const doc = docs.get(LOOKALIKES_SRC);
  const shards = shardFiles(docs, 'yomu-kanji/1');
  if (!doc) { if (shards.length) fail(LOOKALIKES_SRC, 'missing, but kanji shards exist'); return; }
  const joyo = docs.get('data/kanji/joyo.json');
  if (!joyo || !joyo.grades || typeof joyo.grades !== 'object') return;
  const entries = new Map();
  for (const src of shards) for (const [ch, e] of Object.entries(docs.get(src).entries || {})) entries.set(ch, e);
  const chars = Object.values(joyo.grades).flatMap((g) => [...String(g)]).filter((ch) => entries.has(ch));
  for (const why of lookalikesProblems(doc, entries, chars)) fail(LOOKALIKES_SRC, why);
}

/** "Where are the spaces?" reads the phrase library's lines: its file goes where the library goes. */
function checkSpaces(docs) {
  if (!docs.get(SPACES_SRC) && docs.get('data/phrases/library.json')) fail(SPACES_SRC, 'missing, but the phrase library exists');
}

/**
 * The popular names (data/names/popular.json, tools/lib/popular.mjs): the
 * rows' format and order, and, where the names tier is beside it, that each
 * row is a name the tier ships with the same original spelling and first
 * type (or the class the corpus or tools/lib/name-classes.mjs moved it
 * to, within the bound `popularProblems` states), that an authored row
 * carries its authored class, and that the file carries the tier's licence
 * block.
 */
function checkPopular(docs) {
  const rel = 'data/names/popular.json';
  const doc = docs.get(rel);
  const index = docs.get('data/names/index.json');
  if (!doc) { if (index) fail(rel, 'missing, but the names tier exists'); return; }
  if (doc.format !== POPULAR_FORMAT) { fail(rel, `format is ${JSON.stringify(doc.format)}, not ${POPULAR_FORMAT}`); return; }
  let names = null;
  if (index) {
    names = new Map();
    for (const s of index.shards || []) for (const [k, v] of Object.entries((docs.get(s.src) || {}).entries || {})) names.set(k, v);
  }
  for (const reason of popularProblems(doc, { names, licence: index ? index._licence : null })) fail(rel, reason);
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

// ── The kanji page (tools/build-kanji-page.mjs) ──────────────────────────

/** A stroke shard: one character per key, each a list of SVG path data. */
function checkStrokes(rel, doc) {
  for (const [ch, paths] of Object.entries(doc.entries || {})) {
    if ([...ch].length !== 1) fail(rel, `${JSON.stringify(ch)} is not one character`);
    if (!Array.isArray(paths) || !paths.length || !paths.every((d) => typeof d === 'string' && /^[Mm][\d.,\s\-+eEcCsSlLzZhHvVqQtTaA]+$/.test(d))) {
      fail(rel, `${JSON.stringify(ch)} is not a list of path data`);
    }
  }
}

/** A kanji page shard: `w` [written, reading, gloss] rows, `p` part to kanji, `u` kanji. */
function checkKpage(rel, doc) {
  for (const [ch, e] of Object.entries(doc.entries || {})) {
    const extra = Object.keys(e).filter((k) => !['w', 'p', 'u', 'v'].includes(k));
    if (extra.length) fail(rel, `${JSON.stringify(ch)} has unknown fields ${extra.join(' ')}`);
    if (e.w && !(Array.isArray(e.w) && e.w.length <= 10 && e.w.every((r) => Array.isArray(r) && r.length === 3 && r.every((x) => typeof x === 'string' && x)))) {
      fail(rel, `${JSON.stringify(ch)} has a malformed w`);
    }
    // A kanji's words are written with it; a kana's start with its sound.
    if (e.w && e.w.some((r) => !r[0].includes(ch) && !r[1].startsWith(ch))) fail(rel, `${JSON.stringify(ch)} lists a word without it`);
    for (const list of [...Object.values(e.p || {}), e.u || '', e.v || '']) {
      if (typeof list !== 'string' || [...list].includes(ch)) fail(rel, `${JSON.stringify(ch)} has a malformed neighbour list`);
    }
  }
}

/** The kanji of the day: [kanji, meaning, word with it, its reading, its gloss], each kanji once. */
function checkDaily(rel, doc) {
  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  if (!rows.length) fail(rel, 'has no rows');
  const seen = new Set();
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== 5 || !r.every((x) => typeof x === 'string' && x) || !r[2].includes(r[0]) || seen.has(r[0])) {
      fail(rel, `row ${JSON.stringify(r)} is not [kanji, meaning, a word with it, reading, gloss], once`);
    }
    seen.add(r[0]);
  }
}

/**
 * Example sentences (tools/build-sentences.mjs): [reading, [[Tatoeba id,
 * Japanese, English, start, end]]], at most three per reading, with the word's
 * span inside the Japanese and the id a Tatoeba sentence number.
 */
/** One example sentence: [Tatoeba id, Japanese, English, start, end], the span inside the Japanese. */
const isExample = (x) => Array.isArray(x) && x.length === 5
  && /^\d+$/.test(x[0]) && typeof x[1] === 'string' && typeof x[2] === 'string' && x[2]
  && Number.isInteger(x[3]) && Number.isInteger(x[4]) && x[3] >= 0 && x[3] < x[4] && x[4] <= x[1].length;

/** The examples shown: [reading, one to three sentences, how many more behind More (1 to 7), left out for none]. */
function checkSentences(rel, doc) {
  for (const [key, rows] of Object.entries(doc.entries || {})) {
    const ok = Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r) && (r.length === 2 || r.length === 3) && typeof r[0] === 'string' && r[0]
      && Array.isArray(r[1]) && r[1].length >= 1 && r[1].length <= 3 && r[1].every(isExample)
      && (r.length === 2 || (Number.isInteger(r[2]) && r[2] >= 1 && r[2] <= 7)));
    if (!ok) fail(rel, `${JSON.stringify(key)} is not a list of [reading, [[id, Japanese, English, start, end]], more?]`);
  }
}

/** The examples behind More: [reading, one to seven sentences]. */
function checkSentencesMore(rel, doc) {
  for (const [key, rows] of Object.entries(doc.entries || {})) {
    const ok = Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r) && r.length === 2 && typeof r[0] === 'string' && r[0]
      && Array.isArray(r[1]) && r[1].length >= 1 && r[1].length <= 7 && r[1].every(isExample));
    if (!ok) fail(rel, `${JSON.stringify(key)} is not a list of [reading, [[id, Japanese, English, start, end]]]`);
  }
}

/**
 * A row's count of more examples is what the more shards hold for that key
 * and reading, and no sentence is both shown and behind More.
 */
function checkMoreCounts(docs) {
  const more = new Map();
  for (const src of shardFiles(docs, 'yomu-sentences-more/1')) {
    for (const [key, rows] of Object.entries(docs.get(src).entries || {})) for (const [r, list] of rows) more.set(`${key}\u0000${r}`, list);
  }
  const seen = new Set();
  for (const src of shardFiles(docs, 'yomu-sentences/1')) {
    for (const [key, rows] of Object.entries(docs.get(src).entries || {})) {
      for (const [r, shown, n = 0] of rows) {
        const id = `${key}\u0000${r}`;
        const behind = more.get(id) || [];
        if (behind.length !== n) fail(src, `${JSON.stringify(key)} read ${r} says ${n} more, the more shards hold ${behind.length}`);
        const ids = new Set(shown.map((x) => x[0]));
        if (behind.some((x) => ids.has(x[0]))) fail(src, `${JSON.stringify(key)} read ${r} shows a sentence the more shards hold too`);
        seen.add(id);
      }
    }
  }
  for (const id of more.keys()) if (!seen.has(id)) fail('data/sent/more', `${JSON.stringify(id.split('\u0000')[0])} has more examples and no row that shows its first`);
}

/** Other spellings (tools/build-spellings.mjs): [reading, [[written, tag]]], never the key itself. */
const SPELL_TAGS = new Set(['', 'oK', 'rK', 'iK', 'io', 'ateji', 'sK']);
function checkSpell(rel, doc) {
  for (const [key, rows] of Object.entries(doc.entries || {})) {
    const ok = Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r) && r.length === 2 && typeof r[0] === 'string' && r[0]
      && Array.isArray(r[1]) && r[1].length && r[1].every((f) => Array.isArray(f) && f.length === 2 && typeof f[0] === 'string' && f[0] && f[0] !== key && SPELL_TAGS.has(f[1])));
    if (!ok) fail(rel, `${JSON.stringify(key)} is not a list of [reading, [[another spelling, a tag]]]`);
  }
}

// ── Search (tools/build-search.mjs) ───────────────────────────────────────

const IS_KANJI = /^[\p{Script=Han}々]$/u;

/** An English shard: each lower-case word to `w` (keys) and `k` (kanji). */
function checkSearchShard(rel, doc) {
  for (const [word, e] of Object.entries(doc.entries || {})) {
    if (!/^[a-z][a-z']*$/.test(word)) fail(rel, `${JSON.stringify(word)} is not a lower-case English word`);
    const extra = Object.keys(e).filter((k) => k !== 'w' && k !== 'k');
    if (extra.length) fail(rel, `${JSON.stringify(word)} has unknown fields ${extra.join(' ')}`);
    if (e.w && !(Array.isArray(e.w) && e.w.length && e.w.every((k) => typeof k === 'string' && k))) fail(rel, `${JSON.stringify(word)} has a malformed w`);
    if (e.k !== undefined && !(typeof e.k === 'string' && [...e.k].every((c) => IS_KANJI.test(c)))) fail(rel, `${JSON.stringify(word)} has a k that is not kanji`);
  }
}

/** Every key the English index names is a first-tier key, or the page would show an empty result. */
function checkSearchKeys(docs) {
  const tier = new Set();
  for (const [rel, doc] of docs) {
    if (doc.format === 'yomu-dict/1' || doc.format === 'yomu-dict-core/1') for (const k of Object.keys(doc.entries || {})) tier.add(k);
  }
  if (!tier.size) return;
  for (const rel of shardFiles(docs, 'yomu-search/1')) {
    let missed = 0;
    for (const [word, e] of Object.entries(docs.get(rel).entries || {})) {
      for (const k of e.w || []) {
        if (!tier.has(k) && (missed += 1) <= 3) fail(rel, `${JSON.stringify(word)} names ${JSON.stringify(k)}, which the first tier does not hold`);
      }
    }
  }
}

/** A rare words' English shard: each word to rows [key, reading, glosses, pos, more]. */
function checkSearchRare(rel, doc) {
  for (const [word, rows] of Object.entries(doc.entries || {})) {
    if (!/^[a-z][a-z']*$/.test(word)) fail(rel, `${JSON.stringify(word)} is not a lower-case English word`);
    const ok = Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r) && r.length === 5
      && typeof r[0] === 'string' && r[0] && typeof r[1] === 'string' && r[1] !== r[0]
      && Array.isArray(r[2]) && r[2].length && r[2].every((g) => typeof g === 'string' && g)
      && typeof r[3] === 'string' && Number.isInteger(r[4]) && r[4] >= 0)
      && new Set(rows.map((r) => r[0])).size === rows.length;
    if (!ok) fail(rel, `${JSON.stringify(word)} is not a list of distinct [key, reading, [glosses], pos, more]`);
  }
}

/** Every key the rare words' index names is a rare key, or Read it would send a word the reader cannot find. */
function checkSearchRareKeys(docs) {
  const tier = new Set();
  for (const doc of docs.values()) {
    if (doc.format === 'yomu-dict-rare/1') for (const k of Object.keys(doc.entries || {})) tier.add(k);
  }
  if (!tier.size) return;
  for (const rel of shardFiles(docs, 'yomu-search-rare/1')) {
    let missed = 0;
    for (const [word, rows] of Object.entries(docs.get(rel).entries || {})) {
      for (const [k] of rows) {
        if (!tier.has(k) && (missed += 1) <= 3) fail(rel, `${JSON.stringify(word)} names ${JSON.stringify(k)}, which the rare tier does not hold`);
      }
    }
  }
}

// ── Collections (tools/build-sets.mjs) ───────────────────────────────────

const SET_IDS = ['yoji', 'proverb', 'idiom'];

/** A collection file: its set, and rows [written, reading, [glosses], 0 or 1, said romaji or ''] . */
function checkSet(rel, doc) {
  if (!SET_IDS.includes(doc.set)) fail(rel, `set ${JSON.stringify(doc.set)} is not one of ${SET_IDS.join(' ')}`);
  if (!Array.isArray(doc.rows) || !doc.rows.length) { fail(rel, 'has no rows'); return; }
  doc.rows.forEach((r, i) => {
    const ok = Array.isArray(r) && r.length === 5 && typeof r[0] === 'string' && r[0]
      && typeof r[1] === 'string' && r[1] !== r[0]
      && Array.isArray(r[2]) && r[2].length && r[2].every((g) => typeof g === 'string' && g)
      && (r[3] === 0 || r[3] === 1) && typeof r[4] === 'string' && !/[^a-z' ,.!?-]/.test(r[4]) && !/ [,.!?]/.test(r[4]);
    if (!ok) fail(rel, `row ${i} is not [written, reading, [glosses], 0 or 1, romaji]`);
  });
}

/** Each word to at most three rows [set, written, reading, gloss] whose written form holds it. */
function checkSetWords(rel, doc) {
  for (const [key, rows] of Object.entries(doc.entries || {})) {
    const ok = Array.isArray(rows) && rows.length >= 1 && rows.length <= 3 && rows.every((r) => Array.isArray(r) && r.length === 4
      && SET_IDS.includes(r[0]) && typeof r[1] === 'string' && r[1].includes(key)
      && typeof r[2] === 'string' && typeof r[3] === 'string' && r[3]);
    if (!ok) fail(rel, `${JSON.stringify(key)} is not one to three [set, a written form holding it, reading, gloss]`);
  }
}

/** The index names every collection once, with its files in order and its count right. */
function checkSets(docs) {
  const index = docs.get('data/sets/index.json');
  if (!index) return;
  const named = new Set();
  const ids = (index.sets || []).map((s) => s.id);
  if (ids.join(' ') !== SET_IDS.join(' ')) fail('data/sets/index.json', `sets are ${ids.join(' ')}, not ${SET_IDS.join(' ')}`);
  for (const s of index.sets || []) {
    let n = 0;
    for (const src of s.files || []) {
      named.add(src);
      const doc = docs.get(src);
      if (!doc) { fail('data/sets/index.json', `${s.id} lists ${src}, which is missing`); continue; }
      if (doc.set !== s.id) fail(src, `is set ${doc.set}, the index files it under ${s.id}`);
      n += (doc.rows || []).length;
    }
    if (n !== s.n) fail('data/sets/index.json', `${s.id} says ${s.n} rows, its files hold ${n}`);
  }
  for (const rel of docs.keys()) {
    if (docs.get(rel).format === 'yomu-set/1' && !named.has(rel)) fail('data/sets/index.json', `does not list ${rel}`);
  }
}

/** The parts picker: `list` of [part, strokes or null], `parts` part to the kanji that have it. */
function checkParts(rel, doc) {
  const map = doc.parts || {};
  for (const [part, chars] of Object.entries(map)) {
    if ([...part].length !== 1) fail(rel, `${JSON.stringify(part)} is not one character`);
    if (typeof chars !== 'string' || !chars || [...chars].includes(part)) fail(rel, `${JSON.stringify(part)} has a malformed kanji list`);
  }
  for (const row of doc.list || []) {
    if (!Array.isArray(row) || row.length !== 2 || !Object.hasOwn(map, row[0]) || !(row[1] === null || Number.isInteger(row[1]))) {
      fail(rel, `list row ${JSON.stringify(row)} is not [a part it maps, a stroke count or null]`);
    }
  }
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
  checkJoyo(docs);
  checkJinmeiyo(docs);
  checkJlpt(docs);
  checkMoreCounts(docs);
  checkRangeIndex(docs, 'data/dict/rare.json', 'yomu-dict-rare/1');
  checkRangeIndex(docs, 'data/names/index.json', 'yomu-names/1');
  checkRangeIndex(docs, 'data/strokes/index.json', 'yomu-strokes/1');
  checkRangeIndex(docs, 'data/kpage/index.json', 'yomu-kpage/1');
  checkRangeIndex(docs, 'data/search/index.json', 'yomu-search/1');
  checkRangeIndex(docs, 'data/spell/index.json', 'yomu-spell/1');
  checkRangeIndex(docs, 'data/sent/index.json', 'yomu-sentences/1');
  checkRangeIndex(docs, 'data/search/rare.json', 'yomu-search-rare/1');
  checkSearchKeys(docs);
  checkSearchRareKeys(docs);
  checkSets(docs);
  checkRangeIndex(docs, 'data/sets/words.json', 'yomu-sets-words/1');
  checkPopular(docs);
  checkLikeIndex(docs);
  checkLookalikes(docs);
  checkSpaces(docs);
  checkAudio(docs);

  if (failures.length) {
    for (const f of failures.slice(0, 50)) process.stderr.write(`FAIL ${f}\n`);
    if (failures.length > 50) process.stderr.write(`... and ${failures.length - 50} more\n`);
    process.exit(1);
  }
  process.stdout.write(`check-data: ${files.length} files, ${fmtBytes(bytes)}, all pass\n`);
}

main();
