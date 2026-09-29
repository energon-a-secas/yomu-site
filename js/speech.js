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

import { vowelOf, toHira } from './kana.js';

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

/**
 * Say one piece of text. Resolves true when it finished, false when it could
 * not start, was cancelled, or failed. Never rejects: a learner pressing Stop
 * is a normal outcome.
 */
export function speak(text, { rate = 1 } = {}) {
  const words = String(text || '').trim();
  if (!canSpeak() || !words) return Promise.resolve(false);
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
    synth.speak(u);
  });
}

/** Stop anything being said, and any sequence in progress. */
export function cancel() {
  generation += 1;
  if (synthAvailable()) globalThis.speechSynthesis.cancel();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Say a list of steps in order, telling the caller which one is current.
 * A step is { text } or { pause: ms } (a held beat, っ, which has no sound of
 * its own). A cancel() or a newer sequence ends this one between steps.
 *
 * @returns {Promise<boolean>} true when every step ran
 */
export async function speakSteps(steps, { rate = 1, onStep = () => {}, gap = 180 } = {}) {
  cancel();
  const mine = generation;
  for (let i = 0; i < steps.length; i++) {
    if (mine !== generation) return false;
    onStep(i);
    const step = steps[i];
    if (step.pause) await wait(step.pause / Math.max(rate, 0.1));
    else await speak(step.text, { rate });
    if (mine !== generation) return false;
    if (i < steps.length - 1) await wait(gap / Math.max(rate, 0.1));
  }
  onStep(-1);
  return true;
}

/** Is a sequence or an utterance still running. */
export function isSpeaking() {
  return synthAvailable() && (globalThis.speechSynthesis.speaking || live.size > 0);
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
