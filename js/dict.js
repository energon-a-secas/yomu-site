// The dictionary, loaded a shard at a time.
//
// docs/ANALYZER.md, "Data formats", is the contract. The whole dictionary is
// tens of thousands of keys; a sentence needs a handful of shards. So nothing
// is fetched until the lattice has said which keys it might look up, and then
// only the shards that hold one of them, all at once.
//
// Three files decide which: the core (data/dict/core.json), the keys texts
// ask for most, which every text loads; the filter (data/dict/filter.json),
// which says a key outside the core is surely absent or may be present; and
// the range shards, fetched only for a key the filter lets through. A text of
// twenty kana asks about two hundred substrings, and before the filter each
// one fetched the shard it would sort into, which was most of them.
//
// This module knows nothing about Japanese. It maps a string to the last shard
// whose `first` is <= that string, in plain JS string order (UTF-16 code
// units), which is the order the builder sorted in. Comparing any other way
// (localeCompare, code points) would send some keys to the wrong shard and
// they would silently read as unknown.
//
// It runs in the page and under node: the caller hands in `fetchJson`, and the
// paths it is asked for are the paths the index names, resolved against
// `base`.
//
// Two more tiers sit behind the first, read only by the second phase
// (js/rare.js): the rest of JMdict (data/dict/rare.json, `needRare` and
// `rare`) and the names (data/names/index.json, `needNames` and `name`).
// js/range-store.js loads them; nothing here fetches either until the second
// phase asks, so a text the first pass reads in full never touches them.

import { readFilter } from './bloom.js';
import { createRangeStore, lastAtMost, loadError } from './range-store.js';

/**
 * Where a published path lands. `base` is the data/ directory, relative to the
 * page or absolute under node; the indexes live at base + dict/index.json and
 * base + kanji/index.json. The index names shards from the site root
 * ("data/dict/w00.json", like a Runcible deck src), so a src that starts with
 * data/ is resolved against the directory above `base`; any other relative
 * src is taken as relative to `base` itself.
 */
function resolver(base) {
  const b = String(base || '');
  const dir = b === '' || b.endsWith('/') ? b : `${b}/`;
  const root = dir.endsWith('data/') ? dir.slice(0, -'data/'.length) : null;
  const resolve = (src) => {
    const s = String(src);
    if (/^[a-z]+:\/\//i.test(s) || s.startsWith('/')) return s;
    if (root !== null && s.startsWith('data/')) return root + s;
    return dir + s;
  };
  return { dir, resolve };
}


/**
 * @param {object} opts
 * @param {(url: string) => Promise<any>} opts.fetchJson  fetch and parse one file
 * @param {string} [opts.base='data/']  where data/ is, relative to the page
 */
export function createDict({ fetchJson, base = 'data/' } = {}) {
  if (typeof fetchJson !== 'function') throw new TypeError('createDict needs a fetchJson function');
  const { dir, resolve } = resolver(base);

  let index = null;          // the parsed dict index
  let indexing = null;       // its promise, shared by concurrent callers
  let firsts = [];           // index.shards[].first, in order
  const shards = new Map();  // shard number -> entries object, once loaded
  const pending = new Map(); // shard number -> promise, while loading
  let core = null;           // the core's entries, once loaded
  let coring = null;         // its promise
  let filter = null;         // { has(key) }, once loaded
  let filtering = null;      // its promise

  let kanjiIndex = null;
  let kanjiIndexing = null;
  let kanjiOf = new Map();       // char -> kanji shard number, for the listed shards
  let kanjiRanges = [];          // and { n, first, last } for the ranged ones
  let kanjiRangeFirsts = [];
  const kanjiShards = new Map();
  const kanjiPending = new Map();

  // The second phase's tiers. A rare record is marked `tier: 2` as it
  // loads, so a token built from it says so and the page can call it a rare
  // word; nothing in the shards spends bytes on the mark.
  const rare = createRangeStore({
    fetchJson,
    resolve,
    indexPath: `${dir}dict/rare.json`,
    what: 'The rare-word index',
    onShard: (entries) => {
      for (const recs of Object.values(entries)) for (const r of recs) r.tier = 2;
    },
  });
  const names = createRangeStore({
    fetchJson, resolve, indexPath: `${dir}names/index.json`, what: 'The names index',
  });

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!indexing) {
      const path = `${dir}dict/index.json`;
      indexing = Promise.resolve()
        .then(() => fetchJson(path))
        .then((doc) => {
          if (!doc || !Array.isArray(doc.shards) || !doc.shards.length) {
            throw new Error('it has no shards[]');
          }
          index = doc;
          firsts = doc.shards.map((s) => String(s.first));
          return doc;
        })
        .catch((e) => {
          indexing = null;
          throw loadError('The dictionary index', path, e);
        });
    }
    return indexing;
  }

  function shardFor(key) {
    return lastAtMost(firsts, String(key));
  }

  /**
   * One of the two files every text needs once the index is in: the core
   * and the filter. An index without them (yomu-dict-index/1) has neither,
   * and every key's range shard is fetched, as before.
   */
  function loadExtra(what, ref, read) {
    const path = resolve(ref.src);
    return Promise.resolve()
      .then(() => fetchJson(path))
      .then(read)
      .catch((e) => { throw loadError(what, path, e); });
  }

  function loadCore() {
    if (core || !index.core) return Promise.resolve();
    if (!coring) {
      coring = loadExtra('The dictionary core', index.core, (doc) => {
        if (!doc || typeof doc.entries !== 'object' || doc.entries === null) throw new Error('it has no entries');
        core = doc.entries;
      }).catch((e) => { coring = null; throw e; });
    }
    return coring;
  }

  function loadFilter() {
    if (filter || !index.filter) return Promise.resolve();
    if (!filtering) {
      filtering = loadExtra('The key filter', index.filter, (doc) => { filter = readFilter(doc); })
        .catch((e) => { filtering = null; throw e; });
    }
    return filtering;
  }

  function loadShard(n) {
    if (shards.has(n)) return Promise.resolve();
    if (pending.has(n)) return pending.get(n);
    const path = resolve(index.shards[n].src);
    const p = Promise.resolve()
      .then(() => fetchJson(path))
      .then((doc) => {
        if (!doc || typeof doc.entries !== 'object' || doc.entries === null) {
          throw new Error('it has no entries');
        }
        shards.set(n, doc.entries);
        pending.delete(n);
      })
      .catch((e) => {
        // Forget the failure so the next need() tries again: a dropped
        // connection should not poison the page until it is reloaded.
        pending.delete(n);
        throw loadError('Dictionary shard', path, e);
      });
    pending.set(n, p);
    return p;
  }

  /**
   * Make sure every shard these keys fall in is loaded. Resolves once they
   * all are; rejects with the first shard that failed, named.
   */
  async function need(keys) {
    await loadIndex();
    // The core is not needed to decide which range shards to fetch (the
    // filter holds only keys outside it), so it loads alongside them.
    const coreLoad = loadCore();
    // Handled until it is awaited below: a core that fails while the filter
    // loads was an unhandled rejection, though need() still rejects with it.
    coreLoad.catch(() => {});
    await loadFilter();
    const wanted = new Set();
    for (const k of keys || []) {
      if (filter && !filter.has(String(k))) continue;
      const n = shardFor(k);
      if (n >= 0 && !shards.has(n)) wanted.add(n);
    }
    await Promise.all([coreLoad, ...[...wanted].map(loadShard)]);
  }

  /**
   * The records for one key, or undefined. Synchronous: a key whose shard
   * has not been loaded by need() reads as absent, which is what an unknown
   * key reads as too.
   */
  function get(key) {
    if (!index) return undefined;
    if (core && Object.prototype.hasOwnProperty.call(core, key)) return core[key];
    const n = shardFor(key);
    const entries = n >= 0 ? shards.get(n) : undefined;
    if (!entries || !Object.prototype.hasOwnProperty.call(entries, key)) return undefined;
    return entries[key];
  }

  // ── Kanji ───────────────────────────────────────────────────────────────

  function loadKanjiIndex() {
    if (kanjiIndex) return Promise.resolve(kanjiIndex);
    if (!kanjiIndexing) {
      const path = `${dir}kanji/index.json`;
      kanjiIndexing = Promise.resolve()
        .then(() => fetchJson(path))
        .then((doc) => {
          if (!doc || !Array.isArray(doc.shards)) throw new Error('it has no shards[]');
          // A shard either lists its characters (`chars`, a string or an
          // array: the 2,600 a reader meets, in frequency order) or gives
          // the range it holds (`first` and `last`: the 7,784 KANJIDIC
          // characters nothing ranks, in plain string order). A listed
          // character is looked up in its shard; any other in the range it
          // sorts into, so a rare kanji costs one shard and the index stays
          // the size it was when only the listed ones shipped.
          kanjiOf = new Map();
          kanjiRanges = [];
          doc.shards.forEach((s, n) => {
            if (s.chars !== undefined) {
              for (const ch of (typeof s.chars === 'string' ? [...s.chars] : s.chars)) kanjiOf.set(ch, n);
            } else if (s.first !== undefined) {
              kanjiRanges.push({ n, first: String(s.first), last: s.last === undefined ? null : String(s.last) });
            }
          });
          kanjiRangeFirsts = kanjiRanges.map((r) => r.first);
          kanjiIndex = doc;
          return doc;
        })
        .catch((e) => {
          kanjiIndexing = null;
          throw loadError('The kanji index', path, e);
        });
    }
    return kanjiIndexing;
  }

  function kanjiShardFor(ch) {
    if (kanjiOf.has(ch)) return kanjiOf.get(ch);
    const k = lastAtMost(kanjiRangeFirsts, ch);
    if (k < 0) return -1;
    const range = kanjiRanges[k];
    // Past a range's last character and before the next one's first is a
    // character KANJIDIC does not have: no shard holds it, so none is fetched.
    return range.last !== null && ch > range.last ? -1 : range.n;
  }

  function loadKanjiShard(n) {
    if (kanjiShards.has(n)) return Promise.resolve();
    if (kanjiPending.has(n)) return kanjiPending.get(n);
    const path = resolve(kanjiIndex.shards[n].src);
    const p = Promise.resolve()
      .then(() => fetchJson(path))
      .then((doc) => {
        const map = doc && (doc.kanji || doc.entries || doc.chars);
        if (!map || typeof map !== 'object') throw new Error('it has no kanji');
        kanjiShards.set(n, map);
        kanjiPending.delete(n);
      })
      .catch((e) => {
        kanjiPending.delete(n);
        throw loadError('Kanji shard', path, e);
      });
    kanjiPending.set(n, p);
    return p;
  }

  /**
   * Kanji information for the given characters (a string or an iterable).
   * @returns {Promise<Map<string, object>>} only the characters the data has
   */
  async function kanji(chars) {
    await loadKanjiIndex();
    const list = [...new Set(typeof chars === 'string' ? [...chars] : [...(chars || [])])];
    const wanted = new Set();
    for (const ch of list) {
      const n = kanjiShardFor(ch);
      if (n >= 0 && !kanjiShards.has(n)) wanted.add(n);
    }
    await Promise.all([...wanted].map(loadKanjiShard));
    const out = new Map();
    for (const ch of list) {
      const n = kanjiShardFor(ch);
      const map = n >= 0 ? kanjiShards.get(n) : undefined;
      if (map && Object.prototype.hasOwnProperty.call(map, ch)) out.set(ch, map[ch]);
    }
    return out;
  }

  return Object.freeze({
    ready: loadIndex,
    need,
    get,
    kanji,
    /** Load the rare-word shards these keys may be in (the second phase only). */
    needRare: rare.need,
    /** A key's rare records, each marked `tier: 2`, or undefined. */
    rare: rare.get,
    /** Load the names shards these spellings may be in (the second phase only). */
    needNames: names.need,
    /** A name's record `{ r?, n, f?, s? }`, or undefined. */
    name: names.get,
    /** Files of the second phase's tiers loaded so far, for tests and the measurements. */
    get loadedRare() { return rare.loaded + names.loaded; },
    /** Longest key in the dictionary; the lattice never looks further. */
    get maxKey() { return index && index.maxKey ? index.maxKey : 12; },
    /** How many dictionary files (the core and range shards) are loaded, for tests and the performance note. */
    get loaded() { return shards.size + (core ? 1 : 0); },
    shardFor,
  });
}
