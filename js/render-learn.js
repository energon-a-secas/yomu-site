// The reference tabs of the Search screen: the kana chart and the counters.
//
// The chart is the gojūon, the voiced rows and the combined sounds, in
// hiragana or katakana; a single kana is a button to its page (strokes and
// words, render-kanji-page.js), found by `data-ix` in the list this paint
// kept. A combined sound (きゃ) is two characters and has no page of its own.
// Romaji is kana.js's, the same the reader spells with.
//
// The counters are a chip per counter and the chosen one's card, its rows
// counters.js's, whose readings are numbers.js's: a reading that bends
// (いっぽん, not いちほん) is marked, in words for a screen reader as well as
// by its look, and one line says where the sound changes.

import { h } from './utils.js';
import { ui, t } from './strings.js';
import { toKata } from './kana.js';
import { GOJUON, VOICED, COMBINED, kanaRomaji } from './kana-chart.js';
import { withKanji } from './render-save.js';
import { COUNTER_LIST, counterRow } from './counters.js';
import { KANA_ROWS } from './kana-rows.js';
import { handSwitch } from './render-hand.js';

function cell(kana, script, kept) {
  if (!kana || kana === ' ') return h('span', { class: 'kc-cell kc-cell--empty', 'aria-hidden': 'true' });
  const shown = script === 'katakana' ? toKata(kana) : kana;
  const romaji = h('span', { class: 'kc-romaji', lang: 'ja-Latn' }, kanaRomaji(kana));
  if ([...shown].length > 1) {
    return h('span', { class: 'kc-cell kc-cell--pair' }, [h('span', { class: 'kc-kana', lang: 'ja' }, shown), romaji]);
  }
  const ix = kept.push(shown) - 1;
  return h('button', { type: 'button', class: 'kc-cell', 'data-act': 'kc-kana', 'data-ix': ix }, [
    h('span', { class: 'kc-kana', lang: 'ja', 'aria-hidden': 'true' }, shown),
    romaji,
    h('span', { class: 'sr-only' }, withKanji('openKanjiPage', shown)),
  ]);
}

function grid(rows, script, kept, cols = 5) {
  return h('div', { class: `kc-grid kc-grid--${cols}` }, rows.flatMap((row) => [...row.padEnd(cols, ' ')].map((k) => cell(k, script, kept))));
}

/** @returns {{ nodes: Node[], kept: string[] }} */
/** The rows the learner marks as known, chips in the chart's order (kana-rows.js), shown in the script on screen. */
function rowsNodes(script, known) {
  const have = new Set(known || []);
  return [
    h('p', { class: 'kc-rows-lead', id: 'kc-rows-label' }, ui('kanaRowsKnown')),
    h('div', { class: 'cn-chips kc-rows', role: 'group', 'aria-labelledby': 'kc-rows-label' }, KANA_ROWS.map((r, i) => h('button', {
      type: 'button', class: 'cn-chip', 'data-act': 'kc-row', 'data-ix': i, 'aria-pressed': String(have.has(r)),
    }, h('span', { lang: 'ja' }, script === 'katakana' ? toKata(r) : r)))),
  ];
}

export function kanaChartNodes(script, known = [], hand = false) {
  const kept = [];
  const combined = COMBINED.map((k) => [`${k}ゃ`, `${k}ゅ`, `${k}ょ`]);
  return {
    kept,
    nodes: [
      ...rowsNodes(script, known),
      h('div', { class: 'kc-switches' }, [
        h('div', { class: 'seg kc-switch', role: 'group', 'aria-label': ui('kanaScript') }, ['hiragana', 'katakana'].map((s) => h('button', {
          type: 'button', class: 'seg-btn', 'data-act': 'kc-script', 'data-script': s, 'aria-pressed': String(s === script),
        }, ui(s === 'hiragana' ? 'kpHiragana' : 'kpKatakana')))),
        handSwitch(hand, 'kc-hand-label'),
      ]),
      h('p', { class: 'quiet kc-lead' }, ui('kanaLead')),
      h('h3', { class: 'word-sub' }, ui('kanaBasic')),
      grid(GOJUON, script, kept),
      h('h3', { class: 'word-sub' }, ui('kanaVoiced')),
      grid(VOICED, script, kept),
      h('h3', { class: 'word-sub' }, ui('kanaCombined')),
      h('div', { class: 'kc-grid kc-grid--3' }, combined.flatMap((row) => row.map((k) => cell(k, script, kept)))),
    ],
  };
}

function countCell(n, reading, changed) {
  return h('li', { class: `cn-cell${changed ? ' cn-cell--bent' : ''}` }, [
    h('span', { class: 'cn-n' }, n),
    h('span', { class: 'cn-read', lang: 'ja' }, reading || ui('counterNone')),
    changed ? h('span', { class: 'sr-only' }, ui('counterBent')) : null,
  ]);
}

/** "The sound changes at 1, 3, 6, 8, 10, and after 何", or that it never does. */
function bendLine(row) {
  const at = row.cells.filter((x) => x.changed).map((x) => x.n);
  if (!at.length && !(row.question && row.question.changed)) return ui('counterNoBend', { c: row.plain });
  if (!at.length) return ui('counterBendsQuestion');
  return ui(row.question && row.question.changed ? 'counterBendsAtQ' : 'counterBendsAt', { list: at.join(', ') });
}

/**
 * The counters: one chip per counter in COUNTER_LIST, and the chosen one's
 * card, with what it counts, where its sound changes, and its eleven readings.
 * A chip finds its counter by `data-ix`, its place in the list.
 * @param {number} chosen  the chosen counter's place in COUNTER_LIST
 */
export function countersNodes(chosen = 0) {
  const at = COUNTER_LIST[chosen] ? chosen : 0;
  const { c, what } = COUNTER_LIST[at];
  const row = counterRow(c);
  return [
    h('p', { class: 'quiet' }, ui('countersLead')),
    h('div', { class: 'cn-chips', role: 'group', 'aria-label': ui('counterPick') }, COUNTER_LIST.map((x, i) => h('button', {
      type: 'button', class: 'cn-chip', 'data-act': 'cn-pick', 'data-ix': i, 'aria-pressed': String(i === at),
    }, [h('span', { lang: 'ja', 'aria-hidden': 'true' }, x.c), h('span', { class: 'sr-only' }, [h('span', { lang: 'ja' }, x.c), `, ${t(x.what)}`])]))),
    h('section', { class: 'cn-card', 'aria-labelledby': 'cn-title' }, [
      h('h3', { class: 'cn-head', id: 'cn-title' }, [
        h('span', { class: 'cn-counter', lang: 'ja' }, c),
        row.plain !== c ? h('span', { class: 'cn-plain', lang: 'ja' }, row.plain) : null,
      ]),
      h('p', { class: 'cn-what' }, ui('counterCounts', { what: t(what) })),
      h('p', { class: 'cn-bends' }, bendLine(row)),
      h('ol', { class: 'cn-cells', role: 'list' }, [
        ...row.cells.map((x) => countCell(String(x.n), x.reading, x.changed)),
        row.question ? countCell('何', row.question.reading, row.question.changed) : null,
      ]),
    ]),
  ];
}
