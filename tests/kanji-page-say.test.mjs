// The kanji page's say buttons (js/events-kanji-page.js, js/render-kanji-page.js)
// stand behind the gate Yomu's own text uses (js/speech.js sayDecision,
// canSay): a button plays when its text has a clip in the chosen voice, or
// in Clear, which every voice borrows, or when the device has a Japanese
// voice. One that has neither is drawn disabled and names the speech note,
// which says why. Until 17 November 2026 the page asked only for the
// device's voice, so on a device without one no recorded reading or word
// ever played.
// The page is drawn here over a small stand-in for the document
// (tests/helpers/fake-document.mjs); node has no speech synthesis, so the
// device has no Japanese voice throughout. A voice list that arrives after
// the page is drawn is tests/kanji-page-voices.test.mjs.
//
//   node --test tests/kanji-page-say.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { useAudio, wordKey } from '../js/audio.js';
import {
  sayDecision, canSay, canSpeak, sayKnown, setVoice, DEVICE_VOICE,
} from '../js/speech.js';
import { kanjiPageNodes, markSay, SPEECH_NOTE_ID } from '../js/render-kanji-page.js';
import { ui } from '../js/strings.js';
import { installFakeDocument, elements } from './helpers/fake-document.mjs';

installFakeDocument();

// ── A recorded index: Clear and Calm, as the page's first two voices ─────

const VOICES = [{ id: 'clear', label: { en: 'Clear', es: 'Clara' } }, { id: 'calm', label: { en: 'Calm', es: 'Serena' } }];
const INDEX = { format: 'yomu-audio/2', voices: VOICES, shards: [{ first: '', src: 'data/audio/k00.json' }] };
const SHARD = {
  format: 'yomu-audio-clips/1',
  clips: {
    'にち': ['nichi', 0b01], // Clear alone: Calm borrows it
    'ひ': ['hi', 0b11],
    '日本|にほん': ['nihon', 0b11],
  },
};

test('the decision: the device\'s voice, else a clip in the chosen voice or Clear, else not until the shards are in', () => {
  const audio = useAudio(INDEX, [SHARD]);
  assert.equal(sayDecision({ device: true, voice: DEVICE_VOICE }), true, 'a Japanese voice on the device says anything');
  assert.equal(sayDecision({ device: false, voice: DEVICE_VOICE, audio, keys: ['にち'] }), false, 'no device voice and no recorded voice chosen');
  assert.equal(sayDecision({ device: false, voice: 'clear', audio, keys: ['にち'] }), true);
  assert.equal(sayDecision({ device: false, voice: 'calm', audio, keys: ['にち'] }), true, 'Calm borrows Clear\'s clip, as speak() plays it');
  assert.equal(sayDecision({ device: false, voice: 'calm', audio, keys: ['じつ'] }), false, 'no clip in any voice');
  assert.equal(sayDecision({ device: false, voice: 'calm', audio, keys: [wordKey('日本', 'にほん'), 'にほん'] }), true, 'a word by its own key');
  // Not known yet: no index, or a shard the keys need still to load.
  assert.equal(sayDecision({ device: false, voice: 'clear', audio: null, keys: ['じつ'] }), true, 'the default answers yes for now');
  assert.equal(sayDecision({ device: false, voice: 'clear', audio: null, keys: ['じつ'], pending: false }), false);
  const unloaded = useAudio({ ...INDEX, shards: [{ first: '', src: 'data/audio/k00.json' }] });
  assert.equal(sayDecision({ device: false, voice: 'clear', audio: unloaded, keys: ['じつ'], pending: 'wait' }), 'wait');
});

test('canSay asks the decision with the chosen voice and the index the page has', () => {
  assert.equal(canSpeak(), false, 'node has no speech synthesis');
  useAudio(INDEX, [SHARD]);
  setVoice('calm');
  assert.equal(canSay('にち'), true);
  assert.equal(canSay('ニチ'), true, 'katakana folds to the same key');
  assert.equal(canSay('じつ'), false);
  assert.equal(canSay('にほん', [wordKey('日本', 'にほん')]), true);
  setVoice(DEVICE_VOICE);
  assert.equal(canSay('にち'), false, 'This device\'s voice, and the device has none');
  setVoice('clear');
});

const INFO = { on: ['ニチ', 'ジツ'], kun: ['ひ'], m: ['day', 'sun'], s: 4, f: 1, g: 1 };
const PAGE = { words: [{ written: '日本', reading: 'にほん', gloss: 'Japan' }, { written: '日曜日', reading: 'にちようび', gloss: 'Sunday' }], parts: {}, used: [], variants: [] };

/** The page of 日, drawn behind `speakable`, as its say buttons and speech note. */
function draw(speakable, sayReason = ui('kpSayUnrecorded')) {
  const out = kanjiPageNodes({ ch: '日', info: INFO, infos: new Map(), paths: null, page: PAGE, back: null, mine: { saved: false, n: 0 }, speakable, sayReason });
  const all = [...elements(out.nodes)];
  const buttons = all.filter((el) => el.getAttribute('data-act') === 'kp-say-item').map((el) => ({
    says: out.sounds[Number(el.getAttribute('data-ix'))].text,
    off: el.getAttribute('aria-disabled') === 'true',
    describedBy: el.getAttribute('aria-describedby'),
    speak: el.getAttribute('data-speak'),
  }));
  const note = all.find((el) => el.getAttribute('id') === SPEECH_NOTE_ID);
  return { buttons, note };
}

test('a reading or word with a clip plays with no device voice; one with neither is disabled and names the note that says why', () => {
  useAudio(INDEX, [SHARD]);
  setVoice('calm');
  const { buttons, note } = draw((item) => canSay(item.text, item.lookup));
  // The readings, then Say it (the first reading), then the words.
  assert.deepEqual(buttons.map((b) => [b.says, b.off]), [
    ['にち', false], ['じつ', true], ['ひ', false], ['にち', false], ['にほん', false], ['にちようび', true],
  ]);
  for (const b of buttons) {
    assert.equal(b.describedBy, b.off ? SPEECH_NOTE_ID : null, b.says);
    assert.equal(b.speak, null, 'not the learner\'s text\'s gate, which needs the device\'s voice');
  }
  assert.equal(note.hidden, false);
  assert.equal(note.textContent, ui('kpSayUnrecorded'));
});

test('the note stays hidden while every button can be pressed, and This device\'s voice with none disables them all', () => {
  useAudio(INDEX, [SHARD]);
  const all = draw(() => true);
  assert.ok(all.buttons.every((b) => !b.off && b.describedBy === null));
  assert.equal(all.note.hidden, true);
  setVoice(DEVICE_VOICE);
  const none = draw((item) => canSay(item.text, item.lookup), 'no voice');
  assert.ok(none.buttons.length && none.buttons.every((b) => b.off && b.describedBy === SPEECH_NOTE_ID));
  assert.deepEqual([none.note.hidden, none.note.textContent], [false, 'no voice']);
  setVoice('clear');
});

test('a page drawn before its shards load is marked again once they have: the button with no clip is disabled and the note shows', async () => {
  // The index has loaded and its one shard has not, as on a first visit.
  useAudio(INDEX);
  setVoice('calm');
  const can = (item) => canSay(item.text, item.lookup);
  const out = kanjiPageNodes({ ch: '日', info: INFO, infos: new Map(), paths: null, page: PAGE, back: null, mine: { saved: false, n: 0 }, speakable: can, sayReason: ui('kpSayUnrecorded') });
  const all = [...elements(out.nodes)];
  const buttons = all.filter((el) => el.getAttribute('data-act') === 'kp-say-item');
  const note = all.find((el) => el.getAttribute('id') === SPEECH_NOTE_ID);
  assert.ok(buttons.length === 6 && buttons.every((b) => b.getAttribute('aria-disabled') === null), 'not known yet: every button can be pressed');
  assert.equal(note.hidden, true);
  const fetched = [];
  const fetchImpl = async (url) => { fetched.push(String(url)); return { ok: true, json: async () => SHARD }; };
  await sayKnown(out.sounds, fetchImpl);
  assert.equal(fetched.length, 1, 'the one shard the buttons name');
  assert.ok(fetched[0].endsWith('data/audio/k00.json'));
  const off = markSay(buttons, note, out.sounds, can, ui('kpSayUnrecorded'));
  assert.equal(off, 2);
  assert.deepEqual(buttons.map((b) => [out.sounds[Number(b.getAttribute('data-ix'))].text, b.getAttribute('aria-disabled'), b.getAttribute('aria-describedby')]), [
    ['にち', null, null], ['じつ', 'true', SPEECH_NOTE_ID], ['ひ', null, null], ['にち', null, null], ['にほん', null, null], ['にちようび', 'true', SPEECH_NOTE_ID],
  ]);
  assert.deepEqual([note.hidden, note.textContent], [false, ui('kpSayUnrecorded')]);
  // Marked again once every button can be pressed, the note goes away.
  assert.equal(markSay(buttons, note, out.sounds, () => true, ui('kpSayUnrecorded')), 0);
  assert.ok(buttons.every((b) => b.getAttribute('aria-disabled') === null && b.getAttribute('aria-describedby') === null));
  assert.equal(note.hidden, true);
  setVoice('clear');
});

test('sayKnown fetches nothing with This device\'s voice chosen', async () => {
  useAudio(INDEX);
  setVoice(DEVICE_VOICE);
  let calls = 0;
  await sayKnown([{ text: 'じつ' }], async () => { calls += 1; return { ok: false }; });
  assert.equal(calls, 0);
  setVoice('clear');
});

test('a kana page says the kana itself behind the same gate', () => {
  useAudio(INDEX, [SHARD]);
  setVoice('calm');
  const out = kanjiPageNodes({ ch: 'ひ', info: null, infos: new Map(), paths: null, page: { words: [], parts: {}, used: [], variants: [] }, back: null, mine: { saved: false, n: 0 }, speakable: (item) => canSay(item.text, item.lookup), sayReason: 'why' });
  const say = [...elements(out.nodes)].filter((el) => el.getAttribute('data-act') === 'kp-say-item');
  assert.deepEqual(out.sounds, [{ text: 'ひ' }]);
  assert.equal(say[0].getAttribute('aria-disabled'), null);
  assert.equal([...elements(out.nodes)].find((el) => el.getAttribute('id') === SPEECH_NOTE_ID).hidden, true);
});
