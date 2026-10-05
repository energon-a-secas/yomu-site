// History (#/kanji/history): the phrases the learner saved on purpose, the
// switch that says whether Yomu keeps every text a learner reads, and, while
// it does, those texts, the latest first.
//
// Saved phrases come first and are there whatever Remember says, so the
// store (history-store.js) is opened to list them even with it off, and
// nothing is written by opening it. The switch is the one place remembering
// is turned on or off after the reader's card asked; "Texts you read" is
// what it governs, the texts not saved, shown only while it is on. One
// filter covers both lists. Each row is the text as read, drawn as a text
// node in lang="ja" and clamped to three lines by CSS, with Read again and
// the bookmark (a text you read also has Forget); every button finds its
// text by data-ix, its place in the list this file last drew (hist.saved,
// hist.shown), so no text is written into an attribute, and each is
// described by the row's text through aria-describedby, which points at an
// id, not at the text.

import { $, h, fill } from './utils.js';
import { ui } from './strings.js';
import { state } from './state.js';
import { toHira } from './kana.js';
import { toHiragana } from './vendor/wanakana.js';
import { dayOf } from './kanji-store.js';
import { myHistory, normalizeText } from './history-store.js';
import { dayText, today, textToggle } from './render-save.js';

/** The screen's own state: the filter, and the rows of each list as drawn (data-ix). */
export const hist = { filter: '', shown: [], saved: [] };

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

/** "Saved Oct 5 · read 3 times · last today · pasted". */
export function savedMetaLine(e, now = today()) {
  const parts = [
    ui('phraseSavedOn', { day: dayText(dayOf(e.saved), now) }),
    e.n === 1 ? ui('phraseReadOnce') : ui('phraseReadTimes', { n: e.n }),
    ui('phraseLastOn', { day: dayText(dayOf(e.last), now) }),
  ];
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
      textToggle(false, { 'data-act': 'hs-save', 'data-ix': ix, 'aria-describedby': id }),
    ]),
  ]);
}

function savedRow(e, ix, now) {
  const id = `hs-p-${ix}`;
  return h('li', { class: 'hs-item' }, [
    h('p', { class: 'hs-text', id, lang: 'ja' }, e.t),
    h('p', { class: 'mk-meta' }, savedMetaLine(e, now)),
    h('p', { class: 'hs-actions' }, [
      h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'hs-saved-read', 'data-ix': ix, 'aria-describedby': id }, ui('readAgain')),
      textToggle(true, { 'data-act': 'hs-unsave', 'data-ix': ix, 'aria-describedby': id }),
    ]),
  ]);
}

/** Each list alone: the filter repaints only these. */
export function historyListNodes(now = today()) {
  const all = myHistory().unsavedList();
  const shown = all.filter((e) => textMatches(e.t, hist.filter));
  hist.shown = shown;
  if (!all.length) return [h('p', { class: 'mk-empty' }, ui('historyEmpty'))];
  if (!shown.length) return [h('p', { class: 'mk-empty' }, ui('historyFilterNone'))];
  return [h('ul', { class: 'mk-list hs-list', role: 'list' }, shown.map((e, ix) => row(e, ix, now)))];
}

export function savedListNodes(now = today()) {
  const all = myHistory().savedList();
  const shown = all.filter((e) => textMatches(e.t, hist.filter));
  hist.saved = shown;
  if (!shown.length) return [h('p', { class: 'mk-empty' }, ui('savedFilterNone'))];
  return [h('ul', { class: 'mk-list hs-list', role: 'list' }, shown.map((e, ix) => savedRow(e, ix, now)))];
}

function health(store) {
  const lines = [];
  if (store.note === 'damaged') lines.push(ui('historyDamaged'));
  else if (store.note === 'partial') lines.push(ui('historyPartial', { n: store.dropped }));
  if (!store.writable) lines.push(ui('historyBlocked'));
  return lines.length ? h('p', { class: 'mk-line' }, lines.join(' ')) : null;
}

function switchSection(on, store, loose) {
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'hs-switch-h' }, [
    h('h3', { class: 'mk-sec-title', id: 'hs-switch-h', tabindex: '-1' }, ui('rememberHead')),
    h('p', { class: 'mk-line' }, ui(on ? 'rememberIsOn' : 'rememberIsOff')),
    health(store),
    h('p', { class: 'mk-actions' }, on
      ? h('button', { type: 'button', class: 'btn btn--secondary btn--sm', id: 'hs-switch', 'data-act': 'hs-off', 'aria-haspopup': loose ? 'dialog' : null }, ui('turnOff'))
      : h('button', { type: 'button', class: 'btn btn--primary btn--sm', id: 'hs-switch', 'data-act': 'hs-on' }, ui('turnOn'))),
  ]);
}

/** The one filter, for both lists; it sits in the first list on screen. */
function filterNode(controls) {
  return h('div', { class: 'mk-controls' }, h('div', { class: 'mk-filter' }, [
    h('label', { class: 'seg-label', for: 'hs-filter' }, ui('filter')),
    h('input', {
      type: 'search', id: 'hs-filter', class: 'mk-filter-input', autocomplete: 'off', spellcheck: 'false',
      'aria-describedby': 'hs-filter-hint', 'aria-controls': controls,
    }),
    h('span', { class: 'sr-only', id: 'hs-filter-hint' }, ui('historyFilterHint')),
  ]));
}

function sectionHead(id, key, n) {
  return h('h3', { class: 'mk-sec-title', id, tabindex: '-1' }, [ui(key), n ? h('span', { class: 'mk-count' }, ` ${n}`) : null]);
}

function savedSection(store, filter) {
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'hs-saved-h' }, [
    sectionHead('hs-saved-h', 'savedPhrasesHead', store.savedCount),
    h('p', { class: 'quiet' }, ui('savedPhrasesLead')),
    filter,
    h('div', { id: 'hs-saved-list' }, savedListNodes()),
  ]);
}

function listSection(loose, filter) {
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'hs-list-h' }, [
    sectionHead('hs-list-h', 'historyListHead', loose),
    filter,
    h('div', { id: 'hs-list' }, historyListNodes()),
    loose ? h('p', { class: 'mk-actions' }, h('button', {
      type: 'button', class: 'btn btn--ghost btn--sm mk-danger', 'data-act': 'hs-clear', 'aria-haspopup': 'dialog',
    }, ui('forgetAll'))) : null,
  ]);
}

/**
 * The screen's nodes: Saved phrases when there are any, the switch, and
 * while remembering is on, the texts read and not saved.
 */
export function historyNodes() {
  const on = state.prefs.remember === 'on';
  const store = myHistory();
  const saved = store.savedCount;
  const loose = on ? store.size - saved : 0;
  const controls = [saved ? 'hs-saved-list' : null, on ? 'hs-list' : null].filter(Boolean).join(' ');
  const filter = saved || loose ? filterNode(controls) : null;
  if (!saved) hist.saved = [];
  if (!on) hist.shown = [];
  return [
    saved ? savedSection(store, filter) : null,
    switchSection(on, store, loose),
    on ? listSection(loose, saved ? null : filter) : null,
  ].filter(Boolean);
}

/** Draw History into #mk-body, keeping the filter's text. */
export function paintHistory() {
  const body = $('mk-body');
  if (!body) return;
  fill(body, historyNodes());
  const input = $('hs-filter');
  if (input) input.value = hist.filter;
}

/** Repaint the lists only, so the filter box keeps focus while typing. */
export function paintHistoryList() {
  const saved = $('hs-saved-list');
  if (saved) fill(saved, savedListNodes());
  const list = $('hs-list');
  if (list) fill(list, historyListNodes());
}
