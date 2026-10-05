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
// the History key (`h`) it was last met in. Never the session, and never a
// text: a History key is a hash, and History itself is not exported.

import {
  validate, addWords, minDay, maxDay, isObject, withPlace,
} from './kanji-store.js';

export const EXPORT_FORMAT = 'yomu-kanji-export/1';

/** The largest backup Import reads; a real one is a few hundred KB at most. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** What Export writes: the saved and seen maps, never the session. */
export function exportDoc(data, today) {
  return { format: EXPORT_FORMAT, exported: today, site: 'https://yomu.neorgon.com/', saved: data.saved, seen: data.seen };
}

/**
 * Read a backup file's text. { ok: true, data, dropped } or
 * { ok: false, reason: 'json' | 'format' | 'empty' }. The entries go through
 * the same checks as the store itself.
 */
export function parseImport(text) {
  let doc;
  try { doc = JSON.parse(String(text)); } catch { return { ok: false, reason: 'json' }; }
  if (!isObject(doc) || doc.format !== EXPORT_FORMAT) return { ok: false, reason: 'format' };
  const { data, dropped } = validate({ saved: doc.saved, seen: doc.seen });
  if (!Object.keys(data.saved).length && !Object.keys(data.seen).length) return { ok: false, reason: 'empty', dropped };
  return { ok: true, data, dropped };
}

/**
 * Merge an imported backup into `data`. A count keeps the higher number and a
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
