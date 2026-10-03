// The second phase and the larger tables (2026-10-01), against the committed
// shards: the rest of JMdict in data/dict/rare.json and rNNN, the names in
// data/names/, every KANJIDIC2 character in data/kanji/.
//
//   node --test tests/tiers.test.mjs
//
// The second phase reads again only what the first pass guessed (js/rare.js),
// so most of this file is about that boundary: what it may change, what it
// must not, and what a text with no guess must not fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { analyze } from '../js/analyze.js';
import { createDict } from '../js/dict.js';
import {
  run, cut, saidLine, diskDict, fetchJson, DATA, SITE,
} from './helpers/disk.mjs';

const tok = (r, surface) => r.tokens.find((t) => t.surface === surface);

/**
 * The committed dictionary with the second phase's tiers taken away, which
 * is the first pass alone: analyze.js skips the second phase for a
 * dictionary that cannot load them.
 */
function firstPassOnly() {
  const d = diskDict();
  return { ...d, needRare: undefined, needNames: undefined, get maxKey() { return d.maxKey; } };
}

/** A fresh dictionary that records every file it fetches. */
function countingDict() {
  const files = [];
  const d = createDict({ fetchJson: (path) => { files.push(path.slice(DATA.length + 1)); return fetchJson(path); }, base: `${DATA}/` });
  return { d, files };
}

/** A file of the second phase: the rare-word index, shards and filters, or anything of the names. */
const SECOND = /^(dict\/(rare|r\d{3}|rf\d+)\.json|names\/)/;

// ── The boundary ─────────────────────────────────────────────────────────

test('a sentence with no guess fetches no file of the second tier or the names', async () => {
  for (const text of [
    '今日はいい天気ですね。', 'わたしはがくせいです。', 'すもももももももものうち', '日本語を勉強しています。',
    '雨が降ったら、うちにいます。', 'きのうともだちとえいがをみました。', '駅まで十分かかります。',
    'アルバイトをしています。', '東京駅で会いましょう。',
  ]) {
    const { d, files } = countingDict();
    const r = await analyze(text, { dict: d });
    assert.equal(r.unknown, 0, `${text}: ${cut(r)}`);
    assert.deepEqual(files.filter((f) => SECOND.test(f)), [], text);
    assert.equal(d.loadedRare, 0, text);
  }
});

test('a sentence with a guess fetches the second phase once, and only for the guessed stretch', async () => {
  const { d, files } = countingDict();
  const r = await analyze('こんにちは、田中です。', { dict: d });
  assert.equal(tok(r, '田中').confidence, 'dict');
  const second = files.filter((f) => SECOND.test(f));
  assert.ok(second.includes('dict/rare.json') && second.includes('names/index.json'), second.join(' '));
  assert.equal(new Set(second).size, second.length, `a file fetched twice: ${second.join(' ')}`);
  // 田, 田中 and 中 are all it asks about: two rare shards at most and one names shard
  assert.ok(second.length <= 6, second.join(' '));
});

test('no token the first pass read from the first tier changes, not even its gloss', async () => {
  const first = firstPassOnly();
  for (const text of [
    '彼は世俗的な成功には無関心だ。', 'マジで重いから絶対ムリ。', '富山湾にはときどき蜃気楼が現われます。',
    'トムさんはクリスマスプレゼントを買った。', '鈴木一郎です。', 'インフォームショップに行きました。',
  ]) {
    const before = await analyze(text, { dict: first });
    const after = await run(text);
    // the whole token, its sounds and grammar notes included; only its
    // index in the flat list may move, when a guess before it splits in two
    const kept = new Set(after.tokens.map((u) => JSON.stringify({ ...u, i: undefined })));
    for (const t of before.tokens) {
      if (t.confidence === 'guess' || t.kind === 'unknown') continue;
      assert.ok(kept.has(JSON.stringify({ ...t, i: undefined })), `${text}: ${t.surface} changed`);
    }
    assert.ok(after.unknown <= before.unknown, `${text}: ${before.unknown} guesses, now ${after.unknown}`);
  }
  // な after a rare na-adjective keeps the gloss the first pass gave it
  const r = await run('彼は世俗的な成功には無関心だ。');
  assert.equal(tok(r, '世俗的').entry.tier, 2);
  assert.equal(tok(r, 'な').kind, 'particle');
});

test('the result does not depend on what an earlier text loaded, the second phase included', async () => {
  const warm = diskDict();
  await analyze('富山湾にはときどき蜃気楼が現われます。トムとメアリーと小林さんはクリスマスプレゼントを買った。', { dict: warm });
  for (const text of ['蜃気楼が見えた。', '小林さんに会った。', 'メアリーです。', '田中さん', 'インフォームショップ']) {
    const cold = JSON.stringify(await analyze(text, { dict: diskDict() }));
    assert.equal(JSON.stringify(await analyze(text, { dict: warm })), cold, text);
  }
});

// ── Rare words ───────────────────────────────────────────────────────────

test('a rare word only the second tier has is read from it, and says so (蜃気楼 was a guessed name)', async () => {
  const first = await analyze('蜃気楼が見えた。', { dict: firstPassOnly() });
  assert.equal(tok(first, '蜃気楼').kind, 'name');
  assert.equal(tok(first, '蜃気楼').confidence, 'guess');
  const d = diskDict();
  const r = await analyze('蜃気楼が見えた。', { dict: d });
  const t = tok(r, '蜃気楼');
  assert.equal(t.kind, 'word');
  assert.equal(t.confidence, 'dict');
  assert.equal(t.reading, 'しんきろう');
  assert.equal(t.entry.tier, 2);
  assert.deepEqual(t.entry.g, ['mirage']);
  assert.equal(r.unknown, 0);
  // and the first tier does not have it: the key is loaded, and absent
  assert.equal(d.get('蜃気楼'), undefined);
});

test('a kana spelling of a common word is read as that word (リンゴ, ホント, カギ were guesses)', async () => {
  for (const [text, word, gloss] of [['リンゴを食べた。', 'リンゴ', 'apple (fruit)'], ['ホントかウソか', 'ホント', 'truth'], ['カギをなくした。', 'カギ', 'key']]) {
    const t = tok(await run(text), word);
    assert.ok(t, text);
    assert.equal(t.confidence, 'dict', text);
    assert.equal(t.entry.g[0], gloss, text);
    assert.equal(t.entry.tier, 2, text);
  }
});

test('a katakana run that is known words splits where they are, and nowhere else', async () => {
  // the whole compound is a rare word
  assert.equal(cut(await run('クリスマスプレゼント')), 'クリスマスプレゼント');
  // "shop" is a word; インフォーム is not, and stays one guess rather than
  // イン|フォーム ("in (tennis)", "form")
  const r = await run('インフォームショップ');
  assert.equal(cut(r), 'インフォーム|ショップ');
  assert.equal(r.tokens[0].confidence, 'guess');
  assert.deepEqual(r.tokens[1].entry.g, ['shop']);
  assert.equal(saidLine(r), 'infoomu shoppu');
  // a cut never falls before a bar or after a small tsu
  for (const t of (await run('チャップリンを見た。')).tokens) assert.ok(!/^[ーッ]/.test(t.surface), t.surface);
});

test('a common katakana word of three kana is a word inside a split run (テニス was left a guess beside トーナメント)', async () => {
  for (const [text, parts] of [
    ['テニストーナメントに出る。', ['テニス', 'トーナメント']],
    ['インドレストランです。', ['インド', 'レストラン']],
    ['コロナワクチンは受けない。', ['コロナ', 'ワクチン']],
  ]) {
    const r = await run(text);
    for (const p of parts) {
      const t = tok(r, p);
      assert.ok(t, `${p} in ${cut(r)}`);
      assert.equal(t.confidence, 'dict', `${text}: ${p}`);
      assert.equal(t.entry.tier, undefined, `${text}: ${p} is a first-tier word`);
    }
  }
  // a two-kana stub is still no word: インフォーム stays one guess
  assert.equal(cut(await run('インフォームショップ')), 'インフォーム|ショップ');
});

test('one kanji KANJIDIC reads with okurigana is no rare word: it is the stem the first pass missed (見に行く, 狭過ぎる)', async () => {
  // Each was a confident rare word before the rule (見 けん "view (of life)",
  // 狭 せ "narrowness", 暑 しょ "heat", 仕 し "official"); each is a guess
  // again, which is what the first pass knew about it.
  for (const [text, ch] of [['よく映画を見に行きますよ。', '見'], ['門はその車には狭過ぎる。', '狭'], ['私、すごい暑がりなのよ。', '暑'], ['悪い子にはお仕置きが必要だ。', '仕']]) {
    const t = tok(await run(text), ch);
    assert.ok(t, `${ch} in ${text}`);
    assert.equal(t.confidence, 'guess', `${text}: ${ch} read as ${t.reading} "${t.entry && t.entry.g}"`);
    assert.equal(t.entry, null, text);
  }
  // a kanji with no such reading still stands as a rare word before a particle
  assert.equal(tok(await run('政府はワインに新たに税を課した。'), '税').entry.tier, 2);
});

test('before an honorific a rare word loses to a guessed name: 悶着さん is someone, 悶着を起こした is trouble', async () => {
  const person = tok(await run('悶着さん'), '悶着');
  assert.equal(person.kind, 'name');
  assert.equal(person.confidence, 'guess');
  const trouble = tok(await run('悶着を起こした。'), '悶着');
  assert.equal(trouble.kind, 'word');
  assert.equal(trouble.entry.tier, 2);
});

test('a rare word loses to the name before an honorific: 清水さん is Shimizu, 清水を飲む is water', async () => {
  const name = tok(await run('清水さんに会った。'), '清水');
  assert.equal(name.kind, 'name');
  assert.equal(name.reading, 'しみず');
  const water = tok(await run('清水を飲んだ。'), '清水');
  assert.equal(water.confidence, 'dict');
  assert.ok(['word', 'name'].includes(water.kind));
});

// ── Names ────────────────────────────────────────────────────────────────

test('a surname from the names tier is read with its JMnedict reading (小林 was guessed こはやし)', async () => {
  const guessed = tok(await analyze('小林さんに会った。', { dict: firstPassOnly() }), '小林');
  assert.equal(guessed.confidence, 'guess');
  assert.equal(guessed.reading, 'こはやし');
  const r = await run('小林さんに会った。');
  const t = tok(r, '小林');
  assert.equal(t.kind, 'name');
  assert.equal(t.confidence, 'dict');
  assert.equal(t.reading, 'こばやし');
  assert.deepEqual(t.entry.nt, ['surname', 'place']);
  assert.deepEqual(t.entry.g, ['surname', 'place name']);
  assert.equal(t.entry.p, 'n-pr');
  assert.equal(saidLine(r), 'kobayashi san ni atta');
});

test('a family name and a given name side by side are two names (鈴木一郎 was one guess)', async () => {
  const r = await run('鈴木一郎です。');
  assert.equal(cut(r), '鈴木|一郎|です|。');
  assert.equal(tok(r, '鈴木').reading, 'すずき');
  assert.equal(tok(r, '一郎').reading, 'いちろう');
  assert.ok(tok(r, '一郎').entry.g.includes('given name (male)'));
  assert.equal(r.unknown, 0);
});

test('only a family name then a given name pair up: 小田原城 is not 小田 and 原城, two surnames', async () => {
  const r = await run('私たちは、小田原城に行く。');
  assert.ok(!r.tokens.some((t) => t.surface === '原城'), cut(r));
  assert.ok(!r.tokens.some((t) => t.surface === '小田'), cut(r));
});

test('a name is not read where the next token is its okurigana or a verb (末永く, オットリしている)', async () => {
  for (const [text, s] of [['彼は末永く記憶に残るだろう。', '末永'], ['花子はオットリしているようで、やるときはやる人間だ。', 'オットリ']]) {
    const t = tok(await run(text), s);
    assert.ok(t, `${s} in ${text}`);
    assert.notEqual(t.kind === 'name' && t.confidence === 'dict', true, `${text}: ${s} read as the name ${t.reading}`);
  }
  // a phrase after a name is not okurigana: トムにとって, ジョニーという
  for (const [text, s] of [['トムにとっていいことなの？', 'トム'], ['彼はジョニーという名で通っていた。', 'ジョニー']]) {
    const t = tok(await run(text), s);
    assert.equal(t.kind, 'name', text);
    assert.equal(t.confidence, 'dict', text);
  }
});

test('a foreign name in katakana is a name, not the rare word spelled the same (ジョン is not the dish)', async () => {
  for (const [text, name] of [['トムは学生です。', 'トム'], ['ジョンが来た。', 'ジョン'], ['メアリーです。', 'メアリー']]) {
    const t = tok(await run(text), name);
    assert.equal(t.kind, 'name', text);
    assert.equal(t.confidence, 'dict', text);
  }
});

test('a name JMnedict lists that is also a word stays the word: 陸地 is "land", not the place かちじ', async () => {
  const t = tok(await run('私たちには本当に陸地の形が見えた。'), '陸地');
  assert.equal(t.kind, 'word');
  assert.equal(t.reading, 'りくち');
});

// ── Kanji and the loanword marks ─────────────────────────────────────────

test('a kanji outside the 2,600 the table used to stop at has readings and a meaning (鰻)', async () => {
  const index = JSON.parse(readFileSync(join(SITE, 'data/kanji/index.json'), 'utf8'));
  const listed = index.shards.filter((s) => s.chars !== undefined).map((s) => s.chars).join('');
  assert.ok(!listed.includes('鰻'), '鰻 is one of the characters the table gained');
  const { d, files } = countingDict();
  const r = await analyze('鰻が好きです。', { dict: d });
  const k = r.kanji.find((x) => x.char === '鰻');
  assert.ok(k && k.info, 'no kanji info for 鰻');
  assert.ok(k.info.m.includes('eel'));
  assert.ok(k.info.kun.includes('うなぎ'));
  assert.ok(k.readings.includes('うなぎ'));
  // one more kanji shard for the rare one, and only that
  assert.equal(files.filter((f) => f.startsWith('kanji/k')).length, 2, files.join(' '));
});

test('a record says where a borrowed word came from (ls) and whether it was made in Japan (ws)', async () => {
  const d = diskDict();
  await analyze('アルバイトとナイターとパン', { dict: d });
  assert.deepEqual(d.get('アルバイト')[0].ls, ['ger', 'Arbeit']);
  assert.deepEqual(d.get('パン')[0].ls, ['por', 'pão']);
  const nighter = d.get('ナイター')[0];
  assert.deepEqual(nighter.ls, ['eng', 'nighter']);
  assert.equal(nighter.ws, 1);
  assert.equal(d.get('アルバイト')[0].ws, undefined);
});
