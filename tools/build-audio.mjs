#!/usr/bin/env node
// Records Yomu's own text with ElevenLabs: the sound notes, every beat, the
// phrase library and the notes' examples, every word of that text, and the
// dictionary's most common words (tools/lib/audio-script.mjs), in the voices
// of tools/lib/audio-voices.mjs. docs/AUDIO.md is the account.
//
// THIS IS A MANUAL DATA STEP, NOT A BUILD. It spends credits from the owner's
// ElevenLabs plan, so it makes only what is missing or changed, and stops at
// --budget. The key is read from ELEVENLABS_API_TOKEN (or _KEY), in the
// environment or the repo's .env, which git ignores.
//
//   node tools/build-audio.mjs --dry-run           what would be made, and roughly what it costs
//   node tools/build-audio.mjs --budget=3000       make it, spending at most 3,000 credits
//     --voices=clear,calm   only these roles
//     --kinds=sound,kana    only these parts of the script
//     --limit=20            at most this many clips (a trial run)
//     --retry-failed        try again the clips that failed their check
//
// Every clip is transcribed and the transcript read by the analyzer
// (tools/lib/audio-check.mjs). A clip that does not say what Yomu shows is
// made again with another seed, then from its kana reading; one that never
// passes is left out of the index, so the page says that text with the
// device's voice, or borrows Clear's, rather than teach a wrong sound. The
// last take of each is kept in .forge/audio-rejects/ to be listened to.
//
// Writes data/audio/<voice>/<id>.mp3, data/audio/index.json and its key
// shards data/audio/kNN.json, and tools/audio-made.json, the record of what
// was sent, heard and kept.

import fs from 'node:fs';
import path from 'node:path';
import { createDict } from '../js/dict.js';
import { analyze } from '../js/analyze.js';
import { hasKanji, toHira } from '../js/kana.js';
import { cyrb53 } from '../js/history-text.js';
import { AUDIO_FORMAT, CLIPS_FORMAT, AUDIO_DIR, SILENCE_SRC, audioKey } from '../js/audio.js';
import { SITE } from './lib/emit.mjs';
import { licenceBlock } from './lib/licence.mjs';
import { apiKey, call, ApiError } from './lib/elevenlabs.mjs';
import { fullScript, beatAliases, KINDS } from './lib/audio-script.mjs';
import { makeCheck } from './lib/audio-check.mjs';
import { finish, triple, silence } from './lib/audio-finish.mjs';
import { VOICES, MODEL, RAW_FORMAT, STT_MODEL } from './lib/audio-voices.mjs';

const DATA = path.join(SITE, 'data');
const OUT = path.join(DATA, 'audio');
const MADE = path.join(SITE, 'tools', 'audio-made.json');
const REJECTS = path.join(SITE, '.forge', 'audio-rejects');
// Bump when finish() changes what a clip sounds like, so every clip is remade.
const FINISH_VERSION = 1;
// Credits per character, measured on eleven_v4 for Japanese (11 characters
// cost 5); only the dry run's estimate uses it, the real cost is counted.
const EST_PER_CHAR = 0.5;
// Never spend the plan below this, whatever --budget says.
const RESERVE = 2000;
const PARALLEL = 3;
const ATTEMPTS = 3;
// A key shard stays well under check-data's 140,000-byte cap.
const SHARD_BYTES = 110000;

function args(argv) {
  const out = { dryRun: false, budget: 0, voices: VOICES.map((v) => v.id), kinds: [...KINDS], limit: Infinity, retryFailed: false };
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'dry-run') out.dryRun = true;
    else if (k === 'budget') out.budget = Number(v);
    else if (k === 'voices') out.voices = v.split(',');
    else if (k === 'kinds') out.kinds = v.split(',');
    else if (k === 'limit') out.limit = Number(v);
    else if (k === 'retry-failed') out.retryFailed = true;
    else throw new Error(`unknown option ${a}`);
  }
  for (const v of out.voices) if (!VOICES.some((x) => x.id === v)) throw new Error(`unknown voice ${v}`);
  for (const k of out.kinds) if (!KINDS.includes(k)) throw new Error(`unknown kind ${k}`);
  return out;
}

const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
const clipPath = (voice, id) => path.join(OUT, voice, `${id}.mp3`);
const madeKey = (voice, id) => `${voice}/${id}`;
const isWord = (line) => line.kind === 'word' || line.kind === 'common';
const voicesOf = (line) => VOICES.filter((v) => !line.voices || line.voices.includes(v.id));

/** What a clip is made from; a change to any of it remakes the clip. */
function signature(voice, line) {
  return cyrb53(JSON.stringify([voice.voiceId, MODEL, 1, line.send, FINISH_VERSION])).toString(36);
}

const LAYOUT = new Set(['punct', 'space', 'newline']);

/**
 * What is sent for a text: its kanji, which give the voice its intonation,
 * except a word whose own dictionary entry has more than one reading (今日
 * is きょう or こんにち, 明日 あした or あす) and a number with its counter
 * (七時 しちじ, never ななじ), which go as the reading Yomu shows. A
 * transcript cannot tell those apart: both readings come back as the same
 * kanji. Where the choice is between two words (字, じ or あざ), the voice
 * reads the kanji from context, as a reader does; measured 2026-10-16, 48 of
 * the script's lines send at least one word in kana. A word line has made
 * that choice already (audio-script.mjs wordTts).
 */
async function sendText(text, dict) {
  if (!hasKanji(text)) return text;
  const a = await analyze(text, { dict });
  return a.tokens.map((t) => {
    if (LAYOUT.has(t.kind) || !hasKanji(t.surface)) return t.surface;
    const readings = new Set(((t.entry && t.entry.r) || []).map(toHira));
    return t.kind === 'number' || readings.size > 1 ? toHira(t.reading || t.surface) : t.surface;
  }).join('');
}

// A retry round takes seeds after the ones every earlier round used, so it can
// make takes the earlier ones did not.
const seedFor = (voice, line, take) => (cyrb53(`${voice.id}:${line.key}`) + take * 7919) % 4294967296;

/** The text's reading with its punctuation, for a voice that misread the kanji. */
async function kanaOf(text, dict) {
  const a = await analyze(text, { dict });
  return a.tokens.map((t) => (LAYOUT.has(t.kind) ? t.surface : t.reading || t.surface)).join('');
}

async function retrying(fn) {
  for (let i = 0; ; i += 1) {
    try { return await fn(); } catch (err) {
      const again = err instanceof ApiError && (err.status === 429 || err.status >= 500) && i < 4;
      if (!again) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}

async function speak(key, voice, text, { seed }) {
  const body = { text, model_id: MODEL, seed };
  const r = await retrying(() => call(key, `/v1/text-to-speech/${voice.voiceId}`, { method: 'POST', query: { output_format: RAW_FORMAT }, body }));
  return { pcm: r.audio, credits: Number(r.headers.get('character-cost') || 0) };
}

async function transcribe(key, mp3) {
  const form = new FormData();
  form.append('model_id', STT_MODEL);
  form.append('language_code', 'jpn');
  form.append('tag_audio_events', 'false');
  form.append('file', new Blob([mp3], { type: 'audio/mpeg' }), 'clip.mp3');
  const r = await retrying(() => call(key, '/v1/speech-to-text', { method: 'POST', body: form }));
  return String(r.text || '').trim();
}

function plan(opts, script, made) {
  const jobs = [];
  for (const voice of VOICES.filter((v) => opts.voices.includes(v.id))) {
    for (const line of script) {
      if (!voicesOf(line).includes(voice)) continue;
      const sig = signature(voice, line);
      const rec = made[madeKey(voice.id, line.id)];
      const done = rec && rec.sig === sig && (rec.ok ? fs.existsSync(clipPath(voice.id, line.id)) : !opts.retryFailed);
      if (!done) jobs.push({ voice, line, sig });
    }
  }
  return jobs.slice(0, opts.limit);
}

/** Make one clip: up to ATTEMPTS takes, each checked; the record either way. */
async function makeClip(job, ctx) {
  const { voice, line, sig } = job;
  const before = ctx.made[madeKey(voice.id, line.id)];
  const taken = before && before.sig === sig ? before.takes || ATTEMPTS : 0;
  const want = await ctx.check.expected(line);
  // The last take is sent another way: a beat in hiragana, a word as its
  // reading, a text with kanji as the analyzer's kana reading.
  let other = null;
  if (line.kind === 'kana') other = line.kana;
  else if (hasKanji(line.send)) other = isWord(line) ? line.kana : await kanaOf(line.tts, ctx.dict);
  let rec = null;
  const tries = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (ctx.spent >= ctx.budget) break;
    const sent = attempt === ATTEMPTS - 1 && other ? other : line.send;
    const seed = seedFor(voice, line, taken + attempt);
    const { pcm, credits } = await speak(ctx.key, voice, sent, { seed });
    ctx.spent += credits;
    let mp3;
    let seconds = 0;
    try { ({ mp3, seconds } = finish(pcm)); } catch (err) {
      tries.push({ sent, why: err.message });
      rec = { sig, key: line.key, kind: line.kind, sent, seed, attempt, takes: taken + attempt + 1, ok: false, why: err.message, tries };
      continue;
    }
    const heard = line.kind === 'kana' || line.triple ? triple(mp3) : mp3;
    const transcript = await transcribe(ctx.key, heard);
    const v = await ctx.check.verdict(want, transcript);
    if (!v.ok) tries.push({ sent, transcript, got: v.got });
    rec = { sig, key: line.key, kind: line.kind, sent, model: MODEL, seed, attempt, takes: taken + attempt + 1, transcript, want: want.said || want.kana, got: v.got, ok: v.ok, seconds, bytes: mp3.length };
    if (tries.length) rec.tries = tries;
    if (v.ok) {
      fs.mkdirSync(path.join(OUT, voice.id), { recursive: true });
      fs.writeFileSync(clipPath(voice.id, line.id), mp3);
      break;
    }
    fs.mkdirSync(REJECTS, { recursive: true });
    fs.writeFileSync(path.join(REJECTS, `${voice.id}-${line.id}-${attempt}.mp3`), mp3);
  }
  return rec;
}

const jsOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** The record, one clip a line, so a run's diff shows the clips it touched. */
function saveMade(made) {
  const rows = Object.entries(made).sort(([a], [b]) => jsOrder(a, b)).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  fs.writeFileSync(MADE, `{\n${rows.join(',\n')}\n}\n`);
}

/**
 * index.json and its key shards from what the record says was kept: every
 * key a line answers to, with the voices whose clip of it passed as a mask.
 * A line no voice kept is not in the index at all.
 */
function writeIndex(script, made) {
  const kept = (voice, id) => {
    const rec = made[madeKey(voice, id)];
    return !!(rec && rec.ok && fs.existsSync(clipPath(voice, id)));
  };
  const voices = VOICES.filter((v) => script.some((l) => kept(v.id, l.id)));
  const entries = new Map();
  const put = (key, entry) => { if (!entries.has(key)) entries.set(key, entry); };
  for (const line of script) {
    let mask = 0;
    voices.forEach((v, i) => { if (kept(v.id, line.id)) mask |= 1 << i; });
    if (mask) for (const k of line.keys) put(k, [line.id, mask]);
  }
  for (const [from, to] of Object.entries(beatAliases())) {
    const target = entries.get(audioKey(to));
    if (target) put(audioKey(from), target);
  }
  const shards = [];
  let cur = [];
  let size = 0;
  for (const k of [...entries.keys()].sort(jsOrder)) {
    const piece = JSON.stringify(k).length + JSON.stringify(entries.get(k)).length + 2;
    if (size + piece > SHARD_BYTES && cur.length) { shards.push(cur); cur = []; size = 0; }
    cur.push(k);
    size += piece;
  }
  if (cur.length) shards.push(cur);
  const licence = licenceBlock('elevenlabs', 'tools/build-audio.mjs', {
    voices: voices.map((v) => `${v.name} (${v.label.en})`).join(', '),
  });
  const src = (n) => `${AUDIO_DIR}/k${String(n).padStart(2, '0')}.json`;
  fs.mkdirSync(OUT, { recursive: true });
  shards.forEach((keys, n) => {
    const doc = { _licence: licence, format: CLIPS_FORMAT, clips: Object.fromEntries(keys.map((k) => [k, entries.get(k)])) };
    fs.writeFileSync(path.join(SITE, src(n)), `${JSON.stringify(doc)}\n`);
  });
  for (const f of fs.readdirSync(OUT)) {
    const m = f.match(/^k(\d+)\.json$/);
    if (m && Number(m[1]) >= shards.length) fs.unlinkSync(path.join(OUT, f));
  }
  const doc = {
    _licence: licence,
    format: AUDIO_FORMAT,
    voices: voices.map((v) => ({ id: v.id, name: v.name, label: v.label })),
    shards: shards.map((keys, n) => ({ first: keys[0], src: src(n) })),
  };
  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(doc)}\n`);
  const quiet = path.join(SITE, SILENCE_SRC);
  if (!fs.existsSync(quiet)) fs.writeFileSync(quiet, silence());
  return { ...doc, keys: entries.size };
}

/**
 * Remove clips the script no longer has (a phrase taken out of the library),
 * and their records, so the index and the disk keep agreeing.
 */
function prune(script, made) {
  const ids = new Set(script.map((l) => l.id));
  let removed = 0;
  for (const v of VOICES) {
    const dir = path.join(OUT, v.id);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.mp3') && !ids.has(f.slice(0, -'.mp3'.length))) { fs.unlinkSync(path.join(dir, f)); removed += 1; }
    }
  }
  for (const k of Object.keys(made)) if (!ids.has(k.split('/')[1])) delete made[k];
  return removed;
}

async function main() {
  const opts = args(process.argv.slice(2));
  const library = readJson(path.join(DATA, 'phrases', 'library.json'), null);
  const dict = createDict({ fetchJson: async (p) => JSON.parse(fs.readFileSync(p, 'utf8')), base: `${DATA}/` });
  const full = await fullScript({ library, dict, dataDir: DATA });
  for (const line of full) line.send = isWord(line) ? line.tts : await sendText(line.tts, dict);
  const script = full.filter((l) => opts.kinds.includes(l.kind));
  const made = readJson(MADE, {});
  const jobs = plan(opts, script, made);

  const chars = jobs.reduce((n, j) => n + [...j.line.send].length, 0);
  const byVoice = {};
  for (const j of jobs) byVoice[j.voice.id] = (byVoice[j.voice.id] || 0) + 1;
  console.log(`build-audio: ${script.length} lines, ${jobs.length} clips to make (${JSON.stringify(byVoice)}), ${chars} characters, about ${Math.ceil(chars * EST_PER_CHAR)} credits before retakes`);
  if (opts.dryRun) return;
  if (!jobs.length) {
    const removed = prune(full, made);
    saveMade(made);
    const doc = writeIndex(full, made);
    console.log(`build-audio: nothing to make; ${removed} old clips removed; index rewritten, ${doc.keys} keys in ${doc.shards.length} shards`);
    return;
  }

  const key = apiKey();
  if (!key) throw new Error('no ElevenLabs key: set ELEVENLABS_API_TOKEN in .env');
  const sub = await call(key, '/v1/user/subscription');
  const left = sub.character_limit - sub.character_count;
  const budget = Math.min(opts.budget, left - RESERVE);
  if (!(budget > 0)) throw new Error(`no budget: --budget=${opts.budget}, ${left} credits left, ${RESERVE} kept in reserve`);
  console.log(`build-audio: ${left} credits left this month; spending at most ${budget}`);

  const ctx = { key, dict, made, check: makeCheck(dict), spent: 0, budget };
  let next = 0;
  let passed = 0;
  let failed = 0;
  async function worker() {
    while (next < jobs.length && ctx.spent < ctx.budget) {
      const job = jobs[next++];
      const rec = await makeClip(job, ctx);
      if (!rec) continue;
      made[madeKey(job.voice.id, job.line.id)] = rec;
      if (rec.ok) passed += 1;
      else {
        failed += 1;
        console.log(`  FAILED ${job.voice.id} ${job.line.ja}: wanted ${rec.want || '?'}, heard ${JSON.stringify(rec.transcript || rec.why)} (${rec.got || ''})`);
      }
      if ((passed + failed) % 50 === 0) {
        saveMade(made);
        writeIndex(full, made);
        console.log(`  ${passed + failed}/${jobs.length}, ${ctx.spent} credits`);
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const removed = prune(full, made);
  saveMade(made);
  const doc = writeIndex(full, made);
  const stopped = next < jobs.length ? `; stopped at the budget with ${jobs.length - next} left` : '';
  console.log(`build-audio: ${passed} kept, ${failed} failed their check, ${ctx.spent} credits spent${stopped}; ${removed} old clips removed; ${doc.keys} keys in ${doc.shards.length} shards, ${doc.voices.length} voices`);
}

main().catch((err) => { console.error(`build-audio: ${err.message}`); process.exit(1); });
