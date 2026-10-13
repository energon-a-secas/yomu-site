// The Word panel's All forms (render-conj.js): saying a form, the plain or
// polite switch, and whether the section is open. Both are kept in
// `state.conj` for the word they were chosen on, because the panel repaints
// under them (the word's other spellings arrive a moment after it opens).

import { state, rate } from './state.js';
import { conjugateToken } from './conjugate.js';
import { speak } from './speech.js';
import { paintWord, selectedToken } from './render.js';

const speechOk = (b) => state.speech === 'ok' && b.getAttribute('aria-disabled') !== 'true';

/** The view of All forms for the chosen word, made fresh when the word changed. */
function view() {
  const token = selectedToken(state);
  if (!state.conj || state.conj.token !== token) state.conj = { token, reg: null, open: false };
  return state.conj;
}

export const WORD_ACTIONS = {
  // One form, found by its id, said by its reading.
  'say-form': (b) => {
    if (!speechOk(b)) return;
    const table = conjugateToken(selectedToken(state));
    const row = table && table.rows.find((r) => r.id === b.dataset.form);
    if (row) speak(row.reading, { rate: rate(state) });
  },
  'conj-reg': (b) => {
    Object.assign(view(), { reg: b.dataset.reg, open: true });
    paintWord(state);
    document.querySelector(`#word-conj [data-act="conj-reg"][data-reg="${b.dataset.reg}"]`)?.focus();
  },
};

export function bindWord() {
  // `toggle` does not bubble, so it is heard on the way down.
  document.addEventListener('toggle', (e) => {
    if (e.target && e.target.id === 'word-conj') view().open = e.target.open;
  }, true);
}
