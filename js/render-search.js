// Search's results and its parts picker (js/search.js has the logic).
//
// A word is shown the way the dictionary lists it: a kana key with a kanji
// spelling is shown in kanji with its kana as the reading, unless the word
// is usually written in kana (`u`). Its kanji are buttons to their pages,
// and Read it sends the word to the reader. Every button finds what it acts
// on by `data-ix`, its place in a list this paint kept: no Japanese is
// written into an attribute.

import { h } from './utils.js';
import { ui, t, posWord } from './strings.js';
import { said, isKanji } from './kana.js';
import { wordRuby, withKanji } from './render-save.js';
import { NAME_TYPES } from './name-types.js';
import { meaningText } from './render-mykanji.js';

/** Glosses shown before "+n more meanings". */
const SHOWN = 3;
/** Kanji drawn above the parts picker before "the first n shown". */
export const PARTS_SHOWN = 60;
/** Results this short carry their meanings; longer ones are characters alone, so the picker stays near. */
export const PARTS_MEANT = 24;

/** How a result is written and read, and what it means, from its key and records. */
export function shownWord(res) {
  const rec = res.recs[0] || {};
  if (res.via === 'name') {
    const types = String(rec.n || '').split(' ').map((id) => t(NAME_TYPES[id])).filter(Boolean);
    return { written: res.key, reading: rec.r || res.key, glosses: types, pos: [], more: 0 };
  }
  const kana = ![...res.key].some(isKanji);
  const written = kana && Array.isArray(rec.k) && rec.k.length && !rec.u ? rec.k[0] : res.key;
  const reading = written === res.key ? (Array.isArray(rec.r) && rec.r[0]) || res.key : res.key;
  const glosses = res.recs.flatMap((r) => r.g || []);
  const pos = [...new Set(String(rec.p || '').split(/\s+/).filter(Boolean).map(posWord).filter(Boolean))];
  return {
    written, reading, glosses: glosses.slice(0, SHOWN), pos, more: Math.max(0, glosses.length - SHOWN),
  };
}

const VIA = Object.freeze({ form: 'searchViaForm', rare: 'searchViaRare', name: 'searchViaName' });

function kanjiTile(ch, kept, meaning) {
  const ix = kept.kanji.push(ch) - 1;
  return h('button', { type: 'button', class: 'kp-go', 'data-act': 'sr-kanji', 'data-ix': ix }, [
    h('span', { class: 'kp-go-char', lang: 'ja' }, ch),
    meaning ? h('span', { class: 'kp-go-mean', lang: 'en' }, meaning) : null,
    h('span', { class: 'sr-only' }, withKanji('openKanjiPage', ch)),
  ]);
}

function wordItem(res, kept, infos) {
  const w = shownWord(res);
  const ix = kept.words.push(w.written) - 1;
  const chars = [...new Set([...w.written].filter(isKanji))];
  const tag = VIA[res.via];
  return h('li', { class: 'sr-item' }, [
    h('div', { class: 'sr-head' }, [
      h('span', { class: 'sr-word' }, wordRuby([w.written, w.reading])),
      h('span', { class: 'sr-romaji', lang: 'ja-Latn' }, said(w.reading)),
      tag ? h('span', { class: 'word-tag' }, ui(tag)) : null,
    ]),
    w.pos.length ? h('p', { class: 'sr-pos' }, w.pos.join('; ')) : null,
    w.glosses.length ? h('ol', { class: 'sr-glosses', lang: 'en' }, w.glosses.map((g) => h('li', null, g))) : null,
    w.more ? h('p', { class: 'quiet sr-more' }, ui('searchMore', { n: w.more })) : null,
    h('div', { class: 'sr-actions' }, [
      ...chars.map((ch) => kanjiTile(ch, kept, meaningText(infos.get(ch), 1))),
      h('button', { type: 'button', class: 'btn btn--secondary btn--sm sr-read', 'data-act': 'sr-read', 'data-ix': ix }, [
        h('span', { 'aria-hidden': 'true' }, ui('searchRead')),
        h('span', { class: 'sr-only' }, ui('searchReadLabel', { w: w.written })),
      ]),
    ]),
  ]);
}

/**
 * The words pane's results.
 * @param {{ words: object[], kanji: string[] }} found  search()
 * @param {Map} infos  kanjiInfo() of the kanji shown
 * @returns {{ nodes: Node[], kept: { words: string[], kanji: string[] }, status: string }}
 */
export function resultNodes(found, infos) {
  const kept = { words: [], kanji: [] };
  const nodes = [];
  if (found.kanji.length) {
    nodes.push(h('section', { class: 'sr-kanji' }, [
      h('h3', { class: 'word-sub' }, ui('searchKanji')),
      h('div', { class: 'kp-tiles' }, found.kanji.map((ch) => kanjiTile(ch, kept, meaningText(infos.get(ch), 1)))),
    ]));
  }
  if (found.words.length) nodes.push(h('ul', { class: 'sr-list', role: 'list' }, found.words.map((r) => wordItem(r, kept, infos))));
  const n = found.words.length;
  const status = n ? (n === 1 ? ui('searchOne') : ui('searchMany', { n })) : (found.kanji.length ? '' : ui('searchNone'));
  return { nodes, kept, status };
}

/**
 * The parts pane: what is chosen, the kanji they lead to, and the picker,
 * grouped by stroke count. A part that leads nowhere with the chosen ones is
 * aria-disabled, not removed, so the grid does not move under a finger.
 * @param {{ list: [string, number|null][] }} data  loadParts()
 * @param {Set<string>} chosen
 * @param {{ kanji: string[], open: Set<string>|null }} found  byParts()
 * @param {Map} infos
 */
export function partsNodes(data, chosen, found, infos) {
  const kept = { parts: [], kanji: [] };
  const pick = (p) => {
    const ix = kept.parts.push(p) - 1;
    const on = chosen.has(p);
    const closed = !on && found.open && !found.open.has(p);
    return h('button', {
      type: 'button',
      class: 'sr-part',
      'data-act': 'sr-part',
      'data-ix': ix,
      'aria-pressed': on ? 'true' : 'false',
      'aria-disabled': closed ? 'true' : null,
    }, [h('span', { lang: 'ja', 'aria-hidden': 'true' }, p), h('span', { class: 'sr-only' }, withKanji('partPick', p))]);
  };
  const groups = new Map();
  for (const [p, n] of data.list) {
    const key = Number.isInteger(n) ? n : 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const order = [...groups.keys()].sort((a, b) => (a || 99) - (b || 99));
  const shown = found.kanji.slice(0, PARTS_SHOWN);
  const meant = shown.length <= PARTS_MEANT;
  return {
    kept,
    nodes: [
      h('div', { class: 'sr-chosen' }, [
        h('span', { class: 'kj-key' }, ui('partsChosen')), ' ',
        chosen.size ? h('span', { class: 'sr-chosen-list', lang: 'ja' }, [...chosen].join(' ')) : h('span', { class: 'quiet' }, ui('partsNoneChosen')),
        chosen.size ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'sr-parts-clear' }, ui('partsClear')) : null,
      ]),
      chosen.size ? h('p', { class: 'status', role: 'status', 'aria-live': 'polite' }, [
        ui('partsResults', { n: found.kanji.length }),
        found.kanji.length > shown.length ? `, ${ui('partsShown', { n: shown.length })}` : '',
      ]) : null,
      shown.length ? h('div', { class: 'kp-tiles sr-part-results' }, shown.map((ch) => {
        const ix = kept.kanji.push(ch) - 1;
        return h('button', { type: 'button', class: 'kp-go', 'data-act': 'sr-part-kanji', 'data-ix': ix }, [
          h('span', { class: 'kp-go-char', lang: 'ja' }, ch),
          meant && meaningText(infos.get(ch), 1) ? h('span', { class: 'kp-go-mean', lang: 'en' }, meaningText(infos.get(ch), 1)) : null,
          h('span', { class: 'sr-only' }, withKanji('openKanjiPage', ch)),
        ]);
      })) : null,
      ...order.map((n) => h('section', { class: 'sr-group' }, [
        h('h3', { class: 'word-sub' }, n ? ui('partsStrokes', { n }) : ui('partsOther')),
        h('div', { class: 'sr-picker' }, groups.get(n).map(pick)),
      ])),
    ],
  };
}
