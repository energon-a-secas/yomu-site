// My kanji: the route, its actions, the review's keys, and the backup.
//
// #/kanji is a place, not a text. The page has five routes, the reader (no
// hash), the list (#/kanji), a review (#/kanji/review), the collection
// (#/kanji/collection) and History (#/kanji/history); takeFragmentText in
// state.js reads only #t=, so a route is never read as Japanese. The list,
// the collection and History are the three places the screen's nav moves
// between, and the parent of each but the list is the list. The
// reader is hidden while another route shows, never emptied, so Back finds
// the text, its reading and the chosen word as they were, scrolled to where
// they were. Back is history.back() when the history entry before this one
// is the parent route, so the browser's own Back agrees with ours; otherwise
// (a page opened at #/kanji, or #/kanji reached from inside a review) it is a
// replaceState to the parent, which never leaves the site and never steps
// back into a review. Each entry this page visits is stamped with its place
// in the history (state.yomuIx), which is how the entry before it is known.
//
// The save toggles in the reader act in place (render-save.js). The list and
// the review are repainted whole, with focus handed to whatever now stands
// where the pressed control stood. The collection's and History's actions
// live in events-collect.js, which hooks in through onRoute() and the
// exports below.

import { state } from './state.js';
import { $ } from './utils.js';
import { ui } from './strings.js';
import { kanjiInfo } from './reader.js';
import { myKanji, KEY } from './kanji-store.js';
import { MAX_IMPORT_BYTES, parseImport } from './kanji-backup.js';
import { createReview, show, answer, finished } from './review.js';
import { view, paintList, paintSavedList, paintNote, OFTEN_LIMIT } from './render-mykanji.js';
import { paintReview, reviewFocus } from './render-review.js';
import { paintCollection } from './render-collection.js';
import { paintHistory } from './render-history.js';
import { paintSavedMarks, paintDueCount, today } from './render-save.js';
import { paintSide, afterPaintAll } from './render.js';
import { openDialog, bindDialog } from './dialogs.js';
import { downloadText } from './neorgon-dom.js';
import { describe, loadText } from './events-read.js';

const ROUTES = Object.freeze({
  '#/kanji': 'list', '#/kanji/review': 'review', '#/kanji/collection': 'collection', '#/kanji/history': 'history',
});
const HASH = Object.freeze({
  reader: '', list: '#/kanji', review: '#/kanji/review', collection: '#/kanji/collection', history: '#/kanji/history',
});
const PARENT = Object.freeze({
  review: 'list', collection: 'list', history: 'list', list: 'reader', reader: 'reader',
});
/** The places the nav moves between, and the string each is titled with. */
const TABS = Object.freeze({ list: 'myKanji', collection: 'navCollection', history: 'navHistory' });
const hooks = [];

let route = 'reader';
const entries = new Map();   // yomuIx -> the route that history entry showed
let here = null;             // yomuIx of the entry on screen
let review = null;
let readerScroll = 0;
let infoSeq = 0;
let clearedJustNow = false;

export function routeOf(hash) {
  return ROUTES[hash] || 'reader';
}

export function currentRoute() {
  return route;
}

/** Run `fn(next, prev)` each time a route is shown, after it is painted. */
export function onRoute(fn) {
  hooks.push(fn);
}

// ── Focus that survives a repaint ─────────────────────────────────────────

/** What is focused inside the screen, described well enough to find it again. */
function focusKey() {
  const a = document.activeElement;
  const body = $('mykanji');
  if (!a || !body || !body.contains(a)) return null;
  const d = a.dataset || {};
  return { id: a.id || null, act: d.act || null, ix: d.ix ?? null, sort: d.sort || null, shelf: d.shelf || null };
}

function refocus(key, fallback) {
  let el = null;
  if (key && key.id) el = $(key.id);
  if (!el && key && key.act) {
    let same = [...document.querySelectorAll(`#mk-body [data-act="${key.act}"]`)];
    if (key.shelf) same = same.filter((b) => b.dataset.shelf === key.shelf);
    if (key.sort) el = same.find((b) => b.dataset.sort === key.sort) || null;
    else if (key.ix !== null && key.ix !== undefined && same.length) el = same[Math.min(Number(key.ix), same.length - 1)];
    else el = same[0] || null;
  }
  el = el || (typeof fallback === 'function' ? fallback() : fallback);
  if (!el) return;
  if (key && key.act) focusInView(el);
  else el.focus();
}

/**
 * Focus a control a repaint put back, without the jump a plain focus()
 * makes, then bring it into view if the repaint moved it out: a list that
 * grew above it (Saved, after a save from Seen often) pushed the next Save
 * button below a phone's screen, and Import's below a desktop's.
 */
function focusInView(el) {
  el.focus({ preventScroll: true });
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'nearest' });
}

/** Repaint the screen for the route it shows, keeping focus, and a filter's caret, where they were. */
export function repaint() {
  const key = focusKey();
  const field = document.activeElement;
  const caret = field && field.id && field.tagName === 'INPUT' && $('mykanji').contains(field)
    ? [field.id, field.selectionStart, field.selectionEnd] : null;
  if (route === 'review') paintReview(review);
  else if (route === 'list') paintList();
  else if (route === 'collection') paintCollection();
  else if (route === 'history') paintHistory();
  paintNote();
  if (key) refocus(key, null);
  const again = caret && $(caret[0]);
  if (again) again.setSelectionRange(caret[1], caret[2]);
}

// ── Kanji information ─────────────────────────────────────────────────────

/** The kanji the screen lists that it has no details for yet. */
function wanted() {
  const mine = myKanji();
  return [...new Set([...Object.keys(mine.data.saved), ...mine.often(OFTEN_LIMIT)])].filter((ch) => !view.info.has(ch));
}

/** What the reading on screen already knows costs nothing: take it before the first paint. */
function seedInfo() {
  const known = state.analysis && state.analysis.info;
  if (known) for (const ch of wanted()) if (known.has(ch)) view.info.set(ch, known.get(ch));
}

/** Meanings and readings for every kanji the screen lists, fetched once each. */
async function loadInfo() {
  seedInfo();
  const missing = wanted();
  if (!missing.length) return;
  const mineSeq = ++infoSeq;
  view.infoState = 'loading';
  paintNote();
  try {
    const got = await kanjiInfo(missing);
    if (mineSeq !== infoSeq) return;
    // A kanji the dictionary does not hold is remembered as such, so it is
    // not asked for again every time the screen opens.
    for (const ch of missing) view.info.set(ch, got.get(ch) || null);
    view.infoState = 'ready';
  } catch (err) {
    if (mineSeq !== infoSeq) return;
    console.error('[yomu]', err);
    const why = describe(err);
    view.infoState = 'error';
    view.infoError = why.file ? `${why.file}: ${why.detail}` : why.detail;
  }
  if (route !== 'reader') repaint();
}

// ── Routes ────────────────────────────────────────────────────────────────

function showRegions(next) {
  const reader = document.querySelector('.yomu');
  const screen = $('mykanji');
  if (reader) reader.hidden = next !== 'reader';
  if (screen) screen.hidden = next === 'reader';
  for (const a of document.querySelectorAll('a.mk-open')) {
    if (next === 'reader') a.removeAttribute('aria-current');
    else a.setAttribute('aria-current', 'page');
  }
  const back = $('mk-back-label');
  if (back) back.textContent = ui(PARENT[next] === 'list' ? 'backToMyKanji' : 'backToReader');
  const lead = $('mk-lead');
  if (lead) lead.hidden = next === 'review';
  const nav = $('mk-nav');
  if (nav) {
    nav.hidden = next === 'review';
    for (const a of nav.querySelectorAll('a[data-tab]')) {
      if (a.dataset.tab === next) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }
  document.title = next === 'reader' ? ui('pageTitle') : `${ui(TABS[next] || 'review')} | Yomu`;
}

/**
 * Stamp the history entry on screen with its index, once: an entry pushed by
 * a link or a hash is the one after the entry it was pushed from; one the
 * browser went back or forward to already carries its stamp. A reload keeps
 * the stamp but not this map, so after a reload nothing before is trusted.
 */
function stamp(next) {
  const st = history.state;
  let ix = st && typeof st === 'object' && Number.isInteger(st.yomuIx) ? st.yomuIx : null;
  if (ix === null) {
    ix = here === null ? 0 : here + 1;
    try {
      history.replaceState({ ...(st && typeof st === 'object' ? st : {}), yomuIx: ix }, '');
    } catch { /* a state the browser will not clone: Back falls back to replaceState */ }
  }
  here = ix;
  entries.set(ix, next);
}

/**
 * Show the route the address names. Called on every hashchange, and once at
 * boot. `focus: false` leaves focus where it is (a text the host sent).
 */
export function applyRoute({ boot = false, focus = true } = {}) {
  const next = routeOf(location.hash);
  const prev = route;
  stamp(next);
  if (next === prev) return;
  route = next;
  if (prev === 'reader') readerScroll = window.scrollY;
  view.note = '';
  showRegions(next);
  if (next !== 'reader') seedInfo();

  if (next === 'reader') {
    window.scrollTo({ top: readerScroll, behavior: 'instant' });
    if (!focus) return;
    const link = [...document.querySelectorAll('a.mk-open')].find((a) => a.getClientRects().length);
    (link || $('main')).focus({ preventScroll: true });
    return;
  }
  if (next === 'review') review = createReview(myKanji().due(today()));
  view.mode = next;
  // The nav's link keeps focus when it moved between the three places.
  const fromNav = !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#mk-nav'));
  repaint();
  if (next === 'list' || next === 'review') loadInfo();
  for (const fn of hooks) fn(next, prev);
  if (boot) return;
  if (prev === 'reader') window.scrollTo({ top: 0, behavior: 'instant' });
  if (next === 'review') reviewFocus(review)?.focus({ preventScroll: true });
  else if (prev === 'review') ($('mk-body').querySelector('[data-act="mk-start"]') || $('mk-title')).focus({ preventScroll: true });
  else if (!(fromNav && TABS[prev])) $('mk-title').focus({ preventScroll: true });
}

/**
 * Back to the reader, whatever route shows, without a new history entry and
 * without moving focus.
 */
function toReader() {
  if (route === 'reader') return;
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  applyRoute({ focus: false });
}

/** The reader, from History's Read again: a new history entry, so Back returns to History. */
export function openReader() {
  if (route === 'reader') return;
  history.pushState(null, '', `${location.pathname}${location.search}`);
  applyRoute({ focus: false });
}

/**
 * A text the host sent (yomu:load). A new one is read on the reader: a
 * learner who had opened My kanji in the frame and closed the sheet on it
 * saw their list again, with the next phrase loaded behind it. The text on
 * screen sent again is not new: a host resends it when it thinks the frame
 * reloaded, and WebKit fires the frame's load for a change of hash, so
 * following the My kanji link brought the text back and, with it, the
 * reader; it is the same reading session too, and counts nothing again.
 */
export function hostLoad(text) {
  const again = text === state.text;
  if (!again) toReader();
  return loadText(text, { restore: again, source: 'host' });
}

/** Go up one route: from a review to the list, from the list to the reader. */
function leave() {
  const target = PARENT[route];
  if (target === route) return;
  if (here !== null && entries.get(here - 1) === target) {
    history.back();
    return;
  }
  history.replaceState(history.state, '', `${location.pathname}${location.search}${HASH[target]}`);
  applyRoute();
}

// ── The review ────────────────────────────────────────────────────────────

function paintCard() {
  paintReview(review);
  const el = reviewFocus(review);
  if (el) el.focus({ preventScroll: false });
}

function reveal() {
  if (!review || finished(review) || review.shown) return;
  show(review);
  paintCard();
}

function give(ok) {
  if (!review || !review.shown) return;
  const now = today();
  answer(review, ok, (ch, good) => myKanji().answer(ch, good, now));
  paintCard();
  paintDueCount();
}

/** Space shows, 1 is Again, 2 is Got it, Escape leaves. Only on the review, and never in a field. */
function onKey(e) {
  if (route !== 'review' || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
  if (document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
  // Escape is used here, so the embed does not also pass it to the host
  // (js/embed.js skips a key whose default was prevented).
  if (e.key === 'Escape') { e.preventDefault(); leave(); return; }
  if (!review || finished(review)) return;
  if ((e.key === ' ' || e.key === 'Spacebar') && !review.shown) { e.preventDefault(); reveal(); return; }
  if (e.key === '1' && review.shown) { e.preventDefault(); give(false); return; }
  if (e.key === '2' && review.shown) { e.preventDefault(); give(true); }
}

// ── Backup ────────────────────────────────────────────────────────────────

function say(msg) {
  view.note = msg;
  paintNote();
}

function exportAll() {
  const day = today();
  const file = `yomu-kanji-${day}.json`;
  downloadText(`${JSON.stringify(myKanji().exportDoc(day), null, 1)}\n`, file, 'application/json');
  say(ui('exported', { file }));
}

async function importFile(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) { say(ui('importSize')); return; }
  let text;
  try { text = await file.text(); } catch { say(ui('importRead')); return; }
  const r = parseImport(text);
  if (!r.ok) {
    say(ui({ json: 'importJson', format: 'importFormat', empty: 'importEmpty' }[r.reason] || 'importFormat'));
    return;
  }
  const sum = myKanji().merge(r.data);
  const msg = ui('imported', { saved: sum.savedAdded, seen: sum.seenAdded + sum.seenUpdated });
  view.note = r.dropped ? `${msg} ${ui('importDropped', { n: r.dropped })}` : msg;
  afterChange();
}

/** Everything that shows the store, after it changed: the screen, the reader's marks and counts. */
export function afterChange() {
  if (route !== 'reader') {
    seedInfo();
    repaint();
    loadInfo();             // a kanji that moved up into Seen often may be new to the screen
  }
  paintSavedMarks(state);
  if (state.analysis) paintSide(state);
  paintDueCount();
}

// ── Actions ───────────────────────────────────────────────────────────────

function kanjiAt(list, b) {
  const ix = Number(b.dataset.ix);
  return Number.isInteger(ix) ? list[ix] || null : null;
}

export const KANJI_ACTIONS = {
  /** The reader's bookmark: data-kid is the analysis' kanji list. */
  'save-kanji': (b) => {
    const order = (state.analysis && state.analysis.order) || [];
    const ch = order[Number(b.dataset.kid)];
    if (!ch) return;
    myKanji().toggle(ch, new Date());
    paintSavedMarks(state);
  },
  'kanji-back': () => leave(),
  // The hash is set now and the route applied now: hashchange comes a task
  // later, and a Space pressed in between would land on the list.
  'mk-start': () => { location.hash = HASH.review; applyRoute(); },
  'mk-sort': (b) => { view.sort = b.dataset.sort; paintSavedList(); },
  'mk-remove': (b) => {
    const ch = kanjiAt(view.saved, b);
    if (!ch) return;
    myKanji().unsave(ch);
    afterChange();
    if (!document.querySelector('#mk-body [data-act="mk-remove"]')) $('mk-saved-h').focus();
  },
  'mk-save': (b) => {
    const ch = kanjiAt(view.often, b);
    if (!ch) return;
    myKanji().save(ch, new Date());
    afterChange();
    if (!document.querySelector('#mk-body [data-act="mk-save"]')) $('mk-often-h').focus();
  },
  'mk-export': exportAll,
  'mk-import': () => { const input = $('mk-file'); if (input) input.click(); },
  'mk-clear': (b) => openDialog($('mk-clear-dialog'), b),
  'mk-clear-yes': () => {
    myKanji().clearAll();
    view.note = ui('cleared');
    clearedJustNow = true;
    afterChange();
    const dialog = $('mk-clear-dialog');
    if (dialog && dialog.open) dialog.close();
  },
  'rv-show': reveal,
  'rv-again': () => give(false),
  'rv-got': () => give(true),
  'rv-back': () => leave(),
};

/** Bind once, from bindEvents, then show the route the page was opened at. */
export function bindKanji() {
  addEventListener('hashchange', () => applyRoute());
  document.addEventListener('keydown', onKey);
  document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'mk-filter') return;
    view.filter = e.target.value;
    paintSavedList();
  });
  const file = $('mk-file');
  if (file) {
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      file.value = '';            // the same file chosen twice still fires change
      importFile(f).finally(() => {
        const b = document.querySelector('#mk-body [data-act="mk-import"]');
        if (b) focusInView(b);
      });
    });
  }
  const dialog = $('mk-clear-dialog');
  if (dialog) {
    bindDialog(dialog, $('mk-title'));
    // The close event comes after the repaint that replaced the Clear all
    // button the dialog opened from, and the dialog kit then falls back to the
    // title. Registered after the kit's listener, this one has the last word.
    dialog.addEventListener('close', () => {
      if (!clearedJustNow) return;
      clearedJustNow = false;
      const again = document.querySelector('#mk-body [data-act="mk-clear"]');
      if (again) again.focus({ preventScroll: true });
    });
  }
  // Another tab saved or reviewed: read the store again rather than letting
  // this tab's next write put the old copy back.
  addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return;
    myKanji().load();
    afterChange();
  });
  afterPaintAll(() => {
    if (route !== 'reader') { showRegions(route); repaint(); }
    paintDueCount();
  });
  // What is due moves at midnight, and a page left open past it said
  // "Nothing is due" about a kanji due that morning.
  let shownDay = today();
  const dayTurned = () => {
    const now = today();
    if (now === shownDay) return;
    shownDay = now;
    afterChange();
  };
  document.addEventListener('visibilitychange', dayTurned);
  addEventListener('focus', dayTurned);
  setInterval(dayTurned, 60 * 1000);
  paintDueCount();
  applyRoute({ boot: true });
}
