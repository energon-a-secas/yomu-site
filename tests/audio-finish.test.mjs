// A lone beat keeps its onset and a natural vowel, then fades: the held
// vowel the voices give a beat said alone is what made it sound like a moan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tightenBeat, heldBeat } from '../tools/lib/audio-finish.mjs';
import { RAW_RATE } from '../tools/lib/audio-voices.mjs';

/** Trimmed PCM: 40 ms lead-in at 0, then `seconds` of a steady level. */
function clip(seconds, level = 10000) {
  const lead = Math.round(0.04 * RAW_RATE);
  const n = lead + Math.round(seconds * RAW_RATE);
  const pcm = Buffer.alloc(n * 2);
  for (let i = lead; i < n; i += 1) pcm.writeInt16LE(level, i * 2);
  return pcm;
}
const samples = (pcm) => pcm.length / 2;
const at = (pcm, i) => pcm.readInt16LE(i * 2);

test('a held beat is cut to its lead-in and 0.30 s of voice, ending in silence', () => {
  const held = clip(0.55);
  const copy = Buffer.from(held);
  const out = tightenBeat(held, 'こ');
  assert.equal(samples(out), Math.round(0.34 * RAW_RATE));
  assert.equal(at(out, samples(out) - 1), 0, 'the fade reaches silence');
  assert.equal(at(out, Math.round(0.2 * RAW_RATE)), 10000, 'the voice before the fade is untouched');
  assert.deepEqual(held, copy, 'the input is not changed');
});

test('the fade only ever falls', () => {
  const out = tightenBeat(clip(0.6), 'か');
  const fade = Math.round(0.08 * RAW_RATE);
  for (let i = samples(out) - fade; i < samples(out); i += 1) assert.ok(at(out, i) <= at(out, i - 1), `sample ${i} rose`);
});

test('a two-kana beat keeps a little more for its longer consonant', () => {
  assert.equal(samples(tightenBeat(clip(0.6), 'きゃ')), Math.round(0.36 * RAW_RATE));
  assert.equal(samples(tightenBeat(clip(0.6), 'しゅ')), Math.round(0.36 * RAW_RATE));
  assert.equal(samples(tightenBeat(clip(0.6), 'ん')), Math.round(0.34 * RAW_RATE));
});

test('a beat already natural is returned as it is', () => {
  const natural = clip(0.25);
  assert.equal(heldBeat(natural, 'か'), false);
  assert.equal(tightenBeat(natural, 'か'), natural);
  assert.equal(heldBeat(clip(0.31), 'か'), true);
  assert.equal(heldBeat(clip(0.31), 'きゃ'), false);
});
