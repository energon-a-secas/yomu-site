// The actions and bindings of the features added after events.js reached its
// 500-line limit, gathered here so events.js imports them once: the Idioms
// shelves (events-sets.js), My progress (events-progress.js), the reading
// view (events-view.js), the phone tab bar (events-tabbar.js), Kanji by
// level (events-levels.js) and the handwritten form (events-hand.js).

import { SETS_ACTIONS, bindSets } from './events-sets.js';
import { PROGRESS_ACTIONS, bindProgress } from './events-progress.js';
import { VIEW_ACTIONS, bindView } from './events-view.js';
import { TABBAR_ACTIONS, bindTabbar } from './events-tabbar.js';
import { LEVELS_ACTIONS } from './events-levels.js';
import { KANA_ROWS_ACTIONS } from './events-kana-rows.js';
import { HAND_ACTIONS } from './events-hand.js';

export const EXTRA_ACTIONS = Object.freeze({
  ...SETS_ACTIONS,
  ...PROGRESS_ACTIONS,
  ...VIEW_ACTIONS,
  ...TABBAR_ACTIONS,
  ...LEVELS_ACTIONS,
  ...KANA_ROWS_ACTIONS,
  ...HAND_ACTIONS,
});

export function bindExtra() {
  bindSets();
  bindProgress();
  bindTabbar();
  bindView();
}
