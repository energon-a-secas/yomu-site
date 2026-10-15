// The reading view's actions: All or One sentence, and the steps between
// sentences, which move the selection (events.js select), so the Word panel
// stays with the sentence on screen; and followFocus, which the arrow keys'
// roving focus calls, so focus never moves onto a word that is put away.

import { state } from './state.js';
import { paintSentence, firstWordOf, sentenceOf } from './reading-view.js';
import { select } from './events.js';
import { $ } from './utils.js';

export const VIEW_ACTIONS = {
  'read-view': (b) => {
    state.view.one = b.dataset.value === 'one';
    if (state.view.one) {
      const chosen = state.selected === null ? null : $('reading-body')?.querySelector(`.tok[data-i="${state.selected}"]`);
      state.view.sent = sentenceOf(chosen) ?? 0;
    }
    paintSentence(state);
  },
  'sent-step': (b) => {
    const to = state.view.sent + Number(b.dataset.step || 0);
    const word = firstWordOf(to);
    state.view.sent = to;
    if (word) select(Number(word.dataset.i));
    else paintSentence(state);
    // The button pressed may now be disabled (the first or last sentence): keep focus on the bar.
    if (b.disabled) $('sent-nav')?.querySelector('[data-act="sent-step"]:not([disabled])')?.focus();
  },
};

/** The arrow keys move focus, not the selection: a word in another sentence brings its sentence on screen first. */
export function followFocus(el) {
  const sent = sentenceOf(el);
  if (!state.view.one || sent === null || sent === state.view.sent) return;
  state.view.sent = sent;
  paintSentence(state);
}
