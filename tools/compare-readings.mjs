#!/usr/bin/env node
/**
 * How two builds of data/ read the same corpus: every token they disagree
 * on, over the Tatoeba Japanese sentences the dictionary is banded from.
 *
 *   node tools/compare-readings.mjs <dataA> [dataB]
 *
 *   <dataA>, [dataB]  two directories named data/, each a whole data tree
 *                     (dataB defaults to this checkout's data/). A copy of
 *                     the committed one: `git archive HEAD data | tar -x -C dir`
 *   --code-a <root>   read A with the js/ of another checkout (default this
 *   --code-b <root>   one), to measure a change of code over the same data
 *   --every N         every Nth sentence (default 80) ...
 *   --from a,b,...    ... starting at each of these 0-based offsets (default
 *                     6,46: the 7th and the 47th, the two sets docs/ANALYZER.md
 *                     measured the second phase on, 6,223 sentences)
 *   --all             every sentence instead
 *   --show N          how many distinct changes to print (default 40), drawn
 *                     at an even stride so the sample is not the first ones
 *   --files           also count the files each sentence fetches and their
 *                     bytes, on a fresh dictionary per sentence, every 160th
 *                     from the 27th (the set docs/ANALYZER.md measured on)
 *   --only-files      that count alone, without the readings
 *
 * Needs the Tatoeba export in the download cache (tools/lib/sources.mjs
 * fetches it once if it is not there). Changes no file.
 *
 * Three measures, each printed with its count:
 *
 *   first pass   every token the first pass builds that is no guess (words,
 *                particles, numbers, punctuation: everything but a guessed
 *                name, a katakana run with no record and kana nothing
 *                explains), read with the second phase switched off, compared
 *                field for field with the token B builds at the same place. This is the boundary tests/tiers.test.mjs holds:
 *                a rule change that moves it moves readings outside the
 *                stretches the second phase is allowed to touch.
 *   readings     every Japanese token of the full analysis, compared by its
 *                span, surface, reading and kind; a change of gloss alone, or
 *                of a name's original spelling, is counted apart.
 *   guesses      tokens with no dictionary support, by kind.
 *
 * A change is the smallest stretch of the sentence whose tokens differ, with
 * A's tokens and B's; the same change in several sentences is one distinct
 * change, printed with how often it occurred.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { SITE } from './lib/emit.mjs';
import { loadBz2Text } from './lib/sources.mjs';
import { sentencesOf } from './lib/freq.mjs';

const JAPANESE = new Set(['word', 'inflected', 'particle', 'copula', 'katakana', 'name', 'unknown', 'number']);

function parseArgs(argv) {
  const opts = {
    dirs: [], codeA: SITE, codeB: SITE, every: 80, from: [6, 46], all: false, show: 40, files: false,
  };
  for (let k = 0; k < argv.length; k += 1) {
    const a = argv[k];
    if (a === '--code-a') opts.codeA = path.resolve(argv[++k]);
    else if (a === '--code-b') opts.codeB = path.resolve(argv[++k]);
    else if (a === '--every') opts.every = Number(argv[++k]);
    else if (a === '--from') opts.from = argv[++k].split(',').map(Number);
    else if (a === '--all') opts.all = true;
    else if (a === '--show') opts.show = Number(argv[++k]);
    else if (a === '--files') opts.files = true;
    else if (a === '--only-files') { opts.files = true; opts.onlyFiles = true; }
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.dirs.push(path.resolve(a));
  }
  if (!opts.dirs.length) throw new Error('usage: node tools/compare-readings.mjs <dataA> [dataB] (see the top of the file)');
  if (opts.dirs.length === 1) opts.dirs.push(path.join(SITE, 'data'));
  for (const d of opts.dirs) {
    // dict.js resolves an index's "data/..." paths against the directory
    // above one named data/, the way the page does.
    if (path.basename(d) !== 'data' || !fs.existsSync(path.join(d, 'dict', 'index.json'))) {
      throw new Error(`${d} is not a data/ directory with dict/index.json in it`);
    }
  }
  return opts;
}

/** The analyzer of one checkout, over one data directory. */
async function side(codeRoot, dataDir) {
  const { analyze } = await import(pathToFileURL(path.join(codeRoot, 'js', 'analyze.js')).href);
  const { createDict } = await import(pathToFileURL(path.join(codeRoot, 'js', 'dict.js')).href);
  const fetchJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
  const fresh = (files) => createDict({
    fetchJson: files ? (p) => { files.push(p); return fetchJson(p); } : fetchJson,
    base: `${dataDir}/`,
  });
  const full = fresh();
  const plain = fresh();
  // analyze.js skips the second phase for a dictionary that cannot load it.
  const first = { ...plain, needRare: undefined, needNames: undefined, get maxKey() { return plain.maxKey; } };
  return {
    full: (text) => analyze(text, { dict: full }),
    first: (text) => analyze(text, { dict: first }),
    counted: async (text) => {
      const files = [];
      await analyze(text, { dict: fresh(files) });
      return { files: files.map((p) => path.relative(dataDir, p)), bytes: files.reduce((n, p) => n + fs.statSync(p).size, 0) };
    },
  };
}

const gloss = (t) => (t.entry && Array.isArray(t.entry.g) && t.entry.g[0]) || '';
const nameOf = (t) => (t.name && t.name.o) || '';
const readingSig = (t) => `${t.start}:${t.end}:${t.surface}:${t.reading}:${t.kind}`;
const fullSig = (t) => `${readingSig(t)}:${gloss(t)}:${nameOf(t)}:${t.confidence}`;
const show = (t) => {
  const g = gloss(t);
  const o = nameOf(t);
  const r = t.reading && t.reading !== t.surface ? ` ${t.reading}` : '';
  return `${t.surface}${r} [${t.kind}${t.confidence === 'guess' ? ' guess' : ''}${g ? ` "${g}"` : ''}${o ? ` ${o}` : ''}]`;
};

/** The stretches where two token lists differ, each with both sides' tokens. */
function changes(a, b, sig) {
  const inB = new Set(b.map(sig));
  const inA = new Set(a.map(sig));
  const onlyA = a.filter((t) => !inB.has(sig(t)));
  const onlyB = b.filter((t) => !inA.has(sig(t)));
  const spans = [...onlyA, ...onlyB].map((t) => [t.start, t.end]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const regions = [];
  for (const [s, e] of spans) {
    const last = regions[regions.length - 1];
    if (last && s < last[1]) last[1] = Math.max(last[1], e);
    else regions.push([s, e]);
  }
  return regions.map(([s, e]) => ({
    a: onlyA.filter((t) => t.start >= s && t.end <= e),
    b: onlyB.filter((t) => t.start >= s && t.end <= e),
  }));
}

function guessKinds(tokens) {
  const out = { name: 0, katakana: 0, unknown: 0, other: 0 };
  for (const t of tokens) {
    if (t.kind === 'unknown') out.unknown += 1;
    else if (t.confidence !== 'guess') continue;
    else if (t.kind === 'name' || t.kind === 'katakana') out[t.kind] += 1;
    else out.other += 1;
  }
  return out;
}

const n = (x) => x.toLocaleString('en-US');
const fmtGuesses = (g) => `${n(g.name + g.katakana + g.unknown + g.other)} (names ${n(g.name)}, katakana ${n(g.katakana)}, unknown kana ${n(g.unknown)}${g.other ? `, other ${n(g.other)}` : ''})`;

function pick(list, count) {
  if (list.length <= count) return list;
  const stride = list.length / count;
  return Array.from({ length: count }, (_, k) => list[Math.floor(k * stride)]);
}

function stats(list) {
  const s = [...list].sort((x, y) => x - y);
  const mean = s.reduce((x, y) => x + y, 0) / (s.length || 1);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return `median ${at(0.5)}, mean ${mean.toFixed(3)}, p90 ${at(0.9)}`;
}

/** Dictionary files are the core and the shards of every tier; the rest are indexes, filters and kanji. */
const DICT_FILE = /^(dict\/(core|w\d+|r\d{3})|names\/n\d+)\.json$/;

async function countFiles(sentences, A, B) {
  const rows = { a: { dict: [], all: [], kb: [] }, b: { dict: [], all: [], kb: [] } };
  for (const text of sentences) {
    for (const [key, s] of [['a', A], ['b', B]]) {
      const { files, bytes } = await s.counted(text);
      rows[key].all.push(files.length);
      rows[key].dict.push(files.filter((f) => DICT_FILE.test(f)).length);
      rows[key].kb.push(Math.round(bytes / 1000));
    }
  }
  return rows;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const all = sentencesOf(loadBz2Text('tatoebaJpn'));
  const sample = opts.all ? all : opts.from.flatMap((f) => all.filter((_, k) => k >= f && (k - f) % opts.every === 0));
  const A = await side(opts.codeA, opts.dirs[0]);
  const B = await side(opts.codeB, opts.dirs[1]);

  const totals = {
    firstA: 0, firstChanged: 0, tokA: 0, tokB: 0, sentChanged: 0, readChanged: 0, glossOnly: 0,
  };
  const guessA = { name: 0, katakana: 0, unknown: 0, other: 0 };
  const guessB = { ...guessA };
  const distinct = new Map();
  const firstDistinct = new Map();
  const t0 = Date.now();
  for (const text of opts.onlyFiles ? [] : sample) {
    const [fa, fb, ra, rb] = [await A.first(text), await B.first(text), await A.full(text), await B.full(text)];
    // the first pass, field for field
    const atB = new Map(fb.tokens.map((t) => [`${t.start}:${t.end}`, JSON.stringify({ ...t, i: undefined })]));
    for (const t of fa.tokens) {
      if (t.confidence === 'guess' || t.kind === 'unknown') continue;
      totals.firstA += 1;
      if (atB.get(`${t.start}:${t.end}`) !== JSON.stringify({ ...t, i: undefined })) {
        totals.firstChanged += 1;
        const other = fb.tokens.find((u) => u.start === t.start && u.end === t.end);
        const id = `${show(t)} -> ${other ? show(other) : '(split differently)'}`;
        firstDistinct.set(id, (firstDistinct.get(id) || 0) + 1);
      }
    }
    // the full analysis
    const ja = ra.tokens.filter((t) => JAPANESE.has(t.kind));
    const jb = rb.tokens.filter((t) => JAPANESE.has(t.kind));
    totals.tokA += ra.tokens.length;
    totals.tokB += rb.tokens.length;
    for (const [k, v] of Object.entries(guessKinds(ja))) guessA[k] += v;
    for (const [k, v] of Object.entries(guessKinds(jb))) guessB[k] += v;
    const diff = changes(ja, jb, fullSig);
    if (!diff.length) continue;
    totals.sentChanged += 1;
    for (const c of diff) {
      const readingMoved = changes(c.a, c.b, readingSig).length > 0;
      if (readingMoved) totals.readChanged += 1; else totals.glossOnly += 1;
      const id = `${readingMoved ? 'reading' : 'gloss'}  ${c.a.map(show).join(' | ') || '(none)'}  ->  ${c.b.map(show).join(' | ') || '(none)'}`;
      if (!distinct.has(id)) distinct.set(id, { count: 0, text });
      distinct.get(id).count += 1;
    }
  }

  const out = [
    `compare-readings: A ${opts.dirs[0]}${opts.codeA !== SITE ? ` with the code of ${opts.codeA}` : ''}`,
    `                  B ${opts.dirs[1]}${opts.codeB !== SITE ? ` with the code of ${opts.codeB}` : ''}`,
    `sentences ${n(sample.length)} of ${n(all.length)}${opts.all ? '' : ` (every ${opts.every}th from offsets ${opts.from.join(', ')})`}; ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    `first pass, tokens read from the first tier (no guess): ${n(totals.firstA)} in A, ${n(totals.firstChanged)} differ in B field for field (${n(firstDistinct.size)} distinct)`,
    `tokens: A ${n(totals.tokA)}, B ${n(totals.tokB)}`,
    `sentences whose tokens differ: ${n(totals.sentChanged)}; changes: ${n(totals.readChanged)} of segmentation, reading or kind, ${n(totals.glossOnly)} of gloss or name only; distinct ${n(distinct.size)}`,
    `guesses: A ${fmtGuesses(guessA)}`,
    `         B ${fmtGuesses(guessB)}`,
  ];
  if (firstDistinct.size) {
    out.push('', 'first-pass tokens that differ (count, A -> B):');
    for (const [id, c] of [...firstDistinct].sort((x, y) => y[1] - x[1]).slice(0, opts.show)) out.push(`  ${c}  ${id}`);
  }
  if (distinct.size) {
    const list = [...distinct].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    out.push('', `changes, ${Math.min(opts.show, list.length)} of ${n(list.length)} distinct at an even stride (count, A -> B, a sentence it is in):`);
    for (const [id, { count, text }] of pick(list, opts.show)) out.push(`  ${count}  ${id}`, `       ${text}`);
  }
  if (opts.files) {
    const filesSample = all.filter((_, k) => k >= 26 && (k - 26) % 160 === 0);
    const rows = await countFiles(filesSample, A, B);
    out.push('', `files per sentence, each on a fresh dictionary, every 160th from the 27th (${n(filesSample.length)}):`,
      `  dictionary files (core, range, rare and name shards): A ${stats(rows.a.dict)}; B ${stats(rows.b.dict)}`,
      `  all files (indexes, filters and kanji too):            A ${stats(rows.a.all)}; B ${stats(rows.b.all)}`,
      `  KB of those files:                                     A ${stats(rows.a.kb)}; B ${stats(rows.b.kb)}`);
  }
  process.stdout.write(`${out.join('\n')}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
