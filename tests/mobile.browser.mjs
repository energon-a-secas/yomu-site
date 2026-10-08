// Yomu on a phone, in WebKit and Chromium: what a learner with an iPhone or
// an Android phone meets on every screen.
//
// Not part of npm test: it needs Playwright's browsers and a running server.
// Serve the site root (make serve), then:
//
//   node tests/mobile.browser.mjs [--base=http://localhost:8895/] [--shots=DIR]
//     [--browsers=webkit,chromium] [--devices=se,15,pixel,s24,se1] [--langs=en,es]
//
// PLAYWRIGHT_MODULE names Playwright's index.mjs when the monorepo root's
// node_modules is not three directories up (a worktree kept elsewhere).
//
// Portrait at 375x667 (iPhone SE), 393x852 (iPhone 15), 412x915 (Pixel 7),
// 360x780 (Galaxy S24) and 320x568 (the first iPhone SE) with each device's
// touch, user agent and isMobile, the reader in landscape too, in English and
// Spanish. It fails on what is Yomu's:
//   - focus in the text box after a tap on an example, a phrase or Retry
//     (an on-screen keyboard rises over the reading), or out of it after the
//     same press made with keys on a computer; a focus ring on the header
//     button a tap closed a dialog back to, or none after a key did;
//   - the first word of a reading below the fold on the phones that mark it,
//     the Display switches drawn on a phone (under 600px wide, or on its
//     side) before the Display button opens them, or folded at 1280x800, the
//     Remember card above the reading, Speak all or the translate links
//     hidden;
//   - horizontal scroll, a control of Yomu's under 44px (a link inside a
//     sentence is listed, not failed), a text field under 16px (iOS zooms),
//     a focused element or the chosen word under the sticky header or the
//     word sheet, a dialog that does not fit, a header that does not hold
//     My kanji and Sign in (with Phrases in its ⋯ menu on a phone), two of
//     its controls or the due count overlapping, a tap at either edge of one
//     landing on another, and any console error.
// What belongs to a fleet kit (the header's control height, the Beacon, the
// footer, the Auth Kit's dialog) is printed as a note and does not fail.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { webkit, chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || '../../../node_modules/playwright/index.mjs');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BASE = arg('base', 'http://localhost:8895/');
const SHOTS = arg('shots', '');
const ENGINES = { webkit, chromium };
const PHONES = {
  se: { name: 'iPhone SE (3rd gen)', viewport: { width: 375, height: 667 }, land: 'iPhone SE (3rd gen) landscape', fold: true },
  15: { name: 'iPhone 15', viewport: { width: 393, height: 852 }, land: 'iPhone 15 landscape', fold: true },
  pixel: { name: 'Pixel 7', viewport: { width: 412, height: 915 }, land: 'Pixel 7 landscape' },
  // The narrow end: at 360 the ⋯ menu covered 11px of Sign in, at 320 30px.
  s24: { name: 'Galaxy S24', viewport: { width: 360, height: 780 }, land: 'Galaxy S24 landscape', fold: true },
  se1: { name: 'iPhone SE', viewport: { width: 320, height: 568 }, land: 'iPhone SE landscape' },
};
const browsers = arg('browsers', 'webkit,chromium').split(',');
const phones = arg('devices', 'se,15,pixel,s24,se1').split(',');
const langs = arg('langs', 'en,es').split(',');
const KANJI = 2;          // EXAMPLES[2], 今日は雨が降っています。

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const fails = [];
const notes = new Map();  // fleet-kit findings, counted once per text
const measured = [];

function fail(where, what) { fails.push(`${where}: ${what}`); }
function note(what, where) {
  if (!notes.has(what)) notes.set(what, new Set());
  notes.get(what).add(where);
}

/** Everything one screen is checked for, read in the page. */
function inspect({ chosen = true } = {}) {
  const KITS = [['.header-bar', 'header kit'], ['.neo-footer, .neo-top', 'footer kit'], ['.neo-beacon-link', 'beacon kit'], ['.neo-auth, .neo-auth-dialog', 'auth kit']];
  const ownerOf = (el) => { for (const [sel, who] of KITS) if (el.closest(sel)) return who; return 'yomu'; };
  const name = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const act = el.dataset && el.dataset.act ? `[data-act=${el.dataset.act}]` : '';
    const cls = !id && !act && typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : '';
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${act}${cls} "${text}"`;
  };
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const open = document.querySelector('dialog[open]');
  const live = (el) => !open || open.contains(el);
  const vw = document.documentElement.clientWidth;
  const vh = innerHeight;
  const out = { hscroll: document.documentElement.scrollWidth > vw + 1, small: [], fonts: [], header: [], dialogs: [], under: [], beacon: [] };

  for (const el of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex="0"]')) {
    if (!shown(el) || !live(el) || el.closest('.sr-only') || el.classList.contains('skip-link')) continue;
    // offset sizes, not the box on screen: a button just pressed is scaled by :active.
    const r = el instanceof HTMLElement ? { width: el.offsetWidth, height: el.offsetHeight } : el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) continue;
    if (r.width >= 44 && r.height >= 44) continue;
    const block = el.parentElement;
    const inline = !!block && block.textContent.trim().length > el.textContent.trim().length + 2 && getComputedStyle(el).display.startsWith('inline') && !el.matches('.btn, .seg-btn, .tok');
    out.small.push({ who: ownerOf(el), what: name(el), w: Math.round(r.width), h: Math.round(r.height), inline });
  }
  for (const el of document.querySelectorAll('input, textarea, select')) {
    if (!shown(el) || /^(checkbox|radio|button|submit|file|hidden|range|color)$/i.test(el.type || '')) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 16) out.fonts.push({ who: ownerOf(el), what: name(el), px });
  }

  const bar = document.querySelector('.header-bar');
  let headerBottom = 0;
  if (bar && !open) {
    const b = bar.getBoundingClientRect();
    headerBottom = Math.max(0, b.bottom);
    if (bar.scrollWidth > bar.clientWidth + 1) out.header.push(`the bar scrolls (${bar.scrollWidth} > ${bar.clientWidth})`);
    // On a phone (the kit's 700px) the bar keeps My kanji and Sign in, and
    // Phrases is in the ⋯ menu: kept as well, at 360px the menu covered 11px
    // of Sign in and took its taps.
    const phrases = document.querySelector('#phrases-open');
    const inMenu = !!phrases && !!phrases.closest('.header-overflow-menu');
    if (!phrases) out.header.push('Phrases is gone');
    else if (vw <= 700 && !inMenu) out.header.push('Phrases is kept in the bar on a phone, where the ⋯ menu has room for it');
    else if (vw > 700 && inMenu) out.header.push('Phrases is in the ⋯ menu on a wide screen');
    // [label, selector, must be shown, a tap at either edge must land on it]
    const parts = [
      ['Phrases', '#phrases-open', !inMenu, true], ['My kanji', '#mykanji-open', true, true],
      ['the due count', '#mykanji-open .mk-due:not([hidden])', false, false], ['Play', '#play-open', false, true],
      ['the language', '#lang-toggle', false, true], ['Sign in', '.neo-auth:not([hidden]) button', true, true],
      ['menu', '.header-overflow-toggle', false, true], ['home', '.header-home', true, true],
    ].filter(([label]) => label !== 'Phrases' || !inMenu);
    const onScreen = b.top >= -1;
    const rects = [];
    for (const [label, sel, needed, hit] of parts) {
      const el = document.querySelector(sel);
      if (!el || !shown(el)) { if (needed) out.header.push(`${label} is not shown`); continue; }
      if (el.closest('.header-overflow-menu')) continue;  // in the open ⋯ menu, under the bar
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1) out.header.push(`${label} runs off the screen (${Math.round(r.left)} to ${Math.round(r.right)} of ${vw})`);
      for (const [other, o] of rects) {
        // The due count rides on My kanji's own corner.
        if ([label, other].includes('the due count') && [label, other].includes('My kanji')) continue;
        const x = Math.min(r.right, o.right) - Math.max(r.left, o.left);
        const y = Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top);
        if (x > 1 && y > 1) out.header.push(`${label} overlaps ${other} by ${Math.round(x)}px`);
      }
      rects.push([label, r]);
      if (!hit || !onScreen) continue;
      for (const [edge, x] of [['left', r.left + 3], ['right', r.right - 3]]) {
        const got = document.elementFromPoint(x, (r.top + r.bottom) / 2);
        if (got && !el.contains(got)) out.header.push(`a tap at ${label}'s ${edge} edge lands on ${name(got)}`);
      }
    }
  }

  for (const d of document.querySelectorAll('dialog[open]')) {
    const r = d.getBoundingClientRect();
    if (r.top < -1 || r.left < -1 || r.bottom > vh + 1 || r.right > vw + 1) out.dialogs.push(`${name(d)} is ${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)} in ${vw}x${vh}`);
    for (const b of d.querySelectorAll('button')) {
      if (!shown(b)) continue;
      const q = b.getBoundingClientRect();
      const scrolls = d.scrollHeight > d.clientHeight + 1;
      if (!scrolls && (q.bottom > r.bottom + 1 || q.right > r.right + 1)) out.dialogs.push(`${name(b)} is outside ${name(d)}`);
    }
  }

  const sheet = document.querySelector('.side[data-sheet]');
  const sheetTop = sheet && shown(sheet) && getComputedStyle(sheet).position === 'sticky' ? sheet.getBoundingClientRect().top : vh;
  const checkClear = (el, label) => {
    if (!el || !shown(el) || el === document.body || el.id === 'main' || el.closest('.header-bar, dialog, .side')) return;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh) return;
    if (r.top < headerBottom - 1) out.under.push(`${label} ${name(el)} is under the header (${Math.round(r.top)} < ${Math.round(headerBottom)})`);
    if (r.bottom > sheetTop + 1) out.under.push(`${label} ${name(el)} is under the word sheet (${Math.round(r.bottom)} > ${Math.round(sheetTop)})`);
  };
  if (!open) {
    checkClear(document.activeElement, 'focus on');
    if (chosen) checkClear(document.querySelector('#reading-body .tok[aria-pressed="true"]'), 'the chosen word');
  }

  const beacon = document.querySelector('.neo-beacon-link');
  if (beacon && shown(beacon) && !open) {
    const z = beacon.getBoundingClientRect();
    const seen = new Set();
    for (const el of document.querySelectorAll('button, a[href], .tok, p, li, label, summary, h2, h3, span')) {
      if (el === beacon || beacon.contains(el) || !shown(el) || el.closest('.sr-only')) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !el.matches('button, a[href], .tok')) continue;
      const r = el.getBoundingClientRect();
      if (Math.min(r.right, z.right) - Math.max(r.left, z.left) > 2 && Math.min(r.bottom, z.bottom) - Math.max(r.top, z.top) > 2) {
        const what = `${ownerOf(el) === 'yomu' ? '' : `${ownerOf(el)}: `}${name(el)}`;
        if (!seen.has(what)) { seen.add(what); out.beacon.push(what); }
      }
    }
  }
  return out;
}

async function audit(page, where, screen, opts = {}) {
  const r = await page.evaluate(inspect, opts);
  const at = `${where} ${screen}`;
  if (r.hscroll) fail(at, 'the page scrolls sideways');
  for (const s of r.small) {
    const line = `${s.what} is ${s.w}x${s.h}`;
    if (s.who !== 'yomu') note(`${s.who}: ${s.what} is ${s.h}px tall${s.w < 44 ? ` and ${s.w}px wide` : ''}`, `${where.split(' ').slice(0, 2).join(' ')}`);
    else if (s.inline) note(`yomu, a link inside a sentence: ${s.what} is ${s.h}px tall`, screen);
    else fail(at, `${line}, under 44px`);
  }
  for (const f of r.fonts) (f.who === 'yomu' ? fail : (m) => note(`${f.who}: ${m}`, at))(at, `${f.what} is ${f.px}px, under 16px: iOS zooms on focus`);
  for (const h of r.header) fail(at, `header: ${h}`);
  for (const d of r.dialogs) fail(at, `dialog: ${d}`);
  for (const u of r.under) fail(at, u);
  for (const b of r.beacon) note(`beacon kit: the Beacon covers ${b}`, `${screen}`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${where.replace(/ /g, '-')}-${screen}.png`) });
}

async function context(browser, device, lang, extra = {}) {
  const { defaultBrowserType, ...d } = devices[device];
  const ctx = await browser.newContext({ ...d, ...extra, locale: lang === 'es' ? 'es-ES' : 'en-US' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('pageerror', (e) => page.errors.push(String(e)));
  return { ctx, page };
}

/** Counts every focus the text box gets from now on. */
const watchBox = (page) => page.evaluate(() => {
  window.__boxFocus = 0;
  document.getElementById('yomu-text').addEventListener('focus', () => { window.__boxFocus += 1; });
});
const boxState = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return { focused: window.__boxFocus, field: !!a && /^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName), on: a ? (a.id || a.tagName.toLowerCase()) : null };
});

async function expectNoKeyboard(page, at, what) {
  const s = await boxState(page);
  if (s.focused || s.field) fail(at, `${what} put focus in a text field (${s.on}, ${s.focused} focus on the box): a phone raises its keyboard`);
}

const tap = (page, sel) => page.locator(sel).first().tap();

/** One step of a walk: a step that throws is a failure, and the walk goes on. */
async function step(where, label, fn) {
  try {
    await fn();
  } catch (err) {
    fail(where, `${label} did not finish: ${String(err.message || err).split('\n')[0]}`);
  }
}

/** Phrases is in the header kit's ⋯ menu on a phone, and in the bar above 700px. */
async function openPhrases(page) {
  if (await page.locator('.header-overflow-menu #phrases-open').count()) {
    await tap(page, '.header-overflow-toggle');
    await page.waitForSelector('.header-overflow-menu.open #phrases-open');
  }
  await tap(page, '#phrases-open');
}

async function readExample(page, ix) {
  await tap(page, `.example[data-ex="${ix}"]`);
  await page.waitForSelector('#reading-body .tok');
  await page.waitForTimeout(150);
}

async function reader(browser, phone, lang) {
  const where = `${browser.engine} ${phone.key} ${lang}`;
  const { ctx, page } = await context(browser, phone.name, lang, { viewport: phone.viewport, screen: phone.viewport });
  await step(where, 'the empty page', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.example');
    await audit(page, where, 'empty');
  });

  await step(where, 'a reading', async () => {
    await watchBox(page);
    await readExample(page, KANJI);
    await expectNoKeyboard(page, where, 'a tap on an example');
    const lay = await page.evaluate(() => {
      const top = (sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length ? Math.round(el.getBoundingClientRect().top + scrollY) : null; };
      const bottom = (sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length ? Math.round(el.getBoundingClientRect().bottom + scrollY) : null; };
      const vis = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
      return {
        word: top('#reading-body .tok'), vh: innerHeight, ask: top('#remember-ask'), readingEnd: bottom('#reading'),
        toggle: vis('#display-toggle'), expanded: document.querySelector('#display-toggle')?.getAttribute('aria-expanded'),
        panel: vis('#display-panel'), speak: vis('#speak-all'), deepl: vis('[data-translate="deepl"]'), google: vis('[data-translate="google"]'),
        keyHint: vis('.key-hint'),
      };
    });
    measured.push(`${where}: first word at ${lay.word}px of a ${lay.vh}px screen, Remember card at ${lay.ask}`);
    if (phone.fold && !(lay.word < lay.vh)) fail(where, `the first word is at ${lay.word}px, below the ${lay.vh}px fold`);
    if (lay.ask !== null && lay.ask < lay.readingEnd) fail(where, `the Remember card (${lay.ask}) is above the end of the reading (${lay.readingEnd})`);
    if (!lay.toggle || lay.expanded !== 'false' || lay.panel) fail(where, `under 600px the Display button should show, folded (button ${lay.toggle}, aria-expanded ${lay.expanded}, switches ${lay.panel})`);
    if (!lay.speak || !lay.deepl || !lay.google) fail(where, `Speak all ${lay.speak}, DeepL ${lay.deepl}, Google ${lay.google}: all should be reachable without Display`);
    if (lay.keyHint) fail(where, 'the arrow-key hint is drawn on a touch screen');
    await audit(page, where, 'reading');
  });

  await step(where, 'the Display button', async () => {
    await tap(page, '#display-toggle');
    const opened = await page.evaluate(() => ({ e: document.querySelector('#display-toggle').getAttribute('aria-expanded'), n: [...document.querySelectorAll('#display-panel .seg')].filter((s) => s.getClientRects().length).length }));
    if (opened.e !== 'true' || opened.n !== 5) fail(where, `Display opened: aria-expanded ${opened.e}, ${opened.n} of 5 switches shown`);
    await audit(page, where, 'display-open');
    await tap(page, '#display-toggle');
  });

  await step(where, 'the word, kanji and notes panels', async () => {
    await tap(page, '#reading-body .tok');
    await page.waitForSelector('#side[data-sheet] #word-body *');
    await page.waitForTimeout(300);
    await audit(page, where, 'word');
    await tap(page, '.side-tab[data-tab="kanji"]');
    await page.waitForSelector('#kanji-body [data-act="save-kanji"]');
    await audit(page, where, 'kanji');
    await tap(page, '#kanji-body [data-act="save-kanji"]');
    await tap(page, '.side-tab[data-tab="notes"]');
    await audit(page, where, 'notes-tab');
    await tap(page, '.side-close');
    const line = page.locator('#in-text-body [data-act="note"]').first();
    if (await line.count()) {
      await line.scrollIntoViewIfNeeded();
      await line.tap();
      await page.waitForTimeout(300);
      await audit(page, where, 'note');
      await tap(page, '.side-close');
    }
  });

  await step(where, 'the Remember card', async () => {
    await watchBox(page);
    if (!(await page.locator('#remember-ask:not([hidden])').count())) return;
    await page.locator('#remember-ask').scrollIntoViewIfNeeded();
    await audit(page, where, 'remember-ask');
    await tap(page, '[data-act="remember-no"]');
    await expectNoKeyboard(page, where, 'a tap on No thanks');
  });

  // Safari focuses no button a tap presses, so the box can still hold focus
  // when Phrases opens: the second opening here is made that way, and the
  // text box's focus ring then rode onto the header button the dialog gave
  // focus back to (real iOS 26.5, Frases, then Leerla).
  await step(where, 'Phrases', async () => {
    await page.evaluate(() => scrollTo(0, 0));
    await openPhrases(page);
    await page.waitForSelector('#phrases-dialog [data-act="read-phrase"]');
    await audit(page, where, 'phrases');
    await page.locator('#phrases-dialog [data-dialog-close]').first().tap();
    await page.evaluate(() => {
      document.getElementById('yomu-text').focus();
      // The kit's menu opens with focus on its first item, moved there by script.
      const menu = document.querySelector('.header-overflow-menu #phrases-open') && document.querySelector('.header-overflow-toggle');
      if (menu) menu.click();
      document.getElementById('phrases-open').click();
    });
    await page.waitForSelector('#phrases-dialog [data-act="read-phrase"]');
    await watchBox(page);
    await tap(page, '#phrases-dialog [data-act="read-phrase"]');
    await page.waitForTimeout(300);
    await expectNoKeyboard(page, where, 'a tap on a phrase');
    const back = await page.evaluate(() => {
      const a = document.activeElement;
      return { on: a ? (a.id || a.className || a.tagName) : null, header: !!a && !!a.closest('.header-bar'), ring: !!a && a.matches(':focus-visible') };
    });
    if (!back.header) fail(where, `Phrases closed with focus on ${back.on}, not on the header button that opened it`);
    if (back.ring) fail(where, `a tap closed Phrases and ${back.on} shows a focus ring`);
  });

  await step(where, 'the header menu', async () => {
    if (!(await page.locator('.header-overflow-toggle').count())) return;
    await page.evaluate(() => scrollTo(0, 0));
    await tap(page, '.header-overflow-toggle');
    await page.waitForTimeout(150);
    if (!(await page.locator('.header-overflow-menu.open #phrases-open').isVisible())) fail(where, 'Phrases is not in the open ⋯ menu');
    await audit(page, where, 'header-menu');
    await page.keyboard.press('Escape');
  });

  await step(where, 'My kanji and the review', async () => {
    await tap(page, '#mykanji-open');
    await page.waitForSelector('#mykanji:not([hidden]) #mk-body *');
    await audit(page, where, 'mykanji');
    if (!(await page.locator('[data-act="mk-start"]').count())) return;
    await tap(page, '[data-act="mk-start"]');
    await page.waitForSelector('[data-act="rv-show"]');
    await audit(page, where, 'review');
    await tap(page, '[data-act="rv-show"]');
    await audit(page, where, 'review-shown');
    await tap(page, '[data-act="rv-got"]');
    await page.waitForTimeout(200);
    await audit(page, where, 'review-done');
    await tap(page, '#mk-back');
  });

  await step(where, 'the Collection and a tile', async () => {
    await tap(page, '.mk-tab[data-tab="collection"]');
    await page.waitForSelector('.col-shelf');
    if (!(await page.locator('.col-shelf[open]').count())) await tap(page, '.col-sum');
    await page.waitForSelector('.col-tile');
    await audit(page, where, 'collection');
    await tap(page, '.col-tile');
    await page.waitForSelector('#col-dialog[open]');
    await page.waitForTimeout(200);
    await audit(page, where, 'tile-dialog');
    await page.locator('#col-dialog [data-dialog-close]').first().tap();
  });

  await step(where, 'History', async () => {
    await tap(page, '.mk-tab[data-tab="history"]');
    await page.waitForTimeout(200);
    await audit(page, where, 'history');
  });

  await step(where, 'Clear all', async () => {
    await tap(page, '.mk-tab[data-tab="list"]');
    await tap(page, '[data-act="mk-clear"]');
    await page.waitForSelector('#mk-clear-dialog[open]');
    await audit(page, where, 'clear-dialog');
    await page.locator('#mk-clear-dialog [data-dialog-close]').first().tap();
  });

  // On localhost the kit says the key only works on neorgon.com: expected.
  await step(where, 'Sign in', async () => {
    if (!(await page.locator('.neo-auth:not([hidden]) button').count())) return;
    await page.evaluate(() => scrollTo(0, 0));
    await tap(page, '.neo-auth:not([hidden]) button');
    await page.waitForSelector('dialog.neo-auth-dialog[open]');
    await page.waitForTimeout(400);
    await audit(page, where, 'signin');
    await page.keyboard.press('Escape');
  });

  for (const e of page.errors) fail(where, `console: ${e.slice(0, 160)}`);
  await ctx.close();
}

async function play(browser, phone, lang) {
  const where = `${browser.engine} ${phone.key} ${lang}`;
  const { ctx, page } = await context(browser, phone.name, lang, { viewport: phone.viewport, screen: phone.viewport, reducedMotion: 'reduce' });
  await step(where, 'Play', async () => {
    await page.goto(`${BASE}#/play`);
    await page.waitForSelector('[data-act="pl-start"]');
    await audit(page, where, 'play');
  });
  for (const game of ['which', 'odd', 'twins', 'names', 'spaces']) await step(where, `Play ${game}`, async () => {
    if (!(await page.locator('[data-act="pl-start"]').count())) { await page.goto(`${BASE}#/play`); await page.waitForSelector('[data-act="pl-start"]'); }
    await tap(page, `[data-act="pl-start"][data-game="${game}"]`);
    await page.waitForSelector('[data-act="pl-pick"], [data-act="pl-cell"], [data-act="sp-check"]');
    await audit(page, where, `play-${game}`);
    for (let step = 0; step < 40; step += 1) {
      if (await page.locator('[data-act="pl-again"]').count()) break;
      if (await page.locator('[data-act="pl-next"]').count()) {
        if (step === 1) await audit(page, where, `play-${game}-answered`);
        await tap(page, '[data-act="pl-next"]');
      } else if (await page.locator('[data-act="sp-check"]').count()) await tap(page, '[data-act="sp-check"]');
      else if (await page.locator('[data-act="pl-cell"]').count()) {
        const ix = await page.evaluate(() => {
          const cells = [...document.querySelectorAll('#pl-body .pl-cell')];
          const n = new Map();
          for (const c of cells) n.set(c.textContent, (n.get(c.textContent) || 0) + 1);
          return cells.findIndex((c) => n.get(c.textContent) === 1);
        });
        await page.locator('[data-act="pl-cell"]').nth(Math.max(0, ix)).tap();
      } else await tap(page, '[data-act="pl-pick"]');
      await page.waitForTimeout(60);
    }
    await page.waitForSelector('[data-act="pl-again"]');
    await audit(page, where, `play-${game}-result`);
    await tap(page, '#pl-back');
    await page.waitForSelector('[data-act="pl-start"]');
  });
  for (const e of page.errors) {
    // A static page learns a data file is missing only by asking (CLAUDE.md, Play).
    if (/404/.test(e) && /names/.test(e)) continue;
    fail(where, `console: ${e.slice(0, 160)}`);
  }
  await ctx.close();
}

async function retry(browser, phone, lang) {
  const where = `${browser.engine} ${phone.key} ${lang}`;
  const { ctx, page } = await context(browser, phone.name, lang, { viewport: phone.viewport, screen: phone.viewport });
  await step(where, 'Retry', async () => {
    await page.route('**/data/dict/**', (r) => r.abort());
    await page.goto(BASE);
    await page.waitForSelector('.example');
    await tap(page, `.example[data-ex="${KANJI}"]`);
    await page.waitForSelector('#read-error [data-act="retry"]');
    await audit(page, where, 'read-error');
    await page.unroute('**/data/dict/**');
    await watchBox(page);
    await tap(page, '#read-error [data-act="retry"]');
    await page.waitForSelector('#reading-body .tok');
    await expectNoKeyboard(page, where, 'a tap on Retry');
  });
  await ctx.close();
}

/**
 * A keyboard on a phone or a tablet: the arrows walk back from a chosen word
 * past the top of the screen. WebKit scrolls the focused word to the very
 * top, where the header, back on the scroll up, covered it.
 */
async function arrows(browser, phone, lang) {
  const where = `${browser.engine} ${phone.key} ${lang}`;
  const { ctx, page } = await context(browser, phone.name, lang, { viewport: phone.viewport, screen: phone.viewport, reducedMotion: 'reduce' });
  await step(where, 'the arrow keys', async () => {
    await page.goto(`${BASE}#t=${encodeURIComponent('わたしはパンをたべます。'.repeat(14))}`);
    await page.waitForSelector('#reading-body .tok');
    const toks = page.locator('#reading-body .tok');
    const at = Math.floor((await toks.count()) * 0.7);
    await toks.nth(at).scrollIntoViewIfNeeded();
    await toks.nth(at).tap();
    await page.waitForSelector('#side[data-sheet]');
    await page.focus('#reading-body .tok[aria-pressed="true"]');
    for (let i = 0; i < 30; i += 1) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(400);
    // Focus left the chosen word behind on purpose: only where focus is counts.
    await audit(page, where, 'arrows', { chosen: false });
  });
  for (const e of page.errors) fail(where, `console: ${e.slice(0, 160)}`);
  await ctx.close();
}

/**
 * The header alone, at the phone's width upright and on its side, in this
 * language, with no review due and with 128 due (a three-digit count on My
 * kanji's corner): nothing in the bar overlaps, and a tap at either edge of a
 * control lands on it. On its side an iPhone 15 is 734px wide, past the kit's
 * 700px, where every control is in the bar.
 */
async function header(browser, phone, lang) {
  for (const [due, side] of [[0, false], [128, false], [0, true], [128, true]]) {
    const where = `${browser.engine} ${phone.key}${side ? '-landscape' : ''} ${lang} ${due ? `${due}-due` : 'none-due'}`;
    const { ctx, page } = side ? await context(browser, phone.land, lang) : await context(browser, phone.name, lang, { viewport: phone.viewport, screen: phone.viewport });
    await step(where, 'the header', async () => {
      if (due) await page.addInitScript((n) => {
        const saved = {};
        for (let i = 0; i < n; i += 1) saved[String.fromCodePoint(0x4e00 + i * 7)] = { at: Date.now() - 864e5, box: 0, due: '2026-01-01', reviews: 0, lapses: 0 };
        if (!localStorage.getItem('yomu-site:kanji')) localStorage.setItem('yomu-site:kanji', JSON.stringify({ __v: 1, data: { saved, seen: {}, session: { id: 1, counted: [] } } }));
      }, due);
      await page.goto(BASE);
      await page.waitForSelector('.example');
      await page.waitForSelector('.neo-auth:not([hidden]) button');
      await page.waitForTimeout(200);
      const shown = await page.evaluate(() => {
        const b = document.querySelector('#mykanji-open .mk-due');
        return b && !b.hidden && b.getClientRects().length ? b.textContent.replace(/\D+/g, ' ').trim().split(' ')[0] : null;
      });
      if (due && shown !== String(due)) fail(where, `My kanji shows ${shown === null ? 'no due count' : `a due count of ${shown}`}, not ${due}`);
      if (!due && shown !== null) fail(where, `My kanji shows a due count of ${shown} with none due`);
      measured.push(`${where}: header at ${await page.evaluate(() => innerWidth)}px, due count ${shown === null ? 'hidden' : shown}`);
      await audit(page, where, 'header');
    });
    for (const e of page.errors) fail(where, `console: ${e.slice(0, 160)}`);
    await ctx.close();
  }
}

async function landscape(browser, phone, lang) {
  const where = `${browser.engine} ${phone.key}-landscape ${lang}`;
  const { ctx, page } = await context(browser, phone.land, lang);
  await step(where, 'the reader in landscape', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.example');
    await readExample(page, KANJI);
    // A phone on its side is wide but short: the switches fold there too.
    const lay = await page.evaluate(() => ({ h: innerHeight, word: Math.round(document.querySelector('#reading-body .tok').getBoundingClientRect().top + scrollY), toggle: !!document.querySelector('#display-toggle')?.getClientRects().length, panel: !!document.querySelector('#display-panel')?.getClientRects().length }));
    measured.push(`${where}: first word at ${lay.word}px of a ${lay.h}px screen`);
    if (lay.h <= 480 && (!lay.toggle || lay.panel)) fail(where, `${lay.h}px tall: the switches should fold behind Display (button ${lay.toggle}, switches ${lay.panel})`);
    await audit(page, where, 'reading');
    await tap(page, '#reading-body .tok');
    await page.waitForSelector('#side[data-sheet] #word-body *');
    await page.waitForTimeout(300);
    await audit(page, where, 'word');
  });
  for (const e of page.errors) fail(where, `console: ${e.slice(0, 160)}`);
  await ctx.close();
}

/** On a computer, a key press keeps focus in the box, as it always did. */
async function keys(browser) {
  const where = `${browser.engine} desktop`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await step(where, 'Enter on an example', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.example');
    await page.focus(`.example[data-ex="${KANJI}"]`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#reading-body .tok');
    const on = await page.evaluate(() => document.activeElement && document.activeElement.id);
    if (on !== 'yomu-text') fail(where, `Enter on an example left focus on ${on}, not the text box`);
    const shown = (sel) => `!!document.querySelector('${sel}')?.getClientRects().length`;
    const wide = await page.evaluate(`({ toggle: ${shown('#display-toggle')}, panel: ${shown('#display-panel')} })`);
    if (wide.toggle || !wide.panel) fail(where, `at 1280px the switches show and the Display button does not (button ${wide.toggle}, switches ${wide.panel})`);
  });
  // A key that closes Phrases gives its button focus back with a ring.
  await step(where, 'Escape from Phrases', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // The kit brings Phrases back out of the ⋯ menu on the next frame.
    await page.waitForSelector('.header-actions > #phrases-open');
    await page.evaluate(() => scrollTo(0, 0));
    await page.focus('#phrases-open');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#phrases-dialog[open]');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const back = await page.evaluate(() => { const a = document.activeElement; return { on: a && (a.id || a.tagName), ring: !!a && a.matches(':focus-visible') }; });
    if (back.on !== 'phrases-open' || !back.ring) fail(where, `Escape closed Phrases with focus on ${back.on}, ring ${back.ring}: a keyboard user needs both`);
  });
  await ctx.close();
}

await Promise.all(browsers.map(async (engine) => {
  const browser = await ENGINES[engine].launch();
  browser.engine = engine;
  await keys(browser);
  for (const key of phones) {
    const phone = { key, ...PHONES[key] };
    for (const lang of langs) {
      await header(browser, phone, lang);
      await reader(browser, phone, lang);
      await retry(browser, phone, lang);
      await arrows(browser, phone, lang);
      await landscape(browser, phone, lang);
      await play(browser, phone, lang);
    }
  }
  await browser.close();
}));

console.log(measured.sort().join('\n'));
if (notes.size) {
  console.log('\nFleet kits and inline links (notes, not failures):');
  for (const [what, where] of notes) console.log(`  ${what}  [${[...where].slice(0, 4).join('; ')}${where.size > 4 ? `; +${where.size - 4}` : ''}]`);
}
if (fails.length) {
  console.log(`\n${fails.length} failed:`);
  for (const f of fails) console.log(`  ${f}`);
  process.exitCode = 1;
} else console.log('\nmobile: every check passed');
