// The recorded voices: how a text finds its clip (js/audio.js), what the
// tool records (tools/lib/audio-script.mjs), the check every clip must pass
// (tools/lib/audio-check.mjs), and speech.js choosing a clip or the device.
//
// The transcripts below are real: each is what ElevenLabs Scribe heard from a
// clip made on 2026-10-16 (docs/AUDIO.md). The wrong ones were made wrong on
// purpose, to show the check fails them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  audioKey, wordKey, clipId, keysOf, normalizeAudio, addShard, shardsFor, clipByKeys, clipInVoice, useAudio,
} from '../js/audio.js';
import { audioScript, beatInventory, wordLines } from '../tools/lib/audio-script.mjs';
import { makeCheck, unheld, foldSaid, barless } from '../tools/lib/audio-check.mjs';
import { SOUND_NOTES } from '../js/notes-sounds.js';
import { toKata } from '../js/kana.js';
import { dict } from './helpers/disk.mjs';

const library = JSON.parse(readFileSync(new URL('../data/phrases/library.json', import.meta.url), 'utf8'));

const VOICES3 = [
  { id: 'clear', label: { en: 'Clear', es: 'Clara' } },
  { id: 'calm', label: { en: 'Calm', es: 'Serena' } },
  { id: 'male', label: { en: 'Male', es: 'Masculina' } },
];
const index = (shards) => ({ format: 'yomu-audio/2', voices: VOICES3, shards });
const shard = (clips) => ({ format: 'yomu-audio-clips/1', clips });

test('a text and its kana, spaced or punctuated any way, share one key', () => {
  assert.equal(audioKey('わたしは がくせいです。'), audioKey('わたしは、がくせいです'));
  assert.equal(audioKey('コーヒー'), audioKey('こーひー'));
  assert.notEqual(audioKey('コーヒー'), audioKey('コヒ'), 'the long-vowel bar is text');
  assert.equal(audioKey('人々'), '人々');
  assert.equal(audioKey('ｶﾞｯｺｳ'), audioKey('がっこう'), 'half-width katakana folds too');
  assert.match(clipId(audioKey('おばあさん')), /^[0-9a-z]+$/);
  assert.equal(clipId(audioKey('おばあさん')), clipId(audioKey('オバアサン')));
});

test('a word is filed under its spelling and reading, so homophones never share a clip', () => {
  assert.equal(wordKey('雨', 'あめ'), '雨|あめ');
  assert.notEqual(wordKey('雨', 'あめ'), wordKey('飴', 'あめ'));
  assert.notEqual(wordKey('方', 'かた'), wordKey('方', 'ほう'), 'one spelling, two words');
  assert.equal(wordKey('おば', 'おば'), audioKey('おば'), 'a word in kana is its kana');
  assert.equal(wordKey('ラーメン', 'らーめん'), audioKey('ラーメン'));
  assert.deepEqual(keysOf('あめ', [wordKey('雨', 'あめ')]), ['雨|あめ', 'あめ'], 'the word first, then the text');
});

test('a clip is found in its shard, for a voice whose bit is set', () => {
  const audio = normalizeAudio(index([{ first: '', src: 'data/audio/k00.json' }, { first: 'つ', src: 'data/audio/k01.json' }]));
  assert.deepEqual(shardsFor(audio, ['きって', 'はし']), [0, 1], 'each key in the shard its range holds');
  addShard(audio, 0, shard({ [audioKey('きって')]: ['k1', 0b011] }));
  assert.deepEqual(shardsFor(audio, ['きって']), [], 'a loaded shard is not asked for again');
  assert.equal(clipInVoice(audio, ['きって'], 'calm').path, 'data/audio/calm/k1.mp3');
  assert.equal(clipInVoice(audio, ['きって'], 'male'), null, 'male failed it');
  assert.equal(clipByKeys(audio, ['きって'], 'male').voice, 'clear', 'and borrows the first voice\'s');
  assert.equal(clipByKeys(audio, ['きて'], 'clear'), null, 'a text with no clip');
  assert.throws(() => normalizeAudio({ format: 'yomu-audio/1' }));
  assert.throws(() => addShard(audio, 1, { format: 'nope' }));
});

test('an exact word in the first voice beats its bare kana in the chosen one', () => {
  const audio = normalizeAudio(index([{ first: '', src: 'k' }]));
  addShard(audio, 0, shard({ '雨|あめ': ['rain', 0b001], 'あめ': ['ame', 0b010] }));
  assert.equal(clipByKeys(audio, keysOf('あめ', ['雨|あめ']), 'calm').id, 'rain');
  assert.equal(clipByKeys(audio, keysOf('あめ'), 'calm').id, 'ame');
});

test('the script records every sound example, both sides of every pair, and every beat', () => {
  const script = audioScript({ library });
  const keys = new Set(script.flatMap((l) => l.keys));
  for (const [id, note] of Object.entries(SOUND_NOTES)) {
    for (const ex of [...(note.examples || []), note.pair && note.pair.with, note.pair && note.pair.without].filter(Boolean)) {
      assert.ok(keys.has(audioKey(ex.ja)), `${id}: ${ex.ja}`);
    }
  }
  for (const b of beatInventory()) assert.ok(keys.has(audioKey(b)), b);
  for (const p of library.phrases) assert.ok(keys.has(audioKey(p.ja)), p.id);
  assert.equal(new Set(script.map((l) => l.id)).size, script.length, 'one clip per text');
  // A lone beat goes out in katakana, which a voice never reads as a particle.
  const ha = script.find((l) => l.kind === 'kana' && l.kana === 'は');
  assert.equal(ha.tts, toKata('は'));
  // An example in kanji is sent as its reading, and filed under that too,
  // and under its word key, since it is one word.
  const kyou = script.find((l) => l.ja === '今日');
  assert.equal(kyou.tts, 'きょう');
  assert.ok(kyou.keys.includes(audioKey('きょう')) && kyou.keys.includes(wordKey('今日', 'きょう')));
  // Sounds come first, so a budget that runs out has made them.
  assert.equal(script[0].kind, 'sound');
});

test('the words of Yomu\'s own text are recorded, the おば and さん of おばさん among them', async () => {
  const words = await wordLines([{ kind: 'sound', ja: 'おばさん' }, { kind: 'phrase', ja: '雨が降っています。' }, { kind: 'phrase', ja: '今日は寒い。' }], dict());
  const keys = words.map((w) => w.key);
  assert.ok(keys.includes('おば') && keys.includes('さん'), keys.join(' '));
  assert.ok(keys.includes(wordKey('雨', 'あめ')));
  assert.ok(!keys.includes('が') && !keys.includes('は'), 'one kana is a beat already');
  assert.equal(words.find((w) => w.key === wordKey('雨', 'あめ')).tts, '雨', 'one reading: sent in kanji');
  assert.equal(words.find((w) => w.key === wordKey('今日', 'きょう')).tts, 'きょう', 'two readings: sent as Yomu reads it');
  assert.equal(words.find((w) => w.key === 'さん').triple, true, 'two beats: checked from a triple take');
});

test('the check fails a clip that says another word, and passes the right one', async () => {
  const check = makeCheck(dict());
  const want = (line) => check.expected(line);
  const grandmother = await want({ kind: 'sound', ja: 'おばあさん', said: 'obaasan' });
  assert.equal((await check.verdict(grandmother, 'おばさん')).ok, false, 'aunt is not grandmother');
  assert.equal((await check.verdict(grandmother, 'おばあさん')).ok, true);
  const stamp = await want({ kind: 'sound', ja: 'きって', said: 'kitte' });
  assert.equal((await check.verdict(stamp, '来て。')).ok, false, 'kite is not kitte');
  assert.equal((await check.verdict(stamp, '切手')).ok, true, 'kanji or kana, it is how it is said');
  const noSmoking = await want({ kind: 'sound', ja: 'きんえん', said: "kin'en" });
  assert.equal((await check.verdict(noSmoking, '記念')).ok, false, "kinen is not kin'en");
  assert.equal((await check.verdict(noSmoking, '禁煙')).ok, true);
  const phrase = await want({ kind: 'phrase', ja: 'はじめまして。一緒に日本語を読みましょう。' });
  assert.equal((await check.verdict(phrase, '初めまして。一緒に日本語を読みましょう。')).ok, true);
  assert.equal((await check.verdict(phrase, '')).ok, false, 'silence is no clip');
  assert.equal(foldSaid("Kin'en desu."), "kin'endesu");
  // The transcriber wrote まち (town) as 街, which the analyzer reads gai: a
  // word passes when any of its dictionary readings fits, a wrong vowel never.
  const town = await want({ kind: 'note', ja: 'この町は静かできれいです。' });
  assert.equal((await check.verdict(town, 'この街は静かで綺麗です。')).ok, true);
  assert.equal((await check.verdict(town, 'この街は静かで綺麗でした。')).ok, false);
  assert.equal((await check.verdict(grandmother, 'お婆さん')).ok, true);
  assert.equal((await check.verdict(grandmother, '叔母さん')).ok, false, 'no reading of 叔母さん is obaasan');
});

test('a short word is heard three times over, and another word still fails', async () => {
  const check = makeCheck(dict());
  const san = await check.expected({ kind: 'word', ja: 'さん', kana: 'さん', said: 'san', triple: true });
  assert.equal((await check.verdict(san, 'さん、さん、さん。')).ok, true);
  assert.equal((await check.verdict(san, '三、三、三。')).ok, true, 'written as the number, read san');
  assert.equal((await check.verdict(san, 'さあ、さあ、さあ。')).ok, false);
  // A word is checked as its own reading, never the bare kanji's: 中 read
  // ちゅう came back チュー and once failed for naka.
  const chuu = await check.expected({ kind: 'common', ja: '中', kana: 'ちゅう', triple: true });
  assert.equal((await check.verdict(chuu, 'チュー、チュー、チュー。')).ok, true);
  assert.equal((await check.verdict(chuu, 'なか、なか、なか。')).ok, false, 'naka is another reading');
  const oba = await check.expected({ kind: 'word', ja: 'おば', kana: 'おば', said: 'oba', triple: true });
  assert.equal((await check.verdict(oba, 'おば、おば、おば')).ok, true);
  assert.equal((await check.verdict(oba, 'おばあ、おばあ、おばあ')).ok, false, 'a long vowel is another word');
});

test('a lone beat passes held, and fails as another sound', async () => {
  const check = makeCheck(dict());
  const beat = async (kana, heard) => (await check.verdict({ kana }, heard)).ok;
  assert.equal(unheld('こうこうこう'), 'こここ');
  assert.equal(barless('ちゅー'), 'ちゅう');
  assert.equal(barless('らーめん'), 'らあめん');
  assert.equal(await beat('す', 'すーすーすー'), true);
  assert.equal(await beat('す', 'そう、そう、そう。'), false, 'so is not su');
  assert.equal(await beat('こ', 'こう、こう、こう。'), true);
  assert.equal(await beat('え', 'で、で、で。'), false, 'a voiced onset fails');
  assert.equal(await beat('の', 'No。No。No。'), true, 'English letters read as romaji');
  assert.equal(await beat('な', 'No。No。No。'), false);
  assert.equal(await beat('じ', '字、字、字。'), true, 'a kanji with that reading');
  assert.equal(await beat('し', '字、字、字。'), false);
  assert.equal(await beat('ん', 'うん、うん、うん。'), true, 'the only way to write a hum');
  assert.equal(await beat('う', 'うん、うん、うん。'), false);
  assert.equal(await beat('い', 'いいえ。'), false, 'a word guessed from the sound');
});

test('the page may play its own recordings and no other media', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const media = csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === 'media-src');
  assert.deepEqual(media, ['media-src', "'self'"], 'without it default-src none blocks every clip');
  const quiet = readFileSync(new URL('../data/audio/silence.mp3', import.meta.url));
  assert.ok(quiet.length > 100 && quiet.length < 2000, 'the unlock clip is a small file, not a data: URI');
});

// ── speech.js with a fake <audio> ─────────────────────────────────────────

class FakeAudio {
  static played = [];
  constructor() { this.src = ''; this.onended = null; this.onerror = null; }
  play() {
    if (!this.src.includes('silence.mp3')) FakeAudio.played.push({ src: this.src, rate: this.playbackRate, pitch: this.preservesPitch });
    queueMicrotask(() => { if (this.onended) this.onended(); });
    return Promise.resolve();
  }
  pause() {}
}
const played = () => FakeAudio.played.map((p) => p.src.split('/audio/')[1]);

test('speak() plays the chosen voice\'s clip, a word\'s own, and the device says what has none', async () => {
  globalThis.Audio = FakeAudio;
  const speech = await import('../js/speech.js');
  useAudio(index([{ first: '', src: 'data/audio/k00.json' }]), [shard({
    [audioKey('おばあさん')]: ['obaa', 0b111],
    [audioKey('お')]: ['o1', 0b111],
    [audioKey('ば')]: ['ba1', 0b001],
    '雨|あめ': ['rain', 0b111],
    '飴|あめ': ['candy', 0b111],
    [audioKey('こんにちは')]: ['hello', 0b111],
    [audioKey('はい、どうぞ。')]: ['please', 0b111],
  })]);
  speech.setVoice('clear');
  FakeAudio.played = [];
  assert.equal(await speech.speak('オバアサン'), true);
  assert.deepEqual(played(), ['clear/obaa.mp3']);
  assert.equal(FakeAudio.played[0].pitch, true);

  FakeAudio.played = [];
  await speech.speak('おばあさん', { rate: 0.6 });
  assert.equal(FakeAudio.played[0].rate, 0.6, 'Slow slows the clip, its pitch kept');

  // A word plays its own clip, never its homophone's.
  FakeAudio.played = [];
  await speech.speak('あめ', { lookup: [wordKey('飴', 'あめ')] });
  await speech.speak('あめ', { lookup: [wordKey('雨', 'あめ')] });
  assert.deepEqual(played(), ['clear/candy.mp3', 'clear/rain.mp3']);

  // No clip, and no device voice in node: nothing is said, and no clip plays.
  FakeAudio.played = [];
  assert.equal(await speech.speak('きょうは'), false);
  assert.equal(FakeAudio.played.length, 0);

  speech.setVoice(speech.DEVICE_VOICE);
  assert.equal(await speech.speak('おばあさん'), false, 'This device: never a clip');
  assert.equal(FakeAudio.played.length, 0);
  assert.equal(speech.otherVoice(), speech.DEVICE_VOICE);

  // A voice that failed a clip borrows the first voice's: a text, and a whole
  // sequence, never a sequence of two voices.
  speech.setVoice('calm');
  FakeAudio.played = [];
  await speech.speak('ば');
  assert.deepEqual(played(), ['clear/ba1.mp3']);
  FakeAudio.played = [];
  await speech.speakSteps([{ text: 'お' }, { text: 'ば' }]);
  assert.deepEqual(played(), ['clear/o1.mp3', 'clear/ba1.mp3']);
  FakeAudio.played = [];
  await speech.speakSteps([{ text: 'お' }]);
  assert.deepEqual(played(), ['calm/o1.mp3'], 'the chosen voice when it has them all');
  FakeAudio.played = [];
  await speech.speakSteps([{ text: 'お' }, { text: 'さ' }]);
  assert.equal(FakeAudio.played.length, 0, 'さ has no clip, so the device says both');
  // Sound it out's last step is the word, found by its own key.
  FakeAudio.played = [];
  await speech.speakSteps(speech.beatSteps(['あ', 'め'], 'あめ', [wordKey('雨', 'あめ')]).slice(-1));
  assert.deepEqual(played(), ['calm/rain.mp3']);

  // A text of several lines plays its lines' clips in order, or none.
  FakeAudio.played = [];
  await speech.speakText('こんにちは\nはい、どうぞ。');
  assert.deepEqual(played(), ['calm/hello.mp3', 'calm/please.mp3']);
  FakeAudio.played = [];
  await speech.speakText('こんにちは\nきょうは');
  assert.equal(FakeAudio.played.length, 0, 'one line has no clip: the device reads it all');

  assert.equal(speech.otherVoice(), 'male');
  speech.setVoice('male');
  assert.equal(speech.otherVoice(), 'clear');
  delete globalThis.Audio;
});
