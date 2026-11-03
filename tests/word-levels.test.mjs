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
  wallerWords, rowOf, chooseRows, chooseRecord, candidatesOf, keysOf, resolvesIn, jlptWordsDocs, jlptWordsProblems, wordKey, cellText,
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
</table>
<table><tr><th>Kanji</th><th>Hiragana</th></tr><tr><td>猫</td><td>ねこ</td></tr></table>
</body></html>`;

test('a vocabulary page gives the Kanji, Hiragana and English cells of each row of its table, nothing above it or after it', () => {
  assert.deepEqual(wallerWords(PAGE), [
    ['会う', 'あう', 'to meet'], ['', 'いくら', 'how much?'], ['テレビ', 'てれび', 'television, TV'], ['上手', 'じょうず', 'skillful & good'],
  ]);
  assert.deepEqual(wallerWords('<table><tr><th>Kanji</th><th>Hiragana</th></tr><tr><td>猫</td><td>ねこ</td></tr></table>'), [['猫', 'ねこ', '']], 'a page with no English column');
  assert.throws(() => wallerWords('<table><tr><th>Kanji</th><th>Onyomi</th></tr><tr><td>日</td><td>ニチ</td></tr></table>'), /no table headed Kanji and Hiragana/);
  assert.throws(() => wallerWords('<table><tr><th>Kanji</th><th>Hiragana</th></tr></table>'), /has no rows/);
  assert.equal(cellText('<a>&#x4e00;&#26085;&nbsp; &lt;x&gt;　</a>'), '一日 <x>');
});

test('a row is its kanji spelling and reading, or a kana word alone', () => {
  assert.deepEqual(rowOf(['会う', 'あう', 'to meet']), ['会う', 'あう']);
  assert.deepEqual(rowOf(['', 'いくら']), ['いくら', '']);
  assert.deepEqual(rowOf(['いくら', 'いくら']), ['いくら', '']);
  assert.deepEqual(rowOf(['テレビ', 'てれび']), ['テレビ', ''], 'a katakana word his kana column spells in hiragana');
  assert.deepEqual(rowOf(['テレビ', '']), ['テレビ', '']);
  assert.equal(rowOf(['', '']), null);
  assert.equal(wordKey(['いくら', '']), wordKey(['いくら', 'いくら']));
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

test('Save keeps the row\'s spelling and reading and its first meaning', () => {
  assert.deepEqual(savableRow(['会う', 'あう', ['to meet', 'to have an accident']]), { w: '会う', r: 'あう', g: 'to meet' });
  assert.deepEqual(savableRow(['いくら', '', ['how much']]), { w: 'いくら', r: 'いくら', g: 'how much' });
  assert.equal(savableRow(['会う', 'あう', []]), null);
  assert.equal(savableRow(null), null);
});

test('the words each level keeps: a repeat stays at the easier level, a named row is left out, any other unknown row refuses', () => {
  const recs = new Map([['会う|あう', [{ g: ['to meet'] }]], ['いくら|', [{ g: ['salmon roe'] }, { g: ['how much'], u: 1 }]], ['上手|じょうず', [{ g: ['skillful'] }]], ['下手|へた', [{ g: ['unskillful'] }]]]);
  const lookup = (w, r) => recs.get(`${w}|${r}`) || [];
  const raw = {
    n5: [['会う', 'あう', 'to meet'], ['', 'いくら', 'how much?'], ['会う', 'あう', 'to meet']],
    n4: [['上手', 'じょうず', 'skillful'], ['', 'いくら', ''], ['～円', 'えん', 'yen']],
    n3: [['下手', 'へた', 'unskillful'], ['猫又', 'ねこまた', 'a cat monster']],
  };
  const got = chooseRows(raw, lookup, new Map([['～円 えん', 'a suffix, not a word'], ['犬 いぬ', 'stale']]));
  assert.deepEqual(got.levels, {
    n5: [['会う', 'あう', ['to meet']], ['いくら', '', ['how much']]], n4: [['上手', 'じょうず', ['skillful']]], n3: [['下手', 'へた', ['unskillful']]], n2: [], n1: [],
  });
  assert.equal(got.chosen, 1, 'いくら took its second record, on his English');
  assert.deepEqual(got.repeats.map((x) => [x.id, x.first, x.row[0]]), [['n5', 'n5', '会う'], ['n4', 'n5', 'いくら']]);
  assert.deepEqual(got.left.map((x) => x.why), ['a suffix, not a word']);
  assert.deepEqual(got.unresolved.map((x) => x.row), [['猫又', 'ねこまた']]);
  assert.deepEqual(got.stale, ['犬 いぬ']);
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
  const { index, files } = jlptWordsDocs(levels, licenceBlock('wallerWords', 'tests/word-levels.test.mjs'));
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
  const big = jlptWordsDocs({ n1: many }, licenceBlock('wallerWords', 'tests/word-levels.test.mjs'));
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
  const unpinned = Object.fromEntries(WORD_LEVELS.map((id) => [id, null]));
  assert.match(jlptWordsProblems(base.index, (rel) => base.files.get(rel), { sizes: unpinned }).join('\n'), /n5: no size is pinned/);
  // without the rare tier, a word the first tier lacks cannot be told
  assert.equal(resolvesIn(base.first)('えびす講', 'えびすこう', ['x']), undefined);
  assert.equal(resolvesIn(base.first)('会う', 'あう', ['x']), false);
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
