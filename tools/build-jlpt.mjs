#!/usr/bin/env node
/**
 * data/kanji/jlpt.json: Jonathan Waller's JLPT kanji lists, N5 to N1, for
 * Search's Kanji by level (js/levels.js) and the kanji page.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-jlpt.mjs
 *
 * Reads the five archived pages pinned in tools/lib/sources.mjs (wallerN5 to
 * wallerN1) through the download cache, keeps the first column of each
 * page's kanji table (tools/lib/jlpt.mjs), and refuses to write lists of
 * other sizes than his (79, 166, 367, 367, 1,232), a kanji in two levels, or
 * one the committed kanji shards do not hold.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchSource } from './lib/sources.mjs';
import { licenceBlock } from './lib/licence.mjs';
import { writeJson, SITE, fmtBytes } from './lib/emit.mjs';
import {
  wallerKanji, jlptDoc, jlptProblems, JLPT_LEVELS,
} from './lib/jlpt.mjs';

const TOOL = 'tools/build-jlpt.mjs';
const DIR = path.join(SITE, 'data', 'kanji');

function shardChars() {
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  const known = new Set();
  for (const s of index.shards) {
    for (const ch of Object.keys(JSON.parse(fs.readFileSync(path.join(SITE, s.src), 'utf8')).entries)) known.add(ch);
  }
  return known;
}

function main() {
  const levels = {};
  for (const id of JLPT_LEVELS) {
    const key = `waller${id.toUpperCase()}`;
    levels[id] = wallerKanji(fs.readFileSync(fetchSource(key), 'utf8'));
  }
  const doc = jlptDoc(levels, licenceBlock('waller', TOOL));
  const problems = jlptProblems(doc, shardChars());
  if (problems.length) {
    process.stderr.write(`REFUSED: ${problems.slice(0, 8).join('; ')}\n`);
    process.exit(1);
  }
  const bytes = writeJson(path.join(DIR, 'jlpt.json'), doc, 'levels');
  process.stdout.write(`jlpt ${doc.count} kanji: ${JLPT_LEVELS.map((id) => `${id}:${[...doc.levels[id]].length}`).join(' ')}; ${fmtBytes(bytes)}\n`);
}

main();
