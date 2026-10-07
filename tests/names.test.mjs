// The names tier: which reading a name ships with, and in which order its
// types are named. The rules are in tools/lib/jmnedict.mjs; the first half
// of this file holds them to a small JMnedict written here, the second half
// reads the committed data/names/ the way the page does.
//
//   node --test tests/names.test.mjs
//
// What the analyzer verifier found on 2026-10-03, and each test names it:
// 美咲 read みさ, 恵子 えこ, 優子 まさこ, 七海 なみ, 智子 さとこ, 和也 かずなり,
// 直人 ただひと, 明美 あみ, all marked as dictionary matches; 相模 read
// さがみこ; バグ a strong name because of バグダッド; and 函館 called a surname
// before a place.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  candidates, surnames, countExtensions, recordOf, STRONG_EXT,
} from '../tools/lib/jmnedict.mjs';
import { run } from './helpers/disk.mjs';
import { toHira } from '../js/kana.js';

// ── The rules, on a JMnedict of a few entries ─────────────────────────────

/** One JMnedict entry in jmdict-simplified's shape. */
function word(kanji, kana, types) {
  return {
    kanji: kanji ? [{ text: kanji }] : [],
    kana: kana.map((text) => ({ text, appliesToKanji: ['*'] })),
    translation: [{ type: types }],
  };
}

/** n copies of an entry, each a different spelling built by `make(i)`. */
function many(n, make) {
  return Array.from({ length: n }, (_, i) => make(i));
}

const SUFFIXES = ['子', '央', '音', '花', '葵', '乃', '絵', '香', '恵', '奈'];
const SURNAMES = ['宇佐美', '園田', '伊比', '横井', '愛甲', '藤田', '山岸', '石原'];

/** Readings and their records for a small JMnedict, without KANJIDIC (no `f`). */
function build(words) {
  const jmn = { words };
  const cands = candidates(jmn);
  countExtensions(jmn, cands, surnames(jmn));
  return (text) => recordOf(text, cands.get(text), new Map());
}

test('a longer given name is no evidence for a reading: 美咲央 みさお does not make 美咲 みさ', () => {
  const rec = build([
    word('美咲', ['みさ'], ['fem']),
    word('美咲', ['みさき'], ['fem', 'place']),
    // ten given names that start with 美咲 read みさ...
    ...many(10, (i) => word(`美咲${SUFFIXES[i]}`, [`みさ${'おとかあのえかけな'[i] || 'こ'}`], ['fem'])),
    // ...and two places named after 美咲 read みさき
    word('美咲町', ['みさきちょう'], ['place']), word('美咲野', ['みさきの'], ['place']),
  ]);
  const { rec: r } = rec('美咲');
  assert.deepEqual(r.r, ['みさき']);
  assert.ok(r.n.startsWith('place'), r.n);
});

test('a given name is read the way full names that end with it read it: 恵子 けいこ, not えこ', () => {
  const rec = build([
    word('恵子', ['えこ'], ['fem', 'place']),
    word('恵子', ['けいこ'], ['fem']),
    ...SURNAMES.map((s) => word(s, [{ 宇佐美: 'うさみ', 園田: 'そのだ', 伊比: 'いび', 横井: 'よこい', 愛甲: 'あいこう', 藤田: 'ふじた', 山岸: 'やまぎし', 石原: 'いしはら' }[s]], ['surname'])),
    // full names: a surname, then 恵子 read けいこ
    ...SURNAMES.map((s, i) => word(`${s}恵子`, [`${['うさみ', 'そのだ', 'いび', 'よこい', 'あいこう', 'ふじた', 'やまぎし', 'いしはら'][i]}けいこ`], ['person'])),
    // and one whose 恵子 is the end of a longer given name, 美恵子: no evidence
    word('伊比美恵子', ['いびみえこ'], ['person']),
  ]);
  const { rec: r, evidence } = rec('恵子');
  assert.deepEqual(r.r, ['けいこ']);
  assert.equal(r.n, 'fem');
  assert.ok(evidence >= STRONG_EXT, `evidence ${evidence}`);
  assert.equal(r.s, undefined, 'given-name evidence makes no strong (outranking) name');
});

test('a katakana name is built on only as the first word of a full name: バグダッド is not バグ', () => {
  const rec = build([
    word(null, ['バグ'], ['place']),
    ...['バグダッド', 'バグラム', 'バグマティ', 'バグラーン', 'バグドグラ', 'バグルン'].map((t) => word(null, [t], ['place'])),
    word(null, ['ジョン'], ['given']),
    ...['ジョン・ウェイン', 'ジョン・ケージ', 'ジョンアダムス', 'ジョンウィンダム', 'ジョン・デューイ'].map((t) => word(null, [t], ['person'])),
  ]);
  assert.equal(rec('バグ').rec.s, undefined);
  assert.equal(rec('ジョン').rec.s, 1);
});

test('a spelling whose best reading is a type the tier does not ship does not ship: 相模 さがみ, not さがみこ', () => {
  const rec = build([
    word('相模', ['さがみ'], ['person']),
    word('相模', ['さがみこ'], ['surname']),
    ...many(6, (i) => word(`相模${['が丘', '屋', '原', '川', '大野', '国'][i]}`, [`さがみ${['がおか', 'や', 'はら', 'がわ', 'おおの', 'のくに'][i]}`], ['place'])),
    word('相模湖', ['さがみこ'], ['place']),
  ]);
  assert.equal(rec('相模').rec, null);
});

test('a longer name cut inside the prefix is no evidence: 東大井 is 東 and 大井, not 東大 and 井', () => {
  const rec = build([
    word('東大', ['ひがしおお'], ['place']),
    word('大井', ['おおい'], ['place', 'surname']),
    word('大川', ['おおかわ'], ['place', 'surname']),
    word('東大井', ['ひがしおおい'], ['place']),
    word('東大川', ['ひがしおおかわ'], ['place']),
  ]);
  assert.equal(rec('東大').evidence, 0);
});

test('a name\'s types are named most evidenced first: a place built on by places is a place first', () => {
  const rec = build([
    word('函館', ['はこだて'], ['surname', 'place']),
    ...['山', '駅', '港', '湾', '市'].map((s) => word(`函館${s}`, [`はこだて${{ 山: 'やま', 駅: 'えき', 港: 'こう', 湾: 'わん', 市: 'し' }[s]}`], ['place'])),
    word('田中', ['たなか'], ['surname', 'place']),
    ...['角栄', '一郎', '真紀子', '耕太郎'].map((g, i) => word(`田中${g}`, [`たなか${['かくえい', 'いちろう', 'まきこ', 'こうたろう'][i]}`], ['person'])),
  ]);
  assert.equal(rec('函館').rec.n, 'place surname');
  assert.equal(rec('田中').rec.n, 'surname place');
});

/** One JMnedict entry of a katakana name with its translations, in jmdict-simplified's shape. */
function foreign(kana, groups) {
  return {
    kanji: [],
    kana: [{ text: kana, appliesToKanji: ['*'] }],
    translation: groups.map(([types, texts]) => ({ type: types, translation: texts.map((text) => ({ lang: 'eng', text })) })),
  };
}

test('a katakana name carries its first translation in Latin letters, of a type that ships (2026-10-05)', () => {
  const rec = build([
    foreign('トム', [[['given'], ['Tom', 'Thom', 'Tomu']]]),
    // a trailing parenthesis is cut, the way JMnedict glosses places
    foreign('ハナ', [[['fem', 'place'], ['Hana (Hawaii)', 'Hanna (Canada)']]]),
    // the unclassified half of an entry does not ship, so its spellings do not either
    foreign('ジル', [[['unclass'], ['Gil', 'Gille']], [['fem'], ['Jill', 'Jiru']]]),
    // nothing in Latin letters alone: no original spelling, the name still ships its types
    foreign('イエメン', [[['place'], ['(Republic of) Yemen']]]),
    // the name of one person ships for katakana
    foreign('ナポレオン', [[['person'], ['Napoleon Bonaparte']]]),
  ]);
  assert.equal(rec('トム').rec.o, 'Tom');
  assert.equal(rec('ハナ').rec.o, 'Hana');
  assert.equal(rec('ジル').rec.o, 'Jill');
  assert.equal(rec('イエメン').rec.o, undefined);
  assert.equal(rec('イエメン').rec.n, 'place');
  assert.deepEqual(rec('ナポレオン').rec, { n: 'person', o: 'Napoleon Bonaparte' });
});

test('a kanji spelling typed only person stays out, and carries no original spelling', () => {
  const words = [
    word('相模', ['さがみ'], ['person']),
    { kanji: [{ text: '田中' }], kana: [{ text: 'たなか', appliesToKanji: ['*'] }], translation: [{ type: ['surname'], translation: [{ lang: 'eng', text: 'Tanaka' }] }] },
  ];
  assert.equal(candidates({ words }).has('相模'), false);
  const tanaka = build(words)('田中').rec;
  assert.deepEqual([tanaka.r, tanaka.n, tanaka.o], [['たなか'], 'surname', undefined]);
});

test('a katakana name is spelled the way the English translations of its sentences write it, not JMnedict\'s first (2026-10-05)', async () => {
  const { chooseOriginal, englishFor } = await import('../tools/lib/original.mjs');
  // JMnedict lists ケイト as Keito, Cate, Kate: the first was taught
  assert.deepEqual(chooseOriginal(['Keito', 'Cate', 'Kate'], ['Kate is here.', 'I met Kate and Tom.', 'Cate Blanchett']), { o: 'Kate', by: 'evidence', seen: 2 });
  // a whole word, case and all: Tomorrow and tom are not Tom; Tom's is
  assert.equal(chooseOriginal(['Tomu', 'Tom'], ['Tomorrow is fine.', "Tom's bag.", 'tom']).o, 'Tom');
  assert.equal(chooseOriginal(['Malhia', 'Maria'], ['Where is Maria?']).o, 'Maria');
  // a tie keeps JMnedict's order, and no sentence or no spelling seen keeps the first
  assert.equal(chooseOriginal(['Jon', 'John'], ['Jon met John.']).o, 'Jon');
  assert.deepEqual(chooseOriginal(['Rinda', 'Linda'], ['Nobody here.']), { o: 'Rinda', by: 'first', seen: 0 });
  assert.deepEqual(chooseOriginal(['Rinda', 'Linda'], []), { o: 'Rinda', by: 'first', seen: 0 });
  // the English sentences are those linked to Japanese sentences holding the
  // name as a whole katakana run: アン in アンケート is no アン
  const japanese = [['1', 'ケイトが来た。'], ['2', 'アンケートに答えた。'], ['3', 'アンとケイトは友達だ。']];
  const links = '1\t10\n2\t20\n3\t30\n3\t31\n';
  const english = '10\teng\tKate came.\n20\teng\tI answered the survey.\n30\teng\tAnn and Kate are friends.\n31\teng\tAnne and Kate are friends.\n';
  const got = englishFor(new Set(['ケイト', 'アン']), japanese, links, english);
  assert.deepEqual(got.get('ケイト'), ['Kate came.', 'Ann and Kate are friends.', 'Anne and Kate are friends.']);
  assert.deepEqual(got.get('アン'), ['Ann and Kate are friends.', 'Anne and Kate are friends.']);
  assert.equal(chooseOriginal(['An', 'Ann', 'Anne'], got.get('アン')).o, 'Ann');
});

// ── The committed names tier ──────────────────────────────────────────────

const tokOf = (r, surface) => r.tokens.find((t) => t.surface === surface);

test('トム is Tom and メアリー Mary: a katakana name carries its original spelling (were "given name" alone)', async () => {
  const r = await run('トムとメアリーは友達です。');
  const tom = tokOf(r, 'トム');
  assert.equal(tom.kind, 'name');
  assert.equal(tom.confidence, 'dict');
  assert.deepEqual(tom.name, { o: 'Tom', types: ['given'] });
  assert.deepEqual(tokOf(r, 'メアリー').name, { o: 'Mary', types: ['fem'] });
  // the entry is what it was: the types as glosses, the part of speech
  assert.deepEqual(tom.entry.g, ['given name']);
  assert.equal(tom.entry.p, 'n-pr');
  assert.equal(tom.entry.o, undefined, 'the original spelling is the token\'s, not a dictionary field');
});

test('the names a learner meets first are spelled as English writes them (were Jon, Keito, Malhia)', async () => {
  for (const [name, o] of [['トム', 'Tom'], ['ジョン', 'John'], ['ケイト', 'Kate'], ['マリア', 'Maria'], ['メアリー', 'Mary'], ['クリス', 'Chris'], ['ジル', 'Jill']]) {
    const t = tokOf(await run(`${name}さんが来た。`), name);
    assert.ok(t, name);
    assert.equal(t.kind, 'name', name);
    assert.equal(t.name.o, o, name);
  }
});

test('マイケル・ジャクソン shows Michael and Jackson on their own tokens', async () => {
  const r = await run('マイケル・ジャクソンが好きです。');
  assert.equal(tokOf(r, 'マイケル').name.o, 'Michael');
  assert.equal(tokOf(r, 'ジャクソン').name.o, 'Jackson');
  assert.equal(tokOf(r, '・').kind, 'punct');
});

test('a foreign name the corpus never had is read too (アインシュタイン, アークレイリ), and a word stays a word', async () => {
  for (const [text, s, o] of [['アインシュタインさんに会った。', 'アインシュタイン', 'Einstein'], ['アークレイリに行った。', 'アークレイリ', 'Akureyri']]) {
    const t = tokOf(await run(text), s);
    assert.ok(t, `${s} in ${text}`);
    assert.equal(t.kind, 'name', text);
    assert.equal(t.name.o, o, text);
  }
  // ロンドン is a first-tier word, London, and keeps its gloss; a katakana
  // common word beats a name spelled the same (バラ is a rose, not "Bara")
  const london = tokOf(await run('ロンドンに行った。'), 'ロンドン');
  assert.equal(london.kind, 'katakana');
  assert.equal(london.entry.g[0], 'London (UK)');
  assert.equal(london.name, undefined);
  const rose = tokOf(await run('バラが咲いた。'), 'バラ');
  assert.notEqual(rose.kind, 'name');
  assert.equal(rose.name, undefined);
});

test('a name with no original spelling carries no name field, and a kanji name none at all', async () => {
  const tanaka = tokOf(await run('田中さんが来た。'), '田中');
  assert.equal(tanaka.kind, 'name');
  assert.equal(tanaka.name, undefined);
});

test('common given names are read the way a teacher writes them (were みさ, えこ, まさこ, なみ, さとこ, かずなり, ただひと, あみ)', async () => {
  for (const [name, reading] of [
    ['美咲', 'みさき'], ['恵子', 'けいこ'], ['優子', 'ゆうこ'], ['七海', 'ななみ'], ['智子', 'ともこ'],
    ['和也', 'かずや'], ['直人', 'なおと'], ['明美', 'あけみ'], ['花子', 'はなこ'], ['結衣', 'ゆい'],
  ]) {
    const r = await run(`${name}さんが来た。`);
    const t = r.tokens.find((x) => x.surface === name);
    assert.ok(t, `${name} in ${r.tokens.map((x) => x.surface).join('|')}`);
    assert.equal(t.kind, 'name', name);
    assert.equal(t.confidence, 'dict', name);
    assert.equal(t.reading, reading, name);
  }
});

test('勝子 is かつこ, 友美 ともみ, and 愛敬 the word あいきょう (were かちこ, ゆみ and あいぎょう before 8942e59)', async () => {
  for (const text of ['勝子さんが来た。', '勝子は学生です。', '私は勝子です。']) {
    const t = (await run(text)).tokens.find((x) => x.surface === '勝子');
    assert.ok(t, text);
    assert.equal(t.kind, 'name', text);
    assert.equal(t.confidence, 'dict', text);
    assert.equal(t.reading, 'かつこ', text);
    assert.equal(t.furigana.map((f) => f.ruby).filter(Boolean).join(''), 'かつこ', text);
  }
  const yumi = (await run('友美さんが来た。')).tokens.find((x) => x.surface === '友美');
  assert.equal(yumi.reading, 'ともみ');
  const aikyou = (await run('愛敬がある人だ。')).tokens.find((x) => x.surface === '愛敬');
  assert.equal(aikyou.reading, 'あいきょう');
});

test('相模 is no names-tier surname read さがみこ; it is Sagami', async () => {
  const t = (await run('相模に行った。')).tokens.find((x) => x.surface === '相模');
  assert.equal(t.reading, 'さがみ');
  assert.notEqual(t.kind, 'name');
});

test('a place is called a place first, a given name a given name (函館, 浅草, 花子 led with "surname")', async () => {
  for (const [text, s, first] of [['函館に行った。', '函館', 'place'], ['浅草に行った。', '浅草', 'place'], ['花子さんが来た。', '花子', 'fem'], ['田中さんが来た。', '田中', 'surname']]) {
    const t = (await run(text)).tokens.find((x) => x.surface === s);
    assert.equal(t.kind, 'name', text);
    assert.equal(t.entry.nt[0], first, `${s}: ${t.entry.nt.join(' ')}`);
  }
});

// ── The second tier's order (tools/lib/rare.mjs), the same way ───────────

/** A JMdict entry in jmdict-simplified's shape, one sense. */
function entry(kanji, kana, gloss, misc = []) {
  return {
    kanji: kanji.map(([text, tags = [], common = false]) => ({ text, tags, common })),
    kana: kana.map(([text, tags = [], common = false]) => ({ text, tags, common, appliesToKanji: ['*'] })),
    sense: [{
      partOfSpeech: ['n'], gloss: [{ lang: 'eng', text: gloss }], misc, languageSource: [],
      appliesToKanji: ['*'], appliesToKana: ['*'],
    }],
  };
}

test('a spelling the first tier gives a word it ships is that word first: 饂飩 is udon, though JMdict tags it rare there', async () => {
  const { rareForms, rareEntries } = await import('../tools/lib/rare.mjs');
  const words = [
    // ワンタン: 雲呑 first, 饂飩 untagged, no common spelling
    entry([['雲呑'], ['饂飩']], [['ワンタン']], 'wonton (Chinese dumpling)', ['uk']),
    // うどん: common, its one kanji 饂飩 tagged rK; the first tier ships it
    // under うどん, whose record lists 饂飩 in k
    entry([['饂飩', ['rK']]], [['うどん', [], true]], 'udon', ['uk']),
    // 浮気: common, 上気 an outdated spelling its kana record does not list
    entry([['浮気', [], true], ['上気', ['oK']]], [['うわき', [], true]], 'extramarital sex'),
    entry([['上気']], [['じょうき']], 'flushing (of one\'s cheeks)'),
  ];
  const shipped = new Set(['1\tうどん', '2\t浮気', '2\tうわき']);
  const { entries } = rareEntries(rareForms(words, shipped), new Map(), new Map());
  assert.deepEqual(entries.get('饂飩').map((r) => r.g[0]), ['udon', 'wonton (Chinese dumpling)']);
  // and 上気 stays じょうき's: the mark is the first tier's k, not commonness
  assert.deepEqual(entries.get('上気').map((r) => r.g[0]), ['flushing (of one\'s cheeks)', 'extramarital sex']);
});

test('the game lists a name only when the English sentences chose its spelling', async () => {
  const { popularCandidates } = await import('../tools/lib/popular.mjs');
  const records = new Map([
    ['トム', { o: 'Tom', n: 'given' }],
    ['レイラ', { o: 'Reira', n: 'given' }],
  ]);
  const counts = new Map([['トム', 9], ['レイラ', 4]]);
  const rows = popularCandidates(records, counts, new Set(['トム']));
  assert.deepEqual(rows.map((r) => r[0]), ['トム']);
  assert.deepEqual(popularCandidates(records, counts, new Set()), []);
});

// ── The game's type: the sense that spells the name, and the corpus ──────

test('a katakana name lists first the types of the sense its spelling came from (were Cathy a surname, Lyon a given name)', () => {
  const rec = build([
    foreign('キャシー', [[['surname'], ['Casei']], [['fem'], ['Cathy', 'Kathy', 'Cassie']]]),
    foreign('リヨン', [[['place'], ['Lyon (France)', 'Riom (France)']], [['fem'], ['Riyon']]]),
    foreign('ガンジー', [[['place'], ['Ghanzi (Botswana)']], [['person'], ['Gandhi (Mohandas Karamchand Gandhi)']]]),
  ]);
  // the corpus chose Cathy, Lyon and Gandhi (build-names.mjs sets `o`): set it here
  const pick = (text, o, words) => {
    const jmn = { words };
    const cands = candidates(jmn);
    countExtensions(jmn, cands, surnames(jmn));
    cands.get(text).get(toHira(text)).o = o;
    return recordOf(text, cands.get(text), new Map()).rec;
  };
  // JMnedict's first spelling: the type of the sense that holds it leads
  assert.equal(rec('キャシー').rec.n, 'surname fem');
  assert.equal(pick('キャシー', 'Cathy', [foreign('キャシー', [[['surname'], ['Casei']], [['fem'], ['Cathy', 'Kathy']]])]).n, 'fem surname');
  assert.equal(pick('リヨン', 'Lyon', [foreign('リヨン', [[['place'], ['Lyon (France)']], [['fem'], ['Riyon']]])]).n, 'place fem');
  assert.equal(pick('ガンジー', 'Gandhi', [foreign('ガンジー', [[['place'], ['Ghanzi (Botswana)']], [['person'], ['Gandhi (Mohandas Karamchand Gandhi)']]])]).n, 'person place');
  assert.equal(rec('ガンジー').rec.n, 'place person', 'Ghanzi, the first spelling, is the place');
});

test('the game\'s type: the record\'s first, a place the corpus uses as a person, never a name used only as 語 or 人', async () => {
  const {
    rowType, usageOf, usedAsPerson, usedAsWord, popularCandidates, PERSON_MIN, PERSON_SHARE,
  } = await import('../tools/lib/popular.mjs');
  assert.equal(PERSON_MIN, 2);
  assert.equal(PERSON_SHARE, 0.2);
  // スミス is typed only place upstream; the corpus says Mr. Smith and スミスさん
  const smith = usageOf('スミス', 'Smith', [
    ['スミスさんは先生です。', []],
    ['スミスが来た。', ['Mr. Smith came.']],
    ['スミスは忙しい。', ['Smith is busy.']],
    ['スミスミス', []],
  ]);
  assert.deepEqual(smith, { n: 4, person: 2, word: 0 });
  assert.ok(usedAsPerson(smith, 4));
  assert.ok(!usedAsPerson(smith, 11), 'two of eleven is under a fifth');
  assert.ok(!usedAsPerson({ person: 1 }, 1), 'one sentence is not enough');
  assert.deepEqual(rowType({ n: 'place', o: 'Smith' }, 4, smith), { type: 'person', by: 'corpus' });
  // a title before another word, or an honorific that is not one, is no evidence
  assert.equal(usageOf('スミス', 'Smith', [['スミスさん', []], ['スミス', ['Mrs. Smithers came.']], ['スミスたち', ['Dr Smith']]]).person, 2);
  // a given name stays given, whatever the corpus says
  assert.deepEqual(rowType({ n: 'given', o: 'Tom' }, 2, { n: 2, person: 2, word: 0 }), { type: 'given', by: 'jmnedict' });
  // ベルベル is ベルベル語 and ベルベル人 in every sentence: no name
  const berber = usageOf('ベルベル', 'Berber', [['ベルベル語を話す。', []], ['私はベルベル人です。', []]]);
  assert.deepEqual(berber, { n: 2, person: 0, word: 2 });
  assert.ok(usedAsWord(berber));
  assert.deepEqual(rowType({ n: 'place', o: 'Berber' }, 2, berber), { type: null, by: 'word' });
  // ノルウェー is a place, also met alone
  assert.ok(!usedAsWord(usageOf('ノルウェー', 'Norway', [['ノルウェー語', []], ['ノルウェーに行く。', []]])));
  // a name typed only person stays out; a person by its sense is a row
  assert.deepEqual(rowType({ n: 'person', o: 'Napoleon' }, 3), { type: null, by: 'jmnedict' });
  assert.deepEqual(rowType({ n: 'person place', o: 'Gandhi' }, 3), { type: 'person', by: 'jmnedict' });
  // a spelling with no capital never reaches the game (JMnedict's エイヴォン "avon")
  const records = new Map([['エイヴォン', { o: 'avon', n: 'place' }], ['スミス', { o: 'Smith', n: 'place' }], ['ベルベル', { o: 'Berber', n: 'place' }]]);
  const rows = popularCandidates(records, new Map([['エイヴォン', 1], ['スミス', 4], ['ベルベル', 2]]), new Set(records.keys()), new Map([['スミス', smith], ['ベルベル', berber]]));
  assert.deepEqual(rows, [['スミス', 'Smith', 'person', 4]]);
});

// ── The game's class by the English sentences' cues (2026-10-07) ─────────

test('the English cues: a verb after the spelling, or Van or de before it, is a person; in, to, from and the like before it a place', async () => {
  const {
    englishCues, PERSON_VERBS, PLACE_BEFORE, SURNAME_PARTICLES,
  } = await import('../tools/lib/popular.mjs');
  assert.deepEqual([...PERSON_VERBS], ['is', 'was', 'has', 'had', 'said', 'says', 'likes', 'loved', 'loves', 'went', 'wants', 'can',
    'will', 'would', 'did', 'does', 'told', 'asked', 'looked', 'lived', 'died', 'painted', 'wrote']);
  assert.deepEqual([...PLACE_BEFORE], ['in', 'to', 'from', 'at', 'near', 'visit', 'visited', 'the city of']);
  assert.deepEqual([...SURNAME_PARTICLES], ['van', 'de']);
  // ゴッホ's two English sentences, and ミラノ's
  assert.deepEqual(englishCues('Gogh', ['He imitated the works of Van Gogh.', 'I like such a passionate picture as Gogh painted.']), { person: 2, place: 0 });
  assert.deepEqual(englishCues('Milan', [
    'When are you going to return from Milan?', 'How are you going to Milan?', 'I\'m from Milan.', 'What time does the train for Milan leave?',
  ]), { person: 0, place: 3 });
  // is a, was a; an auxiliary with n't; can't; a cue word opening the sentence; the city of
  assert.deepEqual(englishCues('Tom', ['Tom is a doctor.', 'Tom wasn\'t there.', 'If Tom doesn\'t come, call.', 'Tom can\'t swim.']), { person: 4, place: 0 });
  assert.deepEqual(englishCues('Rio', ['In Rio, it rains.', 'the city of Rio', 'The city of Rio is big.', 'near Rio', 'We visited Rio.']), { person: 1, place: 5 });
  assert.deepEqual(englishCues('Gogh', ['Vincent van Gogh', 'Gérard de Gogh']), { person: 2, place: 0 });
  // a sentence counts once for each kind it holds
  assert.deepEqual(englishCues('Tom', ['Tom is here, and Tom was there, and I went to Tom.']), { person: 1, place: 1 });
  // no cue: another word (Tomorrow), no capital, a comma or "and" between,
  // a possessive, a verb not on the list, "in" inside "within", a quote
  // between the word and the name, a word before the verb
  assert.deepEqual(englishCues('Tom', ['Tomorrow is Monday.', 'tom is', 'Tom, who is late.', 'Tom and Mary went.', 'Tom\'s dog is big.', 'Tom looks up.', 'Tom sometimes is late.']), { person: 0, place: 0 });
  assert.deepEqual(englishCues('Romeo', ['There was bad blood in "Romeo and Juliet".', 'within Romeo', 'O Romeo Romeo, wherefore art thou Romeo?']), { person: 0, place: 0 });
  assert.deepEqual(englishCues('Tom', []), { person: 0, place: 0 });
  assert.deepEqual(englishCues('Tom', null), { person: 0, place: 0 });
});

test('the English cues decide at two and twice the other kind, and move a row only across the game\'s two classes', async () => {
  const {
    cueVerdict, rowType, popularCandidates, listsPlace, CUES_MIN, CUES_RATIO,
  } = await import('../tools/lib/popular.mjs');
  assert.equal(CUES_MIN, 2);
  assert.equal(CUES_RATIO, 2);
  assert.equal(cueVerdict({ person: 2, place: 0 }), 'person');
  assert.equal(cueVerdict({ person: 2, place: 1 }), 'person');
  assert.equal(cueVerdict({ person: 3, place: 2 }), null, 'three is not twice two');
  assert.equal(cueVerdict({ person: 1, place: 0 }), null, 'one cue is not enough');
  assert.equal(cueVerdict({ person: 0, place: 2 }), 'place');
  assert.equal(cueVerdict({ person: 1, place: 2 }), 'place');
  assert.equal(cueVerdict({ person: 0, place: 0 }), null);
  assert.equal(cueVerdict(null), null);
  assert.ok(listsPlace('fem place') && listsPlace('place') && !listsPlace('surname') && !listsPlace(undefined));
  const u = (person, place, extra = {}) => ({ n: 1, person: 0, word: 0, cues: { person, place }, ...extra });
  // JMnedict types ゴッホ and モリー only place; the English says a person
  assert.deepEqual(rowType({ n: 'place', o: 'Gogh' }, 2, u(2, 0)), { type: 'person', by: 'english' });
  // ミラノ is fem first, a place too; the English says a place
  assert.deepEqual(rowType({ n: 'fem place', o: 'Milan' }, 8, u(0, 4)), { type: 'place', by: 'english' });
  assert.deepEqual(rowType({ n: 'surname place', o: 'Montgomery' }, 4, u(1, 2)), { type: 'place', by: 'english' });
  // エメット is typed only surname: "in Emmet's sense" makes no place of it
  assert.deepEqual(rowType({ n: 'surname', o: 'Emmet' }, 31, u(0, 2)), { type: 'surname', by: 'jmnedict' });
  // a person's name the cues call a person, and a place they call a place, keep their type
  assert.deepEqual(rowType({ n: 'given', o: 'Tom' }, 9, u(9, 1)), { type: 'given', by: 'jmnedict' });
  assert.deepEqual(rowType({ n: 'place fem', o: 'Lyon' }, 5, u(0, 5)), { type: 'place', by: 'jmnedict' });
  // undecided keeps its class: ロミオ has one cue of each kind
  assert.deepEqual(rowType({ n: 'place', o: 'Romeo' }, 12, u(1, 1)), { type: 'place', by: 'jmnedict' });
  // the honorifics come first: スミスさん outweighs a preposition
  assert.deepEqual(rowType({ n: 'place', o: 'Smith' }, 4, u(0, 4, { n: 4, person: 2 })), { type: 'person', by: 'corpus' });
  // and a name used only as a word's stem is still no row
  assert.deepEqual(rowType({ n: 'place', o: 'Berber' }, 2, u(2, 0, { n: 2, word: 2 })), { type: null, by: 'word' });
  // through popularCandidates, as the builder calls it
  const records = new Map([
    ['ゴッホ', { o: 'Gogh', n: 'place' }], ['ミラノ', { o: 'Milan', n: 'fem place' }], ['エメット', { o: 'Emmet', n: 'surname' }],
  ]);
  const usage = new Map([['ゴッホ', u(2, 0)], ['ミラノ', u(0, 4)], ['エメット', u(0, 2)]]);
  const rows = popularCandidates(records, new Map([['ゴッホ', 2], ['ミラノ', 8], ['エメット', 31]]), new Set(records.keys()), usage);
  assert.deepEqual(rows, [['エメット', 'Emmet', 'surname', 31], ['ミラノ', 'Milan', 'place', 8], ['ゴッホ', 'Gogh', 'person', 2]]);
});
