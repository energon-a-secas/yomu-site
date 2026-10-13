// The reference tabs of the Search screen: the kana chart and the counters.
//
// The chart is the gojūon, the voiced rows and the combined sounds, in
// hiragana or katakana; a single kana is a button to its page (strokes and
// words, render-kanji-page.js), found by `data-ix` in the list this paint
// kept. A combined sound (きゃ) is two characters and has no page of its own.
// Romaji is kana.js's, the same the reader spells with.
//
// The counters are counters.js's rows, whose readings are numbers.js's: a
// reading that bends (いっぽん, not いちほん) is marked, in words for a screen
// reader as well as by its look.

import { h } from './utils.js';
import { ui, t } from './strings.js';
import { toKata, beats, beatRomaji } from './kana.js';
import { withKanji } from './render-save.js';
import { COUNTER_LIST, counterRow } from './counters.js';

const GOJUON = Object.freeze([
  'あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの',
  'はひふへほ', 'まみむめも', 'や ゆ よ', 'らりるれろ', 'わ   を', 'ん    ',
]);
const VOICED = Object.freeze(['がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ']);
const COMBINED = Object.freeze(['き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'び', 'ぴ']);

/** The romaji of a sound, one beat or a combined one: し shi, きゃ kya. */
function romajiOf(kana) {
  const list = beats(kana);
  return list.map((b, i) => beatRomaji(b, list[i + 1] || '', list[i - 1] || '')).join('');
}

function cell(kana, script, kept) {
  if (!kana || kana === ' ') return h('span', { class: 'kc-cell kc-cell--empty', 'aria-hidden': 'true' });
  const shown = script === 'katakana' ? toKata(kana) : kana;
  const romaji = h('span', { class: 'kc-romaji', lang: 'ja-Latn' }, romajiOf(kana));
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
export function kanaChartNodes(script) {
  const kept = [];
  const combined = COMBINED.map((k) => [`${k}ゃ`, `${k}ゅ`, `${k}ょ`]);
  return {
    kept,
    nodes: [
      h('div', { class: 'seg kc-switch', role: 'group', 'aria-label': ui('kanaScript') }, ['hiragana', 'katakana'].map((s) => h('button', {
        type: 'button', class: 'seg-btn', 'data-act': 'kc-script', 'data-script': s, 'aria-pressed': String(s === script),
      }, ui(s === 'hiragana' ? 'kpHiragana' : 'kpKatakana')))),
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

/** Every counter in COUNTER_LIST, each with what it counts and its eleven readings. */
export function countersNodes() {
  return [
    h('p', { class: 'quiet' }, ui('countersLead')),
    h('ul', { class: 'cn-list', role: 'list' }, COUNTER_LIST.map(({ c, what }) => {
      const row = counterRow(c);
      if (!row) return null;
      return h('li', { class: 'cn-item' }, [
        h('div', { class: 'cn-head' }, [
          h('span', { class: 'cn-counter', lang: 'ja' }, c),
          h('span', { class: 'cn-plain', lang: 'ja' }, row.plain),
          h('span', { class: 'cn-what' }, t(what)),
        ]),
        h('ol', { class: 'cn-cells', role: 'list' }, [
          ...row.cells.map((x) => countCell(String(x.n), x.reading, x.changed)),
          row.question ? countCell('何', row.question.reading, row.question.changed) : null,
        ]),
      ]);
    })),
  ];
}
