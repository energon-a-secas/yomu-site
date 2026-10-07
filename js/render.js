// Paint the page from state, one region at a time.
//
// Each region has its own paint function so that what changes most often
// repaints least: choosing a word repaints the Word panel and two attributes,
// not the reading; a display toggle repaints nothing but attributes. The
// reading is rebuilt only when a new analysis arrives.

import { $, clear, fill, h } from './utils.js';
import { ui, t, EXAMPLES } from './strings.js';
import { readingNodes, selectable } from './render-reading.js';
import { kanjiOrder, kanjiNode } from './render-kanji.js';
import { summarize, inTextNode, noteNode } from './render-notes.js';
import { wordNode } from './render-word.js';
import { paintChrome, paintStatus, paintSpeech } from './render-chrome.js';
import { noteOf } from './reader.js';
import { myKanji } from './kanji-store.js';
import { paintSavedMarks } from './render-save.js';
import { syncTranslation } from './render-translate.js';
import { gapsOf } from './gaps.js';

export { paintChrome, paintStatus, paintSpeech, paintSavedMarks };

/** The kanji list's index for a character, which is what data-kid holds. */
export function kidOf(state, ch) {
  const a = state.analysis;
  return a && a.order ? a.order.indexOf(ch) : -1;
}

function hasReading(state) {
  return !!(state.analysis && state.analysis.tokens.length && state.text.trim());
}

function emptyNode() {
  return [
    h('p', { class: 'empty-title' }, ui('emptyTitle')),
    h('p', { class: 'quiet' }, ui('emptyLead')),
    h('ul', { class: 'examples', role: 'list' }, EXAMPLES.map((ex, i) => h('li', null, h('button', {
      type: 'button',
      class: 'example',
      'data-act': 'example',
      'data-ex': i,
    }, [
      h('span', { class: 'example-ja', lang: 'ja' }, ex.ja),
      h('span', { class: 'example-tr' }, t(ex)),
    ])))),
  ];
}

/**
 * The empty state: shown only while the box is empty, and hidden the moment
 * it is not, before any read has finished, so a slow or failed read never
 * sits under "Paste a line of Japanese above".
 */
export function paintEmpty(state) {
  const empty = $('empty');
  if (!empty) return;
  const isEmpty = !state.text.trim();
  if (isEmpty && (empty.hidden || !empty.firstChild)) fill(empty, emptyNode());
  empty.hidden = !isEmpty;
}

/** The reading and "In this text". Rebuilt when the analysis changes. */
export function paintReading(state) {
  const a = state.analysis;
  if (a && !a.order) a.order = kanjiOrder(a.tokens);
  if (a && !a.gaps) a.gaps = gapsOf(a.tokens);
  const show = hasReading(state);

  paintEmpty(state);

  const body = $('reading-body');
  const section = $('reading');
  if (section) section.hidden = !show;
  if (body) {
    if (show) {
      const { lines, stop } = readingNodes(a.tokens, { selected: state.selected, kidOf: (ch) => kidOf(state, ch), gaps: a.gaps });
      fill(body, lines);
      const holder = stop === null ? null : body.querySelector(`.tok[data-i="${stop}"]`);
      if (holder) holder.tabIndex = 0;
    } else {
      fill(body, []);
    }
  }

  const inText = $('in-text');
  const inTextBody = $('in-text-body');
  if (inText) inText.hidden = !show;
  if (inTextBody && show) fill(inTextBody, inTextNode(summarize(a.tokens), noteOf, state.note));
  paintSelection(state);
  paintSide(state);
  paintSavedMarks(state);
  syncTranslation(state);
}

/** Which token is chosen, and the one tab stop that follows it. */
export function paintSelection(state) {
  const body = $('reading-body');
  if (!body) return;
  for (const b of body.querySelectorAll('.tok[aria-pressed="true"]')) b.setAttribute('aria-pressed', 'false');
  if (state.selected === null) return;
  const chosen = body.querySelector(`.tok[data-i="${state.selected}"]`);
  if (!chosen) return;
  chosen.setAttribute('aria-pressed', 'true');
  for (const b of body.querySelectorAll('.tok[tabindex="0"]')) if (b !== chosen) b.tabIndex = -1;
  chosen.tabIndex = 0;
}

export function selectedToken(state) {
  const a = state.analysis;
  if (!a || state.selected === null) return null;
  const token = a.tokens[state.selected];
  return token && selectable(token) ? token : null;
}

/** The side column: Word, the open note, and the kanji table, plus the tab strip. */
export function paintSide(state) {
  const a = state.analysis;
  const show = hasReading(state);
  const side = $('side');
  if (side) {
    side.hidden = !show;
    side.dataset.tab = state.tab;
    // Something chosen: on one column the side column rides at the bottom of
    // the screen (style.css), so the reading stays in view above it.
    side.toggleAttribute('data-sheet', show && (state.selected !== null || !!state.note || state.tab !== 'word'));
  }
  for (const b of document.querySelectorAll('[data-act="tab"]')) {
    b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab));
  }
  if (!show) return;

  paintWord(state);
  paintNote(state);
  const kanji = $('kanji-body');
  if (kanji) fill(kanji, kanjiNode(a, a.order || [], state.pinnedKanji, myKanji()));
}

export function paintWord(state) {
  const word = $('word-body');
  if (!word) return;
  const mine = myKanji();
  const info = (state.analysis && state.analysis.info) || new Map();
  fill(word, wordNode(selectedToken(state), {
    noteOf,
    kidOf: (ch) => kidOf(state, ch),
    canSpeak: state.speech === 'ok',
    kanjiOf: (ch) => ({ info: info.get(ch), saved: mine.isSaved(ch), n: mine.seenOf(ch) ? mine.seenOf(ch).n : 0 }),
    gaps: state.prefs.gaps && state.analysis ? state.analysis.gaps : null,
  }));
}

export function paintNote(state) {
  const panel = $('panel-notes');
  const body = $('note-body');
  if (!body) return;
  const ref = state.note;
  fill(body, noteNode(ref ? noteOf(ref.kind, ref.id) : null, ref));
  if (panel) {
    if (ref) panel.removeAttribute('data-empty');
    else panel.setAttribute('data-empty', '');
  }
  for (const b of document.querySelectorAll('.it-line')) {
    b.setAttribute('aria-pressed', String(!!ref && b.dataset.kind === ref.kind && b.dataset.id === ref.id));
  }
}

const afterAll = [];

/** Run `fn` after every paintAll: the My kanji screen is drawn by its own module. */
export function afterPaintAll(fn) {
  afterAll.push(fn);
}

/** Everything, once, at boot and after a language change. */
export function paintAll(state) {
  const empty = $('empty');
  if (empty) clear(empty);      // its examples are in the old language
  paintChrome(state);
  paintStatus(state);
  paintReading(state);
  for (const fn of afterAll) fn(state);
}
