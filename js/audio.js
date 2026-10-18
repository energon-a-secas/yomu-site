// Recorded voices: clips of Yomu's own text and of its most common words,
// made once by tools/build-audio.mjs and served from data/audio/. Nothing is
// sent anywhere to play one; the page fetches a file, as it fetches a shard.
//
// Keys. A line (a sentence, an example, a beat) is filed under its text
// folded (audioKey), so how it is spaced, punctuated or written in kana does
// not matter. A word is filed under its written form and its reading
// (wordKey: 雨|あめ), so two words that sound alike never share a clip (飴|あめ
// is another one), and a word written in kana under its kana. The tool files
// every clip under these keys and the page looks a text up the same way, so
// the two can never disagree on what a clip is for.
//
// index.json, format yomu-audio/2:
//   voices  [{ id, name, label: { en, es } }]  in the order the page offers them
//   shards  [{ first, src }]                    key ranges, in JS string order
// a shard, format yomu-audio-clips/1:
//   clips   { key: [id, mask] }                 bit i of mask: voices[i] has a checked clip
// A clip is data/audio/<voice>/<id>.mp3.

import { toHira, hasKanji } from './kana.js';
import { cyrb53 } from './history-text.js';
import { lastAtMost } from './range-store.js';

export const AUDIO_SRC = 'data/audio/index.json';
export const AUDIO_FORMAT = 'yomu-audio/2';
export const CLIPS_FORMAT = 'yomu-audio-clips/1';
export const AUDIO_DIR = 'data/audio';
// A twentieth of a second of silence (tools/lib/audio-finish.mjs silence()),
// played in a tap so iOS lets the element play later (js/speech.js). A file,
// not a data: URI, so the page's CSP allows media from itself and nothing else.
export const SILENCE_SRC = 'data/audio/silence.mp3';

// Resolved when a clip is wanted, not when the module loads: the iOS app's
// bundle (yomu-ios bridge/entry.js) has no import.meta.url.
const root = () => new URL('../', import.meta.url);

// Spaces and punctuation, Japanese and ASCII. The long-vowel bar ー and the
// repeat mark 々 are text, not punctuation: コーヒー is not コヒ.
const FOLD = /[\s、。，．,.!！?？「」『』（）()［］[\]【】…‥・：:;；"'“”‘’〜~]/gu;

/** The key a line's clip is filed under. Katakana and hiragana fold together. */
export function audioKey(text) {
  return toHira(String(text || '').normalize('NFKC')).replace(FOLD, '');
}

/** A word's key: its written form and reading, or only its kana when it is written in kana. */
export function wordKey(written, reading) {
  const w = audioKey(written);
  return hasKanji(w) && reading ? `${w}|${audioKey(reading)}` : w;
}

/** A clip's file name, from its key: short, ASCII, the same in the tool and the page. */
export function clipId(key) {
  return cyrb53(key).toString(36);
}

/** The keys a text is looked up by: the given ones first (a word's), then the text's own. */
export function keysOf(text, lookup = []) {
  return [...new Set([...lookup.filter(Boolean), audioKey(text)])];
}

/** Shape index.json. Throws on a wrong format. */
export function normalizeAudio(json) {
  if (!json || json.format !== AUDIO_FORMAT) throw new Error(`expected format ${AUDIO_FORMAT}`);
  const voices = (Array.isArray(json.voices) ? json.voices : []).filter((v) => v && /^[a-z]+$/.test(v.id || ''));
  const shards = (Array.isArray(json.shards) ? json.shards : []).filter((s) => s && typeof s.first === 'string' && typeof s.src === 'string');
  return { voices, firsts: shards.map((s) => s.first), srcs: shards.map((s) => s.src), clips: new Map(), loaded: new Set() };
}

/** Take a shard's clips into the index. Throws on a wrong format. */
export function addShard(audio, n, json) {
  if (!json || json.format !== CLIPS_FORMAT) throw new Error(`expected format ${CLIPS_FORMAT}`);
  for (const [k, v] of Object.entries(json.clips || {})) if (Array.isArray(v) && v.length === 2) audio.clips.set(k, v);
  audio.loaded.add(n);
}

/** The shards `keys` need that have not loaded yet. */
export function shardsFor(audio, keys) {
  const out = new Set();
  for (const k of keys) {
    const n = lastAtMost(audio.firsts, k);
    if (n >= 0 && !audio.loaded.has(n)) out.add(n);
  }
  return [...out];
}

/** The id of the clip `voice` has for `key`, or null. */
function idIn(audio, key, voice) {
  const entry = audio.clips.get(key);
  const i = audio.voices.findIndex((v) => v.id === voice);
  return entry && i >= 0 && (entry[1] & (1 << i)) ? entry[0] : null;
}

const pathOf = (voice, id) => `${AUDIO_DIR}/${voice}/${id}.mp3`;

/** The voices to try for `voice`: it, then the index's first, which has the most clips. */
export function voicesInTurn(audio, voice) {
  const first = audio && audio.voices[0] && audio.voices[0].id;
  return first && first !== voice ? [voice, first] : [voice];
}

/** The clip `voice` itself has for the first of `keys` it has one for: { id, voice, path } or null. */
export function clipInVoice(audio, keys, voice) {
  if (!audio) return null;
  for (const key of keys) {
    const id = idIn(audio, key, voice);
    if (id) return { id, voice, path: pathOf(voice, id) };
  }
  return null;
}

/**
 * The clip for the first of `keys` that has one, in `voice` or else in the
 * index's first voice. Each key is tried in both before the next, so the
 * exact word in Clear wins over its bare kana in the chosen voice.
 */
export function clipByKeys(audio, keys, voice) {
  if (!audio) return null;
  for (const key of keys) {
    for (const v of voicesInTurn(audio, voice)) {
      const id = idIn(audio, key, v);
      if (id) return { id, voice: v, path: pathOf(v, id) };
    }
  }
  return null;
}

/** One recorded speaker for a word sequence. Prefer the selected voice on a
 * coverage tie; use Clear when it covers more words. Preserve the most specific
 * available key before choosing a voice, so a bare-kana homophone cannot win
 * over a known spelling. Missing clips remain null for explicit device fallback. */
export function wordSequence(audio, keysList, voice) {
  const choices = voicesInTurn(audio, voice);
  const specific = keysList.map((keys) => {
    const key = keys.find((key) => choices.some((v) => clipInVoice(audio, [key], v)));
    return key ? [key] : [];
  });
  let best = { voice: voice || null, clips: keysList.map(() => null), recorded: 0 };
  for (const v of choices) {
    const clips = specific.map((keys) => clipInVoice(audio, keys, v));
    const recorded = clips.filter(Boolean).length;
    if (recorded > best.recorded) best = { voice: v, clips, recorded };
  }
  return best;
}

/** A path under the site as the URL the page fetches. */
export function siteUrl(path) {
  return new URL(path, root()).href;
}

/** clipByKeys for one text, with the URL the page fetches it from. */
export function clipFor(audio, text, voice, lookup = []) {
  const clip = clipByKeys(audio, keysOf(text, lookup), voice);
  return clip && { ...clip, url: siteUrl(clip.path) };
}

// ── The page's copy ───────────────────────────────────────────────────────

let cache = null;
let pending = null;
const loading = new Map(); // shard number -> promise

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

/** The index with the shards `keys` need loaded; a shard that fails is tried again next time. */
export async function needKeys(keys, fetchImpl = globalThis.fetch) {
  const audio = await loadAudio(fetchImpl);
  if (!audio) return null;
  await Promise.all(shardsFor(audio, keys).map((n) => {
    if (!loading.has(n)) {
      loading.set(n, (async () => {
        try {
          const res = await fetchImpl(new URL(audio.srcs[n], root()));
          if (res.ok) addShard(audio, n, await res.json());
        } catch {
          // The clip is not played; the device says the text.
        } finally {
          loading.delete(n);
        }
      })());
    }
    return loading.get(n);
  }));
  return audio;
}

/** The index if it has loaded, without waiting. */
export function audioNow() {
  return cache;
}

/** For tests and the harness: an index and its shards, instead of the files. */
export function useAudio(json, shards = []) {
  cache = json ? normalizeAudio(json) : null;
  if (cache) shards.forEach((s, n) => addShard(cache, n, s));
  return cache;
}
