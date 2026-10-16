// My words (#/kanji/words): the words saved from the Word panel's bookmark
// (word-store.js), the most recently saved first, each with its reading and
// romaji, its meaning, when it is next due, Read it and the bookmark that
// unsaves it. Buttons find their word by `data-ix`, its place in the list
// this paint kept (words.kept); no word is written into an attribute.

import { $, h, fill } from './utils.js';
import { ui } from './strings.js';
import { myWords } from './word-store.js';
import { bookmark, withKanji, dayText, today } from './render-save.js';
import { wordRomaji } from './render-romaji.js';

export const words = { kept: [] };

function row(rec, ix, now) {
  const due = rec.due <= now ? ui('wordsDueNow') : ui('wordsDue', { day: dayText(rec.due, now) });
  return h('li', { class: 'wd-item' }, [
    h('div', { class: 'wd-main' }, [
      h('p', { class: 'wd-word', lang: 'ja' }, rec.w),
      h('p', { class: 'mk-reads' }, [rec.r !== rec.w ? h('span', { lang: 'ja' }, `${rec.r} `) : null, ...wordRomaji(rec.r, { extra: 'kj-rom' })]),
      rec.g ? h('p', { class: 'mk-mean', lang: 'en' }, rec.g) : null,
      h('p', { class: 'mk-meta' }, due),
    ]),
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm wd-read', 'data-act': 'wd-read', 'data-ix': ix }, [
      h('span', { 'aria-hidden': 'true' }, ui('rvWordRead')),
      h('span', { class: 'sr-only' }, withKanji('wordRead', rec.w)),
    ]),
    h('button', { type: 'button', class: 'save-toggle', 'data-act': 'wd-save', 'data-ix': ix, 'aria-pressed': 'true' }, [
      bookmark(),
      h('span', { class: 'sr-only' }, withKanji('wordUnsave', rec.w)),
    ]),
  ]);
}

/** Draw My words into #mk-body. */
export function paintWords() {
  const body = $('mk-body');
  if (!body) return;
  const list = myWords().list();
  const now = today();
  words.kept = list.map((x) => x.id);
  fill(body, h('section', { class: 'mk-sec', 'aria-labelledby': 'wd-h' }, [
    h('h3', { class: 'mk-sec-title', id: 'wd-h', tabindex: '-1' }, [ui('wordsHead'), list.length ? h('span', { class: 'mk-count' }, ` ${list.length}`) : null]),
    h('p', { class: 'mk-line quiet' }, ui(list.length ? 'wordsLead' : 'wordsEmpty')),
    list.length ? h('ul', { class: 'wd-list', role: 'list' }, list.map((rec, ix) => row(rec, ix, now))) : null,
  ]));
}
