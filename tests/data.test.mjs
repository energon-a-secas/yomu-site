// The committed dictionary and kanji shards, read from disk the way the page
// reads them.
//
//   node --test tests/data.test.mjs
//   npm test
//
// tools/check-data.mjs holds every file to the format rules; this file holds
// the data to what the analyzer leans on: that the shard rule in
// docs/ANALYZER.md finds every key, that a reading split puts the reading back
// together exactly, and that the handful of words a first lesson uses come out
// the way a teacher would write them. The last part of the file breaks a copy
// of data/ on purpose and proves the checker notices each break.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, statSync, mkdirSync, readdirSync, linkSync, copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isKana, isKanji, isHiragana, toHira } from '../js/kana.js';
import { groupsOfWord } from '../js/sounds-like.js';
import { BANNED_WORDS } from '../tools/lib/licence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const CHECK = join(SITE, 'tools', 'check-data.mjs');
const CAP = 140 * 1000;

const read = (rel) => JSON.parse(readFileSync(join(SITE, rel), 'utf8'));

const dictIndex = read('data/dict/index.json');
const dictShards = dictIndex.shards.map((s) => ({ ...s, doc: read(s.src) }));
const dictCore = read(dictIndex.core.src);
const dict = new Map();
for (const s of dictShards) for (const [k, v] of Object.entries(s.doc.entries)) dict.set(k, v);
for (const [k, v] of Object.entries(dictCore.entries)) dict.set(k, v);

const kanjiIndex = read('data/kanji/index.json');
const kanjiShards = kanjiIndex.shards.map((s) => ({ ...s, doc: read(s.src) }));
const kanji = new Map();
for (const s of kanjiShards) for (const [k, v] of Object.entries(s.doc.entries)) kanji.set(k, v);

/** The page's rule: the last shard whose first is <= the key. */
function shardFor(key) {
  let hit = null;
  for (const s of dictIndex.shards) if (s.first <= key) hit = s; else break;
  return hit;
}

/** Kanji runs and the kana between them, as the reading split sees a key. */
function runs(key) {
  const out = [];
  for (const ch of key) {
    const type = isKanji(ch) ? 'kanji' : 'other';
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += ch;
    else out.push({ type, text: ch });
  }
  return out;
}

// ── The dictionary index and the shard rule ──────────────────────────────

test('the dictionary index counts what the core and the shards hold', () => {
  assert.equal(dictIndex.format, 'yomu-dict-index/2');
  assert.equal(dictIndex.keys, dict.size);
  // 39,359 until 2026-10-03, when 上野 left the first tier: the corpus
  // matched it for Ueno, not for the province (tools/lib/extra.mjs). 39,358
  // until 2026-10-05, when the mixed rule added 808 spellings like あめ色 and
  // 704 katakana folds like アメ色, and 何 with a counter on evidence added
  // 何個, 何番, 何ヶ月, 何階 and 何月 (tools/lib/extra.mjs, selectMixed)
  assert.equal(dictIndex.keys, 40875);
  assert.equal(dictIndex.maxKey, Math.max(...[...dict.keys()].map((k) => k.length)));
  assert.equal(dictIndex.core.keys, Object.keys(dictCore.entries).length);
  const ranged = dictShards.reduce((n, s) => n + Object.keys(s.doc.entries).length, 0);
  assert.equal(ranged + dictIndex.core.keys, dict.size, 'a key is in the core and a range shard both');
});

test('the core is under the cap, in key order, and holds the words every text asks for', () => {
  assert.equal(dictCore.format, 'yomu-dict-core/1');
  assert.ok(statSync(join(SITE, dictIndex.core.src)).size <= CAP);
  const keys = Object.keys(dictCore.entries);
  for (let i = 1; i < keys.length; i += 1) assert.ok(keys[i - 1] < keys[i], `core at ${keys[i]}`);
  for (const k of ['は', 'が', 'です', 'ます', 'する', 'いる', 'ある', 'の', 'に']) assert.ok(keys.includes(k), `${k} is not in the core`);
});

test('the key filter lets every range key through and turns most absent keys away', async () => {
  const { readFilter } = await import('../js/bloom.js');
  const doc = read(dictIndex.filter.src);
  assert.equal(doc.format, 'yomu-dict-filter/1');
  assert.ok(statSync(join(SITE, dictIndex.filter.src)).size <= CAP);
  const bloom = readFilter(doc);
  for (const s of dictShards) for (const key of Object.keys(s.doc.entries)) assert.ok(bloom.has(key), key);
  // strings that are no key: the filter's promise is one false "maybe" in
  // about 2,000 at 16 bits a key (docs/ANALYZER.md); 1 in 500 is the alarm
  let yes = 0;
  let tried = 0;
  for (const a of 'あいうえおかきくけこさしすせそたちつてとなにぬねの') {
    for (const b of 'はひふへほまみむめもやゆよらりるれろわをん') {
      for (const c of 'がぎぐげござじずぜぞ') {
        const k = a + b + c + b;
        if (dict.has(k)) continue;
        tried += 1;
        if (bloom.has(k)) yes += 1;
      }
    }
  }
  assert.ok(tried > 5000 && yes / tried < 1 / 500, `${yes} of ${tried} absent keys got a maybe`);
});

test('every shard is under the cap and in key order', () => {
  for (const s of dictShards) {
    assert.ok(statSync(join(SITE, s.src)).size <= CAP, `${s.src} is over the cap`);
    const keys = Object.keys(s.doc.entries);
    assert.equal(s.doc.first, keys[0]);
    assert.equal(s.first, keys[0]);
    for (let i = 1; i < keys.length; i += 1) assert.ok(keys[i - 1] < keys[i], `${s.src} at ${keys[i]}`);
  }
});

test('the last shard whose first is <= a key is the shard that holds it, for every key', () => {
  for (const s of dictShards) {
    for (const key of Object.keys(s.doc.entries)) {
      assert.equal(shardFor(key).src, s.src, key);
    }
  }
});

// ── Records ───────────────────────────────────────────────────────────────

test('records keep to the field limits', () => {
  for (const [key, recs] of dict) {
    assert.ok(recs.length >= 1 && recs.length <= 6, `${key} has ${recs.length} records`);
    for (const r of recs) {
      assert.ok(r.g.length >= 1 && r.g.length <= 3, `${key}: g`);
      for (const g of r.g) assert.ok(g.length >= 1 && g.length <= 60, `${key}: ${g}`);
      assert.equal(typeof r.p, 'string');
      if (r.q !== undefined) assert.ok([1, 2, 3, 4, 5].includes(r.q), `${key}: q ${r.q}`);
      if (r.k) assert.ok(r.k.length <= 2, `${key}: k`);
      for (const f of ['u', 'x', 'w']) if (r[f] !== undefined) assert.equal(r[f], 1, `${key}: ${f}`);
      if (r.w) assert.ok(key.endsWith('は'), `${key}: w without a final は`);
    }
  }
});

test('f appears exactly on keys with a run of two or more kanji', () => {
  for (const [key, recs] of dict) {
    const multi = runs(key).some((r) => r.type === 'kanji' && [...r.text].length >= 2);
    for (const r of recs) {
      if (!multi || !r.r) assert.equal(r.f, undefined, key);
      else assert.equal(typeof r.f, 'string', key);
    }
  }
});

test('a split reading puts the reading back together exactly', () => {
  let checked = 0;
  for (const [key, recs] of dict) {
    for (const r of recs) {
      if (!r.f) continue;
      const parts = r.f.split(';');
      const segs = runs(key);
      const kanjiRuns = segs.filter((s) => s.type === 'kanji');
      assert.equal(parts.length, kanjiRuns.length, `${key}: ${r.f}`);
      // A key with Latin letters or digits in it (無線ＬＡＮ) has no kana to
      // compare them with; the split of its kanji is still checked above.
      if (parts.includes('*') || [...key].some((ch) => !isKana(ch) && !isKanji(ch))) continue;
      let i = 0;
      let rebuilt = '';
      for (const s of segs) {
        if (s.type === 'kanji') {
          const pieces = parts[i].split('|');
          assert.equal(pieces.length, [...s.text].length, `${key}: ${r.f}`);
          rebuilt += pieces.join('');
          i += 1;
        } else {
          rebuilt += toHira(s.text);
        }
      }
      assert.equal(rebuilt, toHira(r.r[0]), `${key}: ${r.f}`);
      checked += 1;
    }
  }
  assert.ok(checked > 13000, `only ${checked} splits checked`);
});

test('first-lesson words read the way a teacher writes them', () => {
  const first = (k) => dict.get(k)[0];
  assert.deepEqual(first('勉強').r, ['べんきょう']);
  assert.equal(first('勉強').f, 'べん|きょう');
  assert.deepEqual(first('勉強').g, ['study', 'diligence', 'experience']);
  assert.equal(first('学校').f, 'がっ|こう');
  assert.equal(first('日本語').f, 'に|ほん|ご');
  assert.equal(first('人々').f, 'ひと|びと');
  assert.equal(first('今日').f, '*');
  assert.equal(first('大人').f, '*');
  assert.equal(first('受付').f, 'うけ|つけ');
  assert.equal(first('食べる').r[0], 'たべる');
  assert.match(first('食べる').p, /\bv1\b/);
  assert.equal(first('行く').f, undefined);
  assert.deepEqual(first('わたし').k, ['私']);
  assert.equal(first('わたし').r, undefined);
});

test('は leads with the particle, and the particle is said wa', () => {
  const ha = dict.get('は');
  assert.match(ha[0].p, /\bprt\b/);
  assert.equal(ha[0].w, 1);
  assert.ok(ha.slice(1).every((r) => !r.w), 'only the particle is said wa');
});

test('こんにちは and 今日は: the final は is said wa, and the key is a word plus a particle', () => {
  for (const k of ['こんにちは', '今日は', 'こんばんは', '実は', 'では', 'には', 'とは']) {
    assert.ok(dict.get(k).some((r) => r.w === 1), `${k} has no w`);
  }
  for (const k of ['今日は', '実は', '一緒に', 'じつは']) assert.equal(dict.get(k)[0].x, 1, `${k} has no x`);
});

test('x is not set where the particle-looking kana belongs to the word', () => {
  for (const k of ['この', 'もの', 'えいが', 'しごと', 'きもの', 'いなか', 'かどうか', '愚か']) {
    if (dict.has(k)) assert.equal(dict.get(k)[0].x, undefined, `${k} has x`);
  }
  for (const k of ['には', 'とは']) assert.equal(dict.get(k)[0].x, undefined, `${k} is a particle`);
});

test('m marks the mixed spellings the build added, on every record, and nothing else', () => {
  const marked = [...dict].filter(([, recs]) => recs.some((r) => r.m !== undefined));
  // 808 on 2026-10-07: 813 spellings of entries, five of them shared
  assert.ok(marked.length > 700 && marked.length < 900, `${marked.length} keys marked`);
  for (const [key, recs] of marked) {
    for (const r of recs) assert.equal(r.m, 1, `${key}: m`);
    assert.ok([...key].some((ch) => isKanji(ch)) && [...key].every((ch) => isKanji(ch) || isHiragana(ch)), `${key}: kanji and hiragana`);
  }
  for (const key of ['秋りん', 'あめ色', '大ごと', 'つき物', '誰それ']) assert.equal(dict.get(key)[0].m, 1, `${key} is marked`);
  // a katakana fold, and words of the common set the corpus never matched
  for (const key of ['アメ色', 'ツキ物', '区切り', '円建て', '指切り', '割く', '憩う']) {
    assert.ok(dict.has(key), key);
    assert.equal(dict.get(key)[0].m, undefined, `${key} is not marked`);
  }
});

test('the frequency bands have their stated sizes', () => {
  const band = new Map();
  for (const recs of dict.values()) band.set(recs[0].q, (band.get(recs[0].q) || 0) + 1);
  // The common keys fill the bands exactly (1,000 / 2,000 / 5,000 / 12,000);
  // a key from outside the common set is put on their scale without moving
  // one of them (tools/lib/freq.mjs, bandScale), so a band may hold a few
  // more, never fewer.
  for (const [b, size] of [[1, 1000], [2, 2000], [3, 5000], [4, 12000]]) {
    assert.ok(band.get(b) >= size && band.get(b) <= size * 1.06, `q${b} holds ${band.get(b)}`);
  }
  assert.equal(dict.get('の')[0].q, 1);
});

// ── Kanji ─────────────────────────────────────────────────────────────────

test('the kanji index lists the characters of the listed shards and the range of the others', () => {
  assert.equal(kanjiIndex.format, 'yomu-kanji-index/2');
  let ranged = 0;
  for (const s of kanjiShards) {
    assert.ok(statSync(join(SITE, s.src)).size <= CAP, `${s.src} is over the cap`);
    const chars = Object.keys(s.doc.entries);
    if (s.chars !== undefined) {
      assert.equal(ranged, 0, `${s.src}: a listed shard after a ranged one`);
      assert.equal(s.chars, chars.join(''));
    } else {
      ranged += 1;
      assert.equal(s.first, chars[0]);
      assert.equal(s.last, chars[chars.length - 1]);
    }
  }
  assert.equal(kanji.size, kanjiIndex.count);
  // every KANJIDIC2 character, since 2026-10-01; 2,600 before
  assert.equal(kanji.size, 10384);
  assert.ok(ranged >= 1);
});

test('listed kanji are in frequency order, unranked last; ranged ones in string order', () => {
  const listed = kanjiShards.filter((s) => s.chars !== undefined).flatMap((s) => Object.values(s.doc.entries));
  const ranks = listed.map((e) => (e.f === undefined ? Infinity : e.f));
  for (let i = 1; i < ranks.length; i += 1) assert.ok(ranks[i - 1] <= ranks[i], `at ${i}`);
  assert.equal([...kanji.keys()][0], '日');
  assert.equal(listed.length, 2600, 'the characters a reader meets first stay where they were');
  const rest = kanjiShards.filter((s) => s.chars === undefined).flatMap((s) => Object.keys(s.doc.entries));
  for (let i = 1; i < rest.length; i += 1) assert.ok(rest[i - 1] < rest[i], `at ${rest[i]}`);
});

test('kanji entries carry readings, meanings and KanjiVG parts', () => {
  for (const [ch, e] of kanji) {
    assert.ok(e.m.length >= 1 && e.m.length <= 3, `${ch}: m`);
    assert.ok(e.parts.length <= 4, `${ch}: parts`);
    assert.equal(new Set(e.parts).size, e.parts.length, `${ch}: duplicate part`);
    assert.ok(Number.isInteger(e.s) && e.s > 0, `${ch}: s`);
  }
  assert.deepEqual(kanji.get('学').parts, ['⺍', '冖', '子']);
  assert.deepEqual(kanji.get('語').parts, ['言', '吾']);
  assert.deepEqual(kanji.get('学').on, ['ガク']);
  assert.equal(kanji.get('学').g, 1);
  assert.ok(kanji.get('食').kun.includes('た.べる'));
});

test('the jōyō list: seven grades of the 2010 sizes, each kanji in a shard under the same grade, in frequency order', () => {
  const joyo = read('data/kanji/joyo.json');
  assert.equal(joyo.format, 'yomu-joyo/1');
  assert.deepEqual(joyo._licence, kanjiShards[0].doc._licence, 'the block the kanji shards carry');
  assert.equal(joyo.count, 2136);
  assert.deepEqual(Object.keys(joyo.grades), ['1', '2', '3', '4', '5', '6', '8']);
  const sizes = Object.values(joyo.grades).map((chars) => [...chars].length);
  assert.deepEqual(sizes, [80, 160, 200, 202, 193, 191, 1110]);
  const all = Object.values(joyo.grades).flatMap((chars) => [...chars]);
  assert.equal(new Set(all).size, 2136, 'no kanji twice');
  for (const [grade, chars] of Object.entries(joyo.grades)) {
    const list = [...chars];
    for (const ch of list) {
      assert.ok(kanji.has(ch), `${ch} is in no shard`);
      assert.equal(String(kanji.get(ch).g), grade, `${ch}: grade`);
    }
    const rank = (ch) => (Number.isInteger(kanji.get(ch).f) ? kanji.get(ch).f : Infinity);
    for (let i = 1; i < list.length; i += 1) {
      const a = list[i - 1];
      const b = list[i];
      assert.ok(rank(a) < rank(b) || (rank(a) === rank(b) && a.codePointAt(0) < b.codePointAt(0)), `grade ${grade} at ${b}`);
    }
  }
  // Every shard kanji of a jōyō grade is on the list: nothing left off it.
  const listed = new Set(all);
  for (const [ch, e] of kanji) if ([1, 2, 3, 4, 5, 6, 8].includes(e.g)) assert.ok(listed.has(ch), `${ch} (grade ${e.g}) is missing`);
  assert.ok(statSync(join(SITE, 'data/kanji/joyo.json')).size <= CAP);
});

test('the jōyō list is what its builder makes from the shards, byte for byte', async () => {
  const { joyoDoc } = await import('../tools/lib/joyo.mjs');
  const { serialize } = await import('../tools/lib/emit.mjs');
  const built = serialize(joyoDoc(kanji, kanjiShards[0].doc._licence), 'grades');
  assert.equal(readFileSync(join(SITE, 'data/kanji/joyo.json'), 'utf8'), built);
});

// ── The checker catches what it says it catches ───────────────────────────

/**
 * data/ under a temporary directory, each file a hard link to the committed
 * one (a copy where the two are on different volumes). The second tier made
 * data/ 50 MB, and copying it once per broken rule took fourteen seconds; a
 * link costs nothing, and rw() below replaces a file before writing it, so a
 * committed file is never written through its link.
 */
function linkTree(from, to, keep) {
  mkdirSync(to, { recursive: true });
  for (const ent of readdirSync(from, { withFileTypes: true })) {
    const a = join(from, ent.name);
    const b = join(to, ent.name);
    if (!keep(a)) continue;
    if (ent.isDirectory()) linkTree(a, b, keep);
    else {
      try { linkSync(a, b); } catch { copyFileSync(a, b); }
    }
  }
}

/**
 * The second phase's tiers: the rare words in data/dict and the names. A
 * case that breaks the first tier or the kanji leaves them out of its copy,
 * which the checker accepts (an index with no shards and no shards with no
 * index are both nothing to check), so ten checks do not each read 50 MB.
 */
const SECOND = /[\\/](names|rare\.json|r\d{3}\.json|rf\d+\.json)$/;
/** The rare words alone: a case about the names keeps the names (2.5 MB) and leaves out the 44 MB. */
const RARE = /[\\/](rare\.json|r\d{3}\.json|rf\d+\.json)$/;

/** Break a copy of data/ and run the checker over it; the caller runs the cases at once. */
function brokenCopy(mutate, { full = false, names = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'yomu-check-'));
  linkTree(join(SITE, 'data'), join(dir, 'data'), (p) => full || (names ? !RARE.test(p) : !SECOND.test(p)));
  const rw = (rel, fn) => {
    const p = join(dir, rel);
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    fn(doc);
    rmSync(p);
    writeFileSync(p, JSON.stringify(doc));
  };
  mutate(rw, dir);
  return new Promise((done) => {
    const child = spawn(process.execPath, [CHECK, join(dir, 'data')]);
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => {
      rmSync(dir, { recursive: true, force: true });
      done({ status, stderr });
    });
  });
}

test('check-data passes the committed data', () => {
  const run = spawnSync(process.execPath, [CHECK], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('check-data fails each broken rule and names the file', async () => {
  const cases = [
    ['unsorted keys', (rw) => rw('data/dict/w02.json', (d) => {
      const [a, b, ...rest] = Object.entries(d.entries);
      d.entries = Object.fromEntries([b, a, ...rest]);
      d.first = b[0];
    }), /w02\.json: keys out of order/],
    ['a key in the wrong shard', (rw) => rw('data/dict/w04.json', (d) => {
      d.entries = { ...d.entries, 'ヴ': [{ g: ['x'], p: 'n' }] };
      d.last = 'ヴ';
    }), /w04\.json: "ヴ" is outside/],
    ['an empty g', (rw) => rw('data/dict/w01.json', (d) => {
      Object.values(d.entries)[3][0].g = [];
    }), /w01\.json: .* empty g/],
    ['an em dash', (rw) => rw('data/kanji/k01.json', (d) => {
      Object.values(d.entries)[0].m[0] = 'a \u2014 b';
    }), /k01\.json: U\+2014/],
    ['no acknowledgement', (rw) => rw('data/dict/w05.json', (d) => {
      delete d._licence.acknowledgement;
    }), /w05\.json: _licence\.screen is required/],
    ['an input without a licence', (rw) => rw('data/kanji/k00.json', (d) => {
      delete d._licence.inputs[0].spdx;
    }), /k00\.json: _licence\.inputs\[0\]\.spdx is missing/],
    ['an unknown format', (rw) => rw('data/kanji/k02.json', (d) => {
      d.format = 'yomu-kanji/2';
    }), /k02\.json: unknown format/],
    ['an unlisted shard', (rw, dir) => {
      cpSync(join(dir, 'data/dict/w03.json'), join(dir, 'data/dict/w99.json'));
    }, /index\.json: does not list data\/dict\/w99\.json/],
    ['a file over the cap', (rw) => rw('data/kanji/k02.json', (d) => {
      d.pad = 'x'.repeat(CAP);
    }), /k02\.json: .* over the/],
  ];
  const second = [
    ['a rare key outside its range', (rw) => rw('data/dict/r010.json', (d) => {
      d.entries = { ...d.entries, '〇': [{ g: ['x'], p: 'n' }] };
    }), /r010\.json: "〇" is outside/],
    ['a filter part that calls a rare key absent', (rw) => rw('data/dict/rf03.json', (d) => {
      d.bits = Buffer.alloc(Buffer.from(d.bits, 'base64').length).toString('base64');
    }), /the filter calls .* absent/],
    ['a name with a type JMnedict has but the names tier does not ship', (rw) => rw('data/names/n02.json', (d) => {
      Object.values(d.entries)[0].n = 'company';
    }), /n02\.json: .* n is not a list of name types/],
    ['a ranged kanji shard holding a character outside its range', (rw) => rw('data/kanji/k05.json', (d) => {
      d.entries = { 一: Object.values(d.entries)[0], ...d.entries };
    }), /k05\.json|kanji\/index\.json/],
  ];
  const runs = await Promise.all([
    ...cases.map(([, mutate]) => brokenCopy(mutate)),
    ...second.map(([, mutate]) => brokenCopy(mutate, { full: true })),
  ]);
  [...cases, ...second].forEach(([name, , expect], k) => {
    assert.equal(runs[k].status, 1, `${name}: exit ${runs[k].status}`);
    assert.match(runs[k].stderr, expect, name);
  });
});

/** The file of data/dict a first-tier key is in: the core, or the shard the page would fetch. */
const fileOf = (key) => (Object.hasOwn(dictCore.entries, key) ? dictIndex.core.src : shardFor(key).src);

test('check-data fails an m mark out of place and names the file', async () => {
  const shared = [...dict].find(([, recs]) => recs.length > 1 && recs[0].m)[0];
  const cases = [
    ['an m that is not 1', (rw) => rw(fileOf('秋りん'), (d) => {
      d.entries['秋りん'][0].m = 2;
    }), /: 秋りん\[0\]: m is not 1/],
    ['an m on a key that is no mixed spelling', (rw) => rw(fileOf('区切り'), (d) => {
      for (const r of d.entries['区切り']) r.m = 1;
    }), /: 区切り: m on a key that is no mixed spelling/],
    ['an m on one record of a key and not the other', (rw) => rw(fileOf(shared), (d) => {
      delete d.entries[shared][1].m;
    }), new RegExp(`: ${shared}: m on 1 of 2 records`)],
  ];
  const second = [
    ['an m in the second tier', (rw) => rw('data/dict/r010.json', (d) => {
      const [key] = Object.keys(d.entries);
      for (const r of d.entries[key]) r.m = 1;
    }), /r010\.json: .*: m in the second tier/],
  ];
  const runs = await Promise.all([
    ...cases.map(([, mutate]) => brokenCopy(mutate)),
    ...second.map(([, mutate]) => brokenCopy(mutate, { full: true })),
  ]);
  [...cases, ...second].forEach(([name, , expect], k) => {
    assert.equal(runs[k].status, 1, `${name}: exit ${runs[k].status}`);
    assert.match(runs[k].stderr, expect, name);
  });
});

test('check-data fails a jōyō list that is wrong, hand-edited or missing', async () => {
  const swap = (s, a, b) => [...s].map((ch) => (ch === a ? b : ch === b ? a : ch)).join('');
  const cases = [
    ['two kanji swapped in their grade', (rw) => rw('data/kanji/joyo.json', (d) => {
      d.grades['1'] = swap(d.grades['1'], '日', '一');
    }), /joyo\.json: grade 1 is not what the shards give/],
    ['a kanji filed under another grade', (rw) => rw('data/kanji/joyo.json', (d) => {
      const ch = [...d.grades['2']][0];
      d.grades['2'] = [...d.grades['2']].slice(1).join('');
      d.grades['1'] += ch;
    }), /joyo\.json: .* is listed in grade 1, the shards file it under 2/],
    ['a grade of the wrong size', (rw) => rw('data/kanji/joyo.json', (d) => {
      d.grades['3'] = [...d.grades['3']].slice(1).join('');
      d.count = 2135;
    }), /joyo\.json: grade 3 holds 199 kanji, not 200/],
    ['a kanji no shard holds', (rw) => rw('data/kanji/joyo.json', (d) => {
      d.grades['8'] = `${[...d.grades['8']].slice(1).join('')}\u{2A6D6}`;
    }), /joyo\.json: .* is in no kanji shard/],
    ['a kanji listed twice', (rw) => rw('data/kanji/joyo.json', (d) => {
      const list = [...d.grades['4']];
      list[1] = list[0];
      d.grades['4'] = list.join('');
    }), /joyo\.json: .* is listed twice/],
    ['no list beside the kanji shards', (rw, dir) => {
      rmSync(join(dir, 'data/kanji/joyo.json'));
    }, /joyo\.json: missing, but kanji shards exist/],
  ];
  const runs = await Promise.all(cases.map(([, mutate]) => brokenCopy(mutate)));
  cases.forEach(([name, , expect], k) => {
    assert.equal(runs[k].status, 1, `${name}: exit ${runs[k].status}`);
    assert.match(runs[k].stderr, expect, name);
  });
});

test('check-data fails a broken sound-alike file and names it', async () => {
  // A banned word, spelled from the rule itself so this file does not spell it.
  const banned = BANNED_WORDS.source.match(/\(([^)]*)\)/)[1].split('|').find((w) => groupsOfWord(w).includes('R'));
  const cases = [
    ['a word filed where the page would never look for it', (rw) => rw('data/like/s.json', (d) => {
      d.words = { ...d.words, inform: 3 };
    }), /like\/s\.json: inform is not filed under S/],
    ['a word the house style bans', (rw) => rw('data/like/r.json', (d) => {
      d.words = { ...d.words, [banned]: 1 };
    }), /like\/r\.json: .* the house style bans/],
    ['a count that is not one', (rw) => rw('data/like/m.json', (d) => {
      d.words = { ...d.words, [Object.keys(d.words)[0]]: 0 };
    }), /like\/m\.json: .* count is not a positive integer/],
    ['an index that miscounts a group', (rw) => rw('data/like/index.json', (d) => {
      d.groups.N.words += 1;
    }), /like\/index\.json: says data\/like\/n\.json holds/],
    ['an unlisted group file', (rw, dir) => {
      cpSync(join(dir, 'data/like/z.json'), join(dir, 'data/like/zz.json'));
    }, /like\/index\.json: does not list data\/like\/zz\.json/],
  ];
  const runs = await Promise.all(cases.map(([, mutate]) => brokenCopy(mutate)));
  cases.forEach(([name, , expect], k) => {
    assert.equal(runs[k].status, 1, `${name}: exit ${runs[k].status}`);
    assert.match(runs[k].stderr, expect, name);
  });
});

// ── The popular names (data/names/popular.json) ──────────────────────────

test('popular.json: the corpus\'s commonest katakana names with their original spellings, in its own format', async () => {
  const { popularType } = await import('../tools/lib/popular.mjs');
  const { LATIN_NAME } = await import('../tools/lib/jmnedict.mjs');
  const doc = read('data/names/popular.json');
  const index = read('data/names/index.json');
  assert.equal(doc.format, 'yomu-names-popular/1');
  assert.deepEqual(doc._licence, index._licence, 'the block the names shards carry');
  assert.ok(statSync(join(SITE, 'data/names/popular.json')).size < CAP);
  assert.ok(doc.names.length > 100 && doc.names.length <= 1000, `${doc.names.length} rows`);
  const names = new Map();
  for (const s of index.shards) for (const [k, v] of Object.entries(read(s.src).entries)) names.set(k, v);
  doc.names.forEach(([text, o, type, n], k) => {
    assert.match(text, /^[\u30a1-\u30faー・]+$/u, text);
    assert.match(o, LATIN_NAME, o);
    assert.match(o, /^\p{Lu}/u, `${text} ${o}: a spelling with a capital first`);
    // person since 2026-10-05: the sense that spells the name says so
    // (ガンジー Gandhi), or the corpus uses a place as a person (スミス)
    assert.ok(['given', 'surname', 'person', 'place'].includes(type), type);
    assert.ok(Number.isInteger(n) && n >= 1, `${text} ${n}`);
    assert.equal(names.get(text).o, o, text);
    const tier = popularType(names.get(text).n);
    assert.ok(tier === type || (type === 'person' && tier === 'place'), `${text}: ${type}, the tier says ${tier}`);
    if (k) {
      const [prev, , , m] = doc.names[k - 1];
      assert.ok(m > n || (m === n && prev < text), `${prev} before ${text}`);
    }
  });
  assert.deepEqual(doc.names[0].slice(0, 3), ['トム', 'Tom', 'given']);
  assert.deepEqual(doc.names[1].slice(0, 3), ['メアリー', 'Mary', 'given']);
  // spelled as the corpus's English writes them, not JMnedict's first (Jon, Keito)
  assert.deepEqual(doc.names[2].slice(0, 3), ['ジョン', 'John', 'given']);
  assert.ok(doc.names.some(([text, o]) => text === 'ケイト' && o === 'Kate'));
  // バラ is a name in JMnedict and a rose in every sentence the corpus has
  // it in; the page reads the rose, so the game must not offer "Bara"
  assert.ok(!doc.names.some(([text]) => text === 'バラ'));
  // the type is the sense's that spells the name, or the corpus's use of a
  // place as a person; a spelling with no capital and a name used only as
  // the stem of 語 or 人 are not in the game
  const row = (text) => doc.names.find((r) => r[0] === text) || null;
  assert.deepEqual(row('キャシー').slice(1, 3), ['Cathy', 'given'], 'Cathy is the woman\'s name; Casei the surname');
  assert.deepEqual(row('リヨン').slice(1, 3), ['Lyon', 'place'], 'Lyon is the place; Riyon the woman\'s name');
  assert.deepEqual(row('ガンジー').slice(1, 3), ['Gandhi', 'person'], 'Gandhi is the person; Ghanzi the place');
  assert.equal(names.get('スミス').n, 'place', 'the names tier keeps JMnedict\'s type');
  assert.deepEqual(row('スミス').slice(1, 3), ['Smith', 'person'], 'スミスさん, Mr. Smith');
  assert.equal(row('エイヴォン'), null, 'avon');
  assert.equal(row('ベルベル'), null, 'ベルベル語, ベルベル人');
});

test('a katakana name in the names tier carries its original spelling in Latin letters, and only a katakana name does', () => {
  const index = read('data/names/index.json');
  let katakana = 0;
  let spelled = 0;
  for (const s of index.shards) {
    for (const [k, v] of Object.entries(read(s.src).entries)) {
      if (v.r) { assert.equal(v.o, undefined, k); assert.ok(!v.n.split(' ').includes('person'), k); continue; }
      katakana += 1;
      if (v.o) spelled += 1;
    }
  }
  assert.ok(katakana > 30000, `${katakana} katakana names`);
  assert.ok(spelled / katakana > 0.99, `${spelled} of ${katakana} with an original spelling`);
});

test('check-data fails a broken popular-names file, and a name record out of its shape, and names the file', async () => {
  const cases = [
    ['two rows out of order', (rw) => rw('data/names/popular.json', (d) => {
      [d.names[0], d.names[1]] = [d.names[1], d.names[0]];
    }), /popular\.json: names\[1\]: out of order/],
    ['an original spelling not in Latin letters', (rw) => rw('data/names/popular.json', (d) => {
      d.names[2][1] = 'ジョン';
    }), /popular\.json: names\[2\]: .* is not a name in Latin letters/],
    // person was the invalid type here until it became a row type (2026-10-05)
    ['a type that is no row type', (rw) => rw('data/names/popular.json', (d) => {
      d.names[3][2] = 'company';
    }), /popular\.json: names\[3\]: type "company"/],
    ['a given name typed person', (rw) => rw('data/names/popular.json', (d) => {
      d.names[3][2] = 'person';
    }), /popular\.json: names\[3\]: ジェーン is a given first in the names tier, not a person/],
    ['a spelling with no capital', (rw) => rw('data/names/popular.json', (d) => {
      d.names[2][1] = 'john';
    }), /popular\.json: names\[2\]: "john" does not begin with a capital/],
    ['a count of none', (rw) => rw('data/names/popular.json', (d) => {
      d.names[d.names.length - 1][3] = 0;
    }), /popular\.json: .* count 0 is not a whole number of at least 1/],
    ['a row that is no name of the tier', (rw) => rw('data/names/popular.json', (d) => {
      d.names[d.names.length - 1][0] = 'ヨムヨムヨム';
    }), /popular\.json: .* ヨムヨムヨム is no name the names tier ships/],
    ['an original spelling the tier does not give', (rw) => rw('data/names/popular.json', (d) => {
      d.names[0][1] = 'Thom';
    }), /popular\.json: names\[0\]: トム is "Tom" in the names tier/],
    ['another licence block', (rw) => rw('data/names/popular.json', (d) => {
      d._licence = { ...d._licence, generated_by: 'by hand' };
    }), /popular\.json: _licence is not the block the names shards carry/],
    ['more than a thousand rows', (rw) => rw('data/names/popular.json', (d) => {
      while (d.names.length <= 1000) d.names.push(d.names[d.names.length - 1]);
    }), /popular\.json: .* more than 1000/],
    ['no popular file beside the names', (rw, dir) => {
      rmSync(join(dir, 'data/names/popular.json'));
    }, /popular\.json: missing, but the names tier exists/],
    ['a katakana name spelled out in kana', (rw) => rw('data/names/n00.json', (d) => {
      const k = Object.keys(d.entries).find((x) => d.entries[x].o);
      d.entries[k].o = 'とむ';
    }), /n00\.json: .* o is not a katakana name's spelling in Latin letters/],
    ['person on a kanji name', (rw) => rw('data/names/n17.json', (d) => {
      const k = Object.keys(d.entries).find((x) => d.entries[x].r);
      d.entries[k].n = 'person';
    }), /n17\.json: .* n is not a list of name types/],
  ];
  const runs = await Promise.all(cases.map(([, mutate]) => brokenCopy(mutate, { names: true })));
  cases.forEach(([name, , expect], k) => {
    assert.equal(runs[k].status, 1, `${name}: exit ${runs[k].status}`);
    assert.match(runs[k].stderr, expect, name);
  });
});
