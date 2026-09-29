// Reading: the page's one asynchronous action, and the text box that starts it.
//
// Split out of events.js, which keeps the clicks, the lights and the panels,
// so both stay under the 500-line rule. Every read carries a sequence number
// and only the newest may paint, so a slow shard for an old version of the
// text can never overwrite the reading of the current one.

import { state, saveText, forgetText, setText } from './state.js';
import { $, debounce } from './utils.js';
import { currentLang } from './strings.js';
import { read, isLexical, isUnknown, LoadError } from './reader.js';
import { paintReading, paintStatus, paintSpeech, paintEmpty } from './render.js';
import { cancel } from './speech.js';

let seq = 0;

export function describe(err) {
  if (err instanceof LoadError) return { file: err.file, detail: err.detail };
  return { file: null, detail: String((err && err.message) || err || 'unknown error') };
}

function counts(a) {
  const lex = a.tokens.filter(isLexical);
  return { tokens: lex.length, unknown: lex.filter(isUnknown).length };
}

/** Whether a note still has something to point at in this analysis. */
function stillIn(analysis, note) {
  return analysis.tokens.some((t) => (note.kind === 'sound'
    ? (t.sounds || []).some((s) => s && s.type === note.id)
    : (t.grammar || []).some((g) => g && g.id === note.id)));
}

/**
 * Read state.text and paint it. Resolves to { tokens, unknown } for the embed,
 * or null when a newer read replaced this one; rejects when the read failed,
 * after the page has already said so.
 */
export async function analyzeNow() {
  const mine = ++seq;
  if (!state.text.trim()) {
    state.analysis = null;
    state.note = null;
    state.status = { kind: 'idle', done: 0, total: 0, error: null };
    paintStatus(state);
    paintReading(state);
    return { tokens: 0, unknown: 0 };
  }
  state.status = { kind: 'loading', done: 0, total: 0, error: null };
  // A read from loaded shards takes a few milliseconds; saying "loading" for
  // that long is a flicker, not information. So nothing is said for the first
  // 150 ms, and after that every progress report is.
  let loud = false;
  // Once this read has failed or finished, the shard fetches still in flight
  // keep reporting as they land; without this a late "12 of 12" would paint
  // over the error that names the file that failed.
  let settled = false;
  const quiet = setTimeout(() => {
    loud = true;
    if (mine === seq && !settled) paintStatus(state);
  }, 150);
  try {
    const analysis = await read(state.text, {
      lang: currentLang(),
      onProgress: ({ done, total }) => {
        if (mine !== seq || settled) return;
        state.status = { kind: 'loading', done, total, error: null };
        if (loud) paintStatus(state);
      },
    });
    settled = true;
    if (mine !== seq) return null;
    const prev = state.analysis && state.selected !== null ? state.analysis.tokens[state.selected] : null;
    const same = prev && analysis.tokens[state.selected];
    if (!same || same.surface !== prev.surface || same.start !== prev.start) state.selected = null;
    // A note stays open only while the text still has what it explains: typing
    // ありがとう over a sentence with は left "は said wa" open beside a reading
    // that had no は in it.
    if (state.note && !stillIn(analysis, state.note)) state.note = null;
    state.analysis = analysis;
    state.pinnedKanji = null;
    const n = counts(analysis);
    // The status line says the read is done, in words, because a screen
    // reader hears nothing else change; and it says so when there was no
    // Japanese to read, which a reading of plain word chips did not. Latin
    // words count for the embed's reply, not here.
    const japanese = analysis.tokens.filter((t) => isLexical(t) && t.kind !== 'latin').length;
    state.status = { kind: 'ready', done: 0, total: 0, error: null, words: japanese, unknown: n.unknown };
    paintStatus(state);
    paintReading(state);
    return n;
  } catch (err) {
    settled = true;
    if (mine !== seq) return null;
    console.error('[yomu]', err);
    // The reading on screen belongs to an older text now; leaving it under
    // the error would present it as the reading of this one.
    state.analysis = null;
    state.selected = null;
    state.status = { kind: 'error', done: 0, total: 0, error: describe(err) };
    paintStatus(state);
    paintReading(state);
    throw err;
  } finally {
    clearTimeout(quiet);
  }
}

const readSoon = debounce(() => analyzeNow().catch(() => {}), 300);

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

/**
 * Somewhere sensible for focus when the control that had it is about to be
 * removed (an example button, Retry): the text box, or in an embed, where
 * there is none, the page's main region. Left alone, focus fell to <body>.
 */
export function focusHome() {
  const ta = $('yomu-text');
  const target = ta && ta.getClientRects().length ? ta : $('main');
  if (target) target.focus({ preventScroll: true });
}

/** Put text in the box and read it now: an example, a phrase, #t=, the embed. */
export function loadText(text) {
  const ta = $('yomu-text');
  if (ta) { ta.value = text; autosize(ta); }
  setText(state, text);
  saveText(state, text);
  state.selected = null;
  state.note = null;
  paintStatus(state);
  paintEmpty(state);
  return analyzeNow();
}

export function clearText() {
  cancel();
  const ta = $('yomu-text');
  if (ta) { ta.value = ''; autosize(ta); }
  setText(state, '');
  forgetText();
  state.selected = null;
  state.note = null;
  state.speaking = false;
  paintSpeech(state);
  analyzeNow().catch(() => {});
  if (ta) ta.focus();
}

export function bindInput() {
  const ta = $('yomu-text');
  if (!ta) return;
  let pasted = false;
  ta.addEventListener('paste', () => { pasted = true; });
  ta.addEventListener('input', (e) => {
    autosize(ta);
    setText(state, ta.value);
    saveText(state, ta.value);
    paintStatus(state);
    paintEmpty(state);
    // Mid-composition the box holds romaji or unconverted kana the learner
    // has not chosen yet; reading it would flash a wrong analysis. The read
    // waits for compositionend.
    if (e.isComposing) return;
    if (pasted || !state.text.trim()) {
      pasted = false;
      analyzeNow().catch(() => {});
    } else {
      readSoon();
    }
  });
  ta.addEventListener('compositionend', () => readSoon());
  // Measured once the page has its styles: reading scrollHeight while the
  // document is still loading forces a layout, which Firefox reports in
  // every embedded frame.
  if (document.readyState === 'complete') autosize(ta);
  else addEventListener('load', () => autosize(ta), { once: true });
}
