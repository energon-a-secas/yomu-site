// "Where are the spaces?": its lines (data/play/spaces.json), built again in
// memory and held to the committed file, so a change to the analyzer that
// moves an edge fails here until tools/build-spaces.mjs is run; which library
// lines qualify and why the rest do not; and a round, its marks and its
// score, under plain node with a seeded generator.
//
//   node --test tests/spaces.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SITE, run, diskDict } from './helpers/disk.mjs';
import {
  spacesDoc, spacesLicence, spacesProblems, sentencesOf, dictWords, unsettled, otherWord, MAX_SLOTS, SPACES_SRC,
} from '../tools/lib/spaces.mjs';
import { COMPOUND_LINES } from '../tools/lib/compound-lines.mjs';
import {
  parseSpaces, cleanLine, spacesRound, toggleMark, checkMarks, marksOf, spacesScore, spacesTotal, spacesCounts, missedLines,
  loadSpaces, resetSpaces, DRAW, tierHint,
} from '../js/play-spaces.js';
import { STRINGS } from '../js/strings.js';
import { makeRand, current, next, answeredNow, finished, ROUND } from '../js/play-rounds.js';
import {
  isKana, isHiragana, isKatakana, isKanji, toHira,
} from '../js/kana.js';
import { isWordChar, slotsOf, gapsOf, isPrefix } from '../js/gaps.js';

const read = (rel) => JSON.parse(readFileSync(join(SITE, rel), 'utf8'));
const FILE = read(SPACES_SRC);
const library = read('data/phrases/library.json');

let built = null;
async function build() {
  if (!built) {
    built = await spacesDoc({
      library,
      compounds: COMPOUND_LINES,
      analyze: run,
      words: dictWords(diskDict()),
      licence: spacesLicence(read('data/dict/index.json')._licence, read('data/names/index.json')._licence),
    });
  }
  return built;
}

// ── The file is the build ─────────────────────────────────────────────────

test('the committed file is what tools/build-spaces.mjs builds from the library and the shards', async () => {
  const { doc } = await build();
  assert.deepEqual(FILE, JSON.parse(JSON.stringify(doc)), 'run node tools/build-spaces.mjs and commit data/play/spaces.json');
  assert.deepEqual(spacesProblems(FILE), []);
});

test('which lines qualify, measured: 2026-10-07, 163 sentences of the library and the compounds', async () => {
  const { report, doc } = await build();
  // 71 phrases and 61 dialogue turns cut into 151 sentences, and 12 compound lines
  assert.equal(report.sentences, 163);
  // Changed on 2026-10-07 after the review of the answer keys: five checks
  // of the dictionary now leave out the lines whose words the analysis does
  // not settle (joined, counter, tail, two; base for a kana spelling), so 38
  // fewer lines are kept than the 159 of the first build. A written line left
  // out takes its kana spelling with it, which is why fewer are spelled and
  // `kana` and `none` fell: those lines no longer reach that test.
  assert.deepEqual(report.left, {
    reading: 1, set: 31, prefix: 12, joined: 2, counter: 2, tail: 5, two: 15, kana: 3, base: 2, guess: 0, none: 20, long: 1, twice: 1,
  });
  assert.deepEqual(report.kept, { 1: 48, 2: 61, 3: 12 });
  assert.deepEqual(report.sources, { phrase: 28, kana: 42, dialogue: 39, compound: 12 });
  assert.equal(report.spelled, 53);
  assert.equal(doc.count, 121);
  // Of the 151 sentences of the library, 67 are kept as written; 42 more come in kana.
  assert.equal(report.sources.phrase + report.sources.dialogue, 67);
});

test('the keys the review found wrong are left out, each for the check that finds it, and the kana spelling with it', async () => {
  const { report } = await build();
  const why = new Map(report.leftOut.map((l) => [l.id, `${l.why} ${l.at || ''}`.trim()]));
  const want = {
    // two tokens that are one dictionary word: rolled omelette, recipe
    'host-family-goodbye#2': 'joined 卵|焼き',
    'host-family-goodbye#3': 'joined 作り|方',
    // と quotes: 何|と言いますか
    'nihongo-de-nanto': 'tail 何|と',
    'asking-the-time#5': 'tail 一緒|に',
    'weekend-plans#0': 'tail 何|か',
    'asking-the-time#2/1': 'tail だ|っけ',
    // 番線 is the counter
    'train-ticket#4': 'counter 何番|線',
    'train-ticket#5/0': 'counter 五番|線',
    // a te-form and its verb, and noun plus する where the file splits 連絡|します
    'weekend-plans#5/1': 'two 持っていきます',
    'host-family-goodbye#4/1': 'two 作ってみます',
    'nihongo-benkyou': 'two しています',
    'miteiru-dake': 'two 見ている',
    menyuu: 'two お願い|します',
    'host-family-goodbye#0': 'two ありがとう|ございました',
    // いって read as 要る where the line says 行って
    'massugu~kana': 'base 行って/いって',
  };
  for (const [id, reason] of Object.entries(want)) assert.equal(why.get(id), reason, id);
  const kept = new Set(FILE.lines.map((l) => l.id));
  for (const id of Object.keys(want)) {
    assert.ok(!kept.has(id), `${id} is still a question`);
    if (!id.endsWith('~kana')) assert.ok(!kept.has(`${id}~kana`), `${id}~kana is still a question`);
  }
});

test('each check of the dictionary, one sentence at a time', async () => {
  const words = dictWords(diskDict());
  const open = async (text) => unsettled(await run(text), words);
  assert.deepEqual(await open('お母さんの卵焼き、忘れません。'), { why: 'joined', at: '卵|焼き' });
  assert.deepEqual(await open('何番線から出ますか。'), { why: 'counter', at: '何番|線' });
  assert.deepEqual(await open('これは日本語で何と言いますか'), { why: 'tail', at: '何|と' });
  assert.deepEqual(await open('終電、何時だっけ。'), { why: 'tail', at: 'だ|っけ' });
  assert.deepEqual(await open('ホテルロビーで待っています。'), { why: 'two', at: '待っています' });
  assert.deepEqual(await open('メニューをお願いします'), { why: 'two', at: 'お願い|します' });
  // What stays: the splits the file keeps, an expression the dictionary lists
  // as several words (もう少し, 気をつけて), a particle beside a noun (と|山),
  // and the dictionary's one-kana particles inside a word (初め|て, 重|い)
  for (const text of ['雨だったら、また連絡しますね。', 'もう少しゆっくり話してください', '気をつけてね。', 'ともだちとやまにのぼるんです。', 'このクラスは初めてですか。', 'ギターケースは重いです。', '駅はどこですか']) {
    assert.equal(await open(text), null, text);
  }
  assert.equal(otherWord(await run('まっすぐ行ってください'), await run('まっすぐいってください')), '行って/いって');
  assert.equal(otherWord(await run('駅はどこですか'), await run('えきはどこですか')), null);
});

test('no answer key contradicts a reason the game shows', async () => {
  const { NOSTART, wordsOf, extraReason } = await import('../js/gaps.js');
  for (const l of FILE.lines) {
    const key = l.gaps.map((g) => g.at);
    const chars = [...l.ja];
    // "No word starts with X": no word of any key does
    for (const w of wordsOf(l.ja, key)) assert.ok(!NOSTART.has([...w.text][0]), `${l.id}: ${w.text} starts with a kana the game says starts no word`);
    for (const g of l.gaps) {
      if (g.why === 'nostart') assert.ok(NOSTART.has(g.k) && chars[g.at - 1] === g.k, `${l.id} at ${g.at}`);
      if (g.why === 'script') assert.ok(!NOSTART.has(chars[g.at]), `${l.id} at ${g.at}: a script change before ${chars[g.at]}`);
    }
    // and an extra space before such a kana is only ever said to be one where the key has none
    for (const at of slotsOf(l.ja)) {
      if (extraReason(l.ja, key, at).why === 'nostart-extra') assert.ok(!key.includes(at), `${l.id} at ${at}`);
    }
  }
  // the explanatory ん is a word of its own in a key (のぼる|ん|です), so it is no such kana
  assert.ok(FILE.lines.some((l) => wordsOf(l.ja, l.gaps.map((g) => g.at)).some((w) => w.text === 'ん')));
  assert.ok(!NOSTART.has('ん'));
});

test('a line left out is left out for one of the stated reasons, and the one disagreement is the one allowed', async () => {
  const { report } = await build();
  const reading = report.leftOut.filter((l) => l.why === 'reading').map((l) => l.id);
  assert.deepEqual(reading, ['meeting-classmate#0'], 'tests/library-reading.test.mjs allows exactly this one');
  const words = (s) => [...s].filter(isWordChar).join('');
  const sets = library.phrases.filter((x) => x.chunk).flatMap((x) => sentencesOf(x.ja)).map(words).filter((x) => x.length >= 2);
  for (const l of report.leftOut.filter((x) => x.why === 'set')) {
    const p = library.phrases.find((x) => x.id === l.id.split('/')[0]);
    assert.ok((p && p.chunk) || sets.some((x) => words(l.text).includes(x)), `${l.id} ${l.text}: no set phrase in it`);
  }
  for (const l of report.leftOut.filter((x) => x.why === 'none')) {
    assert.deepEqual(gapsOf((await run(l.text)).tokens), [], `${l.id} ${l.text} has an edge`);
  }
  for (const l of report.leftOut.filter((x) => x.why === 'prefix')) {
    assert.ok((await run(l.text)).tokens.some(isPrefix), `${l.id} ${l.text} has no prefix of its own`);
  }
  for (const l of report.leftOut.filter((x) => x.why === 'long')) assert.ok(slotsOf(l.text).length > MAX_SLOTS, l.id);
});

test('every kept line: no guess behind it, its reading the library\'s, the tiers in order, kana with kanji never in tier 1', async () => {
  let tier = 1;
  for (const l of FILE.lines) {
    assert.ok(l.tier >= tier, `${l.id} comes after a harder line`);
    tier = l.tier;
    const r = await run(l.ja);
    assert.ok(!r.tokens.some((t) => t.confidence === 'guess' || t.kind === 'unknown'), `${l.id}: a guess`);
    const words = [...l.ja].filter(isWordChar);
    if (l.tier === 1) assert.ok(words.every(isHiragana), `${l.id}: tier 1 is all hiragana`);
    if (l.tier === 3) assert.ok(r.tokens.some((t) => Array.isArray(t.parts)), `${l.id}: tier 3 holds a compound`);
    assert.ok(slotsOf(l.ja).length <= MAX_SLOTS, l.id);
  }
});

test('a kana spelling is the library\'s own kana for the sentence, with its punctuation put back', () => {
  const fold = (s) => toHira([...s].filter(isKana).join(''));
  for (const l of FILE.lines.filter((x) => x.src === 'kana')) {
    const [base] = l.of.split('/');
    const p = library.phrases.find((x) => x.id === base);
    const d = !p && library.dialogues.find((x) => base.startsWith(`${x.id}#`));
    const kana = p ? p.kana : d.lines[Number(base.split('#')[1])].kana;
    assert.ok(fold(kana).includes(fold(l.ja)), `${l.id}: ${l.ja} is not in ${kana}`);
  }
});

test('a turn is cut after each 。, ？ or ！, the mark kept with its sentence', () => {
  assert.deepEqual(sentencesOf('ありがとうございます。はじめまして、マリアです。'), ['ありがとうございます。', 'はじめまして、マリアです。']);
  assert.deepEqual(sentencesOf('えっ、もう？終電'), ['えっ、もう？', '終電']);
});

test('the shape check names what is wrong', () => {
  const doc = JSON.parse(JSON.stringify(FILE));
  doc.lines[0].gaps[0].at = 0;
  doc.lines[1].gaps[0].why = 'vibes';
  doc.lines[2].tier = 4;
  doc.lines[3].ja = doc.lines[4].ja;
  doc.count = 1;
  const why = spacesProblems(doc).join('\n');
  assert.match(why, /lines\[0\]: a gap at 0, which is no position/);
  assert.match(why, /lines\[1\]: the reason vibes/);
  assert.match(why, /lines\[2\]: tier 4/);
  assert.match(why, /lines\[4\]: the text twice/);
  assert.match(why, /count is 1/);
  assert.deepEqual(spacesProblems({ format: 'nope' }), ['format is not yomu-spaces/1']);
});

// ── The page's side: the file, a round, the marks and the score ───────────

const LINES = parseSpaces(FILE).lines;

test('the page reads every committed line, and drops one whose gap is not at a place', () => {
  assert.equal(LINES.length, FILE.count);
  assert.equal(parseSpaces(FILE).dropped, 0);
  assert.equal(cleanLine({ ...FILE.lines[0], gaps: [{ at: 0, why: 'particle' }] }), null);
  assert.equal(cleanLine({ ...FILE.lines[0], gaps: [{ at: FILE.lines[0].gaps[0].at, why: 'vibes' }] }), null);
  assert.equal(cleanLine({ ...FILE.lines[0], tier: 9 }), null);
  assert.throws(() => parseSpaces({ format: 'x' }), /format is not yomu-spaces\/1/);
});

test('a missing or broken file fails once and is asked for again', async () => {
  resetSpaces();
  let calls = 0;
  await assert.rejects(loadSpaces(async () => { calls += 1; throw new Error('HTTP 404'); }));
  const got = await loadSpaces(async () => { calls += 1; return FILE; });
  assert.equal(calls, 2);
  assert.equal(got.lines.length, FILE.count);
  resetSpaces();
});

test('a round is ten lines, the easy ones first, and never two spellings of one sentence', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const r = spacesRound(LINES, { rand: makeRand(seed) });
    assert.equal(r.questions.length, ROUND);
    assert.deepEqual(r.questions.map((q) => q.tier), DRAW.flatMap(([t, n]) => Array(n).fill(t)), `seed ${seed}`);
    const of = r.questions.map((q) => q.of);
    assert.equal(new Set(of).size, of.length, `seed ${seed}: one sentence twice`);
  }
  // A tier short of lines lends its turn to the next, and the round still has ten.
  const few = spacesRound(LINES.filter((l) => l.tier !== 3), { rand: makeRand(7) });
  assert.equal(few.questions.length, ROUND);
  assert.deepEqual([...new Set(few.questions.map((q) => q.tier))], [1, 2]);
});

test('marks go only on places, only before the check, and the first check is the one that counts', () => {
  const r = spacesRound(LINES, { rand: makeRand(3) });
  const q = current(r);
  assert.equal(toggleMark(r, 0), false, 'the start of the line is no place');
  assert.equal(toggleMark(r, q.key[0]), true);
  assert.equal(toggleMark(r, q.slots.find((p) => !q.key.includes(p))), true);
  assert.equal(marksOf(r).size, 2);
  assert.equal(toggleMark(r, q.key[0]), true, 'a second press takes the mark away');
  assert.equal(toggleMark(r, q.key[0]), true);
  const p = checkMarks(r);
  assert.deepEqual(p.hit, [q.key[0]]);
  assert.equal(p.extra.length, 1);
  assert.equal(p.missing.length, q.key.length - 1);
  assert.equal(p.score, 0);
  assert.equal(p.right, false);
  assert.equal(checkMarks(r), null, 'a second check is refused');
  assert.equal(toggleMark(r, q.key[0]), false, 'no mark moves once checked');
  assert.ok(answeredNow(r));
});

test('a round played to the end: the score, the counts and the lines to look at again', () => {
  const r = spacesRound(LINES, { rand: makeRand(11) });
  let want = 0;
  r.questions.forEach((q, i) => {
    // all right on the even lines, all right plus one extra on the odd ones
    for (const at of q.key) toggleMark(r, at);
    const extra = q.slots.find((pl) => !q.key.includes(pl));
    if (i % 2 && extra !== undefined) toggleMark(r, extra);
    const p = checkMarks(r);
    want += p.score;
    assert.equal(p.score, q.key.length - (i % 2 && extra !== undefined ? 1 : 0));
    next(r);
  });
  assert.ok(finished(r));
  assert.equal(spacesScore(r), want);
  assert.equal(spacesTotal(r), r.questions.reduce((n, q) => n + q.key.length, 0));
  const c = spacesCounts(r);
  assert.equal(c.right, spacesTotal(r));
  assert.equal(c.of, spacesTotal(r));
  assert.deepEqual(missedLines(r).map((q) => q.id), r.questions.filter((q, i) => i % 2 && q.slots.some((pl) => !q.key.includes(pl))).map((q) => q.id));
});

test('the hint over a line names only the scripts the line holds: no kanji where there is none', () => {
  assert.equal(tierHint({ tier: 2, ja: 'トイレはどこですか' }), 'spacesTier2TH');
  assert.equal(tierHint({ tier: 2, ja: 'サイズはいかがなさいますか。' }), 'spacesTier2TH');
  assert.equal(tierHint({ tier: 2, ja: '駅はどこですか' }), 'spacesTier2KH');
  assert.equal(tierHint({ tier: 2, ja: '私はマリアです' }), 'spacesTier2KTH');
  assert.equal(tierHint({ tier: 2, ja: '十一時十五分。' }), 'spacesTier2K');
  assert.equal(tierHint({ tier: 1, ja: 'これをください' }), 'spacesTier1');
  assert.equal(tierHint({ tier: 3, ja: 'テニストーナメントに出ます。' }), 'spacesTier3');
  const names = { kanji: isKanji, katakana: isKatakana, hiragana: isHiragana };
  for (const l of LINES) {
    const key = tierHint(l);
    assert.ok(STRINGS[key] && STRINGS[key].en && STRINGS[key].es, `${l.id}: ${key}`);
    if (l.tier !== 2) continue;
    const said = STRINGS[key].en.split(':')[0].toLowerCase();
    const chars = [...l.ja].filter((ch) => ch !== 'ー');
    for (const [name, is] of Object.entries(names)) {
      assert.equal(said.includes(name), chars.some(is), `${l.id} ${l.ja}: "${STRINGS[key].en}"`);
    }
  }
});
