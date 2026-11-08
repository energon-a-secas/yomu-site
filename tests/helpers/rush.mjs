// Helpers for the writing rush's tests (writing-rush.test.mjs and
// writing-rush-es.test.mjs): play strokes and characters the way the app
// passes `trace` verdicts on, with a clock in milliseconds.
import { WritingRush } from '../../js/writing-rush.js';
import { useLang } from '../../js/strings.js';

export const TODAY = '2026-11-07';
/** The character is named, never written, so these files pass their own rule. */
export const EM_DASH = String.fromCharCode(0x2014);

/** `fn` with every string in Spanish (strings.js useLang), then English again. */
export function inSpanish(fn) {
  useLang('es');
  try { return fn(); } finally { useLang('en'); }
}

/** One stroke of the character on the pad: `ok`, `why`, touched down at clock.t, lifted `gap / 2` later. */
export function stroke(rush, clock, ok, why = null, gap = 100, extra = {}) {
  const { id } = rush.view().run.char;
  const v = rush.act('stroke', { id, ok, why: ok ? null : why, began: clock.t, at: clock.t + gap / 2, ...extra });
  clock.t += gap;
  return v;
}

/** Every stroke left of the character on the pad, traced right. */
export function write(rush, clock, gap = 100) {
  let v = rush.view();
  const first = v.run.position;
  while (v.status === 'playing' && v.run.position === first) v = stroke(rush, clock, true, null, gap);
  return v;
}

/** Characters written right until the run ends or `limit` were dealt: the characters in the order dealt. */
export function playRight(rush, { clock = { t: 0 }, gap = 100, limit = Infinity } = {}) {
  const dealt = [];
  let v = rush.view();
  while (v.status === 'playing' && dealt.length < limit) {
    dealt.push(v.run.char.ch);
    v = write(rush, clock, gap);
  }
  return { v, dealt };
}

/** A new rush started with `args`, on TODAY and seed 1 unless they say otherwise. */
export const start = (args) => {
  const rush = new WritingRush();
  rush.start({ today: TODAY, seed: 1, ...args });
  return rush;
};
