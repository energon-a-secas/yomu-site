// The reading view (index.html's display row, js/reading-view.js): furigana
// over saved kanji, the text size, and one sentence at a time. The sentence
// logic needs a DOM and is walked by tests/mobile.browser.mjs; this holds the
// markup, the stylesheet and the sync boundary.
//
//   node --test tests/reading-view.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PREF_KEYS } from '../js/sync-rules.js';
import { SIZES } from '../js/state.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const panel = html.slice(html.indexOf('id="display-panel"'), html.indexOf('id="speech-note"'));

test('furigana has three choices, and the size and view switches sit beside it', () => {
  for (const v of ['on', 'saved', 'off']) assert.match(panel, new RegExp(`data-pref="furigana" data-value="${v}"`), v);
  for (const v of SIZES) assert.match(panel, new RegExp(`data-pref="size" data-value="${v}"`), v);
  for (const v of ['all', 'one']) assert.match(panel, new RegExp(`data-act="read-view" data-value="${v}"`), v);
});

test('the sentence bar is hidden until the one-sentence view, with a step each way', () => {
  const nav = html.slice(html.indexOf('id="sent-nav"'), html.indexOf('</div>', html.indexOf('id="sent-nav"')));
  assert.match(nav, /hidden/);
  assert.match(nav, /data-step="-1"/);
  assert.match(nav, /data-step="1"/);
  assert.match(nav, /id="sent-where" role="status"/);
});

test('the stylesheet hides a known ruby without moving the line, and puts away other sentences', () => {
  assert.match(css, /#reading\[data-furigana="saved"\] ruby\.is-known rt \{ visibility: hidden; \}/);
  assert.match(css, /\.reading-body \.sent-off \{ display: none; \}/);
  for (const v of ['S', 'L']) assert.match(css, new RegExp(`#reading\\[data-size="${v}"\\] \\.tok-surface`), v);
});

test('the new preferences stay in this browser: sync sends only its six', () => {
  assert.deepEqual([...PREF_KEYS].sort(), ['furigana', 'highlights', 'lang', 'romaji', 'slow', 'unsaved']);
});
