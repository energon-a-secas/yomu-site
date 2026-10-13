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
import { seenText, wordRuby, withKanji } from './render-save.js';
import { meaningText } from './render-mykanji.js';
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

/** The bookmark the save toggle draws, at the size of a labelled button. */
function bookmarkIcon() {
  return svg('svg', {
    class: 'kp-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
  }, [svg('path', { d: 'M7 3.5h10a1 1 0 0 1 1 1V20.5l-6-4.2-6 4.2V4.5a1 1 0 0 1 1-1Z' })]);
}

function speakerIcon() {
  return svg('svg', {
    class: 'kp-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
  }, [svg('path', { d: 'M11 5 6 9H3v6h3l5 4V5z' }), svg('path', { d: 'M15.5 8.5a5 5 0 0 1 0 7' })]);
}

function chevron(dir) {
  return svg('svg', {
    class: 'kp-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
  }, [svg('path', { d: dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7' })]);
}

/**
 * The page's two actions: the save toggle, labelled (a kana has none), and
 * Say, which reads the kanji's first reading or the kana itself.
 */
function actionsPart(ch, mine, { save = true } = {}) {
  return h('div', { class: 'kp-actions' }, [
    save ? h('button', {
      type: 'button', class: 'kp-save-btn', 'data-act': 'kp-save', 'aria-pressed': mine.saved ? 'true' : 'false',
    }, [
      bookmarkIcon(),
      h('span', { 'aria-hidden': 'true' }, ui(mine.saved ? 'kpSaved' : 'kpSave')),
      h('span', { class: 'sr-only' }, withKanji('saveKanji', ch)),
    ]) : null,
    h('button', { type: 'button', class: 'btn btn--secondary kp-say', 'data-act': 'kp-say', 'data-speak': '' }, [
      speakerIcon(), h('span', null, ui('kpSay')),
    ]),
  ]);
}

/**
 * The stroke player: the drawing, a tick per stroke, and back, Draw and
 * next. events-kanji-page.js moves the step and writes the status line.
 */
export function strokesPart(ch, paths) {
  if (!paths || !paths.length) return h('p', { class: 'quiet kp-nostrokes' }, ui('kpNoStrokes'));
  const drawing = h('div', { class: 'kp-draw', id: 'kp-draw', 'data-step': paths.length });
  drawing.append(strokeSvg(ch, paths, strokesTitle(ch, paths.length)));
  return h('section', { class: 'kp-card kp-strokes', 'aria-labelledby': 'kp-strokes-title' }, [
    h('div', { class: 'kp-card-head' }, [
      h('h3', { class: 'word-sub', id: 'kp-strokes-title' }, ui('kpStrokeOrder')),
      h('p', { class: 'kp-step', id: 'kp-step', role: 'status', 'aria-live': 'polite' }),
    ]),
    drawing,
    h('div', { class: 'kp-ticks', 'aria-hidden': 'true' }, paths.map((d, i) => h('span', { class: 'kp-tick', 'data-stroke': i }))),
    h('div', { class: 'kp-controls' }, [
      h('button', { type: 'button', class: 'btn btn--secondary kp-nav', 'data-act': 'kp-prev' }, [chevron('left'), h('span', { class: 'sr-only' }, ui('kpPrev'))]),
      h('button', { type: 'button', class: 'btn btn--primary kp-play', id: 'kp-play', 'data-act': 'kp-draw' }, ui('kpDraw')),
      h('button', { type: 'button', class: 'btn btn--secondary kp-nav', 'data-act': 'kp-next' }, [chevron('right'), h('span', { class: 'sr-only' }, ui('kpNext'))]),
    ]),
  ]);
}

/** A row of kanji to go to, scrolling sideways on a phone. */
function strip(chars, drawn) {
  return h('div', { class: 'kp-strip' }, chars.map((c) => goTile(c, drawn, null)));
}

/** The common words, each with Read it, found by `data-ix` in `words`. */
function wordsPart(titleKey, words, wordsKept) {
  return h('section', { class: 'kp-sec' }, [
    h('h3', { class: 'word-sub' }, ui(titleKey)),
    words.length
      ? h('ul', { class: 'kp-words', role: 'list' }, words.map((w) => {
        const ix = wordsKept.push(w.written) - 1;
        return h('li', { class: 'kp-word' }, [
          h('span', { class: 'kp-word-text' }, [
            wordRuby([w.written, w.reading]),
            h('span', { class: 'kp-gloss', lang: 'en' }, w.gloss),
          ]),
          h('button', { type: 'button', class: 'btn btn--ghost btn--sm kp-read', 'data-act': 'kp-read', 'data-ix': ix }, [
            h('span', { 'aria-hidden': 'true' }, ui('searchRead')),
            h('span', { class: 'sr-only' }, ui('searchReadLabel', { w: w.written })),
          ]),
        ]);
      }))
      : h('p', { class: 'quiet' }, ui('kpWordsNone')),
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

/** The top of a page: the character large, and beside it what it means and how it is read. */
function hero(ch, lines) {
  return h('div', { class: 'kp-hero' }, [
    h('span', { class: 'kp-big', lang: 'ja', 'aria-hidden': 'true' }, ch),
    h('div', { class: 'kp-hero-text' }, lines),
  ]);
}

function chip(label, items) {
  if (!Array.isArray(items) || !items.length) return null;
  return h('span', { class: 'kp-chip' }, [label, ' ', h('span', { lang: 'ja' }, items.join(' · '))]);
}

/**
 * A kana's page: how it is drawn, how it is spelled in romaji, the same
 * sound in the other script, and common words that start with it.
 */
function kanaPage(ch, paths, page, nodes, drawn, wordsKept, mine) {
  const hira = isHiragana(ch);
  const other = hira ? toKata(ch) : toHira(ch);
  nodes.push(hero(ch, [
    h('p', { class: 'kp-mean', lang: 'ja-Latn' }, beatRomaji(ch) || ''),
    h('p', { class: 'mk-meta' }, ui(hira ? 'kpHiragana' : 'kpKatakana')),
  ]));
  nodes.push(actionsPart(ch, mine, { save: false }));
  nodes.push(strokesPart(ch, paths));
  if (other && other !== ch) {
    nodes.push(h('section', { class: 'kp-sec' }, [
      h('h3', { class: 'word-sub' }, ui(hira ? 'kpInKatakana' : 'kpInHiragana')),
      strip([other], drawn),
    ]));
  }
  nodes.push(wordsPart('kpStartsWith', page ? page.words : [], wordsKept));
  nodes.push(h('p', { class: 'quiet kp-source' }, ui('kpSource')));
  return { nodes, drawn, words: wordsKept };
}

/**
 * The page's body.
 *
 * @param {object} p
 * @param {string} p.ch
 * @param {object|null} p.info      kanjiInfo() of the kanji
 * @param {Map} p.infos             kanjiInfo() of its parts and neighbours
 * @param {string[]|null} p.paths   stroke paths, null when KanjiVG has none
 * @param {{ words, parts, used, variants }|null} p.page  null while it loads
 * @param {string|null} p.back      the kanji Back returns to
 * @param {{ saved: boolean, n: number }} p.mine
 * @param {string} [p.state]        'loading' | 'failed' | 'ready'
 * @returns {{ nodes: Node[], drawn: string[], words: string[] }}
 *   `drawn` the kanji its go buttons name, `words` the words Read it sends.
 */
export function kanjiPageNodes({
  ch, info, infos, paths, page, back, mine, state = 'ready',
}) {
  const drawn = [];
  const wordsKept = [];
  const meanOf = (c) => meaningText(infos.get(c), 1);
  const nodes = [];
  if (back) {
    nodes.push(h('button', { type: 'button', class: 'text-link kp-back', 'data-act': 'kp-back' }, [
      h('span', { 'aria-hidden': 'true' }, '← '), ...withKanji('kpBack', back),
    ]));
  }
  if (state === 'loading') return { nodes: [...nodes, h('p', { class: 'quiet', role: 'status' }, ui('kpLoading'))], drawn, words: wordsKept };
  if (state === 'failed') {
    return {
      nodes: [...nodes, h('p', { class: 'word-warn', role: 'alert' }, ui('kpFailed')),
        h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'kp-retry' }, ui('retry'))],
      drawn,
      words: wordsKept,
    };
  }
  if (isKana(ch)) return kanaPage(ch, paths, page, nodes, drawn, wordsKept, mine);
  const meaning = meaningText(info, 5);
  nodes.push(hero(ch, [
    meaning ? h('p', { class: 'kp-mean', lang: 'en' }, meaning) : h('p', { class: 'quiet' }, ui('kanjiMissing')),
    info ? h('p', { class: 'kp-chips' }, [chip(ui('onReading'), info.on), chip(ui('kunReading'), info.kun)]) : null,
    facts(info),
    mine.n ? h('p', { class: 'mk-meta' }, seenText(mine.n, true)) : null,
  ]));
  nodes.push(actionsPart(ch, mine));
  nodes.push(strokesPart(ch, paths));
  if (paths && info && Number.isInteger(info.s) && info.s !== paths.length) {
    nodes.push(h('p', { class: 'quiet kp-differs' }, ui('kpCountDiffers', { n: paths.length, s: info.s })));
  }

  const variants = page ? page.variants : [];
  if (variants.length) {
    nodes.push(h('section', { class: 'kp-sec' }, [
      h('h3', { class: 'word-sub' }, ui('otherForms')),
      h('div', { class: 'kp-strip' }, variants.map((c) => (infos.has(c) ? goTile(c, drawn, null) : h('span', { class: 'kp-go kp-go--plain' }, h('span', { class: 'kp-go-char', lang: 'ja' }, c))))),
      h('p', { class: 'quiet kp-note' }, ui('otherFormsNote')),
    ]));
  }

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
        strip(also, drawn),
      ]) : h('p', { class: 'kp-sub' }, ui('kpOnlyHere')),
    ]);
  });
  nodes.push(h('section', { class: 'kp-sec' }, [
    h('h3', { class: 'word-sub' }, ui('kpParts')),
    partRows.length ? h('ul', { class: 'kp-parts', role: 'list' }, partRows) : h('p', { class: 'quiet' }, ui('kpPartsNone')),
  ]));

  if (page && page.used.length) {
    nodes.push(h('section', { class: 'kp-sec' }, [
      h('h3', { class: 'word-sub' }, ui('kpUsedIn')),
      strip(page.used, drawn),
    ]));
  }

  nodes.push(wordsPart('kpWords', page ? page.words : [], wordsKept));
  nodes.push(h('p', { class: 'quiet kp-source' }, ui('kpSource')));
  return { nodes, drawn, words: wordsKept };
}
