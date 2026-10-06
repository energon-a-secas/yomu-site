// translate.js: the on-device Translator API, with a fake in its place.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTranslation, translatorApi, failureKind, CACHE, QUIET_MS } from '../js/translate.js';

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

// A translation that hangs. In a real Chrome 154 run a create() or a
// translate() never settled and the section said "Translating on this
// device." until a reload, so a request now fails after QUIET_MS with neither
// download progress nor a result, and these tests set the period to a few
// milliseconds. `within` turns a request that would wait forever into a
// failure that names the wait, so a regression fails here instead of stalling
// the run.

function within(promise, ms = 1000) {
  let timer = null;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function failsAs(promise, kind) {
  const err = await within(promise).then(() => assert.fail('it resolved'), (e) => e);
  assert.equal(failureKind(err), kind, String(err && err.message));
  return err;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A translator whose translate() answers `[target] text`. */
const working = (target) => ({ async translate(text) { return `[${target}] ${text}`; } });

test('the quiet period is twenty seconds unless a caller says otherwise', () => {
  assert.equal(QUIET_MS, 20000);
});

test('a create() that never settles fails after the quiet period, and the next try creates a fresh translator', async () => {
  const calls = [];
  const api = {
    async availability() { return 'downloadable'; },
    create(opts) {
      calls.push(opts);
      return calls.length === 1 ? new Promise(() => {}) : Promise.resolve(working(opts.targetLanguage));
    },
  };
  const tr = createTranslation({ api, quietMs: 30 });
  await failsAs(tr.translate('雨', 'en'), 'quiet');
  assert.equal(await within(tr.translate('雨', 'en')), '[en] 雨');
  assert.equal(calls.length, 2);
});

test('a translate() that never settles fails after the quiet period, and the hung translator is forgotten', async () => {
  const made = [];
  const api = {
    async availability() { return 'available'; },
    async create(opts) {
      const t = made.length === 0 ? { translate: () => new Promise(() => {}) } : working(opts.targetLanguage);
      made.push(t);
      return t;
    },
  };
  const tr = createTranslation({ api, quietMs: 30 });
  await failsAs(tr.translate('雨', 'en'), 'quiet');
  assert.equal(await within(tr.translate('雨', 'en')), '[en] 雨');
  assert.equal(made.length, 2);
});

test('download progress that keeps arriving past the quiet period is no failure', async () => {
  // Fifteen events 20 ms apart: 300 ms in all, three quiet periods of 100 ms.
  const api = {
    async availability() { return 'downloadable'; },
    create(opts) {
      const heard = [];
      opts.monitor({ addEventListener: (type, fn) => { if (type === 'downloadprogress') heard.push(fn); } });
      return new Promise((resolve) => {
        let i = 0;
        const tick = setInterval(() => {
          i += 1;
          for (const fn of heard) fn({ loaded: i / 15 });
          if (i === 15) { clearInterval(tick); resolve(working(opts.targetLanguage)); }
        }, 20);
      });
    },
  };
  const seen = [];
  const started = Date.now();
  const tr = createTranslation({ api, quietMs: 100 });
  assert.equal(await within(tr.translate('雨', 'en', (p) => seen.push(p)), 3000), '[en] 雨');
  assert.ok(Date.now() - started >= 250, `${Date.now() - started} ms`);
  assert.equal(seen.length, 15);
  assert.equal(seen.at(-1), 1);
});

test('a late answer after the failure reaches nobody: no more progress, no adopted translator', async () => {
  const hung = [];
  let fire = null;
  const api = {
    async availability() { return 'downloadable'; },
    create(opts) {
      if (hung.length) return Promise.resolve(working(opts.targetLanguage));
      const heard = [];
      opts.monitor({ addEventListener: (type, fn) => { if (type === 'downloadprogress') heard.push(fn); } });
      fire = (loaded) => { for (const fn of heard) fn({ loaded }); };
      return new Promise((resolve) => { hung.push(() => resolve({ async translate(text) { return `late ${text}`; } })); });
    },
  };
  const seen = [];
  const tr = createTranslation({ api, quietMs: 30 });
  const first = tr.translate('雨', 'en', (p) => seen.push(p));
  await settle();
  fire(0.5);
  await failsAs(first, 'quiet');
  // The download speaks again after the failure: the failed request does not
  // hear it, so the page cannot go back to "Downloading" with nothing to end it.
  fire(0.9);
  assert.deepEqual(seen, [0.5]);
  // The hung translator arrives at last. It is not the one the next request
  // uses: that one is created afresh.
  hung[0]();
  await settle();
  assert.equal(await within(tr.translate('猫', 'en')), '[en] 猫');
});

test('each failure the page can explain has a kind, and anything else keeps its own text', () => {
  assert.equal(failureKind(new DOMException('Requires a user gesture.', 'NotAllowedError')), 'click');
  assert.equal(failureKind(new DOMException('The input is too large.', 'QuotaExceededError')), 'busy');
  // How Chrome refuses a translator when the service count is over its limit:
  // NotSupportedError with a generic message, the reason on the console only.
  assert.equal(failureKind(new DOMException('Unable to create translator for the given source and target language.', 'NotSupportedError')), 'busy');
  assert.equal(failureKind(new Error('The translation service count exceeded the limitation.')), 'busy');
  assert.equal(failureKind(new Error('Too many Translator API requests are queued.')), 'busy');
  assert.equal(failureKind(new DOMException('The operation timed out.', 'TimeoutError')), 'quiet');
  assert.equal(failureKind(new DOMException('The network is down.', 'NetworkError')), 'other');
  assert.equal(failureKind(new Error('boom')), 'other');
  assert.equal(failureKind('a string'), 'other');
  assert.equal(failureKind(null), 'other');
});

test('a rejected create() or translate() comes back with its kind, and the translator is made again next time', async () => {
  const gesture = fake({ fail: new DOMException('Requires a user gesture.', 'NotAllowedError') });
  const tr1 = createTranslation({ api: gesture.api, quietMs: 30 });
  await failsAs(tr1.translate('雨', 'en'), 'click');

  let made = 0;
  const api = {
    async availability() { return 'available'; },
    async create(opts) {
      made += 1;
      if (made === 1) return { async translate() { throw new DOMException('The input is too large.', 'QuotaExceededError'); } };
      return working(opts.targetLanguage);
    },
  };
  const tr2 = createTranslation({ api, quietMs: 30 });
  await failsAs(tr2.translate('雨', 'en'), 'busy');
  assert.equal(await within(tr2.translate('雨', 'en')), '[en] 雨');
  assert.equal(made, 2);
});
