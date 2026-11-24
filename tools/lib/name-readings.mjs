/**
 * Search's sure names by reading (data/search/names.json): each name the
 * names tier marks sure (`S`: 20 or more longer JMnedict names built on it,
 * at least 5 of them full names or surnames, docs/ANALYZER.md "Names:
 * JMnedict"), filed under its reading, so a romaji query finds 田中 by たなか
 * (js/search-romaji.js). The names tier is keyed by spelling, and a romaji
 * query has only kana. Built from the committed data/names/ shards by
 * tools/build-name-readings.mjs, and rebuilt by tools/check-data.mjs, which
 * fails a file that is not what the shards give.
 *
 * Only the sure names: a strong one (`s`, 5 or more) would bring in 4,369
 * readings, a third of them places, and Search reads a name only where no
 * word spells the kana, so a name it should not offer is read as a sentence's
 * subject instead of the words the learner meant.
 */

export const NAME_READINGS_FORMAT = 'yomu-search-names/1';

/**
 * `{ reading: [spelling] }` from a names tier's entries ([spelling, record]
 * pairs): the sure names, by their one reading (`r[0]`), readings in plain JS
 * string order and each reading's spellings in the same order.
 */
export function nameReadings(entries) {
  const by = new Map();
  for (const [spelling, rec] of entries) {
    if (!rec || rec.S !== 1 || !Array.isArray(rec.r) || typeof rec.r[0] !== 'string' || !rec.r[0]) continue;
    const reading = rec.r[0];
    if (!by.has(reading)) by.set(reading, []);
    by.get(reading).push(spelling);
  }
  const plain = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return Object.fromEntries([...by.keys()].sort(plain).map((r) => [r, by.get(r).sort(plain)]));
}

/** The whole file, under `licence`. */
export function nameReadingsDoc(entries, licence) {
  const names = nameReadings(entries);
  return {
    _licence: licence,
    format: NAME_READINGS_FORMAT,
    count: Object.values(names).reduce((n, list) => n + list.length, 0),
    names,
  };
}

/** What is wrong with `doc` against the entries it is built from: [] when it is what they give. */
export function nameReadingsProblems(doc, entries) {
  if (!doc || doc.format !== NAME_READINGS_FORMAT || !doc.names || typeof doc.names !== 'object') return ['is not a yomu-search-names/1 file'];
  const built = nameReadingsDoc(entries, doc._licence);
  const out = [];
  if (doc.count !== built.count) out.push(`count ${doc.count} is not ${built.count}, the sure names the shards hold`);
  if (JSON.stringify(doc.names) !== JSON.stringify(built.names)) out.push('names are not what the names shards give; run node tools/build-name-readings.mjs');
  return out;
}
