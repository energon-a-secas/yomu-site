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
// Turning it off forgets every text not saved (history-store.js turnOff),
// after a confirm when there is anything to forget. The kanji store's
// history keys are left as they are: a key with no text behind it reads as
// the kind of text it was.
//
// Saving a text on purpose (the reader's bookmark, History's rows) works
// whatever Remember says, and never changes it or answers the reader's card.
// With Remember off it keeps that one text and nothing else; unsaving it
// then forgets it, since nothing else keeps it. The saved phrases also ride
// in My kanji's backup: bindCollect lends the kanji store the two calls.

import { state, savePrefs } from './state.js';
import { $, attrSel } from './utils.js';
import { ui } from './strings.js';
import { kanjiInfo } from './reader.js';
import { myKanji } from './kanji-store.js';
import {
  myHistory, textKey, MAX_SAVED, KEY as HISTORY_KEY,
} from './history-store.js';
import { loadJoyo } from './collection.js';
import { view } from './render-mykanji.js';
import { paintStatus, afterPaintAll } from './render.js';
import {
  collect, paintKanjiDialog, shelfTiles, shelfChars, tileChar, FILTERS,
} from './render-collection.js';
import { hist, paintHistoryList } from './render-history.js';
import { notify, readText } from './render-remember.js';
import { openDialog, bindDialog } from './dialogs.js';
import {
  describe, loadText, focusHome, rememberNow, pointKanji,
} from './events-read.js';
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

/** What History knows of the text on screen from before this session, after the store changed. */
function seenAgain() {
  const text = readText();
  state.seenBefore = text === null ? null : myHistory().beforeOf(myKanji().sessionId, textKey(text));
}

function turnOff() {
  myHistory().turnOff();
  setRemember('off');
  seenAgain();               // a saved text on screen was still read before
  paintStatus(state);
}

function say(msg) {
  view.note = msg;
  repaint();
}

// ── Saving a text ─────────────────────────────────────────────────────────

const remembering = () => state.prefs.remember === 'on';

/** Save `text`, read in the session on screen. The message, or the one that says the list is full. */
function saveOne(text) {
  const mine = myKanji();
  const r = myHistory().save(text, mine.sessionId, mine.sessionSource, Date.now());
  if (!r.ok) return { ok: false, msg: ui('savedFull', { n: MAX_SAVED }) };
  if (text === readText()) pointKanji(r.key);
  return { ok: true };
}

/** Unsave by key. With Remember off the text is forgotten, and the reading on screen points at nothing. */
function unsaveOne(key) {
  myHistory().unsave(key, remembering());
  const text = readText();
  if (!remembering() && text !== null && textKey(text) === key) pointKanji(null);
  seenAgain();
}

/** The reader's bookmark: the text on screen, as last read. */
function toggleReaderText() {
  const text = readText();
  if (text === null) return;
  const key = textKey(text);
  if (myHistory().isSaved(key)) {
    unsaveOne(key);
    notify(ui(remembering() ? 'textUnsaved' : 'textUnsavedGone'), 5000);
  } else {
    const r = saveOne(text);
    notify(r.ok ? ui(remembering() ? 'textSaved' : 'textSavedOnly') : r.msg, r.ok ? 4000 : 6000);
  }
  paintStatus(state);
}

/** A History row's bookmark, then the screen again, focus handed on by the repaint. */
function afterRow(msg, gone) {
  paintStatus(state);
  say(msg);
  if (!document.querySelector(`#mk-body [data-act="${gone}"]`)) {
    const head = $('hs-saved-h') || $('hs-list-h') || $('hs-switch-h');
    if (head) head.focus({ preventScroll: true });
  }
}

// The tile a dialog opened from. Saving in the dialog repaints the shelves
// behind it, so on close the tile is found again by its place, not held.
let tileAt = null;

function tileNow() {
  if (!tileAt) return null;
  return document.querySelector(`#mk-body [data-act="col-tile"]${attrSel('data-shelf', tileAt.shelf)}${attrSel('data-ix', tileAt.ix)}`);
}

/** History's Read again, from either list: the reader, with a new history entry. */
function readAgain(e) {
  if (!e) return;
  openReader();
  loadText(e.t, { source: 'history' }).catch(() => {});
  window.scrollTo({ top: 0, behavior: 'instant' });
  focusHome();
}

// ── Actions ───────────────────────────────────────────────────────────────

export const COLLECT_ACTIONS = {
  // The reader's card. Both answers are final; History has the switch.
  'remember-yes': () => {
    setRemember('on');
    rememberNow();
    focusHome();
    notify(ui('rememberOnToast'), 4000);
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
    const store = myHistory();
    const m = store.savedCount;
    const n = store.size - m;
    if (!n) {
      turnOff();
      say(ui('turnedOff'));
      const sw = $('hs-switch');
      if (sw) sw.focus();
      return;
    }
    const title = $('hs-off-title');
    const body = $('hs-off-body');
    if (m) {
      if (title) title.textContent = ui(n === 1 ? 'offTitleUnsavedOne' : 'offTitleUnsavedMany', { n });
      if (body) body.textContent = `${ui(m === 1 ? 'keepSavedOne' : 'keepSavedMany', { n: m })} ${ui('offBodyKept')}`;
    } else {
      if (title) title.textContent = ui(n === 1 ? 'offTitleOne' : 'offTitleMany', { n });
      if (body) body.textContent = ui('offBody');
    }
    openDialog($('hs-off-dialog'), b);
  },
  'hs-off-yes': () => {
    const kept = myHistory().savedCount;
    turnOff();
    view.note = ui(kept ? 'turnedOffKept' : 'turnedOffForgot');
    const dialog = $('hs-off-dialog');
    if (dialog && dialog.open) dialog.close();
    repaint();
    const sw = $('hs-switch');
    if (sw) sw.focus({ preventScroll: true });
  },
  'hs-read': (b) => readAgain(hist.shown[Number(b.dataset.ix)]),
  'hs-saved-read': (b) => readAgain(hist.saved[Number(b.dataset.ix)]),
  'save-text': toggleReaderText,
  'hs-save': (b) => {
    const e = hist.shown[Number(b.dataset.ix)];
    if (!e) return;
    const r = saveOne(e.t);
    afterRow(r.ok ? ui('rowSaved') : r.msg, 'hs-save');
  },
  'hs-unsave': (b) => {
    const e = hist.saved[Number(b.dataset.ix)];
    if (!e) return;
    unsaveOne(e.key);
    afterRow(ui(remembering() ? 'rowUnsaved' : 'textUnsavedGone'), 'hs-unsave');
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
  'hs-clear': (b) => {
    const store = myHistory();
    const m = store.savedCount;
    const n = store.size - m;
    const title = $('hs-clear-title');
    const body = $('hs-clear-body');
    if (title) title.textContent = m ? ui(n === 1 ? 'forgetUnsavedOne' : 'forgetUnsavedMany', { n }) : ui('forgetAllTitle');
    if (body) body.textContent = m ? `${ui(m === 1 ? 'keepSavedOne' : 'keepSavedMany', { n: m })} ${ui('forgetAllBody')}` : ui('forgetAllBody');
    openDialog($('hs-clear-dialog'), b);
  },
  'hs-clear-yes': () => {
    const kept = myHistory().savedCount;
    myHistory().forgetAll();
    seenAgain();
    paintStatus(state);
    const dialog = $('hs-clear-dialog');
    if (dialog && dialog.open) dialog.close();
    say(ui(kept ? 'forgotUnsaved' : 'forgotAll'));
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
  // Another tab remembered, saved or forgot a text: read the store again.
  addEventListener('storage', (e) => {
    if (e.key !== HISTORY_KEY && e.key !== null) return;
    myHistory().load();
    paintStatus(state);
    if (currentRoute() === 'history') repaint();
  });
  // Export writes the saved phrases and Import merges them (kanji-backup.js);
  // the kanji store is lent the History calls, and never the store itself.
  myKanji().lendPhrases({
    out: () => myHistory().phrases(),
    merge: (phrases) => {
      const sum = myHistory().mergePhrases(phrases);
      paintStatus(state);
      return sum;
    },
  });
  afterPaintAll(() => {
    const dialog = $('col-dialog');
    if (dialog && dialog.open && collect.dialog) paintKanjiDialog(collect.dialog);
  });
}
