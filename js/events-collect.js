// The collection, History, and the reader's Remember card: their actions and
// their listeners, bound once from bindEvents.
//
// Split out of events-kanji.js, which keeps the routes, so both stay under
// the 500-line rule. The routes call back here through onRoute(): showing the
// Collection fetches the jōyō list (collection.js) and the meanings of the
// kanji to look out for, once each. Every change to a store ends in the same
// repaint the list uses (events-kanji.js afterChange), so the reader's marks,
// the due count and the screen agree.
//
// Remembering is a preference with three values (state.js REMEMBER). Asked
// once on the reader; after that, History's switch is the only control.
// Turning it off forgets every text (history-store.js erase), after a confirm
// when there is anything to forget. The kanji store's history keys are left
// as they are: a key with no text behind it reads as the kind of text it was.

import { state, savePrefs } from './state.js';
import { $, showToast, attrSel } from './utils.js';
import { ui } from './strings.js';
import { kanjiInfo } from './reader.js';
import { myKanji } from './kanji-store.js';
import { myHistory, KEY as HISTORY_KEY } from './history-store.js';
import { loadJoyo } from './collection.js';
import { view } from './render-mykanji.js';
import { paintStatus, afterPaintAll } from './render.js';
import {
  collect, paintKanjiDialog, shelfTiles, shelfChars, tileChar, FILTERS,
} from './render-collection.js';
import { hist, paintHistoryList } from './render-history.js';
import { openDialog, bindDialog } from './dialogs.js';
import { describe, loadText, focusHome, rememberNow } from './events-read.js';
import {
  onRoute, currentRoute, repaint, afterChange, openReader,
} from './events-kanji.js';

// ── The jōyō list and the kanji details ───────────────────────────────────

async function ensureJoyo() {
  if (collect.joyo || collect.joyoState === 'loading') return;
  collect.joyoState = 'loading';
  try {
    collect.joyo = await loadJoyo();
    collect.joyoState = 'ready';
  } catch (err) {
    console.error('[yomu]', err);
    const why = describe(err);
    collect.joyoState = 'error';
    collect.joyoError = why.file ? `${why.file}: ${why.detail}` : why.detail;
  }
  if (currentRoute() === 'collection') {
    repaint();
    ensureInfo(collect.drawn.get('next') || []);
  }
}

/**
 * Meanings and readings for these kanji, fetched once each, then the screen
 * and the dialog again. Two of these may overlap (the tiles to look out for,
 * a tile just opened); each repaints when its own kanji arrive.
 */
async function ensureInfo(chars) {
  const missing = [...new Set(chars)].filter((ch) => !view.info.has(ch));
  if (!missing.length) return;
  try {
    const got = await kanjiInfo(missing);
    for (const ch of missing) view.info.set(ch, got.get(ch) || null);
  } catch (err) {
    console.error('[yomu]', err);
    return;
  }
  if (currentRoute() === 'collection') repaint();
  const dialog = $('col-dialog');
  if (dialog && dialog.open && collect.dialog && missing.includes(collect.dialog)) paintKanjiDialog(collect.dialog);
}

// ── A shelf opened or closed ──────────────────────────────────────────────

/**
 * Draw a shelf's tiles when it opens and drop them when it closes, so a page
 * holds 1,110 tiles only while a learner is looking at them. Also fires for a
 * shelf drawn open, which then finds its tiles already there.
 */
function onToggle(e) {
  const d = e.target;
  if (!d || d.tagName !== 'DETAILS' || !d.classList.contains('col-shelf') || !collect.open) return;
  const id = d.dataset.shelf;
  const body = d.querySelector('.col-shelf-body');
  if (!body) return;
  const tiles = body.querySelector('.col-tiles, .mk-empty');
  if (d.open) {
    collect.open.add(id);
    if (!tiles) body.append(shelfTiles(id, shelfChars(id)));
  } else {
    collect.open.delete(id);
    collect.drawn.delete(id);
    if (tiles) tiles.remove();
  }
}

// ── Remembering ───────────────────────────────────────────────────────────

function setRemember(value) {
  state.prefs.remember = value;
  savePrefs(state);
}

function turnOff() {
  myHistory().erase();
  setRemember('off');
  state.seenBefore = null;
  paintStatus(state);
}

function say(msg) {
  view.note = msg;
  repaint();
}

// The tile a dialog opened from. Saving in the dialog repaints the shelves
// behind it, so on close the tile is found again by its place, not held.
let tileAt = null;

function tileNow() {
  if (!tileAt) return null;
  return document.querySelector(`#mk-body [data-act="col-tile"]${attrSel('data-shelf', tileAt.shelf)}${attrSel('data-ix', tileAt.ix)}`);
}

// ── Actions ───────────────────────────────────────────────────────────────

export const COLLECT_ACTIONS = {
  // The reader's card. Both answers are final; History has the switch.
  'remember-yes': () => {
    setRemember('on');
    rememberNow();
    focusHome();
    showToast(ui('rememberOnToast'), { duration: 4000 });
  },
  'remember-no': () => {
    setRemember('off');
    paintStatus(state);
    focusHome();
  },

  'col-filter': (b) => {
    if (!FILTERS.includes(b.dataset.filter)) return;
    collect.filter = b.dataset.filter;
    repaint();
  },
  'col-tile': (b) => {
    const ch = tileChar(b);
    if (!ch) return;
    collect.dialog = ch;
    tileAt = { shelf: b.dataset.shelf, ix: b.dataset.ix };
    paintKanjiDialog(ch);
    openDialog($('col-dialog'), b);
    ensureInfo([ch]);
  },
  'col-save': () => {
    const ch = collect.dialog;
    if (!ch) return;
    myKanji().toggle(ch, new Date());
    paintKanjiDialog(ch);
    afterChange();
    const again = document.querySelector('#col-dialog [data-act="col-save"]');
    if (again) again.focus();
  },
  'col-retry': () => { collect.joyoState = 'idle'; repaint(); ensureJoyo(); },

  'hs-on': () => {
    setRemember('on');
    view.note = ui('turnedOn');
    repaint();
    const sw = $('hs-switch');
    if (sw) sw.focus();
    paintStatus(state);
  },
  'hs-off': (b) => {
    const n = myHistory().size;
    if (!n) {
      turnOff();
      say(ui('turnedOff'));
      const sw = $('hs-switch');
      if (sw) sw.focus();
      return;
    }
    const title = $('hs-off-title');
    if (title) title.textContent = ui(n === 1 ? 'offTitleOne' : 'offTitleMany', { n });
    openDialog($('hs-off-dialog'), b);
  },
  'hs-off-yes': () => {
    turnOff();
    view.note = ui('turnedOffForgot');
    const dialog = $('hs-off-dialog');
    if (dialog && dialog.open) dialog.close();
    repaint();
    const sw = $('hs-switch');
    if (sw) sw.focus({ preventScroll: true });
  },
  'hs-read': (b) => {
    const e = hist.shown[Number(b.dataset.ix)];
    if (!e) return;
    openReader();
    loadText(e.t, { source: 'history' }).catch(() => {});
    window.scrollTo({ top: 0, behavior: 'instant' });
    focusHome();
  },
  'hs-forget': (b) => {
    const e = hist.shown[Number(b.dataset.ix)];
    if (!e) return;
    myHistory().forget(e.key);
    if (state.seenBefore && myHistory().data.session && myHistory().data.session.key === e.key) state.seenBefore = null;
    paintStatus(state);
    say(ui('forgotOne'));
    if (!document.querySelector('#mk-body [data-act="hs-forget"]')) $('hs-list-h').focus();
  },
  'hs-clear': (b) => openDialog($('hs-clear-dialog'), b),
  'hs-clear-yes': () => {
    myHistory().forgetAll();
    state.seenBefore = null;
    paintStatus(state);
    const dialog = $('hs-clear-dialog');
    if (dialog && dialog.open) dialog.close();
    say(ui('forgotAll'));
    const head = $('hs-list-h');
    if (head) head.focus({ preventScroll: true });
  },
};

/** Bind once, from bindEvents, before the route the page opened at is shown. */
export function bindCollect() {
  onRoute((next) => {
    if (next === 'collection') {
      ensureJoyo();
      if (collect.joyo) ensureInfo(collect.drawn.get('next') || []);
    }
  });
  // toggle does not bubble; a capturing listener on the document still hears it.
  document.addEventListener('toggle', onToggle, true);
  document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'hs-filter') return;
    hist.filter = e.target.value;
    paintHistoryList();
  });
  // The control a dialog opened from may be gone by the time it closes (the
  // repaint after Forget all replaced it), so the fallback is looked up then,
  // by id, not held from now.
  for (const [id, fallback] of [['col-dialog', tileNow], ['hs-off-dialog', () => $('hs-switch')], ['hs-clear-dialog', () => $('hs-list-h')]]) {
    const dialog = $(id);
    const later = { focus: (o) => { const el = fallback() || $('mk-title'); if (el) el.focus(o); } };
    if (dialog) bindDialog(dialog, later);
  }
  const tileDialog = $('col-dialog');
  if (tileDialog) tileDialog.addEventListener('close', () => { collect.dialog = null; });
  // Another tab remembered or forgot a text: read the store again.
  addEventListener('storage', (e) => {
    if (e.key !== HISTORY_KEY && e.key !== null) return;
    if (state.prefs.remember === 'on') myHistory().load();
    if (currentRoute() === 'history') repaint();
  });
  afterPaintAll(() => {
    const dialog = $('col-dialog');
    if (dialog && dialog.open && collect.dialog) paintKanjiDialog(collect.dialog);
  });
}
