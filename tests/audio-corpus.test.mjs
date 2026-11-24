// The corpus kind (tools/lib/audio-script.mjs corpusLines, docs/AUDIO.md
// "Words of real text"): the words of the example sentences with no clip,
// keyed as Naninani's word by word looks them up, the most frequent first.
// Nothing here calls ElevenLabs; the sentences are a handful written for the
// test, read by the analyzer over the committed data/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  KINDS, DEFAULT_KINDS, WORD_KINDS, CORPUS_VOICES, CORPUS_KEPT, spokenWord, corpusLines, takeCorpus, fullScript, namedInEnglish,
  consonants, isRankingSentence, corpusLeftOut, corpusKept, keptCorpusLine, readCorpusKept,
} from '../tools/lib/audio-script.mjs';
import { makeCheck } from '../tools/lib/audio-check.mjs';
import { wordKey, clipId, normalizeAudio, addShard, clipInVoice } from '../js/audio.js';
import { beats } from '../js/kana.js';
import { dict, run, DATA } from './helpers/disk.mjs';

const library = JSON.parse(readFileSync(new URL('../data/phrases/library.json', import.meta.url), 'utf8'));

const SENTENCES = [
  { id: '2', ja: 'トムは駅へ行った。', en: 'Tom went to the station.' },
  { id: '4', ja: 'ジョンはそう言った。', en: 'John said so.' },
  { id: '6', ja: '私も学校へ行った。', en: 'I went to school too.' },
  { id: '8', ja: 'サムは魚屋の店を持っている。', en: "Sam owns a fishmonger's business." },
  { id: '10', ja: '彼は3時に来た。', en: 'He came at three.' },
  { id: '12', ja: 'CDを買った。', en: 'I bought a CD.' },
  { id: '14', ja: '毎日学校に通っている。', en: 'I go to school every day.' },
  { id: '16', ja: 'ご飯を食べた。', en: 'I ate.' },
  { id: '18', ja: 'もう、いったよ。', en: 'I already said it.' },
  { id: '20', ja: '駅から歩いた。', en: 'I walked from the station.' },
];

const tokenOf = async (text, surface) => (await run(text)).tokens.find((t) => t.surface === surface);

test('a word is found by the keys Naninani\'s word by word looks it up by', async () => {
  const ame = spokenWord(await tokenOf('雨が降る。', '雨'));
  assert.deepEqual(ame.keys, [wordKey('雨', 'あめ'), 'あめ'], 'its spelling and reading, then its bare reading');
  const wa = spokenWord(await tokenOf('私は学生です。', 'は'));
  assert.deepEqual([wa.text, wa.written, wa.keys], ['わ', null, ['わ']], 'a particle in kana is said as one, with no word key');
  assert.deepEqual(spokenWord(await tokenOf('テレビを見る。', 'テレビ')).keys, ['てれび']);
  // A particle written in kanji keeps its spelling (Speech.written).
  assert.deepEqual(spokenWord({ kind: 'particle', surface: '結果', reading: 'けっか' }).keys, [wordKey('結果', 'けっか'), 'けっか']);
});

test('the corpus kind keeps conjugated forms as they stand and leaves out names, particles, numbers, Latin and beats', async () => {
  const lines = await corpusLines(SENTENCES, dict());
  const keys = lines.map((l) => l.key);
  for (const key of [wordKey('行った', 'いった'), wordKey('持っている', 'もっている'), wordKey('食べた', 'たべた'), wordKey('買った', 'かった'), wordKey('歩いた', 'あるいた')]) {
    assert.ok(keys.includes(key), `${key} in ${keys.join(' ')}`);
  }
  for (const l of lines) {
    assert.equal(l.kind, 'corpus');
    assert.deepEqual(l.voices, [...CORPUS_VOICES]);
    assert.ok(beats(l.kana).length >= 2, `${l.key} is a beat already`);
    assert.ok(!/[0-9A-Za-z]/.test(l.ja), `${l.key}: a number or a Latin word`);
  }
  for (const gone of ['とむ', 'じょん', 'さむ', 'から', 'よ']) assert.ok(!keys.includes(gone), `${gone} is left out`);
  assert.ok(!lines.some((l) => /3時|CD/.test(l.ja)));
  // Each line is filed under the key the app tries first for its token.
  const itta = lines.find((l) => l.key === wordKey('行った', 'いった'));
  assert.deepEqual([itta.key, ...itta.also], spokenWord(await tokenOf('駅へ行った。', '行った')).keys);
});

test('the most frequent word comes first, and equal counts go in key order', async () => {
  const lines = await corpusLines(SENTENCES, dict());
  assert.deepEqual(lines.slice(0, 2).map((l) => [l.key, l.count]), [[wordKey('学校', 'がっこう'), 2], [wordKey('行った', 'いった'), 2]]);
  for (let i = 1; i < lines.length; i += 1) {
    const [a, b] = [lines[i - 1], lines[i]];
    assert.ok(a.count > b.count || (a.count === b.count && a.key < b.key), `${a.key} before ${b.key}`);
  }
});

test('a conjugated form goes in kanji only when its kanji can be read one way', async () => {
  const lines = await corpusLines(SENTENCES, dict());
  const tts = (written, reading) => lines.find((l) => l.key === wordKey(written, reading)).tts;
  assert.equal(tts('食べた', 'たべた'), '食べた', '食べる has one reading');
  assert.equal(tts('行った', 'いった'), 'いった', '行く is いく or ゆく');
  // 通う's かよ and 通る's とお both give 通っている: a transcript in kanji
  // cannot tell them apart, so the form goes as Yomu reads it.
  const toori = lines.find((l) => l.ja === '通っている');
  assert.equal(toori.tts, toori.kana);
  assert.equal(lines.find((l) => l.key === wordKey('来た', 'きた')).triple, true, 'two beats: heard three times over');
});

test('a Tatoeba name the analyzer reads as a word is left out by the linked English', () => {
  const sam = { kind: 'katakana', surface: 'サム', romaji: { said: 'samu' }, entry: { g: ['sum'] } };
  assert.equal(namedInEnglish(sam, "Sam owns a fishmonger's business."), true);
  assert.equal(namedInEnglish(sam, 'The sum is ten.'), false, 'the word itself');
  assert.equal(namedInEnglish(sam, ''), false);
  assert.equal(consonants('Ziri'), consonants('jiri'), 'z and j are one to katakana');
  assert.equal(consonants('Blake'), consonants('bureeku'));
  const tokyo = { kind: 'katakana', surface: 'トーキョー', romaji: { said: 'tookyoo' }, entry: { g: ['Tokyo'] } };
  assert.equal(namedInEnglish(tokyo, 'Tokyo is big.'), false, 'a gloss that holds the English word is the word');
  const kanji = { kind: 'inflected', surface: '行った', romaji: { said: 'itta' }, entry: { g: ['to go'] } };
  assert.equal(namedInEnglish(kanji, 'It is likely that he did it on purpose.'), false, 'katakana alone: It is no name');
});

test('a key another line holds, or its bare kana, is not taken, and one kana send is one clip', async () => {
  const lines = await corpusLines(SENTENCES, dict());
  const taken = new Set([wordKey('学校', 'がっこう'), 'ごはん']);
  const kept = takeCorpus(lines, taken);
  const keys = kept.flatMap((l) => l.keys);
  assert.ok(!keys.includes(wordKey('学校', 'がっこう')), 'a key a line holds');
  assert.ok(!keys.includes(wordKey('ご飯', 'ごはん')), 'a word the reader finds by its bare kana already');
  const itta = kept.find((l) => l.key === wordKey('行った', 'いった'));
  assert.deepEqual(itta.keys, [wordKey('行った', 'いった'), 'いった'], 'いった in kana sends the same text, so shares the clip');
  assert.ok(!kept.some((l) => l.key === 'いった'));
  assert.ok(taken.has('いった') && taken.has(wordKey('食べた', 'たべた')), 'what it takes, it marks taken');
  assert.deepEqual(kept.map((l) => l.key), lines.map((l) => l.key).filter((k) => kept.some((l) => l.key === k)), 'in the ranking\'s order');
});

test('the script puts the corpus last, and never records a word that already has a clip', async () => {
  assert.equal(KINDS[KINDS.length - 1], 'corpus');
  assert.ok(WORD_KINDS.has('corpus'), 'sent as its tts, checked as its own reading');
  assert.deepEqual([...DEFAULT_KINDS], KINDS.filter((k) => k !== 'corpus'), 'a run makes the corpus only when it is named');
  const script = await fullScript({ library, dict: dict(), dataDir: DATA, kinds: ['common', 'corpus'], corpus: SENTENCES });
  const firstCorpus = script.findIndex((l) => l.kind === 'corpus');
  assert.ok(firstCorpus > 0 && script.slice(firstCorpus).every((l) => l.kind === 'corpus'), 'after every common word');
  assert.equal(new Set(script.flatMap((l) => l.keys)).size, script.flatMap((l) => l.keys).length, 'one line per key');
  const corpus = script.slice(firstCorpus);
  assert.ok(!corpus.some((l) => l.key === wordKey('学校', 'がっこう')), '学校 is a common word, and keeps that clip');
  const site = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  const audio = normalizeAudio(site('data/audio/index.json'));
  audio.srcs.forEach((src, n) => addShard(audio, n, site(src)));
  // A kept line (tools/audio-corpus.json) has its clip; every other one has none.
  for (const l of corpus.filter((x) => !x.kept)) assert.equal(clipInVoice(audio, [...l.keys, ...l.also], 'clear'), null, `${l.key} has a Clear clip already`);
  assert.ok(corpus.some((l) => l.key === wordKey('持っている', 'もっている')));
});

test('the ranking half is the even Tatoeba ids', () => {
  assert.equal(isRankingSentence('224982'), true);
  assert.equal(isRankingSentence('224983'), false);
});

test('a conjugated form said alone passes the check as it stands, and another form does not', async () => {
  const check = makeCheck(dict());
  const lines = await corpusLines(SENTENCES, dict());
  const line = (key) => lines.find((l) => l.key === key);
  const motte = await check.expected(line(wordKey('持っている', 'もっている')));
  assert.equal((await check.verdict(motte, '持っている。')).ok, true);
  assert.equal((await check.verdict(motte, 'もっている')).ok, true);
  assert.equal((await check.verdict(motte, '持っていた。')).ok, false, 'another form of the verb');
  const itta = await check.expected(line(wordKey('行った', 'いった')));
  assert.equal((await check.verdict(itta, '言った。')).ok, true, 'sent as いった: any spelling of that sound');
  assert.equal((await check.verdict(itta, '行った')).ok, true);
  assert.equal((await check.verdict(itta, 'いた。')).ok, false, 'the doubled consonant is the word');
});

test('why a token has no corpus line of its own', async () => {
  const why = async (text, surface, en = '') => corpusLeftOut(await tokenOf(text, surface), en);
  assert.equal(await why('トムは駅へ行った。', 'トム'), 'a name');
  assert.equal(await why('サムは魚屋の店を持っている。', 'サム', "Sam owns a fishmonger's business."), 'a name', 'named by the English');
  assert.equal(await why('トムは駅へ行った。', 'は'), 'a particle in kana');
  assert.equal(await why('彼は3時に来た。', '3時'), 'a number');
  assert.equal(await why('CDを買った。', 'CD'), 'Latin or a digit');
  assert.equal(await why('目が痛い。', '目'), 'one beat');
  assert.equal(await why('トムは駅へ行った。', '。'), 'punctuation');
  assert.equal(await why('トムは駅へ行った。', '行った'), null);
});

const POTATO = [
  { id: '30', ja: 'ジャガイモを食べた。', en: 'I ate a potato.' },
  { id: '32', ja: 'じゃがいもを買った。', en: 'I bought potatoes.' },
];

test('a key two spellings share says the one written most, katakana on a tie, in any sentence order', async () => {
  const forward = await corpusLines(POTATO, dict());
  assert.deepEqual(await corpusLines([...POTATO].reverse(), dict()), forward, 'the same lines whatever the order');
  const imo = forward.find((l) => l.key === 'じゃがいも');
  assert.deepEqual([imo.ja, imo.tts, imo.count], ['ジャガイモ', 'ジャガイモ', 2], 'a tie goes to katakana');
  const more = [...POTATO, { id: '34', ja: 'じゃがいもが好きだ。', en: 'I like potatoes.' }];
  for (const order of [more, [...more].reverse()]) {
    const l = (await corpusLines(order, dict())).find((x) => x.key === 'じゃがいも');
    assert.deepEqual([l.ja, l.tts, l.count], ['じゃがいも', 'じゃがいも', 3], 'the spelling written most');
  }
  assert.deepEqual(await corpusLines([...SENTENCES].reverse(), dict()), await corpusLines(SENTENCES, dict()));
});

test('a corpus word whose clip was kept stays in the script however the ranking moves', async () => {
  const lines = await corpusLines(SENTENCES, dict());
  const pick = (key) => lines.find((l) => l.key === key);
  const aruita = wordKey('歩いた', 'あるいた');
  const [row] = corpusKept([pick(aruita)], () => true);
  assert.deepEqual(Object.keys(row).sort(), ['also', 'ja', 'kana', 'key', 'keys', 'said', 'tts']);
  // The sentence that ranked it is gone: the line, its id and what it sends stay.
  const without = SENTENCES.filter((s) => !s.ja.includes('歩いた'));
  const script = await fullScript({ library, dict: dict(), dataDir: DATA, kinds: ['corpus'], corpus: without, kept: [row] });
  const kept = script.find((l) => l.key === aruita);
  assert.ok(kept && kept.kept, 'still in the script');
  assert.deepEqual([kept.id, kept.tts, kept.keys, kept.kind], [clipId(aruita), pick(aruita).tts, pick(aruita).keys, 'corpus']);
  const fresh = await fullScript({ library, dict: dict(), dataDir: DATA, kinds: ['corpus'], corpus: without, kept: [] });
  assert.ok(!fresh.some((l) => l.key === aruita), 'which, not kept, it would leave, and prune its clip');

  // Another line coming to hold its bare kana drops a new word, never a kept one.
  const gohan = wordKey('ご飯', 'ごはん');
  const keptGohan = corpusKept([pick(gohan)], () => true);
  assert.ok(!takeCorpus(lines, new Set(['ごはん'])).some((l) => l.key === gohan));
  assert.ok(takeCorpus(lines, new Set(['ごはん']), keptGohan.map(keptCorpusLine)).some((l) => l.key === gohan));
  // A key an earlier kind holds outranks it: that line has the clip's id.
  const gakkou = wordKey('学校', 'がっこう');
  const keptGakkou = corpusKept([pick(gakkou)], () => true).map(keptCorpusLine);
  assert.ok(!takeCorpus(lines, new Set([gakkou]), keptGakkou).some((l) => l.key === gakkou));

  // A new word that sends what a kept one sends shares its clip, and the row learns its key.
  const itta = wordKey('行った', 'いった');
  const keptItta = { ...corpusKept([pick(itta)], () => true)[0], keys: [itta] };
  const taken = takeCorpus(lines, new Set(), [keptCorpusLine(keptItta)]);
  const first = taken.find((l) => l.key === itta);
  assert.equal(taken[0], first, 'kept lines first');
  assert.ok(first.kept && first.keys.includes('いった') && !taken.some((l) => l.key === 'いった'));
  assert.equal(first.count, 2, 'counted as this ranking meets it');
  const [learnt] = corpusKept(taken, () => false, [keptItta]);
  assert.deepEqual(learnt.keys, [itta, 'いった']);
});

test('the kept rows: earlier ones first, then each newly kept line, nothing else', async () => {
  const lines = await corpusLines(SENTENCES, dict());
  const old = { key: 'もうない', keys: ['もうない'], ja: 'もうない', kana: 'もうない', tts: 'もうない', also: [] };
  const keep = new Set([wordKey('食べた', 'たべた'), wordKey('歩いた', 'あるいた')]);
  const rows = corpusKept([...lines, { kind: 'common', key: 'x', keys: ['x'] }], (l) => keep.has(l.key), [old]);
  assert.deepEqual(rows.map((r) => r.key), ['もうない', ...lines.map((l) => l.key).filter((k) => keep.has(k))]);
  assert.deepEqual(corpusKept(lines, () => false, []), []);
});

test('the kept rows file is read back as it was written, and a broken one is refused', () => {
  const site = mkdtempSync(path.join(tmpdir(), 'yomu-corpus-'));
  try {
    assert.deepEqual(readCorpusKept(site), [], 'no file: nothing kept');
    mkdirSync(path.join(site, path.dirname(CORPUS_KEPT)), { recursive: true });
    const row = { key: '食べた|たべた', keys: ['食べた|たべた'], ja: '食べた', kana: 'たべた', tts: '食べた', said: 'tabeta', also: ['たべた'] };
    writeFileSync(path.join(site, CORPUS_KEPT), `[\n${JSON.stringify(row)}\n]\n`);
    assert.deepEqual(readCorpusKept(site), [row]);
    writeFileSync(path.join(site, CORPUS_KEPT), JSON.stringify([{ key: '食べた|たべた', keys: [] }]));
    assert.throws(() => readCorpusKept(site), /needs key/);
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});
