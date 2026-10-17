import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASIC_KANA, PRACTICE_SOUNDS, kanaChart } from '../js/kana-chart.js';
import { kanaPractice, requiredKana } from '../js/kana-practice.js';
import { toKata } from '../js/kana.js';

const library = JSON.parse(readFileSync(new URL('../data/phrases/library.json', import.meta.url)));

test('shared charts keep the 46 basic kana, 25 voiced sounds and 33 combinations', () => {
  const hira = kanaChart('hiragana');
  const kata = kanaChart('katakana');
  assert.equal(BASIC_KANA.length, 46);
  assert.equal(hira.find(s => s.id === 'basic').cells.filter(c => c.kana).length, 46);
  assert.equal(hira.find(s => s.id === 'voiced').cells.length, 25);
  assert.equal(hira.find(s => s.id === 'combined').cells.length, 33);
  assert.equal(hira[0].cells.find(c => c.id === 'し').romaji, 'shi');
  assert.equal(hira[2].cells.find(c => c.id === 'きゃ').romaji, 'kya');
  assert.equal(kata.find(s => s.id === 'loan').cells.find(c => c.id === 'てぃ').romaji, 'ti');
  for (const section of hira) for (const cell of section.cells) {
    assert.equal(kata.find(s => s.id === section.id).cells.find(c => c.id === cell.id).kana, toKata(cell.kana));
  }
  assert.equal(hira[0].cells.find(c => c.id === 'を').spoken, 'お');
  assert.equal(hira[3].cells.find(c => c.id === 'っ').spoken, 'きって');
});

test('eligibility treats voiced kana, combinations and timing marks as distinct selected sounds', () => {
  assert.deepEqual(requiredKana('キャット。'), ['きゃ', 'っ', 'と']);
  assert.deepEqual(requiredKana('ｺｰﾋｰ'), ['こ', 'ー', 'ひ']);
  assert.deepEqual(requiredKana('か\u3099'), ['が']);
  assert.equal(requiredKana('東京'), null);
  assert.equal(requiredKana('abc'), null);
  assert.equal(requiredKana('123'), null);
  assert.equal(requiredKana('。！？'), null);
  const source = {phrases: [{id:'tea',ja:'お茶',kana:'おちゃ',en:'Tea'}, {id:'bag',ja:'鞄',kana:'かばん',en:'Bag'}]};
  assert.ok(!kanaPractice(source, {selected:['お','ち','や']}).exercises.some(p => p.id==='tea'));
  assert.ok(kanaPractice(source, {selected:['お','ちゃ']}).exercises.some(p => p.id==='tea'));
  assert.ok(!kanaPractice(source, {selected:['か','は','ん']}).exercises.some(p => p.id==='bag'));
  assert.ok(kanaPractice(source, {selected:['か','ば','ん']}).exercises.some(p => p.id==='bag'));
});

test('empty and small selections yield only playable kana-only practice, in either script', () => {
  assert.deepEqual(kanaPractice(library, {selected:[]}).exercises, []);
  const vowels = ['あ','い','う','え','お'];
  for (const script of ['hiragana','katakana']) {
    const rows = kanaPractice(library, {script,selected:vowels}).exercises;
    assert.ok(rows.length >= 2);
    for (const row of rows) {
      assert.ok(requiredKana(row.text).every(k => vowels.includes(k)), row.text);
      assert.ok(!/[\p{Script=Han}a-z0-9]/iu.test(row.text));
      assert.ok(row.meaning && row.original);
      assert.equal(/\p{Script=Katakana}/u.test(row.text), script==='katakana');
    }
  }
});

test('full practice catalog has unique ids and every included sound is explicitly selected', () => {
  const all = kanaPractice(library, {selected:PRACTICE_SOUNDS});
  assert.ok(all.exercises.length >= 90);
  assert.equal(all.exercises.length, all.total);
  assert.equal(new Set(all.exercises.map(p => p.id)).size, all.total);
  const basic = kanaPractice(library, {selected:BASIC_KANA});
  assert.ok(basic.exercises.length < all.total);
  for (const row of basic.exercises) {
    assert.ok(requiredKana(row.text).every(k => BASIC_KANA.includes(k)), row.text);
  }
});
