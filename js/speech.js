// Speech: a Japanese voice, or an honest reason there is none.
//
// Three facts shape this file, and each has bitten a sibling site:
//
// 1. getVoices() is empty on Chrome until voiceschanged fires. Firefox and
//    Safari fill it at once. Reading it once at boot says "no voice" to most
//    visitors, so voicesReady() waits for the event, with a deadline, because
//    a device with no voices at all never fires it.
// 2. Without a Japanese voice the platform reads Japanese with an English one,
//    or says nothing. Either is worse than a disabled control with a one-line
//    reason, so canSpeak() is false unless a ja voice exists, and the page
//    says why.
// 3. Chrome can garbage-collect an utterance mid-sentence and never fire
//    'end'. Every live utterance is held in a set until it ends, and every
//    speak() has a deadline so a sequence can never hang on a lost event.
//
// Yomu's own text (the sound notes, every beat, the phrase library, the
// notes' examples) also has recorded voices (js/audio.js, docs/AUDIO.md). A
// text with a clip in the chosen voice plays the clip, on any device, with a
// Japanese voice installed or not; a clip the chosen voice failed its check
// for is played in the first voice of the index (Clear, which has every
// common beat); anything else is said by the device. A sequence is said in one
// voice: the chosen one, else the first, else the device.

import { vowelOf, toHira } from './kana.js';
import { loadAudio, audioNow, clipFor, clipInTurn, voicesInTurn, siteUrl, SILENCE_SRC } from './audio.js';

const VOICES_TIMEOUT_MS = 1500;
const LANG = 'ja-JP';

let voice = null;
let status = 'checking';          // checking | ok | none | no-api
let ready = null;
let generation = 0;
const live = new Set();

export function synthAvailable() {
  return typeof globalThis.speechSynthesis !== 'undefined'
    && typeof globalThis.SpeechSynthesisUtterance === 'function';
}

function isJapanese(v) {
  return /^ja([-_]|$)/i.test(String((v && v.lang) || ''));
}

/** The best Japanese voice: exact ja-JP first, the platform default among them first. */
function pick(voices) {
  const ja = voices.filter(isJapanese);
  if (!ja.length) return null;
  const exact = ja.filter((v) => String(v.lang).replace('_', '-').toLowerCase() === 'ja-jp');
  const pool = exact.length ? exact : ja;
  return pool.find((v) => v.default) || pool.find((v) => v.localService) || pool[0];
}

/**
 * Resolves to 'ok', 'none' or 'no-api' once the voice list is known. The
 * listener stays on afterwards, so a voice installed or loaded late still
 * upgrades the page on the next call to status().
 */
export function voicesReady() {
  if (ready) return ready;
  if (!synthAvailable()) {
    status = 'no-api';
    ready = Promise.resolve(status);
    return ready;
  }
  const synth = globalThis.speechSynthesis;
  const settle = () => {
    voice = pick(synth.getVoices() || []);
    status = voice ? 'ok' : 'none';
    return status;
  };
  ready = new Promise((resolve) => {
    if ((synth.getVoices() || []).length) { resolve(settle()); return; }
    const timer = setTimeout(() => resolve(settle()), VOICES_TIMEOUT_MS);
    synth.addEventListener('voiceschanged', () => { clearTimeout(timer); resolve(settle()); }, { once: true });
  });
  synth.addEventListener('voiceschanged', settle);
  return ready;
}

export function speechStatus() {
  return status;
}

export function canSpeak() {
  return status === 'ok' && !!voice;
}

// ── Recorded voices ───────────────────────────────────────────────────────

/** The device's own voice: no clips. */
export const DEVICE_VOICE = 'device';

let chosen = 'clear';
let player = null;
let playing = null;          // finish() of the clip now playing
let unlocked = false;

// iOS plays an <audio> element only from a tap, or once it has played from
// one, so a speak() that must wait for the index plays a twentieth of a second
// of silence (SILENCE_SRC) in the tap itself, and every later clip, a
// sequence's included, reuses the element.

/** Which recorded voice speaks Yomu's own text, or DEVICE_VOICE for none. */
export function setVoice(id) {
  chosen = typeof id === 'string' && id ? id : DEVICE_VOICE;
}

export function voiceChoice() {
  return chosen;
}

/** Recorded voices are on: Yomu's own text can be said with no device voice. */
export function recordedOn() {
  return chosen !== DEVICE_VOICE;
}

function audioEl() {
  if (!player && typeof globalThis.Audio === 'function') {
    player = new globalThis.Audio();
    player.preload = 'auto';
  }
  return player;
}

/** Called inside a tap, before anything is awaited. */
function unlock() {
  if (unlocked || !recordedOn()) return;
  const el = audioEl();
  if (!el) return;
  unlocked = true;
  el.src = siteUrl(SILENCE_SRC);
  const p = el.play();
  // A clip loaded over the silence interrupts it (AbortError), which is fine.
  if (p && p.catch) p.catch((err) => { if (err && err.name === 'NotAllowedError') unlocked = false; });
}

/** The clip for a text in a voice, or in the first voice when that one has none. */
function clipIn(audio, text, speaker, rate) {
  const clip = clipInTurn(audio, text, speaker, { slow: rate < 1 });
  return clip && { ...clip, url: siteUrl(clip.path) };
}

/** The clip for a text, if recorded voices are on and the index has loaded and holds one. */
function clipNow(text, rate, speaker) {
  return recordedOn() ? clipIn(audioNow(), text, speaker, rate) : null;
}

/** A second voice beside the chosen one, for the other speaker in a dialogue. */
export function otherVoice() {
  if (!recordedOn()) return DEVICE_VOICE;
  return chosen === 'male' ? 'clear' : 'male';
}

/**
 * Play a clip; resolves true when it ends. A browser that refuses to play
 * it (no tap to play from) hands the text to `refused`, the device voice.
 */
function playClip(clip, rate, onStart, refused) {
  const el = audioEl();
  if (!el) return refused();
  stopClip();
  unlocked = true;
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      el.onended = null;
      el.onerror = null;
      if (playing === finish) playing = null;
      resolve(ok);
    };
    playing = finish;
    el.onended = () => finish(true);
    el.onerror = () => finish(false);
    el.src = clip.url;
    // Loading a source resets playbackRate to defaultPlaybackRate, so both.
    // A slow take is already slow; a normal one is slowed with its pitch kept.
    const r = clip.slow ? 1 : rate;
    el.defaultPlaybackRate = r;
    el.playbackRate = r;
    el.preservesPitch = true;
    el.webkitPreservesPitch = true;
    const p = el.play();
    if (p && p.then) {
      p.then(() => { if (onStart && !done) onStart(); }, (err) => {
        if (done) return;
        if (err && err.name === 'NotAllowedError') {
          unlocked = false;
          done = true;
          if (playing === finish) playing = null;
          resolve(refused());
        } else finish(false);
      });
    } else if (onStart) onStart();
  });
}

function stopClip() {
  if (!playing) return;
  const finish = playing;
  if (player) player.pause();
  finish(false);
}

/**
 * Can `text` be said now: by a clip (once the index has loaded), or by the
 * device. Before the index loads, a recorded voice answers yes for Yomu's
 * own text, which is what the buttons that ask are for.
 */
export function canSay(text) {
  if (canSpeak()) return true;
  if (!recordedOn()) return false;
  const audio = audioNow();
  return !audio || !!clipFor(audio, text, chosen);
}

/**
 * Say one piece of text. Resolves true when it finished, false when it could
 * not start, was cancelled, or failed. Never rejects: a learner pressing Stop
 * is a normal outcome. `onStart` hears the voice begin, and `onBoundary` its
 * word boundaries (a character index into `text`) on a browser that sends
 * them: Android sends none, and others are uneven for Japanese, so read
 * along only lets them correct its estimate (read-along.js).
 */
export function speak(text, { rate = 1, onStart = null, onBoundary = null, recorded = true, speaker = chosen } = {}) {
  const words = String(text || '').trim();
  if (!words) return Promise.resolve(false);
  const device = () => sayOnDevice(words, { rate, onStart, onBoundary });
  if (recorded && recordedOn()) {
    const clip = clipNow(words, rate, speaker);
    if (clip) return playClip(clip, rate, onStart, device);
    if (!audioNow()) {
      unlock();
      const mine = generation;
      return loadAudio().then((audio) => {
        if (mine !== generation) return false;
        const late = clipIn(audio, words, speaker, rate);
        return late ? playClip(late, rate, onStart, device) : device();
      });
    }
  }
  return device();
}

function sayOnDevice(words, { rate, onStart, onBoundary }) {
  if (!canSpeak()) return Promise.resolve(false);
  const synth = globalThis.speechSynthesis;
  return new Promise((resolve) => {
    const u = new globalThis.SpeechSynthesisUtterance(words);
    u.lang = LANG;
    u.voice = voice;
    u.rate = rate;
    live.add(u);
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      live.delete(u);
      resolve(ok);
    };
    // Generous: about 0.45 s per character at the given rate, plus a start-up
    // allowance. It only matters when the 'end' event is lost.
    const timer = setTimeout(() => finish(false), 2500 + (words.length * 450) / Math.max(rate, 0.1));
    u.addEventListener('end', () => finish(true));
    u.addEventListener('error', () => finish(false));
    if (onStart) u.addEventListener('start', () => onStart());
    if (onBoundary) u.addEventListener('boundary', (e) => onBoundary(e.charIndex, e.name));
    synth.speak(u);
  });
}

/** Stop anything being said, and any sequence in progress. */
export function cancel() {
  generation += 1;
  stopClip();
  if (synthAvailable()) globalThis.speechSynthesis.cancel();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Say a list of steps in order, telling the caller which one is current.
 * A step is { text } or { pause: ms } (a held beat, っ, which has no sound of
 * its own); a text step may name a `speaker`, the recorded voice that says
 * it (a dialogue's second speaker). A cancel() or a newer sequence ends this
 * one between steps.
 *
 * @returns {Promise<boolean>} true when every step ran
 */
export async function speakSteps(steps, { rate = 1, onStep = () => {}, gap = 180 } = {}) {
  cancel();
  unlock();
  const mine = generation;
  // One voice for the whole sequence: beats in a recording and the word in
  // the device's voice would be two people. The chosen voice if it has every
  // step, else the first voice if that has, else the device for all.
  const audio = recordedOn() ? audioNow() || await loadAudio() : null;
  if (mine !== generation) return false;
  const has = (v) => steps.every((st) => st.pause || !st.text || clipFor(audio, st.text, st.speaker || v));
  const voice = audio ? voicesInTurn(audio, chosen).find(has) : undefined;
  const recorded = !!voice;
  for (let i = 0; i < steps.length; i++) {
    if (mine !== generation) return false;
    onStep(i);
    const step = steps[i];
    if (step.pause) await wait(step.pause / Math.max(rate, 0.1));
    else await speak(step.text, { rate, recorded, speaker: step.speaker || voice });
    if (mine !== generation) return false;
    if (i < steps.length - 1) await wait(gap / Math.max(rate, 0.1));
  }
  onStep(-1);
  return true;
}

/** Is a sequence or an utterance still running. */
export function isSpeaking() {
  return !!playing || (synthAvailable() && (globalThis.speechSynthesis.speaking || live.size > 0));
}

// ── Sounding a word out ───────────────────────────────────────────────────

const VOWEL_KANA = Object.freeze({ a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' });
const PARTICLE_SAID = Object.freeze({ 'は': 'わ', 'へ': 'え', 'を': 'お' });

/** How long a held beat (っ) is silent before the next one, at rate 1. */
const HELD_BEAT_MS = 260;

/**
 * What to say for a whole token. The reading, not the surface, so the voice
 * says what the page shows rather than choosing its own reading of a kanji;
 * a particle is said as a particle (は as わ).
 */
export function sayable(token) {
  const r = toHira((token && (token.reading || token.surface)) || '');
  return token && token.kind === 'particle' ? PARTICLE_SAID[r] || r : r;
}

/**
 * Beats first, then the whole: c-a-r, then car. Each beat is said as it is
 * spelled; っ is a held silence because that is all it is, and ー repeats the
 * vowel before it. The last step is the whole word, said.
 */
export function beatSteps(beats, whole) {
  const steps = [];
  const list = Array.from(beats || []);
  list.forEach((b, i) => {
    if (b === 'っ' || b === 'ッ') steps.push({ pause: HELD_BEAT_MS });
    else if (b === 'ー') steps.push({ text: VOWEL_KANA[vowelOf(list[i - 1])] || '' });
    else steps.push({ text: toHira(b) });
  });
  if (whole) steps.push({ text: whole, whole: true });
  return steps;
}
