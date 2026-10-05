// My kanji's backup: the file Export writes and Import reads.
//
// Split out of kanji-store.js, which holds the store, so both stay under the
// 500-line rule. Pure functions over the store's plain data, no DOM and no
// clock: the page passes the day, and tests/kanji-store.test.mjs runs them
// under node. A backup goes through the same validation as the store itself,
// so a file can never put into the store what the store would not load.
//
// What a backup carries: the saved kanji and their schedules, and every kanji
// met with its counts, its dictionary words, and the kind of text (`src`) and
// the History key (`h`) it was last met in. Never the session. The one text
// it carries is a phrase the learner saved on purpose (`phrases`, an additive
// field: { t, first, last, n, src, saved }, history-store.js phrasesOf),
// written only when there is one; the rest of History is not exported, and a
// backup without the field imports as it always did.

import {
  validate, addWords, minDay, maxDay, isObject, withPlace,
} from './kanji-store.js';
// A second cycle on purpose, as safe as the first (kanji-store.js imports
// this module, and history-store.js imports kanji-store.js): no module of the
// three uses another's bindings while it loads.
import { cleanPhrases } from './history-store.js';
import { ui } from './strings.js';

export const EXPORT_FORMAT = 'yomu-kanji-export/1';

/** The largest backup Import reads; a real one is a few hundred KB at most. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** What Export writes: the saved and seen maps and any saved phrases, never the session. */
export function exportDoc(data, today, phrases) {
  const doc = { format: EXPORT_FORMAT, exported: today, site: 'https://yomu.neorgon.com/', saved: data.saved, seen: data.seen };
  if (Array.isArray(phrases) && phrases.length) doc.phrases = phrases;
  return doc;
}

/**
 * Read a backup file's text. { ok: true, data, dropped } or
 * { ok: false, reason: 'json' | 'format' | 'empty' }. The entries go through
 * the same checks as the store itself, the saved phrases through History's
 * (`data.phrases`, present only when one reads); a damaged phrase is left
 * out and counted with the rest, and never stops the kanji importing.
 */
export function parseImport(text) {
  let doc;
  try { doc = JSON.parse(String(text)); } catch { return { ok: false, reason: 'json' }; }
  if (!isObject(doc) || doc.format !== EXPORT_FORMAT) return { ok: false, reason: 'format' };
  const { data, dropped: bad } = validate({ saved: doc.saved, seen: doc.seen });
  const p = cleanPhrases(doc.phrases);
  const dropped = bad + p.dropped;
  if (p.phrases.length) data.phrases = p.phrases;
  if (!Object.keys(data.saved).length && !Object.keys(data.seen).length && !p.phrases.length) return { ok: false, reason: 'empty', dropped };
  return { ok: true, data, dropped };
}

/**
 * Merge an imported backup's kanji into `data` (its phrases go to History,
 * kanji-store.js merge). A count keeps the higher number and a
 * first-seen day the earlier, so importing the same file twice, or two
 * devices' files in either order, ends in the same place. Where a kanji was
 * last met goes with the later last day; on the same day this browser's own
 * record stands. Of two schedules for one saved kanji, the one with more
 * reviews behind it wins; the earlier save date is kept.
 */
export function mergeInto(data, incoming) {
  const sum = { savedAdded: 0, savedUpdated: 0, seenAdded: 0, seenUpdated: 0 };
  for (const [ch, b] of Object.entries(incoming.seen || {})) {
    const a = data.seen[ch];
    if (!a) { data.seen[ch] = { ...b, words: b.words.slice() }; sum.seenAdded += 1; continue; }
    const counts = { n: Math.max(a.n, b.n), first: minDay(a.first, b.first), last: maxDay(a.last, b.last), words: addWords(a.words, b.words) };
    const next = withPlace(counts, b.last > a.last ? b : a);
    if (JSON.stringify(next) !== JSON.stringify(a)) sum.seenUpdated += 1;
    data.seen[ch] = next;
  }
  for (const [ch, b] of Object.entries(incoming.saved || {})) {
    const a = data.saved[ch];
    if (!a) { data.saved[ch] = { ...b }; sum.savedAdded += 1; continue; }
    const lead = b.reviews > a.reviews ? b : a;
    const next = { at: Math.min(a.at, b.at), box: lead.box, due: lead.due, reviews: Math.max(a.reviews, b.reviews), lapses: Math.max(a.lapses, b.lapses) };
    if (JSON.stringify(next) !== JSON.stringify(a)) sum.savedUpdated += 1;
    data.saved[ch] = next;
  }
  return sum;
}

/**
 * The note Import leaves on the screen, from what `merge` says it did (`sum`)
 * and how many damaged entries `parseImport` left out. A count of one says so
 * in the singular: it read "1 saved phrases added or updated".
 */
export function importNote(sum, dropped = 0) {
  const p = sum.phrases;
  const count = (n, one, many) => (n === 1 ? ui(one) : ui(many, { n }));
  const parts = [ui('imported', { saved: sum.savedAdded, seen: sum.seenAdded + sum.seenUpdated })];
  if (p && p.added + p.updated) parts.push(count(p.added + p.updated, 'importedPhrasesOne', 'importedPhrasesMany'));
  if (p && p.full) parts.push(count(p.full, 'importPhrasesFullOne', 'importPhrasesFullMany'));
  if (dropped) parts.push(ui('importDropped', { n: dropped }));
  return parts.join(' ');
}
