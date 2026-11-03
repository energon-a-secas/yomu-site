// Words by level (word-levels.js has the lists, events-word-levels.js the
// actions): a picker of N5 to N1, the count, Waller's credit with the word
// unofficial and a link to his terms, and the chosen level's words,
// WORD_PAGE at a time, each with its furigana, its romaji, the dictionary's
// meanings, Read it and Save. Buttons find their word by `data-ix`, its
// place in the list this paint kept, so no Japanese is written into an
// attribute.

import { h } from './utils.js';
import { ui } from './strings.js';
import { bookmark, wordRuby, withKanji } from './render-save.js';
import { romajiNodes } from './render-search.js';
import { WALLER_TERMS, levelName } from './render-levels.js';
import { count } from './render-remember.js';
import { LEVELS } from './levels.js';
import { WORD_LEVELS, WORD_PAGE } from './word-levels.js';

function picker(level) {
  return h('div', { class: 'lv-picks' }, [
    h('div', { class: 'lv-pick', role: 'group', 'aria-labelledby': 'wl-pick-jlpt' }, [
      h('span', { class: 'lv-pick-label', id: 'wl-pick-jlpt' }, ui('wordLevelPick')),
      ...WORD_LEVELS.map((id) => h('button', {
        type: 'button', class: 'cn-chip lv-chip', 'data-act': 'wl-pick', 'data-level': id, 'aria-pressed': String(id === level),
      }, levelName(LEVELS.find((l) => l.id === id)))),
    ]),
  ]);
}

/** Whose lists they are, under what licence, and that they are unofficial. */
function credit() {
  return h('p', { class: 'quiet lv-note' }, [
    `${ui('wordLevelNote')} `,
    h('a', { href: WALLER_TERMS, target: '_blank', rel: 'noopener noreferrer' }, ui('levelJlptTerms')),
  ]);
}

function row([written, reading, glosses], ix, saved) {
  return h('li', { class: 'sr-item' }, [
    h('div', { class: 'sr-head' }, [
      h('span', { class: 'sr-word' }, wordRuby([written, reading || written])),
      ...romajiNodes(reading || written),
    ]),
    h('p', { class: 'sr-gloss', lang: 'en' }, glosses.join(' · ')),
    h('div', { class: 'sr-actions' }, [
      h('button', { type: 'button', class: 'btn btn--primary btn--sm sr-read', 'data-act': 'wl-read', 'data-ix': ix }, [
        h('span', { 'aria-hidden': 'true' }, ui('searchRead')),
        h('span', { class: 'sr-only' }, ui('searchReadLabel', { w: written })),
      ]),
      h('button', {
        type: 'button', class: 'save-toggle', 'data-act': 'wl-save', 'data-ix': ix, 'aria-pressed': saved ? 'true' : 'false',
      }, [bookmark(), h('span', { class: 'sr-only' }, withKanji('saveWord', written))]),
    ]),
  ]);
}

/**
 * @param {{ level: string, rows: Array|null, shown: number, isSaved: Function, failed?: boolean }} v
 * @returns {{ nodes: Node[], kept: Array }}
 */
export function wordLevelsNodes({ level, rows, shown, isSaved, failed = false }) {
  const kept = [];
  const pick = picker(level);
  if (failed) return { nodes: [pick, h('p', { class: 'word-warn', role: 'alert' }, ui('searchFailed'))], kept };
  if (!rows) return { nodes: [pick, h('p', { class: 'quiet', role: 'status' }, ui('wordLevelsLoading'))], kept };
  const list = rows.slice(0, shown);
  const nodes = [
    pick,
    h('div', { class: 'lv-head' }, [h('p', { class: 'lv-count', role: 'status' }, ui('searchMany', { n: count(rows.length) }))]),
    credit(),
    h('p', { class: 'quiet lv-note' }, ui('wordLevelSaveNote')),
    h('ul', { class: 'sr-list', role: 'list' }, list.map((r) => row(r, kept.push(r) - 1, isSaved(r)))),
  ];
  if (rows.length > list.length) {
    nodes.push(h('button', { type: 'button', class: 'btn btn--ghost sets-more', 'data-act': 'wl-more' },
      ui('setsMore', { n: Math.min(rows.length - list.length, WORD_PAGE), left: rows.length - list.length })));
  }
  return { nodes, kept };
}
