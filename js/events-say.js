// Everything that speaks: Speak all, Sound it out and Say the word in the
// Word panel, the Phrases dialog (Listen, Chunk it, a dialogue in two
// voices), a sound note's examples and its minimal pair, and the voice choice.
//
// Two gates, because there are two kinds of text. The learner's own text is
// said by the device's Japanese voice (speechOk), playing a recording only
// where Yomu happens to have one. Yomu's own text, the notes and the phrase
// library, is recorded in every voice (js/audio.js), so its buttons work with
// a recorded voice chosen on a device that has no Japanese voice at all
// (sayOk). Moved here from events.js on 2026-10-16, when that file reached
// the fleet's 500 lines.

import { state, rate, savePrefs, VOICE_CHOICES } from './state.js';
import { $, fill, h } from './utils.js';
import { ui, currentLang } from './strings.js';
import { paintSpeech, paintChrome, selectedToken } from './render.js';
import { speak, speakText, cancel, speakSteps, beatSteps, sayable, setVoice, otherVoice } from './speech.js';
import { wordKey } from './audio.js';
import { hasKanji } from './kana.js';
import { tokenBeats } from './render-word.js';
import { loadLibrary, dialogueText, phraseBeats } from './library.js';
import { phrasesNode, chunkNodes } from './render-phrases.js';
import { speechReason } from './render-chrome.js';
import { loadText, describe } from './events-read.js';
import { noteFor } from './notes.js';

const usable = (el) => !(el && el.getAttribute('aria-disabled') === 'true');

/** The learner's text: the device's voice is needed. */
function speechOk(el) {
  return state.speech === 'ok' && usable(el);
}

/** Yomu's own text: a recorded voice, or the device's. */
function sayOk(el) {
  return (state.speech === 'ok' || state.prefs.voice !== 'device') && usable(el);
}

async function speakAll() {
  if (state.speaking) { cancel(); return; }
  if (!state.text.trim()) return;
  state.speaking = true;
  paintSpeech(state);
  await speakText(state.text, { rate: rate(state) });
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

/**
 * A word written in kanji is looked up by its own key (雨|あめ) before its
 * reading, so it plays its recording and not a homophone's. A word in kana
 * needs none, and a particle must not have one: は is said わ, and the
 * recording filed under は is the beat ha.
 */
const lookupOf = (token) => (token && hasKanji(token.surface || '') ? [wordKey(token.surface, token.reading)] : []);

function soundOut() {
  const token = selectedToken(state);
  if (!token) return;
  const beats = tokenBeats(token).map((b) => b.kana);
  const chips = [...document.querySelectorAll('#word-beats .beat')];
  playBeats(chips, $('word-surface'), beatSteps(beats, sayable(token), lookupOf(token)));
}

function sayWord() {
  const token = selectedToken(state);
  if (token) speak(sayable(token), { rate: rate(state), lookup: lookupOf(token) });
}

// ── A note's examples ─────────────────────────────────────────────────────

/** The example a button names in the open note: data-ex is its index, data-pair with or without. */
function noteExample(b) {
  const ref = state.note;
  const note = ref && noteFor(ref.kind, ref.id, currentLang());
  if (!note) return null;
  if (b.dataset.pair) return note.pair && note.pair[b.dataset.pair];
  const list = Array.isArray(note.examples) ? note.examples : note.example ? [note.example] : [];
  return list[Number(b.dataset.ex)] || null;
}

/** What to say for an example: the text, which is what its recording is filed under. */
const sayText = (ex) => ex.ja || ex.kana || '';

function sayExample(b) {
  const ex = noteExample(b);
  if (ex) speak(sayText(ex), { rate: rate(state) });
}

/** A minimal pair, both words, the one with the sound first. */
function sayPair() {
  const ref = state.note;
  const note = ref && noteFor(ref.kind, ref.id, currentLang());
  const p = note && note.pair;
  if (!p || !p.with || !p.without) return;
  const items = [...document.querySelectorAll('.ex-list--pair .ex')];
  speakSteps([{ text: sayText(p.with) }, { pause: 350 }, { text: sayText(p.without) }], {
    rate: rate(state),
    onStep: (i) => items.forEach((el, j) => el.classList.toggle('is-saying', (i === 0 && j === 0) || (i === 2 && j === 1))),
  });
}

// ── Phrases ───────────────────────────────────────────────────────────────

let library = null;

export async function showPhrases() {
  const body = $('phrases-body');
  if (!body) return;
  if (!library) fill(body, h('p', { class: 'quiet', role: 'status' }, ui('phrasesLoading')));
  try {
    library = await loadLibrary();
    const canSay = state.speech === 'ok' || state.prefs.voice !== 'device';
    fill(body, phrasesNode(library, { canSpeak: canSay, speechReason: canSay ? '' : speechReason(state.speech), readable: { on: !!state.view.readable, known: state.prefs.kanaRows } }));
  } catch (err) {
    const why = describe(err);
    fill(body, h('p', { class: 'read-error', role: 'alert' }, [
      h('span', null, why.file ? ui('failedFile', why) : why.detail), ' ',
      h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'retry-phrases' }, ui('retry')),
    ]));
  }
}

/** Draw the dialog again in the current language, if it is open and loaded. */
export function repaintPhrases() {
  const dialog = $('phrases-dialog');
  if (dialog && dialog.open && library) showPhrases();
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

/** A dialogue said line by line, speaker B in a second voice, each line lit as it is said. */
function listenDialogue(b) {
  const d = library && library.dialogueById.get(b.dataset.id);
  const lines = b.closest('.dlg') ? [...b.closest('.dlg').querySelectorAll('.dlg-lines > li')] : [];
  if (!d) return;
  const second = otherVoice();
  const steps = [];
  d.lines.forEach((l, i) => {
    if (i) steps.push({ pause: 450 });
    steps.push({ text: l.ja, line: i, speaker: l.speaker === 'B' ? second : undefined });
  });
  speakSteps(steps, {
    rate: rate(state),
    onStep: (i) => {
      const at = i >= 0 && steps[i] ? steps[i].line : -1;
      lines.forEach((el, j) => el.classList.toggle('is-saying', j === at));
      if (lines[at]) lines[at].scrollIntoView({ block: 'nearest' });
    },
  });
}

function readFromLibrary(text) {
  const dialog = $('phrases-dialog');
  cancel();
  if (dialog && dialog.open) dialog.close();
  loadText(text, { source: 'phrase' }).catch(() => {});
}

// ── The voice ─────────────────────────────────────────────────────────────

/** The Voice select: whatever was being said stops, and the next thing uses the new voice. */
export function bindSay() {
  setVoice(state.prefs.voice);
  const select = $('voice-choice');
  if (!select) return;
  select.addEventListener('change', () => {
    if (!VOICE_CHOICES.includes(select.value)) return;
    state.prefs.voice = select.value;
    savePrefs(state);
    cancel();
    setVoice(select.value);
    paintChrome(state);
  });
}

export const SAY_ACTIONS = {
  'speak-all': (b) => speechOk(b) && speakAll(),
  'sound-out': (b) => speechOk(b) && soundOut(),
  'say-word': (b) => speechOk(b) && sayWord(),
  'say-ex': (b) => sayOk(b) && sayExample(b),
  'say-pair': (b) => sayOk(b) && sayPair(),
  'retry-phrases': showPhrases,
  'read-phrase': (b) => { const p = library && library.byId.get(b.dataset.id); if (p) readFromLibrary(p.ja); },
  'read-dialogue': (b) => { const d = library && library.dialogueById.get(b.dataset.id); if (d) readFromLibrary(dialogueText(d)); },
  'ph-listen': (b) => { const p = sayOk(b) && library && library.byId.get(b.dataset.id); if (p) speak(p.ja, { rate: rate(state) }); },
  'dlg-listen': (b) => sayOk(b) && listenDialogue(b),
  chunk: (b) => sayOk(b) && chunk(b),
};
