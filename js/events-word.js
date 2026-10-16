// The Word panel's All forms (render-conj.js): saying a form, the plain or
// polite switch, and whether the section is open; and Read it on an example. Both are kept in
// `state.conj` for the word they were chosen on, because the panel repaints
// under them (the word's other spellings arrive a moment after it opens).
// More examples is kept the same way, in `state.exMore`.

import { state, rate } from './state.js';
import { conjugateToken } from './conjugate.js';
import { speak } from './speech.js';
import { paintWord, selectedToken } from './render.js';
import { pageExamples } from './examples.js';
import { baseReading } from './conjugate.js';
import { loadText } from './events-read.js';
import { pageSetWords } from './sets.js';
import { searchFor } from './events-search.js';

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
  // An example sentence, sent to the reader as a new text: one of the
  // three, or of those More added (data-ix counts on past the three).
  'ex-read': (b) => {
    const token = selectedToken(state);
    if (!token) return;
    const key = token.base || token.surface;
    const reading = baseReading(token);
    const ex = pageExamples();
    const opened = state.exMore && state.exMore.token === token;
    const list = [...(ex.examplesOf(key, reading) || []), ...((opened && ex.moreOf(key, reading)) || [])];
    const e = list[Number(b.dataset.ix)];
    if (e) loadText(e.ja, { source: 'typed' }).catch(() => {});
  },
  // The examples behind More, for this word until another is chosen; focus
  // goes to the first one they add, where reading goes on.
  'ex-more': () => {
    const token = selectedToken(state);
    if (!token) return;
    const key = token.base || token.surface;
    const first = (pageExamples().examplesOf(key, baseReading(token)) || []).length;
    state.exMore = { token };
    paintWord(state);
    pageExamples().needMore([key]).then(() => {
      if (selectedToken(state) !== token) return;
      paintWord(state);
      document.querySelector(`#word-body [data-act="ex-read"][data-ix="${first}"]`)?.focus();
    }).catch(() => {
      if (selectedToken(state) !== token) return;
      state.exMore = null;
      paintWord(state);
      document.querySelector('#word-body [data-act="ex-more"]')?.focus();
    });
  },
  // An idiom or proverb that holds the word, sent to the reader as a new text.
  'idiom-read': (b) => {
    const token = selectedToken(state);
    if (!token) return;
    const r = (pageSetWords().inOf(token.base || token.surface) || [])[Number(b.dataset.ix)];
    if (r) loadText(r.written, { source: 'typed' }).catch(() => {});
  },
  // The word in Search, which says what else it is and what holds it.
  'word-search': () => {
    const token = selectedToken(state);
    if (token) searchFor(token.base || token.surface);
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
