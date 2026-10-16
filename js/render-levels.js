// Kanji by level (levels.js has the lists, events-levels.js the actions): a
// picker of the school years and the name kanji, a Practise button, and the
// chosen level's kanji, LEVEL_PAGE at a time, each with its meaning, its
// readings and their romaji, the save toggle and the page. Buttons find their
// kanji by `data-ix`, their place in the list this paint kept.

import { h } from './utils.js';
import { ui } from './strings.js';
import { saveToggle, seenText } from './render-save.js';
import { readingsLine, meaningText } from './render-mykanji.js';
import { gradeName, count } from './render-remember.js';
import { pageOpener } from './render-kanji-page.js';
import { LEVELS, LEVEL_PAGE } from './levels.js';

/** A level's name: a school year from the grade strings, or the name kanji. */
export function levelName(level) {
  return level.grade === null ? ui('levelNames') : gradeName(level.grade);
}

function row(ch, ix, info, mine) {
  const seen = mine.seenOf(ch);
  return h('li', { class: 'lv-item' }, [
    h('span', { class: 'lv-char', lang: 'ja' }, ch),
    h('div', { class: 'lv-main' }, [
      meaningText(info, 3) ? h('p', { class: 'mk-mean', lang: 'en' }, meaningText(info, 3)) : null,
      readingsLine(info),
      seen ? h('p', { class: 'mk-meta' }, seenText(seen.n, true)) : null,
    ]),
    pageOpener(ch, { 'data-act': 'lv-page', 'data-ix': ix }),
    saveToggle(ch, mine.isSaved(ch), { 'data-act': 'lv-save', 'data-ix': ix }),
  ]);
}

/**
 * @param {{ level: string, chars: string[]|null, shown: number, infos: Map, mine: object, practise: number, failed?: boolean }} v
 * @returns {{ nodes: Node[], kept: string[] }}
 */
export function levelsNodes({ level, chars, shown, infos, mine, practise, failed = false }) {
  const kept = [];
  const picker = h('div', { class: 'lv-pick', role: 'group', 'aria-label': ui('levelPick') }, LEVELS.map((l) => h('button', {
    type: 'button', class: 'cn-chip lv-chip', 'data-act': 'lv-pick', 'data-level': l.id, 'aria-pressed': String(l.id === level),
  }, levelName(l))));
  if (failed) return { nodes: [picker, h('p', { class: 'word-warn', role: 'alert' }, ui('searchFailed'))], kept };
  if (!chars) return { nodes: [picker, h('p', { class: 'quiet', role: 'status' }, ui('setsLoading'))], kept };
  const list = chars.slice(0, shown);
  const nodes = [
    picker,
    h('div', { class: 'lv-head' }, [
      h('p', { class: 'lv-count', role: 'status' }, ui('levelCount', { n: count(chars.length) })),
      practise ? h('button', { type: 'button', class: 'btn btn--primary btn--sm', 'data-act': 'lv-practise' }, ui('levelPractise', { n: practise })) : null,
    ]),
    h('p', { class: 'quiet lv-note' }, ui('levelPractiseNote')),
    h('ul', { class: 'lv-list', role: 'list' }, list.map((ch) => row(ch, kept.push(ch) - 1, infos.get(ch), mine))),
  ];
  if (chars.length > list.length) {
    nodes.push(h('button', { type: 'button', class: 'btn btn--ghost sets-more', 'data-act': 'lv-more' },
      ui('setsMore', { n: Math.min(chars.length - list.length, LEVEL_PAGE), left: chars.length - list.length })));
  }
  return { nodes, kept };
}
