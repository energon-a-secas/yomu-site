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
const PHASES = ['unavailable', 'downloadable', 'downloading', 'available'];

/** The Translator interface this browser has, or null. */
export function translatorApi(g = globalThis) {
  const api = g && g.Translator;
  return api && typeof api.availability === 'function' && typeof api.create === 'function' ? api : null;
}

/**
 * One page's translation. `check(target)` says what the browser can do for
 * Japanese to `target`: 'unsupported' (no API), 'unavailable', 'downloadable'
 * (a click may download the model), 'downloading' or 'available'.
 * `translate(text, target, onProgress)` creates the translator on first use
 * (so its first call must come from a click while the model is only
 * downloadable: creating one that downloads needs the learner's gesture) and
 * resolves to the translation. A translator that failed to be created is
 * forgotten, so the next attempt tries again.
 */
export function createTranslation({ api = translatorApi(), checkMs = CHECK_MS } = {}) {
  const made = new Map();       // target -> Promise of a translator
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

  function open(target, onProgress) {
    if (!api) return Promise.reject(new Error('no Translator API'));
    if (!made.has(target)) {
      const p = Promise.resolve().then(() => api.create({
        sourceLanguage: SOURCE,
        targetLanguage: target,
        monitor(m) {
          if (m && typeof m.addEventListener === 'function') {
            m.addEventListener('downloadprogress', (e) => { if (onProgress) onProgress(Number(e.loaded) || 0); });
          }
        },
      }));
      made.set(target, p);
      p.catch(() => made.delete(target));
    }
    return made.get(target);
  }

  async function translate(text, target, onProgress) {
    const key = `${target}\n${text}`;
    if (cache.has(key)) return cache.get(key);
    const translator = await open(target, onProgress);
    const out = String(await translator.translate(text));
    cache.set(key, out);
    while (cache.size > CACHE) cache.delete(cache.keys().next().value);
    return out;
  }

  return { check, open, translate, get supported() { return !!api; } };
}
