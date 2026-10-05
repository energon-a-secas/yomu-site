// Sounds like English (js/sounds-like.js): the English a katakana part with
// no record most likely spells, offered as a guess and never as a gloss, and
// fetched only for such a part.
//
//   node --test tests/sounds-like.test.mjs
//
// How often the guess is right is measured, not tested here: that takes a
// minute over every JMdict loanword (tools/measure-sounds-like.mjs, and the
// table in docs/ANALYZER.md, "Sounds like English").

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyze } from '../js/analyze.js';
import { createDict } from '../js/dict.js';
import {
  GROUPS_FOR, LIKE, groupsOfWord, groupsOfKana, lineUp, soundsLike, modelFor, guessParts,
} from '../js/sounds-like.js';
import { MATCH } from '../js/loan-align.js';
import { run, cut, diskDict, fetchJson, DATA } from './helpers/disk.mjs';

/** A fresh dictionary that records every file it fetches. */
function countingDict() {
  const files = [];
  const d = createDict({ fetchJson: (path) => { files.push(path.slice(DATA.length + 1)); return fetchJson(path); }, base: `${DATA}/` });
  return { d, files };
}

const likeFiles = (files) => files.filter((f) => f.startsWith('like/')).sort();

/** The parts of a text's one compound, as [surface, gloss, soundsLike]. */
async function parts(text) {
  const t = (await run(text)).tokens.find((x) => x.parts);
  assert.ok(t, `${text} has no compound`);
  return t.parts.map((p) => [p.surface, p.gloss, p.soundsLike ?? null]);
}

// ── On the page's own path ───────────────────────────────────────────────

test('インフォーム in インフォームショップ sounds like "inform", a guess beside its gloss, never in it', async () => {
  const r = await run('インフォームショップに行きました。');
  const t = r.tokens[0];
  assert.equal(cut(r), 'インフォームショップ|に|行きました|。');
  assert.deepEqual(t.parts.map((p) => [p.surface, p.gloss, p.tier, p.soundsLike ?? null]), [
    ['インフォーム', null, null, 'inform'],
    ['ショップ', 'shop', 1, null],
  ]);
  // the guess is no dictionary entry: the part and the compound stay guesses
  assert.equal(t.parts[0].entry, null);
  assert.equal(t.gloss, null);
  assert.equal(t.entry, null);
  assert.equal(t.confidence, 'guess');
  assert.equal(r.unknown, 1);
});

test('the parts JMdict has no record of are read by their sound (relate, explore, consider, decide)', async () => {
  for (const [head, word] of [['リレート', 'relate'], ['エクスプロア', 'explore'], ['コンシダー', 'consider'], ['ディサイド', 'decide']]) {
    assert.deepEqual(await parts(`${head}ショップ`), [[head, null, word], ['ショップ', 'shop', null]], head);
  }
});

test('no guess where none is clearly ahead, or the part is short, or a record covers it', async () => {
  // リクワイア lines up with more than one word nearly as well; トショップ's
  // ト is a stub of three kana; ショップ has a record
  assert.deepEqual(await parts('リクワイアショップ'), [['リクワイア', null, null], ['ショップ', 'shop', null]]);
  for (const p of await parts('アトラクトショップ')) if (p[1] === null) assert.equal(p[2], null, p[0]);
  assert.deepEqual(await parts('テニストーナメント'), [['テニス', 'tennis', null], ['トーナメント', 'tournament', null]]);
});

// ── What it fetches ──────────────────────────────────────────────────────

test('a text with no katakana part the dictionary lacks fetches no sound-alike file', async () => {
  for (const text of [
    '今日はいい天気ですね。', 'アイスクリームショップに行く。', 'テニストーナメントに出る。',
    'トムさんはクリスマスプレゼントを買った。', 'ジャバウォック', '十名が来ました。',
  ]) {
    const { d, files } = countingDict();
    await analyze(text, { dict: d });
    assert.deepEqual(likeFiles(files), [], text);
    assert.equal(d.loadedLike, 0, text);
  }
});

test('a part the dictionary lacks fetches the index and only the groups its first consonant may stand for', async () => {
  const { d, files } = countingDict();
  await analyze('インフォームショップ', { dict: d });
  // イ is a vowel; ン, the first consonant, is an English m or n
  assert.deepEqual(likeFiles(files), ['like/index.json', 'like/m.json', 'like/n.json']);
  assert.equal(d.loadedLike, 3);
});

test('the guess does not depend on what an earlier text loaded', async () => {
  const warm = diskDict();
  await analyze('ディサイドショップとリレートショップとコンシダーショップ', { dict: warm });
  for (const text of ['インフォームショップ', 'エクスプロアショップ']) {
    const cold = JSON.stringify(await analyze(text, { dict: diskDict() }));
    assert.equal(JSON.stringify(await analyze(text, { dict: warm })), cold, text);
  }
});

test('when the files cannot be loaded, the reading stands with no guess', async () => {
  const d = createDict({
    fetchJson: (path) => (path.includes('/like/') ? Promise.reject(new Error('offline')) : fetchJson(path)),
    base: `${DATA}/`,
  });
  const t = (await analyze('インフォームショップ', { dict: d })).tokens[0];
  assert.deepEqual(t.parts.map((p) => p.surface), ['インフォーム', 'ショップ']);
  assert.equal(t.parts[0].soundsLike, undefined);
  // and a dictionary with no sound-alike words at all is left alone
  const tokens = [{ parts: [{ surface: 'インフォーム', entry: null }] }];
  await guessParts(tokens, { ...diskDict(), needLike: undefined });
  assert.equal(tokens[0].parts[0].soundsLike, undefined);
});

// ── The rules run backwards ──────────────────────────────────────────────

test('a katakana consonant looks only where English is written with it: MATCH, reversed', () => {
  for (const [eng, kata] of Object.entries(MATCH)) {
    for (const k of Object.keys(kata)) assert.ok(GROUPS_FOR[k].includes(eng), `${k} for ${eng}`);
  }
  assert.deepEqual([...GROUPS_FOR.R], ['L', 'R']);
  assert.deepEqual([...GROUPS_FOR.B], ['B', 'V']);
  assert.deepEqual(groupsOfKana('インフォーム'), ['M', 'N']);
  assert.deepEqual(groupsOfKana('ルーム'), ['L', 'R']);
  // a word is filed under the consonant a katakana word's first one matches:
  // hour and you have none that must be; the w of wood may go unsaid, and
  // the wh of whisky is written with a vowel (ウイスキー)
  assert.deepEqual(groupsOfWord('inform'), ['N']);
  assert.deepEqual(groupsOfWord('hour'), []);
  assert.deepEqual(groupsOfWord('wood'), ['W', 'D']);
  assert.deepEqual(groupsOfWord('whisky'), ['W', 'S']);
});

test('a line-up pairs what the vowels did with what the consonants did', () => {
  const al = lineUp('インフォーム', 'inform');
  assert.equal(al.cost, 0);
  assert.deepEqual(al.pieces, [['^i', 'i'], ['', ''], ['#n', 'NN'], ['or', 'o-'], ['#f', 'F'], ['$', 'u'], ['#m', 'M']]);
  assert.equal(lineUp('インフォーム', 'shop'), null);
});

test('soundsLike offers nothing under four kana, and the order of the words decides nothing', async () => {
  const d = diskDict();
  await d.needLike(['B', 'V', 'S', 'TH', 'SI', 'N', 'M']);
  const data = d.like();
  const logp = modelFor(data.pieces);
  const words = (kana) => groupsOfKana(kana).flatMap((g) => data.words(g));
  assert.equal(LIKE.minKana, 4);
  assert.equal(soundsLike('ボス', words('ボス'), logp), null);
  const list = words('インフォーム');
  assert.equal(soundsLike('インフォーム', list, logp), 'inform');
  assert.equal(soundsLike('インフォーム', [...list].reverse(), logp), 'inform');
});
