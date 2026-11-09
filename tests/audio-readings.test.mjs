// Kanji readings are recorded as their own kind: the readings a kanji page
// says, filed under the kana it plays them by, in Clear alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readingLines, KINDS, READING_LEVELS } from '../tools/lib/audio-script.mjs';
import { beats } from '../js/kana.js';
import { audioKey } from '../js/audio.js';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

test('kanji readings are a kind of their own, recorded in Clear under their kana', async () => {
  assert.ok(KINDS.includes('reading'));
  const lines = await readingLines(DATA);
  assert.deepEqual(lines.filter((l) => l.kanji === '日').map((l) => l.key), ['にち', 'じつ'], 'ひ, び and か are beats, recorded already');
  for (const l of lines) {
    assert.equal(l.kind, 'reading');
    assert.deepEqual(l.voices, ['clear']);
    assert.equal(l.key, audioKey(l.kana), 'filed under the kana the kanji page plays');
    assert.ok(beats(l.kana).length >= 2, `${l.kana} is a beat`);
  }
  assert.equal(new Set(lines.map((l) => l.key)).size, lines.length, 'one line per kana');
  assert.deepEqual([...new Set(lines.map((l) => l.level))], [...READING_LEVELS], 'easiest level first');
});
