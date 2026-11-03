// Search's Words by level (Browse): which level shows, Show more, Read it
// and Save, which puts the word in My words (word-store.js) as the Word
// panel's bookmark does. word-levels.js has the lists, render-word-levels.js
// draws. The choice lives in memory, never stored. The shelf itself shows
// only once js/word-levels.js pins the lists' sizes (events-search.js).

import { $, fill } from './utils.js';
import { ui } from './strings.js';
import { myWords, MAX_SAVED_WORDS } from './word-store.js';
import { pageWordLevels, savableRow, WORD_LEVELS, WORD_PAGE } from './word-levels.js';
import { wordLevelsNodes } from './render-word-levels.js';
import { paintDueCount } from './render-save.js';
import { notify } from './render-remember.js';
import { openReader } from './events-kanji.js';
import { loadText } from './events-read.js';

const wl = {
  level: WORD_LEVELS[0],
  shown: WORD_PAGE,
  kept: [],
  token: 0,
  cache: new Map(), // level id -> its rows, so a save or Show more never flashes "Loading"
};

const savedOf = (words) => (row) => {
  const w = savableRow(row);
  return !!w && words.isSaved(w.w, w.r);
};

/** Draw the chosen level; a paint a newer one overtook draws nothing. */
export async function paintWordLevels() {
  const body = $('sr-wordlv-body');
  if (!body) return;
  const token = ++wl.token;
  const isSaved = savedOf(myWords());
  const draw = (v) => {
    const { nodes, kept } = wordLevelsNodes({ level: wl.level, shown: wl.shown, isSaved, ...v });
    wl.kept = kept;
    fill(body, nodes);
  };
  const cached = wl.cache.get(wl.level);
  if (cached) { draw({ rows: cached }); return; }
  draw({ rows: null });
  try {
    const rows = await pageWordLevels().rows(wl.level);
    wl.cache.set(wl.level, rows);
    if (token !== wl.token) return;
    draw({ rows });
  } catch (err) {
    if (token !== wl.token) return;
    if (typeof console !== 'undefined') console.warn('[yomu] word levels', err);
    draw({ rows: null, failed: true });
  }
}

/** Focus a control the repaint put back, found by its act and place. */
function refocus(act, ix) {
  const sel = ix === undefined ? `#sr-wordlv-body [data-act="${act}"]` : `#sr-wordlv-body [data-act="${act}"][data-ix="${ix}"]`;
  document.querySelector(sel)?.focus({ preventScroll: true });
}

export const WORD_LEVELS_ACTIONS = {
  'wl-pick': (b) => {
    if (!WORD_LEVELS.includes(b.dataset.level)) return;
    wl.level = b.dataset.level;
    wl.shown = WORD_PAGE;
    paintWordLevels().then(() => document.querySelector(`#sr-wordlv-body [data-level="${wl.level}"]`)?.focus({ preventScroll: true }));
  },
  'wl-more': () => {
    const from = wl.shown;
    wl.shown += WORD_PAGE;
    // Focus goes to the first row the press added.
    paintWordLevels().then(() => refocus('wl-read', from));
  },
  'wl-save': (b) => {
    const ix = b.dataset.ix;
    const word = savableRow(wl.kept[Number(ix)]);
    if (!word) return;
    const words = myWords();
    const was = words.isSaved(word.w, word.r);
    const now = words.toggle(word, new Date());
    if (!was && !now && words.size >= MAX_SAVED_WORDS) notify(ui('wordsFull', { n: MAX_SAVED_WORDS }));
    paintDueCount();
    paintWordLevels().then(() => refocus('wl-save', ix));
  },
  'wl-read': (b) => {
    const row = wl.kept[Number(b.dataset.ix)];
    if (!row) return;
    openReader();
    loadText(row[0], { source: 'typed' }).catch(() => {});
  },
};
