// On-device translation, through the browser's own Translator API.
//
// Chrome 138 and later and Edge 148 and later, on a computer, ship a
// translation model the page can ask for: the browser downloads it once, the
// first time a page creates a translator for a language pair, and translates
// on the device from then on. Nothing the learner pasted is sent anywhere, so
// this is the one translation Yomu can draw on its own page without breaking
// "the text leaves this page only when you click a link". Firefox, Safari and
// phones have no such API; there the DeepL and Google links are the way.
//
// A cross-origin frame gets the API only when its host delegates it with
// allow="translator" on the iframe (Runcible's yomu-host.js does); without
// it `availability()` rejects or answers unavailable, which reads here as
// unavailable, never as an error on the page.
//
// No DOM: the page hands in the API (or a fake, in tests/translate.test.mjs).

export const SOURCE = 'ja';
/** Translations kept in memory for this page, newest last; never stored. */
export const CACHE = 20;
/**
 * How long availability() may take before it counts as unavailable. Measured
 * 2026-10-05: in a Chromium that has the API but no model service (the Claude
 * desktop app's browser, Chrome 152) it never settles, which left the section
 * blank; Chrome answers at once.
 */
export const CHECK_MS = 5000;
/**
 * How long a translation may go with neither download progress nor a result
 * before it counts as stuck. Every progress event starts the wait again, so a
 * download on a slow line takes as long as it needs; what ends is a create()
 * or translate() that never settles. In a real Chrome 154 run one never did,
 * and the section said "Translating on this device." until a reload.
 */
export const QUIET_MS = 20000;
const PHASES = ['unavailable', 'downloadable', 'downloading', 'available'];

/** The Translator interface this browser has, or null. */
export function translatorApi(g = globalThis) {
  const api = g && g.Translator;
  return api && typeof api.availability === 'function' && typeof api.create === 'function' ? api : null;
}

/**
 * What a failed translation means for the learner, so the page can say it in
 * plain words: 'click' (NotAllowedError: the browser wants a click before it
 * downloads), 'busy' (QuotaExceededError, or the browser refusing a translator
 * because too many are running: Chrome rejects create() with a
 * NotSupportedError, "Unable to create translator", and puts "The translation
 * service count exceeded the limitation." on the console only, so the name is
 * the signal; check() has already ruled out an unsupported pair), 'quiet'
 * (TimeoutError: nothing came back within QUIET_MS), or 'other', whose own
 * text the page shows.
 */
export function failureKind(err) {
  const name = err && typeof err === 'object' ? String(err.name || '') : '';
  const message = err && typeof err === 'object' ? String(err.message || '') : '';
  if (name === 'NotAllowedError') return 'click';
  if (name === 'TimeoutError') return 'quiet';
  if (name === 'QuotaExceededError' || name === 'NotSupportedError') return 'busy';
  if (/service count|too many/i.test(message)) return 'busy';
  return 'other';
}

function quietError(ms) {
  const err = new Error(`no translation and no download progress in ${ms} ms`);
  err.name = 'TimeoutError';
  return err;
}

/**
 * One page's translation. `check(target)` says what the browser can do for
 * Japanese to `target`: 'unsupported' (no API), 'unavailable', 'downloadable'
 * (a click may download the model), 'downloading' or 'available'.
 * `translate(text, target, onProgress)` creates the translator on first use
 * (so its first call must come from a click while the model is only
 * downloadable: creating one that downloads needs the learner's gesture) and
 * resolves to the translation, reporting the download to `onProgress` while
 * it waits. It rejects after `quietMs` with neither progress nor a result
 * (failureKind 'quiet'). A translator that failed, or hung, is forgotten, so
 * the next attempt creates a fresh one; a result that arrives after its
 * request gave up is kept in the cache and reaches no caller.
 */
export function createTranslation({ api = translatorApi(), checkMs = CHECK_MS, quietMs = QUIET_MS } = {}) {
  const made = new Map();       // target -> { translator: Promise, heard: Set of progress listeners }
  const cache = new Map();      // `${target}\n${text}` -> translation

  async function check(target) {
    if (!api) return 'unsupported';
    let timer = null;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve('unavailable'), checkMs); });
    try {
      const a = await Promise.race([api.availability({ sourceLanguage: SOURCE, targetLanguage: target }), late]);
      return PHASES.includes(a) ? a : 'unavailable';
    } catch {
      return 'unavailable';
    } finally {
      clearTimeout(timer);
    }
  }

  /** Drop a translator that failed or hung, unless a newer one already took its place. */
  function forget(target, it) {
    if (made.get(target) === it) made.delete(target);
  }

  /**
   * The target's translator, created on first use. Its download progress goes
   * to every request waiting on it, whichever of them created it.
   */
  function entry(target) {
    if (made.has(target)) return made.get(target);
    const heard = new Set();
    const translator = Promise.resolve().then(() => api.create({
      sourceLanguage: SOURCE,
      targetLanguage: target,
      monitor(m) {
        if (m && typeof m.addEventListener === 'function') {
          m.addEventListener('downloadprogress', (e) => {
            const loaded = Number(e.loaded) || 0;
            for (const fn of [...heard]) fn(loaded);
          });
        }
      },
    }));
    const it = { translator, heard };
    made.set(target, it);
    translator.catch(() => forget(target, it));
    return it;
  }

  function open(target) {
    if (!api) return Promise.reject(new Error('no Translator API'));
    return entry(target).translator;
  }

  function keep(key, out) {
    cache.delete(key);
    cache.set(key, out);
    while (cache.size > CACHE) cache.delete(cache.keys().next().value);
  }

  function translate(text, target, onProgress) {
    const key = `${target}\n${text}`;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (!api) return Promise.reject(new Error('no Translator API'));
    const it = entry(target);
    return new Promise((resolve, reject) => {
      let timer = null;
      let done = false;
      const end = () => { done = true; clearTimeout(timer); it.heard.delete(heard); };
      const wait = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (done) return;
          end();
          forget(target, it);
          reject(quietError(quietMs));
        }, quietMs);
      };
      function heard(loaded) {
        if (done) return;
        wait();
        if (onProgress) onProgress(loaded);
      }
      it.heard.add(heard);
      wait();
      it.translator.then((t) => t.translate(text)).then((out) => {
        const s = String(out);
        keep(key, s);
        if (done) return;
        end();
        resolve(s);
      }, (err) => {
        forget(target, it);
        if (done) return;
        end();
        reject(err);
      });
    });
  }

  return { check, open, translate, get supported() { return !!api; } };
}
