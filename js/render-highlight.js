// Lighting one thing everywhere it appears: a kanji in the text and its row,
// or every span a line of "In this text" counts.
//
// A light is a class and nothing else, so it never moves layout. Hover, focus
// and a tap on a touch screen all land here; a pinned light (a tapped kanji
// row) is kept by state and repainted, the rest are transient.

import { $, attrSel } from './utils.js';

function each(root, selector, fn) {
  if (!root) return;
  for (const el of root.querySelectorAll(selector)) fn(el);
}

/** Light or unlight one kanji: its characters in the text and its table row. */
export function lightKanji(kid, on) {
  if (kid === null || kid === undefined || kid === '') return;
  const sel = attrSel('data-kid', kid);
  each($('reading-body'), `.kj${sel}`, (el) => el.classList.toggle('is-lit', on));
  each($('word-body'), `.kj${sel}`, (el) => el.classList.toggle('is-lit', on));
  each($('kanji-body'), `.kj-row${sel}`, (el) => el.classList.toggle('is-lit', on));
}

/** Every kanji a token carries, lit from the token. */
export function lightTokenKanji(tokenEl, on) {
  if (!tokenEl) return;
  const kids = new Set([...tokenEl.querySelectorAll('.kj[data-kid]')].map((el) => el.dataset.kid));
  for (const kid of kids) lightKanji(kid, on);
}

/** Every span a note counts: a sound's characters, or a grammar note's tokens. */
export function lightNote(kind, id, on) {
  const body = $('reading-body');
  if (!body || !id) return;
  const word = `~="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id}"`;
  const sel = kind === 'sound' ? `[data-snd${word}]` : `.tok[data-gram${word}]`;
  each(body, sel, (el) => el.classList.toggle('is-lit', on));
  body.classList.toggle('has-lit', on);
}

/** Drop every transient light; a pinned kanji is painted again by its owner. */
export function clearLights() {
  for (const id of ['reading-body', 'kanji-body', 'word-body']) each($(id), '.is-lit', (el) => el.classList.remove('is-lit'));
  const body = $('reading-body');
  if (body) body.classList.remove('has-lit');
}
