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

test('on a touch screen, the arrow-key hint goes', () => {
  const touch = blocks(esc('@media (pointer: coarse)')).join('\n');
  assert.match(touch, /\.key-hint[^{]*\{\s*display:\s*none/);
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
