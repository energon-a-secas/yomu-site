#!/usr/bin/env node
/**
 * data/play/lookalikes.json, the kanji that look alike, from the committed
 * kanji shards and the jōyō list.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-lookalikes.mjs                      write the file
 *   node tools/build-lookalikes.mjs --sample 60 [seed]   print 60 pairs drawn
 *                                                        at random, to judge
 *
 * It needs no upstream and no cache: the shards under data/kanji/ already
 * carry each kanji's KanjiVG parts and KANJIDIC stroke count, and
 * tools/lib/lookalikes.mjs holds the rules and the classic pairs. Run it
 * again after tools/build-kanji.mjs or tools/build-joyo.mjs, since
 * tools/check-data.mjs fails a file that is not what the shards give.
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeJson, SITE, fmtBytes } from './lib/emit.mjs';
import { lookalikesDoc, lookalikePairs, LOOKALIKES_SRC } from './lib/lookalikes.mjs';

function readShards() {
  const index = JSON.parse(fs.readFileSync(path.join(SITE, 'data', 'kanji', 'index.json'), 'utf8'));
  const entries = new Map();
  let licence = null;
  for (const s of index.shards) {
    const doc = JSON.parse(fs.readFileSync(path.join(SITE, s.src), 'utf8'));
    licence = licence || doc._licence;
    for (const [ch, e] of Object.entries(doc.entries)) entries.set(ch, e);
  }
  const joyo = JSON.parse(fs.readFileSync(path.join(SITE, 'data', 'kanji', 'joyo.json'), 'utf8'));
  return { entries, licence, joyo: Object.values(joyo.grades).flatMap((s) => [...s]) };
}

/** A small seeded generator, so a sample can be drawn again. */
function seeded(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(n, seed) {
  const { entries, joyo } = readShards();
  const doc = lookalikesDoc(entries, joyo, {});
  const why = new Map(lookalikePairs(entries, joyo).map((p) => [`${p.a}${p.b}`, p.why]));
  const pairs = new Set();
  for (const [a, v] of Object.entries(doc.kanji)) for (const b of v) pairs.add(a < b ? `${a}${b}` : `${b}${a}`);
  const all = [...pairs].sort();
  const rand = seeded(seed);
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const line = (ch) => {
    const e = entries.get(ch);
    return `${ch} [${(e.parts || []).join(' ')}] ${e.s} ${(e.m || []).slice(0, 2).join(', ')}`;
  };
  process.stdout.write(`${pairs.size} pairs, ${n} drawn with seed ${seed}\n`);
  all.slice(0, n).forEach((k, i) => {
    const [a, b] = [...k];
    process.stdout.write(`${String(i + 1).padStart(2)} ${a} ${b}  ${why.get(k) || 'classic'}  |  ${line(a)}  |  ${line(b)}\n`);
  });
}

function main() {
  const at = process.argv.indexOf('--sample');
  if (at >= 0) {
    sample(Number(process.argv[at + 1]) || 60, process.argv[at + 2] || 1);
    return;
  }
  const { entries, licence, joyo } = readShards();
  const doc = lookalikesDoc(entries, joyo, licence);
  const pairs = Object.values(doc.kanji).reduce((n, v) => n + [...v].length, 0);
  const bytes = writeJson(path.join(SITE, LOOKALIKES_SRC), doc, 'kanji');
  process.stdout.write(`lookalikes: ${doc.count} jōyō kanji, ${pairs} listings; ${fmtBytes(bytes)}\n`);
}

main();
