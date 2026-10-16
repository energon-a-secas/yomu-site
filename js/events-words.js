// My words' actions (render-words.js): Read it sends the word to the reader
// as a new text, and the bookmark unsaves it, focus going to the next row's
// bookmark, or the heading when the list is empty. And another tab's write:
// the store is read again, as My kanji's and History's are, or this tab's
// next save wrote its stale copy over the other tab's save.

import { myWords, KEY } from './word-store.js';
import { words, paintWords } from './render-words.js';
import { paintDueCount } from './render-save.js';
import { openReader, afterChange } from './events-kanji.js';
import { loadText } from './events-read.js';

export function bindWords() {
  addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return;
    myWords().load();
    afterChange();
  });
}

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
