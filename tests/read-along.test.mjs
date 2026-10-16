// Read along's timing (js/read-along-time.js): how long a word is lit, where
// a voice's boundary falls, and how the beat is learned from the voice.
//
//   node --test tests/read-along.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  START_MS, MIN_MS, MAX_MS, beatsOf, lineOf, wordAt, litMs, learn,
} from '../js/read-along-time.js';

test('a sentence is its words joined, each word starting where the last ended', () => {
  const line = lineOf([{ text: 'きょう', beats: 2 }, { text: 'わ', beats: 1 }, { text: 'あめ', beats: 2 }]);
  assert.equal(line.text, 'きょうわあめ');
  assert.deepEqual(line.starts, [0, 3, 4]);
  assert.equal(line.total, 5);
  assert.equal(wordAt(line.starts, 0), 0);
  assert.equal(wordAt(line.starts, 3), 1, 'a boundary on a word lights that word');
  assert.equal(wordAt(line.starts, 5), 2, 'inside a word is that word');
});

test('a word is lit for its beats, slower at a slower rate', () => {
  assert.equal(beatsOf({ morae: ['きょ', 'う'] }), 2);
  assert.equal(beatsOf({}), 1, 'a word with no reading still takes a beat');
  assert.equal(litMs([2, 1], 0, 140, 1), 280);
  assert.ok(litMs([2, 1], 0, 140, 0.75) > 280);
});

test('the beat is learned from how long the voice took, within bounds', () => {
  assert.equal(learn(START_MS, 1000, 10, 1), Math.round((START_MS + 100) / 2));
  assert.equal(learn(START_MS, 0, 10), START_MS, 'no measure, nothing learned');
  assert.equal(learn(START_MS, 99999, 2), Math.round((START_MS + MAX_MS) / 2), 'a voice that hung is not believed');
  assert.equal(learn(START_MS, 1, 50), Math.round((START_MS + MIN_MS) / 2));
});

test('a boundary event moves the light only forward, and only once its word is nearly due', async () => {
  const { believe, startsAt } = await import('../js/read-along-time.js');
  const beats = [2, 1, 2, 1, 6];
  assert.equal(startsAt(beats, 2, 100), 300);
  // Chromium on macOS: every boundary arrives 90 ms in. None is believed past the first word.
  assert.equal(believe(4, 0, 90, beats, 100), false);
  assert.equal(believe(1, 0, 90, beats, 100), false, 'the second word is due at 200: 90 is too soon');
  // A voice in step: the boundary for word 2 at 250 ms (due at 300) is believed.
  assert.equal(believe(2, 1, 250, beats, 100), true);
  assert.equal(believe(1, 2, 999, beats, 100), false, 'never backward');
});
