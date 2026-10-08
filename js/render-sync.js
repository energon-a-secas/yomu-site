// Where the data lives, on screen: the line under My kanji's lead, the
// question asked when another account signs in, or when a first sign-in
// finds data on both sides, and the two texts that say
// where things are kept (the Clear all dialog's body, Play's lead), which
// read differently once this browser syncs with an account, and the Clear
// all dialog differently again while a join waits for the account's data.
//
// Text nodes only. The account's name is the Auth Kit's label (a username,
// a first name, or the part of an email before the @) and goes nowhere but
// a text node. The line is not a live region: it changes after every push,
// and a screen reader would read the time out each time.

import { $, h, fill } from './utils.js';
import { ui, currentLang } from './strings.js';
import { openDialog, bindDialog } from './dialogs.js';

/** "today at 10:42", or "7 Oct at 10:42", in the page's language. */
export function whenText(at, now = Date.now()) {
  const lang = currentLang();
  const d = new Date(at);
  const time = d.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date(now).toDateString()) return ui('syncToday', { time });
  return ui('syncOn', { day: d.toLocaleDateString(lang, { day: 'numeric', month: 'short' }), time });
}

/**
 * A failure's sentence by its kind (account.js failureKind). The error's own
 * text, a code or a Convex request id, is on the console and never here.
 */
const FAILED = Object.freeze({
  offline: (name) => ui('syncOffline', { name }),
  signin: (name) => ui('syncFailedSignIn', { name }),
  switched: (name) => ui('syncFailedSwitched', { name }),
  refused: (name) => ui('syncFailedRefused', { name }),
  server: (name) => ui('syncFailed', { name }),
});

/** The line's words and its one button, if any, for a status from account.js. */
export function lineParts(status, now = Date.now()) {
  const name = status.label;
  if (!status.available) return { text: ui('syncLocal'), act: null };
  if (!status.signedIn) return { text: ui('syncSignedOut'), act: 'signin', label: ui('syncSignIn') };
  if (status.phase === 'paused') return { text: ui('syncPaused', { name }), act: 'choose', label: ui('syncChoose') };
  if (status.phase === 'error') {
    const say = (status.error && Object.hasOwn(FAILED, status.error.kind) && FAILED[status.error.kind]) || FAILED.server;
    return { text: say(name), act: null };
  }
  // While a sync runs, the last one that finished is what the line can vouch for.
  if (status.at) return { text: ui('syncSynced', { name, when: whenText(status.at, now) }), act: null };
  return { text: ui('syncSyncing', { name }), act: null };
}

/** Name a node's string by key, so the next language switch (render-chrome.js) keeps it. */
function relabel(el, key) {
  if (!el || el.dataset.ui === key) return;
  el.dataset.ui = key;
  el.textContent = ui(key);
}

/**
 * The Clear all dialog's words for what a Clear all does now (account.js
 * `clears`): the whole account, only the kanji held here while a join waits
 * for the account's data, or this browser alone.
 */
const CLEAR_BODY = Object.freeze({ account: 'clearBodySynced', joining: 'clearBodyJoining', here: 'clearBody' });
export const clearBodyKey = (status) => (Object.hasOwn(CLEAR_BODY, status.clears) ? CLEAR_BODY[status.clears] : CLEAR_BODY.here);

export function paintSync(status) {
  const line = $('mk-sync');
  if (line) {
    const p = lineParts(status);
    fill(line, [
      h('span', null, p.text),
      p.act ? ' ' : null,
      p.act ? h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-sync': p.act }, p.label) : null,
    ].filter(Boolean));
  }
  relabel($('mk-clear-body'), clearBodyKey(status));
  relabel($('pl-lead'), status.signedIn && status.synced ? 'playLeadSynced' : 'playLead');
}

let answer = null;

/**
 * The question's words. `first`: this browser never synced and holds data
 * of its own, and so does the account it just signed in to; otherwise
 * another account signed in on a browser that synced with one before.
 * `title` and `how` are string keys (relabelled, so a language switch keeps
 * them); `body`, `counts` and `since` are text, `since` null when there is
 * no earlier sync to name.
 */
export function askParts({ label, counts, since, first }) {
  return {
    title: first ? 'syncFirstTitle' : 'syncAskTitle',
    how: first ? 'syncFirstHow' : 'syncAskHow',
    body: first ? ui('syncFirstBody') : ui('syncAskBody', { name: label }),
    counts: ui('syncAskCounts', {
      name: label, kanji: counts.account.kanji, phrases: counts.account.phrases, hereKanji: counts.here.kanji, herePhrases: counts.here.phrases,
    }),
    // When the changes the old account will not get began: its last sync
    // with this browser.
    since: !first && since ? ui('syncAskSince', { when: whenText(since) }) : null,
  };
}

/**
 * Ask what to do with this browser's data now that an account signed in:
 * 'add', 'use', or null for Not now (or Escape). Resolves when the dialog
 * closes.
 */
export function askAccount({ label, counts, since, first, invoker }) {
  const dialog = $('sync-dialog');
  if (!dialog) return Promise.resolve(null);
  const words = askParts({ label, counts, since, first });
  relabel($('sync-title'), words.title);
  relabel($('sync-how'), words.how);
  fill($('sync-body'), [h('span', null, words.body)]);
  const parts = [h('span', null, words.counts)];
  if (words.since) parts.push(' ', h('span', null, words.since));
  fill($('sync-counts'), parts);
  return new Promise((resolve) => {
    answer = resolve;
    openDialog(dialog, invoker || document.activeElement);
  });
}

/** Close the question if it is open, as Not now: what a sign-out does (account.js stop). */
export function dismissAsk() {
  const dialog = $('sync-dialog');
  if (dialog && dialog.open) dialog.close();
}

/** Bind the dialog once: its two answers, and a close by any other way as Not now. */
export function bindSyncDialog() {
  const dialog = $('sync-dialog');
  if (!dialog) return;
  bindDialog(dialog, $('mk-title'));
  const settle = (value) => { const done = answer; answer = null; if (done) done(value); };
  dialog.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sync]');
    if (!b) return;
    const value = b.dataset.sync;
    settle(value);
    dialog.close();
  });
  dialog.addEventListener('close', () => settle(null));
}
