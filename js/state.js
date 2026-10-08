// The page's state, and the two places any of it is kept.
//
// Preferences (language, the five display toggles, slow speech, and whether
// to remember what was read) go through the Persist kit under
// 'yomu-site:preferences', version 1. The pasted text is kept apart, raw,
// under 'yomu-site:text', for one reason: a reload should not lose a sentence
// someone just pasted, and a Clear should be able to forget it without
// touching anything else. The texts a learner read are kept a third way, in
// History (history-store.js), and only once they said yes to `remember`.
//
// Where the text is never written: the URL, a data attribute, the page title,
// or anything the beacon reads. #t= is read once on load and removed at once,
// so the address bar never holds a learner's text for longer than a boot.

import { createStore, safeGet, safeSet, safeRemove } from './neorgon-persist.js';
import { LANGS } from './strings.js';

const prefsStore = createStore({ key: 'yomu-site:preferences', version: 1 });
export const TEXT_KEY = 'yomu-site:text';

/** The embed contract's limit, applied to the page too so both read the same. */
export const MAX_CHARS = 2000;

/** Speech rates. Slow is slow enough to hear a long vowel as long. */
export const RATE = Object.freeze({ normal: 1, slow: 0.6 });

export const ROMAJI = Object.freeze(['said', 'spelled', 'off']);
/** The unsaved-kanji mark in the reading (My kanji): drawn, or not. */
export const UNSAVED = Object.freeze(['mark', 'off']);
/**
 * Keep the texts read, for History and "You read this before": not asked yet
 * (asked once, after the first read), yes, or no. Off until the learner says.
 */
export const REMEMBER = Object.freeze(['ask', 'on', 'off']);
/** The on-device translation under the reading (translate.js): off until the learner asks for it. */
export const TRANSLATE = Object.freeze(['on', 'off']);

export const state = {
  // `gaps` draws the edges between words (gaps.js), off until the learner
  // asks; `gapsSeen` is whether its one-line hint was shown once already.
  prefs: {
    lang: 'en', furigana: true, romaji: 'said', highlights: true, unsaved: 'mark', gaps: false, gapsSeen: false, slow: false, remember: 'ask', translate: 'off',
  },
  embed: false,
  text: '',
  truncated: false,
  // What the analyzer returned for `text`, normalized by reader.js.
  analysis: null,
  // idle | loading | ready | error. `done` and `total` count dictionary files.
  status: { kind: 'idle', done: 0, total: 0, error: null },
  selected: null,        // token index
  note: null,            // { kind: 'sound' | 'grammar', id }
  tab: 'word',           // the side column's panel on a narrow screen
  pinnedKanji: null,     // a kanji tapped on a touch screen
  speech: 'checking',    // checking | ok | none | no-api
  speaking: false,
  // The Gaps hint shows: Gaps was turned on for the first time ever, in this
  // visit, and has not been turned off since.
  gapsHint: false,
  // What History knew about the text on screen before this session read it
  // (history-store.js recordText), for "You read this before". Null when
  // remembering is off or nothing was known.
  seenBefore: null,
};

/** The interface language a browser asks for, reduced to en or es. */
export function browserLang(nav = globalThis.navigator) {
  const tags = (nav && (nav.languages || [nav.language])) || [];
  for (const tag of tags) {
    const primary = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (LANGS.includes(primary)) return primary;
  }
  return 'en';
}

/**
 * Read saved preferences, one validated field at a time. Saved JSON is never
 * assigned onto state wholesale: a hand-edited or stale value is dropped, not
 * trusted.
 *
 * Precedence for the language: ?lang= (this visit only, never saved, so an
 * embed cannot change what the standalone page remembers), then the saved
 * choice, then the browser's.
 */
export function loadPrefs(s, loc = globalThis.location, nav = globalThis.navigator) {
  const saved = prefsStore.load({});
  const p = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  const params = new URLSearchParams((loc && loc.search) || '');
  const asked = params.get('lang');

  // ?embed=1 on a page that is not in a frame is a link someone followed or
  // typed; with no host to send text, the embed layout was a blank page.
  s.embed = params.get('embed') === '1' && (typeof window === 'undefined' || window.self !== window.top);
  s.prefs.lang = LANGS.includes(asked) ? asked : LANGS.includes(p.lang) ? p.lang : browserLang(nav);
  if (typeof p.furigana === 'boolean') s.prefs.furigana = p.furigana;
  if (ROMAJI.includes(p.romaji)) s.prefs.romaji = p.romaji;
  if (typeof p.highlights === 'boolean') s.prefs.highlights = p.highlights;
  if (UNSAVED.includes(p.unsaved)) s.prefs.unsaved = p.unsaved;
  if (typeof p.gaps === 'boolean') s.prefs.gaps = p.gaps;
  if (typeof p.gapsSeen === 'boolean') s.prefs.gapsSeen = p.gapsSeen;
  if (typeof p.slow === 'boolean') s.prefs.slow = p.slow;
  if (REMEMBER.includes(p.remember)) s.prefs.remember = p.remember;
  if (TRANSLATE.includes(p.translate)) s.prefs.translate = p.translate;
  return s.prefs;
}

const prefsListeners = new Set();

/** Hear every save of the preferences (js/account.js stamps the synced ones). Returns an unsubscribe. */
export function onPrefsSaved(fn) {
  prefsListeners.add(fn);
  return () => prefsListeners.delete(fn);
}

/** false means this session works, but the preference could not be saved. */
export function savePrefs(s) {
  const ok = prefsStore.save({ ...s.prefs });
  for (const fn of prefsListeners) fn(s.prefs);
  return ok;
}

export function rate(s) {
  return s.prefs.slow ? RATE.slow : RATE.normal;
}

/** The text a reload should come back to. An embed keeps nothing. */
export function loadText(s) {
  if (s.embed) return '';
  return safeGet(TEXT_KEY, '') || '';
}

export function saveText(s, text) {
  if (s.embed) return false;
  return text ? safeSet(TEXT_KEY, text) : safeRemove(TEXT_KEY);
}

export function forgetText() {
  return safeRemove(TEXT_KEY);
}

/**
 * #t=<encoded text>, for a link from another Neorgon site (docs/EMBED.md).
 * Read once, then the fragment is removed with replaceState so the text does
 * not sit in the address bar, the history entry or a bookmark.
 */
export function takeFragmentText(loc = globalThis.location, hist = globalThis.history) {
  const hash = (loc && loc.hash) || '';
  const m = /^#t=(.*)$/s.exec(hash);
  if (!m) return null;
  let text = null;
  try { text = decodeURIComponent(m[1]); } catch { text = null; }
  if (hist && typeof hist.replaceState === 'function') {
    hist.replaceState(hist.state, '', `${loc.pathname}${loc.search}`);
  }
  return text;
}

/** Cap the text at MAX_CHARS and say so, rather than reading a slice silently. */
export function setText(s, text) {
  const raw = String(text || '');
  s.truncated = raw.length > MAX_CHARS;
  s.text = s.truncated ? raw.slice(0, MAX_CHARS) : raw;
  return s.text;
}
