// What the two verifiers found on 2026-09-29, one test per finding, against
// the committed shards.
//
//   node --test tests/regressions.test.mjs
//
// Each test names the input that was wrong and what it read as, so a later
// change to a cost that brings one back fails here with the case that forced
// the fix. Where the data itself is missing a word (すもも, 帰社), the test
// holds only what the analyzer can get right without it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { analyze, normalize } from '../js/analyze.js';
import { createDict } from '../js/dict.js';
import { run, cut, saidLine, diskDict, fetchJson, DATA } from './helpers/disk.mjs';

const tok = (r, surface) => r.tokens.find((t) => t.surface === surface);
const ids = (t) => (t ? t.grammar.map((g) => g.id) : []);
const gloss = (t) => (t && t.entry && t.entry.g ? t.entry.g[0] : null);
const kanjiOf = (r, ch) => r.kanji.find((k) => k.char === ch);

// ── Numbers and counters ─────────────────────────────────────────────────

test('X時半 is one number, the hour bent as 時 bends it (was 四|時半, "shi jihan")', async () => {
  for (const [text, reading, said] of [
    ['四時半', 'よじはん', 'yojihan'], ['九時半', 'くじはん', 'kujihan'], ['七時半', 'しちじはん', 'shichijihan'],
    ['何時半', 'なんじはん', 'nanjihan'],
  ]) {
    const r = await run(text);
    assert.equal(cut(r), text, text);
    assert.equal(r.tokens[0].kind, 'number', text);
    assert.equal(r.tokens[0].reading, reading, text);
    assert.equal(saidLine(r), said, text);
  }
  assert.equal(saidLine(await run('今、四時半です。')), 'ima yojihan desu');
});

test('十分 before a word that measures time is ten minutes (was じゅうぶん "enough")', async () => {
  assert.equal(saidLine(await run('駅まで十分かかります。')), 'eki made juppun kakarimasu');
  const after = await run('十分後');
  assert.equal(after.tokens.map((t) => t.reading).join('|'), 'じゅっぷん|ご');
  assert.equal(tok(await run('十分ぐらい'), '十分').reading, 'じゅっぷん');
  // and "enough" where nothing measures time
  assert.equal(tok(await run('十分です'), '十分').reading, 'じゅうぶん');
  assert.equal(tok(await run('十分に食べました'), '十分').reading, 'じゅうぶん');
});

test('a length of time is the counter and 間, one token (was 十|分間, 十日|あいだ, 三|年間)', async () => {
  for (const [text, reading] of [
    ['十分間', 'じゅっぷんかん'], ['三年間', 'さんねんかん'], ['十日間', 'とおかかん'], ['一日間', 'いちにちかん'],
    ['五秒間', 'ごびょうかん'], ['何日間', 'なんにちかん'],
  ]) {
    const r = await run(text);
    assert.equal(cut(r), text, text);
    assert.equal(r.tokens[0].kind, 'number', text);
    assert.equal(r.tokens[0].reading, reading, text);
  }
  // 間 keeps its own ruby after a day read whole
  assert.deepEqual((await run('十日間')).tokens[0].furigana, [{ text: '十日', ruby: 'とおか', whole: true }, { text: '間', ruby: 'かん' }]);
});

test('か月 and か所 in every spelling are counters (was "ichi ka tsuki", and ヶ所 a surname)', async () => {
  for (const [text, reading] of [
    ['一か月', 'いっかげつ'], ['六か月', 'ろっかげつ'], ['三ヶ月', 'さんかげつ'], ['十カ月', 'じゅっかげつ'],
    ['三か所', 'さんかしょ'], ['三ヶ所', 'さんかしょ'], ['一箇所', 'いっかしょ'],
  ]) {
    const r = await run(text);
    assert.equal(cut(r), text, text);
    assert.equal(r.tokens[0].kind, 'number', text);
    assert.equal(r.tokens[0].reading, reading, text);
  }
  // the small ka carries its own ruby
  assert.deepEqual((await run('三ヶ所')).tokens[0].furigana,
    [{ text: '三', ruby: 'さん' }, { text: 'ヶ', ruby: 'か' }, { text: '所', ruby: 'しょ' }]);
  assert.deepEqual((await run('一か月')).tokens[0].furigana, [{ text: '一', ruby: 'いっ' }, { text: 'か' }, { text: '月', ruby: 'げつ' }]);
});

test('度, 秒 and 倍 are counters (was ご|たび, and 二秒 a surname)', async () => {
  for (const [text, reading] of [['5度', 'ごど'], ['一度', 'いちど'], ['二秒', 'にびょう'], ['二倍', 'にばい'], ['何度', 'なんど']]) {
    const r = await run(text);
    assert.equal(r.tokens.length, 1, text);
    assert.notEqual(r.tokens[0].kind, 'name', text);
    assert.equal(r.tokens[0].reading, reading, text);
  }
});

test('a day, an age or a count read as one word is one ruby, read whole (was 八[ようか]日)', async () => {
  for (const [text, reading, chars] of [
    ['四月八日', 'ようか', ['八', '日']], ['二十歳', 'はたち', ['二', '十', '歳']], ['二十日', 'はつか', ['二', '十', '日']],
  ]) {
    const r = await run(text);
    const t = r.tokens[r.tokens.length - 1];
    assert.equal(t.reading, reading, text);
    assert.deepEqual(t.furigana, [{ text: t.surface, ruby: reading, whole: true }], text);
    assert.ok(t.sounds.some((s) => s.type === 'special-reading'), text);
    for (const ch of chars) {
      assert.equal(kanjiOf(r, ch).whole, true, `${ch} in ${text}`);
      assert.deepEqual(kanjiOf(r, ch).wholeRuns, [{ run: t.surface, reading }], `${ch} in ${text}`);
    }
  }
});

// ── Readings the data ties ───────────────────────────────────────────────

test('開く is あく unless something is opened with を; 下手 is へた (both were record order)', async () => {
  assert.equal(tok(await run('窓が開いています。'), '開いています').reading, 'あいています');
  assert.equal(tok(await run('店が開いている'), '開いている').reading, 'あいている');
  assert.equal(tok(await run('ドアが開きました'), '開きました').reading, 'あきました');
  assert.equal(tok(await run('本を開いてください'), '開いて').reading, 'ひらいて');
  // 開けて after を is 開ける, not the potential of 開く read ひらく
  assert.equal(tok(await run('窓を開けてもいいですか'), '開けて').reading, 'あけて');
  assert.equal((await run('下手')).tokens[0].reading, 'へた');
  assert.equal(tok(await run('日本語が下手です'), '下手').reading, 'へた');
});

test('a kana word is glossed by its commonest spelling (すき was "gap", いる "to be needed")', async () => {
  for (const [text, surface, spelling] of [
    ['わたしはははがすきです', 'すき', '好き'],
    ['にわにはにわにわとりがいる', 'いる', '居る'],
    ['わたしのうちはちかいです', 'ちかい', '近い'],
    ['ほんをかいます', 'かいます', '買う'],
    ['おんがくをききます', 'ききます', '聞く'],
    ['せんせい', 'せんせい', '先生'],
    ['じゃあ、また', 'また', '又'],
    ['一緒にどうですか', 'どう', '如何'],
    // and the rules that rank them must not turn these, which were right
    ['わたしはがくせいです', 'わたし', '私'],
    ['これはなんですか', 'なん', '何'],
    ['わたしのうちはちかいです', 'うち', '家'],
    ['あとでスプーンもください', 'あと', '後'],
    ['ドアがあく', 'あく', '開く'],
  ]) {
    const t = tok(await run(text), surface);
    assert.ok(t, `${surface} in ${text}`);
    assert.ok(t.entry.k && t.entry.k.includes(spelling), `${text}: ${surface} is ${gloss(t)}`);
  }
  // a kana word with no kanji spelling to rank by keeps its old reading
  assert.equal(gloss(tok(await run('このシャツはいくらですか'), 'いくら')), 'how much');
});

test('かきます is 書く "to write" (書く was cut from かく by the six-record cap, and it read "to scratch")', async () => {
  for (const [text, surface] of [['てがみをかきます', 'かきます'], ['ひらがなでかいてください', 'かいて'], ['さくぶんをかきました', 'かきました']]) {
    const t = tok(await run(text), surface);
    assert.equal(t.base, 'かく', text);
    assert.ok(t.entry.k.includes('書く'), `${text}: ${gloss(t)}`);
  }
  // the records under a kana key are ordered by their spellings' evidence
  // before the cap, so the word the corpus knows best is kept and first
  const d = diskDict();
  await d.need(['かく']);
  assert.deepEqual(d.get('かく')[0].k, ['書く']);
});

test('御 is a prefix first: ご注文 is honorific, not 語 "word"', async () => {
  for (const text of ['ご注文はお決まりですか', '袋はご利用ですか']) {
    const t = tok(await run(text), 'ご');
    assert.ok(t.entry.k.includes('御'), `${text}: ${gloss(t)}`);
  }
});

// ── Segmentation ─────────────────────────────────────────────────────────

test('a prefix may lead an adjective: 超おいしかった (was 超|おい|しかった, "nephew, scold")', async () => {
  const r = await run('超おいしかった！');
  assert.equal(cut(r), '超|おいしかった|!');
  assert.ok(ids(tok(r, 'おいしかった')).includes('adj-past'));
});

test('から ending a clause before 、 is the particle (was 殻 "shell")', async () => {
  for (const text of ['朝ご飯を食べてから、学校に行きます。', '暑いから、窓を開けます。', '雨だから、行きません。']) {
    const t = tok(await run(text), 'から');
    assert.equal(t.kind, 'particle', text);
    assert.ok(ids(t).includes('kara'), text);
  }
});

test('の and うち in kana are two words, not 農地 (was "noochi", "farmland")', async () => {
  const r = await run('わたしのうちはちかいです');
  assert.equal(cut(r), 'わたし|の|うち|は|ちかい|です');
  assert.equal(saidLine(r), 'watashi no uchi wa chikai desu');
  assert.equal(cut(await run('ともだちのうちへ')), 'ともだち|の|うち|へ');
});

test('a particle は in kana text is not swallowed by the word after it', async () => {
  const hen = await run('こんどはへんです');
  assert.equal(cut(hen), 'こんど|は|へん|です');
  assert.equal(saidLine(hen), 'kondo wa hen desu');
  const when = await run('にほんへはいつきましたか');
  assert.equal(cut(when), 'にほん|へ|は|いつ|きました|か');
  assert.equal(saidLine(when), 'nihon e wa itsu kimashita ka');
});

test('a noun and した in kana is する in the past, not 下 "below"', async () => {
  const t = tok(await run('きしゃのきしゃがきしゃできしゃした'), 'した');
  assert.equal(t.base, 'する');
  assert.ok(ids(t).includes('past'));
});

test('without すもも in the data, no particle is doubled and もの is not "because"', async () => {
  const r = await run('すもももももももものうち');
  const words = r.tokens;
  for (let k = 1; k < words.length; k++) {
    assert.ok(!(words[k].kind === 'particle' && words[k - 1].kind === 'particle' && words[k].surface === words[k - 1].surface),
      `${cut(r)} doubles ${words[k].surface}`);
  }
  assert.ok(!words.some((t) => t.surface === 'もの' && t.kind === 'particle'), cut(r));
  assert.equal(cut(await run('ももももも')), 'もも|も|もも');
});

test('ねえ drawn out is one particle (was ね|え, "root, eh")', async () => {
  const r = await run('ねえねえ、きいて');
  assert.equal(cut(r), 'ねえ|ねえ|、|きいて');
  assert.equal(saidLine(r), 'nee nee kiite');
});

// ── Grammar ──────────────────────────────────────────────────────────────

test('〜てしまう and 〜てみる are one verb with a note (しまいました was "to finish", みます 診る)', async () => {
  const gone = await run('宿題を忘れてしまいました。');
  assert.equal(cut(gone), '宿題|を|忘れてしまいました|。');
  assert.ok(ids(tok(gone, '忘れてしまいました')).includes('te-shimau'));
  assert.equal(saidLine(gone), 'shukudai o wasurete shimaimashita');
  const tried = await run('食べてみます');
  assert.equal(cut(tried), '食べてみます');
  assert.ok(ids(tried.tokens[0]).includes('te-miru'));
  assert.equal(saidLine(tried), 'tabete mimasu');
});

test('have to: the verb keeps its ending and the pieces carry must (was 行|か|なくてはいけない)', async () => {
  const r = await run('行かなくてはいけない');
  assert.equal(cut(r), '行かなくて|は|いけない');
  assert.equal(saidLine(r), 'ikanakute wa ikenai');
  for (const t of r.tokens) assert.ok(ids(t).includes('must'), t.surface);
  assert.equal(cut(await run('早く寝なくてはならない')), '早く|寝なくて|は|ならない');
  assert.ok(ids(tok(await run('行かなければなりません'), '行かなければ')).includes('must'));
  for (const [text, said] of [['帰らなくちゃ', 'kaeranakucha'], ['行かなきゃ', 'ikanakya']]) {
    const casual = await run(text);
    assert.equal(cut(casual), text);
    assert.ok(ids(casual.tokens[0]).includes('must'), text);
    assert.equal(saidLine(casual), said);
  }
});

test('で after a na-adjective is "and", and な there has no gloss (were "where, or with what" and "don\'t")', async () => {
  const r = await run('静かできれいな町です。');
  assert.deepEqual(ids(tok(r, 'で')), ['de-and']);
  assert.equal(tok(r, 'で').entry, null);
  assert.equal(tok(r, 'な').entry, null);
  assert.deepEqual(ids(tok(await run('バスで学校へ行きます。'), 'で')), ['de']);
});

test('a favour asked with くれませんか or もらえませんか is not an invitation', async () => {
  for (const text of ['塩を取ってくれませんか。', '見せてもらえませんか。']) {
    const r = await run(text);
    assert.ok(!r.tokens.some((t) => ids(t).includes('invitation')), text);
  }
  assert.ok(ids(tok(await run('行きませんか。'), 'か')).includes('invitation'));
});

// ── The said line ────────────────────────────────────────────────────────

test('a は inside an expression is the particle, said wa (was dehamata, toiukotoha)', async () => {
  for (const [text, said] of [
    ['ではまた', 'dewamata'], ['ということは', 'toiukotowa'], ['それはさておき', 'sorewasateoki'],
    ['もしくは', 'moshikuwa'], ['わけではない', 'wakedewanai'], ['ときには', 'tokiniwa'],
  ]) {
    const r = await run(text);
    assert.equal(saidLine(r), said, text);
    assert.ok(r.tokens[0].sounds.some((s) => s.type === 'fossil-wa'), text);
  }
  // and a は that starts a word stays ha
  assert.equal(saidLine(await run('てにはいる')), 'tenihairu');
});

test('a kana word is cut where its kanji spelling is, so two words\' vowels stay apart', async () => {
  for (const [text, said] of [
    ['そのうち', 'sonouchi'], ['このうち', 'konouchi'], ['そのうえ', 'sonoue'], ['ていれ', 'teire'], ['でいりぐち', 'deiriguchi'],
    // and a vowel inside one kanji's reading, or fused into the word, is still long
    ['せんせい', 'sensee'], ['ありがとう', 'arigatoo'], ['おとうさん', 'otoosan'], ['がっこう', 'gakkoo'],
  ]) {
    const r = await run(text);
    assert.equal(saidLine(r), said, text);
    assert.equal(r.tokens[0].sounds.some((s) => s.type === 'long-vowel'), /(oo|ee)/.test(said), `${text}: long vowel`);
  }
});

test('whispered vowels are one entry per word with every span (しています listed the same note twice)', async () => {
  const t = (await run('しています。')).tokens[0];
  const whispered = t.sounds.filter((s) => s.type === 'devoiced');
  assert.equal(whispered.length, 1);
  assert.ok(whispered[0].spans.length >= 2);
  assert.deepEqual(whispered[0].at, whispered[0].spans[0]);
});

// ── Names ────────────────────────────────────────────────────────────────

test('names: 口 after the first kanji is ぐち, a few surnames are read whole, 𠮷 reads as 吉', async () => {
  assert.equal(saidLine(await run('山口さんに会いました。')), 'yamaguchi san ni aimashita');
  for (const [text, name, reading] of [['清水さん', '清水', 'しみず'], ['五十嵐さん', '五十嵐', 'いがらし'], ['長谷川さん', '長谷川', 'はせがわ']]) {
    const r = await run(text);
    const t = tok(r, name);
    assert.ok(t, `${name} in ${cut(r)}`);
    assert.equal(t.kind, 'name');
    assert.equal(t.confidence, 'guess');
    assert.equal(t.reading, reading);
    assert.deepEqual(t.furigana, [{ text: name, ruby: reading, whole: true }]);
  }
  const r = await run('𠮷野さん');
  assert.equal(r.tokens[0].reading, 'よしの');
});

// ── Odd input and long input ─────────────────────────────────────────────

test('invisible characters do not split a word; an emoji built from several code points is one token', async () => {
  const r = await run('わたし​はがくせい');
  assert.equal(r.text, normalize('わたし​はがくせい'));
  assert.equal(cut(r), 'わたし|は|がくせい');
  assert.equal(tok(r, 'は').romaji.said, 'wa');
  const e = await run('家族👨‍👩‍👧です🇯🇵');
  assert.equal(cut(e), '家族|👨‍👩‍👧|です|🇯🇵');
});

test('a long run of kanji with no kana is read in time that grows with its length, not its square', async () => {
  const d = diskDict();
  const unit = '東京都内大雨警報発表首相記者会見経済対策説明';
  await analyze(unit, { dict: d });
  const time = async (text) => { const t0 = performance.now(); await analyze(text, { dict: d }); return performance.now() - t0; };
  const long = unit.repeat(100).slice(0, 2000);
  const ms = await time(long);
  // Measured at about 0.4 s where it had been 21 s; the bound is loose so a
  // slow machine passes and a scan that went quadratic again does not.
  assert.ok(ms < 5000, `${ms.toFixed(0)} ms for 2,000 kanji`);
  const r = await analyze(long, { dict: d });
  assert.equal(r.tokens.map((t) => t.surface).join(''), long);
});

// ── Loading ──────────────────────────────────────────────────────────────

/** The sentences the shard count was measured on, and a 500-character paragraph written for this test. */
const PARAGRAPH = '私の名前はマリアです。メキシコから来ました。今、東京の大学で日本語と経済を勉強しています。毎朝六時半に起きて、コーヒーを飲みながら新聞を読みます。それから電車で学校へ行きます。駅まで歩いて十分かかります。授業は九時から始まって、午後三時ごろ終わります。昼ご飯はたいてい友だちと学生食堂で食べます。安くておいしいですが、いつも込んでいます。授業のあとで、図書館で宿題をしたり、本を借りたりします。週末は時々アルバイトをします。駅の近くの喫茶店で働いていて、お客さんと話すのが楽しいです。先週の日曜日は雨が降っていたので、一日中うちにいました。部屋を掃除して、洗濯をして、夜は母に長い手紙を書きました。来月、国から両親が遊びに来ます。いっしょに京都や奈良へ行って、古いお寺を見るつもりです。両親は日本語がぜんぜんわからないので、わたしが通訳をしなければなりません。少し心配ですが、とても楽しみにしています。日本に来てから半年がたちました。最初は漢字が難しくて、ひらがなしか読めませんでしたが、今は簡単な小説も読めるようになりました。これからも毎日少しずつがんばりたいと思います。春には花見に行きたいです。';
const MEASURED = [
  '今日はいい天気ですね。', 'わたしはがくせいです。', 'すもももももももものうち', '日本語を勉強しています。',
  'こんにちは、田中です。よろしくおねがいします。', '雨が降ったら、うちにいます。', 'きのうともだちとえいがをみました。',
  '駅まで十分かかります。', PARAGRAPH,
];

/** A fresh dictionary that records every file it fetches, and every need() call. */
function countingDict() {
  const files = [];
  const inner = createDict({ fetchJson: (path) => { files.push(path.slice(DATA.length + 1)); return fetchJson(path); }, base: `${DATA}/` });
  const needs = [];
  const d = { ...inner, need: (keys) => { needs.push(new Set(keys)); return inner.need(keys); }, get maxKey() { return inner.maxKey; } };
  return { d, files, needs, inner };
}

const dictFiles = (files) => files.filter((f) => /^dict\/(core|w\d+)\.json$/.test(f));

test('a text asks the dictionary once: no second pass for kanji spellings or readings (a kana sentence loaded up to 20 of 27 shards)', async () => {
  for (const text of MEASURED.slice(0, 8)) {
    const { d, needs } = countingDict();
    await analyze(text, { dict: d });
    assert.equal(needs.length, 1, `${text}: ${needs.length} rounds of dict.need`);
  }
  assert.equal(PARAGRAPH.length, 500);
});

test('the measured sentences fetch a median of five dictionary files or fewer (it was 16)', async () => {
  const counts = [];
  for (const text of MEASURED) {
    const { d, files } = countingDict();
    await analyze(text, { dict: d });
    counts.push(dictFiles(files).length);
  }
  const sorted = [...counts].sort((a, b) => a - b);
  assert.ok(sorted[(sorted.length - 1) >> 1] <= 5, `files per sentence: ${counts.join(' ')}`);
  // a short sentence stays well under the 27 range shards it used to reach
  for (const [k, n] of counts.slice(0, 8).entries()) assert.ok(n <= 10, `${MEASURED[k]}: ${n} files`);
});

test('a range shard is fetched only for a key it holds: the filter turns the rest away', async () => {
  for (const text of ['わたしはがくせいです。', 'きのうともだちとえいがをみました。']) {
    const { d, files, needs } = countingDict();
    await analyze(text, { dict: d });
    const asked = needs[0];
    for (const f of dictFiles(files).filter((x) => x.startsWith('dict/w'))) {
      const doc = await fetchJson(`${DATA}/${f}`);
      assert.ok([...asked].some((k) => Object.hasOwn(doc.entries, k)), `${text}: ${f} holds none of its keys`);
    }
  }
});

test('the result does not depend on what an earlier text loaded', async () => {
  const warm = diskDict();
  await analyze(PARAGRAPH, { dict: warm });
  for (const text of MEASURED.slice(0, 8)) {
    const cold = JSON.stringify(await analyze(text, { dict: diskDict() }));
    assert.equal(JSON.stringify(await analyze(text, { dict: warm })), cold, text);
  }
});
