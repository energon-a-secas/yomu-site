// Example sentences (js/examples.js over data/sent/, tools/build-sentences.mjs).
//
//   node --test tests/examples.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createExamples, tatoebaUrl } from '../js/examples.js';
import { DATA, fetchJson, run } from './helpers/disk.mjs';
import { baseReading } from '../js/conjugate.js';

const ex = createExamples({ fetchJson, base: `${DATA}/` });

test('a common word has up to three examples, each with its English and the word inside it', async () => {
  await ex.need(['食べる', '猫']);
  const eat = ex.examplesOf('食べる', 'たべる');
  assert.ok(eat.length >= 2 && eat.length <= 3);
  for (const e of eat) {
    assert.ok(e.en && /^\d+$/.test(e.id));
    assert.ok([...e.ja].length <= 30);
    assert.ok(e.ja.slice(e.start, e.end).startsWith('食べ'), e.ja);
  }
  assert.equal(new Set(eat.map((e) => e.ja.replace(/[\p{P}\s]/gu, ''))).size, eat.length, 'no two differ only in punctuation');
  assert.ok(ex.examplesOf('猫', 'ねこ').length > 0);
});

test('every example of a word is one the analyzer reads as that word', async () => {
  await ex.need(['行く', '水', '勉強']);
  for (const [key, reading] of [['行く', 'いく'], ['水', 'みず'], ['勉強', 'べんきょう']]) {
    for (const e of ex.examplesOf(key, reading)) {
      const tok = (await run(e.ja)).tokens.find((t) => t.start === e.start && t.end === e.end);
      assert.ok(tok, `${e.ja}: no token at ${e.start}-${e.end}`);
      assert.equal(tok.base || tok.surface, key, e.ja);
      assert.equal(baseReading(tok), reading, e.ja);
    }
  }
});

test('a key the analyzer may read either way has no examples, rather than wrong ones', async () => {
  await ex.need(['方']);
  assert.deepEqual(ex.examplesOf('方', 'かた'), []);
  assert.deepEqual(ex.examplesOf('方', 'ほう'), []);
});

test('nothing is known before its shard is asked for, and each links to its Tatoeba page', async () => {
  assert.equal(createExamples({ fetchJson, base: `${DATA}/` }).examplesOf('猫', 'ねこ'), undefined);
  assert.equal(tatoebaUrl('8858176'), 'https://tatoeba.org/en/sentences/show/8858176');
});
