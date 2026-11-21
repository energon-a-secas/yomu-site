#!/usr/bin/env node
/**
 * What a recording run of the corpus kind (tools/lib/audio-script.mjs
 * corpusLines) would add to the reader's word by word, measured on the
 * example sentences that did not choose its words.
 *
 *   node tools/measure-audio-corpus.mjs                      the limits 500, 1000 and 2000
 *   node tools/measure-audio-corpus.mjs --limits=300,3000    other limits
 *
 * The corpus kind ranks its words on the sentences with an even Tatoeba id
 * (isRankingSentence); this reads the odd ones, the held-out half, word by
 * word as Naninani plays them in Clear: every token but punctuation and
 * spacing is a spoken word, found by its keys in order (spokenWord, the
 * app's Speech.spokenWord, written() and bridge keysFor), and it has a
 * recording when Clear holds a clip under any of them (js/audio.js
 * clipInVoice; Clear is the index's first voice, so wordSequence tries no
 * other). A sentence is recorded from start to finish when all its spoken
 * words are.
 *
 * "After N" files the keys of the first N corpus lines with no Clear clip,
 * which is what `build-audio.mjs --kinds=corpus --limit=N` makes, as if
 * every take passed its check: an upper bound, since about 3 in 100 common
 * words did not (docs/AUDIO.md). The last row is every such line, the most
 * this kind can add as it is built. It also says why the words with no clip
 * have none: a key another kind holds (its line rejected, or not recorded
 * yet, from tools/audio-made.json); a key a corpus line holds, so a run
 * would record it; a token the kind leaves out (corpusLeftOut: a name, a
 * number, a Latin word, a particle in kana, a guess); or a word the ranking
 * half never met, which no corpus line holds. It reads the committed data/,
 * data/audio/, tools/audio-made.json and tools/audio-corpus.json only; it
 * calls nothing, spends nothing and writes no file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createDict } from '../js/dict.js';
import { analyze } from '../js/analyze.js';
import { normalizeAudio, addShard, clipInVoice } from '../js/audio.js';
import { SITE } from './lib/emit.mjs';
import { fullScript, corpusSentences, isRankingSentence, spokenWord, corpusLeftOut } from './lib/audio-script.mjs';
import { madeKey } from './lib/audio-heard.mjs';

const DATA = path.join(SITE, 'data');
const LAYOUT = new Set(['punct', 'space', 'newline']);
const VOICE = 'clear';

function args(argv) {
  let limits = [500, 1000, 2000];
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'limits') limits = v.split(',').map(Number);
    else throw new Error(`unknown option ${a}`);
  }
  if (!limits.every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error('--limits takes positive whole numbers');
  return { limits };
}

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(SITE, rel), 'utf8'));

/** The index with every shard loaded, as the app holds it once it has asked for them all. */
function loadAudio() {
  const audio = normalizeAudio(readJson('data/audio/index.json'));
  audio.srcs.forEach((src, n) => addShard(audio, n, readJson(src)));
  return audio;
}

const pct = (n, of) => `${((100 * n) / of).toFixed(2)}%`;
const fmt = (n) => n.toLocaleString('en-US');
const times = (n) => (n === 1 ? 'once' : `${n} times`);

async function main() {
  const { limits } = args(process.argv.slice(2));
  const library = JSON.parse(fs.readFileSync(path.join(DATA, 'phrases', 'library.json'), 'utf8'));
  const dict = createDict({ fetchJson: async (p) => JSON.parse(fs.readFileSync(p, 'utf8')), base: `${DATA}/` });
  const script = await fullScript({ library, dict, dataDir: DATA });
  const audio = loadAudio();
  const recorded = (keys) => !!clipInVoice(audio, keys, VOICE);
  const corpus = script.filter((l) => l.kind === 'corpus');
  const toMake = corpus.filter((l) => !recorded(l.keys));
  // The line of another kind each key belongs to: a held-out word that finds
  // one of them but no clip is left to that kind (rejected, or not recorded
  // yet), never to this one.
  const made = readJson('tools/audio-made.json');
  const owner = new Map();
  for (const l of script) if (l.kind !== 'corpus') for (const k of l.keys) if (!owner.has(k)) owner.set(k, l);
  // The corpus line that would record a key, by its rank among those to make.
  const rank = new Map();
  toMake.forEach((l, n) => { for (const k of l.keys) if (!rank.has(k)) rank.set(k, n); });
  const widest = Math.max(...limits);

  const whose = (keys, left) => {
    const line = keys.map((k) => owner.get(k)).find(Boolean);
    if (line) return `${line.kind}${line.kind === 'common' ? ` ${line.band}` : ''}, ${made[madeKey(VOICE, line.id)] ? 'rejected' : 'not recorded yet'}`;
    const at = Math.min(...keys.map((k) => rank.get(k) ?? Infinity));
    if (at < Infinity) return `this kind, a line ranked ${at < widest ? `in the first ${fmt(widest)}` : `after the first ${fmt(widest)}`}`;
    if (left) return `left out by this kind: ${left}`;
    return 'this kind could take it, but the ranking half never met it';
  };

  const held = corpusSentences(DATA).filter((s) => !isRankingSentence(s.id));
  const sentences = [];
  const why = new Map();
  let withName = 0;
  for (const s of held) {
    const a = await analyze(s.ja, { dict });
    const spoken = a.tokens.filter((t) => !LAYOUT.has(t.kind));
    sentences.push(spoken.map((t) => spokenWord(t).keys));
    let named = false;
    for (const t of spoken) {
      const keys = spokenWord(t).keys;
      if (recorded(keys)) continue;
      const left = corpusLeftOut(t, s.en);
      named ||= left === 'a name';
      const reason = whose(keys, left);
      why.set(reason, (why.get(reason) || 0) + 1);
    }
    if (named) withName += 1;
  }
  const tokens = sentences.reduce((n, ws) => n + ws.length, 0);

  const measure = (added) => {
    let words = 0;
    let whole = 0;
    for (const ws of sentences) {
      const have = ws.filter((keys) => recorded(keys) || keys.some((k) => added.has(k))).length;
      words += have;
      if (have === ws.length) whole += 1;
    }
    return { words, whole };
  };

  const before = measure(new Set());
  console.log(`measure-audio-corpus: ${fmt(corpus.length)} corpus lines from ${fmt(corpusSentences(DATA).length - held.length)} ranking sentences (even ids), ${fmt(toMake.length)} with no Clear clip`);
  console.log(`  held out: ${fmt(held.length)} sentences (odd ids), ${fmt(tokens)} spoken words`);
  console.log(`  before:      words ${pct(before.words, tokens)} (${fmt(before.words)}), whole sentences ${pct(before.whole, held.length)} (${fmt(before.whole)})`);
  console.log(`  the ${fmt(tokens - before.words)} words with no clip, by whose they are:`);
  for (const [reason, n] of [...why].sort((a, b) => b[1] - a[1])) console.log(`    ${reason}: ${fmt(n)}`);
  console.log(`  ${fmt(withName)} held-out sentences (${pct(withName, held.length)}) hold a name with no clip, so none of them is recorded whole`);
  const rows = [...limits.filter((n) => n < toMake.length), toMake.length];
  for (const n of rows) {
    const lines = toMake.slice(0, n);
    const after = measure(new Set(lines.flatMap((l) => l.keys)));
    const chars = lines.reduce((sum, l) => sum + [...l.tts].length, 0);
    console.log(`  after ${n === toMake.length ? `every line (${fmt(n)})` : String(n).padStart(5)}: words ${pct(after.words, tokens)} (+${((100 * (after.words - before.words)) / tokens).toFixed(2)} pp, ${fmt(after.words - before.words)} more), whole sentences ${pct(after.whole, held.length)} (+${((100 * (after.whole - before.whole)) / held.length).toFixed(2)} pp, ${fmt(after.whole - before.whole)} more); ${fmt(lines.length)} clips, ${fmt(chars)} characters, words met ${times(lines.length ? lines[lines.length - 1].count : 0)} or more`);
  }
}

main().catch((err) => { console.error(`measure-audio-corpus: ${err.message}`); process.exit(1); });
