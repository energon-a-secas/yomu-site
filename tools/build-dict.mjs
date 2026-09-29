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
 * The source is jmdict-eng-common, the JMdict entries with at least one common
 * spelling. Every common spelling, kanji or kana, becomes a key; a key maps to
 * the records of every entry that spells it, so わたし finds 私 and は finds
 * the particle as well as the tooth. The full entry is not shipped: a record
 * is the lean projection a reader needs beside a word (three glosses, the
 * parts of speech, the reading split per kanji, a frequency band), and the
 * rest of JMdict stays upstream.
 *
 * The page never loads the whole dictionary. The keys are sorted in plain JS
 * string order and cut into contiguous shards of at most 140 KB, and the index
 * lists each shard's first key, so a lookup fetches exactly one shard: the
 * last one whose `first` is <= the key. The builder guarantees that rule by
 * construction and tools/check-data.mjs re-checks it on every file.
 */
import path from 'node:path';
import { loadZippedJson, loadBz2Text, upstream } from './lib/sources.mjs';
import { licenceBlock, unshippable, EM_DASH } from './lib/licence.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';
import { readingTable, splitReading, needsSplit } from './lib/split.mjs';
import { isAllKana, isKatakana } from '../js/kana.js';
import { kanaRecordPrice, bandPrice } from '../js/spellings.js';
import { COST } from '../js/costs.js';
import { readingsOfType, selection } from './lib/kanjidic.mjs';
import { countKeys, bandsOf, sentencesOf } from './lib/freq.mjs';

const TOOL = 'tools/build-dict.mjs';
const OUT = path.join(SITE, 'data', 'dict');

// Six, measured. Once the records are ordered by evidence, 書く is first
// under かく, and what six cuts is 70 records like 竜 under たつ and 箏
// under そう. Ten would keep all but six of them for 4.4 KB, but over 3,016
// texts it read 数か月もたつと as "dragon" and 無理そう as "koto": a rare noun
// takes the -30 a noun gets before a particle, and one band of evidence (16)
// does not pay for it.
const MAX_RECORDS = 6;
const MAX_SENSES = 3;
const MAX_GLOSS = 60;
const MAX_KANJI = 2;

// Readings that are not shipped in `r`: search-only (sk), irregular (ik) and
// outdated (ok) kana. こんにちわ is in JMdict as an irregular reading of 今日は
// so that a search for it finds something; it is not a reading to teach.
const SKIP_KANA = new Set(['sk', 'ik', 'ok']);
// The same three, for the kanji spellings a kana key lists in `k`.
const SKIP_KANJI = new Set(['sK', 'iK', 'oK']);

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

// ── Records ───────────────────────────────────────────────────────────────

function applies(list, key) {
  return list.includes('*') || list.includes(key);
}

/** The senses that apply to this spelling; all of them if the tags say none. */
function sensesFor(entry, key, kind) {
  const field = kind === 'kanji' ? 'appliesToKanji' : 'appliesToKana';
  const ok = entry.sense.filter((s) => applies(s[field], key));
  return ok.length ? ok : entry.sense;
}

/**
 * At most 60 characters. Cut at a word, and drop a parenthesis the cut left
 * open, because "to be surprised (by something unexpected, et…" reads as a
 * broken page where "to be surprised…" reads as a short gloss.
 */
function trimGloss(text) {
  const s = text.trim();
  if (s.length <= MAX_GLOSS) return s;
  let cut = s.slice(0, MAX_GLOSS - 1);
  const space = cut.lastIndexOf(' ');
  if (space >= MAX_GLOSS / 2) cut = cut.slice(0, space);
  const open = cut.lastIndexOf('(');
  if (open >= 10 && cut.indexOf(')', open) < 0) cut = cut.slice(0, open);
  return `${cut.replace(/[\s,;:(]+$/, '')}…`;
}

const stats = {
  skippedGloss: 0, emptyG: 0, capped: 0, split: 0, partial: 0, star: 0, x: 0, w: 0,
};

/**
 * The first gloss of each of the first three senses.
 *
 * Two house rules reach a gloss, and they are not equal. An em dash can never
 * ship (tools/check-data.mjs fails the file), so a gloss carrying one is passed
 * over. The five banned words are a rule about our own copy, and a gloss is
 * the EDRDG's translation, not our copy: a sense that offers another gloss
 * shows that one instead (強力 shows its second gloss, "strong"), but a sense
 * whose only gloss is the word keeps it, because パワフル with no meaning at all
 * would be a dictionary lying to keep a style rule.
 */
function glossesOf(senses) {
  const out = [];
  for (const sense of senses.slice(0, MAX_SENSES)) {
    const glosses = sense.gloss.filter((g) => g.lang === 'eng').map((g) => g.text)
      .filter((g) => !g.includes(EM_DASH));
    const pick = glosses.find((g) => !unshippable(g)) || glosses[0];
    if (pick !== sense.gloss[0]?.text) stats.skippedGloss += 1;
    if (pick) out.push(trimGloss(pick));
  }
  return out;
}

/** Every part-of-speech code the entry uses, in first-seen order. */
function posOf(entry) {
  const seen = [];
  for (const s of entry.sense) for (const p of s.partOfSpeech) if (!seen.includes(p)) seen.push(p);
  return seen.join(' ');
}

const commonFirst = (list) => [...list.filter((f) => f.common), ...list.filter((f) => !f.common)];

function recordFor(key, { entry, kind }, table) {
  const senses = sensesFor(entry, key, kind);
  const rec = {};
  if (kind === 'kanji') {
    const all = entry.kana.filter((k) => applies(k.appliesToKanji, key));
    const shown = all.filter((k) => !k.tags.some((t) => SKIP_KANA.has(t)));
    const r = commonFirst(shown.length ? shown : all).map((k) => k.text);
    if (r.length) rec.r = r;
  }
  rec.g = glossesOf(senses);
  rec.p = posOf(entry);
  if (kind === 'kanji' && rec.r && needsSplit(key)) rec.f = splitReading(key, rec.r[0], table);
  if (kind === 'kana') {
    const form = entry.kana.find((k) => k.text === key);
    const spellings = entry.kanji
      .filter((k) => applies(form.appliesToKanji, k.text))
      .filter((k) => !k.tags.some((t) => SKIP_KANJI.has(t)));
    const k = commonFirst(spellings).slice(0, MAX_KANJI).map((s) => s.text);
    if (k.length) rec.k = k;
  }
  if (senses[0].misc.includes('uk')) rec.u = 1;
  return rec;
}

/**
 * The JMdict order of the records under one key: spellings that are common
 * in their entry first, then, for a kana key, an entry that is itself
 * written in kana (no kanji, the reading marked nokanji, or the first sense
 * usually kana) before one whose kanji spelling is the normal one, then
 * JMdict order. Without the kana rule は led with "tooth" and いる with "to
 * shoot", because 歯 and 射る have lower sequence numbers than the particle
 * and 居る. This is the order before evidence; `byEvidence` reorders a kana
 * key's records by the corpus.
 */
function rank(f, key) {
  const common = f.common ? 0 : 1;
  if (f.kind === 'kanji') return [common, 0, f.index];
  const form = f.entry.kana.find((k) => k.text === key);
  const kanaWord = !f.entry.kanji.length || !form.appliesToKanji.length
    || sensesFor(f.entry, key, 'kana')[0].misc.includes('uk');
  return [common, kanaWord ? 0 : 1, f.index];
}

function byRank(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// ── Build ─────────────────────────────────────────────────────────────────

function collect(jmdict) {
  const forms = new Map();
  const push = (text, f) => {
    if (!forms.has(text)) forms.set(text, []);
    forms.get(text).push(f);
  };
  jmdict.words.forEach((entry, index) => {
    for (const k of entry.kanji) {
      if (k.tags.includes('sK')) continue;
      push(k.text, { entry, index, kind: 'kanji', common: k.common });
    }
    for (const k of entry.kana) {
      if (k.tags.includes('sk')) continue;
      push(k.text, { entry, index, kind: 'kana', common: k.common });
    }
  });
  const keys = new Set();
  for (const [text, list] of forms) if (list.some((f) => f.common)) keys.add(text);
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

/** A band that sorts after every real one: the key was never matched. */
const UNRANKED = 6;

/** Every spelling counts as loaded at build time: the whole dictionary is here. */
const ALL = Object.freeze({ has: () => true });

/** Each shipped kanji's kun readings, which spellingBand reads for its stem rule. */
function kunTable(kanjidic) {
  return new Map(selection(kanjidic).map((c) => [c.literal, { kun: readingsOfType(c, 'ja_kun') }]));
}

/**
 * A kana key's records in the order the corpus supports, before the cap.
 *
 * Each record is priced the way the page prices it in kana text
 * (js/spellings.js, kanaRecordPrice): the band of its own kanji spelling,
 * discounted where that band is someone else's (入る is q1 because of はいる,
 * 動 because every 動いて was counted as 動), plus COST.kanaForKanji when the
 * word is normally written in kanji. Common first, then that price, then
 * JMdict order. A kanji key keeps JMdict order: its records share one string
 * and so one count, and nothing in the corpus tells them apart.
 *
 * Before this, かく led with 掻く "to scratch" (usually kana, so first by
 * the kana-word rule) and 書く "to write", q1, was the seventh record and was
 * cut, so かきます read "to scratch".
 */
function byEvidence(key, list, dict, kanjiInfo) {
  if (list.length < 2 || !isAllKana(key)) return list;
  const hiragana = !isKatakana(key[0]);
  const price = ({ f, rec }) => {
    if (f.kind !== 'kana') return 0;
    // A word with no kanji spelling at all (the particle は, the
    // sentence-final もの) is what the kana key counted, so the key's band
    // is its own. The page prices it two bands worse, as a word with no
    // evidence of its own; a particle never reaches that price, because the
    // closed class supplies it (costs.js), so only the order here needs it.
    if (!rec.k) return bandPrice(rec.q || UNRANKED, rec);
    const spelled = hiragana && !rec.u ? COST.kanaForKanji : 0;
    return kanaRecordPrice(key, rec, dict, ALL, kanjiInfo) + spelled;
  };
  return list
    .map((x, n) => ({ x, order: [x.f.common ? 0 : 1, price(x), n] }))
    .sort((a, b) => byRank(a.order, b.order))
    .map(({ x }) => x);
}

function buildEntries(jmdict, kanjidic, bands) {
  const table = readingTable(kanjidic);
  const kanjiInfo = kunTable(kanjidic);
  const { forms, keys } = collect(jmdict);
  // Every record of every key, uncapped, in JMdict order, with its key's
  // band: the dictionary the page would have with no cap, which is what a
  // kana record's spelling is looked up in.
  const full = new Map();
  for (const key of keys) {
    const q = bands.get(key);
    const list = [];
    for (const f of [...forms.get(key)].sort((a, b) => byRank(rank(a, key), rank(b, key)))) {
      const rec = recordFor(key, f, table);
      if (!rec.g.length) { stats.emptyG += 1; continue; }
      if (q) rec.q = q;
      list.push({ f, rec });
    }
    if (list.length) full.set(key, list);
  }
  const view = new Map([...full].map(([k, list]) => [k, list.map((x) => x.rec)]));
  const dict = { get: (k) => view.get(k) };

  const entries = new Map();
  for (const [key, list] of full) {
    const ordered = byEvidence(key, list, dict, kanjiInfo);
    if (ordered.length > MAX_RECORDS) stats.capped += 1;
    entries.set(key, ordered.slice(0, MAX_RECORDS).map(({ f, rec }) => {
      const { q, ...out } = rec;
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
  return { entries, keys };
}

/**
 * Cut the sorted keys into shards of at most MAX_BYTES each. The estimate is
 * the serializer's own line for each key, so it is exact up to the header's
 * first and last fields; a shard that still comes out over is shortened one
 * key at a time until it fits, and the key moves to the next shard.
 */
function pack(sorted, entries, licence) {
  const header = Buffer.byteLength(serialize({
    _licence: licence, format: 'yomu-dict/1', first: '', last: '', entries: {},
  }));
  const lineBytes = (k) => Buffer.byteLength(`${JSON.stringify(k)}: ${JSON.stringify(entries.get(k))},\n`);
  const shards = [];
  let cur = [];
  let size = header;
  for (const k of sorted) {
    const n = lineBytes(k);
    const room = MAX_BYTES - Buffer.byteLength(JSON.stringify(cur[0] || k)) - Buffer.byteLength(JSON.stringify(k));
    if (cur.length && size + n > room) {
      shards.push(cur);
      cur = [];
      size = header;
    }
    cur.push(k);
    size += n;
  }
  if (cur.length) shards.push(cur);

  const docs = [];
  for (let i = 0; i < shards.length; i += 1) {
    const keys = shards[i];
    const make = () => ({
      _licence: licence,
      format: 'yomu-dict/1',
      first: keys[0],
      last: keys[keys.length - 1],
      entries: Object.fromEntries(keys.map((k) => [k, entries.get(k)])),
    });
    let doc = make();
    while (Buffer.byteLength(serialize(doc)) > MAX_BYTES) {
      const moved = keys.pop();
      if (i + 1 === shards.length) shards.push([]);
      shards[i + 1].unshift(moved);
      doc = make();
    }
    docs.push(doc);
  }
  return docs;
}

function main() {
  const t0 = Date.now();
  const jmdict = loadZippedJson('jmdict');
  const kanjidic = loadZippedJson('kanjidic');
  const sentences = sentencesOf(loadBz2Text('tatoebaJpn'));

  const { keys: keySet } = collect(jmdict);
  const counts = countKeys(sentences, keySet);
  const bands = bandsOf(counts);
  const { entries } = buildEntries(jmdict, kanjidic, bands);

  const sorted = [...entries.keys()].sort();
  const licence = licenceBlock('edrdg', TOOL, {
    upstream: [upstream('jmdict'), upstream('kanjidic'), upstream('tatoebaJpn')],
    inputs: [['tatoeba', 'q, a frequency band per key; no sentence ships']],
  });
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
  const maxKey = sorted.reduce((m, k) => Math.max(m, k.length), 0);
  const index = {
    _licence: licence,
    format: 'yomu-dict-index/1',
    keys: sorted.length,
    maxKey,
    shards,
  };
  const indexBytes = writeJson(path.join(OUT, 'index.json'), index, 'shards');
  const gone = pruneStale(OUT, /^w\d+\.json$/, written);

  const total = sizes.reduce((a, b) => a + b, 0);
  const records = [...entries.values()].reduce((a, r) => a + r.length, 0);
  const qs = [1, 2, 3, 4, 5].map((b) => [...bands.values()].filter((v) => v === b).length);
  const out = [
    `keys ${sorted.length} (${keySet.size} common spellings), records ${records}, maxKey ${maxKey} UTF-16 units`,
    `shards ${docs.length}: min ${fmtBytes(Math.min(...sizes))} (${Math.min(...sizes)} B), max ${fmtBytes(Math.max(...sizes))} (${Math.max(...sizes)} B), total ${fmtBytes(total)} (${total} B); index ${fmtBytes(indexBytes)}`,
    `multi-kanji keys (first record): split ${stats.split}, partly split ${stats.partial}, * ${stats.star}`,
    `x ${stats.x} keys, w ${stats.w} records, keys over ${MAX_RECORDS} records ${stats.capped}`,
    `q bands 1-5: ${qs.join(' / ')}; unranked ${sorted.length - [...bands.keys()].filter((k) => entries.has(k)).length}`,
    `senses whose first gloss was passed over (dash or banned word) ${stats.skippedGloss}; records dropped for an empty g ${stats.emptyG}`,
    gone.length ? `removed stale shards: ${gone.join(' ')}` : 'no stale shards',
    `sentences counted ${sentences.length}; wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  ];
  process.stdout.write(`${out.join('\n')}\n`);
}

main();
