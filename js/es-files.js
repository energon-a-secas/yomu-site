// The Spanish meanings' files (docs/ANALYZER.md, "Spanish meanings").
//
// The dictionary's meanings are English: JMdict's glosses and KANJIDIC's
// kanji meanings. Their Spanish is in files of its own, each the counterpart
// of one English file at the same path under data/es/ (data/dict/w03.json
// has data/es/dict/w03.json), written by tools/build-spanish.mjs. A file is
// fetched only when a caller asks for Spanish, so a reader in English loads
// none of them.
//
// A leaf, like bloom.js: dict.js and kanji-page-data.js load through it,
// and the builder and the checker name the files with esSrc.

/** The Spanish counterpart of an English data file, by its published src. */
export function esSrc(src) {
  const s = String(src);
  return s.startsWith('data/') ? `data/es/${s.slice('data/'.length)}` : `es/${s}`;
}

/**
 * The Spanish files, each fetched once. `load(src)` takes the English file's
 * src and resolves to its counterpart's body (`entries`, or `rows` for the
 * kanji of the day), or to null when it cannot be loaded: the English
 * stands, since a missing translation is never worth an error. A failure is
 * forgotten, so the next call tries again. `get(src)` is what load() has
 * already brought, synchronously, or null.
 *
 * @param {object} o
 * @param {(path: string) => Promise<any>} o.fetchJson
 * @param {(src: string) => string} o.resolve  a published src to a fetchable path
 */
export function createEsFiles({ fetchJson, resolve }) {
  const done = new Map();
  const pending = new Map();
  function load(src) {
    if (done.has(src)) return Promise.resolve(done.get(src));
    if (pending.has(src)) return pending.get(src);
    const p = Promise.resolve()
      .then(() => fetchJson(resolve(esSrc(src))))
      .then((doc) => {
        const body = doc && (doc.entries || doc.rows);
        if (!body || typeof body !== 'object') throw new Error('it has no entries');
        done.set(src, body);
        return body;
      })
      .catch(() => null)
      .finally(() => { pending.delete(src); });
    pending.set(src, p);
    return p;
  }
  return Object.freeze({
    load,
    get: (src) => done.get(src) || null,
    /** Spanish files loaded so far, for tests. */
    get loaded() { return done.size; },
  });
}
