// The page's fixed parts in the current language, and every control's state.
//
// The static markup in index.html names its strings with data-ui (text),
// data-ui-title and data-ui-label, so switching language rewrites text nodes
// and attributes in place: no control is rebuilt, and focus stays where it was.
// Display toggles are attributes on the reading's root; CSS reads them.

import { $, fill, h } from './utils.js';
import { ui, useLang, currentLang, PLACEHOLDER } from './strings.js';
import { MAX_CHARS } from './state.js';
import { paintRemember } from './render-remember.js';
import { paintGapsHint } from './render-gaps.js';

const SPEECH_REASON = { checking: 'speechChecking', none: 'speechNone', 'no-api': 'speechNoApi' };

/** Why nothing can be spoken, or '' when speech works. */
export function speechReason(status) {
  return SPEECH_REASON[status] ? ui(SPEECH_REASON[status]) : '';
}

function applyStrings(root) {
  for (const el of root.querySelectorAll('[data-ui]')) el.textContent = ui(el.dataset.ui);
  for (const el of root.querySelectorAll('[data-ui-title]')) el.title = ui(el.dataset.uiTitle);
  for (const el of root.querySelectorAll('[data-ui-label]')) el.setAttribute('aria-label', ui(el.dataset.uiLabel));
}

function prefValue(prefs, name) {
  const v = prefs[name];
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  return String(v);
}

export function paintChrome(state) {
  const lang = useLang(state.prefs.lang);
  const doc = document;
  doc.documentElement.lang = lang;
  doc.title = ui('pageTitle');
  applyStrings(doc);

  const text = $('yomu-text');
  if (text) text.placeholder = PLACEHOLDER;

  // Segmented controls and toggles.
  for (const b of doc.querySelectorAll('[data-act="set"]')) {
    b.setAttribute('aria-pressed', String(prefValue(state.prefs, b.dataset.pref) === b.dataset.value));
  }
  const slow = $('slow-toggle');
  if (slow) slow.setAttribute('aria-pressed', String(!!state.prefs.slow));

  const reading = $('reading');
  if (reading) {
    reading.dataset.furigana = state.prefs.furigana ? 'on' : 'off';
    reading.dataset.romaji = state.prefs.romaji;
    reading.dataset.highlights = state.prefs.highlights ? 'on' : 'off';
    reading.dataset.unsaved = state.prefs.unsaved;
    reading.dataset.gaps = state.prefs.gaps ? 'on' : 'off';
  }
  paintGapsHint(state);

  // The language toggle names the current language in bold and says in its
  // accessible name what a press switches to.
  const toggle = $('lang-toggle');
  if (toggle) {
    toggle.dataset.lang = lang;
    toggle.setAttribute('aria-label', ui('langToggle'));
    toggle.title = ui('langToggle');
    for (const span of toggle.querySelectorAll('[data-lang-code]')) {
      span.classList.toggle('lang-code--on', span.dataset.langCode === lang);
    }
  }

  paintSpeech(state);
}

/** Speak controls: enabled only with a Japanese voice, and a reason when not. */
export function paintSpeech(state) {
  const ok = state.speech === 'ok';
  const reason = speechReason(state.speech);
  const note = $('speech-note');
  if (note) {
    note.textContent = reason;
    note.hidden = !reason;
  }
  for (const b of document.querySelectorAll('[data-speak]')) {
    if (ok) {
      b.removeAttribute('aria-disabled');
      b.removeAttribute('aria-describedby');
    } else {
      b.setAttribute('aria-disabled', 'true');
      b.setAttribute('aria-describedby', 'speech-note');
    }
  }
  const all = $('speak-all');
  if (all) {
    const label = all.querySelector('[data-speak-label]');
    if (label) label.textContent = ui(state.speaking ? 'stop' : 'speakAll');
    all.setAttribute('aria-pressed', String(!!state.speaking));
  }
}

/** "Read 6 words.", with how many are guesses, or that there was no Japanese. */
function readMessage(words, unknown) {
  if (!words) return ui('noJapanese');
  const read = ui(words === 1 ? 'readOne' : 'readMany', { n: words });
  return unknown ? `${read} ${ui(unknown === 1 ? 'guessOne' : 'guessMany', { n: unknown })}` : read;
}

/**
 * The quiet status line, the inline error, the too-long note, and what sits
 * under them about remembering (render-remember.js): the ask card and "You
 * read this before" follow every change of status.
 */
export function paintStatus(state) {
  const line = $('status');
  const error = $('read-error');
  const s = state.status;
  if (line) {
    let msg = '';
    // "0 of 1" says nothing yet; the count starts once a file has arrived.
    if (s.kind === 'loading') msg = s.done > 0 ? ui('loadingShards', { done: s.done, total: s.total }) : ui('loadingReader');
    else if (s.kind === 'ready' && Number.isInteger(s.words)) msg = readMessage(s.words, s.unknown || 0);
    // The live region stays in the page and only its text changes: a region
    // that is hidden and then shown with its message already in it is one a
    // screen reader often never announces.
    if (line.textContent !== msg) line.textContent = msg;
  }
  if (error) {
    if (s.kind === 'error' && s.error) {
      const msg = s.error.file
        ? ui('failedFile', { file: s.error.file, detail: s.error.detail })
        : ui('failedReader', { detail: s.error.detail });
      fill(error, [
        h('span', null, msg),
        ' ',
        h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'retry' }, ui('retry')),
      ]);
      error.hidden = false;
    } else {
      fill(error, []);
      error.hidden = true;
    }
  }
  const long = $('too-long');
  if (long) {
    long.textContent = state.truncated ? ui('tooLong', { n: MAX_CHARS.toLocaleString(currentLang()) }) : '';
    long.hidden = !state.truncated;
  }
  paintRemember(state);
}
