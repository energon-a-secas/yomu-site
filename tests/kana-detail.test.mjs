import test from 'node:test';
import assert from 'node:assert/strict';
import { kanaDetail, soundRules } from '../js/kana-detail.js';
import { usageFor } from '../js/usage-notes.js';
import { savableWord } from '../js/word-store.js';
import { run } from './helpers/disk.mjs';

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
