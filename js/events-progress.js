// My progress (#/kanji/progress): painted when the route shows, again when
// the jōyō list arrives, and when the period changes. progress.js computes,
// render-progress.js draws; nothing here is stored, the period included.

import { $, fill } from './utils.js';
import { myKanji } from './kanji-store.js';
import { today } from './render-save.js';
import { myHistory } from './history-store.js';
import { loadJoyo } from './collection.js';
import { progressOf, PERIODS } from './progress.js';
import { progressNodes } from './render-progress.js';
import { onRoute, currentRoute } from './events-kanji.js';

const pg = { period: 'week', joyo: null };

/** Draw the screen into My kanji's body, if the progress route shows. */
export function paintProgress() {
  const body = $('mk-body');
  if (!body || currentRoute() !== 'progress') return;
  const mine = myKanji();
  const day = today();
  fill(body, progressNodes(progressOf({
    kanji: mine.data, entries: myHistory().data.entries, joyo: pg.joyo, today: day, period: pg.period, due: mine.due(day).length,
  })));
}

export const PROGRESS_ACTIONS = {
  'pg-period': (b) => {
    if (!PERIODS.includes(b.dataset.period)) return;
    pg.period = b.dataset.period;
    paintProgress();
    document.querySelector(`#mk-body [data-act="pg-period"][data-period="${pg.period}"]`)?.focus();
  },
};

export function bindProgress() {
  onRoute((next) => {
    if (next !== 'progress') return;
    paintProgress();
    if (!pg.joyo) {
      // The shelves wait for the list; the rest of the screen does not.
      loadJoyo().then((joyo) => { pg.joyo = joyo; paintProgress(); }).catch((err) => console.warn('[yomu] progress', err));
    }
  });
}
