// Listeners, bound once, and the few actions they start.
//
// Clicks are delegated from the document to [data-act] controls, so a panel
// that is repainted keeps working without rebinding anything. Hover, focus and
// a tap on a touch screen share one path for each kind of light (a kanji, a
// note), because "nothing hover-only" is a rule, not a nicety. Reading, the
// one asynchronous action, lives in events-read.js.

import { state, savePrefs, rate } from './state.js';
import { $, touchOnly, prefersReducedMotion, attrSel, fill, h } from './utils.js';
import { ui, currentLang, EXAMPLES } from './strings.js';
import { resetDictionary } from './reader.js';
import {
  paintAll, paintSelection, paintNote, paintSide, paintChrome, paintSpeech, paintWord, selectedToken,
} from './render.js';
import { lightKanji, lightTokenKanji, lightNote } from './render-highlight.js';
import { speak, cancel, speakSteps, beatSteps, sayable, voicesReady } from './speech.js';
import { tokenBeats } from './render-word.js';
import { selectable } from './render-reading.js';
import { openDialog, bindDialog } from './dialogs.js';
import { loadLibrary, dialogueText, phraseBeats } from './library.js';
import { phrasesNode, chunkNodes } from './render-phrases.js';
import { speechReason } from './render-chrome.js';
import { analyzeNow, loadText, clearText, bindInput, describe, focusHome } from './events-read.js';
import { KANJI_ACTIONS, bindKanji } from './events-kanji.js';
import { startTranslation, stopTranslation } from './render-translate.js';
import { COLLECT_ACTIONS, bindCollect } from './events-collect.js';
import { PLAY_ACTIONS, bindPlay } from './events-play.js';
import { bindGaps, gapsToggled } from './events-gaps.js';
import { watchPress } from './press.js';

export { analyzeNow, loadText };

const NARROW = '(max-width: 1099px)';

/** One column: a narrow screen, or an embed, which is always one column. */
function oneColumn() {
  return state.embed || matchMedia(NARROW).matches;
}

/**
 * Bring a side panel into view. On two columns it sticks beside the reading,
 * so only the side column scrolls and the reading stays put. On one column,
 * once something is chosen, the side column rides at the bottom of the
 * screen (render.js sets data-sheet, style.css places it): the page keeps
 * the chosen word in view above it instead of scrolling down to the side
 * column, which left the reading off screen at every word. An embed has no
 * sheet, and scrolls to the side as before.
 */
function reveal(panel) {
  if (!panel) return;
  const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
  const side = $('side');
  if (side && side.hasAttribute('data-sheet') && !state.embed && matchMedia(NARROW).matches) {
    side.scrollTo({ top: 0 });
    const chosen = document.querySelector('#reading-body .tok[aria-pressed="true"]');
    if (chosen) chosen.scrollIntoView({ block: 'nearest', behavior });
    return;
  }
  if (oneColumn() || !side) {
    (side || panel).scrollIntoView({ block: 'nearest', behavior });
    return;
  }
  const top = panel === side ? 0 : panel.offsetTop;
  if (top < side.scrollTop || top > side.scrollTop + side.clientHeight - 80) side.scrollTo({ top, behavior });
}

// ── Choosing a word, and the lights ───────────────────────────────────────

function select(i, { reveal: show = true } = {}) {
  const token = state.analysis && state.analysis.tokens[i];
  if (!token || !selectable(token)) return;
  state.selected = i;
  state.tab = 'word';
  paintSelection(state);
  paintSide(state);
  if (show) reveal(oneColumn() ? $('side') : $('panel-word'));
}

function tokens() {
  return [...document.querySelectorAll('#reading-body .tok')];
}

function roveTo(el) {
  if (!el) return;
  for (const b of document.querySelectorAll('#reading-body .tok[tabindex="0"]')) b.tabIndex = -1;
  el.tabIndex = 0;
  el.focus();
}

function onReadingKey(e) {
  const tok = e.target.closest('.tok');
  if (!tok) return;
  const all = tokens();
  const at = all.indexOf(tok);
  let next = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = all[at + 1];
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = all[at - 1];
  else if (e.key === 'Home') next = all[0];
  else if (e.key === 'End') next = all[all.length - 1];
  else return;
  e.preventDefault();
  roveTo(next);
}

function pinKanji(kid) {
  const prev = state.pinnedKanji;
  if (prev !== null) lightKanji(prev, false);
  state.pinnedKanji = prev === kid ? null : kid;
  if (state.pinnedKanji !== null) lightKanji(state.pinnedKanji, true);
  // Unpinning 今 must not unlight it while the focused 今日 still lights it.
  const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('#reading-body .tok');
  if (focused) lightTokenKanji(focused, true);
  for (const row of document.querySelectorAll('#kanji-body .kj-row')) {
    row.setAttribute('aria-pressed', String(Number(row.dataset.kid) === state.pinnedKanji));
  }
}

/**
 * The kanji the focused word lights. A pointer passing over one of them and
 * leaving must not put it out while the word is still the one chosen, the
 * same rule pinKanji keeps for an unpinned kanji. `leaving` is the word focus
 * is moving away from, whose kanji do go out.
 */
function heldKids(leaving = null) {
  const a = document.activeElement;
  const tok = a && a.closest ? a.closest('#reading-body .tok') : null;
  if (!tok || tok === leaving) return new Set();
  return new Set([...tok.querySelectorAll('.kj[data-kid]')].map((k) => k.dataset.kid));
}

function unlightKanji(kid, leaving = null) {
  if (Number(kid) === state.pinnedKanji || heldKids(leaving).has(String(kid))) return;
  lightKanji(kid, false);
}

/** Pointer and focus, entering and leaving, for one kind of target. */
function hoverPair(root, selector, on, off) {
  if (!root) return;
  const enter = (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el) && !(e.relatedTarget && el.contains(e.relatedTarget))) on(el);
  };
  const leave = (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el) && !(e.relatedTarget && el.contains(e.relatedTarget))) off(el);
  };
  root.addEventListener('pointerover', enter);
  root.addEventListener('pointerout', leave);
  root.addEventListener('focusin', enter);
  root.addEventListener('focusout', leave);
}

function bindLights() {
  const reading = $('reading-body');
  hoverPair(reading, '.kj[data-kid]', (el) => lightKanji(el.dataset.kid, true), (el) => unlightKanji(el.dataset.kid));
  if (reading) {
    reading.addEventListener('focusin', (e) => lightTokenKanji(e.target.closest('.tok'), true));
    reading.addEventListener('focusout', (e) => {
      const tok = e.target.closest('.tok');
      if (!tok) return;
      for (const kid of new Set([...tok.querySelectorAll('.kj[data-kid]')].map((k) => k.dataset.kid))) unlightKanji(kid, tok);
    });
    reading.addEventListener('click', (e) => {
      const tok = e.target.closest('.tok');
      if (!tok) return;
      roveTo(tok);
      select(Number(tok.dataset.i));
      // On a touch screen a tap is the only hover there is: a tapped kanji
      // pins its row, which is what pointing at it does with a mouse.
      const kj = e.target.closest('.kj[data-kid]');
      if (kj && touchOnly()) pinKanji(Number(kj.dataset.kid));
    });
    reading.addEventListener('keydown', onReadingKey);
  }
  hoverPair($('kanji-body'), '.kj-row', (el) => lightKanji(el.dataset.kid, true), (el) => unlightKanji(el.dataset.kid));
  hoverPair($('in-text-body'), '.it-line', (el) => lightNote(el.dataset.kind, el.dataset.id, true), (el) => lightNote(el.dataset.kind, el.dataset.id, false));
}

// ── Notes ─────────────────────────────────────────────────────────────────

function openNote(kind, id, opener) {
  state.note = { kind, id };
  state.tab = 'notes';
  paintSide(state);
  reveal(oneColumn() ? $('side') : $('panel-notes'));
  const title = $('note-title');
  if (title && opener && opener.closest('#word-body')) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
}

function closeNote() {
  const ref = state.note;
  state.note = null;
  paintNote(state);
  paintSide(state);
  const back = ref && document.querySelector(`.it-line${attrSel('data-kind', ref.kind)}${attrSel('data-id', ref.id)}`);
  if (back) back.focus();
}

// ── Speech ────────────────────────────────────────────────────────────────

function speechOk(el) {
  return state.speech === 'ok' && !(el && el.getAttribute('aria-disabled') === 'true');
}

async function speakAll() {
  if (state.speaking) { cancel(); return; }
  if (!state.text.trim()) return;
  state.speaking = true;
  paintSpeech(state);
  await speak(state.text, { rate: rate(state) });
  state.speaking = false;
  paintSpeech(state);
}

/** Light each chip as its beat is said, then everything as the whole is said. */
async function playBeats(chips, whole, steps) {
  const setOn = (i) => {
    chips.forEach((c, j) => c.classList.toggle('is-on', j === i));
    if (whole) whole.classList.toggle('is-on', i === steps.length - 1 && steps[i] && steps[i].whole);
  };
  await speakSteps(steps, { rate: rate(state), onStep: setOn });
  setOn(-1);
}

function soundOut() {
  const token = selectedToken(state);
  if (!token) return;
  const beats = tokenBeats(token).map((b) => b.kana);
  const chips = [...document.querySelectorAll('#word-beats .beat')];
  playBeats(chips, $('word-surface'), beatSteps(beats, sayable(token)));
}

function sayWord() {
  const token = selectedToken(state);
  if (token) speak(sayable(token), { rate: rate(state) });
}

// ── Phrases ───────────────────────────────────────────────────────────────

let library = null;

async function showPhrases() {
  const body = $('phrases-body');
  if (!body) return;
  if (!library) fill(body, h('p', { class: 'quiet', role: 'status' }, ui('phrasesLoading')));
  try {
    library = await loadLibrary();
    fill(body, phrasesNode(library, { canSpeak: state.speech === 'ok', speechReason: speechReason(state.speech) }));
  } catch (err) {
    const why = describe(err);
    fill(body, h('p', { class: 'read-error', role: 'alert' }, [
      h('span', null, why.file ? ui('failedFile', why) : why.detail), ' ',
      h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'retry-phrases' }, ui('retry')),
    ]));
  }
}

function chunk(button) {
  const phrase = library && library.byId.get(button.dataset.id);
  const area = button.closest('.ph') && button.closest('.ph').querySelector('.ph-chunk');
  if (!phrase || !area) return;
  if (area.hidden) {
    fill(area, chunkNodes(phrase));
    area.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }
  const list = area.querySelector('.beats');
  playBeats([...area.querySelectorAll('.beat')], list, beatSteps(phraseBeats(phrase), phrase.ja));
}

function readFromLibrary(text) {
  const dialog = $('phrases-dialog');
  cancel();
  if (dialog && dialog.open) dialog.close();
  loadText(text, { source: 'phrase' }).catch(() => {});
}

// ── Translators ───────────────────────────────────────────────────────────
//
// The link carries the bare site until the moment it is followed, and goes
// back to it straight after, so the text is in an href only while the browser
// is reading it.

const TRANSLATORS = {
  deepl: (text, to) => `https://www.deepl.com/translator#ja/${to}/${encodeURIComponent(text)}`,
  google: (text, to) => `https://translate.google.com/?sl=ja&tl=${to}&text=${encodeURIComponent(text)}&op=translate`,
};

function bindTranslators() {
  for (const a of document.querySelectorAll('[data-translate]')) {
    const bare = a.href;
    const arm = () => {
      if (!state.text.trim()) return;
      a.href = TRANSLATORS[a.dataset.translate](state.text, currentLang());
      setTimeout(() => { a.href = bare; }, 0);
    };
    a.addEventListener('click', arm);
    a.addEventListener('auxclick', arm);
  }
}

/**
 * On one column, put the side column back under the reading: nothing chosen,
 * no note, the Word tab. Focus returns to the word that was chosen.
 */
function closeSheet() {
  const was = state.selected;
  state.selected = null;
  state.note = null;
  state.tab = 'word';
  paintSelection(state);
  paintSide(state);
  const tok = was === null ? null : document.querySelector(`#reading-body .tok[data-i="${was}"]`);
  if (tok) tok.focus({ preventScroll: true });
}

/**
 * ?lang= chooses the language for one visit (state.js). Once the reader
 * picks one with the toggle, the address must not bring the old one back on
 * a reload, so the parameter goes; every other parameter stays.
 */
function dropLangParam() {
  if (typeof URL !== 'function' || !/[?&]lang=/.test(location.search)) return;
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  history.replaceState(history.state, '', url);
}

// ── One click handler ─────────────────────────────────────────────────────

/** Preferences with more than two values keep the value itself; the rest are on and off. */
const NAMED = new Set(['romaji', 'unsaved']);

function setPref(name, value) {
  if (NAMED.has(name)) state.prefs[name] = value;
  else state.prefs[name] = value === 'on';
  savePrefs(state);
  paintChrome(state);
  if (name === 'gaps') gapsToggled();
}

const ACTIONS = {
  set: (b) => setPref(b.dataset.pref, b.dataset.value),
  slow: () => { state.prefs.slow = !state.prefs.slow; savePrefs(state); paintChrome(state); },
  'speak-all': (b) => speechOk(b) && speakAll(),
  clear: clearText,
  // Both buttons are removed by what they start, so focus moves first.
  example: (b) => { focusHome(); loadText(EXAMPLES[Number(b.dataset.ex)].ja, { source: 'example' }).catch(() => {}); },
  retry: () => { focusHome(); resetDictionary(); analyzeNow().catch(() => {}); },
  'close-sheet': closeSheet,
  tab: (b) => { state.tab = b.dataset.tab; paintSide(state); },
  note: (b) => openNote(b.dataset.kind, b.dataset.id, b),
  'close-note': closeNote,
  kanji: (b) => pinKanji(Number(b.dataset.kid)),
  'sound-out': (b) => speechOk(b) && soundOut(),
  'say-word': (b) => speechOk(b) && sayWord(),
  lang: () => {
    state.prefs.lang = currentLang() === 'en' ? 'es' : 'en';
    savePrefs(state);
    dropLangParam();
    paintAll(state);
    const dialog = $('phrases-dialog');
    if (dialog && dialog.open && library) showPhrases();
  },
  phrases: (b) => { openDialog($('phrases-dialog'), b); showPhrases(); },
  'retry-phrases': showPhrases,
  'read-phrase': (b) => { const p = library && library.byId.get(b.dataset.id); if (p) readFromLibrary(p.ja); },
  'read-dialogue': (b) => { const d = library && library.dialogueById.get(b.dataset.id); if (d) readFromLibrary(dialogueText(d)); },
  chunk: (b) => speechOk(b) && chunk(b),
  'translate-on': () => startTranslation(state),
  'translate-off': () => stopTranslation(state),
  ...KANJI_ACTIONS,
  ...COLLECT_ACTIONS,
  ...PLAY_ACTIONS,
};

export function bindEvents() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !ACTIONS[b.dataset.act]) return;
    ACTIONS[b.dataset.act](b, e);
  });
  watchPress();
  bindInput();
  bindLights();
  bindGaps();
  bindTranslators();
  const dialog = $('phrases-dialog');
  if (dialog) {
    bindDialog(dialog, $('phrases-open'));
    dialog.addEventListener('close', () => cancel());
  }
  voicesReady().then((status) => {
    state.speech = status;
    paintSpeech(state);
    paintWord(state);
  });
  // Before bindKanji, which shows the route the page opened at: the
  // Collection's and Play's hooks have to be there to hear it.
  bindCollect();
  bindPlay();
  bindKanji();
}
