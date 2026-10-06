// The Translation section under the reading (translate.js does the work).
//
// What it shows depends on what the browser can do, asked again for every
// new text or language: no API (a quiet line pointing at the DeepL and
// Google links), a pair the browser cannot translate, a model that must be
// downloaded first (a "Translate here" button, because creating a translator
// that downloads needs the learner's click), the download's progress, and
// the translation itself, with a Hide that turns it off again. Once the
// learner said yes (`state.prefs.translate`, saved), every later read is
// translated as it settles, on the device, with nothing to click.
//
// The translation is a text node in a lang="en" or lang="es" paragraph, held
// only in memory. It is not a live region: the status line already says when
// a read is done, and a translation read aloud on every keystroke's read
// would talk over the learner. The download and failure lines are.
//
// Every request ends in something the learner can act on: the translation,
// or a failure line with Try again. translate.js gives up on a request after
// QUIET_MS with neither download progress nor a result, and names the
// failures it recognises (failureKind), which are said here in plain words.

import { $, h, fill } from './utils.js';
import { ui, currentLang } from './strings.js';
import { savePrefs } from './state.js';
import { createTranslation, failureKind, QUIET_MS } from './translate.js';

const tr = createTranslation();

/** What the section knows: the text and language it last worked on, and how far it got. */
const view = { phase: 'idle', text: '', target: '', out: '', progress: 0, error: '', why: '', seq: 0 };

const shown = (s) => !!(s.analysis && s.analysis.tokens.length && s.text.trim());

function quiet(key, vars) {
  return h('p', { class: 'quiet tr-note' }, ui(key, vars));
}

function nodes(s) {
  switch (view.phase) {
    case 'unsupported': return [quiet('translateUnsupported')];
    case 'unavailable': return [quiet('translateUnavailable')];
    case 'downloadable':
    case 'available':
    case 'off':
      return [
        h('p', { class: 'tr-actions' }, h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'translate-on' }, ui('translateHere'))),
        quiet(view.phase === 'downloadable' ? 'translateLeadDownload' : 'translateLead'),
      ];
    case 'downloading':
      return [h('p', { class: 'tr-status', role: 'status' }, ui('translateDownloading', { n: Math.round(view.progress * 100) }))];
    case 'translating':
      return [h('p', { class: 'tr-status', role: 'status' }, ui('translating'))];
    case 'ready':
      return [
        h('p', { class: 'tr-text', lang: view.target }, view.out),
        h('p', { class: 'tr-foot' }, [
          h('span', { class: 'quiet' }, ui('translateNote')),
          ' ',
          h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'translate-off' }, ui('translateHide')),
        ]),
      ];
    case 'error':
      return [
        h('p', { class: 'tr-status', role: 'status' }, failureLine()),
        h('p', { class: 'tr-actions' }, h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'translate-on' }, ui('translateRetry'))),
      ];
    default: return [];
  }
}

/** The failure in plain words where translate.js recognised it, else its own text. */
function failureLine() {
  switch (view.why) {
    case 'click': return ui('translateNeedsClick');
    case 'busy': return ui('translateBusy');
    case 'quiet': return ui('translateStalled', { s: Math.round(QUIET_MS / 1000) });
    default: return ui('translateFailed', { detail: view.error });
  }
}

function paint(s) {
  const section = $('translation');
  const body = $('translation-body');
  if (!section || !body) return;
  section.hidden = !shown(s) || view.phase === 'idle';
  fill(body, section.hidden ? [] : nodes(s));
}

function failed(err) {
  return String((err && (err.message || err.name)) || err || 'unknown error');
}

/** Translate the text on screen now; only the newest request may paint. */
async function run(s) {
  const mine = ++view.seq;
  const { text, target } = view;
  view.phase = 'translating';
  paint(s);
  // translate.js reports progress only while this request waits, so a
  // download heard after a failure cannot bring "Downloading" back.
  const progress = (p) => {
    if (mine !== view.seq) return;
    view.phase = 'downloading';
    view.progress = p;
    paint(s);
  };
  try {
    const out = await tr.translate(text, target, progress);
    if (mine !== view.seq) return;
    view.out = out;
    view.phase = 'ready';
  } catch (err) {
    if (mine !== view.seq) return;
    view.phase = 'error';
    view.why = failureKind(err);
    view.error = failed(err);
  }
  paint(s);
}

/**
 * After every paint of the reading: a new text or a new language asks the
 * browser again what it can do, and translates when the learner turned
 * translation on and the model is there. The same text and language only
 * repaints what is already known.
 */
export function syncTranslation(s) {
  if (!shown(s)) { view.seq += 1; view.phase = 'idle'; view.text = ''; paint(s); return; }
  const target = currentLang();
  if (s.text === view.text && target === view.target && view.phase !== 'idle') { paint(s); return; }
  view.text = s.text;
  view.target = target;
  view.out = '';
  const mine = ++view.seq;
  tr.check(target).then((a) => {
    if (mine !== view.seq) return;
    if ((a === 'available' || a === 'downloading') && s.prefs.translate === 'on') { run(s); return; }
    view.phase = a === 'available' ? 'off' : a;
    paint(s);
  });
}

/**
 * The learner's click on Translate here (or Try again). Creating a
 * translator whose model still has to be downloaded needs this click's
 * activation, so the work starts inside the handler, before anything is
 * awaited. After a failure translate.js has forgotten the translator, so
 * this creates a fresh one.
 */
export function startTranslation(s) {
  if (!shown(s)) return;
  view.text = s.text;
  view.target = currentLang();
  if (s.prefs.translate !== 'on') { s.prefs.translate = 'on'; savePrefs(s); }
  tr.open(view.target).catch(() => {});
  run(s);
  // The button is gone once the section repaints; the heading keeps focus.
  const title = $('translation-title');
  if (title) title.focus({ preventScroll: true });
}

/** Hide: turn translation off, saved, and offer Translate here again. */
export function stopTranslation(s) {
  view.seq += 1;
  if (s.prefs.translate !== 'off') { s.prefs.translate = 'off'; savePrefs(s); }
  view.phase = 'off';
  paint(s);
  const again = document.querySelector('#translation-body [data-act="translate-on"]');
  if (again) again.focus({ preventScroll: true });
}
