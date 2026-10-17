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
import { afterChange, openReader } from './events-kanji.js';
import { loadText } from './events-read.js';
import { speak, canSpeak } from './speech.js';
import { toHira, isKana, isHiragana } from './kana.js';
import { state, rate } from './state.js';
import { loadLookalikes } from './play-data.js';
import { loadJlpt } from './levels.js';
import { hasHand } from './hand.js';
import { applyHand, onHand } from './events-hand.js';

const STEP_MS = 650;

const kp = {
  stack: [],
  drawn: [],
  words: [],
  sounds: [],   // the kana each say button says, by its data-ix
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
  for (const el of document.querySelectorAll('#kanji-dialog [data-stroke]')) {
    const i = Number(el.dataset.stroke);
    el.classList.toggle('is-done', i < kp.step - (animate ? 1 : 0));
    el.classList.toggle('is-now', (animate || kp.step < n) && i === kp.step - 1);
  }
  const status = $('kp-step');
  if (status) status.textContent = kp.step >= n ? ui('kpAllStrokes', { n }) : ui('kpStrokeOf', { k: kp.step, n });
  const play = $('kp-play');
  if (play) play.textContent = ui(kp.timer ? 'kpPause' : kp.step >= n && n ? 'kpDrawAgain' : 'kpDraw');
}

/** Draw the strokes in order from where the drawing stands (from the start once it is whole); Pause stops it. */
function draw() {
  if (kp.timer) { stopDrawing(); setStep(kp.step); return; }
  const n = kp.paths ? kp.paths.length : 0;
  if (!n) return;
  if (prefersReducedMotion()) { setStep(kp.step >= n ? 1 : kp.step + 1); return; }
  let k = kp.step >= n ? 0 : kp.step;
  const tick = () => {
    k += 1;
    if (k > n) { stopDrawing(); setStep(n); return; }
    kp.timer = setTimeout(tick, STEP_MS);
    setStep(k, true);
  };
  kp.timer = setTimeout(tick, 0);
  setStep(k);
}

function next() {
  stopDrawing();
  const n = kp.paths ? kp.paths.length : 0;
  if (!n) return;
  setStep(kp.step >= n ? 1 : kp.step + 1, !prefersReducedMotion());
}

function prev() {
  stopDrawing();
  const n = kp.paths ? kp.paths.length : 0;
  if (!n) return;
  setStep(kp.step <= 1 ? 0 : kp.step - 1);
}

/** Say a kanji by its first reading (on before kun), a kana as itself. */
function say(b) {
  const ch = current();
  if (!ch || !canSpeak() || b.getAttribute('aria-disabled') === 'true') return;
  const info = kp.last && kp.last.info;
  const first = info ? [...(info.on || []), ...(info.kun || [])][0] : null;
  speak(first ? toHira(String(first).replace(/[.-]/g, '')) : ch, { rate: rate(state) });
}

/**
 * Say one reading or word, marking its button while the voice speaks, so
 * a press is seen as well as heard.
 */
async function sayItem(b) {
  const item = kp.sounds[Number(b.dataset.ix)];
  if (!item || !canSpeak() || b.getAttribute('aria-disabled') === 'true') return;
  for (const el of document.querySelectorAll('#kanji-dialog .is-saying')) el.classList.remove('is-saying');
  b.classList.add('is-saying');
  await speak(item.text, { rate: rate(state), lookup: item.lookup });
  b.classList.remove('is-saying');
}

function paint(view) {
  kp.last = view;
  const ch = current();
  const title = $('kanji-dialog-title');
  // The hero draws the character large; the title names the page, with the character for a screen reader.
  if (title) fill(title, [h('span', { class: 'sr-only', lang: 'ja' }, `${ch} `), ui(isKana(ch) ? (isHiragana(ch) ? 'kpHiragana' : 'kpKatakana') : 'kanjiPage')]);
  const body = $('kanji-dialog-body');
  if (!body) return;
  const mine = myKanji();
  const seen = mine.seenOf(ch);
  const { nodes, drawn, words, sounds } = kanjiPageNodes({
    ch,
    back: kp.stack.length > 1 ? kp.stack[kp.stack.length - 2] : null,
    mine: { saved: mine.isSaved(ch), n: seen ? seen.n : 0 },
    speakable: canSpeak(),
    hand: { on: state.prefs.hand, has: hasHand(ch) },
    ...view,
  });
  kp.drawn = drawn;
  kp.words = words;
  kp.sounds = sounds;
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
  // With the hand on, its index loads beside the page and the page paints
  // again to say whether the hand has this character.
  applyHand().then((covered) => { if (covered && token === kp.token && kp.last) paint(kp.last); });
  try {
    const store = pageData();
    // The look-alikes and the JLPT lists are niceties: one that does not
    // load leaves its section, or its line, out.
    const [infos, strokes, page, alike, lists] = await Promise.all([
      kanjiInfo([ch]), store.strokesOf([ch]), store.pageOf(ch), loadLookalikes().catch(() => new Map()),
      loadJlpt().catch(() => null),
    ]);
    const info = infos.get(ch) || null;
    const parts = info && Array.isArray(info.parts) ? info.parts : [];
    const likes = alike.get(ch) || [];
    const around = [...parts, ...Object.values(page.parts).flat(), ...page.used, ...page.variants, ...likes];
    const more = around.length ? await kanjiInfo(around) : new Map();
    if (token !== kp.token) return;
    kp.paths = strokes.get(ch) || null;
    paint({
      info, infos: new Map([...infos, ...more]), paths: kp.paths, page, likes, state: 'ready',
      jlpt: (lists && lists.levelOf.get(ch)) || null,
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
  'kp-prev': prev,
  'kp-say': say,
  'kp-say-item': sayItem,
  'kp-read': (b) => {
    const w = kp.words[Number(b.dataset.ix)];
    if (!w) return;
    $('kanji-dialog')?.close();
    openReader();
    loadText(w, { source: 'typed' }).catch(() => {});
  },
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
  // The switch turned on: the open page says whether the hand has its character.
  onHand(() => { const dialog = $('kanji-dialog'); if (dialog && dialog.open && kp.last) paint(kp.last); });
  const dialog = $('kanji-dialog');
  if (!dialog) return;
  bindDialog(dialog, { focus: (o) => { const el = $('main'); if (el) el.focus(o); } });
  dialog.addEventListener('close', () => {
    stopDrawing();
    kp.token += 1;
    kp.stack = [];
  });
}
