// Sign-in and sync on the page: js/account.js given the page's stores, the
// three dynamic imports, and render-sync.js to draw with. app.js imports this
// file only on a page that carries a Clerk key and is not an embedded frame,
// so an embed loads none of it.

import { state, savePrefs, onPrefsSaved } from './state.js';
import { ui } from './strings.js';
import { myKanji } from './kanji-store.js';
import { myHistory } from './history-store.js';
import { myPlay } from './play-store.js';
import { openBook } from './sync-book.js';
import { startAccount, CONVEX_CLIENT } from './account.js';
import { paintSync, askAccount, bindSyncDialog } from './render-sync.js';
import { paintAll, afterPaintAll, paintStatus } from './render.js';
import { afterChange } from './events-kanji.js';
import { repaint as repaintPlay } from './events-play.js';

let account = null;
let shown = null;

export function startAccounts() {
  if (account) return account;
  bindSyncDialog();
  account = startAccount({
    doc: document,
    win: window,
    embed: state.embed,
    importKit: () => import('./neorgon-auth.js'),
    importClient: () => import(CONVEX_CLIENT),
    importEngine: () => import('./sync.js'),
    kanji: myKanji(),
    history: myHistory(),
    play: myPlay(),
    prefs: {
      get: () => state.prefs,
      set: (changes) => { Object.assign(state.prefs, changes); savePrefs(state); paintAll(state); },
      onSaved: onPrefsSaved,
    },
    remembering: () => state.prefs.remember === 'on',
    books: openBook(),
    ui: {
      paint: (status) => { shown = status; paintSync(status); },
      ask: askAccount,
      // What sync changed here: My kanji's screens and marks, Play's screen, the reader's bookmark.
      refresh: () => { afterChange(); repaintPlay(); paintStatus(state); },
      reason: () => ui('authReason'),
    },
  });
  if (!account) return null;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#mk-sync [data-sync]');
    if (!b) return;
    if (b.dataset.sync === 'signin') void account.signIn(b);
    else if (b.dataset.sync === 'choose') void account.choose(b);
  });
  // A language switch draws the line again in the new language.
  afterPaintAll(() => { if (shown) paintSync(shown); });
  return account;
}
