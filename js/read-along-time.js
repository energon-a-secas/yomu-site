// Read along's timing, with no DOM and no voice: how long each word of a
// sentence is lit, where a boundary event's character falls, and how the
// time per beat is learned from how long the voice really took. Kept apart
// so tests/read-along.test.mjs runs it under node.
//
// A beat is a kana and a small kana together (きょ is one): the token's
// `morae`. Japanese voices say about seven beats a second; the first
// sentence starts from START_MS and every sentence then tunes it.

/** A beat's first guess, in ms at rate 1. */
export const START_MS = 140;
/** What a learned beat may be: a voice faster or slower than this is mismeasured. */
export const MIN_MS = 70;
export const MAX_MS = 400;

/** Beats in a word: its morae, at least 1 (a word with no reading still takes a moment). */
export function beatsOf(token) {
  return Math.max(1, (token && Array.isArray(token.morae) ? token.morae.length : 0) || 1);
}

/**
 * The words of one sentence as the voice will say them: each word's text,
 * where it starts in the joined text, and its beats.
 * @param {{ text: string, beats: number }[]} words
 * @returns {{ text: string, starts: number[], beats: number[], total: number }}
 */
export function lineOf(words) {
  const starts = [];
  let text = '';
  for (const w of words) { starts.push(text.length); text += w.text; }
  const beats = words.map((w) => Math.max(1, w.beats | 0));
  return { text, starts, beats, total: beats.reduce((a, b) => a + b, 0) };
}

/** The word a boundary's character index falls in: the last one starting at or before it. */
export function wordAt(starts, charIndex) {
  let k = -1;
  for (let i = 0; i < starts.length; i++) if (starts[i] <= charIndex) k = i;
  return k;
}

/** How long word k stays lit, in ms, at this beat length and speaking rate. */
export function litMs(beats, k, msPerBeat, rate = 1) {
  return (beats[k] * msPerBeat) / Math.max(rate, 0.1);
}

/**
 * The beat length learned from one sentence: `took` ms for `total` beats at
 * `rate`, blended half and half with what was known, and kept within bounds.
 */
export function learn(msPerBeat, took, total, rate = 1) {
  if (!(took > 0) || !(total > 0)) return msPerBeat;
  const measured = Math.min(MAX_MS, Math.max(MIN_MS, (took * rate) / total));
  return Math.round((msPerBeat + measured) / 2);
}

/** When word k is due to start, in ms from the sentence's start, by the estimate. */
export function startsAt(beats, k, msPerBeat, rate = 1) {
  let t = 0;
  for (let j = 0; j < k; j++) t += litMs(beats, j, msPerBeat, rate);
  return t;
}

/** How much of a word's estimated start must have passed before a boundary event is believed. */
export const TRUST = 0.6;

/**
 * Whether a boundary event for word `k` may move the light from word `at`,
 * `elapsed` ms into the sentence. Only forward, and only once most of the
 * estimated time to that word has passed: Chromium on macOS sends every
 * boundary of a sentence in one burst 90 ms in (measured 2026-10-15), and
 * following them lit the last word at once.
 */
export function believe(k, at, elapsed, beats, msPerBeat, rate = 1) {
  return k > at && elapsed >= TRUST * startsAt(beats, k, msPerBeat, rate);
}
