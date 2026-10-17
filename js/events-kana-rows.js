// The phrase library's "Only phrases I can read" (render-phrases.js): the
// toggle, and the way to the kana chart to mark the rows a learner knows
// (events-search.js openKanaChart, kana-rows.js). The toggle lasts the
// visit; the rows are this browser's preference.

import { state } from './state.js';
import { $ } from './utils.js';
import { showPhrases } from './events-say.js';
import { openKanaChart } from './events-search.js';

export const KANA_ROWS_ACTIONS = {
  'ph-readable': () => {
    state.view.readable = !state.view.readable;
    showPhrases().then(() => document.querySelector('#phrases-body [data-act="ph-readable"]')?.focus({ preventScroll: true }));
  },
  'ph-mark-rows': () => {
    $('phrases-dialog')?.close();
    openKanaChart();
  },
};
