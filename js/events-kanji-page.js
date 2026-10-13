// The kanji page's dialog (#kanji-dialog): opening it on a kanji, going from
// kanji to kanji through its parts and neighbours with a Back inside the
// dialog, drawing the strokes, and the save toggle.
//
// The kanji shown is held here (`kp.stack`), never in an attribute or the
// address: a kanji page is part of a reading, and the reading stays in the
// browser. Buttons that go to another kanji carry `data-ix`, their place in
// the list the last paint drew.
//
// A paint that finishes after the learner went on to another kanji is
// dropped (`kp.token`), so a slow shard never draws over a newer page.

import { $, fill, h, prefersReducedMotion } from './utils.js';
import { ui } from './strings.js';
import { fetchJson, kanjiInfo } from './reader.js';
import { myKanji } from './kanji-store.js';
import { createPageData } from './kanji-page-data.js';
import { kanjiPageNodes } from './render-kanji-page.js';
import { openDialog, bindDialog } from './dialogs.js';
import { afterChange } from './events-kanji.js';

const STEP_MS = 650;

const kp = {
  stack: [],
  drawn: [],
  paths: null,
  token: 0,
  timer: null,
  step: 0,
  last: null,   // what the last paint showed, for a repaint after a save
};

let data = null;
const pageData = () => data || (data = createPageData({ fetchJson }));

const current = () => kp.stack[kp.stack.length - 1] || null;

function stopDrawing() {
  if (kp.timer) clearTimeout(kp.timer);
  kp.timer = null;
}

/** Show the first `k` strokes; the k-th drawn as it is written when `animate`. */
function setStep(k, animate = false) {
  const box = $('kp-draw');
  const n = kp.paths ? kp.paths.length : 0;
  if (!box || !n) return;
  kp.step = Math.max(0, Math.min(k, n));
  box.dataset.step = String(kp.step);
  for (const el of box.querySelectorAll('[data-stroke]')) {
    const i = Number(el.dataset.stroke);
    el.classList.toggle('is-done', i < kp.step - (animate ? 1 : 0));
    el.classList.toggle('is-now', animate && i === kp.step - 1);
  }
  const status = $('kp-step');
  if (status) status.textContent = kp.step && kp.step < n ? ui('kpStrokeOf', { k: kp.step, n }) : '';
}

/** Draw every stroke in order, one after the other; at once under reduced motion. */
function draw() {
  stopDrawing();
  const n = kp.paths ? kp.paths.length : 0;
  if (!n) return;
  if (prefersReducedMotion()) { setStep(n); return; }
  setStep(0);
  const tick = (k) => {
    setStep(k, true);
    if (k < n) kp.timer = setTimeout(() => tick(k + 1), STEP_MS);
    else kp.timer = setTimeout(() => setStep(n), STEP_MS);
  };
  tick(1);
}

function next() {
  stopDrawing();
  const n = kp.paths ? kp.paths.length : 0;
  if (!n) return;
  setStep(kp.step >= n ? 1 : kp.step + 1, !prefersReducedMotion());
}

function paint(view) {
  kp.last = view;
  const ch = current();
  const title = $('kanji-dialog-title');
  if (title) fill(title, h('span', { class: 'cd-char', lang: 'ja' }, ch));
  const body = $('kanji-dialog-body');
  if (!body) return;
  const mine = myKanji();
  const seen = mine.seenOf(ch);
  const { nodes, drawn } = kanjiPageNodes({
    ch,
    back: kp.stack.length > 1 ? kp.stack[kp.stack.length - 2] : null,
    mine: { saved: mine.isSaved(ch), n: seen ? seen.n : 0 },
    ...view,
  });
  kp.drawn = drawn;
  fill(body, nodes);
  if (view.state === 'ready') setStep(kp.paths ? kp.paths.length : 0);
}

async function show() {
  const ch = current();
  if (!ch) return;
  stopDrawing();
  const token = ++kp.token;
  kp.paths = null;
  const empty = { info: null, infos: new Map(), paths: null, page: null };
  paint({ ...empty, state: 'loading' });
  try {
    const store = pageData();
    const [infos, strokes, page] = await Promise.all([kanjiInfo([ch]), store.strokesOf([ch]), store.pageOf(ch)]);
    const info = infos.get(ch) || null;
    const parts = info && Array.isArray(info.parts) ? info.parts : [];
    const around = [...parts, ...Object.values(page.parts).flat(), ...page.used];
    const more = around.length ? await kanjiInfo(around) : new Map();
    if (token !== kp.token) return;
    kp.paths = strokes.get(ch) || null;
    paint({
      info, infos: new Map([...infos, ...more]), paths: kp.paths, page, state: 'ready',
    });
  } catch (err) {
    if (token !== kp.token) return;
    if (typeof console !== 'undefined') console.warn('[yomu] kanji page', err);
    paint({ ...empty, state: 'failed' });
  }
}

/**
 * Open the page of `ch`, from `opener`, which takes focus back when it
 * closes. A page already open starts over on the new kanji.
 */
export function openKanjiPage(ch, opener) {
  if (!ch) return;
  kp.stack = [ch];
  const dialog = $('kanji-dialog');
  if (dialog && !dialog.open) openDialog(dialog, opener);
  show();
}

function go(b) {
  const ch = kp.drawn[Number(b.dataset.ix)];
  if (!ch || ch === current()) return;
  kp.stack.push(ch);
  show().then(focusTop);
}

function back() {
  if (kp.stack.length < 2) return;
  kp.stack.pop();
  show().then(focusTop);
}

/** After a move inside the dialog, focus its title: the button pressed is gone. */
function focusTop() {
  const title = $('kanji-dialog-title');
  if (title) title.focus({ preventScroll: false });
}

export const KANJI_PAGE_ACTIONS = {
  'kp-go': go,
  'kp-back': back,
  'kp-draw': draw,
  'kp-next': next,
  'kp-all': () => { stopDrawing(); setStep(kp.paths ? kp.paths.length : 0); },
  'kp-retry': () => show(),
  'kp-save': () => {
    const ch = current();
    if (!ch) return;
    myKanji().toggle(ch, new Date());
    if (kp.last) paint(kp.last);
    afterChange();
    const again = document.querySelector('#kanji-dialog [data-act="kp-save"]');
    if (again) again.focus();
  },
};

export function bindKanjiPage() {
  const dialog = $('kanji-dialog');
  if (!dialog) return;
  bindDialog(dialog, { focus: (o) => { const el = $('main'); if (el) el.focus(o); } });
  dialog.addEventListener('close', () => {
    stopDrawing();
    kp.token += 1;
    kp.stack = [];
  });
}
