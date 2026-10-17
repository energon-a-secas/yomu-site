// Recorded voices: clips of Yomu's own text, made once by
// tools/build-audio.mjs and served from data/audio/. Nothing is sent
// anywhere to play one; the page fetches a file, as it fetches a shard.
//
// A clip is filed under its text's key (audioKey): the text folded so that
// how it is spaced, punctuated or written in kana does not matter. The tool
// files every text it recorded under that key and the page looks a text up
// the same way, so the two can never disagree on what a clip is for.
//
// index.json, format yomu-audio/1:
//   voices   [{ id, name, label: { en, es } }]  in the order the page offers them
//   clips    { key: id }                         every recorded text
//   missing  { voice: [id] }                     clips a voice failed its check for
//   slow     { voice: [id] }                     clips that also have a slow take
// A clip is data/audio/<voice>/<id>.mp3, and its slow take <id>.slow.mp3.

import { toHira } from './kana.js';
import { cyrb53 } from './history-text.js';

export const AUDIO_SRC = 'data/audio/index.json';
export const AUDIO_FORMAT = 'yomu-audio/1';
export const AUDIO_DIR = 'data/audio';
// A twentieth of a second of silence (tools/lib/audio-finish.mjs silence()),
// played in a tap so iOS lets the element play later (js/speech.js). A file,
// not a data: URI, so the page's CSP allows media from itself and nothing else.
export const SILENCE_SRC = 'data/audio/silence.mp3';

// Resolved when a clip is wanted, not when the module loads: the iOS app's
// bundle (yomu-ios bridge/entry.js) has no import.meta.url and asks only for
// clipPath.
const root = () => new URL('../', import.meta.url);

// Spaces and punctuation, Japanese and ASCII. The long-vowel bar ー and the
// repeat mark 々 are text, not punctuation: コーヒー is not コヒ.
const FOLD = /[\s、。，．,.!！?？「」『』（）()［］[\]【】…‥・：:;；"'“”‘’〜~]/gu;

/** The key a text's clip is filed under. Katakana and hiragana fold together. */
export function audioKey(text) {
  return toHira(String(text || '').normalize('NFKC')).replace(FOLD, '');
}

/** A clip's file name, from its key: short, ASCII, the same in the tool and the page. */
export function clipId(key) {
  return cyrb53(key).toString(36);
}

/** Shape index.json into lookups. Throws on a wrong format. */
export function normalizeAudio(json) {
  if (!json || json.format !== AUDIO_FORMAT) throw new Error(`expected format ${AUDIO_FORMAT}`);
  const voices = (Array.isArray(json.voices) ? json.voices : []).filter((v) => v && /^[a-z]+$/.test(v.id || ''));
  const per = (field) => new Map(voices.map((v) => [v.id, new Set((json[field] && json[field][v.id]) || [])]));
  return { voices, byKey: new Map(Object.entries(json.clips || {})), missing: per('missing'), slow: per('slow') };
}

/**
 * The clip for `text` in `voice`, as { id, slow, path } with `path` relative
 * to the site, or null. `slow` asks for the slow take and gets the normal one
 * when there is none; the caller slows that instead.
 */
export function clipPath(audio, text, voice, { slow = false } = {}) {
  if (!audio || !voice) return null;
  const id = audio.byKey.get(audioKey(text));
  const missing = audio.missing.get(voice);
  if (!id || !missing || missing.has(id)) return null;
  const take = slow && audio.slow.get(voice).has(id);
  return { id, slow: take, path: `${AUDIO_DIR}/${voice}/${id}${take ? '.slow' : ''}.mp3` };
}

/** The voices to try for `voice`: it, then the index's first, which has every common beat. */
export function voicesInTurn(audio, voice) {
  const first = audio && audio.voices[0] && audio.voices[0].id;
  return first && first !== voice ? [voice, first] : [voice];
}

/** clipPath in `voice`, or in the index's first voice when that one failed its check for it. */
export function clipInTurn(audio, text, voice, opts) {
  if (!audio) return null;
  for (const v of voicesInTurn(audio, voice)) {
    const clip = clipPath(audio, text, v, opts);
    if (clip) return clip;
  }
  return null;
}

/** A path under the site as the URL the page fetches. */
export function siteUrl(path) {
  return new URL(path, root()).href;
}

/** clipPath with the URL the page fetches it from. */
export function clipFor(audio, text, voice, opts) {
  const clip = clipPath(audio, text, voice, opts);
  return clip && { ...clip, url: siteUrl(clip.path) };
}

let cache = null;
let pending = null;

/** The index, fetched once. A failure is not kept, so the next call tries again. */
export function loadAudio(fetchImpl = globalThis.fetch) {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetchImpl(new URL(AUDIO_SRC, root()));
      if (!res.ok) return null;
      cache = normalizeAudio(await res.json());
      return cache;
    } catch {
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** The index if it has loaded, without waiting. */
export function audioNow() {
  return cache;
}

/** For tests and the harness: use an index object instead of the file. */
export function useAudio(json) {
  cache = json ? normalizeAudio(json) : null;
  return cache;
}
