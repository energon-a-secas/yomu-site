// The Collection (#/kanji/collection): every kanji the learner has read,
// shelved by the jōyō list's grades, and a dialog for any one of them.
//
// The counts are My kanji's (kanji-store.js `seen`); collection.js reads them
// against the list, so nothing here is stored. One summary, the next few
// kanji to look out for, a filter, and one <details> per grade, with Extra
// last for the kanji the list does not name. A shelf of 1,110 tiles is drawn
// only while it is open: the first shelf not complete is open to begin with,
// and the others draw on their toggle event (events-collect.js).
//
// Tiles find their kanji by data-shelf (a grade, "extra" or "next") and
// data-ix, the place in that shelf's characters as last drawn (collect.drawn),
// so no character is written into an attribute. A tile's name is built from
// text nodes, "雨, seen in 3 texts", the kanji in a lang="ja" span. A kanji
// not collected yet is drawn muted and dashed, and still readable: it is the
// one a learner is looking for.

import { $, h, fill } from './utils.js';
import { ui } from './strings.js';
import { myKanji } from './kanji-store.js';
import { progress, nextToCollect } from './collection.js';
import { view, readingsLine, meaningText, wordsLine } from './render-mykanji.js';
import { saveToggle, dayText, today, withKanji } from './render-save.js';
import { gradeName, count, lastSeenLine } from './render-remember.js';

export const FILTERS = Object.freeze(['all', 'have', 'not']);
const FILTER_LABEL = { all: 'filterAll', have: 'filterHave', not: 'filterNot' };

/** The screen's own state: what it drew, what is open, what it knows. */
export const collect = {
  filter: 'all',
  open: null,                 // Set of open shelf ids, chosen on the first paint
  drawn: new Map(),           // shelf id -> its characters as drawn (data-ix)
  joyo: null,                 // collection.js parseJoyo() result
  joyoState: 'idle',          // idle | loading | ready | error
  joyoError: '',
  dialog: null,               // the kanji the dialog shows
};

const isHave = (seen, ch) => !!seen[ch] && seen[ch].n >= 1;

function tile(ch, shelf, ix, seen) {
  const n = isHave(seen, ch) ? seen[ch].n : 0;
  const name = n
    ? withKanji(n === 1 ? 'tileSeenOne' : 'tileSeen', ch, { n })
    : withKanji('tileNot', ch);
  return h('button', {
    type: 'button', class: n ? 'col-tile' : 'col-tile is-missing', 'data-act': 'col-tile', 'data-shelf': shelf, 'data-ix': ix, 'aria-haspopup': 'dialog',
  }, [
    h('span', { class: 'col-face', 'aria-hidden': 'true' }, [
      h('span', { class: 'col-ch', lang: 'ja' }, ch),
      n ? h('span', { class: 'col-n' }, count(n)) : null,
    ]),
    h('span', { class: 'sr-only' }, name),
  ]);
}

/** A shelf's characters under the filter. */
function filtered(chars, seen) {
  if (collect.filter === 'have') return chars.filter((ch) => isHave(seen, ch));
  if (collect.filter === 'not') return chars.filter((ch) => !isHave(seen, ch));
  return chars;
}

/** The tiles of one shelf, as nodes; records what was drawn for data-ix. */
export function shelfTiles(id, chars, seen = myKanji().data.seen) {
  const shown = filtered(chars, seen);
  collect.drawn.set(id, shown);
  if (!shown.length) return h('p', { class: 'mk-empty' }, ui('shelfNone'));
  return h('ul', { class: 'col-tiles', role: 'list' }, shown.map((ch, ix) => h('li', null, tile(ch, id, ix, seen))));
}

/** A shelf's characters by its id, from the list and the counts. */
export function shelfChars(id, seen = myKanji().data.seen) {
  if (!collect.joyo) return [];
  if (id === 'extra') return progress(collect.joyo, seen).extra;
  const g = collect.joyo.grades.find((x) => String(x.grade) === id);
  return g ? g.chars : [];
}

function shelf(id, label, have, total, seen, lead) {
  const open = collect.open.has(id);
  const complete = total > 0 && have === total;
  return h('details', { class: 'col-shelf', 'data-shelf': id, open }, [
    h('summary', { class: 'col-sum' }, [
      h('span', { class: 'col-shelf-name' }, label),
      h('span', { class: 'col-shelf-count' }, total ? ui('shelfOf', { have: count(have), total: count(total) }) : count(have)),
      total ? h('progress', { class: 'col-bar', max: total, value: have, 'aria-hidden': 'true' }) : null,
      complete ? h('span', { class: 'col-badge' }, ui('shelfComplete')) : null,
    ]),
    h('div', { class: 'col-shelf-body' }, [
      lead ? h('p', { class: 'quiet' }, lead) : null,
      open ? shelfTiles(id, shelfChars(id, seen), seen) : null,
    ]),
  ]);
}

function summarySection(p) {
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'col-head' }, [
    h('h3', { class: 'mk-sec-title', id: 'col-head', tabindex: '-1' }, ui('collectionHead')),
    h('p', { class: 'quiet' }, ui('collectionLead')),
    h('p', { class: 'col-total', id: 'col-total' }, ui('collectionSum', { have: count(p.have), total: count(p.total) })),
    h('progress', { class: 'col-bar col-bar--big', max: p.total, value: p.have, 'aria-labelledby': 'col-total' }),
    p.extra.length ? h('p', { class: 'mk-meta' }, ui('collectionExtra', { n: count(p.extra.length) })) : null,
  ]);
}

function nextSection(p, seen) {
  const next = nextToCollect(collect.joyo, seen, 6);
  collect.drawn.set('next', next);
  const lowest = p.byGrade.find((g) => !g.complete);
  const body = next.length
    ? [
      h('p', { class: 'quiet' }, ui('lookOutLead', { grade: gradeName(lowest.grade) })),
      h('ul', { class: 'col-next', role: 'list' }, next.map((ch, ix) => h('li', { class: 'col-next-item' }, [
        tile(ch, 'next', ix, seen),
        meaningText(view.info.get(ch), 2) ? h('span', { class: 'col-next-mean', lang: 'en' }, meaningText(view.info.get(ch), 2)) : null,
      ]))),
    ]
    : h('p', { class: 'mk-line' }, ui('allCollected'));
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'col-next-h' }, [
    h('h3', { class: 'mk-sec-title', id: 'col-next-h', tabindex: '-1' }, ui('lookOutHead')),
    body,
  ]);
}

function shelvesSection(p, seen) {
  if (!collect.open) {
    const first = p.byGrade.find((g) => !g.complete);
    collect.open = new Set(first ? [String(first.grade)] : []);
  }
  const shelves = p.byGrade.map((g) => shelf(String(g.grade), gradeName(g.grade), g.have, g.total, seen));
  if (p.extra.length) shelves.push(shelf('extra', ui('shelfExtra'), p.extra.length, 0, seen, ui('shelfExtraLead')));
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'col-shelves-h' }, [
    h('h3', { class: 'mk-sec-title', id: 'col-shelves-h', tabindex: '-1' }, ui('shelvesHead')),
    h('div', { class: 'mk-controls' }, h('div', { class: 'seg', role: 'group', 'aria-labelledby': 'col-filter-label' }, [
      h('span', { class: 'seg-label', id: 'col-filter-label' }, ui('show')),
      ...FILTERS.map((f) => h('button', {
        type: 'button', class: 'seg-btn', id: `col-f-${f}`, 'data-act': 'col-filter', 'data-filter': f, 'aria-pressed': String(collect.filter === f),
      }, ui(FILTER_LABEL[f]))),
    ])),
    h('div', { class: 'col-shelves' }, shelves),
  ]);
}

/** The screen's nodes: the list loading or failed, or the three sections. */
export function collectionNodes(mine = myKanji()) {
  if (!collect.joyo) {
    if (collect.joyoState === 'error') {
      return [h('p', { class: 'read-error', role: 'alert' }, [
        h('span', null, ui('joyoFailed', { detail: collect.joyoError })), ' ',
        h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'col-retry' }, ui('retry')),
      ])];
    }
    return [h('p', { class: 'mk-empty' }, ui('joyoLoading'))];
  }
  const seen = mine.data.seen;
  const p = progress(collect.joyo, seen);
  collect.drawn.clear();
  return [summarySection(p), nextSection(p, seen), shelvesSection(p, seen)];
}

/** Draw the Collection into #mk-body. */
export function paintCollection(mine = myKanji()) {
  const body = $('mk-body');
  if (body) fill(body, collectionNodes(mine));
}

/** The kanji a tile names, or null. */
export function tileChar(b) {
  const list = collect.drawn.get(b.dataset.shelf) || [];
  const ix = Number(b.dataset.ix);
  return Number.isInteger(ix) ? list[ix] || null : null;
}

// ── The dialog ────────────────────────────────────────────────────────────

function facts(ch, info) {
  const grade = collect.joyo && collect.joyo.gradeOf.get(ch);
  const out = [];
  if (grade) out.push(gradeName(grade));
  if (info && Number.isInteger(info.s)) out.push(ui('strokes', { n: info.s }));
  if (info && Number.isInteger(info.j)) out.push(ui('jlptOld', { n: info.j }));
  return out.length ? h('p', { class: 'mk-meta' }, out.join(' · ')) : null;
}

function seenSpan(seen, now) {
  if (seen.n === 1) return ui('seenSpanOne', { day: dayText(seen.last, now) });
  return ui('seenSpanMany', { n: count(seen.n), first: dayText(seen.first, now), last: dayText(seen.last, now) });
}

/** The dialog's title and body for one kanji, collected or not. */
export function paintKanjiDialog(ch, mine = myKanji()) {
  const title = $('col-dialog-title');
  const body = $('col-dialog-body');
  if (!title || !body) return;
  const now = today();
  const info = view.info.get(ch);
  const seen = mine.seenOf(ch);
  const saved = mine.isSaved(ch);
  fill(title, h('span', { class: 'cd-char', lang: 'ja' }, ch));
  const meaning = meaningText(info, 5);
  fill(body, [
    meaning ? h('p', { class: 'cd-mean', lang: 'en' }, meaning) : null,
    !info ? h('p', { class: 'quiet' }, ui(view.info.has(ch) ? 'noInfo' : 'loadingKanji')) : null,
    readingsLine(info),
    facts(ch, info),
    seen ? h('div', { class: 'cd-seen' }, [
      h('p', { class: 'mk-line' }, seenSpan(seen, now)),
      lastSeenLine(ch, seen, now),
      wordsLine(seen.words),
    ]) : h('p', { class: 'mk-line cd-seen' }, ui('notCollected')),
    seen ? h('p', { class: 'cd-save' }, [
      saveToggle(ch, saved, { 'data-act': 'col-save' }),
      h('span', { 'aria-hidden': 'true' }, ui(saved ? 'dialogSaved' : 'dialogNotSaved')),
    ]) : null,
  ]);
}
