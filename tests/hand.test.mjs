// The handwritten form (js/hand.js over fonts/klee/, tools/build-font.mjs):
// the slices the builder wrote, and how the page registers them.
//
//   node --test tests/hand.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rangeOf, loadHand, hasHand, HAND_FORMAT, HAND_FAMILY, HAND_SRC } from '../js/hand.js';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(readFileSync(join(SITE, HAND_SRC), 'utf8'));

test('the font ships as slices of its own characters, each a file under 140 KB, with its licence', () => {
  assert.equal(index.format, HAND_FORMAT);
  assert.equal(index.family, HAND_FAMILY);
  const all = index.slices.flatMap((s) => [...s.chars]);
  assert.equal(new Set(all).size, all.length, 'no character in two slices');
  assert.equal(all.length, index.count);
  for (const s of index.slices) {
    const file = join(SITE, s.src);
    assert.ok(existsSync(file), s.src);
    assert.ok(statSync(file).size < 140 * 1000, `${s.src} is ${statSync(file).size} B`);
  }
  // every kana the chart draws is in the first slice, so the chart fetches one file
  const kana = new Set([...index.slices[0].chars]);
  for (const ch of 'あさきをんアサキヲンー') assert.ok(kana.has(ch), ch);
  assert.ok(all.includes('令') && all.includes('日'));
  assert.ok(!all.includes('寬'), 'a kanji Klee One lacks is in no slice');
  assert.match(readFileSync(join(SITE, 'fonts/klee/OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
});

test('a unicode-range joins runs of code points and lists the rest one by one', () => {
  assert.equal(rangeOf('あいう'), 'U+3042,U+3044,U+3046', 'the small kana between them are not in the text');
  assert.equal(rangeOf('ぁあぃい'), 'U+3041-3044');
  assert.equal(rangeOf('日本日'), 'U+65E5,U+672C');
});

test('loading registers one face per slice and nothing before it is asked; a failure is forgotten', async () => {
  assert.equal(hasHand('令'), null, 'nothing is known before the switch is first turned on');
  const added = [];
  globalThis.FontFace = class { constructor(family, src, opts) { Object.assign(this, { family, src, opts }); } };
  let calls = 0;
  const failing = () => { calls += 1; return Promise.reject(new Error('offline')); };
  await assert.rejects(loadHand(failing, { add: (f) => added.push(f) }), /offline/);
  const covered = await loadHand(async (p) => { calls += 1; assert.equal(p, HAND_SRC); return index; }, { add: (f) => added.push(f) });
  assert.equal(calls, 2, 'the retry fetched again');
  assert.equal(added.length, index.slices.length);
  assert.ok(added.every((f) => f.family === HAND_FAMILY && /^url\(fonts\/klee\/k\d+\.woff2\)$/.test(f.src) && f.opts.unicodeRange));
  assert.ok(covered.has('令'));
  assert.equal(hasHand('令'), true);
  assert.equal(hasHand('寬'), false);
  delete globalThis.FontFace;
});
