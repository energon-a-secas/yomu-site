// Yomu on a phone, the parts plain node can hold: where the markup puts
// things, what the stylesheet does under 600px and on a touch screen, and
// the rule that keeps focus out of the text box after a tap (js/press.js).
// The same properties in WebKit and Chromium, measured, are
// tests/mobile.browser.mjs, which npm test does not run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { keepOutOfField, isField } from '../js/press.js';
import { PHONE } from '../js/layout.js';
import { READER_STRINGS } from '../js/strings-reader.js';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(SITE, 'index.html'), 'utf8');
const css = readFileSync(join(SITE, 'css/style.css'), 'utf8');

const at = (needle) => {
  const i = html.indexOf(needle);
  assert.ok(i >= 0, `index.html has ${needle}`);
  return i;
};

/** The markup of the element whose start tag holds `needle`, up to its matching close tag. */
function element(needle) {
  const start = html.lastIndexOf('<', at(needle));
  const tag = html.slice(start + 1).match(/^[a-z0-9]+/)[0];
  const open = new RegExp(`<${tag}[\\s>]`, 'g');
  const close = new RegExp(`</${tag}>`, 'g');
  let depth = 0;
  let i = start;
  for (;;) {
    open.lastIndex = i + 1;
    close.lastIndex = i + 1;
    const o = open.exec(html);
    const c = close.exec(html);
    if (!c) throw new Error(`no </${tag}> after ${needle}`);
    if (o && o.index < c.index) { depth += 1; i = o.index; continue; }
    if (depth === 0) return html.slice(start, c.index + c[0].length);
    depth -= 1;
    i = c.index;
  }
}

/** The body of every block (a rule or an @media) whose prelude matches `prelude`. */
function blocks(prelude) {
  const out = [];
  const re = new RegExp(`${prelude}\\s*\\{`, 'g');
  for (const m of css.matchAll(re)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    for (; i < css.length && depth; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
    }
    out.push(css.slice(from, i - 1));
  }
  return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the Remember card comes after the reading and its Translation, never above the first word', () => {
  assert.ok(at('id="remember-ask"') > at('id="reading-body"'), 'the card follows the reading body');
  assert.ok(at('id="remember-ask"') > at('id="translation"'), 'the card follows the Translation');
  assert.ok(at('id="remember-ask"') < at('id="in-text"'), 'and comes before In this text');
});

test('the five display switches sit behind one Display button, folded in the markup', () => {
  const toggle = element('id="display-toggle"');
  assert.match(toggle, /aria-expanded="false"/);
  assert.match(toggle, /aria-controls="display-panel"/);
  assert.match(toggle, /data-act="display"/);
  const panel = element('id="display-panel"');
  assert.match(panel.slice(0, panel.indexOf('>')), /data-folded/);
  for (const pref of ['furigana', 'romaji', 'highlights', 'unsaved', 'gaps']) {
    assert.match(panel, new RegExp(`data-pref="${pref}"`), `${pref} is in the panel`);
  }
  assert.ok(at('id="display-toggle"') < at('id="display-panel"'), 'the button comes before what it opens');
});

test('Speak all and the translate links stay outside the Display panel, and the send links follow the reading', () => {
  const panel = element('id="display-panel"');
  for (const id of ['id="speak-all"', 'id="slow-toggle"', 'data-translate="deepl"', 'data-translate="google"']) {
    assert.ok(!panel.includes(id), `${id} is not folded away`);
  }
  assert.ok(at('data-translate="deepl"') > at('id="reading-body"'), 'DeepL is after the reading');
  assert.ok(at('id="send-hint"') > at('data-translate="google"'), 'the privacy note stays under the links');
});

test('the switches fold only on a phone: under 600px wide or 480px tall', () => {
  const phone = blocks(esc('@media (max-width: 599.98px), (max-height: 480px)'));
  assert.equal(phone.length, 1, 'one phone block');
  assert.match(phone[0], /\.display-toggle\s*\{\s*display:\s*inline-flex/);
  assert.match(phone[0], /\.display-panel\[data-folded\]\s*\{\s*display:\s*none/);
  // Anywhere else, the button is not drawn and nothing folds.
  const outside = css.replace(phone[0], '');
  assert.ok(!/\.display-panel\[data-folded\]/.test(outside), 'no fold outside the phone block');
  assert.match(blocks(esc('.display-toggle'))[0], /display:\s*none/);
});

test('on a touch screen: the arrow-key hint goes, and no text field is under 16px', () => {
  const touch = blocks(esc('@media (pointer: coarse)')).join('\n');
  assert.match(touch, /\.key-hint[^{]*\{\s*display:\s*none/);
  const filter = touch.match(/\.mk-filter-input\s*\{[^}]*font-size:\s*([\d.]+)(rem|px)/);
  assert.ok(filter, 'the filter field has a touch font size');
  const px = filter[2] === 'rem' ? Number(filter[1]) * 16 : Number(filter[1]);
  assert.ok(px >= 16, `the filter field is ${px}px`);
  assert.match(blocks(esc('.yomu-text'))[0], /font-size:\s*1\.25rem/, 'the text box is 20px');
});

test('what scrolls into view stops below the sticky header, and the word sheet and toast clear the bottom safe area', () => {
  assert.match(css, /html:not\(\[data-embed="1"\]\)\s*\{\s*scroll-padding-top:\s*calc\(var\(--header-h-app/);
  const sheet = css.match(/\.side\[data-sheet\]\s*\{[^}]*\}/)[0];
  assert.match(sheet, /padding:[^;]*env\(safe-area-inset-bottom/);
  const toast = blocks(esc('.toast'))[0];
  assert.match(toast, /bottom:[^;]*env\(safe-area-inset-bottom/);
  assert.match(css, /:is\(\.tok, \.it-line\)\s*\{\s*scroll-margin-bottom/);
});

test('after a touch or a pen, focus stays out of the text box; after a key or a mouse it may go there', () => {
  assert.equal(keepOutOfField('touch', false), true);
  assert.equal(keepOutOfField('pen', false), true);
  assert.equal(keepOutOfField('keyboard', true), false, 'a keyboard on a touch screen keeps the box');
  assert.equal(keepOutOfField('mouse', true), false);
  assert.equal(keepOutOfField(null, true), true, 'nothing heard yet, on a finger-first device');
  assert.equal(keepOutOfField(null, false), false);
});

test('a text field is what raises an on-screen keyboard, and a button is not', () => {
  const el = (tagName, type, extra = {}) => ({ tagName, type, closest: () => null, ...extra });
  assert.equal(isField(el('TEXTAREA')), true);
  assert.equal(isField(el('INPUT', 'search')), true);
  assert.equal(isField(el('INPUT', 'text')), true);
  assert.equal(isField(el('INPUT', '')), true);
  assert.equal(isField(el('INPUT', 'checkbox')), false);
  assert.equal(isField(el('INPUT', 'button')), false);
  assert.equal(isField(el('BUTTON')), false);
  assert.equal(isField(el('DIV', undefined, { isContentEditable: true })), true);
  assert.equal(isField(null), false);
});

test('focusHome and the dialogs read the press, so no tap lands focus in the box', () => {
  const read = readFileSync(join(SITE, 'js/events-read.js'), 'utf8');
  assert.match(read, /export function focusHome\(\)[\s\S]{0,300}pressedByTouch\(\)/);
  const dialogs = readFileSync(join(SITE, 'js/dialogs.js'), 'utf8');
  assert.match(dialogs, /isField\(held\)\) held\.blur\(\)/);
  const events = readFileSync(join(SITE, 'js/events.js'), 'utf8');
  assert.match(events, /watchPress\(\);/);
});

test('on a phone the bar keeps one action, My kanji, beside Sign in; Phrases goes into the ⋯ menu', () => {
  const actions = element('class="header-actions"');
  const kept = [...actions.matchAll(/<(button|a)\b[^>]*>/g)].map((m) => m[0]).filter((tag) => /\sdata-keep-mobile[\s>]/.test(tag));
  assert.equal(kept.length, 1, 'one kept action (scripts/check_site_shell.py allows one beside auth and home)');
  assert.match(kept[0], /id="mykanji-open"/);
  assert.doesNotMatch(element('id="phrases-open"'), /data-keep-mobile/);
  assert.match(element('id="mykanji-open"'), /data-due-count/, 'the due count still rides on My kanji');
  const narrow = blocks(esc('@media (max-width: 359.98px)')).join('\n');
  assert.match(narrow, /#mykanji-open\s*\{\s*padding/);
  assert.doesNotMatch(narrow, /#phrases-open/, 'no phone padding for a control the menu holds');
  // Past the kit's 700px every control is in the bar, which does not fold.
  assert.match(blocks(esc('@media (min-width: 700.02px) and (max-width: 899.98px)')).join('\n'), /#lang-toggle\s*\{\s*padding/);
  assert.match(blocks(esc('@media (max-width: 899.98px)')).join('\n'), /#mykanji-open \.mk-due\s*\{\s*position:\s*absolute/);
});

test('a romaji line wraps only when its word is wider than the reading', () => {
  const romaji = blocks(esc('.tok-romaji'))[0];
  assert.match(romaji, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(romaji, /white-space:\s*nowrap/);
});

test('on a touch screen the Word panel\'s note buttons are 44px wide however short the title', () => {
  const touch = blocks(esc('@media (pointer: coarse)')).join('\n');
  assert.match(touch, /\.word-notes \.text-link[^{]*\{[^}]*min-width:\s*44px/);
});

test('the send links move with the phone line, which layout.js and style.css draw at the same place', () => {
  assert.equal(blocks(esc(`@media ${PHONE}`)).length, 1, `style.css has a block for ${PHONE}`);
  assert.match(element('id="send-block"'), /data-translate="google"/);
  assert.match(css, /\.tools-bar > \.send-block\s*\{\s*display:\s*contents/);
  const events = readFileSync(join(SITE, 'js/events.js'), 'utf8');
  assert.match(events, /bindLayout\(\);/);
});

test('the Translation names the send row by its label, never by a place', () => {
  for (const id of ['translateUnsupported', 'translateUnavailable', 'translateBusy']) {
    assert.doesNotMatch(READER_STRINGS[id].en, /\babove\b|\bbelow\b/i, `${id} en`);
    assert.doesNotMatch(READER_STRINGS[id].es, /\barriba\b|\babajo\b/i, `${id} es`);
    assert.match(READER_STRINGS[id].en, /send the text to DeepL or Google Translate/i, `${id} en`);
    assert.match(READER_STRINGS[id].es, /envía el texto a DeepL o a Google Traductor/i, `${id} es`);
  }
});

test('after a touch, a dialog gives focus back with no ring, and to the ⋯ button for a control in its menu', () => {
  const dialogs = readFileSync(join(SITE, 'js/dialogs.js'), 'utf8');
  assert.match(dialogs, /focusVisible: false/);
  assert.match(dialogs, /closest\('\.header-overflow'\)/);
  assert.match(dialogs, /querySelector\('\.header-overflow-toggle'\)/);
});
