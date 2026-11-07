import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASIC_KANA, PRACTICE_SOUNDS, kanaChart } from '../js/kana-chart.js';
import { kanaPractice, practiceCatalog, requiredKana } from '../js/kana-practice.js';
import { toKata } from '../js/kana.js';
import { useLang } from '../js/strings.js';

const library = JSON.parse(readFileSync(new URL('../data/phrases/library.json', import.meta.url)));
/** The character is named, never written, so this file passes its own rule. */
const EM_DASH = String.fromCharCode(0x2014);

/** `fn` with every string in Spanish (strings.js useLang), then English again. */
function inSpanish(fn) {
  useLang('es');
  try { return fn(); } finally { useLang('en'); }
}

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

test('in Spanish, the chart titles its sections and timing marks in Spanish, and its cells stay the same', () => {
  const english = kanaChart('katakana');
  // Everything but the words: ids, kana, romaji of real sounds, what is spoken.
  const plain = (chart) => chart.map((s) => ({ ...s, title: null, cells: s.cells.map((c) => ({ ...c, romaji: s.id === 'timing' ? null : c.romaji })) }));
  inSpanish(() => {
    const hira = kanaChart('hiragana');
    assert.deepEqual(hira.map((s) => s.title), ['Kana básicos', 'Sonidos sonoros', 'Combinaciones', 'Tsu pequeña y vocales largas']);
    const kata = kanaChart('katakana');
    assert.equal(kata.find((s) => s.id === 'loan').title, 'Combinaciones para palabras prestadas');
    assert.deepEqual(kata.find((s) => s.id === 'timing').cells.map((c) => c.romaji), ['pausa', 'vocal larga']);
    assert.deepEqual(plain(kata), plain(english));
    for (const [i, section] of kata.entries()) {
      assert.notEqual(section.title, english[i].title, section.id);
      assert.ok(section.title.trim() && !section.title.includes(EM_DASH), section.id);
    }
  });
  assert.equal(kanaChart('hiragana').find((s) => s.id === 'timing').cells[0].romaji, 'pause', 'English again');
});

test('in Spanish, practice gives each starter\'s and each library phrase\'s Spanish meaning', () => {
  inSpanish(() => {
    const rows = new Map(kanaPractice(library, { selected: PRACTICE_SOUNDS }).exercises.map((p) => [p.id, p]));
    assert.equal(rows.get('kana-rain').meaning, 'Hoy llueve.');
    assert.equal(rows.get('kana-tea').meaning, 'Tomo té.');
    assert.equal(rows.get('kana-bag').meaning, '¿Dónde está el bolso?');
    const phrases = library.phrases.filter((p) => rows.has(p.id));
    assert.ok(phrases.length >= 50, `${phrases.length} library phrases`);
    for (const p of phrases) assert.equal(rows.get(p.id).meaning, p.es, p.id);
    const plain = { phrases: [{ id: 'tea', ja: 'お茶', kana: 'おちゃ', en: 'Tea' }] };
    assert.equal(kanaPractice(plain, { selected: ['お', 'ちゃ'] }).exercises[0].meaning, 'Tea', 'a phrase with no Spanish keeps its English');
  });
  assert.equal(kanaPractice(library, { selected: PRACTICE_SOUNDS }).exercises.find((p) => p.id === 'kana-rain').meaning, 'It is rainy today.');
});

test('every starter has a Spanish meaning, written, with no em dash', () => {
  const starters = practiceCatalog({ phrases: [] });
  assert.equal(starters.length, 20);
  for (const s of starters) {
    assert.ok(typeof s.es === 'string' && s.es.trim(), `${s.id}: no Spanish`);
    assert.ok(!s.es.includes(EM_DASH), s.id);
    if (/\s/.test(s.en)) assert.notEqual(s.es, s.en, `${s.id} is still English`);
  }
  for (const file of ['kana-practice.js', 'kana-chart.js']) {
    assert.ok(!readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8').includes(EM_DASH), file);
  }
});
