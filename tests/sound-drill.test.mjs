// Sound rule drills (js/sound-drill.js): every sound rule as one card, its
// first example said on arrival and the rest as related words, in the list's
// order or mixed with a seed, in English and Spanish.
//
//   node --test tests/sound-drill.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { soundDrill, DRILL_RULES, DRILL_ORDERS } from '../js/sound-drill.js';
import { soundRules } from '../js/kana-detail.js';

/** The character is named, never written, so this file passes its own rule. */
const EM_DASH = String.fromCharCode(0x2014);

test('one card per sound rule, in the order Sound rules lists them, each with an example to say', () => {
  const { order, cards } = soundDrill({ lang: 'en' });
  assert.equal(order, 'rules');
  assert.deepEqual(cards.map((c) => c.id), soundRules('en').map((r) => r.id));
  assert.equal(cards.length, DRILL_RULES.length);
  for (const c of cards) {
    const note = soundRules('en').find((r) => r.id === c.id).note;
    assert.equal(c.title, note.title);
    assert.equal(c.rule, note.rule);
    assert.deepEqual(c.example, note.examples[0], 'the card says the rule\'s first example');
    assert.deepEqual(c.related, note.examples.slice(1), 'and lists the others as its words');
    assert.equal(c.exception, note.exception || null);
    assert.ok(c.example.ja && c.example.said, `${c.id} has something to say and how it is said`);
  }
});

test('mixed deals every rule once, the same seed the same order, another seed another', () => {
  const a = soundDrill({ lang: 'en', order: 'mixed', seed: 7 });
  assert.equal(a.order, 'mixed');
  assert.deepEqual([...a.cards.map((c) => c.id)].sort(), [...DRILL_RULES].sort());
  assert.deepEqual(soundDrill({ lang: 'en', order: 'mixed', seed: 7 }).cards.map((c) => c.id), a.cards.map((c) => c.id));
  assert.notDeepEqual(soundDrill({ lang: 'en', order: 'mixed', seed: 8 }).cards.map((c) => c.id), a.cards.map((c) => c.id));
  assert.deepEqual(soundDrill({ lang: 'en', order: 'sideways' }).cards.map((c) => c.id), DRILL_RULES, 'an unknown order is the list\'s');
  assert.deepEqual(DRILL_ORDERS, ['rules', 'mixed']);
});

test('in Spanish the cards are Spanish and say the same Japanese', () => {
  const en = soundDrill({ lang: 'en' }).cards;
  const es = soundDrill({ lang: 'es' }).cards;
  assert.deepEqual(es.map((c) => c.id), en.map((c) => c.id));
  for (const [k, c] of es.entries()) {
    assert.equal(c.example.ja, en[k].example.ja);
    assert.notEqual(c.title, en[k].title, `${c.id} has a Spanish title`);
    assert.notEqual(c.rule, en[k].rule, `${c.id} has a Spanish rule`);
  }
});

test('the module carries no long dash', () => {
  assert.ok(!readFileSync(new URL('../js/sound-drill.js', import.meta.url), 'utf8').includes(EM_DASH));
});
