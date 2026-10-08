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
