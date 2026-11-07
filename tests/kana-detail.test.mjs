import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kanaDetail, soundRules } from '../js/kana-detail.js';
import { usageFor } from '../js/usage-notes.js';
import { savableWord } from '../js/word-store.js';
import { useLang } from '../js/strings.js';
import { run } from './helpers/disk.mjs';

/** The character is named, never written, so this file passes its own rule. */
const EM_DASH = String.fromCharCode(0x2014);

/** `fn` with every string in Spanish (strings.js useLang), then English again. */
function inSpanish(fn) {
  useLang('es');
  try { return fn(); } finally { useLang('en'); }
}

test('combined kana explain their components without splitting the sound', () => {
  const kya = kanaDetail('きゃ');
  assert.equal(kya.parts.length, 1);
  assert.equal(kya.parts[0].romaji, 'kya');
  assert.equal(kya.parts[0].formula, 'き (ki) + ゃ (small ya) = きゃ (kya)');
  assert.ok(kya.notes.length);
  assert.equal(kanaDetail('ティ').parts[0].formula, 'テ (te) + ィ (small i) = ティ (ti)');
  const byo = kanaDetail('ビョ');
  assert.equal(byo.parts[0].romaji, 'byo');
  assert.equal(byo.notes.length, 2, 'both combined kana and dakuten are explained');
});

test('voicing and timing marks link to real rules and use pronounceable examples', () => {
  assert.equal(kanaDetail('か\u3099').parts[0].formula, 'か (ka) + ゛ = が (ga)');
  assert.equal(kanaDetail('パ').parts[0].formula, 'ハ (ha) + ゜ = パ (pa)');
  const marks = kanaDetail('っ、ー');
  assert.deepEqual(marks.parts.map(p => p.romaji), ['held beat', 'long vowel']);
  assert.deepEqual(marks.parts.map(p => p.spoken), ['きって', 'コーヒー']);
  assert.equal(marks.notes.length, 2);
  assert.deepEqual(kanaDetail('abc漢字。').parts, []);
  assert.deepEqual(kanaDetail('きゃ', 'en', ['youon', 'unknown-rule']), kanaDetail('きゃ'));
  const rules = soundRules();
  assert.equal(new Set(rules.map(r => r.id)).size, rules.length);
  for (const rule of rules) assert.ok(rule.note?.title && rule.note?.rule, rule.id);
  assert.equal(kanaDetail('は').parts[0].romaji, 'ha');
  assert.equal(kanaDetail('は', 'en', ['particle-wa']).parts[0].romaji, 'wa');
  assert.equal(kanaDetail('は', 'en', ['particle-wa']).parts[0].spoken, 'わ');
  assert.equal(kanaDetail('へ', 'en', ['particle-e']).parts[0].spoken, 'え');
});

test('yoroshiku gets contextual guidance without altering dictionary glosses or other words', async () => {
  for (const text of ['よろしくお願いします', 'よろしくおねがいします', 'よろしくお願いいたします']) {
    const result = await run(text);
    const token = result.tokens.find(t => t.usage);
    assert.ok(token, text);
    assert.equal(token.usage.en.meanings.length, 3);
    assert.ok(token.usage.en.meanings[0].includes('Thank you in advance'));
    assert.ok(token.usage.es.meanings[0].includes('Gracias de antemano'));
    if (savableWord(token)) assert.equal(savableWord(token).g, token.usage.en.meanings[0]);
    if (text === 'よろしくお願いします') {
      assert.ok(token.entry.g.includes('please remember me'), 'the source dictionary stays intact');
    }
  }
  assert.equal(usageFor({reading:'おねがいします'}), null);
  assert.equal(usageFor({reading:'よろしく'}), null);
  assert.ok((await run('お茶をお願いします')).tokens.every(t => !t.usage));
});

test('in Spanish, a sound is explained in Spanish, by its lang argument or by useLang alone', () => {
  const kya = kanaDetail('きゃ', 'es');
  assert.equal(kya.parts[0].formula, 'き (ki) + ゃ (ya pequeña) = きゃ (kya)');
  assert.equal(kya.parts[0].explanation, 'Estos dos caracteres forman un solo pulso combinado. El segundo kana se escribe pequeño.');
  assert.ok(kya.notes.length && kya.notes.every((n) => n.lang === 'es'));
  inSpanish(() => {
    assert.deepEqual(kanaDetail('きゃ'), kya, 'useLang is enough');
    const marks = kanaDetail('っ、ー');
    assert.deepEqual(marks.parts.map((p) => p.romaji), ['pulso sostenido', 'vocal larga']);
    assert.equal(marks.parts[0].explanation, 'Una tsu pequeña sostiene la consonante siguiente durante un pulso. No es una sílaba tsu aparte.');
    assert.equal(kanaDetail('が').parts[0].explanation, 'Los dos puntos cambian la consonante por su sonido sonoro.');
    assert.equal(kanaDetail('は', undefined, ['particle-wa']).parts[0].explanation, 'Aquí は se pronuncia wa porque es una partícula. Se sigue escribiendo は.');
    assert.equal(kanaDetail('テ').parts[0].explanation, 'Un kana representa un sonido, no una palabra con un significado fijo.');
    assert.ok(soundRules().every((r) => r.note.lang === 'es'));
    assert.equal(kanaDetail('っ', 'en').parts[0].romaji, 'held beat', 'an explicit lang still wins');
  });
  assert.equal(kanaDetail('っ').parts[0].romaji, 'held beat', 'English again');
});

test('every Spanish explanation is written, differs from the English, and has no em dash', () => {
  const cases = [['あ'], ['きゃ'], ['ティ'], ['っ'], ['ー'], ['が'], ['ぱ'], ['は', ['particle-wa']], ['へ', ['particle-e']], ['を', ['particle-o']]];
  for (const [text, rules = []] of cases) {
    const [en] = kanaDetail(text, 'en', rules).parts;
    const [es] = kanaDetail(text, 'es', rules).parts;
    assert.deepEqual([es.kana, es.spoken], [en.kana, en.spoken], text);
    assert.ok(es.explanation.trim(), text);
    assert.notEqual(es.explanation, en.explanation, text);
    for (const field of ['explanation', 'formula', 'romaji']) assert.ok(!String(es[field]).includes(EM_DASH), `${text}: ${field}`);
    if (en.formula?.includes('small')) assert.notEqual(es.formula, en.formula, text);
    if (/\s/.test(en.romaji)) assert.notEqual(es.romaji, en.romaji, text);
  }
  assert.ok(!fs.readFileSync(new URL('../js/kana-detail.js', import.meta.url), 'utf8').includes(EM_DASH));
});
