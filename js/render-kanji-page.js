// The kanji page: one kanji, taken apart. How it is drawn, stroke by stroke
// (KanjiVG's paths, data/strokes/), what it means and how it is read
// (KANJIDIC, data/kanji/), the parts it is made of and the kanji that share
// each part or are built on it (data/kpage/), the common words written with
// it, and the same save toggle as everywhere else.
//
// Every kanji the page offers to go to is a button found by `data-ix`, its
// place in the list this paint drew (`drawn`): no character is written into
// an attribute. The stroke drawing names itself in a <title>, a text node,
// for the same reason.

import { h } from './utils.js';
import { ui } from './strings.js';
import {
  saveToggle, seenText, wordRuby, withKanji,
} from './render-save.js';
import { readingsLine, meaningText } from './render-mykanji.js';
import { gradeName } from './render-remember.js';
import {
  isKana, isHiragana, toHira, toKata, beatRomaji,
} from './kana.js';

const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, kids = []) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  for (const kid of kids) el.append(kid);
  return el;
}

/** The first point of a path's data: where its stroke number goes. */
function startOf(d) {
  const m = /^[Mm]\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/.exec(d);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

/**
 * The drawing: a practice grid, the strokes in order (each with
 * pathLength 1, so CSS draws any of them with one dash), and their numbers
 * at their first points. `step` is how many are drawn; all of them by default.
 */
export function strokeSvg(ch, paths, title) {
  const n = paths.length;
  const grid = svg('g', { class: 'kp-grid', 'aria-hidden': 'true' }, [
    svg('line', { x1: 54.5, y1: 0, x2: 54.5, y2: 109 }),
    svg('line', { x1: 0, y1: 54.5, x2: 109, y2: 54.5 }),
  ]);
  const ghost = svg('g', { class: 'kp-ghost', 'aria-hidden': 'true' }, paths.map((d) => svg('path', { d })));
  const ink = svg('g', { class: 'kp-ink', 'aria-hidden': 'true' }, paths.map((d, i) => svg('path', {
    d, pathLength: 1, 'data-stroke': i,
  })));
  const nums = svg('g', { class: 'kp-nums', 'aria-hidden': 'true' }, paths.map((d, i) => {
    const [x, y] = startOf(d);
    const t = svg('text', { x: Math.max(4, x - 4), y: Math.max(8, y - 2), 'data-stroke': i });
    t.textContent = String(i + 1);
    return t;
  }));
  const label = svg('title');
  label.textContent = title;
  return svg('svg', {
    class: 'kp-svg', viewBox: '0 0 109 109', role: 'img', 'data-strokes': n,
  }, [label, grid, ghost, ink, nums]);
}

/**
 * The button that opens a kanji's page, beside its save toggle wherever a
 * kanji is listed. Its name is a visually hidden label in text nodes, like
 * the toggle's: no kanji in an attribute.
 */
export function pageOpener(ch, attrs) {
  return h('button', { type: 'button', class: 'page-open', ...attrs }, [
    svg('svg', {
      class: 'page-open-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
    }, [svg('path', { d: 'M5 4.5h9l5 5V19.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Zm3 6h8m-8 4h8m-8 4h5' })]),
    h('span', { class: 'sr-only' }, withKanji('openKanjiPage', ch)),
  ]);
}

/** "How 食 is drawn: 9 strokes". */
export function strokesTitle(ch, n) {
  return n === 1 ? ui('kpStrokesOne', { ch }) : ui('kpStrokesTitle', { ch, n });
}

/** The drawing and its three controls, or one line when KanjiVG has no file. */
export function strokesPart(ch, paths) {
  if (!paths || !paths.length) return h('p', { class: 'quiet kp-nostrokes' }, ui('kpNoStrokes'));
  const drawing = h('div', { class: 'kp-draw', id: 'kp-draw', 'data-step': paths.length });
  drawing.append(strokeSvg(ch, paths, strokesTitle(ch, paths.length)));
  return h('div', { class: 'kp-strokes' }, [
    drawing,
    h('div', { class: 'kp-controls' }, [
      h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'kp-draw' }, ui('kpDraw')),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'kp-next' }, ui('kpNext')),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'kp-all' }, ui('kpAll')),
    ]),
    h('p', { class: 'kp-step quiet', id: 'kp-step', role: 'status', 'aria-live': 'polite' }),
  ]);
}

/** One kanji to go to: a 44px tile, found by its place in `drawn`. */
function goTile(ch, drawn, meaning) {
  const ix = drawn.push(ch) - 1;
  return h('button', { type: 'button', class: 'kp-go', 'data-act': 'kp-go', 'data-ix': ix }, [
    h('span', { class: 'kp-go-char', lang: 'ja' }, ch),
    meaning ? h('span', { class: 'kp-go-mean', lang: 'en' }, meaning) : null,
    h('span', { class: 'sr-only' }, withKanji('openKanjiPage', ch)),
  ]);
}

/** KANJIDIC's grades the page names: the jōyō school years and secondary school. */
const GRADES = new Set([1, 2, 3, 4, 5, 6, 8]);

function facts(info) {
  if (!info) return null;
  const out = [];
  if (GRADES.has(info.g)) out.push(gradeName(info.g));
  if (Number.isInteger(info.s)) out.push(ui('strokes', { n: info.s }));
  if (Number.isInteger(info.j)) out.push(ui('jlptOld', { n: info.j }));
  if (Number.isInteger(info.f)) out.push(ui('kpFreq', { n: info.f }));
  return out.length ? h('p', { class: 'mk-meta' }, out.join(' · ')) : null;
}

/**
 * A kana's page: how it is drawn, how it is spelled in romaji, the same
 * sound in the other script, and common words that start with it.
 */
function kanaPage(ch, paths, page, nodes, drawn) {
  const hira = isHiragana(ch);
  const other = hira ? toKata(ch) : toHira(ch);
  nodes.push(h('div', { class: 'kp-top' }, [
    strokesPart(ch, paths),
    h('div', { class: 'kp-facts' }, [
      h('p', { class: 'cd-mean' }, [h('span', { class: 'kp-romaji', lang: 'ja-Latn' }, beatRomaji(ch) || '')]),
      h('p', { class: 'mk-meta' }, ui(hira ? 'kpHiragana' : 'kpKatakana')),
      other && other !== ch ? h('div', { class: 'kp-also' }, [
        h('p', { class: 'kp-sub' }, ui(hira ? 'kpInKatakana' : 'kpInHiragana')),
        h('div', { class: 'kp-tiles' }, goTile(other, drawn, null)),
      ]) : null,
    ]),
  ]));
  const words = page ? page.words : [];
  nodes.push(h('section', { class: 'kp-sec' }, [
    h('h3', { class: 'word-sub' }, ui('kpStartsWith')),
    words.length
      ? h('ul', { class: 'kp-words', role: 'list' }, words.map((w) => h('li', { class: 'kp-word' }, [
        wordRuby([w.written, w.reading]),
        h('span', { class: 'kp-gloss', lang: 'en' }, w.gloss),
      ])))
      : h('p', { class: 'quiet' }, ui('kpWordsNone')),
  ]));
  nodes.push(h('p', { class: 'quiet kp-source' }, ui('kpSource')));
  return { nodes, drawn };
}

/**
 * The page's body.
 *
 * @param {object} p
 * @param {string} p.ch
 * @param {object|null} p.info      kanjiInfo() of the kanji
 * @param {Map} p.infos             kanjiInfo() of its parts and neighbours
 * @param {string[]|null} p.paths   stroke paths, null when KanjiVG has none
 * @param {{ words, parts, used }|null} p.page  null while it loads
 * @param {string|null} p.back      the kanji Back returns to
 * @param {{ saved: boolean, n: number }} p.mine
 * @param {string} [p.state]        'loading' | 'failed' | 'ready'
 * @returns {{ nodes: Node[], drawn: string[] }}
 */
export function kanjiPageNodes({
  ch, info, infos, paths, page, back, mine, state = 'ready',
}) {
  const drawn = [];
  const meanOf = (c) => meaningText(infos.get(c), 1);
  const nodes = [];
  if (back) {
    nodes.push(h('button', { type: 'button', class: 'text-link kp-back', 'data-act': 'kp-back' }, [
      h('span', { 'aria-hidden': 'true' }, '← '), ...withKanji('kpBack', back),
    ]));
  }
  if (state === 'loading') return { nodes: [...nodes, h('p', { class: 'quiet', role: 'status' }, ui('kpLoading'))], drawn };
  if (state === 'failed') {
    return {
      nodes: [...nodes, h('p', { class: 'word-warn', role: 'alert' }, ui('kpFailed')),
        h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'kp-retry' }, ui('retry'))],
      drawn,
    };
  }
  if (isKana(ch)) return kanaPage(ch, paths, page, nodes, drawn);
  const meaning = meaningText(info, 5);
  nodes.push(h('div', { class: 'kp-top' }, [
    strokesPart(ch, paths),
    h('div', { class: 'kp-facts' }, [
      meaning ? h('p', { class: 'cd-mean', lang: 'en' }, meaning) : null,
      readingsLine(info),
      facts(info),
      paths && info && Number.isInteger(info.s) && info.s !== paths.length
        ? h('p', { class: 'quiet kp-differs' }, ui('kpCountDiffers', { n: paths.length, s: info.s }))
        : null,
      h('p', { class: 'kp-save' }, [
        saveToggle(ch, mine.saved, { 'data-act': 'kp-save' }),
        h('span', { 'aria-hidden': 'true' }, ui(mine.saved ? 'dialogSaved' : 'dialogNotSaved')),
      ]),
      mine.n ? h('p', { class: 'mk-line' }, seenText(mine.n, true)) : null,
    ]),
  ]));

  // KanjiVG names some parts by a code (CDP-8BC4) or a layout (⿱日隹): only characters are shown.
  const parts = info && Array.isArray(info.parts) ? info.parts.filter((x) => x && x !== ch && [...x].length === 1) : [];
  const partRows = parts.map((part) => {
    const also = (page && page.parts[part]) || [];
    return h('li', { class: 'kp-part' }, [
      infos.has(part)
        ? goTile(part, drawn, meanOf(part))
        : h('span', { class: 'kp-go kp-go--plain' }, h('span', { class: 'kp-go-char', lang: 'ja' }, part)),
      also.length ? h('div', { class: 'kp-also' }, [
        h('p', { class: 'kp-sub' }, withKanji('kpAlsoWith', part)),
        h('div', { class: 'kp-tiles' }, also.map((c) => goTile(c, drawn, null))),
      ]) : null,
    ]);
  });
  nodes.push(h('section', { class: 'kp-sec' }, [
    h('h3', { class: 'word-sub' }, ui('kpParts')),
    partRows.length ? h('ul', { class: 'kp-parts', role: 'list' }, partRows) : h('p', { class: 'quiet' }, ui('kpPartsNone')),
  ]));

  if (page && page.used.length) {
    nodes.push(h('section', { class: 'kp-sec' }, [
      h('h3', { class: 'word-sub' }, ui('kpUsedIn')),
      h('div', { class: 'kp-tiles' }, page.used.map((c) => goTile(c, drawn, null))),
    ]));
  }

  const words = page ? page.words : [];
  nodes.push(h('section', { class: 'kp-sec' }, [
    h('h3', { class: 'word-sub' }, ui('kpWords')),
    words.length
      ? h('ul', { class: 'kp-words', role: 'list' }, words.map((w) => h('li', { class: 'kp-word' }, [
        wordRuby([w.written, w.reading]),
        h('span', { class: 'kp-gloss', lang: 'en' }, w.gloss),
      ])))
      : h('p', { class: 'quiet' }, ui('kpWordsNone')),
  ]));
  nodes.push(h('p', { class: 'quiet kp-source' }, ui('kpSource')));
  return { nodes, drawn };
}
