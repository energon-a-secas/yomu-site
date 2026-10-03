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
  // イン|フォーム ("in (tennis)", "form"). The pieces are one word on the
  // page (compounds.js), and the split is kept as its parts.
  const r = await run('インフォームショップ');
  assert.equal(cut(r), 'インフォームショップ');
  const [t] = r.tokens;
  assert.deepEqual(t.parts.map((p) => p.surface), ['インフォーム', 'ショップ']);
  assert.equal(t.confidence, 'guess');
  assert.equal(t.parts[0].entry, null);
  assert.deepEqual(t.parts[1].entry.g, ['shop']);
  assert.equal(saidLine(r), 'infoomushoppu');
  // a cut never falls before a bar or after a small tsu
  for (const x of (await run('チャップリンを見た。')).tokens) {
    for (const p of x.parts || [x]) assert.ok(!/^[ーッ]/.test(p.surface), p.surface);
  }
});

test('a common katakana word of three kana is a word inside a split run (テニス was left a guess beside トーナメント)', async () => {
  for (const [text, parts] of [
    ['テニストーナメントに出る。', ['テニス', 'トーナメント']],
    ['インドレストランです。', ['インド', 'レストラン']],
    ['コロナワクチンは受けない。', ['コロナ', 'ワクチン']],
  ]) {
    const r = await run(text);
    // one compound on the page (compounds.js), its parts the words
    const t = r.tokens.find((x) => x.parts && x.parts[0].surface === parts[0]);
    assert.ok(t, `${parts.join('|')} in ${cut(r)}`);
    assert.deepEqual(t.parts.map((q) => q.surface), parts, text);
    assert.equal(t.confidence, 'rule', text);
    for (const q of t.parts) {
      assert.ok(q.entry, `${text}: ${q.surface}`);
      assert.equal(q.tier, 1, `${text}: ${q.surface} is a first-tier word`);
      assert.equal(q.entry.tier, undefined, `${text}: ${q.surface} is a first-tier word`);
    }
  }
  // a two-kana stub is still no word: インフォーム stays one guess
  assert.deepEqual((await run('インフォームショップ')).tokens[0].parts.map((p) => p.surface), ['インフォーム', 'ショップ']);
});

test('one kanji KANJIDIC reads with okurigana is no rare word: it is the stem the first pass missed (見に行く, 狭過ぎる)', async () => {
  // Each was a confident rare word before the rule (見 けん "view (of life)",
  // 狭 せ "narrowness", 暑 しょ "heat", 仕 し "official"); each is a guess
  // again, which is what the first pass knew about it.
  for (const [text, ch] of [['門はその車には狭過ぎる。', '狭'], ['私、すごい暑がりなのよ。', '暑'], ['悪い子にはお仕置きが必要だ。', '仕']]) {
    const t = tok(await run(text), ch);
    assert.ok(t, `${ch} in ${text}`);
    assert.equal(t.confidence, 'guess', `${text}: ${ch} read as ${t.reading} "${t.entry && t.entry.g}"`);
    assert.equal(t.entry, null, text);
  }
  // Since 2026-10-03 the first pass reads 見 itself, as 見る's stem (an
  // ichidan stem is its kanji alone), so it is no guess and no rare word
  const mi = tok(await run('よく映画を見に行きますよ。'), '見');
  assert.equal(mi.confidence, 'dict');
  assert.equal(mi.reading, 'み');
  assert.equal(mi.base, '見る');
  assert.equal(mi.entry.tier, undefined);
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
  // Nothing in the sentence tells the surname from the water, so where the
  // name is read it says it is also the word (2026-10-03: the verifier read
  // "surname" alone and called it wrong)
  if (water.kind === 'name') {
    assert.ok(water.entry.also, 'a name read over a rare word says it is also that word');
    assert.equal(water.entry.also.g[0], 'spring water');
    assert.equal(water.entry.also.r, 'しみず');
  } else {
    assert.equal(water.entry.g[0], 'spring water');
  }
});

// ── What the verifiers found on 2026-10-03 ───────────────────────────────

test('a katakana name never beats the word it spells: バグ is a bug, バラ a rose, イヌ a dog (all were names)', async () => {
  for (const [text, word, gloss] of [
    ['バグを直した。', 'バグ', '(software) bug'], ['赤いバラは咲いた？', 'バラ', 'rose'],
    ['イヌが吠えている。', 'イヌ', 'dog (Canis (lupus) familiaris)'], ['それはバグじゃなくて', 'バグ', '(software) bug'],
  ]) {
    const t = tok(await run(text), word);
    assert.ok(t, `${word} in ${text}`);
    assert.notEqual(t.kind, 'name', `${text}: ${word} read as a name`);
    assert.equal(t.entry.g[0], gloss, text);
  }
  // バグ was strong because JMnedict has バグダッド and バグラム, which are
  // not built on it; it is no strong name now
  const d = diskDict();
  await analyze('バグを直した。', { dict: d });
  assert.equal((d.name('バグ') || {}).s, undefined);
});

test('a strong katakana name still loses to the kana spelling of a common word (アリ is 蟻, an ant)', async () => {
  const d = diskDict();
  const t = tok(await analyze('アリを見た。', { dict: d }), 'アリ');
  assert.equal(d.name('アリ').s, 1, 'アリ is a strong name (Muhammad Ali and others start with it)');
  assert.equal(t.kind, 'katakana');
  assert.equal(t.entry.g[0], 'ant');
  assert.equal(t.entry.e, 1);
  // and ジョン, which no common word spells, is still John
  assert.equal(tok(await run('ジョンが来た。'), 'ジョン').kind, 'name');
});

test('a surname read another way than the rare word wins only when people carry it often (中吉, 大安 are the words)', async () => {
  for (const [text, s, reading] of [['中吉が出た。', '中吉', 'ちゅうきち'], ['大安の日に', '大安', 'たいあん']]) {
    const t = tok(await run(text), s);
    assert.equal(t.kind, 'word', `${text}: read as ${t.kind} ${t.reading}`);
    assert.equal(t.reading, reading, text);
    assert.equal(t.entry.tier, 2, text);
  }
  // 金子 is かねこ, not きんす "money": built on by over a hundred full names
  const kaneko = tok(await run('金子さんが来た。'), '金子');
  assert.equal(kaneko.kind, 'name');
  assert.equal(kaneko.reading, 'かねこ');
  assert.equal(kaneko.entry.also.g[0], 'money');
});

test('a word the first tier writes with a kanji is that word in the second tier too (饂飩 is udon, not wonton)', async () => {
  const t = tok(await run('饂飩を食べた。'), '饂飩');
  assert.equal(t.reading, 'うどん');
  assert.equal(t.entry.g[0], 'udon');
  assert.equal(t.entry.tier, 2);
});

test('the polite お before a word keeps it a word: お米屋さん is the rice shop, not the surname 米屋', async () => {
  const t = tok(await run('お米屋さんは、言わずと知れた斜陽産業。'), '米屋');
  assert.equal(t.kind, 'word');
  assert.equal(t.entry.g[0], 'rice shop');
  // with no お it is still someone
  assert.equal(tok(await run('米屋さんが来た。'), '米屋').kind, 'name');
});

test('a place and the bay, station or mountain named after it are two words (富山湾 was とみやまいりえ)', async () => {
  for (const [text, place, noun, reading] of [
    ['富山湾にはときどき蜃気楼が現われます。', '富山', '湾', 'とやまわん'], ['富山駅で会おう。', '富山', '駅', 'とやまえき'],
    ['函館山に登った。', '函館', '山', 'はこだてやま'], ['軽井沢町に住む。', '軽井沢', '町', 'かるいざわまち'],
  ]) {
    const r = await run(text);
    const a = tok(r, place);
    const b = tok(r, noun);
    assert.ok(a && b, `${place}|${noun} in ${cut(r)}`);
    assert.equal(a.kind, 'name', text);
    assert.ok(a.entry.nt.includes('place'), text);
    assert.equal(a.reading + b.reading, reading, text);
    assert.equal(r.unknown, 0, text);
  }
  // and a whole place name the names tier holds is not carved into a place
  // and a noun: 小田原 stays おだわら, 三田市 is not みた|いち
  for (const [text, whole] of [['小田原に行く。', '小田原'], ['三田市に行く。', '三田市']]) {
    const r = await run(text);
    assert.ok(tok(r, whole), `${whole} in ${cut(r)}`);
  }
});

test('a token beside a stretch keeps its dictionary fields, and its pair notes follow the new neighbour (億劫で)', async () => {
  const first = await analyze('億劫で', { dict: firstPassOnly() });
  const after = await run('億劫で');
  const de0 = tok(first, 'で');
  const de1 = tok(after, 'で');
  assert.equal(tok(first, '億劫').confidence, 'guess');
  assert.equal(tok(after, '億劫').entry.tier, 2);
  // the token the first pass built: its kind, reading, gloss, said line
  for (const k of ['kind', 'surface', 'reading', 'confidence', 'start', 'end']) assert.deepEqual(de1[k], de0[k], k);
  assert.deepEqual(de1.entry, de0.entry);
  assert.deepEqual(de1.romaji, de0.romaji);
  // its grammar note is worked out after both passes from the word before
  // it, and after a na-adjective で is "and" (docs/ANALYZER.md)
  assert.deepEqual(de1.grammar.map((g) => g.id), ['de-and']);
  assert.deepEqual(de0.grammar.map((g) => g.id), ['de']);
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
