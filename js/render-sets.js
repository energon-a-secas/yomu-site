// The Collections tab (js/sets.js has the logic): which set, and its rows
// that answer the filter, SET_PAGE at a time. A row's Read it finds its
// word by `data-ix`, its place in the list this paint kept, so no Japanese
// is written into an attribute.

import { h } from './utils.js';
import { ui } from './strings.js';
import { wordRuby } from './render-save.js';
import { romajiNodes } from './render-search.js';
import { SET_IDS, SET_PAGE } from './sets.js';

/** The set picker: one pressed button per set. */
export function setPickNodes(chosen) {
  return h('div', { class: 'seg sets-pick', role: 'group', 'aria-label': ui('setsPick') }, SET_IDS.map((id) => h('button', {
    type: 'button', class: 'seg-btn', 'data-act': 'set-pick', 'data-set': id, 'aria-pressed': String(id === chosen),
  }, ui(`set_${id}`))));
}

function row([written, reading, glosses], kept) {
  const ix = kept.push(written) - 1;
  return h('li', { class: 'sr-item' }, [
    h('div', { class: 'sr-head' }, [
      h('span', { class: 'sr-word' }, wordRuby([written, reading || written])),
      ...romajiNodes(reading || written),
    ]),
    h('p', { class: 'sr-gloss', lang: 'en' }, glosses.join(' · ')),
    h('div', { class: 'sr-actions' }, [
      h('button', { type: 'button', class: 'btn btn--primary btn--sm sr-read', 'data-act': 'set-read', 'data-ix': ix }, [
        h('span', { 'aria-hidden': 'true' }, ui('searchRead')),
        h('span', { class: 'sr-only' }, ui('searchReadLabel', { w: written })),
      ]),
    ]),
  ]);
}

/**
 * The rows that answer the filter, the first `shown` of them.
 * @returns {{ nodes: Node[], kept: string[], status: string }}
 */
export function setListNodes(rows, total, shown) {
  const kept = [];
  const list = rows.slice(0, shown);
  const nodes = [];
  if (list.length) nodes.push(h('ul', { class: 'sr-list', role: 'list' }, list.map((r) => row(r, kept))));
  if (rows.length > list.length) {
    nodes.push(h('button', { type: 'button', class: 'btn btn--ghost sets-more', 'data-act': 'set-more' },
      ui('setsMore', { n: Math.min(rows.length - list.length, SET_PAGE), left: rows.length - list.length })));
  }
  let status;
  if (!rows.length) status = ui('setsNone');
  else status = rows.length === total ? ui('setsAll', { n: total }) : ui('setsFound', { n: rows.length, total });
  if (rows.length > list.length) status += ` · ${ui('setsShown', { shown: list.length })}`;
  return { nodes, kept, status };
}
