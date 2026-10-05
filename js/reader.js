// The seam between the page and the analyzer.
//
// The page never imports analyze.js, dict.js or notes.js at the top of a
// module. They load on the first text, by dynamic import, for two reasons: an
// empty page has nothing to analyze and should not pay for it, and a failure
// to load them is a sentence on the page with a Retry, not a blank screen.
//
// The dictionary is handed a fetchJson that this file owns, which is how the
// page can say "Looking up 3 of 8 dictionary files" without the dictionary
// knowing a page exists, and how a failed shard is named in the error.
//
// tests/harness.html replaces the analyzer and the notes with a fixture
// through useFixture(), so the view can be checked before, and apart from,
// the analyzer streams.

import { currentLang } from './strings.js';

const ROOT = new URL('../', import.meta.url);

let loading = null;       // Promise of { analyze, createDict, notes }
let mods = null;
let dict = null;
let fixture = null;
let run = { done: 0, total: 0, onProgress: null, failed: null };

/**
 * KANJIDIC lists a radical's number among its meanings: 一 is "one" and "one
 * radical (no.1)", 二 "two" and "two radical (no. 7)". That is an index, not
 * a meaning, so the page leaves it out wherever another meaning is left to
 * show. The data keeps it; this is what is drawn.
 */
const RADICAL_NO = /\bradical \(no\.\s*\d+\)/i;

export function shownMeanings(m) {
  if (!Array.isArray(m)) return m;
  const kept = m.filter((x) => !RADICAL_NO.test(String(x)));
  return kept.length ? kept : m;
}

/** A kanji record as the page draws it. */
function shownInfo(v, ch) {
  return { ...v, ch, ...(Array.isArray(v.m) ? { m: shownMeanings(v.m) } : {}) };
}

/** A file that could not be fetched, named, so the page can name it too. */
export class LoadError extends Error {
  constructor(file, detail) {
    super(`${file}: ${detail}`);
    this.name = 'LoadError';
    this.file = file;
    this.detail = detail;
  }
}

/** For the harness: read from a fixture instead of the analyzer. `kanji` is a Map of char to kanji info. */
export function useFixture({ analyze, notes, kanji = null }) {
  fixture = { analyze, createDict: null, notes: notes || {}, kanji };
  mods = fixture;
}

function report() {
  if (typeof run.onProgress === 'function') run.onProgress({ done: run.done, total: run.total });
}

/** The fetch every dictionary shard goes through, counted per read. */
export async function fetchJson(path) {
  const mine = run;
  mine.total += 1;
  report();
  const file = String(path).replace(ROOT.href, '');
  try {
    const res = await fetch(new URL(path, ROOT));
    if (!res.ok) throw new LoadError(file, `HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    const named = err instanceof LoadError ? err : new LoadError(file, (err && err.message) || 'network error');
    // The dictionary wraps this error in its own; the first file that failed
    // in this read is kept here so the page names it whatever the wrapping.
    if (!mine.failed) mine.failed = named;
    throw named;
  } finally {
    mine.done += 1;
    if (mine === run) report();
  }
}

async function modules() {
  if (mods) return mods;
  if (!loading) {
    loading = Promise.all([import('./analyze.js'), import('./dict.js'), import('./notes.js')])
      .then(([a, d, n]) => {
        mods = { analyze: a.analyze, createDict: d.createDict, notes: n };
        return mods;
      })
      .catch((err) => {
        loading = null;           // Retry imports again rather than replaying a failure
        throw err;
      });
  }
  return loading;
}

/**
 * Kanji information for characters with no text around them: the My kanji
 * screen lists kanji saved from texts long gone. It goes through the same
 * dictionary, and the same fetchJson, as a read, so a kanji shard a reading
 * already loaded is not fetched twice. Resolves to a Map of the characters
 * the data has; rejects with a LoadError naming the file that failed.
 */
export async function kanjiInfo(chars) {
  const m = await modules();
  if (fixture) {
    const out = new Map();
    for (const ch of chars || []) if (fixture.kanji && fixture.kanji.has(ch)) out.set(ch, fixture.kanji.get(ch));
    return out;
  }
  if (!dict && typeof m.createDict === 'function') dict = m.createDict({ fetchJson });
  if (!dict || typeof dict.kanji !== 'function') return new Map();
  const got = await dict.kanji([...new Set(chars || [])]);
  const out = new Map();
  if (got && typeof got.forEach === 'function') got.forEach((v, ch) => { if (v) out.set(ch, shownInfo(v, ch)); });
  return out;
}

/** Forget the dictionary, so a Retry refetches a shard that failed rather than replaying it. */
export function resetDictionary() {
  dict = null;
}

/**
 * Read a text. Resolves to the normalized analysis, or rejects with a
 * LoadError (a file) or an Error (the analyzer itself).
 */
export async function read(text, { lang = 'en', onProgress = null } = {}) {
  const mine = { done: 0, total: 0, onProgress, failed: null };
  run = mine;
  const m = await modules();
  if (!dict && typeof m.createDict === 'function') dict = m.createDict({ fetchJson });
  try {
    const result = await m.analyze(text, { dict, lang });
    return await normalize(result, text, m);
  } catch (err) {
    throw mine.failed || (err && err.path ? new LoadError(err.path, err.message) : err);
  }
}

const LEXICAL = new Set(['word', 'inflected', 'particle', 'copula', 'katakana', 'name', 'unknown', 'number', 'latin']);

/** Tokens a learner would count as words: not spaces, line breaks or punctuation. */
export function isLexical(token) {
  return LEXICAL.has(token && token.kind);
}

/** No dictionary support: a guess, or an unknown run. */
export function isUnknown(token) {
  return isLexical(token) && (token.kind === 'unknown' || token.confidence === 'guess');
}

function kanjiChar(k) {
  if (typeof k === 'string') return k;
  return k && (k.ch || k.k || k.char || k.kanji || k.literal || k.c);
}

/**
 * The analyzer returns tokens, or { tokens, kanji }. Either is accepted, and
 * kanji details are gathered into one Map by character so the table does not
 * care which shape arrived.
 */
async function normalize(result, text, m) {
  const tokens = Array.isArray(result) ? result : (result && Array.isArray(result.tokens) ? result.tokens : []);
  const info = new Map();
  const listed = result && !Array.isArray(result) && Array.isArray(result.kanji) ? result.kanji : [];
  for (const k of listed) {
    const ch = kanjiChar(k);
    if (!ch || !k || typeof k !== 'object') continue;
    // analyze.js wraps the dictionary record as { char, info, readings };
    // a fixture may give the record itself. A wrapper whose info is null
    // describes nothing, and must not be mistaken for a record with no meaning.
    if ('info' in k) { if (k.info && typeof k.info === 'object') info.set(ch, shownInfo(k.info, ch)); }
    else info.set(ch, k);
  }
  // Kanji the analyzer did not describe are asked of the dictionary, which
  // answers with a Map for the characters its shards hold.
  const missing = [...new Set(tokens.flatMap((t) => t.kanji || []))].filter((ch) => !info.has(ch));
  if (missing.length && dict && typeof dict.kanji === 'function') {
    const got = await dict.kanji(missing);
    if (got && typeof got.forEach === 'function') got.forEach((v, ch) => { if (v) info.set(ch, shownInfo(v, ch)); });
  }
  // Token offsets refer to the analyzer's normalized text (NFKC), so that is
  // the text the analysis keeps when the analyzer returns it.
  const read = result && !Array.isArray(result) && typeof result.text === 'string' ? result.text : text;
  return { text: read, tokens: tokens.map((tk, i) => (tk.i === i ? tk : { ...tk, i })), info };
}

/**
 * A note by kind and id in the reader's language, from notes.js, or null.
 * noteFor resolves { en, es } to strings and says when it fell back to
 * English; the note panel repeats that out loud.
 */
export function noteOf(kind, id, lang = currentLang()) {
  const n = mods && mods.notes;
  if (!n || !id || typeof n.noteFor !== 'function') return null;
  try {
    return n.noteFor(kind, id, lang) || null;
  } catch {
    return null;
  }
}
