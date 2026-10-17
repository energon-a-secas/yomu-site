// From the API's raw PCM to the clip the page plays: silence trimmed from
// both ends (a beat said after a beat must follow at once, not after the
// voice's own pause), every clip levelled to one loudness so a learner never
// reaches for the volume between two voices, then encoded once as mono MP3.
//
// Needs ffmpeg with libmp3lame on the PATH.

import { spawnSync } from 'node:child_process';
import { RAW_RATE } from './audio-voices.mjs';

const TRIM_DB = -50;          // below this is silence
const KEEP_BEFORE_S = 0.04;   // silence kept before the voice starts
const KEEP_AFTER_S = 0.08;    // and after it stops
const TARGET_RMS_DB = -20;    // speech level, dBFS
const PEAK_CEILING_DB = -1;
const BITRATE = '48k';

function ffmpeg(args, input) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { input, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`ffmpeg could not run: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).trim().slice(0, 300)}`);
  return r.stdout;
}

const RAW_IN = ['-f', 's16le', '-ar', String(RAW_RATE), '-ac', '1', '-i', 'pipe:0'];

/** Trim leading and trailing silence; returns raw PCM. */
export function trim(pcm) {
  const edge = (keep) => `silenceremove=start_periods=1:start_threshold=${TRIM_DB}dB:start_silence=${keep}`;
  const filter = [edge(KEEP_BEFORE_S), 'areverse', edge(KEEP_AFTER_S), 'areverse'].join(',');
  return ffmpeg([...RAW_IN, '-af', filter, '-f', 's16le', 'pipe:1'], pcm);
}

/** RMS and peak of 16-bit PCM, in dBFS. */
export function levels(pcm) {
  const n = Math.floor(pcm.length / 2);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < n; i += 1) {
    const v = pcm.readInt16LE(i * 2) / 32768;
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { rms: db(Math.sqrt(sum / Math.max(n, 1))), peak: db(peak), seconds: n / RAW_RATE };
}

/** The gain that brings speech to the target level without clipping. */
export function gainFor({ rms, peak }) {
  if (!Number.isFinite(rms)) return 0;
  return Math.min(TARGET_RMS_DB - rms, PEAK_CEILING_DB - peak);
}

/** Raw PCM in, { mp3, seconds } out. Throws on a clip with no sound in it. */
export function finish(pcm) {
  const trimmed = trim(pcm);
  const lv = levels(trimmed);
  if (!Number.isFinite(lv.rms) || lv.seconds < 0.08) throw new Error('the clip is silent');
  const mp3 = ffmpeg([
    ...RAW_IN,
    '-af', `volume=${gainFor(lv).toFixed(2)}dB`,
    '-c:a', 'libmp3lame', '-b:a', BITRATE, '-ar', String(RAW_RATE), '-ac', '1',
    '-map_metadata', '-1', '-write_xing', '1', '-f', 'mp3', 'pipe:1',
  ], trimmed);
  return { mp3, seconds: Math.round(lv.seconds * 1000) / 1000 };
}

/** A clip three times over with a short gap: what a lone beat is checked from. */
export function triple(mp3) {
  const gap = 'apad=pad_dur=0.35';
  return ffmpeg([
    '-f', 'mp3', '-i', 'pipe:0',
    '-filter_complex', `[0:a]asplit=3[a][b][c];[a]${gap}[a2];[b]${gap}[b2];[a2][b2][c]concat=n=3:v=0:a=1`,
    '-c:a', 'libmp3lame', '-b:a', BITRATE, '-f', 'mp3', 'pipe:1',
  ], mp3);
}

/** A twentieth of a second of silence, the clip js/speech.js plays to unlock iOS. */
export function silence() {
  return ffmpeg(['-f', 'lavfi', '-i', `anullsrc=r=${RAW_RATE}:cl=mono`, '-t', '0.05', '-c:a', 'libmp3lame', '-b:a', '32k', '-map_metadata', '-1', '-f', 'mp3', 'pipe:1']);
}
