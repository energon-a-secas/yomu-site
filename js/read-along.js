// Read along: the reading said sentence by sentence in the one-sentence view
// (reading-view.js), each word lit as it is said, and, with Repeat after me,
// a pause as long as the sentence for the learner to say it back. No
// microphone: nothing the learner says is heard or sent anywhere.
//
// What is said is each word's reading (speech.js sayable), so the voice says
// what the page shows rather than choosing its own reading of a kanji. A
// word is lit on a timing estimated from its beats (read-along-time.js); the
// time per beat is learned from how long each sentence took, and a browser's
// word boundaries, where it sends any, move the light to where the voice is.
// A run stops on Stop, on a new text, when the voice is cancelled (Speak all
// does that) or fails, and when the reader is left.

import { $ } from './utils.js';
import { ui } from './strings.js';
import { state, rate } from './state.js';
import { speak, cancel, canSpeak, sayable } from './speech.js';
import { paintSentence, sentenceOf } from './reading-view.js';
import {
  START_MS, beatsOf, lineOf, wordAt, litMs, learn, believe,
} from './read-along-time.js';

const ra = { on: false, run: 0, msPerBeat: START_MS, timer: null, lit: null, ended: false };

const wait = (ms) => new Promise((r) => { ra.timer = setTimeout(r, ms); });

/** The words of sentence `n`, in order: each lit element, its token's text to say, its beats. */
function wordsOf(n) {
  const body = $('reading-body');
  const tokens = (state.analysis && state.analysis.tokens) || [];
  if (!body) return [];
  const out = [];
  for (const unit of body.querySelectorAll(`.reading-line > [data-sent="${n}"]`)) {
    const toks = unit.matches('.tok[data-i]') ? [unit] : [...unit.querySelectorAll('.tok[data-i]')];
    for (const el of toks) {
      const token = tokens[Number(el.dataset.i)];
      const text = token ? sayable(token) : '';
      if (text) out.push({ el, text, beats: beatsOf(token) });
    }
  }
  return out;
}

function light(el) {
  if (ra.lit) ra.lit.classList.remove('is-reading');
  ra.lit = el || null;
  if (ra.lit) ra.lit.classList.add('is-reading');
}

function say(text) {
  const el = $('read-along-status');
  if (el) el.textContent = text;
}

/** The two buttons' pressed state and Read along's label. */
export function paintReadAlong() {
  const go = $('read-along');
  if (go) {
    go.setAttribute('aria-pressed', String(ra.on));
    const label = go.querySelector('[data-ra-label]');
    if (label) label.textContent = ui(ra.on ? 'raStop' : 'raStart');
  }
  const rep = $('read-repeat');
  if (rep) rep.setAttribute('aria-pressed', String(!!state.view.repeat));
}

export function isReadingAlong() {
  return ra.on;
}

/**
 * Stop a run: the light, the timers, and the voice unless something else
 * took it (`keepVoice`: Speak all cancelled this run to start its own, and
 * cancelling again would silence it). `note` is what the status line says.
 */
export function stopReadAlong(note = '', { keepVoice = false } = {}) {
  if (!ra.on && !ra.lit) return;
  ra.on = false;
  ra.run += 1;
  clearTimeout(ra.timer);
  if (!keepVoice) cancel();
  light(null);
  say(note);
  paintReadAlong();
}

/** Say one sentence, lighting its words. Resolves to the ms it took, or -1 when it did not finish. */
async function sayLine(words, run) {
  const line = lineOf(words);
  const r = rate(state);
  let started = false;
  let lightTimer = null;
  let at = -1;
  let tStart = 0;
  const from = (k) => {
    clearTimeout(lightTimer);
    if (run !== ra.run || k < 0 || k >= words.length) return;
    at = k;
    light(words[k].el);
    if (k + 1 < words.length) lightTimer = setTimeout(() => from(k + 1), litMs(line.beats, k, ra.msPerBeat, r));
  };
  const begin = () => { if (!started) { started = true; tStart = performance.now(); from(0); } };
  // A voice that never says it started still gets its words lit.
  const fallback = setTimeout(begin, 400);
  const t0 = performance.now();
  const ok = await speak(line.text, {
    rate: r,
    onStart: begin,
    // A boundary only corrects the estimate: forward, and not before most of
    // the time to its word has passed (read-along-time.js believe).
    onBoundary: (ci) => {
      begin();
      const k = wordAt(line.starts, ci);
      if (believe(k, at, performance.now() - tStart, line.beats, ra.msPerBeat, r)) from(k);
    },
  });
  clearTimeout(fallback);
  clearTimeout(lightTimer);
  const took = performance.now() - t0;
  if (ok) ra.msPerBeat = learn(ra.msPerBeat, took, line.total, r);
  return ok ? took : -1;
}

/** Start reading along from the sentence shown (or the chosen word's), or stop a run. */
export async function toggleReadAlong() {
  if (ra.on) { stopReadAlong(); return; }
  const analysis = state.analysis;
  const body = $('reading-body');
  if (!analysis || !body || !canSpeak()) return;
  const count = Number(body.dataset.sents) || 0;
  if (!count) return;
  cancel();                  // Speak all, or a word being said, gives way
  ra.on = true;
  const run = ++ra.run;
  paintReadAlong();
  // From the chosen word's sentence when the view was showing everything;
  // a run that reached the end starts the next one from the first sentence.
  if (!state.view.one) {
    const chosen = state.selected === null ? null : body.querySelector(`.tok[data-i="${state.selected}"]`);
    state.view.sent = sentenceOf(chosen) ?? 0;
  }
  state.view.one = true;
  if (ra.ended) state.view.sent = 0;
  ra.ended = false;
  for (let n = state.view.sent; n < count; n += 1) {
    if (run !== ra.run || state.analysis !== analysis) return;
    state.view.sent = n;
    paintSentence(state);
    const words = wordsOf(n);
    if (!words.length) continue;
    say(ui('raSaying', { n: n + 1, of: count }));
    const took = await sayLine(words, run);
    if (run !== ra.run) return;
    light(null);
    if (took < 0) { stopReadAlong('', { keepVoice: true }); return; }
    if (state.view.repeat) {
      say(ui('raYourTurn'));
      await wait(took + 600);
    } else {
      await wait(300);
    }
  }
  if (run === ra.run) {
    ra.ended = true;
    stopReadAlong(ui('raDone'));
  }
}
