import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAudio, addShard, wordSequence } from '../js/audio.js';
function audio(clips) {
  const a = normalizeAudio({ format: 'yomu-audio/2', voices: [{ id: 'clear' }, { id: 'male' }], shards: [{ first: '', src: 'k' }] });
  addShard(a, 0, { format: 'yomu-audio-clips/1', clips });
  return a;
}

test('a word sequence keeps the selected voice on a tie and uses one fallback voice for better coverage', () => {
  const a = audio({ a: ['a', 3], b: ['b', 1] });
  assert.equal(wordSequence(a, [['a']], 'male').voice, 'male');
  const mixedBefore = wordSequence(a, [['a'], ['b'], ['missing']], 'male');
  assert.equal(mixedBefore.voice, 'clear');
  assert.deepEqual(mixedBefore.clips.map(c => c?.voice ?? null), ['clear', 'clear', null]);
  assert.equal(mixedBefore.recorded, 2);
});

test('sequence coverage never substitutes a bare-kana homophone for a specific word', () => {
  const a = audio({ '雨|あめ': ['rain', 1], 'あめ': ['ame', 2], x: ['x', 3] });
  const plan = wordSequence(a, [['雨|あめ', 'あめ'], ['x']], 'male');
  assert.equal(plan.voice, 'clear');
  assert.equal(plan.clips[0].id, 'rain');
  assert.deepEqual(plan.clips.map(c => c.voice), ['clear', 'clear']);
});

test('missing audio and empty readings keep every position without claiming recordings', () => {
  assert.deepEqual(wordSequence(null, [['x'], ['y']], 'male').clips, [null, null]);
  assert.deepEqual(wordSequence(audio({}), [], 'male').clips, []);
});
