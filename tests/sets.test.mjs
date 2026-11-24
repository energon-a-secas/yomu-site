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

// ── Spanish, and romaji however it is typed (2026-11-17) ──────────────────

test('the filter folds accents on both sides and reads a row\'s Spanish', () => {
  const row = ['一石二鳥', 'いっせきにちょう', ['killing two birds with one stone'], 1, 'issekinichoo', ['matar dos pájaros con una piedra']];
  assert.ok(rowMatches(row, 'piedra'));
  assert.ok(rowMatches(row, 'pajaros'), 'pájaros without its accent');
  assert.ok(rowMatches(row, 'pájaros'));
  assert.ok(rowMatches(row, 'matar dos'));
  assert.ok(!rowMatches(row, 'piedra gato'));
  assert.ok(rowMatches(row, 'stone'), 'English as before');
  assert.ok(rowMatches(['足を洗う', 'あしをあらう', ['to wash one\'s feet'], 0, ''], 'wash'));
});

test('romaji in the filter however it is typed: spaces, a long vowel left out, a particle as said', () => {
  const row = ['一石二鳥', 'いっせきにちょう', ['killing two birds with one stone'], 1, 'issekinichoo'];
  assert.ok(rowMatches(row, 'isseki nichou'));
  assert.ok(rowMatches(row, 'issekinicho'), 'ちょう typed cho');
  const proverb = ['時は金なり', 'ときはかねなり', ['time is money'], 1, 'toki wa kane nari'];
  assert.ok(rowMatches(proverb, 'tokiwakane'), 'は typed wa');
  assert.ok(rowMatches(proverb, 'toki wa kane nari'));
});

test('the shelves carry Spanish where the dictionary has it for the row\'s record', async () => {
  const proverb = await sets.rows('proverb');
  assert.deepEqual(proverb.find(([w]) => w === '時は金なり')[5], ['el tiempo es oro']);
  const yoji = await sets.rows('yoji');
  assert.deepEqual(yoji.find(([w]) => w === '一石二鳥')[5], ['matar dos pájaros con una piedra']);
  assert.ok(yoji.filter((r) => rowMatches(r, 'piedra')).some(([w]) => w === '一石二鳥'));
  for (const id of SET_IDS) {
    const rows = await sets.rows(id);
    const n = rows.filter((r) => r[5]).length;
    assert.ok(n > 0 && n < rows.length, `${id}: ${n} of ${rows.length} rows have Spanish`);
    assert.ok(rows.every((r) => r.length === 5 || (r.length === 6 && r[5].length >= 1 && r[5].length <= 2)), id);
  }
});

test('the phrase library finds Spanish with or without accents, and romaji however it is typed', async () => {
  const { filterLibrary } = await import('../js/library-filter.js');
  const { readFileSync } = await import('node:fs');
  const library = JSON.parse(readFileSync(new URL('../data/phrases/library.json', import.meta.url), 'utf8'));
  const ja = (q) => filterLibrary(library, q).phrases.map((p) => p.ja);
  assert.deepEqual(ja('buenos dias'), ja('buenos días'));
  assert.ok(ja('buenos dias').includes('おはようございます'), 'measured 0 before');
  assert.deepEqual(ja('perdon'), ja('perdón'));
  assert.ok(ja('perdon').includes('すみません'), 'measured 0 before');
  assert.ok(ja('arigato').includes('ありがとうございます'), 'a long vowel left out');
  assert.ok(ja('konichiwa').includes('こんにちは'));
  assert.ok(ja('watashiwa').includes('私はマリアです'), 'は typed wa');
  assert.ok(ja('thank you').includes('ありがとうございます'), 'English as before');
});

// ── The reviews of 2026-11-17 ──────────────────────────────────────────────

test('the filters: no loose romaji across syllables, and each language in its own text', async () => {
  const { filterLibrary } = await import('../js/library-filter.js');
  const { readFileSync } = await import('node:fs');
  const library = JSON.parse(readFileSync(new URL('../data/phrases/library.json', import.meta.url), 'utf8'));
  const phrases = (q) => filterLibrary(library, q).phrases.map((p) => p.ja);
  // A loose query shorter than three letters was one letter every line says: ii found 57 phrases, ei 53.
  for (const [q, most] of [['ii', 6], ['ee', 8], ['ei', 2], ['uu', 3], ['kou', 2]]) {
    assert.ok(phrases(q).length <= most, `${q}: ${phrases(q).length}`);
  }
  // A lone question word is still Spanish (como was nothing), and an article alone is no search of the Spanish.
  assert.ok(phrases('como').includes('お元気ですか'));
  assert.ok(phrases('el').length <= 3, `el: ${phrases('el').length}`);
  // The shelves: the said line, its letters run together, is not searched (aku was in shikoosakugo).
  const all = (await Promise.all(SET_IDS.map((id) => sets.rows(id)))).flat();
  const rows = (q) => all.filter((r) => rowMatches(r, q)).map((r) => r[0]);
  assert.ok(!rows('aku').includes('試行錯誤'));
  assert.ok(!rows('onna').includes('外剛内柔'));
  assert.ok(!rows('ookii').includes('遠交近攻'));
  assert.ok(!rows('eki').includes('一石二鳥'), 'eki is not the seki of isseki');
  // English is searched in English only: año is not another, con and la are English prefixes as before.
  assert.ok(!rows('año').includes('以夷制夷'));
  assert.ok(rows('año').length > 0 && rows('año').length < 10, `año: ${rows('año').length}`);
  for (const q of ['con', 'la', 'el']) assert.ok(rows(q).length > 20, `${q}: ${rows(q).length}`);
});
