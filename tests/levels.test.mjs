// Kanji by level (js/levels.js) over the committed data/kanji/: the school
// years and the name kanji, and what a practice takes.
//
//   node --test tests/levels.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVELS, charsOf, practiceOf, loadNames, loadJlpt, PRACTICE_SIZE, JLPT_SIZES,
} from '../js/levels.js';
import { wallerKanji } from '../tools/lib/jlpt.mjs';
import { loadJoyo } from '../js/collection.js';
import { fetchJson, DATA } from './helpers/disk.mjs';

const joyo = () => loadJoyo((p) => fetchJson(`${DATA}/${p.replace(/^data\//, '')}`));
const jinmeiyo = () => loadNames((p) => fetchJson(`${DATA}/${p.replace(/^data\//, '')}`));
const lists = () => loadJlpt((p) => fetchJson(`${DATA}/${p.replace(/^data\//, '')}`));

test('every level holds the kanji its name says, in frequency order', async () => {
  const sizes = {};
  for (const l of LEVELS) sizes[l.id] = (await charsOf(l.id, { joyo, jinmeiyo, lists })).length;
  assert.deepEqual(sizes, {
    g1: 80, g2: 160, g3: 200, g4: 202, g5: 193, g6: 191, g8: 1110, names: 838, ...JLPT_SIZES,
  });
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

test('the JLPT levels are Waller\'s lists: his sizes, his order, no kanji in two, and each kanji knows its level', async () => {
  const j = await lists();
  assert.deepEqual(Object.fromEntries(['n5', 'n4', 'n3', 'n2', 'n1'].map((id) => [id, j[id].length])), JLPT_SIZES);
  assert.equal(j.n5.slice(0, 4).join(''), '日一国人', 'his page order');
  assert.equal(j.levelOf.get('日'), 5);
  assert.equal(j.levelOf.get('政'), 3);
  assert.equal(j.levelOf.size, 2211, 'no kanji in two levels');
  assert.equal(j.levelOf.get('猫'), 3);
  assert.equal(j.levelOf.get('鬱'), undefined, 'a kanji his lists leave out has no level');
});

test('a list page gives the first cell of each row of its Kanji table, nothing above it', () => {
  const html = `<table><tr><td><a href="KanjiList.N5.doc">KanjiList.N5.doc</a></td></tr></table>
<table width="100%" border="1"><tr><th>Kanji</th><th>Onyomi</th><th>Kunyomi</th><th>English</th></tr>
<tr><td><a class="nounderline" href="/jlpt/skills/kanji/sentences/?kanjiid=3365">日 </a></td><td><a> ニチ </a></td><td><a> ひ </a></td><td><a> day</a></td></tr>
<tr><td><a class="nounderline" href="/x">一 </a></td><td><a> イチ </a></td><td><a> ひと- </a></td><td><a> one</a></td></tr>
</table>`;
  assert.deepEqual(wallerKanji(html), ['日', '一']);
  assert.throws(() => wallerKanji('<table></table>'), /no table headed Kanji/);
});
