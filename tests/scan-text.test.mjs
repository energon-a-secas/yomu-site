// Scanned text made ready to read (js/scan-text.js), over the analyzer's own
// tokens for the committed data. The scans are what Live Text handed back on
// 11 November 2026 for printed pages (docs/READER.md, "Scanned text"), plus
// hand-made lines for each rule.
//
//   node --test tests/scan-text.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanScan, spells } from '../js/scan-text.js';
import { run } from './helpers/disk.mjs';

const clean = (text) => cleanScan(text, run);

// ── Furigana ──────────────────────────────────────────────────────────────

test('furigana Live Text put before a horizontal line is dropped', async () => {
  const r = await clean('きょう\nあめ\n今日は雨が降っています。');
  assert.equal(r.text, '今日は雨が降っています。');
  assert.deepEqual(r.furigana, ['きょう', 'あめ']);
});

test('furigana from a vertical page is dropped, with a space inside and a small kana read large', async () => {
  // The scan read the ruby of 今日 as "き よう": a space, and よ for ょ.
  const r = await clean('き よう\nあめ\nふ\n今日は雨が降っています');
  assert.equal(r.text, '今日は雨が降っています');
  assert.deepEqual(r.furigana, ['き よう', 'あめ', 'ふ']);
});

test('furigana over some kanji only, or after its line, is still dropped', async () => {
  assert.equal((await clean('きょう ふ\n今日は雨が降っています。')).text, '今日は雨が降っています。');
  assert.equal((await clean('今日は雨が降っています。\nあめ')).text, '今日は雨が降っています。');
});

test('a line of kana that is not the reading of the kanji beside it stays', async () => {
  const r = await clean('はい\n今日は雨です。');
  assert.equal(r.text, 'はい\n今日は雨です。');
  assert.deepEqual(r.furigana, []);
  // With no kanji line nothing is furigana; the break falls inside one
  // expression of the dictionary, so it closes.
  const thanks = await clean('ありがとう\nございます');
  assert.deepEqual(thanks.furigana, []);
  assert.equal(thanks.text, 'ありがとうございます');
});

test('two lines of furigana never claim the same kanji', async () => {
  // Only one 雨 to read: the second あめ is text, not its furigana.
  const r = await clean('あめ\nあめ\n雨です。');
  assert.deepEqual(r.furigana, ['あめ']);
  assert.equal(r.text, 'あめ\n雨です。');
});

test('spells takes the readings in order, each whole, any skipped', () => {
  const rubies = ['きよう', 'あめ', 'ふ'];
  assert.equal(spells('きようあめ', rubies), 2);
  assert.equal(spells('きようふ', rubies), 3, 'あめ skipped');
  assert.equal(spells('あめきよう', rubies), -1, 'out of order');
  assert.equal(spells('きよ', rubies), -1, 'part of a reading');
  assert.equal(spells('あめ', rubies, 2), -1, 'already used');
  assert.equal(spells('', rubies), -1);
});

// ── Breaks and spaces ─────────────────────────────────────────────────────

test('a vertical column break inside a word is closed, one between words stays', async () => {
  const r = await clean('昨日の夜、駅の近くの小さな本屋で、日本の古い映画\nについての面白い本を見つ\nけました。');
  assert.equal(r.text, '昨日の夜、駅の近くの小さな本屋で、日本の古い映画\nについての面白い本を見つけました。');
  assert.equal(r.joins, 1);
});

test('a menu keeps one item a line, and the space between a dish and its price', async () => {
  const menu = 'ラーメン 800円\n餃子\n400円\n唐揚げ定食\n950円\nお茶 無料';
  const r = await clean(menu);
  assert.equal(r.text, menu);
  assert.equal(r.joins, 0);
});

test('a line break after a particle, before a copula or after a comma is closed; after a sentence it stays', async () => {
  assert.equal((await clean('今日は\n雨が降っています。\n明日は晴れです。')).text, '今日は雨が降っています。\n明日は晴れです。');
  assert.equal((await clean('あの人は先生\nです。')).text, 'あの人は先生です。');
  assert.equal((await clean('昨日の夜、\n駅で友達に会いました。')).text, '昨日の夜、駅で友達に会いました。');
});

test('a space inside a word is closed, one between words stays', async () => {
  assert.equal((await clean('日本 語を勉強しています')).text, '日本語を勉強しています');
  assert.equal((await clean('お茶 無料')).text, 'お茶 無料');
});

test('lines that are not Japanese are left as they are', async () => {
  assert.equal((await clean('Hello,\nworld')).text, 'Hello,\nworld');
  assert.equal((await clean('  \n\n')).text, '');
});

test('the text is normalized as the reader normalizes it: full-width digits and spaces', async () => {
  assert.equal((await clean('ラーメン　８００円')).text, 'ラーメン 800円');
});
