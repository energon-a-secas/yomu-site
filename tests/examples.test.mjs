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

test('More holds up to seven after the three, none of them shown already, and loads only when asked', async () => {
  const fetched = [];
  const fresh = createExamples({ fetchJson: (p) => { fetched.push(p); return fetchJson(p); }, base: `${DATA}/` });
  await fresh.need(['食べる']);
  const n = fresh.moreCountOf('食べる', 'たべる');
  assert.ok(n >= 1 && n <= 7, `食べる has ${n} more`);
  assert.equal(fresh.moreOf('食べる', 'たべる'), undefined, 'nothing behind More before it is asked for');
  assert.ok(!fetched.some((p) => p.includes('sent/more/')), 'and its files are not fetched with the three');
  await fresh.needMore(['食べる']);
  const more = fresh.moreOf('食べる', 'たべる');
  assert.equal(more.length, n);
  const shown = new Set(fresh.examplesOf('食べる', 'たべる').map((e) => e.id));
  assert.ok(more.every((e) => !shown.has(e.id) && e.ja.slice(e.start, e.end).startsWith('食べ')));
  // a word with three or fewer has no More, and asking for it costs nothing wrong
  await fresh.need(['方']);
  assert.equal(fresh.moreCountOf('方', 'ほう'), 0);
});
