// The Print / Handwritten switch (render-hand.js): the choice, kept in this
// browser only, on <html data-hand>, which is all the CSS reads; and, the
// first time it is on, the font's index (hand.js loadHand), after which the
// kanji page paints again to say whether the hand has its character.

import { state, savePrefs } from './state.js';
import { loadHand } from './hand.js';

/** Put the choice on the page, and load the hand when it is on. Resolves once the index is in (or at once when off). */
export function applyHand() {
  document.documentElement.dataset.hand = state.prefs.hand ? 'on' : 'off';
  for (const b of document.querySelectorAll('[data-act="set-hand"]')) {
    b.setAttribute('aria-pressed', String((b.dataset.value === 'on') === state.prefs.hand));
  }
  if (!state.prefs.hand) return Promise.resolve(null);
  return loadHand().catch((err) => { console.warn('[yomu] handwritten form', err); return null; });
}

const listeners = new Set();

/** Run `fn` each time the hand's index arrives after the switch was turned on. */
export function onHand(fn) {
  listeners.add(fn);
}

export const HAND_ACTIONS = {
  'set-hand': (b) => {
    state.prefs.hand = b.dataset.value === 'on';
    savePrefs(state);
    applyHand().then((covered) => { if (covered) for (const fn of listeners) fn(); });
  },
};
