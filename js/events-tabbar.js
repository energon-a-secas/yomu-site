// The phone tab bar (index.html #tabbar, style.css): which place it marks
// as current, on every route, and Read, which goes back to the reader the
// way Back does (events-kanji.js openReader). Search, My kanji and Play are
// plain links to their routes; the due count is render-save.js's, on every
// [data-due-count].

import { onRoute, openReader, currentRoute } from './events-kanji.js';

/** The tab a route belongs to. */
export function tabOf(route) {
  if (route === 'reader') return 'reader';
  if (route === 'search') return 'search';
  if (route === 'play' || route.startsWith('play-')) return 'play';
  return 'mykanji';
}

export const TABBAR_ACTIONS = {
  'tab-read': () => openReader(),
};

function mark(route) {
  const on = tabOf(route);
  for (const el of document.querySelectorAll('#tabbar [data-section]')) {
    if (el.dataset.section === on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}

/** Mark the route shown now, and every route after it: a boot on the reader runs no hook. */
export function bindTabbar() {
  onRoute((next) => mark(next));
  mark(currentRoute());
}
