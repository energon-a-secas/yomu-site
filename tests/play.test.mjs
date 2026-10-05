// Play under plain node: the authored content, the rounds of the four games,
// the weighting, the store and its damaged copy, the data files' parsers and
// the routes. Every random draw is seeded, so a failure here draws again the
// same way.
//
//   node --test tests/play.test.mjs

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isHiragana, isKatakana, isKanji, isKana, spelled } from '../js/kana.js';
import { KANA_SETS, kanaInSets } from '../js/play-kana.js';
import { TWINS, SCRIPTS, twinOf } from '../js/play-twins.js';
import {
  KEY, DAMAGED_KEY, GAME_IDS, emptyData, validate, pairKey, pairOf, recordRound, recordMixed, openPlay,
} from '../js/play-store.js';
import {
  ROUND, makeRand, shuffle, weightOf, drawWeighted, createRound, current, answer, answeredNow, next, finished, score,
  mixUps, kanaEntries, kanaOptions, kanaRound, kanjiOptions, kanjiRound, kanjiPool, gridSize, oddPairs, oddGrid,
  nextOddPair, createOdd, tapOdd, oddScore, twinsRound, nameOptions, namesRound, nameClass,
} from '../js/play-rounds.js';
import {
  parseLookalikes, parseNames, cleanNameRow, loadNames, loadLookalikes, resetPlayData, LOOKALIKES_SRC, NAMES_SRC,
} from '../js/play-data.js';
import { LoadError } from '../js/reader.js';
import {
  routeOf, isPlay, gameOf, PARENT, HASH, PLAY_TITLE, GAMES,
} from '../js/routes.js';
import { STRINGS } from '../js/strings.js';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = /\b(powerful|seamless|leverages?|robust|utili[sz]e)\b/i;
const read = (rel) => JSON.parse(readFileSync(join(SITE, rel), 'utf8'));
const LOOK = parseLookalikes(read('data/play/lookalikes.json'));
const NAMES = parseNames(read('tests/fixtures/popular-names.json')).rows;

function checkText(where, obj) {
  assert.equal(typeof obj.en, 'string', `${where}.en`);
  assert.equal(typeof obj.es, 'string', `${where}.es`);
  assert.ok(obj.en.trim() && obj.es.trim(), where);
  for (const s of [obj.en, obj.es]) {
    assert.ok(!s.includes('\u2014'), `${where}: a dash`);
    assert.ok(!BANNED.test(s), `${where}: ${s}`);
  }
  assert.ok(!/\bvosotros\b|\b(tenéis|podéis|habéis)\b/i.test(obj.es), `${where}: vosotros`);
}

// ── The authored content ──────────────────────────────────────────────────

test('the kana sets hold every set the games promise, each in its own script', () => {
  const want = ['ぬめ', 'わねれ', 'さち', 'るろ', 'はほ', 'いり', 'こにた', 'きさ', 'あおめ', 'まも',
    'シツ', 'ソン', 'クケタワ', 'ウワフ', 'スヌ', 'コユヨ', 'アマ', 'チテ', 'ノメ', 'ラヲフ'];
  const have = KANA_SETS.map((s) => s.chars.map(([ch]) => ch).join(''));
  for (const w of want) assert.ok(have.includes(w), `the set ${w}`);
  assert.equal(new Set(KANA_SETS.map((s) => s.id)).size, KANA_SETS.length, 'ids are unique');
  for (const s of KANA_SETS) {
    const test = s.script === 'hiragana' ? isHiragana : isKatakana;
    assert.ok(['hiragana', 'katakana'].includes(s.script), s.id);
    assert.ok(s.chars.length >= 2, s.id);
    const chars = s.chars.map(([ch]) => ch);
    assert.equal(new Set(chars).size, chars.length, `${s.id}: a kana twice`);
    for (const [ch, hint] of s.chars) {
      assert.ok(test(ch) && [...ch].length === 1, `${s.id}: ${ch}`);
      checkText(`${s.id} ${ch}`, hint);
    }
    // each hint tells its kana apart, so no two in a set say the same thing
    assert.equal(new Set(s.chars.map(([, h]) => h.en)).size, s.chars.length, `${s.id}: a hint twice`);
  }
  assert.ok(kanaInSets().length >= 44);
});

test('the twins: eleven shapes, each side in its own script, with words that hold it', () => {
  const want = [['へ', 'ヘ'], ['カ', '力'], ['エ', '工'], ['ロ', '口'], ['ニ', '二'], ['タ', '夕'], ['ト', '卜'], ['ハ', '八'], ['オ', '才'], ['り', 'リ'], ['ー', '一']];
  for (const [a, b] of want) {
    const p = TWINS.find((x) => x.sides.some((s) => s.ch === a) && x.sides.some((s) => s.ch === b));
    assert.ok(p, `${a} ${b}`);
    assert.equal(twinOf(a), p.id);
  }
  assert.equal(TWINS.length, 11);
  const is = { hiragana: isHiragana, katakana: isKatakana, kanji: isKanji };
  for (const p of TWINS) {
    assert.equal(p.sides.length, 2, p.id);
    assert.notEqual(p.sides[0].ch, p.sides[1].ch, p.id);
    assert.notEqual(p.sides[0].script, p.sides[1].script, `${p.id}: two scripts`);
    checkText(`${p.id} note`, p.note);
    for (const s of p.sides) {
      assert.ok(SCRIPTS.includes(s.script) && is[s.script](s.ch), `${p.id}: ${s.ch} is ${s.script}`);
      assert.ok(s.words.length >= 2 && s.words.length <= 3, `${p.id} ${s.ch}: two or three words`);
      for (const [word, reading, meaning] of s.words) {
        assert.ok(word.includes(s.ch), `${word} holds ${s.ch}`);
        assert.ok([...reading].every((c) => isKana(c)), `${word}: the reading ${reading} is kana`);
        checkText(`${word}`, meaning);
      }
    }
  }
});

test('no em dash and none of the banned words in any file Play added', () => {
  const files = readdirSync(join(SITE, 'js')).filter((f) => /^(play-|render-play|render-games|events-play|strings-play|routes)/.test(f));
  assert.ok(files.length >= 9, files.join(' '));
  for (const f of [...files.map((x) => `js/${x}`), 'css/play.css', 'tools/build-lookalikes.mjs', 'tools/lib/lookalikes.mjs']) {
    const src = readFileSync(join(SITE, f), 'utf8');
    assert.ok(!src.includes('\u2014'), `${f}: a dash`);
    assert.ok(!BANNED.test(src), `${f}: a banned word`);
  }
});

test('no authored module under js/ is over 500 lines', () => {
  for (const f of readdirSync(join(SITE, 'js')).filter((x) => x.endsWith('.js') && !x.startsWith('neorgon-'))) {
    const lines = readFileSync(join(SITE, 'js', f), 'utf8').split('\n').length - 1;
    assert.ok(lines <= 500, `${f} has ${lines} lines`);
  }
});

// ── The routes ────────────────────────────────────────────────────────────

test('Play\'s routes are places, each game\'s parent is the list, and the list\'s the reader', () => {
  assert.equal(routeOf('#/play'), 'play');
  for (const g of GAMES) {
    assert.equal(routeOf(`#/play/${g}`), `play-${g}`);
    assert.equal(HASH[`play-${g}`], `#/play/${g}`);
    assert.equal(PARENT[`play-${g}`], 'play');
    assert.equal(gameOf(`play-${g}`), g);
    assert.ok(isPlay(`play-${g}`));
    assert.ok(Object.hasOwn(STRINGS, PLAY_TITLE[`play-${g}`]), PLAY_TITLE[`play-${g}`]);
  }
  assert.equal(PARENT.play, 'reader');
  assert.equal(gameOf('play'), null);
  assert.ok(!isPlay('list') && !isPlay('reader'));
  assert.equal(routeOf('#/play/nope'), 'reader');
  assert.equal(routeOf('#t=%E9%9B%A8'), 'reader');
  // My kanji's routes did not move
  assert.equal(routeOf('#/kanji'), 'list');
  assert.equal(routeOf('#/kanji/review'), 'review');
  assert.equal(PARENT.review, 'list');
});

// ── Chance and a round ────────────────────────────────────────────────────

test('a seeded generator draws the same round again', () => {
  const a = kanaRound(KANA_SETS, { rand: makeRand(42) });
  const b = kanaRound(KANA_SETS, { rand: makeRand(42) });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((q) => q.answer), kanaRound(KANA_SETS, { rand: makeRand(43) }).map((q) => q.answer));
  assert.deepEqual(shuffle([1, 2, 3, 4], makeRand(1)).sort(), [1, 2, 3, 4]);
});

test('a round counts the first answer only, and lists what it mixed up', () => {
  const r = createRound('which', [{ answer: 'シ', options: ['シ', 'ツ'] }, { answer: 'ソ', options: ['ソ', 'ン'] }, { answer: 'ン', options: ['ソ', 'ン'] }]);
  assert.deepEqual(answer(r, 'ツ'), { right: false, answer: 'シ' });
  assert.equal(answer(r, 'シ'), null, 'a second answer is refused');
  assert.ok(answeredNow(r));
  next(r);
  answer(r, 'ソ');
  next(r);
  answer(r, 'ソ');
  assert.equal(current(r).answer, 'ン');
  next(r);
  assert.ok(finished(r));
  assert.equal(score(r), 1);
  assert.deepEqual(mixUps(r), [['シ', 'ツ'], ['ン', 'ソ']]);
  assert.equal(next(r), null);
});

test('a pair mixed up is weighted up, to a ceiling', () => {
  assert.equal(weightOf(0), 1);
  assert.ok(weightOf(1) > weightOf(0));
  assert.equal(weightOf(50), weightOf(5));
  const picks = drawWeighted(['a', 'b', 'c'], 3, () => 1, makeRand(3));
  assert.deepEqual([...picks].sort(), ['a', 'b', 'c']);
});

// ── Which one? ────────────────────────────────────────────────────────────

test('Which one? kana: ten kana, four options each, one per romaji, from the set first', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const qs = kanaRound(KANA_SETS, { rand: makeRand(seed) });
    assert.equal(qs.length, ROUND);
    assert.equal(new Set(qs.map((q) => q.answer)).size, ROUND, 'no kana asked twice');
    for (const q of qs) {
      assert.equal(q.options.length, 4, q.answer);
      assert.ok(q.options.includes(q.answer));
      assert.equal(new Set(q.options.map(spelled)).size, 4, `${q.options.join('')}: two options sound the same`);
      assert.equal(q.romaji, spelled(q.answer));
      const set = KANA_SETS[q.set];
      for (const [ch] of set.chars) if (set.chars.length <= 4) assert.ok(q.options.includes(ch) || spelled(ch) === q.romaji, `${ch} of ${set.id}`);
      const same = set.script === 'hiragana' ? isHiragana : isKatakana;
      assert.ok(q.options.every((o) => same(o)), `${q.options.join('')}: one script`);
      assert.equal(q.hint, set.chars.find(([ch]) => ch === q.answer)[1]);
    }
  }
  // a set of two is filled from the set that shares a kana: め with ぬ, then あ and お
  const e = kanaEntries(KANA_SETS).find((x) => x.ch === 'ぬ');
  assert.deepEqual([...kanaOptions(KANA_SETS, e, makeRand(1))].sort(), ['あ', 'お', 'ぬ', 'め'].sort());
});

test('Which one? kana draws a mixed-up kana more often in later rounds', () => {
  const count = (mixed) => {
    let n = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      n += kanaRound(KANA_SETS, { rand: makeRand(seed), mixed }).filter((q) => q.answer === 'シ' || q.answer === 'ツ').length;
    }
    return n;
  };
  const plain = count(() => 0);
  const weighted = count((a, b) => (pairKey(a, b) === pairKey('シ', 'ツ') ? 5 : 0));
  assert.ok(weighted > plain * 1.8, `シ and ツ: ${plain} plain, ${weighted} weighted`);
});

test('Which one? kanji: the kanji and its look-alikes, then theirs, then the pool by strokes', () => {
  assert.ok(LOOK.get('未').includes('末') && LOOK.get('未').includes('本'), LOOK.get('未').join(''));
  const opts = kanjiOptions(LOOK, '待', { rand: makeRand(1) });
  assert.ok(opts.includes('待') && opts.includes('持'));
  // 拾 has one look-alike: the pool fills, nearest in strokes first
  const strokes = { 拾: 9, 捨: 11, 一: 1, 待: 9, 右: 5 };
  const filled = kanjiOptions(LOOK, '拾', { pool: ['一', '待', '右'], strokes: (ch) => strokes[ch] ?? null, rand: makeRand(2) });
  assert.equal(filled.length, 4);
  assert.ok(filled.includes('捨') && filled.includes('待'));
  const qs = kanjiRound([...LOOK.keys()].slice(0, 40), LOOK, { rand: makeRand(5) });
  assert.equal(qs.length, ROUND);
  assert.equal(new Set(qs.map((q) => q.answer)).size, ROUND);
  for (const q of qs) {
    assert.ok(q.options.includes(q.answer) && new Set(q.options).size === q.options.length);
    assert.ok(q.options.includes(LOOK.get(q.answer)[0]), `${q.answer}: its best look-alike is an option`);
  }
});

test('the kanji pool is the collection, filled from the 1st and 2nd grade when it holds fewer than ten', () => {
  const low = [...'一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六'];
  const few = kanjiPool(['待', '天', '雨'], LOOK, low);
  assert.equal(few.filled, true);
  assert.equal(few.own, 2, '待 and 天 have look-alikes, 雨 none');
  assert.deepEqual(few.pool.slice(0, 2), ['待', '天']);
  assert.ok(few.pool.length >= ROUND && few.pool.every((ch) => LOOK.has(ch)));
  const many = [...LOOK.keys()].slice(100, 120);
  assert.deepEqual(kanjiPool(many, LOOK, low), { pool: many, filled: false });
});

// ── Odd one out ───────────────────────────────────────────────────────────

test('Odd one out: 4x4, then 5x5, then 6x6; one odd cell; the free round ends at ten', () => {
  assert.deepEqual([0, 2, 3, 5, 6, 30].map(gridSize), [4, 4, 5, 5, 6, 6]);
  const pairs = oddPairs(KANA_SETS, LOOK, ['待', '未']);
  assert.ok(pairs.some((p) => p.kind === 'kana' && pairKey(p.a, p.b) === pairKey('シ', 'ツ')));
  assert.ok(pairs.some((p) => p.kind === 'kanji' && pairKey(p.a, p.b) === pairKey('待', '持')));
  assert.equal(new Set(pairs.map((p) => pairKey(p.a, p.b))).size, pairs.length, 'no pair twice');
  const o = createOdd('free');
  const rand = makeRand(9);
  let last = null;
  for (let i = 0; i < ROUND; i += 1) {
    const pair = nextOddPair(pairs, { last, rand });
    assert.ok(!last || pair !== last, 'never the same pair twice running');
    last = pair;
    o.grid = oddGrid(pair, gridSize(o.found), rand);
    assert.ok(o.grid.at >= 0 && o.grid.at < o.grid.size ** 2);
    assert.notEqual(o.grid.base, o.grid.odd);
    if (i === 2) {
      assert.equal(tapOdd(o, (o.grid.at + 1) % (o.grid.size ** 2)), 'miss');
      assert.equal(tapOdd(o, (o.grid.at + 2) % (o.grid.size ** 2)), 'miss');
    }
    assert.equal(tapOdd(o, o.grid.at), 'found');
    assert.equal(tapOdd(o, o.grid.at), null, 'a found grid takes no more taps');
  }
  assert.ok(o.over);
  assert.equal(o.found, ROUND);
  assert.equal(oddScore(o), ROUND - 1, 'the grid with a wrong tap does not score');
  assert.equal(o.mixups.length, 1, 'two misses in one grid are one mix-up');
  const timed = createOdd('timed');
  timed.grid = oddGrid(pairs[0], 4, rand);
  tapOdd(timed, timed.grid.at);
  assert.equal(oddScore(timed), 1);
  assert.ok(!timed.over, 'the clock, not the count, ends a timed sitting');
});

test('Odd one out draws a mixed-up pair more often', () => {
  const pairs = oddPairs(KANA_SETS, new Map(), []);
  const target = pairs.find((p) => pairKey(p.a, p.b) === pairKey('ソ', 'ン'));
  let plain = 0;
  let weighted = 0;
  for (let seed = 1; seed <= 2000; seed += 1) {
    if (nextOddPair(pairs, { rand: makeRand(seed) }) === target) plain += 1;
    if (nextOddPair(pairs, { rand: makeRand(seed), mixed: (a, b) => (pairKey(a, b) === pairKey('ソ', 'ン') ? 5 : 0) }) === target) weighted += 1;
  }
  assert.ok(weighted > plain * 5, `${plain} plain, ${weighted} weighted`);
});

// ── Twins and names ───────────────────────────────────────────────────────

test('Twins: ten words, both sides of every pair drawn, the answer the word\'s script', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const qs = twinsRound(TWINS, makeRand(seed));
    assert.equal(qs.length, ROUND);
    const byPair = new Map();
    for (const q of qs) {
      assert.ok(q.word.includes(q.ch));
      const side = TWINS.find((p) => p.id === q.id).sides.find((s) => s.ch === q.ch);
      assert.equal(q.answer, side.script);
      assert.deepEqual(q.options, SCRIPTS);
      byPair.set(q.id, (byPair.get(q.id) || new Set()).add(q.ch));
    }
    for (const [id, sides] of byPair) assert.equal(sides.size, 2, `${id}: both sides`);
  }
});

test('Name decoder: four spellings, the right one among them, the same class and first letter first', () => {
  const tom = NAMES.find((r) => r[0] === 'トム');
  const opts = nameOptions(NAMES, tom, makeRand(1));
  assert.equal(opts.length, 4);
  assert.ok(opts.includes('Tom'));
  assert.equal(new Set(opts.map((o) => o.toLowerCase())).size, 4);
  assert.ok(opts.includes('Tim'), 'Tim: a given name with the same first letter and length');
  const types = new Map(NAMES.map((r) => [r[1], r[2]]));
  // the same class, a person's name, since 2026-10-05 (was: the same type, given)
  assert.ok(opts.every((o) => nameClass(types.get(o)) === 'person'), opts.join(' '));
  const qs = namesRound(NAMES, { rand: makeRand(4) });
  assert.equal(qs.length, ROUND);
  assert.equal(new Set(qs.map((q) => q.kata)).size, ROUND);
  const q = qs.find((x) => x.kata === 'トム') || namesRound([tom, ...NAMES], { rand: makeRand(4), top: 1 })[0];
  assert.equal(spelled('トム'), 'to-mu');
  assert.equal(q.spelled, spelled(q.kata));
});

test('Name decoder: a person is offered only with people, a place only with places, whatever finer type each has (was Franz with Fairmont, Lucca, Tampa)', () => {
  assert.equal(nameClass('given'), 'person');
  assert.equal(nameClass('surname'), 'person');
  assert.equal(nameClass('person'), 'person');
  assert.equal(nameClass('place'), 'place');
  const rows = [
    ['フランツ', 'Franz', 'person', 3], ['フェアモント', 'Fairmont', 'place', 3], ['ルッカ', 'Lucca', 'place', 3],
    ['タンパ', 'Tampa', 'place', 3], ['フランク', 'Frank', 'given', 3], ['フォード', 'Ford', 'surname', 3],
    ['トム', 'Tom', 'given', 3], ['パリ', 'Paris', 'place', 3], ['ローマ', 'Rome', 'place', 3],
  ];
  const cls = new Map(rows.map((r) => [r[1], nameClass(r[2])]));
  for (let seed = 1; seed <= 40; seed += 1) {
    const franz = nameOptions(rows, rows[0], makeRand(seed));
    assert.deepEqual(new Set(franz), new Set(['Franz', 'Frank', 'Ford', 'Tom']), `seed ${seed}: ${franz}`);
    const tampa = nameOptions(rows, rows[3], makeRand(seed));
    assert.ok(tampa.every((o) => cls.get(o) === 'place'), `seed ${seed}: ${tampa}`);
  }
  // the other class fills in only when one runs short
  const short = nameOptions(rows.filter((r) => r[2] !== 'place' || r[1] === 'Paris'), rows[7], makeRand(1));
  assert.equal(short.length, 4);
  assert.ok(short.includes('Paris'));
});

test('the Name decoder labels a name "a name" or "a place", in both languages, never the finer type', async () => {
  const { STRINGS, useLang, ui } = await import('../js/strings.js');
  assert.equal(STRINGS.nameGiven, undefined);
  assert.equal(STRINGS.nameSurname, undefined);
  try {
    useLang('en');
    assert.deepEqual([ui('namePerson'), ui('namePlace')], ['a name', 'a place']);
    useLang('es');
    assert.deepEqual([ui('namePerson'), ui('namePlace')], ['un nombre', 'un lugar']);
  } finally {
    useLang('en');
  }
  const src = readFileSync(join(SITE, 'js/render-games.js'), 'utf8');
  assert.match(src, /CLASS_KEY\[nameClass\(q\.type\)\]/);
});

// ── The data files ────────────────────────────────────────────────────────

test('the names file parser keeps the rows of the promised shape and drops the rest', () => {
  assert.equal(NAMES.length, 14);
  assert.deepEqual(NAMES[0], ['トム', 'Tom', 'given', 412]);
  for (const bad of [['トム', 'Tom', 'nick', 3], ['tom', 'Tom', 'given', 3], ['トム', 'トム', 'given', 3], ['トム', 'Tom', 'given', 0], ['トム', 'Tom', 'given'], 'トム']) {
    assert.equal(cleanNameRow(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(cleanNameRow(['ニューヨーク', 'New York', 'place', 2]), ['ニューヨーク', 'New York', 'place', 2]);
  // person is a row type since 2026-10-05; a spelling with no capital is no row
  assert.deepEqual(cleanNameRow(['スミス', 'Smith', 'person', 179]), ['スミス', 'Smith', 'person', 179]);
  assert.equal(cleanNameRow(['エイヴォン', 'avon', 'place', 1]), null);
  assert.deepEqual(cleanNameRow(['リオデジャネイロ', 'Rio de Janeiro', 'place', 4]), ['リオデジャネイロ', 'Rio de Janeiro', 'place', 4]);
  assert.deepEqual(cleanNameRow(["オブライエン", "O'Brien", 'surname', 1]), ["オブライエン", "O'Brien", 'surname', 1]);
  const doc = { format: 'yomu-names-popular/1', names: [['トム', 'Tom', 'given', 2], ['?', 'x', 'given', 1]] };
  assert.deepEqual(parseNames(doc), { rows: [['トム', 'Tom', 'given', 2]], dropped: 1 });
  assert.throws(() => parseNames({ format: 'yomu-names/1', names: [] }), /popular\.json/);
});

test('a missing names file reads as missing, once, and never throws; another failure is not kept', async () => {
  resetPlayData();
  let asked = 0;
  const missing = async (src) => { asked += 1; throw new LoadError(src, 'HTTP 404'); };
  assert.deepEqual(await loadNames(missing), { state: 'missing' });
  assert.deepEqual(await loadNames(missing), { state: 'missing' });
  assert.equal(asked, 1, 'asked once per page');
  resetPlayData();
  await assert.rejects(loadNames(async (src) => { throw new LoadError(src, 'HTTP 500'); }), /500/);
  const ok = await loadNames(async (src) => { assert.equal(src, NAMES_SRC); return read('tests/fixtures/popular-names.json'); });
  assert.equal(ok.state, 'ready');
  assert.equal(ok.rows.length, 14);
  const look = await loadLookalikes(async (src) => { assert.equal(src, LOOKALIKES_SRC); return read('data/play/lookalikes.json'); });
  assert.equal(look.size, LOOK.size);
  resetPlayData();
});

// ── The store ─────────────────────────────────────────────────────────────

let disk;
beforeEach(() => {
  disk = new Map();
  const fake = {
    getItem: (k) => (disk.has(k) ? disk.get(k) : null),
    setItem: (k, v) => { disk.set(k, String(v)); },
    removeItem: (k) => { disk.delete(k); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
});

test('a pair key is two characters of the games, sorted, and nothing else', () => {
  assert.equal(pairKey('ツ', 'シ'), 'シ|ツ');
  assert.equal(pairKey('シ', 'ツ'), 'シ|ツ');
  assert.equal(pairKey('ー', '一'), pairKey('一', 'ー'));
  assert.equal(pairKey('シ', 'シ'), null);
  assert.equal(pairKey('Tom', 'Tim'), null);
  assert.equal(pairKey('ab', 'シ'), null);
  assert.deepEqual(pairOf('シ|ツ'), ['シ', 'ツ']);
  assert.equal(pairOf('ツ|シ'), null, 'unsorted is not a key');
  assert.equal(pairOf('シ|ツ|ソ'), null);
});

test('the store keeps the best and the rounds per game, and counts mix-ups', () => {
  const d = emptyData();
  assert.deepEqual(recordRound(d, 'which', 6), { best: 6, isBest: true });
  assert.deepEqual(recordRound(d, 'which', 4), { best: 6, isBest: false });
  assert.deepEqual(recordRound(d, 'odd', 31), { best: 31, isBest: true });
  assert.equal(recordRound(d, 'nope', 3), null);
  assert.deepEqual(d.games.which, { best: 6, rounds: 2 });
  assert.equal(recordMixed(d, 'ツ', 'シ'), 1);
  assert.equal(recordMixed(d, 'シ', 'ツ'), 2);
  assert.equal(recordMixed(d, 'Tom', 'Tim'), 0, 'a name is not a pair of characters');
  assert.deepEqual(d.mixed, { 'シ|ツ': 2 });
  assert.deepEqual(GAME_IDS, ['which', 'odd', 'oddFree', 'twins', 'names']);
});

test('a store is read field by field: what does not fit is left out and counted', () => {
  const v = validate({
    games: { which: { best: 7, rounds: 3 }, odd: { best: 12, rounds: 1 }, twins: { best: 11, rounds: 2 }, names: { best: 2, rounds: 0 }, chess: { best: 1, rounds: 1 } },
    mixed: { 'シ|ツ': 3, 'ツ|シ': 1, 'a|b': 2, '待|持': 2, '土|士': 0, '持|待': 2 },
  });
  assert.deepEqual(v.data.games, { which: { best: 7, rounds: 3 }, odd: { best: 12, rounds: 1 } });
  assert.deepEqual(v.data.mixed, { 'シ|ツ': 3, '待|持': 2 });
  assert.equal(v.dropped, 7);
  assert.equal(v.damaged, false);
  assert.deepEqual(validate('nope'), { data: emptyData(), dropped: 0, damaged: true });
  assert.deepEqual(validate(null), { data: emptyData(), dropped: 0, damaged: false });
});

test('the store survives a reload, keeps only characters, and keeps a copy of what it could not read', () => {
  const page = openPlay().load();
  page.finish('twins', 8);
  page.mixed('カ', '力');
  const again = openPlay().load();
  assert.equal(again.best('twins'), 8);
  assert.equal(again.rounds('twins'), 1);
  assert.equal(again.mixedCount('力', 'カ'), 1);
  const raw = disk.get(KEY);
  assert.deepEqual(JSON.parse(raw), { __v: 1, data: { games: { twins: { best: 8, rounds: 1 } }, mixed: { 'カ|力': 1 } } });

  disk.set(KEY, '{not json');
  const broken = openPlay().load();
  assert.equal(broken.note, 'damaged');
  assert.equal(broken.best('twins'), 0);
  assert.equal(disk.get(DAMAGED_KEY), '{not json', 'the damaged value is kept, not thrown away');
  disk.set(KEY, JSON.stringify({ __v: 1, data: { games: { which: { best: 99, rounds: 1 } }, mixed: {} } }));
  const partial = openPlay().load();
  assert.equal(partial.note, 'partial');
  assert.equal(partial.dropped, 1);
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  const blocked = openPlay().load();
  blocked.finish('which', 3);
  assert.equal(blocked.writable, false);
  assert.equal(blocked.best('which'), 3, 'the page keeps working on what it holds');
});
