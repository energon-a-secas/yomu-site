#!/usr/bin/env node
/**
 * data/es/: the Spanish meanings beside the English ones (docs/ANALYZER.md,
 * "Spanish meanings").
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-spanish.mjs   (after build-dict, build-kanji and build-kanji-page)
 *
 * It reads the committed English files and writes, for each one that holds
 * meanings, a Spanish counterpart at the same path under data/es/
 * (js/es-files.js esSrc), so the page and the app find a file's Spanish with
 * no index, and a reader in English never fetches one:
 *
 *   data/es/dict/<file>  `yomu-dict-es/1`, for the core, every first-tier
 *       range shard and every second-tier shard: per key, the Spanish of
 *       each record in the English file's order, 0 for a record whose entry
 *       has none (trailing ones dropped, a key with none left out). Records
 *       carry no JMdict id, so each is matched to its entry by building it
 *       again with tools/lib/records.mjs recordFor from every entry spelled
 *       with its key, as tools/build-dict.mjs built it.
 *   data/es/kanji/kNN.json  `yomu-kanji-es/1`: each character's Spanish meanings.
 *   data/es/kpage/pNN.json  `yomu-kpage-es/1`: per page, the Spanish of each
 *       word of `w` (0 for none): the first Spanish meaning of the word's
 *       first record, as its English gloss is that record's first gloss.
 *   data/es/kpage/daily.json  `yomu-daily-es/1`: the kanji of the day, row
 *       for row, [its first two Spanish meanings, its word's Spanish], null
 *       for either where there is none.
 *
 * The Spanish of an entry is JMdict's (tools/lib/spanish.mjs spanishGlosses),
 * or the meanings tools/lib/spanish-words.mjs writes for a few common ones.
 * Every file names the English file it mirrors and the digest of its body
 * (`of`), and tools/check-data.mjs fails one whose English file has moved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadZippedJson, upstream } from './lib/sources.mjs';
import { licenceBlock, EM_DASH } from './lib/licence.mjs';
import { writeJson, SITE, fmtBytes, pruneStale } from './lib/emit.mjs';
import { recordFor } from './lib/records.mjs';
import { readingTable } from './lib/split.mjs';
import {
  ES_DICT, ES_KANJI, ES_KPAGE, ES_DAILY, MAX_ES, MAX_ES_CHARS,
  esSrc, spanishGlosses, spanishMeanings, bodyDigest,
} from './lib/spanish.mjs';
import { WORDS, CORRECTIONS } from './lib/spanish-words.mjs';
import { toKata } from '../js/kana.js';

const TOOL = 'tools/build-spanish.mjs';
const read = (src) => JSON.parse(fs.readFileSync(path.join(SITE, src), 'utf8'));
const die = (why) => { process.stderr.write(`build-spanish: ${why}\n`); process.exit(1); };

// ── Which entry each record came from ─────────────────────────────────────

/**
 * A function from (key, its records) to the JMdict ids they were built
 * from. A record is rebuilt from each entry that has the key as a spelling
 * (a first-tier katakana fold, アメ色, from the spelling it folds, あめ色)
 * and compared on what identifies it; two entries that build the same
 * record are handed out in JMdict order, one to each.
 */
function matcher(words, table) {
  const spell = new Map();
  const fold = new Map();
  const add = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  words.forEach((entry, index) => {
    for (const k of entry.kanji) {
      add(spell, k.text, { index, kind: 'kanji', spelling: k.text });
      const f = toKata(k.text);
      if (f !== k.text) add(fold, f, { index, kind: 'kanji', spelling: k.text });
    }
    for (const k of entry.kana) add(spell, k.text, { index, kind: 'kana', spelling: k.text });
  });
  const sig = (r) => JSON.stringify([r.g, r.p, r.r || null, r.k || null, r.u || 0, r.ls || null, r.ws || 0]);
  const built = new Map();
  const sigOf = (c) => {
    const id = `${c.index}\t${c.kind}\t${c.spelling}`;
    if (!built.has(id)) built.set(id, sig(recordFor(c.spelling, { entry: words[c.index], kind: c.kind }, table)));
    return built.get(id);
  };
  const stats = { records: 0, folded: 0, shared: 0 };
  function idsOf(key, recs) {
    const used = new Set();
    return recs.map((rec) => {
      stats.records += 1;
      const want = sig(rec);
      let hits = (spell.get(key) || []).filter((c) => sigOf(c) === want);
      if (!hits.length) {
        hits = (fold.get(key) || []).filter((c) => sigOf(c) === want);
        if (hits.length) stats.folded += 1;
      }
      if (!hits.length) die(`${key}: a record no JMdict entry builds (${want}); was data/dict built from another JMdict?`);
      const found = [...new Set(hits.map((h) => h.index))];
      if (found.length > 1) stats.shared += 1;
      const pick = found.find((i) => !used.has(i)) ?? found[0];
      used.add(pick);
      return words[pick].id;
    });
  }
  return { idsOf, stats };
}

// ── The Spanish of each entry ─────────────────────────────────────────────

/** JMdict's Spanish per entry id, with the authored meanings applied, each row checked. */
function spanishOf(spa, byId) {
  const out = new Map();
  for (const entry of spa.words) {
    const g = spanishGlosses(entry);
    if (g.length) out.set(entry.id, g);
  }
  const upstreamCount = out.size;
  const check = ([id, word, meanings], list) => {
    const entry = byId.get(id);
    if (!entry) die(`${list} ${id} ${word}: JMdict has no such entry`);
    const spelled = String(word).split(' ')[0];
    if (![...entry.kanji, ...entry.kana].some((k) => k.text === spelled)) die(`${list} ${id}: ${word} is not one of its spellings`);
    const bad = !Array.isArray(meanings) || !meanings.length || meanings.length > MAX_ES
      || meanings.some((m) => typeof m !== 'string' || !m.trim() || m.length > MAX_ES_CHARS || m.includes(EM_DASH));
    if (bad) die(`${list} ${id} ${word}: one to ${MAX_ES} meanings of at most ${MAX_ES_CHARS} characters, no em dash`);
  };
  for (const row of WORDS) {
    check(row, 'WORDS');
    if (out.has(row[0])) die(`WORDS ${row[0]} ${row[1]}: JMdict has Spanish for it, so a replacement belongs in CORRECTIONS`);
    out.set(row[0], [...row[2]]);
  }
  for (const row of CORRECTIONS) {
    check(row, 'CORRECTIONS');
    if (!out.has(row[0])) die(`CORRECTIONS ${row[0]} ${row[1]}: JMdict has no Spanish for it, so it belongs in WORDS`);
    out.set(row[0], [...row[2]]);
  }
  return { es: out, upstreamCount };
}

// ── Writing ───────────────────────────────────────────────────────────────

/** Write a Spanish file beside the English file `src`; its size in bytes. */
function emit(src, english, format, licence, body, rows = 'entries') {
  const doc = { _licence: licence, format, of: { src, sha256: bodyDigest(english) }, [rows]: body };
  return writeJson(path.join(SITE, esSrc(src)), doc, rows);
}

/** Drop trailing 0s; null when nothing is left. */
function trimmed(list) {
  let n = list.length;
  while (n && list[n - 1] === 0) n -= 1;
  return n ? list.slice(0, n) : null;
}

function buildDict(es, idsOf, licence) {
  const first = read('data/dict/index.json');
  const rare = read('data/dict/rare.json');
  const files = [
    ...[first.core.src, ...first.shards.map((s) => s.src)].map((src) => ({ src, tier: 1 })),
    ...rare.shards.map((s) => ({ src: s.src, tier: 2 })),
  ];
  const firstTier = new Map(); // key -> ids, for the kanji page words
  const n = { files: 0, bytes: [0, 0], keys: [0, 0], withEs: [0, 0], records: [0, 0], recordsEs: [0, 0] };
  for (const { src, tier } of files) {
    const doc = read(src);
    const body = {};
    for (const [key, recs] of Object.entries(doc.entries)) {
      const ids = idsOf(key, recs);
      if (tier === 1) firstTier.set(key, ids);
      const list = trimmed(ids.map((id) => es.get(id) || 0));
      n.keys[tier - 1] += 1;
      n.records[tier - 1] += recs.length;
      if (!list) continue;
      body[key] = list;
      n.withEs[tier - 1] += 1;
      n.recordsEs[tier - 1] += list.filter(Boolean).length;
    }
    n.bytes[tier - 1] += emit(src, doc, ES_DICT, licence, body);
    n.files += 1;
  }
  const gone = pruneStale(path.join(SITE, 'data/es/dict'), /\.json$/, files.map((f) => path.join(SITE, esSrc(f.src))));
  return { firstTier, n, gone };
}

function buildKanji(characters, licence) {
  const index = read('data/kanji/index.json');
  const n = { chars: 0, withEs: 0, bytes: 0 };
  const written = [];
  for (const s of index.shards) {
    const doc = read(s.src);
    const body = {};
    for (const ch of Object.keys(doc.entries)) {
      n.chars += 1;
      const m = characters.has(ch) ? spanishMeanings(characters.get(ch)) : [];
      if (m.length) { body[ch] = m; n.withEs += 1; }
    }
    n.bytes += emit(s.src, doc, ES_KANJI, licence, body);
    written.push(path.join(SITE, esSrc(s.src)));
  }
  const gone = pruneStale(path.join(SITE, 'data/es/kanji'), /^k\d+\.json$/, written);
  return { n, gone };
}

function buildPages(firstEs, characters, licence) {
  const index = read('data/kpage/index.json');
  const n = { words: 0, withEs: 0, bytes: 0, daily: 0, dailyMeaning: 0, dailyGloss: 0 };
  const written = [];
  for (const s of index.shards) {
    const doc = read(s.src);
    const body = {};
    for (const [ch, page] of Object.entries(doc.entries)) {
      if (!Array.isArray(page.w)) continue;
      n.words += page.w.length;
      const list = trimmed(page.w.map(([written]) => firstEs(written) || 0));
      if (!list) continue;
      body[ch] = list;
      n.withEs += list.filter(Boolean).length;
    }
    n.bytes += emit(s.src, doc, ES_KPAGE, licence, body);
    written.push(path.join(SITE, esSrc(s.src)));
  }
  const daily = read('data/kpage/daily.json');
  const rows = daily.rows.map(([ch, , written]) => {
    const m = characters.has(ch) ? spanishMeanings(characters.get(ch)).slice(0, 2).join(', ') : '';
    const g = firstEs(written);
    n.daily += 1;
    if (m) n.dailyMeaning += 1;
    if (g) n.dailyGloss += 1;
    return [m || null, g || null];
  });
  n.bytes += emit('data/kpage/daily.json', daily, ES_DAILY, licence, rows, 'rows');
  written.push(path.join(SITE, esSrc('data/kpage/daily.json')));
  const gone = pruneStale(path.join(SITE, 'data/es/kpage'), /\.json$/, written);
  return { n, gone };
}

const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;

function main() {
  const t0 = Date.now();
  const eng = loadZippedJson('jmdictFull');
  const spa = loadZippedJson('jmdictSpa');
  const kd = loadZippedJson('kanjidicAll');
  const byId = new Map(eng.words.map((e) => [e.id, e]));
  const { es, upstreamCount } = spanishOf(spa, byId);
  const { idsOf, stats } = matcher(eng.words, readingTable(kd));
  const characters = new Map(kd.characters.map((c) => [c.literal, c]));

  const sources = [upstream('jmdictSpa'), upstream('kanjidicAll'), upstream('jmdictFull')];
  const authored = {
    id: 'authored',
    source: 'Written for Yomu: the Spanish meanings in tools/lib/spanish-words.mjs',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    spdx: 'CC0-1.0',
    screen: 'none',
    use: 'the Spanish of a few common words JMdict has none of, or has in error',
  };
  // The meanings written for Yomu are an input of every file that can hold
  // one; the kanji's Spanish is KANJIDIC's alone.
  const { generated_by: by, generated_at: at, ...head } = licenceBlock('edrdgSpanish', TOOL, { upstream: sources });
  const wordsLicence = { ...head, inputs: [authored], generated_by: by, generated_at: at };
  const kanjiLicence = licenceBlock('edrdgSpanish', TOOL, { upstream: [upstream('kanjidicAll')] });

  const dict = buildDict(es, idsOf, wordsLicence);
  const firstEs = (key) => {
    const ids = dict.firstTier.get(key);
    const g = ids && es.get(ids[0]);
    return g ? g[0] : null;
  };
  const kanji = buildKanji(characters, kanjiLicence);
  const pages = buildPages(firstEs, characters, wordsLicence);

  const d = dict.n;
  const gone = [...dict.gone, ...kanji.gone, ...pages.gone];
  const lines = [
    `entries with Spanish: ${upstreamCount} from JMdict, ${WORDS.length} written for Yomu, ${CORRECTIONS.length} corrected`,
    `records matched to their entries: ${stats.records} (${stats.folded} through a katakana fold, ${stats.shared} built alike by two entries)`,
    `first tier: ${d.withEs[0]} of ${d.keys[0]} keys (${pct(d.withEs[0], d.keys[0])}), ${d.recordsEs[0]} of ${d.records[0]} records (${pct(d.recordsEs[0], d.records[0])}), ${fmtBytes(d.bytes[0])}`,
    `second tier: ${d.withEs[1]} of ${d.keys[1]} keys (${pct(d.withEs[1], d.keys[1])}), ${d.recordsEs[1]} of ${d.records[1]} records (${pct(d.recordsEs[1], d.records[1])}), ${fmtBytes(d.bytes[1])}`,
    `kanji: ${kanji.n.withEs} of ${kanji.n.chars} with Spanish (${pct(kanji.n.withEs, kanji.n.chars)}), ${fmtBytes(kanji.n.bytes)}`,
    `kanji pages: ${pages.n.withEs} of ${pages.n.words} words with Spanish (${pct(pages.n.withEs, pages.n.words)}); kanji of the day: ${pages.n.dailyMeaning} of ${pages.n.daily} meanings, ${pages.n.dailyGloss} words; ${fmtBytes(pages.n.bytes)}`,
    `files: ${d.files} dictionary, total ${fmtBytes(d.bytes[0] + d.bytes[1] + kanji.n.bytes + pages.n.bytes)}`,
    gone.length ? `removed stale files: ${gone.join(' ')}` : 'no stale files',
    `wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
