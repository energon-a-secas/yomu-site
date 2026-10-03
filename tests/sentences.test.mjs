// The sentences a first-year learner pastes, against the committed shards.
//
//   node --test tests/sentences.test.mjs
//
// Each case names the cut (surfaces joined by |), and where it matters the
// hiragana reading of each token and the said line. The said line is the
// Genki one docs/ANALYZER.md describes: long vowels doubled, particles as
// pronounced, n' before a vowel, and one space between words, which is why
// しています is "shite imasu" and ませんでした is "masen deshita".
//
// Every result must also tile its text: the surfaces, joined, give back the
// normalized input, and each token's offsets point at its own surface.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalize } from '../js/analyze.js';
import { hasKanji } from '../js/kana.js';
import { run, cut, words, saidLine } from './helpers/disk.mjs';

const ids = (t) => (t.grammar || []).map((g) => g.id);
const find = (r, surface) => r.tokens.find((t) => t.surface === surface);
/** The dictionary form a learner looks up: a kanji spelling when one is listed. */
const lemmaOf = (t) => (hasKanji(t.base) || !t.entry || !t.entry.k ? t.base : t.entry.k[0]);

/**
 * [text, cut, reading per token (| between), said line, extra check]
 * An empty reading or said is not checked; the cut always is.
 */
const CASES = [
  ['わたしはがくせいです', 'わたし|は|がくせい|です', 'わたし|は|がくせい|です', 'watashi wa gakusee desu'],
  ['私は学生です。', '私|は|学生|です|。', 'わたし|は|がくせい|です|', 'watashi wa gakusee desu'],
  ['さようなら', 'さようなら', 'さようなら', 'sayoonara'],
  ['せんせい', 'せんせい', 'せんせい', 'sensee'],
  ['えいが', 'えいが', 'えいが', 'eega'],
  ['おねえさん', 'おねえさん', 'おねえさん', 'oneesan'],
  ['とうきょうへいきます', 'とうきょう|へ|いきます', 'とうきょう|へ|いきます', 'tookyoo e ikimasu', (r) => {
    assert.equal(find(r, 'へ').kind, 'particle');
    assert.equal(lemmaOf(find(r, 'いきます')), '行く');
  }],
  ['コーヒーをのみます', 'コーヒー|を|のみます', 'こーひー|を|のみます', 'koohii o nomimasu'],
  ['こんにちは', 'こんにちは', 'こんにちは', 'konnichiwa'],
  ['こんばんは', 'こんばんは', 'こんばんは', 'konbanwa'],
  ['おはようございます', 'おはようございます', 'おはようございます', 'ohayoo gozaimasu'],
  ['ありがとうございました', 'ありがとうございました', 'ありがとうございました', 'arigatoo gozaimashita'],
  // The final う of a godan-u verb is its own beat, not a long o.
  ['追う', '追う', 'おう', 'ou'],
  ['おもう', 'おもう', 'おもう', 'omou'],
  // The volitional's う is the long vowel it looks like.
  ['いこう', 'いこう', 'いこう', 'ikoo', (r) => {
    assert.equal(r.tokens[0].kind, 'inflected');
    assert.ok(ids(r.tokens[0]).includes('volitional'));
  }],
  ['おとうさん', 'おとうさん', 'おとうさん', 'otoosan'],
  ['おおさか', 'おおさか', 'おおさか', 'oosaka'],
  ['とお', 'とお', 'とお', 'too'],
  ['こおり', 'こおり', 'こおり', 'koori'],
  ['きっぷ', 'きっぷ', 'きっぷ', 'kippu'],
  ['がっこう', 'がっこう', 'がっこう', 'gakkoo'],
  ['きんえん', 'きんえん', 'きんえん', "kin'en"],
  ['ほんや', 'ほんや', 'ほんや', "hon'ya"],
  ['ラーメン', 'ラーメン', 'らーめん', 'raamen'],
  ['パーティー', 'パーティー', 'ぱーてぃー', 'paatii'],
  ['ハイウェイ', 'ハイウェイ', 'はいうぇい', 'haiwee'],
  ['ディズニーランド', 'ディズニーランド', 'でぃずにーらんど', 'dizuniirando'],
  // Half-width katakana is folded by NFKC before anything reads it.
  ['ｺｰﾋｰ', 'コーヒー', 'こーひー', 'koohii'],
  ['日本語を勉強しています', '日本語|を|勉強|しています', 'にほんご|を|べんきょう|しています', 'nihongo o benkyoo shite imasu', (r) => {
    const t = find(r, 'しています');
    assert.equal(t.base, 'する');
    assert.ok(ids(t).includes('te-iru'));
  }],
  ['読んでいます', '読んでいます', 'よんでいます', 'yonde imasu', (r) => {
    assert.equal(r.tokens[0].base, '読む');
    assert.ok(ids(r.tokens[0]).includes('te-iru'));
  }],
  ['待ってる', '待ってる', 'まってる', 'matteru', (r) => {
    assert.equal(r.tokens[0].base, '待つ');
    assert.ok(ids(r.tokens[0]).includes('te-iru'));
  }],
  ['食べませんでした', '食べませんでした', 'たべませんでした', 'tabemasen deshita', (r) => {
    assert.equal(r.tokens[0].base, '食べる');
    assert.ok(ids(r.tokens[0]).includes('polite-past-negative'));
  }],
  ['食べたくなかった', '食べたくなかった', 'たべたくなかった', 'tabetakunakatta', (r) => {
    assert.equal(r.tokens[0].base, '食べる');
    assert.ok(ids(r.tokens[0]).includes('want'));
  }],
  ['雨が降ったら、うちにいます', '雨|が|降ったら|、|うち|に|います', 'あめ|が|ふったら||うち|に|います', 'ame ga futtara uchi ni imasu', (r) => {
    assert.equal(find(r, '降ったら').base, '降る');
    assert.ok(ids(find(r, '降ったら')).includes('cond-tara'));
  }],
  ['安ければ', '安ければ', 'やすければ', 'yasukereba', (r) => {
    assert.equal(r.tokens[0].base, '安い');
    assert.ok(ids(r.tokens[0]).includes('cond-ba'));
  }],
  ['行けば', '行けば', 'いけば', 'ikeba', (r) => {
    assert.equal(r.tokens[0].base, '行く');
    assert.ok(ids(r.tokens[0]).includes('cond-ba'));
  }],
  ['書ける', '書ける', 'かける', 'kakeru', (r) => {
    assert.equal(r.tokens[0].base, '書く');
    assert.ok(ids(r.tokens[0]).includes('potential'));
  }],
  ['読まれる', '読まれる', 'よまれる', 'yomareru', (r) => {
    assert.equal(r.tokens[0].base, '読む');
    assert.ok(ids(r.tokens[0]).includes('passive'));
  }],
  ['食べさせられる', '食べさせられる', 'たべさせられる', 'tabesaserareru', (r) => {
    assert.equal(r.tokens[0].base, '食べる');
    assert.ok(ids(r.tokens[0]).includes('causative'));
  }],
  ['飲もう', '飲もう', 'のもう', 'nomoo', (r) => {
    assert.equal(r.tokens[0].base, '飲む');
    assert.ok(ids(r.tokens[0]).includes('volitional'));
  }],
  ['書け', '書け', 'かけ', 'kake', (r) => {
    assert.equal(r.tokens[0].base, '書く');
    assert.ok(ids(r.tokens[0]).includes('imperative'));
  }],
  // と after a verb in its dictionary form is "when, if"; いく is the verb,
  // not the prefix 幾 that shares its kana.
  ['いくと', 'いく|と', 'いく|と', 'iku to', (r) => {
    assert.equal(lemmaOf(r.tokens[0]), '行く');
    assert.deepEqual(ids(r.tokens[1]), ['cond-to']);
  }],
  ['はははいいです', 'はは|は|いい|です', 'はは|は|いい|です', 'haha wa ii desu'],
  ['すきです', 'すき|です', 'すき|です', 'suki desu'],
  ['じゃありません', 'じゃありません', 'じゃありません', 'ja arimasen', (r) => {
    assert.equal(r.tokens[0].kind, 'copula');
  }],
  ['あっ', 'あっ', 'あっ', '', (r) => {
    assert.notEqual(r.tokens[0].kind, 'unknown');
    assert.ok(r.tokens[0].sounds.some((s) => s.type === 'small-tsu' && s.detail === 'stop'));
  }],
  ['人々', '人々', 'ひとびと', 'hitobito'],
  ['3時', '3時', 'さんじ', 'sanji', (r) => assert.equal(r.tokens[0].kind, 'number')],
  ['三時', '三時', 'さんじ', 'sanji'],
  ['1分', '1分', 'いっぷん', 'ippun', (r) => {
    assert.equal(r.tokens[0].kind, 'number');
    assert.equal(r.tokens[0].counterChange, true);
  }],
  ['今日はいい天気ですね', '今日|は|いい|天気|です|ね', 'きょう|は|いい|てんき|です|ね', 'kyoo wa ii tenki desu ne'],
  ['いいえ、ちがいます', 'いいえ|、|ちがいます', 'いいえ||ちがいます', 'iie chigaimasu'],
  // へ before a verb of going: いって is 行く, not 言う.
  ['えきへいって', 'えき|へ|いって', 'えき|へ|いって', 'eki e itte', (r) => {
    assert.equal(lemmaOf(find(r, 'いって')), '行く');
  }],
  // No dictionary key spans 田中: the first pass guesses a name, and the
  // second phase finds the surname in JMnedict (data/names/).
  ['田中さん', '田中|さん', 'たなか|さん', 'tanaka san', (r) => {
    assert.equal(r.tokens[0].kind, 'name');
    assert.equal(r.tokens[0].confidence, 'dict');
    assert.deepEqual(r.tokens[0].entry.nt, ['surname', 'place']);
  }],
];

/** Surfaces tile the normalized text, and each offset points at its surface. */
function assertTiles(input, r) {
  const text = normalize(input);
  assert.equal(r.text, text);
  assert.equal(r.tokens.map((t) => t.surface).join(''), text, 'the surfaces do not tile the text');
  let at = 0;
  r.tokens.forEach((t, i) => {
    assert.equal(t.i, i);
    assert.equal(t.start, at, `token ${i} starts at ${t.start}, not ${at}`);
    assert.equal(text.slice(t.start, t.end), t.surface);
    at = t.end;
  });
}

for (const [text, want, reading, said, extra] of CASES) {
  test(`${text} reads ${want}${said ? ` (${said})` : ''}`, async () => {
    const r = await run(text);
    assertTiles(text, r);
    assert.equal(cut(r), want, 'cut');
    if (reading) assert.equal(r.tokens.map((t) => t.reading).join('|'), reading, 'reading');
    if (said) assert.equal(saidLine(r), said, 'said');
    for (const t of words(r)) assert.match(t.reading, /^[ぁ-ゟー]*$/u, `${t.surface} reading is not hiragana`);
    if (extra) await extra(r);
  });
}
