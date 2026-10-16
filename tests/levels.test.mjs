// Kanji by level (js/levels.js) over the committed data/kanji/: the school
// years and the name kanji, and what a practice takes.
//
//   node --test tests/levels.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LEVELS, charsOf, practiceOf, loadNames, PRACTICE_SIZE } from '../js/levels.js';
import { loadJoyo } from '../js/collection.js';
import { fetchJson, DATA } from './helpers/disk.mjs';

const joyo = () => loadJoyo((p) => fetchJson(`${DATA}/${p.replace(/^data\//, '')}`));
const jinmeiyo = () => loadNames((p) => fetchJson(`${DATA}/${p.replace(/^data\//, '')}`));

test('every level holds the kanji its name says, in frequency order', async () => {
  const sizes = {};
  for (const l of LEVELS) sizes[l.id] = (await charsOf(l.id, { joyo, jinmeiyo })).length;
  assert.deepEqual(sizes, { g1: 80, g2: 160, g3: 200, g4: 202, g5: 193, g6: 191, g8: 1110, names: 838 });
  assert.equal((await charsOf('g1', { joyo, jinmeiyo }))[0], '日', 'the commonest first-grade kanji leads');
  const names = await charsOf('names', { joyo, jinmeiyo });
  const school = new Set((await joyo()).grades.flatMap((g) => g.chars));
  assert.ok(names.every((ch) => !school.has(ch)), 'no name kanji is in the jōyō list');
  assert.deepEqual(await charsOf('nope', { joyo, jinmeiyo }), []);
});

test('a practice takes the first kanji not saved, or the first ones when all are', () => {
  const chars = [...'日一人年大十二本中長出三同時政事自行社見月分議後前民生連'];
  const saved = new Set(['日', '人']);
  const p = practiceOf(chars, (ch) => saved.has(ch));
  assert.equal(p.length, PRACTICE_SIZE);
  assert.ok(!p.includes('日') && !p.includes('人'));
  assert.equal(p[0], '一');
  assert.deepEqual(practiceOf(['日', '一'], () => true), ['日', '一']);
});
