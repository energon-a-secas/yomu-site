// Which words from outside JMdict's common set ship, and under which keys:
// the mixed rule of tools/lib/extra.mjs held to a JMdict of a few entries
// written here. tests/regressions.test.mjs reads what the committed data/
// does with the same words.
//
//   node --test tests/extra.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { selectMixed, selectExtra } from '../tools/lib/extra.mjs';

/** One JMdict entry in jmdict-simplified's shape: spellings as `text` or `text:tag`. */
function word(kanji, kana, gloss) {
  const spell = (s) => {
    const [text, tag] = s.split(':');
    return { text, common: false, tags: tag ? [tag] : [] };
  };
  return {
    kanji: kanji.map(spell),
    kana: kana.map((text) => ({ text, common: false, tags: [], appliesToKanji: ['*'] })),
    sense: [{ partOfSpeech: ['n'], misc: [], gloss: [{ lang: 'eng', text: gloss }] }],
  };
}

// 付き物's one all-kanji spelling, 付物, is search-only, so the mixed test
// never reaches it; 憑き物's, 憑物, is not. The first tier files 月 first
// under つき, so both entries' つき物 would read as "Moon" and 物.
const jmdict = {
  words: [
    word(['付き物', 'つき物', '付物:sK', '付きもの:sK'], ['つきもの'], 'natural accompaniment'),
    word(['憑き物', 'つき物', '憑物'], ['つきもの'], 'evil spirit (that possesses someone)'),
    word(['潅水', 'かん水', '灌水'], ['かんすい'], 'sprinkling (water)'),
    word(['かん水', '梘水', '鹹水'], ['かんすい'], 'lye water'),
  ],
};
const firstRecord = (kana) => ({ つき: { k: ['月'] }, かん: { k: ['缶'] } })[kana];
const keysOf = (extras, index) => [...(extras.get(index) || [])];

test('a mixed spelling two entries list goes to the one the corpus matches: つき物 is 付き物, not 憑き物', () => {
  const corpus = ['旅に事故は付き物だ。', '冬に風邪は付き物です。'];
  const { extras, folds, stats } = selectMixed(jmdict, firstRecord, new Set(), corpus);
  assert.deepEqual(keysOf(extras, 0), ['つき物'], '付き物 owns つき物');
  assert.deepEqual(keysOf(extras, 1), [], '憑き物 no longer does');
  assert.equal(folds.get('ツキ物').index, 0, 'and the katakana fold follows it');
  assert.deepEqual(stats.claimed, ['つき物 付き物']);
});

test('with no corpus evidence for either entry, every entry the test chose keeps the spelling', () => {
  // what the test alone does: 憑き物 qualifies, 付き物 never reaches it
  const alone = selectMixed(jmdict, firstRecord, new Set());
  assert.deepEqual(keysOf(alone.extras, 1), ['つき物']);
  assert.deepEqual(keysOf(alone.extras, 0), []);
  // and a corpus that matches neither changes nothing: かん水 stays with both
  const none = selectMixed(jmdict, firstRecord, new Set(), ['かん水を入れる。']);
  assert.deepEqual(keysOf(none.extras, 2), ['かん水']);
  assert.deepEqual(keysOf(none.extras, 3), ['かん水']);
  assert.deepEqual(keysOf(none.extras, 1), ['つき物']);
  assert.deepEqual(none.stats.claimed, []);
});

// ── evidence: a match that runs on into okurigana (queue #148) ─────────────

/** A common entry: every spelling common, with its parts of speech. */
function common(kanji, kana, pos, gloss) {
  return {
    kanji: kanji.map((text) => ({ text, common: true, tags: [] })),
    kana: kana.map((text) => ({ text, common: true, tags: [], appliesToKanji: ['*'] })),
    sense: [{ partOfSpeech: pos, misc: [], gloss: [{ lang: 'eng', text: gloss }] }],
  };
}

test('a spelling the corpus meets only running on into a verb is no evidence: 雨降 in 雨降ってる, while 退出した and 積み上げた still count', () => {
  const rare = (kanji, kana, pos, gloss) => ({ ...word(kanji, kana, gloss), sense: [{ partOfSpeech: pos, misc: [], gloss: [{ lang: 'eng', text: gloss }] }] });
  const dict = {
    words: [
      common(['雨'], ['あめ'], ['n'], 'rain'),
      common(['降る'], ['ふる'], ['v5r', 'vi'], 'to fall'),
      common(['出す'], ['だす'], ['v5s', 'vt'], 'to take out'),
      common(['上げる'], ['あげる'], ['v1', 'vt'], 'to raise'),
      rare(['雨降'], ['あめふらし'], ['n'], 'sea hare'),
      rare(['退出'], ['たいしゅつ'], ['n', 'vs', 'vi'], 'leaving'),
      rare(['積み上げ'], ['つみあげ'], ['n'], 'piling up'),
    ],
  };
  const corpus = [
    ...Array(6).fill('雨降ってる。'), '雨降るかも。',
    ...Array(5).fill('会議を退出した。'),
    ...Array(5).fill('本を積み上げた。'),
  ];
  const { extras } = selectExtra(dict, corpus, { characters: [] }, new Set());
  const keys = (i) => [...(extras.get(i) || [])];
  // 雨降 ends in a kanji, and 降 with って is 降る: the analyzer reads 雨|降って
  assert.deepEqual(keys(4), [], '雨降 does not ship');
  // after an entry that takes する, した is that する, not 出す's okurigana
  assert.deepEqual(keys(5), ['退出']);
  // a spelling that ends in kana is left alone: 積み上げた is the verb, the key the noun
  assert.deepEqual(keys(6), ['積み上げ']);
});
