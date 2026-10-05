// The kanji table: every kanji in the text, in order of first appearance.
//
// A row and the kanji it describes find each other through data-kid, the
// kanji's position in this list, so hovering one lights the other without a
// character of the text ever being written into an attribute.
//
// "Reading here" comes from the token's furigana, not from the kanji
// dictionary: the dictionary lists every reading a kanji has, the text uses
// one. When a reading covers a run (今日 is read きょう as a whole), the run is
// named beside it, because きょう is not a reading of 今 on its own.
//
// Each row also says how many texts the kanji was met in (My kanji counts it,
// kanji-store.js) and carries a save toggle. The toggle is a sibling of the
// row's button, not inside it: a button inside a button is not a button. A
// kanji this reading session collected for the first time carries a "New"
// chip, which a reload of the same session keeps, since the session is
// stored with the counts.

import { h } from './utils.js';
import { ui } from './strings.js';
import { isKanji } from './kana.js';
import { saveToggle, seenText } from './render-save.js';

/** Kanji characters in order of first appearance. */
export function kanjiOrder(tokens) {
  const seen = [];
  for (const token of tokens) {
    const list = Array.isArray(token.kanji) && token.kanji.length
      ? token.kanji
      : [...(token.surface || '')].filter(isKanji);
    for (const ch of list) if (!seen.includes(ch)) seen.push(ch);
  }
  return seen;
}

/** ch -> the readings this text gives it, as { ruby, run } pairs, in order. */
export function readingsHere(tokens) {
  const out = new Map();
  const add = (ch, ruby, run) => {
    const list = out.get(ch) || [];
    if (!list.some((x) => x.ruby === ruby && x.run === run)) list.push({ ruby, run });
    out.set(ch, list);
  };
  for (const token of tokens) {
    for (const p of token.furigana || []) {
      if (!p || !p.ruby) continue;
      const chars = [...p.text].filter(isKanji);
      if (!chars.length) continue;
      const run = chars.length > 1 ? p.text : null;
      for (const ch of chars) add(ch, p.ruby, run);
    }
  }
  return out;
}

function list(label, items, lang) {
  if (!items || !items.length) return null;
  // Each reading is kept on one line: くだ.す broke as く / だ.す.
  const parts = items.flatMap((x, i) => [i ? '、' : null, h('span', { class: 'kj-item' }, String(x))]).filter(Boolean);
  return h('span', { class: 'kj-read' }, [
    h('span', { class: 'kj-key' }, label),
    ' ',
    h('span', { lang }, parts),
  ]);
}

/** One row. The row's button lights the kanji in the text; the bookmark beside it saves it. */
function row(ch, kid, info, here, pinned, mine) {
  const readings = (here || []).map((x) => (x.run ? `${x.ruby} (${x.run})` : x.ruby));
  const meaning = info && Array.isArray(info.m) && info.m.length ? info.m.join(', ') : '';
  const strokes = info && Number.isInteger(info.s) ? ui('strokes', { n: info.s }) : '';
  const parts = info && Array.isArray(info.parts) ? info.parts.filter((p) => p && p !== ch) : [];
  const seen = seenText(mine.seenOf(ch) && mine.seenOf(ch).n);
  return h('li', { class: 'kj-entry' }, [h('button', {
    type: 'button',
    class: 'kj-row',
    'data-act': 'kanji',
    'data-kid': kid,
    'aria-pressed': pinned ? 'true' : 'false',
  }, [
    h('span', { class: 'kj-char', lang: 'ja' }, ch),
    h('span', { class: 'kj-main' }, [
      h('span', { class: 'kj-line' }, [
        readings.length
          ? h('span', { class: 'kj-here' }, [h('span', { lang: 'ja' }, readings.join('、')), ' ', h('span', { class: 'kj-key' }, ui('here'))])
          : null,
        h('span', { class: 'kj-mean', lang: 'en' }, meaning || (info ? '' : ui('kanjiMissing'))),
      ]),
      info ? h('span', { class: 'kj-line kj-line--quiet' }, [
        list(ui('onReading'), info.on, 'ja'),
        list(ui('kunReading'), info.kun, 'ja'),
      ]) : null,
      info && (parts.length || strokes) ? h('span', { class: 'kj-line kj-line--quiet' }, [
        parts.length ? list(ui('parts'), parts, 'ja') : null,
        strokes ? h('span', { class: 'kj-read' }, strokes) : null,
      ]) : null,
      seen ? h('span', { class: 'kj-line kj-line--quiet' }, [
        h('span', { class: 'kj-seen' }, seen),
        typeof mine.isNew === 'function' && mine.isNew(ch) ? h('span', { class: 'kj-new' }, ui('newChip')) : null,
      ]) : null,
    ]),
  ]), saveToggle(ch, mine.isSaved(ch), { 'data-act': 'save-kanji', 'data-kid': kid })]);
}

/**
 * @param {object} a       the normalized analysis
 * @param {string[]} order kanjiOrder(a.tokens)
 * @param {number|null} pinned  data-kid of a pinned row
 * @param {{ isSaved: Function, seenOf: Function, isNew?: Function }} mine  the My kanji store
 */
export function kanjiNode(a, order, pinned, mine) {
  if (!order.length) return h('p', { class: 'side-empty' }, ui('kanjiEmpty'));
  const here = readingsHere(a.tokens);
  const info = a.info || new Map();
  return [
    h('p', { class: 'side-hint' }, ui('kanjiHint')),
    h('ul', { class: 'kj-list', role: 'list' }, order.map((ch, kid) => row(ch, kid, info.get(ch), here.get(ch), pinned === kid, mine))),
  ];
}

