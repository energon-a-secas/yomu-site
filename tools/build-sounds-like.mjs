#!/usr/bin/env node
/**
 * data/like/: the English words JMdict glosses with, filed by the English
 * consonant a katakana word's first consonant may stand for, and the odds of
 * each spelling, for the sound-alike guess (js/sounds-like.js).
 *
 *   node tools/build-sounds-like.mjs
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. Unlike the other builders it reads
 * no upstream: its one input is data/dict/ as committed, both tiers
 * (tools/lib/sounds-like.mjs says what it takes from them), so it runs
 * offline and gives the same files for the same shards. Run it after
 * tools/build-dict.mjs, whose output it reads. Nothing on the page fetches
 * these files unless a katakana part has no record (docs/ANALYZER.md,
 * "Sounds like English").
 *
 * Writes:
 *   data/like/index.json   yomu-like-index/1: each group's file and size,
 *                          and `pieces`, the odds the guess is priced with
 *   data/like/<g>.json     yomu-like/1: one group's words, word -> how many
 *                          records gloss with it
 */
import path from 'node:path';
import { writeJson, pruneStale, SITE, fmtBytes } from './lib/emit.mjs';
import { licenceBlock } from './lib/licence.mjs';
import { readDictionary, glossWords, loanwords, countPieces } from './lib/sounds-like.mjs';
import { groupsOfWord } from '../js/sounds-like.js';

const DATA = path.join(SITE, 'data');
const OUT = path.join(DATA, 'like');
const GENERATED = '2026-10-05';
const BY = 'tools/build-sounds-like.mjs, from the committed data/dict/ shards';

function licence() {
  const block = licenceBlock('edrdg', BY);
  block.generated_at = GENERATED;
  block.note = 'English words taken whole from JMdict glosses, and counts of how loanword spellings line up with them; no gloss is shown as one.';
  return block;
}

const dict = readDictionary(DATA);
const words = glossWords(dict);
const { counts, lined } = countPieces(loanwords(dict));

// A word with no consonant that must be matched (ah, you) lines up with
// nothing and is filed nowhere.
const groups = new Map();
const filed = new Set();
for (const w of [...words.keys()].sort()) {
  for (const g of groupsOfWord(w)) {
    if (!groups.has(g)) groups.set(g, {});
    groups.get(g)[w] = words.get(w);
    filed.add(w);
  }
}

const written = [];
const listed = {};
let bytes = 0;
for (const g of [...groups.keys()].sort()) {
  const src = `data/like/${g.toLowerCase()}.json`;
  const abs = path.join(SITE, src);
  const doc = { _licence: licence(), format: 'yomu-like/1', group: g, words: groups.get(g) };
  bytes += writeJson(abs, doc, 'words');
  written.push(abs);
  listed[g] = { src, words: Object.keys(groups.get(g)).length };
}

// The odds, sorted so a rebuild diffs only where a count moved.
const pieces = {};
for (const eng of Object.keys(counts).sort()) {
  pieces[eng] = Object.fromEntries(Object.entries(counts[eng]).sort(([a], [b]) => (a < b ? -1 : 1)));
}
const index = {
  _licence: licence(),
  format: 'yomu-like-index/1',
  words: filed.size,
  lined,
  groups: listed,
  pieces,
};
const indexPath = path.join(OUT, 'index.json');
bytes += writeJson(indexPath, index, 'pieces');
written.push(indexPath);
const gone = pruneStale(OUT, /\.json$/, written);

process.stdout.write(`build-sounds-like: ${filed.size} words in ${groups.size} groups, odds from ${lined} loanwords, `
  + `${written.length} files, ${fmtBytes(bytes)}${gone.length ? `, removed ${gone.join(' ')}` : ''}\n`);
