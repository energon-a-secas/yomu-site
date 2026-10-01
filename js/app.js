// Entry point: wire the modules together, and nothing else.

import { state, loadPrefs, loadText as savedText, takeFragmentText } from './state.js';
import { paintAll } from './render.js';
import { bindEvents, loadText, analyzeNow } from './events.js';
import { enterEmbedLayout, startEmbed } from './embed.js';

const VERSION = '1.0.0';

function init() {
  loadPrefs(state);
  if (state.embed) enterEmbedLayout();
  paintAll(state);
  bindEvents();

  if (state.embed) {
    startEmbed({
      version: VERSION,
      onLoad: (text) => loadText(text),
      onLang: (lang) => { state.prefs.lang = lang; paintAll(state); },
    });
    return;
  }
  // A link from another Neorgon site wins over what this browser kept. The
  // kept text is restored, not loaded anew: My kanji already counted it.
  const linked = takeFragmentText();
  const kept = linked === null ? savedText(state) : '';
  if (linked) loadText(linked).catch(() => {});
  else if (kept) loadText(kept, { restore: true }).catch(() => {});
  else analyzeNow().catch(() => {});
  // A #t= link followed from the page itself changes only the fragment.
  addEventListener('hashchange', () => { const t = takeFragmentText(); if (t) loadText(t).catch(() => {}); });
}

init();
