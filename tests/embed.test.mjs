// yomu-embed/1, driven with a fake window under plain node.
//
// What these tests hold still is the part of docs/EMBED.md a host depends on
// and a regression would not show on Yomu's own page: who is answered, who is
// ignored, and that nothing is ever posted to "*".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmbed, ALLOWED_ORIGINS, MAX_TEXT, isEmbedded, framingOrigin } from '../js/embed.js';

const RUNCIBLE = 'https://runcible.neorgon.com';
const LOCAL = 'http://localhost:8878';

function fakeWindow() {
  const listeners = new Map();
  const sent = [];
  const frames = [];
  const parent = { postMessage: (msg, origin) => sent.push({ msg, origin }) };
  const win = {
    parent,
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
    removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn)),
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
  };
  return {
    win,
    parent,
    sent,
    dispatch(data, origin = RUNCIBLE, source = parent) {
      for (const fn of listeners.get('message') || []) fn({ data, origin, source });
    },
    flushFrames() {
      for (const fn of frames.splice(0)) fn(0);
    },
    listenerCount: () => (listeners.get('message') || []).length,
  };
}

function setup(overrides = {}) {
  const w = fakeWindow();
  const calls = { load: [], lang: [] };
  let height = 480;
  const embed = createEmbed({
    win: w.win,
    version: '1.0.0',
    onLoad: overrides.onLoad || (async (text) => { calls.load.push(text); return { tokens: 5, unknown: 1 }; }),
    onLang: (lang) => calls.lang.push(lang),
    measure: () => height,
    parentOrigin: overrides.parentOrigin,
  });
  embed.start();
  return { ...w, embed, calls, setHeight: (h) => { height = h; } };
}

const tick = () => new Promise((r) => setImmediate(r));
const of = (sent, type) => sent.filter((s) => s.msg.type === type);

test('boot posts yomu:ready once per allowed origin and never to "*"', () => {
  const { sent } = setup();
  const ready = of(sent, 'yomu:ready');
  assert.deepEqual(ready.map((s) => s.origin), [...ALLOWED_ORIGINS]);
  assert.ok(ready.every((s) => s.msg.v === 1 && s.msg.version === '1.0.0'));
  assert.ok(sent.every((s) => s.origin !== '*'));
});

test('when the browser names the parent, boot posts yomu:ready to it alone', () => {
  const { sent } = setup({ parentOrigin: () => LOCAL });
  const ready = of(sent, 'yomu:ready');
  assert.deepEqual(ready.map((s) => s.origin), [LOCAL]);
});

test('a named parent that is not on the list gets nothing at boot', () => {
  const { sent } = setup({ parentOrigin: () => 'https://evil.example' });
  assert.equal(sent.length, 0);
});

test('framingOrigin reads ancestorOrigins first, then the referrer, then says nothing', () => {
  assert.equal(framingOrigin({ location: { ancestorOrigins: [RUNCIBLE] } }, { referrer: 'https://x.example/a' }), RUNCIBLE);
  assert.equal(framingOrigin({ location: {} }, { referrer: 'http://localhost:8878/#/b/japanese' }), LOCAL);
  assert.equal(framingOrigin({ location: { ancestorOrigins: [] } }, { referrer: '' }), null);
  assert.equal(framingOrigin({ location: {} }, { referrer: 'not a url' }), null);
});

test('yomu:hello from an allowed parent is answered with yomu:ready to that origin', () => {
  const { sent, dispatch, embed } = setup();
  sent.length = 0;
  dispatch({ v: 1, type: 'yomu:hello' }, LOCAL);
  assert.equal(embed.target, LOCAL);
  const ready = of(sent, 'yomu:ready');
  assert.equal(ready.length, 1);
  assert.equal(ready[0].origin, LOCAL);
});

test('a message from an origin not on the list is ignored, with no reply', () => {
  const { sent, dispatch, calls, embed } = setup();
  sent.length = 0;
  dispatch({ v: 1, type: 'yomu:hello' }, 'https://evil.example');
  dispatch({ v: 1, type: 'yomu:load', text: '猫' }, 'https://evil.example');
  dispatch({ v: 1, type: 'yomu:lang', lang: 'es' }, 'https://runcible.neorgon.com.evil.example');
  assert.equal(sent.length, 0);
  assert.equal(calls.load.length, 0);
  assert.equal(calls.lang.length, 0);
  assert.equal(embed.target, null);
});

test('an allowed origin that is not the framing window is ignored', () => {
  const { sent, dispatch, calls } = setup();
  sent.length = 0;
  const stranger = { postMessage() {} };
  dispatch({ v: 1, type: 'yomu:hello' }, RUNCIBLE, stranger);
  dispatch({ v: 1, type: 'yomu:load', text: '猫' }, RUNCIBLE, stranger);
  assert.equal(sent.length, 0);
  assert.equal(calls.load.length, 0);
});

test('a message with another v, or no type, or not an object, is ignored', async () => {
  const { sent, dispatch, calls } = setup();
  sent.length = 0;
  dispatch({ v: 2, type: 'yomu:hello' });
  dispatch({ v: 2, type: 'yomu:load', text: '猫' });
  dispatch({ type: 'yomu:load', text: '猫' });
  dispatch({ v: 1 });
  dispatch('yomu:hello');
  dispatch(null);
  await tick();
  assert.equal(sent.length, 0);
  assert.equal(calls.load.length, 0);
});

test('an unknown type with v 1 is ignored without an error reply', () => {
  const { sent, dispatch } = setup();
  dispatch({ v: 1, type: 'yomu:hello' });
  sent.length = 0;
  dispatch({ v: 1, type: 'yomu:dance' });
  assert.equal(sent.length, 0);
});

test('yomu:load reads the text and answers yomu:read with the counts', async () => {
  const { sent, dispatch, calls } = setup();
  dispatch({ v: 1, type: 'yomu:hello' });
  sent.length = 0;
  dispatch({ v: 1, type: 'yomu:load', text: '私は学生です。' });
  await tick();
  assert.deepEqual(calls.load, ['私は学生です。']);
  const read = of(sent, 'yomu:read');
  assert.equal(read.length, 1);
  assert.equal(read[0].origin, RUNCIBLE);
  assert.deepEqual(read[0].msg, { v: 1, type: 'yomu:read', tokens: 5, unknown: 1 });
});

test('yomu:load with a lang switches the language before reading', async () => {
  const { dispatch, calls } = setup();
  dispatch({ v: 1, type: 'yomu:hello' });
  dispatch({ v: 1, type: 'yomu:load', text: '猫', lang: 'es' });
  await tick();
  assert.deepEqual(calls.lang, ['es']);
  assert.deepEqual(calls.load, ['猫']);
});

test('text over the limit is refused with yomu:error and never read', async () => {
  const { sent, dispatch, calls } = setup();
  dispatch({ v: 1, type: 'yomu:hello' });
  sent.length = 0;
  dispatch({ v: 1, type: 'yomu:load', text: 'あ'.repeat(MAX_TEXT + 1) });
  await tick();
  assert.equal(calls.load.length, 0);
  const err = of(sent, 'yomu:error');
  assert.equal(err.length, 1);
  assert.match(err[0].msg.message, /too long/);
  assert.equal(err[0].origin, RUNCIBLE);
});

test('text exactly at the limit is read', async () => {
  const { dispatch, calls } = setup();
  dispatch({ v: 1, type: 'yomu:hello' });
  dispatch({ v: 1, type: 'yomu:load', text: 'あ'.repeat(MAX_TEXT) });
  await tick();
  assert.equal(calls.load.length, 1);
});

test('a load whose text is not a string is refused with yomu:error', async () => {
  const { sent, dispatch, calls } = setup();
  dispatch({ v: 1, type: 'yomu:hello' });
  sent.length = 0;
  dispatch({ v: 1, type: 'yomu:load', text: 42 });
  await tick();
  assert.equal(calls.load.length, 0);
  assert.equal(of(sent, 'yomu:error').length, 1);
});

test('a load that fails to read answers yomu:error with the reason', async () => {
  const { sent, dispatch } = setup({ onLoad: async () => { throw new Error('data/dict/w03.json: HTTP 404'); } });
  dispatch({ v: 1, type: 'yomu:hello' });
  sent.length = 0;
  dispatch({ v: 1, type: 'yomu:load', text: '猫' });
  await tick();
  const err = of(sent, 'yomu:error');
  assert.equal(err.length, 1);
  assert.equal(err[0].msg.message, 'data/dict/w03.json: HTTP 404');
});

test('only the newest of two overlapping loads is answered', async () => {
  let release;
  const first = new Promise((r) => { release = r; });
  let n = 0;
  const { sent, dispatch } = setup({
    onLoad: async () => (++n === 1 ? first : { tokens: 2, unknown: 0 }),
  });
  dispatch({ v: 1, type: 'yomu:hello' });
  sent.length = 0;
  dispatch({ v: 1, type: 'yomu:load', text: '一' });
  dispatch({ v: 1, type: 'yomu:load', text: '二' });
  await tick();
  release({ tokens: 9, unknown: 9 });
  await tick();
  const read = of(sent, 'yomu:read');
  assert.equal(read.length, 1);
  assert.equal(read[0].msg.tokens, 2);
});

test('yomu:lang switches only to en or es', () => {
  const { dispatch, calls } = setup();
  dispatch({ v: 1, type: 'yomu:lang', lang: 'es' });
  dispatch({ v: 1, type: 'yomu:lang', lang: 'fr' });
  dispatch({ v: 1, type: 'yomu:lang' });
  assert.deepEqual(calls.lang, ['es']);
});

test('replies follow the origin of the last accepted hello', async () => {
  const { sent, dispatch } = setup();
  dispatch({ v: 1, type: 'yomu:hello' }, RUNCIBLE);
  dispatch({ v: 1, type: 'yomu:hello' }, LOCAL);
  sent.length = 0;
  dispatch({ v: 1, type: 'yomu:load', text: '猫' }, RUNCIBLE);
  await tick();
  assert.equal(of(sent, 'yomu:read')[0].origin, LOCAL);
});

test('height is posted at most once per animation frame, and only when it moved', () => {
  const { sent, dispatch, flushFrames, embed, setHeight } = setup();
  embed.queueHeight();
  flushFrames();
  assert.equal(of(sent, 'yomu:height').length, 0, 'no height before a hello names a target');

  dispatch({ v: 1, type: 'yomu:hello' });
  flushFrames();
  assert.deepEqual(of(sent, 'yomu:height').map((s) => [s.msg.height, s.origin]), [[480, RUNCIBLE]]);

  sent.length = 0;
  setHeight(612.4);
  embed.queueHeight();
  embed.queueHeight();
  embed.queueHeight();
  flushFrames();
  assert.deepEqual(of(sent, 'yomu:height').map((s) => s.msg.height), [613]);

  sent.length = 0;
  embed.queueHeight();
  flushFrames();
  assert.equal(of(sent, 'yomu:height').length, 0, 'an unchanged height is not posted again');
});

test('a second hello posts the current height again for the new listener', () => {
  const { sent, dispatch, flushFrames } = setup();
  dispatch({ v: 1, type: 'yomu:hello' });
  flushFrames();
  sent.length = 0;
  dispatch({ v: 1, type: 'yomu:hello' });
  flushFrames();
  assert.equal(of(sent, 'yomu:height').length, 1);
});

test('stop() removes the listener', () => {
  const { embed, listenerCount } = setup();
  assert.equal(listenerCount(), 1);
  embed.stop();
  assert.equal(listenerCount(), 0);
});

test('nothing is posted when the page is not in a frame', () => {
  const w = fakeWindow();
  w.win.parent = w.win;
  const embed = createEmbed({ win: w.win, version: '1', onLoad: async () => ({}), onLang() {}, measure: () => 1 });
  embed.start();
  assert.equal(w.sent.length, 0);
});

test('isEmbedded reads ?embed=1 and nothing else', () => {
  assert.equal(isEmbedded('?embed=1&lang=en'), true);
  assert.equal(isEmbedded('?embed=true'), false);
  assert.equal(isEmbedded(''), false);
});

test('escape tells the host that greeted it, and nobody before a hello', () => {
  const { sent, embed, dispatch } = setup();
  const before = sent.length;
  embed.escape();
  assert.equal(of(sent, 'yomu:escape').length, 0, 'no host has said hello yet');
  assert.equal(sent.length, before);
  dispatch({ v: 1, type: 'yomu:hello' });
  embed.escape();
  const esc = of(sent, 'yomu:escape');
  assert.equal(esc.length, 1);
  assert.equal(esc[0].origin, RUNCIBLE);
  assert.equal(esc[0].msg.v, 1);
});
