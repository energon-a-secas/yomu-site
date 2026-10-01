// My kanji: the route, its actions, the review's keys, and the backup.
//
// #/kanji is a place, not a text. The page has three routes, the reader (no
// hash), the list (#/kanji) and a review (#/kanji/review); takeFragmentText
// in state.js reads only #t=, so a route is never read as Japanese. The
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
// where the pressed control stood.

import { state } from './state.js';
import { $ } from './utils.js';
import { ui } from './strings.js';
import { kanjiInfo } from './reader.js';
import { myKanji, KEY, MAX_IMPORT_BYTES, parseImport } from './kanji-store.js';
import { createReview, show, answer, finished } from './review.js';
import { view, paintList, paintSavedList, paintNote, OFTEN_LIMIT } from './render-mykanji.js';
import { paintReview, reviewFocus } from './render-review.js';
import { paintSavedMarks, paintDueCount, today } from './render-save.js';
import { paintSide, afterPaintAll } from './render.js';
import { openDialog, bindDialog } from './dialogs.js';
import { downloadText } from './neorgon-dom.js';
import { describe } from './events-read.js';

const ROUTES = Object.freeze({ '#/kanji': 'list', '#/kanji/review': 'review' });
const HASH = Object.freeze({ reader: '', list: '#/kanji', review: '#/kanji/review' });
const PARENT = Object.freeze({ review: 'list', list: 'reader', reader: 'reader' });

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

// ── Focus that survives a repaint ─────────────────────────────────────────

/** What is focused inside the screen, described well enough to find it again. */
function focusKey() {
  const a = document.activeElement;
  const body = $('mykanji');
  if (!a || !body || !body.contains(a)) return null;
  return { id: a.id || null, act: a.dataset ? a.dataset.act : null, ix: a.dataset ? a.dataset.ix : null, sort: a.dataset ? a.dataset.sort : null };
}

function refocus(key, fallback) {
  let el = null;
  if (key && key.id) el = $(key.id);
  if (!el && key && key.act) {
    const same = [...document.querySelectorAll(`#mk-body [data-act="${key.act}"]`)];
    if (key.sort) el = same.find((b) => b.dataset.sort === key.sort) || null;
    else if (key.ix !== null && key.ix !== undefined && same.length) el = same[Math.min(Number(key.ix), same.length - 1)];
    else el = same[0] || null;
  }
  el = el || (typeof fallback === 'function' ? fallback() : fallback);
  if (el) el.focus({ preventScroll: !!(key && key.act) });
}

/** Repaint the screen for the route it shows, keeping focus where it was. */
function repaint() {
  const key = focusKey();
  const filter = $('mk-filter');
  const caret = filter && document.activeElement === filter ? [filter.selectionStart, filter.selectionEnd] : null;
  if (route === 'review') paintReview(review);
  else if (route === 'list') paintList();
  paintNote();
  if (key) refocus(key, null);
  const again = $('mk-filter');
  if (caret && again) again.setSelectionRange(caret[0], caret[1]);
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
  if (back) back.textContent = ui(next === 'review' ? 'backToMyKanji' : 'backToReader');
  const lead = $('mk-lead');
  if (lead) lead.hidden = next === 'review';
  document.title = next === 'reader' ? ui('pageTitle') : `${ui(next === 'review' ? 'review' : 'myKanji')} | Yomu`;
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

/** Show the route the address names. Called on every hashchange, and once at boot. */
export function applyRoute({ boot = false } = {}) {
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
    const link = [...document.querySelectorAll('a.mk-open')].find((a) => a.getClientRects().length);
    (link || $('main')).focus({ preventScroll: true });
    return;
  }
  if (next === 'review') {
    review = createReview(myKanji().due(today()));
    view.mode = 'review';
  } else {
    view.mode = 'list';
  }
  repaint();
  loadInfo();
  if (boot) return;
  if (prev === 'reader') window.scrollTo({ top: 0, behavior: 'instant' });
  if (next === 'review') reviewFocus(review)?.focus({ preventScroll: true });
  else if (prev === 'review') ($('mk-body').querySelector('[data-act="mk-start"]') || $('mk-title')).focus({ preventScroll: true });
  else $('mk-title').focus({ preventScroll: true });
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
function afterChange() {
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
        if (b) b.focus({ preventScroll: true });
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
  paintDueCount();
  applyRoute({ boot: true });
}
