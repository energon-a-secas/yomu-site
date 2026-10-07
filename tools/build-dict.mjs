#!/usr/bin/env node
/**
 * data/dict/index.json and data/dict/wNN.json, the dictionary the analyzer
 * looks words up in (docs/ANALYZER.md, "Data formats").
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-dict.mjs        (or: make data)
 *
 * The source is jmdict-eng, the whole of JMdict in English. Its entries with
 * at least one common spelling (exactly jmdict-eng-common) ship under every
 * spelling, and every common spelling, kanji or kana, becomes a key; a key
 * maps to the records of every entry that spells it, so わたし finds 私 and は
 * finds the particle as well as the tooth. An entry outside the common set
 * ships only under the keys tools/lib/extra.mjs chooses for it (すもも, 置き,
 * 帰社, and the words the corpus has evidence for). The full entry is not
 * shipped: a record is the lean projection a reader needs beside a word (three
 * glosses, the parts of speech, the reading split per kanji, a frequency
 * band), and the rest of JMdict stays upstream.
 *
 * The page never loads the whole dictionary. The keys texts ask for most go
 * in one core shard (tools/lib/layout.mjs); the rest are sorted in plain JS
 * string order and cut into contiguous shards of at most 140 KB, the index
 * lists each shard's first key, and a key filter says which keys exist, so a
 * lookup fetches the core and at most the one shard whose `first` is the last
 * <= the key. The builder guarantees that rule by construction and
 * tools/check-data.mjs re-checks it on every file.
 */
import path from 'node:path';
import { loadZippedJson, loadBz2Text, upstream } from './lib/sources.mjs';
import { licenceBlock } from './lib/licence.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';
import { readingTable } from './lib/split.mjs';
import {
  recordFor, rank, byRank, pack, stats,
} from './lib/records.mjs';
import { writeRare } from './lib/rare-emit.mjs';
import { isAllKana } from '../js/kana.js';
import { byEvidence, kunTable, stampPlaces, stampShipped } from './lib/prices.mjs';
import { chooseCore, filterDoc } from './lib/layout.mjs';
import { countKeys, bandsOf, bandScale, sentencesOf } from './lib/freq.mjs';
import {
  selectExtra, selectMixed, isCommon, MIN_MATCHES,
} from './lib/extra.mjs';
import { selection } from './lib/kanjidic.mjs';
import {
  candidates, surnames, countExtensions, recordOf,
} from './lib/jmnedict.mjs';

const TOOL = 'tools/build-dict.mjs';
const OUT = path.join(SITE, 'data', 'dict');

// Six, measured. Once the records are ordered by evidence, 書く is first
// under かく, and what six cuts is 70 records like 竜 under たつ and 箏
// under そう. Ten would keep all but six of them for 4.4 KB, but over 3,016
// texts it read 数か月もたつと as "dragon" and 無理そう as "koto": a rare noun
// takes the -30 a noun gets before a particle, and one band of evidence (16)
// does not pay for it.
const MAX_RECORDS = 6;

/** A key that is another key plus one of these is a candidate for `x`. */
const PARTICLES = new Set([...'はにでともがをへか', 'の']);

/**
 * `w`: the final は of these keys is the old topic particle and is said wa.
 * JMdict notes most of them in a sense's `info` ("は is pronounced as わ");
 * this floor is here so that the handful a learner meets in week one do not
 * depend on an upstream note staying worded the same.
 */
const WA_FLOOR = new Set(['こんにちは', 'こんばんは', 'では', 'には', 'とは']);
const WA_NOTE = /pronounced (as )?わ(?!\p{Script=Hiragana})/u;

// ── Build ─────────────────────────────────────────────────────────────────

/**
 * Every spelling of every shipped entry, and the keys. A common entry is
 * shipped under all its spellings and each common one is a key, as before;
 * an entry outside the common set only under the keys tools/lib/extra.mjs
 * chose for it, each of which is a key.
 */
function collect(jmdict, extras, folds = new Map()) {
  const forms = new Map();
  const keys = new Set();
  const push = (text, f) => {
    if (!forms.has(text)) forms.set(text, []);
    forms.get(text).push(f);
    if (f.common || f.extra) keys.add(text);
  };
  jmdict.words.forEach((entry, index) => {
    const only = isCommon(entry) ? null : extras.get(index);
    if (!isCommon(entry) && !only) return;
    const extra = !!only;
    for (const k of entry.kanji) {
      if (k.tags.includes('sK') || (only && !only.has(k.text))) continue;
      push(k.text, { entry, index, kind: 'kanji', common: k.common, extra });
    }
    for (const k of entry.kana) {
      if (k.tags.includes('sk') || (only && !only.has(k.text))) continue;
      push(k.text, { entry, index, kind: 'kana', common: k.common, extra });
    }
  });
  // A katakana fold of a mixed spelling (アメ色 for あめ色, tools/lib/extra.mjs
  // selectMixed): the spelling's own record under a key JMdict does not list.
  for (const [text, { index, spelling }] of folds) {
    push(text, {
      entry: jmdict.words[index], index, kind: 'kanji', common: false, extra: true, spelling,
    });
  }
  return { forms, keys };
}

function taggedPrt(list) {
  return list.some((f) => f.entry.sense.some((s) => s.partOfSpeech.includes('prt')));
}

/**
 * `x`: this key is another key plus one trailing particle, and not itself a
 * particle (docs/ANALYZER.md). Spelling alone over-fires on kana keys, so
 * four guards narrow it, each for a failure seen in the output:
 *
 *   - the key is not a na-adjective: 愚か, はるか and かすか end in か as part
 *     of the stem, and there is no particle to split off;
 *   - the base is longer than one kana: この is こ plus の and もの is も plus
 *     の, and a lattice told to prefer that split reads "this" as "child";
 *   - a kana key whose entry is spelled in kanji is flagged only when that
 *     spelling ends in the same particle: じつは is 実は, so the は is a
 *     particle, but えいが is 映画 and しごと is 仕事, where it is not;
 *   - a kana key with no kanji spelling is flagged only when its base is
 *     itself a kana word: それでは is それで plus は, but かどうか is not 稼働
 *     plus か.
 *
 * A key with kanji in it (今日は, 実は, 一緒に) needs none of them: the kanji
 * already fix where the word ends.
 */
function particleTail(key, list, recs, all) {
  if (key.length < 2 || !PARTICLES.has(key[key.length - 1])) return false;
  const base = key.slice(0, -1);
  const baseRecs = all.get(base);
  if (!baseRecs || taggedPrt(list)) return false;
  if (list.some((f) => f.entry.sense.some((sn) => sn.partOfSpeech.includes('adj-na')))) return false;
  if (!isAllKana(key)) return true;
  if (base.length === 1) return false;
  const tail = key[key.length - 1];
  if (recs[0].k) return recs[0].k[0].endsWith(tail);
  return !baseRecs[0].k || baseRecs[0].u === 1;
}

function saidWa(key, f) {
  if (!key.endsWith('は')) return false;
  if (WA_FLOOR.has(key)) return true;
  return f.entry.sense.some((s) => s.info.some((i) => WA_NOTE.test(i)));
}

function buildEntries(collected, kanjidic, bands, counts, marked) {
  const table = readingTable(kanjidic);
  const kanjiInfo = kunTable(kanjidic);
  const { forms, keys } = collected;
  // Every record of every key, uncapped, in JMdict order, with its key's
  // band: the dictionary the page would have with no cap, which is what a
  // kana record's spelling is looked up in.
  const full = new Map();
  for (const key of keys) {
    const q = bands.get(key);
    const list = [];
    for (const f of [...forms.get(key)].sort((a, b) => byRank(rank(a, key), rank(b, key)))) {
      const rec = recordFor(f.spelling || key, f, table);
      if (!rec.g.length) { stats.emptyG += 1; continue; }
      if (q) rec.q = q;
      // Carried to tools/lib/prices.mjs, which prices a record from outside
      // the common set as having no evidence, and removes the mark.
      if (f.extra) rec.extra = 1;
      list.push({ f, rec });
    }
    if (list.length) full.set(key, list);
  }
  const view = new Map([...full].map(([k, list]) => [k, list.map((x) => x.rec)]));
  stampPlaces(view);
  const dict = { get: (k) => view.get(k) };

  const entries = new Map();
  // Which (entry, spelling) pairs this tier ships, so the second tier can
  // ship every other one (tools/lib/rare.mjs).
  const shipped = new Set();
  for (const [key, list] of full) {
    const ordered = byEvidence(key, list, dict, kanjiInfo);
    if (ordered.length > MAX_RECORDS) stats.capped += 1;
    entries.set(key, ordered.slice(0, MAX_RECORDS).map(({ f, rec }) => {
      shipped.add(`${f.index}\t${key}`);
      const { q, o, ...out } = rec;
      if (saidWa(key, f)) { out.w = 1; stats.w += 1; }
      return out;
    }));
  }
  // A second pass, because `x` reads the records of another key, and that
  // key may sort after this one.
  for (const [key, recs] of entries) {
    const x = particleTail(key, forms.get(key), recs, entries);
    if (x) stats.x += 1;
    const q = bands.get(key);
    entries.set(key, recs.map((rec) => {
      const { w, ...rest } = rec;
      const out = { ...rest };
      if (x) out.x = 1;
      if (q) out.q = q;
      if (w) out.w = w;
      if (marked.has(key)) out.m = 1;
      return out;
    }));
    const f0 = recs[0].f;
    if (f0) {
      const parts = f0.split(';');
      const multi = parts.filter((p) => p === '*' || p.includes('|'));
      const stars = multi.filter((p) => p === '*').length;
      if (!stars) stats.split += 1;
      else if (stars === multi.length) stats.star += 1;
      else stats.partial += 1;
    }
  }
  Object.assign(stats, stampShipped(entries, kanjiInfo, counts));
  return { entries, keys, shipped, table };
}

/**
 * The first tier from the entries and keys chosen: every spelling collected,
 * the keys counted and banded, the records built and priced.
 *
 * The common keys are counted and banded among themselves, as before the
 * entries outside the common set were added, so adding one moves no other
 * key's band. An added key is counted against every shipped key and put on
 * the common keys' scale.
 *
 * `mixedKeys` are the mixed spellings and their katakana folds, banded only
 * on evidence; `marked`, the mixed spellings alone, whose every record
 * carries `m` (docs/ANALYZER.md): the lattice prices such a key apart where
 * its closing hiragana start a longer word (js/candidates.js). A fold ends
 * in no hiragana, so nothing would read its mark.
 */
function assemble(jmdict, extras, folds, sentences, kanjidic, mixedKeys = new Set(), marked = new Set()) {
  const collected = collect(jmdict, extras, folds);
  const keySet = collected.keys;
  const commonKeys = new Set([...keySet].filter((k) => collected.forms.get(k).some((f) => f.common)));
  const counts = countKeys(sentences, commonKeys);
  const bands = bandsOf(counts);
  const scale = bandScale(counts, bands);
  const shippedCounts = countKeys(sentences, keySet);
  for (const k of keySet) {
    if (commonKeys.has(k) || !shippedCounts.get(k)) continue;
    // A mixed spelling ships with no count asked of it (selectMixed), and is
    // banded only on what the evidence rule calls evidence.
    if (mixedKeys.has(k) && shippedCounts.get(k) < MIN_MATCHES) continue;
    counts.set(k, shippedCounts.get(k));
    bands.set(k, scale(shippedCounts.get(k)));
  }
  return { ...buildEntries(collected, kanjidic, bands, counts, marked), bands, keySet };
}

/**
 * The record the names tier would give a spelling (tools/build-names.mjs
 * chooses it the same way), for the evidence rule in tools/lib/extra.mjs.
 */
function namesOf(kanjidic) {
  const jmnedict = loadZippedJson('jmnedict');
  const cands = candidates(jmnedict);
  countExtensions(jmnedict, cands, surnames(jmnedict));
  const table = readingTable(kanjidic);
  return (s) => (cands.has(s) ? recordOf(s, cands.get(s), table).rec : null);
}

function main() {
  const t0 = Date.now();
  const jmdict = loadZippedJson('jmdictFull');
  const kanjidic = loadZippedJson('kanjidic');
  const sentences = sentencesOf(loadBz2Text('tatoebaJpn'));
  const shipped = new Set(selection(kanjidic).map((c) => c.literal));

  const { extras, stats: extra } = selectExtra(jmdict, sentences, kanjidic, shipped, namesOf(kanjidic));
  // The fourth reason asks what the first tier, built for the first three,
  // does with a word's kana (tools/lib/extra.mjs selectMixed), so the tier is
  // built twice: the second time with the mixed spellings and their folds.
  const zero = { ...stats };
  const before = assemble(jmdict, extras, new Map(), sentences, kanjidic);
  // the counters are the shipped build's, not the sum of both
  Object.assign(stats, zero);
  const mixed = selectMixed(jmdict, (kana) => (before.entries.get(kana) || [])[0], before.keySet, sentences);
  for (const [index, keys] of mixed.extras) {
    if (!extras.has(index)) extras.set(index, new Set());
    for (const k of keys) extras.get(index).add(k);
  }
  const spellings = new Set([...mixed.extras.values()].flatMap((k) => [...k]));
  const {
    entries, shipped: shippedPairs, table, bands, keySet,
  } = assemble(jmdict, extras, mixed.folds, sentences, kanjidic, new Set([...spellings, ...mixed.folds.keys()]), spellings);
  const added = [...keySet].filter((k) => !before.keySet.has(k));

  const all = [...entries.keys()].sort();
  const maxKey = all.reduce((m, k) => Math.max(m, k.length), 0);
  const licence = licenceBlock('edrdg', TOOL, {
    upstream: [upstream('jmdictFull'), upstream('kanjidic'), upstream('tatoebaJpn')],
    inputs: [['tatoeba', 'q, a frequency band per key, and which keys the core holds; no sentence ships']],
  });

  // The core first: the keys texts ask for most, per byte (tools/lib/layout.mjs).
  const coreHeader = Buffer.byteLength(serialize({
    _licence: licence, format: 'yomu-dict-core/1', first: all[all.length - 1], last: all[all.length - 1], entries: {},
  }));
  const lineBytes = (k) => Buffer.byteLength(`${JSON.stringify(k)}: ${JSON.stringify(entries.get(k))},\n`);
  const { core, sampled } = chooseCore(new Set(all), sentences, maxKey, lineBytes, MAX_BYTES - coreHeader);
  const coreKeys = all.filter((k) => core.has(k));
  const coreDoc = {
    _licence: licence,
    format: 'yomu-dict-core/1',
    first: coreKeys[0],
    last: coreKeys[coreKeys.length - 1],
    entries: Object.fromEntries(coreKeys.map((k) => [k, entries.get(k)])),
  };
  const coreBytes = writeJson(path.join(OUT, 'core.json'), coreDoc);

  const sorted = all.filter((k) => !core.has(k));
  const docs = pack(sorted, entries, licence);
  const written = [];
  const shards = [];
  const sizes = [];
  docs.forEach((doc, i) => {
    const name = `w${String(i).padStart(2, '0')}.json`;
    const file = path.join(OUT, name);
    sizes.push(writeJson(file, doc));
    written.push(file);
    shards.push({ src: `data/dict/${name}`, first: doc.first });
  });
  const filter = filterDoc(new Set(sorted), licence);
  const filterBytes = writeJson(path.join(OUT, 'filter.json'), filter);
  const index = {
    _licence: licence,
    format: 'yomu-dict-index/2',
    keys: all.length,
    maxKey,
    core: { src: 'data/dict/core.json', keys: coreKeys.length },
    filter: { src: 'data/dict/filter.json' },
    shards,
  };
  const indexBytes = writeJson(path.join(OUT, 'index.json'), index, 'shards');
  const gone = pruneStale(OUT, /^w\d+\.json$/, written);

  // The second tier: everything the first does not ship (tools/lib/rare.mjs).
  // Its records are built with the same counters, so the first tier's are
  // read before it runs.
  const first = { skippedGloss: stats.skippedGloss, emptyG: stats.emptyG };
  const rare = writeRare({
    jmdict, shipped: shippedPairs, table, sentences, firstKeys: all, licence,
  });

  const total = sizes.reduce((a, b) => a + b, 0);
  const records = [...entries.values()].reduce((a, r) => a + r.length, 0);
  const withLs = [...entries.values()].flat().filter((r) => r.ls);
  const qs = [1, 2, 3, 4, 5].map((b) => [...bands.values()].filter((v) => v === b).length);
  const out = [
    `keys ${all.length}, records ${records}, maxKey ${maxKey} UTF-16 units`,
    `outside the common set (N ${MIN_MATCHES}): ${extras.size} entries; of ${extra.candidates} candidate spellings, evidence ${extra.evidence}, suffix ${extra.suffix} (${extra.under} readings under a common kana key); kana ${extra.kana}; suru ${extra.suru}`,
    `matched spellings left out as strong names read another way: ${extra.named.length} (${extra.named.join(', ')})`,
    `of the evidence, 何 and a counter read as one number token, which lends it its gloss: ${extra.asked.length} (${extra.asked.join(', ')})`,
    `mixed spellings whose kana the first tier read as another word: ${mixed.stats.mixed}, and ${mixed.stats.folded} katakana folds; keys added ${added.length}, ${added.reduce((n, k) => n + lineBytes(k), 0)} B (${mixed.stats.sample.join(', ')})`,
    `mixed spellings JMdict gives several entries, moved to the one the corpus matches most: ${mixed.stats.claimed.length} (${mixed.stats.claimed.join(', ')})`,
    `core ${coreKeys.length} keys, ${fmtBytes(coreBytes)} (${coreBytes} B), chosen over ${sampled} sampled sentences`,
    `range shards ${docs.length}: min ${fmtBytes(Math.min(...sizes))} (${Math.min(...sizes)} B), max ${fmtBytes(Math.max(...sizes))} (${Math.max(...sizes)} B), total ${fmtBytes(total)} (${total} B); index ${fmtBytes(indexBytes)}`,
    `filter ${filter.n} keys, ${filter.m} bits, ${filter.k} hashes, ${fmtBytes(filterBytes)} (${filterBytes} B)`,
    `multi-kanji keys (first record): split ${stats.split}, partly split ${stats.partial}, * ${stats.star}`,
    `x ${stats.x} keys, w ${stats.w} records, m ${[...spellings].filter((k) => entries.has(k)).length} keys, keys over ${MAX_RECORDS} records ${stats.capped}`,
    `shipped for the page: o ${stats.o} records, b ${stats.b}, c ${stats.c}, t ${stats.t}`,
    `q bands 1-5: ${qs.join(' / ')}; unranked ${all.length - [...bands.keys()].filter((k) => entries.has(k)).length}`,
    `senses whose first gloss was passed over (dash or banned word) ${first.skippedGloss}; records dropped for an empty g ${first.emptyG}`,
    `shipped records with a language source (ls) ${withLs.length}, wasei (ws) ${withLs.filter((r) => r.ws).length}`,
    gone.length ? `removed stale shards: ${gone.join(' ')}` : 'no stale shards',
    ...rare,
    `second tier senses whose first gloss was passed over ${stats.skippedGloss - first.skippedGloss}; records dropped for an empty g ${stats.emptyG - first.emptyG}`,
    `sentences counted ${sentences.length}; wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  ];
  process.stdout.write(`${out.join('\n')}\n`);
}

main();
