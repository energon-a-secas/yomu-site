// A dictionary tier that loads nothing until a key is asked for: an index of
// range shards, the key filters that say which shard can hold a key, and the
// shards themselves, each fetched once.
//
// The first tier (data/dict/index.json) has a core and a filter of its own
// and stays in dict.js. This is the shape of the two tiers the second phase
// reads (js/rare.js): the rare words (data/dict/rare.json, filter parts
// over the keys that start with kana) and the names (data/names/index.json,
// one filter inline in the index). Neither is fetched by a text the first pass read in
// full, which is the whole point of keeping them apart.
//
// Shards are found the way the first tier's are: the last shard whose
// `first` is <= the key, in plain JS string order (UTF-16 code units). A
// filter part is found the same way among the parts' `first`s.

import { readFilter } from './bloom.js';

/** The last index in `firsts` whose value is <= key, or -1. */
export function lastAtMost(firsts, key) {
  let lo = 0;
  let hi = firsts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (firsts[mid] <= key) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return found;
}

/** An Error that names the file, so a broken deploy says which shard. */
export function loadError(what, path, cause) {
  const err = new Error(`${what} ${path} could not be loaded: ${cause && cause.message ? cause.message : cause}`);
  err.path = path;
  return err;
}

/** One promise per key while it loads; a failure is forgotten, so a retry fetches again. */
function onceEach(load) {
  const done = new Map();
  const pending = new Map();
  return {
    done,
    get(n) {
      if (done.has(n)) return Promise.resolve();
      if (pending.has(n)) return pending.get(n);
      const p = load(n).then((v) => { done.set(n, v); pending.delete(n); })
        .catch((e) => { pending.delete(n); throw e; });
      pending.set(n, p);
      return p;
    },
  };
}

/**
 * @param {object} o
 * @param {(url: string) => Promise<any>} o.fetchJson
 * @param {(src: string) => string} o.resolve  a published src to a fetchable path
 * @param {string} o.indexPath  where the index is
 * @param {string} o.what       how an error names the tier ("The rare-word index")
 * @param {(entries: object) => void} [o.onShard]  runs once on each loaded shard's entries
 */
export function createRangeStore({ fetchJson, resolve, indexPath, what, onShard }) {
  let index = null;
  let indexing = null;
  let firsts = [];
  let partFirsts = [];
  let inline = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!indexing) {
      indexing = Promise.resolve()
        .then(() => fetchJson(indexPath))
        .then((doc) => {
          if (!doc || !Array.isArray(doc.shards) || !doc.shards.length) throw new Error('it has no shards[]');
          firsts = doc.shards.map((s) => String(s.first));
          partFirsts = (doc.filters || []).map((f) => String(f.first));
          inline = doc.filter ? readFilter(doc.filter) : null;
          index = doc;
          return doc;
        })
        .catch((e) => { indexing = null; throw loadError(what, indexPath, e); });
    }
    return indexing;
  }

  const filters = onceEach((n) => {
    const path = resolve(index.filters[n].src);
    return Promise.resolve().then(() => fetchJson(path)).then(readFilter)
      .catch((e) => { throw loadError('Key filter', path, e); });
  });

  const shards = onceEach((n) => {
    const path = resolve(index.shards[n].src);
    return Promise.resolve().then(() => fetchJson(path)).then((doc) => {
      if (!doc || typeof doc.entries !== 'object' || doc.entries === null) throw new Error('it has no entries');
      if (onShard) onShard(doc.entries);
      return doc.entries;
    }).catch((e) => { throw loadError('Dictionary shard', path, e); });
  });

  /**
   * The filter part that covers `key`, or -1. Parts tile a range of keys
   * (the rare words' parts cover the keys that start with kana): each from
   * its `first` to the next one's, the last to its own `last`. A key before
   * the first or after the last is covered by none.
   */
  function partOf(key) {
    const n = lastAtMost(partFirsts, key);
    if (n < 0) return -1;
    const last = index.filters[n].last;
    return n < partFirsts.length - 1 || last === undefined || key <= String(last) ? n : -1;
  }

  /** Whether the filter covering `key` lets it through; true where no filter covers it. */
  function maybe(key) {
    if (inline) return inline.has(key);
    const n = partFirsts.length ? partOf(key) : -1;
    if (n < 0) return true;
    const bloom = filters.done.get(n);
    return bloom ? bloom.has(key) : true;
  }

  /** Load what these keys need: the index, the filter parts that cover them, the shards they let through. */
  async function need(keys) {
    const list = [...new Set([...(keys || [])].map(String))];
    if (!list.length) return;
    await loadIndex();
    if (partFirsts.length) {
      const parts = new Set(list.map(partOf).filter((n) => n >= 0));
      await Promise.all([...parts].map((n) => filters.get(n)));
    }
    const wanted = new Set();
    for (const k of list) {
      if (!maybe(k)) continue;
      const n = lastAtMost(firsts, k);
      if (n >= 0) wanted.add(n);
    }
    await Promise.all([...wanted].map((n) => shards.get(n)));
  }

  /** The value for one key, or undefined. Synchronous: what need() did not load reads as absent. */
  function get(key) {
    if (!index) return undefined;
    const entries = shards.done.get(lastAtMost(firsts, String(key)));
    return entries && Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : undefined;
  }

  return Object.freeze({
    need,
    get,
    /** Files of this tier loaded so far: the index, filter parts and shards. */
    get loaded() { return (index ? 1 : 0) + filters.done.size + shards.done.size; },
    get maxKey() { return index && index.maxKey ? index.maxKey : 0; },
  });
}
