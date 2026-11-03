// Words by level (js/word-levels.js) and the data step behind it
// (tools/lib/jlpt-words.mjs): reading Waller's vocabulary pages, finding
// each word in the committed dictionary and choosing its record, the
// documents the builder writes and the rules the checker holds them to.
// His pages have not been read into data/ yet, so the documents here are
// made from words of the dictionary, and the parser's page is written in
// the shape his kanji pages have.
//
//   node --test tests/word-levels.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  savableRow, createWordLevels, WORD_LEVELS, JLPT_WORD_SIZES, WORD_LEVELS_READY, WORDS_SRC, WORDS_FORMAT, WORDS_INDEX_FORMAT,
} from '../js/word-levels.js';
import {
  wallerWords, wallerPage, rowOf, rowsOf, readingsOf, resolveRow, chooseRows, chooseRecord, candidatesOf, keysOf, resolvesIn, jlptWordsDocs, jlptWordsProblems, wordKey, cellText,
  wordsLicence,
} from '../tools/lib/jlpt-words.mjs';
import { MAX_BYTES } from '../tools/lib/emit.mjs';
import { licenceBlock } from '../tools/lib/licence.mjs';
import { diskDict, fetchJson, SITE } from './helpers/disk.mjs';

const PAGE = `<html><body>
<table><tr><td><a href="VocabList.N5.doc">VocabList.N5.doc</a></td></tr></table>
<p>JLPT N5 Vocab list</p>
<table width="100%" border="1">
<tr><th>Kanji</th><th>Hiragana</th><th>English</th></tr>
<tr><td><a class="nounderline" href="/jlpt/skills/vocab/sentences/?vocabid=1">会う </a></td><td><a href="/x">あう</a></td><td><a href="/x">to meet</a></td></tr>
<tr><td></td><td><a href="/x">いくら</a></td><td><a href="/x">how much?</a></td></tr>
<tr><td><a href="/x">テレビ</a></td><td><a href="/x">てれび</a></td><td><a href="/x">television, TV</a></td></tr>
<tr><td><a href="/x">上手&nbsp;</a></td><td>じょうず</td><td>skillful &amp; good</td></tr>
<tr><td></td><td></td><td>a row with nothing in it</td></tr>
<tr><th>Kanji</th><th>Hiragana</th><th>English</th></tr>
<tr><td>一昨日</td><td>おととい<br>おとつい</td><td>day before yesterday</td></tr>
</table>
<p>Page 2</p>
<table><tr><th>Kanji</th><th>Hiragana</th></tr><tr><td>猫</td><td>ねこ</td></tr></table>
<table><tr><td>Home</td><td>N5 kanji</td></tr></table>
</body></html>`;

test('a vocabulary page gives the Kanji, Hiragana and English cells of each row of every table so headed, nothing above them', () => {
  assert.deepEqual(wallerWords(PAGE), [
    ['会う', 'あう', 'to meet'], ['', 'いくら', 'how much?'], ['テレビ', 'てれび', 'television, TV'], ['上手', 'じょうず', 'skillful & good'],
    ['一昨日', 'おととい おとつい', 'day before yesterday'], ['猫', 'ねこ', ''],
  ], 'a heading row the table repeats is passed over, and a list split over two tables is read whole');
  const page = wallerPage(PAGE);
  assert.equal(page.tables, 2);
  assert.deepEqual(page.stray, [], 'a table of links in English is no row of his');
  assert.deepEqual(page.short, [], 'a row of his with no Japanese in it is passed over');
  assert.deepEqual(wallerWords('<table><tr><th>Kanji</th><th>Hiragana</th></tr><tr><td>猫</td><td>ねこ</td></tr></table>'), [['猫', 'ねこ', '']], 'a page with no English column');
  assert.throws(() => wallerWords('<table><tr><th>Kanji</th><th>Onyomi</th></tr><tr><td>日</td><td>ニチ</td></tr></table>'), /no table headed Kanji and Hiragana/);
  assert.throws(() => wallerWords('<table><tr><th>Kanji</th><th>Hiragana</th></tr></table>'), /have no rows/);
  assert.equal(cellText('<a>&#x4e00;&#26085;&nbsp; &lt;x&gt;　</a>'), '一日 <x>');
  assert.equal(cellText('おととい<br/>おとつい'), 'おととい おとつい', 'a line break keeps two readings apart');
});

test('rows that look like words outside the headed tables are reported, not dropped', () => {
  const split = `<table><tr><th>Kanji</th><th>Hiragana</th><th>English</th></tr>
<tr><td>会う</td><td>あう</td><td>to meet</td></tr></table>
<table><tr><td>猫</td><td>ねこ</td><td>cat</td></tr><tr><td>Next page</td><td>2</td></tr></table>`;
  const page = wallerPage(split);
  assert.deepEqual(page.rows, [['会う', 'あう', 'to meet']]);
  assert.deepEqual(page.stray, [['猫', 'ねこ', 'cat']], 'a table that goes on without its headings');
  const layout = `<table><tr><td>menu</td><td><table><tr><th>Kanji</th><th>Hiragana</th></tr><tr><td>会う</td><td>あう</td></tr></table></td></tr>
<tr><td>日本語</td><td>にほんご</td></tr></table>`;
  assert.deepEqual(wallerPage(layout).stray, [['日本語', 'にほんご']], 'a row of the layout table after his');
  assert.deepEqual(wallerPage(layout).rows, [['会う', 'あう', '']]);
});

test('rows of a headed table that hold Japanese but not in its Kanji and Hiragana cells are reported, not dropped', () => {
  const page = wallerPage(`<table><tr><th>Kanji</th><th>Hiragana</th><th>English</th></tr>
<tr><td>会う</td><td>あう</td><td>to meet</td></tr>
<tr><td>ねこ</td></tr>
<tr><td colspan="3">あ行 いぬ</td></tr>
<tr><th colspan="3">か</th></tr>
<tr><td></td><td></td><td>see 会う</td></tr>
<tr><td colspan="3">Page 2</td></tr>
<tr><td></td><td></td><td>nothing</td></tr>
</table>`);
  assert.deepEqual(page.rows, [['会う', 'あう', 'to meet']]);
  assert.deepEqual(page.short, [['ねこ'], ['あ行 いぬ'], ['か'], ['', '', 'see 会う']],
    'a row short of the cells, one cell across the table, a heading in kana, and Japanese outside both cells');
  assert.deepEqual(page.stray, []);
});

test('a row is its kanji spelling and reading, or a kana word alone', () => {
  assert.deepEqual(rowOf(['会う', 'あう', 'to meet']), ['会う', 'あう']);
  assert.deepEqual(rowOf(['', 'いくら']), ['いくら', '']);
  assert.deepEqual(rowOf(['いくら', 'いくら']), ['いくら', '']);
  assert.deepEqual(rowOf(['テレビ', 'てれび']), ['テレビ', ''], 'a katakana word his kana column spells in hiragana');
  assert.deepEqual(rowOf(['テレビ', '']), ['テレビ', '']);
  assert.equal(rowOf(['', '']), null);
  assert.deepEqual(rowOf(['', 'おととい おとつい']), ['おととい おとつい', ''], 'a kana cell alone is the written form, whatever it holds');
  assert.equal(wordKey(['いくら', '']), wordKey(['いくら', 'いくら']));
});

test('a row may be read as its cells, as its cells joined, or as each part a cell gives', () => {
  assert.deepEqual(readingsOf(['一昨日', 'おととい・おとつい']), {
    whole: ['一昨日', 'おととい・おとつい'], joined: ['一昨日', 'おとといおとつい'], parts: [['一昨日', 'おととい'], ['一昨日', 'おとつい']],
  });
  assert.deepEqual(readingsOf(['', 'ボール・ペン']), { whole: ['ボール・ペン', ''], joined: ['ボールペン', ''], parts: [['ボール', ''], ['ペン', '']] });
  assert.deepEqual(readingsOf(['ワイ・シャツ', 'わい・しゃつ']).joined, ['ワイシャツ', ''], 'joined, a katakana word his kana column spells in hiragana');
  assert.deepEqual(readingsOf(['', 'どうぞ よろしく']).joined, ['どうぞよろしく', ''], 'a space separates, as a line break in the cell does');
  assert.deepEqual(readingsOf(['会う、逢う', 'あう']).parts, [['会う', 'あう'], ['逢う', 'あう']]);
  for (const sep of ['・', '、', '，', ',', '/', '／', ';', '；', ' ']) {
    assert.deepEqual(readingsOf(['', `あした${sep}あす`]).parts, [['あした', ''], ['あす', '']], `${JSON.stringify(sep)} separates`);
  }
  assert.deepEqual(readingsOf(['会う', 'あう']), { whole: ['会う', 'あう'], joined: null, parts: [] }, 'one of each is the row alone');
  assert.deepEqual(readingsOf(['', '']), { whole: null, joined: null, parts: [] });
  assert.deepEqual(rowsOf(['一昨日', 'おととい・おとつい']), [['一昨日', 'おととい・おとつい'], ['一昨日', 'おとといおとつい'], ['一昨日', 'おととい'], ['一昨日', 'おとつい']], 'every reading, for the keys');
  assert.deepEqual(rowsOf(['テレビ', 'てれび']), [['テレビ', '']]);
  assert.deepEqual(rowsOf(['', '']), []);
});

/** The committed dictionary with these rows' keys loaded, both tiers, and lookups over each. */
async function loaded(rows) {
  const dict = diskDict();
  const keys = keysOf(rows);
  await dict.need(keys);
  await dict.needRare(keys);
  return { dict, first: (k) => dict.get(k), rare: (k) => dict.rare(k) };
}

test('a listed word is a record its spelling and reading name, and his English chooses among them', async () => {
  const { first, rare } = await loaded([['食べる', 'たべる'], ['一日', 'ついたち'], ['彼奴', 'あいつ'], ['あの', ''], ['いか', ''], ['えびす講', 'えびすこう']]);
  assert.deepEqual(candidatesOf(first, '食べる', 'たべる').map((r) => r.g[0]), ['to eat']);
  assert.deepEqual(candidatesOf(first, '一日', 'ついたち').map((r) => r.g[0]), ['first day of the month'], 'the reading picks the record');
  assert.deepEqual(candidatesOf(first, '彼奴', 'あいつ').map((r) => r.g[0]), ['he'], 'a spelling the first tier files only under its kana');
  assert.deepEqual(candidatesOf(first, '食べる', 'のむ'), [], 'a spelling read another way than any of its records');
  assert.deepEqual(candidatesOf(first, 'いくら', 'イクラ'), [], 'a kana word read another way names nothing');
  assert.deepEqual(candidatesOf(first, '存在しない語', 'そんざい'), []);
  assert.deepEqual(candidatesOf(first, 'えびす講', 'えびすこう'), []);
  assert.equal(candidatesOf(rare, 'えびす講', 'えびすこう')[0].tier, 2, 'a word only the rare tier holds');
  const ano = candidatesOf(first, 'あの', '');
  assert.ok(ano.length > 1 && ano[0].g[0] === 'say', 'あの is the filler first, then "that"');
  assert.equal(chooseRecord(ano, 'that over there', true).g[0], 'that', 'his English chooses');
  assert.equal(chooseRecord(ano, '', true).g[0], 'say', 'with nothing to go on, the dictionary\'s order');
  const ika = candidatesOf(first, 'いか', '');
  assert.equal(ika[0].g[0], 'not exceeding ...');
  assert.equal(chooseRecord(ika, '', true).g[0], 'cuttlefish', 'a kana word is one usually written in kana, not 以下');
  assert.equal(chooseRecord(ika, 'squid', true).g[0], 'cuttlefish', 'his English names no word of any record: still the kana word');
  assert.equal(chooseRecord(ika, 'below, the following', true).g[0], 'not exceeding ...', 'his English outweighs the kana rule');
  assert.equal(chooseRecord([], 'anything'), null);
  assert.deepEqual(keysOf([['一日', 'イチニチ'], ['いくら', '']]), ['一日', 'いちにち', 'いくら']);
});

test('a cell of several words is read only when it is sure which word it is, never as its first part', async () => {
  const cases = [
    [['', 'どうぞ よろしく', 'pleased to meet you'], 'joined', ['どうぞよろしく', ''], 'pleased to meet you'],
    [['', 'ボール・ペン', 'ball-point pen'], 'joined', ['ボールペン', ''], 'ball-point pen'],
    [['', 'ボール・ペン', ''], 'joined', ['ボールペン', ''], 'ball-point pen'],
    [['', 'テープ・レコーダー', 'tape recorder'], 'joined', ['テープレコーダー', ''], 'tape recorder'],
    [['ワイ・シャツ', 'わい・しゃつ', 'shirt'], 'joined', ['ワイシャツ', ''], '(formal) shirt'],
    [['一昨日', 'おととい・おとつい', 'day before yesterday'], 'parts', ['一昨日', 'おととい'], 'day before yesterday'],
    [['', 'おととい・おとつい', ''], 'parts', ['おととい', ''], 'day before yesterday'],
    [['会う・逢う', 'あう', 'to meet'], 'parts', ['会う', 'あう'], 'to meet'],
    [['会う', 'あう', 'to meet'], 'whole', ['会う', 'あう'], 'to meet'],
  ];
  const refused = [
    [['上手', 'じょうず・うわて', 'skillful'], /its parts are not one word: 上手 じょうず "skillful", 上手 うわて "upper part"/],
    [['', 'わい・しゃつ', 'shirt'], /its parts are not one word: わい "I", しゃつ \(no word\)/],
    [['', 'ワイ・シャツ', 'towel'], /read as one word it is ワイシャツ "\(formal\) shirt", which his English does not name/],
    [['存在しない語', 'そんざい', ''], /is no word of the dictionary/],
  ];
  const { first, rare } = await loaded([...cases, ...refused].flatMap(([cells]) => rowsOf(cells)));
  const lookup = (w, r) => {
    const own = candidatesOf(first, w, r);
    return own.length ? own : candidatesOf(rare, w, r);
  };
  for (const [cells, how, row, gloss] of cases) {
    const got = resolveRow(cells, lookup);
    assert.deepEqual([got.how, got.row, got.rec && got.rec.g[0]], [how, row, gloss], JSON.stringify(cells));
  }
  for (const [cells, why] of refused) assert.match(resolveRow(cells, lookup).why, why, JSON.stringify(cells));
  const noBallpoint = (w, r) => (w === 'ボールペン' ? [] : lookup(w, r));
  assert.match(resolveRow(['', 'ボール・ペン', 'ball-point pen'], noBallpoint).why, /its parts are not one word: ボール "ball", ペン "pen"/,
    'a compound the dictionary lacks is refused, not read as ボール');
  const readAs = new Map([['上手 じょうず・うわて', ['上手', 'じょうず']], ['ボール・ペン', ['ボールペンX', '']]]);
  const read = resolveRow(['上手', 'じょうず・うわて', 'skillful'], lookup, readAs);
  assert.deepEqual([read.how, read.row, read.rec.g[0]], ['READ_AS', ['上手', 'じょうず'], 'skillful'], 'a person says which word it is');
  assert.match(resolveRow(['', 'ボール・ペン', ''], lookup, readAs).why, /READ_AS reads it as \["ボールペンX",""\], which is no word/);
});

test('Save keeps the row\'s spelling and reading and its first meaning', () => {
  assert.deepEqual(savableRow(['会う', 'あう', ['to meet', 'to have an accident']]), { w: '会う', r: 'あう', g: 'to meet' });
  assert.deepEqual(savableRow(['いくら', '', ['how much']]), { w: 'いくら', r: 'いくら', g: 'how much' });
  assert.equal(savableRow(['会う', 'あう', []]), null);
  assert.equal(savableRow(null), null);
});

test('the words each level keeps: a repeat stays at the easier level, a named row is left out, any other unknown row refuses', () => {
  const ototoi = { g: ['day before yesterday'] };
  const recs = new Map([
    ['会う|あう', [{ g: ['to meet'] }]], ['いくら|', [{ g: ['salmon roe'] }, { g: ['how much'], u: 1 }]], ['上手|じょうず', [{ g: ['skillful'] }]], ['下手|へた', [{ g: ['unskillful'] }]],
    ['一昨日|おととい', [ototoi]], ['一昨日|おとつい', [ototoi]], ['ボールペン|', [{ g: ['ball-point pen'] }]], ['ボール|', [{ g: ['ball'] }]], ['ペン|', [{ g: ['pen'] }]],
    ['どうぞ|', [{ g: ['please'] }]], ['よろしく|', [{ g: ['regards'] }]], ['テープ|', [{ g: ['tape'] }]], ['どうぞよろしく|', [{ g: ['pleased to meet you'] }]],
  ]);
  const lookup = (w, r) => recs.get(`${w}|${r}`) || [];
  const raw = {
    n5: [['会う', 'あう', 'to meet'], ['', 'いくら', 'how much?'], ['会う', 'あう', 'to meet'], ['', 'ボール・ペン', 'ball-point pen']],
    n4: [['上手', 'じょうず', 'skillful'], ['', 'いくら', ''], ['～円', 'えん', 'yen'], ['', 'テープ・レコーダー', 'tape recorder']],
    n3: [['下手', 'へた', 'unskillful'], ['猫又', 'ねこまた', 'a cat monster'], ['一昨日', 'おとつい おととい', 'day before yesterday'], ['', 'どうぞ よろしく', '']],
    n2: [['一昨日', 'おととい', 'day before yesterday']],
  };
  const left = new Map([['～円 えん', 'a suffix, not a word'], ['犬 いぬ', 'stale']]);
  const got = chooseRows(raw, lookup, left, new Map([['どうぞ よろしく', ['どうぞよろしく', '']], ['猫 ねこ', ['猫', 'ねこ']]]));
  assert.deepEqual(got.levels, {
    n5: [['会う', 'あう', ['to meet']], ['いくら', '', ['how much']], ['ボールペン', '', ['ball-point pen']]],
    n4: [['上手', 'じょうず', ['skillful']]],
    n3: [['下手', 'へた', ['unskillful']], ['一昨日', 'おとつい', ['day before yesterday']], ['どうぞよろしく', '', ['pleased to meet you']]],
    n2: [],
    n1: [],
  });
  assert.equal(got.chosen, 1, 'いくら took its second record, on his English');
  assert.deepEqual(got.read.map((x) => [x.id, x.row[0], x.row[1], x.how]), [['n5', 'ボールペン', '', 'joined'], ['n3', '一昨日', 'おとつい', 'parts'], ['n3', 'どうぞよろしく', '', 'READ_AS']],
    'each row read other than as its cells is named, the two readings of one record kept as the first');
  assert.deepEqual(got.repeats.map((x) => [x.id, x.first, x.row[0], x.row[1]]), [['n5', 'n5', '会う', 'あう'], ['n4', 'n5', 'いくら', ''], ['n2', 'n3', '一昨日', 'おととい']],
    'and repeats, the same record read another way among them');
  assert.deepEqual(got.left.map((x) => x.why), ['a suffix, not a word']);
  assert.deepEqual(got.unresolved.map((x) => [x.row[0], x.why]), [
    ['テープ・レコーダー', 'its parts are not one word: テープ "tape", レコーダー (no word)'],
    ['猫又', 'is no word of the dictionary'],
  ], 'a compound with a part the dictionary lacks is refused, not kept as テープ');
  assert.deepEqual(got.stale, ['犬 いぬ']);
  assert.deepEqual(got.staleReadAs, ['猫 ねこ']);
});

/** Five small levels of real words with their records' glosses, the documents for them, and their sizes. */
async function sample() {
  const words = {
    n5: [['会う', 'あう'], ['いくら', ''], ['テレビ', '']],
    n4: [['上手', 'じょうず'], ['一日', 'ついたち']],
    n3: [['彼奴', 'あいつ']],
    n2: [['一日', 'いちにち']],
    n1: [['えびす講', 'えびすこう']],
  };
  const { first, rare } = await loaded(Object.values(words).flat());
  const levels = {};
  for (const id of WORD_LEVELS) {
    levels[id] = words[id].map(([w, r]) => {
      const own = candidatesOf(first, w, r);
      return [w, r, chooseRecord(own.length ? own : candidatesOf(rare, w, r), '', !r).g];
    });
  }
  const sizes = Object.fromEntries(WORD_LEVELS.map((id) => [id, levels[id].length]));
  const { index, files } = jlptWordsDocs(levels, wordsLicence('tests/word-levels.test.mjs'));
  return { levels, sizes, index, files: new Map(files), resolves: resolvesIn(first, rare), first };
}

test('the documents: an index of the five levels and one file each while it fits, read back as they were written', async () => {
  const { sizes, index, files, resolves } = await sample();
  assert.equal(index.format, WORDS_INDEX_FORMAT);
  assert.equal(index.count, 8);
  assert.deepEqual(index.levels.n4, { n: 2, files: ['data/words/n4-0.json'] });
  assert.equal(files.get('data/words/n4-0.json').format, WORDS_FORMAT);
  assert.equal(files.get('data/words/n4-0.json').level, 'n4');
  assert.deepEqual(files.get('data/words/n4-0.json').rows[1], ['一日', 'ついたち', ['first day of the month']]);
  assert.deepEqual(jlptWordsProblems(index, (rel) => files.get(rel), { sizes, resolves }), []);
  // a level larger than one file fills as many as the cap asks, in order
  const many = Array.from({ length: 6000 }, (_, i) => [`語${String(i).padStart(4, '0')}`, 'ご'.repeat(8), ['a word of a level larger than one file']]);
  const big = jlptWordsDocs({ n1: many }, wordsLicence('tests/word-levels.test.mjs'));
  assert.ok(big.index.levels.n1.files.length > 1);
  assert.deepEqual(big.files.flatMap(([, d]) => d.rows), many);
  for (const [, doc] of big.files) assert.ok(Buffer.byteLength(JSON.stringify(doc)) < MAX_BYTES);
});

test('the rules: sizes, repeats, rows out of shape, glosses no record has, and an unpinned size each say what is wrong', async () => {
  const base = await sample();
  const check = (edit, opts = {}) => {
    const copy = structuredClone({ index: base.index, files: Object.fromEntries(base.files) });
    edit(copy);
    return jlptWordsProblems(copy.index, (rel) => copy.files[rel], { sizes: base.sizes, ...opts }).join('\n');
  };
  const { resolves } = base;
  assert.equal(check(() => {}, { resolves }), '');
  assert.match(check((c) => { c.files['data/words/n5-0.json'].rows.pop(); c.index.levels.n5.n -= 1; c.index.count -= 1; }), /n5 holds 2 words, not 3/);
  assert.match(check((c) => { c.files['data/words/n2-0.json'].rows.push(c.files['data/words/n5-0.json'].rows[0]); c.index.levels.n2.n += 1; c.index.count += 1; }), /会う あう is in n5 and n2/);
  assert.match(check((c) => { c.files['data/words/n3-0.json'].rows[0] = ['存在しない語', 'そんざい', ['nothing']]; }, { resolves }), /n3: 存在しない語 そんざい \["nothing"\] is no record of the dictionary/);
  assert.match(check((c) => { c.files['data/words/n4-0.json'].rows[1][2] = ['one day']; }, { resolves }), /n4: 一日 ついたち \["one day"\] is no record/, 'another record\'s glosses');
  assert.match(check((c) => { c.files['data/words/n5-0.json'].rows[1][1] = 'いくら'; }), /row 1 gives its reading when it is the written form/);
  assert.match(check((c) => { c.files['data/words/n5-0.json'].rows[0][1] = ''; }), /row 0 has no reading, and its written form is not kana/);
  assert.match(check((c) => { c.files['data/words/n5-0.json'].rows[0][2] = []; }), /row 0 has no glosses/);
  assert.match(check((c) => { c.index.levels.n1.files.push('data/words/n1-1.json'); }), /n1 lists data\/words\/n1-1\.json, which is missing/);
  assert.match(check((c) => { c.index.count = 9; }), /count is 9, and the levels hold 8/);
  assert.match(check((c) => { c.files['data/words/n2-0.json']._licence = licenceBlock('wallerWords', 'x', { inputs: [['edrdg', 'the glosses']] }); }),
    /n2-0\.json: _licence is waller-words, not edrdg: the glosses are JMdict's/, 'CC BY on top of share-alike glosses');
  assert.match(check((c) => { c.index._licence = licenceBlock('edrdg', 'x'); }), /_licence\.inputs does not credit Waller's lists \(waller-words\)/);
  const unpinned = Object.fromEntries(WORD_LEVELS.map((id) => [id, null]));
  assert.match(jlptWordsProblems(base.index, (rel) => base.files.get(rel), { sizes: unpinned }).join('\n'), /n5: no size is pinned/);
  // without the rare tier, a word the first tier lacks cannot be told
  assert.equal(resolvesIn(base.first)('えびす講', 'えびすこう', ['x']), undefined);
  assert.equal(resolvesIn(base.first)('会う', 'あう', ['x']), false);
});

test('a level arrives under the id it was asked for, whichever level\'s files come back first', async () => {
  const { index, files } = await sample();
  const docs = new Map([['data/words/jlpt.json', index], ...files]);
  const held = new Map();
  const fetcher = (p) => {
    const doc = docs.get(p);
    if (p !== 'data/words/n5-0.json') return Promise.resolve(structuredClone(doc));
    return new Promise((done) => held.set(p, () => done(structuredClone(doc))));
  };
  const lists = createWordLevels({ fetchJson: fetcher });
  assert.equal(lists.peek('n5'), null, 'nothing before it is asked for');
  const n5 = lists.rows('n5');
  const n4 = await lists.rows('n4');
  assert.deepEqual(n4.map((r) => r[0]), ['上手', '一日']);
  assert.equal(lists.peek('n4'), n4);
  assert.equal(lists.peek('n5'), null, 'N5 still on its way');
  await new Promise((r) => setImmediate(r));
  held.get('data/words/n5-0.json')();
  assert.deepEqual((await n5).map((r) => r[0]), ['会う', 'いくら', 'テレビ']);
  assert.equal(lists.peek('n5'), await n5);
  assert.deepEqual(lists.peek('n4').map((r) => r[0]), ['上手', '一日'], 'N5 arriving last leaves N4 its own');
  assert.equal(lists.peek('n9'), null);
});

test('the page loads a level\'s rows once, in order, and forgets a failure', async () => {
  const { index, files } = await sample();
  const dir = mkdtempSync(join(tmpdir(), 'yomu-words-'));
  try {
    mkdirSync(join(dir, 'words'));
    writeFileSync(join(dir, 'words', 'jlpt.json'), JSON.stringify(index));
    for (const [rel, doc] of files) writeFileSync(join(dir, rel.replace(/^data\//, '')), JSON.stringify(doc));
    const asked = [];
    const fetcher = (p) => { asked.push(p); return fetchJson(p); };
    const lists = createWordLevels({ fetchJson: fetcher, base: `${dir}/` });
    assert.deepEqual((await lists.rows('n4')).map((r) => r[0]), ['上手', '一日']);
    await lists.rows('n4');
    assert.equal(asked.length, 2, 'the index and the level file, once each');
    assert.deepEqual(await lists.rows('n9'), []);
    writeFileSync(join(dir, 'words', 'n3-0.json'), JSON.stringify({ format: 'nope' }));
    await assert.rejects(lists.rows('n3'), /n3: not yomu-jlpt-words\/1/);
    assert.equal(lists.peek('n3'), null, 'a failure leaves nothing to peek at');
    writeFileSync(join(dir, 'words', 'n3-0.json'), JSON.stringify(files.get('data/words/n3-0.json')));
    assert.deepEqual((await lists.rows('n3')).map((r) => r[0]), ['彼奴'], 'a retry fetches again');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the shelf ships with its sizes: data/words/ is here exactly when all five are pinned', () => {
  const pinned = WORD_LEVELS.filter((id) => Number.isInteger(JLPT_WORD_SIZES[id]));
  assert.ok(pinned.length === 0 || pinned.length === WORD_LEVELS.length, `pin all five sizes together, not ${pinned.join(' ')}`);
  assert.equal(WORD_LEVELS_READY, pinned.length === WORD_LEVELS.length);
  assert.equal(existsSync(join(SITE, WORDS_SRC)), WORD_LEVELS_READY);
});
