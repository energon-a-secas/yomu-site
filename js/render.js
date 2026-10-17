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
import { hideTip } from './render-gaps.js';
import { pageForms } from './other-forms.js';
import { pageExamples } from './examples.js';
import { pageSetWords } from './sets.js';
import { baseReading } from './conjugate.js';
import { markSentences, sentenceOf, paintSentence } from './reading-view.js';
import { isReadingAlong, stopReadAlong } from './read-along.js';
import { myWords, savableWord } from './word-store.js';

/** The analysis the last paint drew, so a new one can end a read along. */
let readAlongText = null;

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
    // Search from the empty page, where a learner has nothing to read yet.
    h('a', { class: 'empty-search', href: '#/search' }, [searchIcon(), h('span', null, ui('emptySearch'))]),
    // The kanji of the day, filled on idle by events-daily.js (afterEmpty).
    h('section', { class: 'daily', id: 'daily', 'aria-labelledby': 'daily-title', hidden: true }),
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

function searchIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'search-icon');
  el.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS(NS, 'circle');
  for (const [k, v] of [['cx', '10.5'], ['cy', '10.5'], ['r', '6']]) ring.setAttribute(k, v);
  const handle = document.createElementNS(NS, 'path');
  handle.setAttribute('d', 'm15 15 5 5');
  el.append(ring, handle);
  return el;
}

const emptied = [];

/** Runs after the empty state is drawn again, so the kanji of the day can fill its slot. */
export function afterEmpty(fn) {
  emptied.push(fn);
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
  if (isEmpty && (empty.hidden || !empty.firstChild)) {
    fill(empty, emptyNode());
    for (const fn of emptied) fn();
  }
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
  // A gap's reason belongs to a gap this repaint replaces: put it away, or a
  // pinned one stays over the new text naming a word that is gone.
  hideTip();
  // A new text ends a read along begun on the old one.
  if (isReadingAlong() && state.analysis !== readAlongText) stopReadAlong();
  readAlongText = state.analysis;
  if (body) {
    if (show) {
      const { lines, stop } = readingNodes(a.tokens, { selected: state.selected, kidOf: (ch) => kidOf(state, ch), gaps: a.gaps });
      fill(body, lines);
      markSentences(body);
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
  paintSentence(state);
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
  // In the one-sentence view the chosen word's sentence is the one shown.
  const sent = sentenceOf(chosen);
  if (state.view.one && sent !== null && sent !== state.view.sent) state.view.sent = sent;
  paintSentence(state);
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

/**
 * What the Word panel loads for a word after it opens: its other spellings
 * and its example sentences, each undefined while it loads. The panel paints
 * again when either arrives, if the word is still the one chosen.
 */
function lateFor(state, token) {
  if (!token || !token.entry || !['word', 'inflected'].includes(token.kind)) return { forms: null, examples: null, idioms: null };
  const key = token.base || token.surface;
  const reading = baseReading(token);
  const out = {};
  for (const [name, store, read] of [['forms', pageForms(), 'formsOf'], ['examples', pageExamples(), 'examplesOf'], ['idioms', pageSetWords(), 'inOf']]) {
    out[name] = store[read](key, reading);
    if (out[name] === undefined) {
      store.need([key]).then(() => { if (selectedToken(state) === token) paintWord(state); }).catch(() => {});
    }
  }
  return { ...out, ...moreFor(state, token, key, reading) };
}

/**
 * The examples behind More, once the learner opened them for this word
 * (`state.exMore`, events-word.js): `exMore` is how many wait behind the
 * button, `examples` grows by them, `exLoading` while their shard loads.
 */
function moreFor(state, token, key, reading) {
  const ex = pageExamples();
  const count = ex.moreCountOf(key, reading);
  if (!count || !state.exMore || state.exMore.token !== token) return { exMore: count };
  const more = ex.moreOf(key, reading);
  if (more === undefined) return { exMore: count, exLoading: true };
  const shown = ex.examplesOf(key, reading) || [];
  return { examples: [...shown, ...more], exMore: 0 };
}

// The word the Word panel's bookmark saves (word-store.js, where the iOS app's bridge reads it too).
export { savableWord };

export function paintWord(state) {
  const word = $('word-body');
  if (!word) return;
  const savable = savableWord(selectedToken(state));
  const mine = myKanji();
  const info = (state.analysis && state.analysis.info) || new Map();
  fill(word, wordNode(selectedToken(state), {
    noteOf,
    kidOf: (ch) => kidOf(state, ch),
    canSpeak: state.speech === 'ok',
    kanjiOf: (ch) => ({ info: info.get(ch), saved: mine.isSaved(ch), n: mine.seenOf(ch) ? mine.seenOf(ch).n : 0 }),
    gaps: state.prefs.gaps && state.analysis ? state.analysis.gaps : null,
    tokens: state.analysis ? state.analysis.tokens : [],
    ...lateFor(state, selectedToken(state)),
    // All forms keeps its register and its open state across repaints of the same word.
    conj: state.conj && state.conj.token === selectedToken(state) ? state.conj : null,
    wordSaved: savable ? myWords().isSaved(savable.w, savable.r) : null,
  }));
}

export function paintNote(state) {
  const panel = $('panel-notes');
  const body = $('note-body');
  if (!body) return;
  const ref = state.note;
  fill(body, noteNode(ref ? noteOf(ref.kind, ref.id) : null, ref, { canSay: state.speech === 'ok' || state.prefs.voice !== 'device' }));
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
