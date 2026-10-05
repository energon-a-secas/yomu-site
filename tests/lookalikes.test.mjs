// Play's kanji look-alikes: data/play/lookalikes.json against the rules in
// tools/lib/lookalikes.mjs and the committed kanji shards, and
// tools/check-data.mjs failing each kind of broken file.
//
//   node --test tests/lookalikes.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, readdirSync, linkSync, copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  lookalikesDoc, lookalikesProblems, lookalikePairs, CLASSIC, MAX_LOOKALIKES, LOOKALIKES_FORMAT,
} from '../tools/lib/lookalikes.mjs';
import { serialize } from '../tools/lib/emit.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(SITE, 'tools', 'check-data.mjs');
const read = (rel) => JSON.parse(readFileSync(join(SITE, rel), 'utf8'));

const index = read('data/kanji/index.json');
const shards = index.shards.map((s) => read(s.src));
const entries = new Map();
for (const d of shards) for (const [ch, e] of Object.entries(d.entries)) entries.set(ch, e);
const joyo = Object.values(read('data/kanji/joyo.json').grades).flatMap((g) => [...g]);
const J = new Set(joyo);
const doc = read('data/play/lookalikes.json');
const lists = new Map(Object.entries(doc.kanji).map(([ch, v]) => [ch, [...v]]));

test('the committed file is what the builder makes from the shards, byte for byte', () => {
  const built = serialize(lookalikesDoc(entries, joyo, shards[0]._licence), 'kanji');
  assert.equal(readFileSync(join(SITE, 'data/play/lookalikes.json'), 'utf8'), built);
  assert.deepEqual(lookalikesProblems(doc, entries, joyo), []);
  assert.equal(doc.format, LOOKALIKES_FORMAT);
});

test('the licence block names KANJIDIC and KanjiVG, as the kanji shards do, and the authored rules', () => {
  const lic = doc._licence;
  assert.equal(lic.spdx, 'CC-BY-SA-4.0');
  assert.match(lic.acknowledgement, /KANJIDIC/);
  const ids = lic.inputs.map((i) => [i.id, i.spdx]);
  assert.deepEqual(ids, [['kanjivg', 'CC-BY-SA-3.0'], ['authored', 'CC0-1.0']]);
  assert.equal(lic.generated_by, 'tools/build-lookalikes.mjs');
});

test('every key is jōyō, every list at most five known kanji, and a pair between jōyō kanji goes both ways', () => {
  assert.ok(lists.size > 300, `${lists.size} kanji with look-alikes`);
  for (const [ch, list] of lists) {
    assert.ok(J.has(ch), ch);
    assert.ok(list.length >= 1 && list.length <= MAX_LOOKALIKES, ch);
    assert.equal(new Set(list).size, list.length, ch);
    assert.ok(!list.includes(ch), ch);
    for (const o of list) {
      assert.ok(entries.has(o), `${ch}: ${o}`);
      if (J.has(o)) assert.ok(lists.get(o).includes(ch), `${ch} lists ${o}, not the other way`);
    }
  }
});

test('the pairs the spec names are there: the classic ones, and the ones the parts find', () => {
  const pair = (a, b) => (lists.get(a) || []).includes(b) || (lists.get(b) || []).includes(a);
  for (const group of ['土士', '己已巳', '日曰', '千干', '刀力', '人入八', '大犬太', '右石', '王玉主', '貝見', '午牛', '矢失', '天夫', '末未']) {
    const g = [...group];
    for (let i = 0; i < g.length; i += 1) {
      for (let j = i + 1; j < g.length; j += 1) {
        if (J.has(g[i]) || J.has(g[j])) assert.ok(pair(g[i], g[j]), `${g[i]} ${g[j]}`);
      }
    }
  }
  for (const [a, b] of [['未', '本'], ['末', '本'], ['待', '持'], ['休', '体'], ['間', '問'], ['雪', '雲'], ['績', '積'], ['日', '白']]) assert.ok(pair(a, b), `${a} ${b}`);
  // a kanji outside the list is a look-alike only by the classic pairs
  const outside = [...lists.values()].flat().filter((o) => !J.has(o));
  assert.deepEqual([...new Set(outside)].sort(), ['已', '巳', '曰'].sort());
  // classic pairs rank first
  assert.equal(lists.get('土')[0], '士');
});

test('the rules leave out what they were measured to get wrong', () => {
  const ps = lookalikePairs(entries, joyo);
  const has = (a, b) => ps.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  // a shared left part with little else (the first measurement's misses)
  for (const [a, b] of [['記', '討'], ['打', '払'], ['紀', '紅'], ['連', '軒']]) assert.ok(!has(a, b), `${a} ${b}`);
  // two layouts: 日 beside 王 and 白 over it; 囗 around 古 and 尸 over it
  for (const [a, b] of [['旺', '皇'], ['固', '居']]) assert.ok(!has(a, b), `${a} ${b}`);
  // CLASSIC is groups of two or more
  for (const g of CLASSIC) assert.ok([...g].length >= 2, g);
});

// ── The checker catches a broken file ─────────────────────────────────────

/** data/kanji and data/play under a temporary directory, hard links where they can be. */
function copyData() {
  const dir = mkdtempSync(join(tmpdir(), 'yomu-look-'));
  for (const sub of ['kanji', 'play']) {
    mkdirSync(join(dir, 'data', sub), { recursive: true });
    for (const f of readdirSync(join(SITE, 'data', sub))) {
      const a = join(SITE, 'data', sub, f);
      const b = join(dir, 'data', sub, f);
      try { linkSync(a, b); } catch { copyFileSync(a, b); }
    }
  }
  return dir;
}

function broken(mutate) {
  const dir = copyData();
  const p = join(dir, 'data/play/lookalikes.json');
  const d = JSON.parse(readFileSync(p, 'utf8'));
  const out = mutate(d, dir);
  rmSync(p);
  if (out !== 'gone') writeFileSync(p, JSON.stringify(d));
  return new Promise((done) => {
    const child = spawn(process.execPath, [CHECK, join(dir, 'data')]);
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => { rmSync(dir, { recursive: true, force: true }); done({ status, stderr }); });
  });
}

test('check-data passes the committed look-alikes, and fails each broken rule naming the file', async () => {
  const keys = Object.keys(doc.kanji);
  const cases = [
    ['the copy as it is', () => {}, null],
    ['a pair one way only', (d) => { d.kanji['待'] = [...d.kanji['待']].filter((x) => x !== '持').join(''); }, /待 does not list 待|持 lists 待, but 待 does not list 持/],
    ['six look-alikes', (d) => { d.kanji['日'] = `${d.kanji['日']}田由甲`; }, /日 has \d look-alikes, more than 5/],
    ['a key outside the jōyō list', (d) => { d.kanji['巳'] = '己'; d.count += 1; }, /巳 is a key but not a jōyō kanji/],
    ['a kanji as its own look-alike', (d) => { d.kanji['土'] = `${d.kanji['土']}土`; }, /土 is listed as its own look-alike/],
    ['a character the shards do not hold', (d) => { d.kanji['土'] = `${d.kanji['土']}\u{2A6D6}`; }, /is not a kanji the shards hold/],
    ['a hand edit that keeps every rule', (d) => { d.kanji[keys[0]] = [...d.kanji[keys[0]]].reverse().join(''); }, /is not what the shards give/],
    ['a wrong count', (d) => { d.count += 1; }, /count is \d+, the file holds/],
    ['no file beside the kanji shards', () => 'gone', /lookalikes\.json: missing, but kanji shards exist/],
  ];
  const runs = await Promise.all(cases.map(([, m]) => broken(m)));
  cases.forEach(([name, , expect], k) => {
    if (!expect) { assert.equal(runs[k].status, 0, `${name}: ${runs[k].stderr}`); return; }
    assert.equal(runs[k].status, 1, `${name}: exit ${runs[k].status}`);
    assert.match(runs[k].stderr, /data\/play\/lookalikes\.json/, name);
    assert.match(runs[k].stderr, expect, name);
  });
});
