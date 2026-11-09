// The app's backup: My kanji, My words, saved readings and practice, in one
// file a learner keeps outside the app, so deleting the app no longer takes
// them with it (the owner's note on Naninani 1.2.0, build 13: "if its
// deleted data goes with it").
//
// The file is My kanji's backup (kanji-backup.js, yomu-kanji-export/1) with
// two additive fields the site's Import already ignores: `sources`, where a
// saved reading came from in the phrase library (phrase-book.js), and
// `practice`, the learning documents, each exactly as its module wrote it.
// So a file the app writes imports on yomu.neorgon.com (kanji, words and
// saved phrases), and one the site writes imports in the app.
//
// Pure functions over plain documents, no clock and no I/O: the app reads
// its files, passes them in, and writes back what `restoreBackup` returns.
// Each practice document is checked by its own module when the app next
// loads it, as a file on the phone always is.

import { exportDoc, parseImport, mergeInto, MAX_IMPORT_BYTES } from './kanji-backup.js';
import { validate as validateKanji, isObject } from './kanji-store.js';
import { validate as validateWords, listWords, mergeWords } from './word-store.js';
import { PhraseBook } from './phrase-book.js';

/** The practice documents a backup carries, by the name of the file the app keeps each in. */
export const PRACTICE = Object.freeze(['kana-games', 'story', 'kana-review', 'kana-snacks', 'kanji-cards', 'kana-to-kanji', 'writing-rush']);

/**
 * The backup of everything a learner keeps. `kanji` and `words` are My
 * kanji's and My words' documents, `phrases` the phrase book's (its dump,
 * read against `library`), `practice` maps a PRACTICE name to its document.
 * `now` (ms) checks the kanji document as the store does; `today` dates the
 * file; `app` says what wrote it ({ name, version }). Never the reading
 * session, as on the site.
 */
export function backupDoc({ kanji, words, phrases, practice = {}, today, now, library, app } = {}) {
  const k = validateKanji(kanji, now).data;
  const w = validateWords(words).data;
  const book = new PhraseBook(library, phrases).dump();
  const doc = exportDoc(k, today, book.phrases, listWords(w).map(({ id, ...rec }) => rec));
  if (Object.keys(book.sources).length) doc.sources = book.sources;
  const kept = practiceOf(practice);
  if (Object.keys(kept).length) doc.practice = kept;
  if (isObject(app)) doc.app = { name: String(app.name || ''), version: String(app.version || '') };
  return doc;
}

/** How much a backup holds, for comparing two copies: saved kanji, words, readings and practice documents. */
export function backupWeight(summary) {
  if (!isObject(summary)) return 0;
  return (summary.kanji || 0) + (summary.words || 0) + (summary.phrases || 0) + (summary.practice || []).length;
}

/**
 * What a backup holds, before anything is restored: { ok: true, summary }, or
 * { ok: false, reason } with parseImport's reasons ('json', 'format',
 * 'empty') and 'size' for a file over MAX_IMPORT_BYTES. A backup holding only
 * practice is not empty. The summary counts saved kanji, kanji met, words,
 * saved readings and the practice it carries, with the day it was written,
 * what wrote it and its weight (backupWeight).
 */
export function readBackup(text) {
  const r = parse(text);
  if (!r.ok) return r;
  return { ok: true, summary: summaryOf(r) };
}

/**
 * What a backup the app has just made holds, even when that is nothing yet:
 * a new phone's backup is empty, which readBackup refuses as a file to
 * restore. Null for text that is not a backup.
 */
export function backupSummary(text) {
  const r = parse(text, { allowEmpty: true });
  return r.ok ? summaryOf(r) : null;
}

/**
 * Merge a backup (its text) into this phone's documents by the site's own
 * rules: kanji-backup.js mergeInto for saved and met kanji (of two schedules
 * the one with more reviews wins, counts keep the higher number),
 * word-store.js mergeWords for words and the phrase book's merge for saved
 * readings. Restoring the same file twice changes nothing the second time.
 * A practice document the phone lacks comes from the backup; one the phone
 * has is replaced only with `replacePractice`, since two practice histories
 * have no merge. Returns the documents to write, with what changed
 * (`sum`), or { ok: false, reason } as readBackup.
 */
export function restoreBackup(text, { kanji, words, phrases, practice = {}, now, library, replacePractice = false } = {}) {
  const r = parse(text);
  if (!r.ok) return r;
  const k = validateKanji(kanji, now).data;
  const kanjiSum = mergeInto(k, r.data);
  const w = validateWords(words).data;
  const wordSum = mergeWords(w, r.words);
  const book = new PhraseBook(library, phrases);
  const phraseSum = book.merge(r.data.phrases || [], r.sources);
  const restored = {};
  const kept = [];
  for (const [name, doc] of Object.entries(r.practice)) {
    if (replacePractice || !isObject(practice[name])) restored[name] = doc;
    else kept.push(name);
  }
  return {
    ok: true,
    kanji: k,
    words: w,
    phrases: book.dump(),
    practice: restored,
    sum: { ...kanjiSum, words: wordSum, phrases: phraseSum, practice: Object.keys(restored), keptPractice: kept, dropped: r.dropped },
  };
}

function practiceOf(raw) {
  const out = {};
  if (!isObject(raw)) return out;
  for (const name of PRACTICE) if (isObject(raw[name])) out[name] = raw[name];
  return out;
}

function parse(text, { allowEmpty = false } = {}) {
  if (typeof text !== 'string') return { ok: false, reason: 'json' };
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, reason: 'size' };
  const r = parseImport(text);
  if (!r.ok && r.reason !== 'empty') return { ok: false, reason: r.reason };
  // parseImport has read the JSON and checked the format; the app's fields are read here.
  const doc = JSON.parse(text);
  const practice = practiceOf(doc.practice);
  if (!r.ok && !Object.keys(practice).length && !allowEmpty) return { ok: false, reason: 'empty' };
  return {
    ok: true,
    data: r.ok ? r.data : { saved: {}, seen: {} },
    words: r.ok ? r.words : [],
    dropped: r.dropped || 0,
    sources: isObject(doc.sources) ? doc.sources : {},
    practice,
    exported: typeof doc.exported === 'string' ? doc.exported : null,
    app: isObject(doc.app) ? { name: String(doc.app.name || ''), version: String(doc.app.version || '') } : null,
  };
}

function summaryOf(r) {
  const summary = {
    exported: r.exported,
    app: r.app,
    kanji: Object.keys(r.data.saved).length,
    met: Object.keys(r.data.seen).length,
    words: r.words.length,
    phrases: (r.data.phrases || []).length,
    practice: Object.keys(r.practice),
    dropped: r.dropped,
  };
  summary.weight = backupWeight(summary);
  return summary;
}
