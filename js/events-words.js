// My words' actions (render-words.js): Read it sends the word to the reader
// as a new text, and the bookmark unsaves it, focus going to the next row's
// bookmark, or the heading when the list is empty.

import { myWords } from './word-store.js';
import { words, paintWords } from './render-words.js';
import { paintDueCount } from './render-save.js';
import { openReader } from './events-kanji.js';
import { loadText } from './events-read.js';

export const WORDS_ACTIONS = {
  'wd-read': (b) => {
    const rec = myWords().byId(words.kept[Number(b.dataset.ix)]);
    if (!rec) return;
    openReader();
    loadText(rec.w, { source: 'typed' }).catch(() => {});
  },
  'wd-save': (b) => {
    const ix = Number(b.dataset.ix);
    const id = words.kept[ix];
    if (!id || !myWords().unsave(id)) return;
    paintWords();
    paintDueCount();
    const next = document.querySelectorAll('#mk-body [data-act="wd-save"]');
    (next[Math.min(ix, next.length - 1)] || document.getElementById('wd-h'))?.focus({ preventScroll: true });
  },
};
