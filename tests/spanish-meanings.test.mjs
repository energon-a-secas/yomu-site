// Spanish meanings beside the English ones (docs/ANALYZER.md, "Spanish
// meanings"), read from the committed data/es/ the way the page and the app
// read them: Spanish where JMdict, KANJIDIC or tools/lib/spanish-words.mjs
// has it, English where none does (said by the missing `es`), and for a
// reader in English the same answers, byte for byte, with no Spanish file
// fetched.
//
//   node --test tests/spanish-meanings.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

import { createDict } from '../js/dict.js';
import { analyze } from '../js/analyze.js';
import { createPageData } from '../js/kanji-page-data.js';
import { dailyOf } from '../js/daily.js';
import { esSrc } from '../js/es-files.js';
import { wordsWithEs } from '../js/spanish.js';
import { cardEntry, quizLabel, optionWithEs, KanjiCards } from '../js/kanji-cards.js';
import { spellingPool, KanaToKanji } from '../js/kana-to-kanji.js';
import { WORDS, CORRECTIONS } from '../tools/lib/spanish-words.mjs';
import { DATA } from './helpers/disk.mjs';

/** A dictionary over the committed data/ that keeps every path it fetches. */
function counted() {
  const paths = [];
  const fetchJson = async (p) => {
    paths.push(p.slice(DATA.length + 1));
    return JSON.parse(await readFile(p, 'utf8'));
  };
  return { dict: createDict({ fetchJson, base: `${DATA}/` }), fetchJson, paths };
}
const spanishFetched = (paths) => paths.filter((p) => p.startsWith('es/'));
const tokenOf = (result, surface) => result.tokens.find((t) => t.surface === surface);
const kanjiOf = (result, ch) => result.kanji.find((k) => k.char === ch);
const readJson = (rel) => JSON.parse(readFileSync(`${DATA}/${rel}`, 'utf8'));

const TEXTS = [
  '雨が降っています。', '私はペンを持っています。', 'いい天気ですね。', '駅で会う。',
  'テニストーナメントを見た。', '高木さんが来た。', '何名ですか。', '認めてくれてありがとう。',
];

test('雨 is lluvia, as a word and as a kanji, and the English stays beside it', async () => {
  const { dict } = counted();
  const r = await analyze('雨が降っています。', { dict, meanings: 'es' });
  const rain = tokenOf(r, '雨');
  assert.deepEqual(rain.entry.es, { g: ['lluvia'] });
  assert.equal(rain.entry.g[0], 'rain', 'the English gloss is untouched');
  assert.deepEqual(kanjiOf(r, '雨').info.es, { m: ['lluvia'] });
  assert.equal(kanjiOf(r, '雨').info.m[0], 'rain');
  assert.ok(tokenOf(r, '降っています').entry.es.g[0].includes('caer'), JSON.stringify(tokenOf(r, '降っています').entry.es));
});

test('ペン has a Spanish meaning, and everything else the word panel says of it is unchanged', async () => {
  const { dict } = counted();
  const text = '私はペンを持っています。';
  const pen = tokenOf(await analyze(text, { dict, meanings: 'es' }), 'ペン');
  assert.equal(pen.entry.es.g[0], 'bolígrafo, pluma');
  assert.deepEqual(pen.entry.g, ['pen'], 'the English beside it, which the loanword rules read');
  const english = tokenOf(await analyze(text, { dict }), 'ペン');
  const { es, ...entry } = pen.entry;
  assert.deepEqual({ ...pen, entry }, english, 'only the Spanish is new');
  assert.ok(es);
});

test('認 is a kanji with Spanish meanings, in a text and on its own', async () => {
  const { dict } = counted();
  const alone = await dict.kanjiEs(['認', '𠀋']);
  assert.deepEqual(alone.get('認'), ['reconocer', 'admitir', 'consentir']);
  assert.equal(alone.has('𠀋'), false, 'a character with no Spanish is simply not there');
  const r = await analyze('認めてくれてありがとう。', { dict, meanings: 'es' });
  assert.deepEqual(kanjiOf(r, '認').info.es, { m: ['reconocer', 'admitir', 'consentir'] });
});

test('は, だ, で and ね read in Spanish from the meanings written for Yomu', async () => {
  const { dict } = counted();
  const topic = tokenOf(await analyze('私は学生です。', { dict, meanings: 'es' }), 'は');
  assert.deepEqual(topic.entry.es.g, ['indica el tema de la oración', 'marca un contraste con otra opción (dicha o no)', 'añade énfasis']);
  assert.equal(topic.entry.g[0], 'indicates sentence topic');
  const plain = tokenOf(await analyze('今日は日曜日だ。', { dict, meanings: 'es' }), 'だ');
  assert.deepEqual(plain.entry.es.g, ['ser, estar (forma llana)']);
  const r = await analyze('駅で会いましょうね。', { dict, meanings: 'es' });
  assert.equal(tokenOf(r, 'で').entry.es.g[0], 'en (el lugar de la acción)');
  assert.equal(tokenOf(r, 'ね').entry.es.g[0], '¿verdad?, ¿no?');
  // A correction replaces JMdict's Spanish where it is in error: です is cortés with its accent.
  assert.deepEqual(tokenOf(await analyze('学生です。', { dict, meanings: 'es' }), 'です').entry.es.g, ['ser, estar (con cortesía)']);
});

test('where no Spanish exists the English stands, and no es says so', async () => {
  const { dict } = counted();
  const r = await analyze('何名ですか。', { dict, meanings: 'es' });
  const count = tokenOf(r, '何名');
  assert.deepEqual(count.entry.g, ['how many people']);
  assert.equal('es' in count.entry, false, 'JMdict has no Spanish for 何名: English, and nothing claims otherwise');
  // A name's types are always in Spanish; the word it is also, only where JMdict has it.
  const name = tokenOf(await analyze('高木さんが来た。', { dict, meanings: 'es' }), '高木');
  assert.deepEqual(name.entry.es, { g: ['apellido', 'nombre de lugar'] });
  assert.deepEqual(name.entry.also.es, { g: ['árbol de gran porte'] });
  const well = tokenOf(await analyze('清水を飲んだ。', { dict, meanings: 'es' }), '清水');
  assert.ok(well.entry.also && !('es' in well.entry.also), 'spring water has no Spanish in JMdict');
});

test('a katakana compound says its parts in Spanish, and joins them only when every part has some', async () => {
  const { dict } = counted();
  const r = await analyze('テニストーナメントを見た。', { dict, meanings: 'es' });
  const c = tokenOf(r, 'テニストーナメント');
  assert.deepEqual(c.parts.map((p) => p.es), [{ gloss: 'tenis' }, { gloss: 'torneo' }]);
  assert.deepEqual(c.es, { gloss: 'tenis + torneo' });
  assert.equal(c.gloss, 'tennis + tournament');
});

test('a reader in English gets the same tokens, byte for byte, and fetches no Spanish file', async () => {
  const plain = counted();
  const asked = counted();
  for (const text of TEXTS) {
    const a = JSON.stringify(await analyze(text, { dict: plain.dict }));
    const b = JSON.stringify(await analyze(text, { dict: asked.dict, meanings: 'en' }));
    assert.equal(a, b, text);
    assert.ok(!a.includes('"es":'), `${text}: no es for a reader in English`);
    // The page passes its language as `lang`; Spanish meanings are their own option.
    assert.equal(JSON.stringify(await analyze(text, { dict: plain.dict, lang: 'es' })), a, `${text}: lang alone changes nothing`);
  }
  assert.deepEqual(spanishFetched(plain.paths), []);
  assert.deepEqual(spanishFetched(asked.paths), []);
  assert.equal(plain.dict.loadedEs, 0);
});

test('a read in Spanish writes nothing onto the shared records: English after it is what it was', async () => {
  const { dict, paths } = counted();
  const before = [];
  for (const text of TEXTS) before.push(JSON.stringify(await analyze(text, { dict })));
  for (const text of TEXTS) await analyze(text, { dict, meanings: 'es' });
  assert.ok(spanishFetched(paths).length > 0, 'the Spanish reads did fetch Spanish');
  for (const [k, text] of TEXTS.entries()) assert.equal(JSON.stringify(await analyze(text, { dict })), before[k], text);
  // The same text twice in Spanish is the same too: the analysis is pure.
  const once = JSON.stringify(await analyze('雨が降っています。', { dict, meanings: 'es' }));
  assert.equal(JSON.stringify(await analyze('雨が降っています。', { dict, meanings: 'es' })), once);
});

test('a read in Spanish fetches the Spanish of the files it read, and only those', async () => {
  const { dict, paths } = counted();
  await analyze('雨が降っています。', { dict, meanings: 'es' });
  const english = paths.filter((p) => /^(dict|kanji)\/(core|w\d+|r\d+|k\d+)\.json$/.test(p));
  for (const p of spanishFetched(paths)) assert.ok(english.includes(p.slice('es/'.length)), `${p} mirrors a file the read fetched`);
  assert.ok(spanishFetched(paths).includes('es/dict/core.json'));
});

test('a kanji page\'s words, the kanji of the day and a kanji card carry their Spanish beside the English', async () => {
  const { fetchJson, paths } = counted();
  const pages = createPageData({ fetchJson, base: `${DATA}/` });
  const page = await pages.pageOf('日');
  assert.deepEqual(spanishFetched(paths), [], 'a page alone fetches no Spanish');
  const words = wordsWithEs(page.words, await pages.wordsEs('日'));
  const day = words.find((w) => w.written === '一日');
  assert.deepEqual(day.es, { gloss: 'un día' }, 'a correction: JMdict led with the first day of the month');
  assert.equal(day.gloss, 'one day');
  assert.deepEqual(await pages.wordsEs('〆'), [], 'a character with no page has no Spanish');

  const doc = readJson('kpage/daily.json');
  const es = readJson('es/kpage/daily.json');
  const today = '2026-11-07';
  const plain = dailyOf(doc, today);
  const both = dailyOf(doc, today, es);
  assert.equal(JSON.stringify({ ...both, es: undefined }), JSON.stringify(plain), 'the English row is unchanged');
  assert.ok(both.es && both.es.meaning, JSON.stringify(both));
  assert.equal(JSON.stringify(dailyOf(doc, today, { rows: [] })), JSON.stringify(plain), 'Spanish of other rows is not used');

  const rec = { on: ['ニチ'], kun: ['ひ'], m: ['day', 'sun', 'Japan'], s: 4, g: 1 };
  const row = ['日', 'day, sun', '一日', 'いちにち', 'one day'];
  const card = cardEntry(rec, { level: 5, row, es: { m: ['día', 'solar', 'Japón'], gloss: 'un día' } });
  assert.deepEqual(card.es, { label: 'día', m: ['día', 'solar', 'Japón'], w: ['一日', 'いちにち', 'un día'] });
  assert.deepEqual({ ...card, es: undefined }, { ...cardEntry(rec, { level: 5, row }), es: undefined });
  assert.equal('es' in cardEntry(rec, { level: 5, row }), false);
  assert.equal('es' in cardEntry(rec, { row, es: { m: [], gloss: null } }), false, 'no Spanish, no es');
});

test('the quiz deals Spanish labels to a reader in Spanish and shows each beside its English', () => {
  const entries = Object.fromEntries([['日', 'day', 'día'], ['月', 'month', 'luna'], ['火', 'fire', 'fuego'], ['水', 'water', null], ['木', 'tree', 'árbol']]
    .map(([ch, en, es]) => [ch, { label: en, ...(es ? { es: { label: es } } : {}) }]));
  const labels = Object.fromEntries(Object.entries(entries).map(([ch, e]) => [ch, quizLabel(e, true)]));
  assert.deepEqual(labels, { 日: 'día', 月: 'luna', 火: 'fuego', 水: 'water', 木: 'árbol' });
  assert.equal(quizLabel(entries['日']), 'day', 'in English the label is English');
  const cards = new KanjiCards();
  const v = cards.start({ deck: 'n5', chars: Object.keys(entries), mode: 'quiz', labels, today: '2026-11-07', seed: 3 });
  const shown = v.session.card.options.map((o) => optionWithEs(o, entries[o.ch]));
  for (const o of shown) {
    assert.equal(o.label, entries[o.ch].label, 'label is English in every option');
    if (entries[o.ch].es) assert.deepEqual(o.es, { label: entries[o.ch].es.label });
    else assert.equal('es' in o, false, `${o.ch}: no Spanish, said by no es`);
  }
  const english = { ch: '日', label: 'day' };
  assert.equal(optionWithEs(english, entries['日']), english, 'a label dealt in English stays as it is');
});

test('Kana to kanji puts a word\'s Spanish beside its hint and its gloss, and only where the word has one', () => {
  const W = (written, reading, gloss, es) => ({ written, reading, gloss, ...(es ? { es: { gloss: es } } : {}) });
  const page = [W('学校', 'がっこう', 'school', 'escuela'), W('学生', 'がくせい', 'student', 'estudiante'),
    W('大学', 'だいがく', 'university', 'universidad'), W('化学', 'かがく', 'chemistry'), W('学年', 'がくねん', 'school year', 'año escolar')];
  const pool = spellingPool(['学'], new Map([['学', page]]), new Set([...'学校生大化年']));
  assert.deepEqual(pool.find((w) => w.written === '化学'), { written: '化学', reading: 'かがく', gloss: 'chemistry' });
  assert.deepEqual(pool.find((w) => w.written === '学校').es, { gloss: 'escuela' });
  const game = new KanaToKanji();
  let v = game.start({ deck: 'n5', words: pool, seed: 5 });
  const { id } = v.round.question;
  v = game.act('hint', { id });
  const target = pool.find((w) => w.reading === v.round.question.prompt);
  assert.equal(v.round.question.hint, target.gloss);
  if (target.es) assert.deepEqual(v.round.question.es, { hint: target.es.gloss });
  else assert.equal('es' in v.round.question, false);
  v = game.act('answer', { id, pick: v.round.question.correctId || `${target.written}|${target.reading}` });
  for (const o of v.round.question.options) {
    const w = pool.find((x) => `${x.written}|${x.reading}` === o.id);
    assert.deepEqual(o.es, w.es ? { gloss: w.es.gloss } : undefined, o.id);
  }
  // The round, Spanish and all, survives a relaunch.
  assert.deepEqual(new KanaToKanji(game.dump()).view(), game.view());
  const bad = JSON.parse(JSON.stringify(game.dump()));
  bad.round.questions[0].target.es = { gloss: 7 };
  assert.equal(new KanaToKanji(bad).recovered, true, 'a malformed Spanish gloss is not trusted');
});

test('the Spanish files mirror the English ones, and the meanings written for Yomu are where they say', () => {
  assert.equal(esSrc('data/dict/w03.json'), 'data/es/dict/w03.json');
  assert.equal(WORDS.length, 40);
  assert.deepEqual(WORDS.slice(0, 4).map((w) => w[1]), ['は', 'だ', 'で', 'ね']);
  const ids = new Set([...WORDS, ...CORRECTIONS].map((w) => w[0]));
  assert.equal(ids.size, WORDS.length + CORRECTIONS.length, 'no entry is written twice');
  for (const [, word, meanings] of [...WORDS, ...CORRECTIONS]) {
    assert.ok(meanings.length >= 1 && meanings.length <= 3, word);
    for (const m of meanings) assert.ok(m.length <= 60 && !m.includes(String.fromCharCode(0x2014)), `${word}: ${m}`);
  }
  // は is the first record of its key, and its Spanish file says it in Yomu's words; 雨 in JMdict's.
  const index = readJson('dict/index.json');
  const fileOf = (key) => {
    if (Object.hasOwn(readJson('dict/core.json').entries, key)) return index.core.src;
    return index.shards.filter((s) => s.first <= key).at(-1).src;
  };
  const esOf = (key) => {
    const doc = readJson(esSrc(fileOf(key)).slice('data/'.length));
    assert.equal(doc.of.src, fileOf(key));
    return doc.entries[key];
  };
  assert.equal(esOf('は')[0][0], 'indica el tema de la oración');
  assert.equal(esOf('雨')[0][0], 'lluvia');
});
