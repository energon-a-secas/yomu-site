// The Collections tab's logic (js/sets.js) over the committed data/sets/
// (tools/build-sets.mjs).
//
//   node --test tests/sets.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSets, createSetWords, rowMatches, SET_IDS } from '../js/sets.js';
import { fetchJson, DATA } from './helpers/disk.mjs';

const sets = createSets({ fetchJson, base: `${DATA}/` });

test('every set the tab offers is in the index, and loads whole', async () => {
  const index = await sets.sets();
  assert.deepEqual(index.map((s) => s.id), SET_IDS);
  for (const s of index) assert.equal((await sets.rows(s.id)).length, s.n, s.id);
});

test('each set holds what its name says, common entries first', async () => {
  const yoji = await sets.rows('yoji');
  assert.ok(yoji.some(([w]) => w === '一石二鳥'));
  const firstRare = yoji.findIndex((r) => !r[3]);
  assert.ok(firstRare > 0 && yoji.slice(firstRare).every((r) => !r[3]), 'common first');
  assert.ok((await sets.rows('proverb')).some(([w]) => w === '猿も木から落ちる'));
  const idioms = await sets.rows('idiom');
  assert.ok(idioms.some(([w]) => w === '足を洗う'));
  assert.ok(!idioms.some(([w]) => w === '嵐'), 'one word used figuratively is no idiom');
});

test('a row\'s romaji keeps JMdict\'s reading: a one-kanji word takes its key\'s other record where the row reads it so', async () => {
  const proverbs = await sets.rows('proverb');
  const row = proverbs.find(([w]) => w === '雨降って地固まる');
  // 地 is ち in the first tier; the row reads it じ, a rare record of the key
  assert.equal(row[4], 'ame futte ji katamaru');
  assert.equal(proverbs.find(([w]) => w === '猿も木から落ちる')[4], 'saru mo ki kara ochiru');
});

test('the filter reads Japanese, romaji and English', () => {
  const row = ['一石二鳥', 'いっせきにちょう', ['killing two birds with one stone'], 1];
  assert.ok(rowMatches(row, ''));
  assert.ok(rowMatches(row, '鳥'));
  assert.ok(rowMatches(row, 'いっせき'));
  assert.ok(rowMatches(row, 'イッセキ'), 'katakana finds the hiragana reading');
  assert.ok(rowMatches(row, 'issekini'), 'romaji as kana');
  assert.ok(rowMatches(row, 'stone'));
  assert.ok(rowMatches(row, 'two bir'), 'every English word, as the start of a gloss word');
  assert.ok(!rowMatches(row, 'stone cat'));
  assert.ok(!rowMatches(row, '猫'));
});

test('a word finds the idioms and proverbs that hold it, its own row first, and a kana word fetches nothing', async () => {
  const fetched = [];
  const words = createSetWords({ fetchJson: (p) => { fetched.push(p); return fetchJson(p); }, base: `${DATA}/` });
  await words.need(['猿', '一石二鳥', 'ねこ']);
  const saru = words.inOf('猿');
  assert.ok(saru.some((r) => r.written === '猿も木から落ちる' && r.set === 'proverb'));
  assert.ok(saru.every((r) => r.written.includes('猿')));
  assert.equal(new Set(saru.map((r) => r.set)).size, saru.length, 'one row from each collection before a second from any');
  assert.deepEqual(words.inOf('一石二鳥')[0], { set: 'yoji', written: '一石二鳥', reading: 'いっせきにちょう', gloss: 'killing two birds with one stone' });
  assert.deepEqual(words.inOf('ねこ'), []);
  assert.equal(words.inOf('鳥居'), undefined, 'a key not asked for is not known yet');
  const shards = fetched.filter((p) => /sets\/w\d+\.json$/.test(p));
  assert.ok(shards.length >= 1 && shards.length <= 2, `fetched ${shards.join(' ')}`);
});

test('no row of a collection is about a topic a reader should not meet unasked', async () => {
  const { AVOID_EXPLICIT: AVOID } = await import('../tools/lib/avoid.mjs');
  for (const id of SET_IDS) {
    for (const [w, , glosses] of await sets.rows(id)) assert.ok(!glosses.some((g) => AVOID.test(g)), `${id} ${w}`);
  }
});
