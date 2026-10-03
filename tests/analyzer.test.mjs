// The analyzer as a whole: names, the kanji list, numbers, the said line's
// words, and the properties every result has, against the committed shards.
//
//   node --test tests/analyzer.test.mjs
//
// sentences.test.mjs is the first-year list; this file is everything the
// fixes since then were for, one test per decision, so a later change to a
// cost that undoes one of them fails here with the case that forced it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { analyze, normalize, JAPANESE_KINDS } from '../js/analyze.js';
import { guessName } from '../js/names.js';
import { SITE, run, cut, saidLine, diskDict } from './helpers/disk.mjs';

const tok = (r, surface) => r.tokens.find((t) => t.surface === surface);
const kanjiOf = (r, ch) => r.kanji.find((k) => k.char === ch);

/**
 * The committed dictionary with the second phase's tiers taken away, which
 * is the first pass alone: analyze.js skips the second phase for a
 * dictionary that cannot load them.
 */
function firstPassOnly() {
  const d = diskDict();
  return { ...d, needRare: undefined, needNames: undefined, get maxKey() { return d.maxKey; } };
}
const first = firstPassOnly();

// ── Names ────────────────────────────────────────────────────────────────

test('a kanji run no key covers is one name: the first pass guesses it kun by kun, the names tier reads it', async () => {
  for (const [text, name, reading, said] of [
    ['田中さん', '田中', 'たなか', 'tanaka san'],
    ['鈴木さん', '鈴木', 'すずき', 'suzuki san'],
    ['高橋さん', '高橋', 'たかはし', 'takahashi san'],
    ['中村さん', '中村', 'なかむら', 'nakamura san'],
  ]) {
    const guessed = await analyze(text, { dict: first });
    assert.equal(cut(guessed), `${name}|さん`, text);
    const g = tok(guessed, name);
    assert.equal(g.kind, 'name');
    assert.equal(g.confidence, 'guess');
    assert.equal(g.reading, reading);
    assert.equal(g.furigana.length, [...name].length, 'one ruby per kanji');
    // The second phase finds the same surname in JMnedict, with the same
    // reading, and the token stops being a guess.
    const r = await run(text);
    assert.equal(cut(r), `${name}|さん`, text);
    const t = tok(r, name);
    assert.equal(t.kind, 'name');
    assert.equal(t.confidence, 'dict');
    assert.equal(t.reading, reading);
    assert.ok(t.entry.g.includes('surname'), `${name}: ${t.entry.g}`);
    assert.equal(saidLine(r), said);
    assert.equal(t.furigana.length, [...name].length, 'one ruby per kanji');
  }
});

test('a name with a kanji that has no kun, or a 藤 after the first, is read on', async () => {
  for (const [text, reading] of [['佐藤です', 'さとう'], ['伊藤さん', 'いとう'], ['加藤さん', 'かとう'], ['斎藤さん', 'さいとう']]) {
    const r = await run(text);
    assert.equal(r.tokens[0].kind, 'name', text);
    assert.equal(r.tokens[0].reading, reading, text);
  }
  // 田 after the first character is the likelier だ; first, it stays た.
  assert.equal((await run('山田さん')).tokens[0].reading, 'やまだ');
  assert.equal((await run('田中さん')).tokens[0].reading, 'たなか');
});

test('a name never swallows an honorific, a word, or a number with its counter', async () => {
  assert.equal(cut(await run('田中君')), '田中|君');
  assert.equal(cut(await run('社長の田中です')), '社長|の|田中|です');
  assert.equal(cut(await run('田中来ます')), '田中|来ます');
  const r = await run('朝八時に会いましょう');
  assert.equal(cut(r), '朝|八時|に|会いましょう');
  assert.equal(tok(r, '八時').reading, 'はちじ');
  // A compound the dictionary has is never a name.
  assert.equal(tok(await run('東京駅'), '東京').kind, 'word');
  assert.equal(tok(await run('私達'), '私達').kind, 'word');
});

test('子馬 is not in the data: a name guess, split kanji by kanji, said kouma', async () => {
  const r = await run('子馬');
  const t = r.tokens[0];
  assert.deepEqual(t.furigana, [{ text: '子', ruby: 'こ' }, { text: '馬', ruby: 'うま' }]);
  assert.equal(t.romaji.said, 'kouma', 'the cut between 子 and 馬 must keep o and u apart');
  assert.deepEqual(kanjiOf(r, '子').readings, ['こ']);
  assert.deepEqual(kanjiOf(r, '馬').readings, ['うま']);
});

test('guessName reads from kanji data alone', () => {
  const kanji = new Map([
    ['佐', { on: ['サ'], kun: [] }],
    ['々', null],
    ['木', { on: ['ボク', 'モク'], kun: ['き', 'こ-'] }],
    ['高', { on: ['コウ'], kun: ['たか.い', 'たか', '-だか'] }],
  ]);
  assert.deepEqual(guessName('高木', kanji), ['たか', 'き']);
  assert.deepEqual(guessName('佐木', kanji), ['さ', 'ぼく']);
  assert.deepEqual(guessName('木々', kanji), ['き', 'き']);
  assert.deepEqual(guessName('無', new Map()), ['']);
});

// ── The kanji list ───────────────────────────────────────────────────────

test('kanji read as a whole are listed with the whole reading, flagged', async () => {
  const r = await run('今日は大人の学生です');
  for (const [ch, run2, reading] of [['今', '今日', 'きょう'], ['日', '今日', 'きょう'], ['大', '大人', 'おとな'], ['人', '大人', 'おとな']]) {
    const k = kanjiOf(r, ch);
    assert.deepEqual(k.readings, [reading], ch);
    assert.equal(k.whole, true, ch);
    assert.deepEqual(k.wholeRuns, [{ run: run2, reading }], ch);
  }
  for (const [ch, reading] of [['学', 'がく'], ['生', 'せい']]) {
    const k = kanjiOf(r, ch);
    assert.deepEqual(k.readings, [reading], ch);
    assert.equal(k.whole, false, ch);
    assert.deepEqual(k.wholeRuns, []);
  }
  assert.deepEqual(tok(r, '今日').furigana, [{ text: '今日', ruby: 'きょう', whole: true }]);
});

test('the kanji list is in order of first appearance, and 々 lends its reading', async () => {
  const r = await run('人々と日本人が今日来ました');
  assert.deepEqual(r.kanji.map((k) => k.char), ['人', '日', '本', '今', '来']);
  const hito = kanjiOf(r, '人');
  assert.deepEqual(hito.readings, ['ひと', 'びと', 'じん']);
  assert.equal(hito.whole, false);
  assert.deepEqual(hito.tokens, [0, 2]);
  assert.ok(kanjiOf(r, '日').readings.includes('きょう'), 'a char can be read on its own and as part of a whole');
  assert.equal(kanjiOf(r, '日').whole, true);
  assert.ok(r.kanji.every((k) => k.info && Array.isArray(k.info.on)));
});

// ── Numbers ──────────────────────────────────────────────────────────────

test('何 with a counter asks how many, and bends like 3', async () => {
  for (const [text, reading] of [['何本', 'なんぼん'], ['何分', 'なんぷん'], ['何階', 'なんがい'], ['何人', 'なんにん'], ['何番線', 'なんばん|せん']]) {
    const r = await run(text);
    assert.equal(r.tokens.map((t) => t.reading).join('|'), reading, text);
  }
  assert.equal(tok(await run('何時ですか'), '何時').reading, 'なんじ');
});

test('a key spelled like a number keeps it only when it is among the commonest words', async () => {
  assert.equal((await run('十分です')).tokens[0].reading, 'じゅうぶん');
  assert.equal((await run('五分ぐらいです')).tokens[0].reading, 'ごふん');
  assert.equal((await run('一日')).tokens[0].reading, 'いちにち');
});

test('a number that bends inside itself carries the counter-change sound', async () => {
  for (const [text, reading] of [['六百', 'ろっぴゃく'], ['300', 'さんびゃく'], ['3,000円', 'さんぜんえん']]) {
    const t = (await run(text)).tokens[0];
    assert.equal(t.reading, reading, text);
    assert.ok(t.sounds.some((s) => s.type === 'counter-change'), text);
  }
  for (const text of ['二百', '百']) {
    const t = (await run(text)).tokens[0];
    assert.ok(!t.sounds.some((s) => s.type === 'counter-change'), text);
  }
});

// ── Segmentation decisions ───────────────────────────────────────────────

test('particles and the copula stay visible inside keys that would hide them', async () => {
  assert.equal(cut(await run('何分ぐらいですか')), '何分|ぐらい|です|か');
  assert.equal(cut(await run('山に登るんです')), '山|に|登る|ん|です');
  assert.equal(cut(await run('行きませんか')), '行きません|か');
  assert.equal(cut(await run('春になると')), '春|に|なる|と');
  // At the start of a run the conjunction stands.
  assert.equal(cut(await run('すると、雨が降りました')).split('|')[0], 'すると');
  assert.equal(cut(await run('だから、行きます')).split('|')[0], 'だから');
});

test('a noun and a particle beat a noun running straight into a verb', async () => {
  const r = await run('袋はいりません');
  assert.equal(cut(r), '袋|は|いりません');
  assert.equal(tok(r, 'は').kind, 'particle');
});

test('a run after a closing quote may open on a particle', async () => {
  const r = await run('「やさしい」はどういう意味ですか');
  assert.equal(tok(r, 'は').kind, 'particle');
  assert.equal(tok(r, 'は').romaji.said, 'wa');
});

test('a verb stem can stand as a noun, but never beats a conjugation', async () => {
  const egg = await run('卵焼き');
  assert.equal(cut(egg), '卵|焼き');
  assert.equal(tok(egg, '焼き').base, '焼く');
  assert.equal(tok(egg, '焼き').reading, 'やき');
  const eat = await run('お召し上がりですか');
  assert.equal(cut(eat), 'お|召し上がり|です|か');
  assert.equal(tok(eat, '召し上がり').reading, 'めしあがり');
  assert.equal(cut(await run('焼きます')), '焼きます');
  assert.equal(cut(await run('おすすめは何ですか')), 'お|すすめ|は|何|です|か');
});

test('a kanji with several readings is read the way the sentence means it', async () => {
  for (const [text, surface, reading] of [
    ['この本は面白い', '本', 'ほん'],
    ['駅の前に本屋があります', '前', 'まえ'],
    ['今何時ですか', '何時', 'なんじ'],
    ['お風呂に入ります', '入ります', 'はいります'],
    ['月がきれいです', '月', 'つき'],
    ['この人は先生です', '人', 'ひと'],
    ['上を見てください', '上', 'うえ'],
    ['心が痛い', '心', 'こころ'],
    ['外は寒いです', '外', 'そと'],
    ['今日は何曜日ですか', '何', 'なん'],
  ]) {
    const r = await run(text);
    const t = tok(r, surface);
    assert.ok(t, `${surface} in ${cut(r)}`);
    assert.equal(t.reading, reading, text);
  }
  // The same record order still stands where nothing argues with it.
  assert.equal(tok(await run('雨が降りそうですね'), '降りそう').reading, 'ふりそう');
});

test('a conjugated word connects as its last ending: そう takes です', async () => {
  assert.equal(cut(await run('雨が降りそうですね')), '雨|が|降りそう|です|ね');
});

test('a dictionary reading with katakana in it is folded to hiragana', async () => {
  const r = await run('私はアメリカ人です');
  const t = tok(r, 'アメリカ人');
  assert.equal(t.reading, 'あめりかじん');
  assert.deepEqual(t.furigana, [{ text: 'アメリカ' }, { text: '人', ruby: 'じん' }]);
  assert.equal(t.romaji.said, 'amerikajin');
});

test('いくと is the verb 行く with と, not the prefix 幾', async () => {
  const r = await run('いくと');
  assert.ok(r.tokens[0].entry.k.includes('行く'));
  assert.ok(r.tokens[1].grammar.some((g) => g.id === 'cond-to'));
});

// ── The said line's words ────────────────────────────────────────────────

test('one token is said as several words where a textbook writes several', async () => {
  for (const [text, said] of [
    ['行ってきます', 'itte kimasu'],
    ['持っていきます', 'motte ikimasu'],
    ['食べていました', 'tabete imashita'],
    ['食べませんでした', 'tabemasen deshita'],
    ['よろしくお願いします', 'yoroshiku onegaishimasu'],
    ['どういたしまして', 'doo itashimashite'],
    ['がくせいじゃありませんでした', 'gakusee ja arimasen deshita'],
    // and one word where it writes one
    ['おやすみなさい', 'oyasuminasai'],
    ['待ってる', 'matteru'],
    ['さようなら', 'sayoonara'],
  ]) {
    assert.equal(saidLine(await run(text)), said, text);
  }
});

// ── Properties of every result ───────────────────────────────────────────

const MIXED = 'ABCです。3,000円の本を2冊、\n  田中さんと読みました！「やさしい」は？ｺｰﾋｰ、ください。';

test('tokens tile the normalized text, offsets and all', async () => {
  const r = await run(MIXED);
  const text = normalize(MIXED);
  assert.equal(r.text, text);
  assert.equal(r.tokens.map((t) => t.surface).join(''), text);
  let at = 0;
  for (const [i, t] of r.tokens.entries()) {
    assert.equal(t.i, i);
    assert.equal(t.start, at);
    assert.equal(text.slice(t.start, t.end), t.surface);
    at = t.end;
  }
  assert.ok(r.tokens.some((t) => t.kind === 'newline'));
  assert.ok(r.tokens.some((t) => t.kind === 'latin'));
  assert.ok(r.tokens.some((t) => t.kind === 'space'));
});

test('every Japanese token has a hiragana reading, beats and both romaji lines', async () => {
  const r = await run(MIXED);
  for (const t of r.tokens.filter((x) => JAPANESE_KINDS.has(x.kind))) {
    assert.match(t.reading, /^[ぁ-ゖー]+$/u, t.surface);
    assert.equal(t.morae.join(''), t.reading, t.surface);
    assert.match(t.romaji.said, /^[a-z' ]+$/, t.surface);
    assert.ok(!/[āīūēō]/.test(t.romaji.said), 'never macrons');
    assert.ok(t.romaji.spelled, t.surface);
    assert.ok(!('aid' in t), 'analyze removes its working notes');
    assert.equal(t.furigana.map((f) => f.text).join(''), t.surface, t.surface);
  }
  assert.equal(r.unknown, r.tokens.filter((t) => t.confidence === 'guess' || t.kind === 'unknown').length);
});

test('the same text and data give the same result', async () => {
  const a = JSON.stringify(await run(MIXED));
  const b = JSON.stringify(await analyze(MIXED, { dict: diskDict() }));
  assert.equal(a, b);
});

test('a short text loads only the shards its keys fall in', async () => {
  const d = diskDict();
  await analyze('ねこ', { dict: d });
  const index = JSON.parse(readFileSync(join(SITE, 'data', 'dict', 'index.json'), 'utf8'));
  assert.ok(d.loaded >= 1 && d.loaded < index.shards.length, `${d.loaded} of ${index.shards.length}`);
});

test('a 500-character paragraph is read in well under a second once the shards are in', async () => {
  const lib = JSON.parse(readFileSync(join(SITE, 'data', 'phrases', 'library.json'), 'utf8'));
  const text = lib.dialogues.flatMap((d) => d.lines.map((l) => l.ja)).join('').slice(0, 500);
  assert.equal(text.length, 500);
  const d = diskDict();
  await analyze(text, { dict: d });
  const t0 = performance.now();
  const r = await analyze(text, { dict: d });
  const ms = performance.now() - t0;
  assert.equal(r.tokens.map((t) => t.surface).join(''), normalize(text));
  // Measured at about 10 ms on a 2024 laptop; the bound is loose so a slow
  // CI machine passes and a cost that went quadratic does not.
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
});
