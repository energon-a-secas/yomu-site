// Where the data lives, on screen: the line under My kanji's lead, the
// question asked when another account signs in, and the two texts that say
// where things are kept (the Clear all dialog's body, Play's lead), which
// read differently once this browser syncs with an account.
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
  relabel($('mk-clear-body'), status.synced ? 'clearBodySynced' : 'clearBody');
  relabel($('pl-lead'), status.signedIn && status.synced ? 'playLeadSynced' : 'playLead');
}

let answer = null;

/**
 * Ask what to do with this browser's data now that another account signed
 * in: 'add', 'use', or null for Not now (or Escape). Resolves when the
 * dialog closes.
 */
export function askAccount({ label, counts, since, invoker }) {
  const dialog = $('sync-dialog');
  if (!dialog) return Promise.resolve(null);
  fill($('sync-body'), [h('span', null, ui('syncAskBody', { name: label }))]);
  const parts = [h('span', null, ui('syncAskCounts', {
    name: label, kanji: counts.account.kanji, phrases: counts.account.phrases, hereKanji: counts.here.kanji, herePhrases: counts.here.phrases,
  }))];
  // When the changes the old account will not get began: its last sync with this browser.
  if (since) parts.push(' ', h('span', null, ui('syncAskSince', { when: whenText(since) })));
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
