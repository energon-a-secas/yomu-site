#!/usr/bin/env node
/**
 * data/kanji/joyo.json, the jōyō kanji by school grade, from the committed
 * kanji shards.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-joyo.mjs
 *
 * tools/build-kanji.mjs writes the same file at the end of a full build. This
 * one needs no upstream and no cache: the shards under data/kanji/ already
 * carry each character's grade (`g`) and frequency rank (`f`), and
 * tools/lib/joyo.mjs turns them into the document either way. It refuses to
 * write a list whose grades do not have the sizes the 2010 list has.
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeJson, SITE, fmtBytes } from './lib/emit.mjs';
import {
  joyoDoc, gradeSizes, JOYO_SIZES, JOYO_TOTAL,
} from './lib/joyo.mjs';

const DIR = path.join(SITE, 'data', 'kanji');

function main() {
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  const entries = new Map();
  let licence = null;
  for (const s of index.shards) {
    const doc = JSON.parse(fs.readFileSync(path.join(SITE, s.src), 'utf8'));
    licence = licence || doc._licence;
    for (const [ch, e] of Object.entries(doc.entries)) entries.set(ch, e);
  }
  const doc = joyoDoc(entries, licence);
  const sizes = gradeSizes(doc);
  const wrong = Object.entries(JOYO_SIZES).filter(([g, n]) => sizes[g] !== n);
  if (doc.count !== JOYO_TOTAL || wrong.length) {
    process.stderr.write(`REFUSED: ${doc.count} kanji, grades ${JSON.stringify(sizes)}; expected ${JOYO_TOTAL}, ${JSON.stringify(JOYO_SIZES)}\n`);
    process.exit(1);
  }
  const bytes = writeJson(path.join(DIR, 'joyo.json'), doc, 'grades');
  process.stdout.write(`joyo ${doc.count} kanji from ${index.shards.length} shards: ${Object.entries(sizes).map(([g, n]) => `${g}:${n}`).join(' ')}; ${fmtBytes(bytes)}\n`);
}

main();
