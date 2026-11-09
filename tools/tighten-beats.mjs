#!/usr/bin/env node
// Re-finish the kept lone-beat clips in place: the same checked take, its
// held vowel cut to a natural beat (tools/lib/audio-finish.mjs tightenBeat).
// No API call and no credits; each clip keeps its file name, key and check.
// A dry run by default: it measures what would change.
//
//   node tools/tighten-beats.mjs                       measure only
//   node tools/tighten-beats.mjs --samples=<dir>       also write before/after
//                                                      copies and a listening page
//   node tools/tighten-beats.mjs --apply               rewrite the clips and records
//
// The previous clips stay in git history; `git checkout -- data/audio
// tools/audio-made.json` undoes an --apply.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, finish, heldBeat, trim, levels } from './lib/audio-finish.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MADE = path.join(SITE, 'tools', 'audio-made.json');
const OUT = path.join(SITE, 'data', 'audio');
const BEAT_FINISH = 'beat-1';
const SAMPLE_BEATS = ['あ', 'か', 'こ', 'す', 'つ', 'ふ', 'ん', 'が', 'きゃ', 'しゅ', 'じょ', 'ぴゃ'];
const SAMPLE_VOICES = ['clear', 'male'];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const samplesArg = args.find((a) => a.startsWith('--samples='));
const samples = samplesArg ? path.resolve(samplesArg.slice('--samples='.length)) : null;

const made = JSON.parse(fs.readFileSync(MADE, 'utf8'));
const stats = {};
const sampleRows = [];
let changed = 0;
let natural = 0;
let done = 0;

for (const [madeKey, rec] of Object.entries(made)) {
  if (!rec || rec.kind !== 'kana' || !rec.ok) continue;
  if (rec.finish === BEAT_FINISH) { done += 1; continue; }
  const [voice, id] = madeKey.split('/');
  const file = path.join(OUT, voice, `${id}.mp3`);
  if (!fs.existsSync(file)) continue;
  const old = fs.readFileSync(file);
  const pcm = decode(old);
  if (!heldBeat(trim(pcm), rec.key)) { natural += 1; continue; }
  const before = levels(trim(pcm)).seconds;
  const { mp3, seconds } = finish(pcm, { beat: rec.key });
  const s = (stats[voice] ||= { before: [], after: [] });
  s.before.push(before);
  s.after.push(seconds);
  changed += 1;
  if (samples && SAMPLE_VOICES.includes(voice) && SAMPLE_BEATS.includes(rec.key)) {
    sampleRows.push({ voice, beat: rec.key, before, after: seconds, old, mp3 });
  }
  if (apply) {
    fs.writeFileSync(file, mp3);
    Object.assign(rec, { seconds, bytes: mp3.length, finish: BEAT_FINISH });
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const [voice, s] of Object.entries(stats).sort()) {
  console.log(`tighten-beats: ${voice.padEnd(6)} ${String(s.before.length).padStart(3)} beats, median ${median(s.before).toFixed(2)} s -> ${median(s.after).toFixed(2)} s`);
}
console.log(`tighten-beats: ${changed} held beats ${apply ? 'rewritten' : 'would be rewritten'}, ${natural} already natural, ${done} done before`);

if (apply && changed) {
  const rows = Object.entries(made).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  fs.writeFileSync(MADE, `{\n${rows.join(',\n')}\n}\n`);
}

if (samples) {
  fs.mkdirSync(samples, { recursive: true });
  const order = (r) => SAMPLE_VOICES.indexOf(r.voice) * 100 + SAMPLE_BEATS.indexOf(r.beat);
  const rows = sampleRows.sort((a, b) => order(a) - order(b)).map((r, n) => {
    fs.writeFileSync(path.join(samples, `${n}-before.mp3`), r.old);
    fs.writeFileSync(path.join(samples, `${n}-after.mp3`), r.mp3);
    return `<tr><th>${r.beat}</th><td>${r.voice}</td>`
      + `<td><audio controls preload="none" src="${n}-before.mp3"></audio><small>${r.before.toFixed(2)} s</small></td>`
      + `<td><audio controls preload="none" src="${n}-after.mp3"></audio><small>${r.after.toFixed(2)} s</small></td></tr>`;
  });
  fs.writeFileSync(path.join(samples, 'index.html'), `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Kana beats: before and after</title>
<style>body{font:16px system-ui;margin:24px;background:#14121f;color:#eee}th{font-size:28px;padding:6px 14px}
td{padding:6px 10px}small{display:block;color:#aaa}audio{height:32px}</style></head><body>
<h1>Kana beats: before and after</h1>
<p>The same recorded take. After keeps the onset and a natural vowel, then fades: no new recording, no credits.</p>
<table><tr><th>Beat</th><td>Voice</td><td>Before (held)</td><td>After</td></tr>
${rows.join('\n')}
</table></body></html>
`);
  console.log(`tighten-beats: ${sampleRows.length} sample pairs in ${samples}/index.html`);
}
