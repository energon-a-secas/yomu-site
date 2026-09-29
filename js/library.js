// The phrase library: data/phrases/library.json, format yomu-library/1.
//
// It loads the first time the Phrases dialog opens and not before, so a
// learner who only pastes never fetches it. Categories list phrase ids; a
// phrase listed by no category is not shown, and an id no phrase has is
// dropped, rather than drawing an empty row.

import { LoadError } from './reader.js';
import { beats, isKana } from './kana.js';

export const LIBRARY_SRC = 'data/phrases/library.json';
export const LIBRARY_FORMAT = 'yomu-library/1';

const ROOT = new URL('../', import.meta.url);
let cache = null;

/** Shape the file into what the dialog draws. Throws on a wrong format. */
export function normalizeLibrary(json, src = LIBRARY_SRC) {
  if (!json || json.format !== LIBRARY_FORMAT) {
    throw new LoadError(src, `expected format ${LIBRARY_FORMAT}, found ${json && json.format ? json.format : 'none'}`);
  }
  const byId = new Map();
  for (const p of Array.isArray(json.phrases) ? json.phrases : []) {
    if (p && p.id && typeof p.ja === 'string') byId.set(p.id, p);
  }
  const categories = (Array.isArray(json.categories) ? json.categories : [])
    .map((c) => ({ id: c.id, title: c.title, phrases: (c.items || []).map((id) => byId.get(id)).filter(Boolean) }))
    .filter((c) => c.phrases.length);
  const dialogues = (Array.isArray(json.dialogues) ? json.dialogues : [])
    .filter((d) => d && d.id && Array.isArray(d.lines) && d.lines.some((l) => l && l.ja));
  return { categories, dialogues, byId, dialogueById: new Map(dialogues.map((d) => [d.id, d])) };
}

/** Fetch once per page; a failure is not cached, so Retry fetches again. */
export async function loadLibrary(fetchImpl = globalThis.fetch) {
  if (cache) return cache;
  let res;
  try {
    res = await fetchImpl(new URL(LIBRARY_SRC, ROOT));
  } catch (err) {
    throw new LoadError(LIBRARY_SRC, (err && err.message) || 'network error');
  }
  if (!res.ok) throw new LoadError(LIBRARY_SRC, `HTTP ${res.status}`);
  let json;
  try { json = await res.json(); } catch { throw new LoadError(LIBRARY_SRC, 'not valid JSON'); }
  cache = normalizeLibrary(json);
  return cache;
}

/** For the harness: use a library object instead of the file. */
export function useLibrary(json) {
  cache = normalizeLibrary(json, 'fixture');
  return cache;
}

/** A dialogue as text for the reader: one line per speaker turn, Japanese only. */
export function dialogueText(d) {
  return d.lines.filter((l) => l && l.ja).map((l) => l.ja).join('\n');
}

/** The beats of a phrase's kana, punctuation and spaces left out. */
export function phraseBeats(phrase) {
  const kana = [...String((phrase && (phrase.kana || phrase.ja)) || '')].filter((ch) => isKana(ch)).join('');
  return beats(kana);
}
