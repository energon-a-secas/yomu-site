// History (#/kanji/history): the switch that says whether Yomu keeps the
// texts a learner reads, and, while it does, the texts, the latest first.
//
// The switch is the one place remembering is turned on or off after the
// reader's card asked. While it is off nothing here opens the History store
// (history-store.js), so a learner who said no never has one written. Each
// row is the text as read, drawn as a text node in lang="ja" and clamped to
// three lines by CSS, with Read again and Forget; both find their text by
// data-ix, the place in the list this file last drew (hist.shown), so no
// text is written into an attribute. Read again and Forget are described by
// the row's text through aria-describedby, which points at an id, not at
// the text.

import { $, h, fill } from './utils.js';
import { ui } from './strings.js';
import { state } from './state.js';
import { toHira } from './kana.js';
import { toHiragana } from './vendor/wanakana.js';
import { dayOf } from './kanji-store.js';
import { myHistory, normalizeText } from './history-store.js';
import { dayText, today } from './render-save.js';

/** The screen's own state: the filter, and the rows as drawn (data-ix). */
export const hist = { filter: '', shown: [] };

const SOURCE_WORD = {
  paste: 'srcPaste', typed: 'srcTyped', example: 'srcExample', phrase: 'srcPhrase', link: 'srcLink', host: 'srcHost', history: 'srcHistory',
};

/**
 * Does a text match the filter: the words in it, with kana folded to
 * hiragana and romaji read as kana, so "ame", "あめ" and "アメ" all find 雨
 * written as あめ, the way render-mykanji.js matches() reads a reading.
 */
export function textMatches(text, query) {
  const q = normalizeText(query).toLowerCase();
  if (!q) return true;
  const hay = toHira(normalizeText(text).toLowerCase());
  const kana = toHira(q);
  const fromRomaji = /^[a-z' -]+$/.test(q) ? toHiragana(q.replace(/[ -]/g, '')) : '';
  return hay.includes(q) || hay.includes(kana) || (!!fromRomaji && /^[぀-ゟ]+$/.test(fromRomaji) && hay.includes(fromRomaji));
}

/** "Read 3 times · last Oct 2 · first Sep 28 · pasted". */
export function metaLine(e, now = today()) {
  const last = dayText(dayOf(e.last), now);
  const parts = e.n === 1
    ? [ui('readOnce'), last]
    : [ui('readTimes', { n: e.n }), ui('lastOn', { day: last }), ui('firstOn', { day: dayText(dayOf(e.first), now) })];
  if (SOURCE_WORD[e.src]) parts.push(ui(SOURCE_WORD[e.src]));
  return parts.join(' · ');
}

function row(e, ix, now) {
  const id = `hs-t-${ix}`;
  return h('li', { class: 'hs-item' }, [
    h('p', { class: 'hs-text', id, lang: 'ja' }, e.t),
    h('p', { class: 'mk-meta' }, metaLine(e, now)),
    h('p', { class: 'hs-actions' }, [
      h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'hs-read', 'data-ix': ix, 'aria-describedby': id }, ui('readAgain')),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'hs-forget', 'data-ix': ix, 'aria-describedby': id }, ui('forget')),
    ]),
  ]);
}

/** The list alone: the filter repaints only this. */
export function historyListNodes(now = today()) {
  const all = myHistory().list();
  const shown = all.filter((e) => textMatches(e.t, hist.filter));
  hist.shown = shown;
  if (!all.length) return [h('p', { class: 'mk-empty' }, ui('historyEmpty'))];
  if (!shown.length) return [h('p', { class: 'mk-empty' }, ui('historyFilterNone'))];
  return [h('ul', { class: 'mk-list hs-list', role: 'list' }, shown.map((e, ix) => row(e, ix, now)))];
}

function health(store) {
  const lines = [];
  if (store.note === 'damaged') lines.push(ui('historyDamaged'));
  else if (store.note === 'partial') lines.push(ui('historyPartial', { n: store.dropped }));
  if (!store.writable) lines.push(ui('historyBlocked'));
  return lines.length ? h('p', { class: 'mk-line' }, lines.join(' ')) : null;
}

function switchSection(on, store) {
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'hs-switch-h' }, [
    h('h3', { class: 'mk-sec-title', id: 'hs-switch-h', tabindex: '-1' }, ui('rememberHead')),
    h('p', { class: 'mk-line' }, ui(on ? 'rememberIsOn' : 'rememberIsOff')),
    on ? health(store) : null,
    h('p', { class: 'mk-actions' }, on
      ? h('button', { type: 'button', class: 'btn btn--secondary btn--sm', id: 'hs-switch', 'data-act': 'hs-off', 'aria-haspopup': store.size ? 'dialog' : null }, ui('turnOff'))
      : h('button', { type: 'button', class: 'btn btn--primary btn--sm', id: 'hs-switch', 'data-act': 'hs-on' }, ui('turnOn'))),
  ]);
}

function listSection(store) {
  const any = store.size > 0;
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'hs-list-h' }, [
    h('h3', { class: 'mk-sec-title', id: 'hs-list-h', tabindex: '-1' }, [
      ui('historyListHead'), any ? h('span', { class: 'mk-count' }, ` ${store.size}`) : null,
    ]),
    any ? h('div', { class: 'mk-controls' }, h('div', { class: 'mk-filter' }, [
      h('label', { class: 'seg-label', for: 'hs-filter' }, ui('filter')),
      h('input', {
        type: 'search', id: 'hs-filter', class: 'mk-filter-input', autocomplete: 'off', spellcheck: 'false',
        'aria-describedby': 'hs-filter-hint', 'aria-controls': 'hs-list',
      }),
      h('span', { class: 'sr-only', id: 'hs-filter-hint' }, ui('historyFilterHint')),
    ])) : null,
    h('div', { id: 'hs-list' }, historyListNodes()),
    any ? h('p', { class: 'mk-actions' }, h('button', {
      type: 'button', class: 'btn btn--ghost btn--sm mk-danger', 'data-act': 'hs-clear', 'aria-haspopup': 'dialog',
    }, ui('forgetAll'))) : null,
  ]);
}

/** The screen's nodes. While remembering is off, the store is not opened. */
export function historyNodes() {
  const on = state.prefs.remember === 'on';
  const store = on ? myHistory() : null;
  if (!on) hist.shown = [];
  return [switchSection(on, store), on ? listSection(store) : null].filter(Boolean);
}

/** Draw History into #mk-body, keeping the filter's text. */
export function paintHistory() {
  const body = $('mk-body');
  if (!body) return;
  fill(body, historyNodes());
  const input = $('hs-filter');
  if (input) input.value = hist.filter;
}

/** Repaint the list only, so the filter box keeps focus while typing. */
export function paintHistoryList() {
  const list = $('hs-list');
  if (list) fill(list, historyListNodes());
}
