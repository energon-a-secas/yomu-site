// The kanji page drawn before the device's voice list is known
// (js/speech.js sayKnown, js/events-kanji-page.js settleSay). On Chrome
// getVoices() is empty until voiceschanged fires, up to a second and a half
// after the page loads, so a page opened at once is drawn as if the device had
// no Japanese voice. Its say buttons carry no `data-speak`, so the reader's
// repaint after the voices arrive (events.js) does not reach them: the page
// waits for the list itself and marks its buttons again.
//
// Its own file, because voicesReady() settles once a process: here a
// stand-in speech synthesis gives no voices until the test sends the event.
//
//   node --test tests/kanji-page-voices.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { useAudio } from '../js/audio.js';
import {
  canSay, canSpeak, sayKnown, speechStatus, setVoice, DEVICE_VOICE,
} from '../js/speech.js';
import { kanjiPageNodes, markSay, SPEECH_NOTE_ID } from '../js/render-kanji-page.js';
import { installFakeDocument, elements } from './helpers/fake-document.mjs';

installFakeDocument();

// A speech synthesis with no voices yet, as Chrome's is at load.
let voices = [];
const listeners = [];
globalThis.SpeechSynthesisUtterance = class {};
globalThis.speechSynthesis = {
  getVoices: () => voices,
  addEventListener: (type, fn) => { if (type === 'voiceschanged') listeners.push(fn); },
};

const INDEX = { format: 'yomu-audio/2', voices: [{ id: 'clear', label: { en: 'Clear' } }, { id: 'calm', label: { en: 'Calm' } }], shards: [{ first: '', src: 'data/audio/k00.json' }] };
const SHARD = { format: 'yomu-audio-clips/1', clips: { 'にち': ['nichi', 0b01], 'ひ': ['hi', 0b11] } };
const INFO = { on: ['ニチ', 'ジツ'], kun: ['ひ'], m: ['day', 'sun'], s: 4, f: 1, g: 1 };
const PAGE = { words: [{ written: '日曜日', reading: 'にちようび', gloss: 'Sunday' }], parts: {}, used: [], variants: [] };

/** The page of 日 as the gate answers now: its say buttons, the note and what they say. */
function draw(reason) {
  const can = (item) => canSay(item.text, item.lookup);
  const out = kanjiPageNodes({ ch: '日', info: INFO, infos: new Map(), paths: null, page: PAGE, back: null, mine: { saved: false, n: 0 }, speakable: can, sayReason: reason });
  const all = [...elements(out.nodes)];
  return {
    can,
    sounds: out.sounds,
    buttons: all.filter((el) => el.getAttribute('data-act') === 'kp-say-item'),
    note: all.find((el) => el.getAttribute('id') === SPEECH_NOTE_ID),
  };
}

const offs = (page) => page.buttons.map((b) => b.getAttribute('aria-disabled') === 'true');

test('a page drawn before the voice list arrives is marked again when it does', async () => {
  useAudio(INDEX, [SHARD]);
  assert.equal(speechStatus(), 'checking');
  // This device's voice, still looking for one: every button waits, and says why.
  setVoice(DEVICE_VOICE);
  const device = draw('Looking for a Japanese voice on this device.');
  assert.ok(device.buttons.length === 5 && offs(device).every(Boolean));
  assert.equal(device.note.hidden, false);
  // A recorded voice, the shard loaded: what has no clip waits on the device.
  setVoice('calm');
  const calm = draw('not recorded');
  assert.deepEqual(offs(calm), [false, true, false, false, true], 'にち ジツ ひ, Say it (にち), 日曜日');

  let known = false;
  const settling = Promise.all([sayKnown(device.sounds), sayKnown(calm.sounds)]).then(() => { known = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(known, false, 'it waits for the voice list');

  voices = [{ lang: 'ja-JP', name: 'Kyoko', default: true, localService: true }];
  for (const fn of listeners) fn();
  await settling;
  assert.equal(canSpeak(), true);
  for (const page of [device, calm]) {
    assert.equal(markSay(page.buttons, page.note, page.sounds, page.can, 'unused'), 0);
    assert.ok(offs(page).every((off) => !off), 'the device says the rest');
    assert.equal(page.note.hidden, true);
  }
  setVoice('clear');
});
