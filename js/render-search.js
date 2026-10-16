// Search's results and its parts picker (js/search.js has the logic).
//
// A word is shown the way the dictionary lists it: a kana key with a kanji
// spelling is shown in kanji with its kana as the reading, unless the word
// is usually written in kana (`u`). Its kanji are buttons to their pages,
// and Read it sends the word to the reader. Every button finds what it acts
// on by `data-ix`, its place in a list this paint kept: no Japanese is
// written into an attribute.

import { h, withJa } from './utils.js';
import { glossWords } from './search.js';
import { ui, t, posWord } from './strings.js';
import { isKanji } from './kana.js';
import { wordRomaji } from './render-romaji.js';
import { wordRuby, withKanji } from './render-save.js';
import { NAME_TYPES } from './name-types.js';
import { meaningText } from './render-mykanji.js';
import { exampleJa } from './render-word.js';

/** Glosses shown before "+n more meanings". */
const SHOWN = 3;
/** Kanji drawn above the parts picker before "the first n shown". */
export const PARTS_SHOWN = 60;
/** Results this short carry their meanings; longer ones are characters alone, so the picker stays near. */
export const PARTS_MEANT = 24;

/**
 * One card per word: a kana key whose records are different words (さけ is
 * 酒 and 鮭) gives one result per record, each written its own way.
 */
export function byWord(results) {
  return results.flatMap((res) => {
    const kana = ![...res.key].some(isKanji);
    if (res.via === 'name' || !kana || res.recs.length < 2) return [res];
    const spelled = res.recs.map((r) => (Array.isArray(r.k) && r.k.length && !r.u ? r.k[0] : res.key));
    if (new Set(spelled).size < 2) return [res];
    return res.recs.map((r) => Object.freeze({ ...res, recs: [r] }));
  });
}

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
  // A rare word found by its English carries only its first meanings, and how many it left out.
  const left = res.recs.reduce((n, r) => n + (r.more || 0), 0);
  return {
    written, reading, glosses: glosses.slice(0, SHOWN), pos, more: Math.max(0, glosses.length - SHOWN) + left,
  };
}

/** Whether a result is a first-tier word, the only kind data/spell and data/sent file. */
export const firstTier = (res) => res.via !== 'name' && res.via !== 'rare';

/** A result's romaji, both lines (render-romaji.js); a phrase passes the reader's said line. */
export function romajiNodes(reading, saidLine = '') {
  return wordRomaji(reading, { saidLine, extra: 'sr-romaji' });
}

/** How a result was reached, in words: "Dictionary form of 食べた", "English: eat", "Romaji: さけ". */
function viaText(res, q) {
  if (res.via === 'form') return ui('searchViaFormOf', { q: res.romaji || q });
  if (res.via === 'english') return ui('searchViaEnglish', { w: glossWords(q).join(' ') });
  if (res.via === 'rare') return ui('searchViaRare');
  if (res.via === 'name') return ui('searchViaName');
  if (res.romaji) return ui('searchViaRomaji', { kana: res.romaji });
  return '';
}

/** The word's first example sentence, with its English, or nothing. */
function exampleLine(e) {
  if (!e) return null;
  return h('p', { class: 'sr-ex' }, [exampleJa(e), h('span', { class: 'ex-en', lang: 'en' }, e.en)]);
}

/** "Also written 鮨 · 鮓 (rare)", from other-forms.js, or nothing. */
function formsLine(forms) {
  if (!Array.isArray(forms) || !forms.length) return null;
  return h('p', { class: 'sr-forms' }, [
    h('span', { class: 'quiet' }, `${ui('alsoWritten')} `),
    ...forms.slice(0, 4).flatMap((f, i) => [
      i ? ' · ' : null,
      h('span', { lang: 'ja' }, f.written),
      f.tag ? h('span', { class: 'quiet' }, ` (${ui(`spell_${f.tag}`)})`) : null,
    ]).filter(Boolean),
  ]);
}

function kanjiTile(ch, kept, meaning) {
  const ix = kept.kanji.push(ch) - 1;
  return h('button', { type: 'button', class: 'kp-go', 'data-act': 'sr-kanji', 'data-ix': ix }, [
    h('span', { class: 'kp-go-char', lang: 'ja' }, ch),
    meaning ? h('span', { class: 'kp-go-mean', lang: 'en' }, meaning) : null,
    h('span', { class: 'sr-only' }, withKanji('openKanjiPage', ch)),
  ]);
}

function wordItem(res, kept, infos, q, formsOf, examplesOf, setsOf) {
  const w = shownWord(res);
  const ix = kept.words.push(w.written) - 1;
  const chars = [...new Set([...w.written].filter(isKanji))];
  const via = viaText(res, q);
  // A word that is itself an idiom or proverb says which collection holds it.
  const own = firstTier(res) ? (setsOf(w.written) || []).find((r) => r.written === w.written) : null;
  return h('li', { class: 'sr-item' }, [
    h('div', { class: 'sr-head' }, [
      h('span', { class: 'sr-word' }, wordRuby([w.written, w.reading])),
      ...romajiNodes(w.reading),
      w.pos.length ? h('span', { class: 'sr-pos' }, w.pos[0]) : null,
    ]),
    w.glosses.length ? h('p', { class: 'sr-gloss', lang: 'en' }, [
      w.glosses.join('; '),
      w.more ? h('span', { class: 'quiet' }, ` ${ui('searchMore', { n: w.more })}`) : null,
    ]) : null,
    via ? h('p', { class: 'sr-via' }, withJa(via)) : null,
    own ? h('p', { class: 'sr-via sr-set' }, ui(`setOne_${own.set}`)) : null,
    // Other spellings and examples are filed for the first tier: a rare ぶり
    // (amberjack) would show the common ぶり's (振り, "after").
    firstTier(res) ? formsLine((formsOf(w.written, w.reading) || []).filter((f) => f.written !== w.written)) : null,
    firstTier(res) ? exampleLine((examplesOf(w.written, w.reading) || [])[0]) : null,
    h('div', { class: 'sr-actions' }, [
      ...chars.map((ch) => kanjiTile(ch, kept, null)),
      h('button', { type: 'button', class: 'btn btn--primary btn--sm sr-read', 'data-act': 'sr-read', 'data-ix': ix }, [
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
export function resultNodes(found, infos, q = '', formsOf = () => null, examplesOf = () => null, setsOf = () => null) {
  const kept = { words: [], kanji: [] };
  const nodes = [];
  if (found.kanji.length) {
    nodes.push(h('section', { class: 'sr-kanji' }, [
      h('h3', { class: 'word-sub' }, ui('searchKanji')),
      h('div', { class: 'kp-tiles' }, found.kanji.map((ch) => kanjiTile(ch, kept, meaningText(infos.get(ch), 1)))),
    ]));
  }
  const words = byWord(found.words);
  if (words.length) nodes.push(h('ul', { class: 'sr-list', role: 'list' }, words.map((r) => wordItem(r, kept, infos, q, formsOf, examplesOf, setsOf))));
  const n = words.length;
  const status = n ? (n === 1 ? ui('searchOne') : ui('searchMany', { n })) : (found.kanji.length ? '' : ui('searchNone'));
  return { nodes, kept, status };
}

/**
 * The parts pane: the picker, grouped by stroke count, and under it a tray
 * pinned to the bottom of the screen with what is chosen and the kanji it
 * leads to, so a pick never moves the picker away from the finger. A part
 * that leads nowhere with the chosen ones is aria-disabled, not removed, so
 * the grid does not move either.
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
  const tray = h('div', { class: 'sr-tray' }, [
    h('div', { class: 'sr-tray-head' }, [
      h('p', { class: 'sr-tray-status', role: 'status', 'aria-live': 'polite' }, chosen.size
        ? [ui('partsResults', { n: found.kanji.length }), found.kanji.length > shown.length ? `, ${ui('partsShown', { n: shown.length })}` : '']
        : ui('partsNoneChosen')),
      chosen.size ? h('span', { class: 'sr-chosen-list', lang: 'ja' }, [...chosen].join(' ')) : null,
      chosen.size ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'sr-parts-clear' }, ui('partsClear')) : null,
    ]),
    shown.length ? h('div', { class: 'kp-strip sr-part-results' }, shown.map((ch) => {
      const ix = kept.kanji.push(ch) - 1;
      return h('button', { type: 'button', class: 'kp-go', 'data-act': 'sr-part-kanji', 'data-ix': ix }, [
        h('span', { class: 'kp-go-char', lang: 'ja' }, ch),
        meant && meaningText(infos.get(ch), 1) ? h('span', { class: 'kp-go-mean', lang: 'en' }, meaningText(infos.get(ch), 1)) : null,
        h('span', { class: 'sr-only' }, withKanji('openKanjiPage', ch)),
      ]);
    })) : null,
  ]);
  return {
    kept,
    nodes: [
      h('div', { class: 'sr-picker-all' }, order.map((n) => h('section', { class: 'sr-group', 'aria-label': n ? ui('partsStrokes', { n }) : ui('partsOther') }, [
        h('span', { class: 'sr-group-n', 'aria-hidden': 'true' }, n ? String(n) : '…'),
        h('div', { class: 'sr-picker' }, groups.get(n).map(pick)),
      ]))),
      tray,
    ],
  };
}
