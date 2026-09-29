// The phrase library, data/phrases/library.json, format yomu-library/1.
//
//   node --test tests/library.test.mjs
//   npm test
//
// Every line of the library is written by hand, which is why it needs a gate:
// no upstream checked it, and the page shows it as Japanese a learner copies.
// This file asserts the shape, the two languages and the house rules, and it
// asserts the one property a later stage leans on: `kana` is the full reading
// of `ja`, character for character wherever `ja` is already kana.
//
// What "the reading" means here, so the analyzer comparison has one answer:
//   - `kana` holds kana only. The punctuation in `ja` (。、？！「」) is dropped.
//   - Hiragana in `ja` appears as the same hiragana in `kana`, and katakana as
//     the same katakana. Only the kanji runs are replaced, by their reading.
//   - Particles are written as spelled (は, を, へ), never as said. The said
//     line is kana.js's job, not the data's.
// So the analyzer's reading, folded with toHira, must equal toHira(kana).
//
// No word list is checked here. That is the analyzer's comparison, run over
// the real dictionary shards, and a mismatch there is a question about one
// reading, not about the file's shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isAllKana, isJapanese, isKanji } from '../js/kana.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '../data/phrases/library.json');
const RAW = readFileSync(FILE, 'utf8');
const doc = JSON.parse(RAW);

const FORMAT = 'yomu-library/1';
/** Every JSON file in data/ stays under this, the same budget as the dict shards. */
const BUDGET_BYTES = 140 * 1000;
const REGISTERS = new Set(['polite', 'plain', 'set']);
const SPEAKERS = new Set(['A', 'B']);
const ID = /^[a-z][a-z0-9-]*$/;
/** The only characters `ja` may hold besides kana and kanji. Each has no reading. */
const PUNCT = new Set([...'。、？！「」']);
/** The character is named, never written, so this file passes its own rule. */
const EM_DASH = String.fromCharCode(0x2014);
/**
 * The house copy rule: five words that say nothing. They are assembled from
 * halves so that a plain grep of the repository for them stays empty.
 */
const BANNED = new RegExp(
  `\\b(${['power' + 'ful', 'seam' + 'less', 'lever' + 'ages?', 'rob' + 'ust', 'util' + 'i[sz]e[sd]?'].join('|')})\\b`,
  'i',
);

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

/** Every string value in a JSON value, with a path, so a failure names its row. */
function* strings(value, path = '') {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
  }
}

function assertBilingual(where, value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${where} must be an { en, es } object`);
  assert.deepEqual(Object.keys(value).sort(), ['en', 'es'], `${where} holds exactly en and es`);
  assert.ok(isStr(value.en), `${where}.en is empty`);
  assert.ok(isStr(value.es), `${where}.es is empty`);
  // A copy pasted into both slots reads as translated and is not.
  assert.notEqual(value.en, value.es, `${where}: en and es are the same string`);
}

/**
 * Sentence ends: a full stop, ? or ! followed by a space or the end. A quoted
 * question ('is that true?'.) counts once, which is what a reader counts.
 */
const sentences = (s) => (s.match(/[.!?](?=\s|$)/g) || []).length;

/**
 * Does `kana` read `ja`? Each kanji run in `ja` becomes a group that must read
 * as at least one kana; every kana character of `ja` must appear verbatim and
 * in order; punctuation is skipped. Anchored at both ends, so nothing extra
 * can hide in `kana` and nothing in `ja` can go unread.
 *
 * Its limit: two kanji runs with only punctuation between them (日曜日、何)
 * have no kana anchor between them, so their readings are checked together,
 * not one by one. The analyzer comparison is what splits them.
 */
function readsAs(ja, kana) {
  let pattern = '';
  let inKanji = false;
  for (const ch of ja) {
    if (PUNCT.has(ch)) { inKanji = false; continue; }
    if (isKanji(ch)) {
      if (!inKanji) pattern += '(.+?)';
      inKanji = true;
      continue;
    }
    inKanji = false;
    pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`, 'u').test(kana);
}

/** The checks one Japanese line must pass, phrase or dialogue line alike. */
function assertJapanese(where, ja, kana) {
  assert.ok(isStr(ja), `${where}.ja is empty`);
  assert.ok(isStr(kana), `${where}.kana is empty`);
  for (const ch of ja) {
    assert.ok(isJapanese(ch) || PUNCT.has(ch),
      `${where}.ja holds '${ch}', which has no kana reading; write numbers in kanji and leave Latin out`);
  }
  assert.ok(isAllKana(kana), `${where}.kana must be kana only, no punctuation or spaces: ${kana}`);
  assert.ok(readsAs(ja, kana), `${where}: kana ${kana} does not read ja ${ja} character for character`);
}

test('the file is yomu-library/1, public domain, and under budget', () => {
  assert.equal(doc.format, FORMAT);
  const size = statSync(FILE).size;
  assert.ok(size < BUDGET_BYTES, `library.json is ${size} bytes, the budget is ${BUDGET_BYTES}`);
  const lic = doc._licence;
  assert.ok(lic && typeof lic === 'object', '_licence block is missing');
  assert.equal(lic.spdx, 'CC0-1.0');
  assert.equal(lic.screen, 'none', 'nothing here needs an acknowledgement on screen');
  assert.equal(lic.derived, false, 'the library is written here, not derived');
  assert.ok(isStr(lic.source) && isStr(lic.text));
  assert.deepEqual(Object.keys(doc).sort(), ['_licence', 'categories', 'dialogues', 'format', 'phrases']);
});

test('no em dash and none of the banned words, anywhere in the file', () => {
  assert.ok(!RAW.includes(EM_DASH), 'the file contains U+2014');
  for (const [path, s] of strings(doc)) {
    assert.ok(!BANNED.test(s), `${path} uses a banned word: ${s}`);
  }
});

test('every id is well formed and unique, across phrases and dialogues too', () => {
  const seen = new Map();
  const claim = (kind, id) => {
    assert.ok(typeof id === 'string' && ID.test(id), `${kind} id ${JSON.stringify(id)} is not lower-case kebab`);
    assert.ok(!seen.has(id), `${kind} id ${id} is already a ${seen.get(id)} id`);
    seen.set(id, kind);
  };
  for (const c of doc.categories) claim('category', c.id);
  // Phrases and dialogues share one namespace: a view may link to either by id alone.
  for (const p of doc.phrases) claim('phrase', p.id);
  for (const d of doc.dialogues) claim('dialogue', d.id);
});

test('every category item is a phrase, and every phrase sits in exactly one category', () => {
  const phraseIds = new Set(doc.phrases.map((p) => p.id));
  const home = new Map();
  assert.ok(doc.categories.length > 0);
  for (const c of doc.categories) {
    assertBilingual(`category ${c.id}.title`, c.title);
    assert.ok(Array.isArray(c.items) && c.items.length > 0, `category ${c.id} is empty`);
    for (const id of c.items) {
      assert.ok(phraseIds.has(id), `category ${c.id} lists ${id}, which is not a phrase`);
      assert.ok(!home.has(id), `${id} is listed in ${home.get(id)} and in ${c.id}`);
      home.set(id, c.id);
    }
  }
  // A phrase in no category is written and never shown.
  for (const id of phraseIds) assert.ok(home.has(id), `phrase ${id} is in no category`);
});

test('every phrase has both languages, a register, and kana that reads its ja', () => {
  assert.ok(doc.phrases.length > 0);
  for (const p of doc.phrases) {
    const where = `phrase ${p.id}`;
    assertJapanese(where, p.ja, p.kana);
    assert.ok(isStr(p.en), `${where}.en is empty`);
    assert.ok(isStr(p.es), `${where}.es is empty`);
    assert.ok(REGISTERS.has(p.register), `${where}.register is ${p.register}`);
    assert.equal(typeof p.chunk, 'boolean', `${where}.chunk must be true or false`);
    // A set phrase is by definition the one learned whole.
    if (p.register === 'set') assert.equal(p.chunk, true, `${where} is a set phrase and not a chunk`);
    assertBilingual(`${where}.note`, p.note);
    assertBilingual(`${where}.situation`, p.situation);
    for (const lang of ['en', 'es']) {
      assert.ok(sentences(p.note[lang]) <= 2, `${where}.note.${lang} is longer than two sentences`);
      assert.ok(sentences(p.situation[lang]) <= 1, `${where}.situation.${lang} is more than one line`);
    }
  }
});

test('eight dialogues, four to eight lines each, one translation per line', () => {
  assert.equal(doc.dialogues.length, 8);
  for (const d of doc.dialogues) {
    const where = `dialogue ${d.id}`;
    assertBilingual(`${where}.title`, d.title);
    assertBilingual(`${where}.scene`, d.scene);
    assert.ok(Array.isArray(d.lines), `${where}.lines is missing`);
    assert.ok(d.lines.length >= 4 && d.lines.length <= 8, `${where} has ${d.lines.length} lines`);
    const voices = new Set();
    d.lines.forEach((line, i) => {
      assert.ok(SPEAKERS.has(line.speaker), `${where}.lines[${i}].speaker is ${line.speaker}`);
      voices.add(line.speaker);
      assertJapanese(`${where}.lines[${i}]`, line.ja, line.kana);
    });
    assert.equal(voices.size, 2, `${where} is a monologue`);
    assert.ok(d.translation && typeof d.translation === 'object', `${where}.translation is missing`);
    assert.deepEqual(Object.keys(d.translation).sort(), ['en', 'es']);
    for (const lang of ['en', 'es']) {
      const t = d.translation[lang];
      assert.ok(Array.isArray(t), `${where}.translation.${lang} is not a list`);
      assert.equal(t.length, d.lines.length, `${where}.translation.${lang} has ${t.length} lines for ${d.lines.length}`);
      t.forEach((s, i) => assert.ok(isStr(s), `${where}.translation.${lang}[${i}] is empty`));
    }
  }
});

test('the reading check itself refuses what it should', () => {
  // A gate that passes everything is decoration, so it is tested on known bad rows.
  assert.ok(readsAs('お名前は何ですか', 'おなまえはなんですか'));
  assert.ok(readsAs('「やさしい」はどういう意味ですか', 'やさしいはどういういみですか'));
  assert.ok(!readsAs('お名前は何ですか', 'おなまえわなんですか'), 'a particle written as said');
  assert.ok(!readsAs('メキシコから来ました', 'めきしこからきました'), 'katakana folded to hiragana');
  assert.ok(!readsAs('今何時ですか', 'いまなんじです'), 'a dropped ending');
  assert.ok(!readsAs('今何時ですか', 'ですか'), 'a kanji run with no reading');
});
