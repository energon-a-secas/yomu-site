// Entry point: wire the modules together, and nothing else.

import { state, loadPrefs, loadText as savedText, takeFragmentText } from './state.js';
import { paintAll } from './render.js';
import { bindEvents, loadText, analyzeNow } from './events.js';
import { enterEmbedLayout, startEmbed } from './embed.js';
import { hostLoad } from './events-kanji.js';

const VERSION = '1.0.0';

function init() {
  loadPrefs(state);
  if (state.embed) enterEmbedLayout();
  paintAll(state);
  bindEvents();

  if (state.embed) {
    startEmbed({
      version: VERSION,
      onLoad: hostLoad,
      onLang: (lang) => { state.prefs.lang = lang; paintAll(state); },
    });
    return;
  }
  // Sign-in and sync (js/account.js): only with a Clerk key on the page, and
  // never in an embed, which returned above and so imports none of it.
  if (document.querySelector('meta[name="clerk-publishable-key"]')) import('./events-sync.js').then((m) => m.startAccounts()).catch((err) => console.warn('[yomu] accounts', err));
  // A link from another Neorgon site wins over what this browser kept. The
  // kept text is restored, not loaded anew: My kanji already counted it.
  const linked = takeFragmentText();
  const kept = linked === null ? savedText(state) : '';
  if (linked) loadText(linked, { source: 'link' }).catch(() => {});
  else if (kept) loadText(kept, { restore: true }).catch(() => {});
  else analyzeNow().catch(() => {});
  // A #t= link followed from the page itself changes only the fragment.
  addEventListener('hashchange', () => { const t = takeFragmentText(); if (t) loadText(t, { source: 'link' }).catch(() => {}); });
}

init();
