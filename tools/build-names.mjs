#!/usr/bin/env node
/**
 * data/names/index.json and data/names/nNN.json, the names the second phase
 * reads a name guess with (docs/ANALYZER.md, "Data formats").
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, after tools/build-dict.mjs (it leaves out what the first
 * tier already has), commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-names.mjs        (or: make data)
 *
 * The source is JMnedict (tools/lib/sources.mjs), and tools/lib/jmnedict.mjs
 * says which names ship and with which reading. Two kinds ship for any
 * spelling:
 *
 *   attested  a surname, given name or place name the Tatoeba corpus contains
 *             at least once;
 *   evidence  one at least STRONG_EXT other JMnedict names use, counted the
 *             way tools/lib/jmnedict.mjs counts them (built on it, ending
 *             with it after a surname, or a longer given name), which is how
 *             石井, 前田 and 長谷川 get in: Tatoeba has none of them, and 31
 *             of the hundred commonest surnames would be missing without
 *             this rule (docs/ANALYZER.md has the measurement).
 *
 * and a third, for katakana alone:
 *
 *   decoded   a katakana given name, surname, person or place that JMnedict
 *             spells in Latin letters (`o`: トム is Tom, アークレイリ
 *             Akureyri, the spelling the English translations of its
 *             sentences use, tools/lib/original.mjs), whether the corpus
 *             has it or not. Its record says
 *             how a learner would write it, and the corpus has few of the
 *             foreign names a learner pastes (2026-10-05: 1,126 katakana
 *             names shipped before this rule, 30,962 with it). JMnedict's
 *             `person` ships for katakana too (ナポレオン), never for kanji.
 *
 * A record is `{ r, n, f, s, S, o }`: the reading (absent for a katakana
 * name, which is read as written), the types (most evidenced first), the
 * per-kanji split of the reading as the dictionary's `f` is cut, `s: 1` for a
 * strong name, `S: 1` for one at least SURE_EXT names are built on, and for a
 * katakana name its original spelling in Latin letters. The index carries
 * the key filter inline, so the second phase learns which name shards to
 * fetch from one file.
 *
 * It also writes data/names/popular.json (tools/lib/popular.mjs): the
 * katakana names the corpus uses most, with their original spellings, for a
 * game that asks a learner to read them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadZippedJson, loadBz2Text, upstream } from './lib/sources.mjs';
import { licenceBlock } from './lib/licence.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';
import { readingTable } from './lib/split.mjs';
import { sentencesOf } from './lib/freq.mjs';
import {
  candidates, surnames, countExtensions, attested, recordOf, STRONG_EXT, SURE_EXT,
} from './lib/jmnedict.mjs';
import { buildFilter } from '../js/bloom.js';
import {
  katakanaRunCounts, popularCandidates, popularProblems, popularType, rowType, usageOf, POPULAR_FORMAT, POPULAR_MAX,
} from './lib/popular.mjs';
import {
  chooseOriginal, englishFor, linkedSentences, sentenceRows,
} from './lib/original.mjs';
import { isKatakana, toHira } from '../js/kana.js';
import { createDict } from '../js/dict.js';
import { analyze } from '../js/analyze.js';

const TOOL = 'tools/build-names.mjs';
const OUT = path.join(SITE, 'data', 'names');
const FORMAT = 'yomu-names/1';
const INDEX_FORMAT = 'yomu-names-index/1';
const BITS_PER_KEY = 16;

/** Every first-tier key, read from the committed shards the page reads. */
function firstTierKeys() {
  const dir = path.join(SITE, 'data', 'dict');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const keys = new Set();
  for (const src of [index.core.src, ...index.shards.map((s) => s.src)]) {
    for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(SITE, src), 'utf8')).entries)) keys.add(k);
  }
  return keys;
}

/** Contiguous key ranges of at most MAX_BYTES, as the dictionary is cut. */
function pack(sorted, records, licence) {
  const header = Buffer.byteLength(serialize({ _licence: licence, format: FORMAT, first: '', last: '', entries: {} })) + 200;
  const shards = [];
  let cur = [];
  let size = header;
  for (const k of sorted) {
    const n = Buffer.byteLength(`${JSON.stringify(k)}: ${JSON.stringify(records.get(k))},\n`);
    if (cur.length && size + n > MAX_BYTES) { shards.push(cur); cur = []; size = header; }
    cur.push(k);
    size += n;
  }
  if (cur.length) shards.push(cur);
  return shards.map((keys) => ({
    _licence: licence,
    format: FORMAT,
    first: keys[0],
    last: keys[keys.length - 1],
    entries: Object.fromEntries(keys.map((k) => [k, records.get(k)])),
  }));
}

async function main() {
  const t0 = Date.now();
  const jmnedict = loadZippedJson('jmnedict');
  const kanjidic = loadZippedJson('kanjidic');
  const japanese = loadBz2Text('tatoebaJpn');
  const sentences = sentencesOf(japanese);
  const table = readingTable(kanjidic);
  const first = firstTierKeys();

  const cands = candidates(jmnedict);
  countExtensions(jmnedict, cands, surnames(jmnedict));
  const open = new Set([...cands.keys()].filter((k) => !first.has(k)));
  const seen = attested(sentences, open);
  const stats = {
    attested: 0, strongOnly: 0, decoded: 0, kanji: 0, katakana: 0, original: 0, person: 0, strong: 0, sure: 0, star: 0, untyped: 0,
    byEvidence: 0, changed: 0, linked: 0, unseen: 0, changes: [],
  };
  const picks = new Map();

  // A katakana name's spelling in Latin letters, chosen by the English
  // translations of the sentences that hold it (tools/lib/original.mjs).
  const spelled = [...open].filter((k) => isKatakana(k[0]) && (cands.get(k).get(toHira(k)) || {}).latin);
  const linked = linkedSentences(new Set(spelled), sentenceRows(japanese), loadBz2Text('tatoebaJpnEng'), loadBz2Text('tatoebaEng'));
  const english = englishFor(new Set(spelled), null, null, null, linked);
  for (const k of spelled) {
    const v = cands.get(k).get(toHira(k));
    if (!v.latin.length) continue;
    const lines = english.get(k) || [];
    const pick = chooseOriginal(v.latin, lines);
    picks.set(k, { ...pick, first: v.o, linked: lines.length > 0 });
    v.o = pick.o;
  }
  const records = new Map();
  for (const text of [...open].sort()) {
    const { rec, evidence } = recordOf(text, cands.get(text), table);
    const inCorpus = seen.has(text);
    // The evidence reads it a way the tier cannot type (相模 さがみ): no name.
    if (!rec) { if (inCorpus) stats.untyped += 1; continue; }
    const strong = evidence >= STRONG_EXT;
    if (!inCorpus && !strong && !rec.o) continue;
    records.set(text, rec);
    const pick = picks.get(text);
    if (pick) {
      if (pick.linked) stats.linked += 1;
      if (pick.by === 'evidence') stats.byEvidence += 1;
      else if (pick.linked) stats.unseen += 1;
      if (pick.o !== pick.first) { stats.changed += 1; stats.changes.push([text, pick.first, pick.o, pick.seen]); }
    }
    stats[inCorpus ? 'attested' : strong ? 'strongOnly' : 'decoded'] += 1;
    if (rec.o) stats.original += 1;
    if (String(rec.n).split(' ').includes('person')) stats.person += 1;
    stats[rec.r ? 'kanji' : 'katakana'] += 1;
    if (rec.s) stats.strong += 1;
    if (rec.S) stats.sure += 1;
    if (rec.f === '*') stats.star += 1;
  }

  const licence = licenceBlock('jmnedict', TOOL, {
    upstream: [upstream('jmnedict'), upstream('kanjidic'), upstream('tatoebaJpn'), upstream('tatoebaEng'), upstream('tatoebaJpnEng')],
    inputs: [
      ['edrdg', 'f, the split of a name\'s reading over its kanji, from KANJIDIC readings'],
      ['tatoebaNames', 'which names ship (one the corpus contains at least once), in popular.json how many sentences hold each, and o, which of a katakana name\'s JMnedict spellings the linked English sentences use; no sentence ships'],
    ],
  });
  const sorted = [...records.keys()].sort();
  const docs = pack(sorted, records, licence);
  const written = [];
  const sizes = [];
  const shards = [];
  docs.forEach((doc, i) => {
    const name = `n${String(i).padStart(2, '0')}.json`;
    sizes.push(writeJson(path.join(OUT, name), doc));
    written.push(path.join(OUT, name));
    shards.push({ src: `data/names/${name}`, first: doc.first });
  });
  const { m, k, bytes } = buildFilter(new Set(sorted), BITS_PER_KEY);
  const indexBytes = writeJson(path.join(OUT, 'index.json'), {
    _licence: licence,
    format: INDEX_FORMAT,
    keys: sorted.length,
    maxKey: sorted.reduce((n, s) => Math.max(n, s.length), 0),
    filter: { n: sorted.length, m, k, bits: Buffer.from(bytes).toString('base64') },
    shards,
  }, 'shards');
  written.push(path.join(OUT, 'index.json'));
  const gone = pruneStale(OUT, /^n\d+\.json$/, written);

  // The popular names, for the game (tools/lib/popular.mjs): the corpus's
  // commonest, each read on its own by the analyzer over the data just
  // written, kept when the page reads it as that name. Held to the checker's
  // own rules before it is written.
  const dict = createDict({ fetchJson: async (p) => JSON.parse(fs.readFileSync(p, 'utf8')), base: `${path.join(SITE, 'data')}/` });
  const rows = [];
  let passed = 0;
  const confirmed = new Set([...picks].filter(([, p]) => p.by === 'evidence').map(([k]) => k));
  // How the corpus uses each spelled name, sentence by sentence (a place
  // used as a person, a name only ever the stem of 語 or 人).
  const usage = new Map();
  for (const [k, held] of linked.byName) {
    const rec = records.get(k);
    if (rec && rec.o) usage.set(k, usageOf(k, rec.o, held.map(([id, text]) => [text, (linked.english.get(id) || []).map(([, line]) => line)])));
  }
  const counts = katakanaRunCounts(sentences);
  const moved = [];
  for (const row of popularCandidates(records, counts, confirmed, usage)) {
    if (rows.length === POPULAR_MAX) break;
    const r = await analyze(row[0], { dict });
    const t = r.tokens.length === 1 ? r.tokens[0] : null;
    if (t && t.kind === 'name' && t.name && t.name.o === row[1]) {
      rows.push(row);
      if (popularType(records.get(row[0]).n) !== row[2]) moved.push(`${row[0]} ${row[1]} (${row[3]}, ${usage.get(row[0]).person} as a person)`);
    } else passed += 1;
  }
  // What the rules left out of the game, for the log: a spelling with no
  // capital (エイヴォン avon), and a name used only as a word's stem.
  const refused = [];
  for (const [text, rec] of records) {
    if (!confirmed.has(text) || !rec.o || !popularType(rec.n) || !(counts.get(text) > 0)) continue;
    if (!/^\p{Lu}/u.test(rec.o)) refused.push(`${text} ${rec.o} (no capital)`);
    else if (rowType(rec, counts.get(text), usage.get(text) || null).by === 'word') refused.push(`${text} ${rec.o} (${usage.get(text).word} of ${counts.get(text)} sentences a word's stem)`);
  }
  const popular = { _licence: licence, format: POPULAR_FORMAT, names: rows };
  const problems = popularProblems(popular, { names: records, licence });
  if (problems.length) {
    process.stderr.write(`REFUSED data/names/popular.json: ${problems.slice(0, 5).join('; ')}\n`);
    process.exit(1);
  }
  const popularBytes = writeJson(path.join(OUT, 'popular.json'), popular, 'names');

  const total = sizes.reduce((a, b) => a + b, 0);
  process.stdout.write(`${[
    `JMnedict spellings of two or more kanji or katakana, typed surname, given or place: ${cands.size}; not first-tier keys ${open.size}`,
    `names ${records.size}: in the corpus ${stats.attested}, by evidence only (${STRONG_EXT} or more other names use it) ${stats.strongOnly}, katakana decoded only ${stats.decoded}; kanji ${stats.kanji}, katakana ${stats.katakana} (${stats.original} with an original spelling, ${stats.person} typed person); strong ${stats.strong}, sure (ext >= ${SURE_EXT}) ${stats.sure}; read as a whole (*) ${stats.star}`,
    `katakana names spelled by the English sentences linked to theirs: ${stats.byEvidence} of ${stats.original} (${stats.linked} have linked English sentences, ${stats.unseen} of those with no spelling seen); ${stats.changed} differ from JMnedict's first (${stats.changes.sort((a, b) => b[3] - a[3]).slice(0, 12).map(([k, a, b, n]) => `${k} ${a} to ${b} ${n}`).join(', ')})`,
    `popular.json: ${popular.names.length} names, ${fmtBytes(popularBytes)} (${popularBytes} B), passing over ${passed} the page does not read as that name; first ${popular.names.slice(0, 8).map((r) => `${r[0]} ${r[1]} ${r[3]}`).join(', ')}`,
    `popular.json types: ${['given', 'surname', 'person', 'place'].map((ty) => `${ty} ${popular.names.filter((r) => r[2] === ty).length}`).join(', ')}; places the corpus uses as a person, now person: ${moved.length} (${moved.join(', ')})`,
    `popular.json left out by rule: ${refused.length} (${refused.join(', ')})`,
    `left out, in the corpus but best read as a type that does not ship: ${stats.untyped}`,
    `shards ${docs.length}: total ${fmtBytes(total)} (${total} B); index with its filter ${fmtBytes(indexBytes)} (${indexBytes} B)`,
    gone.length ? `removed stale shards: ${gone.join(' ')}` : 'no stale shards',
    `wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  ].join('\n')}\n`);
}

main().catch((err) => { process.stderr.write(`${err.stack || err}\n`); process.exit(1); });
