#!/usr/bin/env node
/**
 * data/words/: Jonathan Waller's JLPT vocabulary lists, N5 to N1, for
 * Search's Words by level (js/word-levels.js).
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-jlpt-words.mjs
 *
 * Reads the five archived pages pinned in tools/lib/sources.mjs
 * (wallerN5Vocab to wallerN1Vocab) through the download cache, keeps the
 * spelling and the reading of each row of each page's table
 * (tools/lib/jlpt-words.mjs), and finds each word in the committed
 * dictionary, the first tier and then the rare words, his English choosing
 * among the records one spelling and reading name. It writes
 *
 *   data/words/jlpt.json      yomu-jlpt-words-index/1: per level its count and files
 *   data/words/n5-0.json ...  yomu-jlpt-words/1: a level's [written, reading, glosses] rows, in his order
 *
 * and refuses, writing nothing, while:
 *
 *   - a capture is not pinned: its url or release is null in
 *     tools/lib/sources.mjs, or, once fetched, its sha256 or bytes, which
 *     the refusal prints so they can be pinned;
 *   - a page has rows holding Japanese it did not read (wallerPage): outside
 *     every table headed Kanji and Hiragana, or in one but short of those
 *     cells, which would otherwise be dropped;
 *   - a row is not read as a word of the dictionary (resolveRow: none, or a
 *     cell whose parts are different words) and neither READ_AS nor
 *     LEFT_OUT below names it, or either names a row no page has;
 *   - js/word-levels.js JLPT_WORD_SIZES is not pinned: the first run prints
 *     the counts to pin, and pinning them is what turns the shelf on;
 *   - the documents break a rule of jlptWordsProblems.
 *
 * A word his lists give twice stays at the easier level, and the report
 * names each repeat. A row read other than as its cells are (its parts as
 * one word, ボール・ペン as ボールペン; a cell of two readings of one record,
 * 一昨日 おととい・おとつい; or READ_AS) is named in the report, each to be
 * checked against his page before the output is committed. The files carry
 * EDRDG's licence, the glosses being JMdict's, with Waller's lists as the
 * input (wordsLicence).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  SOURCES, fetchSource, upstream, sha256,
} from './lib/sources.mjs';
import { writeJson, SITE, fmtBytes, pruneStale } from './lib/emit.mjs';
import {
  wallerPage, rowsOf, chooseRows, jlptWordsDocs, jlptWordsProblems, leftOutName, candidatesOf, keysOf, resolvesIn, wordsLicence,
  WORD_LEVELS, JLPT_WORD_SIZES,
} from './lib/jlpt-words.mjs';
import { WORD_LEVELS_READY } from '../js/word-levels.js';
import { createDict } from '../js/dict.js';

const TOOL = 'tools/build-jlpt-words.mjs';
const OUT = path.join(SITE, 'data', 'words');

/**
 * Rows of his that are no word of the dictionary and are left out on
 * purpose, each named as tools/lib/jlpt-words.mjs leftOutName names it
 * (`written reading`, or a kana word alone) with the reason. Empty until
 * the first run over his pages lists what does not resolve; a name here
 * that no row matches is refused, so the list cannot go stale. A row named
 * here is left out even when READ_AS names it too, and that READ_AS name
 * is refused as matching nothing.
 */
const LEFT_OUT = new Map([]);

/**
 * Rows of his that resolveRow does not read as they are, each named as
 * leftOutName names the row (its cells as rowOf reads them) with the
 * [written, reading] a person read it as, which must be a word of the
 * dictionary: a cell whose parts are different words, say, that is one
 * word the dictionary spells another way. Empty until the first run, whose
 * refusal names each row it could not read and what its parts are; a name
 * here that no row matches is refused too.
 */
const READ_AS = new Map([]);

/** How the report says a row was read other than as its cells are (resolveRow `how`). */
const HOW = { joined: 'its parts as one word', parts: 'every part the same word, the first kept', READ_AS: 'READ_AS' };

const sourceKey = (id) => `waller${id.toUpperCase()}Vocab`;

async function main() {
  const unpinned = WORD_LEVELS.filter((id) => !SOURCES[sourceKey(id)].url || !SOURCES[sourceKey(id)].release);
  if (unpinned.length) {
    process.stderr.write(`REFUSED: no capture is pinned for ${unpinned.map(sourceKey).join(', ')} (tools/lib/sources.mjs says how to pin one)\n`);
    process.exit(1);
  }
  const raw = {};
  const tables = {};
  const undigested = [];
  const unread = [];
  for (const id of WORD_LEVELS) {
    const key = sourceKey(id);
    const file = fetchSource(key);
    if (!SOURCES[key].sha256 || !SOURCES[key].bytes) undigested.push(`${key}: sha256 '${sha256(file)}', bytes ${fs.statSync(file).size}`);
    const page = wallerPage(fs.readFileSync(file, 'utf8'));
    raw[id] = page.rows;
    tables[id] = page.tables;
    for (const cells of page.stray) unread.push(`outside the headed tables: ${id} ${JSON.stringify(cells)}`);
    for (const cells of page.short) unread.push(`in a headed table, without Kanji or Hiragana cells: ${id} ${JSON.stringify(cells)}`);
  }
  if (undigested.length) {
    process.stderr.write(`REFUSED: pin what was read, in tools/lib/sources.mjs:\n  ${undigested.join('\n  ')}\n`);
    process.exit(1);
  }
  if (unread.length) {
    for (const line of unread.slice(0, 12)) process.stderr.write(`  ${line}\n`);
    process.stderr.write(`REFUSED: ${unread.length} rows holding Japanese were not read, outside every table headed Kanji and Hiragana or short of those cells in one. Change wallerPage in tools/lib/jlpt-words.mjs to read them, or to pass over what is not his list.\n`);
    process.exit(1);
  }

  const dict = createDict({ fetchJson: async (p) => JSON.parse(fs.readFileSync(p, 'utf8')), base: `${path.join(SITE, 'data')}/` });
  const rows = [...WORD_LEVELS.flatMap((id) => raw[id].flatMap(rowsOf)), ...[...READ_AS.values()].filter(Array.isArray)];
  const keys = keysOf(rows);
  await dict.need(keys);
  await dict.needRare(keys);
  const first = (k) => dict.get(k);
  const rare = (k) => dict.rare(k);
  const lookup = (w, r) => {
    const own = candidatesOf(first, w, r);
    return own.length ? own : candidatesOf(rare, w, r);
  };
  const resolves = resolvesIn(first, rare);

  const chosen = chooseRows(raw, lookup, LEFT_OUT, READ_AS);
  const lines = WORD_LEVELS.map((id) => `${id}: ${raw[id].length} rows on his page in ${tables[id]} ${tables[id] === 1 ? 'table' : 'tables'}, ${chosen.levels[id].length} kept`);
  lines.push(`${chosen.chosen} words took another record than the dictionary's first, on his English`);
  if (chosen.read.length) {
    lines.push(`${chosen.read.length} rows read other than as their cells are, each to check against his page:`);
    for (const x of chosen.read) lines.push(`  ${x.id} ${JSON.stringify(x.cells)} as ${JSON.stringify(leftOutName(x.row))} ${JSON.stringify(x.g)} (${HOW[x.how]})`);
  }
  if (chosen.repeats.length) {
    lines.push(`${chosen.repeats.length} repeats, each kept at its first level: ${chosen.repeats.map((x) => `${leftOutName(x.row)} (${x.first}, again in ${x.id})`).join('; ')}`);
  }
  if (chosen.left.length) lines.push(`${chosen.left.length} left out by LEFT_OUT`);
  process.stdout.write(`${lines.join('\n')}\n`);

  const stale = [...chosen.stale.map((n) => ['LEFT_OUT', n]), ...chosen.staleReadAs.map((n) => ['READ_AS', n])];
  if (chosen.unresolved.length || stale.length) {
    for (const x of chosen.unresolved) process.stderr.write(`  not read: ${x.id} ${JSON.stringify(x.cells)}, named ${JSON.stringify(leftOutName(x.row))}: ${x.why}\n`);
    for (const [list, name] of stale) process.stderr.write(`  ${list} names ${JSON.stringify(name)}, which no page has\n`);
    process.stderr.write(`REFUSED: ${chosen.unresolved.length} rows are not read as a word of the dictionary and ${stale.length} READ_AS or LEFT_OUT names match nothing. Fix the reading of the page, or name each row in READ_AS with the word it is or in LEFT_OUT with its reason.\n`);
    process.exit(1);
  }
  if (!WORD_LEVELS_READY) {
    const sizes = WORD_LEVELS.map((id) => `${id}: ${chosen.levels[id].length}`).join(', ');
    process.stderr.write(`REFUSED: js/word-levels.js JLPT_WORD_SIZES is not pinned. Read the counts above against his pages, then pin { ${sizes} } and run again.\n`);
    process.exit(1);
  }

  // EDRDG's licence governs, as the glosses are JMdict's (wordsLicence).
  const licence = wordsLicence(TOOL, {
    upstream: [upstream('jmdictFull'), ...WORD_LEVELS.map((id) => upstream(sourceKey(id)))],
  });
  const { index, files } = jlptWordsDocs(chosen.levels, licence);
  const byPath = new Map(files);
  const problems = jlptWordsProblems(index, (rel) => byPath.get(rel), { sizes: JLPT_WORD_SIZES, resolves });
  if (problems.length) {
    process.stderr.write(`REFUSED: ${problems.slice(0, 8).join('; ')}\n`);
    process.exit(1);
  }
  let bytes = 0;
  const written = [];
  for (const [rel, doc] of files) {
    const abs = path.join(SITE, rel);
    bytes += writeJson(abs, doc, 'rows');
    written.push(abs);
  }
  bytes += writeJson(path.join(SITE, 'data', 'words', 'jlpt.json'), index, 'levels');
  const gone = pruneStale(OUT, /^n[1-5]-\d+\.json$/, written);
  process.stdout.write(`words ${index.count} in ${files.length} files and the index, ${fmtBytes(bytes)}${gone.length ? `; removed ${gone.join(' ')}` : ''}\n`);
}

main();
