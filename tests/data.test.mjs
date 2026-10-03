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

import { isKana, isKanji, toHira } from '../js/kana.js';

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
  // matched it for Ueno, not for the province (tools/lib/extra.mjs)
  assert.equal(dictIndex.keys, 39358);
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

/** Break a copy of data/ and run the checker over it; the caller runs the cases at once. */
function brokenCopy(mutate, { full = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'yomu-check-'));
  linkTree(join(SITE, 'data'), join(dir, 'data'), (p) => full || !SECOND.test(p));
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
