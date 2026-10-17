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

import { audioKey, clipId, normalizeAudio, clipFor, useAudio } from '../js/audio.js';
import { audioScript, beatInventory } from '../tools/lib/audio-script.mjs';
import { makeCheck, unheld, foldSaid } from '../tools/lib/audio-check.mjs';
import { SOUND_NOTES } from '../js/notes-sounds.js';
import { toKata } from '../js/kana.js';
import { dict } from './helpers/disk.mjs';

const library = JSON.parse(readFileSync(new URL('../data/phrases/library.json', import.meta.url), 'utf8'));

test('a text and its kana, spaced or punctuated any way, share one key', () => {
  assert.equal(audioKey('わたしは がくせいです。'), audioKey('わたしは、がくせいです'));
  assert.equal(audioKey('コーヒー'), audioKey('こーひー'));
  assert.notEqual(audioKey('コーヒー'), audioKey('コヒ'), 'the long-vowel bar is text');
  assert.equal(audioKey('人々'), '人々');
  assert.equal(audioKey('ｶﾞｯｺｳ'), audioKey('がっこう'), 'half-width katakana folds too');
  assert.match(clipId(audioKey('おばあさん')), /^[0-9a-z]+$/);
  assert.equal(clipId(audioKey('おばあさん')), clipId(audioKey('オバアサン')));
});

test('a clip is found for its voice, never for a voice that failed it', () => {
  const id = clipId(audioKey('きって'));
  const audio = normalizeAudio({
    format: 'yomu-audio/1',
    voices: [{ id: 'clear', label: { en: 'Clear', es: 'Clara' } }, { id: 'male', label: { en: 'Male', es: 'Masculina' } }],
    clips: { [audioKey('きって')]: id },
    missing: { clear: [], male: [id] },
    slow: { clear: [id], male: [] },
  });
  assert.match(clipFor(audio, 'キッテ', 'clear').url, new RegExp(`data/audio/clear/${id}\\.mp3$`));
  assert.equal(clipFor(audio, 'きって', 'male'), null, 'listed missing for male');
  assert.equal(clipFor(audio, 'きって', 'bright'), null, 'a voice the index does not have');
  assert.equal(clipFor(audio, 'きて', 'clear'), null, 'a text with no clip');
  const slow = clipFor(audio, 'きって', 'clear', { slow: true });
  assert.ok(slow.slow && slow.url.endsWith(`${id}.slow.mp3`));
  assert.throws(() => normalizeAudio({ format: 'yomu-audio/0' }));
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
  // An example in kanji is sent as its reading, and filed under that too.
  const kyou = script.find((l) => l.ja === '今日');
  assert.equal(kyou.tts, 'きょう');
  assert.ok(kyou.keys.includes(audioKey('きょう')));
  // Sounds come first, so a budget that runs out has made them.
  assert.equal(script[0].kind, 'sound');
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

test('a lone beat passes held, and fails as another sound', async () => {
  const check = makeCheck(dict());
  const beat = async (kana, heard) => (await check.verdict({ kana }, heard)).ok;
  assert.equal(unheld('こうこうこう'), 'こここ');
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
    if (!this.src.startsWith('data:')) FakeAudio.played.push({ src: this.src, rate: this.playbackRate, pitch: this.preservesPitch });
    queueMicrotask(() => { if (this.onended) this.onended(); });
    return Promise.resolve();
  }
  pause() {}
}

test('speak() plays the chosen voice\'s clip, and the device says what has none', async () => {
  globalThis.Audio = FakeAudio;
  const speech = await import('../js/speech.js');
  const id = clipId(audioKey('おばあさん'));
  useAudio({
    format: 'yomu-audio/1',
    voices: [{ id: 'clear', label: { en: 'Clear', es: 'Clara' } }, { id: 'male', label: { en: 'Male', es: 'Masculina' } }],
    clips: { [audioKey('おばあさん')]: id, [audioKey('お')]: 'o1', [audioKey('ば')]: 'ba1' },
    missing: { clear: [], male: [] },
    slow: { clear: [id], male: [] },
  });
  speech.setVoice('clear');
  FakeAudio.played = [];
  assert.equal(await speech.speak('オバアサン'), true);
  assert.equal(FakeAudio.played.length, 1);
  assert.ok(FakeAudio.played[0].src.endsWith(`/clear/${id}.mp3`));
  assert.equal(FakeAudio.played[0].pitch, true, 'slowed with its pitch kept');

  FakeAudio.played = [];
  await speech.speak('おばあさん', { rate: 0.6 });
  assert.ok(FakeAudio.played[0].src.endsWith(`${id}.slow.mp3`), 'the slow take');
  assert.equal(FakeAudio.played[0].rate, 1, 'a slow take is not slowed again');

  FakeAudio.played = [];
  await speech.speak('おばあさん', { rate: 0.6, speaker: 'male' });
  assert.ok(FakeAudio.played[0].src.endsWith(`/male/${id}.mp3`), 'another speaker, no slow take');
  assert.equal(FakeAudio.played[0].rate, 0.6);

  // No clip, and no device voice in node: nothing is said, and no clip plays.
  FakeAudio.played = [];
  assert.equal(await speech.speak('きょうは'), false);
  assert.equal(FakeAudio.played.length, 0);

  speech.setVoice(speech.DEVICE_VOICE);
  assert.equal(await speech.speak('おばあさん'), false, 'This device: never a clip');
  assert.equal(FakeAudio.played.length, 0);
  assert.equal(speech.otherVoice(), speech.DEVICE_VOICE);

  // A sequence is one voice: one step with no clip and none of them play.
  speech.setVoice('clear');
  FakeAudio.played = [];
  await speech.speakSteps([{ text: 'お' }, { text: 'ば' }]);
  assert.equal(FakeAudio.played.length, 2);
  FakeAudio.played = [];
  await speech.speakSteps([{ text: 'お' }, { text: 'ば' }, { text: 'さ' }]);
  assert.equal(FakeAudio.played.length, 0, 'さ has no clip, so the device says all three');

  // A voice that failed a clip borrows the first voice's: a text, and a
  // whole sequence, never a sequence of two voices.
  useAudio({
    format: 'yomu-audio/1',
    voices: [{ id: 'clear', label: { en: 'Clear', es: 'Clara' } }, { id: 'calm', label: { en: 'Calm', es: 'Serena' } }],
    clips: { [audioKey('お')]: 'o1', [audioKey('ば')]: 'ba1' },
    missing: { clear: [], calm: ['ba1'] },
  });
  speech.setVoice('calm');
  FakeAudio.played = [];
  await speech.speak('ば');
  assert.ok(FakeAudio.played[0].src.endsWith('/clear/ba1.mp3'));
  FakeAudio.played = [];
  await speech.speakSteps([{ text: 'お' }, { text: 'ば' }]);
  assert.deepEqual(FakeAudio.played.map((p) => p.src.split('/audio/')[1]), ['clear/o1.mp3', 'clear/ba1.mp3']);
  FakeAudio.played = [];
  await speech.speakSteps([{ text: 'お' }]);
  assert.deepEqual(FakeAudio.played.map((p) => p.src.split('/audio/')[1]), ['calm/o1.mp3'], 'the chosen voice when it has them all');
  assert.equal(speech.otherVoice(), 'male');
  speech.setVoice('male');
  assert.equal(speech.otherVoice(), 'clear');
  delete globalThis.Audio;
});
