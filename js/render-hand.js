// The Print / Handwritten switch (js/hand.js has the font, events-hand.js the
// action), drawn on the kanji page under the large character and on the kana
// chart beside Hiragana and Katakana: one choice, `state.prefs.hand`, kept in
// this browser only. And the line a kanji page shows when the hand lacks it.

import { h } from './utils.js';
import { ui } from './strings.js';

/** The two buttons, the current one pressed. `id` names the group's label. */
export function handSwitch(on, id) {
  return h('div', { class: 'seg hand-switch', role: 'group', 'aria-labelledby': id }, [
    h('span', { class: 'seg-label', id }, ui('handPick')),
    ...[['off', 'handPrint'], ['on', 'handWritten']].map(([value, label]) => h('button', {
      type: 'button', class: 'seg-btn', 'data-act': 'set-hand', 'data-value': value, 'aria-pressed': String((value === 'on') === on),
    }, ui(label))),
  ]);
}

/** Under the switch, with the hand on and its characters known: that this one stays in print. */
export function handMissing(on, has) {
  return on && has === false ? h('p', { class: 'quiet kp-hand-missing' }, ui('handMissing')) : null;
}
