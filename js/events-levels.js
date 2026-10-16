// Search's Kanji by level (Browse): which level shows, Show more, the save
// toggle, a kanji's page, and Practise, which starts a review of the level
// that moves no schedule (events-kanji.js startPractice). levels.js has the
// lists, render-levels.js draws. The choice lives in memory, never stored.

import { $, fill } from './utils.js';
import { kanjiInfo } from './reader.js';
import { myKanji } from './kanji-store.js';
import { LEVELS, LEVEL_PAGE, charsOf, practiceOf } from './levels.js';
import { levelsNodes } from './render-levels.js';
import { openKanjiPage } from './events-kanji-page.js';
import { afterChange, startPractice } from './events-kanji.js';

const lv = {
  level: 'g1',
  shown: LEVEL_PAGE,
  chars: null,
  kept: [],
  token: 0,
  cache: new Map(),   // level id -> its kanji, so a save or Show more never flashes "Loading"
};

/** Draw the chosen level; a paint a newer one overtook draws nothing. */
export async function paintLevels() {
  const body = $('sr-levels-body');
  if (!body) return;
  const token = ++lv.token;
  const mine = myKanji();
  const draw = (v) => {
    const { nodes, kept } = levelsNodes({ level: lv.level, shown: lv.shown, mine, ...v });
    lv.kept = kept;
    fill(body, nodes);
  };
  const cached = lv.cache.get(lv.level);
  if (!cached) draw({ chars: null, infos: new Map(), practise: 0 });
  try {
    const chars = cached || await charsOf(lv.level);
    lv.cache.set(lv.level, chars);
    const infos = await kanjiInfo(chars.slice(0, lv.shown));
    if (token !== lv.token) return;
    lv.chars = chars;
    draw({ chars, infos, practise: practiceOf(chars, (ch) => mine.isSaved(ch)).length });
  } catch (err) {
    if (token !== lv.token) return;
    if (typeof console !== 'undefined') console.warn('[yomu] levels', err);
    draw({ chars: null, infos: new Map(), practise: 0, failed: true });
  }
}

/** Focus a control the repaint put back, found by its act and place. */
function refocus(act, ix) {
  const sel = ix === undefined ? `#sr-levels-body [data-act="${act}"]` : `#sr-levels-body [data-act="${act}"][data-ix="${ix}"]`;
  document.querySelector(sel)?.focus({ preventScroll: true });
}

export const LEVELS_ACTIONS = {
  'lv-pick': (b) => {
    if (!LEVELS.some((l) => l.id === b.dataset.level)) return;
    lv.level = b.dataset.level;
    lv.shown = LEVEL_PAGE;
    paintLevels().then(() => document.querySelector(`#sr-levels-body [data-level="${lv.level}"]`)?.focus({ preventScroll: true }));
  },
  'lv-more': () => {
    const from = lv.shown;
    lv.shown += LEVEL_PAGE;
    // Focus goes to the first row the press added.
    paintLevels().then(() => refocus('lv-page', from));
  },
  'lv-save': (b) => {
    const ix = b.dataset.ix;
    const ch = lv.kept[Number(ix)];
    if (!ch) return;
    myKanji().toggle(ch, new Date());
    afterChange();
    paintLevels().then(() => refocus('lv-save', ix));
  },
  'lv-page': (b) => { const ch = lv.kept[Number(b.dataset.ix)]; if (ch) openKanjiPage(ch, b); },
  'lv-practise': () => {
    if (!lv.chars) return;
    const mine = myKanji();
    const chars = practiceOf(lv.chars, (ch) => mine.isSaved(ch));
    if (chars.length) startPractice(chars);
  },
};
