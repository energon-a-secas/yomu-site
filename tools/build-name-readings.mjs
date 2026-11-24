#!/usr/bin/env node
/**
 * data/search/names.json: the sure names of the names tier by reading, for
 * Search to read a romaji name as the name (tanaka is 田中, not 棚 and か;
 * docs/ANALYZER.md, "A sentence typed together").
 *
 *   node tools/build-name-readings.mjs
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. Like build-sounds-like.mjs it
 * reads no upstream: its one input is data/names/ as committed, so it runs
 * offline and gives the same file for the same shards. Run it after
 * tools/build-names.mjs. tools/lib/name-readings.mjs says what it takes,
 * and tools/check-data.mjs rebuilds it from the shards to compare.
 *
 * Writes:
 *   data/search/names.json   yomu-search-names/1: `names`, reading -> spellings
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeJson, SITE, fmtBytes } from './lib/emit.mjs';
import { licenceBlock } from './lib/licence.mjs';
import { nameReadingsDoc } from './lib/name-readings.mjs';

const DATA = path.join(SITE, 'data');
const OUT = path.join(DATA, 'search', 'names.json');
const GENERATED = '2026-11-23';
const BY = 'tools/build-name-readings.mjs, from the committed data/names/ shards';

const index = JSON.parse(fs.readFileSync(path.join(DATA, 'names', 'index.json'), 'utf8'));
const entries = [];
for (const shard of index.shards || []) {
  const file = path.join(SITE, shard.src);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  entries.push(...Object.entries(doc.entries || {}));
}

const licence = licenceBlock('jmnedict', BY, {
  upstream: (index._licence && index._licence.upstream) || [],
  inputs: [['tatoebaNames', 'which names are in the names tier this file reads its sure names from; no sentence ships']],
});
licence.generated_at = GENERATED;
licence.note = 'The names the names tier marks sure, filed under their reading; nothing but the spelling and its reading.';

const doc = nameReadingsDoc(entries, licence);
writeJson(OUT, doc, 'names');
const bytes = fs.statSync(OUT).size;
process.stdout.write(`data/search/names.json: ${Object.keys(doc.names).length} readings, ${doc.count} names, ${fmtBytes(bytes)}\n`);
