#!/usr/bin/env node
/**
 * data/sent/sNN.json, `yomu-sentences/1`: up to PER_WORD example sentences
 * for each first-tier word, from the Tatoeba Project, each with its English
 * translation and where the word sits in it; and data/sent/more/mNN.json,
 * `yomu-sentences-more/1`, up to MORE after those, which the Word panel
 * fetches only when the learner asks for more examples.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-sentences.mjs        (after build-dict; about 5 minutes)
 *
 * Which sentences: every Japanese sentence of at most MAX_CHARS characters
 * that Tatoeba links to an English translation is read by the analyzer, so a
 * sentence is filed under the word the reader would show for it, by its
 * dictionary form and reading: 食べました is an example of 食べる, and 方 read
 * かた and 方 read ほう get examples of their own. A sentence with a guessed
 * token is left out (its reading may be wrong), and so is one whose English
 * touches a topic in AVOID, or that holds a character the data rules refuse.
 *
 * Which ones a word keeps: the easiest, scored by how far the length is from
 * IDEAL_CHARS (a one-word sentence teaches little) and by how rare the other
 * words in it are (a record's `q` band, a rare word worst), a different form
 * of the word in each where there is one, and never two that differ only in
 * punctuation. A token whose key has other records (`alts`) files nothing:
 * the analyzer cannot always tell 方 かた from 方 ほう, and an example must not
 * teach the wrong reading.
 *
 * Each sentence ships as [Tatoeba id, Japanese, English, start, end]: the
 * Japanese as the analyzer normalized it, so `start` and `end` (UTF-16
 * offsets) are where the word is in it. The page links every sentence to its
 * page on tatoeba.org, which is the attribution CC BY 2.0 FR asks for.
 *
 * Keyed like data/spell: each key maps to [[reading, sentences, more?], ...],
 * `more` how many sentences data/sent/more/ holds for that reading, left out
 * when it holds none. The more shards map a key to [[reading, sentences], ...]
 * for the readings that have them. The first PER_WORD are chosen exactly as
 * they were before the more shards existed; the rest come from what is left,
 * a form of the word not shown yet first. Measured 2026-10-16 at ten: 8,425
 * of 13,475 rows had more than three sentences to offer, and the shards grew
 * from 3,846 KB to 8,747 KB, which every Word panel would then fetch from at
 * half the keys a shard; behind More, a panel fetches what it did before.
 * Range shards by key, in plain JS string order.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBz2Text, upstream } from './lib/sources.mjs';
import { licenceBlock, EM_DASH, unshippable } from './lib/licence.mjs';
import { sentenceRows } from './lib/original.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';
import { createDict } from '../js/dict.js';
import { analyze, normalize } from '../js/analyze.js';
import { baseReading } from '../js/conjugate.js';
import { AVOID } from './lib/avoid.mjs';

const TOOL = 'tools/build-sentences.mjs';
const DATA = path.join(SITE, 'data');
const OUT = path.join(DATA, 'sent');
const MAX_CHARS = 30;
const MAX_ENGLISH = 140;
const IDEAL_CHARS = 10;

/** A sentence without its punctuation: 水をくれ! and 水をくれ。 are one example. */
const bare = (t) => t.replace(/[\p{P}\s]/gu, '');
export const PER_WORD = 3;
export const MORE = 7;

const LEXICAL = new Set(['word', 'inflected']);

const cells = (c) => [c.id, c.text, c.en, c.start, c.end];

/**
 * Up to `n` of `list` (sorted easiest first) not in `taken`: a form of the
 * word not shown yet first, then the easiest of what is left, never two that
 * differ only in punctuation, easiest first. With nothing taken this is the
 * choice the shards made before the more shards existed.
 */
function pick(list, n, taken) {
  const picked = [];
  const forms = new Set(taken.map((c) => c.surface));
  const twin = (c) => [...taken, ...picked].some((p) => bare(p.text) === bare(c.text));
  for (const c of list) {
    if (picked.length >= n) break;
    if (!taken.includes(c) && !forms.has(c.surface) && !twin(c)) { picked.push(c); forms.add(c.surface); }
  }
  for (const c of list) {
    if (picked.length >= n) break;
    if (!taken.includes(c) && !picked.includes(c) && !twin(c)) picked.push(c);
  }
  return picked.sort((x, y) => x.score - y.score);
}

/** Range shards of `map` under `dir` (`${prefix}NNN.json`) and their index; returns the counts. */
function writeShards(dir, published, prefix, format, map, licence) {
  const keys = [...map.keys()].sort();
  const header = Buffer.byteLength(serialize({ _licence: licence, format: `${format}/1`, first: keys[0], entries: {} }));
  const groups = [];
  let cur = [];
  let size = header;
  for (const k of keys) {
    const n = Buffer.byteLength(`${JSON.stringify(k)}: ${JSON.stringify(map.get(k))},\n`);
    if (cur.length && size + n > MAX_BYTES - 64) { groups.push(cur); cur = []; size = header; }
    cur.push(k);
    size += n;
  }
  if (cur.length) groups.push(cur);
  const written = [];
  let bytes = 0;
  const shards = groups.map((list, i) => {
    const name = `${prefix}${String(i).padStart(3, '0')}.json`;
    const doc = { _licence: licence, format: `${format}/1`, first: list[0], entries: Object.fromEntries(list.map((k) => [k, map.get(k)])) };
    bytes += writeJson(path.join(dir, name), doc);
    written.push(path.join(dir, name));
    return { src: `${published}/${name}`, first: list[0] };
  });
  writeJson(path.join(dir, 'index.json'), {
    _licence: licence, format: `${format}-index/1`, keys: keys.length, maxKey: Math.max(...keys.map((k) => k.length)), shards,
  }, 'shards');
  const gone = pruneStale(dir, new RegExp(`^${prefix}\\d+\\.json$`), written);
  return { keys: keys.length, shards: shards.length, bytes, gone: gone.length };
}

function englishFor(ids, links, englishTsv) {
  const linked = new Map();
  for (const line of links.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const j = line.slice(0, tab);
    if (!ids.has(j)) continue;
    if (!linked.has(j)) linked.set(j, []);
    linked.get(j).push(line.slice(tab + 1).trim());
  }
  const wanted = new Set([...linked.values()].flat());
  const text = new Map();
  for (const [id, t] of sentenceRows(englishTsv)) if (wanted.has(id)) text.set(id, t);
  const out = new Map();
  for (const [j, eids] of linked) {
    // The shortest translation reads best beside a short sentence.
    const lines = eids.map((e) => text.get(e)).filter(Boolean).sort((a, b) => a.length - b.length);
    if (lines.length) out.set(j, lines[0]);
  }
  return out;
}

function shippable(s) {
  return !s.includes(EM_DASH) && !unshippable(s);
}

async function main() {
  const t0 = Date.now();
  const japanese = sentenceRows(loadBz2Text('tatoebaJpn'))
    .filter(([, t]) => [...t].length <= MAX_CHARS && shippable(t));
  const english = englishFor(new Set(japanese.map(([id]) => id)), loadBz2Text('tatoebaJpnEng'), loadBz2Text('tatoebaEng'));
  const dict = createDict({ fetchJson: async (p) => JSON.parse(fs.readFileSync(p, 'utf8')), base: `${DATA}/` });

  const by = new Map(); // key -> Map(reading -> candidates)
  const stats = { read: 0, guessed: 0, avoided: 0 };
  for (const [id, raw] of japanese) {
    const en = english.get(id);
    if (!en || en.length > MAX_ENGLISH || !shippable(en)) continue;
    if (AVOID.test(en)) { stats.avoided += 1; continue; }
    const text = normalize(raw);
    const a = await analyze(text, { dict });
    stats.read += 1;
    const tokens = a.tokens;
    if (tokens.some((t) => t.confidence === 'guess' || t.kind === 'unknown')) { stats.guessed += 1; continue; }
    const lexical = tokens.filter((t) => LEXICAL.has(t.kind) && t.entry);
    // How hard the rest of the sentence is: rare words cost most.
    const hardness = lexical.reduce((n, t) => n + (t.entry.tier === 2 ? 6 : Math.max(0, (t.entry.q || 6) - 2)), 0);
    // About ten characters reads best: 食べた。 alone teaches little, a long line too much.
    const score = Math.abs([...text].length - IDEAL_CHARS) + 2 * hardness;
    for (const t of lexical) {
      if (t.entry.tier === 2) continue;
      // A key with other records may be read the wrong way (方 read かた where
      // the sentence says ほう: 赤の方が好き), and an example must not teach that.
      if (t.alts > 0) continue;
      const key = t.base || t.surface;
      const reading = baseReading(t);
      if (!key || !reading) continue;
      if (!by.has(key)) by.set(key, new Map());
      const m = by.get(key);
      if (!m.has(reading)) m.set(reading, []);
      m.get(reading).push({ id, text, en, start: t.start, end: t.end, surface: t.surface, score });
    }
  }

  const out = new Map();
  const more = new Map();
  // How many different sentences each word and reading had to choose from
  const offered = new Map();
  for (const [key, readings] of by) {
    const rows = [];
    const extra = [];
    for (const [reading, list] of readings) {
      const n = new Set(list.map((c) => bare(c.text))).size;
      const bucket = n >= 10 ? '10+' : String(n);
      offered.set(bucket, (offered.get(bucket) || 0) + 1);
      list.sort((x, y) => x.score - y.score || Number(x.id) - Number(y.id));
      const shown = pick(list, PER_WORD, []);
      const after = pick(list, MORE, shown);
      const row = [reading, shown.map(cells)];
      if (after.length) {
        row.push(after.length);
        extra.push([reading, after.map(cells)]);
      }
      rows.push(row);
    }
    out.set(key, rows);
    if (extra.length) more.set(key, extra);
  }

  const licence = licenceBlock('tatoebaSentences', TOOL, {
    upstream: [upstream('tatoebaJpn'), upstream('tatoebaEng'), upstream('tatoebaJpnEng')],
  });
  const main = writeShards(OUT, 'data/sent', 's', 'yomu-sentences', out, licence);
  fs.mkdirSync(path.join(OUT, 'more'), { recursive: true });
  const extra = writeShards(path.join(OUT, 'more'), 'data/sent/more', 'm', 'yomu-sentences-more', more, licence);
  process.stdout.write([
    `sentences: ${japanese.length} short sentences, ${stats.read} read, ${stats.guessed} left out for a guess, ${stats.avoided} for their topic`,
    `words: ${main.keys} keys in ${main.shards} shards, ${fmtBytes(main.bytes)}${main.gone ? `; removed ${main.gone} stale` : ''}`,
    `more: ${extra.keys} keys in ${extra.shards} shards, ${fmtBytes(extra.bytes)}${extra.gone ? `; removed ${extra.gone} stale` : ''}`,
    `up to ${PER_WORD} a word and reading, then up to ${MORE} behind More; rows by the sentences offered: ${[...offered].sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10)).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
    `wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  ].join('\n') + '\n');
}

main();
