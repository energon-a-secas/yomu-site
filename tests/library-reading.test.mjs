// Every phrase and dialogue line in the library, read by the analyzer, must
// come out the way the library spells it.
//
//   node --test tests/library-reading.test.mjs
//
// data/phrases/library.json carries a hand-written `kana` for every `ja`. The
// two were written apart, so each is a check on the other: when they differ,
// either the analyzer chose a wrong reading or the library has a wrong kana.
// Both have happened. The comparison folds katakana to hiragana and drops
// everything that is not kana, because the library writes マリア in katakana
// and leaves punctuation out.
//
// ALLOWED is the whole list of disagreements this test tolerates. An entry
// belongs there only when both readings are real Japanese for the same
// characters and the dictionary gives no way to prefer the one the sentence
// means. Anything else is fixed on the side that is wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isKana, toHira } from '../js/kana.js';
import { SITE, run, cut } from './helpers/disk.mjs';

const lib = JSON.parse(readFileSync(join(SITE, 'data', 'phrases', 'library.json'), 'utf8'));

/**
 * id -> { got, want, why }. `got` is what the analyzer reads, `want` what the
 * library spells, both folded; the test fails if either side drifts, so an
 * entry cannot outlive the disagreement it excuses.
 */
const ALLOWED = Object.freeze({
  // 空く is あく "to become free" and すく "to become less crowded", both q4
  // in the data, and the record for すく comes first. A seat is あいて; a
  // train is すいて. Nothing in the sentence or the data tells them apart.
  'meeting-classmate#0': {
    got: 'あのここすいていますか',
    want: 'あのここあいていますか',
    why: '空く read すく where the line means あく',
  },
});

const fold = (s) => toHira([...String(s)].filter((ch) => isKana(ch)).join(''));

const items = [
  ...lib.phrases.map((p) => ({ id: p.id, ja: p.ja, kana: p.kana })),
  ...lib.dialogues.flatMap((d) => d.lines.map((l, n) => ({ id: `${d.id}#${n}`, ja: l.ja, kana: l.kana }))),
];

test('the library holds what this test expects to read', () => {
  assert.equal(lib.phrases.length, 71);
  assert.equal(lib.dialogues.length, 8);
  assert.ok(items.length > 71);
});

test('every allowlisted id still exists', () => {
  const known = new Set(items.map((it) => it.id));
  for (const id of Object.keys(ALLOWED)) assert.ok(known.has(id), `${id} is allowlisted but no longer in the library`);
});

for (const it of items) {
  test(`${it.id}: ${it.ja}`, async () => {
    const r = await run(it.ja);
    assert.equal(r.tokens.map((t) => t.surface).join(''), r.text, 'the tokens do not tile the line');
    const got = fold(r.tokens.map((t) => t.reading).join(''));
    const want = fold(it.kana);
    const allowed = ALLOWED[it.id];
    if (allowed) {
      assert.equal(got, allowed.got, `${it.id} is allowlisted, but the analyzer now reads it differently`);
      assert.equal(want, allowed.want, `${it.id} is allowlisted, but the library now spells it differently`);
      return;
    }
    assert.equal(got, want, `cut ${cut(r)}`);
  });
}
