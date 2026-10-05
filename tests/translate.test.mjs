// translate.js: the on-device Translator API, with a fake in its place.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTranslation, translatorApi, CACHE } from '../js/translate.js';

/** A Translator interface that answers `phase` and counts what it is asked. */
function fake({ phase = 'available', fail = null, progress = [] } = {}) {
  const calls = { availability: [], create: [], translate: [] };
  const api = {
    async availability(opts) { calls.availability.push(opts); if (phase instanceof Error) throw phase; return phase; },
    async create(opts) {
      calls.create.push(opts);
      if (fail) throw fail;
      const listeners = [];
      opts.monitor({ addEventListener: (type, fn) => { if (type === 'downloadprogress') listeners.push(fn); } });
      for (const loaded of progress) for (const fn of listeners) fn({ loaded });
      return { async translate(text) { calls.translate.push(text); return `[${opts.targetLanguage}] ${text}`; } };
    },
  };
  return { api, calls };
}

test('no Translator API reads as unsupported, and translating rejects', async () => {
  assert.equal(translatorApi({}), null);
  assert.equal(translatorApi({ Translator: { availability() {} } }), null);
  const tr = createTranslation({ api: null });
  assert.equal(tr.supported, false);
  assert.equal(await tr.check('en'), 'unsupported');
  await assert.rejects(tr.translate('雨', 'en'));
});

test('check asks for Japanese to the target and passes the four answers through', async () => {
  for (const phase of ['unavailable', 'downloadable', 'downloading', 'available']) {
    const { api, calls } = fake({ phase });
    assert.equal(await createTranslation({ api }).check('es'), phase);
    assert.deepEqual(calls.availability[0], { sourceLanguage: 'ja', targetLanguage: 'es' });
  }
});

test('a rejected or unknown availability (a frame with no allow="translator") reads as unavailable', async () => {
  assert.equal(await createTranslation({ api: fake({ phase: new Error('NotAllowedError') }).api }).check('en'), 'unavailable');
  assert.equal(await createTranslation({ api: fake({ phase: 'readily' }).api }).check('en'), 'unavailable');
});

test('one translator per language, reused, and the same text is translated once', async () => {
  const { api, calls } = fake();
  const tr = createTranslation({ api });
  assert.equal(await tr.translate('今日は雨です。', 'en'), '[en] 今日は雨です。');
  assert.equal(await tr.translate('今日は雨です。', 'en'), '[en] 今日は雨です。');
  assert.equal(await tr.translate('猫', 'en'), '[en] 猫');
  assert.equal(await tr.translate('猫', 'es'), '[es] 猫');
  assert.equal(calls.create.length, 2);
  assert.deepEqual(calls.translate, ['今日は雨です。', '猫', '猫']);
});

test('download progress reaches the caller that created the translator', async () => {
  const seen = [];
  const tr = createTranslation({ api: fake({ progress: [0.25, 1] }).api });
  await tr.translate('雨', 'en', (p) => seen.push(p));
  assert.deepEqual(seen, [0.25, 1]);
});

test('a translator that failed to be created is tried again next time', async () => {
  const broken = fake({ fail: new Error('NotAllowedError: needs a click') });
  const tr = createTranslation({ api: broken.api });
  await assert.rejects(tr.translate('雨', 'en'), /needs a click/);
  await assert.rejects(tr.translate('雨', 'en'), /needs a click/);
  assert.equal(broken.calls.create.length, 2);
});

test('the in-memory cache keeps the newest translations only', async () => {
  const { api, calls } = fake();
  const tr = createTranslation({ api });
  for (let i = 0; i <= CACHE; i += 1) await tr.translate(`文${i}`, 'en');
  await tr.translate(`文${CACHE}`, 'en');      // newest: cached
  await tr.translate('文0', 'en');              // oldest: asked again
  assert.equal(calls.translate.length, CACHE + 2);
});

test('an availability that never answers counts as unavailable after the wait', async () => {
  const api = { availability: () => new Promise(() => {}), create: async () => ({}) };
  const started = Date.now();
  assert.equal(await createTranslation({ api, checkMs: 30 }).check('en'), 'unavailable');
  assert.ok(Date.now() - started < 1000);
});
