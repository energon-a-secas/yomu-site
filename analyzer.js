(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // js/bloom.js
  function fnv(key, offset) {
    let h = offset;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, PRIME);
    }
    return h >>> 0;
  }
  function positions(key, m, k) {
    const s = String(key);
    const a = fnv(s, OFFSET_A);
    const b = fnv(s, OFFSET_B) | 1;
    const out = new Array(k);
    for (let i = 0; i < k; i++) out[i] = (a + i * (b >>> 0)) % m;
    return out;
  }
  function decode(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function readFilter(doc) {
    const m = Number(doc && doc.m);
    const k = Number(doc && doc.k);
    if (!(m > 0) || !(k > 0) || typeof doc.bits !== "string") throw new Error("it is not a filter");
    const bits = decode(doc.bits);
    if (bits.length * 8 < m) throw new Error(`it holds ${bits.length * 8} bits, not ${m}`);
    return Object.freeze({
      has(key) {
        for (const p of positions(key, m, k)) if (!(bits[p >> 3] & 1 << (p & 7))) return false;
        return true;
      }
    });
  }
  var OFFSET_A, OFFSET_B, PRIME;
  var init_bloom = __esm({
    "js/bloom.js"() {
      OFFSET_A = 2166136261;
      OFFSET_B = 2538058380;
      PRIME = 16777619;
    }
  });

  // js/range-store.js
  function lastAtMost(firsts, key) {
    let lo = 0;
    let hi = firsts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = lo + hi >> 1;
      if (firsts[mid] <= key) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }
  function loadError(what, path, cause) {
    const err = new Error(`${what} ${path} could not be loaded: ${cause && cause.message ? cause.message : cause}`);
    err.path = path;
    return err;
  }
  function onceEach(load) {
    const done = /* @__PURE__ */ new Map();
    const pending = /* @__PURE__ */ new Map();
    return {
      done,
      get(n2) {
        if (done.has(n2)) return Promise.resolve();
        if (pending.has(n2)) return pending.get(n2);
        const p = load(n2).then((v) => {
          done.set(n2, v);
          pending.delete(n2);
        }).catch((e) => {
          pending.delete(n2);
          throw e;
        });
        pending.set(n2, p);
        return p;
      }
    };
  }
  function createRangeStore({ fetchJson: fetchJson3, resolve, indexPath, what, onShard }) {
    let index = null;
    let indexing = null;
    let firsts = [];
    let partFirsts = [];
    let inline = null;
    function loadIndex() {
      if (index) return Promise.resolve(index);
      if (!indexing) {
        indexing = Promise.resolve().then(() => fetchJson3(indexPath)).then((doc) => {
          if (!doc || !Array.isArray(doc.shards) || !doc.shards.length) throw new Error("it has no shards[]");
          firsts = doc.shards.map((s) => String(s.first));
          partFirsts = (doc.filters || []).map((f) => String(f.first));
          inline = doc.filter ? readFilter(doc.filter) : null;
          index = doc;
          return doc;
        }).catch((e) => {
          indexing = null;
          throw loadError(what, indexPath, e);
        });
      }
      return indexing;
    }
    const filters = onceEach((n2) => {
      const path = resolve(index.filters[n2].src);
      return Promise.resolve().then(() => fetchJson3(path)).then(readFilter).catch((e) => {
        throw loadError("Key filter", path, e);
      });
    });
    const shards = onceEach((n2) => {
      const path = resolve(index.shards[n2].src);
      return Promise.resolve().then(() => fetchJson3(path)).then((doc) => {
        if (!doc || typeof doc.entries !== "object" || doc.entries === null) throw new Error("it has no entries");
        if (onShard) onShard(doc.entries, index.shards[n2].src);
        return doc.entries;
      }).catch((e) => {
        throw loadError("Dictionary shard", path, e);
      });
    });
    function partOf2(key) {
      const n2 = lastAtMost(partFirsts, key);
      if (n2 < 0) return -1;
      const last = index.filters[n2].last;
      return n2 < partFirsts.length - 1 || last === void 0 || key <= String(last) ? n2 : -1;
    }
    function maybe(key) {
      if (inline) return inline.has(key);
      const n2 = partFirsts.length ? partOf2(key) : -1;
      if (n2 < 0) return true;
      const bloom = filters.done.get(n2);
      return bloom ? bloom.has(key) : true;
    }
    async function need(keys) {
      const list2 = [...new Set([...keys || []].map(String))];
      if (!list2.length) return;
      await loadIndex();
      if (partFirsts.length) {
        const parts = new Set(list2.map(partOf2).filter((n2) => n2 >= 0));
        await Promise.all([...parts].map((n2) => filters.get(n2)));
      }
      const wanted = /* @__PURE__ */ new Set();
      for (const k of list2) {
        if (!maybe(k)) continue;
        const n2 = lastAtMost(firsts, k);
        if (n2 >= 0) wanted.add(n2);
      }
      await Promise.all([...wanted].map((n2) => shards.get(n2)));
    }
    function get(key) {
      if (!index) return void 0;
      const entries = shards.done.get(lastAtMost(firsts, String(key)));
      return entries && Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : void 0;
    }
    function srcOf(key) {
      if (!index) return null;
      const n2 = lastAtMost(firsts, String(key));
      return n2 >= 0 ? index.shards[n2].src : null;
    }
    return Object.freeze({
      need,
      get,
      srcOf,
      /** Files of this tier loaded so far: the index, filter parts and shards. */
      get loaded() {
        return (index ? 1 : 0) + filters.done.size + shards.done.size;
      },
      get maxKey() {
        return index && index.maxKey ? index.maxKey : 0;
      }
    });
  }
  var init_range_store = __esm({
    "js/range-store.js"() {
      init_bloom();
    }
  });

  // js/es-files.js
  function esSrc(src) {
    const s = String(src);
    return s.startsWith("data/") ? `data/es/${s.slice("data/".length)}` : `es/${s}`;
  }
  function createEsFiles({ fetchJson: fetchJson3, resolve }) {
    const done = /* @__PURE__ */ new Map();
    const pending = /* @__PURE__ */ new Map();
    function load(src) {
      if (done.has(src)) return Promise.resolve(done.get(src));
      if (pending.has(src)) return pending.get(src);
      const p = Promise.resolve().then(() => fetchJson3(resolve(esSrc(src)))).then((doc) => {
        const body = doc && (doc.entries || doc.rows);
        if (!body || typeof body !== "object") throw new Error("it has no entries");
        done.set(src, body);
        return body;
      }).catch(() => null).finally(() => {
        pending.delete(src);
      });
      pending.set(src, p);
      return p;
    }
    return Object.freeze({
      load,
      get: (src) => done.get(src) || null,
      /** Spanish files loaded so far, for tests. */
      get loaded() {
        return done.size;
      }
    });
  }
  var init_es_files = __esm({
    "js/es-files.js"() {
    }
  });

  // js/dict.js
  function resolver(base) {
    const b = String(base || "");
    const dir = b === "" || b.endsWith("/") ? b : `${b}/`;
    const root2 = dir.endsWith("data/") ? dir.slice(0, -"data/".length) : null;
    const resolve = (src) => {
      const s = String(src);
      if (/^[a-z]+:\/\//i.test(s) || s.startsWith("/")) return s;
      if (root2 !== null && s.startsWith("data/")) return root2 + s;
      return dir + s;
    };
    return { dir, resolve };
  }
  function createDict({ fetchJson: fetchJson3, base = "data/" } = {}) {
    if (typeof fetchJson3 !== "function") throw new TypeError("createDict needs a fetchJson function");
    const { dir, resolve } = resolver(base);
    let index = null;
    let indexing = null;
    let firsts = [];
    const shards = /* @__PURE__ */ new Map();
    const pending = /* @__PURE__ */ new Map();
    let core = null;
    let coring = null;
    let filter = null;
    let filtering = null;
    let kanjiIndex = null;
    let kanjiIndexing = null;
    let kanjiOf3 = /* @__PURE__ */ new Map();
    let kanjiRanges = [];
    let kanjiRangeFirsts = [];
    const kanjiShards = /* @__PURE__ */ new Map();
    const kanjiPending = /* @__PURE__ */ new Map();
    const es = createEsFiles({ fetchJson: fetchJson3, resolve });
    const filed = /* @__PURE__ */ new WeakMap();
    function file2(src, entries) {
      for (const [key, recs] of Object.entries(entries)) {
        if (!Array.isArray(recs)) continue;
        recs.forEach((rec, i) => {
          if (rec && typeof rec === "object") filed.set(rec, [src, key, i]);
        });
      }
    }
    const rare = createRangeStore({
      fetchJson: fetchJson3,
      resolve,
      indexPath: `${dir}dict/rare.json`,
      what: "The rare-word index",
      onShard: (entries, src) => {
        for (const recs of Object.values(entries)) for (const r of recs) r.tier = 2;
        file2(src, entries);
      }
    });
    const names2 = createRangeStore({
      fetchJson: fetchJson3,
      resolve,
      indexPath: `${dir}names/index.json`,
      what: "The names index"
    });
    let likeIndex = null;
    let likeIndexing = null;
    const likeGroups = /* @__PURE__ */ new Map();
    const likePending = /* @__PURE__ */ new Map();
    function loadIndex() {
      if (index) return Promise.resolve(index);
      if (!indexing) {
        const path = `${dir}dict/index.json`;
        indexing = Promise.resolve().then(() => fetchJson3(path)).then((doc) => {
          if (!doc || !Array.isArray(doc.shards) || !doc.shards.length) {
            throw new Error("it has no shards[]");
          }
          index = doc;
          firsts = doc.shards.map((s) => String(s.first));
          return doc;
        }).catch((e) => {
          indexing = null;
          throw loadError("The dictionary index", path, e);
        });
      }
      return indexing;
    }
    function shardFor(key) {
      return lastAtMost(firsts, String(key));
    }
    function loadExtra(what, ref, read) {
      const path = resolve(ref.src);
      return Promise.resolve().then(() => fetchJson3(path)).then(read).catch((e) => {
        throw loadError(what, path, e);
      });
    }
    function loadCore() {
      if (core || !index.core) return Promise.resolve();
      if (!coring) {
        coring = loadExtra("The dictionary core", index.core, (doc) => {
          if (!doc || typeof doc.entries !== "object" || doc.entries === null) throw new Error("it has no entries");
          core = doc.entries;
          file2(index.core.src, core);
        }).catch((e) => {
          coring = null;
          throw e;
        });
      }
      return coring;
    }
    function loadFilter() {
      if (filter || !index.filter) return Promise.resolve();
      if (!filtering) {
        filtering = loadExtra("The key filter", index.filter, (doc) => {
          filter = readFilter(doc);
        }).catch((e) => {
          filtering = null;
          throw e;
        });
      }
      return filtering;
    }
    function loadShard(n2) {
      if (shards.has(n2)) return Promise.resolve();
      if (pending.has(n2)) return pending.get(n2);
      const path = resolve(index.shards[n2].src);
      const p = Promise.resolve().then(() => fetchJson3(path)).then((doc) => {
        if (!doc || typeof doc.entries !== "object" || doc.entries === null) {
          throw new Error("it has no entries");
        }
        shards.set(n2, doc.entries);
        file2(index.shards[n2].src, doc.entries);
        pending.delete(n2);
      }).catch((e) => {
        pending.delete(n2);
        throw loadError("Dictionary shard", path, e);
      });
      pending.set(n2, p);
      return p;
    }
    async function need(keys) {
      await loadIndex();
      const coreLoad = loadCore();
      coreLoad.catch(() => {
      });
      await loadFilter();
      const wanted = /* @__PURE__ */ new Set();
      for (const k of keys || []) {
        if (filter && !filter.has(String(k))) continue;
        const n2 = shardFor(k);
        if (n2 >= 0 && !shards.has(n2)) wanted.add(n2);
      }
      await Promise.all([coreLoad, ...[...wanted].map(loadShard)]);
    }
    function get(key) {
      if (!index) return void 0;
      if (core && Object.prototype.hasOwnProperty.call(core, key)) return core[key];
      const n2 = shardFor(key);
      const entries = n2 >= 0 ? shards.get(n2) : void 0;
      if (!entries || !Object.prototype.hasOwnProperty.call(entries, key)) return void 0;
      return entries[key];
    }
    function loadKanjiIndex() {
      if (kanjiIndex) return Promise.resolve(kanjiIndex);
      if (!kanjiIndexing) {
        const path = `${dir}kanji/index.json`;
        kanjiIndexing = Promise.resolve().then(() => fetchJson3(path)).then((doc) => {
          if (!doc || !Array.isArray(doc.shards)) throw new Error("it has no shards[]");
          kanjiOf3 = /* @__PURE__ */ new Map();
          kanjiRanges = [];
          doc.shards.forEach((s, n2) => {
            if (s.chars !== void 0) {
              for (const ch of typeof s.chars === "string" ? [...s.chars] : s.chars) kanjiOf3.set(ch, n2);
            } else if (s.first !== void 0) {
              kanjiRanges.push({ n: n2, first: String(s.first), last: s.last === void 0 ? null : String(s.last) });
            }
          });
          kanjiRangeFirsts = kanjiRanges.map((r) => r.first);
          kanjiIndex = doc;
          return doc;
        }).catch((e) => {
          kanjiIndexing = null;
          throw loadError("The kanji index", path, e);
        });
      }
      return kanjiIndexing;
    }
    function kanjiShardFor(ch) {
      if (kanjiOf3.has(ch)) return kanjiOf3.get(ch);
      const k = lastAtMost(kanjiRangeFirsts, ch);
      if (k < 0) return -1;
      const range = kanjiRanges[k];
      return range.last !== null && ch > range.last ? -1 : range.n;
    }
    function loadKanjiShard(n2) {
      if (kanjiShards.has(n2)) return Promise.resolve();
      if (kanjiPending.has(n2)) return kanjiPending.get(n2);
      const path = resolve(kanjiIndex.shards[n2].src);
      const p = Promise.resolve().then(() => fetchJson3(path)).then((doc) => {
        const map = doc && (doc.kanji || doc.entries || doc.chars);
        if (!map || typeof map !== "object") throw new Error("it has no kanji");
        kanjiShards.set(n2, map);
        kanjiPending.delete(n2);
      }).catch((e) => {
        kanjiPending.delete(n2);
        throw loadError("Kanji shard", path, e);
      });
      kanjiPending.set(n2, p);
      return p;
    }
    async function kanji(chars3) {
      await loadKanjiIndex();
      const list2 = [...new Set(typeof chars3 === "string" ? [...chars3] : [...chars3 || []])];
      const wanted = /* @__PURE__ */ new Set();
      for (const ch of list2) {
        const n2 = kanjiShardFor(ch);
        if (n2 >= 0 && !kanjiShards.has(n2)) wanted.add(n2);
      }
      await Promise.all([...wanted].map(loadKanjiShard));
      const out = /* @__PURE__ */ new Map();
      for (const ch of list2) {
        const n2 = kanjiShardFor(ch);
        const map = n2 >= 0 ? kanjiShards.get(n2) : void 0;
        if (map && Object.prototype.hasOwnProperty.call(map, ch)) out.set(ch, map[ch]);
      }
      return out;
    }
    async function needEs(records) {
      const srcs = /* @__PURE__ */ new Set();
      for (const rec of records || []) {
        const at = rec && typeof rec === "object" ? filed.get(rec) : void 0;
        if (at) srcs.add(at[0]);
      }
      await Promise.all([...srcs].map(es.load));
    }
    function esOf(rec) {
      const at = rec && typeof rec === "object" ? filed.get(rec) : void 0;
      const entries = at ? es.get(at[0]) : null;
      const list2 = entries && Object.prototype.hasOwnProperty.call(entries, at[1]) ? entries[at[1]] : null;
      const g = Array.isArray(list2) ? list2[at[2]] : null;
      return Array.isArray(g) && g.length ? g : null;
    }
    async function kanjiEs(chars3) {
      await loadKanjiIndex();
      const list2 = [...new Set(typeof chars3 === "string" ? [...chars3] : [...chars3 || []])];
      const srcOf = /* @__PURE__ */ new Map();
      for (const ch of list2) {
        const n2 = kanjiShardFor(ch);
        if (n2 >= 0) srcOf.set(ch, kanjiIndex.shards[n2].src);
      }
      await Promise.all([...new Set(srcOf.values())].map(es.load));
      const out = /* @__PURE__ */ new Map();
      for (const [ch, src] of srcOf) {
        const map = es.get(src);
        const m = map && Object.prototype.hasOwnProperty.call(map, ch) ? map[ch] : null;
        if (Array.isArray(m) && m.length) out.set(ch, m);
      }
      return out;
    }
    function loadLikeIndex() {
      if (likeIndex) return Promise.resolve(likeIndex);
      if (!likeIndexing) {
        const path = `${dir}like/index.json`;
        likeIndexing = Promise.resolve().then(() => fetchJson3(path)).then((doc) => {
          if (!doc || !doc.groups || typeof doc.groups !== "object" || !doc.pieces) throw new Error("it has no groups or pieces");
          likeIndex = doc;
          return doc;
        }).catch((e) => {
          likeIndexing = null;
          throw loadError("The sound-alike index", path, e);
        });
      }
      return likeIndexing;
    }
    function loadLikeGroup(id) {
      if (likeGroups.has(id)) return Promise.resolve();
      if (likePending.has(id)) return likePending.get(id);
      const path = resolve(likeIndex.groups[id].src);
      const p = Promise.resolve().then(() => fetchJson3(path)).then((doc) => {
        if (!doc || !doc.words || typeof doc.words !== "object") throw new Error("it has no words");
        likeGroups.set(id, Object.entries(doc.words));
        likePending.delete(id);
      }).catch((e) => {
        likePending.delete(id);
        throw loadError("Sound-alike group", path, e);
      });
      likePending.set(id, p);
      return p;
    }
    async function needLike(ids) {
      await loadLikeIndex();
      await Promise.all([...new Set(ids || [])].filter((id) => Object.hasOwn(likeIndex.groups, id)).map(loadLikeGroup));
    }
    function like() {
      return likeIndex ? { pieces: likeIndex.pieces, words: (id) => likeGroups.get(id) || [] } : null;
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
      needNames: names2.need,
      /** A name's record `{ r?, n, f?, s? }`, or undefined. */
      name: names2.get,
      /** Files of the second phase's tiers loaded so far, for tests and the measurements. */
      get loadedRare() {
        return rare.loaded + names2.loaded;
      },
      /** Load the sound-alike index and these groups (js/sounds-like.js). */
      needLike,
      /** The sound-alike data loaded so far, or null. */
      like,
      /** Sound-alike files loaded so far, the index included, for tests. */
      get loadedLike() {
        return likeGroups.size + (likeIndex ? 1 : 0);
      },
      /** Load the Spanish of these records (data/es/dict/), only when Spanish is asked for. */
      needEs,
      /** A record's Spanish meanings, or null. */
      esOf,
      /** Spanish meanings of these kanji (data/es/kanji/): Map char -> string[]. */
      kanjiEs,
      /** Spanish files loaded so far, for tests: none for a reader in English. */
      get loadedEs() {
        return es.loaded;
      },
      /** Longest key in the dictionary; the lattice never looks further. */
      get maxKey() {
        return index && index.maxKey ? index.maxKey : 12;
      },
      /** How many dictionary files (the core and range shards) are loaded, for tests and the performance note. */
      get loaded() {
        return shards.size + (core ? 1 : 0);
      },
      shardFor
    });
  }
  var init_dict = __esm({
    "js/dict.js"() {
      init_bloom();
      init_range_store();
      init_es_files();
    }
  });

  // js/vendor/wanakana.js
  function typeOf(value) {
    if (value === null) {
      return "null";
    }
    if (value !== Object(value)) {
      return typeof value;
    }
    return {}.toString.call(value).slice(8, -1).toLowerCase();
  }
  function isEmpty(input) {
    if (typeOf(input) !== "string") {
      return true;
    }
    return !input.length;
  }
  function isCharInRange(char = "", start, end) {
    if (isEmpty(char))
      return false;
    const code = char.charCodeAt(0);
    return start <= code && code <= end;
  }
  function isEqual(first, second) {
    if (first === second) {
      return true;
    }
    if (safeIsNaN(first) && safeIsNaN(second)) {
      return true;
    }
    return false;
  }
  function areInputsEqual(newInputs, lastInputs) {
    if (newInputs.length !== lastInputs.length) {
      return false;
    }
    for (var i = 0; i < newInputs.length; i++) {
      if (!isEqual(newInputs[i], lastInputs[i])) {
        return false;
      }
    }
    return true;
  }
  function memoizeOne(resultFn, isEqual2) {
    if (isEqual2 === void 0) {
      isEqual2 = areInputsEqual;
    }
    var cache2 = null;
    function memoized() {
      var newArgs = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        newArgs[_i] = arguments[_i];
      }
      if (cache2 && cache2.lastThis === this && isEqual2(newArgs, cache2.lastArgs)) {
        return cache2.lastResult;
      }
      var lastResult = resultFn.apply(this, newArgs);
      cache2 = {
        lastResult,
        lastArgs: newArgs,
        lastThis: this
      };
      return lastResult;
    }
    memoized.clear = function clear() {
      cache2 = null;
    };
    return memoized;
  }
  function find(iter, tar, key) {
    for (key of iter.keys()) {
      if (dequal(key, tar))
        return key;
    }
  }
  function dequal(foo, bar) {
    var ctor, len3, tmp;
    if (foo === bar)
      return true;
    if (foo && bar && (ctor = foo.constructor) === bar.constructor) {
      if (ctor === Date)
        return foo.getTime() === bar.getTime();
      if (ctor === RegExp)
        return foo.toString() === bar.toString();
      if (ctor === Array) {
        if ((len3 = foo.length) === bar.length) {
          while (len3-- && dequal(foo[len3], bar[len3]))
            ;
        }
        return len3 === -1;
      }
      if (ctor === Set) {
        if (foo.size !== bar.size) {
          return false;
        }
        for (len3 of foo) {
          tmp = len3;
          if (tmp && typeof tmp === "object") {
            tmp = find(bar, tmp);
            if (!tmp)
              return false;
          }
          if (!bar.has(tmp))
            return false;
        }
        return true;
      }
      if (ctor === Map) {
        if (foo.size !== bar.size) {
          return false;
        }
        for (len3 of foo) {
          tmp = len3[0];
          if (tmp && typeof tmp === "object") {
            tmp = find(bar, tmp);
            if (!tmp)
              return false;
          }
          if (!dequal(len3[1], bar.get(tmp))) {
            return false;
          }
        }
        return true;
      }
      if (ctor === ArrayBuffer) {
        foo = new Uint8Array(foo);
        bar = new Uint8Array(bar);
      } else if (ctor === DataView) {
        if ((len3 = foo.byteLength) === bar.byteLength) {
          while (len3-- && foo.getInt8(len3) === bar.getInt8(len3))
            ;
        }
        return len3 === -1;
      }
      if (ArrayBuffer.isView(foo)) {
        if ((len3 = foo.byteLength) === bar.byteLength) {
          while (len3-- && foo[len3] === bar[len3])
            ;
        }
        return len3 === -1;
      }
      if (!ctor || typeof foo === "object") {
        len3 = 0;
        for (ctor in foo) {
          if (has.call(foo, ctor) && ++len3 && !has.call(bar, ctor))
            return false;
          if (!(ctor in bar) || !dequal(foo[ctor], bar[ctor]))
            return false;
        }
        return Object.keys(bar).length === len3;
      }
    }
    return foo !== foo && bar !== bar;
  }
  function applyMapping(string, mapping, convertEnding) {
    const root2 = mapping;
    function nextSubtree(tree, nextChar) {
      const subtree = tree[nextChar];
      if (subtree === void 0) {
        return void 0;
      }
      return Object.assign({ "": tree[""] + nextChar }, tree[nextChar]);
    }
    function newChunk(remaining, currentCursor) {
      const firstChar = remaining.charAt(0);
      return parse2(Object.assign({ "": firstChar }, root2[firstChar]), remaining.slice(1), currentCursor, currentCursor + 1);
    }
    function parse2(tree, remaining, lastCursor, currentCursor) {
      if (!remaining) {
        if (convertEnding || Object.keys(tree).length === 1) {
          return tree[""] ? [[lastCursor, currentCursor, tree[""]]] : [];
        }
        return [[lastCursor, currentCursor, null]];
      }
      if (Object.keys(tree).length === 1) {
        return [[lastCursor, currentCursor, tree[""]]].concat(newChunk(remaining, currentCursor));
      }
      const subtree = nextSubtree(tree, remaining.charAt(0));
      if (subtree === void 0) {
        return [[lastCursor, currentCursor, tree[""]]].concat(newChunk(remaining, currentCursor));
      }
      return parse2(subtree, remaining.slice(1), lastCursor, currentCursor + 1);
    }
    return newChunk(string, 0);
  }
  function transform(tree) {
    return Object.entries(tree).reduce((map, [char, subtree]) => {
      const endOfBranch = typeOf(subtree) === "string";
      map[char] = endOfBranch ? { "": subtree } : transform(subtree);
      return map;
    }, {});
  }
  function getSubTreeOf(tree, string) {
    return string.split("").reduce((correctSubTree, char) => {
      if (correctSubTree[char] === void 0) {
        correctSubTree[char] = {};
      }
      return correctSubTree[char];
    }, tree);
  }
  function createCustomMapping(customMap = {}) {
    const customTree = {};
    if (typeOf(customMap) === "object") {
      Object.entries(customMap).forEach(([roma, kana]) => {
        let subTree = customTree;
        roma.split("").forEach((char) => {
          if (subTree[char] === void 0) {
            subTree[char] = {};
          }
          subTree = subTree[char];
        });
        subTree[""] = kana;
      });
    }
    return function makeMap(map) {
      const mapCopy = JSON.parse(JSON.stringify(map));
      function transformMap(mapSubtree, customSubtree) {
        if (mapSubtree === void 0 || typeOf(mapSubtree) === "string") {
          return customSubtree;
        }
        return Object.entries(customSubtree).reduce((newSubtree, [char, subtree]) => {
          newSubtree[char] = transformMap(mapSubtree[char], subtree);
          return newSubtree;
        }, mapSubtree);
      }
      return transformMap(mapCopy, customTree);
    };
  }
  function mergeCustomMapping(map, customMapping) {
    if (!customMapping) {
      return map;
    }
    return typeOf(customMapping) === "function" ? customMapping(map) : createCustomMapping(customMapping)(map);
  }
  function createRomajiToKanaMap$1() {
    const kanaTree = transform(BASIC_KUNREI);
    const subtreeOf = (string) => getSubTreeOf(kanaTree, string);
    Object.entries(CONSONANTS).forEach(([consonant, yKana]) => {
      Object.entries(SMALL_Y$1).forEach(([roma, kana]) => {
        subtreeOf(consonant + roma)[""] = yKana + kana;
      });
    });
    Object.entries(SPECIAL_SYMBOLS$1).forEach(([symbol, jsymbol]) => {
      subtreeOf(symbol)[""] = jsymbol;
    });
    Object.entries(AIUEO_CONSTRUCTIONS).forEach(([consonant, aiueoKana]) => {
      Object.entries(SMALL_VOWELS).forEach(([vowel, kana]) => {
        const subtree = subtreeOf(consonant + vowel);
        subtree[""] = aiueoKana + kana;
      });
    });
    ["n", "n'", "xn"].forEach((nChar) => {
      subtreeOf(nChar)[""] = "\u3093";
    });
    kanaTree.c = JSON.parse(JSON.stringify(kanaTree.k));
    Object.entries(ALIASES).forEach(([string, alternative]) => {
      const allExceptLast = string.slice(0, string.length - 1);
      const last = string.charAt(string.length - 1);
      const parentTree = subtreeOf(allExceptLast);
      parentTree[last] = JSON.parse(JSON.stringify(subtreeOf(alternative)));
    });
    function getAlternatives(string) {
      return [...Object.entries(ALIASES), ...[["c", "k"]]].reduce((list2, [alt, roma]) => string.startsWith(roma) ? list2.concat(string.replace(roma, alt)) : list2, []);
    }
    Object.entries(SMALL_LETTERS).forEach(([kunreiRoma, kana]) => {
      const last = (char) => char.charAt(char.length - 1);
      const allExceptLast = (chars3) => chars3.slice(0, chars3.length - 1);
      const xRoma = `x${kunreiRoma}`;
      const xSubtree = subtreeOf(xRoma);
      xSubtree[""] = kana;
      const parentTree = subtreeOf(`l${allExceptLast(kunreiRoma)}`);
      parentTree[last(kunreiRoma)] = xSubtree;
      getAlternatives(kunreiRoma).forEach((altRoma) => {
        ["l", "x"].forEach((prefix) => {
          const altParentTree = subtreeOf(prefix + allExceptLast(altRoma));
          altParentTree[last(altRoma)] = subtreeOf(prefix + kunreiRoma);
        });
      });
    });
    Object.entries(SPECIAL_CASES).forEach(([string, kana]) => {
      subtreeOf(string)[""] = kana;
    });
    function addTsu(tree) {
      return Object.entries(tree).reduce((tsuTree, [key, value]) => {
        if (!key) {
          tsuTree[key] = `\u3063${value}`;
        } else {
          tsuTree[key] = addTsu(value);
        }
        return tsuTree;
      }, {});
    }
    [...Object.keys(CONSONANTS), "c", "y", "w", "j"].forEach((consonant) => {
      const subtree = kanaTree[consonant];
      subtree[consonant] = addTsu(subtree);
    });
    delete kanaTree.n.n;
    return Object.freeze(JSON.parse(JSON.stringify(kanaTree)));
  }
  function getRomajiToKanaTree() {
    if (romajiToKanaMap == null) {
      romajiToKanaMap = createRomajiToKanaMap$1();
    }
    return romajiToKanaMap;
  }
  function IME_MODE_MAP(map) {
    const mapCopy = JSON.parse(JSON.stringify(map));
    mapCopy.n.n = { "": "\u3093" };
    mapCopy.n[" "] = { "": "\u3093" };
    return mapCopy;
  }
  function isCharUpperCase(char = "") {
    if (isEmpty(char))
      return false;
    return isCharInRange(char, LATIN_UPPERCASE_START, LATIN_UPPERCASE_END);
  }
  function isCharLongDash(char = "") {
    if (isEmpty(char))
      return false;
    return char.charCodeAt(0) === PROLONGED_SOUND_MARK;
  }
  function isCharSlashDot(char = "") {
    if (isEmpty(char))
      return false;
    return char.charCodeAt(0) === KANA_SLASH_DOT;
  }
  function isCharHiragana(char = "") {
    if (isEmpty(char))
      return false;
    if (isCharLongDash(char))
      return true;
    return isCharInRange(char, HIRAGANA_START, HIRAGANA_END);
  }
  function hiraganaToKatakana(input = "") {
    const kata = [];
    input.split("").forEach((char) => {
      if (isCharLongDash(char) || isCharSlashDot(char)) {
        kata.push(char);
      } else if (isCharHiragana(char)) {
        const code = char.charCodeAt(0) + (KATAKANA_START - HIRAGANA_START);
        const kataChar = String.fromCharCode(code);
        kata.push(kataChar);
      } else {
        kata.push(char);
      }
    });
    return kata.join("");
  }
  function toKana(input = "", options = {}, map) {
    let config;
    if (!map) {
      config = mergeWithDefaultOptions(options);
      map = createRomajiToKanaMap(config.IMEMode, config.useObsoleteKana, config.customKanaMapping);
    } else {
      config = options;
    }
    return splitIntoConvertedKana(input, config, map).map((kanaToken) => {
      const [start, end, kana] = kanaToken;
      if (kana === null) {
        return input.slice(start);
      }
      const enforceHiragana = config.IMEMode === TO_KANA_METHODS.HIRAGANA;
      const enforceKatakana = config.IMEMode === TO_KANA_METHODS.KATAKANA || [...input.slice(start, end)].every(isCharUpperCase);
      return enforceHiragana || !enforceKatakana ? kana : hiraganaToKatakana(kana);
    }).join("");
  }
  function splitIntoConvertedKana(input = "", options = {}, map) {
    const { IMEMode, useObsoleteKana, customKanaMapping } = options;
    if (!map) {
      map = createRomajiToKanaMap(IMEMode, useObsoleteKana, customKanaMapping);
    }
    return applyMapping(input.toLowerCase(), map, !IMEMode);
  }
  function isCharRomaji(char = "") {
    if (isEmpty(char))
      return false;
    return ROMAJI_RANGES.some(([start, end]) => isCharInRange(char, start, end));
  }
  function isRomaji(input = "", allowed) {
    const augmented = typeOf(allowed) === "regexp";
    return isEmpty(input) ? false : [...input].every((char) => {
      const isRoma = isCharRomaji(char);
      return !augmented ? isRoma : isRoma || allowed.test(char);
    });
  }
  function isCharKatakana(char = "") {
    return isCharInRange(char, KATAKANA_START, KATAKANA_END);
  }
  function isHiragana(input = "") {
    if (isEmpty(input))
      return false;
    return [...input].every(isCharHiragana);
  }
  function isKatakana(input = "") {
    if (isEmpty(input))
      return false;
    return [...input].every(isCharKatakana);
  }
  function isCharIterationMark(char = "") {
    if (isEmpty(char))
      return false;
    return char.charCodeAt(0) === KANJI_ITERATION_MARK;
  }
  function isCharKanji(char = "") {
    return isCharInRange(char, KANJI_START, KANJI_END) || isCharIterationMark(char);
  }
  function isKanji(input = "") {
    if (isEmpty(input))
      return false;
    return [...input].every(isCharKanji);
  }
  function isMixed(input = "", options = { passKanji: true }) {
    const chars3 = [...input];
    let hasKanji3 = false;
    if (!options.passKanji) {
      hasKanji3 = chars3.some(isKanji);
    }
    return (chars3.some(isHiragana) || chars3.some(isKatakana)) && chars3.some(isRomaji) && !hasKanji3;
  }
  function katakanaToHiragana(input = "", toRomaji2, { isDestinationRomaji, convertLongVowelMark } = {}) {
    let previousKana = "";
    return input.split("").reduce((hira, char, index) => {
      if (isCharSlashDot(char) || isCharInitialLongDash(char, index) || isKanaAsSymbol(char)) {
        return hira.concat(char);
      }
      if (convertLongVowelMark && previousKana && isCharInnerLongDash(char, index)) {
        const romaji = toRomaji2(previousKana).slice(-1);
        if (isCharKatakana(input[index - 1]) && romaji === "o" && isDestinationRomaji) {
          return hira.concat("\u304A");
        }
        return hira.concat(LONG_VOWELS[romaji]);
      }
      if (!isCharLongDash(char) && isCharKatakana(char)) {
        const code = char.charCodeAt(0) + (HIRAGANA_START - KATAKANA_START);
        const hiraChar = String.fromCharCode(code);
        previousKana = hiraChar;
        return hira.concat(hiraChar);
      }
      previousKana = "";
      return hira.concat(char);
    }, []).join("");
  }
  function getKanaToHepburnTree() {
    if (kanaToHepburnMap == null) {
      kanaToHepburnMap = createKanaToHepburnMap();
    }
    return kanaToHepburnMap;
  }
  function getKanaToRomajiTree(romanization) {
    switch (romanization) {
      case ROMANIZATIONS.HEPBURN:
        return getKanaToHepburnTree();
      default:
        return {};
    }
  }
  function createKanaToHepburnMap() {
    const romajiTree = transform(BASIC_ROMAJI);
    const subtreeOf = (string) => getSubTreeOf(romajiTree, string);
    const setTrans = (string, transliteration) => {
      subtreeOf(string)[""] = transliteration;
    };
    Object.entries(SPECIAL_SYMBOLS).forEach(([jsymbol, symbol]) => {
      subtreeOf(jsymbol)[""] = symbol;
    });
    [...Object.entries(SMALL_Y), ...Object.entries(SMALL_AIUEO)].forEach(([roma, kana]) => {
      setTrans(roma, kana);
    });
    YOON_KANA.forEach((kana) => {
      const firstRomajiChar = subtreeOf(kana)[""][0];
      Object.entries(SMALL_Y).forEach(([yKana, yRoma]) => {
        setTrans(kana + yKana, firstRomajiChar + yRoma);
      });
      Object.entries(SMALL_Y_EXTRA).forEach(([yKana, yRoma]) => {
        setTrans(kana + yKana, firstRomajiChar + yRoma);
      });
    });
    Object.entries(YOON_EXCEPTIONS).forEach(([kana, roma]) => {
      Object.entries(SMALL_Y).forEach(([yKana, yRoma]) => {
        setTrans(kana + yKana, roma + yRoma[1]);
      });
      setTrans(`${kana}\u3043`, `${roma}yi`);
      setTrans(`${kana}\u3047`, `${roma}e`);
    });
    romajiTree["\u3063"] = resolveTsu(romajiTree);
    Object.entries(SMALL_KANA).forEach(([kana, roma]) => {
      setTrans(kana, roma);
    });
    AMBIGUOUS_VOWELS.forEach((kana) => {
      setTrans(`\u3093${kana}`, `n'${subtreeOf(kana)[""]}`);
    });
    return Object.freeze(JSON.parse(JSON.stringify(romajiTree)));
  }
  function resolveTsu(tree) {
    return Object.entries(tree).reduce((tsuTree, [key, value]) => {
      if (!key) {
        const consonant = value.charAt(0);
        tsuTree[key] = Object.keys(SOKUON_WHITELIST).includes(consonant) ? SOKUON_WHITELIST[consonant] + value : value;
      } else {
        tsuTree[key] = resolveTsu(value);
      }
      return tsuTree;
    }, {});
  }
  function toRomaji(input = "", options = {}, map) {
    const config = mergeWithDefaultOptions(options);
    if (!map) {
      map = createKanaToRomajiMap(config.romanization, config.customRomajiMapping);
    }
    return splitIntoRomaji(input, config, map).map((romajiToken) => {
      const [start, end, romaji] = romajiToken;
      const makeUpperCase = config.upcaseKatakana && isKatakana(input.slice(start, end));
      return makeUpperCase ? romaji.toUpperCase() : romaji;
    }).join("");
  }
  function splitIntoRomaji(input, options, map) {
    if (!map) {
      map = createKanaToRomajiMap(options.romanization, options.customRomajiMapping);
    }
    const config = Object.assign({}, { isDestinationRomaji: true }, options);
    return applyMapping(katakanaToHiragana(input, toRomaji, config), map, !options.IMEMode);
  }
  function isCharEnglishPunctuation(char = "") {
    if (isEmpty(char))
      return false;
    return EN_PUNCTUATION_RANGES.some(([start, end]) => isCharInRange(char, start, end));
  }
  function toHiragana(input = "", options = {}) {
    const config = mergeWithDefaultOptions(options);
    if (config.passRomaji) {
      return katakanaToHiragana(input, toRomaji, config);
    }
    if (isMixed(input, { passKanji: true })) {
      const convertedKatakana = katakanaToHiragana(input, toRomaji, config);
      return toKana(convertedKatakana.toLowerCase(), config);
    }
    if (isRomaji(input) || isCharEnglishPunctuation(input)) {
      return toKana(input.toLowerCase(), config);
    }
    return katakanaToHiragana(input, toRomaji, config);
  }
  var TO_KANA_METHODS, ROMANIZATIONS, DEFAULT_OPTIONS, LATIN_UPPERCASE_START, LATIN_UPPERCASE_END, LOWERCASE_ZENKAKU_START, LOWERCASE_ZENKAKU_END, UPPERCASE_ZENKAKU_START, UPPERCASE_ZENKAKU_END, HIRAGANA_START, HIRAGANA_END, KATAKANA_START, KATAKANA_END, KANJI_START, KANJI_END, KANJI_ITERATION_MARK, PROLONGED_SOUND_MARK, KANA_SLASH_DOT, ZENKAKU_NUMBERS, ZENKAKU_UPPERCASE, ZENKAKU_LOWERCASE, ZENKAKU_PUNCTUATION_1, ZENKAKU_PUNCTUATION_2, ZENKAKU_PUNCTUATION_3, ZENKAKU_PUNCTUATION_4, ZENKAKU_SYMBOLS_CURRENCY, HIRAGANA_CHARS, KATAKANA_CHARS, HANKAKU_KATAKANA, KATAKANA_PUNCTUATION, KANA_PUNCTUATION, CJK_SYMBOLS_PUNCTUATION, COMMON_CJK, RARE_CJK, KANA_RANGES, JA_PUNCTUATION_RANGES, JAPANESE_RANGES, MODERN_ENGLISH, HEPBURN_MACRON_RANGES, SMART_QUOTE_RANGES, ROMAJI_RANGES, EN_PUNCTUATION_RANGES, safeIsNaN, has, mergeWithDefaultOptions, BASIC_KUNREI, SPECIAL_SYMBOLS$1, CONSONANTS, SMALL_Y$1, SMALL_VOWELS, ALIASES, SMALL_LETTERS, SPECIAL_CASES, AIUEO_CONSTRUCTIONS, romajiToKanaMap, USE_OBSOLETE_KANA_MAP, createRomajiToKanaMap, isCharInitialLongDash, isCharInnerLongDash, isKanaAsSymbol, LONG_VOWELS, kanaToHepburnMap, BASIC_ROMAJI, SPECIAL_SYMBOLS, AMBIGUOUS_VOWELS, SMALL_Y, SMALL_Y_EXTRA, SMALL_AIUEO, YOON_KANA, YOON_EXCEPTIONS, SMALL_KANA, SOKUON_WHITELIST, createKanaToRomajiMap;
  var init_wanakana = __esm({
    "js/vendor/wanakana.js"() {
      TO_KANA_METHODS = {
        HIRAGANA: "toHiragana",
        KATAKANA: "toKatakana"
      };
      ROMANIZATIONS = {
        HEPBURN: "hepburn"
      };
      DEFAULT_OPTIONS = {
        useObsoleteKana: false,
        passRomaji: false,
        convertLongVowelMark: true,
        upcaseKatakana: false,
        IMEMode: false,
        romanization: ROMANIZATIONS.HEPBURN
      };
      LATIN_UPPERCASE_START = 65;
      LATIN_UPPERCASE_END = 90;
      LOWERCASE_ZENKAKU_START = 65345;
      LOWERCASE_ZENKAKU_END = 65370;
      UPPERCASE_ZENKAKU_START = 65313;
      UPPERCASE_ZENKAKU_END = 65338;
      HIRAGANA_START = 12353;
      HIRAGANA_END = 12438;
      KATAKANA_START = 12449;
      KATAKANA_END = 12540;
      KANJI_START = 19968;
      KANJI_END = 40879;
      KANJI_ITERATION_MARK = 12293;
      PROLONGED_SOUND_MARK = 12540;
      KANA_SLASH_DOT = 12539;
      ZENKAKU_NUMBERS = [65296, 65305];
      ZENKAKU_UPPERCASE = [UPPERCASE_ZENKAKU_START, UPPERCASE_ZENKAKU_END];
      ZENKAKU_LOWERCASE = [LOWERCASE_ZENKAKU_START, LOWERCASE_ZENKAKU_END];
      ZENKAKU_PUNCTUATION_1 = [65281, 65295];
      ZENKAKU_PUNCTUATION_2 = [65306, 65311];
      ZENKAKU_PUNCTUATION_3 = [65339, 65343];
      ZENKAKU_PUNCTUATION_4 = [65371, 65376];
      ZENKAKU_SYMBOLS_CURRENCY = [65504, 65518];
      HIRAGANA_CHARS = [12352, 12447];
      KATAKANA_CHARS = [12448, 12543];
      HANKAKU_KATAKANA = [65382, 65439];
      KATAKANA_PUNCTUATION = [12539, 12540];
      KANA_PUNCTUATION = [65377, 65381];
      CJK_SYMBOLS_PUNCTUATION = [12288, 12351];
      COMMON_CJK = [19968, 40959];
      RARE_CJK = [13312, 19903];
      KANA_RANGES = [
        HIRAGANA_CHARS,
        KATAKANA_CHARS,
        KANA_PUNCTUATION,
        HANKAKU_KATAKANA
      ];
      JA_PUNCTUATION_RANGES = [
        CJK_SYMBOLS_PUNCTUATION,
        KANA_PUNCTUATION,
        KATAKANA_PUNCTUATION,
        ZENKAKU_PUNCTUATION_1,
        ZENKAKU_PUNCTUATION_2,
        ZENKAKU_PUNCTUATION_3,
        ZENKAKU_PUNCTUATION_4,
        ZENKAKU_SYMBOLS_CURRENCY
      ];
      JAPANESE_RANGES = [
        ...KANA_RANGES,
        ...JA_PUNCTUATION_RANGES,
        ZENKAKU_UPPERCASE,
        ZENKAKU_LOWERCASE,
        ZENKAKU_NUMBERS,
        COMMON_CJK,
        RARE_CJK
      ];
      MODERN_ENGLISH = [0, 127];
      HEPBURN_MACRON_RANGES = [
        [256, 257],
        [274, 275],
        [298, 299],
        [332, 333],
        [362, 363]
        // Ū ū
      ];
      SMART_QUOTE_RANGES = [
        [8216, 8217],
        [8220, 8221]
        // “ ”
      ];
      ROMAJI_RANGES = [MODERN_ENGLISH, ...HEPBURN_MACRON_RANGES];
      EN_PUNCTUATION_RANGES = [
        [32, 47],
        [58, 63],
        [91, 96],
        [123, 126],
        ...SMART_QUOTE_RANGES
      ];
      safeIsNaN = Number.isNaN || function ponyfill(value) {
        return typeof value === "number" && value !== value;
      };
      has = Object.prototype.hasOwnProperty;
      mergeWithDefaultOptions = (opts = {}) => Object.assign({}, DEFAULT_OPTIONS, opts);
      BASIC_KUNREI = {
        a: "\u3042",
        i: "\u3044",
        u: "\u3046",
        e: "\u3048",
        o: "\u304A",
        k: { a: "\u304B", i: "\u304D", u: "\u304F", e: "\u3051", o: "\u3053" },
        s: { a: "\u3055", i: "\u3057", u: "\u3059", e: "\u305B", o: "\u305D" },
        t: { a: "\u305F", i: "\u3061", u: "\u3064", e: "\u3066", o: "\u3068" },
        n: { a: "\u306A", i: "\u306B", u: "\u306C", e: "\u306D", o: "\u306E" },
        h: { a: "\u306F", i: "\u3072", u: "\u3075", e: "\u3078", o: "\u307B" },
        m: { a: "\u307E", i: "\u307F", u: "\u3080", e: "\u3081", o: "\u3082" },
        y: { a: "\u3084", u: "\u3086", o: "\u3088" },
        r: { a: "\u3089", i: "\u308A", u: "\u308B", e: "\u308C", o: "\u308D" },
        w: { a: "\u308F", i: "\u3090", e: "\u3091", o: "\u3092" },
        g: { a: "\u304C", i: "\u304E", u: "\u3050", e: "\u3052", o: "\u3054" },
        z: { a: "\u3056", i: "\u3058", u: "\u305A", e: "\u305C", o: "\u305E" },
        d: { a: "\u3060", i: "\u3062", u: "\u3065", e: "\u3067", o: "\u3069" },
        b: { a: "\u3070", i: "\u3073", u: "\u3076", e: "\u3079", o: "\u307C" },
        p: { a: "\u3071", i: "\u3074", u: "\u3077", e: "\u307A", o: "\u307D" },
        v: { a: "\u3094\u3041", i: "\u3094\u3043", u: "\u3094", e: "\u3094\u3047", o: "\u3094\u3049" }
      };
      SPECIAL_SYMBOLS$1 = {
        ".": "\u3002",
        ",": "\u3001",
        ":": "\uFF1A",
        "/": "\u30FB",
        "!": "\uFF01",
        "?": "\uFF1F",
        "~": "\u301C",
        "-": "\u30FC",
        "\u2018": "\u300C",
        "\u2019": "\u300D",
        "\u201C": "\u300E",
        "\u201D": "\u300F",
        "[": "\uFF3B",
        "]": "\uFF3D",
        "(": "\uFF08",
        ")": "\uFF09",
        "{": "\uFF5B",
        "}": "\uFF5D"
      };
      CONSONANTS = {
        k: "\u304D",
        s: "\u3057",
        t: "\u3061",
        n: "\u306B",
        h: "\u3072",
        m: "\u307F",
        r: "\u308A",
        g: "\u304E",
        z: "\u3058",
        d: "\u3062",
        b: "\u3073",
        p: "\u3074",
        v: "\u3094",
        q: "\u304F",
        f: "\u3075"
      };
      SMALL_Y$1 = { ya: "\u3083", yi: "\u3043", yu: "\u3085", ye: "\u3047", yo: "\u3087" };
      SMALL_VOWELS = { a: "\u3041", i: "\u3043", u: "\u3045", e: "\u3047", o: "\u3049" };
      ALIASES = {
        sh: "sy",
        ch: "ty",
        cy: "ty",
        chy: "ty",
        shy: "sy",
        j: "zy",
        jy: "zy",
        // exceptions to above rules
        shi: "si",
        chi: "ti",
        tsu: "tu",
        ji: "zi",
        fu: "hu"
      };
      SMALL_LETTERS = Object.assign({
        tu: "\u3063",
        wa: "\u308E",
        ka: "\u30F5",
        ke: "\u30F6"
      }, SMALL_VOWELS, SMALL_Y$1);
      SPECIAL_CASES = {
        yi: "\u3044",
        wu: "\u3046",
        ye: "\u3044\u3047",
        wi: "\u3046\u3043",
        we: "\u3046\u3047",
        kwa: "\u304F\u3041",
        whu: "\u3046",
        // because it's not thya for てゃ but tha
        // and tha is not てぁ, but てゃ
        tha: "\u3066\u3083",
        thu: "\u3066\u3085",
        tho: "\u3066\u3087",
        dha: "\u3067\u3083",
        dhu: "\u3067\u3085",
        dho: "\u3067\u3087"
      };
      AIUEO_CONSTRUCTIONS = {
        wh: "\u3046",
        kw: "\u304F",
        qw: "\u304F",
        q: "\u304F",
        gw: "\u3050",
        sw: "\u3059",
        ts: "\u3064",
        th: "\u3066",
        tw: "\u3068",
        dh: "\u3067",
        dw: "\u3069",
        fw: "\u3075",
        f: "\u3075"
      };
      romajiToKanaMap = null;
      USE_OBSOLETE_KANA_MAP = createCustomMapping({
        wi: "\u3090",
        we: "\u3091"
      });
      createRomajiToKanaMap = memoizeOne((IMEMode, useObsoleteKana, customKanaMapping) => {
        let map = getRomajiToKanaTree();
        map = IMEMode ? IME_MODE_MAP(map) : map;
        map = useObsoleteKana ? USE_OBSOLETE_KANA_MAP(map) : map;
        if (customKanaMapping) {
          map = mergeCustomMapping(map, customKanaMapping);
        }
        return map;
      }, dequal);
      isCharInitialLongDash = (char, index) => isCharLongDash(char) && index < 1;
      isCharInnerLongDash = (char, index) => isCharLongDash(char) && index > 0;
      isKanaAsSymbol = (char) => ["\u30F6", "\u30F5"].includes(char);
      LONG_VOWELS = {
        a: "\u3042",
        i: "\u3044",
        u: "\u3046",
        e: "\u3048",
        o: "\u3046"
      };
      kanaToHepburnMap = null;
      BASIC_ROMAJI = {
        \u3042: "a",
        \u3044: "i",
        \u3046: "u",
        \u3048: "e",
        \u304A: "o",
        \u304B: "ka",
        \u304D: "ki",
        \u304F: "ku",
        \u3051: "ke",
        \u3053: "ko",
        \u3055: "sa",
        \u3057: "shi",
        \u3059: "su",
        \u305B: "se",
        \u305D: "so",
        \u305F: "ta",
        \u3061: "chi",
        \u3064: "tsu",
        \u3066: "te",
        \u3068: "to",
        \u306A: "na",
        \u306B: "ni",
        \u306C: "nu",
        \u306D: "ne",
        \u306E: "no",
        \u306F: "ha",
        \u3072: "hi",
        \u3075: "fu",
        \u3078: "he",
        \u307B: "ho",
        \u307E: "ma",
        \u307F: "mi",
        \u3080: "mu",
        \u3081: "me",
        \u3082: "mo",
        \u3089: "ra",
        \u308A: "ri",
        \u308B: "ru",
        \u308C: "re",
        \u308D: "ro",
        \u3084: "ya",
        \u3086: "yu",
        \u3088: "yo",
        \u308F: "wa",
        \u3090: "wi",
        \u3091: "we",
        \u3092: "wo",
        \u3093: "n",
        \u304C: "ga",
        \u304E: "gi",
        \u3050: "gu",
        \u3052: "ge",
        \u3054: "go",
        \u3056: "za",
        \u3058: "ji",
        \u305A: "zu",
        \u305C: "ze",
        \u305E: "zo",
        \u3060: "da",
        \u3062: "ji",
        \u3065: "zu",
        \u3067: "de",
        \u3069: "do",
        \u3070: "ba",
        \u3073: "bi",
        \u3076: "bu",
        \u3079: "be",
        \u307C: "bo",
        \u3071: "pa",
        \u3074: "pi",
        \u3077: "pu",
        \u307A: "pe",
        \u307D: "po",
        \u3094\u3041: "va",
        \u3094\u3043: "vi",
        \u3094: "vu",
        \u3094\u3047: "ve",
        \u3094\u3049: "vo"
      };
      SPECIAL_SYMBOLS = {
        "\u3002": ".",
        "\u3001": ",",
        "\uFF1A": ":",
        "\u30FB": "/",
        "\uFF01": "!",
        "\uFF1F": "?",
        "\u301C": "~",
        "\u30FC": "-",
        "\u300C": "\u2018",
        "\u300D": "\u2019",
        "\u300E": "\u201C",
        "\u300F": "\u201D",
        "\uFF3B": "[",
        "\uFF3D": "]",
        "\uFF08": "(",
        "\uFF09": ")",
        "\uFF5B": "{",
        "\uFF5D": "}",
        "\u3000": " "
      };
      AMBIGUOUS_VOWELS = ["\u3042", "\u3044", "\u3046", "\u3048", "\u304A", "\u3084", "\u3086", "\u3088"];
      SMALL_Y = { \u3083: "ya", \u3085: "yu", \u3087: "yo" };
      SMALL_Y_EXTRA = { \u3043: "yi", \u3047: "ye" };
      SMALL_AIUEO = {
        \u3041: "a",
        \u3043: "i",
        \u3045: "u",
        \u3047: "e",
        \u3049: "o"
      };
      YOON_KANA = [
        "\u304D",
        "\u306B",
        "\u3072",
        "\u307F",
        "\u308A",
        "\u304E",
        "\u3073",
        "\u3074",
        "\u3094",
        "\u304F",
        "\u3075"
      ];
      YOON_EXCEPTIONS = {
        \u3057: "sh",
        \u3061: "ch",
        \u3058: "j",
        \u3062: "j"
      };
      SMALL_KANA = {
        \u3063: "",
        \u3083: "ya",
        \u3085: "yu",
        \u3087: "yo",
        \u3041: "a",
        \u3043: "i",
        \u3045: "u",
        \u3047: "e",
        \u3049: "o"
      };
      SOKUON_WHITELIST = {
        b: "b",
        c: "t",
        d: "d",
        f: "f",
        g: "g",
        h: "h",
        j: "j",
        k: "k",
        m: "m",
        p: "p",
        q: "q",
        r: "r",
        s: "s",
        t: "t",
        v: "v",
        w: "w",
        x: "x",
        z: "z"
      };
      createKanaToRomajiMap = memoizeOne((romanization, customRomajiMapping) => {
        let map = getKanaToRomajiTree(romanization);
        if (customRomajiMapping) {
          map = mergeCustomMapping(map, customRomajiMapping);
        }
        return map;
      }, dequal);
    }
  });

  // js/kana.js
  function isHiragana2(ch) {
    return ch >= "\u3041" && ch <= "\u3096" || ch === "\u309D" || ch === "\u309E";
  }
  function isKatakana2(ch) {
    if (ch === "\u30F6") return false;
    return ch >= "\u30A1" && ch <= "\u30FA" || ch === "\u30FC" || ch === "\u30FD" || ch === "\u30FE";
  }
  function isKana(ch) {
    return isHiragana2(ch) || isKatakana2(ch);
  }
  function isKanji2(ch) {
    return /\p{Script=Han}/u.test(ch) || ch === "\u3005" || ch === "\u3006" || ch === "\u30F6";
  }
  function isJapanese(ch) {
    return isKana(ch) || isKanji2(ch);
  }
  function hasKanji(str) {
    for (const ch of String(str || "")) if (isKanji2(ch)) return true;
    return false;
  }
  function isAllKana(str) {
    const s = String(str || "");
    if (!s) return false;
    for (const ch of s) if (!isKana(ch)) return false;
    return true;
  }
  function toHira(str) {
    let out = "";
    for (const ch of String(str || "")) {
      const c = ch.codePointAt(0);
      out += c >= 12449 && c <= 12534 || c === 12541 || c === 12542 ? String.fromCodePoint(c - 96) : ch;
    }
    return out;
  }
  function toKata(str) {
    let out = "";
    for (const ch of String(str || "")) {
      const c = ch.codePointAt(0);
      out += c >= 12353 && c <= 12438 || c === 12445 || c === 12446 ? String.fromCodePoint(c + 96) : ch;
    }
    return out;
  }
  function beats(kana) {
    const out = [];
    for (const ch of String(kana || "")) {
      const prev = out[out.length - 1];
      if (SMALL.has(ch) && prev && !OWN_BEAT.has(prev.slice(-1))) out[out.length - 1] = prev + ch;
      else out.push(ch);
    }
    return out;
  }
  function saidAs(beat) {
    const hira = toHira(beat);
    return Object.hasOwn(SAID_AS, hira) ? SAID_AS[hira] : beat;
  }
  function vowelOf(beat) {
    if (!beat || OWN_BEAT.has(beat)) return null;
    const r = toRomaji(toHira(beat), ROMAJI_OPTS);
    const last = r.slice(-1);
    return VOWELS.includes(last) ? last : null;
  }
  function beatRomaji(beat, next2 = "", prev = "") {
    if (beat === "\u3063" || beat === "\u30C3") {
      const n2 = next2 ? toRomaji(toHira(next2), ROMAJI_OPTS) : "";
      if (!n2) return "";
      return n2.startsWith("ch") ? "t" : n2[0];
    }
    if (beat === "\u30FC") return vowelOf(prev) || "";
    if (beat === "\u3093" || beat === "\u30F3") return "n";
    return toRomaji(toHira(beat), ROMAJI_OPTS);
  }
  function spelled(kana) {
    const bs = beats(kana);
    return bs.map((b, i) => beatRomaji(b, bs[i + 1], bs[i - 1])).filter(Boolean).join("-");
  }
  function segments(kana, cuts) {
    const sorted = [...new Set(cuts || [])].filter((c) => c > 0 && c < kana.length).sort((a, b) => a - b);
    const out = [];
    let from = 0;
    for (const c of sorted) {
      out.push(kana.slice(from, c));
      from = c;
    }
    out.push(kana.slice(from));
    return out;
  }
  function lengthen(seg) {
    const bs = beats(seg);
    for (let i = 1; i < bs.length; i++) {
      const v = vowelOf(bs[i - 1]);
      const b = bs[i];
      if (v === "o" && b === "\u3046") bs[i] = "\u30FC";
      else if (v === "e" && (b === "\u3044" || b === "\u30A4")) bs[i] = "\u30FC";
    }
    return bs.join("");
  }
  function said(kana, { cuts = [], particle: particle2 = false, finalWa = false } = {}) {
    let s = String(kana || "");
    if (!s) return "";
    if (particle2) s = [...s].map((ch) => PARTICLE_READ[ch] || ch).join("");
    if (finalWa && s.endsWith("\u306F")) s = s.slice(0, -1) + "\u308F";
    const merged = segments(s, cuts).map(lengthen).join("");
    return toRomaji(toKata(merged), ROMAJI_OPTS).toLowerCase();
  }
  function consonantOf(beat) {
    if (!beat || beat === "\u3093" || beat === "\u30FC") return "";
    if (beat === "\u3063") return "q";
    const r = toRomaji(toHira(beat), ROMAJI_OPTS);
    const m = r.match(/^[^aiueo]*/);
    return m ? m[0] : "";
  }
  function devoiced(kana, { final = false } = {}) {
    const bs = beats(toHira(kana));
    const out = [];
    for (let i = 0; i < bs.length; i++) {
      const v = vowelOf(bs[i]);
      if (v !== "i" && v !== "u") continue;
      const c = consonantOf(bs[i]);
      if (!VOICELESS.test(c)) continue;
      const next2 = bs[i + 1];
      if (next2) {
        const nc = consonantOf(next2 === "\u3063" ? bs[i + 2] : next2);
        if (next2 === "\u3063" || VOICELESS.test(nc)) out.push(i);
      } else if (final && bs[i] === "\u3059") {
        out.push(i);
      }
    }
    return out;
  }
  function devoicedNotation(kana, indices) {
    if (!indices || !indices.length) return "";
    const bs = beats(toHira(kana));
    const set = new Set(indices);
    return bs.map((b, i) => {
      const r = beatRomaji(b, bs[i + 1], bs[i - 1]);
      if (!set.has(i)) return r;
      return r.replace(/[iu]$/, (v) => `(${v})`);
    }).join("");
  }
  function readingRomaji(reading, how = "said") {
    const s = String(reading || "");
    const before = s.startsWith("-") ? "-" : "";
    const after = s.endsWith("-") ? "-" : "";
    let core = toHira(s.replace(/^-+|-+$/g, "").replace(/\./g, ""));
    const held = /っ$/.test(core);
    if (held) core = core.slice(0, -1);
    const r = how === "spelled" ? spelled(core) : said(core);
    return `${before}${r}${held ? "'" : ""}${after}`;
  }
  function readingKana(reading) {
    return toHira(String(reading || "").replace(/[.-]/g, ""));
  }
  var GENKI_MAP, SOKUON_MAP, NASAL_MAP, ROMAJI_OPTS, SMALL, OWN_BEAT, SAID_AS, VOWELS, PARTICLE_READ, VOICELESS;
  var init_kana = __esm({
    "js/kana.js"() {
      init_wanakana();
      GENKI_MAP = Object.freeze({
        "\u3066\u3043": "ti",
        "\u3067\u3043": "di",
        "\u3067\u3085": "dyu",
        "\u3068\u3045": "tu",
        "\u3069\u3045": "du",
        "\u3075\u3041": "fa",
        "\u3075\u3043": "fi",
        "\u3075\u3047": "fe",
        "\u3075\u3049": "fo",
        "\u3094\u3041": "va",
        "\u3094\u3043": "vi",
        "\u3094\u3047": "ve",
        "\u3094\u3049": "vo",
        "\u3094": "vu",
        "\u3046\u3043": "wi",
        "\u3046\u3047": "we",
        "\u3046\u3049": "wo",
        "\u3061\u3047": "che",
        "\u3057\u3047": "she",
        "\u3058\u3047": "je",
        "\u3064\u3041": "tsa",
        "\u3064\u3043": "tsi",
        "\u3064\u3047": "tse",
        "\u3064\u3049": "tso",
        "\u3066\u3085": "tyu",
        "\u3044\u3047": "ye",
        "\u304F\u3041": "kwa",
        "\u304F\u3043": "kwi",
        "\u304F\u3047": "kwe",
        "\u304F\u3049": "kwo",
        "\u3050\u3041": "gwa",
        "\u3050\u3043": "gwi",
        "\u3050\u3047": "gwe",
        "\u3050\u3049": "gwo",
        "\u3059\u3043": "si",
        "\u305A\u3043": "zi"
      });
      SOKUON_MAP = Object.fromEntries(Object.entries(GENKI_MAP).map(([k, v]) => [`\u3063${k}`, `${v.startsWith("ch") ? "t" : v[0]}${v}`]));
      NASAL_MAP = Object.fromEntries(Object.entries(GENKI_MAP).filter(([k]) => "\u3042\u3044\u3046\u3048\u304A".includes(k[0])).map(([k, v]) => [`\u3093${k}`, `n${/^[aiueoy]/.test(v) ? "'" : ""}${v}`]));
      ROMAJI_OPTS = Object.freeze({ customRomajiMapping: { ...GENKI_MAP, ...SOKUON_MAP, ...NASAL_MAP } });
      SMALL = /* @__PURE__ */ new Set([..."\u3083\u3085\u3087\u3041\u3043\u3045\u3047\u3049\u308E\u30E3\u30E5\u30E7\u30A1\u30A3\u30A5\u30A7\u30A9\u30EE"]);
      OWN_BEAT = /* @__PURE__ */ new Set([..."\u3063\u30C3\u3093\u30F3\u30FC"]);
      SAID_AS = Object.freeze({
        "\u3092": "\u304A",
        "\u3062": "\u3058",
        "\u3065": "\u305A",
        "\u3062\u3083": "\u3058\u3083",
        "\u3062\u3085": "\u3058\u3085",
        "\u3062\u3087": "\u3058\u3087",
        "\u3062\u3047": "\u3058\u3047",
        "\u3090": "\u3044",
        "\u3091": "\u3048"
      });
      VOWELS = "aiueo";
      PARTICLE_READ = Object.freeze({ "\u306F": "\u308F", "\u3078": "\u3048", "\u3092": "\u304A" });
      VOICELESS = /^(k|s|sh|t|ch|ts|h|f|p)/;
    }
  });

  // js/deinflect.js
  function R(id, from, to, inT, outT, label, whole = false) {
    return Object.freeze({ id, from, to, in: inT, out: outT, label, whole });
  }
  function commonPrefix(a, b) {
    let n2 = 0;
    while (n2 < a.length && n2 < b.length && a[n2] === b[n2]) n2++;
    return n2;
  }
  function deinflect(surface) {
    const s = String(surface || "");
    if (!s) return [];
    const hit = cache.get(s);
    if (hit) return hit;
    const out = [];
    const start = { text: s, type: ANY & ~STEM, chain: [], cuts: [], stable: s.length };
    const queue = [start];
    const seen = /* @__PURE__ */ new Set([`${s}:${start.type}`]);
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      if (c.chain.length >= MAX_STEPS) continue;
      const rules = BY_LAST.get(c.text[c.text.length - 1]) || [];
      for (const list2 of [rules, EMPTY_FROM]) {
        for (const r of list2) {
          if (!(c.type & r.in)) continue;
          if (r.whole ? c.text !== r.from : !c.text.endsWith(r.from)) continue;
          const keep = c.text.length - r.from.length;
          const text = c.text.slice(0, keep) + r.to;
          if (!text) continue;
          const key = `${text}:${r.out}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const join = r.whole ? 1 : keep + commonPrefix(r.from, r.to);
          const cuts = join > 0 && join <= c.stable && join < s.length && !c.cuts.includes(join) ? [...c.cuts, join] : c.cuts;
          const next2 = {
            text,
            type: r.out,
            chain: [...c.chain, { rule: r.id, label: r.label }],
            cuts,
            stable: Math.min(c.stable, keep)
          };
          queue.push(next2);
          out.push(next2);
        }
      }
    }
    const result = Object.freeze(out.map((c) => Object.freeze({
      base: c.text,
      type: c.type,
      chain: Object.freeze(c.chain),
      cuts: Object.freeze([...c.cuts].sort((a, b) => a - b))
    })));
    if (cache.size >= CACHE_CAP) cache.clear();
    cache.set(s, result);
    return result;
  }
  function deinflectStem(surface) {
    const s = String(surface || "");
    const out = [];
    if (!s) return out;
    for (const r of RULES) {
      if (r.id !== "stem" || r.whole || !(r.in & STEM) || !s.endsWith(r.from)) continue;
      const base = s.slice(0, s.length - r.from.length) + r.to;
      if (base === s) continue;
      out.push(Object.freeze({
        base,
        type: r.out,
        chain: Object.freeze([{ rule: r.id, label: r.label }]),
        cuts: Object.freeze([])
      }));
    }
    return out;
  }
  function posMatches(type, pos, base, conjugated = true) {
    const tags2 = String(pos || "").split(" ");
    if (type & T.POLITE && base.endsWith("\u307E\u3059") && (tags2.includes("exp") || tags2.includes("aux-v"))) return true;
    for (const p of tags2) {
      const t3 = POS_TYPE[p];
      if (!t3 || !(t3 & type)) continue;
      if (p === "adj-ix" && conjugated && base.endsWith("\u3044\u3044")) continue;
      return true;
    }
    return false;
  }
  function adjIxReading(readings) {
    const list2 = readings || [];
    return list2.find((r) => r.startsWith("\u3088") || r.includes("\u3088\u3044")) || list2[0];
  }
  function kuruReading(surface) {
    const tail = surface.slice(surface.indexOf("\u6765") + 1);
    if (/^(な|よう|られ|させ|い$)/.test(tail)) return "\u3053";
    if (/^(る|れば)/.test(tail)) return "\u304F";
    return "\u304D";
  }
  var T, ANY, POS_TYPE, V1, V5U, V5K, V5KS, V5G, V5S, V5T, V5N, V5B, V5M, V5R, V5RI, V5ARU, VK, VS, ADJI, STEM, TE, TA, POLITE, SURF, GODAN, ROW, NOT_ARU, RULES, BY_LAST, EMPTY_FROM, MAX_STEPS, CACHE_CAP, cache;
  var init_deinflect = __esm({
    "js/deinflect.js"() {
      T = Object.freeze({
        V1: 1 << 0,
        V5U: 1 << 1,
        V5K: 1 << 2,
        V5KS: 1 << 3,
        V5G: 1 << 4,
        V5S: 1 << 5,
        V5T: 1 << 6,
        V5N: 1 << 7,
        V5B: 1 << 8,
        V5M: 1 << 9,
        V5R: 1 << 10,
        V5RI: 1 << 11,
        V5ARU: 1 << 12,
        VK: 1 << 13,
        VS: 1 << 14,
        ADJI: 1 << 15,
        // Never a dictionary part of speech: the places a chain passes through.
        STEM: 1 << 16,
        TE: 1 << 17,
        TA: 1 << 18,
        POLITE: 1 << 19,
        SURF: 1 << 20
      });
      ANY = (1 << 21) - 1;
      POS_TYPE = Object.freeze({
        "v1": T.V1,
        "v1-s": T.V1,
        "v5u": T.V5U,
        "v5u-s": T.V5U,
        "v5k": T.V5K,
        "v5k-s": T.V5KS,
        "v5g": T.V5G,
        "v5s": T.V5S,
        "v5t": T.V5T,
        "v5n": T.V5N,
        "v5b": T.V5B,
        "v5m": T.V5M,
        "v5r": T.V5R,
        "v5r-i": T.V5RI,
        "v5aru": T.V5ARU,
        "vk": T.VK,
        "vs-i": T.VS,
        "adj-i": T.ADJI,
        "adj-ix": T.ADJI
      });
      ({
        V1,
        V5U,
        V5K,
        V5KS,
        V5G,
        V5S,
        V5T,
        V5N,
        V5B,
        V5M,
        V5R,
        V5RI,
        V5ARU,
        VK,
        VS,
        ADJI,
        STEM,
        TE,
        TA,
        POLITE,
        SURF
      } = T);
      GODAN = [
        ["\u3046", "\u3044", "\u308F", "\u3048", "\u304A", "\u3063\u3066", "\u3063\u305F", V5U],
        ["\u304F", "\u304D", "\u304B", "\u3051", "\u3053", "\u3044\u3066", "\u3044\u305F", V5K],
        ["\u304F", "\u304D", "\u304B", "\u3051", "\u3053", "\u3063\u3066", "\u3063\u305F", V5KS],
        ["\u3050", "\u304E", "\u304C", "\u3052", "\u3054", "\u3044\u3067", "\u3044\u3060", V5G],
        ["\u3059", "\u3057", "\u3055", "\u305B", "\u305D", "\u3057\u3066", "\u3057\u305F", V5S],
        ["\u3064", "\u3061", "\u305F", "\u3066", "\u3068", "\u3063\u3066", "\u3063\u305F", V5T],
        ["\u306C", "\u306B", "\u306A", "\u306D", "\u306E", "\u3093\u3067", "\u3093\u3060", V5N],
        ["\u3076", "\u3073", "\u3070", "\u3079", "\u307C", "\u3093\u3067", "\u3093\u3060", V5B],
        ["\u3080", "\u307F", "\u307E", "\u3081", "\u3082", "\u3093\u3067", "\u3093\u3060", V5M],
        ["\u308B", "\u308A", "\u3089", "\u308C", "\u308D", "\u3063\u3066", "\u3063\u305F", V5R | V5RI | V5ARU]
      ];
      ROW = (fn) => GODAN.map(([d, i, a, e, o, te, ta, t3]) => fn({ d, i, a, e, o, te, ta, t: t3 }));
      NOT_ARU = ~(V5RI | V5ARU);
      RULES = Object.freeze([
        // A. The polite family collapses onto ます, and ます onto the stem.
        R("masu-past", "\u307E\u3057\u305F", "\u307E\u3059", SURF | TA, POLITE, "polite past"),
        R("masu-negative", "\u307E\u305B\u3093", "\u307E\u3059", SURF, POLITE, "polite negative"),
        R("masu-past-negative", "\u307E\u305B\u3093\u3067\u3057\u305F", "\u307E\u3059", SURF | TA, POLITE, "polite past negative"),
        R("masu-volitional", "\u307E\u3057\u3087\u3046", "\u307E\u3059", SURF, POLITE, "polite volitional (let's)"),
        R("masu-te", "\u307E\u3057\u3066", "\u307E\u3059", SURF, POLITE, "polite te-form"),
        R("masu", "\u307E\u3059", "", POLITE, STEM, "polite ending"),
        // B. The stem back to the dictionary form. Ichidan adds る; godan moves from
        // the i-row to the u-row. The -aru verbs make their stem with い.
        R("stem", "", "\u308B", STEM, V1 | VK, "stem"),
        R("stem", "\u3044", "\u308B", STEM, V5ARU, "stem (honorific -aru verb)"),
        ...ROW(({ d, i, t: t3 }) => R("stem", i, d, STEM, t3 & ~V5ARU, "stem")),
        // C. Endings that hang off the stem and then conjugate as something else.
        R("tai", "\u305F\u3044", "", ADJI, STEM, "want to (desire)"),
        R("nagara", "\u306A\u304C\u3089", "", SURF, STEM, "while doing"),
        R("nasai", "\u306A\u3055\u3044", "", SURF, STEM, "polite command"),
        R("sou", "\u305D\u3046", "", SURF, STEM, "looks about to"),
        R("sugiru", "\u3059\u304E\u308B", "", V1, STEM, "too much"),
        R("yasui", "\u3084\u3059\u3044", "", ADJI, STEM, "easy to"),
        R("nikui", "\u306B\u304F\u3044", "", ADJI, STEM, "hard to"),
        // D. The te-form, and the ta-form, which shares every row with it.
        R("te", "\u3066", "\u308B", TE, V1 | VK, "te-form"),
        ...ROW(({ d, te, t: t3 }) => R("te", te, d, TE, t3, "te-form")),
        R("adj-te", "\u304F\u3066", "\u3044", TE, ADJI, "te-form of an adjective"),
        R("ta", "\u305F", "\u3066", TA, TE, "past (ta-form)"),
        R("ta", "\u3060", "\u3067", TA, TE, "past (ta-form)"),
        R("adj-past", "\u304B\u3063\u305F", "\u3044", TA, ADJI, "past of an adjective"),
        R("tari", "\u305F\u308A", "\u305F", SURF, TA, "listing (tari)"),
        R("tari", "\u3060\u308A", "\u3060", SURF, TA, "listing (tari)"),
        R("tara", "\u305F\u3089", "\u305F", SURF, TA, "conditional (tara)"),
        R("tara", "\u3060\u3089", "\u3060", SURF, TA, "conditional (tara)"),
        // E. Forms built on the te-form that conjugate like an ichidan or godan verb.
        R("te-iru", "\u3066\u3044\u308B", "\u3066", V1, TE, "progressive (te iru)"),
        R("te-iru", "\u3067\u3044\u308B", "\u3067", V1, TE, "progressive (te iru)"),
        R("te-iru-casual", "\u3066\u308B", "\u3066", V1, TE, "progressive, casual (teru)"),
        R("te-iru-casual", "\u3067\u308B", "\u3067", V1, TE, "progressive, casual (teru)"),
        R("te-shimau-casual", "\u3061\u3083\u3046", "\u3066", V5U, TE, "done, casual (chau)"),
        R("te-shimau-casual", "\u3058\u3083\u3046", "\u3067", V5U, TE, "done, casual (jau)"),
        // The uncontracted しまう and the みる of "try and see". Without them
        // 忘れてしまいました was two words and しまいました meant "to finish",
        // and 食べてみます read みます as 診る, "to look after (medically)".
        R("te-shimau", "\u3066\u3057\u307E\u3046", "\u3066", V5U, TE, "done (te shimau)"),
        R("te-shimau", "\u3067\u3057\u307E\u3046", "\u3067", V5U, TE, "done (te shimau)"),
        R("te-miru", "\u3066\u307F\u308B", "\u3066", V1, TE, "try doing (te miru)"),
        R("te-miru", "\u3067\u307F\u308B", "\u3067", V1, TE, "try doing (te miru)"),
        // F. The plain negative, which conjugates like an adjective.
        R("negative", "\u306A\u3044", "\u308B", ADJI, V1 | VK, "negative"),
        ...ROW(({ d, a, t: t3 }) => R("negative", a + "\u306A\u3044", d, ADJI, t3 & ~V5RI, "negative")),
        R("negative-te", "\u306A\u3044\u3067", "\u306A\u3044", SURF, ADJI, "without doing"),
        // Have to, casual: なくちゃ is なくては and なきゃ is なければ, each with
        // its いけない left unsaid. 帰らなくちゃ was 帰らなく and ちゃ, "tea".
        R("must-casual", "\u306A\u304F\u3061\u3083", "\u306A\u3044", SURF, ADJI, "must, casual (nakucha)"),
        R("must-casual", "\u306A\u304D\u3083", "\u306A\u3044", SURF, ADJI, "must, casual (nakya)"),
        // G. Adjective forms.
        R("adj-negative", "\u304F\u306A\u3044", "\u3044", ADJI, ADJI, "negative of an adjective"),
        R("adj-adverb", "\u304F", "\u3044", SURF, ADJI, "adverbial (ku)"),
        R("adj-ba", "\u3051\u308C\u3070", "\u3044", SURF, ADJI, "conditional (ba) of an adjective"),
        R("adj-sou", "\u305D\u3046", "\u3044", SURF, ADJI, "looks (sou)"),
        R("adj-sugiru", "\u3059\u304E\u308B", "\u3044", V1, ADJI, "too (sugiru)"),
        // H. Potential: godan e-row plus る, and ichidan られる (which is also the
        // passive, so it gets its own id), and the colloquial ra-less れる.
        ...ROW(({ d, e, t: t3 }) => R("potential", e + "\u308B", d, V1, t3 & NOT_ARU, "potential")),
        R("potential-passive", "\u3089\u308C\u308B", "\u308B", V1, V1 | VK, "potential or passive"),
        R("potential-colloquial", "\u308C\u308B", "\u308B", V1, V1, "potential, colloquial (ra dropped)"),
        // I. Passive: godan a-row plus れる.
        ...ROW(({ d, a, t: t3 }) => R("passive", a + "\u308C\u308B", d, V1, t3 & NOT_ARU, "passive")),
        // J. Causative: godan a-row plus せる, ichidan させる.
        ...ROW(({ d, a, t: t3 }) => R("causative", a + "\u305B\u308B", d, V1, t3 & NOT_ARU, "causative")),
        R("causative", "\u3055\u305B\u308B", "\u308B", V1, V1 | VK, "causative"),
        // K. Volitional.
        R("volitional", "\u3088\u3046", "\u308B", SURF, V1 | VK, "volitional (let's)"),
        ...ROW(({ d, o, t: t3 }) => R("volitional", o + "\u3046", d, SURF, t3 & ~V5RI, "volitional (let's)")),
        // L. Imperative. The -aru verbs command with い (ください, なさい), and so
        // does 来 in kanji (来い).
        R("imperative", "\u308D", "\u308B", SURF, V1, "command"),
        R("imperative", "\u3044", "\u308B", SURF, V5ARU | VK, "command"),
        ...ROW(({ d, e, t: t3 }) => R("imperative", e, d, SURF, t3 & NOT_ARU, "command")),
        // M. The ba conditional.
        R("ba", "\u308C\u3070", "\u308B", SURF, V1 | VK, "conditional (ba)"),
        ...ROW(({ d, e, t: t3 }) => R("ba", e + "\u3070", d, SURF, t3, "conditional (ba)")),
        // N. する and くる, a closed list: each fires only when it is the whole text.
        R("stem", "\u3057", "\u3059\u308B", STEM, VS, "stem", true),
        R("te", "\u3057\u3066", "\u3059\u308B", TE, VS, "te-form", true),
        R("negative", "\u3057\u306A\u3044", "\u3059\u308B", ADJI, VS, "negative", true),
        R("passive", "\u3055\u308C\u308B", "\u3059\u308B", V1, VS, "passive", true),
        R("causative", "\u3055\u305B\u308B", "\u3059\u308B", V1, VS, "causative", true),
        R("volitional", "\u3057\u3088\u3046", "\u3059\u308B", SURF, VS, "volitional (let's)", true),
        R("imperative", "\u3057\u308D", "\u3059\u308B", SURF, VS, "command", true),
        R("ba", "\u3059\u308C\u3070", "\u3059\u308B", SURF, VS, "conditional (ba)", true),
        R("stem", "\u304D", "\u304F\u308B", STEM, VK, "stem", true),
        R("te", "\u304D\u3066", "\u304F\u308B", TE, VK, "te-form", true),
        R("negative", "\u3053\u306A\u3044", "\u304F\u308B", ADJI, VK, "negative", true),
        R("potential-passive", "\u3053\u3089\u308C\u308B", "\u304F\u308B", V1, VK, "potential or passive", true),
        R("causative", "\u3053\u3055\u305B\u308B", "\u304F\u308B", V1, VK, "causative", true),
        R("volitional", "\u3053\u3088\u3046", "\u304F\u308B", SURF, VK, "volitional (let's)", true),
        R("imperative", "\u3053\u3044", "\u304F\u308B", SURF, VK, "command", true),
        R("ba", "\u304F\u308C\u3070", "\u304F\u308B", SURF, VK, "conditional (ba)", true)
      ]);
      BY_LAST = /* @__PURE__ */ new Map();
      EMPTY_FROM = [];
      for (const r of RULES) {
        if (!r.from) {
          EMPTY_FROM.push(r);
          continue;
        }
        const last = r.from[r.from.length - 1];
        if (!BY_LAST.has(last)) BY_LAST.set(last, []);
        BY_LAST.get(last).push(r);
      }
      MAX_STEPS = 6;
      CACHE_CAP = 6e4;
      cache = /* @__PURE__ */ new Map();
    }
  });

  // js/costs.js
  function homographCost(key, rec, dict2) {
    if (!dict2 || !hasKanji(key)) return 0;
    const recs = dict2.get(key);
    if (!recs || recs.length < 2 || !recs.includes(rec)) return 0;
    const raw = recs.map((r) => homographRaw(key, r, recs));
    return raw[recs.indexOf(rec)] - Math.min(...raw);
  }
  function isTransitiveReading(node) {
    if (!node.rec || !node.rec.r || TRANSITIVE_AFTER_O[node.key] !== node.rec.r[0]) return false;
    return !(node.chain || []).some((c) => c.rule === "potential" || c.rule === "passive");
  }
  function homographRaw(key, rec, recs) {
    const tags2 = tagsOf(rec);
    let cost = rec.u ? COST.homographKanaUsual : 0;
    if (TEXTBOOK[key] && rec.r && rec.r[0] !== TEXTBOOK[key]) cost += COST.homographSpelling;
    if (AFFIX.has(tags2[0]) && recs.some((r) => !AFFIX.has(tagsOf(r)[0]))) cost += COST.homographAffix;
    const verb = (r) => classOf(r.p) === "verb";
    if (verb(rec) && tags2.includes("suf") && recs.some((r) => r !== rec && verb(r) && !tagsOf(r).includes("suf"))) {
      cost += COST.homographAffix;
    }
    return cost + COST.homographSpelling * (rec.o || 0);
  }
  function bandOf(key, rec, dict2) {
    if (!rec.k || !rec.k.length || rec.u || classOf(rec.p) === "prt") return rec.q;
    if (PARTICLE.has(key)) return 0;
    const recs = dict2 && dict2.get(key) || [];
    return recs.some((r) => r !== rec && isInterjection(r)) ? 0 : rec.q;
  }
  function classOf(pos) {
    const tags2 = String(pos || "").split(" ");
    const has2 = (t3) => tags2.includes(t3);
    if (has2("prt")) return "prt";
    if (has2("cop")) return "cop";
    if (tags2.some((t3) => /^v(1|5|k$|s-i$|s-s$|z$)/.test(t3))) return "verb";
    if (has2("adj-i") || has2("adj-ix")) return "adj";
    if (has2("exp") || has2("int")) return "exp";
    if (has2("adj-pn")) return "det";
    if (tags2.some((t3) => t3.startsWith("aux"))) return "aux";
    const nounish = has2("n") || has2("pn");
    if (nounish) return "noun";
    if (tags2[0] === "pref") return "pref";
    if (has2("suf") || has2("ctr")) return "suf";
    if (has2("pref") && !has2("adv")) return "pref";
    return "noun";
  }
  function placeThenSuffix(prev, next2) {
    const a = prev.rec && prev.rec.nt || [];
    return a.includes("place") && HAN.test(prev.s) && next2.cls === "noun" && !!next2.rec && !next2.named && !next2.rare && [...next2.s].length === 1 && HAN.test(next2.s);
  }
  function familyThenGiven(prev, next2) {
    const a = prev.rec && prev.rec.nt || [];
    const b = next2.rec && next2.rec.nt || [];
    return a.includes("surname") && b.some((t3) => GIVEN.has(t3));
  }
  function connect(prev, next2) {
    let extra = prev && prev.countLike && next2 && isDuration(next2) ? COST.durationKey : 0;
    if (prev && prev.rare && next2 && HONORIFICS.has(next2.key || next2.s)) extra += COST.rareBeforeHonorific;
    if (prev && prev.cls === "pref" && POLITE2.has(prev.key || prev.s) && next2 && next2.named) extra += COST.nameAfterPrefix;
    if (prev && prev.named && next2 && (next2.key === "\u3059\u308B" || next2.key === "\u70BA\u308B")) extra += COST.suruNeedsVs;
    if (prev && prev.named && next2 && next2.named && familyThenGiven(prev, next2)) return extra + COST.namePair;
    if (prev && prev.named && next2 && placeThenSuffix(prev, next2)) extra += COST.placeSuffix;
    return extra + pairCost(prev, next2 && next2.named ? { ...next2, cls: "noun" } : next2);
  }
  function isDuration(node) {
    if (DURATION.has(node.key || node.s)) return true;
    return !!(node.rec && node.rec.k && node.rec.k.some((k) => DURATION.has(k)));
  }
  function pairCost(prev, next2) {
    const p = prev ? prev.cls : "bos";
    const n2 = next2 ? next2.cls : "eos";
    if (p === "pref") return n2 === "noun" ? -20 : n2 === "adj" ? 0 : 150;
    if (p === "det") return ["noun", "kata", "name", "num"].includes(n2) ? -20 : 60;
    if (n2 === "prt") {
      if (p === "bos") return next2.s === "\u3092" ? 0 : 300;
      if (AFTER_PREDICATE_ONLY.has(next2.s) && !["verb", "adj", "cop"].includes(p)) return 150;
      if (NOMINAL.has(p)) return -30;
      if (p === "prt") return PARTICLE_PAIRS.has(prev.s + next2.s) ? -10 : prev.s === next2.s ? 150 : 40;
      return 0;
    }
    if (n2 === "cop") {
      if (NOMINAL.has(p)) return -30;
      if (p === "adj") return -20;
      if (p === "verb") return AFTER_PREDICATE.has(next2.s) ? 0 : 50;
      if (p === "prt") return AFTER_PREDICATE.has(next2.s) || BEFORE_COPULA.has(prev.s) ? 0 : 50;
      return 0;
    }
    if (n2 === "eos") {
      if (p === "prt") return SENTENCE_FINAL.has(prev.s) || CLAUSE_FINAL.has(prev.s) ? 0 : 30;
      return 0;
    }
    if (n2 === "suf") return NOMINAL.has(p) ? -20 : 150;
    if (n2 === "noun" && p === "num" && next2.rec && tagsOf(next2.rec).some((t3) => SUFFIX_TAGS.has(t3))) return -20;
    if (n2 === "noun" && (p === "verb" || p === "adj") && next2.rec && next2.kanaSpelled && SUFFIX_TAGS.has(tagsOf(next2.rec)[0])) return COST.suffixAfterPredicate;
    if (n2 === "noun" && NOMINAL.has(p)) return next2.kanaSpelled ? 20 + COST.kanaCompound : 20;
    if (n2 === "verb") {
      if (p === "verb") {
        if (next2.s === "\u304F\u3060\u3055\u3044" || next2.s === "\u4E0B\u3055\u3044") return -30;
        return afterTe(prev, next2) ? -30 : 20;
      }
      if (p === "noun" && prev.rec && /\bvs\b/.test(prev.rec.p) && (next2.key === "\u3059\u308B" || next2.key === "\u70BA\u308B")) return -30;
      if (p === "prt" && prev.s === "\u3078" && isMotion(next2)) return -20;
      if (p === "prt" && prev.s === "\u3092" && isTransitiveReading(next2)) return -20;
      if (prev && isBareNoun(prev)) {
        const suru = next2.key === "\u3059\u308B" || next2.key === "\u70BA\u308B";
        return COST.nounVerb + (suru && prev.rec ? COST.suruNeedsVs : 0);
      }
    }
    if (n2 === "exp" && p === "verb" && (next2.s === "\u304F\u3060\u3055\u3044" || next2.s === "\u4E0B\u3055\u3044")) return -30;
    if (n2 === "exp" && p === "prt" && !SENTENCE_FINAL.has(prev.s) && next2.rec && isInterjection(next2.rec)) return 150;
    return 0;
  }
  function afterTe(prev, next2) {
    const chain = prev.chain || [];
    return chain.length > 0 && chain[0].rule === "te" && TE_MOTION.has(next2.key);
  }
  function isBareNoun(node) {
    if (node.cls === "kata" || node.cls === "name" || node.cls === "suf") return true;
    return node.cls === "noun" && !(node.rec && /\b(adv|pn)\b/.test(node.rec.p));
  }
  function isMotion(node) {
    if (MOTION.has(node.key)) return true;
    return !!(node.rec && node.rec.k && node.rec.k.some((k) => MOTION.has(k)));
  }
  var PARTICLES, PARTICLE, PARTICLE_PAIRS, SENTENCE_FINAL, CLAUSE_FINAL, COPULA, AFTER_PREDICATE, BEFORE_COPULA, AFTER_PREDICATE_ONLY, FINAL_WA, DURATION, MOTION, COST, TEXTBOOK, TRANSITIVE_AFTER_O, AFFIX, SUFFIX_TAGS, tagsOf, NOMINAL, HONORIFICS, POLITE2, GIVEN, HAN, isInterjection, TE_MOTION;
  var init_costs = __esm({
    "js/costs.js"() {
      init_kana();
      PARTICLES = Object.freeze([
        "\u306F",
        "\u3078",
        "\u3092",
        "\u304C",
        "\u306B",
        "\u3067",
        "\u3068",
        "\u3082",
        "\u306E",
        "\u3084",
        "\u304B",
        "\u304B\u3089",
        "\u307E\u3067",
        "\u3088\u308A",
        "\u306D",
        "\u3088",
        "\u3051\u3069",
        "\u306E\u3067",
        "\u3060\u3051",
        "\u3057\u304B",
        "\u306A\u3069",
        "\u306A",
        "\u3063\u3066",
        "\u3093",
        // ね and な drawn out, which the data has no key for: ねえねえ read
        // ね|え|ね|え, "root, eh, right?, picture".
        "\u306D\u3048",
        "\u306A\u3042"
      ]);
      PARTICLE = new Set(PARTICLES);
      PARTICLE_PAIRS = Object.freeze(/* @__PURE__ */ new Set([
        "\u306B\u306F",
        "\u3067\u306F",
        "\u3068\u306F",
        "\u3078\u306F",
        "\u306B\u3082",
        "\u3067\u3082",
        "\u3068\u3082",
        "\u304B\u3089\u306F",
        "\u307E\u3067\u306F",
        "\u306E\u306F",
        "\u306E\u304C",
        "\u304B\u3082",
        "\u3078\u3082"
      ]));
      SENTENCE_FINAL = Object.freeze(/* @__PURE__ */ new Set(["\u304B", "\u306D", "\u3088", "\u306A", "\u3051\u3069", "\u306E", "\u306D\u3048", "\u306A\u3042"]));
      CLAUSE_FINAL = /* @__PURE__ */ new Set(["\u304B\u3089", "\u306E\u3067", "\u304C", "\u3051\u3069", "\u3057", "\u306E\u306B", "\u307E\u3067"]);
      COPULA = Object.freeze({
        "\u3067\u3059": ["\u3067\u3059"],
        "\u3067\u3057\u305F": ["\u3067\u3057\u305F"],
        "\u3067\u3057\u3087\u3046": ["\u3067\u3057\u3087\u3046"],
        "\u3060\u308D\u3046": ["\u3060\u308D\u3046"],
        "\u3060": ["\u3060"],
        "\u3060\u3063\u305F": ["\u3060\u3063\u305F"],
        "\u3058\u3083\u3042\u308A\u307E\u305B\u3093": ["\u3058\u3083", "\u3042\u308A\u307E\u305B\u3093"],
        "\u3067\u306F\u3042\u308A\u307E\u305B\u3093": ["\u3067\u306F", "\u3042\u308A\u307E\u305B\u3093"],
        "\u3058\u3083\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F": ["\u3058\u3083", "\u3042\u308A\u307E\u305B\u3093", "\u3067\u3057\u305F"],
        "\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F": ["\u3067\u306F", "\u3042\u308A\u307E\u305B\u3093", "\u3067\u3057\u305F"],
        "\u3058\u3083\u306A\u3044": ["\u3058\u3083", "\u306A\u3044"],
        "\u3067\u306F\u306A\u3044": ["\u3067\u306F", "\u306A\u3044"],
        "\u3058\u3083\u306A\u304B\u3063\u305F": ["\u3058\u3083", "\u306A\u304B\u3063\u305F"],
        "\u3067\u306F\u306A\u304B\u3063\u305F": ["\u3067\u306F", "\u306A\u304B\u3063\u305F"],
        "\u306A\u3089": ["\u306A\u3089"],
        "\u3060\u3063\u305F\u3089": ["\u3060\u3063\u305F\u3089"],
        "\u3067\u3057\u305F\u3089": ["\u3067\u3057\u305F\u3089"]
      });
      AFTER_PREDICATE = /* @__PURE__ */ new Set(["\u3067\u3057\u3087\u3046", "\u3060\u308D\u3046", "\u306A\u3089"]);
      BEFORE_COPULA = /* @__PURE__ */ new Set(["\u304B\u3089", "\u307E\u3067", "\u3060\u3051", "\u3050\u3089\u3044", "\u304F\u3089\u3044", "\u306A\u3069", "\u3070\u304B\u308A", "\u307B\u3069", "\u306E", "\u3093"]);
      AFTER_PREDICATE_ONLY = /* @__PURE__ */ new Set(["\u3082\u306E", "\u3082\u3093", "\u3082\u306E\u306E"]);
      FINAL_WA = /* @__PURE__ */ new Set(["\u3053\u3093\u306B\u3061\u306F", "\u3053\u3093\u3070\u3093\u306F"]);
      DURATION = /* @__PURE__ */ new Set([
        "\u5F8C",
        "\u524D",
        "\u9593",
        "\u4EE5\u5185",
        "\u4EE5\u4E0A",
        "\u4EE5\u4E0B",
        "\u3050\u3089\u3044",
        "\u304F\u3089\u3044",
        "\u307B\u3069",
        "\u3054\u308D",
        "\u9803",
        "\u904E\u304E",
        "\u3059\u304E",
        "\u304A\u304D",
        "\u7F6E\u304D",
        "\u304B\u304B\u308B",
        "\u639B\u304B\u308B",
        "\u7D4C\u3064",
        "\u305F\u3064",
        "\u9045\u308C\u308B",
        "\u304A\u304F\u308C\u308B",
        "\u9045\u523B"
      ]);
      MOTION = /* @__PURE__ */ new Set([
        "\u884C\u304F",
        "\u3044\u304F",
        "\u6765\u308B",
        "\u304F\u308B",
        "\u5E30\u308B",
        "\u304B\u3048\u308B",
        "\u623B\u308B",
        "\u3082\u3069\u308B",
        "\u5411\u304B\u3046",
        "\u3080\u304B\u3046",
        "\u51FA\u304B\u3051\u308B",
        "\u3067\u304B\u3051\u308B",
        "\u5165\u308B",
        "\u306F\u3044\u308B",
        "\u51FA\u308B",
        "\u3067\u308B",
        "\u7740\u304F",
        "\u3064\u304F"
      ]);
      COST = Object.freeze({
        word: 100,
        // any dictionary word, before the adjustments below
        // By q band, 1 (most frequent) to 5; index 0 is "unranked". The research
        // had one bit (common -15, rare +10); the band spreads it over five steps
        // around the same midpoint, so a q1 word beats a q4 homograph.
        q: [10, -20, -15, -10, -5, 0],
        kanaForKanji: 20,
        // a kana key for a word usually written in kanji
        kanaCompound: 40,
        // ...and straight after a noun, with no particle (connect)
        oneKana: 200,
        // a one-kana word: は "tooth" must lose to は the particle
        step: 5,
        // per deinflection step: the shorter chain wins a tie
        xSplit: 60,
        // key = key + particle (今日は), not the whole run: split
        aux: 80,
        // a dictionary auxiliary (ます, たい as keys): the chain owns these
        particle: 80,
        copula: 70,
        kataRun: 150,
        // a katakana run the dictionary does not have
        number: 50,
        // ASCII digits, with or without a counter
        numberKanji: 95,
        // kanji numerals: a dictionary key with the same span wins
        // (十分 is じゅうぶん, "enough", unless written 10分)
        bareNumber: 10,
        // a number with no counter after it
        numberKey: 25,
        // a key spelled like a number and counter, unless q1:
        // 五分 ごぶ (q3) loses to ごふん, 十分 じゅうぶん (q1) wins
        // ...unless what follows it measures time: 駅まで十分かかります is ten
        // minutes, and so are 十分後 and 十分ぐらい. A q1 key spelled like a number
        // and counter pays this before a word from DURATION, which is more than
        // the 15 its q1 band saved it, so the number wins there and only there.
        durationKey: 40,
        nounVerb: 30,
        // a noun straight into a verb, no particle (connect)
        suruNeedsVs: 60,
        // ...and more when the verb is する and the noun takes none
        suffixAfterPredicate: 40,
        // a suffix-first noun met in kana after a verb or adjective (connect)
        // A mixed spelling (a record marked `m`) whose closing hiragana are the
        // start of a longer banded word that takes the rest of the hiragana
        // (candidates.js endsInsideWord): 毎秋りんご園 read 秋りん, the long autumn
        // rains, then ご and 園, where 秋|りんご|園 is meant. The cost is paid in 2
        // of 248,924 Tatoeba sentences, and any price from 24 to 1,000 reads both
        // the same, so this is a direction more than a number. The corpus cannot
        // test it alone: a mixed spelling is one the corpus seldom matches
        // (docs/ANALYZER.md, "秋りん and つき物").
        endsInsideWord: 40,
        homographSpelling: 10,
        // per place this kanji sits down its reading's list
        homographAffix: 10,
        // an affix-first record, where another is not
        homographKanaUsual: 20,
        // a record marked usually-kana, met in kanji
        stemNoun: 60,
        // a verb stem read as a noun (卵焼き's 焼き); dearer than
        // any conjugation of the same characters
        name: 250,
        // a kanji run with no dictionary support, read as a name
        namePerChar: 30,
        // A closed stretch of two or more kanji that no dictionary key touches
        // (names.js, `unsupported`). Two single-kanji words are the only other way
        // through it, and they cost 140 at the least (田 80 + 中 read じゅう as a
        // suffix 80, -20 to connect), so 120 wins: 田中 was 田|中 "rice field,
        // throughout" before this. It stays above a kanji number with its counter
        // (95), so 五本 is still five long things and not a surname.
        nameRun: 120,
        nameRunPerChar: 10,
        // each kanji past the second
        tsu: 150,
        // one kana plus a final small tsu: あっ, えっ
        unkKana: 400,
        // one kana nothing else explains
        // The second phase (js/rare.js), which only ever prices a stretch the
        // first pass guessed. Each number was set against the guess it replaces
        // and measured over 3,112 corpus sentences (docs/ANALYZER.md).
        //
        // A rare word is any dictionary word plus this: 95 for an unranked noun of
        // two kanji. A guessed name is 120, but it connects to a noun before it
        // for 0 where a noun pays 20, so at 0 here ときどき蜃気楼が stayed a guess
        // and 蜃気楼 alone did not; -15 clears both. It never meets a first-tier
        // word outside a stretch the first pass guessed.
        rare: -15,
        rareCommon: 10,
        // ...less this for a kana spelling of a common word (リンゴ is 林檎's)
        rareBeforeHonorific: 40,
        // a rare word straight before さん, 様, 君: it is a name
        nameAfterPrefix: 40,
        // ...unless the polite お or ご comes first: お米屋さん is the
        // rice shop, ご主人様 a master; no surname takes お
        nameKnown: 80,
        // a surname, or a katakana name, other names are built on (s)
        nameWeak: 32,
        // ...plus this for any other name: 陸地 かちじ, a place, and
        // 天上 てんじょう, a given name, lose to the words
        namePair: -60,
        // a family name, then a given name: 鈴木|一郎
        // A place the names tier knows, then one kanji noun (富山|駅, 函館|山,
        // 軽井沢|町, 富山|湾), against the guess for the whole run, which read
        // 富山湾 とみやまいりえ. It must beat a three-kanji guess (130) with a q3
        // noun (a strong place 80 + 湾 90 + 20 to connect: under -60), and must not
        // carve a weak whole name (112) into a strong place and a q1 noun (80 + 80
        // + 20: over -68). Over the 660 names-tier names that are a place and one
        // kanji, -65 splits none the guess did not; -70 splits 176 (三田市 read
        // みた いち).
        placeSuffix: -65,
        kataPerChar: 30
        // a katakana guess in the second phase, per kana: a run
        // that is two known words (クリスマス|プレゼント) splits
      });
      TEXTBOOK = Object.freeze({ "\u958B\u304F": "\u3042\u304F", "\u4E0B\u624B": "\u3078\u305F", "\u5B57": "\u3058" });
      TRANSITIVE_AFTER_O = Object.freeze({ "\u958B\u304F": "\u3072\u3089\u304F" });
      AFFIX = /* @__PURE__ */ new Set(["pref", "suf", "n-pref", "n-suf", "ctr"]);
      SUFFIX_TAGS = /* @__PURE__ */ new Set(["suf", "n-suf", "ctr"]);
      tagsOf = (r) => String(r.p || "").split(" ");
      NOMINAL = /* @__PURE__ */ new Set(["noun", "kata", "num", "name", "suf"]);
      HONORIFICS = /* @__PURE__ */ new Set(["\u3055\u3093", "\u69D8", "\u3055\u307E", "\u541B", "\u304F\u3093", "\u3061\u3083\u3093", "\u6C0F", "\u6BBF", "\u5148\u751F"]);
      POLITE2 = /* @__PURE__ */ new Set(["\u304A", "\u3054", "\u5FA1"]);
      GIVEN = /* @__PURE__ */ new Set(["given", "masc", "fem"]);
      HAN = /^\p{Script=Han}/u;
      isInterjection = (rec) => tagsOf(rec).every((t3) => t3 === "int");
      TE_MOTION = /* @__PURE__ */ new Set(["\u304F\u308B", "\u6765\u308B", "\u3044\u304F", "\u884C\u304F"]);
    }
  });

  // js/numbers.js
  function isKanjiNumeral(ch) {
    return ch in KANJI_DIGIT || ch in KANJI_UNIT || ch in KANJI_BIG;
  }
  function parseKanjiNumber(str) {
    const chars3 = [...str];
    if (!chars3.length) return null;
    if (chars3.every((c) => c in KANJI_DIGIT)) {
      return chars3.length > 1 && chars3[0] === "\u3007" ? null : Number(chars3.map((c) => KANJI_DIGIT[c]).join(""));
    }
    let total = 0;
    let section = 0;
    let digit = null;
    for (const c of chars3) {
      if (c in KANJI_DIGIT) {
        if (digit !== null) return null;
        digit = KANJI_DIGIT[c];
      } else if (c in KANJI_UNIT) {
        section += (digit === null ? 1 : digit) * KANJI_UNIT[c];
        digit = null;
      } else if (c in KANJI_BIG) {
        const part = section + (digit === null ? 0 : digit);
        total += (part || 1) * KANJI_BIG[c];
        section = 0;
        digit = null;
      } else {
        return null;
      }
    }
    return total + section + (digit === null ? 0 : digit);
  }
  function below10k(n2) {
    const out = [];
    const th = Math.floor(n2 / 1e3);
    const hu = Math.floor(n2 / 100) % 10;
    const te = Math.floor(n2 / 10) % 10;
    const on = n2 % 10;
    if (th) out.push({ kana: THOUSANDS[th] || `${ONES[th]}\u305B\u3093`, place: 1e3, digit: th });
    if (hu) out.push({ kana: HUNDREDS[hu] || `${ONES[hu]}\u3072\u3083\u304F`, place: 100, digit: hu });
    if (te) out.push({ kana: te === 1 ? "\u3058\u3085\u3046" : `${ONES[te]}\u3058\u3085\u3046`, place: 10, digit: te });
    if (on) out.push({ kana: ONES[on], place: 1, digit: on });
    return out;
  }
  function numberPieces(n2) {
    if (!Number.isFinite(n2) || n2 < 0) return null;
    if (n2 === 0) return [{ kana: "\u305C\u308D", place: 1, digit: 0 }];
    if (n2 >= 1e16 || !Number.isInteger(n2)) {
      return [...String(n2)].map((d) => ({ kana: d === "0" ? "\u305C\u308D" : ONES[Number(d)], place: 1, digit: Number(d) }));
    }
    const out = [];
    let rest = n2;
    for (const [size, kana] of BIGS) {
      const q = Math.floor(rest / size);
      if (q) {
        out.push(...below10k(q));
        out.push({ kana, place: size, digit: 0 });
        rest -= q * size;
      }
    }
    out.push(...below10k(rest));
    return out;
  }
  function readNumber(n2) {
    const p = numberPieces(n2);
    return p ? p.map((x) => x.kana).join("") : null;
  }
  function numberBends(n2) {
    const pieces3 = numberPieces(n2) || [];
    return pieces3.some((p) => (p.place === 100 || p.place === 1e3) && p.digit > 1 && p.kana !== ONES[p.digit] + (p.place === 100 ? "\u3072\u3083\u304F" : "\u305B\u3093"));
  }
  function geminate(last, kana, places) {
    return places.includes(last) ? `${kana.slice(0, -1)}\u3063` : kana;
  }
  function hRow(plain, voiced2, half, { three = voiced2, four = plain } = {}) {
    return (last, kana) => {
      const small = geminate(last, kana, KH_PLACES);
      if (small !== kana) return [small, half];
      if (last === 3) return [kana, three];
      if (last === 1e3 || last >= 1e4) return [kana, voiced2];
      if (last === 4) return [kana, four];
      return [kana, plain];
    };
  }
  function ksRow(plain, { three = plain, places = KH_PLACES } = {}) {
    return (last, kana) => {
      const small = geminate(last, kana, places);
      if (small !== kana) return [small, plain];
      if (last === 3) return [kana, three];
      return [kana, plain];
    };
  }
  function fourSevenNine(plain, four, seven, nine) {
    return (last, kana) => {
      if (last === 4) return [four, plain];
      if (last === 7) return [seven, plain];
      if (last === 9) return [nine, plain];
      return [kana, plain];
    };
  }
  function counterAt(text, i) {
    for (const k of COUNTER_KEYS) if (text.startsWith(k, i)) return k;
    return null;
  }
  function withTail(spec, read) {
    if (!read || !spec.tail) return read;
    const [text, kana] = spec.tail;
    return { ...read, reading: read.reading + kana, tail: { text, kana } };
  }
  function readCounted(n2, counter) {
    const spec = COUNTERS[counter];
    const pieces3 = numberPieces(n2);
    if (!spec || !pieces3) return null;
    const plainNumber = pieces3.map((p) => p.kana).join("");
    const plain = plainNumber + spec.plain;
    if (spec.whole) {
      const w = spec.whole(n2);
      if (w === null) return null;
      if (typeof w === "string") {
        if (counter === "\u3064") return { numberKana: w.slice(0, -1), counterKana: "\u3064", reading: w, changed: w !== plain };
        return withTail(spec, { numberKana: w, counterKana: "", reading: w, changed: w !== plain, whole: true });
      }
    }
    if (!spec.bend) return withTail(spec, { numberKana: plainNumber, counterKana: spec.plain, reading: plain, changed: false });
    const tail = pieces3[pieces3.length - 1];
    const last = tail.place === 1 ? tail.digit : tail.place;
    const [lastKana, counterKana] = spec.bend(last, tail.kana);
    const numberKana = pieces3.slice(0, -1).map((p) => p.kana).join("") + lastKana;
    const reading = numberKana + counterKana;
    return withTail(spec, { numberKana, counterKana, reading, changed: reading !== plain });
  }
  function countedParts(numberText, counter, read) {
    const head = read.tail ? counter.slice(0, -read.tail.text.length) : counter;
    const out = read.whole ? [{ text: numberText + head, ruby: read.numberKana, whole: true }] : [{ text: numberText, ruby: read.numberKana }];
    if (!read.whole && head.length === 2 && KA.includes(head[0])) {
      out.push({ text: head[0], ruby: "\u304B" }, { text: head[1], ruby: read.counterKana.slice(1) });
    } else if (!read.whole) out.push({ text: head, ruby: read.counterKana });
    if (read.tail) out.push({ text: read.tail.text, ruby: read.tail.kana });
    return out;
  }
  function readQuestion(counter) {
    const spec = COUNTERS[counter];
    if (!spec || counter === "\u3064") return null;
    const [numberKana, counterKana] = spec.bend ? spec.bend(3, "\u306A\u3093") : ["\u306A\u3093", spec.plain];
    const reading = numberKana + counterKana;
    return withTail(spec, { numberKana, counterKana, reading, changed: reading !== `\u306A\u3093${spec.plain}` });
  }
  function countedEnd(text, i) {
    if (text[i] === "\u4F55") {
      const counter2 = counterAt(text, i + 1);
      return counter2 && readQuestion(counter2) ? i + 1 + counter2.length : -1;
    }
    const num = numberAt(text, i);
    if (!num) return -1;
    const counter = counterAt(text, num.end);
    return counter && readCounted(num.value, counter) ? num.end + counter.length : -1;
  }
  function numberAt(text, i) {
    if (isDigit(text[i])) {
      let j2 = i;
      let digits = "";
      while (j2 < text.length) {
        if (isDigit(text[j2])) {
          digits += text[j2];
          j2++;
          continue;
        }
        if (text[j2] === "," && /^\d{3}(?!\d)/.test(text.slice(j2 + 1, j2 + 5)) && digits.length) {
          j2++;
          continue;
        }
        break;
      }
      return { end: j2, value: Number(digits), kanji: false };
    }
    if (!isKanjiNumeral(text[i])) return null;
    let j = i;
    while (j < text.length && isKanjiNumeral(text[j])) j++;
    for (let end = j; end > i; end--) {
      const value = parseKanjiNumber(text.slice(i, end));
      if (value !== null) return { end, value, kanji: true };
    }
    return null;
  }
  var KANJI_DIGIT, KANJI_UNIT, KANJI_BIG, isDigit, ONES, HUNDREDS, THOUSANDS, BIGS, KH_PLACES, S_PLACES, DAYS, TSU, BASE, KA, SPAN, COUNTERS, COUNTER_KEYS;
  var init_numbers = __esm({
    "js/numbers.js"() {
      KANJI_DIGIT = Object.freeze({
        "\u3007": 0,
        "\u96F6": 0,
        "\u4E00": 1,
        "\u4E8C": 2,
        "\u4E09": 3,
        "\u56DB": 4,
        "\u4E94": 5,
        "\u516D": 6,
        "\u4E03": 7,
        "\u516B": 8,
        "\u4E5D": 9
      });
      KANJI_UNIT = Object.freeze({ "\u5341": 10, "\u767E": 100, "\u5343": 1e3 });
      KANJI_BIG = Object.freeze({ "\u4E07": 1e4, "\u5104": 1e8, "\u5146": 1e12 });
      isDigit = (ch) => ch >= "0" && ch <= "9";
      ONES = ["", "\u3044\u3061", "\u306B", "\u3055\u3093", "\u3088\u3093", "\u3054", "\u308D\u304F", "\u306A\u306A", "\u306F\u3061", "\u304D\u3085\u3046"];
      HUNDREDS = { 1: "\u3072\u3083\u304F", 3: "\u3055\u3093\u3073\u3083\u304F", 6: "\u308D\u3063\u3074\u3083\u304F", 8: "\u306F\u3063\u3074\u3083\u304F" };
      THOUSANDS = { 1: "\u305B\u3093", 3: "\u3055\u3093\u305C\u3093", 8: "\u306F\u3063\u305B\u3093" };
      BIGS = [[1e12, "\u3061\u3087\u3046"], [1e8, "\u304A\u304F"], [1e4, "\u307E\u3093"]];
      KH_PLACES = [1, 6, 8, 10, 100];
      S_PLACES = [1, 8, 10];
      DAYS = Object.freeze({
        1: "\u3064\u3044\u305F\u3061",
        2: "\u3075\u3064\u304B",
        3: "\u307F\u3063\u304B",
        4: "\u3088\u3063\u304B",
        5: "\u3044\u3064\u304B",
        6: "\u3080\u3044\u304B",
        7: "\u306A\u306E\u304B",
        8: "\u3088\u3046\u304B",
        9: "\u3053\u3053\u306E\u304B",
        10: "\u3068\u304A\u304B",
        14: "\u3058\u3085\u3046\u3088\u3063\u304B",
        20: "\u306F\u3064\u304B",
        24: "\u306B\u3058\u3085\u3046\u3088\u3063\u304B"
      });
      TSU = Object.freeze({
        1: "\u3072\u3068\u3064",
        2: "\u3075\u305F\u3064",
        3: "\u307F\u3063\u3064",
        4: "\u3088\u3063\u3064",
        5: "\u3044\u3064\u3064",
        6: "\u3080\u3063\u3064",
        7: "\u306A\u306A\u3064",
        8: "\u3084\u3063\u3064",
        9: "\u3053\u3053\u306E\u3064"
      });
      BASE = {
        "\u6642\u9593": { plain: "\u3058\u304B\u3093", bend: fourSevenNine("\u3058\u304B\u3093", "\u3088", "\u306A\u306A", "\u304F") },
        "\u6642": { plain: "\u3058", bend: fourSevenNine("\u3058", "\u3088", "\u3057\u3061", "\u304F") },
        // Half past: 四時半 is よじはん, one number and one counter. Without it,
        // 四 came out of the dictionary as し and took the suffix 時半 (ima shi
        // jihan desu), for every hour.
        "\u6642\u534A": { plain: "\u3058\u306F\u3093", bend: fourSevenNine("\u3058\u306F\u3093", "\u3088", "\u3057\u3061", "\u304F") },
        "\u5206": { plain: "\u3075\u3093", bend: hRow("\u3075\u3093", "\u3077\u3093", "\u3077\u3093", { three: "\u3077\u3093", four: "\u3077\u3093" }) },
        "\u79D2": { plain: "\u3073\u3087\u3046", bend: (last, kana) => [kana, "\u3073\u3087\u3046"] },
        "\u4EBA": {
          plain: "\u306B\u3093",
          whole: (n2) => n2 === 1 ? "\u3072\u3068\u308A" : n2 === 2 ? "\u3075\u305F\u308A" : void 0,
          bend: fourSevenNine("\u306B\u3093", "\u3088", "\u306A\u306A", "\u304D\u3085\u3046")
        },
        "\u672C": { plain: "\u307B\u3093", bend: hRow("\u307B\u3093", "\u307C\u3093", "\u307D\u3093") },
        "\u679A": { plain: "\u307E\u3044", bend: (last, kana) => [kana, "\u307E\u3044"] },
        // People, formally (a booking, a class list): 三名 is さんめい, and no
        // number bends before it. 名 alone is な, "name", and 十名 and 三名 were
        // read as the surnames とな and さんみょう until 名 joined this table.
        "\u540D": { plain: "\u3081\u3044", bend: (last, kana) => [kana, "\u3081\u3044"] },
        "\u5186": { plain: "\u3048\u3093", bend: fourSevenNine("\u3048\u3093", "\u3088", "\u306A\u306A", "\u304D\u3085\u3046") },
        "\u6B73": { plain: "\u3055\u3044", whole: (n2) => n2 === 20 ? "\u306F\u305F\u3061" : void 0, bend: ksRow("\u3055\u3044", { places: S_PLACES }) },
        "\u6708": {
          plain: "\u304C\u3064",
          whole: (n2) => n2 < 1 || n2 > 12 ? null : void 0,
          bend: fourSevenNine("\u304C\u3064", "\u3057", "\u3057\u3061", "\u304F")
        },
        "\u65E5": { plain: "\u306B\u3061", whole: (n2) => DAYS[n2] },
        "\u5E74": { plain: "\u306D\u3093", bend: fourSevenNine("\u306D\u3093", "\u3088", "\u306A\u306A", "\u304D\u3085\u3046") },
        "\u56DE": { plain: "\u304B\u3044", bend: ksRow("\u304B\u3044") },
        "\u500B": { plain: "\u3053", bend: ksRow("\u3053") },
        "\u968E": { plain: "\u304B\u3044", bend: ksRow("\u304B\u3044", { three: "\u304C\u3044" }) },
        "\u676F": { plain: "\u306F\u3044", bend: hRow("\u306F\u3044", "\u3070\u3044", "\u3071\u3044") },
        "\u5339": { plain: "\u3072\u304D", bend: hRow("\u3072\u304D", "\u3073\u304D", "\u3074\u304D") },
        "\u518A": { plain: "\u3055\u3064", bend: ksRow("\u3055\u3064", { places: S_PLACES }) },
        "\u53F0": { plain: "\u3060\u3044", bend: (last, kana) => [kana, "\u3060\u3044"] },
        "\u756A": { plain: "\u3070\u3093", bend: (last, kana) => [kana, "\u3070\u3093"] },
        "\u5EA6": { plain: "\u3069", bend: (last, kana) => [kana, "\u3069"] },
        "\u500D": { plain: "\u3070\u3044", bend: (last, kana) => [kana, "\u3070\u3044"] },
        "\u3064": { plain: "\u3064", whole: (n2) => TSU[n2] || null }
      };
      KA = ["\u304B", "\u30F6", "\u30B1", "\u30AB", "\u30F5", "\u7B87"];
      for (const ka of KA) {
        BASE[`${ka}\u6708`] = { plain: "\u304B\u3052\u3064", bend: ksRow("\u304B\u3052\u3064") };
        BASE[`${ka}\u6240`] = { plain: "\u304B\u3057\u3087", bend: ksRow("\u304B\u3057\u3087") };
      }
      SPAN = ["\u5E74", "\u5206", "\u79D2", "\u65E5", ...KA.map((ka) => `${ka}\u6708`)];
      for (const c of SPAN) {
        const spec = { ...BASE[c], tail: ["\u9593", "\u304B\u3093"] };
        if (c === "\u65E5") spec.whole = (n2) => n2 === 1 ? void 0 : DAYS[n2];
        BASE[`${c}\u9593`] = spec;
      }
      BASE["\u9031\u9593"] = { plain: "\u3057\u3085\u3046\u304B\u3093", bend: ksRow("\u3057\u3085\u3046\u304B\u3093", { places: S_PLACES }) };
      COUNTERS = Object.freeze(BASE);
      COUNTER_KEYS = Object.keys(COUNTERS).sort((a, b) => b.length - a.length);
    }
  });

  // js/name-types.js
  var NAME_TYPES, NAME_LINE_TYPES;
  var init_name_types = __esm({
    "js/name-types.js"() {
      NAME_TYPES = Object.freeze({
        surname: Object.freeze({ en: "surname", es: "apellido" }),
        given: Object.freeze({ en: "given name", es: "nombre de pila" }),
        masc: Object.freeze({ en: "given name (male)", es: "nombre de pila (masculino)" }),
        fem: Object.freeze({ en: "given name (female)", es: "nombre de pila (femenino)" }),
        place: Object.freeze({ en: "place name", es: "nombre de lugar" }),
        person: Object.freeze({ en: "person", es: "persona" })
      });
      NAME_LINE_TYPES = Object.freeze({
        ...NAME_TYPES,
        masc: Object.freeze({ en: "male given name", es: "nombre de pila masculino" }),
        fem: Object.freeze({ en: "female given name", es: "nombre de pila femenino" })
      });
    }
  });

  // js/names.js
  function isWord(s, dict2) {
    const recs = dict2.get(s);
    if (recs && recs.some((r) => !r.x)) return true;
    if (!isKana(s[s.length - 1])) return false;
    const found = (ds) => ds.some((d) => (dict2.get(d.base) || []).some((r) => posMatches(d.type, r.p, d.base, true)));
    return found(deinflect(s)) || found(deinflectStem(s));
  }
  function unsupported(run2, i, j, dict2, maxKey = 12, memo = {}) {
    const chars3 = [...run2.slice(i, j)];
    if (chars3.length < 2 || !chars3.every(isNameChar) || chars3[0] === "\u3005") return false;
    if (HEAD.has(chars3[0]) || TAIL.has(chars3[chars3.length - 1])) return false;
    let rs = i;
    while (rs > 0 && isNameChar(run2[rs - 1])) rs--;
    let re = j;
    while (re < run2.length && isNameChar(run2[re])) re++;
    const idx = spansOf(run2, dict2, maxKey, memo);
    if (idx.reach[j - 1] > i) return false;
    const leftOpen = i > rs && !(idx.lastStartEndingAt[i] >= rs);
    const rightOpen = j < re && !TAIL.has(run2[j]) && !idx.starts[j];
    return !leftOpen && !rightOpen;
  }
  function spansOf(run2, dict2, maxKey, memo) {
    if (memo.nameSpans && memo.nameSpans.run === run2) return memo.nameSpans;
    const n2 = run2.length;
    const reach = new Int32Array(n2 + 1).fill(-1);
    const starts = new Uint8Array(n2 + 1);
    const lastStartEndingAt = new Int32Array(n2 + 1).fill(-1);
    for (let a = 0; a < n2; a++) {
      if (!isNameChar(run2[a])) continue;
      let far = a > 0 && isNameChar(run2[a - 1]) ? reach[a - 1] : -1;
      const add = (b) => {
        starts[a] = 1;
        if (b > far) far = b;
        if (a > lastStartEndingAt[b]) lastStartEndingAt[b] = a;
      };
      const counted = countedEnd(run2, a);
      if (counted > a) add(counted);
      for (let b = a + 2; b <= Math.min(n2, a + maxKey); b++) if (isWord(run2.slice(a, b), dict2)) add(b);
      reach[a] = far;
    }
    memo.nameSpans = { run: run2, reach, starts, lastStartEndingAt };
    return memo.nameSpans;
  }
  function forms(list2, keepStem) {
    return (list2 || []).map(String).filter((x) => keepStem || !x.includes(".")).map((x) => toHira(x.split(".")[0]).replace(/-/g, "")).filter(Boolean);
  }
  function kunOf(info) {
    const list2 = info && info.kun || [];
    const plain = forms(list2.filter((x) => !String(x).includes("-")), false);
    return [...plain, ...forms(list2.filter((x) => String(x).includes("-")), false)];
  }
  function kunWithStems(info) {
    return [.../* @__PURE__ */ new Set([...kunOf(info), ...forms(info && info.kun, true)])];
  }
  function onOf(info) {
    return forms(info && info.on, true);
  }
  function wholeName(s) {
    return WHOLE[s] || null;
  }
  function wholeNameAt(run2, i) {
    for (const k of WHOLE_KEYS) if (run2.startsWith(k, i)) return k.length;
    return 0;
  }
  function guessName(s, kanji) {
    const chars3 = [...s];
    const info = chars3.map((ch) => kanji && ch !== "\u3005" ? kanji.get(ch) || kanji.get(NAME_VARIANTS[ch]) : null);
    const fixed = chars3.map((ch, n2) => n2 > 0 && chars3.length > 1 ? AFTER_FIRST[ch] : null);
    const covered = (fn) => chars3.every((ch, n2) => ch === "\u3005" ? n2 > 0 : fixed[n2] || fn(info[n2]).length > 0);
    const forcedOn = fixed.some((x) => x && x.on);
    const mode = !forcedOn && covered(kunOf) ? "kun" : covered(onOf) ? "on" : "each";
    const pieces3 = [];
    chars3.forEach((ch, n2) => {
      if (ch === "\u3005") {
        pieces3.push(pieces3[n2 - 1] || "");
        return;
      }
      if (fixed[n2]) {
        pieces3.push(fixed[n2].reading);
        return;
      }
      const kun = mode === "kun" ? kunOf(info[n2]) : kunWithStems(info[n2]);
      const on = onOf(info[n2]);
      pieces3.push((mode === "on" ? on[0] : kun[0] || on[0]) || "");
    });
    return pieces3;
  }
  function nameEntry(rec) {
    const nt = String(rec && rec.n || "").split(" ").filter((t3) => NAME_TYPES[t3]);
    const out = { g: [...new Set(nt.map((t3) => NAME_TYPES[t3].en))], p: "n-pr", nt };
    if (rec && rec.r) out.r = [...rec.r];
    if (rec && rec.f) out.f = rec.f;
    if (rec && rec.s) out.s = 1;
    return out;
  }
  var TAIL, HEAD, isNameChar, AFTER_FIRST, WHOLE, WHOLE_KEYS, NAME_VARIANTS;
  var init_names = __esm({
    "js/names.js"() {
      init_kana();
      init_deinflect();
      init_numbers();
      init_name_types();
      TAIL = /* @__PURE__ */ new Set([..."\u541B\u69D8\u6C0F\u6BBF\u9054\u5BB6"]);
      HEAD = /* @__PURE__ */ new Set([..."\u79C1\u50D5\u4FFA\u5F7C\u4F55\u8AB0\u6211"]);
      isNameChar = (ch) => isKanji2(ch) && ch !== "\u30F6" && ch !== "\u3006";
      AFTER_FIRST = Object.freeze({
        "\u85E4": { reading: "\u3068\u3046", on: true },
        "\u7530": { reading: "\u3060" },
        // 口 there is ぐち: 山口, 川口, 田口, 野口, 谷口, 関口, 樋口. 山口 was
        // read やまくち.
        "\u53E3": { reading: "\u3050\u3061" }
      });
      WHOLE = Object.freeze({ "\u6E05\u6C34": "\u3057\u307F\u305A", "\u9577\u8C37\u5DDD": "\u306F\u305B\u304C\u308F", "\u4E94\u5341\u5D50": "\u3044\u304C\u3089\u3057", "\u670D\u90E8": "\u306F\u3063\u3068\u308A" });
      WHOLE_KEYS = Object.keys(WHOLE);
      NAME_VARIANTS = Object.freeze({ "\u{20BB7}": "\u5409" });
    }
  });

  // js/key-rules.js
  function refused(s, key, rec, cls, atStart, dict2) {
    if (cls === "prt" && PARTICLE.has(s)) return true;
    if (cls === "prt" && PARTICLE_PAIRS.has(s) && !atStart) return true;
    if (COPULA[s] && !["noun", "verb", "adj"].includes(cls)) return true;
    if (closedTiling(s) && !atStart) return true;
    if (ENDING_THEN_PARTICLE.test(s)) return true;
    if (NEGATIVE_HEAD.test(key) && String(rec.p).split(" ").includes("exp") && !atStart) return true;
    if (isPhrase(key, rec, dict2)) return true;
    return verbThenTo(key, dict2) && !atStart;
  }
  function closedTiling(s, sawCopula = false, pieces3 = 0) {
    if (!s) return sawCopula && pieces3 >= 2;
    for (let k = 1; k <= s.length; k++) {
      const head = s.slice(0, k);
      const cop = !!COPULA[head];
      if ((cop || PARTICLE.has(head)) && closedTiling(s.slice(k), sawCopula || cop, pieces3 + 1)) return true;
    }
    return false;
  }
  function isPhrase(key, rec, dict2) {
    if (!dict2 || !String(rec.p).split(" ").includes("exp") || key.length < 3) return false;
    for (let k = 1; k < key.length - 1; k++) {
      if (!INNER_PARTICLES.has(key[k])) continue;
      const left = key.slice(0, k);
      const right = key.slice(k + 1);
      const solid = (x) => hasKanji(x) || x.length >= 2;
      if (solid(left) && solid(right) && dict2.get(left) && dict2.get(right)) return true;
    }
    return false;
  }
  function verbThenTo(key, dict2) {
    if (!dict2 || key.length < 3 || !key.endsWith("\u3068")) return false;
    const verbAt = (x) => (dict2.get(x) || []).some((r) => classOf(r.p) === "verb");
    const mid = key.slice(0, -1);
    return verbAt(mid) || PARTICLE.has(mid[0]) && verbAt(mid.slice(1));
  }
  var ENDING_THEN_PARTICLE, NEGATIVE_HEAD, INNER_PARTICLES;
  var init_key_rules = __esm({
    "js/key-rules.js"() {
      init_kana();
      init_costs();
      ENDING_THEN_PARTICLE = /^ま(す|した|せん|せんでした|しょう)(か|ね|よ)$/;
      NEGATIVE_HEAD = /^な(くて|けれ|いと|くちゃ|きゃ)/;
      INNER_PARTICLES = /* @__PURE__ */ new Set(["\u304C", "\u3092", "\u306B", "\u306F", "\u3067", "\u3068", "\u3082", "\u3078"]);
    }
  });

  // js/spellings.js
  function bandPrice(band, rec) {
    return BAND_STEP * band + (isAuxiliary(rec) ? 0 : AUX_TIE);
  }
  function recordBand(rec) {
    return rec.b !== void 0 ? rec.b : (rec.q || 6) + 2;
  }
  function kanaHomographCost(key, rec, dict2) {
    if (hasKanji(key)) return 0;
    const recs = dict2.get(key);
    if (!recs || recs.length < 2 || !recs.includes(rec)) return 0;
    const raw = recs.map((r) => bandPrice(recordBand(r), r) + (r.t || 0) * TIE_STEP);
    return raw[recs.indexOf(rec)] - Math.min(...raw);
  }
  function kanaCuts(node) {
    const s = node.s;
    const cuts = node.rec && node.rec.c;
    if (!Array.isArray(cuts) || !MERGEABLE.test(s) || ![...s].every(isHiragana2)) return [];
    let same2 = 0;
    while (same2 < s.length && s[same2] === node.key[same2]) same2++;
    return cuts.filter((c) => c > 0 && c < same2);
  }
  var MERGEABLE, BAND_STEP, AUX_TIE, isAuxiliary, TIE_STEP;
  var init_spellings = __esm({
    "js/spellings.js"() {
      init_kana();
      init_costs();
      MERGEABLE = /[おこそとのほもよろごぞどぼぽょ]う|[えけせてねへめれげぜでべぺ]い/;
      BAND_STEP = 16;
      AUX_TIE = 8;
      isAuxiliary = (r) => classOf(r.p) === "verb" && String(r.p).split(" ").includes("aux-v");
      TIE_STEP = 1 / 8;
    }
  });

  // js/candidates.js
  function keysForRun(run2, maxKey = 12) {
    const keys = /* @__PURE__ */ new Set();
    for (let i = 0; i < run2.length; i++) {
      for (let len3 = 1; len3 <= maxKey && i + len3 <= run2.length; len3++) {
        const s = run2.slice(i, i + len3);
        const last = s[s.length - 1];
        if (isDigitish(last)) break;
        keys.add(s);
        if (!isKana(last)) continue;
        for (const d of deinflect(s)) if (d.base.length <= maxKey) keys.add(d.base);
        if (hasKanji(s)) {
          for (const d of deinflectStem(s)) if (d.base.length <= maxKey) keys.add(d.base);
        }
      }
    }
    return keys;
  }
  function chainClass(chain, cls) {
    const top = chain.length ? chain[0].rule : null;
    if (top === "sou" || top === "adj-sou") return "noun";
    if (cls === "verb" && ADJ_ENDINGS.has(top)) return "adj";
    return cls;
  }
  function qCost(q) {
    return COST.q[q >= 1 && q <= 5 ? q : 0];
  }
  function wordNode(s, i, j, rec, key, chain, cuts, whole, env) {
    const cls = chainClass(chain, classOf(rec.p));
    if (refused(s, key, rec, cls, i === 0 && !env.after, env.dict)) return null;
    let cost = COST.word + qCost(bandOf(key, rec, env.dict)) + COST.step * chain.length + homographCost(key, rec, env.dict) + kanaHomographCost(key, rec, env.dict);
    const kanaSpelled = !!(rec.k && rec.k.length && !rec.u && !hasKanji(s) && !isKatakana2(s[0]));
    if (kanaSpelled) cost += COST.kanaForKanji;
    if (j - i === 1 && isKana(s) && cls !== "pref") cost += COST.oneKana;
    if (rec.x && !whole && !/(^| )adv( |$)/.test(rec.p || "")) cost += COST.xSplit;
    if (cls === "aux") cost += COST.aux;
    return { i, j, s, cls, rec, key, chain, cuts, cost, kanaSpelled };
  }
  function stemNouns(s, i, j, dict2, whole, env) {
    const out = [];
    for (const d of deinflectStem(s)) {
      for (const rec of dict2.get(d.base) || []) {
        if (!posMatches(d.type, rec.p, d.base, true)) continue;
        const node = wordNode(s, i, j, rec, d.base, d.chain, d.cuts, whole, env);
        if (!node) continue;
        node.cls = "noun";
        node.cost += COST.stemNoun;
        out.push(node);
      }
    }
    return out;
  }
  function endsInsideWord(run2, i, j, dict2, maxKey) {
    let k = j;
    while (k > i && isHiragana2(run2[k - 1])) k--;
    if (k === j || k === i) return false;
    const prev = /[\uDC00-\uDFFF]/.test(run2[k - 1]) ? run2.codePointAt(k - 2) : run2.codePointAt(k - 1);
    if (!isKanji2(String.fromCodePoint(prev))) return false;
    if (ENDERS.some((w) => run2.startsWith(w, j))) return false;
    let e = j;
    while (e < run2.length && isHiragana2(run2[e])) e++;
    if (e === j || e - k > maxKey) return false;
    const recs = dict2.get(run2.slice(k, e));
    return !!recs && recs.some(banded);
  }
  function candidates(run2, i, dict2, env) {
    const out = [];
    const push = (node) => {
      if (node) out.push(node);
    };
    const maxLen = Math.min(env.maxKey, run2.length - i);
    const counted = countedEnd(run2, i);
    for (let len3 = 1; len3 <= maxLen; len3++) {
      const j = i + len3;
      const s = run2.slice(i, j);
      const last = s[len3 - 1];
      if (isDigitish(last)) break;
      const whole = i === 0 && j === run2.length;
      let inside = null;
      for (const rec of dict2.get(s) || []) {
        const node = wordNode(s, i, j, rec, s, NO_CHAIN, NO_CHAIN, whole, env);
        if (node && j === counted) {
          if (rec.q !== 1) node.cost += COST.numberKey;
          else node.countLike = true;
        }
        if (node && rec.m) {
          if (inside === null) inside = endsInsideWord(run2, i, j, dict2, env.maxKey);
          if (inside) node.cost += COST.endsInsideWord;
        }
        push(node);
      }
      if (isKana(last)) {
        for (const d of deinflect(s)) {
          const recs = dict2.get(d.base);
          if (!recs) continue;
          for (const rec of recs) {
            if (posMatches(d.type, rec.p, d.base, true)) push(wordNode(s, i, j, rec, d.base, d.chain, d.cuts, whole, env));
          }
        }
        if (hasKanji(s)) for (const node of stemNouns(s, i, j, dict2, whole, env)) push(node);
      } else if (len3 === 1 && env.stems && isKanji2(last)) {
        for (const node of stemNouns(s, i, j, dict2, whole, env)) push(node);
      }
      if (PARTICLE.has(s)) out.push({ i, j, s, cls: "prt", closed: true, cost: COST.particle });
      if (COPULA[s]) out.push({ i, j, s, cls: "cop", closed: true, cost: COST.copula });
    }
    const c0 = run2[i];
    const ask = c0 === "\u4F55" ? counterAt(run2, i + 1) : null;
    const asked2 = ask ? readQuestion(ask) : null;
    if (asked2) {
      out.push({
        i,
        j: i + 1 + ask.length,
        s: run2.slice(i, i + 1 + ask.length),
        cls: "num",
        cost: COST.numberKanji,
        reading: asked2.reading,
        counterChange: asked2.changed,
        parts: countedParts(c0, ask, asked2)
      });
    }
    const num = numberAt(run2, i);
    if (num) {
      const counter = counterAt(run2, num.end);
      const base = num.kanji ? COST.numberKanji : COST.number;
      const read = counter ? readCounted(num.value, counter) : null;
      if (read) {
        out.push({
          i,
          j: num.end + counter.length,
          s: run2.slice(i, num.end + counter.length),
          cls: "num",
          cost: base,
          reading: read.reading,
          counterChange: read.changed || numberBends(num.value),
          parts: countedParts(run2.slice(i, num.end), counter, read)
        });
      }
      if (!num.kanji || num.end - i > 1) {
        const reading = readNumber(num.value);
        out.push({
          i,
          j: num.end,
          s: run2.slice(i, num.end),
          cls: "num",
          cost: base + COST.bareNumber,
          reading,
          counterChange: numberBends(num.value),
          parts: [{ text: run2.slice(i, num.end), ruby: reading }]
        });
      }
    }
    if (isKatakana2(c0)) {
      let j = i;
      while (j < run2.length && isKatakana2(run2[j])) j++;
      out.push({ i, j, s: run2.slice(i, j), cls: "kata", cost: COST.kataRun });
    }
    const cp = String.fromCodePoint(run2.codePointAt(i));
    if (isKanji2(cp)) {
      const known = wholeNameAt(run2, i);
      if (known) out.push({ i, j: i + known, s: run2.slice(i, i + known), cls: "name", cost: COST.nameRun });
      let j = i;
      for (let n2 = 1; n2 <= 6 && j < run2.length; n2++) {
        const ch = String.fromCodePoint(run2.codePointAt(j));
        if (!isKanji2(ch)) break;
        j += ch.length;
        const cost = n2 >= 2 && unsupported(run2, i, j, dict2, env.maxKey, env) ? COST.nameRun + COST.nameRunPerChar * (n2 - 2) : COST.name + COST.namePerChar * n2;
        out.push({ i, j, s: run2.slice(i, j), cls: "name", cost });
      }
    } else {
      out.push({ i, j: i + cp.length, s: cp, cls: "unk", cost: COST.unkKana });
    }
    if (isKana(c0) && /[っッ]/.test(run2[i + 1] || "") && i + 2 === run2.length) {
      out.push({ i, j: i + 2, s: run2.slice(i, i + 2), cls: "exp", tsu: true, cost: COST.tsu });
    }
    return out;
  }
  var isDigitish, NO_CHAIN, ADJ_ENDINGS, banded, ENDERS;
  var init_candidates = __esm({
    "js/candidates.js"() {
      init_kana();
      init_deinflect();
      init_numbers();
      init_costs();
      init_names();
      init_key_rules();
      init_spellings();
      isDigitish = (ch) => ch >= "0" && ch <= "9" || ch === ",";
      NO_CHAIN = Object.freeze([]);
      ADJ_ENDINGS = /* @__PURE__ */ new Set(["tai", "negative", "yasui", "nikui"]);
      banded = (rec) => rec.q >= 1 && rec.q <= 5;
      ENDERS = Object.freeze([...PARTICLES, ...Object.keys(COPULA)]);
    }
  });

  // js/lattice.js
  function bestPath(run2, dict2, env) {
    const from = env.from || 0;
    const n2 = env.to === void 0 ? run2.length : env.to;
    if (n2 <= from) return [];
    const gen = env.candidatesAt || candidates;
    const ends = Array.from({ length: n2 + 1 }, () => []);
    const bos = { i: from, j: from, cls: env.after || "bos", total: 0, back: null, start: true };
    ends[from].push(bos);
    const leftOf = (prev) => !prev.start ? prev : env.left !== void 0 ? env.left : edge(prev);
    for (let i = from; i < n2; i++) {
      if (!ends[i].length) continue;
      for (const node of gen(run2, i, dict2, env)) {
        if (node.j > n2) continue;
        if (env.exclude && node.i === from && node.j === n2) continue;
        let best2 = null;
        let bestCost2 = Infinity;
        for (const prev of ends[i]) {
          const c = prev.total + connect(leftOf(prev), node) + node.cost;
          if (c < bestCost2) {
            bestCost2 = c;
            best2 = prev;
          }
        }
        node.total = bestCost2;
        node.back = best2;
        ends[node.j].push(node);
      }
    }
    let best = null;
    let bestCost = Infinity;
    for (const node of ends[n2]) {
      const end = env.right !== void 0 ? connect(node, env.right) : env.before ? 0 : connect(node, null);
      const c = node.total + end;
      if (c < bestCost) {
        bestCost = c;
        best = node;
      }
    }
    const path = [];
    for (let x = best; x && !x.start; x = x.back) path.unshift(x);
    return path;
  }
  function edge(bos) {
    return bos.cls === "bos" ? null : { cls: bos.cls, s: "" };
  }
  function commonPrefix2(a, b) {
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    return k;
  }
  function nanReading(next2) {
    if (!next2) return "\u306A\u306B";
    if (next2.cls === "num" || next2.cls === "suf" || next2.s.startsWith("\u66DC")) return "\u306A\u3093";
    const first = toHira(next2.s)[0] || "";
    return "\u3060\u3067\u3069\u305F\u3066\u3068\u306A\u306B\u306C\u306D\u306E".includes(first) ? "\u306A\u3093" : "\u306A\u306B";
  }
  function readingOf(node, next2) {
    if (node.reading !== void 0) return node.reading;
    const s = node.s;
    const rs = node.rec && node.rec.r;
    if (!node.rec || !hasKanji(s) || !rs || !rs.length) return toHira(s);
    if (!node.chain.length) {
      if (node.key === "\u4F55") return nanReading(next2);
      return toHira(rs[0]);
    }
    const lemma = node.key;
    const lr = /\badj-ix\b/.test(node.rec.p) ? adjIxReading(rs) : rs[0];
    const p = commonPrefix2(lemma, s);
    let head = lr.slice(0, Math.max(0, lr.length - (lemma.length - p)));
    if (lemma.endsWith("\u6765\u308B") && /\bvk\b/.test(node.rec.p) && p > 0 && s[p - 1] === "\u6765") {
      head = head.slice(0, -1) + kuruReading(s);
    }
    return toHira(head + s.slice(p));
  }
  function wordsOf(node, reading, dict2, env) {
    if (node.rec) {
      const joined = joinWords(node, reading, dict2);
      if (joined) return joined;
    }
    if (node.cls === "cop" && node.closed) {
      const words = COPULA[node.s];
      if (words.length < 2) return null;
      let at = 0;
      return words.map((w) => {
        const span = [at, at + w.length];
        at += w.length;
        return span;
      });
    }
    if (!node.rec || node.chain.length || node.rec.x || node.rec.w) return null;
    const tags2 = String(node.rec.p).split(" ");
    if (!(tags2.includes("exp") || tags2.includes("int"))) return null;
    const inner = bestPath(node.s, dict2, { ...env, exclude: true, after: void 0, before: false });
    if (inner.length !== 2) return phraseWords(node, reading, dict2, env);
    const [left, right] = inner;
    const lt = left.rec ? String(left.rec.p).split(" ") : [];
    const leftOk = left.rec && !left.chain.length && !lt.includes("n") && !lt.includes("pn") && ["int", "adv", "exp"].some((t3) => lt.includes(t3)) && left.s.length >= 2 && isAllKana(left.s) && reading.startsWith(toHira(left.s));
    const rightOk = right.cls === "cop" && right.closed || right.rec && ["verb", "exp"].includes(right.cls) && POLITE_END.test(right.s);
    if (leftOk && rightOk) return [[0, left.j], [left.j, reading.length]];
    return phraseWords(node, reading, dict2, env);
  }
  function piecesOf(node, reading, dict2, env) {
    const path = bestPath(node.s, dict2, { ...env, exclude: true, after: void 0, before: false });
    if (path.length < 2) return null;
    const reads2 = path.map((x, k) => toHira(readingOf(x, path[k + 1])));
    return reads2.join("") === toHira(reading) ? { path, reads: reads2 } : null;
  }
  function phraseWords(node, reading, dict2, env) {
    if (!hasKanji(node.s)) return null;
    const pieces3 = piecesOf(node, reading, dict2, env);
    if (!pieces3) return null;
    const kinds = pieces3.path.map((x) => x.cls === "prt" && SPLIT_PARTICLES.has(x.s) ? "p" : WORD_CLASSES.has(x.cls) ? "w" : null);
    if (kinds.some((k) => !k) || !kinds.includes("p") || kinds.some((k, n2) => k === "w" && kinds[n2 - 1] === "w")) return null;
    const words = [];
    let at = 0;
    pieces3.reads.forEach((r, n2) => {
      const span = [at, at + r.length, kinds[n2] === "p"];
      at += r.length;
      const last = words[words.length - 1];
      if (last && span[2] && last[2]) last[1] = span[1];
      else words.push(span);
    });
    return words;
  }
  function teAuxJoin(key) {
    for (let c = 2; c < key.length - 1; c++) {
      if (key[c - 1] !== "\u3066" && key[c - 1] !== "\u3067") continue;
      const rest = key.slice(c);
      if (!isAllKana(rest)) continue;
      if (TE_AUX.has(rest) || deinflect(rest).some((d) => TE_AUX.has(d.base))) return c;
    }
    return -1;
  }
  function joinWords(node, reading, dict2) {
    const rules = new Set((node.chain || []).map((c) => c.rule));
    const s = node.s;
    const at = /* @__PURE__ */ new Set();
    const fromEnd = (c) => isAllKana(s.slice(c)) ? reading.length - (s.length - c) : -1;
    for (const [rule, head] of TE_JOINS) {
      if (!rules.has(rule)) continue;
      for (const c of node.cuts) if ((s[c - 1] === "\u3066" || s[c - 1] === "\u3067") && s[c] === head) at.add(fromEnd(c));
    }
    if (rules.has("masu-past-negative") && s.endsWith("\u3067\u3057\u305F")) at.add(reading.length - 3);
    const tags2 = String(node.rec.p).split(" ");
    if (tags2.some((t3) => /^v/.test(t3)) || tags2.includes("exp")) {
      const c = teAuxJoin(node.key);
      if (c > 0 && c <= commonPrefix2(node.key, s)) at.add(fromEnd(c));
    }
    const cuts = [...at].filter((c) => c > 0 && c < reading.length).sort((x, y) => x - y);
    if (!cuts.length) return null;
    return [0, ...cuts].map((c, n2, all) => [c, n2 + 1 < all.length ? all[n2 + 1] : reading.length]);
  }
  function countedRecord(s, reading, dict2) {
    const recs = (dict2.get(s) || []).filter((r) => Array.isArray(r.r));
    return recs.find((r) => r.r[0] === reading) || recs.find((r) => r.r.includes(reading)) || null;
  }
  function toToken(node, path, k, run2, dict2, env) {
    const next2 = path[k + 1];
    const reading = readingOf(node, next2);
    const rec = node.rec || null;
    let kind;
    let confidence;
    let entry = rec;
    let base = node.s;
    if (rec) {
      confidence = "dict";
      base = node.key;
      if (node.cls === "prt") kind = "particle";
      else if (node.cls === "cop") kind = "copula";
      else if (node.cls === "name") kind = "name";
      else if (node.chain.length) kind = "inflected";
      else if ([...node.s].every(isKatakana2)) kind = "katakana";
      else kind = "word";
    } else if (node.cls === "prt" || node.cls === "cop") {
      kind = node.cls === "prt" ? "particle" : "copula";
      confidence = "rule";
      const tag = node.cls === "prt" ? "prt" : "cop";
      entry = (dict2.get(node.s) || []).find((r) => String(r.p).split(" ").includes(tag)) || null;
      const before = path[k - 1];
      if (node.cls === "prt" && (node.s === "\u306A" || node.s === "\u3067") && before && before.rec && String(before.rec.p).split(" ").includes("adj-na") && !before.chain.length) entry = null;
      if (node.cls === "cop") base = "\u3060";
    } else if (node.cls === "num") {
      kind = "number";
      confidence = "rule";
      entry = countedRecord(node.s, reading, dict2);
    } else if (node.cls === "kata") {
      kind = "katakana";
      confidence = "guess";
    } else if (node.cls === "name") {
      kind = "name";
      confidence = "guess";
    } else if (node.tsu) {
      kind = "word";
      confidence = "rule";
    } else {
      kind = "unknown";
      confidence = "guess";
    }
    const token = {
      kind,
      surface: node.s,
      start: node.i,
      end: node.j,
      base,
      reading,
      // A rare word or a name counts its own tier's records (js/rare.js sets it).
      entry,
      alts: node.alts !== void 0 ? node.alts : rec ? Math.max(0, (dict2.get(node.key) || []).length - 1) : 0,
      chain: node.chain ? [...node.chain] : [],
      confidence
    };
    if (kind === "number") token.counterChange = !!node.counterChange;
    if (kind === "name" && node.original) token.name = { o: node.original, types: [...rec && rec.nt || []] };
    const aid = { f: rec ? rec.f : void 0, cuts: [...node.cuts || [], ...kanaCuts(node)], parts: node.parts || null };
    aid.v5u = !!rec && !node.chain.length && /\bv5u(-s)?\b/.test(rec.p) && node.s.endsWith("\u3046");
    aid.finalWa = !!rec && (!!rec.w || !!rec.x && node.key.endsWith("\u306F") || FINAL_WA.has(node.key));
    if (!rec && FINAL_WA.has(node.s)) aid.finalWa = true;
    if (kind === "name" && !rec && wholeName(node.s)) {
      token.reading = wholeName(node.s);
      aid.f = "*";
    } else if (kind === "name" && !rec) {
      const pieces3 = guessName(node.s, env.kanji);
      token.reading = pieces3.join("");
      aid.f = pieces3.every(Boolean) ? pieces3.join("|") : void 0;
    }
    aid.words = wordsOf(node, token.reading, dict2, env);
    aid.waAt = particleWa(node, dict2, env, token.reading);
    token.aid = aid;
    return token;
  }
  function particleWa(node, dict2, env, reading = readingOf(node), depth = 0) {
    const s = node.s;
    if (!node.rec || node.chain.length || s.indexOf("\u306F", 1) < 0) return [];
    const tags2 = String(node.rec.p).split(" ");
    if (!tags2.includes("exp") && !tags2.includes("conj")) return [];
    const pieces3 = isAllKana(s) ? { path: bestPath(s, dict2, { ...env, exclude: true, after: void 0, before: false }), reads: null } : piecesOf(node, reading, dict2, env);
    if (!pieces3) return [];
    const out = [];
    let at = 0;
    pieces3.path.forEach((x, n2) => {
      const r = pieces3.reads ? pieces3.reads[n2] : toHira(x.s);
      const base = pieces3.reads ? at : x.i;
      if (x.cls === "prt" || x.cls === "cop") {
        for (let k = 0; k < r.length; k++) if (r[k] === "\u306F") out.push(base + k);
      } else if (x.rec && x.s.endsWith("\u306F") && (x.rec.w || x.rec.x)) out.push(base + r.length - 1);
      else if (depth < 2) for (const k of particleWa(x, dict2, env, r, depth + 1)) out.push(base + k);
      at += r.length;
    });
    return out;
  }
  function pathOf(run2, dict2, opts = {}) {
    const env = { maxKey: dict2.maxKey || 12, kanji: opts.kanji, after: opts.after, before: opts.before, dict: dict2 };
    return { path: bestPath(run2, dict2, env), env };
  }
  function tokensOf(run2, path, dict2, env) {
    return path.map((node, k) => toToken(node, path, k, run2, dict2, env));
  }
  var SPLIT_PARTICLES, WORD_CLASSES, POLITE_END, TE_AUX, TE_JOINS;
  var init_lattice = __esm({
    "js/lattice.js"() {
      init_kana();
      init_deinflect();
      init_costs();
      init_names();
      init_candidates();
      init_spellings();
      init_costs();
      init_candidates();
      SPLIT_PARTICLES = /* @__PURE__ */ new Set(["\u306F", "\u304C", "\u3092", "\u306B", "\u306E", "\u3082", "\u3067", "\u3068", "\u3078", "\u304B\u3089", "\u307E\u3067", "\u3088\u308A", "\u306A", "\u306A\u308A", "\u3060\u3051", "\u307B\u3069"]);
      WORD_CLASSES = /* @__PURE__ */ new Set(["noun", "verb", "adj", "cop"]);
      POLITE_END = /ま(す|した|せん|して|しょう)$/;
      TE_AUX = /* @__PURE__ */ new Set(["\u3044\u308B", "\u3044\u304F", "\u304F\u308B", "\u304A\u304F", "\u3057\u307E\u3046", "\u307F\u308B", "\u3042\u308B", "\u3042\u3052\u308B", "\u304F\u308C\u308B", "\u3082\u3089\u3046"]);
      TE_JOINS = [["te-iru", "\u3044"], ["te-shimau", "\u3057"], ["te-miru", "\u307F"]];
    }
  });

  // js/rare.js
  function isWeak(node) {
    return !node.rec && (node.cls === "kata" || node.cls === "name" || node.cls === "unk");
  }
  function weakSpans(run2, path) {
    const spans = [];
    for (let a = 0; a < path.length; a++) {
      if (!isWeak(path[a])) continue;
      let b = a + 1;
      while (b < path.length && isWeak(path[b])) b++;
      const i = path[a].i;
      const j = path[b - 1].j;
      const cs = chars(run2.slice(i, j));
      if (!(cs.length === 1 && isKana(cs[0]))) {
        spans.push({
          a,
          b,
          i,
          j,
          kata: cs.every(isKatakana2),
          kanji: cs.every(isKanji2),
          left: a > 0 ? path[a - 1] : void 0,
          right: b < path.length ? path[b] : void 0
        });
      }
      a = b - 1;
    }
    return spans;
  }
  function askable(k) {
    return k.length >= 2 || isKanji2(k);
  }
  function nameShaped(s) {
    const cs = chars(s);
    return cs.length >= 2 && (cs.every((ch) => isKanji2(ch) && ch !== "\u30F6" && ch !== "\u3006") || cs.every(isKatakana2));
  }
  function tooShort(sp, i, j, common = false) {
    if (sp.kanji) return false;
    if (sp.kata && i === sp.i && j === sp.j) return false;
    return j - i < (sp.kata ? common ? 3 : 4 : 3);
  }
  function badStart(run2, sp, i, word) {
    if (i > sp.i && GEMINATE.has(run2[i - 1])) return true;
    return (word || i > sp.i) && NO_START.has(run2[i]);
  }
  function loneKanji(run2, i, j, sp, kanji) {
    if (j === sp.j && sp.right && isHiragana2(sp.right.s[0]) && !CASE.has(sp.right.s)) return false;
    if (i === sp.i && sp.left && NOMINAL.has(sp.left.cls)) return false;
    const info = kanji && typeof kanji.get === "function" ? kanji.get(run2[i]) : null;
    return !(info && Array.isArray(info.kun) && info.kun.some((r) => r.includes(".")));
  }
  function nameFits(j, sp) {
    const next2 = j === sp.j ? sp.right : void 0;
    if (!next2 || !isHiragana2(next2.s[0])) return true;
    if (next2.cls === "verb") return false;
    return chars(next2.s).length > 1 || AFTER_NAME.has(next2.cls);
  }
  function wordsSpelled(s, dict2) {
    return (dict2.rare(s) || []).filter((r) => !/\b(prt|cop)\b/.test(String(r.p)));
  }
  function outranks(s, rec, words) {
    if (!rec.s) return false;
    if (isKatakana2(s[0])) return !words.some((w) => w.e);
    if (!String(rec.n).split(" ").includes("surname")) return false;
    if (rec.S || !words.length) return true;
    return words.some((w) => (w.r ? w.r[0] : s) === (rec.r && rec.r[0]));
  }
  function kanaWordCost(s, words) {
    return isKatakana2(s[0]) && words.some((w) => w.e) ? COST.nameWeak : 0;
  }
  function alsoWord(words) {
    const w = words[0];
    if (!w || !Array.isArray(w.g) || !w.g.length) return void 0;
    const out = { g: w.g.slice(0, 2) };
    if (w.r && w.r.length) out.r = w.r[0];
    return out;
  }
  function* rareLookups(run2, sp, i, kanji) {
    if (badStart(run2, sp, i, true)) return;
    for (let len3 = 1; len3 <= RARE_MAX_KEY && i + len3 <= sp.j; len3++) {
      const j = i + len3;
      const s = run2.slice(i, j);
      if (!askable(s) || tooShort(sp, i, j)) continue;
      if (chars(s).length === 1 && !loneKanji(run2, i, j, sp, kanji)) continue;
      yield { s, j, key: s, d: null };
      if (!isKana(s[len3 - 1])) continue;
      for (const d of deinflect(s)) {
        if (d.base.length <= RARE_MAX_KEY && askable(d.base)) yield { s, j, key: d.base, d };
      }
    }
  }
  function* nameLookups(run2, sp, i) {
    if (badStart(run2, sp, i, true)) return;
    for (let len3 = 2; len3 <= NAME_MAX_KEY && i + len3 <= sp.j; len3++) {
      const s = run2.slice(i, i + len3);
      if (nameShaped(s) && !tooShort(sp, i, i + len3) && nameFits(i + len3, sp)) yield s;
    }
  }
  function spanKeys(run2, spans, into = { rare: /* @__PURE__ */ new Set(), names: /* @__PURE__ */ new Set(), first: /* @__PURE__ */ new Set() }, kanji = void 0) {
    if (!into.first) into.first = /* @__PURE__ */ new Set();
    for (const sp of spans) {
      for (let i = sp.i; i < sp.j; i++) {
        for (const { key } of rareLookups(run2, sp, i, kanji)) into.rare.add(key);
        for (const s of nameLookups(run2, sp, i)) into.names.add(s);
        if (sp.j - sp.i === 1 && isKanji2(run2[i])) for (const d of deinflectStem(run2[i])) into.first.add(d.base);
      }
    }
    return into;
  }
  function phaseTwo(run2, sp, dict2, env) {
    const merged = {
      get: (k) => {
        const a = dict2.get(k);
        const b = dict2.rare(k);
        return a && b ? [...a, ...b] : a || b;
      }
    };
    const rareEnv = { ...env, dict: merged };
    const stemEnv = { ...env, stems: true };
    const rareWord = (node, out) => {
      if (!node || node.cls === "prt" || node.cls === "cop") return;
      node.rare = true;
      const place = hasKanji(node.key) ? (node.rec.t || 0) * TIE : 0;
      node.cost += COST.rare - (node.rec.e ? COST.rareCommon : 0) + place;
      node.alts = Math.max(0, (dict2.rare(node.key) || []).length - 1);
      out.push(node);
    };
    return (r, i) => {
      const out = [];
      if (badStart(run2, sp, i, false)) return out;
      for (const node of candidates(run2, i, dict2, stemEnv)) {
        if (node.j > sp.j || node.cls === "kata") continue;
        if (node.rec && tooShort(sp, node.i, node.j, true)) continue;
        out.push(node);
      }
      if (isKatakana2(run2[i])) {
        let e = i;
        while (e < sp.j && e - i < KATA_MAX_PIECE && isKatakana2(run2[e])) e++;
        for (let j = i + 1; j <= e; j++) {
          const cost = COST.kataRun + COST.kataPerChar * Math.max(j - i, KATA_PIECE);
          out.push({ i, j, s: run2.slice(i, j), cls: "kata", cost });
        }
      }
      for (const { s, j, key, d } of rareLookups(run2, sp, i, env.kanji)) {
        const whole = i === 0 && j === run2.length;
        for (const rec of dict2.rare(key) || []) {
          if (d && !posMatches(d.type, rec.p, d.base, true)) continue;
          rareWord(wordNode(s, i, j, rec, key, d ? d.chain : NO_CHAIN, d ? d.cuts : NO_CHAIN, whole, rareEnv), out);
        }
      }
      for (const s of nameLookups(run2, sp, i)) {
        const rec = dict2.name(s);
        if (!rec) continue;
        const entry = nameEntry(rec);
        if (entry.r && wholeName(s) === entry.r[0]) entry.f = "*";
        const words = wordsSpelled(s, dict2);
        const also = alsoWord(words);
        if (also) entry.also = also;
        out.push({
          i,
          j: i + s.length,
          s,
          cls: "name",
          rec: entry,
          key: s,
          chain: NO_CHAIN,
          cuts: NO_CHAIN,
          named: true,
          alts: 0,
          cost: COST.nameKnown + (outranks(s, rec, words) ? 0 : COST.nameWeak) + kanaWordCost(s, words),
          // a katakana name's original spelling (トム is Tom), for the token
          original: typeof rec.o === "string" && rec.o ? rec.o : void 0
        });
      }
      return out;
    };
  }
  function refine(run2, path, spans, dict2, env) {
    if (!spans.length) return path;
    const out = [];
    let at = 0;
    for (const sp of spans) {
      out.push(...path.slice(at, sp.a));
      const sub = bestPath(run2, dict2, {
        ...env,
        from: sp.i,
        to: sp.j,
        left: sp.left,
        right: sp.right,
        candidatesAt: phaseTwo(run2, sp, dict2, env)
      });
      out.push(...sub.length ? sub : path.slice(sp.a, sp.b));
      at = sp.b;
    }
    out.push(...path.slice(at));
    return out;
  }
  var RARE_MAX_KEY, NAME_MAX_KEY, KATA_PIECE, KATA_MAX_PIECE, TIE, NO_START, GEMINATE, CASE, chars, AFTER_NAME;
  var init_rare = __esm({
    "js/rare.js"() {
      init_kana();
      init_deinflect();
      init_candidates();
      init_lattice();
      init_costs();
      init_names();
      RARE_MAX_KEY = 24;
      NAME_MAX_KEY = 16;
      KATA_PIECE = 4;
      KATA_MAX_PIECE = 40;
      TIE = 1 / 8;
      NO_START = /* @__PURE__ */ new Set([..."\u30FC\u30A1\u30A3\u30A5\u30A7\u30A9\u30E3\u30E5\u30E7\u30C3\u30EE\u30F5\u30F6\u30F3\u3041\u3043\u3045\u3047\u3049\u3083\u3085\u3087\u3063\u308E\u3093"]);
      GEMINATE = /* @__PURE__ */ new Set(["\u3063", "\u30C3"]);
      CASE = /* @__PURE__ */ new Set(["\u3092", "\u304C", "\u306B", "\u3067", "\u3068", "\u306E", "\u306F", "\u3082", "\u3078", "\u3084", "\u304B\u3089", "\u307E\u3067", "\u3088\u308A"]);
      chars = (s) => [...s];
      AFTER_NAME = /* @__PURE__ */ new Set(["prt", "cop", "suf"]);
    }
  });

  // js/furigana.js
  function segmentsOf(surface) {
    const out = [];
    let at = 0;
    for (const ch of surface) {
      const kana = isKana(ch);
      const last = out[out.length - 1];
      if (last && last.kana === kana) last.text += ch;
      else out.push({ text: ch, kana, start: at });
      at += ch.length;
    }
    return out;
  }
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function fParts(f, others) {
    if (!f) return others.map(() => null);
    const parts = String(f).split(";");
    if (parts.length === others.length) return parts;
    const multi = others.filter((o) => [...o.text].length > 1);
    if (parts.length === multi.length) {
      let k = 0;
      return others.map((o) => [...o.text].length > 1 ? parts[k++] : null);
    }
    return others.map(() => null);
  }
  function align(surface, reading, f, opts = {}) {
    const s = String(surface || "");
    const r = String(reading || "");
    const cuts = /* @__PURE__ */ new Set();
    const segs = segmentsOf(s);
    const others = segs.filter((g) => !g.kana);
    if (!others.length) {
      for (const c of opts.cuts || []) cuts.add(c);
      if (opts.v5u) cuts.add(r.length - 1);
      return { furigana: s ? [{ text: s }] : [], cuts: finish(cuts, r) };
    }
    const re = new RegExp(`^${segs.map((g) => g.kana ? escapeRe(toHira(g.text)) : "(.+?)").join("")}$`);
    const m = re.exec(r);
    if (!m) {
      const tail = segs[segs.length - 1].kana ? segs[segs.length - 1] : null;
      for (const c of opts.cuts || []) {
        if (tail && c >= tail.start) cuts.add(r.length - (s.length - c));
      }
      if (opts.v5u) cuts.add(r.length - 1);
      return { furigana: [{ text: s, ruby: r }], cuts: finish(cuts, r) };
    }
    const splits = fParts(f, others);
    const furigana = [];
    let at = 0;
    let group = 1;
    let k = 0;
    for (const g of segs) {
      g.rstart = at;
      if (g.kana) {
        furigana.push({ text: g.text });
        at += g.text.length;
      } else {
        const ruby = m[group++];
        const split = splits[k++];
        const chars3 = [...g.text];
        const pieces3 = split && split !== "*" ? split.split("|") : null;
        if (pieces3 && pieces3.length === chars3.length && pieces3.every(Boolean) && pieces3.join("") === ruby) {
          let inner = at;
          chars3.forEach((ch, n2) => {
            furigana.push({ text: ch, ruby: pieces3[n2] });
            if (n2) cuts.add(inner);
            inner += pieces3[n2].length;
          });
        } else if (split === "*" && chars3.length > 1) {
          furigana.push({ text: g.text, ruby, whole: true });
        } else {
          furigana.push({ text: g.text, ruby });
        }
        at += ruby.length;
      }
      if (g.rstart > 0) cuts.add(g.rstart);
    }
    for (const c of opts.cuts || []) {
      const g = segs.find((x) => x.kana && c >= x.start && c <= x.start + x.text.length);
      if (g) cuts.add(g.rstart + (c - g.start));
    }
    if (opts.v5u) cuts.add(r.length - 1);
    return { furigana, cuts: finish(cuts, r) };
  }
  function finish(cuts, reading) {
    return [...cuts].filter((c) => c > 0 && c < reading.length).sort((a, b) => a - b);
  }
  function splitByKanji(run2, reading, kanjiInfo) {
    const chars3 = [...run2];
    if (chars3.length === 1) return [reading];
    const options = chars3.map((ch, n2) => {
      if (ch === "\u3005" && n2 > 0) return null;
      return readingsOf(kanjiInfo && kanjiInfo.get(ch));
    });
    const out = [];
    function walk(n2, at) {
      if (n2 === chars3.length) return at === reading.length;
      let list2 = options[n2];
      if (list2 === null) list2 = out[n2 - 1] ? variants([out[n2 - 1]]) : [];
      for (const cand of list2) {
        if (!cand || !reading.startsWith(cand, at)) continue;
        out[n2] = cand;
        if (walk(n2 + 1, at + cand.length)) return true;
      }
      return false;
    }
    return walk(0, 0) ? out.slice() : null;
  }
  function readingsOf(info) {
    if (!info) return [];
    const on = (info.on || []).map((x) => toHira(String(x)).replace(/[-.]/g, ""));
    const kun = (info.kun || []).map((x) => toHira(String(x)).replace(/-/g, "").split(".")[0]);
    return variants([...new Set([...on, ...kun].filter(Boolean))]);
  }
  function variants(list2) {
    const out = /* @__PURE__ */ new Set();
    for (const r of list2) {
      out.add(r);
      const first = r[0];
      if (VOICE[first]) out.add(VOICE[first] + r.slice(1));
      if (HALF[first]) out.add(HALF[first] + r.slice(1));
      if (r.length > 1 && "\u3064\u304F\u3061\u304D".includes(r[r.length - 1])) out.add(`${r.slice(0, -1)}\u3063`);
    }
    return [...out].sort((a, b) => b.length - a.length);
  }
  var VOICE, HALF;
  var init_furigana = __esm({
    "js/furigana.js"() {
      init_kana();
      VOICE = Object.freeze({
        "\u304B": "\u304C",
        "\u304D": "\u304E",
        "\u304F": "\u3050",
        "\u3051": "\u3052",
        "\u3053": "\u3054",
        "\u3055": "\u3056",
        "\u3057": "\u3058",
        "\u3059": "\u305A",
        "\u305B": "\u305C",
        "\u305D": "\u305E",
        "\u305F": "\u3060",
        "\u3061": "\u3062",
        "\u3064": "\u3065",
        "\u3066": "\u3067",
        "\u3068": "\u3069",
        "\u306F": "\u3070",
        "\u3072": "\u3073",
        "\u3075": "\u3076",
        "\u3078": "\u3079",
        "\u307B": "\u307C"
      });
      HALF = Object.freeze({ "\u306F": "\u3071", "\u3072": "\u3074", "\u3075": "\u3077", "\u3078": "\u307A", "\u307B": "\u307D" });
    }
  });

  // js/loan-align.js
  function kataBeats(kata) {
    let at = 0;
    return beats(kata).map((kana) => {
      const b = { kana, at, end: at + kana.length };
      at = b.end;
      if (kana === "\u30C3" || kana === "\u3063") return { ...b, type: "gem" };
      if (kana === "\u30FC") return { ...b, type: "long" };
      if (kana === "\u30F3" || kana === "\u3093") return { ...b, type: "nasal", cls: "NN" };
      const romaji = beatRomaji(kana);
      const m = /^([^aiueo]*)([aiueo])$/.exec(romaji);
      if (!m) return { ...b, type: "other" };
      if (!m[1]) return { ...b, type: "vowel", vowel: m[2], romaji };
      const cls = ONSET[m[1]];
      return cls ? { ...b, type: "cv", cls, vowel: m[2], romaji } : { ...b, type: "other" };
    });
  }
  function englishUnits(word) {
    const w = String(word);
    const out = [];
    const push = (cls, from, to, extra = {}) => out.push({ cls, from, to, double: false, ...extra });
    let i = 0;
    while (i < w.length) {
      const ch = w[i];
      const next2 = w[i + 1] || "";
      const two = w.slice(i, i + 2);
      if (isVowel(ch) || ch === "y" && i > 0) {
        i++;
        continue;
      }
      if (ch === "y") {
        push("Y", i, i + 1, isVowel(next2) ? { soft: 1 } : {});
        i++;
        continue;
      }
      if (w.slice(i, i + 3) === "tch") {
        push("CH", i, i + 3, { double: true });
        i += 3;
        continue;
      }
      if (two === "ch") {
        push("CH", i, i + 2);
        i += 2;
        continue;
      }
      if (two === "sh") {
        push("SH", i, i + 2);
        i += 2;
        continue;
      }
      if (two === "th") {
        push("TH", i, i + 2);
        i += 2;
        continue;
      }
      if (two === "ph") {
        push("F", i, i + 2);
        i += 2;
        continue;
      }
      if (two === "gh") {
        push("F", i, i + 2, { soft: 0 });
        i += 2;
        continue;
      }
      if (two === "ck") {
        push("K", i, i + 2, { double: true });
        i += 2;
        continue;
      }
      if (two === "qu") {
        push("K", i, i + 1);
        push("W", i + 1, i + 2, { soft: 0 });
        i += 2;
        continue;
      }
      if (two === "wh") {
        push("W", i, i + 2);
        i += 2;
        continue;
      }
      if (two === "wr") {
        push("R", i, i + 2);
        i += 2;
        continue;
      }
      if (two === "kn" && i === 0) {
        push("N", i, i + 2);
        i += 2;
        continue;
      }
      if (two === "mb" && i + 2 === w.length) {
        push("M", i, i + 2);
        i += 2;
        continue;
      }
      if (w.slice(i, i + 3) === "dge") {
        push("J", i, i + 2, { double: true });
        i += 2;
        continue;
      }
      if (two === "ng") {
        push("N", i, i + 1);
        push("G", i + 1, i + 2, isVowel(w[i + 2]) ? {} : { soft: 0 });
        i += 2;
        continue;
      }
      if (ch === "x") {
        push("K", i, i + 1);
        push("S", i, i + 1);
        i++;
        continue;
      }
      if (ch === "c" && /[eiy]/.test(next2)) {
        push("S", i, i + 1);
        i++;
        continue;
      }
      if (ch === "c" && next2 === "c" && /[eiy]/.test(w[i + 2] || "")) {
        push("K", i, i + 1);
        push("S", i + 1, i + 2);
        i += 2;
        continue;
      }
      if (ch === "g" && /[eiy]/.test(next2)) {
        push("GJ", i, i + 1);
        i++;
        continue;
      }
      if ((ch === "t" || ch === "s") && /^(s?i[oa]|s?ure)/.test(w.slice(i + 1))) {
        const dbl2 = next2 === "s" && ch === "s";
        push(ch === "t" ? "TI" : "SI", i, dbl2 ? i + 2 : i + 1, { double: dbl2 });
        i += dbl2 ? 2 : 1;
        continue;
      }
      const cls = SINGLE[ch];
      if (!cls) return null;
      const dbl = next2 === ch;
      const to = dbl ? i + 2 : i + 1;
      const unit = { double: dbl };
      if (ch === "r" && i > 0 && isVowel(w[i - 1]) && !isVowel(w[to]) && w[to] !== "y") unit.soft = 0;
      if (ch === "r" && i > 0 && isVowel(w[i - 1]) && w.slice(to) === "e") unit.soft = 0;
      if (ch === "r" && i > 0 && !isVowel(w[i - 1]) && w.slice(to) === "e" && i + 2 === w.length) unit.soft = 0;
      if (ch === "s" && !dbl && to === w.length && i > 0 && !isVowel(w[i - 1]) && w[i - 1] !== "s") unit.soft = 1;
      if (ch === "l" && /[ao]/.test(w[i - 1] || "") && /[kfm]/.test(w[to] || "")) unit.soft = 0;
      if (ch === "w") unit.soft = 1;
      if (ch === "h" && i === 0) unit.soft = 1;
      push(cls, i, to, unit);
      i = to;
    }
    return out;
  }
  function englishOf(entry) {
    if (!entry) return [];
    const raw = [];
    if (Array.isArray(entry.ls) && entry.ls[0] === "eng" && typeof entry.ls[1] === "string") raw.push([entry.ls[1], 0]);
    (Array.isArray(entry.g) ? entry.g : []).forEach((g, k) => raw.push([g, k + 1]));
    const out = [];
    for (const [r, rank2] of raw) {
      const s = String(r).replace(/\([^)]*\)/g, " ").split(";")[0].toLowerCase().replace(/[-/]/g, " ").replace(/[’']/g, "").trim().replace(/^(to|a|an|the) /, "");
      if (!s || /[^a-z ]/.test(s)) continue;
      const words = s.split(/\s+/).filter(Boolean);
      if (words.length > 4) continue;
      const key = words.join(" ");
      if (!out.some((x) => x.text === key)) out.push({ text: key, words, rank: rank2 });
    }
    return out;
  }
  function lineUp(kb, a, b, us, prefix) {
    const nk = b - a;
    const nu = us.length;
    const INF = Infinity;
    const cost = Array.from({ length: nk + 1 }, () => new Array(nu + 1).fill(INF));
    const back = Array.from({ length: nk + 1 }, () => new Array(nu + 1).fill(null));
    cost[0][0] = 0;
    const relax = (i2, j2, ni, nj, c, how) => {
      if (c < cost[ni][nj]) {
        cost[ni][nj] = c;
        back[ni][nj] = { i: i2, j: j2, how };
      }
    };
    for (let i2 = 0; i2 <= nk; i2++) {
      for (let j2 = 0; j2 <= nu; j2++) {
        const c = cost[i2][j2];
        if (c === INF) continue;
        const beat = i2 < nk ? kb[a + i2] : null;
        const unit = j2 < nu ? us[j2] : null;
        if (unit && unit.soft !== void 0) relax(i2, j2, i2, j2 + 1, c + unit.soft, "skip");
        if (!beat) continue;
        if (beat.type === "vowel" || beat.type === "gem" || beat.type === "long") {
          relax(i2, j2, i2 + 1, j2, c, "free");
          if (beat.type === "vowel" && unit && (unit.cls === "W" || unit.cls === "Y")) relax(i2, j2, i2 + 1, j2 + 1, c, "match");
          continue;
        }
        if (beat.type === "other" || !unit) continue;
        const w = MATCH[unit.cls] && MATCH[unit.cls][beat.cls];
        if (w !== void 0) relax(i2, j2, i2 + 1, j2 + 1, c + w, "match");
        if (beat.cls === "TS" && unit.cls === "T" && us[j2 + 1] && us[j2 + 1].cls === "S") relax(i2, j2, i2 + 1, j2 + 2, c, "match2");
      }
    }
    let best = null;
    for (let j2 = prefix ? 1 : nu; j2 <= nu; j2++) {
      if (cost[nk][j2] <= MAX_COST && (!best || cost[nk][j2] < best.cost)) best = { cost: cost[nk][j2], used: j2 };
    }
    if (!best) return null;
    const map = new Array(nk).fill(-1);
    let i = nk;
    let j = best.used;
    while (i > 0 || j > 0) {
      const s = back[i][j];
      if (!s) return null;
      if (s.how === "match" || s.how === "match2") map[s.i] = s.j;
      i = s.i;
      j = s.j;
    }
    return { cost: best.cost, map, used: best.used };
  }
  function phraseUnits(words) {
    const units = [];
    for (let n2 = 0; n2 < words.length; n2++) {
      const us = englishUnits(words[n2]);
      if (!us) return null;
      for (const u of us) units.push({ ...u, word: n2 });
    }
    return units;
  }
  function alignFull(kb, cand) {
    const units = phraseUnits(cand.words);
    if (!units || !units.some(hard)) return null;
    const r = lineUp(kb, 0, kb.length, units, false);
    if (!r || matchedCount(r.map) < 1) return null;
    return { mode: "full", cost: r.cost, map: r.map, units, words: cand.words, text: cand.text };
  }
  function alignShort(kb, cand) {
    const per = cand.words.map((w) => englishUnits(w));
    if (per.some((us) => !us)) return null;
    const n2 = kb.length;
    let best = null;
    const walk = (a, t3, pieces3, cost) => {
      if (a === n2) {
        if (best && cost >= best.cost) return;
        best = { cost, pieces: pieces3.slice() };
        return;
      }
      if (t3 >= per.length) return;
      for (let b = a + 1; b <= n2; b++) {
        const r = lineUp(kb, a, b, per[t3], true);
        if (!r || cost + r.cost > MAX_COST) continue;
        const m = matchedCount(r.map);
        if (!m && !(b < n2 && /^[aeiou]/.test(cand.words[t3]))) continue;
        pieces3.push({ a, b, word: t3, map: r.map, used: r.used, matched: m });
        walk(b, t3 + 1, pieces3, cost + r.cost);
        pieces3.pop();
      }
    };
    walk(0, 0, [], 0);
    if (!best) return null;
    const matched = best.pieces.reduce((s, p) => s + p.matched, 0);
    const lastWord = best.pieces[best.pieces.length - 1].word;
    let left = 0;
    per.forEach((us, t3) => {
      const piece = best.pieces.find((p) => p.word === t3);
      const rest = piece ? us.slice(piece.used) : t3 > lastWord ? us : [];
      left += rest.filter(hard).length;
    });
    if (matched < 2 || left < 2) return null;
    if (best.pieces.some((p, k) => !p.matched && !(best.pieces[k + 1] && best.pieces[k + 1].matched >= 2))) return null;
    const units = [];
    const start = [];
    per.forEach((us, t3) => {
      start.push(units.length);
      for (const u of us) units.push({ ...u, word: t3 });
    });
    const map = new Array(n2).fill(-1);
    for (const p of best.pieces) p.map.forEach((x, k) => {
      if (x >= 0) map[p.a + k] = start[p.word] + x;
    });
    return { mode: "short", cost: best.cost, map, units, words: cand.words, text: cand.text, clipped: true };
  }
  function alignEntry(kata, entry) {
    const kb = kataBeats(kata);
    if (kb.length < 2 || kb.length > MAX_BEATS || kb.some((b) => b.type === "other")) return null;
    const cands = englishOf(entry).filter((c) => c.rank <= 1 || !entry.u);
    let best = null;
    for (const c of cands) {
      const r = alignFull(kb, c);
      if (r && (!best || r.cost < best.cost)) best = r;
    }
    if (best) return { ...best, kb };
    const source = cands.some((c) => c.rank === 0);
    for (const c of cands.filter((x) => source ? x.rank === 0 : x.rank === 1)) {
      const r = alignShort(kb, c);
      if (r && (!best || r.cost < best.cost)) best = r;
    }
    return best ? { ...best, kb } : null;
  }
  var ONSET, VOWEL, isVowel, MATCH, SINGLE, MAX_COST, MAX_BEATS, hard, matchedCount;
  var init_loan_align = __esm({
    "js/loan-align.js"() {
      init_kana();
      ONSET = Object.freeze({
        k: "K",
        ky: "K",
        g: "G",
        gy: "G",
        s: "S",
        sh: "SH",
        z: "Z",
        j: "J",
        t: "T",
        ch: "CH",
        ts: "TS",
        d: "D",
        dy: "D",
        n: "N",
        ny: "N",
        h: "H",
        hy: "H",
        f: "F",
        b: "B",
        by: "B",
        v: "V",
        p: "P",
        py: "P",
        m: "M",
        my: "M",
        y: "Y",
        r: "R",
        ry: "R",
        w: "W"
      });
      VOWEL = /[aeiou]/;
      isVowel = (ch) => !!ch && VOWEL.test(ch);
      MATCH = Object.freeze({
        B: { B: 0 },
        K: { K: 0 },
        G: { G: 0 },
        GJ: { G: 0, J: 0 },
        // g before e, i, y: get ゲット, gym ジム
        J: { J: 0 },
        S: { S: 0, Z: 0, SH: 0 },
        // a voiced s (rose ローズ), si as シ (cinema)
        SH: { SH: 0 },
        CH: { CH: 0, K: 0, SH: 0 },
        TH: { S: 0, Z: 0, T: 1 },
        T: { T: 0, CH: 0, TS: 0 },
        TI: { SH: 0, T: 0, CH: 0 },
        // station ステーション
        SI: { SH: 0, J: 0, S: 0, Z: 0 },
        // mission ミッション, vision ビジョン
        D: { D: 0, J: 0 },
        // radio ラジオ
        F: { F: 0, H: 1 },
        // coffee コーヒー, and スマホ: old, and rarer
        H: { H: 0 },
        L: { R: 0 },
        R: { R: 0 },
        M: { M: 0, NN: 0 },
        // camp キャンプ
        N: { N: 0, NN: 0 },
        P: { P: 0 },
        V: { B: 0, V: 0 },
        W: { W: 0 },
        Y: { Y: 0 },
        Z: { Z: 0, J: 0 }
      });
      SINGLE = Object.freeze({
        b: "B",
        c: "K",
        d: "D",
        f: "F",
        g: "G",
        h: "H",
        j: "J",
        k: "K",
        l: "L",
        m: "M",
        n: "N",
        p: "P",
        q: "K",
        r: "R",
        s: "S",
        t: "T",
        v: "V",
        w: "W",
        y: "Y",
        z: "Z"
      });
      MAX_COST = 1;
      MAX_BEATS = 24;
      hard = (u) => u.soft === void 0;
      matchedCount = (map) => map.filter((x) => x >= 0).length;
    }
  });

  // js/loanwords.js
  function around(al, u) {
    const unit = al.units[u];
    const word = al.words[unit.word];
    const ws = al.units.filter((x) => x.word === unit.word);
    const k = ws.indexOf(unit);
    return { unit, word, before: ws[k - 1] || null, after: ws.slice(k + 1), rest: word.slice(unit.to) };
  }
  function lastConsonant(al, u) {
    const { after, rest, unit } = around(al, u);
    if (al.clipped && al.units[u + 1] && al.units[u + 1].word === unit.word) return false;
    return (rest === "" || rest === "e") && after.every((x) => x.soft !== void 0);
  }
  function vowelsBefore(al, u) {
    const { before, word, unit } = around(al, u);
    return word.slice(before ? before.to : 0, unit.from);
  }
  function vowelsAfter(al, k) {
    const u = al.map[k];
    if (u < 0) return null;
    const unit = al.units[u];
    const word = al.words[unit.word];
    let next2 = null;
    for (let m = k + 1; m < al.map.length; m++) {
      if (al.map[m] >= 0) {
        next2 = al.units[al.map[m]];
        break;
      }
    }
    const end = next2 && next2.word === unit.word ? next2.from : word.length;
    return { letters: word.slice(unit.to, end), next: next2 && next2.word === unit.word ? next2 : null, word };
  }
  function longKind(al, k) {
    const v = vowelsAfter(al, k);
    if (!v || !v.letters) return null;
    const s = v.letters;
    if (/^[aeiou]{1,2}r+e?$/.test(s)) return { kind: "r", detail: s.replace(/e$/, "") };
    if (s === "re") return { kind: "r", detail: "re" };
    if (LONG_GROUPS.has(s)) return { kind: "long", detail: s };
    if (/^[aeiou]$/.test(s) && v.next) {
      const after = v.word.slice(v.next.to);
      if (!v.next.double && (after === "e" || after === "es" || after === "le")) return { kind: "long", detail: `${s}-e` };
      if (!v.next.double && v.next.to - v.next.from === 1 && isVowelLetter(after[0])) return { kind: "long", detail: s };
      if (s === "a" && v.next.cls === "L") return { kind: "long", detail: "al" };
    }
    return null;
  }
  function rulesOf(kata, entry, offset) {
    const out = [];
    const add = (type, a, b, detail) => out.push({ type, at: [offset + a, offset + b], detail });
    const kb = kataBeats(kata);
    for (const b of kb) if (F_SMALL.test(b.kana)) add("loan-f", b.at, b.end, b.romaji);
    if (entry && entry.ws) add("loan-wasei", 0, kata.length, entry.ls && entry.ls[1] ? entry.ls[1] : null);
    const foreign = entry && Array.isArray(entry.ls) && entry.ls[0] !== "eng";
    const al = entry && !foreign ? alignEntry(kata, entry) : null;
    if (!al) return out;
    if (al.mode === "short") add("loan-short", 0, kata.length, al.text);
    const n2 = kb.length;
    kb.forEach((b, k) => {
      const u = al.map[k];
      const unit = u >= 0 ? al.units[u] : null;
      if (b.type === "cv" && unit) {
        if (unit.cls === "L" && b.cls === "R") add("loan-lr", b.at, b.end, "l");
        if (unit.cls === "V" && (b.cls === "B" || b.cls === "V")) add("loan-v", b.at, b.end, b.cls === "V" ? "v" : "b");
        if (unit.cls === "TH" && (b.cls === "S" || b.cls === "Z")) add("loan-th", b.at, b.end, b.cls === "S" ? "s" : "z");
        if (b.kana === "\u30D5" && unit.cls === "F" && unit.soft === void 0) add("loan-f", b.at, b.end, "fu");
        const next2 = around(al, u).rest;
        if (b.kana === "\u30B7" && unit.cls === "S" && /^(i|y|ee|ea)/.test(next2)) add("loan-si", b.at, b.end, "shi");
        if (b.kana === "\u30C6\u30A3" && unit.cls === "T") add("loan-si", b.at, b.end, "ti");
        if (b.kana === "\u30C1" && unit.cls === "T") add("loan-si", b.at, b.end, "chi");
        if (b.kana === "\u30C7\u30A3" && unit.cls === "D") add("loan-si", b.at, b.end, "di");
        if (b.kana === "\u30B8" && unit.cls === "D") add("loan-si", b.at, b.end, "ji");
        const ends = k === n2 - 1 || al.map[k + 1] >= 0 && al.units[al.map[k + 1]].word > unit.word;
        if (ends && lastConsonant(al, u) && (b.vowel === "u" || b.vowel === "o" && (b.cls === "T" || b.cls === "D"))) {
          add("loan-vowel", b.at, b.end, b.vowel);
        }
      }
      if (b.type === "gem" && k + 1 < n2 && al.map[k + 1] >= 0) {
        const v = al.map[k + 1];
        const held = al.units[v];
        const short = vowelsBefore(al, v);
        const final = lastConsonant(al, v) && around(al, v).rest === "";
        if (/^[aeiou]$/.test(short) && !NO_DOUBLE.has(held.cls) && (final || held.double)) {
          add("loan-double", b.at, b.end, kb[k + 1].romaji[0] === "c" ? "t" : kb[k + 1].romaji[0]);
        }
      }
      if (b.type === "long" && k > 0 && kb[k - 1].type === "cv") {
        const hit = longKind(al, k - 1);
        if (hit) add("loan-long", b.at, b.end, hit.detail);
      }
    });
    return out;
  }
  function grouped(list2) {
    const byType = /* @__PURE__ */ new Map();
    for (const r of list2) {
      const g = byType.get(r.type);
      if (g) {
        g.spans.push(r.at);
        if (r.detail && !String(g.detail || "").split(" ").includes(r.detail)) g.detail = g.detail ? `${g.detail} ${r.detail}` : r.detail;
        continue;
      }
      byType.set(r.type, { type: r.type, at: r.at, spans: [r.at], detail: r.detail || null });
    }
    return [...byType.values()];
  }
  function loanRules(token) {
    if (!token || token.kind !== "katakana") return [];
    const surface = String(token.surface || "");
    const reading = String(token.reading || "");
    if (!allKatakana(surface) || surface.length !== reading.length) return [];
    const parts = Array.isArray(token.parts) && token.parts.length ? token.parts : [{ surface, entry: token.entry || null }];
    const list2 = [];
    let offset = 0;
    for (const p of parts) {
      list2.push(...rulesOf(p.surface, p.entry || null, offset));
      offset += p.surface.length;
    }
    return grouped(list2);
  }
  var LOAN_TYPES, TYPE_SET, F_SMALL, LONG_GROUPS, NO_DOUBLE, isVowelLetter, allKatakana;
  var init_loanwords = __esm({
    "js/loanwords.js"() {
      init_kana();
      init_loan_align();
      LOAN_TYPES = Object.freeze([
        "loan-vowel",
        "loan-double",
        "loan-long",
        "loan-f",
        "loan-lr",
        "loan-v",
        "loan-th",
        "loan-si",
        "loan-wasei",
        "loan-short"
      ]);
      TYPE_SET = new Set(LOAN_TYPES);
      F_SMALL = /^フ[ァィェォ]$/;
      LONG_GROUPS = /* @__PURE__ */ new Set(["ee", "ea", "oo", "ai", "ay", "oa", "ue", "ui", "ie", "ei", "ey", "au", "aw", "ou", "ew", "eu"]);
      NO_DOUBLE = /* @__PURE__ */ new Set(["L", "R", "M", "N", "W", "Y", "H"]);
      isVowelLetter = (ch) => !!ch && /[aeiouy]/.test(ch);
      allKatakana = (s) => s.length > 0 && [...s].every(isKatakana2);
    }
  });

  // js/sounds.js
  function detectSounds(token, { final = false, cuts = null, finalWa = false, waAt = [] } = {}) {
    if (!token || SILENT_KINDS.has(token.kind)) return [];
    const reading = String(token.reading || "");
    if (!reading) return [];
    const ctx = context(token, reading, cuts);
    const wa = isFossilWa(token, reading, finalWa);
    const inner = token.kind === "particle" || token.kind === "copula" ? [] : waAt.filter((k) => reading[k] === "\u306F" && !(wa && k === reading.length - 1));
    ctx.waAt = inner;
    const out = [
      ...particleSounds(token, reading),
      ...wa ? [{ type: "fossil-wa", at: [reading.length - 1, reading.length], detail: "wa" }] : [],
      ...inner.map((k) => ({ type: "fossil-wa", at: [k, k + 1], detail: "wa" })),
      ...longVowels(ctx),
      ...smallTsu(ctx),
      ...kanaMarks(ctx),
      ...nAssimilation(ctx),
      ...whispered(token, ctx, final, wa),
      ...foreignSounds(ctx),
      ...bars(ctx),
      ...repeatMarks(token, ctx),
      ...specialReadings(token, ctx),
      ...counterChange(token, reading),
      // Why a katakana word looks the way it does (loanwords.js): its own
      // types, LOAN_TYPES, which the page groups under "Loanword rules".
      ...loanRules(token)
    ];
    return out.sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
  }
  function context(token, reading, given) {
    const bs = beats(reading);
    const offs = [];
    let at = 0;
    for (const b of bs) {
      offs.push(at);
      at += b.length;
    }
    const runs = furiganaRuns(token, reading);
    const script = new Array(reading.length).fill("hira");
    if (runs) {
      for (const r of runs) {
        if (r.ruby) {
          for (let k2 = r.from; k2 < r.to; k2++) script[k2] = "kanji";
          continue;
        }
        let k = r.from;
        for (const ch of r.text) {
          script[k] = isKatakana2(ch) ? "kata" : isHiragana2(ch) ? "hira" : "other";
          k += ch.length;
        }
      }
    } else if (toHira(token.surface || "") === reading) {
      let k = 0;
      for (const ch of String(token.surface)) {
        script[k] = isKatakana2(ch) ? "kata" : "hira";
        k += ch.length;
      }
    }
    const cuts = morphemeCuts(token, reading, runs);
    if (Array.isArray(given)) {
      for (const c of given) if (c > 0 && c < reading.length) cuts.add(c);
    }
    return { reading, bs, offs, runs, script, cuts };
  }
  function furiganaRuns(token, reading) {
    const fg = Array.isArray(token.furigana) ? token.furigana : null;
    if (!fg || !fg.length) return null;
    const runs = [];
    let at = 0;
    let sAt = 0;
    for (const f of fg) {
      const text = String(f && f.text || "");
      const read = f && f.ruby ? String(f.ruby) : toHira(text);
      runs.push({ text, ruby: f && f.ruby ? read : null, whole: !!(f && f.whole), from: at, to: at + read.length, sFrom: sAt });
      at += read.length;
      sAt += text.length;
    }
    return at === reading.length ? runs : null;
  }
  function morphemeCuts(token, reading, runs) {
    const cuts = /* @__PURE__ */ new Set();
    if (runs) for (const r of runs.slice(1)) cuts.add(r.from);
    const chain = Array.isArray(token.chain) ? token.chain : [];
    const pos = String(token.entry && token.entry.p || "").split(/\s+/);
    if (!chain.length && pos.some((p) => VERB_U.test(p)) && reading.endsWith("\u3046")) cuts.add(reading.length - 1);
    if (chain.length) {
      for (let k = 1; k < reading.length; k++) {
        if (reading[k] === "\u3044" && (reading[k - 1] === "\u3066" || reading[k - 1] === "\u3067")) cuts.add(k);
      }
    }
    if (token.kind === "copula") {
      if (reading.startsWith("\u3058\u3083") || reading.startsWith("\u3067\u306F")) cuts.add(2);
    }
    return cuts;
  }
  function particleSounds(token, reading) {
    const out = [];
    const role = token.kind === "particle" || token.kind === "copula";
    for (let k = 0; k < reading.length; k++) {
      const ch = reading[k];
      if (ch === "\u306F" && role) out.push({ type: "particle-wa", at: [k, k + 1], detail: "wa" });
      else if (ch === "\u3078" && token.kind === "particle") out.push({ type: "particle-e", at: [k, k + 1], detail: "e" });
      else if (ch === "\u3092") out.push({ type: "particle-o", at: [k, k + 1], detail: "o" });
    }
    return out;
  }
  function isFossilWa(token, reading, finalWa) {
    if (token.kind === "particle" || token.kind === "copula") return false;
    if (!reading.endsWith("\u306F")) return false;
    const e = token.entry || {};
    return !!finalWa || !!e.w || !!e.x || FOSSIL_WA.has(reading) || FOSSIL_WA.has(toHira(token.base || ""));
  }
  function longVowelAt(ctx, i) {
    const { bs, offs, script, cuts } = ctx;
    const v = vowelOf(bs[i - 1]);
    const b = bs[i];
    if (!v || cuts.has(offs[i])) return null;
    if (b === "\u30FC") return { detail: v + v, mark: "\u30FC" };
    const bv = VOWEL_KANA[b];
    if (!bv) return null;
    if (bv === v) return { detail: v === "o" ? "oo-by-o" : v === "e" ? "ee-by-e" : v + v, mark: b };
    if (v === "e" && bv === "i") return { detail: "ee", mark: b };
    if (v === "o" && bv === "u" && script[offs[i]] !== "kata") return { detail: "oo", mark: b };
    return null;
  }
  function longVowels(ctx) {
    const out = [];
    const { bs, offs } = ctx;
    for (let i = 1; i < bs.length; i++) {
      const hit = longVowelAt(ctx, i);
      if (!hit) continue;
      out.push({ type: "long-vowel", at: [offs[i - 1], offs[i] + bs[i].length], detail: hit.detail, mark: hit.mark });
      i++;
    }
    return out;
  }
  function smallTsu(ctx) {
    const out = [];
    const { bs, offs } = ctx;
    for (let i = 0; i < bs.length; i++) {
      if (bs[i] !== "\u3063") continue;
      const next2 = bs[i + 1];
      const r = next2 && next2 !== "\u3093" && next2 !== "\u30FC" && next2 !== "\u3063" ? beatRomaji(next2, bs[i + 2], bs[i]) : "";
      const detail = /^[bcdfghjkmprstvwyz]/.test(r) ? r.startsWith("ch") ? "t" : r[0] : "stop";
      out.push({ type: "small-tsu", at: [offs[i], offs[i] + 1], detail });
    }
    return out;
  }
  function kanaMarks(ctx) {
    const out = [];
    const { bs, offs } = ctx;
    const marks = { dakuten: [], handakuten: [] };
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.length === 2 && YOUON_SMALL.has(b[1]) && I_ROW.has(b[0])) {
        out.push({ type: "youon", at: [offs[i], offs[i] + 2], detail: beatRomaji(b) });
      }
      for (let k = 0; k < b.length; k++) {
        const ch = b[k];
        const at = [offs[i] + k, offs[i] + k + 1];
        if (VOICED.has(ch)) marks.dakuten.push({ at, plain: ch.normalize("NFD")[0] });
        else if (SEMI_VOICED.has(ch)) marks.handakuten.push({ at, plain: ch.normalize("NFD")[0] });
        if (ch === "\u3062") out.push({ type: "ji-zu", at, detail: "ji" });
        else if (ch === "\u3065") out.push({ type: "ji-zu", at, detail: "zu" });
      }
    }
    for (const [type, list2] of Object.entries(marks)) {
      if (!list2.length) continue;
      out.push({ type, at: list2[0].at, spans: list2.map((m) => m.at), detail: list2.map((m) => m.plain).join("") });
    }
    return out;
  }
  function nAssimilation(ctx) {
    const out = [];
    const { bs, offs } = ctx;
    for (let i = 0; i < bs.length - 1; i++) {
      if (bs[i] !== "\u3093") continue;
      const next2 = bs[i + 1];
      if (next2 === "\u3093" || next2 === "\u3063" || next2 === "\u30FC") continue;
      const r = beatRomaji(next2, bs[i + 2], bs[i]);
      let detail = null;
      if (/^[mbp]/.test(r)) detail = "m";
      else if (/^[kg]/.test(r)) detail = "ng";
      else if (/^[aiueoy]/.test(r)) detail = "apostrophe";
      if (detail) out.push({ type: "n-assimilation", at: [offs[i], offs[i] + 1], detail });
    }
    return out;
  }
  function saidKana(token, reading, wa, waAt) {
    let s = reading;
    if (token.kind === "particle" || token.kind === "copula") s = [...s].map((ch) => PARTICLE_SAID[ch] || ch).join("");
    if (waAt.length) s = [...s].map((ch, k) => waAt.includes(k) ? "\u308F" : ch).join("");
    if (wa) s = s.slice(0, -1) + "\u308F";
    return s;
  }
  function whispered(token, ctx, final, wa) {
    const kana = saidKana(token, ctx.reading, wa, ctx.waAt || []);
    const idx = devoiced(kana, { final });
    if (!idx.length) return [];
    const merged = [...ctx.bs];
    for (let i = 1; i < ctx.bs.length; i++) {
      const hit = longVowelAt(ctx, i);
      if (hit && (hit.detail === "oo" || hit.detail === "ee")) merged[i] = "\u30FC";
      if (hit) i++;
    }
    const saidBeats = beats(kana);
    const detail = devoicedNotation(merged.map((b, i) => b === "\u30FC" ? b : saidBeats[i]).join(""), idx);
    const spans = idx.map((i) => [ctx.offs[i], ctx.offs[i] + ctx.bs[i].length]);
    return [{ type: "devoiced", at: spans[0], spans, detail }];
  }
  function foreignSounds(ctx) {
    const out = [];
    const { bs, offs, script } = ctx;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (script[offs[i]] !== "kata") continue;
      const digraph = b.length === 2 && (SMALL_VOWEL.has(b[1]) || YOUON_SMALL.has(b[1]) && !I_ROW.has(b[0]));
      if (digraph || b.includes("\u3094")) out.push({ type: "foreign-sound", at: [offs[i], offs[i] + b.length], detail: beatRomaji(b) });
    }
    return out;
  }
  function bars(ctx) {
    const out = [];
    const { bs, offs } = ctx;
    for (let i = 1; i < bs.length; i++) {
      if (bs[i] !== "\u30FC") continue;
      const v = vowelOf(bs[i - 1]);
      if (v) out.push({ type: "bar", at: [offs[i], offs[i] + 1], detail: v });
    }
    return out;
  }
  function runAt(runs, s) {
    return runs ? runs.find((r) => s >= r.sFrom && s < r.sFrom + r.text.length) : null;
  }
  function repeatHalf(ruby) {
    if (ruby.length % 2) return -1;
    const h = ruby.length / 2;
    const first = ruby.slice(0, h);
    const second = ruby.slice(h);
    if (second === first) return h;
    if (second.slice(1) === first.slice(1) && second[0].normalize("NFD")[0] === first[0]) return h;
    return -1;
  }
  function repeatMarks(token, ctx) {
    const out = [];
    const surface = String(token.surface || "");
    for (let s = surface.indexOf("\u3005"); s !== -1; s = surface.indexOf("\u3005", s + 1)) {
      const detail = s > 0 ? surface[s - 1] : null;
      const run2 = runAt(ctx.runs, s);
      let at = [0, ctx.reading.length];
      if (run2 && run2.ruby && run2.text === "\u3005") at = [run2.from, run2.to];
      else if (run2 && run2.ruby) {
        const h = run2.text.length === 2 && run2.text[1] === "\u3005" ? repeatHalf(run2.ruby) : -1;
        at = h > 0 ? [run2.from + h, run2.to] : [run2.from, run2.to];
      }
      out.push({ type: "repeat-mark", at, detail });
    }
    return out;
  }
  function nonKanaRuns(surface) {
    const out = [];
    let k = 0;
    let cur = null;
    for (const ch of surface) {
      if (!isKatakana2(ch) && !isHiragana2(ch)) {
        if (!cur) {
          cur = { start: k, text: "" };
          out.push(cur);
        }
        cur.text += ch;
      } else cur = null;
      k += ch.length;
    }
    return out;
  }
  function fPartsFor(f, runs) {
    if (typeof f !== "string" || !f) return runs.map(() => null);
    const parts = f.split(";");
    if (parts.length === runs.length) return parts;
    const multi = runs.filter((r) => [...r.text].length > 1);
    if (parts.length !== multi.length) return runs.map(() => null);
    let k = 0;
    return runs.map((r) => [...r.text].length > 1 ? parts[k++] : null);
  }
  function specialReadings(token, ctx) {
    if (!ctx.runs) return [];
    const others = nonKanaRuns(String(token.surface || ""));
    const parts = fPartsFor(token.entry && token.entry.f, others);
    const out = [];
    for (const run2 of ctx.runs) {
      if (!run2.ruby || [...run2.text].filter(isKanji2).length < 2) continue;
      const idx = others.findIndex((r) => r.start === run2.sFrom && r.text === run2.text);
      if (run2.whole || idx >= 0 && parts[idx] === "*") out.push({ type: "special-reading", at: [run2.from, run2.to], detail: run2.text });
    }
    return out;
  }
  function counterChange(token, reading) {
    return token.counterChange ? [{ type: "counter-change", at: [0, reading.length], detail: null }] : [];
  }
  var SOUND_TYPES, SILENT_KINDS, FOSSIL_WA, VOWEL_KANA, I_ROW, YOUON_SMALL, SMALL_VOWEL, VOICED, SEMI_VOICED, PARTICLE_SAID, VERB_U;
  var init_sounds = __esm({
    "js/sounds.js"() {
      init_kana();
      init_loanwords();
      SOUND_TYPES = Object.freeze([
        "particle-wa",
        "particle-e",
        "particle-o",
        "fossil-wa",
        "long-vowel",
        "small-tsu",
        "youon",
        "dakuten",
        "handakuten",
        "n-assimilation",
        "devoiced",
        "ji-zu",
        "foreign-sound",
        "bar",
        "repeat-mark",
        "special-reading",
        "counter-change"
      ]);
      SILENT_KINDS = /* @__PURE__ */ new Set(["punct", "space", "latin", "newline"]);
      FOSSIL_WA = /* @__PURE__ */ new Set(["\u3053\u3093\u306B\u3061\u306F", "\u3053\u3093\u3070\u3093\u306F"]);
      VOWEL_KANA = Object.freeze({ "\u3042": "a", "\u3044": "i", "\u3046": "u", "\u3048": "e", "\u304A": "o" });
      I_ROW = /* @__PURE__ */ new Set([..."\u304D\u3057\u3061\u306B\u3072\u307F\u308A\u304E\u3058\u3062\u3073\u3074"]);
      YOUON_SMALL = /* @__PURE__ */ new Set([..."\u3083\u3085\u3087"]);
      SMALL_VOWEL = /* @__PURE__ */ new Set([..."\u3041\u3043\u3045\u3047\u3049"]);
      VOICED = /* @__PURE__ */ new Set([..."\u304C\u304E\u3050\u3052\u3054\u3056\u3058\u305A\u305C\u305E\u3060\u3062\u3065\u3067\u3069\u3070\u3073\u3076\u3079\u307C\u3094"]);
      SEMI_VOICED = /* @__PURE__ */ new Set([..."\u3071\u3074\u3077\u307A\u307D"]);
      PARTICLE_SAID = Object.freeze({ "\u306F": "\u308F", "\u3078": "\u3048", "\u3092": "\u304A" });
      VERB_U = /^v5u(-s)?$/;
    }
  });

  // js/grammar.js
  function stepIds(step) {
    if (!step) return [];
    const rule = step.rule;
    if (rule && Object.prototype.hasOwnProperty.call(RULE_TO_GRAMMAR, rule)) return asList(RULE_TO_GRAMMAR[rule]);
    const label = step.label;
    if (label && Object.prototype.hasOwnProperty.call(LABEL_TO_GRAMMAR, label)) return asList(LABEL_TO_GRAMMAR[label]);
    if (rule && KNOWN.has(rule)) return [rule];
    return [];
  }
  function chainGrammar(chain) {
    const steps = (Array.isArray(chain) ? chain : []).map(stepIds);
    const layers = steps.map((list2, k) => list2.filter((id) => {
      if (id === "te-form") return k === 0;
      if (id === "past") return !steps.slice(0, k).some((s) => s.includes("cond-tara") || s.includes("tari"));
      if (id === "negative" && k > 0) {
        return !steps[k - 1].includes("naide") && !steps[k - 1].includes("adj-past") && !steps[k - 1].includes("must");
      }
      return true;
    }));
    steps.forEach((list2, k) => {
      if (k > 0 && list2.includes("negative") && steps[k - 1].includes("adj-past")) {
        layers[k - 1] = layers[k - 1].map((id) => id === "adj-past" ? "past-negative" : id);
      }
    });
    const ids = layers.reverse().flat();
    const polite = ids.some((id) => POLITE_FAMILY.has(id));
    return [...new Set(ids.filter((id) => !(id === "polite" && polite)))];
  }
  function isPredicate(t3) {
    if (!t3) return false;
    if (t3.kind === "copula" || t3.kind === "inflected") return true;
    return t3.kind === "word" && (isVerb(t3) || isAdjI(t3));
  }
  function isNoun(t3) {
    if (!t3) return false;
    if (["katakana", "name", "number", "latin"].includes(t3.kind)) return true;
    return t3.kind === "word" && !isVerb(t3) && !isAdjI(t3);
  }
  function isPlainNonPast(t3) {
    if (!t3) return false;
    if (isDictionaryVerb(t3)) return true;
    if (t3.surface === "\u306A\u3044" && (t3.kind === "word" || t3.kind === "inflected")) return true;
    return chainOf(t3).length > 0 && PLAIN_NONPAST.has(surfaceId(t3));
  }
  function isEnd(t3) {
    return !t3 || t3.kind === "newline" || t3.kind === "punct" && SENTENCE_END.has(String(t3.surface).slice(-1));
  }
  function neighbour(tokens, i, dir) {
    for (let k = i + dir; k >= 0 && k < tokens.length; k += dir) {
      if (tokens[k] && tokens[k].kind !== "space") return k;
    }
    return -1;
  }
  function annotateGrammar(tokens) {
    if (!Array.isArray(tokens)) return tokens;
    for (const t3 of tokens) if (t3) t3.grammar = [];
    const add = (k, id, at2) => {
      const t3 = tokens[k];
      if (!t3 || !KNOWN.has(id)) return;
      const key = at2 ? `${id}@${at2[0]}:${at2[1]}` : id;
      if (t3.grammar.some((g) => (g.at ? `${g.id}@${g.at[0]}:${g.at[1]}` : g.id) === key)) return;
      t3.grammar.push(at2 ? { id, at: at2 } : { id });
    };
    const span = (a, b, id) => {
      const at2 = [a, b + 1];
      for (let k = a; k <= b; k++) add(k, id, at2);
    };
    const at = (k) => k >= 0 ? tokens[k] : null;
    tokens.forEach((t3, i) => {
      if (!t3) return;
      const p = neighbour(tokens, i, -1);
      const n2 = neighbour(tokens, i, 1);
      if (t3.kind === "particle") particle(t3, i, p, n2, at, add, span);
      else if (t3.kind === "copula") copula(t3, i, p, n2, at, add);
      if (t3.kind !== "particle" && t3.kind !== "copula") for (const id of chainGrammar(chainOf(t3))) add(i, politeCommand(t3, id));
      pairs(t3, i, n2, at, span);
    });
    return tokens;
  }
  function politeCommand(t3, id) {
    return id === "imperative" && NASARU.has(baseOf(t3)) ? "nasai" : id;
  }
  function particle(t3, i, p, n2, at, add, span) {
    const s = String(t3.surface || "");
    const prev = at(p);
    const next2 = at(n2);
    if (s === "\u3067" && isNaAdjective(prev)) return add(i, "de-and");
    if (PARTICLE_IDS[s]) return add(i, PARTICLE_IDS[s]);
    if (PARTICLE_PAIRS2[s]) return PARTICLE_PAIRS2[s].forEach((id) => add(i, id));
    if (s === "\u304C") {
      if (prev && !isPredicate(prev) && prev.kind !== "punct" && prev.kind !== "newline") add(i, "subject-ga");
      return;
    }
    if (s === "\u304B") {
      if (isNoun(prev) && isNoun(next2)) return;
      if (prev && INTERROGATIVES.has(baseOf(prev)) && !isEnd(next2)) return;
      return add(i, "ka-question");
    }
    if (s === "\u3068") {
      if (next2 && QUOTE_VERBS.has(baseOf(next2)) || prev && QUOTE_CLOSE.has(String(prev.surface).slice(-1))) return add(i, "to-quote");
      if (isPlainNonPast(prev)) return span(p, i, "cond-to");
      if (isNoun(prev) || prev && prev.kind === "particle") add(i, "to-and");
      return;
    }
    if (s === "\u306A") {
      if (isDictionaryVerb(prev)) add(i, "na-prohibition");
      return;
    }
    if (s === "\u306A\u3089") add(i, isPredicate(prev) ? "cond-nara" : "nara");
  }
  function copula(t3, i, p, n2, at, add) {
    let s = String(t3.surface || "");
    if (s === "\u306A\u3089") return add(i, isPredicate(at(p)) ? "cond-nara" : "nara");
    const tail = { "\u304B": "ka-question", "\u306D": "ne", "\u3088": "yo" }[s.slice(-1)];
    if (tail && !COPULA_IDS[s] && COPULA_IDS[s.slice(0, -1)]) {
      add(i, tail);
      s = s.slice(0, -1);
    }
    if (COPULA_IDS[s]) add(i, COPULA_IDS[s]);
  }
  function pairs(t3, i, n2, at, span) {
    const next2 = at(n2);
    if (!next2) return;
    const top = surfaceId(t3);
    obligation(t3, i, n2, at, span);
    if (top === "te-form") {
      if (KUDASAI.has(String(next2.surface)) || KUDASAI.has(baseOf(next2))) span(i, n2, "te-kudasai");
      else if (IRU.has(String(next2.base || ""))) span(i, n2, "te-iru");
    }
    if (next2.kind === "particle" && next2.surface === "\u304B") {
      const favour = FAVOUR_VERBS.has(baseOf(t3));
      if (top === "polite-negative" && !favour && isEnd(at(nextAfter(at, n2)))) span(i, n2, "invitation");
      if (top === "lets") span(i, n2, "offer");
    }
  }
  function obligation(t3, i, n2, at, span) {
    const s = String(t3.surface || "");
    const next2 = at(n2);
    if (!chainOf(t3).length || !next2) return;
    if (s.endsWith("\u306A\u3051\u308C\u3070") && isMustTail(next2)) return span(i, n2, "must");
    const n22 = nextAfter(at, n2);
    const third = n22 >= 0 ? at(n22) : null;
    if (!isMustTail(third) || next2.kind !== "particle") return;
    if (s.endsWith("\u306A\u304F\u3066") && next2.surface === "\u306F" || s.endsWith("\u306A\u3044") && next2.surface === "\u3068") span(i, n22, "must");
  }
  function nextAfter(at, n2) {
    for (let k = n2 + 1; ; k++) {
      const t3 = at(k);
      if (t3 === null || t3 === void 0) return -1;
      if (t3.kind !== "space") return k;
    }
  }
  var GRAMMAR_IDS, PARTICLE_IDS, PARTICLE_PAIRS2, COPULA_IDS, RULE_TO_GRAMMAR, LABEL_TO_GRAMMAR, KNOWN, POLITE_FAMILY, asList, SENTENCE_END, QUOTE_CLOSE, QUOTE_VERBS, INTERROGATIVES, PLAIN_NONPAST, KUDASAI, IRU, FAVOUR_VERBS, tags, isVerb, isAdjI, chainOf, surfaceId, baseOf, isNaAdjective, isDictionaryVerb, NASARU, MUST_TAIL, isMustTail;
  var init_grammar = __esm({
    "js/grammar.js"() {
      GRAMMAR_IDS = Object.freeze([
        // particles
        "topic-wa",
        "subject-ga",
        "object-o",
        "direction-e",
        "ni",
        "de",
        "de-and",
        "to-and",
        "to-quote",
        "mo",
        "no",
        "ka-question",
        "ne",
        "yo",
        "kara",
        "made",
        "yori",
        "ya",
        "kedo",
        "node",
        "dake",
        "shika",
        "nado",
        "na-prohibition",
        // the copula
        "desu",
        "deshita",
        "deshou",
        "darou",
        "da",
        "datta",
        "ja-nai",
        "ja-arimasen",
        "ja-nakatta",
        "ja-arimasen-deshita",
        "nara",
        // endings, from the deinflection chain
        "polite",
        "polite-past",
        "polite-negative",
        "polite-past-negative",
        "lets",
        "polite-te",
        "te-form",
        "te-iru",
        "past",
        "negative",
        "past-negative",
        "want",
        "potential",
        "passive",
        "causative",
        "volitional",
        "imperative",
        "cond-ba",
        "cond-tara",
        "cond-nara",
        "adj-negative",
        "adj-past",
        "adj-te",
        "adverbial",
        "tari",
        "nagara",
        "nasai",
        "sou",
        "sugiru",
        "yasui",
        "nikui",
        "te-shimau",
        "te-miru",
        "naide",
        "must",
        // patterns across two tokens
        "te-kudasai",
        "cond-to",
        "invitation",
        "offer"
      ]);
      PARTICLE_IDS = Object.freeze({
        "\u306F": "topic-wa",
        "\u3092": "object-o",
        "\u3078": "direction-e",
        "\u306B": "ni",
        "\u3067": "de",
        "\u3082": "mo",
        "\u306E": "no",
        "\u306D": "ne",
        "\u306D\u3048": "ne",
        "\u3088": "yo",
        "\u304B\u3089": "kara",
        "\u307E\u3067": "made",
        "\u3088\u308A": "yori",
        "\u3084": "ya",
        "\u3051\u3069": "kedo",
        "\u3051\u308C\u3069": "kedo",
        "\u3051\u308C\u3069\u3082": "kedo",
        "\u306E\u3067": "node",
        "\u3060\u3051": "dake",
        "\u3057\u304B": "shika",
        "\u306A\u3069": "nado"
      });
      PARTICLE_PAIRS2 = Object.freeze({
        "\u306B\u306F": ["ni", "topic-wa"],
        "\u3067\u306F": ["de", "topic-wa"],
        "\u3078\u306F": ["direction-e", "topic-wa"],
        "\u306B\u3082": ["ni", "mo"],
        "\u3078\u3082": ["direction-e", "mo"],
        "\u304B\u3089\u306F": ["kara", "topic-wa"],
        "\u307E\u3067\u306F": ["made", "topic-wa"],
        "\u304B\u3089\u3082": ["kara", "mo"],
        "\u3088\u306D": ["yo", "ne"]
      });
      COPULA_IDS = Object.freeze({
        "\u3067\u3059": "desu",
        "\u3067\u3057\u305F": "deshita",
        "\u3067\u3057\u3087\u3046": "deshou",
        "\u3060\u308D\u3046": "darou",
        "\u3060": "da",
        "\u3060\u3063\u305F": "datta",
        "\u3060\u3063\u305F\u3089": "cond-tara",
        "\u3067\u3057\u305F\u3089": "cond-tara",
        "\u3058\u3083\u306A\u3044": "ja-nai",
        "\u3067\u306F\u306A\u3044": "ja-nai",
        "\u3058\u3083\u3042\u308A\u307E\u305B\u3093": "ja-arimasen",
        "\u3067\u306F\u3042\u308A\u307E\u305B\u3093": "ja-arimasen",
        "\u3058\u3083\u306A\u3044\u3067\u3059": "ja-arimasen",
        "\u3067\u306F\u306A\u3044\u3067\u3059": "ja-arimasen",
        "\u3058\u3083\u306A\u304B\u3063\u305F": "ja-nakatta",
        "\u3067\u306F\u306A\u304B\u3063\u305F": "ja-nakatta",
        "\u3058\u3083\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F": "ja-arimasen-deshita",
        "\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F": "ja-arimasen-deshita",
        "\u3058\u3083\u306A\u304B\u3063\u305F\u3067\u3059": "ja-arimasen-deshita",
        "\u3067\u306F\u306A\u304B\u3063\u305F\u3067\u3059": "ja-arimasen-deshita"
      });
      RULE_TO_GRAMMAR = Object.freeze({
        "masu": "polite",
        // 'polite ending'; prototype 'polite ending ます'
        "masu-past": "polite-past",
        // 'polite past'
        "masu-negative": "polite-negative",
        // 'polite negative'
        "masu-past-negative": "polite-past-negative",
        // 'polite past negative'
        "masu-volitional": "lets",
        // "polite volitional (let's)"
        "masu-te": "polite-te",
        // 'polite te-form'
        "stem": null,
        // 'stem', 'stem (-aru verb)'; prototype 'stem (honorific -aru verb)'
        "tai": "want",
        // 'want to'; prototype 'want to (desire)'
        "nagara": "nagara",
        // 'while doing'
        "nasai": "nasai",
        // 'polite command'
        "sou": "sou",
        // 'looks about to' (not in the prototype)
        "adj-sou": "sou",
        // 'looks (sou)' (not in the prototype)
        "sugiru": "sugiru",
        // 'too much' (not in the prototype)
        "adj-sugiru": "sugiru",
        // 'too (sugiru)' (not in the prototype)
        "yasui": "yasui",
        // 'easy to' (not in the prototype)
        "nikui": "nikui",
        // 'hard to' (not in the prototype)
        "te": "te-form",
        // 'te-form'
        "adj-te": "adj-te",
        // 'te-form of an adjective'
        "ta": "past",
        // 'past'; prototype 'past (ta-form)'
        "adj-past": "adj-past",
        // 'past of an adjective'
        "tari": "tari",
        // 'listing (tari)'
        "tara": "cond-tara",
        // 'conditional (tara)'
        "te-iru": "te-iru",
        // 'progressive (te iru)'
        "te-iru-casual": "te-iru",
        // 'progressive, casual (teru)'
        "te-shimau-casual": "te-shimau",
        // 'done, casual (chau)', 'done, casual (jau)' (not in the prototype)
        "te-shimau": "te-shimau",
        // 'done (te shimau)' (not in the prototype)
        "te-miru": "te-miru",
        // 'try doing (te miru)' (not in the prototype)
        "must-casual": "must",
        // 'must, casual (nakucha)', 'must, casual (nakya)' (not in the prototype)
        "negative": "negative",
        // 'negative'
        "negative-te": "naide",
        // 'without doing' (not in the prototype)
        "adj-negative": "adj-negative",
        // 'negative of an adjective'
        "adj-adverb": "adverbial",
        // 'adverb (ku)'; prototype 'adverbial (ku)'
        "adj-ba": "cond-ba",
        // 'conditional of an adjective'; prototype 'conditional (ba) of an adjective'
        "potential": "potential",
        // 'potential'
        "potential-passive": ["potential", "passive"],
        // 'potential or passive'
        "potential-colloquial": "potential",
        // 'potential, colloquial (ra dropped)'
        "passive": "passive",
        // 'passive'
        "causative": "causative",
        // 'causative'
        "volitional": "volitional",
        // "volitional (let's)"; prototype also "volitional (let's / I will)"
        "imperative": "imperative",
        // 'command'
        "ba": "cond-ba"
        // 'conditional (ba)'
      });
      LABEL_TO_GRAMMAR = Object.freeze({
        "polite ending": "polite",
        "polite ending \u307E\u3059": "polite",
        "polite past": "polite-past",
        "polite negative": "polite-negative",
        "polite past negative": "polite-past-negative",
        "polite volitional (let's)": "lets",
        "polite te-form": "polite-te",
        "stem": null,
        "stem (-aru verb)": null,
        "stem (honorific -aru verb)": null,
        "want to": "want",
        "want to (desire)": "want",
        "while doing": "nagara",
        "polite command": "nasai",
        "looks about to": "sou",
        "looks (sou)": "sou",
        "too much": "sugiru",
        "too (sugiru)": "sugiru",
        "easy to": "yasui",
        "hard to": "nikui",
        "te-form": "te-form",
        "te-form of an adjective": "adj-te",
        "past": "past",
        "past (ta-form)": "past",
        "past of an adjective": "adj-past",
        "listing (tari)": "tari",
        "conditional (tara)": "cond-tara",
        "progressive (te iru)": "te-iru",
        "progressive, casual (teru)": "te-iru",
        "done, casual (chau)": "te-shimau",
        "done, casual (jau)": "te-shimau",
        "done (te shimau)": "te-shimau",
        "try doing (te miru)": "te-miru",
        "must, casual (nakucha)": "must",
        "must, casual (nakya)": "must",
        "negative": "negative",
        "without doing": "naide",
        "negative of an adjective": "adj-negative",
        "adverb (ku)": "adverbial",
        "adverbial (ku)": "adverbial",
        "conditional of an adjective": "cond-ba",
        "conditional (ba) of an adjective": "cond-ba",
        "potential": "potential",
        "potential or passive": ["potential", "passive"],
        "potential, colloquial (ra dropped)": "potential",
        "passive": "passive",
        "causative": "causative",
        "volitional (let's)": "volitional",
        "volitional (let's / I will)": "volitional",
        "volitional": "volitional",
        "command": "imperative",
        "conditional (ba)": "cond-ba"
      });
      KNOWN = new Set(GRAMMAR_IDS);
      POLITE_FAMILY = /* @__PURE__ */ new Set(["polite-past", "polite-negative", "polite-past-negative", "lets", "polite-te"]);
      asList = (v) => v === null || v === void 0 ? [] : Array.isArray(v) ? v : [v];
      SENTENCE_END = /* @__PURE__ */ new Set([..."\u3002\uFF1F\uFF01?!\u300D\u300F\u2026\uFF0E."]);
      QUOTE_CLOSE = /* @__PURE__ */ new Set([..."\u300D\u300F"]);
      QUOTE_VERBS = /* @__PURE__ */ new Set([
        "\u8A00\u3046",
        "\u3044\u3046",
        "\u4E91\u3046",
        "\u601D\u3046",
        "\u304A\u3082\u3046",
        "\u8003\u3048\u308B",
        "\u304B\u3093\u304C\u3048\u308B",
        "\u805E\u304F",
        "\u304D\u304F",
        "\u7B54\u3048\u308B",
        "\u3053\u305F\u3048\u308B",
        "\u4F1D\u3048\u308B",
        "\u3064\u305F\u3048\u308B",
        "\u547C\u3076",
        "\u3088\u3076",
        "\u7533\u3059",
        "\u3082\u3046\u3059",
        "\u304A\u3063\u3057\u3083\u308B",
        "\u4EF0\u308B",
        "\u611F\u3058\u308B",
        "\u304B\u3093\u3058\u308B"
      ]);
      INTERROGATIVES = /* @__PURE__ */ new Set([
        "\u306A\u306B",
        "\u306A\u3093",
        "\u4F55",
        "\u3060\u308C",
        "\u8AB0",
        "\u3069\u3053",
        "\u4F55\u51E6",
        "\u3044\u3064",
        "\u3069\u308C",
        "\u3069\u3061\u3089",
        "\u3069\u3046",
        "\u3069\u306E"
      ]);
      PLAIN_NONPAST = /* @__PURE__ */ new Set(["negative", "potential", "passive", "causative", "te-iru", "adj-negative"]);
      KUDASAI = /* @__PURE__ */ new Set(["\u304F\u3060\u3055\u3044", "\u4E0B\u3055\u3044", "\u304F\u3060\u3055\u308B", "\u4E0B\u3055\u308B"]);
      IRU = /* @__PURE__ */ new Set(["\u3044\u308B", "\u5C45\u308B"]);
      FAVOUR_VERBS = /* @__PURE__ */ new Set(["\u304F\u308C\u308B", "\u5449\u308C\u308B", "\u3082\u3089\u3046", "\u8CB0\u3046", "\u3044\u305F\u3060\u304F", "\u9802\u304F", "\u304F\u3060\u3055\u308B", "\u4E0B\u3055\u308B"]);
      tags = (t3) => String(t3 && t3.entry && t3.entry.p || "").split(/\s+/).filter(Boolean);
      isVerb = (t3) => tags(t3).some((p) => p.startsWith("v") && p !== "vs" && p !== "vt" && p !== "vi");
      isAdjI = (t3) => tags(t3).some((p) => p === "adj-i" || p === "adj-ix");
      chainOf = (t3) => t3 && Array.isArray(t3.chain) ? t3.chain : [];
      surfaceId = (t3) => {
        const ids = chainGrammar(chainOf(t3));
        return ids[ids.length - 1] || null;
      };
      baseOf = (t3) => String(t3 && (t3.base || t3.surface) || "");
      isNaAdjective = (t3) => !!t3 && t3.kind === "word" && tags(t3).includes("adj-na");
      isDictionaryVerb = (t3) => !!t3 && (t3.kind === "word" || t3.kind === "inflected") && isVerb(t3) && !chainOf(t3).length;
      NASARU = /* @__PURE__ */ new Set(["\u306A\u3055\u308B", "\u70BA\u3055\u308B"]);
      MUST_TAIL = /^(いけな|いけま|ならな|なりま)/;
      isMustTail = (t3) => !!t3 && (t3.kind === "word" || t3.kind === "inflected") && MUST_TAIL.test(String(t3.surface));
    }
  });

  // js/title-names.js
  function titleNames(tokens, separator, following) {
    if (!separator || !/^[☆★]$/u.test(separator.text) || !following || following.type !== "jp" || !/^[\u30A1-\u30FA]/u.test(following.text)) return tokens;
    const word = tokens.at(-2);
    const question3 = tokens.at(-1);
    if (!word || word.kind !== "word" || !/^\p{Script=Hiragana}{2,7}$/u.test(word.surface) || !String(word.entry?.p || "").split(" ").includes("n") || question3?.kind !== "particle" || question3.surface !== "\u304B") return tokens;
    const before = tokens.at(-3);
    if (before && (before.kind !== "word" || !/^\p{Script=Han}+$/u.test(before.surface) || !String(before.entry?.p || "").split(" ").includes("n"))) return tokens;
    const surface = word.surface + question3.surface;
    return [...tokens.slice(0, -2), {
      kind: "name",
      surface,
      start: word.start,
      end: question3.end,
      base: surface,
      reading: surface,
      entry: null,
      alts: 0,
      chain: [],
      confidence: "guess",
      aid: { cuts: [], parts: null }
    }];
  }
  var init_title_names = __esm({
    "js/title-names.js"() {
    }
  });

  // js/compounds.js
  function joinable(t3) {
    return !!t3 && t3.kind === "katakana" && allKatakana2(t3.surface);
  }
  function partOf(t3) {
    const e = t3.entry || null;
    return {
      surface: t3.surface,
      reading: t3.reading,
      gloss: e && Array.isArray(e.g) && e.g[0] ? e.g[0] : null,
      tier: e ? e.tier === 2 ? 2 : 1 : null,
      entry: e
    };
  }
  function compound(group) {
    const parts = group.map(partOf);
    const reading = parts.map((p) => p.reading).join("");
    const cuts = [];
    let at = 0;
    for (const p of parts.slice(0, -1)) {
      at += p.reading.length;
      cuts.push(at);
    }
    const covered = parts.every((p) => p.entry);
    const first = group[0];
    const last = group[group.length - 1];
    const surface = group.map((t3) => t3.surface).join("");
    return {
      kind: "katakana",
      surface,
      start: first.start,
      end: last.end,
      base: surface,
      reading,
      entry: null,
      alts: 0,
      chain: [],
      confidence: covered ? "rule" : "guess",
      parts,
      gloss: parts.every((p) => p.gloss) ? parts.map((p) => p.gloss).join(" + ") : null,
      // What analyze.js's enrich() reads; nothing the page keeps.
      aid: { f: void 0, cuts, parts: null, v5u: false, finalWa: false, words: null, waAt: [] }
    };
  }
  function joinKatakana(tokens) {
    const out = [];
    for (let k = 0; k < tokens.length; k++) {
      let m = k + 1;
      if (joinable(tokens[k])) {
        while (m < tokens.length && joinable(tokens[m]) && tokens[m].start === tokens[m - 1].end) m++;
      }
      out.push(m - k > 1 ? compound(tokens.slice(k, m)) : tokens[k]);
      k = m - 1;
    }
    return out;
  }
  var allKatakana2;
  var init_compounds = __esm({
    "js/compounds.js"() {
      init_kana();
      allKatakana2 = (s) => s.length > 0 && [...s].every(isKatakana2);
    }
  });

  // js/usage-notes.js
  function usageFor(token) {
    const reading = token.reading || token.r?.[0] || "";
    if (!["\u3088\u308D\u3057\u304F\u304A\u306D\u304C\u3044\u3057\u307E\u3059", "\u3088\u308D\u3057\u304F\u304A\u306D\u304C\u3044\u3044\u305F\u3057\u307E\u3059"].includes(reading)) return null;
    return {
      en: {
        meanings: ["Thank you in advance for your help (a request).", "I look forward to working with you (starting together).", "Nice to meet you (an introduction)."],
        note: "A polite request for goodwill or cooperation. Choose the English wording from the situation; it is not normally a request to remember someone."
      },
      es: {
        meanings: ["Gracias de antemano por tu ayuda (al pedir un favor).", "Espero que trabajemos bien juntos (al comenzar).", "Mucho gusto (al presentarse)."],
        note: "Pide buena disposici\xF3n o colaboraci\xF3n con cortes\xEDa. La traducci\xF3n depende de la situaci\xF3n; normalmente no pide que alguien te recuerde."
      }
    };
  }
  var init_usage_notes = __esm({
    "js/usage-notes.js"() {
    }
  });

  // js/sounds-like.js
  function groupsOfKana(kana) {
    const kb = kataBeats(kana);
    if (kb.some((b) => b.type === "other")) return [];
    const first = kb.find((b) => b.type === "cv" || b.type === "nasal");
    return first ? [...GROUPS_FOR[first.cls] || []] : [];
  }
  function beatPiece(b) {
    if (b.type === "long") return "-";
    if (b.type === "gem") return "Q";
    return b.vowel || "";
  }
  function pieces(al) {
    const { kb, map, units } = al;
    const word = al.words[0];
    const matched = [];
    map.forEach((u, k) => {
      if (u >= 0) matched.push([k, u]);
    });
    if (!matched.length) return [];
    const out = [[`^${word.slice(0, units[matched[0][1]].from)}`, kb.slice(0, matched[0][0]).map(beatPiece).join("")]];
    matched.forEach(([k, u], n2) => {
      const next2 = matched[n2 + 1];
      const eng = word.slice(units[u].to, next2 ? units[next2[1]].from : word.length) + (next2 ? "" : "$");
      out.push([eng, (kb[k].vowel || "") + kb.slice(k + 1, next2 ? next2[0] : kb.length).map(beatPiece).join("")]);
      out.push([`#${word.slice(units[u].from, units[u].to)}`, kb[k].cls || "V"]);
    });
    return out;
  }
  function lineUp2(kana, word, kb = kataBeats(kana)) {
    const al = alignFull(kb, { words: [word], text: word });
    return al ? { word, cost: al.cost, pieces: pieces({ ...al, kb }) } : null;
  }
  function coarseOf(eng) {
    if (eng[0] === "#") return `#${eng.slice(1, 3)}`;
    return (eng[0] === "^" ? "^" : "") + (eng.replace(/[^aeiouy]/g, "")[0] || "") + (eng.includes("r") ? "r" : "") + (eng.endsWith("$") ? "$" : "");
  }
  function createModel(counts2, p = LIKE) {
    const fine = /* @__PURE__ */ new Map();
    const coarse = /* @__PURE__ */ new Map();
    const add = (m, a, b, n2) => {
      if (!m.has(a)) m.set(a, { total: 0, by: /* @__PURE__ */ new Map() });
      const x = m.get(a);
      x.total += n2;
      x.by.set(b, (x.by.get(b) || 0) + n2);
    };
    for (const [eng, row] of Object.entries(counts2 || {})) {
      for (const [kana, n2] of Object.entries(row)) {
        add(fine, eng, kana, n2);
        add(coarse, coarseOf(eng), kana, n2);
      }
    }
    const memo = /* @__PURE__ */ new Map();
    return (eng, kana) => {
      const id = `${eng}\0${kana}`;
      if (!memo.has(id)) memo.set(id, odds(eng, kana));
      return memo.get(id);
    };
    function odds(eng, kana) {
      const c = coarse.get(coarseOf(eng));
      const back = c ? ((c.by.get(kana) || 0) + p.floor) / (c.total + 1) : p.floor / 10;
      const f = fine.get(eng);
      if (!f) return Math.log(back);
      return Math.log(((f.by.get(kana) || 0) + p.smooth * back) / (f.total + p.smooth));
    }
  }
  function rank(kana, words, logp, p = LIKE) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const kb = kataBeats(kana);
    for (const [word, n2] of words) {
      if (seen.has(word)) continue;
      seen.add(word);
      const al = lineUp2(kana, word, kb);
      if (!al) continue;
      const odds = al.pieces.map(([e, k]) => logp(e, k));
      const lp = odds.reduce((s, x) => s + x, 0);
      out.push({ word, lp, worst: Math.min(...odds), score: lp - p.loose * al.cost + p.common * Math.log(Math.max(n2, 1)) });
    }
    return out.sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : 1));
  }
  function decide(kana, ranked, p = LIKE) {
    const n2 = [...kana].length;
    if (n2 < p.minKana || !ranked.length) return null;
    const [top, next2] = ranked;
    if (next2 && top.score - next2.score < (n2 < p.long ? p.shortMargin : p.margin)) return null;
    if (top.worst < p.worst) return null;
    return top.word;
  }
  function soundsLike(kana, words, logp) {
    if ([...kana].length < LIKE.minKana) return null;
    return decide(kana, rank(kana, words, logp));
  }
  function modelFor(counts2) {
    if (!MODELS.has(counts2)) MODELS.set(counts2, createModel(counts2));
    return MODELS.get(counts2);
  }
  async function guessParts(tokens, dict2) {
    if (!dict2 || typeof dict2.needLike !== "function") return;
    const parts = tokens.flatMap((t3) => Array.isArray(t3.parts) ? t3.parts : []).filter((p) => !p.entry && [...p.surface].length >= LIKE.minKana);
    const groups = new Set(parts.flatMap((p) => groupsOfKana(p.surface)));
    if (!groups.size) return;
    try {
      await dict2.needLike(groups);
    } catch {
      return;
    }
    const data = dict2.like();
    if (!data) return;
    const logp = modelFor(data.pieces);
    for (const p of parts) {
      const word = soundsLike(p.surface, groupsOfKana(p.surface).flatMap((g) => data.words(g)), logp);
      if (word) p.soundsLike = word;
    }
  }
  var LIKE, GROUPS_FOR, MODELS;
  var init_sounds_like = __esm({
    "js/sounds-like.js"() {
      init_loan_align();
      LIKE = Object.freeze({
        minKana: 4,
        long: 6,
        shortMargin: 4,
        margin: 1,
        worst: -5,
        loose: 3,
        common: 1,
        smooth: 1,
        floor: 0.01
      });
      GROUPS_FOR = (() => {
        const out = {};
        for (const [eng, kata] of Object.entries(MATCH)) {
          for (const k of Object.keys(kata)) (out[k] || (out[k] = [])).push(eng);
        }
        (out.TS || (out.TS = [])).push("T");
        for (const k of Object.keys(out)) out[k] = Object.freeze([...new Set(out[k])].sort());
        return Object.freeze(out);
      })();
      MODELS = /* @__PURE__ */ new WeakMap();
    }
  });

  // js/spanish.js
  function withEs(obj, es) {
    return es && typeof es === "object" && Object.keys(es).length ? { ...obj, es } : obj;
  }
  function nameTypesEs(nt) {
    const g = [...new Set(nt.filter((t3) => NAME_TYPES[t3]).map((t3) => NAME_TYPES[t3].es))];
    return g.length ? { g } : null;
  }
  async function addSpanish(result, dict2) {
    if (!dict2 || typeof dict2.needEs !== "function") return result;
    const records = /* @__PURE__ */ new Set();
    const alsoOf = /* @__PURE__ */ new Map();
    for (const t3 of result.tokens) {
      const e = t3.entry;
      if (e) {
        records.add(e);
        if (e.also) {
          const w = wordsSpelled(t3.surface, dict2)[0];
          if (w) {
            alsoOf.set(e, w);
            records.add(w);
          }
        }
      }
      for (const p of t3.parts || []) if (p.entry) records.add(p.entry);
    }
    const chars3 = result.kanji.map((k) => k.char);
    const [, kanjiEs] = await Promise.all([
      dict2.needEs([...records]),
      chars3.length ? dict2.kanjiEs(chars3) : Promise.resolve(/* @__PURE__ */ new Map())
    ]);
    const copies = /* @__PURE__ */ new Map();
    const entryEs = (e) => {
      if (!copies.has(e)) {
        const name = e.p === "n-pr" && Array.isArray(e.nt);
        const g = name ? null : dict2.esOf(e);
        let out = withEs(e, name ? nameTypesEs(e.nt) : g && { g });
        const also = alsoOf.get(e);
        const ag = also ? dict2.esOf(also) : null;
        if (ag) out = { ...out, also: { ...e.also, es: { g: ag.slice(0, 2) } } };
        copies.set(e, out);
      }
      return copies.get(e);
    };
    for (const t3 of result.tokens) {
      if (t3.entry) t3.entry = entryEs(t3.entry);
      if (!Array.isArray(t3.parts)) continue;
      t3.parts = t3.parts.map((p) => {
        const entry = p.entry ? entryEs(p.entry) : null;
        return entry && entry.es && entry.es.g ? { ...p, entry, es: { gloss: entry.es.g[0] } } : p;
      });
      if (t3.parts.length && t3.parts.every((p) => p.es)) t3.es = { gloss: t3.parts.map((p) => p.es.gloss).join(" + ") };
    }
    for (const k of result.kanji) {
      const m = kanjiEs.get(k.char);
      if (m && k.info) k.info = { ...k.info, es: { m } };
    }
    return result;
  }
  function wordsWithEs(words, list2) {
    return words.map((w, i) => Array.isArray(list2) && typeof list2[i] === "string" && list2[i] ? { ...w, es: { gloss: list2[i] } } : w);
  }
  var init_spanish = __esm({
    "js/spanish.js"() {
      init_name_types();
      init_rare();
    }
  });

  // js/analyze.js
  function normalize(text) {
    return String(text ?? "").normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[\u200b\u2060\ufeff]/g, "");
  }
  function isGroupComma(text, i) {
    return text[i] === "," && isDigit2(text[i - 1] || "") && /^\d{3}(?!\d)/.test(text.slice(i + 1, i + 5));
  }
  function pieces2(text) {
    const out = [];
    const n2 = text.length;
    const starts = typeof Intl !== "undefined" && Intl.Segmenter ? new Set([...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(text)].map((g) => g.index)) : null;
    let i = 0;
    const cp = (k) => String.fromCodePoint(text.codePointAt(k));
    const inRun = (k) => {
      const ch = cp(k);
      return isJapanese(ch) || isDigit2(ch) || isGroupComma(text, k);
    };
    while (i < n2) {
      const ch = cp(i);
      let j = i + ch.length;
      let type;
      if (ch === "\n") {
        type = "newline";
      } else if (/\s/u.test(ch)) {
        type = "space";
        while (j < n2 && text[j] !== "\n" && /\s/u.test(text[j])) j++;
      } else if (inRun(i)) {
        type = "jp";
        while (j < n2 && inRun(j)) j += cp(j).length;
      } else if (/[\p{L}\p{M}]/u.test(ch)) {
        type = "latin";
        while (j < n2 && /[\p{L}\p{M}'’]/u.test(cp(j)) && !isJapanese(cp(j))) j += cp(j).length;
      } else {
        type = "punct";
        while (starts && j < n2 && !starts.has(j)) j++;
      }
      out.push({ type, start: i, end: j, text: text.slice(i, j) });
      i = j;
    }
    return out;
  }
  function plainToken(p) {
    const kind = p.type;
    let saidLine = "";
    if (kind === "punct") saidLine = PUNCT_SAID[p.text] ?? p.text;
    else if (kind === "latin") saidLine = p.text;
    return {
      kind,
      surface: p.text,
      start: p.start,
      end: p.end,
      base: p.text,
      reading: "",
      furigana: [{ text: p.text }],
      morae: [],
      romaji: { said: saidLine, spelled: kind === "latin" ? p.text : "" },
      entry: null,
      alts: 0,
      chain: [],
      sounds: [],
      grammar: [],
      kanji: [],
      confidence: "rule"
    };
  }
  function kanjiOf(surface) {
    return [...surface].filter((ch) => isKanji2(ch) && !MARKS.has(ch));
  }
  function saidOf(reading, cuts, words, particle2, finalWa, waAt) {
    const kana = waAt && waAt.length ? [...reading].map((ch, k) => waAt.includes(k) && (ch === "\u306F" || ch === "\u30CF") ? "\u308F" : ch).join("") : reading;
    if (!words) return said(kana, { cuts, particle: particle2, finalWa });
    return words.map(([a, b, prt]) => said(kana.slice(a, b), {
      cuts: cuts.filter((c) => c > a && c < b).map((c) => c - a),
      particle: particle2 || !!prt,
      finalWa: finalWa && b === kana.length
    })).join(" ");
  }
  function numberFurigana(parts) {
    const furigana = [];
    const cuts = [];
    let at = 0;
    for (const part of parts) {
      if (!part.text) continue;
      if (at) cuts.push(at);
      const ruby = part.ruby || "";
      if (isAllKana(part.text) || !ruby) furigana.push({ text: part.text });
      else if (part.whole) furigana.push({ text: part.text, ruby, whole: true });
      else {
        const inner = align(part.text, ruby);
        furigana.push(...inner.furigana);
        for (const c of inner.cuts) cuts.push(at + c);
      }
      at += (ruby || part.text).length;
    }
    return { furigana, cuts };
  }
  function enrich(t3) {
    const aid = t3.aid || {};
    delete t3.aid;
    const fur = aid.parts ? numberFurigana(aid.parts) : align(t3.surface, t3.reading, aid.f, { cuts: aid.cuts, v5u: aid.v5u });
    t3.furigana = fur.furigana;
    t3.morae = beats(t3.reading);
    const kana = t3.kind === "katakana" ? toKata(t3.reading) : t3.reading;
    const particle2 = t3.kind === "particle" || t3.kind === "copula";
    t3.romaji = { said: saidOf(kana, fur.cuts, aid.words, particle2, aid.finalWa, aid.waAt), spelled: spelled(t3.reading) };
    t3.kanji = kanjiOf(t3.surface);
    const usage = usageFor(t3);
    if (usage) t3.usage = usage;
    t3.sounds = [];
    t3.grammar = [];
    SAID.set(t3, { cuts: fur.cuts, finalWa: !!aid.finalWa, waAt: aid.waAt || [] });
  }
  function finals(tokens) {
    const out = tokens.map(() => false);
    tokens.forEach((t3, k) => {
      if (!JAPANESE_KINDS.has(t3.kind)) return;
      for (let m = k + 1; m <= tokens.length; m++) {
        const n2 = tokens[m];
        if (!n2 || n2.kind === "newline") {
          out[k] = true;
          return;
        }
        if (n2.kind === "space") continue;
        if (n2.kind === "punct" && CLOSERS.has(n2.surface)) continue;
        out[k] = n2.kind === "punct" && SENTENCE_END2.has(n2.surface);
        return;
      }
    });
    return out;
  }
  function kanjiReadings(t3, kanjiInfo) {
    const out = [];
    for (const f of t3.furigana) {
      if (!f.ruby) continue;
      const chars3 = [...f.text];
      if (!chars3.every((ch) => isKanji2(ch))) continue;
      if (f.whole) {
        for (const ch of new Set(chars3)) if (!MARKS.has(ch)) out.push([ch, f.ruby, f.text]);
        continue;
      }
      const split = chars3.length === 1 ? [f.ruby] : splitByKanji(f.text, f.ruby, kanjiInfo);
      if (!split) continue;
      chars3.forEach((ch, n2) => {
        const owner = ch === "\u3005" ? chars3[n2 - 1] || (out.length ? out[out.length - 1][0] : null) : ch;
        if (owner) out.push([owner, split[n2], null]);
      });
    }
    return out;
  }
  function kanjiList(tokens, kanjiInfo) {
    const list2 = [];
    const byChar = /* @__PURE__ */ new Map();
    tokens.forEach((t3, idx) => {
      if (!t3.kanji || !t3.kanji.length) return;
      for (const ch of t3.kanji) {
        let e = byChar.get(ch);
        if (!e) {
          e = { char: ch, info: kanjiInfo.get(ch) || null, readings: [], whole: false, wholeRuns: [], tokens: [] };
          byChar.set(ch, e);
          list2.push(e);
        }
        if (!e.tokens.includes(idx)) e.tokens.push(idx);
      }
      for (const [ch, reading, run2] of kanjiReadings(t3, kanjiInfo)) {
        const e = byChar.get(ch);
        if (!e || !reading) continue;
        if (!e.readings.includes(reading)) e.readings.push(reading);
        if (run2 && !e.wholeRuns.some((w) => w.run === run2 && w.reading === reading)) {
          e.whole = true;
          e.wholeRuns.push({ run: run2, reading });
        }
      }
    });
    return list2;
  }
  async function secondPhase(parts, firsts, dict2) {
    const none = parts.map(() => null);
    if (typeof dict2.needRare !== "function") return none;
    const spans = firsts.map((x, k) => x ? weakSpans(parts[k].text, x.path) : []);
    if (!spans.some((list2) => list2.length)) return none;
    const keys = { rare: /* @__PURE__ */ new Set(), names: /* @__PURE__ */ new Set(), first: /* @__PURE__ */ new Set() };
    spans.forEach((list2, k) => spanKeys(parts[k].text, list2, keys, firsts[k] && firsts[k].env.kanji));
    try {
      await Promise.all([
        dict2.needRare(keys.rare),
        dict2.needNames(keys.names),
        keys.first.size ? dict2.need(keys.first) : null
      ]);
    } catch {
      return none;
    }
    return spans.map((list2, k) => list2.length ? refine(parts[k].text, firsts[k].path, list2, dict2, firsts[k].env) : null);
  }
  function runTokens(run2, first, second, dict2) {
    const before = tokensOf(run2, first.path, dict2, first.env);
    if (!second) return before;
    const kept = new Map(first.path.map((node, k) => [node, before[k]]));
    const after = tokensOf(run2, second, dict2, first.env);
    return second.map((node, k) => kept.get(node) || after[k]);
  }
  async function analyzeCore(input, { dict: dict2 } = {}) {
    if (!dict2) throw new TypeError("analyze needs a dict (createDict)");
    const text = normalize(input);
    const parts = pieces2(text);
    await dict2.ready();
    const keys = /* @__PURE__ */ new Set();
    for (const p of parts) if (p.type === "jp") for (const k of keysForRun(p.text, dict2.maxKey)) keys.add(k);
    const chars3 = [...new Set([...text].filter((ch) => isKanji2(ch)).flatMap((ch) => NAME_VARIANTS[ch] ? [ch, NAME_VARIANTS[ch]] : [ch]))];
    const [, kanjiInfo] = await Promise.all([
      dict2.need(keys),
      chars3.length ? dict2.kanji(chars3) : Promise.resolve(/* @__PURE__ */ new Map())
    ]);
    const runOpts = parts.map((p, k) => {
      if (p.type !== "jp") return null;
      const prev = parts[k - 1];
      const next2 = parts[k + 1];
      const quoted = prev && prev.type === "punct" && CLOSERS.has(prev.text);
      return {
        kanji: kanjiInfo,
        after: prev && (prev.type === "latin" || quoted) ? "noun" : void 0,
        before: !!(next2 && next2.type === "latin")
      };
    });
    const firsts = parts.map((p, k) => runOpts[k] ? pathOf(p.text, dict2, runOpts[k]) : null);
    const seconds = await secondPhase(parts, firsts, dict2);
    const tokens = [];
    parts.forEach((p, k) => {
      if (!firsts[k]) {
        tokens.push(plainToken(p));
        return;
      }
      const named = titleNames(runTokens(p.text, firsts[k], seconds[k], dict2), parts[k + 1], parts[k + 2]);
      for (const t3 of joinKatakana(named)) {
        t3.start += p.start;
        t3.end += p.start;
        enrich(t3);
        tokens.push(t3);
      }
    });
    tokens.forEach((t3, i) => {
      t3.i = i;
    });
    await guessParts(tokens, dict2);
    const unknown = tokens.filter((t3) => t3.confidence === "guess" || t3.kind === "unknown").length;
    return { text, tokens, kanji: kanjiList(tokens, kanjiInfo), unknown };
  }
  async function analyze(input, { dict: dict2, meanings } = {}) {
    const d = dict2 || defaultDict();
    const result = await analyzeCore(input, { dict: d });
    const fin = finals(result.tokens);
    result.tokens.forEach((t3, k) => {
      if (JAPANESE_KINDS.has(t3.kind)) t3.sounds = detectSounds(t3, { final: fin[k], ...SAID.get(t3) });
    });
    annotateGrammar(result.tokens);
    if (meanings === "es") await addSpanish(result, d);
    return result;
  }
  function defaultDict() {
    if (!shared) {
      if (typeof fetch !== "function") throw new TypeError("analyze needs a dict outside the browser");
      shared = createDict({
        fetchJson: (url) => fetch(url, { credentials: "omit" }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        base: "data/"
      });
    }
    return shared;
  }
  var JAPANESE_KINDS, SENTENCE_END2, CLOSERS, PUNCT_SAID, isDigit2, MARKS, SAID, shared;
  var init_analyze = __esm({
    "js/analyze.js"() {
      init_kana();
      init_lattice();
      init_rare();
      init_furigana();
      init_dict();
      init_sounds();
      init_grammar();
      init_names();
      init_title_names();
      init_compounds();
      init_usage_notes();
      init_sounds_like();
      init_spanish();
      JAPANESE_KINDS = Object.freeze(/* @__PURE__ */ new Set([
        "word",
        "inflected",
        "particle",
        "copula",
        "katakana",
        "name",
        "unknown",
        "number"
      ]));
      SENTENCE_END2 = /* @__PURE__ */ new Set(["\u3002", ".", "!", "?", "\u2026", "\u2025", "\uFF61"]);
      CLOSERS = /* @__PURE__ */ new Set(["\u300D", "\u300F", ")", "\uFF09", "\u3009", "\u300B", "\u3011", '"', "'", "\u2019", "\u201D"]);
      PUNCT_SAID = Object.freeze({ "\u3002": ".", "\u3001": ",", "\u300C": '"', "\u300D": '"', "\u300E": '"', "\u300F": '"', "\u30FB": " " });
      isDigit2 = (ch) => ch >= "0" && ch <= "9";
      MARKS = /* @__PURE__ */ new Set(["\u3005", "\u30F6", "\u3006"]);
      SAID = /* @__PURE__ */ new WeakMap();
      shared = null;
    }
  });

  // js/notes-sounds.js
  var SOUND_NOTES;
  var init_notes_sounds = __esm({
    "js/notes-sounds.js"() {
      SOUND_NOTES = Object.freeze({
        "particle-wa": {
          title: { en: "\u306F said wa", es: "\u306F que se dice wa" },
          rule: {
            en: "When \u306F marks the topic of a sentence it is said wa, but it is still written \u306F.",
            es: "Cuando \u306F marca el tema de la oraci\xF3n se dice wa, aunque se sigue escribiendo \u306F."
          },
          examples: [
            { ja: "\u308F\u305F\u3057\u306F \u304C\u304F\u305B\u3044\u3067\u3059", kana: "\u308F\u305F\u3057 \u306F \u304C\u304F\u305B\u3044 \u3067\u3059", said: "watashi wa gakusee desu", spelled: "wa-ta-shi ha ga-ku-se-i de-su", gloss: { en: "I am a student.", es: "Soy estudiante." } },
            { ja: "\u304D\u3087\u3046\u306F \u3042\u3081\u3067\u3059", kana: "\u304D\u3087\u3046 \u306F \u3042\u3081 \u3067\u3059", said: "kyoo wa ame desu", spelled: "kyo-u ha a-me de-su", gloss: { en: "It is raining today.", es: "Hoy llueve." } }
          ],
          exception: {
            en: "Inside an ordinary word \u306F keeps its own sound: \u306F\u306A is hana, flower.",
            es: "Dentro de una palabra com\xFAn \u306F conserva su sonido: \u306F\u306A es hana, flor."
          }
        },
        "particle-e": {
          title: { en: "\u3078 said e", es: "\u3078 que se dice e" },
          rule: {
            en: "When \u3078 marks the direction you are heading it is said e, but it is still written \u3078.",
            es: "Cuando \u3078 marca la direcci\xF3n hacia la que vas se dice e, aunque se sigue escribiendo \u3078."
          },
          examples: [
            { ja: "\u304C\u3063\u3053\u3046\u3078 \u3044\u304D\u307E\u3059", kana: "\u304C\u3063\u3053\u3046 \u3078 \u3044\u304D\u307E\u3059", said: "gakkoo e ikimasu", spelled: "ga-k-ko-u he i-ki-ma-su", gloss: { en: "I go to school.", es: "Voy a la escuela." } },
            { ja: "\u3046\u3061\u3078 \u304B\u3048\u308A\u307E\u3059", kana: "\u3046\u3061 \u3078 \u304B\u3048\u308A\u307E\u3059", said: "uchi e kaerimasu", spelled: "u-chi he ka-e-ri-ma-su", gloss: { en: "I go back home.", es: "Vuelvo a casa." } }
          ],
          exception: {
            en: "Inside an ordinary word \u3078 keeps its own sound: \u3078\u3084 is heya, room.",
            es: "Dentro de una palabra com\xFAn \u3078 conserva su sonido: \u3078\u3084 es heya, habitaci\xF3n."
          }
        },
        "particle-o": {
          title: { en: "\u3092 said o", es: "\u3092 que se dice o" },
          rule: {
            en: "\u3092 is written only as the object particle, and it is said o, the same as \u304A.",
            es: "\u3092 solo se escribe como part\xEDcula de objeto y se dice o, igual que \u304A."
          },
          examples: [
            { ja: "\u307F\u305A\u3092 \u306E\u307F\u307E\u3059", kana: "\u307F\u305A \u3092 \u306E\u307F\u307E\u3059", said: "mizu o nomimasu", spelled: "mi-zu wo no-mi-ma-su", gloss: { en: "I drink water.", es: "Tomo agua." } },
            { ja: "\u307B\u3093\u3092 \u3088\u307F\u307E\u3059", kana: "\u307B\u3093 \u3092 \u3088\u307F\u307E\u3059", said: "hon o yomimasu", spelled: "ho-n wo yo-mi-ma-su", gloss: { en: "I read a book.", es: "Leo un libro." } }
          ],
          exception: {
            en: "Keyboards and some romaji systems write it wo; in everyday speech it is o.",
            es: "Los teclados y algunos sistemas de romaji lo escriben wo; en el habla cotidiana es o."
          }
        },
        "fossil-wa": {
          title: { en: "The \u306F at the end of a greeting", es: "La \u306F al final de un saludo" },
          rule: {
            en: "\u3053\u3093\u306B\u3061\u306F and \u3053\u3093\u3070\u3093\u306F end in an old topic particle, so their last \u306F is said wa.",
            es: "\u3053\u3093\u306B\u3061\u306F y \u3053\u3093\u3070\u3093\u306F terminan en una antigua part\xEDcula de tema, as\xED que su \xFAltima \u306F se dice wa."
          },
          examples: [
            { ja: "\u3053\u3093\u306B\u3061\u306F", said: "konnichiwa", spelled: "ko-n-ni-chi-ha", gloss: { en: "Hello (during the day).", es: "Hola (durante el d\xEDa)." } },
            { ja: "\u3053\u3093\u3070\u3093\u306F", said: "konbanwa", spelled: "ko-n-ba-n-ha", gloss: { en: "Good evening.", es: "Buenas noches (como saludo)." } }
          ],
          exception: {
            en: "Casual messages sometimes spell it \u3053\u3093\u306B\u3061\u308F, but \u306F is the standard spelling.",
            es: "En mensajes informales a veces se escribe \u3053\u3093\u306B\u3061\u308F, pero la ortograf\xEDa est\xE1ndar es con \u306F."
          }
        },
        "long-vowel": {
          title: { en: "Long vowels", es: "Vocales largas" },
          rule: {
            en: "A long vowel is held for two beats, and hiragana writes the second beat as a vowel kana: \u3044 after an e sound, \u3046 after an o sound, the same vowel after a, i and u.",
            es: "Una vocal larga dura dos tiempos, y el hiragana escribe el segundo tiempo con una vocal: \u3044 despu\xE9s de un sonido e, \u3046 despu\xE9s de un sonido o, la misma vocal despu\xE9s de a, i y u."
          },
          examples: [
            { ja: "\u304A\u304B\u3042\u3055\u3093", said: "okaasan", spelled: "o-ka-a-sa-n", gloss: { en: "mother", es: "madre" } },
            { ja: "\u305B\u3093\u305B\u3044", said: "sensee", spelled: "se-n-se-i", gloss: { en: "teacher", es: "docente" } },
            { ja: "\u3072\u3053\u3046\u304D", said: "hikooki", spelled: "hi-ko-u-ki", gloss: { en: "airplane", es: "avi\xF3n" } }
          ],
          pair: {
            with: { ja: "\u304A\u3070\u3042\u3055\u3093", said: "obaasan", gloss: { en: "grandmother", es: "abuela" } },
            without: { ja: "\u304A\u3070\u3055\u3093", said: "obasan", gloss: { en: "aunt", es: "t\xEDa" } }
          },
          exception: {
            en: "A handful of common words spell the long o with \u304A and the long e with \u3048 instead: \u304A\u304A\u304D\u3044 (big), \u3068\u304A\u3044 (far), \u3053\u304A\u308A (ice), \u304A\u306D\u3048\u3055\u3093 (older sister).",
            es: "Unas pocas palabras comunes escriben la o larga con \u304A y la e larga con \u3048: \u304A\u304A\u304D\u3044 (grande), \u3068\u304A\u3044 (lejos), \u3053\u304A\u308A (hielo), \u304A\u306D\u3048\u3055\u3093 (hermana mayor)."
          }
        },
        "small-tsu": {
          title: { en: "Small \u3063: a held beat", es: "\u3063 peque\xF1a: un tiempo sostenido" },
          rule: {
            en: "A small \u3063 is a silent beat that holds the next consonant, so the romaji writes that consonant twice.",
            es: "Una \u3063 peque\xF1a es un tiempo en silencio que sostiene la consonante siguiente, por eso el romaji la escribe dos veces."
          },
          examples: [
            { ja: "\u304C\u3063\u3053\u3046", said: "gakkoo", spelled: "ga-k-ko-u", gloss: { en: "school", es: "escuela" } },
            { ja: "\u304D\u3063\u3077", said: "kippu", spelled: "ki-p-pu", gloss: { en: "ticket", es: "boleto" } },
            { ja: "\u3056\u3063\u3057", said: "zasshi", spelled: "za-s-shi", gloss: { en: "magazine", es: "revista" } }
          ],
          pair: {
            with: { ja: "\u304D\u3063\u3066", said: "kitte", gloss: { en: "postage stamp", es: "sello postal" } },
            without: { ja: "\u304D\u3066", said: "kite", gloss: { en: "come (and...)", es: "ven (y...)" } }
          },
          exception: {
            en: "At the end of a word, as in \u3042\u3063, nothing follows to double: the sound stops short with a catch in the throat.",
            es: "Al final de una palabra, como en \u3042\u3063, no hay nada que duplicar: el sonido se corta en seco con un cierre en la garganta."
          }
        },
        "youon": {
          title: { en: "Small \u3083 \u3085 \u3087", es: "\u3083 \u3085 \u3087 peque\xF1as" },
          rule: {
            en: "A small \u3083, \u3085 or \u3087 after a kana of the i column merges with it into a single beat: \u304D and a small \u3087 make kyo.",
            es: "Una \u3083, \u3085 o \u3087 peque\xF1a despu\xE9s de una kana de la columna i se une a ella en un solo tiempo: \u304D y una \u3087 peque\xF1a forman kyo."
          },
          examples: [
            { ja: "\u304A\u3061\u3083", said: "ocha", spelled: "o-cha", gloss: { en: "tea", es: "t\xE9" } },
            { ja: "\u3057\u3083\u3057\u3093", said: "shashin", spelled: "sha-shi-n", gloss: { en: "photo", es: "foto" } },
            { ja: "\u308A\u3087\u3053\u3046", said: "ryokoo", spelled: "ryo-ko-u", gloss: { en: "trip", es: "viaje" } }
          ],
          pair: {
            with: { ja: "\u3073\u3087\u3046\u3044\u3093", said: "byooin", gloss: { en: "hospital", es: "hospital" } },
            without: { ja: "\u3073\u3088\u3046\u3044\u3093", said: "biyooin", gloss: { en: "hair salon", es: "peluquer\xEDa" } }
          }
        },
        "dakuten": {
          title: { en: "The two dots \u309B", es: "Los dos puntos \u309B" },
          rule: {
            en: "Two dots on a kana voice its consonant: k becomes g, s becomes z, t becomes d, and h becomes b.",
            es: "Dos puntos sobre una kana sonorizan su consonante: la k pasa a g, la s a z, la t a d y la h a b."
          },
          examples: [
            { ja: "\u3054\u306F\u3093", said: "gohan", spelled: "go-ha-n", gloss: { en: "rice, a meal", es: "arroz, comida" } },
            { ja: "\u3067\u3093\u308F", said: "denwa", spelled: "de-n-wa", gloss: { en: "telephone", es: "tel\xE9fono" } },
            { ja: "\u3068\u3082\u3060\u3061", said: "tomodachi", spelled: "to-mo-da-chi", gloss: { en: "friend", es: "amigo" } }
          ],
          pair: {
            with: { ja: "\u304B\u304E", said: "kagi", gloss: { en: "key", es: "llave" } },
            without: { ja: "\u304B\u304D", said: "kaki", gloss: { en: "persimmon", es: "caqui" } }
          },
          exception: {
            en: "\u3057 with the dots is ji, not zi, and \u3061 with the dots is ji as well.",
            es: "\u3057 con los puntos es ji, no zi, y \u3061 con los puntos tambi\xE9n es ji."
          }
        },
        "handakuten": {
          title: { en: "The small circle \u309C", es: "El peque\xF1o c\xEDrculo \u309C" },
          rule: {
            en: "A small circle on \u306F, \u3072, \u3075, \u3078 or \u307B turns the h into a p.",
            es: "Un peque\xF1o c\xEDrculo sobre \u306F, \u3072, \u3075, \u3078 o \u307B convierte la h en p."
          },
          examples: [
            { ja: "\u3048\u3093\u3074\u3064", said: "enpitsu", spelled: "e-n-pi-tsu", gloss: { en: "pencil", es: "l\xE1piz" } },
            { ja: "\u3055\u3093\u307D", said: "sanpo", spelled: "sa-n-po", gloss: { en: "a walk", es: "un paseo" } },
            { ja: "\u30D1\u30F3", said: "pan", spelled: "pa-n", gloss: { en: "bread", es: "pan" } }
          ],
          pair: {
            with: { ja: "\u307D\u304B\u307D\u304B", said: "pokapoka", gloss: { en: "pleasantly warm", es: "agradablemente tibio" } },
            without: { ja: "\u307B\u304B\u307B\u304B", said: "hokahoka", gloss: { en: "piping hot", es: "bien caliente" } }
          }
        },
        "n-assimilation": {
          title: { en: "\u3093 takes the shape of the next sound", es: "\u3093 toma la forma del sonido siguiente" },
          rule: {
            en: "\u3093 is said m before m, b or p, ng before k or g, and before a vowel or y the romaji writes it n' so it does not start a new syllable.",
            es: "\u3093 se dice m antes de m, b o p, ng antes de k o g, y antes de una vocal o de y el romaji la escribe n' para que no empiece una s\xEDlaba nueva."
          },
          examples: [
            { ja: "\u3057\u3093\u3076\u3093", said: "shinbun", spelled: "shi-n-bu-n", gloss: { en: "newspaper", es: "peri\xF3dico" } },
            { ja: "\u304E\u3093\u3053\u3046", said: "ginkoo", spelled: "gi-n-ko-u", gloss: { en: "bank", es: "banco" } },
            { ja: "\u3053\u3093\u3084", said: "kon'ya", spelled: "ko-n-ya", gloss: { en: "tonight", es: "esta noche" } }
          ],
          pair: {
            with: { ja: "\u304D\u3093\u3048\u3093", said: "kin'en", gloss: { en: "no smoking", es: "prohibido fumar" } },
            without: { ja: "\u304D\u306D\u3093", said: "kinen", gloss: { en: "commemoration", es: "conmemoraci\xF3n" } }
          },
          exception: {
            en: "The romaji line keeps writing n before m, b and p: the change happens in the mouth, not in the spelling.",
            es: "La l\xEDnea de romaji sigue escribiendo n antes de m, b y p: el cambio ocurre en la boca, no en la escritura."
          }
        },
        "devoiced": {
          title: { en: "Whispered vowels", es: "Vocales susurradas" },
          rule: {
            en: "In standard Tokyo speech an i or u between two voiceless consonants, or the u of a final \u3059, is whispered, so \u3067\u3059 sounds close to dess.",
            es: "En el habla est\xE1ndar de Tokio, una i o una u entre dos consonantes sordas, o la u de una \u3059 final, se susurra, as\xED que \u3067\u3059 suena casi como dess."
          },
          examples: [
            { ja: "\u3059\u304D\u3067\u3059", kana: "\u3059\u304D \u3067\u3059", said: "suki desu", spelled: "su-ki de-su", whispered: "s(u)ki des(u)", gloss: { en: "I like it.", es: "Me gusta." } },
            { ja: "\u3061\u304B\u3066\u3064", said: "chikatetsu", spelled: "chi-ka-te-tsu", whispered: "ch(i)katetsu", gloss: { en: "subway", es: "metro" } },
            { ja: "\u3072\u3068\u3064", said: "hitotsu", spelled: "hi-to-tsu", whispered: "h(i)totsu", gloss: { en: "one (thing)", es: "uno (objeto)" } }
          ],
          exception: {
            en: "It varies with region and speed, and saying the vowel in full is never wrong.",
            es: "Var\xEDa seg\xFAn la regi\xF3n y la velocidad, y pronunciar la vocal completa nunca es un error."
          }
        },
        "ji-zu": {
          title: { en: "\u3062 and \u3065", es: "\u3062 y \u3065" },
          rule: {
            en: "\u3062 and \u3065 sound exactly like \u3058 and \u305A, and are written only where a word joins onto \u3061 or \u3064, or repeats them.",
            es: "\u3062 y \u3065 suenan exactamente como \u3058 y \u305A, y solo se escriben donde una palabra se une a \u3061 o \u3064, o las repite."
          },
          examples: [
            { ja: "\u306F\u306A\u3062", said: "hanaji", spelled: "ha-na-ji", gloss: { en: "nosebleed (\u306F\u306A + \u3061)", es: "sangrado de nariz (\u306F\u306A + \u3061)" } },
            { ja: "\u307F\u304B\u3065\u304D", said: "mikazuki", spelled: "mi-ka-zu-ki", gloss: { en: "crescent moon (\u307F\u304B + \u3064\u304D)", es: "luna creciente (\u307F\u304B + \u3064\u304D)" } },
            { ja: "\u3064\u3065\u304F", said: "tsuzuku", spelled: "tsu-zu-ku", gloss: { en: "to continue", es: "continuar" } }
          ],
          exception: {
            en: "On a keyboard \u3062 is typed di and \u3065 is typed du, even though they are said ji and zu.",
            es: "En el teclado \u3062 se escribe di y \u3065 se escribe du, aunque se pronuncian ji y zu."
          }
        },
        "foreign-sound": {
          title: { en: "Sounds for words from abroad", es: "Sonidos para palabras extranjeras" },
          rule: {
            en: "Katakana pairs a kana with a small vowel to make sounds that native words lack, such as \u30C6\u30A3 (ti), \u30D5\u30A1 (fa), \u30A6\u30A3 (wi) and \u30F4\u30A1 (va).",
            es: "El katakana une una kana con una vocal peque\xF1a para formar sonidos que las palabras nativas no tienen, como \u30C6\u30A3 (ti), \u30D5\u30A1 (fa), \u30A6\u30A3 (wi) y \u30F4\u30A1 (va)."
          },
          examples: [
            { ja: "\u30D1\u30FC\u30C6\u30A3\u30FC", said: "paatii", spelled: "pa-a-ti-i", gloss: { en: "party", es: "fiesta" } },
            { ja: "\u30D5\u30A1\u30A4\u30EB", said: "fairu", spelled: "fa-i-ru", gloss: { en: "file", es: "archivo" } },
            { ja: "\u30D5\u30A9\u30FC\u30AF", said: "fooku", spelled: "fo-o-ku", gloss: { en: "fork", es: "tenedor" } }
          ],
          pair: {
            with: { ja: "\u30D5\u30A1\u30F3", said: "fan", gloss: { en: "a fan (of a team)", es: "un fan (de un equipo)" } },
            without: { ja: "\u3075\u3042\u3093", said: "fuan", gloss: { en: "anxiety", es: "ansiedad" } }
          },
          exception: {
            en: "\u30F4 is often replaced by the b column: \u30D0\u30A4\u30AA\u30EA\u30F3 and \u30F4\u30A1\u30A4\u30AA\u30EA\u30F3 are both in use.",
            es: "\u30F4 se reemplaza a menudo por la columna b: se usan tanto \u30D0\u30A4\u30AA\u30EA\u30F3 como \u30F4\u30A1\u30A4\u30AA\u30EA\u30F3."
          }
        },
        "bar": {
          title: { en: "The long bar \u30FC", es: "La barra larga \u30FC" },
          rule: {
            en: "In katakana the bar \u30FC holds the vowel before it for one more beat.",
            es: "En katakana la barra \u30FC sostiene la vocal anterior durante un tiempo m\xE1s."
          },
          examples: [
            { ja: "\u30B3\u30FC\u30D2\u30FC", said: "koohii", spelled: "ko-o-hi-i", gloss: { en: "coffee", es: "caf\xE9" } },
            { ja: "\u30E9\u30FC\u30E1\u30F3", said: "raamen", spelled: "ra-a-me-n", gloss: { en: "ramen", es: "ramen" } },
            { ja: "\u30B1\u30FC\u30AD", said: "keeki", spelled: "ke-e-ki", gloss: { en: "cake", es: "pastel" } }
          ],
          pair: {
            with: { ja: "\u30D3\u30FC\u30EB", said: "biiru", gloss: { en: "beer", es: "cerveza" } },
            without: { ja: "\u30D3\u30EB", said: "biru", gloss: { en: "building", es: "edificio" } }
          },
          exception: {
            en: "Casual writing also stretches hiragana with it for effect, as in \u3059\u3054\u30FC\u3044.",
            es: "La escritura informal tambi\xE9n la usa para alargar el hiragana, como en \u3059\u3054\u30FC\u3044."
          }
        },
        "repeat-mark": {
          title: { en: "The repeat mark \u3005", es: "La marca de repetici\xF3n \u3005" },
          rule: {
            en: "\u3005 repeats the kanji before it, and the repeated reading often starts with a voiced sound: \u4EBA\u3005 is \u3072\u3068\u3073\u3068.",
            es: "\u3005 repite el kanji anterior, y la lectura repetida suele empezar con un sonido sonoro: \u4EBA\u3005 es \u3072\u3068\u3073\u3068."
          },
          examples: [
            { ja: "\u4EBA\u3005", kana: "\u3072\u3068\u3073\u3068", said: "hitobito", spelled: "hi-to-bi-to", gloss: { en: "people", es: "la gente" } },
            { ja: "\u6642\u3005", kana: "\u3068\u304D\u3069\u304D", said: "tokidoki", spelled: "to-ki-do-ki", gloss: { en: "sometimes", es: "a veces" } },
            { ja: "\u8272\u3005", kana: "\u3044\u308D\u3044\u308D", said: "iroiro", spelled: "i-ro-i-ro", gloss: { en: "all sorts of", es: "de todo tipo" } }
          ],
          exception: {
            en: "\u3005 is not a kanji of its own and has no reading apart from the kanji it repeats.",
            es: "\u3005 no es un kanji propio y no tiene lectura aparte de la del kanji que repite."
          }
        },
        "special-reading": {
          title: { en: "Words read as a whole", es: "Palabras que se leen en bloque" },
          rule: {
            en: "Some kanji words have a reading that belongs to the whole word, so it cannot be split kanji by kanji.",
            es: "Algunas palabras en kanji tienen una lectura que pertenece a la palabra entera, as\xED que no se puede dividir kanji por kanji."
          },
          examples: [
            { ja: "\u4ECA\u65E5", kana: "\u304D\u3087\u3046", said: "kyoo", spelled: "kyo-u", gloss: { en: "today", es: "hoy" } },
            { ja: "\u5927\u4EBA", kana: "\u304A\u3068\u306A", said: "otona", spelled: "o-to-na", gloss: { en: "adult", es: "adulto" } },
            { ja: "\u660E\u65E5", kana: "\u3042\u3057\u305F", said: "ashita", spelled: "a-shi-ta", gloss: { en: "tomorrow", es: "ma\xF1ana" } }
          ],
          exception: {
            en: "The same kanji can be read piece by piece elsewhere: \u4ECA\u65E5 is also \u3053\u3093\u306B\u3061 in formal writing.",
            es: "Los mismos kanji pueden leerse uno por uno en otros casos: \u4ECA\u65E5 tambi\xE9n es \u3053\u3093\u306B\u3061 en textos formales."
          }
        },
        "counter-change": {
          title: { en: "Sound changes with counters", es: "Cambios de sonido con los contadores" },
          rule: {
            en: "Some numbers and counters change their sound when they meet: \u3044\u3061 and \u307B\u3093 become \u3044\u3063\u307D\u3093.",
            es: "Algunos n\xFAmeros y contadores cambian de sonido al juntarse: \u3044\u3061 y \u307B\u3093 se vuelven \u3044\u3063\u307D\u3093."
          },
          examples: [
            { ja: "\u4E00\u672C", kana: "\u3044\u3063\u307D\u3093", said: "ippon", spelled: "i-p-po-n", gloss: { en: "one (long, thin thing)", es: "uno (objeto largo y delgado)" } },
            { ja: "\u4E09\u672C", kana: "\u3055\u3093\u307C\u3093", said: "sanbon", spelled: "sa-n-bo-n", gloss: { en: "three (long, thin things)", es: "tres (objetos largos y delgados)" } },
            { ja: "\u516D\u767E", kana: "\u308D\u3063\u3074\u3083\u304F", said: "roppyaku", spelled: "ro-p-pya-ku", gloss: { en: "six hundred", es: "seiscientos" } }
          ],
          exception: {
            en: "The changes follow patterns, but each counter has its own set, so learn them with the counter.",
            es: "Los cambios siguen patrones, pero cada contador tiene los suyos, as\xED que conviene aprenderlos junto con el contador."
          }
        }
      });
    }
  });

  // js/notes-grammar.js
  var n, GRAMMAR_NOTES;
  var init_notes_grammar = __esm({
    "js/notes-grammar.js"() {
      n = (title, pattern, meaning, example) => ({ title, pattern, meaning, example });
      GRAMMAR_NOTES = Object.freeze({
        // ── Particles ──────────────────────────────────────────────────────────
        "topic-wa": n(
          { en: "\u306F: the topic", es: "\u306F: el tema" },
          { en: "noun + \u306F", es: "sustantivo + \u306F" },
          { en: "You name what you are talking about, then say something about it.", es: "Nombras aquello de lo que hablas y luego dices algo sobre eso." },
          { ja: "\u732B\u306F\u304B\u308F\u3044\u3044\u3067\u3059\u3002", en: "Cats are cute.", es: "Los gatos son adorables." }
        ),
        "subject-ga": n(
          { en: "\u304C: who or what does it", es: "\u304C: qui\xE9n o qu\xE9 lo hace" },
          { en: "noun + \u304C", es: "sustantivo + \u304C" },
          { en: "You point out who or what does something or is something, often as new information.", es: "Se\xF1alas qui\xE9n o qu\xE9 hace o es algo, a menudo como informaci\xF3n nueva." },
          { ja: "\u96E8\u304C\u964D\u3063\u3066\u3044\u307E\u3059\u3002", en: "It is raining.", es: "Est\xE1 lloviendo." }
        ),
        "object-o": n(
          { en: "\u3092: what the action falls on", es: "\u3092: sobre qu\xE9 recae la acci\xF3n" },
          { en: "noun + \u3092 + verb", es: "sustantivo + \u3092 + verbo" },
          { en: "You say what you eat, read, buy or otherwise act on.", es: "Dices qu\xE9 comes, lees, compras o sobre qu\xE9 act\xFAas." },
          { ja: "\u30D1\u30F3\u3092\u8CB7\u3044\u307E\u3057\u305F\u3002", en: "I bought bread.", es: "Compr\xE9 pan." }
        ),
        "direction-e": n(
          { en: "\u3078: toward", es: "\u3078: hacia" },
          { en: "place + \u3078 + verb of movement", es: "lugar + \u3078 + verbo de movimiento" },
          { en: "You say where you are heading.", es: "Dices hacia d\xF3nde vas." },
          { ja: "\u99C5\u3078\u884C\u304D\u307E\u3059\u3002", en: "I am going to the station.", es: "Voy a la estaci\xF3n." }
        ),
        "ni": n(
          { en: "\u306B: at a point, to a target", es: "\u306B: en un punto, hacia un destino" },
          { en: "noun + \u306B", es: "sustantivo + \u306B" },
          { en: "You pin something to the place where it is, to a time, or to the person or place it goes to.", es: "Ubicas algo en el lugar donde est\xE1, en un momento, o en la persona o el lugar al que va." },
          { ja: "\u4E03\u6642\u306B\u8D77\u304D\u307E\u3059\u3002", en: "I get up at seven.", es: "Me levanto a las siete." }
        ),
        "de": n(
          { en: "\u3067: where, or with what", es: "\u3067: d\xF3nde, o con qu\xE9" },
          { en: "noun + \u3067", es: "sustantivo + \u3067" },
          { en: "You say where an action happens, or the tool or means you use for it.", es: "Dices d\xF3nde ocurre una acci\xF3n, o la herramienta o el medio que usas." },
          { ja: "\u30D0\u30B9\u3067\u5B66\u6821\u3078\u884C\u304D\u307E\u3059\u3002", en: "I go to school by bus.", es: "Voy a la escuela en autob\xFAs." }
        ),
        "de-and": n(
          { en: "\u3067 after a na-adjective: and", es: "\u3067 despu\xE9s de un adjetivo na: y" },
          { en: "na-adjective + \u3067", es: "adjetivo na + \u3067" },
          { en: "You join one description to the next. This \u3067 is \u3067\u3059 in its te-form, not the \u3067 of place.", es: "Unes una descripci\xF3n con la siguiente. Este \u3067 es \u3067\u3059 en su forma \u3066, no el \u3067 de lugar." },
          { ja: "\u3053\u306E\u753A\u306F\u9759\u304B\u3067\u304D\u308C\u3044\u3067\u3059\u3002", en: "This town is quiet and pretty.", es: "Este pueblo es tranquilo y bonito." }
        ),
        "to-and": n(
          { en: "\u3068: and, with", es: "\u3068: y, con" },
          { en: "noun + \u3068 + noun", es: "sustantivo + \u3068 + sustantivo" },
          { en: "You list every item, or say who you do something with.", es: "Enumeras todos los elementos, o dices con qui\xE9n haces algo." },
          { ja: "\u53CB\u3060\u3061\u3068\u6620\u753B\u3092\u898B\u307E\u3057\u305F\u3002", en: "I watched a film with a friend.", es: "Vi una pel\xEDcula con un amigo." }
        ),
        "to-quote": n(
          { en: "\u3068: quoting", es: "\u3068: para citar" },
          { en: "sentence + \u3068 + \u8A00\u3046 / \u601D\u3046", es: "oraci\xF3n + \u3068 + \u8A00\u3046 / \u601D\u3046" },
          { en: "You report what someone said, or what you think.", es: "Cuentas lo que alguien dijo, o lo que piensas." },
          { ja: "\u660E\u65E5\u306F\u5BD2\u3044\u3068\u601D\u3044\u307E\u3059\u3002", en: "I think it will be cold tomorrow.", es: "Creo que ma\xF1ana har\xE1 fr\xEDo." }
        ),
        "mo": n(
          { en: "\u3082: also", es: "\u3082: tambi\xE9n" },
          { en: "noun + \u3082", es: "sustantivo + \u3082" },
          { en: "You say the same is true of this too; it takes the place of \u306F, \u304C or \u3092.", es: "Dices que lo mismo vale para esto; ocupa el lugar de \u306F, \u304C o \u3092." },
          { ja: "\u79C1\u3082\u884C\u304D\u307E\u3059\u3002", en: "I am going too.", es: "Yo tambi\xE9n voy." }
        ),
        "no": n(
          { en: "\u306E: of, 's", es: "\u306E: de" },
          { en: "noun + \u306E + noun", es: "sustantivo + \u306E + sustantivo" },
          { en: "You join two nouns, the first describing or owning the second.", es: "Unes dos sustantivos: el primero describe o posee al segundo." },
          { ja: "\u3053\u308C\u306F\u59C9\u306E\u304B\u3055\u3067\u3059\u3002", en: "This is my older sister's umbrella.", es: "Este es el paraguas de mi hermana mayor." }
        ),
        "ka-question": n(
          { en: "\u304B: a question", es: "\u304B: una pregunta" },
          { en: "sentence + \u304B", es: "oraci\xF3n + \u304B" },
          { en: "You turn a statement into a question; no question mark is needed.", es: "Conviertes una afirmaci\xF3n en pregunta; no hace falta signo de interrogaci\xF3n." },
          { ja: "\u30C8\u30A4\u30EC\u306F\u3069\u3053\u3067\u3059\u304B\u3002", en: "Where is the restroom?", es: "\xBFD\xF3nde est\xE1 el ba\xF1o?" }
        ),
        "ne": n(
          { en: "\u306D: right?", es: "\u306D: \xBFverdad?" },
          { en: "sentence + \u306D", es: "oraci\xF3n + \u306D" },
          { en: "You invite the listener to agree, or share a feeling with them.", es: "Invitas a quien escucha a estar de acuerdo, o compartes un sentimiento." },
          { ja: "\u4ECA\u65E5\u306F\u6691\u3044\u3067\u3059\u306D\u3002", en: "It is hot today, isn't it?", es: "Hoy hace calor, \xBFverdad?" }
        ),
        "yo": n(
          { en: "\u3088: I am telling you", es: "\u3088: te lo digo" },
          { en: "sentence + \u3088", es: "oraci\xF3n + \u3088" },
          { en: "You give the listener something you think they do not know yet.", es: "Das a quien escucha algo que crees que todav\xEDa no sabe." },
          { ja: "\u3053\u306E\u5E97\u306F\u5B89\u3044\u3067\u3059\u3088\u3002", en: "This shop is cheap, you know.", es: "Esta tienda es barata, \xBFsabes?" }
        ),
        "kara": n(
          { en: "\u304B\u3089: from, because", es: "\u304B\u3089: desde, porque" },
          { en: "noun + \u304B\u3089; sentence + \u304B\u3089", es: "sustantivo + \u304B\u3089; oraci\xF3n + \u304B\u3089" },
          { en: "After a noun you say where or when something starts; after a sentence you give a reason.", es: "Tras un sustantivo dices d\xF3nde o cu\xE1ndo empieza algo; tras una oraci\xF3n das una raz\xF3n." },
          { ja: "\u6388\u696D\u306F\u4E5D\u6642\u304B\u3089\u3067\u3059\u3002", en: "Class starts at nine.", es: "La clase empieza a las nueve." }
        ),
        "made": n(
          { en: "\u307E\u3067: until, as far as", es: "\u307E\u3067: hasta" },
          { en: "noun + \u307E\u3067", es: "sustantivo + \u307E\u3067" },
          { en: "You say where or when something ends.", es: "Dices d\xF3nde o cu\xE1ndo termina algo." },
          { ja: "\u99C5\u307E\u3067\u6B69\u304D\u307E\u3059\u3002", en: "I walk as far as the station.", es: "Camino hasta la estaci\xF3n." }
        ),
        "yori": n(
          { en: "\u3088\u308A: than", es: "\u3088\u308A: que (al comparar)" },
          { en: "A \u306F B \u3088\u308A + adjective", es: "A \u306F B \u3088\u308A + adjetivo" },
          { en: "You compare two things and say which one has more of a quality.", es: "Comparas dos cosas y dices cu\xE1l tiene m\xE1s de una cualidad." },
          { ja: "\u4ECA\u65E5\u306F\u6628\u65E5\u3088\u308A\u5BD2\u3044\u3067\u3059\u3002", en: "Today is colder than yesterday.", es: "Hoy hace m\xE1s fr\xEDo que ayer." }
        ),
        "ya": n(
          { en: "\u3084: and, among others", es: "\u3084: y, entre otros" },
          { en: "noun + \u3084 + noun", es: "sustantivo + \u3084 + sustantivo" },
          { en: "You give a few examples from a longer list.", es: "Das algunos ejemplos de una lista m\xE1s larga." },
          { ja: "\u308A\u3093\u3054\u3084\u307F\u304B\u3093\u3092\u8CB7\u3044\u307E\u3057\u305F\u3002", en: "I bought apples, tangerines and other things.", es: "Compr\xE9 manzanas, mandarinas y otras cosas." }
        ),
        "kedo": n(
          { en: "\u3051\u3069: but", es: "\u3051\u3069: pero" },
          { en: "sentence + \u3051\u3069", es: "oraci\xF3n + \u3051\u3069" },
          { en: "You set up a contrast, or soften what you are about to say.", es: "Planteas un contraste, o suavizas lo que vas a decir." },
          { ja: "\u9AD8\u3044\u3051\u3069\u3001\u304A\u3044\u3057\u3044\u3067\u3059\u3002", en: "It is expensive, but it tastes good.", es: "Es caro, pero es delicioso." }
        ),
        "node": n(
          { en: "\u306E\u3067: since, so", es: "\u306E\u3067: como, ya que" },
          { en: "sentence + \u306E\u3067", es: "oraci\xF3n + \u306E\u3067" },
          { en: "You give a reason in a softer, more explanatory way than \u304B\u3089.", es: "Das una raz\xF3n de forma m\xE1s suave y explicativa que con \u304B\u3089." },
          { ja: "\u96E8\u306A\u306E\u3067\u3001\u3046\u3061\u306B\u3044\u307E\u3059\u3002", en: "Since it is raining, I am staying home.", es: "Como llueve, me quedo en casa." }
        ),
        "dake": n(
          { en: "\u3060\u3051: only", es: "\u3060\u3051: solo" },
          { en: "noun + \u3060\u3051", es: "sustantivo + \u3060\u3051" },
          { en: "You say that nothing beyond this is involved.", es: "Dices que no hay nada m\xE1s all\xE1 de esto." },
          { ja: "\u6C34\u3060\u3051\u98F2\u307F\u307E\u3059\u3002", en: "I only drink water.", es: "Solo tomo agua." }
        ),
        "shika": n(
          { en: "\u3057\u304B: nothing but", es: "\u3057\u304B: nada m\xE1s que" },
          { en: "noun + \u3057\u304B + negative verb", es: "sustantivo + \u3057\u304B + verbo en negativo" },
          { en: "You stress that there is only this, often with a sense of too little; the verb is always negative.", es: "Recalcas que solo hay esto, a menudo con la idea de que es poco; el verbo siempre va en negativo." },
          { ja: "\u767E\u5186\u3057\u304B\u3042\u308A\u307E\u305B\u3093\u3002", en: "I have only a hundred yen.", es: "No tengo m\xE1s que cien yenes." }
        ),
        "nado": n(
          { en: "\u306A\u3069: and the like", es: "\u306A\u3069: y cosas as\xED" },
          { en: "noun + \u306A\u3069", es: "sustantivo + \u306A\u3069" },
          { en: "You hint that there is more of the same kind; it often closes a list made with \u3084.", es: "Sugieres que hay m\xE1s de lo mismo; a menudo cierra una lista hecha con \u3084." },
          { ja: "\u30DA\u30F3\u3084\u30CE\u30FC\u30C8\u306A\u3069\u3092\u8CB7\u3044\u307E\u3057\u305F\u3002", en: "I bought pens, notebooks and so on.", es: "Compr\xE9 bol\xEDgrafos, cuadernos y cosas as\xED." }
        ),
        "na-prohibition": n(
          { en: "\u306A: don't", es: "\u306A: no lo hagas" },
          { en: "verb dictionary form + \u306A", es: "verbo en forma de diccionario + \u306A" },
          { en: "You forbid something bluntly, as a sign does or as close friends might.", es: "Proh\xEDbes algo de forma tajante, como un cartel o entre amigos cercanos." },
          { ja: "\u5FD8\u308C\u308B\u306A\u3002", en: "Don't forget.", es: "No lo olvides." }
        ),
        // ── The copula ─────────────────────────────────────────────────────────
        "desu": n(
          { en: "\u3067\u3059: is, politely", es: "\u3067\u3059: es, con cortes\xEDa" },
          { en: "noun or adjective + \u3067\u3059", es: "sustantivo o adjetivo + \u3067\u3059" },
          { en: "You say what something is, or describe it, politely.", es: "Dices qu\xE9 es algo, o lo describes, con cortes\xEDa." },
          { ja: "\u79C1\u306F\u5B66\u751F\u3067\u3059\u3002", en: "I am a student.", es: "Soy estudiante." }
        ),
        "deshita": n(
          { en: "\u3067\u3057\u305F: was, politely", es: "\u3067\u3057\u305F: era, con cortes\xEDa" },
          { en: "noun + \u3067\u3057\u305F", es: "sustantivo + \u3067\u3057\u305F" },
          { en: "You say what something was, politely.", es: "Dices qu\xE9 era algo, con cortes\xEDa." },
          { ja: "\u6628\u65E5\u306F\u4F11\u307F\u3067\u3057\u305F\u3002", en: "Yesterday was a day off.", es: "Ayer fue d\xEDa libre." }
        ),
        "deshou": n(
          { en: "\u3067\u3057\u3087\u3046: probably", es: "\u3067\u3057\u3087\u3046: probablemente" },
          { en: "noun, adjective or verb + \u3067\u3057\u3087\u3046", es: "sustantivo, adjetivo o verbo + \u3067\u3057\u3087\u3046" },
          { en: "You say something is likely, or check that the listener agrees, politely.", es: "Dices que algo es probable, o confirmas que quien escucha est\xE1 de acuerdo, con cortes\xEDa." },
          { ja: "\u660E\u65E5\u306F\u6674\u308C\u308B\u3067\u3057\u3087\u3046\u3002", en: "It will probably be sunny tomorrow.", es: "Ma\xF1ana probablemente har\xE1 sol." }
        ),
        "darou": n(
          { en: "\u3060\u308D\u3046: probably, plainly", es: "\u3060\u308D\u3046: probablemente, en forma llana" },
          { en: "noun, adjective or verb + \u3060\u308D\u3046", es: "sustantivo, adjetivo o verbo + \u3060\u308D\u3046" },
          { en: "You guess that something is likely, in plain speech or when thinking aloud.", es: "Supones que algo es probable, en habla llana o pensando en voz alta." },
          { ja: "\u5F7C\u306F\u6765\u306A\u3044\u3060\u308D\u3046\u3002", en: "He probably won't come.", es: "Probablemente \xE9l no venga." }
        ),
        "da": n(
          { en: "\u3060: is, plainly", es: "\u3060: es, en forma llana" },
          { en: "noun + \u3060", es: "sustantivo + \u3060" },
          { en: "You say what something is to friends and family, or in writing.", es: "Dices qu\xE9 es algo entre amigos y familia, o por escrito." },
          { ja: "\u4ECA\u65E5\u306F\u65E5\u66DC\u65E5\u3060\u3002", en: "Today is Sunday.", es: "Hoy es domingo." }
        ),
        "datta": n(
          { en: "\u3060\u3063\u305F: was, plainly", es: "\u3060\u3063\u305F: era, en forma llana" },
          { en: "noun + \u3060\u3063\u305F", es: "sustantivo + \u3060\u3063\u305F" },
          { en: "You say what something was, in plain speech.", es: "Dices qu\xE9 era algo, en habla llana." },
          { ja: "\u30C6\u30B9\u30C8\u306F\u304B\u3093\u305F\u3093\u3060\u3063\u305F\u3002", en: "The test was easy.", es: "La prueba fue f\xE1cil." }
        ),
        "ja-nai": n(
          { en: "\u3058\u3083\u306A\u3044: is not, plainly", es: "\u3058\u3083\u306A\u3044: no es, en forma llana" },
          { en: "noun + \u3058\u3083\u306A\u3044 (\u3067\u306F\u306A\u3044)", es: "sustantivo + \u3058\u3083\u306A\u3044 (\u3067\u306F\u306A\u3044)" },
          { en: "You say something is not the case, in plain speech; \u3067\u306F\u306A\u3044 is the more formal spelling.", es: "Dices que algo no es as\xED, en habla llana; \u3067\u306F\u306A\u3044 es la variante m\xE1s formal." },
          { ja: "\u305D\u308C\u306F\u3046\u305D\u3058\u3083\u306A\u3044\u3002", en: "That is not a lie.", es: "Eso no es mentira." }
        ),
        "ja-arimasen": n(
          { en: "\u3058\u3083\u3042\u308A\u307E\u305B\u3093: is not, politely", es: "\u3058\u3083\u3042\u308A\u307E\u305B\u3093: no es, con cortes\xEDa" },
          { en: "noun + \u3058\u3083\u3042\u308A\u307E\u305B\u3093 (\u3067\u306F\u3042\u308A\u307E\u305B\u3093, \u3058\u3083\u306A\u3044\u3067\u3059)", es: "sustantivo + \u3058\u3083\u3042\u308A\u307E\u305B\u3093 (\u3067\u306F\u3042\u308A\u307E\u305B\u3093, \u3058\u3083\u306A\u3044\u3067\u3059)" },
          { en: "You say something is not the case, politely.", es: "Dices que algo no es as\xED, con cortes\xEDa." },
          { ja: "\u4ECA\u65E5\u306F\u4F11\u307F\u3058\u3083\u3042\u308A\u307E\u305B\u3093\u3002", en: "Today is not a day off.", es: "Hoy no es d\xEDa libre." }
        ),
        "ja-nakatta": n(
          { en: "\u3058\u3083\u306A\u304B\u3063\u305F: was not, plainly", es: "\u3058\u3083\u306A\u304B\u3063\u305F: no era, en forma llana" },
          { en: "noun + \u3058\u3083\u306A\u304B\u3063\u305F (\u3067\u306F\u306A\u304B\u3063\u305F)", es: "sustantivo + \u3058\u3083\u306A\u304B\u3063\u305F (\u3067\u306F\u306A\u304B\u3063\u305F)" },
          { en: "You say something was not the case, in plain speech.", es: "Dices que algo no era as\xED, en habla llana." },
          { ja: "\u6628\u65E5\u306F\u96E8\u3058\u3083\u306A\u304B\u3063\u305F\u3002", en: "It did not rain yesterday.", es: "Ayer no llovi\xF3." }
        ),
        "ja-arimasen-deshita": n(
          { en: "\u3058\u3083\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F: was not, politely", es: "\u3058\u3083\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F: no era, con cortes\xEDa" },
          { en: "noun + \u3058\u3083\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F (\u3058\u3083\u306A\u304B\u3063\u305F\u3067\u3059)", es: "sustantivo + \u3058\u3083\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F (\u3058\u3083\u306A\u304B\u3063\u305F\u3067\u3059)" },
          { en: "You say something was not the case, politely.", es: "Dices que algo no era as\xED, con cortes\xEDa." },
          { ja: "\u305D\u306E\u65E5\u306F\u4F11\u307F\u3058\u3083\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002", en: "That day was not a day off.", es: "Ese d\xEDa no fue libre." }
        ),
        "nara": n(
          { en: "\u306A\u3089: as for, if it is", es: "\u306A\u3089: en cuanto a, si se trata de" },
          { en: "noun + \u306A\u3089", es: "sustantivo + \u306A\u3089" },
          { en: "You pick up something just mentioned and say what applies to it.", es: "Retomas algo reci\xE9n mencionado y dices qu\xE9 vale para eso." },
          { ja: "\u3059\u3057\u306A\u3089\u3001\u3053\u306E\u5E97\u304C\u3044\u3044\u3067\u3059\u3088\u3002", en: "If it is sushi you want, this place is good.", es: "Si buscas sushi, este lugar es bueno." }
        ),
        // ── Polite endings ─────────────────────────────────────────────────────
        "polite": n(
          { en: "\u301C\u307E\u3059: the polite verb", es: "\u301C\u307E\u3059: el verbo cort\xE9s" },
          { en: "verb stem + \u307E\u3059", es: "ra\xEDz verbal + \u307E\u3059" },
          { en: "You say what you do, or will do, politely.", es: "Dices lo que haces, o har\xE1s, con cortes\xEDa." },
          { ja: "\u6BCE\u65E5\u30B3\u30FC\u30D2\u30FC\u3092\u98F2\u307F\u307E\u3059\u3002", en: "I drink coffee every day.", es: "Tomo caf\xE9 todos los d\xEDas." }
        ),
        "polite-past": n(
          { en: "\u301C\u307E\u3057\u305F: did, politely", es: "\u301C\u307E\u3057\u305F: hice, con cortes\xEDa" },
          { en: "verb stem + \u307E\u3057\u305F", es: "ra\xEDz verbal + \u307E\u3057\u305F" },
          { en: "You did something, and you say it politely.", es: "Hiciste algo y lo dices con cortes\xEDa." },
          { ja: "\u6628\u65E5\u3059\u3057\u3092\u98DF\u3079\u307E\u3057\u305F\u3002", en: "I ate sushi yesterday.", es: "Ayer com\xED sushi." }
        ),
        "polite-negative": n(
          { en: "\u301C\u307E\u305B\u3093: do not, politely", es: "\u301C\u307E\u305B\u3093: no hago, con cortes\xEDa" },
          { en: "verb stem + \u307E\u305B\u3093", es: "ra\xEDz verbal + \u307E\u305B\u3093" },
          { en: "You do not do something, or will not, and you say it politely.", es: "No haces algo, o no lo har\xE1s, y lo dices con cortes\xEDa." },
          { ja: "\u304A\u9152\u306F\u98F2\u307F\u307E\u305B\u3093\u3002", en: "I do not drink alcohol.", es: "No tomo alcohol." }
        ),
        "polite-past-negative": n(
          { en: "\u301C\u307E\u305B\u3093\u3067\u3057\u305F: did not, politely", es: "\u301C\u307E\u305B\u3093\u3067\u3057\u305F: no hice, con cortes\xEDa" },
          { en: "verb stem + \u307E\u305B\u3093\u3067\u3057\u305F", es: "ra\xEDz verbal + \u307E\u305B\u3093\u3067\u3057\u305F" },
          { en: "You did not do something, and you say it politely.", es: "No hiciste algo y lo dices con cortes\xEDa." },
          { ja: "\u4ECA\u671D\u306F\u671D\u3054\u306F\u3093\u3092\u98DF\u3079\u307E\u305B\u3093\u3067\u3057\u305F\u3002", en: "I did not eat breakfast this morning.", es: "Esta ma\xF1ana no desayun\xE9." }
        ),
        "lets": n(
          { en: "\u301C\u307E\u3057\u3087\u3046: let's", es: "\u301C\u307E\u3057\u3087\u3046: hagamos" },
          { en: "verb stem + \u307E\u3057\u3087\u3046", es: "ra\xEDz verbal + \u307E\u3057\u3087\u3046" },
          { en: "You suggest doing something together, politely.", es: "Propones hacer algo juntos, con cortes\xEDa." },
          { ja: "\u3044\u3063\u3057\u3087\u306B\u5E30\u308A\u307E\u3057\u3087\u3046\u3002", en: "Let's go home together.", es: "Volvamos juntos a casa." }
        ),
        "polite-te": n(
          { en: "\u301C\u307E\u3057\u3066: the polite te-form", es: "\u301C\u307E\u3057\u3066: la forma \u3066 cort\xE9s" },
          { en: "verb stem + \u307E\u3057\u3066", es: "ra\xEDz verbal + \u307E\u3057\u3066" },
          { en: "You link a cause or a first action to what follows, very politely, as in speeches and announcements.", es: "Unes una causa o una primera acci\xF3n con lo que sigue, con mucha cortes\xEDa, como en discursos y anuncios." },
          { ja: "\u9045\u308C\u307E\u3057\u3066\u3001\u3059\u307F\u307E\u305B\u3093\u3002", en: "I am sorry for being late.", es: "Disculpe la demora." }
        ),
        "invitation": n(
          { en: "\u301C\u307E\u305B\u3093\u304B: won't you?", es: "\u301C\u307E\u305B\u3093\u304B: \xBFno quieres...?" },
          { en: "verb stem + \u307E\u305B\u3093\u304B", es: "ra\xEDz verbal + \u307E\u305B\u3093\u304B" },
          { en: "You invite someone to do something, leaving them room to say no.", es: "Invitas a alguien a hacer algo, dej\xE1ndole espacio para decir que no." },
          { ja: "\u3044\u3063\u3057\u3087\u306B\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u307E\u305B\u3093\u304B\u3002", en: "Would you like to have lunch together?", es: "\xBFAlmorzamos juntos?" }
        ),
        "offer": n(
          { en: "\u301C\u307E\u3057\u3087\u3046\u304B: shall I? shall we?", es: "\u301C\u307E\u3057\u3087\u3046\u304B: \xBFlo hago yo? \xBFlo hacemos?" },
          { en: "verb stem + \u307E\u3057\u3087\u3046\u304B", es: "ra\xEDz verbal + \u307E\u3057\u3087\u3046\u304B" },
          { en: "You offer to do something for someone, or suggest doing it together.", es: "Te ofreces a hacer algo por alguien, o propones hacerlo juntos." },
          { ja: "\u8377\u7269\u3092\u6301\u3061\u307E\u3057\u3087\u3046\u304B\u3002", en: "Shall I carry your bags?", es: "\xBFTe llevo el equipaje?" }
        ),
        // ── Plain verb forms ───────────────────────────────────────────────────
        "te-form": n(
          { en: "The te-form", es: "La forma \u3066" },
          { en: "verb + \u3066 / \u3067", es: "verbo + \u3066 / \u3067" },
          { en: "You join actions in order, give a reason, or build a request or another form on it.", es: "Encadenas acciones en orden, das una raz\xF3n, o formas sobre ella un pedido u otra forma." },
          { ja: "\u671D\u8D77\u304D\u3066\u3001\u30B7\u30E3\u30EF\u30FC\u3092\u3042\u3073\u307E\u3059\u3002", en: "I get up in the morning and take a shower.", es: "Me levanto por la ma\xF1ana y me ducho." }
        ),
        "te-kudasai": n(
          { en: "\u301C\u3066\u304F\u3060\u3055\u3044: please do", es: "\u301C\u3066\u304F\u3060\u3055\u3044: por favor, haz" },
          { en: "verb te-form + \u304F\u3060\u3055\u3044", es: "verbo en forma \u3066 + \u304F\u3060\u3055\u3044" },
          { en: "You ask someone to do something, politely.", es: "Pides a alguien que haga algo, con cortes\xEDa." },
          { ja: "\u3061\u3087\u3063\u3068\u5F85\u3063\u3066\u304F\u3060\u3055\u3044\u3002", en: "Please wait a moment.", es: "Espere un momento, por favor." }
        ),
        "te-iru": n(
          { en: "\u301C\u3066\u3044\u308B: doing now, or the state that remains", es: "\u301C\u3066\u3044\u308B: haciendo ahora, o el estado que queda" },
          { en: "verb te-form + \u3044\u308B", es: "verbo en forma \u3066 + \u3044\u308B" },
          { en: "You say an action is going on, or that its result still holds.", es: "Dices que una acci\xF3n est\xE1 en curso, o que su resultado sigue vigente." },
          { ja: "\u4ECA\u30C6\u30EC\u30D3\u3092\u898B\u3066\u3044\u307E\u3059\u3002", en: "I am watching TV now.", es: "Ahora estoy viendo la tele." }
        ),
        "past": n(
          { en: "The plain past (ta-form)", es: "El pasado llano (forma \u305F)" },
          { en: "verb + \u305F / \u3060", es: "verbo + \u305F / \u3060" },
          { en: "You did something, and you say it plainly.", es: "Hiciste algo y lo dices en forma llana." },
          { ja: "\u6628\u65E5\u672C\u3092\u8CB7\u3063\u305F\u3002", en: "I bought a book yesterday.", es: "Ayer compr\xE9 un libro." }
        ),
        "negative": n(
          { en: "The plain negative (nai-form)", es: "El negativo llano (forma \u306A\u3044)" },
          { en: "verb + \u306A\u3044", es: "verbo + \u306A\u3044" },
          { en: "You do not do something, and you say it plainly.", es: "No haces algo y lo dices en forma llana." },
          { ja: "\u4ECA\u65E5\u306F\u884C\u304B\u306A\u3044\u3002", en: "I am not going today.", es: "Hoy no voy." }
        ),
        "past-negative": n(
          { en: "The plain past negative", es: "El pasado negativo llano" },
          { en: "verb + \u306A\u304B\u3063\u305F", es: "verbo + \u306A\u304B\u3063\u305F" },
          { en: "You did not do something, and you say it plainly.", es: "No hiciste algo y lo dices en forma llana." },
          { ja: "\u3086\u3046\u3079\u306F\u5BDD\u306A\u304B\u3063\u305F\u3002", en: "I did not sleep last night.", es: "Anoche no dorm\xED." }
        ),
        "want": n(
          { en: "\u301C\u305F\u3044: want to", es: "\u301C\u305F\u3044: querer" },
          { en: "verb stem + \u305F\u3044", es: "ra\xEDz verbal + \u305F\u3044" },
          { en: "You say what you want to do; from there it changes like an adjective.", es: "Dices lo que quieres hacer; a partir de ah\xED se conjuga como un adjetivo." },
          { ja: "\u65E5\u672C\u3078\u884C\u304D\u305F\u3044\u3067\u3059\u3002", en: "I want to go to Japan.", es: "Quiero ir a Jap\xF3n." }
        ),
        "potential": n(
          { en: "The potential: can do", es: "El potencial: poder hacer" },
          { en: "verb + \u3048\u308B / \u3089\u308C\u308B", es: "verbo + \u3048\u308B / \u3089\u308C\u308B" },
          { en: "You say you are able to do something.", es: "Dices que puedes hacer algo." },
          { ja: "\u3072\u3089\u304C\u306A\u304C\u8AAD\u3081\u307E\u3059\u3002", en: "I can read hiragana.", es: "Puedo leer hiragana." }
        ),
        "passive": n(
          { en: "The passive: done to someone", es: "La pasiva: algo que le hacen a alguien" },
          { en: "verb + \u308C\u308B / \u3089\u308C\u308B", es: "verbo + \u308C\u308B / \u3089\u308C\u308B" },
          { en: "You say something was done to someone, often with a sense that it affected them.", es: "Dices que a alguien le hicieron algo, a menudo con la idea de que lo afect\xF3." },
          { ja: "\u72AC\u306B\u304B\u307E\u308C\u307E\u3057\u305F\u3002", en: "I was bitten by a dog.", es: "Me mordi\xF3 un perro." }
        ),
        "causative": n(
          { en: "The causative: make or let", es: "El causativo: hacer o dejar que" },
          { en: "verb + \u305B\u308B / \u3055\u305B\u308B", es: "verbo + \u305B\u308B / \u3055\u305B\u308B" },
          { en: "You say someone makes or lets another person do something.", es: "Dices que alguien hace o deja que otra persona haga algo." },
          { ja: "\u5B50\u3069\u3082\u306B\u91CE\u83DC\u3092\u98DF\u3079\u3055\u305B\u307E\u3059\u3002", en: "I have my child eat vegetables.", es: "Hago que mi hijo coma verduras." }
        ),
        "volitional": n(
          { en: "The volitional: let's, I will", es: "El volitivo: vamos a, voy a" },
          { en: "verb + \u3088\u3046 / \u304A\u3046", es: "verbo + \u3088\u3046 / \u304A\u3046" },
          { en: "You suggest doing something together, or say what you mean to do, plainly.", es: "Propones hacer algo juntos, o dices lo que piensas hacer, en forma llana." },
          { ja: "\u305D\u308D\u305D\u308D\u5E30\u308D\u3046\u3002", en: "Let's head home soon.", es: "Volvamos a casa ya." }
        ),
        "imperative": n(
          { en: "The command form", es: "La forma imperativa" },
          { en: "verb + \u308D, or the e sound of the ending", es: "verbo + \u308D, o el sonido e de la terminaci\xF3n" },
          { en: "You give a blunt order; it is heard in sports, on signs and in emergencies more than in conversation.", es: "Das una orden tajante; se oye m\xE1s en los deportes, en carteles y en emergencias que en la conversaci\xF3n." },
          { ja: "\u9003\u3052\u308D\uFF01", en: "Run for it!", es: "\xA1Escapa!" }
        ),
        "nasai": n(
          { en: "\u301C\u306A\u3055\u3044: do it (firmly)", es: "\u301C\u306A\u3055\u3044: hazlo (con firmeza)" },
          { en: "verb stem + \u306A\u3055\u3044", es: "ra\xEDz verbal + \u306A\u3055\u3044" },
          { en: "You tell someone to do something, as a parent or a teacher would.", es: "Le dices a alguien que haga algo, como lo har\xEDa un padre o un docente." },
          { ja: "\u65E9\u304F\u5BDD\u306A\u3055\u3044\u3002", en: "Go to bed now.", es: "Acu\xE9state ya." }
        ),
        "nagara": n(
          { en: "\u301C\u306A\u304C\u3089: while", es: "\u301C\u306A\u304C\u3089: mientras" },
          { en: "verb stem + \u306A\u304C\u3089", es: "ra\xEDz verbal + \u306A\u304C\u3089" },
          { en: "You do two things at once; the main action comes last.", es: "Haces dos cosas a la vez; la acci\xF3n principal va al final." },
          { ja: "\u97F3\u697D\u3092\u805E\u304D\u306A\u304C\u3089\u3001\u52C9\u5F37\u3057\u307E\u3059\u3002", en: "I study while listening to music.", es: "Estudio mientras escucho m\xFAsica." }
        ),
        "te-shimau": n(
          { en: "\u301C\u3066\u3057\u307E\u3046 / \u301C\u3061\u3083\u3046: done, for good or for worse", es: "\u301C\u3066\u3057\u307E\u3046 / \u301C\u3061\u3083\u3046: hecho del todo, para bien o para mal" },
          { en: "verb te-form + \u3057\u307E\u3046; in casual speech \u3061\u3083\u3046 / \u3058\u3083\u3046", es: "verbo en forma \u3066 + \u3057\u307E\u3046; en habla informal, \u3061\u3083\u3046 / \u3058\u3083\u3046" },
          { en: "You say something got done completely, or happened when you wish it had not.", es: "Dices que algo se hizo por completo, o que pas\xF3 aunque no quer\xEDas." },
          { ja: "\u30B1\u30FC\u30AD\u3092\u5168\u90E8\u98DF\u3079\u3061\u3083\u3063\u305F\u3002", en: "I ate the whole cake.", es: "Me com\xED todo el pastel." }
        ),
        "te-miru": n(
          { en: "\u301C\u3066\u307F\u308B: try it and see", es: "\u301C\u3066\u307F\u308B: probar a ver" },
          { en: "verb te-form + \u307F\u308B", es: "verbo en forma \u3066 + \u307F\u308B" },
          { en: 'You do something to find out how it goes; \u307F\u308B is the verb "see".', es: 'Haces algo para ver qu\xE9 tal resulta; \u307F\u308B es el verbo "ver".' },
          { ja: "\u3053\u306E\u30B1\u30FC\u30AD\u3092\u98DF\u3079\u3066\u307F\u3066\u304F\u3060\u3055\u3044\u3002", en: "Try this cake.", es: "Prueba este pastel." }
        ),
        "must": n(
          { en: "\u301C\u306A\u3051\u308C\u3070 / \u301C\u306A\u304F\u3061\u3083: have to", es: "\u301C\u306A\u3051\u308C\u3070 / \u301C\u306A\u304F\u3061\u3083: tener que" },
          { en: "verb \u306A\u3044 form, \u3044 dropped, + \u3051\u308C\u3070 \u3044\u3051\u306A\u3044 / \u306A\u3089\u306A\u3044; casually \u306A\u304F\u3061\u3083 or \u306A\u304D\u3083", es: "verbo en forma \u306A\u3044 sin la \u3044 + \u3051\u308C\u3070 \u3044\u3051\u306A\u3044 / \u306A\u3089\u306A\u3044; en habla informal, \u306A\u304F\u3061\u3083 o \u306A\u304D\u3083" },
          { en: 'You say something has to be done. Word for word it is "if I do not, it will not do".', es: 'Dices que algo se tiene que hacer. Palabra por palabra es "si no lo hago, no est\xE1 bien".' },
          { ja: "\u3082\u3046\u5E30\u3089\u306A\u304F\u3061\u3083\u3002", en: "I have to go home now.", es: "Ya me tengo que ir a casa." }
        ),
        "naide": n(
          { en: "\u301C\u306A\u3044\u3067: without doing, please don't", es: "\u301C\u306A\u3044\u3067: sin hacer, por favor no" },
          { en: "verb \u306A\u3044 form + \u3067", es: "verbo en forma \u306A\u3044 + \u3067" },
          { en: "You say something is done without another thing; with \u304F\u3060\u3055\u3044 you ask someone not to do it.", es: "Dices que algo se hace sin otra cosa; con \u304F\u3060\u3055\u3044 pides a alguien que no lo haga." },
          { ja: "\u3053\u3053\u3067\u5199\u771F\u3092\u3068\u3089\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002", en: "Please don't take photos here.", es: "Por favor, no tomes fotos aqu\xED." }
        ),
        "sou": n(
          { en: "\u301C\u305D\u3046: looks like, about to", es: "\u301C\u305D\u3046: parece, est\xE1 por" },
          { en: "verb stem or adjective without the final \u3044 + \u305D\u3046", es: "ra\xEDz verbal o adjetivo sin la \u3044 final + \u305D\u3046" },
          { en: "You say how something looks to you, or that it seems about to happen.", es: "Dices c\xF3mo te parece algo a la vista, o que parece a punto de pasar." },
          { ja: "\u3053\u306E\u30B1\u30FC\u30AD\u306F\u304A\u3044\u3057\u305D\u3046\u3067\u3059\u3002", en: "This cake looks delicious.", es: "Este pastel se ve delicioso." }
        ),
        "sugiru": n(
          { en: "\u301C\u3059\u304E\u308B: too much", es: "\u301C\u3059\u304E\u308B: demasiado" },
          { en: "verb stem or adjective without the final \u3044 + \u3059\u304E\u308B", es: "ra\xEDz verbal o adjetivo sin la \u3044 final + \u3059\u304E\u308B" },
          { en: "You say something goes past the right amount.", es: "Dices que algo pasa de la medida justa." },
          { ja: "\u6628\u65E5\u306F\u98DF\u3079\u3059\u304E\u307E\u3057\u305F\u3002", en: "I ate too much yesterday.", es: "Ayer com\xED demasiado." }
        ),
        "yasui": n(
          { en: "\u301C\u3084\u3059\u3044: easy to", es: "\u301C\u3084\u3059\u3044: f\xE1cil de" },
          { en: "verb stem + \u3084\u3059\u3044", es: "ra\xEDz verbal + \u3084\u3059\u3044" },
          { en: "You say something is easy to do; it then changes like an adjective.", es: "Dices que algo es f\xE1cil de hacer; luego se conjuga como un adjetivo." },
          { ja: "\u3053\u306E\u30DA\u30F3\u306F\u66F8\u304D\u3084\u3059\u3044\u3067\u3059\u3002", en: "This pen is easy to write with.", es: "Con este bol\xEDgrafo es f\xE1cil escribir." }
        ),
        "nikui": n(
          { en: "\u301C\u306B\u304F\u3044: hard to", es: "\u301C\u306B\u304F\u3044: dif\xEDcil de" },
          { en: "verb stem + \u306B\u304F\u3044", es: "ra\xEDz verbal + \u306B\u304F\u3044" },
          { en: "You say something is hard to do; it then changes like an adjective.", es: "Dices que algo es dif\xEDcil de hacer; luego se conjuga como un adjetivo." },
          { ja: "\u3053\u306E\u30DA\u30F3\u306F\u66F8\u304D\u306B\u304F\u3044\u3067\u3059\u3002", en: "This pen is hard to write with.", es: "Es dif\xEDcil escribir con este bol\xEDgrafo." }
        ),
        "tari": n(
          { en: "\u301C\u305F\u308A\u301C\u305F\u308A: things like", es: "\u301C\u305F\u308A\u301C\u305F\u308A: cosas como" },
          { en: "plain past + \u308A, twice, + \u3059\u308B", es: "pasado llano + \u308A, dos veces, + \u3059\u308B" },
          { en: "You mention a couple of actions from a longer list.", es: "Mencionas un par de acciones de una lista m\xE1s larga." },
          { ja: "\u9031\u672B\u306F\u305D\u3046\u3058\u3092\u3057\u305F\u308A\u3001\u8CB7\u3044\u7269\u3092\u3057\u305F\u308A\u3057\u307E\u3059\u3002", en: "On weekends I do things like cleaning and shopping.", es: "Los fines de semana hago cosas como limpiar e ir de compras." }
        ),
        // ── Conditions ─────────────────────────────────────────────────────────
        "cond-ba": n(
          { en: "\u301C\u3070: if", es: "\u301C\u3070: si" },
          { en: "verb e sound + \u3070; adjective + \u3051\u308C\u3070", es: "verbo en sonido e + \u3070; adjetivo + \u3051\u308C\u3070" },
          { en: "You state a condition, and what follows is its result.", es: "Planteas una condici\xF3n y lo que sigue es su resultado." },
          { ja: "\u5B89\u3051\u308C\u3070\u3001\u8CB7\u3044\u307E\u3059\u3002", en: "If it is cheap, I will buy it.", es: "Si es barato, lo compro." }
        ),
        "cond-tara": n(
          { en: "\u301C\u305F\u3089: if, once", es: "\u301C\u305F\u3089: si, una vez que" },
          { en: "plain past + \u3089", es: "pasado llano + \u3089" },
          { en: "You say what happens once something is done, or if it turns out to be true.", es: "Dices qu\xE9 pasa una vez que algo se hace, o si resulta ser cierto." },
          { ja: "\u3046\u3061\u306B\u7740\u3044\u305F\u3089\u3001\u96FB\u8A71\u3057\u307E\u3059\u3002", en: "I will call when I get home.", es: "Te llamo cuando llegue a casa." }
        ),
        "cond-nara": n(
          { en: "\u301C\u306A\u3089: if that is the case", es: "\u301C\u306A\u3089: si ese es el caso" },
          { en: "verb or adjective + \u306A\u3089", es: "verbo o adjetivo + \u306A\u3089" },
          { en: "You take what the listener said or plans, and give advice or a reaction on that basis.", es: "Tomas lo que quien escucha dijo o planea, y das un consejo o una reacci\xF3n a partir de eso." },
          { ja: "\u4EAC\u90FD\u3078\u884C\u304F\u306A\u3089\u3001\u79CB\u304C\u3044\u3044\u3067\u3059\u3088\u3002", en: "If you are going to Kyoto, autumn is a good time.", es: "Si vas a Kioto, el oto\xF1o es buena \xE9poca." }
        ),
        "cond-to": n(
          { en: "\u301C\u3068: whenever", es: "\u301C\u3068: siempre que" },
          { en: "verb dictionary form or \u306A\u3044 form + \u3068", es: "verbo en forma de diccionario o forma \u306A\u3044 + \u3068" },
          { en: "You say one thing always, or naturally, follows another.", es: "Dices que una cosa siempre, o de forma natural, sigue a otra." },
          { ja: "\u6625\u306B\u306A\u308B\u3068\u3001\u3055\u304F\u3089\u304C\u3055\u304D\u307E\u3059\u3002", en: "When spring comes, the cherry trees bloom.", es: "Cuando llega la primavera, florecen los cerezos." }
        ),
        // ── Adjective endings ──────────────────────────────────────────────────
        "adj-negative": n(
          { en: "Adjective negative: \u301C\u304F\u306A\u3044", es: "Adjetivo en negativo: \u301C\u304F\u306A\u3044" },
          { en: "i-adjective without the final \u3044 + \u304F\u306A\u3044", es: "adjetivo en \u3044 sin la \u3044 final + \u304F\u306A\u3044" },
          { en: "You say something does not have a quality; the \u305F\u3044 and \u306A\u3044 forms change the same way.", es: "Dices que algo no tiene una cualidad; las formas en \u305F\u3044 y \u306A\u3044 cambian igual." },
          { ja: "\u3053\u306E\u90E8\u5C4B\u306F\u5E83\u304F\u306A\u3044\u3067\u3059\u3002", en: "This room is not big.", es: "Esta habitaci\xF3n no es grande." }
        ),
        "adj-past": n(
          { en: "Adjective past: \u301C\u304B\u3063\u305F", es: "Adjetivo en pasado: \u301C\u304B\u3063\u305F" },
          { en: "i-adjective without the final \u3044 + \u304B\u3063\u305F", es: "adjetivo en \u3044 sin la \u3044 final + \u304B\u3063\u305F" },
          { en: "You say something had a quality in the past.", es: "Dices que algo ten\xEDa una cualidad en el pasado." },
          { ja: "\u65C5\u884C\u306F\u697D\u3057\u304B\u3063\u305F\u3067\u3059\u3002", en: "The trip was fun.", es: "El viaje fue divertido." }
        ),
        "adj-te": n(
          { en: "Adjective te-form: \u301C\u304F\u3066", es: "Adjetivo en forma \u3066: \u301C\u304F\u3066" },
          { en: "i-adjective without the final \u3044 + \u304F\u3066", es: "adjetivo en \u3044 sin la \u3044 final + \u304F\u3066" },
          { en: "You join one description to another, or give it as a reason.", es: "Unes una descripci\xF3n con otra, o la das como raz\xF3n." },
          { ja: "\u3053\u306E\u5E97\u306F\u5B89\u304F\u3066\u304A\u3044\u3057\u3044\u3067\u3059\u3002", en: "This place is cheap and the food is good.", es: "En este lugar la comida es barata y rica." }
        ),
        "adverbial": n(
          { en: "Adjective as adverb: \u301C\u304F", es: "Adjetivo como adverbio: \u301C\u304F" },
          { en: "i-adjective without the final \u3044 + \u304F + verb", es: "adjetivo en \u3044 sin la \u3044 final + \u304F + verbo" },
          { en: "You say how something is done, or what it becomes.", es: "Dices c\xF3mo se hace algo, o en qu\xE9 se convierte." },
          { ja: "\u5B57\u3092\u5927\u304D\u304F\u66F8\u3044\u3066\u304F\u3060\u3055\u3044\u3002", en: "Please write the letters big.", es: "Escribe las letras grandes, por favor." }
        )
      });
    }
  });

  // js/notes-loan.js
  var LOAN_NOTES;
  var init_notes_loan = __esm({
    "js/notes-loan.js"() {
      LOAN_NOTES = Object.freeze({
        "loan-vowel": {
          title: { en: "A vowel added after a final consonant", es: "Una vocal a\xF1adida despu\xE9s de una consonante final" },
          rule: {
            en: "A Japanese beat ends in a vowel or \u3093, so an English word that ends in a consonant gets a vowel after it: u after most consonants, o after t and d.",
            es: "Un tiempo del japon\xE9s termina en vocal o en \u3093, as\xED que una palabra inglesa que termina en consonante recibe una vocal despu\xE9s: u tras casi todas las consonantes, o tras t y d."
          },
          examples: [
            { ja: "\u30B7\u30E7\u30C3\u30D7", said: "shoppu", spelled: "sho-p-pu", gloss: { en: "shop", es: "shop, tienda" } },
            { ja: "\u30B2\u30FC\u30E0", said: "geemu", spelled: "ge-e-mu", gloss: { en: "game", es: "game, juego" } },
            { ja: "\u30D9\u30C3\u30C9", said: "beddo", spelled: "be-d-do", gloss: { en: "bed", es: "bed, cama" } }
          ],
          exception: {
            en: "After a ch or j sound the added vowel is i: \u30B9\u30A4\u30C3\u30C1 (switch), \u30D6\u30EA\u30C3\u30B8 (bridge). A final n needs none: \u30DA\u30F3 (pen).",
            es: "Despu\xE9s de un sonido ch o j la vocal a\xF1adida es i: \u30B9\u30A4\u30C3\u30C1 (switch, interruptor), \u30D6\u30EA\u30C3\u30B8 (bridge, puente). Una n final no necesita ninguna: \u30DA\u30F3 (pen, bol\xEDgrafo)."
          }
        },
        "loan-double": {
          title: { en: "A small \u30C3 after a short vowel", es: "Una \u30C3 peque\xF1a despu\xE9s de una vocal corta" },
          rule: {
            en: "When a short English vowel comes right before a final consonant, katakana often holds that consonant with a small \u30C3, which is why shop is \u30B7\u30E7\u30C3\u30D7 and not \u30B7\u30E7\u30D7.",
            es: "Cuando una vocal corta del ingl\xE9s va justo antes de una consonante final, el katakana suele sostener esa consonante con una \u30C3 peque\xF1a: por eso shop es \u30B7\u30E7\u30C3\u30D7 y no \u30B7\u30E7\u30D7."
          },
          examples: [
            { ja: "\u30AB\u30C3\u30D7", said: "kappu", spelled: "ka-p-pu", gloss: { en: "cup", es: "cup, taza" } },
            { ja: "\u30D0\u30C3\u30B0", said: "baggu", spelled: "ba-g-gu", gloss: { en: "bag", es: "bag, bolso" } },
            { ja: "\u30D9\u30C3\u30C9", said: "beddo", spelled: "be-d-do", gloss: { en: "bed", es: "bed, cama" } }
          ],
          pair: {
            with: { ja: "\u30D0\u30C3\u30B0", said: "baggu", gloss: { en: "bag", es: "bag, bolso" } },
            without: { ja: "\u30D0\u30B0", said: "bagu", gloss: { en: "bug (a fault in a program)", es: "bug (un error en un programa)" } }
          },
          exception: {
            en: "It is a habit, not a law: bus is \u30D0\u30B9 and bug is \u30D0\u30B0, with no \u30C3.",
            es: "Es una costumbre, no una ley: bus es \u30D0\u30B9 y bug es \u30D0\u30B0, sin \u30C3."
          }
        },
        "loan-long": {
          title: { en: "English -er, -or, -ar and long vowels as \u30FC", es: "El -er, -or, -ar del ingl\xE9s y las vocales largas como \u30FC" },
          rule: {
            en: "The r of English -er, -or and -ar is not said in Japanese: the vowel before it is held for one more beat and written \u30FC, and so is a long English vowel.",
            es: "La r del -er, -or y -ar del ingl\xE9s no se pronuncia en japon\xE9s: la vocal anterior se sostiene un tiempo m\xE1s y se escribe \u30FC, y lo mismo pasa con una vocal larga del ingl\xE9s."
          },
          examples: [
            { ja: "\u30B3\u30F3\u30D4\u30E5\u30FC\u30BF\u30FC", said: "konpyuutaa", spelled: "ko-n-pyu-u-ta-a", gloss: { en: "computer", es: "computer, computadora" } },
            { ja: "\u30AB\u30FC", said: "kaa", spelled: "ka-a", gloss: { en: "car", es: "car, autom\xF3vil" } },
            { ja: "\u30C1\u30FC\u30E0", said: "chiimu", spelled: "chi-i-mu", gloss: { en: "team", es: "team, equipo" } }
          ],
          pair: {
            with: { ja: "\u30E9\u30D0\u30FC", said: "rabaa", gloss: { en: "rubber", es: "rubber, goma" } },
            without: { ja: "\u30E9\u30D0", said: "raba", gloss: { en: "mule (a Japanese word)", es: "mula (una palabra japonesa)" } }
          },
          exception: {
            en: "Some newer spellings leave the final \u30FC out: \u30B3\u30F3\u30D4\u30E5\u30FC\u30BF is written too.",
            es: "Algunas graf\xEDas m\xE1s nuevas omiten la \u30FC final: tambi\xE9n se escribe \u30B3\u30F3\u30D4\u30E5\u30FC\u30BF."
          }
        },
        "loan-f": {
          title: { en: "f written with \u30D5", es: "La f escrita con \u30D5" },
          rule: {
            en: "Japanese has no f of its own, so an English f is written with \u30D5, and before a, i, e and o with \u30D5 and a small vowel: \u30D5\u30A1, \u30D5\u30A3, \u30D5\u30A7, \u30D5\u30A9.",
            es: "El japon\xE9s no tiene una f propia, as\xED que la f del ingl\xE9s se escribe con \u30D5, y antes de a, i, e y o con \u30D5 y una vocal peque\xF1a: \u30D5\u30A1, \u30D5\u30A3, \u30D5\u30A7, \u30D5\u30A9."
          },
          examples: [
            { ja: "\u30D5\u30A1\u30A4\u30EB", said: "fairu", spelled: "fa-i-ru", gloss: { en: "file", es: "file, archivo" } },
            { ja: "\u30D5\u30A9\u30FC\u30AF", said: "fooku", spelled: "fo-o-ku", gloss: { en: "fork", es: "fork, tenedor" } },
            { ja: "\u30B4\u30EB\u30D5", said: "gorufu", spelled: "go-ru-fu", gloss: { en: "golf", es: "golf" } }
          ],
          pair: {
            with: { ja: "\u30D5\u30A9\u30FC\u30E0", said: "foomu", gloss: { en: "form (a posture, a page to fill in)", es: "form (una postura, un formulario)" } },
            without: { ja: "\u30DB\u30FC\u30E0", said: "hoomu", gloss: { en: "platform (at a station)", es: "and\xE9n (de una estaci\xF3n)" } }
          },
          exception: {
            en: "Some older words used the h column instead: coffee is \u30B3\u30FC\u30D2\u30FC.",
            es: "Algunas palabras m\xE1s antiguas usaban la columna h: coffee (caf\xE9) es \u30B3\u30FC\u30D2\u30FC."
          }
        },
        "loan-lr": {
          title: { en: "l and r both written with the r column", es: "La l y la r escritas con la columna r" },
          rule: {
            en: "Japanese has one sound between l and r, so an English l is written with the r column, \u30E9 \u30EA \u30EB \u30EC \u30ED, the same as an r.",
            es: "El japon\xE9s tiene un solo sonido entre la l y la r, as\xED que la l del ingl\xE9s se escribe con la columna r, \u30E9 \u30EA \u30EB \u30EC \u30ED, igual que una r."
          },
          examples: [
            { ja: "\u30DB\u30C6\u30EB", said: "hoteru", spelled: "ho-te-ru", gloss: { en: "hotel", es: "hotel" } },
            { ja: "\u30DF\u30EB\u30AF", said: "miruku", spelled: "mi-ru-ku", gloss: { en: "milk", es: "milk, leche" } },
            { ja: "\u30DC\u30FC\u30EB", said: "booru", spelled: "bo-o-ru", gloss: { en: "ball", es: "ball, pelota" } }
          ],
          exception: {
            en: "So light and right are both \u30E9\u30A4\u30C8, and only the sentence tells them apart.",
            es: "Por eso light (luz) y right (derecha) son las dos \u30E9\u30A4\u30C8, y solo la oraci\xF3n las distingue."
          }
        },
        "loan-v": {
          title: { en: "v written with the b column", es: "La v escrita con la columna b" },
          rule: {
            en: "An English v is usually written with the b column, \u30D0 \u30D3 \u30D6 \u30D9 \u30DC, and sometimes with \u30F4, a \u30A6 with the two dots.",
            es: "La v del ingl\xE9s se escribe casi siempre con la columna b, \u30D0 \u30D3 \u30D6 \u30D9 \u30DC, y a veces con \u30F4, una \u30A6 con los dos puntos."
          },
          examples: [
            { ja: "\u30C6\u30EC\u30D3", said: "terebi", spelled: "te-re-bi", gloss: { en: "television", es: "television, televisi\xF3n" } },
            { ja: "\u30D3\u30C7\u30AA", said: "bideo", spelled: "bi-de-o", gloss: { en: "video", es: "video" } },
            { ja: "\u30B5\u30FC\u30D3\u30B9", said: "saabisu", spelled: "sa-a-bi-su", gloss: { en: "service", es: "service, servicio" } }
          ],
          exception: {
            en: "Some words are written both ways: \u30D0\u30A4\u30AA\u30EA\u30F3 and \u30F4\u30A1\u30A4\u30AA\u30EA\u30F3 are both violin.",
            es: "Algunas palabras se escriben de las dos formas: \u30D0\u30A4\u30AA\u30EA\u30F3 y \u30F4\u30A1\u30A4\u30AA\u30EA\u30F3 son violin (viol\xEDn)."
          }
        },
        "loan-th": {
          title: { en: "th written with the s or z column", es: "La th escrita con la columna s o z" },
          rule: {
            en: "Japanese has no th, so an English th is written with the s column, or with the z column where the th is voiced, as in smooth.",
            es: "El japon\xE9s no tiene th, as\xED que la th del ingl\xE9s se escribe con la columna s, o con la columna z cuando la th es sonora, como en smooth."
          },
          examples: [
            { ja: "\u30DE\u30E9\u30BD\u30F3", said: "marason", spelled: "ma-ra-so-n", gloss: { en: "marathon", es: "marathon, marat\xF3n" } },
            { ja: "\u30B9\u30EA\u30EB", said: "suriru", spelled: "su-ri-ru", gloss: { en: "thrill", es: "thrill, emoci\xF3n fuerte" } },
            { ja: "\u30B9\u30E0\u30FC\u30BA", said: "sumuuzu", spelled: "su-mu-u-zu", gloss: { en: "smooth", es: "smooth, sin problemas" } }
          ],
          exception: {
            en: "Words taken from German keep a t: \u30C6\u30FC\u30DE (theme) comes from Thema.",
            es: "Las palabras tomadas del alem\xE1n conservan una t: \u30C6\u30FC\u30DE (tema) viene de Thema."
          }
        },
        "loan-si": {
          title: { en: "si, ti and di", es: "si, ti y di" },
          rule: {
            en: "Japanese has no si, ti or di, so an English si is written \u30B7 (shi), and ti and di are written \u30C6\u30A3 and \u30C7\u30A3, or \u30C1 and \u30B8 in older words.",
            es: "El japon\xE9s no tiene si, ti ni di, as\xED que el si del ingl\xE9s se escribe \u30B7 (shi), y ti y di se escriben \u30C6\u30A3 y \u30C7\u30A3, o \u30C1 y \u30B8 en palabras m\xE1s antiguas."
          },
          examples: [
            { ja: "\u30BF\u30AF\u30B7\u30FC", said: "takushii", spelled: "ta-ku-shi-i", gloss: { en: "taxi", es: "taxi" } },
            { ja: "\u30D1\u30FC\u30C6\u30A3\u30FC", said: "paatii", spelled: "pa-a-ti-i", gloss: { en: "party", es: "party, fiesta" } },
            { ja: "\u30E9\u30B8\u30AA", said: "rajio", spelled: "ra-ji-o", gloss: { en: "radio", es: "radio" } }
          ],
          exception: {
            en: "The older spellings stay in common words: \u30C1\u30FC\u30E0 (team) and \u30E9\u30B8\u30AA (radio) are almost never written with \u30C6\u30A3 or \u30C7\u30A3.",
            es: "Las graf\xEDas antiguas se mantienen en palabras comunes: \u30C1\u30FC\u30E0 (equipo) y \u30E9\u30B8\u30AA (radio) casi nunca se escriben con \u30C6\u30A3 ni \u30C7\u30A3."
          }
        },
        "loan-wasei": {
          title: { en: "Made-in-Japan English", es: "Ingl\xE9s hecho en Jap\xF3n" },
          rule: {
            en: "Some katakana words were put together in Japan from English parts, so an English speaker would not know them: they are Japanese words.",
            es: "Algunas palabras en katakana se armaron en Jap\xF3n con piezas del ingl\xE9s, as\xED que un hablante de ingl\xE9s no las conocer\xEDa: son palabras japonesas."
          },
          examples: [
            { ja: "\u30CA\u30A4\u30BF\u30FC", said: "naitaa", spelled: "na-i-ta-a", gloss: { en: "a game played under lights (from nighter)", es: "un partido con luz artificial (de nighter)" } },
            { ja: "\u30B2\u30FC\u30E0\u30BB\u30F3\u30BF\u30FC", said: "geemusentaa", spelled: "ge-e-mu-se-n-ta-a", gloss: { en: "a game arcade (from game center)", es: "un sal\xF3n de videojuegos (de game center)" } },
            { ja: "\u30B5\u30E9\u30EA\u30FC\u30DE\u30F3", said: "sarariiman", spelled: "sa-ra-ri-i-ma-n", gloss: { en: "an office worker (from salaryman)", es: "un oficinista (de salaryman)" } }
          ],
          exception: {
            en: "The dictionary marks only the words it knows were made in Japan, so a word with no mark may still be one.",
            es: "El diccionario marca solo las palabras que sabe que se hicieron en Jap\xF3n, as\xED que una palabra sin marca tambi\xE9n puede serlo."
          }
        },
        "loan-short": {
          title: { en: "Shortened words", es: "Palabras acortadas" },
          rule: {
            en: "Long loanwords are often cut down, usually to the first beats of each English word: personal computer becomes \u30D1\u30BD\u30B3\u30F3.",
            es: "Las palabras prestadas largas suelen acortarse, casi siempre a los primeros tiempos de cada palabra inglesa: personal computer se vuelve \u30D1\u30BD\u30B3\u30F3."
          },
          examples: [
            { ja: "\u30D1\u30BD\u30B3\u30F3", said: "pasokon", spelled: "pa-so-ko-n", gloss: { en: "personal computer", es: "personal computer, computadora personal" } },
            { ja: "\u30EA\u30E2\u30B3\u30F3", said: "rimokon", spelled: "ri-mo-ko-n", gloss: { en: "remote control", es: "remote control, control remoto" } },
            { ja: "\u30B3\u30F3\u30D3\u30CB", said: "konbini", spelled: "ko-n-bi-ni", gloss: { en: "convenience store", es: "convenience store, tienda de conveniencia" } }
          ],
          exception: {
            en: "The long form is often not used at all in Japan: people say \u30D1\u30BD\u30B3\u30F3, not \u30D1\u30FC\u30BD\u30CA\u30EB\u30B3\u30F3\u30D4\u30E5\u30FC\u30BF\u30FC.",
            es: "Muchas veces la forma larga ni se usa en Jap\xF3n: se dice \u30D1\u30BD\u30B3\u30F3, no \u30D1\u30FC\u30BD\u30CA\u30EB\u30B3\u30F3\u30D4\u30E5\u30FC\u30BF\u30FC."
          }
        }
      });
    }
  });

  // js/notes.js
  function tableFor(kind, id) {
    const has2 = (t3) => Object.prototype.hasOwnProperty.call(t3, id);
    if (kind === "sound") return has2(SOUND_NOTES) ? SOUND_NOTES : has2(LOAN_NOTES) ? LOAN_NOTES : null;
    if (kind === "loan") return has2(LOAN_NOTES) ? LOAN_NOTES : null;
    if (kind === "grammar") return has2(GRAMMAR_NOTES) ? GRAMMAR_NOTES : null;
    return null;
  }
  function noteFor(kind, id, lang2 = "en") {
    const table = tableFor(kind, id);
    if (!table) return null;
    const want = LANGS.includes(lang2) ? lang2 : "en";
    let fallback = want !== lang2;
    const pick2 = (v) => {
      if (v === null || v === void 0) return v;
      if (typeof v === "string") return v;
      if (typeof v[want] === "string" && v[want]) return v[want];
      if (want !== "en") fallback = true;
      return typeof v.en === "string" ? v.en : "";
    };
    const note = table[id];
    const out = table === GRAMMAR_NOTES ? resolveGrammar(note, pick2) : resolveSound(note, pick2);
    return { kind, id, lang: want, ...out, fallback };
  }
  function resolveSound(note, pick2) {
    const example = (e) => {
      const r = { ja: e.ja, said: e.said, spelled: e.spelled, gloss: pick2(e.gloss) };
      if (e.kana) r.kana = e.kana;
      if (e.whispered) r.whispered = e.whispered;
      return r;
    };
    const side = (s) => ({ ja: s.ja, said: s.said, gloss: pick2(s.gloss) });
    const out = { title: pick2(note.title), rule: pick2(note.rule), examples: (note.examples || []).map(example) };
    if (note.pair) out.pair = { with: side(note.pair.with), without: side(note.pair.without) };
    if (note.exception) out.exception = pick2(note.exception);
    return out;
  }
  function resolveGrammar(note, pick2) {
    return {
      title: pick2(note.title),
      pattern: pick2(note.pattern),
      meaning: pick2(note.meaning),
      example: { ja: note.example.ja, translation: pick2(note.example) }
    };
  }
  var LANGS;
  var init_notes = __esm({
    "js/notes.js"() {
      init_notes_sounds();
      init_notes_grammar();
      init_notes_loan();
      LANGS = Object.freeze(["en", "es"]);
    }
  });

  // js/search-latin.js
  function foldLatin(text, { enye = true } = {}) {
    let s = String(text ?? "").normalize("NFC").toLowerCase();
    if (enye) s = s.replace(/ñ/g, "");
    s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return enye ? s.replace(/\u0001/g, "\xF1") : s;
  }
  function spanishWords(text, { alone = false } = {}) {
    const all = foldLatin(text).replace(/\([^)]*\)/g, " ").split(/[^a-zñ]+/).filter((w) => w.length > 0);
    const words = all.filter((w) => w.length > 1 && !STOP_ES.has(w));
    if (!words.length && alone && all.length === 1) return all;
    return words;
  }
  function spanishForms(word) {
    const w = String(word);
    const nouns = [];
    const verbs = [];
    const cut = (end) => w.length > end.length + 1 && w.endsWith(end) ? w.slice(0, -end.length) : null;
    const add = (list2, stem, ...ends) => {
      if (stem) for (const e of ends) list2.push(stem + e);
    };
    add(nouns, cut("ces"), "z");
    add(nouns, cut("es"), "");
    add(nouns, cut("s"), "");
    add(nouns, cut("as"), "o", "a");
    add(nouns, cut("os"), "o");
    add(nouns, cut("a"), "o");
    add(verbs, cut("a"), "ar");
    add(verbs, cut("o"), "ar", "er", "ir");
    add(verbs, cut("e"), "ar", "er", "ir");
    add(verbs, cut("i"), "er", "ir");
    for (const [end, to] of [["amos", ["ar"]], ["emos", ["er"]], ["imos", ["ir"]], ["aba", ["ar"]], ["ando", ["ar"]], ["iendo", ["er", "ir"]], ["ado", ["ar"]], ["ido", ["er", "ir"]]]) {
      add(verbs, cut(end), ...to);
    }
    const keep = (list2) => [...new Set(list2)].filter((x) => x !== w && x.length >= 3);
    return { nouns: keep(nouns), verbs: keep(verbs).filter((x) => !nouns.includes(x)) };
  }
  function letters(part) {
    return part.replace(/[āīūēōâîûêô]/g, (c) => MACRON[c]).replace(/m(?=[bmp])/g, "n");
  }
  function romajiReading(q) {
    const parts = String(q ?? "").normalize("NFC").toLowerCase().trim().split(/[\s.,!?;:]+/).flatMap((p) => p.split(/(?<=[a-zāīūēōâîûêô'])-(?=[a-zāīūēōâîûêô])/)).filter(Boolean);
    if (!parts.length) return null;
    let kana = "";
    const starts = [];
    const particles = [];
    for (const [i, raw] of parts.entries()) {
      const s = letters(raw);
      if (!ROMAJI.test(s)) return null;
      const k = toHiragana(s);
      if (!KANA.test(k)) return null;
      starts.push(kana.length);
      if (i > 0 && PARTICLE_PART.test(s)) particles.push(kana.length);
      kana += k;
    }
    return { kana, starts, particles };
  }
  function particleKana(kana) {
    return PARTICLE2[kana] || kana;
  }
  function romajiKana(q) {
    const r = romajiReading(q);
    return r ? r.kana : "";
  }
  function looseRomaji(text) {
    return foldLatin(text, { enye: false }).replace(/[^a-z]/g, "").replace(/m(?=[bp])/g, "n").replace(/ou/g, "o").replace(/ei/g, "e").replace(/([aeiou])\1+/g, "$1").replace(/nn/g, "n").replace(/wo/g, "o");
  }
  function romajiEdits(kana, { words = false } = {}) {
    const s = String(kana || "");
    const out = [];
    const subs = /* @__PURE__ */ new Map();
    const sub = (at2, ch) => {
      if (!subs.has(at2)) {
        subs.set(at2, []);
        out.push({ at: at2, kind: "sub", options: subs.get(at2) });
      }
      if (!subs.get(at2).includes(ch)) subs.get(at2).push(ch);
    };
    let at = 0;
    for (const b of beats(s)) {
      const end = at + b.length;
      const v = vowelOf(b);
      const next2 = s[end];
      if (at > 0 && b.length === 1 && PARTICLE2[b]) sub(at, PARTICLE2[b]);
      if (v && next2 !== "\u30FC") {
        const long = LONG[v];
        if (next2 === long[0]) {
        } else if (v === "o" && next2 === "\u304A" || v === "e" && next2 === "\u3048") {
          sub(end, long[0]);
        } else if (b !== "\u3083" && b !== "\u3085" && b !== "\u3087") {
          out.push({ at: end, kind: "ins", options: [...long] });
        }
      }
      const before = s[at - 1];
      if (words && at > 0 && NA_ROW.has(b[0]) && before !== "\u3093" && before !== "\u3063") {
        out.push({ at, kind: "ins", options: ["\u3093"] });
      }
      if (words && at > 0 && TSU_ROW.has(b[0]) && !"\u3093\u3063\u30FC".includes(before)) {
        out.push({ at, kind: "ins", options: ["\u3063"] });
      }
      at = end;
    }
    return out.sort((a, b) => a.at - b.at || (a.kind === "ins" ? -1 : 1) - (b.kind === "ins" ? -1 : 1));
  }
  function applyEdits(kana, edits, choice) {
    const ins = /* @__PURE__ */ new Map();
    const sub = /* @__PURE__ */ new Map();
    for (const [i, opt] of [...choice].sort((a, b) => a[0] - b[0])) {
      const e = edits[i];
      if (e.kind === "ins") ins.set(e.at, (ins.get(e.at) || "") + e.options[opt]);
      else if (e.kind === "kata") [...e.options[opt]].forEach((ch, k) => sub.set(e.at + k, ch));
      else sub.set(e.at, e.options[opt]);
    }
    let out = "";
    const s = String(kana);
    for (let i = 0; i <= s.length; i += 1) {
      if (ins.has(i)) out += ins.get(i);
      if (i < s.length) out += sub.has(i) ? sub.get(i) : s[i];
    }
    return out;
  }
  function romajiVariants(kana, { limit = 64, most = 3, words = true } = {}) {
    const edits = romajiEdits(kana, { words });
    const out = [{ kana, edits: 0 }];
    const seen = /* @__PURE__ */ new Set([kana]);
    const weight = (choice) => [...choice].reduce((n2, [i]) => n2 + (edits[i].options[0] === "\u3063" ? 2 : 1), 0);
    const pick2 = (k, from, choice) => {
      if (out.length >= limit) return;
      if (choice.size === k) {
        const text = applyEdits(kana, edits, choice);
        const n2 = weight(choice);
        if (n2 <= most && !seen.has(text)) {
          seen.add(text);
          out.push({ kana: text, edits: n2 });
        }
        return;
      }
      for (let i = from; i < edits.length && out.length < limit; i += 1) {
        for (let o = 0; o < edits[i].options.length; o += 1) {
          choice.set(i, o);
          pick2(k, i + 1, choice);
          choice.delete(i);
        }
      }
    };
    for (let k = 1; k <= most && out.length < limit; k += 1) pick2(k, 0, /* @__PURE__ */ new Map());
    return out.map((v, n2) => ({ v, n: n2 })).sort((a, b) => a.v.edits - b.v.edits || a.n - b.n).map((x) => x.v);
  }
  function romajiKanas(q, { limit = 24, most = 2 } = {}) {
    if (lastKanas.q === q) return lastKanas.list;
    const kana = romajiKana(q);
    const list2 = kana ? romajiVariants(kana, { limit, most }).map((v) => v.kana) : [];
    lastKanas = { q, list: list2 };
    return list2;
  }
  function withBar(kata) {
    const bs = beats(String(kata || ""));
    for (let i = 1; i < bs.length; i += 1) {
      const v = vowelOf(bs[i - 1]);
      const b = bs[i];
      const same2 = { a: "\u30A2", i: "\u30A4", u: "\u30A6", e: "\u30A8", o: "\u30AA" }[v];
      if (v && (b === same2 || v === "o" && b === "\u30A6")) bs[i] = "\u30FC";
    }
    return bs.join("");
  }
  function kanaForms(hira) {
    const kata = toKata(hira);
    return [.../* @__PURE__ */ new Set([hira, kata, withBar(kata)])];
  }
  var STOP_ES, plainN, WEAK_ES, MACRON, ROMAJI, KANA, PARTICLE_PART, LONG, PARTICLE2, NA_ROW, TSU_ROW, lastKanas;
  var init_search_latin = __esm({
    "js/search-latin.js"() {
      init_wanakana();
      init_kana();
      STOP_ES = Object.freeze(new Set(`a al algo alguien como con de del e el en es etc ej la las le les lo los
  o p para por que se su sus u un una unas uno unos y`.split(/\s+/)));
      plainN = (w) => String(w).replace(/ñ/g, "n");
      WEAK_ES = Object.freeze(new Set(`mi mis tu tus me te nos os yo muy mucho mucha muchos muchas
  tengo tienes tiene tenemos tienen hay hace estoy estas esta estamos estan soy eres somos son voy vas va`.split(/\s+/)));
      MACRON = Object.freeze({
        \u0101: "aa",
        \u012B: "ii",
        \u016B: "uu",
        \u0113: "ee",
        \u014D: "ou",
        \u00E2: "aa",
        \u00EE: "ii",
        \u00FB: "uu",
        \u00EA: "ee",
        \u00F4: "ou"
      });
      ROMAJI = /^(?:cch|ch|[abdefghijkmnoprstuvwyz'-])+$/;
      KANA = /^[ぁ-ゖー]+$/;
      PARTICLE_PART = /^(?:wa|ha|wo|o|e|he|ni|to|de|ga|mo|no|ka|ya|ne|yo|kara|made|yori)$/;
      LONG = Object.freeze({
        a: ["\u3042"],
        i: ["\u3044"],
        u: ["\u3046"],
        e: ["\u3044", "\u3048"],
        o: ["\u3046", "\u304A"]
      });
      PARTICLE2 = Object.freeze({ \u308F: "\u306F", \u304A: "\u3092", \u3048: "\u3078" });
      NA_ROW = /* @__PURE__ */ new Set([..."\u306A\u306B\u306C\u306D\u306E"]);
      TSU_ROW = /* @__PURE__ */ new Set([..."\u304B\u304D\u304F\u3051\u3053\u3055\u3057\u3059\u305B\u305D\u305F\u3061\u3064\u3066\u3068\u3071\u3074\u3077\u307A\u307D"]);
      lastKanas = { q: null, list: [] };
    }
  });

  // js/search-sentence.js
  var search_sentence_exports = {};
  __export(search_sentence_exports, {
    EDIT_PRICE: () => EDIT_PRICE,
    SENTENCE_BUDGET: () => SENTENCE_BUDGET,
    SENTENCE_STEPS: () => SENTENCE_STEPS,
    readSentence: () => readSentence,
    sentenceWords: () => sentenceWords,
    writtenToken: () => writtenToken
  });
  function overlaps(a, b) {
    const [a0, a1] = spanOf(a);
    const [b0, b1] = spanOf(b);
    if (a.kind === "ins" && b.kind === "ins") return false;
    if (a.kind === "ins") return a0 > b0 && a0 < b1;
    if (b.kind === "ins") return b0 > a0 && b0 < a1;
    return a0 < b1 && b0 < a1;
  }
  function sureness(kana, dict2, price) {
    const { path } = pathOf(kana, dict2, {});
    const guessed = path.filter((n2) => !n2.rec && !n2.tsu && !["prt", "cop", "num"].includes(n2.cls)).map((n2) => [n2.i, n2.j]);
    const opening = path.length > 1 && path[0].cls === "prt" ? [[path[0].i, path[0].j]] : [];
    const cost = path.length ? path[path.length - 1].total + price : Infinity;
    return { score: [guessed.length, cost, path.length], guessed, doubtful: [...guessed, ...opening] };
  }
  function writtenToken(t3) {
    const rec = t3.entry;
    if (!rec || rec.u || !Array.isArray(rec.k) || !rec.k.length || [...t3.surface].some(isKanji2)) return t3.surface;
    const spelling = rec.k[0];
    const base = toHira(t3.base || t3.surface);
    let tail = 0;
    while (tail < spelling.length && tail < base.length && spelling[spelling.length - 1 - tail] === base[base.length - 1 - tail]) tail += 1;
    const stem = base.slice(0, base.length - tail);
    const surface = toHira(t3.surface);
    if (!surface.startsWith(stem) || tail === spelling.length) return t3.surface;
    return spelling.slice(0, spelling.length - tail) + t3.surface.slice(stem.length);
  }
  async function readSentence(kana, edits, dict2, { forced = /* @__PURE__ */ new Map(), budget = SENTENCE_BUDGET } = {}) {
    await dict2.ready();
    const choice = new Map(forced);
    let text = applyEdits(kana, edits, choice);
    const asked2 = /* @__PURE__ */ new Set();
    const need = (texts) => {
      const fresh = [];
      for (const t3 of texts) for (const k of keysForRun(t3, dict2.maxKey)) if (!asked2.has(k)) {
        asked2.add(k);
        fresh.push(k);
      }
      return fresh.length ? dict2.need(fresh) : Promise.resolve();
    };
    await need([text]);
    let best = sureness(text, dict2, 0);
    let tried = 1;
    const free = priceOfChoice(edits, forced);
    const placeOf2 = (e) => e.at + [...choice].filter(([i]) => edits[i].kind === "ins" && edits[i].at < e.at).length;
    for (let step = 0; step < SENTENCE_STEPS && tried < budget; step += 1) {
      const near = (e) => best.doubtful.some(([i, j]) => placeOf2(e) >= i - 2 && placeOf2(e) <= j + 2);
      const next2 = [];
      for (let i = 0; i < edits.length; i += 1) {
        if (choice.has(i) || edits[i].kind === "ins" && !near(edits[i])) continue;
        if ([...choice.keys()].some((k) => overlaps(edits[k], edits[i]))) continue;
        for (let o = 0; o < edits[i].options.length; o += 1) {
          const c = new Map(choice).set(i, o);
          next2.push({ c, text: applyEdits(kana, edits, c) });
        }
      }
      const batch = next2.slice(0, budget - tried);
      if (!batch.length) break;
      await need(batch.map((n2) => n2.text));
      let won = null;
      for (const n2 of batch) {
        n2.sure = sureness(n2.text, dict2, priceOfChoice(edits, n2.c) - free);
        tried += 1;
        if (better(n2.sure.score, (won ? won.sure : best).score) < 0) won = n2;
      }
      if (!won) break;
      choice.clear();
      for (const [k, v] of won.c) choice.set(k, v);
      text = won.text;
      best = won.sure;
    }
    const a = await analyzeCore(text, { dict: dict2 });
    return {
      kana: text,
      tokens: a.tokens,
      guesses: a.unknown,
      tried,
      written: writtenToken
    };
  }
  function sentenceWords(tokens) {
    return tokens.filter((t3) => WORD_KINDS.has(t3.kind) && t3.entry && t3.confidence !== "guess");
  }
  var SENTENCE_BUDGET, SENTENCE_STEPS, EDIT_PRICE, priceOf, spanOf, WORD_KINDS, priceOfChoice, better;
  var init_search_sentence = __esm({
    "js/search-sentence.js"() {
      init_lattice();
      init_analyze();
      init_search_latin();
      init_kana();
      SENTENCE_BUDGET = 48;
      SENTENCE_STEPS = 4;
      EDIT_PRICE = Object.freeze({
        particle: 10,
        sub: 20,
        kata: 20,
        ins: 40
      });
      priceOf = (edit, option) => {
        if (edit.kind === "ins") return EDIT_PRICE.ins;
        if (edit.kind === "kata") return EDIT_PRICE.kata;
        return "\u306F\u3092\u3078".includes(edit.options[option]) ? EDIT_PRICE.particle : EDIT_PRICE.sub;
      };
      spanOf = (e) => e.kind === "ins" ? [e.at, e.at] : [e.at, e.at + (e.kind === "kata" ? e.len : 1)];
      WORD_KINDS = /* @__PURE__ */ new Set(["word", "inflected", "katakana", "copula", "number"]);
      priceOfChoice = (edits, choice) => [...choice].reduce((n2, [i, o]) => n2 + priceOf(edits[i], o), 0);
      better = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    }
  });

  // ../yomu-ios/bridge/shims.js
  var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (typeof globalThis.atob !== "function") {
    globalThis.atob = (input) => {
      const s = String(input).replace(/[\s=]+/g, "");
      let out = "";
      let buffer = 0;
      let bits = 0;
      for (const ch of s) {
        const v = ALPHABET.indexOf(ch);
        if (v < 0) throw new Error("atob: not base64");
        buffer = buffer << 6 | v;
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          out += String.fromCharCode(buffer >> bits & 255);
        }
      }
      return out;
    };
  }
  if (typeof globalThis.console !== "object" || globalThis.console === null) {
    const say2 = (level) => (...args) => {
      if (typeof globalThis.__log !== "function") return;
      globalThis.__log(level, args.map((a) => a instanceof Error ? `${a.name}: ${a.message}` : String(a)).join(" "));
    };
    globalThis.console = { log: say2("log"), info: say2("info"), warn: say2("warn"), error: say2("error"), debug: say2("debug") };
  }

  // ../yomu-ios/bridge/entry.js
  init_dict();
  init_analyze();
  init_notes();

  // js/strings-collect.js
  var COLLECT_STRINGS = Object.freeze({
    // The reader: asked once, after the first read.
    rememberAskTitle: { en: "Remember what you read?", es: "\xBFRecordar lo que lees?" },
    rememberAskBody: {
      en: "Yomu can keep the texts you read in this browser, tell you when you read one before, keep a History, and show the sentence each kanji was last seen in. Nothing is sent anywhere.",
      es: "Yomu puede guardar en este navegador los textos que lees, avisarte cuando ya le\xEDste uno, llevar un historial y mostrar la oraci\xF3n en la que viste cada kanji por \xFAltima vez. No se env\xEDa nada a ning\xFAn lado."
    },
    rememberYes: { en: "Remember", es: "Recordar" },
    rememberNo: { en: "No thanks", es: "No, gracias" },
    rememberOnToast: {
      en: "Remembering what you read. History is under My kanji.",
      es: "Se recordar\xE1 lo que lees. El historial est\xE1 en Mis kanji."
    },
    // "You read this before", under the status line.
    whenToday: { en: "today", es: "hoy" },
    whenYesterday: { en: "yesterday", es: "ayer" },
    whenOn: { en: "on {day}", es: "el {day}" },
    seenBeforeOnce: { en: "You read this before: once, {when}.", es: "Ya le\xEDste esto: una vez, {when}." },
    seenBeforeMany: { en: "You read this before: {n} times, last {when}.", es: "Ya le\xEDste esto: {n} veces, la \xFAltima {when}." },
    partInside: { en: "This is part of a text you read {when}.", es: "Esto es parte de un texto que le\xEDste {when}." },
    partHolds: { en: "This holds a text you read {when}.", es: "Esto contiene un texto que le\xEDste {when}." },
    // The reader's kanji table, and the toast after a read.
    newChip: { en: "New", es: "Nuevo" },
    toastNewOne: { en: "New for your collection: {list}", es: "Nuevo en tu colecci\xF3n: {list}" },
    toastNewMany: { en: "New for your collection: {list}", es: "Nuevos en tu colecci\xF3n: {list}" },
    toastJoyo: { en: "J\u014Dy\u014D: {have} of {total}.", es: "J\u014Dy\u014D: {have} de {total}." },
    toastCount: { en: "{n} j\u014Dy\u014D kanji!", es: "\xA1{n} kanji j\u014Dy\u014D!" },
    toastGrade: { en: "{grade} complete!", es: "\xA1Completaste {grade}!" },
    // My kanji's three places.
    navLabel: { en: "My kanji sections", es: "Secciones de Mis kanji" },
    navReview: { en: "Review", es: "Repaso" },
    navCollection: { en: "Collection", es: "Colecci\xF3n" },
    navHistory: { en: "History", es: "Historial" },
    // The shelves.
    grade1: { en: "1st grade", es: "1.er grado" },
    grade2: { en: "2nd grade", es: "2.\xBA grado" },
    grade3: { en: "3rd grade", es: "3.er grado" },
    grade4: { en: "4th grade", es: "4.\xBA grado" },
    grade5: { en: "5th grade", es: "5.\xBA grado" },
    grade6: { en: "6th grade", es: "6.\xBA grado" },
    grade8: { en: "Secondary school", es: "Secundaria" },
    shelfExtra: { en: "Extra", es: "Extra" },
    shelfExtraLead: {
      en: "Kanji you read that are not on the j\u014Dy\u014D list: names, older forms, rarer characters.",
      es: "Kanji que le\xEDste y que no est\xE1n en la lista j\u014Dy\u014D: nombres, formas antiguas, caracteres menos comunes."
    },
    // The Collection screen.
    collectionHead: { en: "Your collection", es: "Tu colecci\xF3n" },
    collectionLead: {
      en: "Every kanji you read joins your collection. The shelves are the 2,136 j\u014Dy\u014D kanji, the ones taught in Japanese schools, by grade.",
      es: "Cada kanji que lees entra en tu colecci\xF3n. Los estantes son los 2136 kanji j\u014Dy\u014D, los que se ense\xF1an en las escuelas de Jap\xF3n, por grado."
    },
    collectionSum: { en: "{have} of {total} j\u014Dy\u014D kanji", es: "{have} de {total} kanji j\u014Dy\u014D" },
    collectionExtra: { en: "+{n} outside the j\u014Dy\u014D list", es: "+{n} fuera de la lista j\u014Dy\u014D" },
    lookOutHead: { en: "Look out for", es: "Pr\xF3ximos por encontrar" },
    lookOutLead: {
      en: "The commonest kanji of {grade} you have not met yet.",
      es: "Los kanji m\xE1s comunes de {grade} que todav\xEDa no viste."
    },
    allCollected: { en: "Every j\u014Dy\u014D kanji is in your collection.", es: "Todos los kanji j\u014Dy\u014D est\xE1n en tu colecci\xF3n." },
    shelvesHead: { en: "Shelves", es: "Estantes" },
    filterAll: { en: "All", es: "Todos" },
    filterHave: { en: "Collected", es: "En tu colecci\xF3n" },
    filterNot: { en: "Not yet", es: "Todav\xEDa no" },
    shelfOf: { en: "{have} of {total}", es: "{have} de {total}" },
    shelfComplete: { en: "Complete", es: "Completo" },
    shelfNone: { en: "None on this shelf.", es: "Ninguno en este estante." },
    tileSeenOne: { en: "{ch}, seen in 1 text", es: "{ch}, visto en 1 texto" },
    tileSeen: { en: "{ch}, seen in {n} texts", es: "{ch}, visto en {n} textos" },
    tileNot: { en: "{ch}, not collected yet", es: "{ch}, todav\xEDa no est\xE1 en tu colecci\xF3n" },
    joyoLoading: { en: "Loading the j\u014Dy\u014D list", es: "Cargando la lista j\u014Dy\u014D" },
    joyoFailed: { en: "Could not load the j\u014Dy\u014D list ({detail}).", es: "No se pudo cargar la lista j\u014Dy\u014D ({detail})." },
    // The kanji dialog.
    jlptOld: { en: "old JLPT level {n}", es: "nivel {n} del JLPT antiguo" },
    jlptN: { en: "JLPT N{n}, unofficial list", es: "JLPT N{n}, lista no oficial" },
    seenSpanOne: { en: "Seen in 1 text, {day}.", es: "Visto en 1 texto: {day}." },
    seenSpanMany: { en: "Seen in {n} texts, first {first}, last {last}.", es: "Visto en {n} textos: el primero {first}, el \xFAltimo {last}." },
    notCollected: {
      en: "Not collected yet: it joins your collection the first time you read a text with it.",
      es: "Todav\xEDa no est\xE1 en tu colecci\xF3n: entra la primera vez que leas un texto que lo tenga."
    },
    dialogSaved: { en: "Saved to My kanji", es: "Guardado en Mis kanji" },
    dialogNotSaved: { en: "Not saved to My kanji", es: "Sin guardar en Mis kanji" },
    // Where a kanji was last seen.
    lastSeenIn: { en: "Last seen in:", es: "Visto por \xFAltima vez en:" },
    lastSeen: { en: "Last seen {day}", es: "Visto por \xFAltima vez: {day}" },
    lastSeenPaste: { en: "Last seen {day}, in a text you pasted", es: "Visto por \xFAltima vez: {day}, en un texto que pegaste" },
    lastSeenTyped: { en: "Last seen {day}, in a text you typed", es: "Visto por \xFAltima vez: {day}, en un texto que escribiste" },
    lastSeenExample: { en: "Last seen {day}, in an example", es: "Visto por \xFAltima vez: {day}, en un ejemplo" },
    lastSeenPhrase: { en: "Last seen {day}, in a phrase from the library", es: "Visto por \xFAltima vez: {day}, en una frase de la biblioteca" },
    lastSeenHost: { en: "Last seen {day}, in a text Runcible sent", es: "Visto por \xFAltima vez: {day}, en un texto que envi\xF3 Runcible" },
    lastSeenLink: { en: "Last seen {day}, from a link", es: "Visto por \xFAltima vez: {day}, desde un enlace" },
    lastSeenHistory: { en: "Last seen {day}, from your History", es: "Visto por \xFAltima vez: {day}, desde tu historial" },
    // The History screen.
    rememberHead: { en: "Remember what I read", es: "Recordar lo que leo" },
    rememberIsOn: {
      en: "On. Yomu keeps the texts you read in this browser, up to 300 of them, and tells you when you read one before.",
      es: "Activado. Yomu guarda en este navegador los textos que lees, hasta 300, y te avisa cuando ya le\xEDste uno."
    },
    rememberIsOff: {
      en: "Off. Yomu keeps no text you read unless you save it, only which kanji you met and how often. Turn it on to keep a History, to hear when you read a text before, and to see the sentence each kanji was last seen in. The texts stay in this browser.",
      es: "Desactivado. Yomu no guarda ning\xFAn texto que lees salvo los que guardes, solo qu\xE9 kanji viste y cu\xE1ntas veces. Act\xEDvalo para llevar un historial, saber cu\xE1ndo ya le\xEDste un texto y ver la oraci\xF3n en la que viste cada kanji por \xFAltima vez. Los textos se quedan en este navegador."
    },
    turnOn: { en: "Turn on", es: "Activar" },
    turnOff: { en: "Turn off", es: "Desactivar" },
    turnedOn: { en: "Remembering is on.", es: "Recordar est\xE1 activado." },
    turnedOff: { en: "Remembering is off.", es: "Recordar est\xE1 desactivado." },
    turnedOffForgot: { en: "Remembering is off, and every text was forgotten.", es: "Recordar est\xE1 desactivado y se olvidaron todos los textos." },
    offTitleOne: { en: "Stop remembering and forget the text you read?", es: "\xBFDejar de recordar y olvidar el texto que le\xEDste?" },
    offTitleMany: { en: "Stop remembering and forget the {n} texts?", es: "\xBFDejar de recordar y olvidar los {n} textos?" },
    offBody: {
      en: "Every text in History is forgotten in this browser. Your kanji, their counts and your collection stay.",
      es: "Se olvida en este navegador cada texto del historial. Tus kanji, sus conteos y tu colecci\xF3n se quedan."
    },
    offYes: { en: "Forget and turn off", es: "Olvidar y desactivar" },
    historyListHead: { en: "Texts you read", es: "Textos que le\xEDste" },
    historyFilterHint: {
      en: "Part of the text as written. Hiragana and katakana find each other, and romaji finds kana.",
      es: "Una parte del texto tal como est\xE1 escrito. Hiragana y katakana se encuentran entre s\xED, y el romaji encuentra kana."
    },
    historyEmpty: {
      en: "Nothing here yet. The texts you read from now on are listed here, the latest first.",
      es: "Todav\xEDa no hay nada. Aqu\xED aparecen los textos que leas desde ahora, primero el \xFAltimo."
    },
    historyFilterNone: { en: "No text matches the filter.", es: "Ning\xFAn texto coincide con el filtro." },
    readOnce: { en: "Read once", es: "Le\xEDdo una vez" },
    readTimes: { en: "Read {n} times", es: "Le\xEDdo {n} veces" },
    lastOn: { en: "last {day}", es: "\xFAltimo: {day}" },
    firstOn: { en: "first {day}", es: "primero: {day}" },
    srcPaste: { en: "pasted", es: "pegado" },
    srcTyped: { en: "typed", es: "escrito" },
    srcExample: { en: "an example", es: "un ejemplo" },
    srcPhrase: { en: "a phrase", es: "una frase" },
    srcLink: { en: "from a link", es: "desde un enlace" },
    srcHost: { en: "from Runcible", es: "desde Runcible" },
    srcHistory: { en: "from History", es: "desde el historial" },
    readAgain: { en: "Read again", es: "Leer otra vez" },
    forget: { en: "Forget", es: "Olvidar" },
    forgetAll: { en: "Forget all", es: "Olvidar todo" },
    forgetAllTitle: { en: "Forget every text in History?", es: "\xBFOlvidar todos los textos del historial?" },
    forgetAllBody: {
      en: "Remembering stays on, so the texts you read from now on are kept. Your kanji, their counts and your collection stay.",
      es: "Recordar sigue activado, as\xED que se guardan los textos que leas desde ahora. Tus kanji, sus conteos y tu colecci\xF3n se quedan."
    },
    forgotOne: { en: "That text is forgotten.", es: "Ese texto se olvid\xF3." },
    forgotAll: { en: "History is empty now.", es: "El historial qued\xF3 vac\xEDo." },
    historyDamaged: {
      en: "Your History could not be read, so it started empty. A copy of the old data is kept in this browser until you forget all.",
      es: "No se pudo leer tu historial, as\xED que empez\xF3 vac\xEDo. Una copia de los datos anteriores queda en este navegador hasta que olvides todo."
    },
    historyPartial: {
      en: "Part of your History could not be read and was left out ({n} entries).",
      es: "Una parte de tu historial no se pudo leer y qued\xF3 fuera ({n} entradas)."
    },
    historyBlocked: {
      en: "This browser is not keeping History, so it lasts until this page closes.",
      es: "Este navegador no est\xE1 guardando el historial, as\xED que dura hasta que se cierre esta p\xE1gina."
    },
    // Saving a text on purpose: the reader's bookmark and History's rows.
    saveText: { en: "Save this text", es: "Guardar este texto" },
    textSaved: { en: "Saved. Your saved phrases are in History.", es: "Guardado. Tus frases guardadas est\xE1n en el historial." },
    textSavedOnly: {
      en: "Saved, in History. Until you turn on Remember, Yomu keeps only the texts you save.",
      es: "Guardado, en el historial. Hasta que actives Recordar, Yomu guarda solo los textos que guardes."
    },
    textUnsaved: { en: "Unsaved. It stays in History as a text you read.", es: "Ya no est\xE1 guardado. Sigue en el historial como un texto que le\xEDste." },
    textUnsavedGone: {
      en: "Unsaved and forgotten: Remember is not on, so nothing else keeps it.",
      es: "Ya no est\xE1 guardado y se olvid\xF3: Recordar no est\xE1 activado, as\xED que nada m\xE1s lo guarda."
    },
    savedFull: {
      en: "You have {n} saved phrases, the most Yomu keeps, so this one was not saved. Unsave one in History first.",
      es: "Tienes {n} frases guardadas, el m\xE1ximo que guarda Yomu, as\xED que esta no se guard\xF3. Primero quita una de las guardadas en el historial."
    },
    rowSaved: { en: "Saved. It is under Saved phrases now.", es: "Guardado. Ahora est\xE1 en Frases guardadas." },
    rowUnsaved: { en: "Unsaved. It is back under Texts you read.", es: "Ya no est\xE1 guardado. Volvi\xF3 a Textos que le\xEDste." },
    savedPhrasesHead: { en: "Saved phrases", es: "Frases guardadas" },
    savedPhrasesLead: {
      en: "Texts you saved with the bookmark. They stay until you unsave them, whether Remember is on or off, and Export in My kanji writes them to your backup.",
      es: "Textos que guardaste con el marcador. Se quedan hasta que los quites, con Recordar activado o no, y Exportar, en Mis kanji, los escribe en tu copia."
    },
    savedFilterNone: { en: "No saved phrase matches the filter.", es: "Ninguna frase guardada coincide con el filtro." },
    phraseSavedOn: { en: "Saved {day}", es: "Guardada: {day}" },
    phraseReadOnce: { en: "read once", es: "le\xEDda una vez" },
    phraseReadTimes: { en: "read {n} times", es: "le\xEDda {n} veces" },
    phraseLastOn: { en: "last {day}", es: "\xFAltima: {day}" },
    forgetUnsavedOne: { en: "Forget the text you did not save?", es: "\xBFOlvidar el texto que no guardaste?" },
    forgetUnsavedMany: { en: "Forget the {n} texts you did not save?", es: "\xBFOlvidar los {n} textos que no guardaste?" },
    keepSavedOne: { en: "Your saved phrase stays.", es: "Tu frase guardada se queda." },
    keepSavedMany: { en: "Your {n} saved phrases stay.", es: "Tus {n} frases guardadas se quedan." },
    offTitleUnsavedOne: {
      en: "Stop remembering and forget the text you did not save?",
      es: "\xBFDejar de recordar y olvidar el texto que no guardaste?"
    },
    offTitleUnsavedMany: {
      en: "Stop remembering and forget the {n} texts you did not save?",
      es: "\xBFDejar de recordar y olvidar los {n} textos que no guardaste?"
    },
    offBodyKept: {
      en: "Every text you did not save is forgotten in this browser. Your kanji, their counts and your collection stay.",
      es: "Se olvida en este navegador cada texto que no guardaste. Tus kanji, sus conteos y tu colecci\xF3n se quedan."
    },
    turnedOffKept: {
      en: "Remembering is off. The texts you did not save were forgotten; your saved phrases stay.",
      es: "Recordar est\xE1 desactivado. Se olvidaron los textos que no guardaste; tus frases guardadas se quedan."
    },
    forgotUnsaved: {
      en: "The texts you did not save are forgotten. Your saved phrases stay.",
      es: "Se olvidaron los textos que no guardaste. Tus frases guardadas se quedan."
    },
    importedPhrasesOne: {
      en: "1 saved phrase added or updated.",
      es: "1 frase guardada nueva o actualizada."
    },
    importedPhrasesMany: {
      en: "{n} saved phrases added or updated.",
      es: "{n} frases guardadas nuevas o actualizadas."
    },
    importPhrasesFullOne: {
      en: "1 more did not fit: 500 saved phrases is the most.",
      es: "Otra no cupo: 500 frases guardadas es el m\xE1ximo."
    },
    importPhrasesFullMany: {
      en: "{n} more did not fit: 500 saved phrases is the most.",
      es: "Otras {n} no cupieron: 500 frases guardadas es el m\xE1ximo."
    }
  });

  // js/strings-play.js
  var PLAY_STRINGS = Object.freeze({
    play: { en: "Play", es: "Jugar" },
    playLead: {
      en: "Five short games: the characters that look alike, and where one word ends and the next begins. Your best scores stay in this browser.",
      es: "Cinco juegos cortos: los caracteres que se parecen, y d\xF3nde termina una palabra y empieza la siguiente. Tus mejores puntajes se quedan en este navegador."
    },
    backToPlay: { en: "Back to Play", es: "Volver a Jugar" },
    // The four games, as the list names them.
    gameWhich: { en: "Which one?", es: "\xBFCu\xE1l es?" },
    gameWhichLead: {
      en: "Pick the kana for a sound, or the kanji for a meaning, among the ones that look like it.",
      es: "Elige el kana de un sonido, o el kanji de un significado, entre los que se le parecen."
    },
    gameOdd: { en: "Odd one out", es: "El intruso" },
    gameOddLead: {
      en: "Find the one character that differs in a grid of its look-alike.",
      es: "Encuentra el \xFAnico car\xE1cter distinto en un cuadro lleno de su parecido."
    },
    gameTwins: { en: "Twins across scripts", es: "Gemelos entre escrituras" },
    gameTwinsLead: {
      en: "Tell \u30AB from \u529B and \u30FC from \u4E00 by the word around them.",
      es: "Distingue \u30AB de \u529B y \u30FC de \u4E00 por la palabra que los rodea."
    },
    gameNames: { en: "Name decoder", es: "Descifra el nombre" },
    gameNamesLead: {
      en: "Read a name written in katakana and pick how it is spelled where it comes from.",
      es: "Lee un nombre escrito en katakana y elige c\xF3mo se escribe en su idioma de origen."
    },
    gameSpaces: { en: "Where are the spaces?", es: "\xBFD\xF3nde van los espacios?" },
    gameSpacesLead: {
      en: "Japanese is written with no spaces. Mark where each word ends, and see what gives it away.",
      es: "El japon\xE9s se escribe sin espacios. Marca d\xF3nde termina cada palabra y mira qu\xE9 lo delata."
    },
    bestOf: { en: "Best: {n} of {of}", es: "Mejor: {n} de {of}" },
    bestPoints: { en: "Best: {n} points", es: "Mejor: {n} puntos" },
    bestPointOne: { en: "Best: 1 point", es: "Mejor: 1 punto" },
    bestTimed: { en: "Best: {n} in 60 seconds", es: "Mejor: {n} en 60 segundos" },
    bestFree: { en: "untimed: {n} of {of}", es: "sin tiempo: {n} de {of}" },
    bestNone: { en: "Not played yet", es: "Todav\xEDa sin jugar" },
    roundsOne: { en: "1 round", es: "1 ronda" },
    roundsMany: { en: "{n} rounds", es: "{n} rondas" },
    start: { en: "Start", es: "Empezar" },
    namesMissing: {
      en: "Not available yet: the list of names comes with the next dictionary update.",
      es: "Todav\xEDa no est\xE1 disponible: la lista de nombres llega con la pr\xF3xima actualizaci\xF3n del diccionario."
    },
    namesLoading: { en: "Checking the list of names", es: "Revisando la lista de nombres" },
    namesFailed: { en: "Could not load the list of names ({detail}).", es: "No se pudo cargar la lista de nombres ({detail})." },
    namesFew: { en: "The list of names is too short to play.", es: "La lista de nombres es demasiado corta para jugar." },
    lookalikesLoading: { en: "Loading the kanji that look alike", es: "Cargando los kanji que se parecen" },
    lookalikesFailed: {
      en: "Could not load the kanji that look alike ({detail}).",
      es: "No se pudieron cargar los kanji que se parecen ({detail})."
    },
    // A question.
    questionOf: { en: "Question {at} of {of}", es: "Pregunta {at} de {of}" },
    next: { en: "Next", es: "Siguiente" },
    seeScore: { en: "See the score", es: "Ver el resultado" },
    rightMark: { en: "Right.", es: "\xA1Correcto!" },
    wrongMark: { en: "Not that one. The right one is marked.", es: "No es esa. La correcta est\xE1 marcada." },
    optRight: { en: "the right answer", es: "la respuesta correcta" },
    optYours: { en: "your answer", es: "tu respuesta" },
    hear: { en: "Hear it", es: "Escuchar" },
    keysFour: {
      en: "Keys: 1 to 4 answer, Enter or Space goes on, Escape leaves.",
      es: "Teclas: de 1 a 4 responden, Enter o Espacio siguen, Escape sale."
    },
    keysThree: {
      en: "Keys: 1 to 3 answer, Enter or Space goes on, Escape leaves.",
      es: "Teclas: de 1 a 3 responden, Enter o Espacio siguen, Escape sale."
    },
    keysGrid: {
      en: "Keys: the arrows move in the grid, Enter or Space picks, Escape leaves.",
      es: "Teclas: las flechas se mueven por el cuadro, Enter o Espacio eligen, Escape sale."
    },
    // Which one?
    modeShow: { en: "Characters", es: "Caracteres" },
    modeKana: { en: "Kana", es: "Kana" },
    modeKanji: { en: "Kanji", es: "Kanji" },
    whichKana: { en: "Which one is {romaji}?", es: "\xBFCu\xE1l es {romaji}?" },
    whichKanji: { en: "Which kanji is this?", es: "\xBFQu\xE9 kanji es este?" },
    poolFilled: {
      en: "Your collection has {n} kanji with look-alikes, so this round adds kanji from the 1st and 2nd grade.",
      es: "Tu colecci\xF3n tiene {n} kanji con parecidos, as\xED que esta ronda agrega kanji de 1.er y 2.\xBA grado."
    },
    poolFilledNone: {
      en: "Your collection has no kanji with look-alikes yet, so this round uses the 1st and 2nd grade.",
      es: "Tu colecci\xF3n todav\xEDa no tiene kanji con parecidos, as\xED que esta ronda usa los de 1.er y 2.\xBA grado."
    },
    // Odd one out.
    modeLabel: { en: "Mode", es: "Modo" },
    modeTimed: { en: "60 seconds", es: "60 segundos" },
    modeFree: { en: "Untimed", es: "Sin tiempo" },
    oddPrompt: { en: "Find the one that is not {ch}.", es: "Encuentra el que no es {ch}." },
    timedIntro: {
      en: "Find as many as you can in 60 seconds. A wrong tap costs 3 seconds. The clock starts when you do.",
      es: "Encuentra todos los que puedas en 60 segundos. Un toque equivocado cuesta 3 segundos. El reloj empieza cuando t\xFA empiezas."
    },
    freeIntro: {
      en: "Ten grids, no clock. A grid found with no wrong tap scores.",
      es: "Diez cuadros, sin reloj. Suma el cuadro que encuentras sin ning\xFAn toque equivocado."
    },
    startClock: { en: "Start the clock", es: "Iniciar el reloj" },
    timeLeft: { en: "{n} s left", es: "Quedan {n} s" },
    foundSoFar: { en: "Found: {n}", es: "Encontrados: {n}" },
    gridOf: { en: "Grid {at} of {of}", es: "Cuadro {at} de {of}" },
    oddMissTimed: { en: "Not that one: 3 seconds off.", es: "No es ese: 3 segundos menos." },
    oddMissFree: { en: "Not that one. Keep looking.", es: "No es ese. Sigue buscando." },
    oddFound: { en: "Found it.", es: "\xA1Lo encontraste!" },
    oddLast: { en: "Last grid:", es: "Cuadro anterior:" },
    gridLabel: { en: "Grid of {n} characters", es: "Cuadro de {n} caracteres" },
    // Twins across scripts.
    twinsPrompt: { en: "Which script is the marked character in this word?", es: "\xBFEn qu\xE9 escritura est\xE1 el car\xE1cter marcado en esta palabra?" },
    scriptHiragana: { en: "Hiragana", es: "Hiragana" },
    scriptKatakana: { en: "Katakana", es: "Katakana" },
    scriptKanji: { en: "Kanji", es: "Kanji" },
    twinsIs: { en: "Here {ch} is {script}.", es: "Aqu\xED {ch} es {script}." },
    // Name decoder.
    namesPrompt: { en: "How is this name spelled where it comes from?", es: "\xBFC\xF3mo se escribe este nombre en su idioma de origen?" },
    namePerson: { en: "a name", es: "un nombre" },
    namePlace: { en: "a place", es: "un lugar" },
    nameReads: { en: "{kana} reads {romaji}: {orig}", es: "{kana} se lee {romaji}: {orig}" },
    // Where are the spaces?
    spacesLoading: { en: "Loading the lines", es: "Cargando las l\xEDneas" },
    spacesFailed: { en: "Could not load the lines ({detail}).", es: "No se pudieron cargar las l\xEDneas ({detail})." },
    spacesFew: { en: "There are too few lines to play.", es: "Hay muy pocas l\xEDneas para jugar." },
    spacesPrompt: {
      en: "Where does one word end and the next begin? Mark each place, then check.",
      es: "\xBFD\xF3nde termina una palabra y empieza la siguiente? Marca cada lugar y luego comprueba."
    },
    spacesTier1: { en: "All hiragana: look for the particles.", es: "Todo en hiragana: busca las part\xEDculas." },
    // Tier 2 names the scripts its line holds (play-spaces.js tierHint): K kanji, T katakana, H hiragana.
    spacesTier2KTH: { en: "Kanji, katakana and hiragana: the script changes too.", es: "Kanji, katakana e hiragana: la escritura tambi\xE9n cambia." },
    spacesTier2KH: { en: "Kanji and hiragana: the script changes too.", es: "Kanji e hiragana: la escritura tambi\xE9n cambia." },
    spacesTier2TH: { en: "Katakana and hiragana: the script changes too.", es: "Katakana e hiragana: la escritura tambi\xE9n cambia." },
    spacesTier2KT: { en: "Kanji and katakana: the script changes too.", es: "Kanji y katakana: la escritura tambi\xE9n cambia." },
    spacesTier2K: { en: "All kanji: look for where each word ends.", es: "Todo en kanji: busca d\xF3nde termina cada palabra." },
    spacesTier2T: { en: "All katakana: look for where each word ends.", es: "Todo en katakana: busca d\xF3nde termina cada palabra." },
    spacesTier2H: { en: "All hiragana: look for the particles.", es: "Todo en hiragana: busca las part\xEDculas." },
    spacesTier2Any: { en: "Look for where each word ends.", es: "Busca d\xF3nde termina cada palabra." },
    spacesTier3: { en: "A katakana compound: two words written as one.", es: "Un compuesto en katakana: dos palabras escritas como una." },
    spacesBoard: { en: "The places between the characters", es: "Los lugares entre los caracteres" },
    spacesBetween: { en: "between {a} and {b}", es: "entre {a} y {b}" },
    spacesCheck: { en: "Check", es: "Comprobar" },
    spacesAllRight: { en: "Right: every space, and none extra.", es: "\xA1Correcto! Todos los espacios, y ninguno de m\xE1s." },
    spacesNotQuite: { en: "Not quite. The marks show what was missed and what is extra.", es: "Casi. Las marcas muestran lo que falt\xF3 y lo que sobra." },
    spacesTally: {
      en: "Spaces found: {right} of {of}. Extra: {extra}. Points: {score}.",
      es: "Espacios encontrados: {right} de {of}. De m\xE1s: {extra}. Puntos: {score}."
    },
    spacesFound: { en: "found", es: "encontrado" },
    spacesMissed: { en: "missed", es: "falt\xF3" },
    spacesExtra: { en: "extra", es: "de m\xE1s" },
    spacesMarkFound: { en: "a space, found", es: "un espacio, encontrado" },
    spacesMarkMissed: { en: "a space, missed", es: "un espacio que falt\xF3" },
    spacesMarkExtra: { en: "no space goes here", es: "aqu\xED no va un espacio" },
    keysSpaces: {
      en: "Keys: the arrows move between the places, Space marks one or clears it, Enter checks, then Enter or Space goes on, Escape leaves.",
      es: "Teclas: las flechas se mueven entre los lugares, Espacio marca uno o lo quita, Enter comprueba; despu\xE9s, Enter o Espacio siguen, Escape sale."
    },
    resultPoints: { en: "{n} points", es: "{n} puntos" },
    resultPointOne: { en: "1 point", es: "1 punto" },
    resultSpaces: { en: "Spaces found: {right} of {of}, with {extra} extra.", es: "Espacios encontrados: {right} de {of}, con {extra} de m\xE1s." },
    spacesMissedHead: { en: "Lines to look at again", es: "L\xEDneas para mirar otra vez" },
    // What a screen reader hears for each gap of a line the result lists again (render-spaces.js spacedLine).
    spacesGapSaid: { en: "space", es: "espacio" },
    spacesNoneMissed: { en: "Every line was right.", es: "Todas las l\xEDneas estuvieron bien." },
    // The result.
    resultHead: { en: "Round over", es: "Fin de la ronda" },
    resultOf: { en: "{n} of {of}", es: "{n} de {of}" },
    resultTimed: { en: "{n} found in 60 seconds", es: "{n} encontrados en 60 segundos" },
    resultBest: { en: "Your best: {n}", es: "Tu mejor puntaje: {n}" },
    newBest: { en: "A new best!", es: "\xA1Nuevo r\xE9cord!" },
    playAgain: { en: "Play again", es: "Jugar otra vez" },
    mixedHead: { en: "Mixed up this round", es: "Confundidos en esta ronda" },
    mixedNone: { en: "Nothing mixed up.", es: "Nada confundido." },
    mixedLead: {
      en: "These come round more often next time. Save a kanji to review it in My kanji.",
      es: "Estos aparecen m\xE1s seguido la pr\xF3xima vez. Guarda un kanji para repasarlo en Mis kanji."
    },
    namesMissedHead: { en: "Names to look at again", es: "Nombres para mirar otra vez" },
    playDamaged: {
      en: "Your Play scores could not be read, so they started empty. A copy of the old data is kept in this browser.",
      es: "No se pudieron leer tus puntajes de Jugar, as\xED que empezaron vac\xEDos. Una copia de los datos anteriores queda en este navegador."
    },
    playPartial: {
      en: "Part of your Play scores could not be read and was left out ({n} entries).",
      es: "Una parte de tus puntajes de Jugar no se pudo leer y qued\xF3 fuera ({n} entradas)."
    },
    playBlocked: {
      en: "This browser is not keeping Play scores, so they last until this page closes.",
      es: "Este navegador no est\xE1 guardando los puntajes de Jugar, as\xED que duran hasta que se cierre esta p\xE1gina."
    }
  });

  // js/strings-reader.js
  var READER_STRINGS = Object.freeze({
    // Not drawn on a touch screen (style.css .key-hint), which has no arrow keys.
    readingHintKeys: { en: "The arrow keys move between words.", es: "Las flechas recorren las palabras." },
    translation: { en: "Translation", es: "Traducci\xF3n" },
    translateHere: { en: "Translate here", es: "Traducir aqu\xED" },
    translateLeadDownload: {
      en: "The first time, your browser downloads a Japanese translation model. After that the translation is made on this device, and the text is not sent anywhere.",
      es: "La primera vez, tu navegador descarga un modelo de traducci\xF3n del japon\xE9s. Despu\xE9s la traducci\xF3n se hace en este dispositivo y el texto no se env\xEDa a ninguna parte."
    },
    translateLead: {
      en: "Made on this device by your browser: the text is not sent anywhere.",
      es: "La hace tu navegador en este dispositivo: el texto no se env\xEDa a ninguna parte."
    },
    translateUnsupported: {
      en: "A translation on this page needs Chrome or Edge on a computer. Send the text to DeepL or Google Translate instead: each opens in a new tab.",
      es: "Para traducir en esta p\xE1gina hace falta Chrome o Edge en una computadora. En su lugar, env\xEDa el texto a DeepL o a Google Traductor: cada uno se abre en una pesta\xF1a nueva."
    },
    translateUnavailable: {
      en: "This browser cannot translate Japanese on this device. Send the text to DeepL or Google Translate instead: each opens in a new tab.",
      es: "Este navegador no puede traducir japon\xE9s en este dispositivo. En su lugar, env\xEDa el texto a DeepL o a Google Traductor: cada uno se abre en una pesta\xF1a nueva."
    },
    translateDownloading: {
      en: "Downloading the translation model: {n}%",
      es: "Descargando el modelo de traducci\xF3n: {n} %"
    },
    translating: { en: "Translating on this device.", es: "Traduciendo en este dispositivo." },
    translateNote: {
      en: "Machine translation, made on this device. It can be wrong.",
      es: "Traducci\xF3n autom\xE1tica, hecha en este dispositivo. Puede equivocarse."
    },
    translateHide: { en: "Hide", es: "Ocultar" },
    translateFailed: { en: "The translation failed: {detail}", es: "La traducci\xF3n fall\xF3: {detail}" },
    translateRetry: { en: "Try again", es: "Intentar de nuevo" },
    translateNeedsClick: {
      en: "Your browser asks for a click before it starts translating. Press Try again.",
      es: "Tu navegador pide un clic antes de empezar a traducir. Haz clic en Intentar de nuevo."
    },
    translateBusy: {
      en: "Your browser could not translate just now; it may be busy translating in other tabs. Try again in a moment, or send the text to DeepL or Google Translate.",
      es: "Tu navegador no pudo traducir en este momento; quiz\xE1 est\xE1 ocupado traduciendo en otras pesta\xF1as. Vuelve a intentarlo en un momento, o env\xEDa el texto a DeepL o a Google Traductor."
    },
    translateStalled: {
      en: "Your browser's translator stopped answering: no translation and no download progress for {s} seconds.",
      es: "El traductor de tu navegador dej\xF3 de responder: ni traducci\xF3n ni avance de la descarga en {s} segundos."
    }
  });

  // js/strings-gaps.js
  var GAPS_STRINGS = Object.freeze({
    gaps: { en: "Gaps", es: "Espacios" },
    gapsHint: {
      en: "A gap marks where one word ends and the next begins. Point at one, or choose a word, to read why it is there.",
      es: "Un espacio marca d\xF3nde termina una palabra y empieza la siguiente. Se\xF1ala uno, o elige una palabra, para leer por qu\xE9 est\xE1 ah\xED."
    },
    gapsTitle: { en: "Where it starts and ends", es: "D\xF3nde empieza y termina" },
    gapBefore: { en: "Before it", es: "Antes" },
    gapAfter: { en: "After it", es: "Despu\xE9s" },
    gapInside: { en: "Inside it", es: "Dentro" },
    // Where a word has no gap, what stands there instead (gaps.js besideOf).
    gapEdgeStart: { en: "The line starts here: no gap to find.", es: "Aqu\xED empieza la l\xEDnea: no hay espacio que buscar." },
    gapEdgeEnd: { en: "The line ends here: no gap to find.", es: "Aqu\xED termina la l\xEDnea: no hay espacio que buscar." },
    gapEdgePunct: { en: "A mark of punctuation stands here and shows the edge already.", es: "Aqu\xED hay un signo de puntuaci\xF3n, que ya muestra el borde." },
    gapEdgeSpace: { en: "A space is typed here already.", es: "Aqu\xED ya hay un espacio escrito." },
    gapEdgeLatin: { en: "Latin letters stand here, and the change of script shows the edge.", es: "Aqu\xED hay letras latinas, y el cambio de escritura muestra el borde." },
    gapEdgeOther: { en: "No Japanese word touches it here: no gap to find.", es: "Aqu\xED no la toca ninguna palabra japonesa: no hay espacio que buscar." },
    // One reason per gap (js/gaps.js REASONS).
    gapParticle: { en: "{w} is a particle, a word of its own.", es: "{w} es una part\xEDcula, una palabra aparte." },
    gapCopula: { en: "{w} is a form of the copula, to be.", es: "{w} es una forma de la c\xF3pula, ser." },
    gapName: { en: "{w} is a name.", es: "{w} es un nombre." },
    gapNameO: { en: "{w} is a name: {o}.", es: "{w} es un nombre: {o}." },
    gapScript: { en: "The script changes: {from} to {to}.", es: "Cambia la escritura: de {from} a {to}." },
    gapLoan: {
      en: "{w} ends the way a loanword often does: {k} after a consonant sound.",
      es: "{w} termina como suele terminar un pr\xE9stamo: {k} tras un sonido de consonante."
    },
    gapNostart: {
      en: "No word starts with {k}, so the word runs on through it to here.",
      es: "Ninguna palabra empieza con {k}, as\xED que la palabra sigue hasta aqu\xED."
    },
    gapGuess: {
      en: "The reading is a guess here: no dictionary word backs this edge.",
      es: "Aqu\xED la lectura es una suposici\xF3n: ninguna palabra del diccionario respalda este borde."
    },
    gapGuessNostart: {
      en: "No word starts with {k}, so this edge is the reading guessing.",
      es: "Ninguna palabra empieza con {k}, as\xED que este borde es una suposici\xF3n de la lectura."
    },
    // Added to any other reason when a guessed word touches the gap.
    gapGuessToo: { en: "; the reading here is a guess.", es: "; aqu\xED la lectura es una suposici\xF3n." },
    gapCompound: { en: "Two words make one katakana word: {a} + {b}.", es: "Dos palabras forman una sola en katakana: {a} + {b}." },
    gapWord: { en: "{w} is a word the dictionary knows, and it ends here.", es: "{w} es una palabra del diccionario, y termina aqu\xED." },
    gapWordForm: { en: "{w} is a form of {base}, a word the dictionary knows, and it ends here.", es: "{w} es una forma de {base}, una palabra del diccionario, y termina aqu\xED." },
    gapWordNumber: { en: "{w} is a number and its counter, and it ends here.", es: "{w} es un n\xFAmero con su contador, y termina aqu\xED." },
    gapWordPrefix: {
      en: "{w} is a prefix the dictionary lists as a word of its own, put before another word.",
      es: "{w} es un prefijo que el diccionario trae como palabra aparte, puesto antes de otra palabra."
    },
    // Why a space placed in the game is not one.
    gapExtraNostart: { en: "No word starts with {k}, so no space goes before it.", es: "Ninguna palabra empieza con {k}, as\xED que no va un espacio antes." },
    gapExtraInside: { en: "{w} is one word.", es: "{w} es una sola palabra." },
    // The scripts, as {from} and {to}.
    gapScriptKanji: { en: "kanji", es: "kanji" },
    gapScriptHiragana: { en: "hiragana", es: "hiragana" },
    gapScriptKatakana: { en: "katakana", es: "katakana" },
    gapScriptLatin: { en: "Latin letters", es: "letras latinas" },
    gapScriptDigit: { en: "digits", es: "cifras" }
  });

  // js/strings-sync.js
  var SYNC_STRINGS = Object.freeze({
    syncLocal: { en: "Kept in this browser.", es: "Se guardan en este navegador." },
    syncSignedOut: {
      en: "Kept in this browser. Sign in to keep your kanji, saved phrases and scores on every device.",
      es: "Se guardan en este navegador. Inicia sesi\xF3n para conservar tus kanji, tus frases guardadas y tus puntajes en todos tus dispositivos."
    },
    syncSignIn: { en: "Sign in", es: "Iniciar sesi\xF3n" },
    syncSyncing: { en: "Syncing with {name}'s account.", es: "Sincronizando con la cuenta de {name}." },
    syncSynced: {
      en: "Synced to {name}'s account. Last synced {when}.",
      es: "Se sincroniza con la cuenta de {name}. \xDAltima sincronizaci\xF3n: {when}."
    },
    syncToday: { en: "today at {time}", es: "hoy a las {time}" },
    syncOn: { en: "{day} at {time}", es: "el {day} a las {time}" },
    syncPaused: {
      en: "Signed in as {name}. Nothing syncs until you choose what to do with the kanji, phrases and scores in this browser.",
      es: "Sesi\xF3n iniciada como {name}. Nada se sincroniza hasta que elijas qu\xE9 hacer con los kanji, las frases y los puntajes de este navegador."
    },
    syncChoose: { en: "Choose", es: "Elegir" },
    syncOffline: {
      en: "Could not sync with {name}'s account: this browser is offline. Everything is still kept here, and Yomu tries again.",
      es: "No se pudo sincronizar con la cuenta de {name}: este navegador no tiene conexi\xF3n. Todo sigue guardado aqu\xED, y Yomu lo intentar\xE1 de nuevo."
    },
    // A failure by its kind (account.js failureKind), never by its code: the
    // code and any Convex request id go to the console only.
    syncFailed: {
      en: "Could not sync with {name}'s account: the server did not answer as expected. Everything is still kept here, and Yomu tries again.",
      es: "No se pudo sincronizar con la cuenta de {name}: el servidor no respondi\xF3 como se esperaba. Todo sigue guardado aqu\xED, y Yomu lo intentar\xE1 de nuevo."
    },
    syncFailedSignIn: {
      en: "Could not sync with {name}'s account: the account did not accept this sign-in. Everything is still kept here; Yomu tries again, and signing out and back in may help.",
      es: "No se pudo sincronizar con la cuenta de {name}: la cuenta no acept\xF3 este inicio de sesi\xF3n. Todo sigue guardado aqu\xED; Yomu lo intentar\xE1 de nuevo, y cerrar sesi\xF3n y volver a iniciarla puede ayudar."
    },
    syncFailedSwitched: {
      en: "Could not sync with {name}'s account: another tab changed the account this browser syncs with. Everything is still kept here, and Yomu checks again.",
      es: "No se pudo sincronizar con la cuenta de {name}: otra pesta\xF1a cambi\xF3 la cuenta con la que se sincroniza este navegador. Todo sigue guardado aqu\xED, y Yomu lo revisar\xE1 de nuevo."
    },
    syncFailedRefused: {
      en: "Could not sync with {name}'s account: the account refused what this browser sent. Everything is still kept here, and Yomu tries again.",
      es: "No se pudo sincronizar con la cuenta de {name}: la cuenta rechaz\xF3 lo que envi\xF3 este navegador. Todo sigue guardado aqu\xED, y Yomu lo intentar\xE1 de nuevo."
    },
    // The sign-in dialog's lede: index.html's <meta name="neo-auth-reason">
    // carries it as data-ui-content, so a language switch relabels it.
    authReason: {
      en: "Sign in to keep your kanji, saved phrases and scores on every device. With no account, everything stays in this browser.",
      es: "Inicia sesi\xF3n para conservar tus kanji, tus frases guardadas y tus puntajes en todos tus dispositivos. Sin cuenta, todo se queda en este navegador."
    },
    // Another account signed in on a browser that synced with one before.
    syncAskTitle: { en: "This browser synced with another account", es: "Este navegador se sincroniz\xF3 con otra cuenta" },
    syncAskBody: {
      en: "{name} just signed in. The kanji, saved phrases, saved words and scores in this browser came from the account it synced with before.",
      es: "{name} acaba de iniciar sesi\xF3n. Los kanji, las frases y palabras guardadas y los puntajes de este navegador vienen de la cuenta con la que se sincroniz\xF3 antes."
    },
    syncAskCounts: {
      en: "In {name}'s account: saved kanji {kanji}, saved phrases {phrases}. In this browser: saved kanji {hereKanji}, saved phrases {herePhrases}.",
      es: "En la cuenta de {name}: kanji guardados {kanji}, frases guardadas {phrases}. En este navegador: kanji guardados {hereKanji}, frases guardadas {herePhrases}."
    },
    syncAskCountsWords: {
      en: "In {name}'s account: saved kanji {kanji}, saved phrases {phrases}, saved words {words}. In this browser: saved kanji {hereKanji}, saved phrases {herePhrases}, saved words {hereWords}.",
      es: "En la cuenta de {name}: kanji guardados {kanji}, frases guardadas {phrases}, palabras guardadas {words}. En este navegador: kanji guardados {hereKanji}, frases guardadas {herePhrases}, palabras guardadas {hereWords}."
    },
    // What each answer does, and no more than that. The account this browser
    // synced with before is never written to again from here: it keeps what
    // it had at its last sync, and nothing changed since reaches it.
    syncAskHow: {
      en: "Adding keeps both: this browser's data joins the account that just signed in. Using the account's data replaces what this browser holds with that account's. Either way, the account this browser synced with before keeps what it already had, and nothing more: what changed in this browser since its last sync with that account (kanji, phrases and words saved or unsaved, reviews, scores, display settings) is not sent to it. If you use the account's data, those changes are gone from this browser too.",
      es: "A\xF1adir conserva ambos: los datos de este navegador se suman a la cuenta que acaba de iniciar sesi\xF3n. Usar los datos de la cuenta reemplaza lo que tiene este navegador por lo de esa cuenta. En ambos casos, la cuenta con la que este navegador se sincroniz\xF3 antes conserva lo que ya ten\xEDa, y nada m\xE1s: lo que cambi\xF3 en este navegador desde su \xFAltima sincronizaci\xF3n con esa cuenta (kanji, frases y palabras guardados o quitados, repasos, puntajes, ajustes de la vista) no se le env\xEDa. Si usas los datos de la cuenta, esos cambios tambi\xE9n desaparecen de este navegador."
    },
    syncAskSince: {
      en: "This browser last synced with that account {when}.",
      es: "Este navegador se sincroniz\xF3 por \xFAltima vez con esa cuenta {when}."
    },
    // A first sign-in, when this browser holds saved kanji or phrases of its
    // own and the account holds data too (sync.js begin()). This browser's
    // data was never in the account, so Use loses it: the text says so.
    syncFirstTitle: { en: "This browser has kanji, phrases or words of its own", es: "Este navegador tiene kanji, frases o palabras propios" },
    syncFirstBody: {
      en: "This browser has kanji, phrases or words from before you signed in. Add them to your account, or use your account's data here?",
      es: "Este navegador tiene kanji, frases o palabras de antes de que iniciaras sesi\xF3n. \xBFLos a\xF1ades a tu cuenta, o usas aqu\xED los datos de tu cuenta?"
    },
    syncFirstHow: {
      en: "Adding keeps both: this browser's kanji, phrases, words, reviews and scores join your account, including any your account had removed or cleared. Using your account's data replaces this browser's saved kanji, their reviews and counts, its saved phrases and words and its scores with your account's. They were never in your account, so they are gone from this browser too: to keep a copy, choose Not now and use Export in My kanji first.",
      es: "A\xF1adir conserva ambos: los kanji, las frases, las palabras, los repasos y los puntajes de este navegador se suman a tu cuenta, incluso los que tu cuenta hab\xEDa quitado o borrado. Usar los datos de tu cuenta reemplaza los kanji guardados de este navegador, sus repasos y conteos, sus frases y palabras guardadas y sus puntajes por los de tu cuenta. Nunca estuvieron en tu cuenta, as\xED que tambi\xE9n desaparecen de este navegador: para guardar una copia, elige Ahora no y usa Exportar en Mis kanji antes."
    },
    // The rest of what a first sign-in asks about (sync.js accountHolds),
    // shown only when the account holds it.
    syncFirstRemoved: {
      en: "Removed in {name}'s account: kanji {kanji}, phrases {phrases}.",
      es: "Quitados en la cuenta de {name}: kanji {kanji}, frases {phrases}."
    },
    syncFirstRemovedWords: {
      en: "Removed in {name}'s account: kanji {kanji}, phrases {phrases}, words {words}.",
      es: "Quitados en la cuenta de {name}: kanji {kanji}, frases {phrases}, palabras {words}."
    },
    syncFirstCleared: {
      en: "In {name}'s account, My kanji was cleared.",
      es: "En la cuenta de {name}, Mis kanji se vaci\xF3."
    },
    syncAdd: { en: "Add this browser's data", es: "A\xF1adir los datos de este navegador" },
    syncUse: { en: "Use the account's data", es: "Usar los datos de la cuenta" },
    syncNotNow: { en: "Not now", es: "Ahora no" },
    // Where things are kept, once this browser syncs with an account.
    clearBodySynced: {
      en: "This forgets every saved kanji, its review schedule and every count of the kanji you met, in this browser and in the account it syncs with, so every device signed in to that account empties too when it next syncs. History is not touched. Export first to keep a copy.",
      es: "Esto olvida cada kanji guardado, su calendario de repaso y cada conteo de los kanji que viste, en este navegador y en la cuenta con la que se sincroniza, as\xED que cada dispositivo con esa cuenta tambi\xE9n queda vac\xEDo al sincronizarse. El historial no se toca. Exporta antes para guardar una copia."
    },
    // While a join waits for the account's data (a first sign-in, or Add):
    // a Clear all removes the kanji held here, one by one, and clears nothing
    // of the account's (js/sync-watch.js).
    clearBodyJoining: {
      en: "This forgets every saved kanji, its review schedule and every count of the kanji you met, in this browser. Your account's kanji have not reached this browser yet, so your account keeps its counts and the kanji it saved, except the ones saved here: those are removed from it too, if this browser's data is added to it. History is not touched. Export first to keep a copy.",
      es: "Esto olvida en este navegador cada kanji guardado, su calendario de repaso y cada conteo de los kanji que viste. Los kanji de tu cuenta a\xFAn no llegan a este navegador, as\xED que tu cuenta conserva sus conteos y los kanji que guard\xF3, salvo los guardados aqu\xED: esos tambi\xE9n se quitan de ella, si los datos de este navegador se a\xF1aden a tu cuenta. El historial no se toca. Exporta antes para guardar una copia."
    },
    playLeadSynced: {
      en: "Four short games with the characters that look alike. Your best scores are kept in this browser and in your account.",
      es: "Cuatro juegos cortos con los caracteres que se parecen. Tus mejores puntajes se guardan en este navegador y en tu cuenta."
    }
  });

  // js/strings-conj.js
  var CONJ_STRINGS = Object.freeze({
    conjTitle: { en: "All forms", es: "Todas las formas" },
    conjCount: { en: "{n} forms", es: "{n} formas" },
    conjHere: { en: "In the text: {form}", es: "En el texto: {form}" },
    conjLeadNa: {
      en: "The word stays the same; the copula after it changes.",
      es: "La palabra no cambia; cambia la c\xF3pula que la sigue."
    },
    conjGroupBasic: { en: "Plain and polite", es: "Llana y cort\xE9s" },
    conjGroupLinking: { en: "Linking and if", es: "Para unir y condicionales" },
    conjGroupMore: { en: "More forms", es: "M\xE1s formas" },
    conjSay: { en: "Say {form}", es: "Decir {form}" },
    speakShort: { en: "Say", es: "Decir" },
    conjRegister: { en: "Register", es: "Registro" },
    conjPlain: { en: "Plain", es: "Llana" },
    conjPolite: { en: "Polite", es: "Cort\xE9s" },
    conjDoes: { en: "Does", es: "S\xED" },
    conjDoesnt: { en: "Doesn't", es: "No" },
    conjNow: { en: "Now", es: "Ahora" },
    conjPast: { en: "Past", es: "Pasado" },
    conjInText: { en: "in the text", es: "en el texto" },
    conjAbout: { en: "Notes:", es: "Notas:" }
  });
  var FORM_NAMES = Object.freeze({
    plain: { en: "Dictionary (plain)", es: "Diccionario (llana)" },
    polite: { en: "Polite", es: "Cort\xE9s" },
    negative: { en: "Negative", es: "Negativa" },
    "polite-negative": { en: "Polite negative", es: "Negativa cort\xE9s" },
    past: { en: "Past", es: "Pasado" },
    "polite-past": { en: "Polite past", es: "Pasado cort\xE9s" },
    "past-negative": { en: "Past negative", es: "Pasado negativo" },
    "polite-past-negative": { en: "Polite past negative", es: "Pasado negativo cort\xE9s" },
    te: { en: "Te-form", es: "Forma te" },
    "negative-te": { en: "Without doing (naide)", es: "Sin hacer (naide)" },
    adverb: { en: "As an adverb", es: "Como adverbio" },
    ba: { en: "If (ba)", es: "Si (ba)" },
    tara: { en: "If, when (tara)", es: "Si, cuando (tara)" },
    want: { en: "Want to", es: "Querer" },
    volitional: { en: "Let's (plain)", es: "Vamos a (llana)" },
    "polite-volitional": { en: "Let's (polite)", es: "Vamos a (cort\xE9s)" },
    potential: { en: "Can (potential)", es: "Poder (potencial)" },
    passive: { en: "Passive", es: "Pasiva" },
    causative: { en: "Make or let (causative)", es: "Hacer o dejar (causativa)" },
    "causative-passive": { en: "Be made to", es: "Ser obligado a" },
    imperative: { en: "Command", es: "Orden" }
  });

  // js/strings-kpage.js
  var KPAGE_STRINGS = Object.freeze({
    kanjiPage: { en: "Kanji page", es: "P\xE1gina del kanji" },
    kpOpenFull: { en: "Strokes, parts and words", es: "Trazos, partes y palabras" },
    openKanjiPage: { en: "Open the page of {ch}", es: "Abrir la p\xE1gina de {ch}" },
    kpStrokesTitle: { en: "How {ch} is drawn: {n} strokes", es: "C\xF3mo se traza {ch}: {n} trazos" },
    kpStrokesOne: { en: "How {ch} is drawn: 1 stroke", es: "C\xF3mo se traza {ch}: 1 trazo" },
    kpNoStrokes: { en: "No stroke order for this character.", es: "No hay orden de trazos para este car\xE1cter." },
    kpDraw: { en: "Draw", es: "Trazar" },
    kpPause: { en: "Pause", es: "Pausa" },
    kpDrawAgain: { en: "Draw again", es: "Trazar de nuevo" },
    kpPrev: { en: "Previous stroke", es: "Trazo anterior" },
    kpStrokeOrder: { en: "Stroke order", es: "Orden de trazos" },
    kpAllStrokes: { en: "All {n} strokes", es: "Los {n} trazos" },
    kpSave: { en: "Save", es: "Guardar" },
    kpSaved: { en: "Saved", es: "Guardado" },
    kpSay: { en: "Say it", es: "Decirlo" },
    kpSayWord: { en: "Say {ch}", es: "Decir {ch}" },
    // A recorded voice is chosen and the device has no Japanese voice: what is not recorded cannot be said.
    kpSayUnrecorded: {
      en: "Not every reading and word here is recorded yet, and this device has no Japanese voice to say the rest.",
      es: "No todas las lecturas y palabras de aqu\xED tienen grabaci\xF3n todav\xEDa, y este dispositivo no tiene voz japonesa para decir las dem\xE1s."
    },
    kpLooksLike: { en: "Looks like", es: "Se parece a" },
    kpApartHas: { en: "Has {a} inside it", es: "Lleva {a} dentro" },
    kpApartIn: { en: "A part of {a}", es: "Una parte de {a}" },
    kpApartSwap: { en: "Shares {s}, with {t} where {a} has {m}", es: "Comparte {s}, con {t} donde {a} tiene {m}" },
    kpApartStrokes: { en: "{n} strokes; {a} has {m}", es: "{n} trazos; {a} tiene {m}" },
    kpApartSame: { en: "The same parts and stroke count: compare how each stroke runs", es: "Las mismas partes y el mismo n\xFAmero de trazos: compara c\xF3mo va cada trazo" },
    kpApartLook: { en: "Compare the strokes", es: "Compara los trazos" },
    kpOnlyHere: { en: "No other common kanji has this part.", es: "Ning\xFAn otro kanji com\xFAn tiene esta parte." },
    kpNext: { en: "Next stroke", es: "Siguiente trazo" },
    kpCountDiffers: {
      en: "Drawn here in {n} strokes, as KanjiVG writes it; KANJIDIC counts {s}.",
      es: "Aqu\xED se traza en {n} trazos, como lo escribe KanjiVG; KANJIDIC cuenta {s}."
    },
    kpStrokeOf: { en: "Stroke {k} of {n}", es: "Trazo {k} de {n}" },
    kpParts: { en: "Made of", es: "Formado por" },
    kpPartsNone: { en: "KanjiVG names no parts for this kanji.", es: "KanjiVG no nombra partes para este kanji." },
    kpAlsoWith: { en: "Also with {ch}", es: "Tambi\xE9n con {ch}" },
    kpUsedIn: { en: "Part of", es: "Forma parte de" },
    kpWords: { en: "Words with it", es: "Palabras con \xE9l" },
    kpWordsNone: { en: "No common word in the dictionary is written with it.", es: "Ninguna palabra com\xFAn del diccionario se escribe con \xE9l." },
    dailyTitle: { en: "Kanji of the day", es: "Kanji del d\xEDa" },
    dailyOpen: { en: "Strokes, parts and words", es: "Trazos, partes y palabras" },
    examples: { en: "Examples", es: "Ejemplos" },
    exReadLabel: { en: "Read this sentence", es: "Leer esta oraci\xF3n" },
    exSource: { en: "Tatoeba", es: "Tatoeba" },
    exSourceLabel: { en: "This sentence on tatoeba.org (opens a new tab)", es: "Esta oraci\xF3n en tatoeba.org (se abre en una pesta\xF1a nueva)" },
    exNote: { en: "From the Tatoeba Project, written by volunteers.", es: "Del proyecto Tatoeba, escritas por voluntarios." },
    exMore: { en: "More examples ({n})", es: "M\xE1s ejemplos ({n})" },
    handPick: { en: "Form", es: "Forma" },
    handPrint: { en: "Print", es: "Impresa" },
    handWritten: { en: "Handwritten", es: "A mano" },
    handMissing: {
      en: "Klee One, the handwriting here, has no form of this character, so it stays in print.",
      es: "Klee One, la letra a mano de aqu\xED, no tiene este car\xE1cter, as\xED que se ve impreso."
    },
    exMoreLoading: { en: "Loading more examples.", es: "Cargando m\xE1s ejemplos." },
    alsoWritten: { en: "Also written", es: "Tambi\xE9n se escribe" },
    otherForms: { en: "Other forms", es: "Otras formas" },
    otherFormsNote: {
      en: "The same kanji in another shape, as KANJIDIC links them: an older or a variant form.",
      es: "El mismo kanji con otra forma, como los enlaza KANJIDIC: una forma antigua o variante."
    },
    spellPlain: { en: "also used", es: "tambi\xE9n se usa" },
    spell_oK: { en: "old spelling", es: "graf\xEDa antigua" },
    spell_rK: { en: "rare", es: "poco com\xFAn" },
    spell_iK: { en: "irregular kanji", es: "kanji irregular" },
    spell_io: { en: "irregular kana ending", es: "terminaci\xF3n en kana irregular" },
    spell_ateji: { en: "ateji: kanji for the sound", es: "ateji: kanji por el sonido" },
    spell_sK: { en: "seldom seen", es: "casi no se ve" },
    kpHiragana: { en: "Hiragana", es: "Hiragana" },
    kpKatakana: { en: "Katakana", es: "Katakana" },
    kpInKatakana: { en: "In katakana", es: "En katakana" },
    kpInHiragana: { en: "In hiragana", es: "En hiragana" },
    kpStartsWith: { en: "Words that start with it", es: "Palabras que empiezan con \xE9l" },
    kpBack: { en: "Back to {ch}", es: "Volver a {ch}" },
    kpLoading: { en: "Loading the page\u2026", es: "Cargando la p\xE1gina\u2026" },
    kpFailed: { en: "This page could not be loaded.", es: "No se pudo cargar esta p\xE1gina." },
    kpFreq: { en: "no. {n} in newspapers", es: "n.\xBA {n} en la prensa" },
    kpSource: {
      en: "Strokes from KanjiVG; words from JMdict, most used first.",
      es: "Trazos de KanjiVG; palabras de JMdict, las m\xE1s usadas primero."
    }
  });

  // js/strings-search.js
  var SEARCH_STRINGS = Object.freeze({
    search: { en: "Search", es: "Buscar" },
    searchTitle: { en: "Search", es: "Buscar" },
    searchLead: {
      en: "Look up a word in Japanese, romaji, English or Spanish, find a kanji by the parts you can see in it, or browse the kana, the counters and the idioms. Nothing you type leaves this page.",
      es: "Busca una palabra en japon\xE9s, en romaji, en espa\xF1ol o en ingl\xE9s, encuentra un kanji por las partes que ves en \xE9l, o recorre los kana, los contadores y los modismos. Nada de lo que escribes sale de esta p\xE1gina."
    },
    searchNav: { en: "Search by", es: "Buscar por" },
    searchWords: { en: "Words", es: "Palabras" },
    searchParts: { en: "Kanji by parts", es: "Kanji por partes" },
    searchLookUp: { en: "Look up", es: "Consultar" },
    searchBrowse: { en: "Browse", es: "Explorar" },
    searchShelves: { en: "Shelves", es: "Estantes" },
    shelfKana: { en: "Hiragana and katakana, each to its page", es: "Hiragana y katakana, cada uno a su p\xE1gina" },
    shelfCounters: { en: "Where the sound bends", es: "D\xF3nde cambia el sonido" },
    shelfYoji: { en: "Four-kanji idioms", es: "Expresiones de cuatro kanji" },
    shelfProverb: { en: "Sayings, filter in any script", es: "Dichos, filtra en cualquier escritura" },
    shelfLevels: { en: "Kanji by level", es: "Kanji por nivel" },
    shelfLevelsLine: { en: "School years, JLPT and name kanji", es: "A\xF1os escolares, JLPT y kanji para nombres" },
    levelsLead: {
      en: "The j\u014Dy\u014D kanji by the school year Japanese children learn them in, the commonest first, the kanji allowed in names, and the JLPT levels on Jonathan Waller's lists.",
      es: "Los kanji j\u014Dy\u014D seg\xFAn el a\xF1o escolar en que los aprenden los ni\xF1os japoneses, primero los m\xE1s comunes, los kanji permitidos en nombres y los niveles del JLPT seg\xFAn las listas de Jonathan Waller."
    },
    levelPickSchool: { en: "School years", es: "A\xF1os escolares" },
    levelPickJlpt: { en: "JLPT, unofficial", es: "JLPT, no oficial" },
    levelJlpt: { en: "N{n}", es: "N{n}" },
    levelJlptNote: {
      en: "Jonathan Waller's lists, from his site tanos.co.uk, under Creative Commons BY. Unofficial: the JLPT has published no kanji lists since 2010.",
      es: "Las listas de Jonathan Waller, de su sitio tanos.co.uk, con licencia Creative Commons BY. No oficiales: el JLPT no publica listas de kanji desde 2010."
    },
    levelJlptTerms: { en: "His terms", es: "Sus condiciones" },
    levelNames: { en: "Name kanji (jinmeiy\u014D)", es: "Kanji para nombres (jinmeiy\u014D)" },
    levelCount: { en: "{n} kanji", es: "{n} kanji" },
    levelPractise: { en: "Practise {n}", es: "Practicar {n}" },
    levelPractiseNote: {
      en: "Practise starts with the kanji not in My kanji yet, and moves no review dates.",
      es: "Practicar empieza por los kanji que a\xFAn no est\xE1n en Mis kanji, y no cambia las fechas de repaso."
    },
    shelfWordLevels: { en: "Words by level", es: "Palabras por nivel" },
    shelfWordLevelsLine: { en: "JLPT N5 to N1, unofficial", es: "JLPT N5 a N1, no oficial" },
    wordLevelsLead: {
      en: "The words of the JLPT levels N5 to N1 on Jonathan Waller's lists, in his order. The meanings are the dictionary's.",
      es: "Las palabras de los niveles N5 a N1 del JLPT seg\xFAn las listas de Jonathan Waller, en su orden. Los significados son los del diccionario."
    },
    wordLevelPick: { en: "JLPT level, unofficial", es: "Nivel del JLPT, no oficial" },
    wordLevelNote: {
      en: "Jonathan Waller's lists, from his site tanos.co.uk, under Creative Commons BY. Unofficial: the JLPT has published no word lists since 2010.",
      es: "Las listas de Jonathan Waller, de su sitio tanos.co.uk, con licencia Creative Commons BY. No oficiales: el JLPT no publica listas de palabras desde 2010."
    },
    wordLevelSaveNote: {
      en: "Save puts a word in My words, to review with your kanji.",
      es: "Guardar pone la palabra en Mis palabras, para repasarla con tus kanji."
    },
    wordLevelsLoading: { en: "Loading the list\u2026", es: "Cargando la lista\u2026" },
    shelfIdiom: { en: "Set expressions, like \u8DB3\u3092\u6D17\u3046", es: "Expresiones fijas, como \u8DB3\u3092\u6D17\u3046" },
    setsLead: {
      en: "Four-character idioms, proverbs and idiomatic phrases, as JMdict tags them. The common ones come first.",
      es: "Expresiones de cuatro kanji, refranes y frases hechas, seg\xFAn las marca JMdict. Primero las comunes."
    },
    setsPick: { en: "Collection", es: "Colecci\xF3n" },
    inIdioms: { en: "In idioms and proverbs", es: "En modismos y refranes" },
    setOne_yoji: { en: "Four-kanji idiom", es: "Expresi\xF3n de cuatro kanji" },
    setOne_proverb: { en: "Proverb", es: "Refr\xE1n" },
    setOne_idiom: { en: "Idiomatic phrase", es: "Frase hecha" },
    idiomReadLabel: { en: "Read {w} in the reader", es: "Leer {w} en el lector" },
    wordSearch: { en: "Look up in Search", es: "Ver en Buscar" },
    set_yoji: { en: "Four kanji", es: "Cuatro kanji" },
    set_proverb: { en: "Proverbs", es: "Refranes" },
    set_idiom: { en: "Phrases", es: "Frases hechas" },
    setsFilter: { en: "Filter", es: "Filtrar" },
    setsFilterHint: {
      en: "Japanese, romaji, English or Spanish, for example \u9CE5, ichi, stone or piedra.",
      es: "Japon\xE9s, romaji, ingl\xE9s o espa\xF1ol, por ejemplo \u9CE5, ichi, stone o piedra."
    },
    setsLoading: { en: "Loading the collection\u2026", es: "Cargando la colecci\xF3n\u2026" },
    setsAll: { en: "{n} in all", es: "{n} en total" },
    setsFound: { en: "Matching: {n} of {total}", es: "Coincidencias: {n} de {total}" },
    setsShown: { en: "{shown} shown", es: "{shown} a la vista" },
    setsNone: { en: "Nothing in this collection matches.", es: "Nada de esta colecci\xF3n coincide." },
    setsMore: { en: "Show {n} more ({left} left)", es: "Mostrar {n} m\xE1s (quedan {left})" },
    searchLabel: { en: "Word, reading or meaning", es: "Palabra, lectura o significado" },
    searchHint: {
      en: "For example \u98DF\u3079\u305F, taberu, eat or comer, or a sentence in romaji. The meanings are the dictionary's.",
      es: "Por ejemplo \u98DF\u3079\u305F, taberu, comer o eat, o una oraci\xF3n en romaji. Los significados son los del diccionario."
    },
    searching: { en: "Searching\u2026", es: "Buscando\u2026" },
    searchNone: { en: "Nothing found for this.", es: "No se encontr\xF3 nada." },
    searchOne: { en: "1 word", es: "1 palabra" },
    searchMany: { en: "{n} words", es: "{n} palabras" },
    searchFailed: { en: "The search could not load its data.", es: "La b\xFAsqueda no pudo cargar sus datos." },
    searchKanji: { en: "Kanji", es: "Kanji" },
    searchViaFormOf: { en: "Dictionary form of {q}", es: "Forma de diccionario de {q}" },
    searchViaEnglish: { en: "English: {w}", es: "Ingl\xE9s: {w}" },
    searchViaRomaji: { en: "Romaji: {kana}", es: "Romaji: {kana}" },
    searchViaSpanish: { en: "Spanish: {w}", es: "Espa\xF1ol: {w}" },
    searchViaSentence: { en: "A word of the sentence: {kana}", es: "Una palabra de la oraci\xF3n: {kana}" },
    searchSentence: { en: "Read as a sentence", es: "Le\xEDda como oraci\xF3n" },
    searchSentenceRead: { en: "Read the sentence", es: "Leer la oraci\xF3n" },
    searchSentenceLabel: { en: "Read {w} in the reader", es: "Leer {w} en el lector" },
    searchInEnglish: { en: "Meaning in English", es: "Significado en ingl\xE9s" },
    searchTry: { en: "Try", es: "Prueba" },
    searchViaRare: { en: "Rare word", es: "Palabra poco com\xFAn" },
    searchViaName: { en: "Name", es: "Nombre" },
    searchMore: { en: "+{n} more meanings", es: "+{n} significados m\xE1s" },
    searchRead: { en: "Read it", es: "Leerla" },
    searchReadLabel: { en: "Read {w} in the reader", es: "Leer {w} en el lector" },
    partsLead: {
      en: "Choose the parts you see. Only parts that still lead to a kanji stay open.",
      es: "Elige las partes que ves. Solo quedan activas las que a\xFAn llevan a alg\xFAn kanji."
    },
    partsChosen: { en: "Chosen", es: "Elegidas" },
    partsNoneChosen: { en: "No part chosen yet.", es: "A\xFAn no elegiste ninguna parte." },
    partsClear: { en: "Clear", es: "Borrar" },
    partsResults: { en: "{n} kanji", es: "{n} kanji" },
    partsShown: { en: "the first {n} shown", es: "se muestran los primeros {n}" },
    partsStrokes: { en: "{n} strokes", es: "{n} trazos" },
    partsOther: { en: "Other", es: "Otras" },
    partsLoading: { en: "Loading the parts\u2026", es: "Cargando las partes\u2026" },
    partPick: { en: "Part {ch}", es: "Parte {ch}" },
    emptySearch: { en: "Or look up a word: eat, taberu, \u98DF\u3079\u308B", es: "O busca una palabra: eat, taberu, \u98DF\u3079\u308B" },
    searchKana: { en: "Kana", es: "Kana" },
    searchCounters: { en: "Counters", es: "Contadores" },
    kanaScript: { en: "Script", es: "Escritura" },
    kanaLead: {
      en: "Each kana opens its page: how it is drawn, and words that start with it. Romaji as Genki spells it.",
      es: "Cada kana abre su p\xE1gina: c\xF3mo se traza y palabras que empiezan con \xE9l. Romaji como lo escribe Genki."
    },
    kanaBasic: { en: "The basic sounds", es: "Los sonidos b\xE1sicos" },
    kanaVoiced: { en: "With the voiced marks", es: "Con las marcas de sonorizaci\xF3n" },
    kanaCombined: { en: "Combined sounds", es: "Sonidos combinados" },
    countersLead: {
      en: "Pick what you are counting. A highlighted reading is one where the sound changes.",
      es: "Elige lo que cuentas. Una lectura resaltada es una donde el sonido cambia."
    },
    counterBent: { en: "(the sound changes)", es: "(el sonido cambia)" },
    counterPick: { en: "What you are counting", es: "Lo que cuentas" },
    counterCounts: { en: "Counts {what}", es: "Cuenta {what}" },
    counterBendsAt: { en: "The sound changes at {list}.", es: "El sonido cambia en {list}." },
    counterBendsAtQ: { en: "The sound changes at {list}, and after \u4F55.", es: "El sonido cambia en {list}, y despu\xE9s de \u4F55." },
    counterBendsQuestion: { en: "The sound changes only after \u4F55.", es: "El sonido cambia solo despu\xE9s de \u4F55." },
    counterNoBend: { en: "No sound changes: the number, then {c}, every time.", es: "Sin cambios de sonido: el n\xFAmero y luego {c}, siempre." },
    counterNone: { en: "not used", es: "no se usa" }
  });

  // js/strings-progress.js
  var PROGRESS_STRINGS = Object.freeze({
    navProgress: { en: "Progress", es: "Progreso" },
    practice: { en: "Practice", es: "Pr\xE1ctica" },
    practiceDone: { en: "Practice done", es: "Pr\xE1ctica terminada" },
    practiceMissed: { en: "Missed:", es: "Fallaste:" },
    practiceNote: { en: "A practice moves no review dates.", es: "Una pr\xE1ctica no cambia las fechas de repaso." },
    practiceSaveMissed: { en: "Save the {n} you missed to My kanji", es: "Guardar en Mis kanji los {n} que fallaste" },
    practiceSaveOne: { en: "Save the one you missed to My kanji", es: "Guardar en Mis kanji el que fallaste" },
    pgTitle: { en: "What you have read", es: "Lo que has le\xEDdo" },
    pgLead: {
      en: "Counted from what My kanji and History keep in this browser: nothing new is stored.",
      es: "Contado a partir de lo que Mis kanji e Historial guardan en este navegador: no se guarda nada nuevo."
    },
    pgPeriod: { en: "Period", es: "Periodo" },
    pg_week: { en: "Week", es: "Semana" },
    pg_month: { en: "Month", es: "Mes" },
    pg_all: { en: "All time", es: "Todo" },
    pgTexts: { en: "texts read", es: "textos le\xEDdos" },
    pgTextsOne: { en: "text read", es: "texto le\xEDdo" },
    pgMetOne: { en: "kanji met", es: "kanji visto" },
    pgFreshOne: { en: "new kanji", es: "kanji nuevo" },
    pgSavedOne: { en: "kanji saved", es: "kanji guardado" },
    pgTextsFrom: { en: "while Remember is on", es: "con Recordar activado" },
    pgMet: { en: "kanji met", es: "kanji vistos" },
    pgFresh: { en: "new kanji", es: "kanji nuevos" },
    pgFreshFrom: { en: "met for the first time", es: "vistos por primera vez" },
    pgSaved: { en: "kanji saved", es: "kanji guardados" },
    pgNewTitle: { en: "New kanji met", es: "Kanji nuevos" },
    pgNewDay: { en: "New kanji per day: {list}", es: "Kanji nuevos por d\xEDa: {list}" },
    pgNewMonth: { en: "New kanji per month: {list}", es: "Kanji nuevos por mes: {list}" },
    pgGrades: { en: "J\u014Dy\u014D kanji met, by grade", es: "Kanji j\u014Dy\u014D vistos, por grado" },
    pgLoading: { en: "Loading the j\u014Dy\u014D list\u2026", es: "Cargando la lista j\u014Dy\u014D\u2026" },
    pgBoxes: { en: "Saved kanji, by review box", es: "Kanji guardados, por caja de repaso" },
    pgBox: { en: "box {n}", es: "caja {n}" },
    pgBoxNote: {
      en: "Box 0 is due today; each Got it moves a kanji up one box (1, 2, 4, 8, 16 days).",
      es: "La caja 0 toca hoy; cada Lo sab\xEDa sube el kanji una caja (1, 2, 4, 8, 16 d\xEDas)."
    },
    pgNext: { en: "Next up", es: "Lo siguiente" },
    pgDue: { en: "{n} kanji are due for review.", es: "{n} kanji tocan repaso." },
    pgDueOne: { en: "1 kanji is due for review.", es: "1 kanji toca repaso." },
    pgDueNone: { en: "Nothing is due for review today.", es: "Hoy no toca repasar nada." },
    pgUnmet: { en: "Still to meet in {grade}:", es: "A\xFAn por ver en {grade}:" },
    pgNoDates: {
      en: "Reviews keep no dates here, so there is no chart of reviews per day; texts count only while Remember is on, or when saved.",
      es: "Los repasos no guardan fechas aqu\xED, as\xED que no hay gr\xE1fico de repasos por d\xEDa; los textos cuentan solo con Recordar activado, o si los guardaste."
    }
  });

  // js/strings-reading.js
  var READING_STRINGS = Object.freeze({
    furiNotSaved: { en: "Not in My kanji", es: "Fuera de Mis kanji" },
    textSize: { en: "Size", es: "Tama\xF1o" },
    sizeS: { en: "Small", es: "Peque\xF1o" },
    sizeM: { en: "Medium", es: "Mediano" },
    sizeL: { en: "Large", es: "Grande" },
    readView: { en: "Show", es: "Mostrar" },
    kanjiShown: { en: "Kanji", es: "Kanji" },
    kanjiAll: { en: "All kanji", es: "Todos los kanji" },
    kanjiMine: { en: "Only My kanji, the rest in kana", es: "Solo Mis kanji, el resto en kana" },
    kanjiG1: { en: "My kanji and grade 1", es: "Mis kanji y 1.er grado" },
    kanjiG2: { en: "My kanji and grades 1 to 2", es: "Mis kanji y grados 1 a 2" },
    kanjiG3: { en: "My kanji and grades 1 to 3", es: "Mis kanji y grados 1 a 3" },
    kanjiG4: { en: "My kanji and grades 1 to 4", es: "Mis kanji y grados 1 a 4" },
    kanjiG5: { en: "My kanji and grades 1 to 5", es: "Mis kanji y grados 1 a 5" },
    kanjiG6: { en: "My kanji and grades 1 to 6", es: "Mis kanji y grados 1 a 6" },
    viewAll: { en: "All", es: "Todo" },
    viewOne: { en: "One sentence", es: "Una oraci\xF3n" },
    sentPrev: { en: "Previous sentence", es: "Oraci\xF3n anterior" },
    sentNext: { en: "Next sentence", es: "Oraci\xF3n siguiente" },
    sentWhere: { en: "Sentence {n} of {of}", es: "Oraci\xF3n {n} de {of}" },
    raStart: { en: "Read along", es: "Leer al ritmo" },
    raStop: { en: "Stop", es: "Parar" },
    raRepeat: { en: "Repeat after me", es: "Repite conmigo" },
    raSaying: { en: "Reading sentence {n} of {of}.", es: "Leyendo la oraci\xF3n {n} de {of}." },
    raYourTurn: { en: "Your turn: say it back.", es: "Tu turno: rep\xEDtela." },
    raDone: { en: "Done. Read along again starts from the first sentence.", es: "Listo. Leer al ritmo de nuevo empieza por la primera oraci\xF3n." },
    kanaRowsKnown: { en: "Rows you know: the phrase library can offer only the lines they spell.", es: "Filas que conoces: la biblioteca de frases puede ofrecer solo las l\xEDneas que escriben." },
    phReadable: { en: "Only phrases I can read", es: "Solo frases que puedo leer" },
    phNoRows: { en: "Mark the kana rows you know first.", es: "Primero marca las filas de kana que conoces." },
    phMarkRows: { en: "Open the kana chart", es: "Abrir la tabla de kana" },
    phReadableCount: { en: "{n} of {total} phrases use only the rows you know.", es: "{n} de {total} frases usan solo las filas que conoces." },
    tabbarLabel: { en: "Sections", es: "Secciones" },
    tabRead: { en: "Read", es: "Leer" }
  });

  // js/strings-words.js
  var WORDS_STRINGS = Object.freeze({
    saveWord: { en: "Save {ch} to My words", es: "Guardar {ch} en Mis palabras" },
    wordsFull: {
      en: "My words holds {n} words, the most it keeps. Unsave one to save another.",
      es: "Mis palabras guarda {n} palabras, el m\xE1ximo. Quita una para guardar otra."
    },
    navWords: { en: "Words", es: "Palabras" },
    wordsHead: { en: "My words", es: "Mis palabras" },
    wordsLead: {
      en: "Words you saved from the Word panel, reviewed with your kanji: the word first, then its reading and meaning.",
      es: "Palabras que guardaste desde el panel de la palabra, repasadas con tus kanji: primero la palabra, luego su lectura y su significado."
    },
    wordsEmpty: {
      en: "No words yet. Choose a word in the reader and press its bookmark to save it here.",
      es: "Todav\xEDa no hay palabras. Elige una palabra en el lector y pulsa su marcador para guardarla aqu\xED."
    },
    wordsDue: { en: "due {day}", es: "para el {day}" },
    wordsDueNow: { en: "due now", es: "para repasar ya" },
    wordUnsave: { en: "Unsave {ch}", es: "Quitar {ch}" },
    wordRead: { en: "Read {ch}", es: "Leer {ch}" },
    wordOne: { en: "1 word", es: "1 palabra" },
    wordMany: { en: "{n} words", es: "{n} palabras" },
    dueWordsOnly: { en: "{w} due.", es: "{w} para repasar." },
    dueBoth: { en: "{k} kanji and {w} are due.", es: "Hay {k} kanji y {w} para repasar." },
    nextReviewWords: { en: "Next review: {day}, {w}.", es: "Pr\xF3ximo repaso: {day}, {w}." },
    nextReviewBoth: { en: "Next review: {day}, {k} kanji and {w}.", es: "Pr\xF3ximo repaso: {day}, {k} kanji y {w}." },
    reviewSummaryMixed: {
      en: "You reviewed {n}, kanji and words: {got} on the first try, {again} with Again.",
      es: "Repasaste {n}, entre kanji y palabras: {got} al primer intento y {again} con Otra vez."
    },
    reviewSummaryWords: {
      en: "You reviewed {w}: {got} on the first try, {again} with Again.",
      es: "Repasaste {w}: {got} al primer intento y {again} con Otra vez."
    },
    rvWordMeaning: { en: "Meaning", es: "Significado" },
    rvWordGone: { en: "This word is no longer saved. Answer to go on.", es: "Esta palabra ya no est\xE1 guardada. Responde para seguir." },
    rvWordRead: { en: "Read it", es: "Leerla" },
    importedWordsOne: { en: "1 saved word added or updated.", es: "1 palabra guardada nueva o actualizada." },
    importedWordsMany: { en: "{n} saved words added or updated.", es: "{n} palabras guardadas nuevas o actualizadas." }
  });

  // js/strings-say.js
  var SAY_STRINGS = Object.freeze({
    voice: { en: "Voice", es: "Voz" },
    voiceClear: { en: "Clear", es: "Clara" },
    voiceCalm: { en: "Calm", es: "Serena" },
    voiceBright: { en: "Bright, anime style", es: "Alegre, estilo anime" },
    voiceMale: { en: "Male", es: "Masculina" },
    voiceDevice: { en: "This device's voice", es: "La voz de este equipo" },
    sayIt: { en: "Say", es: "Decir" },
    hearBoth: { en: "Hear both", es: "Escuchar ambas" },
    listen: { en: "Listen", es: "Escuchar" },
    listenDialogue: { en: "Listen to the dialogue", es: "Escuchar el di\xE1logo" }
  });

  // js/strings-more.js
  var MORE_STRINGS = Object.freeze({
    ...CONJ_STRINGS,
    ...KPAGE_STRINGS,
    ...SEARCH_STRINGS,
    ...PROGRESS_STRINGS,
    ...READING_STRINGS,
    ...WORDS_STRINGS,
    ...SAY_STRINGS
  });

  // js/strings.js
  var LANGS2 = Object.freeze(["en", "es"]);
  var current = "en";
  function useLang(lang2) {
    current = LANGS2.includes(lang2) ? lang2 : "en";
    return current;
  }
  function currentLang() {
    return current;
  }
  function t(obj, lang2 = current) {
    if (obj === null || obj === void 0) return "";
    if (typeof obj === "string") return obj;
    if (typeof obj !== "object") return String(obj);
    for (const key of [lang2, "en", "es"]) {
      const v = obj[key];
      if (v !== null && v !== void 0 && v !== "") return String(v);
    }
    return "";
  }
  function ui(key, vars) {
    const raw = t(STRINGS[key]);
    if (!raw && typeof console !== "undefined") console.warn(`[yomu] no string "${key}"`);
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name) => name in vars ? String(vars[name]) : m);
  }
  var STRINGS = Object.freeze({
    ...COLLECT_STRINGS,
    ...PLAY_STRINGS,
    ...READER_STRINGS,
    ...GAPS_STRINGS,
    ...SYNC_STRINGS,
    ...MORE_STRINGS,
    pageTitle: { en: "Yomu | Read Japanese word by word", es: "Yomu | Lee japon\xE9s palabra por palabra" },
    subtitle: { en: "Read Japanese word by word", es: "Lee japon\xE9s palabra por palabra" },
    skip: { en: "Skip to content", es: "Saltar al contenido" },
    phrases: { en: "Phrases", es: "Frases" },
    langName: { en: "English", es: "Espa\xF1ol" },
    langToggle: { en: "Language: English. Switch to Spanish", es: "Idioma: espa\xF1ol. Cambiar a ingl\xE9s" },
    textLabel: { en: "Japanese text", es: "Texto en japon\xE9s" },
    textHint: {
      en: "Paste a line you met: a sign, a lyric, a message, a sentence from a book.",
      es: "Pega una l\xEDnea que encontraste: un cartel, una canci\xF3n, un mensaje, una frase de un libro."
    },
    clear: { en: "Clear", es: "Borrar" },
    tooLong: { en: "Reading the first {n} characters.", es: "Se leen los primeros {n} caracteres." },
    display: { en: "Display", es: "Vista" },
    furigana: { en: "Furigana", es: "Furigana" },
    romaji: { en: "Romaji", es: "Romaji" },
    highlights: { en: "Highlights", es: "Marcas" },
    on: { en: "On", es: "S\xED" },
    off: { en: "Off", es: "No" },
    said: { en: "Said", es: "Dicho" },
    spelled: { en: "Spelled", es: "Escrito" },
    speakAll: { en: "Speak all", es: "Leer todo" },
    stop: { en: "Stop", es: "Detener" },
    slow: { en: "Slow", es: "Lento" },
    sendTo: { en: "Send the text to", es: "Enviar el texto a" },
    sendHint: {
      en: "Opens a new tab. The text leaves this page only when you click one of these.",
      es: "Abre una pesta\xF1a nueva. El texto sale de esta p\xE1gina solo cuando haces clic en uno de estos."
    },
    deepl: { en: "DeepL", es: "DeepL" },
    google: { en: "Google Translate", es: "Google Traductor" },
    sendTitle: { en: "Opens {site} in a new tab with this text", es: "Abre {site} en una pesta\xF1a nueva con este texto" },
    speechChecking: { en: "Looking for a Japanese voice on this device.", es: "Buscando una voz japonesa en este dispositivo." },
    speechNone: {
      en: "This device has no Japanese voice, so nothing can be read aloud. Add one in your system speech settings.",
      es: "Este dispositivo no tiene voz japonesa, as\xED que no se puede leer en voz alta. Agrega una en los ajustes de voz del sistema."
    },
    speechNoApi: { en: "This browser cannot read aloud.", es: "Este navegador no puede leer en voz alta." },
    loadingReader: { en: "Loading the reader", es: "Cargando el lector" },
    loadingShards: { en: "Looking up {done} of {total} dictionary files", es: "Consultando {done} de {total} archivos del diccionario" },
    failedFile: { en: "Could not load {file} ({detail}).", es: "No se pudo cargar {file} ({detail})." },
    failedReader: { en: "The reader could not start ({detail}).", es: "El lector no pudo iniciar ({detail})." },
    retry: { en: "Retry", es: "Reintentar" },
    readOne: { en: "Read 1 word.", es: "Se ley\xF3 1 palabra." },
    readMany: { en: "Read {n} words.", es: "Se leyeron {n} palabras." },
    guessOne: { en: "1 is not in the dictionary, so its reading is a guess.", es: "1 no est\xE1 en el diccionario, as\xED que su lectura es una suposici\xF3n." },
    guessMany: { en: "{n} are not in the dictionary, so their readings are guesses.", es: "{n} no est\xE1n en el diccionario, as\xED que sus lecturas son suposiciones." },
    noJapanese: { en: "No Japanese found in this text.", es: "No se encontr\xF3 japon\xE9s en este texto." },
    emptyTitle: { en: "Paste a line of Japanese above.", es: "Pega arriba una l\xEDnea en japon\xE9s." },
    emptyLead: { en: "Or start with one of these:", es: "O empieza con una de estas:" },
    reading: { en: "Reading", es: "Lectura" },
    readingHint: {
      en: "Choose a word to see it on its own.",
      es: "Elige una palabra para verla sola."
    },
    inText: { en: "In this text", es: "En este texto" },
    inTextNone: { en: "No special sounds or grammar notes in this text.", es: "No hay sonidos especiales ni notas de gram\xE1tica en este texto." },
    soundsHead: { en: "Sounds", es: "Sonidos" },
    grammarHead: { en: "Grammar", es: "Gram\xE1tica" },
    loanHead: { en: "Loanword rules", es: "Reglas de pr\xE9stamos" },
    countSuffix: { en: "in this text", es: "en este texto" },
    sentencesOne: { en: "in 1 sentence", es: "en 1 oraci\xF3n" },
    sentencesMany: { en: "in {n} sentences", es: "en {n} oraciones" },
    show: { en: "Show", es: "Mostrar" },
    details: { en: "Details", es: "Detalles" },
    word: { en: "Word", es: "Palabra" },
    kanji: { en: "Kanji", es: "Kanji" },
    notes: { en: "Notes", es: "Notas" },
    closeDetails: { en: "Close the details", es: "Cerrar los detalles" },
    wordEmpty: { en: "Choose a word in the reading to see it here.", es: "Elige una palabra de la lectura para verla aqu\xED." },
    kanaReading: { en: "Reading", es: "Lectura" },
    saidLine: { en: "Said", es: "Se dice" },
    spelledLine: { en: "Spelled", es: "Se escribe" },
    beats: { en: "Beats", es: "Pulsos" },
    beatsHint: { en: "One beat per kana, the way the word is timed.", es: "Un pulso por kana, como se mide la palabra." },
    soundOut: { en: "Sound it out", es: "Pronunciar por pulsos" },
    speakWord: { en: "Say the word", es: "Decir la palabra" },
    partOfSpeech: { en: "Kind of word", es: "Tipo de palabra" },
    meanings: { en: "Meanings", es: "Significados" },
    meaningsEnglish: { en: "Dictionary meanings are in English.", es: "Los significados del diccionario est\xE1n en ingl\xE9s." },
    formed: { en: "How it is formed", es: "C\xF3mo se forma" },
    dictionaryForm: { en: "dictionary form", es: "forma de diccionario" },
    wordNotes: { en: "Notes for this word", es: "Notas de esta palabra" },
    openNote: { en: "Open the note", es: "Abrir la nota" },
    jisho: { en: "Look up on Jisho", es: "Buscar en Jisho" },
    jishoTitle: { en: "Opens jisho.org in a new tab with this word", es: "Abre jisho.org en una pesta\xF1a nueva con esta palabra" },
    guess: {
      en: "No dictionary entry for this word, so the reading is a guess.",
      es: "Esta palabra no est\xE1 en el diccionario, as\xED que la lectura es una suposici\xF3n."
    },
    altsOne: { en: "One other entry is written the same way.", es: "Otra entrada se escribe igual." },
    altsMany: { en: "{n} other entries are written the same way.", es: "Otras {n} entradas se escriben igual." },
    noMeaning: { en: "No meaning listed.", es: "Sin significado registrado." },
    rareLabel: { en: "Rare word", es: "Palabra poco com\xFAn" },
    rareWord: { en: "It is not among the common words, so it was read from the full dictionary.", es: "No est\xE1 entre las palabras comunes, as\xED que se ley\xF3 del diccionario completo." },
    rareTag: { en: "rare word", es: "palabra poco com\xFAn" },
    noSplit: {
      en: "It cannot be split into dictionary words either.",
      es: "Tampoco se puede dividir en palabras del diccionario."
    },
    madeOf: { en: "Made of", es: "Formada por" },
    notInDict: { en: "not in the dictionary", es: "no est\xE1 en el diccionario" },
    soundsLike: { en: "Sounds like English", es: "Suena como el ingl\xE9s" },
    soundsLikeNote: { en: "(a guess from the sound, not a dictionary entry)", es: "(una suposici\xF3n por el sonido, no una entrada del diccionario)" },
    compoundRule: {
      en: "Written as one word. The dictionary has its parts, not the whole.",
      es: "Se escribe como una sola palabra. El diccionario tiene sus partes, no el conjunto."
    },
    compoundGuess: {
      en: "No split into dictionary words covers all of it, so the part that is not in the dictionary is read as written.",
      es: "Ninguna divisi\xF3n en palabras del diccionario la cubre entera, as\xED que la parte que no est\xE1 en el diccionario se lee tal como se escribe."
    },
    origin: { en: "Where it comes from", es: "De d\xF3nde viene" },
    fromLang: { en: "From {lang}", es: "Del {lang}" },
    fromLangWord: { en: "From {lang}: {word}", es: "Del {lang}: {word}" },
    fromOther: { en: "From another language ({code})", es: "De otro idioma ({code})" },
    wasei: { en: "Made-in-Japan English", es: "Ingl\xE9s hecho en Jap\xF3n" },
    waseiWord: { en: "Made-in-Japan English, from {word}", es: "Ingl\xE9s hecho en Jap\xF3n, a partir de {word}" },
    shortened: { en: "Shortened from {words}", es: "Acortada de {words}" },
    kanjiEmpty: { en: "No kanji in this text.", es: "No hay kanji en este texto." },
    kanjiHint: {
      en: "Point at a row to find that kanji in the text. On a touch screen, tap it. The bookmark saves it to My kanji.",
      es: "Se\xF1ala una fila para encontrar ese kanji en el texto. En una pantalla t\xE1ctil, t\xF3cala. El marcador lo guarda en Mis kanji."
    },
    here: { en: "here", es: "aqu\xED" },
    onReading: { en: "on", es: "on" },
    kunReading: { en: "kun", es: "kun" },
    parts: { en: "parts", es: "partes" },
    strokes: { en: "{n} strokes", es: "{n} trazos" },
    kanjiMissing: { en: "Not in the kanji dictionary.", es: "No est\xE1 en el diccionario de kanji." },
    notesEmpty: {
      en: 'Choose a line under "In this text" to read its note here.',
      es: 'Elige una l\xEDnea de "En este texto" para leer su nota aqu\xED.'
    },
    noteMissing: { en: "There is no note for this yet.", es: "Todav\xEDa no hay nota para esto." },
    examples: { en: "Examples", es: "Ejemplos" },
    example: { en: "Example", es: "Ejemplo" },
    pattern: { en: "Pattern", es: "Estructura" },
    whispered: { en: "whispered", es: "susurrado" },
    pairWith: { en: "with", es: "con" },
    pairWithout: { en: "without", es: "sin" },
    noteFallback: { en: "Part of this note is only in English so far.", es: "Parte de esta nota todav\xEDa est\xE1 solo en ingl\xE9s." },
    minimalPair: { en: "Minimal pair", es: "Par m\xEDnimo" },
    close: { en: "Close", es: "Cerrar" },
    phrasesTitle: { en: "Phrases", es: "Frases" },
    phrasesLead: {
      en: "Choose a phrase to read it word by word.",
      es: "Elige una frase para leerla palabra por palabra."
    },
    phrasesLoading: { en: "Loading the phrases", es: "Cargando las frases" },
    dialogues: { en: "Dialogues", es: "Di\xE1logos" },
    readPhrase: { en: "Read it", es: "Leerla" },
    readDialogue: { en: "Read the dialogue", es: "Leer el di\xE1logo" },
    chunkIt: { en: "Chunk it", es: "Por partes" },
    chunkHint: {
      en: "Each beat first, then the whole phrase.",
      es: "Primero cada pulso, luego la frase entera."
    },
    translation: { en: "Translation", es: "Traducci\xF3n" },
    openInYomu: { en: "Open in Yomu", es: "Abrir en Yomu" },
    // My kanji: the save toggle, the counts, the screen, the review, the backup.
    // A {ch} is filled with a kanji in its own lang="ja" span (render-save.js).
    myKanji: { en: "My kanji", es: "Mis kanji" },
    dueCountSr: { en: ", {n} due for review", es: ", {n} para repasar" },
    saveKanji: { en: "Save {ch} to My kanji", es: "Guardar {ch} en Mis kanji" },
    removeKanji: { en: "Remove {ch} from My kanji", es: "Quitar {ch} de Mis kanji" },
    seenTimes: { en: "seen {n} times", es: "visto {n} veces" },
    seenFirst: { en: "first time", es: "primera vez" },
    seenOnce: { en: "seen once", es: "visto una vez" },
    unsavedKanji: { en: "Unsaved kanji", es: "Kanji sin guardar" },
    mark: { en: "Mark", es: "Marcar" },
    wordKanji: { en: "Kanji in this word", es: "Kanji de esta palabra" },
    today: { en: "today", es: "hoy" },
    tomorrow: { en: "tomorrow", es: "ma\xF1ana" },
    backToReader: { en: "Back to the reader", es: "Volver al lector" },
    myKanjiLead: { en: "Kanji you save, and every kanji you have read here.", es: "Los kanji que guardas y todos los que le\xEDste aqu\xED." },
    loadingKanji: { en: "Loading the kanji details", es: "Cargando los detalles de los kanji" },
    kanjiInfoFailed: { en: "Could not load the kanji details ({detail}).", es: "No se pudieron cargar los detalles de los kanji ({detail})." },
    storeDamaged: {
      en: "Your saved kanji could not be read, so My kanji started empty. A copy of the old data is kept in this browser.",
      es: "No se pudieron leer tus kanji guardados, as\xED que Mis kanji empez\xF3 vac\xEDo. Una copia de los datos anteriores queda en este navegador."
    },
    storePartial: {
      en: "Part of My kanji could not be read and was left out ({n} entries).",
      es: "Una parte de Mis kanji no se pudo leer y qued\xF3 fuera ({n} entradas)."
    },
    storeBlocked: {
      en: "This browser is not keeping My kanji, so it lasts until this page closes.",
      es: "Este navegador no est\xE1 guardando Mis kanji, as\xED que dura hasta que se cierre esta p\xE1gina."
    },
    dueHead: { en: "Due for review", es: "Para repasar" },
    dueOne: { en: "1 kanji is due.", es: "Hay 1 kanji para repasar." },
    dueMany: { en: "{n} kanji are due.", es: "Hay {n} kanji para repasar." },
    dueNone: { en: "Nothing is due. Next review: {day}.", es: "No hay nada para repasar. Pr\xF3ximo repaso: {day}." },
    dueEmpty: {
      en: "Nothing to review yet. A kanji you save is due the same day.",
      es: "Todav\xEDa no hay nada para repasar. Un kanji que guardas se repasa el mismo d\xEDa."
    },
    startReview: { en: "Start review", es: "Empezar el repaso" },
    savedHead: { en: "Saved", es: "Guardados" },
    sortBy: { en: "Sort", es: "Ordenar" },
    sortRecent: { en: "Recently saved", es: "Recientes" },
    sortSeen: { en: "Most seen", es: "M\xE1s vistos" },
    sortDue: { en: "Due", es: "Por repaso" },
    filter: { en: "Filter", es: "Filtrar" },
    filterHint: { en: "A kanji, a meaning or a reading", es: "Un kanji, un significado o una lectura" },
    savedEmpty: {
      en: "No saved kanji yet. In the reader, the bookmark beside a kanji in the Kanji table or the Word panel saves it.",
      es: "Todav\xEDa no hay kanji guardados. En el lector, el marcador junto a un kanji en la tabla de kanji o en el panel de la palabra lo guarda."
    },
    filterNone: { en: "No saved kanji match the filter.", es: "Ning\xFAn kanji guardado coincide con el filtro." },
    savedOn: { en: "saved {day}", es: "guardado: {day}" },
    dueOn: { en: "review {day}", es: "repaso: {day}" },
    notSeen: { en: "not met in a text yet", es: "todav\xEDa no aparece en un texto" },
    metIn: { en: "Met in", es: "Visto en" },
    meaning: { en: "Meaning", es: "Significado" },
    remove: { en: "Remove", es: "Quitar" },
    oftenHead: { en: "Seen often, not saved", es: "Vistos a menudo, sin guardar" },
    oftenEmpty: {
      en: "The kanji you read show up here, the ones met most first.",
      es: "Aqu\xED aparecen los kanji que lees, primero los que m\xE1s viste."
    },
    oftenAllSaved: { en: "Every kanji you have met is saved.", es: "Todos los kanji que viste est\xE1n guardados." },
    backupHead: { en: "Backup", es: "Copia de seguridad" },
    backupLead: {
      en: "Export saves a file with your kanji, their counts and the phrases you saved in History, and no other text. Import adds a file to what is here.",
      es: "Exportar guarda un archivo con tus kanji, sus conteos y las frases que guardaste en el historial, y ning\xFAn otro texto. Importar suma un archivo a lo que ya hay."
    },
    exportFile: { en: "Export", es: "Exportar" },
    importFile: { en: "Import", es: "Importar" },
    clearAll: { en: "Clear all", es: "Borrar todo" },
    cancel: { en: "Cancel", es: "Cancelar" },
    clearTitle: { en: "Clear all of My kanji?", es: "\xBFBorrar todo Mis kanji?" },
    clearBody: {
      en: "This forgets every saved kanji, its review schedule and every count of the kanji you met, in this browser, so your collection is emptied too. History is not touched. Export first to keep a copy.",
      es: "Esto olvida en este navegador cada kanji guardado, su calendario de repaso y cada conteo de los kanji que viste, as\xED que tu colecci\xF3n tambi\xE9n queda vac\xEDa. El historial no se toca. Exporta antes para guardar una copia."
    },
    cleared: { en: "My kanji is empty now.", es: "Mis kanji qued\xF3 vac\xEDo." },
    exported: { en: "Saved {file}.", es: "Se guard\xF3 {file}." },
    imported: {
      en: "Imported: {saved} saved kanji added, {seen} kanji counts added or raised.",
      es: "Importado: {saved} kanji guardados nuevos, {seen} conteos de kanji nuevos o mayores."
    },
    importDropped: { en: "{n} damaged entries were left out.", es: "Se dejaron fuera {n} entradas da\xF1adas." },
    importJson: { en: "That file is not JSON, so nothing was imported.", es: "Ese archivo no es JSON, as\xED que no se import\xF3 nada." },
    importFormat: { en: "That file is not a Yomu kanji backup, so nothing was imported.", es: "Ese archivo no es una copia de Mis kanji de Yomu, as\xED que no se import\xF3 nada." },
    importEmpty: { en: "That backup holds no kanji.", es: "Esa copia no tiene kanji." },
    importSize: { en: "That file is too large to be a kanji backup.", es: "Ese archivo es demasiado grande para ser una copia de kanji." },
    importRead: { en: "That file could not be read.", es: "No se pudo leer ese archivo." },
    review: { en: "Review", es: "Repaso" },
    reviewOf: { en: "{at} of {of}", es: "{at} de {of}" },
    reviewAgainTag: { en: "once more", es: "una vez m\xE1s" },
    reviewPrompt: {
      en: "Recall how it is read and what it means, then show the answer.",
      es: "Recuerda c\xF3mo se lee y qu\xE9 significa, y luego muestra la respuesta."
    },
    reviewShow: { en: "Show", es: "Mostrar" },
    again: { en: "Again", es: "Otra vez" },
    gotIt: { en: "Got it", es: "Lo sab\xEDa" },
    leaveReview: { en: "Leave the review", es: "Salir del repaso" },
    reviewKeys: {
      en: "Keys: Space shows the answer, 1 is Again, 2 is Got it, Escape leaves.",
      es: "Teclas: Espacio muestra la respuesta, 1 es Otra vez, 2 es Lo sab\xEDa, Escape sale."
    },
    reviewNothing: { en: "Nothing is due right now.", es: "No hay nada para repasar ahora." },
    reviewDone: { en: "Review done", es: "Repaso terminado" },
    reviewSummary: {
      en: "You reviewed {n} kanji: {got} on the first try, {again} with Again.",
      es: "Repasaste {n} kanji: {got} al primer intento y {again} con Otra vez."
    },
    reviewAgainList: { en: "Back tomorrow:", es: "Vuelven ma\xF1ana:" },
    nextReview: { en: "Next review: {day}, {n} kanji.", es: "Pr\xF3ximo repaso: {day}, {n} kanji." },
    backToMyKanji: { en: "Back to My kanji", es: "Volver a Mis kanji" },
    noInfo: { en: "No details in the kanji dictionary.", es: "Sin detalles en el diccionario de kanji." },
    // JMnedict is named here because a name from the names tier can be on
    // screen at any time, and its licence asks for the acknowledgement there.
    footerNote: {
      en: "Dictionary: JMdict, JMnedict and KANJIDIC, EDRDG, CC BY-SA 4.0. Your text stays in this browser.",
      es: "Diccionario: JMdict, JMnedict y KANJIDIC, EDRDG, CC BY-SA 4.0. Tu texto se queda en este navegador."
    }
  });
  var EXAMPLES = Object.freeze([
    { ja: "\u304A\u306F\u3088\u3046\u3054\u3056\u3044\u307E\u3059\u3002", en: "Good morning (polite).", es: "Buenos d\xEDas (cort\xE9s)." },
    { ja: "\u308F\u305F\u3057\u306F\u30D1\u30F3\u3092\u305F\u3079\u307E\u3059\u3002", en: "I eat bread.", es: "Yo como pan." },
    { ja: "\u4ECA\u65E5\u306F\u96E8\u304C\u964D\u3063\u3066\u3044\u307E\u3059\u3002", en: "It is raining today.", es: "Hoy est\xE1 lloviendo." }
  ]);
  var GODAN_ENDING = { u: "\u3046", k: "\u304F", g: "\u3050", s: "\u3059", t: "\u3064", n: "\u306C", b: "\u3076", m: "\u3080", r: "\u308B" };
  var POS = Object.freeze({
    n: { en: "noun", es: "sustantivo" },
    pn: { en: "pronoun", es: "pronombre" },
    "n-pr": { en: "name", es: "nombre propio" },
    "n-t": { en: "noun of time", es: "sustantivo de tiempo" },
    "n-adv": { en: "noun used as an adverb", es: "sustantivo que funciona como adverbio" },
    "n-suf": { en: "noun used as a suffix", es: "sustantivo que funciona como sufijo" },
    "n-pref": { en: "noun used as a prefix", es: "sustantivo que funciona como prefijo" },
    v1: { en: "ichidan verb (ends in \u308B, drops it)", es: "verbo ichidan (termina en \u308B y la pierde)" },
    "v1-s": { en: "ichidan verb, special", es: "verbo ichidan, especial" },
    vk: { en: "the verb \u304F\u308B, irregular", es: "el verbo \u304F\u308B, irregular" },
    vs: { en: "noun that becomes a verb with \u3059\u308B", es: "sustantivo que se vuelve verbo con \u3059\u308B" },
    "vs-i": { en: "\u3059\u308B verb, irregular", es: "verbo con \u3059\u308B, irregular" },
    "vs-s": { en: "\u3059\u308B verb, special", es: "verbo con \u3059\u308B, especial" },
    vz: { en: "\u305A\u308B verb", es: "verbo en \u305A\u308B" },
    vt: { en: "takes an object", es: "lleva objeto directo" },
    vi: { en: "takes no object", es: "no lleva objeto directo" },
    "adj-i": { en: "i-adjective", es: "adjetivo en -i" },
    "adj-ix": { en: "i-adjective, \u3044\u3044 and \u3088\u3044", es: "adjetivo en -i, \u3044\u3044 y \u3088\u3044" },
    "adj-na": { en: "na-adjective", es: "adjetivo en -na" },
    "adj-no": { en: "can take \u306E before a noun", es: "puede llevar \u306E antes de un sustantivo" },
    "adj-pn": { en: "comes before a noun", es: "va antes de un sustantivo" },
    "adj-t": { en: "taru adjective", es: "adjetivo en -taru" },
    "adj-f": { en: "modifies the noun after it", es: "modifica al sustantivo siguiente" },
    adv: { en: "adverb", es: "adverbio" },
    "adv-to": { en: "adverb, can take \u3068", es: "adverbio, puede llevar \u3068" },
    aux: { en: "auxiliary", es: "auxiliar" },
    "aux-v": { en: "auxiliary verb", es: "verbo auxiliar" },
    "aux-adj": { en: "auxiliary adjective", es: "adjetivo auxiliar" },
    conj: { en: "conjunction", es: "conjunci\xF3n" },
    cop: { en: "copula (is, are)", es: "c\xF3pula (es, son)" },
    ctr: { en: "counter", es: "contador" },
    exp: { en: "expression", es: "expresi\xF3n" },
    int: { en: "interjection", es: "interjecci\xF3n" },
    num: { en: "number", es: "n\xFAmero" },
    pref: { en: "prefix", es: "prefijo" },
    suf: { en: "suffix", es: "sufijo" },
    prt: { en: "particle", es: "part\xEDcula" },
    unc: { en: "unclassified", es: "sin clasificar" }
  });
  var KIND_POS = Object.freeze({
    particle: "prt",
    copula: "cop",
    number: "num",
    name: "n-pr"
  });
  function posWord(tag) {
    if (POS[tag]) return t(POS[tag]);
    const godan = /^v5([a-z])/.exec(tag || "");
    if (godan) {
      const end = GODAN_ENDING[godan[1]];
      const base = { en: "godan verb", es: "verbo godan" };
      return end ? `${t(base)}, ${t({ en: "ends in", es: "termina en" })} ${end}` : t(base);
    }
    return String(tag || "");
  }
  function posWords(token) {
    const tags2 = token && token.kind !== "number" && token.entry && token.entry.p ? String(token.entry.p).split(/\s+/).filter(Boolean) : [];
    if (!tags2.length && token && KIND_POS[token.kind]) tags2.push(KIND_POS[token.kind]);
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const tag of tags2) {
      const w = posWord(tag);
      if (w && !seen.has(w)) {
        seen.add(w);
        out.push(w);
      }
    }
    return out;
  }
  var LANG_NAMES = Object.freeze({
    eng: { en: "English", es: "ingl\xE9s" },
    fre: { en: "French", es: "franc\xE9s" },
    ger: { en: "German", es: "alem\xE1n" },
    ita: { en: "Italian", es: "italiano" },
    dut: { en: "Dutch", es: "neerland\xE9s" },
    por: { en: "Portuguese", es: "portugu\xE9s" },
    lat: { en: "Latin", es: "lat\xEDn" },
    chi: { en: "Chinese", es: "chino" },
    spa: { en: "Spanish", es: "espa\xF1ol" },
    rus: { en: "Russian", es: "ruso" },
    san: { en: "Sanskrit", es: "s\xE1nscrito" },
    ara: { en: "Arabic", es: "\xE1rabe" },
    ain: { en: "Ainu", es: "ainu" },
    kor: { en: "Korean", es: "coreano" },
    gre: { en: "Greek", es: "griego" },
    grc: { en: "Ancient Greek", es: "griego antiguo" },
    haw: { en: "Hawaiian", es: "hawaiano" },
    hin: { en: "Hindi", es: "hindi" },
    heb: { en: "Hebrew", es: "hebreo" },
    tur: { en: "Turkish", es: "turco" },
    tha: { en: "Thai", es: "tailand\xE9s" },
    vie: { en: "Vietnamese", es: "vietnamita" },
    swe: { en: "Swedish", es: "sueco" },
    may: { en: "Malay", es: "malayo" },
    per: { en: "Persian", es: "persa" },
    ukr: { en: "Ukrainian", es: "ucraniano" },
    hun: { en: "Hungarian", es: "h\xFAngaro" },
    ind: { en: "Indonesian", es: "indonesio" },
    fin: { en: "Finnish", es: "fin\xE9s" },
    dan: { en: "Danish", es: "dan\xE9s" },
    pol: { en: "Polish", es: "polaco" },
    nor: { en: "Norwegian", es: "noruego" }
  });
  var REGISTER = Object.freeze({
    set: { en: "set phrase", es: "frase hecha" },
    plain: { en: "plain", es: "simple" },
    casual: { en: "casual", es: "informal" },
    polite: { en: "polite", es: "cort\xE9s" },
    formal: { en: "formal", es: "formal" },
    humble: { en: "humble", es: "humilde" },
    honorific: { en: "honorific", es: "honor\xEDfico" },
    neutral: { en: "neutral", es: "neutro" }
  });

  // js/audio.js
  init_kana();

  // js/history-text.js
  var MAX_TEXT = 2e3;
  function normalizeText(text) {
    return String(text ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  }
  function cyrb53(str, seed = 0) {
    let h1 = 3735928559 ^ seed;
    let h2 = 1103547991 ^ seed;
    for (let i = 0; i < str.length; i += 1) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507);
    h1 ^= Math.imul(h2 ^ h2 >>> 13, 3266489909);
    h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507);
    h2 ^= Math.imul(h1 ^ h1 >>> 13, 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  function textKey(text) {
    return cyrb53(normalizeText(text)).toString(36);
  }
  function clipText(text) {
    const s = String(text ?? "");
    if (s.length <= MAX_TEXT) return s;
    const cut = s.charCodeAt(MAX_TEXT - 1);
    return s.slice(0, cut >= 55296 && cut <= 56319 ? MAX_TEXT - 1 : MAX_TEXT);
  }
  var MAX_AROUND = 60;
  function sentenceAround(text, ch) {
    const all = [...String(text ?? "")];
    const at = all.lastIndexOf(ch);
    if (!ch || at < 0) return null;
    const { before, after } = around2(all, at, 1);
    return { before, ch, after };
  }
  function sentenceAt(text, start, surface) {
    const s = String(text ?? "");
    const w = String(surface ?? "");
    if (!w) return null;
    const at = Number.isInteger(start) && start >= 0 && s.startsWith(w, start) ? start : s.indexOf(w);
    if (at < 0) return null;
    const { before, after } = around2([...s], [...s.slice(0, at)].length, [...w].length);
    return { before, word: w, after };
  }
  function around2(all, at, len3) {
    const end = (c) => "\u3002\uFF01\uFF1F!?".includes(c);
    const brk = (c) => c === "\n" || c === "\r";
    let from = at;
    while (from > 0 && !end(all[from - 1]) && !brk(all[from - 1])) from -= 1;
    let to = at + len3;
    while (to < all.length && !brk(all[to]) && !end(all[to - 1])) to += 1;
    let left = all.slice(from, at);
    let right = all.slice(at + len3, to);
    while (left.length && /\s/u.test(left[0])) left.shift();
    while (right.length && /\s/u.test(right[right.length - 1])) right.pop();
    const room = Math.max(0, MAX_AROUND - len3);
    if (left.length + right.length > room) {
      let keepLeft = Math.min(left.length, Math.floor(room / 2));
      const keepRight = Math.min(right.length, room - keepLeft);
      keepLeft = Math.min(left.length, room - keepRight);
      const cutLeft = keepLeft < left.length;
      const cutRight = keepRight < right.length;
      left = left.slice(left.length - keepLeft);
      right = right.slice(0, keepRight);
      if (cutLeft) left = ["\u2026", ...left.slice(1)];
      if (cutRight) right = [...right.slice(0, -1), "\u2026"];
    }
    return { before: left.join(""), after: right.join("") };
  }

  // js/audio.js
  init_range_store();
  var AUDIO_SRC = "data/audio/index.json";
  var AUDIO_FORMAT = "yomu-audio/2";
  var CLIPS_FORMAT = "yomu-audio-clips/1";
  var AUDIO_DIR = "data/audio";
  var FOLD = /[\s、。，．,.!！?？「」『』（）()［］[\]【】…‥・：:;；"'“”‘’〜~]/gu;
  function audioKey(text) {
    return toHira(String(text || "").normalize("NFKC")).replace(FOLD, "");
  }
  function wordKey(written, reading) {
    const w = audioKey(written);
    return hasKanji(w) && reading ? `${w}|${audioKey(reading)}` : w;
  }
  function keysOf(text, lookup = []) {
    return [.../* @__PURE__ */ new Set([...lookup.filter(Boolean), audioKey(text)])];
  }
  function normalizeAudio(json) {
    if (!json || json.format !== AUDIO_FORMAT) throw new Error(`expected format ${AUDIO_FORMAT}`);
    const voices = (Array.isArray(json.voices) ? json.voices : []).filter((v) => v && /^[a-z]+$/.test(v.id || ""));
    const shards = (Array.isArray(json.shards) ? json.shards : []).filter((s) => s && typeof s.first === "string" && typeof s.src === "string");
    return { voices, firsts: shards.map((s) => s.first), srcs: shards.map((s) => s.src), clips: /* @__PURE__ */ new Map(), loaded: /* @__PURE__ */ new Set() };
  }
  function addShard(audio2, n2, json) {
    if (!json || json.format !== CLIPS_FORMAT) throw new Error(`expected format ${CLIPS_FORMAT}`);
    for (const [k, v] of Object.entries(json.clips || {})) if (Array.isArray(v) && v.length === 2) audio2.clips.set(k, v);
    audio2.loaded.add(n2);
  }
  function shardsFor(audio2, keys) {
    const out = /* @__PURE__ */ new Set();
    for (const k of keys) {
      const n2 = lastAtMost(audio2.firsts, k);
      if (n2 >= 0 && !audio2.loaded.has(n2)) out.add(n2);
    }
    return [...out];
  }
  function idIn(audio2, key, voice) {
    const entry = audio2.clips.get(key);
    const i = audio2.voices.findIndex((v) => v.id === voice);
    return entry && i >= 0 && entry[1] & 1 << i ? entry[0] : null;
  }
  var pathOf2 = (voice, id) => `${AUDIO_DIR}/${voice}/${id}.mp3`;
  function voicesInTurn(audio2, voice) {
    const first = audio2 && audio2.voices[0] && audio2.voices[0].id;
    return first && first !== voice ? [voice, first] : [voice];
  }
  function clipInVoice(audio2, keys, voice) {
    if (!audio2) return null;
    for (const key of keys) {
      const id = idIn(audio2, key, voice);
      if (id) return { id, voice, path: pathOf2(voice, id) };
    }
    return null;
  }
  function clipByKeys(audio2, keys, voice) {
    if (!audio2) return null;
    for (const key of keys) {
      for (const v of voicesInTurn(audio2, voice)) {
        const id = idIn(audio2, key, v);
        if (id) return { id, voice: v, path: pathOf2(v, id) };
      }
    }
    return null;
  }
  function wordSequence(audio2, keysList, voice) {
    const choices = voicesInTurn(audio2, voice);
    const specific = keysList.map((keys) => {
      const key = keys.find((key2) => choices.some((v) => clipInVoice(audio2, [key2], v)));
      return key ? [key] : [];
    });
    let best = { voice: voice || null, clips: keysList.map(() => null), recorded: 0 };
    for (const v of choices) {
      const clips = specific.map((keys) => clipInVoice(audio2, keys, v));
      const recorded = clips.filter(Boolean).length;
      if (recorded > best.recorded) best = { voice: v, clips, recorded };
    }
    return best;
  }

  // js/search.js
  init_range_store();
  init_kana();
  init_deinflect();
  init_search_latin();

  // js/search-romaji.js
  init_kana();
  init_search_latin();
  var ROMAJI_READINGS = 64;
  var ROMAJI_EDITS = 3;
  var SENTENCE_MAX = 60;
  function createRomajiSearch({
    dict: dict2,
    japanese,
    common,
    result,
    japaneseKeys: japaneseKeys2
  }) {
    let sentenceModule = null;
    function bandOf2(res, rec) {
      if (![...res.key].some(isKanji2) && Array.isArray(rec.k) && rec.k[0]) {
        const kana = toHira(res.key);
        const bands = (dict2.get(rec.k[0]) || []).filter((r) => !r.r || r.r.some((x) => toHira(x) === kana)).map((r) => r.q).filter(Boolean);
        if (bands.length) return Math.min(...bands);
      }
      return rec.q || 6;
    }
    const wordBand = (res) => Math.min(...res.recs.map((r) => bandOf2(res, r)));
    async function needBands(results) {
      const spellings = results.filter((res) => ![...res.key].some(isKanji2)).flatMap((res) => res.recs.map((r) => Array.isArray(r.k) && r.k[0]).filter(Boolean));
      if (spellings.length) await dict2.need([...new Set(spellings)]);
    }
    async function firstTier(kana) {
      const found = japaneseKeys2(kana);
      const keys = { keys: [.../* @__PURE__ */ new Set([...found.keys, ...kanaForms(kana)])], bases: found.bases };
      await dict2.need(keys.keys);
      const out = common(keys);
      await needBands(out);
      const exact = out.filter((r) => r.via === "exact");
      const forms2 = out.filter((r) => r.via === "form").map((r, n2) => ({ r, n: n2 })).sort((x, y) => wordBand(x.r) - wordBand(y.r) || x.n - y.n).map((x) => x.r);
      return [...exact, ...forms2];
    }
    async function variantWords(kana, most = ROMAJI_EDITS) {
      if (kana.length < 2) return [];
      const readings = romajiVariants(kana, { limit: ROMAJI_READINGS, most }).filter((v) => v.edits > 0);
      const asked2 = readings.map((v) => {
        const found = japaneseKeys2(v.kana);
        return { ...v, keys: { keys: [.../* @__PURE__ */ new Set([...found.keys, ...kanaForms(v.kana)])], bases: found.bases } };
      });
      await dict2.need([...new Set(asked2.flatMap((v) => v.keys.keys))]);
      for (let edits = 1; edits <= most; edits += 1) {
        const seen = /* @__PURE__ */ new Set();
        const level = [];
        asked2.filter((v) => v.edits === edits).forEach((v, n2) => {
          for (const res of common(v.keys, seen)) level.push({ res: Object.freeze({ ...res, romaji: v.kana }), n: n2, exact: res.via === "exact" ? 0 : 1 });
        });
        if (!level.length) continue;
        await needBands(level.map((x) => x.res));
        level.sort((x, y) => x.exact - y.exact || wordBand(x.res) - wordBand(y.res) || x.n - y.n);
        return level.map((x) => x.res);
      }
      return [];
    }
    function ownWord(res, edited) {
      if (res.via !== "rare") return false;
      const theirs = new Set(edited.flatMap((x) => [x.key, ...x.recs.flatMap((r) => r.k || [])]));
      return res.recs.some((r) => r.u && !r.e && Array.isArray(r.k) && r.k.length && !r.k.some((k) => theirs.has(k)));
    }
    function sentenceReader() {
      if (!sentenceModule) sentenceModule = Promise.resolve().then(() => (init_search_sentence(), search_sentence_exports)).catch((e) => {
        sentenceModule = null;
        throw e;
      });
      return sentenceModule;
    }
    const partsOf = ({ kana, starts, particles }) => starts.map((a, i) => ({
      kana: kana.slice(a, i + 1 < starts.length ? starts[i + 1] : kana.length),
      particle: particles.includes(a)
    }));
    const SURELY_PARTICLE = /* @__PURE__ */ new Set(["\u308F", "\u306F", "\u3092", "\u3078"]);
    const SAID2 = /* @__PURE__ */ new Set(["\u308F", "\u304A", "\u3048"]);
    async function romajiWords(reading) {
      const { kana, particles } = reading;
      const tag = (list2, read = kana) => list2.map((r) => Object.freeze({ ...r, romaji: read }));
      const parts = partsOf(reading);
      const asWritten = parts.map((p) => p.particle ? particleKana(p.kana) : p.kana).join("");
      if (particles.length) {
        const words = await firstTier(asWritten);
        if (words.length) return { typed: tag(words, asWritten), edited: [], asTyped: [], sentence: null };
      }
      const plain = await japanese(kana, kanaForms(kana));
      const typed = tag(plain.some((r) => r.via === "exact" || r.via === "form") ? await firstTier(kana) : []);
      const asTyped = tag(plain.filter((r) => r.via === "rare" || r.via === "name"));
      const edited = typed.length ? [] : await variantWords(kana);
      const strong = parts.some((p) => p.particle && SURELY_PARTICLE.has(particleKana(p.kana)));
      if (particles.length) return { typed, edited, asTyped, sentence: { strong } };
      if (!typed.length && !edited.length && !asTyped.length) return { typed, edited, asTyped, sentence: { strong: false } };
      if (typed.length && kana.length >= 3 && SAID2.has(kana.at(-1))) {
        const stem = await firstTier(kana.slice(0, -1));
        if (stem.some((r) => r.via === "exact" && wordBand(r) === 1) && typed.every((r) => wordBand(r) >= 4)) {
          return { typed, edited, asTyped, sentence: { strong: true, tail: true } };
        }
      }
      return { typed, edited, asTyped, sentence: null };
    }
    async function partWord(kana) {
      if ((await firstTier(kana)).length) return { kana, fixed: false };
      const [w] = await variantWords(kana, 2);
      if (!w) return { kana, fixed: false };
      return { kana: w.via === "exact" && ![...w.key].some(isKanji2) ? w.key : w.romaji, fixed: true };
    }
    async function katakanaEdits(text, from = 2, to = 8) {
      const small = /^[ぁぃぅぇぉゃゅょゎっんー]/;
      const spans = [];
      for (let a = 0; a < text.length; a += 1) {
        if (small.test(text[a])) continue;
        for (let len3 = from; len3 <= to && a + len3 <= text.length; len3 += 1) {
          const hira = text.slice(a, a + len3);
          if (!/^[ぁ-ゖ]+$/.test(hira) || /^[ぁぃぅぇぉゃゅょゎ]/.test(text[a + len3] || "")) continue;
          spans.push({ a, len: len3, hira, forms: kanaForms(hira).slice(1).filter((f) => f.length === len3) });
        }
      }
      await dict2.need([...new Set(spans.flatMap((x) => [x.hira, ...x.forms]))]);
      return spans.filter((x) => !dict2.get(x.hira)).flatMap((x) => {
        const f = x.forms.find((k) => dict2.get(k));
        return f ? [{ at: x.a, kind: "kata", len: x.len, options: [f] }] : [];
      });
    }
    function sentenceKey(t3) {
      if (t3.entry.tier === 2) return t3.base;
      return [t3.base, t3.surface].find((k) => (dict2.get(k) || []).includes(t3.entry)) || t3.base;
    }
    async function commonest(t3) {
      if (t3.kind !== "inflected" || !t3.entry || [...t3.surface].some(isKanji2)) return t3;
      const mine2 = { key: sentenceKey(t3), recs: [t3.entry] };
      await needBands([mine2]);
      if (wordBand(mine2) < 4) return t3;
      const res = (await firstTier(t3.surface)).find((r) => r.via === "form");
      if (!res || res.recs.includes(t3.entry) || wordBand(res) > 2) return t3;
      return { ...t3, entry: res.recs[0], base: res.key };
    }
    async function readRomaji(reading, { tail = false } = {}) {
      if (reading.kana.length > SENTENCE_MAX) return null;
      let parts = partsOf(reading);
      if (tail) parts = [{ kana: reading.kana.slice(0, -1), particle: false }, { kana: reading.kana.slice(-1), particle: true }];
      if (parts.length > 1) {
        parts = await Promise.all(parts.map(async (p) => p.particle ? p : { ...p, ...await partWord(p.kana) }));
      }
      const chunks = [];
      for (const p of parts) {
        const last = chunks.at(-1);
        if (p.particle || !last || last.particle) chunks.push(p.particle ? p : { particle: false, parts: [p] });
        else last.parts.push(p);
      }
      const { readSentence: readSentence2, sentenceWords: sentenceWords2, writtenToken: writtenToken2, SENTENCE_BUDGET: SENTENCE_BUDGET2 } = await sentenceReader();
      const budget = { left: SENTENCE_BUDGET2 };
      const tokens = [];
      let kana = "";
      const readChunk = async (text2, fixed) => {
        const inside = (e) => fixed.some(([a, b]) => e.kind === "ins" ? e.at > a && e.at < b : e.at < b && e.at + (e.len || 1) > a);
        const edits = [...romajiEdits(text2), ...await katakanaEdits(text2)].filter((e) => !inside(e)).sort((x, y) => x.at - y.at);
        const read = await readSentence2(text2, edits, dict2, { budget: Math.max(budget.left, 4) });
        budget.left -= read.tried;
        return read;
      };
      for (const c of chunks) {
        if (c.particle) {
          const surface = particleKana(c.kana);
          tokens.push({ surface, base: surface, kind: "particle", confidence: "rule", entry: null });
          kana += surface;
          continue;
        }
        let text2 = "";
        const fixed = [];
        for (const p of c.parts) {
          if (p.fixed) fixed.push([text2.length, text2.length + p.kana.length]);
          text2 += p.kana;
        }
        let read = await readChunk(text2, fixed);
        const split = await saidParticles(read.tokens);
        if (split.length) {
          const pieces3 = [];
          let at = 0;
          for (const end of split) {
            pieces3.push(read.kana.slice(at, end - 1), read.kana[end - 1]);
            at = end;
          }
          pieces3.push(read.kana.slice(at));
          const all = [];
          let joined = "";
          for (const [i, piece] of pieces3.entries()) {
            if (!piece) continue;
            if (i % 2) {
              const surface = particleKana(piece);
              all.push({ surface, base: surface, kind: "particle", confidence: "rule", entry: null });
              joined += surface;
            } else {
              const r = await readChunk(piece, [[0, piece.length]]);
              all.push(...r.tokens);
              joined += r.kana;
            }
          }
          read = { tokens: all, kana: joined };
        }
        tokens.push(...read.tokens);
        kana += read.kana;
      }
      const guessed = tokens.filter((t3) => t3.confidence === "guess" && /^[ぁ-ゖー]+$/.test(t3.surface));
      const asKata = new Map(guessed.map((t3) => [t3, kanaForms(t3.surface).slice(1)]));
      if (guessed.length) await dict2.need([...asKata.values()].flat());
      const rescued = /* @__PURE__ */ new Map();
      for (const [t3, forms2] of asKata) {
        const key = forms2.find((k) => dict2.get(k));
        if (key) rescued.set(t3, key);
      }
      const japaneseTokens = tokens.filter((t3) => !["punct", "space", "newline", "latin"].includes(t3.kind));
      const guesses = tokens.filter((t3) => (t3.confidence === "guess" || t3.kind === "unknown") && !rescued.has(t3)).length;
      const wordTokens = tokens.filter((t3) => rescued.has(t3) || sentenceWords2([t3]).length);
      const words = await Promise.all(wordTokens.map((t3) => rescued.has(t3) ? t3 : commonest(t3)));
      const swapped = new Map(wordTokens.map((t3, i) => [t3, words[i]]));
      const content = words.filter((t3) => t3.kind !== "copula");
      const grammar = tokens.filter((t3) => ["particle", "copula", "inflected"].includes(t3.kind));
      if (guesses || japaneseTokens.length < 2 || !content.length || !grammar.length || stray2(japaneseTokens)) return null;
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const [t3, w] of swapped) {
        const res = rescued.has(t3) ? result(rescued.get(t3), dict2.get(rescued.get(t3)), "sentence", { romaji: toHira(t3.surface) }) : result(sentenceKey(w), [w.entry], "sentence", { romaji: toHira(t3.surface) });
        if (seen.has(res.key)) continue;
        seen.add(res.key);
        out.push(res);
      }
      const text = tokens.map((t3) => rescued.has(t3) ? rescued.get(t3) : writtenToken2(swapped.get(t3) || t3)).join("");
      return { words: out, sentence: Object.freeze({ kana, text }) };
    }
    function stray2(tokens) {
      return tokens.some((t3, i) => {
        if (!i || t3.surface.length !== 1 || !t3.entry || !["word", "katakana"].includes(t3.kind)) return false;
        const before = tokens[i - 1];
        return ["word", "katakana"].includes(before.kind) && /^(?:n|pref)\b/.test(before.entry && before.entry.p || "");
      });
    }
    async function saidParticles(tokens) {
      const out = [];
      let at = 0;
      for (const t3 of tokens) {
        at += t3.surface.length;
        const s = t3.surface;
        if (!t3.entry || t3.kind !== "word" || s.length < 3 || !SAID2.has(s.at(-1)) || [...s].some(isKanji2)) continue;
        const mine2 = { key: sentenceKey(t3), recs: [t3.entry] };
        await needBands([mine2]);
        if (wordBand(mine2) < 4) continue;
        const stem = await firstTier(s.slice(0, -1));
        if (stem.some((r) => r.via === "exact" && wordBand(r) === 1)) out.push(at);
      }
      return out;
    }
    return Object.freeze({ romajiWords, readRomaji, ownWord });
  }

  // js/search.js
  init_search_latin();
  var STOP = new Set(`a an the to of in on at by for with from as or and be is are was
  one's someone something oneself etc e g i e s t esp usu`.split(/\s+/));
  function glossWords(text) {
    return String(text).toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z']+/).map((w) => w.replace(/^'+|'+$/g, "")).filter((w) => w.length > 1 && !STOP.has(w));
  }
  function writtenOf(res, rec = res.recs && res.recs[0] || {}) {
    const kana = ![...res.key].some(isKanji2);
    const written = kana && Array.isArray(rec.k) && rec.k.length && !rec.u ? rec.k[0] : res.key;
    const reading = written === res.key ? Array.isArray(rec.r) && rec.r[0] || res.key : res.key;
    return { written, reading };
  }
  function byWord(results) {
    return results.flatMap((res) => {
      const kana = ![...res.key].some(isKanji2);
      if (res.via === "name" || !kana || res.recs.length < 2) return [res];
      const spelled2 = res.recs.map((r) => writtenOf(res, r).written);
      if (new Set(spelled2).size < 2) return [res];
      return res.recs.map((r) => Object.freeze({ ...res, recs: [r] }));
    });
  }
  var MAX_RESULTS = 40;
  var RARE_WHEN = 5;
  var RARE_MAX = 10;
  var KANJI_MAX = 10;
  function rareRecord(row) {
    const [, reading, g, p, more] = row;
    return Object.freeze({
      ...reading ? { r: [reading] } : {},
      g: [...g],
      p,
      tier: 2,
      more: more || 0
    });
  }
  function queryKind(q) {
    const s = String(q || "").trim();
    if (!s) return "empty";
    if ([...s].some(isJapanese)) return "ja";
    return romajiReading(s) ? "romaji" : "en";
  }
  function japaneseKeys(q) {
    const s = String(q || "").trim();
    const keys = /* @__PURE__ */ new Set([s, toHira(s), toKata(s)]);
    const bases = [];
    for (const d of deinflect(s)) {
      if (!keys.has(d.base)) bases.push(d);
      keys.add(d.base);
    }
    return { keys: [...keys].filter(Boolean), bases };
  }
  var cardOf = (res, rec) => {
    if (res.via === "name") return `name:${res.key}`;
    const { written, reading } = writtenOf(res, rec);
    return `${written}|${toHira(reading)}`;
  };
  function mergeResults(lists) {
    const seen = /* @__PURE__ */ new Set();
    const keys = /* @__PURE__ */ new Set();
    const out = [];
    for (const list2 of lists) {
      for (const res of list2 || []) {
        if (keys.has(res.key) && res.via !== "name") continue;
        const recs = res.recs.filter((rec) => !seen.has(cardOf(res, rec)));
        if (!recs.length) continue;
        for (const rec of recs) seen.add(cardOf(res, rec));
        keys.add(res.key);
        out.push(recs.length === res.recs.length ? res : Object.freeze({ ...res, recs }));
      }
    }
    return out;
  }
  function shared2(lists) {
    if (!lists.length) return [];
    const score = /* @__PURE__ */ new Map();
    lists[0].forEach((k, i) => score.set(k, i));
    for (const list2 of lists.slice(1)) {
      const here = new Map(list2.map((k, i) => [k, i]));
      for (const k of [...score.keys()]) {
        if (here.has(k)) score.set(k, score.get(k) + here.get(k));
        else score.delete(k);
      }
    }
    return [...score].sort((a, b) => a[1] - b[1]).map(([k]) => k);
  }
  function intersect(lists) {
    if (!lists.length) return [];
    const both = shared2(lists);
    return both.length ? both : lists[0];
  }
  var CLITIC_ES = /* @__PURE__ */ new Set(["me", "te", "nos", "os"]);
  function byPlace(lists) {
    const best = /* @__PURE__ */ new Map();
    lists.forEach((list2, li) => list2.forEach((k, i) => {
      const score = i * 64 + li;
      if (!best.has(k) || best.get(k) > score) best.set(k, score);
    }));
    return [...best].sort((a, b) => a[1] - b[1]).map(([k]) => k);
  }
  function combineSpanish(lists, weak) {
    const named = lists.filter((l) => l.length);
    const strong = lists.filter((l, i) => l.length && !weak[i]);
    const out = [...shared2(named)];
    if (out.length < RARE_WHEN && strong.length && strong.length < named.length) out.push(...shared2(strong));
    if (!out.length) out.push(...byPlace(strong.length ? strong : named));
    return [...new Set(out)];
  }
  function createSearch({ dict: dict2, fetchJson: fetchJson3, base = "data/" }) {
    const dir = base.endsWith("/") ? base : `${base}/`;
    const resolve = (src) => src.startsWith("data/") ? dir + src.slice(5) : src;
    const english = createRangeStore({
      fetchJson: fetchJson3,
      resolve,
      indexPath: `${dir}search/index.json`,
      what: "The search index"
    });
    const rareEnglish = createRangeStore({
      fetchJson: fetchJson3,
      resolve,
      indexPath: `${dir}search/rare.json`,
      what: "The rare words' search index"
    });
    const spanish2 = createRangeStore({
      fetchJson: fetchJson3,
      resolve,
      indexPath: `${dir}search/es.json`,
      what: "The Spanish search index"
    });
    let parts = null;
    const result = (key, recs, via, extra = {}) => Object.freeze({
      key,
      recs,
      via,
      ...extra
    });
    function common({ keys, bases }, seen = /* @__PURE__ */ new Set()) {
      const out = [];
      for (const k of keys) {
        const recs = dict2.get(k);
        if (!recs || seen.has(k)) continue;
        const d = bases.find((x) => x.base === k);
        const ok = d ? recs.filter((r) => posMatches(d.type, r.p, k, true)) : recs;
        if (!ok.length) continue;
        seen.add(k);
        out.push(result(k, ok, d ? "form" : "exact", d ? { chain: d.chain } : {}));
      }
      return out;
    }
    async function rareAndNames(keys) {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      await dict2.needRare(keys);
      for (const k of keys) {
        const recs = dict2.rare(k);
        if (recs && !seen.has(k)) {
          seen.add(k);
          out.push(result(k, recs, "rare"));
        }
      }
      await dict2.needNames(keys);
      for (const k of keys) {
        const rec = dict2.name(k);
        if (rec && !seen.has(`name:${k}`)) {
          seen.add(`name:${k}`);
          out.push(result(k, [rec], "name"));
        }
      }
      return out;
    }
    async function japanese(q, extra = []) {
      const found = japaneseKeys(q);
      const keys = { keys: [.../* @__PURE__ */ new Set([...found.keys, ...extra])], bases: found.bases };
      await dict2.need(keys.keys);
      const out = common(keys);
      if (out.length) return out;
      return rareAndNames(keys.keys);
    }
    const { romajiWords, readRomaji, ownWord } = createRomajiSearch({
      dict: dict2,
      japanese,
      common,
      result,
      japaneseKeys
    });
    async function fromIndex(entries, via, keys, kanji) {
      await dict2.need(keys);
      const out = [];
      for (const k of keys) {
        const recs = dict2.get(k);
        if (recs) out.push(result(k, recs, via));
      }
      const complete = entries.every((e) => e.w && e.w.length || e.k);
      return { words: out, kanji, complete, direct: complete && entries.every((e) => e.direct !== false) };
    }
    async function inEnglish(q, lang2) {
      const words = glossWords(foldLatin(q, { enye: false })).filter((w) => lang2 !== "es" || !STOP_ES.has(w));
      if (!words.length) return { words: [], kanji: [], asked: [], complete: false };
      await english.need(words);
      const entries = words.map((w) => english.get(w) || {});
      const keys = intersect(entries.map((e) => e.w || []).filter((l) => l.length)).slice(0, MAX_RESULTS);
      const kanji = intersect(entries.map((e) => [...e.k || ""]).filter((l) => l.length));
      return { ...await fromIndex(entries, "english", keys, kanji), asked: words };
    }
    async function inSpanish(q) {
      const words = spanishWords(q, { alone: true });
      if (!words.length) return { words: [], kanji: [], complete: false };
      const asked2 = words.map((w) => {
        const { nouns, verbs } = spanishForms(w);
        return { own: w, nouns, verbs };
      });
      await spanish2.need(asked2.flatMap((a) => [a.own, ...a.nouns, ...a.verbs]));
      const withN = asked2.map((a) => [...new Set([a.own, ...a.nouns, ...a.verbs].flatMap((w) => (spanish2.get(w) || {}).n || []))]);
      if (withN.flat().length) await spanish2.need(withN.flat());
      const entries = asked2.map((a, i) => {
        const own = spanish2.get(a.own) || {};
        const nouns = a.nouns.map((x) => spanish2.get(x)).filter(Boolean);
        const verbs = a.verbs.map((x) => spanish2.get(x)).filter(Boolean);
        const enye = withN[i].map((x) => spanish2.get(x)).filter(Boolean);
        const more = enye.filter((e) => (e.w || []).length > (own.w || []).length);
        const order = [...more, own, ...nouns, ...enye.filter((e) => !more.includes(e))];
        const listed = (list2, field) => list2.map((e) => field === "w" ? e.w || [] : [...e.k || ""]);
        const verb = i > 0 && CLITIC_ES.has(words[i - 1]);
        const of = (field) => {
          const [a2, b] = verb ? [verbs, order] : [order, verbs];
          return [.../* @__PURE__ */ new Set([...byPlace(listed(a2, field)), ...byPlace(listed(b, field))])];
        };
        return { w: of("w"), k: of("k").join(""), direct: order.some((e) => e.w && e.w.length || e.k) };
      });
      const weak = words.map((w) => WEAK_ES.has(w) && words.some((x) => !WEAK_ES.has(x)));
      const keys = combineSpanish(entries.map((e) => e.w), weak).slice(0, MAX_RESULTS);
      const kanji = combineSpanish(entries.map((e) => [...e.k]), weak);
      return fromIndex(entries.filter((e, i) => !weak[i]), "spanish", keys, kanji);
    }
    async function rareInEnglish(words) {
      await rareEnglish.need(words);
      const lists = words.map((w) => rareEnglish.get(w) || []).filter((l) => l.length);
      const rows = new Map(lists.flat().map((row) => [row[0], row]));
      return intersect(lists.map((l) => l.map((row) => row[0]))).slice(0, RARE_MAX).map((k) => result(k, [rareRecord(rows.get(k))], "rare"));
    }
    async function search2(q, { lang: lang2 = currentLang() } = {}) {
      const kind = queryKind(q);
      if (kind === "empty") return { kind, words: [], kanji: [] };
      if (kind === "ja") {
        const words = await japanese(q);
        return { kind, words: words.slice(0, MAX_RESULTS), kanji: [...new Set([...q].filter(isKanji2))] };
      }
      const reading = kind === "romaji" ? romajiReading(q) : null;
      const [rw, en0, es0] = await Promise.all([
        reading ? romajiWords(reading) : { typed: [], edited: [], asTyped: [], sentence: null },
        inEnglish(q, lang2),
        inSpanish(q)
      ]);
      const meaning = en0.complete || es0.complete;
      const read = rw.sentence && (!meaning || rw.sentence.strong) ? await readRomaji(reading, rw.sentence) : null;
      const said2 = read ? read.words : [];
      const own = rw.asTyped.filter((r) => ownWord(r, rw.edited));
      const rest = rw.asTyped.filter((r) => !own.includes(r));
      const sure = said2.length > 0 || rw.typed.length > 0;
      const meant = (x) => !sure || x.complete ? x : { ...x, words: [], kanji: [] };
      const firstTierRomaji = said2.length + rw.typed.length + rw.edited.length;
      let en = meant(en0);
      let es = meant(es0);
      const romajiAny = firstTierRomaji + rw.asTyped.length;
      const englishToo = lang2 !== "es" || en0.complete || !es.words.length;
      if (!englishToo) en = { ...en, words: [], kanji: [] };
      if (lang2 !== "es" && (en.words.length || romajiAny)) es = { ...es, words: [], kanji: [] };
      const commonFound = firstTierRomaji + en.words.length + es.words.length;
      const rare = englishToo && en.asked.length && en.words.length < RARE_WHEN && commonFound < RARE_WHEN && (!romajiAny || en0.complete) ? await rareInEnglish(en.asked) : [];
      const [mine2, other] = lang2 === "es" ? [es, en] : [en, es];
      const lists = [
        ...lang2 === "es" && es.complete && (es.direct || !rw.typed.length) ? [es.words.slice(0, 1), rw.typed.slice(0, 1)] : [],
        said2,
        rw.typed,
        mine2.complete ? mine2.words : [],
        other.complete ? other.words : [],
        own,
        rw.edited,
        rest,
        mine2.complete ? [] : mine2.words,
        other.complete ? [] : other.words,
        rare
      ];
      const kanji = [.../* @__PURE__ */ new Set([...mine2.kanji, ...other.kanji])].slice(0, KANJI_MAX);
      return {
        kind,
        words: mergeResults(lists).slice(0, MAX_RESULTS),
        kanji,
        ...read ? { sentence: read.sentence } : {}
      };
    }
    async function loadParts() {
      if (parts) return parts;
      const doc = await fetchJson3(`${dir}search/parts.json`);
      const map = new Map(Object.entries(doc.parts || {}).map(([p, s]) => [p, [...s]]));
      parts = Object.freeze({ list: doc.list || [], map });
      return parts;
    }
    return Object.freeze({ search: search2, loadParts });
  }

  // js/sets.js
  init_search_latin();
  init_range_store();

  // js/other-forms.js
  init_range_store();
  var SPELL_TAGS = Object.freeze(["oK", "rK", "iK", "io", "ateji", "sK"]);

  // js/sets.js
  init_kana();
  var SET_IDS = Object.freeze(["yoji", "proverb", "idiom"]);
  var SET_PAGE = 50;
  var FILTER_READINGS = 32;
  var FILTER_EDITS = 2;
  var ASKED_ES = /* @__PURE__ */ new Set(["como", "que"]);
  var spanishHay = (texts) => foldLatin(texts.join(" ")).replace(/\([^)]*\)/g, " ").split(/[^a-zñ]+/).filter((w) => w && (!STOP_ES.has(w) || ASKED_ES.has(w))).map(plainN);
  function spanishAsked(q) {
    const words = spanishWords(q, { alone: true }).filter((w) => w.length > 1);
    return words.length === 1 && STOP_ES.has(words[0]) && !ASKED_ES.has(words[0]) ? [] : words.map(plainN);
  }
  var englishHay = (texts) => glossWords(foldLatin(texts.join(" ")));
  var startsAll = (words, hay) => words.every((w) => hay.some((x) => x.startsWith(w)));
  var asked = { q: null };
  function askOf(q) {
    if (asked.q === q) return asked;
    const kind = queryKind(q);
    const s = String(q).trim();
    asked = {
      q,
      kind,
      s,
      en: kind === "ja" ? [] : englishHay([s]),
      es: kind === "ja" ? [] : spanishAsked(s),
      kanas: kind === "romaji" ? romajiKanas(s, { limit: FILTER_READINGS, most: FILTER_EDITS }) : []
    };
    return asked;
  }
  function rowMatches(row, q) {
    const a = askOf(q);
    if (a.kind === "empty") return true;
    const [written, reading, glosses, , , es] = row;
    const kana = toHira(reading || written);
    if (a.kind === "ja") return written.includes(a.s) || kana.includes(toHira(a.s));
    if (a.en.length && startsAll(a.en, englishHay(glosses || []))) return true;
    if (a.es.length && Array.isArray(es) && es.length && startsAll(a.es, spanishHay(es))) return true;
    if (a.kind !== "romaji") return false;
    const plain = kana.replace(/\s+/g, "");
    return a.kanas.some((k) => plain.includes(k));
  }
  function createSets({ fetchJson: fetchJson3, base = "data/" }) {
    const dir = base.endsWith("/") ? base : `${base}/`;
    const resolve = (src) => src.startsWith("data/") ? dir + src.slice(5) : src;
    let index = null;
    const loaded2 = /* @__PURE__ */ new Map();
    async function sets2() {
      if (!index) {
        index = fetchJson3(`${dir}sets/index.json`).then((doc) => {
          if (!doc || !Array.isArray(doc.sets)) throw new Error("The collections index has no sets[]");
          return doc.sets;
        }).catch((e) => {
          index = null;
          throw e;
        });
      }
      return index;
    }
    function rows(id) {
      if (!loaded2.has(id)) {
        const p = sets2().then(async (list2) => {
          const set = list2.find((s) => s.id === id);
          if (!set) throw new Error(`No collection ${id}`);
          const docs = await Promise.all(set.files.map((f) => fetchJson3(resolve(f))));
          return Object.freeze(docs.flatMap((d) => d.rows || []));
        }).catch((e) => {
          loaded2.delete(id);
          throw e;
        });
        loaded2.set(id, p);
      }
      return loaded2.get(id);
    }
    return Object.freeze({ sets: sets2, rows });
  }

  // js/neorgon-persist.js
  function safeGet(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  }
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
  function createStore({ key, version = 1, migrate = null } = {}) {
    if (!key) throw new Error("createStore needs a key");
    function load(fallback = null) {
      let raw;
      try {
        raw = localStorage.getItem(key);
      } catch {
        return fallback;
      }
      if (raw === null) return fallback;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return fallback;
      }
      if (!parsed || typeof parsed !== "object" || !("__v" in parsed)) {
        if (!migrate) return parsed ?? fallback;
        const out = migrate(parsed, 0);
        return out === null || out === void 0 ? fallback : out;
      }
      if (parsed.__v !== version) {
        if (!migrate) return fallback;
        const out = migrate(parsed.data, parsed.__v);
        return out === null || out === void 0 ? fallback : out;
      }
      return parsed.data;
    }
    function save(data) {
      try {
        localStorage.setItem(key, JSON.stringify({ __v: version, data }));
        return true;
      } catch {
        return false;
      }
    }
    function clear() {
      try {
        localStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    }
    return { key, version, load, save, clear };
  }

  // js/kanji-store.js
  init_kana();

  // js/kanji-words.js
  init_kana();
  var MAX_FIELD = 24;
  function cleanPair(p) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [w, r] = p;
    if (typeof w !== "string" || typeof r !== "string") return null;
    if (!w || !r || [...w].length > MAX_FIELD || [...r].length > MAX_FIELD) return null;
    if (!hasKanji(w)) return null;
    return [w, r];
  }
  function dictionaryWord(token) {
    if (!token || !token.entry || token.confidence === "guess") return null;
    const surface = String(token.surface || "");
    const reading = String(token.reading || "");
    if (!hasKanji(surface) || !reading) return null;
    const base = String(token.base || "");
    if (token.kind !== "inflected" || !base || base === surface) return cleanPair([surface, reading]);
    const s = [...surface];
    const b = [...base];
    let i = 0;
    while (i < s.length && i < b.length && s[i] === b[i]) i += 1;
    const tail = b.slice(i).join("");
    if (!i || hasKanji(tail)) return null;
    let stem = "";
    let at = 0;
    for (const p of Array.isArray(token.furigana) && token.furigana.length ? token.furigana : [{ text: surface }]) {
      if (at >= i) break;
      const chars3 = [...String(p.text || "")];
      if (at + chars3.length <= i) stem += p.ruby || toHira(p.text);
      else if (p.ruby) return null;
      else stem += toHira(chars3.slice(0, i - at).join(""));
      at += chars3.length;
    }
    let read = stem + toHira(tail);
    const listed = Array.isArray(token.entry.r) ? token.entry.r.filter((x) => typeof x === "string") : [];
    const fits = listed.filter((x) => x.endsWith(toHira(tail)) && x.length > tail.length);
    if (fits.length === 1 && !listed.includes(read)) read = fits[0];
    return cleanPair([base, read]);
  }
  function wordsByKanji(tokens) {
    const out = /* @__PURE__ */ new Map();
    for (const token of tokens || []) {
      const pair = dictionaryWord(token);
      if (!pair) continue;
      for (const ch of new Set([...pair[0]].filter(isKanji2))) {
        const list2 = out.get(ch) || [];
        if (!list2.some(([w, r]) => w === pair[0] && r === pair[1])) list2.push(pair);
        out.set(ch, list2);
      }
    }
    return out;
  }

  // js/history-store.js
  var KEY = "yomu-site:history";
  var DAMAGED_KEY = `${KEY}:damaged`;
  var MAX_ENTRIES = 300;
  var MAX_CHARS = 3e5;
  var MAX_SAVED = 500;
  function emptyHistory() {
    return { entries: {}, session: null };
  }
  var isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var isTime = (v) => Number.isFinite(v) && v > 0;
  var isSaved = (e) => !!e && isTime(e.saved);
  function evict(data, keep) {
    const loose = Object.values(data.entries).filter((e) => !isSaved(e));
    let count4 = loose.length;
    let size = loose.reduce((n2, e) => n2 + e.t.length, 0);
    const gone = [];
    while (count4 > MAX_ENTRIES || size > MAX_CHARS) {
      let oldest = null;
      for (const [k, e] of Object.entries(data.entries)) {
        if (k !== keep && !isSaved(e) && (oldest === null || e.last < data.entries[oldest].last)) oldest = k;
      }
      if (oldest === null) break;
      size -= data.entries[oldest].t.length;
      count4 -= 1;
      delete data.entries[oldest];
      gone.push(oldest);
    }
    return gone;
  }
  function forget(data, key) {
    if (!data.entries[key]) return false;
    delete data.entries[key];
    if (data.session && data.session.key === key) data.session = { ...data.session, before: null };
    return true;
  }
  var byKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  function list(data) {
    return Object.entries(data.entries).map(([key, e]) => ({ key, ...e })).sort((a, b) => b.last - a.last || byKey(a, b));
  }
  function savedList(data) {
    return list(data).filter(isSaved).sort((a, b) => b.saved - a.saved || byKey(a, b));
  }
  function savedCount(data) {
    let n2 = 0;
    for (const e of Object.values(data.entries)) if (isSaved(e)) n2 += 1;
    return n2;
  }
  function saveText(data, text, sessionId, src, now) {
    const key = textKey(text);
    const had = data.entries[key];
    if (isSaved(had)) return { ok: true, key, changed: false };
    if (savedCount(data) >= MAX_SAVED) return { ok: false, key, reason: "full" };
    if (had) {
      data.entries[key] = { ...had, saved: now };
    } else {
      data.entries[key] = { t: clipText(text), first: now, last: now, n: 1, src: SOURCES.includes(src) ? src : "typed", s: sessionId, saved: now };
      data.session = { id: sessionId, key, before: null };
    }
    return { ok: true, key, changed: true };
  }
  function unsaveText(data, key, remembering) {
    const e = data.entries[key];
    if (!isSaved(e)) return false;
    if (!remembering) return forget(data, key);
    const { saved, ...rest } = e;
    data.entries[key] = rest;
    evict(data, key);
    return true;
  }
  function phrasesOf(data) {
    return savedList(data).map(({ t: t3, first, last, n: n2, src, saved }) => ({ t: t3, first, last, n: n2, src, saved }));
  }
  function cleanPhrase(v) {
    if (!isObject(v) || typeof v.t !== "string" || !v.t.trim() || v.t.length > MAX_TEXT) return null;
    if (!isTime(v.first) || !isTime(v.last) || !Number.isInteger(v.n) || v.n < 1) return null;
    if (!SOURCES.includes(v.src) || !isTime(v.saved)) return null;
    return { t: v.t, first: Math.min(v.first, v.last), last: Math.max(v.first, v.last), n: v.n, src: v.src, saved: v.saved };
  }
  function cleanPhrases(raw) {
    if (raw === void 0 || raw === null) return { phrases: [], dropped: 0 };
    if (!Array.isArray(raw)) return { phrases: [], dropped: 1 };
    const phrases = [];
    let dropped = 0;
    for (const v of raw) {
      const ok = cleanPhrase(v);
      if (ok) phrases.push(ok);
      else dropped += 1;
    }
    return { phrases, dropped };
  }
  function mergePhrases(data, phrases) {
    const sum = { added: 0, updated: 0, full: 0 };
    for (const p of phrases || []) {
      const key = textKey(p.t);
      const a = data.entries[key];
      if (!isSaved(a) && savedCount(data) >= MAX_SAVED) {
        sum.full += 1;
        continue;
      }
      if (!a) {
        data.entries[key] = { t: p.t, first: p.first, last: p.last, n: p.n, src: p.src, s: 0, saved: p.saved };
        sum.added += 1;
        continue;
      }
      const next2 = {
        ...a,
        first: Math.min(a.first, p.first),
        last: Math.max(a.last, p.last),
        n: Math.max(a.n, p.n),
        src: p.last > a.last ? p.src : a.src,
        saved: isSaved(a) ? Math.min(a.saved, p.saved) : p.saved
      };
      if (JSON.stringify(next2) !== JSON.stringify(a)) sum.updated += 1;
      data.entries[key] = next2;
    }
    return sum;
  }

  // js/kanji-backup.js
  var EXPORT_FORMAT = "yomu-kanji-export/1";
  var MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  function exportDoc(data, today, phrases, words) {
    const doc = { format: EXPORT_FORMAT, exported: today, site: "https://yomu.neorgon.com/", saved: data.saved, seen: data.seen };
    if (Array.isArray(phrases) && phrases.length) doc.phrases = phrases;
    if (Array.isArray(words) && words.length) doc.words = words;
    return doc;
  }
  function parseImport(text) {
    let doc;
    try {
      doc = JSON.parse(String(text));
    } catch {
      return { ok: false, reason: "json" };
    }
    if (!isObject2(doc) || doc.format !== EXPORT_FORMAT) return { ok: false, reason: "format" };
    const { data, dropped: bad2 } = validate({ saved: doc.saved, seen: doc.seen });
    const p = cleanPhrases(doc.phrases);
    const dropped = bad2 + p.dropped;
    if (p.phrases.length) data.phrases = p.phrases;
    const words = Array.isArray(doc.words) ? doc.words : [];
    if (!Object.keys(data.saved).length && !Object.keys(data.seen).length && !p.phrases.length && !words.length) return { ok: false, reason: "empty", dropped };
    return { ok: true, data, dropped, words };
  }
  function mergeInto(data, incoming) {
    const sum = { savedAdded: 0, savedUpdated: 0, seenAdded: 0, seenUpdated: 0 };
    for (const [ch, b] of Object.entries(incoming.seen || {})) {
      const a = data.seen[ch];
      if (!a) {
        data.seen[ch] = { ...b, words: b.words.slice() };
        sum.seenAdded += 1;
        continue;
      }
      const counts2 = { n: Math.max(a.n, b.n), first: minDay(a.first, b.first), last: maxDay(a.last, b.last), words: addWords(a.words, b.words) };
      const next2 = withPlace(counts2, b.last > a.last ? b : a);
      if (JSON.stringify(next2) !== JSON.stringify(a)) sum.seenUpdated += 1;
      data.seen[ch] = next2;
    }
    for (const [ch, b] of Object.entries(incoming.saved || {})) {
      const a = data.saved[ch];
      if (!a) {
        data.saved[ch] = { ...b };
        sum.savedAdded += 1;
        continue;
      }
      const lead = b.reviews > a.reviews ? b : a;
      const next2 = { at: Math.min(a.at, b.at), box: lead.box, due: lead.due, reviews: Math.max(a.reviews, b.reviews), lapses: Math.max(a.lapses, b.lapses) };
      if (JSON.stringify(next2) !== JSON.stringify(a)) sum.savedUpdated += 1;
      data.saved[ch] = next2;
    }
    return sum;
  }

  // js/kanji-store.js
  var KEY2 = "yomu-site:kanji";
  var VERSION = 1;
  var DAMAGED_KEY2 = `${KEY2}:damaged`;
  var MAX_WORDS = 8;
  var SOURCES = Object.freeze(["paste", "typed", "example", "phrase", "link", "host", "history"]);
  var HISTORY_KEY = /^[0-9a-z]{1,16}$/;
  var TOP_BOX = 5;
  var INTERVALS = Object.freeze([0, 1, 2, 4, 8, 16]);
  var MAX_COUNTED = 2e3;
  var DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  function emptyData(at) {
    return { saved: {}, seen: {}, session: startedAt({ id: 0, counted: [] }, at) };
  }
  var pad = (n2) => String(n2).padStart(2, "0");
  function dayOf(when) {
    const d = when instanceof Date ? when : new Date(when);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function addDays(day, n2) {
    const [y, m, d] = day.split("-").map(Number);
    return dayOf(new Date(y, m - 1, d + n2));
  }
  var minDay = (a, b) => a <= b ? a : b;
  var maxDay = (a, b) => a >= b ? a : b;
  var isObject2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var isCount = (n2) => Number.isInteger(n2) && n2 >= 0;
  var isTime2 = (v) => Number.isFinite(v) && v > 0;
  var startedAt = (session2, at) => isTime2(at) ? { ...session2, at } : session2;
  var isSource = (v) => SOURCES.includes(v);
  var isHistoryKey = (v) => typeof v === "string" && HISTORY_KEY.test(v);
  function withPlace(rec, from) {
    const src = from && isSource(from.src) ? from.src : void 0;
    const h = from && isHistoryKey(from.h) ? from.h : void 0;
    if (rec.src === src && rec.h === h) return rec;
    const out = { ...rec };
    delete out.src;
    delete out.h;
    if (src !== void 0) out.src = src;
    if (h !== void 0) out.h = h;
    return out;
  }
  function oneKanji(ch) {
    return typeof ch === "string" && [...ch].length === 1 && isKanji2(ch);
  }
  function addWords(list2, more) {
    const out = (list2 || []).slice();
    for (const p of more || []) {
      const pair = cleanPair(p);
      if (pair && !out.some(([w, r]) => w === pair[0] && r === pair[1])) out.push(pair);
    }
    return out.slice(-MAX_WORDS);
  }
  function cleanSeen(v) {
    if (!isObject2(v) || !Number.isInteger(v.n) || v.n < 1) return null;
    if (!DAY.test(v.first) || !DAY.test(v.last)) return null;
    return withPlace({ n: v.n, first: minDay(v.first, v.last), last: maxDay(v.first, v.last), words: addWords([], Array.isArray(v.words) ? v.words : []) }, v);
  }
  function cleanSaved(v) {
    if (!isObject2(v) || !Number.isFinite(v.at) || v.at <= 0) return null;
    if (!Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX) return null;
    if (!DAY.test(v.due) || !isCount(v.reviews) || !isCount(v.lapses)) return null;
    return { at: v.at, box: v.box, due: v.due, reviews: v.reviews, lapses: v.lapses };
  }
  function cleanMap(raw, clean) {
    const out = {};
    let dropped = 0;
    if (raw === void 0 || raw === null) return { out, dropped };
    if (!isObject2(raw)) return { out, dropped: 1 };
    for (const [ch, v] of Object.entries(raw)) {
      const ok = oneKanji(ch) ? clean(v) : null;
      if (ok) out[ch] = ok;
      else dropped += 1;
    }
    return { out, dropped };
  }
  function validate(raw, now) {
    const data = emptyData(now);
    if (!isObject2(raw)) return { data, dropped: 0, damaged: raw !== null && raw !== void 0 };
    const saved = cleanMap(raw.saved, cleanSaved);
    const seen = cleanMap(raw.seen, cleanSeen);
    data.saved = saved.out;
    data.seen = seen.out;
    let dropped = saved.dropped + seen.dropped;
    const s = raw.session;
    if (isObject2(s) && isCount(s.id) && Array.isArray(s.counted)) {
      data.session = withPlace(startedAt({ id: s.id, counted: [...new Set(s.counted.filter(oneKanji))].slice(0, MAX_COUNTED) }, s.at), s);
    } else if (s !== void 0) {
      dropped += 1;
    }
    return { data, dropped, damaged: false };
  }
  function beginSession(data, src, now) {
    data.session = startedAt({ id: data.session.id + 1, counted: [], src: isSource(src) ? src : "typed" }, now);
    return data.session.id;
  }
  function sessionSource(data) {
    return isSource(data.session.src) ? data.session.src : "typed";
  }
  function setSessionText(data, h) {
    const next2 = withPlace(data.session, { src: data.session.src, h: h || void 0 });
    if (next2 === data.session) return false;
    data.session = next2;
    return true;
  }
  function recordReading(data, chars3, words, today) {
    const counted = new Set(data.session.counted);
    const place = { src: sessionSource(data), h: data.session.h };
    const fresh = [];
    let learned = 0;
    const wordsOf4 = (ch) => (words && typeof words.get === "function" ? words.get(ch) : null) || [];
    for (const ch of new Set(chars3 || [])) {
      if (!oneKanji(ch)) continue;
      let s = data.seen[ch];
      if (!counted.has(ch)) {
        counted.add(ch);
        fresh.push(ch);
        s = s ? { ...s, n: s.n + 1, first: minDay(s.first, today), last: maxDay(s.last, today) } : { n: 1, first: today, last: today, words: [] };
      }
      if (!s) continue;
      const placed = withPlace(s, place);
      const list2 = addWords(s.words, wordsOf4(ch));
      if (placed !== s || list2.length !== s.words.length || list2.some((p, k) => p !== s.words[k])) learned += 1;
      data.seen[ch] = { ...placed, words: list2 };
    }
    data.session = { ...data.session, counted: [...counted].slice(0, MAX_COUNTED) };
    return { counted: fresh, changed: fresh.length > 0 || learned > 0 };
  }
  function forgetSeen(data, now) {
    const had = Object.keys(data.seen).length > 0 || data.session.counted.length > 0;
    data.seen = {};
    data.session = startedAt({ id: data.session.id + 1, counted: [] }, now);
    return had;
  }
  function saveKanji(data, ch, now) {
    if (!oneKanji(ch) || data.saved[ch]) return false;
    data.saved[ch] = { at: +now, box: 0, due: dayOf(now), reviews: 0, lapses: 0 };
    return true;
  }
  function unsaveKanji(data, ch) {
    if (!data.saved[ch]) return false;
    delete data.saved[ch];
    return true;
  }
  function schedule(rec, ok, today) {
    const box = ok ? Math.min(TOP_BOX, rec.box + 1) : 1;
    return {
      ...rec,
      box,
      due: addDays(today, INTERVALS[box]),
      reviews: rec.reviews + 1,
      lapses: rec.lapses + (ok ? 0 : 1)
    };
  }
  function isDue(rec, today) {
    return !!rec && rec.due <= today;
  }
  function dueList(data, today) {
    return Object.entries(data.saved).filter(([, rec]) => isDue(rec, today)).sort(([, a], [, b]) => a.due < b.due ? -1 : a.due > b.due ? 1 : a.box - b.box || a.at - b.at).map(([ch]) => ch);
  }
  function nextDue(data, today) {
    let day = null;
    let n2 = 0;
    for (const rec of Object.values(data.saved)) {
      if (rec.due <= today) continue;
      if (day === null || rec.due < day) {
        day = rec.due;
        n2 = 1;
      } else if (rec.due === day) n2 += 1;
    }
    return day ? { day, n: n2 } : null;
  }
  function oftenUnsaved(data, limit = 20) {
    return Object.entries(data.seen).filter(([ch]) => !data.saved[ch]).sort(([ca, a], [cb, b]) => b.n - a.n || (a.last < b.last ? 1 : a.last > b.last ? -1 : ca < cb ? -1 : 1)).slice(0, limit).map(([ch]) => ch);
  }
  function openKanji({ store = createStore({ key: KEY2, version: VERSION }), readRaw = () => safeGet(KEY2), keepRaw = (s) => safeSet(DAMAGED_KEY2, s) } = {}) {
    let data = emptyData();
    let note = null;
    let dropped = 0;
    let writable = true;
    let unsaved = false;
    const listeners = /* @__PURE__ */ new Set();
    let phrases = null;
    function load(now) {
      const raw = readRaw();
      const loaded2 = store.load(null);
      note = null;
      dropped = 0;
      if (raw !== null && raw !== void 0 && loaded2 === null) {
        keepRaw(raw);
        data = emptyData(now);
        note = "damaged";
        return keepStart(loaded2, raw, now);
      }
      const v = validate(loaded2, now);
      data = v.data;
      dropped = v.dropped;
      if (v.damaged || v.dropped) {
        if (raw !== null && raw !== void 0) keepRaw(raw);
        note = v.damaged ? "damaged" : "partial";
      }
      return keepStart(loaded2, raw, now);
    }
    function keepStart(loaded2, raw, now) {
      const stored = isObject2(loaded2) && isObject2(loaded2.session) ? loaded2.session.at : void 0;
      if (!isTime2(now) || data.session.at !== now || stored === now) return api;
      if (raw !== null && raw !== void 0) writable = store.save(data);
      else unsaved = true;
      return api;
    }
    function commit(changed = true, event = { type: "change" }) {
      if (!changed) return false;
      writable = store.save(data);
      unsaved = false;
      for (const fn of listeners) fn(event);
      return true;
    }
    const api = {
      load,
      get data() {
        return data;
      },
      get note() {
        return note;
      },
      get dropped() {
        return dropped;
      },
      get writable() {
        return writable;
      },
      onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      isSaved: (ch) => !!data.saved[ch],
      seenOf: (ch) => data.seen[ch] || null,
      savedOf: (ch) => data.saved[ch] || null,
      get sessionId() {
        return data.session.id;
      },
      get sessionSource() {
        return sessionSource(data);
      },
      /** When this session began (ms), or null for one an older page began. */
      get sessionAt() {
        return isTime2(data.session.at) ? data.session.at : null;
      },
      /** The session's start for History, written first when only this page knew it. */
      startAt() {
        if (unsaved) {
          unsaved = false;
          writable = store.save(data);
        }
        return api.sessionAt;
      },
      /** Counted for the first time ever in this session: the reader's "New" chip. */
      isNew: (ch) => !!data.seen[ch] && data.seen[ch].n === 1 && data.session.counted.includes(ch),
      beginSession(src, now) {
        beginSession(data, src, now);
        return commit();
      },
      /**
       * `opts.h`, when given, points the session at that History key first (null
       * for none), so the kanji this read counts point at the text they were met
       * in. One write for both.
       */
      record(chars3, words, today, opts) {
        const moved = opts && "h" in opts ? setSessionText(data, opts.h) : false;
        const r = recordReading(data, chars3, words, today);
        commit(r.changed || moved);
        return r.counted;
      },
      save: (ch, now) => commit(saveKanji(data, ch, now), { type: "save", ch, at: +now }),
      unsave(ch) {
        const rec = data.saved[ch];
        return commit(unsaveKanji(data, ch), { type: "unsave", ch, rec });
      },
      toggle(ch, now) {
        return data.saved[ch] ? (api.unsave(ch), false) : (api.save(ch, now), true);
      },
      answer(ch, ok, today) {
        if (!data.saved[ch]) return null;
        data.saved[ch] = schedule(data.saved[ch], ok, today);
        commit();
        return data.saved[ch];
      },
      due: (today) => dueList(data, today),
      nextDue: (today) => nextDue(data, today),
      often: (limit) => oftenUnsaved(data, limit),
      lendPhrases(calls2) {
        phrases = calls2;
      },
      exportDoc: (today) => exportDoc(data, today, phrases ? phrases.out() : void 0),
      /** Import: a backup's kanji, then its phrases (History's merge), then one event naming both. */
      merge(incoming) {
        const sum = mergeInto(data, incoming);
        if (phrases && incoming && incoming.phrases) sum.phrases = phrases.merge(incoming.phrases);
        const texts = incoming && Array.isArray(incoming.phrases) ? incoming.phrases.map((p) => p.t) : [];
        commit(true, { type: "import", chars: Object.keys(incoming && incoming.saved || {}), texts });
        return sum;
      },
      clearAll(now, said2) {
        const saved = data.saved;
        data = { saved: {}, seen: {}, session: startedAt({ id: data.session.id + 1, counted: [] }, now) };
        note = null;
        return commit(true, { type: "clear", at: now, saved, said: said2 });
      },
      /**
       * What sync decided (js/sync.js): per kanji a record, or null to remove
       * it, read through this store's own validation; the session stays.
       */
      adopt({ saved = {}, seen = {} } = {}) {
        const raw = { saved: { ...data.saved }, seen: { ...data.seen } };
        for (const [part, changes] of [[raw.saved, saved], [raw.seen, seen]]) {
          for (const [ch, rec] of Object.entries(changes)) {
            if (rec) part[ch] = rec;
            else delete part[ch];
          }
        }
        data = { ...validate(raw).data, session: data.session };
        return commit(true, { type: "sync" });
      }
    };
    return api;
  }

  // js/sync-rules.js
  var SOURCES2 = Object.freeze(["paste", "typed", "example", "phrase", "link", "host", "history"]);
  var HISTORY_KEY2 = /^[0-9a-z]{1,16}$/;
  var TOP_BOX2 = 5;
  var MAX_WORDS2 = 8;
  var MAX_FIELD2 = 24;
  var GAMES = Object.freeze({ which: 10, odd: 999, oddFree: 10, twins: 10, names: 10, spaces: 999 });
  var GAME_IDS = Object.freeze(Object.keys(GAMES));
  var MAX_MIXED = 400;
  var MAX_COUNT = 9999;
  var PREFS = Object.freeze({
    lang: ["en", "es"],
    furigana: [true, false],
    romaji: ["said", "spelled", "off"],
    highlights: [true, false],
    unsaved: ["mark", "off"],
    slow: [true, false]
  });
  var PREF_KEYS = Object.freeze(Object.keys(PREFS));
  var DAY2 = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  var isObject3 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var isTime3 = (v) => Number.isFinite(v) && v > 0;
  var isStamp = (v) => Number.isFinite(v) && v >= 0;
  var isCount2 = (n2) => Number.isInteger(n2) && n2 >= 0;
  var len = (s) => [...s].length;
  var minOf = (a, b) => a <= b ? a : b;
  var maxOf = (a, b) => a >= b ? a : b;
  function cmp(a, b) {
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  }
  var isKanji3 = (ch) => /\p{Script=Han}/u.test(ch) || ch === "\u3005" || ch === "\u3006" || ch === "\u30F6";
  var oneKanji2 = (ch) => typeof ch === "string" && len(ch) === 1 && isKanji3(ch);
  var hasKanji2 = (s) => [...s].some(isKanji3);
  function same(a, b) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  var wordKey2 = (w) => `${w[0]}\0${w[1]}`;
  function cleanWord(p) {
    if (!Array.isArray(p) || p.length !== 3) return null;
    const [w, r, d] = p;
    if (typeof w !== "string" || typeof r !== "string" || !w || !r || len(w) > MAX_FIELD2 || len(r) > MAX_FIELD2) return null;
    return hasKanji2(w) && DAY2.test(d) ? [w, r, d] : null;
  }
  function rankWords(list2) {
    const best = /* @__PURE__ */ new Map();
    for (const w of list2) {
      const k = wordKey2(w);
      const had = best.get(k);
      if (!had || w[2] > had[2]) best.set(k, w);
    }
    const ranked = [...best.values()].sort((a, b) => cmp([b[2], wordKey2(a)], [a[2], wordKey2(b)]));
    return ranked.slice(0, MAX_WORDS2).sort((a, b) => cmp([a[2], wordKey2(a)], [b[2], wordKey2(b)]));
  }
  function cleanSaved2(v) {
    if (!isObject3(v) || !isTime3(v.at) || !Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX2) return null;
    if (!DAY2.test(v.due) || !isCount2(v.reviews) || !isCount2(v.lapses)) return null;
    return { at: v.at, box: v.box, due: v.due, reviews: v.reviews, lapses: v.lapses, s: isTime3(v.s) ? maxOf(v.s, v.at) : v.at };
  }
  function cleanSeen2(v) {
    if (!isObject3(v) || !Number.isInteger(v.n) || v.n < 1 || !DAY2.test(v.first) || !DAY2.test(v.last)) return null;
    const out = {
      n: v.n,
      first: minOf(v.first, v.last),
      last: maxOf(v.first, v.last),
      words: rankWords((Array.isArray(v.words) ? v.words : []).map(cleanWord).filter(Boolean))
    };
    if (SOURCES2.includes(v.src)) out.src = v.src;
    if (typeof v.h === "string" && HISTORY_KEY2.test(v.h)) out.h = v.h;
    out.e = isStamp(v.e) ? v.e : 0;
    return out;
  }
  function cleanKanjiRow(v) {
    if (!isObject3(v) || !oneKanji2(v.char)) return null;
    return { char: v.char, saved: cleanSaved2(v.saved), removed: isStamp(v.removed) ? v.removed : 0, seen: cleanSeen2(v.seen) };
  }
  function joinSaved(x, y) {
    const lead = cmp([x.reviews, x.due, x.box], [y.reviews, y.due, y.box]) >= 0 ? x : y;
    return { at: minOf(x.at, y.at), box: lead.box, due: lead.due, reviews: lead.reviews, lapses: maxOf(x.lapses, y.lapses), s: maxOf(x.s, y.s) };
  }
  var placeOf = (x) => [x.last, x.src || "", x.h || ""];
  function joinSeen(x, y, e) {
    const place = cmp(placeOf(x), placeOf(y)) >= 0 ? x : y;
    const out = { n: maxOf(x.n, y.n), first: minOf(x.first, y.first), last: maxOf(x.last, y.last), words: rankWords([...x.words, ...y.words]) };
    if (place.src) out.src = place.src;
    if (place.h) out.h = place.h;
    out.e = e;
    return out;
  }
  function joinKanji(a, b, clear = 0) {
    if (!a && !b) return null;
    const char = (a || b).char;
    const E = Math.max(clear, a && a.seen ? a.seen.e : 0, b && b.seen ? b.seen.e : 0);
    const removed = Math.max(a ? a.removed : 0, b ? b.removed : 0);
    const R2 = Math.max(removed, E);
    const live = [a && a.saved, b && b.saved].filter((x) => x && x.s > R2);
    const saved = live.length === 2 ? joinSaved(live[0], live[1]) : live[0] || null;
    const counts2 = [a && a.seen, b && b.seen].filter((x) => x && x.e >= E);
    const seen = counts2.length === 2 ? joinSeen(counts2[0], counts2[1], E) : counts2[0] ? { ...counts2[0], e: E } : null;
    const kept = removed > E ? removed : 0;
    if (!saved && !seen && !kept) return null;
    return { char, saved, removed: kept, seen };
  }
  function cleanPhrase2(v) {
    if (!isObject3(v) || typeof v.t !== "string" || !v.t.trim() || v.t.length > MAX_TEXT) return null;
    if (!isTime3(v.first) || !isTime3(v.last) || !Number.isInteger(v.n) || v.n < 1) return null;
    if (!SOURCES2.includes(v.src) || !isTime3(v.saved)) return null;
    return {
      t: v.t,
      first: minOf(v.first, v.last),
      last: maxOf(v.first, v.last),
      n: v.n,
      src: v.src,
      saved: v.saved,
      s: isTime3(v.s) ? maxOf(v.s, v.saved) : v.saved
    };
  }
  function cleanPhraseRow(v) {
    if (!isObject3(v) || typeof v.key !== "string" || !HISTORY_KEY2.test(v.key)) return null;
    const phrase = cleanPhrase2(v.phrase);
    return { key: v.key, removed: isStamp(v.removed) ? v.removed : 0, phrase: phrase && textKey(phrase.t) === v.key ? phrase : null };
  }
  var phrasePlace = (x) => [x.last, x.src, x.t];
  function joinPhrase(a, b) {
    if (!a && !b) return null;
    const key = (a || b).key;
    const removed = Math.max(a ? a.removed : 0, b ? b.removed : 0);
    const live = [a && a.phrase, b && b.phrase].filter((x) => x && x.s > removed);
    let phrase = live[0] || null;
    if (live.length === 2) {
      const [x, y] = live;
      const place = cmp(phrasePlace(x), phrasePlace(y)) >= 0 ? x : y;
      phrase = {
        t: place.t,
        first: minOf(x.first, y.first),
        last: maxOf(x.last, y.last),
        n: maxOf(x.n, y.n),
        src: place.src,
        saved: minOf(x.saved, y.saved),
        s: maxOf(x.s, y.s)
      };
    }
    if (!phrase && !removed) return null;
    return { key, removed, phrase };
  }
  var WORD_KEY = /^[0-9a-z]{1,16}$/;
  var MAX_GLOSS = 120;
  function cleanGloss(g) {
    if (typeof g !== "string") return "";
    const one = g.replace(/\s+/g, " ").trim();
    return len(one) <= MAX_GLOSS ? one : `${[...one].slice(0, MAX_GLOSS - 1).join("")}\u2026`;
  }
  var KANA2 = /^[\u3041-\u3096\u30a1-\u30faー]+$/;
  var wordKeyOf = (w, r) => cyrb53(`${w}\0${r}`).toString(36);
  function cleanWordSaved(v) {
    if (!isObject3(v) || typeof v.w !== "string" || typeof v.r !== "string" || typeof v.g !== "string") return null;
    if (!v.w || !v.r || len(v.w) > MAX_FIELD2 || len(v.r) > MAX_FIELD2 || !KANA2.test(v.r)) return null;
    if (!isTime3(v.at) || !Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX2) return null;
    if (!DAY2.test(v.due) || !isCount2(v.reviews) || !isCount2(v.lapses)) return null;
    return {
      w: v.w,
      r: v.r,
      g: cleanGloss(v.g),
      at: v.at,
      box: v.box,
      due: v.due,
      reviews: v.reviews,
      lapses: v.lapses,
      s: isTime3(v.s) ? maxOf(v.s, v.at) : v.at
    };
  }
  function cleanWordRow(v) {
    if (!isObject3(v) || typeof v.key !== "string" || !WORD_KEY.test(v.key)) return null;
    const word = cleanWordSaved(v.word);
    return { key: v.key, removed: isStamp(v.removed) ? v.removed : 0, word: word && wordKeyOf(word.w, word.r) === v.key ? word : null };
  }
  function joinWord(a, b) {
    if (!a && !b) return null;
    const key = (a || b).key;
    const removed = Math.max(a ? a.removed : 0, b ? b.removed : 0);
    const live = [a && a.word, b && b.word].filter((x) => x && x.s > removed);
    let word = live[0] || null;
    if (live.length === 2) {
      const [x, y] = live;
      const lead = cmp([x.reviews, x.due, x.box, x.g], [y.reviews, y.due, y.box, y.g]) >= 0 ? x : y;
      word = {
        w: lead.w,
        r: lead.r,
        g: lead.g,
        at: minOf(x.at, y.at),
        box: lead.box,
        due: lead.due,
        reviews: lead.reviews,
        lapses: maxOf(x.lapses, y.lapses),
        s: maxOf(x.s, y.s)
      };
    }
    if (!word && !removed) return null;
    return { key, removed, word };
  }
  function cleanGame(id, v) {
    if (!isObject3(v) || !isCount2(v.best) || !isCount2(v.rounds)) return null;
    if (v.best > GAMES[id] || v.rounds > MAX_COUNT || v.best > 0 && v.rounds === 0) return null;
    return { best: v.best, rounds: v.rounds };
  }
  function pairOk(k) {
    const parts = typeof k === "string" ? k.split("|") : [];
    return parts.length === 2 && len(parts[0]) === 1 && len(parts[1]) === 1 && parts[0] < parts[1];
  }
  function capPairs(map) {
    const list2 = [...map].map(([k, n2]) => ({ k, n: n2 }));
    list2.sort((a, b) => b.n - a.n || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    return list2.slice(0, MAX_MIXED).sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : 0);
  }
  function addPairs(map, list2) {
    for (const p of list2) if (!map.has(p.k) || p.n > map.get(p.k)) map.set(p.k, p.n);
    return map;
  }
  function cleanPlay(v) {
    if (!isObject3(v)) return null;
    const games2 = {};
    for (const id of GAME_IDS) {
      const g = isObject3(v.games) ? cleanGame(id, v.games[id]) : null;
      if (g) games2[id] = g;
    }
    const pairs2 = (Array.isArray(v.mixed) ? v.mixed : []).filter((p) => isObject3(p) && pairOk(p.k) && Number.isInteger(p.n) && p.n >= 1 && p.n <= MAX_COUNT);
    return { games: games2, mixed: capPairs(addPairs(/* @__PURE__ */ new Map(), pairs2)) };
  }
  function joinPlay(a, b) {
    if (!a && !b) return null;
    if (!a || !b) return a || b;
    const games2 = {};
    for (const id of GAME_IDS) {
      const x = a.games[id];
      const y = b.games[id];
      if (x || y) games2[id] = { best: Math.max(x ? x.best : 0, y ? y.best : 0), rounds: Math.max(x ? x.rounds : 0, y ? y.rounds : 0) };
    }
    return { games: games2, mixed: capPairs(addPairs(addPairs(/* @__PURE__ */ new Map(), a.mixed), b.mixed)) };
  }
  function cleanPrefs(v) {
    if (!isObject3(v)) return null;
    const values = {};
    for (const k of PREF_KEYS) {
      const p = isObject3(v.values) ? v.values[k] : null;
      if (isObject3(p) && PREFS[k].includes(p.v) && isStamp(p.at)) values[k] = { v: p.v, at: p.at };
    }
    return { values };
  }
  function joinPrefs(a, b) {
    if (!a && !b) return null;
    if (!a || !b) return a || b;
    const values = {};
    for (const k of PREF_KEYS) {
      const x = a.values[k];
      const y = b.values[k];
      if (!x || !y) {
        if (x || y) values[k] = x || y;
        continue;
      }
      values[k] = cmp([x.at, JSON.stringify(x.v)], [y.at, JSON.stringify(y.v)]) >= 0 ? x : y;
    }
    return { values };
  }
  var cleanClear = (v) => isStamp(v) ? v : 0;

  // js/conjugate.js
  init_kana();
  var GODAN2 = Object.freeze({
    "v5u": ["\u3046", "\u3044", "\u308F", "\u3048", "\u304A", "\u3063\u3066", "\u3063\u305F"],
    "v5u-s": ["\u3046", "\u3044", "\u308F", "\u3048", "\u304A", "\u3046\u3066", "\u3046\u305F"],
    "v5k": ["\u304F", "\u304D", "\u304B", "\u3051", "\u3053", "\u3044\u3066", "\u3044\u305F"],
    "v5k-s": ["\u304F", "\u304D", "\u304B", "\u3051", "\u3053", "\u3063\u3066", "\u3063\u305F"],
    "v5g": ["\u3050", "\u304E", "\u304C", "\u3052", "\u3054", "\u3044\u3067", "\u3044\u3060"],
    "v5s": ["\u3059", "\u3057", "\u3055", "\u305B", "\u305D", "\u3057\u3066", "\u3057\u305F"],
    "v5t": ["\u3064", "\u3061", "\u305F", "\u3066", "\u3068", "\u3063\u3066", "\u3063\u305F"],
    "v5n": ["\u306C", "\u306B", "\u306A", "\u306D", "\u306E", "\u3093\u3067", "\u3093\u3060"],
    "v5b": ["\u3076", "\u3073", "\u3070", "\u3079", "\u307C", "\u3093\u3067", "\u3093\u3060"],
    "v5m": ["\u3080", "\u307F", "\u307E", "\u3081", "\u3082", "\u3093\u3067", "\u3093\u3060"],
    "v5r": ["\u308B", "\u308A", "\u3089", "\u308C", "\u308D", "\u3063\u3066", "\u3063\u305F"],
    "v5r-i": ["\u308B", "\u308A", "\u3089", "\u308C", "\u308D", "\u3063\u3066", "\u3063\u305F"],
    "v5aru": ["\u308B", "\u3044", "\u3089", "\u308C", "\u308D", "\u3063\u3066", "\u3063\u305F"]
  });
  var GROUPS = Object.freeze({
    verb: Object.freeze([
      ["basic", ["plain", "polite", "negative", "polite-negative", "past", "polite-past", "past-negative", "polite-past-negative"]],
      ["linking", ["te", "negative-te", "ba", "tara"]],
      ["more", ["want", "volitional", "polite-volitional", "potential", "passive", "causative", "causative-passive", "imperative"]]
    ].map(([id, forms2]) => Object.freeze({ id, forms: Object.freeze(forms2) }))),
    adj: Object.freeze([
      ["basic", ["plain", "polite", "negative", "polite-negative", "past", "polite-past", "past-negative", "polite-past-negative"]],
      ["linking", ["te", "adverb", "ba", "tara"]]
    ].map(([id, forms2]) => Object.freeze({ id, forms: Object.freeze(forms2) })))
  });
  var VERB_NOTE = Object.freeze({
    polite: "polite",
    "polite-negative": "polite-negative",
    "polite-past": "polite-past",
    "polite-past-negative": "polite-past-negative",
    past: "past",
    negative: "negative",
    "past-negative": "past-negative",
    te: "te-form",
    "negative-te": "naide",
    ba: "cond-ba",
    tara: "cond-tara",
    want: "want",
    volitional: "volitional",
    "polite-volitional": "lets",
    potential: "potential",
    passive: "passive",
    causative: "causative",
    imperative: "imperative"
  });
  var ADJ_NOTE = Object.freeze({
    negative: "adj-negative",
    past: "adj-past",
    te: "adj-te",
    adverb: "adverbial",
    ba: "cond-ba",
    tara: "cond-tara"
  });
  var NA_NOTE = Object.freeze({
    plain: "da",
    polite: "desu",
    negative: "ja-nai",
    "polite-negative": "ja-arimasen",
    past: "datta",
    "polite-past": "deshita",
    "past-negative": "ja-nakatta",
    "polite-past-negative": "ja-arimasen-deshita",
    adverb: "adverbial",
    ba: "cond-nara",
    tara: "cond-tara"
  });
  function verbEndings({ i, a, e, o, te, ta, stem }) {
    return {
      plain: null,
      polite: `${i}\u307E\u3059`,
      negative: `${a}\u306A\u3044`,
      "polite-negative": `${i}\u307E\u305B\u3093`,
      past: ta,
      "polite-past": `${i}\u307E\u3057\u305F`,
      "past-negative": `${a}\u306A\u304B\u3063\u305F`,
      "polite-past-negative": `${i}\u307E\u305B\u3093 \u3067\u3057\u305F`,
      te,
      "negative-te": `${a}\u306A\u3044\u3067`,
      ba: `${e}\u3070`,
      tara: `${ta}\u3089`,
      want: `${i}\u305F\u3044`,
      volitional: `${o}\u3046`,
      "polite-volitional": `${i}\u307E\u3057\u3087\u3046`,
      potential: stem.potential,
      passive: `${a}\u308C\u308B`,
      causative: `${a}\u305B\u308B`,
      "causative-passive": `${a}\u305B\u3089\u308C\u308B`,
      imperative: stem.imperative
    };
  }
  var ICHIDAN = Object.freeze(verbEndings({
    i: "",
    a: "",
    e: "\u308C",
    o: "\u3088",
    te: "\u3066",
    ta: "\u305F",
    stem: { potential: "\u3089\u308C\u308B", imperative: "\u308D" }
  }));
  var ICHIDAN_FIX = Object.freeze({ volitional: "\u3088\u3046", causative: "\u3055\u305B\u308B", "causative-passive": "\u3055\u305B\u3089\u308C\u308B", passive: "\u3089\u308C\u308B" });
  var SURU = Object.freeze({
    plain: "\u3059\u308B",
    polite: "\u3057\u307E\u3059",
    negative: "\u3057\u306A\u3044",
    "polite-negative": "\u3057\u307E\u305B\u3093",
    past: "\u3057\u305F",
    "polite-past": "\u3057\u307E\u3057\u305F",
    "past-negative": "\u3057\u306A\u304B\u3063\u305F",
    "polite-past-negative": "\u3057\u307E\u305B\u3093 \u3067\u3057\u305F",
    te: "\u3057\u3066",
    "negative-te": "\u3057\u306A\u3044\u3067",
    ba: "\u3059\u308C\u3070",
    tara: "\u3057\u305F\u3089",
    want: "\u3057\u305F\u3044",
    volitional: "\u3057\u3088\u3046",
    "polite-volitional": "\u3057\u307E\u3057\u3087\u3046",
    potential: "\u3067\u304D\u308B",
    passive: "\u3055\u308C\u308B",
    causative: "\u3055\u305B\u308B",
    "causative-passive": "\u3055\u305B\u3089\u308C\u308B",
    imperative: "\u3057\u308D"
  });
  var KURU = Object.freeze({
    plain: "\u304F\u308B",
    polite: "\u304D\u307E\u3059",
    negative: "\u3053\u306A\u3044",
    "polite-negative": "\u304D\u307E\u305B\u3093",
    past: "\u304D\u305F",
    "polite-past": "\u304D\u307E\u3057\u305F",
    "past-negative": "\u3053\u306A\u304B\u3063\u305F",
    "polite-past-negative": "\u304D\u307E\u305B\u3093 \u3067\u3057\u305F",
    te: "\u304D\u3066",
    "negative-te": "\u3053\u306A\u3044\u3067",
    ba: "\u304F\u308C\u3070",
    tara: "\u304D\u305F\u3089",
    want: "\u304D\u305F\u3044",
    volitional: "\u3053\u3088\u3046",
    "polite-volitional": "\u304D\u307E\u3057\u3087\u3046",
    potential: "\u3053\u3089\u308C\u308B",
    passive: "\u3053\u3089\u308C\u308B",
    causative: "\u3053\u3055\u305B\u308B",
    "causative-passive": "\u3053\u3055\u305B\u3089\u308C\u308B",
    imperative: "\u3053\u3044"
  });
  var ADJ_I = Object.freeze({
    plain: "\u3044",
    polite: "\u3044 \u3067\u3059",
    negative: "\u304F\u306A\u3044",
    "polite-negative": "\u304F\u306A\u3044 \u3067\u3059",
    past: "\u304B\u3063\u305F",
    "polite-past": "\u304B\u3063\u305F \u3067\u3059",
    "past-negative": "\u304F\u306A\u304B\u3063\u305F",
    "polite-past-negative": "\u304F\u306A\u304B\u3063\u305F \u3067\u3059",
    te: "\u304F\u3066",
    adverb: "\u304F",
    ba: "\u3051\u308C\u3070",
    tara: "\u304B\u3063\u305F\u3089"
  });
  var ADJ_NA = Object.freeze({
    plain: " \u3060",
    polite: " \u3067\u3059",
    negative: " \u3058\u3083 \u306A\u3044",
    "polite-negative": " \u3058\u3083 \u3042\u308A\u307E\u305B\u3093",
    past: " \u3060\u3063\u305F",
    "polite-past": " \u3067\u3057\u305F",
    "past-negative": " \u3058\u3083 \u306A\u304B\u3063\u305F",
    "polite-past-negative": " \u3058\u3083 \u3042\u308A\u307E\u305B\u3093 \u3067\u3057\u305F",
    te: " \u3067",
    adverb: " \u306B",
    ba: " \u306A\u3089",
    tara: " \u3060\u3063\u305F\u3089"
  });
  function baseReading(token) {
    const readings = token && token.entry && Array.isArray(token.entry.r) ? token.entry.r.filter(Boolean) : [];
    if (!readings.length) return "";
    const said0 = String(token.reading || "");
    let best = readings[0];
    let bestN = -1;
    for (const r of readings) {
      let n2 = 0;
      while (n2 < r.length && n2 < said0.length && r[n2] === said0[n2]) n2++;
      if (n2 > bestN) {
        best = r;
        bestN = n2;
      }
    }
    return best;
  }

  // js/word-store.js
  var KEY3 = "yomu-site:words";
  var VERSION2 = 1;
  var DAMAGED_KEY3 = `${KEY3}:damaged`;
  var MAX_SAVED_WORDS = 2e3;
  var MAX_FIELD3 = 24;
  var REVIEW_PREFIX = "w:";
  var MAX_SENTENCE = MAX_AROUND;
  var DAY3 = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  var KANA3 = /^[ぁ-ゖァ-ヺー]+$/;
  var isCount3 = (n2) => Number.isInteger(n2) && n2 >= 0;
  var len2 = (s) => [...s].length;
  function savableWord(token) {
    if (!token || !token.entry || !["word", "inflected"].includes(token.kind) || token.confidence === "guess") return null;
    const g = token.usage?.en?.meanings?.[0] || (Array.isArray(token.entry.g) ? token.entry.g[0] : "");
    const w = token.base || token.surface;
    const r = baseReading(token);
    return w && r && g ? { w, r, g } : null;
  }
  function wordId(w, r) {
    return cyrb53(`${w}\0${r}`).toString(36);
  }
  function cleanSentence(v) {
    if (!isObject2(v) || ![v.before, v.word, v.after].every((x) => typeof x === "string")) return null;
    const all = v.before + v.word + v.after;
    if (!v.word || /[\r\n]/.test(all) || len2(all) > MAX_SENTENCE) return null;
    return { before: v.before, word: v.word, after: v.after };
  }
  function cleanWord2(v) {
    if (!isObject2(v) || typeof v.w !== "string" || typeof v.r !== "string") return null;
    if (!v.w || !v.r || len2(v.w) > MAX_FIELD3 || len2(v.r) > MAX_FIELD3 || !KANA3.test(v.r)) return null;
    if (!Number.isFinite(v.at) || v.at <= 0 || !Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX) return null;
    if (!DAY3.test(v.due) || !isCount3(v.reviews) || !isCount3(v.lapses)) return null;
    const rec = { w: v.w, r: v.r, g: cleanGloss(v.g), at: v.at, box: v.box, due: v.due, reviews: v.reviews, lapses: v.lapses };
    const from = cleanSentence(v.from);
    return from ? { ...rec, from } : rec;
  }
  function validate2(raw) {
    const data = { saved: {} };
    if (!isObject2(raw)) return { data, dropped: 0, damaged: raw !== null && raw !== void 0 };
    let dropped = 0;
    if (raw.saved !== void 0 && !isObject2(raw.saved)) return { data, dropped: 1, damaged: false };
    for (const [id, v] of Object.entries(raw.saved || {})) {
      const rec = cleanWord2(v);
      if (rec && wordId(rec.w, rec.r) === id) data.saved[id] = rec;
      else dropped += 1;
    }
    return { data, dropped, damaged: false };
  }
  function saveWord(data, { w, r, g, from } = {}, now) {
    const rec = cleanWord2({ w, r, g, from, at: +now, box: 0, due: dayOf(now), reviews: 0, lapses: 0 });
    if (!rec) return null;
    const id = wordId(rec.w, rec.r);
    if (data.saved[id] || Object.keys(data.saved).length >= MAX_SAVED_WORDS) return null;
    data.saved[id] = rec;
    return id;
  }
  function unsaveWord(data, id) {
    if (!data.saved[id]) return false;
    delete data.saved[id];
    return true;
  }
  function dueWords(data, today) {
    return Object.entries(data.saved).filter(([, rec]) => isDue(rec, today)).sort(([, a], [, b]) => a.due < b.due ? -1 : a.due > b.due ? 1 : a.box - b.box || a.at - b.at).map(([id]) => id);
  }
  function nextDueWords(data, today) {
    let day = null;
    let n2 = 0;
    for (const rec of Object.values(data.saved)) {
      if (rec.due <= today) continue;
      if (day === null || rec.due < day) {
        day = rec.due;
        n2 = 1;
      } else if (rec.due === day) n2 += 1;
    }
    return day ? { day, n: n2 } : null;
  }
  function listWords(data) {
    return Object.entries(data.saved).sort(([ia, a], [ib, b]) => b.at - a.at || (ia < ib ? -1 : 1)).map(([id, rec]) => ({ id, ...rec }));
  }
  function mergeWords(data, list2) {
    const sum = { added: 0, updated: 0, full: 0 };
    for (const v of Array.isArray(list2) ? list2 : []) {
      const rec = cleanWord2(v);
      if (!rec) continue;
      const id = wordId(rec.w, rec.r);
      const had = data.saved[id];
      if (!had) {
        if (Object.keys(data.saved).length >= MAX_SAVED_WORDS) {
          sum.full += 1;
          continue;
        }
        data.saved[id] = rec;
        sum.added += 1;
        continue;
      }
      const lead = rec.reviews > had.reviews ? rec : had;
      const next2 = { ...lead, g: had.g || rec.g, at: Math.min(had.at, rec.at), lapses: Math.max(had.lapses, rec.lapses) };
      const from = had.from || rec.from;
      if (from) next2.from = from;
      else delete next2.from;
      if (JSON.stringify(next2) !== JSON.stringify(had)) {
        data.saved[id] = next2;
        sum.updated += 1;
      }
    }
    return sum;
  }
  function openWords({ store = createStore({ key: KEY3, version: VERSION2 }), readRaw = () => safeGet(KEY3), keepRaw = (s) => safeSet(DAMAGED_KEY3, s) } = {}) {
    let data = { saved: {} };
    let note = null;
    let writable = true;
    const listeners = /* @__PURE__ */ new Set();
    function commit(changed = true, event = { type: "change" }) {
      if (!changed) return false;
      writable = store.save(data);
      for (const fn of listeners) fn(event);
      return true;
    }
    const api = {
      load() {
        const raw = readRaw();
        const loaded2 = store.load(null);
        const v = validate2(loaded2);
        data = v.data;
        const damaged = v.damaged || raw !== null && raw !== void 0 && loaded2 === null;
        note = damaged ? "damaged" : v.dropped ? "partial" : null;
        if (note && raw !== null && raw !== void 0) keepRaw(raw);
        return api;
      },
      get data() {
        return data;
      },
      get note() {
        return note;
      },
      get writable() {
        return writable;
      },
      onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      isSaved: (w, r) => !!data.saved[wordId(w, r)],
      byId: (id) => data.saved[id] || null,
      get size() {
        return Object.keys(data.saved).length;
      },
      list: () => listWords(data),
      save(word, now) {
        const id = saveWord(data, word, now);
        return commit(id !== null, { type: "save", id, at: +now });
      },
      unsave(id) {
        const rec = data.saved[id];
        return commit(unsaveWord(data, id), { type: "unsave", id, rec });
      },
      /** Save or unsave; true when it is saved after. A full list refuses and says false. */
      toggle(word, now) {
        const id = wordId(word.w, word.r);
        if (data.saved[id]) {
          api.unsave(id);
          return false;
        }
        return api.save(word, now);
      },
      answer(id, ok, today) {
        if (!data.saved[id]) return null;
        data.saved[id] = schedule(data.saved[id], ok, today);
        commit();
        return data.saved[id];
      },
      due: (today) => dueWords(data, today),
      nextDue: (today) => nextDueWords(data, today),
      exportList: () => listWords(data).map(({ id, ...rec }) => rec),
      /**
       * Import: the event names every word of the backup, changed or not, as
       * the kanji store's does, so each counts as saved now (sync-watch.js): an
       * unchanged word was stamped nowhere, and another device's older unsave
       * then won over the Import.
       */
      merge(list2) {
        const sum = mergeWords(data, list2);
        const ids = (Array.isArray(list2) ? list2 : []).map((v) => v && typeof v.w === "string" && typeof v.r === "string" ? wordId(v.w, v.r) : null).filter(Boolean);
        commit(true, { type: "import", ids });
        return sum;
      },
      /**
       * What sync decided: per id a record, or null to remove it, read through
       * this store's own validation. Sync never carries a sentence, so a word
       * kept here keeps the one it has.
       */
      adopt(changes = {}) {
        const raw = { saved: { ...data.saved } };
        for (const [id, rec] of Object.entries(changes)) {
          if (!rec) {
            delete raw.saved[id];
            continue;
          }
          const from = data.saved[id] && data.saved[id].from;
          raw.saved[id] = from && !rec.from ? { ...rec, from } : rec;
        }
        data = validate2(raw).data;
        return commit(true, { type: "sync" });
      }
    };
    return api;
  }
  var isWordReview = (rid) => typeof rid === "string" && rid.startsWith(REVIEW_PREFIX);
  var wordOfReview = (rid) => isWordReview(rid) ? rid.slice(REVIEW_PREFIX.length) : null;

  // js/review.js
  function createReview(chars3) {
    const queue = [...new Set(chars3 || [])];
    return { queue, total: queue.length, shown: false, first: /* @__PURE__ */ new Map(), repeats: 0 };
  }
  function current2(r) {
    return r.queue.length ? r.queue[0] : null;
  }
  function finished(r) {
    return r.queue.length === 0;
  }
  function show(r) {
    if (!finished(r)) r.shown = true;
    return r.shown;
  }
  function isRepeat(r) {
    const ch = current2(r);
    return ch !== null && r.first.has(ch);
  }
  function position(r) {
    const ch = current2(r);
    if (ch === null) return { at: r.total, of: r.total };
    return { at: isRepeat(r) ? [...r.first.keys()].indexOf(ch) + 1 : r.first.size + 1, of: r.total };
  }
  function answer(r, ok, apply) {
    const ch = current2(r);
    if (ch === null || !r.shown) return null;
    r.queue.shift();
    r.shown = false;
    if (!r.first.has(ch)) {
      r.first.set(ch, !!ok);
      if (typeof apply === "function") apply(ch, !!ok);
    } else {
      r.repeats += 1;
    }
    if (!ok) r.queue.push(ch);
    return ch;
  }
  function summary(r) {
    const again = [...r.first].filter(([, ok]) => !ok).map(([ch]) => ch);
    return { reviewed: r.first.size, got: r.first.size - again.length, again, left: r.queue.length };
  }

  // js/library-filter.js
  init_search_latin();
  init_kana();
  var LOOSE_MIN = 3;
  function filterLibrary(library2, query = "") {
    if (!String(query).trim()) return library2;
    const inLang = (value, lang2) => [(value || {})[lang2]].flat().filter((s) => typeof s === "string");
    const loose = looseRomaji(query);
    const roman = loose.length >= LOOSE_MIN ? looseRomaji : (text) => String(text).toLowerCase().replace(/[^a-z]/g, "");
    const romanQuery = roman(query);
    const match = (ja, kana, en, es) => {
      if (rowMatches([ja || "", kana || "", en, 0, "", es], query)) return true;
      if (!/^[a-z\s'-]+$/i.test(String(query)) || !romanQuery) return false;
      const reading = toHira(kana || ja || "");
      const romaji = said(reading, { finalWa: /^(こんにちは|こんばんは)[\s。！!]*$/u.test(reading) });
      return roman(romaji).includes(romanQuery);
    };
    const phrases = library2.phrases.filter((p) => match(
      p.ja,
      p.kana,
      [p.en, ...inLang(p.situation, "en"), ...inLang(p.note, "en")].filter(Boolean),
      [p.es, ...inLang(p.situation, "es"), ...inLang(p.note, "es")].filter(Boolean)
    ));
    const ids = new Set(phrases.map((p) => p.id));
    const categories = library2.categories.map((c) => ({ ...c, items: c.items.filter((id) => ids.has(id)) })).filter((c) => c.items.length);
    const dialogues = library2.dialogues.filter((d) => match(
      d.lines.map((l) => l.ja).join(" "),
      d.lines.map((l) => l.kana || l.ja).join(" "),
      [...inLang(d.title, "en"), ...inLang(d.scene, "en"), ...inLang(d.translation, "en")],
      [...inLang(d.title, "es"), ...inLang(d.scene, "es"), ...inLang(d.translation, "es")]
    ));
    return { ...library2, phrases, categories, dialogues };
  }

  // js/examples.js
  init_range_store();
  function createExamples({ fetchJson: fetchJson3, base = "data/" }) {
    const dir = base.endsWith("/") ? base : `${base}/`;
    const resolve = (src) => src.startsWith("data/") ? dir + src.slice(5) : src;
    const store = createRangeStore({
      fetchJson: fetchJson3,
      resolve,
      indexPath: `${dir}sent/index.json`,
      what: "The example sentence index"
    });
    const moreStore = createRangeStore({
      fetchJson: fetchJson3,
      resolve,
      indexPath: `${dir}sent/more/index.json`,
      what: "The more examples index"
    });
    const asked2 = /* @__PURE__ */ new Set();
    const askedMore = /* @__PURE__ */ new Set();
    async function need(keys) {
      await store.need(keys);
      for (const k of keys) asked2.add(k);
    }
    async function needMore(keys) {
      await moreStore.need(keys);
      for (const k of keys) askedMore.add(k);
    }
    const sentences = (list2) => list2.map(([id, ja, en, start, end]) => Object.freeze({
      id,
      ja,
      en,
      start,
      end
    }));
    const rowOf2 = (rows, reading) => rows.find(([r]) => r === reading) || (rows.length === 1 && !reading ? rows[0] : null);
    function examplesOf(key, reading) {
      if (!asked2.has(key)) return void 0;
      const hit = rowOf2(store.get(key) || [], reading);
      return hit ? sentences(hit[1]) : [];
    }
    function moreCountOf(key, reading) {
      if (!asked2.has(key)) return 0;
      const hit = rowOf2(store.get(key) || [], reading);
      return hit && hit[2] || 0;
    }
    function moreOf(key, reading) {
      if (!askedMore.has(key)) return void 0;
      const hit = rowOf2(moreStore.get(key) || [], reading);
      return hit ? sentences(hit[1]) : [];
    }
    return Object.freeze({
      need,
      examplesOf,
      moreCountOf,
      needMore,
      moreOf
    });
  }

  // js/kana-chart.js
  init_kana();
  var GOJUON = Object.freeze([
    "\u3042\u3044\u3046\u3048\u304A",
    "\u304B\u304D\u304F\u3051\u3053",
    "\u3055\u3057\u3059\u305B\u305D",
    "\u305F\u3061\u3064\u3066\u3068",
    "\u306A\u306B\u306C\u306D\u306E",
    "\u306F\u3072\u3075\u3078\u307B",
    "\u307E\u307F\u3080\u3081\u3082",
    "\u3084 \u3086 \u3088",
    "\u3089\u308A\u308B\u308C\u308D",
    "\u308F   \u3092",
    "\u3093    "
  ]);
  var VOICED2 = Object.freeze(["\u304C\u304E\u3050\u3052\u3054", "\u3056\u3058\u305A\u305C\u305E", "\u3060\u3062\u3065\u3067\u3069", "\u3070\u3073\u3076\u3079\u307C", "\u3071\u3074\u3077\u307A\u307D"]);
  var COMBINED = Object.freeze(["\u304D", "\u3057", "\u3061", "\u306B", "\u3072", "\u307F", "\u308A", "\u304E", "\u3058", "\u3073", "\u3074"]);
  function kanaRomaji(kana) {
    const list2 = beats(kana);
    return list2.map((b, i) => beatRomaji(b, list2[i + 1] || "", list2[i - 1] || "")).join("");
  }
  var basic = GOJUON.flatMap((row) => [...row]);
  var voiced = VOICED2.flatMap((row) => [...row]);
  var combined = COMBINED.flatMap((k) => ["\u3083", "\u3085", "\u3087"].map((y) => k + y));
  var BASIC_KANA = Object.freeze(basic.filter((k) => k !== " "));
  var PRACTICE_SOUNDS = Object.freeze([...BASIC_KANA, ...voiced, ...combined, "\u3063", "\u30FC", ...Object.keys(GENKI_MAP)]);
  function kanaChart(script = "hiragana") {
    const show2 = script === "katakana" ? toKata : toHira;
    const sections = [
      ["basic", { en: "Basic kana", es: "Kana b\xE1sicos" }, 5, basic],
      ["voiced", { en: "Voiced sounds", es: "Sonidos sonoros" }, 5, voiced],
      ["combined", { en: "Combinations", es: "Combinaciones" }, 3, combined],
      ["timing", { en: "Small tsu and long vowels", es: "Tsu peque\xF1a y vocales largas" }, 2, ["\u3063", "\u30FC"]]
    ];
    if (script === "katakana") sections.push(["loan", { en: "Loanword combinations", es: "Combinaciones para palabras prestadas" }, 3, Object.keys(GENKI_MAP)]);
    const pause = t({ en: "pause", es: "pausa" });
    const longVowel = t({ en: "long vowel", es: "vocal larga" });
    return sections.map(([id, title, columns, sounds2]) => ({
      id,
      title: t(title),
      columns,
      cells: sounds2.map((k, i) => ({
        id: k === " " ? `${id}-empty-${i}` : k,
        kana: k === " " ? "" : show2(k),
        romaji: k === "\u3063" ? pause : k === "\u30FC" ? longVowel : kanaRomaji(k),
        // These timing marks need context, not an isolated spoken symbol; を, ぢ
        // and づ are said as お, じ and ず (kana.js SAID_AS).
        spoken: k === "\u3063" ? "\u304D\u3063\u3066" : k === "\u30FC" ? "\u30B3\u30FC\u30D2\u30FC" : saidAs(k),
        example: k === "\u3063" ? show2("\u304D\u3063\u3066") : k === "\u30FC" ? show2("\u3053\u30FC\u3072\u30FC") : null
      }))
    }));
  }

  // js/kana-practice.js
  init_kana();
  var STARTERS = [
    ["no", "\u3044\u3044\u3048", "\u3044\u3044\u3048", "No.", "No."],
    ["blue-house", "\u9752\u3044\u5BB6", "\u3042\u304A\u3044 \u3044\u3048", "A blue house.", "Una casa azul."],
    ["persimmon", "\u8D64\u3044\u67FF", "\u3042\u304B\u3044 \u304B\u304D", "A red persimmon.", "Un caqui rojo."],
    ["here", "\u3053\u3053\uFF1F", "\u3053\u3053\uFF1F", "Here?", "\xBFAqu\xED?"],
    ["big-pond", "\u5927\u304D\u3044\u6C60", "\u304A\u304A\u304D\u3044 \u3044\u3051", "A big pond.", "Un estanque grande."],
    ["morning", "\u671D", "\u3042\u3055", "Morning.", "La ma\xF1ana."],
    ["sushi", "\u5BFF\u53F8", "\u3059\u3057", "Sushi.", "Sushi."],
    ["little", "\u5C11\u3057", "\u3059\u3053\u3057", "A little.", "Un poco."],
    ["small-stone", "\u5C0F\u3055\u3044\u77F3", "\u3061\u3044\u3055\u3044 \u3044\u3057", "A small stone.", "Una piedra peque\xF1a."],
    ["summer-morning", "\u590F\u306E\u671D", "\u306A\u3064\u306E \u3042\u3055", "A summer morning.", "Una ma\xF1ana de verano."],
    ["cat", "\u732B\u306F\u3053\u3053", "\u306D\u3053\u306F \u3053\u3053", "The cat is here.", "El gato est\xE1 aqu\xED."],
    ["mountain", "\u5C71\u306E\u4E0A", "\u3084\u307E\u306E \u3046\u3048", "On top of the mountain.", "En la cima de la monta\xF1a."],
    ["what", "\u3053\u308C\u306F\u4F55\uFF1F", "\u3053\u308C\u306F \u306A\u306B\uFF1F", "What is this?", "\xBFQu\xE9 es esto?"],
    ["book", "\u79C1\u306E\u672C", "\u308F\u305F\u3057\u306E \u307B\u3093", "My book.", "Mi libro."],
    ["snow-night", "\u96EA\u306E\u591C", "\u3086\u304D\u306E \u3088\u308B", "A snowy night.", "Una noche de nieve."],
    ["rain", "\u4ECA\u65E5\u306F\u96E8", "\u304D\u3087\u3046\u306F \u3042\u3081", "It is rainy today.", "Hoy llueve."],
    ["tea", "\u304A\u8336\u3092\u98F2\u307F\u307E\u3059", "\u304A\u3061\u3083\u3092 \u306E\u307F\u307E\u3059", "I drink tea.", "Tomo t\xE9."],
    ["bag", "\u9784\u306F\u3069\u3053\uFF1F", "\u304B\u3070\u3093\u306F \u3069\u3053\uFF1F", "Where is the bag?", "\xBFD\xF3nde est\xE1 el bolso?"],
    ["ticket", "\u5207\u7B26\u3092\u8CB7\u3044\u307E\u3059", "\u304D\u3063\u3077\u3092 \u304B\u3044\u307E\u3059", "I buy a ticket.", "Compro un boleto."],
    ["coffee", "\u30B3\u30FC\u30D2\u30FC", "\u3053\u30FC\u3072\u30FC", "Coffee.", "Caf\xE9."]
  ].map(([id, ja, kana, en, es]) => ({ id: `kana-${id}`, ja, kana, en, es }));
  var sounds = new Set(PRACTICE_SOUNDS);
  var layout = /^[\s\p{Punctuation}]+$/u;
  function requiredKana(text) {
    const needed = /* @__PURE__ */ new Set();
    const normalized = toHira(String(text || "").normalize("NFKC"));
    for (const beat of beats(normalized)) {
      if (sounds.has(beat)) needed.add(beat);
      else if (!layout.test(beat)) return null;
    }
    return needed.size ? [...needed] : null;
  }
  function practiceCatalog(library2) {
    const seen = /* @__PURE__ */ new Set();
    return [...STARTERS, ...library2?.phrases || []].filter((p) => {
      const key = toHira(p.kana || "").replace(/[\s\p{Punctuation}]/gu, "");
      if (!key || seen.has(key) || !requiredKana(p.kana)) return false;
      seen.add(key);
      return true;
    });
  }
  function kanaPractice(library2, { script = "hiragana", selected = [] } = {}) {
    const have = new Set(selected.filter((s) => sounds.has(s)));
    const show2 = script === "katakana" ? toKata : toHira;
    const catalog = practiceCatalog(library2);
    const rows = catalog.filter((p) => requiredKana(p.kana).every((s) => have.has(s)));
    return {
      total: catalog.length,
      exercises: rows.map((p) => ({ id: p.id, text: show2(p.kana), original: p.ja, meaning: t({ en: p.en, es: p.es }) }))
    };
  }

  // js/kana-detail.js
  init_kana();
  init_notes();
  var BIG = Object.freeze({ "\u3083": "\u3084", "\u3085": "\u3086", "\u3087": "\u3088", "\u3041": "\u3042", "\u3043": "\u3044", "\u3045": "\u3046", "\u3047": "\u3048", "\u3049": "\u304A", "\u308E": "\u308F" });
  function kanaDetail(text, lang2 = currentLang(), extraRules = []) {
    const list2 = beats(String(text).normalize("NFKC"));
    const rules = new Set(extraRules.filter((id) => Object.hasOwn(SOUND_NOTES, id)));
    const say2 = (words) => t(words, lang2);
    const parts = list2.filter((b) => [...b].every(isKana)).map((kana, index) => {
      const hira = toHira(kana);
      let explanation = say2({
        en: "One kana represents a sound, not a word with a fixed meaning.",
        es: "Un kana representa un sonido, no una palabra con un significado fijo."
      });
      let formula = null;
      let romaji = kanaRomaji(kana);
      let spoken = hira === "\u3063" ? "\u304D\u3063\u3066" : hira === "\u30FC" ? "\u30B3\u30FC\u30D2\u30FC" : saidAs(kana);
      if (hira.length === 2 && BIG[hira[1]]) {
        const left = kanaRomaji(kana[0]);
        const right = kanaRomaji(BIG[hira[1]]);
        const small = say2({ en: `small ${right}`, es: `${right} peque\xF1a` });
        formula = `${kana[0]} (${left}) + ${kana[1]} (${small}) = ${kana} (${romaji})`;
        explanation = say2({
          en: "These two characters make one combined beat. Keep the second kana small.",
          es: "Estos dos caracteres forman un solo pulso combinado. El segundo kana se escribe peque\xF1o."
        });
        rules.add("\u3083\u3085\u3087".includes(hira[1]) ? "youon" : "foreign-sound");
      } else if (hira === "\u3063") {
        explanation = say2({
          en: "A small tsu holds the following consonant for one beat. It is not a separate tsu syllable.",
          es: "Una tsu peque\xF1a sostiene la consonante siguiente durante un pulso. No es una s\xEDlaba tsu aparte."
        });
        rules.add("small-tsu");
      } else if (hira === "\u30FC") {
        explanation = say2({
          en: "Hold the vowel before this mark for one extra beat.",
          es: "Sost\xE9n la vocal que va antes de esta marca durante un pulso m\xE1s."
        });
        rules.add("bar");
      }
      const decomposed = [...kana[0].normalize("NFD")];
      if (decomposed[1] === "\u3099" || decomposed[1] === "\u309A") {
        const dotted = decomposed[1] === "\u3099";
        const mark = dotted ? "\u309B" : "\u309C";
        rules.add(dotted ? "dakuten" : "handakuten");
        if (!formula) {
          formula = `${decomposed[0]} (${kanaRomaji(decomposed[0])}) + ${mark} = ${kana} (${romaji})`;
          explanation = dotted ? say2({ en: "The two dots change the consonant to its voiced sound.", es: "Los dos puntos cambian la consonante por su sonido sonoro." }) : say2({ en: "The small circle changes an h-row sound to p.", es: "El peque\xF1o c\xEDrculo convierte un sonido de la fila h en p." });
        }
      }
      const asBeat = saidAs(kana);
      if (asBeat !== kana && kanaRomaji(asBeat) !== romaji) {
        const heard = `${kana === hira ? asBeat : toKata(asBeat)} (${kanaRomaji(asBeat)})`;
        explanation = hira === "\u3092" ? say2({
          en: `${kana} is usually pronounced ${heard}; some charts write it ${romaji}.`,
          es: `${kana} suele pronunciarse ${heard}; algunas tablas la escriben ${romaji}.`
        }) : say2({ en: `An old kana: today it is said ${heard}.`, es: `Un kana antiguo: hoy se pronuncia ${heard}.` });
      }
      for (const [glyph, rule, said2, sound] of [["\u306F", "particle-wa", "wa", "\u308F"], ["\u3078", "particle-e", "e", "\u3048"], ["\u3092", "particle-o", "o", "\u304A"]]) {
        if (hira === glyph && rules.has(rule)) {
          romaji = said2;
          spoken = sound;
          explanation = say2({
            en: `${kana} is pronounced ${said2} here because it is a particle. The spelling stays ${kana}.`,
            es: `Aqu\xED ${kana} se pronuncia ${said2} porque es una part\xEDcula. Se sigue escribiendo ${kana}.`
          });
        }
      }
      return {
        id: index,
        kana,
        romaji: hira === "\u3063" ? say2({ en: "held beat", es: "pulso sostenido" }) : hira === "\u30FC" ? say2({ en: "long vowel", es: "vocal larga" }) : romaji,
        formula,
        explanation,
        spoken
      };
    });
    return { parts, notes: [...rules].map((id) => noteFor("sound", id, lang2)).filter(Boolean) };
  }
  function soundRules(lang2 = currentLang()) {
    return Object.keys(SOUND_NOTES).map((id) => ({ id, note: noteFor("sound", id, lang2) }));
  }

  // ../yomu-ios/bridge/entry.js
  init_usage_notes();

  // js/play-kana.js
  var hint = (en, es) => Object.freeze({ en, es });
  var KANA_SETS = Object.freeze([
    {
      id: "nu-me",
      script: "hiragana",
      chars: [
        ["\u306C", hint("Like \u3081, but the last stroke curls into a small loop at the bottom right.", "Como \u3081, pero el \xFAltimo trazo se enrosca en un lazo peque\xF1o abajo a la derecha.")],
        ["\u3081", hint("Like \u306C with no loop: the last stroke sweeps out and ends open.", "Como \u306C sin el lazo: el \xFAltimo trazo sale hacia afuera y termina abierto.")]
      ]
    },
    {
      id: "wa-ne-re",
      script: "hiragana",
      chars: [
        ["\u308F", hint("The right side is one wide bulge that ends open, with no loop and no tail.", "El lado derecho es una sola curva ancha que termina abierta, sin lazo ni cola.")],
        ["\u306D", hint("The right side ends in a small loop at the bottom.", "El lado derecho termina en un lazo peque\xF1o abajo.")],
        ["\u308C", hint("The right side ends in a tail that kicks out to the right.", "El lado derecho termina en una cola que sale hacia la derecha.")]
      ]
    },
    {
      id: "sa-chi",
      script: "hiragana",
      chars: [
        ["\u3055", hint("The bottom curve bows out to the left, like a letter c.", "La curva de abajo se arquea hacia la izquierda, como una letra c.")],
        ["\u3061", hint("The bottom curve bows out to the right, like the number 5.", "La curva de abajo se arquea hacia la derecha, como el n\xFAmero 5.")]
      ]
    },
    {
      id: "ru-ro",
      script: "hiragana",
      chars: [
        ["\u308B", hint("The stroke ends in a small loop at the bottom.", "El trazo termina en un lazo peque\xF1o abajo.")],
        ["\u308D", hint("The stroke ends open: \u308B with the loop left off.", "El trazo termina abierto: es \u308B sin el lazo.")]
      ]
    },
    {
      id: "ha-ho",
      script: "hiragana",
      chars: [
        ["\u306F", hint("One bar crosses the right-hand stroke, which pokes up above it.", "Una barra cruza el trazo de la derecha, que sobresale por arriba.")],
        ["\u307B", hint("Two bars on the right, and the top one caps the stroke: nothing pokes up.", "Dos barras a la derecha, y la de arriba tapa el trazo: nada sobresale.")]
      ]
    },
    {
      id: "i-ri",
      script: "hiragana",
      chars: [
        ["\u3044", hint("Two short strokes side by side; the right one is the shorter.", "Dos trazos cortos lado a lado; el de la derecha es el m\xE1s corto.")],
        ["\u308A", hint("The right stroke is the long one and drops well below the left.", "El trazo de la derecha es el largo y baja mucho m\xE1s que el izquierdo.")]
      ]
    },
    {
      id: "ko-ni-ta",
      script: "hiragana",
      chars: [
        ["\u3053", hint("Only the two short strokes, with nothing to their left.", "Solo los dos trazos cortos, sin nada a su izquierda.")],
        ["\u306B", hint("A plain upright stroke stands to the left of the two.", "Un trazo vertical simple est\xE1 a la izquierda de los dos.")],
        ["\u305F", hint("A cross, like a small \u5341, stands to the left of the two.", "Una cruz, como un \u5341 peque\xF1o, est\xE1 a la izquierda de los dos.")]
      ]
    },
    {
      id: "ki-sa",
      script: "hiragana",
      chars: [
        ["\u304D", hint("Two short bars cross the top.", "Dos barras cortas cruzan la parte de arriba.")],
        ["\u3055", hint("Only one bar crosses the top.", "Solo una barra cruza la parte de arriba.")]
      ]
    },
    {
      id: "a-o-me",
      script: "hiragana",
      chars: [
        ["\u3042", hint("A bar on top, and the upright stroke cuts through the round part; no dot.", "Una barra arriba, y el trazo vertical atraviesa la parte redonda; sin punto.")],
        ["\u304A", hint("A dot sits at the top right, outside the round part.", "Un punto est\xE1 arriba a la derecha, fuera de la parte redonda.")],
        ["\u3081", hint("No bar on top at all: two strokes, and the round part ends open.", "Ninguna barra arriba: dos trazos, y la parte redonda termina abierta.")]
      ]
    },
    {
      id: "ma-mo",
      script: "hiragana",
      chars: [
        ["\u307E", hint("The upright stroke goes straight down and ends in a loop.", "El trazo vertical baja recto y termina en un lazo.")],
        ["\u3082", hint("The upright stroke bends into a hook that turns up to the right; no loop.", "El trazo vertical se dobla en un gancho que sube a la derecha; sin lazo.")]
      ]
    },
    {
      id: "shi-tsu",
      script: "katakana",
      chars: [
        ["\u30B7", hint("The dots stand one over the other on the left, and the long stroke rises from below.", "Los puntos est\xE1n uno sobre otro a la izquierda, y el trazo largo sube desde abajo.")],
        ["\u30C4", hint("The dots sit side by side on top, and the long stroke falls from above.", "Los puntos est\xE1n lado a lado arriba, y el trazo largo cae desde arriba.")]
      ]
    },
    {
      id: "so-n",
      script: "katakana",
      chars: [
        ["\u30BD", hint("The dot drops from the top, and the long stroke falls from the top right.", "El punto baja desde arriba, y el trazo largo cae desde arriba a la derecha.")],
        ["\u30F3", hint("The dot sits on the left, and the long stroke rises from the bottom.", "El punto est\xE1 a la izquierda, y el trazo largo sube desde abajo.")]
      ]
    },
    {
      id: "ku-ke-ta-wa",
      script: "katakana",
      chars: [
        ["\u30AF", hint("A short stroke and a long hooked one, with nothing inside.", "Un trazo corto y uno largo con gancho, sin nada adentro.")],
        ["\u30B1", hint("The second stroke is a flat bar, and a long stroke falls from its middle.", "El segundo trazo es una barra plana, y de su centro cae un trazo largo.")],
        ["\u30BF", hint("\u30AF with a short stroke inside it.", "Es \u30AF con un trazo corto adentro.")],
        ["\u30EF", hint("A short upright on the left under a flat roof that bends down; no slanted start.", "Un trazo vertical corto a la izquierda bajo un techo plano que se dobla hacia abajo; no empieza inclinado.")]
      ]
    },
    {
      id: "u-wa-fu",
      script: "katakana",
      chars: [
        ["\u30A6", hint("A dot sits on top of the roof.", "Un punto est\xE1 encima del techo.")],
        ["\u30EF", hint("A short upright under the left end of the roof, and no dot.", "Un trazo vertical corto bajo el extremo izquierdo del techo, y sin punto.")],
        ["\u30D5", hint("Only the roof that bends down: nothing on top, nothing on the left.", "Solo el techo que se dobla hacia abajo: nada arriba, nada a la izquierda.")]
      ]
    },
    {
      id: "su-nu",
      script: "katakana",
      chars: [
        ["\u30B9", hint("The short stroke only touches the long one and runs off to the lower right.", "El trazo corto solo toca el largo y sale hacia abajo a la derecha.")],
        ["\u30CC", hint("The short stroke crosses right through the long one, making an X.", "El trazo corto atraviesa el largo y forma una X.")]
      ]
    },
    {
      id: "ko-yu-yo",
      script: "katakana",
      chars: [
        ["\u30B3", hint("Open on the left, with nothing in the middle.", "Abierta a la izquierda, sin nada en el medio.")],
        ["\u30E6", hint("The long bottom bar sticks out past the right side.", "La barra larga de abajo sobresale por la derecha.")],
        ["\u30E8", hint("A third bar sits in the middle.", "Una tercera barra est\xE1 en el medio.")]
      ]
    },
    {
      id: "a-ma",
      script: "katakana",
      chars: [
        ["\u30A2", hint("The second stroke starts inside the bend and sweeps down to the left.", "El segundo trazo empieza dentro del doblez y baja hacia la izquierda.")],
        ["\u30DE", hint("The second stroke is a small tick at the bottom right, under the bend.", "El segundo trazo es una marca peque\xF1a abajo a la derecha, bajo el doblez.")]
      ]
    },
    {
      id: "chi-te",
      script: "katakana",
      chars: [
        ["\u30C1", hint("The top stroke slants down to the left.", "El trazo de arriba baja inclinado hacia la izquierda.")],
        ["\u30C6", hint("The top stroke is a short, level bar.", "El trazo de arriba es una barra corta y horizontal.")]
      ]
    },
    {
      id: "no-me",
      script: "katakana",
      chars: [
        ["\u30CE", hint("One stroke alone, sweeping down to the left.", "Un solo trazo que baja hacia la izquierda.")],
        ["\u30E1", hint("A second stroke crosses the first, making an X.", "Un segundo trazo cruza el primero y forma una X.")]
      ]
    },
    {
      id: "ra-wo-fu",
      script: "katakana",
      chars: [
        ["\u30E9", hint("A short level bar sits above the bend, apart from it.", "Una barra corta y horizontal est\xE1 sobre el doblez, separada.")],
        ["\u30F2", hint("A second bar runs across the middle, inside the bend: three strokes.", "Una segunda barra cruza el medio, dentro del doblez: tres trazos.")],
        ["\u30D5", hint("Only the bend, with nothing above it or across it.", "Solo el doblez, sin nada arriba ni cruz\xE1ndolo.")]
      ]
    }
  ].map((set) => Object.freeze({ ...set, chars: Object.freeze(set.chars.map((c) => Object.freeze(c))) })));

  // js/play-rounds.js
  init_kana();

  // js/play-twins.js
  var t2 = (en, es) => Object.freeze({ en, es });
  var SCRIPTS = Object.freeze(["hiragana", "katakana", "kanji"]);
  var TWINS = Object.freeze([
    {
      id: "he",
      sides: [
        { ch: "\u3078", script: "hiragana", words: [["\u3078\u3073", "\u3078\u3073", t2("snake", "serpiente")], ["\u3078\u305F", "\u3078\u305F", t2("bad at", "torpe, malo para algo")], ["\u3046\u3061\u3078", "\u3046\u3061\u3078", t2("to home (\u3078, the particle, said e)", "a casa (\u3078, la part\xEDcula, se dice e)")]] },
        { ch: "\u30D8", script: "katakana", words: [["\u30D8\u30EB\u30E1\u30C3\u30C8", "\u3078\u308B\u3081\u3063\u3068", t2("helmet", "casco")], ["\u30D8\u30EA\u30B3\u30D7\u30BF\u30FC", "\u3078\u308A\u3053\u3077\u305F\u30FC", t2("helicopter", "helic\xF3ptero")]] }
      ],
      note: t2("\u3078 and \u30D8 look the same in most fonts, \u30D8 a little more angular: the word around them tells you which.", "\u3078 y \u30D8 se ven iguales en casi todas las fuentes, \u30D8 un poco m\xE1s angulosa: la palabra que las rodea dice cu\xE1l es.")
    },
    {
      id: "ka",
      sides: [
        { ch: "\u30AB", script: "katakana", words: [["\u30AB\u30E1\u30E9", "\u304B\u3081\u3089", t2("camera", "c\xE1mara")], ["\u30AB\u30EC\u30FC", "\u304B\u308C\u30FC", t2("curry", "curry")], ["\u30AB\u30FC\u30C9", "\u304B\u30FC\u3069", t2("card", "tarjeta")]] },
        { ch: "\u529B", script: "kanji", words: [["\u529B", "\u3061\u304B\u3089", t2("strength", "fuerza")], ["\u4F53\u529B", "\u305F\u3044\u308A\u3087\u304F", t2("stamina", "resistencia f\xEDsica")], ["\u5354\u529B", "\u304D\u3087\u3046\u308A\u3087\u304F", t2("cooperation", "cooperaci\xF3n")]] }
      ],
      note: t2("\u529B (strength) is a kanji and fills its square; \u30AB sits a little smaller, among other katakana.", "\u529B (fuerza) es un kanji y llena su cuadro; \u30AB es un poco m\xE1s peque\xF1a y va entre otros katakana.")
    },
    {
      id: "e",
      sides: [
        { ch: "\u30A8", script: "katakana", words: [["\u30A8\u30A2\u30B3\u30F3", "\u3048\u3042\u3053\u3093", t2("air conditioner", "aire acondicionado")], ["\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC", "\u3048\u308C\u3079\u30FC\u305F\u30FC", t2("elevator", "ascensor")], ["\u30A8\u30F3\u30B8\u30F3", "\u3048\u3093\u3058\u3093", t2("engine", "motor")]] },
        { ch: "\u5DE5", script: "kanji", words: [["\u5DE5\u5834", "\u3053\u3046\u3058\u3087\u3046", t2("factory", "f\xE1brica")], ["\u5927\u5DE5", "\u3060\u3044\u304F", t2("carpenter", "carpintero")], ["\u5DE5\u4E8B", "\u3053\u3046\u3058", t2("construction work", "obras de construcci\xF3n")]] }
      ],
      note: t2("\u5DE5 (craft) usually stands beside another kanji; \u30A8 beside other katakana.", "\u5DE5 (oficio) suele ir junto a otro kanji; \u30A8, junto a otros katakana.")
    },
    {
      id: "ro",
      sides: [
        { ch: "\u30ED", script: "katakana", words: [["\u30ED\u30DC\u30C3\u30C8", "\u308D\u307C\u3063\u3068", t2("robot", "robot")], ["\u30E1\u30ED\u30F3", "\u3081\u308D\u3093", t2("melon", "mel\xF3n")], ["\u30ED\u30FC\u30DE", "\u308D\u30FC\u307E", t2("Rome", "Roma")]] },
        { ch: "\u53E3", script: "kanji", words: [["\u53E3", "\u304F\u3061", t2("mouth", "boca")], ["\u5165\u53E3", "\u3044\u308A\u3050\u3061", t2("entrance", "entrada")], ["\u51FA\u53E3", "\u3067\u3050\u3061", t2("exit", "salida")]] }
      ],
      note: t2("\u53E3 (mouth) is a kanji and fills its square; \u30ED sits a little smaller, among other katakana.", "\u53E3 (boca) es un kanji y llena su cuadro; \u30ED es un poco m\xE1s peque\xF1a y va entre otros katakana.")
    },
    {
      id: "ni",
      sides: [
        { ch: "\u30CB", script: "katakana", words: [["\u30C6\u30CB\u30B9", "\u3066\u306B\u3059", t2("tennis", "tenis")], ["\u30CB\u30E5\u30FC\u30B9", "\u306B\u3085\u30FC\u3059", t2("news", "noticias")], ["\u30DF\u30CB", "\u307F\u306B", t2("mini", "mini")]] },
        { ch: "\u4E8C", script: "kanji", words: [["\u4E8C", "\u306B", t2("two", "dos")], ["\u4E8C\u6708", "\u306B\u304C\u3064", t2("February", "febrero")], ["\u4E8C\u4EBA", "\u3075\u305F\u308A", t2("two people", "dos personas")]] }
      ],
      note: t2("In \u4E8C (two) the lower bar is clearly longer; in \u30CB the two are nearly even.", "En \u4E8C (dos) la barra de abajo es claramente m\xE1s larga; en \u30CB las dos son casi iguales.")
    },
    {
      id: "ta",
      sides: [
        { ch: "\u30BF", script: "katakana", words: [["\u30BF\u30AF\u30B7\u30FC", "\u305F\u304F\u3057\u30FC", t2("taxi", "taxi")], ["\u30BF\u30AA\u30EB", "\u305F\u304A\u308B", t2("towel", "toalla")], ["\u30D0\u30BF\u30FC", "\u3070\u305F\u30FC", t2("butter", "mantequilla")]] },
        { ch: "\u5915", script: "kanji", words: [["\u5915\u65B9", "\u3086\u3046\u304C\u305F", t2("evening", "atardecer")], ["\u5915\u98DF", "\u3086\u3046\u3057\u3087\u304F", t2("dinner", "cena")], ["\u4E03\u5915", "\u305F\u306A\u3070\u305F", t2("the Star Festival", "el Festival de las Estrellas")]] }
      ],
      note: t2("In \u5915 (evening) the inside stroke is a short dot; in \u30BF it reaches across.", "En \u5915 (atardecer) el trazo de adentro es un punto corto; en \u30BF llega de lado a lado.")
    },
    {
      id: "to",
      sides: [
        { ch: "\u30C8", script: "katakana", words: [["\u30C8\u30DE\u30C8", "\u3068\u307E\u3068", t2("tomato", "tomate")], ["\u30C8\u30A4\u30EC", "\u3068\u3044\u308C", t2("toilet", "ba\xF1o")], ["\u30C6\u30B9\u30C8", "\u3066\u3059\u3068", t2("test", "examen")]] },
        { ch: "\u535C", script: "kanji", words: [["\u535C", "\u307C\u304F", t2("divination", "adivinaci\xF3n")], ["\u535C\u5360", "\u307C\u304F\u305B\u3093", t2("fortune-telling", "adivinaci\xF3n")]] }
      ],
      note: t2("\u535C (divination) is a rare kanji, met far more often as a part of \u5916, \u5360 and \u4E0B; in a katakana word it is \u30C8.", "\u535C (adivinaci\xF3n) es un kanji poco com\xFAn, que se ve mucho m\xE1s como parte de \u5916, \u5360 y \u4E0B; en una palabra en katakana es \u30C8.")
    },
    {
      id: "ha",
      sides: [
        { ch: "\u30CF", script: "katakana", words: [["\u30CF\u30E0", "\u306F\u3080", t2("ham", "jam\xF3n")], ["\u30CF\u30F3\u30AB\u30C1", "\u306F\u3093\u304B\u3061", t2("handkerchief", "pa\xF1uelo")], ["\u30CF\u30F3\u30D0\u30FC\u30AC\u30FC", "\u306F\u3093\u3070\u30FC\u304C\u30FC", t2("hamburger", "hamburguesa")]] },
        { ch: "\u516B", script: "kanji", words: [["\u516B", "\u306F\u3061", t2("eight", "ocho")], ["\u516B\u6708", "\u306F\u3061\u304C\u3064", t2("August", "agosto")], ["\u516B\u767E\u5C4B", "\u3084\u304A\u3084", t2("greengrocer", "verduler\xEDa")]] }
      ],
      note: t2("\u516B (eight) is a kanji and fills its square, its strokes spread wide; \u30CF sits a little smaller.", "\u516B (ocho) es un kanji y llena su cuadro, con los trazos bien abiertos; \u30CF es un poco m\xE1s peque\xF1a.")
    },
    {
      id: "o",
      sides: [
        { ch: "\u30AA", script: "katakana", words: [["\u30AA\u30EC\u30F3\u30B8", "\u304A\u308C\u3093\u3058", t2("orange", "naranja")], ["\u30E9\u30B8\u30AA", "\u3089\u3058\u304A", t2("radio", "radio")], ["\u30AA\u30FC\u30C8\u30D0\u30A4", "\u304A\u30FC\u3068\u3070\u3044", t2("motorcycle", "motocicleta")]] },
        { ch: "\u624D", script: "kanji", words: [["\u5929\u624D", "\u3066\u3093\u3055\u3044", t2("genius", "genio")], ["\u624D\u80FD", "\u3055\u3044\u306E\u3046", t2("talent", "talento")], ["\u4E94\u624D", "\u3054\u3055\u3044", t2("five years old (an informal spelling of \u4E94\u6B73)", "cinco a\xF1os de edad (una forma informal de \u4E94\u6B73)")]] }
      ],
      note: t2("In \u30AA the slanted stroke starts at the crossing; in \u624D (talent) it cuts across the upright.", "En \u30AA el trazo inclinado empieza en el cruce; en \u624D (talento) atraviesa el trazo vertical.")
    },
    {
      id: "ri",
      sides: [
        { ch: "\u308A", script: "hiragana", words: [["\u308A\u3093\u3054", "\u308A\u3093\u3054", t2("apple", "manzana")], ["\u3068\u308A", "\u3068\u308A", t2("bird", "p\xE1jaro")], ["\u3042\u308A\u304C\u3068\u3046", "\u3042\u308A\u304C\u3068\u3046", t2("thank you", "gracias")]] },
        { ch: "\u30EA", script: "katakana", words: [["\u30EA\u30DC\u30F3", "\u308A\u307C\u3093", t2("ribbon", "cinta")], ["\u30AF\u30EA\u30B9\u30DE\u30B9", "\u304F\u308A\u3059\u307E\u3059", t2("Christmas", "Navidad")], ["\u30EA\u30E2\u30B3\u30F3", "\u308A\u3082\u3053\u3093", t2("remote control", "control remoto")]] }
      ],
      note: t2("In \u308A the left stroke turns up toward the right one; the two strokes of \u30EA are straighter.", "En \u308A el trazo izquierdo sube hacia el derecho; los dos trazos de \u30EA son m\xE1s rectos.")
    },
    {
      id: "bar",
      sides: [
        { ch: "\u30FC", script: "katakana", words: [["\u30B3\u30FC\u30D2\u30FC", "\u3053\u30FC\u3072\u30FC", t2("coffee", "caf\xE9")], ["\u30B1\u30FC\u30AD", "\u3051\u30FC\u304D", t2("cake", "pastel")], ["\u30B9\u30FC\u30D1\u30FC", "\u3059\u30FC\u3071\u30FC", t2("supermarket", "supermercado")]] },
        { ch: "\u4E00", script: "kanji", words: [["\u4E00", "\u3044\u3061", t2("one", "uno")], ["\u4E00\u6708", "\u3044\u3061\u304C\u3064", t2("January", "enero")], ["\u4E00\u4EBA", "\u3072\u3068\u308A", t2("one person, alone", "una persona, solo")]] }
      ],
      note: t2("\u30FC is katakana's long-vowel bar: it lengthens the vowel before it. \u4E00 (one) is a kanji.", "\u30FC es la barra de vocal larga del katakana: alarga la vocal anterior. \u4E00 (uno) es un kanji.")
    }
  ].map((pair) => Object.freeze({
    ...pair,
    sides: Object.freeze(pair.sides.map((s) => Object.freeze({ ...s, words: Object.freeze(s.words.map((w) => Object.freeze(w))) })))
  })));

  // js/play-rounds.js
  var ROUND = 10;
  var GRID_STEPS = Object.freeze([[0, 4], [3, 5], [6, 6]]);
  var WEIGHT_TOP = 11;
  function makeRand(seed = 1) {
    let s = Number(seed) >>> 0 || 1;
    return () => {
      s = s + 1831565813 >>> 0;
      let t3 = Math.imul(s ^ s >>> 15, 1 | s);
      t3 = t3 + Math.imul(t3 ^ t3 >>> 7, 61 | t3) ^ t3;
      return ((t3 ^ t3 >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(list2, rand = Math.random) {
    const out = [...list2];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  function weightOf(n2) {
    return 1 + 2 * Math.min(Math.max(0, n2 | 0), (WEIGHT_TOP - 1) / 2);
  }
  function drawWeighted(items, k, weight = () => 1, rand = Math.random) {
    const left = items.map((item) => ({ item, w: Math.max(0, weight(item)) }));
    const out = [];
    while (out.length < k && left.length) {
      const total = left.reduce((n2, x) => n2 + x.w, 0);
      let at = rand() * total;
      let i = 0;
      while (i < left.length - 1 && at >= left[i].w) {
        at -= left[i].w;
        i += 1;
      }
      out.push(left[i].item);
      left.splice(i, 1);
    }
    return out;
  }
  function createRound(game, questions, extra = {}) {
    return { game, questions, at: 0, picks: [], ...extra };
  }
  function current3(r) {
    return r && r.at < r.questions.length ? r.questions[r.at] : null;
  }
  function answeredNow(r) {
    return !!r && r.picks.length > r.at;
  }
  function finished2(r) {
    return !r || r.at >= r.questions.length;
  }
  function next(r) {
    if (answeredNow(r)) r.at += 1;
    return current3(r);
  }

  // js/kana-games.js
  var KANA_GAME_MODES = ["read", "listen", "apart"];
  var scripts = ["hiragana", "katakana"];
  var count = (n2) => Number.isSafeInteger(n2) && n2 >= 0 && n2 <= 1e6 ? n2 : 0;
  var keyOf = (script, mode) => `${script}:${mode}`;
  var emptyStats = () => ({ rounds: 0, best: 0, correct: 0, answered: 0, assisted: 0, misses: {} });
  var WEAK_LIMIT = 8;
  var FAST_MS = 200;
  var SLOW_MS = 3e4;
  var SLOW_FACTOR = 1.4;
  var WEAK_RECENT = 250;
  var ALPHA = 0.35;
  var isAnswerTime = (ms) => Number.isInteger(ms) && ms >= FAST_MS && ms <= SLOW_MS;
  var chartIds = (script) => kanaChart(script).filter((s) => s.id !== "timing").flatMap((s) => s.cells).filter((c) => c.kana).map((c) => c.id);
  var hint2 = (en, es) => Object.freeze({ en, es });
  var extraHints = {
    "\u3046": hint2("A short mark sits above one curved stroke. Keep the top mark separate in your mental picture.", "Una marca corta va sobre un solo trazo curvo. En tu imagen mental, deja la marca de arriba separada."),
    "\u3048": hint2("A short mark sits over a zigzag that sweeps out to the right at the bottom.", "Una marca corta va sobre un zigzag que abajo sale hacia la derecha."),
    "\u304B": hint2("Look for the separate short stroke on the right of the hooked shape.", "Busca el trazo corto y separado a la derecha de la forma con gancho."),
    "\u304F": hint2("One bent stroke opens to the right, like an angle bracket.", "Un solo trazo doblado que se abre a la derecha, como el signo <."),
    "\u3051": hint2("A short bar crosses the tall stroke on the right; a separate stroke stands on the left.", "Una barra corta cruza el trazo alto de la derecha; a la izquierda hay un trazo aparte."),
    "\u3057": hint2("One long stroke bends gently up to the right at the bottom.", "Un solo trazo largo que abajo se curva suavemente hacia arriba, a la derecha."),
    "\u3059": hint2("A long bar crosses a stroke that loops, then trails downward.", "Una barra larga cruza un trazo que forma un lazo y luego baja."),
    "\u305B": hint2("Two upright strokes cross a bar. The lower stroke sweeps right underneath.", "Dos trazos verticales cruzan una barra. El de abajo se extiende hacia la derecha por debajo."),
    "\u305D": hint2("Follow the zigzag at the top into the broad curve underneath.", "Sigue el zigzag de arriba hasta la curva ancha de abajo."),
    "\u3064": hint2("One broad curve opens to the left, with no separate top mark.", "Una sola curva ancha que se abre a la izquierda, sin marca separada arriba."),
    "\u3066": hint2("A flat top turns into a curve below it, like a small open umbrella.", "Una parte de arriba plana que baja en curva, como un paraguas peque\xF1o abierto."),
    "\u3068": hint2("A short slanted stroke sits above a wide curve that opens upward.", "Un trazo corto inclinado va sobre una curva ancha que se abre hacia arriba."),
    "\u306A": hint2("A small cross is on the left; the loop belongs to the lower right.", "A la izquierda hay una cruz peque\xF1a; el lazo est\xE1 abajo a la derecha."),
    "\u306E": hint2("One stroke curls around into an open spiral.", "Un solo trazo que gira en una espiral abierta."),
    "\u3072": hint2("A deep scoop hangs between two short outward ends.", "Una curva honda cuelga entre dos extremos cortos que salen hacia afuera."),
    "\u3075": hint2("A central curve has small strokes around it. Remember the whole cluster.", "Una curva central con trazos peque\xF1os alrededor. Recuerda el grupo completo."),
    "\u3078": hint2("A shallow roof rises on the left and slopes down to the right.", "Un tejado bajo que sube por la izquierda y baja hacia la derecha."),
    "\u3080": hint2("A bar and a loop are on the left, with a small separate mark on the right.", "A la izquierda hay una barra y un lazo, con una marca peque\xF1a y separada a la derecha."),
    "\u3084": hint2("A long curved stroke crosses the slanted stem, with a small mark above.", "Un trazo largo y curvo cruza el tallo inclinado, con una marca peque\xF1a arriba."),
    "\u3086": hint2("A wide loop is crossed by a long stroke through its middle.", "Un lazo ancho atravesado por un trazo largo en el medio."),
    "\u3088": hint2("A short right-facing bar sits above the loop at the bottom.", "Una barra corta hacia la derecha va sobre el lazo de abajo."),
    "\u3089": hint2("A separate mark sits above a curve with a short slanted start.", "Una marca separada va sobre una curva que empieza con un trazo corto inclinado."),
    "\u3092": hint2("Follow the upper cross down into the broad curve underneath.", "Sigue la cruz de arriba hasta la curva ancha de abajo."),
    "\u3093": hint2("A sloping stroke turns into a low wave that rises at the right.", "Un trazo inclinado se convierte en una onda baja que sube a la derecha."),
    "\u30A4": hint2("A short diagonal meets a longer upright below it.", "Una diagonal corta se une a un trazo vertical m\xE1s largo debajo."),
    "\u30A8": hint2("Two level bars are joined by one upright in the middle.", "Dos barras horizontales unidas por un trazo vertical en el medio."),
    "\u30AA": hint2("A bar crosses an upright; a diagonal reaches down to the left.", "Una barra cruza un trazo vertical; una diagonal baja hacia la izquierda."),
    "\u30AB": hint2("A bent stroke makes the right side; a long diagonal cuts down to the left.", "Un trazo doblado forma el lado derecho; una diagonal larga baja hacia la izquierda."),
    "\u30AD": hint2("Two bars cross one slanted upright.", "Dos barras cruzan un trazo vertical inclinado."),
    "\u30B5": hint2("A bar crosses two uprights, with the right one extending downward.", "Una barra cruza dos trazos verticales, y el de la derecha se alarga hacia abajo."),
    "\u30BB": hint2("A slanted bar meets an upright that bends right along the bottom.", "Una barra inclinada se une a un trazo vertical que abajo se dobla hacia la derecha."),
    "\u30C8": hint2("A long upright has one short diagonal branch on its right.", "Un trazo vertical largo con una rama diagonal corta a la derecha."),
    "\u30CA": hint2("One bar crosses a stroke that falls to the lower left.", "Una barra cruza un trazo que cae hacia abajo a la izquierda."),
    "\u30CB": hint2("Two separate level bars; the lower one is longer.", "Dos barras horizontales separadas; la de abajo es m\xE1s larga."),
    "\u30CD": hint2("A short mark is above the crossing strokes; a small branch reaches right.", "Una marca corta va sobre los trazos que se cruzan; una rama peque\xF1a sale a la derecha."),
    "\u30CF": hint2("Two separate strokes spread outward toward the bottom.", "Dos trazos separados que se abren hacia abajo."),
    "\u30D2": hint2("A short top bar meets an upright that bends right along the bottom.", "Una barra corta arriba se une a un trazo vertical que abajo se dobla hacia la derecha."),
    "\u30D8": hint2("One shallow angled roof, rising left and falling right.", "Un solo tejado bajo en \xE1ngulo, que sube por la izquierda y baja por la derecha."),
    "\u30DB": hint2("A bar and an upright form a cross, with short strokes on both lower sides.", "Una barra y un trazo vertical forman una cruz, con trazos cortos abajo a cada lado."),
    "\u30DF": hint2("Three separate slanted bars, one below another.", "Tres barras inclinadas y separadas, una debajo de otra."),
    "\u30E0": hint2("A diagonal turns into a flat base; a short stroke closes the lower right.", "Una diagonal se convierte en una base plana; un trazo corto cierra abajo a la derecha."),
    "\u30E2": hint2("Two bars cross an upright that hooks to the right at the bottom.", "Dos barras cruzan un trazo vertical que abajo se curva hacia la derecha."),
    "\u30E4": hint2("A slanted bar bends at the right; a longer stroke cuts through it.", "Una barra inclinada se dobla a la derecha; un trazo m\xE1s largo la atraviesa."),
    "\u30EA": hint2("Two near-upright strokes; the right one reaches farther down.", "Dos trazos casi verticales; el de la derecha baja m\xE1s."),
    "\u30EB": hint2("A short left stroke sits beside a longer stroke that turns up to the right.", "Un trazo corto a la izquierda junto a otro m\xE1s largo que sube hacia la derecha."),
    "\u30EC": hint2("One upright bends up to the right at the bottom.", "Un solo trazo vertical que abajo se dobla hacia arriba, a la derecha."),
    "\u30ED": hint2("Four sides enclose an empty square.", "Cuatro lados encierran un cuadrado vac\xEDo.")
  };
  function hintFor(cell, script) {
    const set = KANA_SETS.find((s) => s.script === script && s.chars.some(([ch]) => ch === cell.kana));
    const found = set?.chars.find(([ch]) => ch === cell.kana)?.[1];
    if (found) return t(found);
    if (extraHints[cell.kana]) return t(extraHints[cell.kana]);
    const letters2 = [...cell.kana], sound = kanaRomaji(cell.spoken);
    if (letters2.length > 1) {
      const small = letters2.slice(1).join("");
      return t({
        en: `${letters2[0]} + small ${small} makes ${cell.kana}, ${sound}. Say the combination as one beat.`,
        es: `${letters2[0]} + ${small} peque\xF1a forman ${cell.kana}, ${sound}. Di la combinaci\xF3n en un solo tiempo.`
      });
    }
    const decomposed = cell.kana.normalize("NFD");
    if (decomposed.includes("\u3099")) {
      return t({
        en: `${decomposed[0]} gains two dots: ${cell.kana}, ${sound}. The dots change the sound, not the base shape.`,
        es: `${decomposed[0]} lleva dos puntos: ${cell.kana}, ${sound}. Los puntos cambian el sonido, no la forma de base.`
      });
    }
    if (decomposed.includes("\u309A")) {
      return t({
        en: `${decomposed[0]} gains a small circle: ${cell.kana}, ${sound}. The circle makes a p sound.`,
        es: `${decomposed[0]} lleva un circulito: ${cell.kana}, ${sound}. El c\xEDrculo da un sonido p.`
      });
    }
    return t({
      en: `Trace the shape of ${cell.kana} with your eyes, then listen and say ${sound}.`,
      es: `Recorre con la vista la forma de ${cell.kana}, luego escucha y di ${sound}.`
    });
  }
  function gameKana(script = "hiragana", selected = []) {
    const allowed = new Set(Array.isArray(selected) ? selected : []);
    return kanaChart(script).filter((s) => s.id !== "timing").flatMap((s) => s.cells).filter((c) => c.kana && allowed.has(c.id)).map((c) => ({ ...c, sound: kanaRomaji(c.spoken), hint: hintFor(c, script) + (c.id === "\u3092" ? t({ en: " Usually pronounced o; some charts label it wo.", es: " Suele pronunciarse o; algunas tablas la escriben wo." }) : "") }));
  }
  function neighbours(cell, pool, script) {
    const shapes = new Set(KANA_SETS.filter((s) => s.script === script && s.chars.some(([ch]) => ch === cell.kana)).flatMap((s) => s.chars.map(([ch]) => ch)));
    return pool.filter((other) => other.sound !== cell.sound && shapes.has(other.kana));
  }
  function kanaGameSetup({ script = "hiragana", mode = "read", selected = [] } = {}) {
    const pool = gameKana(script, selected);
    const candidates2 = mode === "apart" ? pool.filter((c) => neighbours(c, pool, script).length) : pool;
    const useful = new Set(candidates2.map((c) => c.sound)).size;
    return {
      count: candidates2.length,
      ready: scripts.includes(script) && KANA_GAME_MODES.includes(mode) && useful >= 2,
      message: mode === "apart" ? t({ en: "Choose both members of a similar pair, such as \u306C / \u3081 or \u30B7 / \u30C4. Only selected kana appear.", es: "Elige los dos miembros de un par parecido, como \u306C / \u3081 o \u30B7 / \u30C4. Solo aparecen los kana elegidos." }) : t({ en: "Choose at least two kana with different sounds. Small tsu and the long-vowel bar need a word, so they stay in reading practice.", es: "Elige al menos dos kana con sonidos distintos. La tsu peque\xF1a y la barra de vocal larga necesitan una palabra, as\xED que se quedan en la pr\xE1ctica de lectura." })
    };
  }
  function question(cell, pool, mode, script, rand) {
    const others = mode === "apart" ? neighbours(cell, pool, script) : pool.filter((c) => c.id !== cell.id);
    const options = [cell];
    for (const c of shuffle(others, rand)) {
      if (options.length === 4) break;
      if (options.every((o) => o.sound !== c.sound)) options.push(c);
    }
    return { target: cell.id, options: shuffle(options.map((c) => c.id), rand) };
  }
  var KanaGames = class {
    constructor(document2) {
      this.stats = {};
      this.kana = {};
      this.round = null;
      this.recovered = false;
      if (document2 == null) return;
      if (document2.v !== 1 || typeof document2.stats !== "object" || !document2.stats) {
        this.recovered = true;
        return;
      }
      if (document2.kana != null) this.readKana(document2.kana);
      for (const script of scripts) for (const mode of KANA_GAME_MODES) {
        const key = keyOf(script, mode), value = document2.stats[key];
        if (value == null) continue;
        if (typeof value !== "object" || Array.isArray(value)) {
          this.recovered = true;
          continue;
        }
        const validIds = new Set(kanaChart(script).flatMap((s) => s.cells).filter((c) => c.kana).map((c) => c.id));
        const misses = {};
        if (typeof value.misses !== "object" || !value.misses || Array.isArray(value.misses)) this.recovered = true;
        for (const [id, n2] of Object.entries(value.misses || {})) {
          if (!validIds.has(id) || n2 !== count(n2)) this.recovered = true;
          if (validIds.has(id) && count(n2)) misses[id] = count(n2);
        }
        const answered = count(value.answered), correct = Math.min(answered, count(value.correct));
        const normalized = { rounds: count(value.rounds), best: Math.min(ROUND, count(value.best)), correct, answered, assisted: Math.min(answered - correct, count(value.assisted)), misses };
        if (["rounds", "best", "correct", "answered", "assisted"].some((k) => value[k] !== normalized[k])) this.recovered = true;
        this.stats[key] = normalized;
      }
      if (document2.round != null) {
        if (this.validRound(document2.round)) this.round = structuredRound(document2.round);
        else this.recovered = true;
      }
    }
    /** Per-kana records, read field by field: a damaged one is dropped and flagged. */
    readKana(value) {
      if (typeof value !== "object" || Array.isArray(value)) {
        this.recovered = true;
        return;
      }
      const valid = new Set(scripts.flatMap((script) => chartIds(script).map((id) => `${script}:${id}`)));
      for (const [key, rec] of Object.entries(value)) {
        const ok = valid.has(key) && rec && typeof rec === "object" && !Array.isArray(rec) && rec.seen === count(rec.seen) && rec.missed === count(rec.missed) && rec.missed <= rec.seen && rec.recent === count(rec.recent) && rec.recent <= 1e3 && (rec.missed > 0 || rec.recent === 0) && rec.timed === count(rec.timed) && rec.timed <= rec.seen && (rec.ms === null ? rec.timed === 0 : isAnswerTime(rec.ms) && rec.timed > 0);
        if (!ok) {
          this.recovered = true;
          continue;
        }
        this.kana[key] = { seen: rec.seen, missed: rec.missed, recent: rec.recent, ms: rec.ms, timed: rec.timed };
      }
    }
    validRound(r) {
      if (!r || !scripts.includes(r.script) || !KANA_GAME_MODES.includes(r.mode) || !kanaGameSetup(r).ready || typeof r.id !== "string" || r.id.length > 80 || !Number.isInteger(r.at) || r.at < 0 || r.at > ROUND || !Array.isArray(r.questions) || r.questions.length !== ROUND || !Array.isArray(r.picks)) return false;
      if (r.picks.length < r.at || r.picks.length > Math.min(ROUND, r.at + 1) || typeof r.hinted !== "boolean") return false;
      const pool = gameKana(r.script, r.selected), byId = new Map(pool.map((c) => [c.id, c]));
      if (r.focus !== void 0 && (!Array.isArray(r.focus) || !r.focus.length || new Set(r.focus).size !== r.focus.length || r.focus.some((id) => !byId.has(id)))) return false;
      return r.questions.every((q, i) => {
        const target = byId.get(q.target);
        if (!target || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4 || !q.options.includes(q.target)) return false;
        if (r.focus && !r.focus.includes(q.target)) return false;
        const options = q.options.map((id) => byId.get(id));
        if (options.some((c) => !c) || new Set(options.map((c) => c.sound)).size !== options.length) return false;
        if (r.mode === "apart" && options.some((c) => c.id !== target.id && !neighbours(target, pool, r.script).some((n2) => n2.id === c.id))) return false;
        const pick2 = r.picks[i];
        return i >= r.picks.length || pick2 && typeof pick2.hint === "boolean" && (pick2.id === null || q.options.includes(pick2.id)) && (pick2.ms === void 0 || isAnswerTime(pick2.ms) && pick2.id === q.target && !pick2.hint && r.mode !== "listen");
      });
    }
    /**
     * A round of ten. `focus`, when given, is a drill: only those kana are asked
     * (the learner's weak kana), while the wrong answers still come from the
     * whole `selected` pool, so a drill of three kana keeps four real choices.
     */
    start({ script = "hiragana", mode = "read", selected = [], focus = null, seed = Date.now() } = {}) {
      if (this.round && this.round.at < ROUND) throw new Error(t({ en: "Finish or leave the current round first.", es: "Termina o deja primero la ronda actual." }));
      if (!kanaGameSetup({ script, mode, selected }).ready) throw new Error(t({ en: "Choose at least two useful kana.", es: "Elige al menos dos kana \xFAtiles." }));
      const pool = gameKana(script, selected), rand = makeRand(seed);
      let candidates2 = mode === "apart" ? pool.filter((c) => neighbours(c, pool, script).length) : pool;
      if (focus != null) {
        const wanted = new Set(Array.isArray(focus) ? focus : []);
        if (!wanted.size || [...wanted].some((id) => !pool.some((c) => c.id === id))) throw new Error(t({ en: "A drill asks only kana from the selection.", es: "Una pr\xE1ctica dirigida pregunta solo kana de tu selecci\xF3n." }));
        candidates2 = candidates2.filter((c) => wanted.has(c.id));
        if (new Set(candidates2.map((c) => c.sound)).size < 2) throw new Error(t({ en: "A drill needs at least two kana with different sounds.", es: "Una pr\xE1ctica dirigida necesita al menos dos kana con sonidos distintos." }));
      }
      const stats = this.stats[keyOf(script, mode)] || emptyStats();
      const questions = [];
      let remaining = [];
      for (let n2 = 0; n2 < ROUND; n2++) {
        if (!remaining.length) remaining = [...candidates2];
        const last = questions.at(-1)?.target;
        const eligible2 = remaining.filter((c) => c.id !== last);
        const cell = drawWeighted(eligible2.length ? eligible2 : remaining, 1, (c) => weightOf(stats.misses[c.id] || 0), rand)[0];
        remaining = remaining.filter((c) => c.id !== cell.id);
        questions.push(question(cell, pool, mode, script, rand));
      }
      this.round = { id: `${script}:${mode}:${Number(seed) >>> 0}`, script, mode, selected: pool.map((c) => c.id), questions, at: 0, picks: [], hinted: false };
      if (focus != null) this.round.focus = candidates2.map((c) => c.id);
      return this.view();
    }
    /**
     * The learner's weak kana in `script`, weakest first: those missed lately
     * (by the recent miss rate) and those answered slowly (by how far past the
     * learner's own median). `ready` says whether they make a drill: at least
     * two kana with different sounds.
     */
    weakKana({ script = "hiragana", limit = WEAK_LIMIT } = {}) {
      if (!scripts.includes(script)) return { script, median: null, kana: [], ready: false };
      const cells = new Map(gameKana(script, chartIds(script)).map((c, i) => [c.id, { ...c, order: i }]));
      const records = Object.entries(this.kana).filter(([key]) => key.startsWith(`${script}:`)).map(([key, rec]) => ({ id: key.slice(script.length + 1), ...rec })).filter((rec) => cells.has(rec.id) && rec.seen > 0);
      const times = records.filter((rec) => rec.ms !== null).map((rec) => rec.ms).sort((a, b) => a - b);
      const median = times.length >= 4 ? times[Math.floor(times.length / 2)] : null;
      const kana = records.map((rec) => {
        const slow = median !== null && rec.timed >= 2 && rec.ms >= median * SLOW_FACTOR;
        const missing = rec.recent >= WEAK_RECENT;
        return { ...rec, slow, missing, score: (missing ? rec.recent / 1e3 : 0) + (slow ? Math.min(1.5, rec.ms / median - 1) : 0) };
      }).filter((rec) => rec.missing || rec.slow).sort((a, b) => b.score - a.score || b.missed - a.missed || cells.get(a.id).order - cells.get(b.id).order).slice(0, Math.max(1, Math.min(WEAK_LIMIT, limit | 0))).map((rec) => {
        const cell = cells.get(rec.id);
        return { id: rec.id, kana: cell.kana, sound: cell.sound, seen: rec.seen, missed: rec.missed, ms: rec.ms, missing: rec.missing, slow: rec.slow };
      });
      return { script, median, kana, ready: new Set(kana.map((k) => k.sound)).size >= 2 };
    }
    act(action, { id, pick: pick2, ms } = {}) {
      const r = this.round;
      if (!r) return this.view();
      if (action === "leave") {
        this.round = null;
        return this.view();
      }
      if (r.at >= ROUND || id !== `${r.id}:${r.at}`) return this.view();
      const q = r.questions[r.at];
      const answered = r.picks.length > r.at;
      if (action === "hint" && !answered) r.hinted = true;
      if ((action === "answer" || action === "skip") && !answered) {
        if (action === "answer" && !q.options.includes(pick2)) return this.view();
        const entry = { id: action === "skip" ? null : pick2, hint: r.hinted };
        if (action === "answer" && pick2 === q.target && !r.hinted && r.mode !== "listen" && isAnswerTime(ms)) entry.ms = ms;
        r.picks.push(entry);
        if (pick2 !== q.target && r.at + 3 < ROUND) {
          const later = r.at + 3;
          r.questions[later] = { target: q.target, options: [...q.options] };
        }
      }
      if (action === "next" && answered) {
        r.at += 1;
        r.hinted = false;
        if (r.at === ROUND) this.record();
      }
      return this.view();
    }
    record() {
      const r = this.round, key = keyOf(r.script, r.mode), s = this.stats[key] || emptyStats();
      const result = this.result();
      s.rounds = Math.min(1e6, s.rounds + 1);
      if (!r.focus) s.best = Math.max(s.best, result.correct);
      s.correct = Math.min(1e6, s.correct + result.correct);
      s.answered = Math.min(1e6, s.answered + ROUND);
      s.assisted = Math.min(1e6, s.assisted + result.assisted);
      r.picks.forEach((p, i) => {
        const id = r.questions[i].target;
        const missed = p.id !== id || p.hint;
        if (missed) s.misses[id] = Math.min(1e6, (s.misses[id] || 0) + 1);
        const k = this.kana[`${r.script}:${id}`] || { seen: 0, missed: 0, recent: 0, ms: null, timed: 0 };
        k.seen = Math.min(1e6, k.seen + 1);
        if (missed) k.missed = Math.min(k.seen, k.missed + 1);
        k.recent = Math.round(k.recent + ALPHA * ((missed ? 1e3 : 0) - k.recent));
        if (p.ms !== void 0) {
          k.ms = k.ms === null ? p.ms : Math.round(k.ms + ALPHA * (p.ms - k.ms));
          k.timed = Math.min(k.seen, k.timed + 1);
        }
        this.kana[`${r.script}:${id}`] = k;
      });
      this.stats[key] = s;
    }
    result() {
      const r = this.round;
      return {
        correct: r.picks.filter((p, i) => p.id === r.questions[i].target && !p.hint).length,
        assisted: r.picks.filter((p) => p.hint).length,
        skipped: r.picks.filter((p) => p.id === null).length,
        total: ROUND
      };
    }
    view() {
      const base = { recovered: this.recovered, stats: this.stats, status: "idle", round: null };
      const r = this.round;
      if (!r) return base;
      const details = { script: r.script, mode: r.mode, drill: Boolean(r.focus), position: Math.min(r.at + 1, ROUND), total: ROUND, result: this.result(), question: null };
      if (r.at === ROUND) return { ...base, status: "complete", round: details };
      const pool = gameKana(r.script, r.selected), byId = new Map(pool.map((c) => [c.id, c]));
      const q = r.questions[r.at], target = byId.get(q.target), pick2 = r.picks[r.at];
      const revealed = Boolean(pick2);
      details.question = {
        id: `${r.id}:${r.at}`,
        prompt: r.mode === "read" ? target.kana : r.mode === "apart" ? target.sound : null,
        spoken: target.spoken,
        answered: revealed,
        hinted: r.hinted,
        hint: r.hinted && !revealed ? target.hint : null,
        correctId: revealed ? target.id : null,
        pickedId: pick2?.id ?? null,
        right: revealed ? pick2.id === target.id : null,
        options: q.options.map((id) => {
          const c = byId.get(id);
          return { id, label: r.mode === "read" ? c.sound : c.kana, kana: revealed ? c.kana : null, romaji: revealed ? c.sound : null, hint: revealed ? c.hint : null };
        })
      };
      return { ...base, status: "playing", round: details };
    }
    dump() {
      return { v: 1, stats: this.stats, kana: this.kana, round: this.round };
    }
  };
  var structuredRound = (r) => JSON.parse(JSON.stringify(r));

  // js/story-cafe.js
  function cafeScene(library2) {
    const dialogue = (id, index) => {
      const d = library2.dialogues.find((item) => item.id === id);
      if (!d?.lines[index]) throw new Error(`Missing story source: ${id}/${index}`);
      return { ...d.lines[index], meaning: { en: d.translation.en[index], es: d.translation.es?.[index] }, recording: `dialogue:${id}:${index}` };
    };
    const phrase = (id) => {
      const p = library2.phrases.find((item) => item.id === id);
      if (!p) throw new Error(`Missing story source: ${id}`);
      return { ja: p.ja, kana: p.kana, meaning: { en: p.en, es: p.es }, recording: `phrase:${id}` };
    };
    const line2 = (id, speaker, source, grammar, next2, extra = {}) => ({ id, kind: "line", ...source, speaker, grammar, next: next2, ...extra });
    const request = {
      en: "\u3092 marks what you request. \u4E00\u3064 is \u201Cone\u201D; \u304A\u9858\u3044\u3057\u307E\u3059 makes the request polite.",
      es: "\u3092 marca lo que pides. \u4E00\u3064 es \u201Cuno\u201D; \u304A\u9858\u3044\u3057\u307E\u3059 vuelve cort\xE9s el pedido."
    };
    const nodes = [
      line2("welcome", "aya", dialogue("at-a-cafe", 0), {
        en: "\u3054\u6CE8\u6587 is a polite way to say \u201Cyour order.\u201D \u304A\u6C7A\u307E\u308A\u3067\u3059\u304B asks whether the choice has been made.",
        es: "\u3054\u6CE8\u6587 es una forma cort\xE9s de decir \u201Csu pedido\u201D. \u304A\u6C7A\u307E\u308A\u3067\u3059\u304B pregunta si ya se decidi\xF3 qu\xE9 pedir."
      }, "drink"),
      { id: "drink", kind: "choice", prompt: { en: "What would Ren like to order?", es: "\xBFQu\xE9 quiere pedir Ren?" }, options: [
        { id: "coffee", next: "coffee", label: { en: "A coffee", es: "Un caf\xE9" }, effect: ["drink", "coffee"] },
        { id: "latte", next: "latte", label: { en: "A latte", es: "Un caf\xE9 latte" }, effect: ["drink", "latte"] }
      ] },
      line2("coffee", "ren", phrase("koohii-hitotsu"), request, "size"),
      line2("latte", "ren", dialogue("at-a-cafe", 1), request, "size"),
      line2("size", "aya", dialogue("at-a-cafe", 2), {
        en: "\u3044\u304B\u304C is a polite \u201Chow.\u201D \u306A\u3055\u3044\u307E\u3059 is a respectful form of \u3057\u307E\u3059 used by staff when asking about a customer\u2019s choice.",
        es: "\u3044\u304B\u304C es un \u201Cc\xF3mo\u201D cort\xE9s. \u306A\u3055\u3044\u307E\u3059 es una forma respetuosa de \u3057\u307E\u3059 que usa el personal al preguntar por la elecci\xF3n del cliente."
      }, "small"),
      line2("small", "ren", dialogue("at-a-cafe", 3), {
        en: "\u5C0F\u3055\u3044\u306E means \u201Ca small one.\u201D Here \u306E stands in for the drink size; \u3067 introduces the option you choose.",
        es: "\u5C0F\u3055\u3044\u306E significa \u201Cuno peque\xF1o\u201D. Aqu\xED \u306E ocupa el lugar del tama\xF1o de la bebida; \u3067 presenta la opci\xF3n que eliges."
      }, "where"),
      line2("where", "aya", dialogue("at-a-cafe", 4), {
        en: "\u5E97\u5185\u3067 means \u201Cinside the shop.\u201D \u304A\u53EC\u3057\u4E0A\u304C\u308A is respectful language for eating or drinking.",
        es: "\u5E97\u5185\u3067 significa \u201Cdentro del local\u201D. \u304A\u53EC\u3057\u4E0A\u304C\u308A es lenguaje respetuoso para comer o beber."
      }, "visit"),
      { id: "visit", kind: "choice", prompt: {
        en: "A window seat is free. Does Ren have time to stay?",
        es: "Hay un asiento libre junto a la ventana. \xBFTiene Ren tiempo para quedarse?"
      }, options: [
        { id: "here", next: "here", label: { en: "Stay for a quiet break", es: "Quedarse a descansar un rato" }, effect: ["visit", "here"] },
        { id: "away", next: "away", label: { en: "Take the drink to the train", es: "Llevarse la bebida al tren" }, effect: ["visit", "away"] }
      ] },
      line2("here", "ren", dialogue("convenience-store", 1), {
        en: "\u306F\u3044 accepts the offer. \u304A\u9858\u3044\u3057\u307E\u3059 adds a polite \u201Cplease\u201D; the caf\xE9 context supplies what you are asking for.",
        es: "\u306F\u3044 acepta la oferta. \u304A\u9858\u3044\u3057\u307E\u3059 agrega un \u201Cpor favor\u201D cort\xE9s; el contexto del caf\xE9 deja claro qu\xE9 est\xE1s pidiendo."
      }, "price", { meaning: { en: "Yes, here, please.", es: "S\xED, aqu\xED, por favor." } }),
      line2("away", "ren", dialogue("at-a-cafe", 5), {
        en: "\u6301\u3061\u5E30\u308A means \u201Ctaking away.\u201D The request after \u3067 is left understood: a short, natural way to order.",
        es: "\u6301\u3061\u5E30\u308A significa \u201Cpara llevar\u201D. Lo que se pide despu\xE9s de \u3067 queda sobrentendido: una forma corta y natural de pedir."
      }, "price"),
      line2("price", "aya", dialogue("at-a-cafe", 6), {
        en: "\u4E94\u767E\u5186 is \u3054\u3072\u3083\u304F\u3048\u3093, five hundred yen. \u3067\u3059 politely states the price.",
        es: "\u4E94\u767E\u5186 es \u3054\u3072\u3083\u304F\u3048\u3093, quinientos yenes. \u3067\u3059 dice el precio con cortes\xEDa."
      }, "payment"),
      line2("payment", "ren", dialogue("at-a-cafe", 7), {
        en: "\u3067 marks the means of payment: by card. The same polite request pattern works for other choices.",
        es: "\u3067 marca el medio de pago: con tarjeta. El mismo patr\xF3n de pedido cort\xE9s sirve para otras opciones."
      }, "thanks"),
      line2("thanks", "aya", dialogue("train-ticket", 6), {
        en: "\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059 thanks someone politely for what they are doing now.",
        es: "\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059 agradece con cortes\xEDa lo que alguien est\xE1 haciendo en este momento."
      }, "closing"),
      line2("enjoy", "ren", phrase("itadakimasu"), {
        en: "\u3044\u305F\u3060\u304D\u307E\u3059 is a set expression before eating or drinking. Here Ren says it before the first sip.",
        es: "\u3044\u305F\u3060\u304D\u307E\u3059 es una expresi\xF3n fija antes de comer o beber. Aqu\xED Ren la dice antes del primer sorbo."
      }, "table", { meaning: { en: "Thank you for the drink. (Said before the first sip.)", es: "Gracias por la bebida. (Se dice antes del primer sorbo.)" } }),
      line2("goodbye", "ren", phrase("arigatou-gozaimasu"), {
        en: "A simple thank-you is a natural way to finish a short exchange at the counter.",
        es: "Un simple \u201Cgracias\u201D es una forma natural de terminar un intercambio breve en el mostrador."
      }, "train", { meaning: { en: "Thank you.", es: "Gracias." } }),
      { id: "table", kind: "ending", title: { en: "A quiet table", es: "Una mesa tranquila" }, text: {
        en: "Aya points to the window seat. Ren settles in with a warm drink and a few unhurried minutes. A small conversation has made a new place feel familiar.",
        es: "Aya se\xF1ala el asiento junto a la ventana. Ren se acomoda con una bebida caliente y unos minutos sin prisa. Una peque\xF1a conversaci\xF3n hizo que un lugar nuevo se sintiera familiar."
      } },
      { id: "train", kind: "ending", title: { en: "A warm cup for the journey", es: "Una taza caliente para el viaje" }, text: {
        en: "Aya hands over the cup. Ren leaves with time to catch the train, carrying a warm drink and one more conversation to remember.",
        es: "Aya le entrega la taza. Ren sale con tiempo para alcanzar el tren, con una bebida caliente y una conversaci\xF3n m\xE1s para recordar."
      } }
    ];
    return {
      id: "corner-cafe",
      version: 1,
      start: "welcome",
      title: { en: "The corner caf\xE9", es: "El caf\xE9 de la esquina" },
      subtitle: { en: "Polite requests \xB7 10 spoken turns \xB7 2 choices", es: "Peticiones corteses \xB7 10 turnos hablados \xB7 2 decisiones" },
      introduction: {
        en: "Ren stops at a small caf\xE9 before catching a train. Aya is behind the counter, and a seat by the window is free. Choose a drink, then decide whether to stay. Both small drinks cost five hundred yen in this scene.",
        es: "Ren pasa por un peque\xF1o caf\xE9 antes de tomar un tren. Aya atiende detr\xE1s del mostrador, y hay un asiento libre junto a la ventana. Elige una bebida y luego decide si Ren se queda. En esta escena, las dos bebidas peque\xF1as cuestan quinientos yenes."
      },
      roles: [
        { id: "ren", name: "Ren", description: { en: "Visitor \xB7 practise short requests", es: "Visitante \xB7 practica peticiones cortas" }, adult: true, voice: "male" },
        { id: "aya", name: "Aya", description: { en: "Barista \xB7 practise polite service phrases", es: "Barista \xB7 practica frases corteses para atender" }, adult: true, voice: "clear" }
      ],
      nodes: Object.fromEntries(nodes.map((n2) => [n2.id, n2]))
    };
  }
  function nextStoryNode(scene, node, choices) {
    const next2 = node.next === "closing" ? choices.visit === "here" ? "enjoy" : "goodbye" : node.next;
    return scene.nodes[next2];
  }

  // js/story-practice.js
  var say = (v) => v == null ? v : t(v);
  var StoryPractice = class {
    constructor(scene, document2) {
      this.scene = scene;
      this.role = scene.roles[0].id;
      this.path = [];
      this.started = false;
      this.endings = [];
      this.recovered = false;
      if (document2 == null) return;
      if (document2.v !== 1 || document2.scene !== scene.id || document2.sceneVersion !== scene.version || !Array.isArray(document2.path) || !Array.isArray(document2.endings) || typeof document2.started !== "boolean") {
        this.recovered = true;
        return;
      }
      this.role = scene.roles.some((r) => r.id === document2.role) ? document2.role : this.role;
      if (this.role !== document2.role) this.recovered = true;
      this.started = document2.started;
      this.endings = [...new Set(document2.endings.filter((id) => scene.nodes[id]?.kind === "ending"))];
      for (const record of document2.path.slice(0, 32)) {
        const { node } = this.walk();
        const valid = record && record.id === node?.id && (node.kind === "line" && ["tried", "skipped"].includes(record.status) || node.kind === "choice" && node.options.some((o) => o.id === record.choice));
        if (!valid || !this.started) {
          this.recovered = true;
          break;
        }
        this.path.push(node.kind === "line" ? { id: node.id, status: record.status } : { id: node.id, choice: record.choice });
      }
      if (document2.path.length > 32) this.recovered = true;
      this.rememberEnding();
    }
    walk() {
      let node = this.scene.nodes[this.scene.start];
      const choices = {};
      for (const record of this.path) {
        if (node.kind === "choice") {
          const option = node.options.find((o) => o.id === record.choice);
          choices[option.effect[0]] = option.effect[1];
          node = this.scene.nodes[option.next];
        } else node = nextStoryNode(this.scene, node, choices);
      }
      return { node, choices };
    }
    start(role = this.role, restart = false) {
      if (this.started && this.walk().node.kind !== "ending" && !restart) {
        throw new Error(t({ en: "Resume or restart the current scene.", es: "Retoma la escena actual o empi\xE9zala de nuevo." }));
      }
      if (!this.scene.roles.some((r) => r.id === role)) throw new Error(t({ en: "Choose one of the scene roles.", es: "Elige uno de los papeles de la escena." }));
      this.role = role;
      this.path = [];
      this.started = true;
      return this.view();
    }
    act(action, { id, choice, role, status = "skipped" } = {}) {
      if (action === "role" && this.scene.roles.some((r) => r.id === role)) this.role = role;
      if (!this.started) return this.view();
      const { node } = this.walk();
      if (id !== node.id) return this.view();
      if (action === "continue" && node.kind === "line" && ["tried", "skipped"].includes(status)) this.path.push({ id, status });
      if (action === "choose" && node.kind === "choice" && node.options.some((o) => o.id === choice)) this.path.push({ id, choice });
      this.rememberEnding();
      return this.view();
    }
    rememberEnding() {
      const { node } = this.walk();
      if (this.started && node.kind === "ending" && !this.endings.includes(node.id)) this.endings.push(node.id);
    }
    line(node) {
      return { id: node.id, speaker: node.speaker, ja: node.ja, kana: node.kana, meaning: say(node.meaning), grammar: say(node.grammar), recording: node.recording };
    }
    view() {
      const { node, choices } = this.walk();
      const lines = this.path.filter((r) => this.scene.nodes[r.id].kind === "line");
      const current4 = !this.started ? null : node.kind === "line" ? { kind: "line", id: node.id, line: this.line(node) } : node.kind === "choice" ? {
        kind: "choice",
        id: node.id,
        prompt: say(node.prompt),
        options: node.options.map((o) => ({ id: o.id, label: say(o.label), ja: this.scene.nodes[o.next].ja, meaning: say(this.scene.nodes[o.next].meaning) }))
      } : { kind: "ending", id: node.id, title: say(node.title), text: say(node.text) };
      const scene = this.scene;
      return {
        recovered: this.recovered,
        scene: {
          id: scene.id,
          title: say(scene.title),
          subtitle: say(scene.subtitle),
          introduction: say(scene.introduction),
          roles: scene.roles.map((r) => ({ ...r, description: say(r.description) }))
        },
        started: this.started,
        role: this.role,
        current: current4,
        choices,
        turns: lines.length,
        tried: lines.filter((r) => r.status === "tried").length,
        endings: this.endings.map((id) => ({ id, title: say(scene.nodes[id].title) })),
        history: lines.map((r) => ({ ...this.line(scene.nodes[r.id]), status: r.status }))
      };
    }
    dump() {
      return { v: 1, scene: this.scene.id, sceneVersion: this.scene.version, role: this.role, started: this.started, path: this.path, endings: this.endings };
    }
  };

  // ../yomu-ios/bridge/entry.js
  init_kana();

  // js/phrase-book.js
  var PHRASE_BOOK_FORMAT = "yomu-phrase-book/1";
  var object = (v) => v && typeof v === "object" && !Array.isArray(v);
  function phraseSource(library2, source, text, lang2 = currentLang()) {
    if (!object(source) || typeof source.id !== "string") return null;
    let original, title, meaning, ref;
    if (source.kind === "conversation") {
      const d = library2.dialogues.find((d2) => d2.id === source.id);
      if (!d) return null;
      if (source.line === void 0 || source.line === null) {
        original = d.lines.map((l) => l.ja).join("\n");
        ref = { kind: source.kind, id: d.id };
      } else if (Number.isInteger(source.line) && source.line >= 0 && source.line < d.lines.length) {
        original = d.lines[source.line].ja;
        meaning = (d.translation?.[lang2] || d.translation?.en)?.[source.line];
        ref = { kind: source.kind, id: d.id, line: source.line };
      } else return null;
      title = d.title[lang2] || d.title.en || d.id;
    } else if (source.kind === "expression") {
      const p = library2.phrases.find((p2) => p2.id === source.id);
      if (!p) return null;
      original = p.ja;
      title = p[lang2] || p.en || p.ja;
      meaning = p[lang2] || p.en;
      ref = { kind: source.kind, id: p.id };
    } else return null;
    if (normalizeText(text) !== normalizeText(original)) return null;
    return { ...ref, title, ...meaning ? { meaning } : {} };
  }
  var lineKeys = /* @__PURE__ */ new WeakMap();
  function libraryLine(library2, key, lang2 = currentLang()) {
    if (!object(library2) || typeof key !== "string") return null;
    let keys = lineKeys.get(library2);
    if (!keys) {
      keys = /* @__PURE__ */ new Map();
      for (const p of library2.phrases || []) if (typeof p.ja === "string" && !keys.has(textKey(p.ja))) keys.set(textKey(p.ja), { kind: "expression", id: p.id });
      for (const d of library2.dialogues || []) {
        (d.lines || []).forEach((l, line2) => {
          if (typeof l.ja === "string" && !keys.has(textKey(l.ja))) keys.set(textKey(l.ja), { kind: "conversation", id: d.id, line: line2 });
        });
      }
      lineKeys.set(library2, keys);
    }
    const ref = keys.get(key);
    if (!ref) return null;
    const text = ref.kind === "expression" ? library2.phrases.find((p) => p.id === ref.id).ja : library2.dialogues.find((d) => d.id === ref.id).lines[ref.line].ja;
    return { text, source: phraseSource(library2, ref, text, lang2) };
  }
  var PhraseBook = class {
    constructor(library2, document2, lang2) {
      this.library = library2;
      this.lang = lang2;
      this.data = emptyHistory();
      this.sources = {};
      this.recovered = false;
      this.message = null;
      this.listeners = /* @__PURE__ */ new Set();
      if (document2 == null) return;
      if (!object(document2) || document2.format !== PHRASE_BOOK_FORMAT) {
        this.recovered = true;
        return;
      }
      const checked = cleanPhrases(document2.phrases);
      const merged = mergePhrases(this.data, checked.phrases);
      this.recovered = checked.dropped > 0 || merged.full > 0 || !Array.isArray(document2.phrases);
      if (object(document2.sources)) {
        for (const [key, source] of Object.entries(document2.sources)) {
          const entry = this.data.entries[key];
          const valid = entry && phraseSource(library2, source, entry.t, lang2);
          if (valid) this.sources[key] = this.reference(valid);
          else this.recovered = true;
        }
      } else if (document2.sources != null) this.recovered = true;
    }
    reference({ kind, id, line: line2 }) {
      return { kind, id, ...line2 == null ? {} : { line: line2 } };
    }
    save(text, source, now) {
      this.message = null;
      if (typeof text !== "string" || !text.trim()) {
        this.message = t({ en: "Read a phrase before saving it.", es: "Lee una frase antes de guardarla." }, this.lang);
        return;
      }
      text = text.trim();
      if (text.length > MAX_TEXT) {
        this.message = t({
          en: `Save up to ${MAX_TEXT.toLocaleString("en-US")} characters per phrase. Shorten this reading first; nothing has been truncated.`,
          es: `Guarda hasta ${MAX_TEXT.toLocaleString("es")} caracteres por frase. Primero acorta esta lectura; no se recort\xF3 nada.`
        }, this.lang);
        return;
      }
      if (!Number.isFinite(now) || now <= 0) throw new Error("Invalid save time");
      const valid = phraseSource(this.library, source, text, this.lang);
      const result = saveText(this.data, text, 0, valid ? "phrase" : "typed", now);
      if (!result.ok) {
        this.message = t({
          en: `Your ${MAX_SAVED}-phrase collection is full. Remove a phrase to save another.`,
          es: `Tu colecci\xF3n de ${MAX_SAVED.toLocaleString("es")} frases est\xE1 llena. Quita una para guardar otra.`
        }, this.lang);
        return;
      }
      if (valid && !this.sources[result.key]) this.sources[result.key] = this.reference(valid);
      if (result.changed) this.emit({ type: "save", key: result.key, at: now });
    }
    remove(key) {
      this.message = null;
      this.unsave(key);
    }
    // ── What sync needs of History (js/sync-watch.js) ────────────────────────
    // A signed-in client syncs its saved readings as the page syncs History's
    // saved phrases: storesAdapter reads savedList() and applies through
    // unsave() and mergePhrases(), and watchStores stamps what a listener
    // hears. The events are History's: { type: 'save', key, at },
    // { type: 'unsave', key, saved }, { type: 'change' } for the rest.
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    emit(event) {
      for (const fn of this.listeners) fn(event);
    }
    isSaved(key) {
      const e = typeof key === "string" ? this.data.entries[key] : null;
      return !!(e && e.saved);
    }
    savedList() {
      return savedList(this.data);
    }
    /** A phrase unsaved, by the learner or by sync: it goes whole (no History is kept), with its source. */
    unsave(key) {
      const was = typeof key === "string" ? this.data.entries[key] : null;
      const saved = was && was.saved;
      if (!unsaveText(this.data, key, false)) return false;
      delete this.sources[key];
      this.emit({ type: "unsave", key, saved });
      return true;
    }
    /** Phrases from the account, by History's merge. */
    mergePhrases(phrases) {
      const sum = mergePhrases(this.data, phrases);
      if (sum.added || sum.updated) this.emit({ type: "change" });
      return sum;
    }
    view(query = "") {
      const items = savedList(this.data).map((e) => ({
        id: e.key,
        text: e.t,
        saved: e.saved,
        source: phraseSource(this.library, this.sources[e.key], e.t, this.lang)
      }));
      return { recovered: this.recovered, message: this.message, items: items.filter((p) => !query.trim() || rowMatches([p.text, p.text, [p.source?.title || "", p.source?.meaning || ""]], query)) };
    }
    /**
     * Add a backup's saved phrases (History's backup list) by History's merge:
     * a phrase already here keeps its earlier save, and the collection's limit
     * holds. A library source comes along only when it still matches the
     * phrase's text and the phrase has none here. What changed, as
     * history-store.js mergePhrases counts it, with the damaged entries left out.
     */
    merge(phrases, sources) {
      this.message = null;
      const checked = cleanPhrases(phrases);
      const sum = mergePhrases(this.data, checked.phrases);
      if (object(sources)) {
        for (const [key, source] of Object.entries(sources)) {
          const entry = this.data.entries[key];
          if (!entry || this.sources[key]) continue;
          const valid = phraseSource(this.library, source, entry.t, this.lang);
          if (valid) this.sources[key] = this.reference(valid);
        }
      }
      return { ...sum, dropped: checked.dropped };
    }
    /**
     * The text a History key names among the texts a native client keeps: a
     * saved phrase, else a line of the library, each with its source; null for
     * any other text, which the client does not keep (no automatic History).
     * A kanji met in a text points at its key (kanji-store.js `h`), and the
     * client's "Last seen in" reads the sentence from here.
     */
    keptText(key) {
      const e = typeof key === "string" ? this.data.entries[key] : null;
      if (e && e.saved) return { text: e.t, source: phraseSource(this.library, this.sources[key], e.t, this.lang) };
      return libraryLine(this.library, key, this.lang);
    }
    dump() {
      return { format: PHRASE_BOOK_FORMAT, phrases: phrasesOf(this.data), sources: { ...this.sources } };
    }
  };

  // js/reader.js
  var root;
  var run = { done: 0, total: 0, onProgress: null, failed: null };
  var RADICAL_NO = /\bradical \(no\.\s*\d+\)/i;
  function shownMeanings(m) {
    if (!Array.isArray(m)) return m;
    const kept = m.filter((x) => !RADICAL_NO.test(String(x)));
    return kept.length ? kept : m;
  }
  var LoadError = class extends Error {
    constructor(file2, detail) {
      super(`${file2}: ${detail}`);
      this.name = "LoadError";
      this.file = file2;
      this.detail = detail;
    }
  };
  function report() {
    if (typeof run.onProgress === "function") run.onProgress({ done: run.done, total: run.total });
  }
  async function fetchJson(path) {
    const ROOT = root || (root = new URL("../", "file:///yomu/js/"));
    const mine2 = run;
    mine2.total += 1;
    report();
    const file2 = String(path).replace(ROOT.href, "");
    try {
      const res = await fetch(new URL(path, ROOT));
      if (!res.ok) throw new LoadError(file2, `HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      const named = err instanceof LoadError ? err : new LoadError(file2, err && err.message || "network error");
      if (!mine2.failed) mine2.failed = named;
      throw named;
    } finally {
      mine2.done += 1;
      if (mine2 === run) report();
    }
  }

  // js/collection.js
  init_kana();
  var JOYO_SRC = "data/kanji/joyo.json";
  var JOYO_FORMAT = "yomu-joyo/1";
  var GRADES = Object.freeze([1, 2, 3, 4, 5, 6, 8]);
  var MILESTONES = Object.freeze([10, 25, 50, 100, 200, 300, 500, 750, 1e3, 1500, 2e3, 2136]);
  function bad(detail) {
    return new Error(`${JOYO_SRC}: ${detail}`);
  }
  function parseJoyo(doc) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw bad("not a JSON object");
    if (doc.format !== JOYO_FORMAT) throw bad(`format is ${JSON.stringify(doc.format)}, not ${JOYO_FORMAT}`);
    const raw = doc.grades;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw bad("no grades");
    const gradeOf = /* @__PURE__ */ new Map();
    const grades = GRADES.map((grade) => {
      const s = raw[String(grade)];
      if (typeof s !== "string" || !s) throw bad(`grade ${grade} is missing`);
      const chars3 = [...s];
      for (const ch of chars3) {
        if (!isKanji2(ch)) throw bad(`grade ${grade} holds ${JSON.stringify(ch)}, which is not a kanji`);
        if (gradeOf.has(ch)) throw bad(`${ch} is listed twice`);
        gradeOf.set(ch, grade);
      }
      return { grade, chars: chars3 };
    });
    if (Object.keys(raw).length !== GRADES.length) throw bad("holds a grade the list does not have");
    if (doc.count !== gradeOf.size) throw bad(`count is ${doc.count}, the grades hold ${gradeOf.size}`);
    return { grades, gradeOf, total: gradeOf.size };
  }
  var joyoPromise = null;
  function loadJoyo(fetcher = fetchJson) {
    if (!joyoPromise) {
      joyoPromise = Promise.resolve().then(() => fetcher(JOYO_SRC)).then(parseJoyo).catch((err) => {
        joyoPromise = null;
        throw err;
      });
    }
    return joyoPromise;
  }
  var collected = (seen, ch) => !!seen && Object.hasOwn(seen, ch) && !!seen[ch] && seen[ch].n >= 1;
  function progress(joyo, seen) {
    const byGrade = joyo.grades.map(({ grade, chars: chars3 }) => {
      const have = chars3.reduce((n2, ch) => n2 + (collected(seen, ch) ? 1 : 0), 0);
      return { grade, total: chars3.length, have, complete: have === chars3.length };
    });
    const extra = Object.keys(seen || {}).filter((ch) => collected(seen, ch) && !joyo.gradeOf.has(ch)).sort((a, b) => seen[b].n - seen[a].n || (seen[a].last < seen[b].last ? 1 : seen[a].last > seen[b].last ? -1 : 0) || a.codePointAt(0) - b.codePointAt(0));
    return { total: joyo.total, have: byGrade.reduce((n2, g) => n2 + g.have, 0), byGrade, extra };
  }
  function nextToCollect(joyo, seen, k = 6) {
    for (const { chars: chars3 } of joyo.grades) {
      const missing = chars3.filter((ch) => !collected(seen, ch));
      if (missing.length) return missing.slice(0, k);
    }
    return [];
  }

  // js/levels.js
  var LEVELS = Object.freeze([
    { id: "g1", grade: 1 },
    { id: "g2", grade: 2 },
    { id: "g3", grade: 3 },
    { id: "g4", grade: 4 },
    { id: "g5", grade: 5 },
    { id: "g6", grade: 6 },
    { id: "g8", grade: 8 },
    { id: "names", grade: null },
    { id: "n5", jlpt: 5 },
    { id: "n4", jlpt: 4 },
    { id: "n3", jlpt: 3 },
    { id: "n2", jlpt: 2 },
    { id: "n1", jlpt: 1 }
  ]);
  var LEVEL_PAGE = 50;
  var JINMEIYO_SRC = "data/kanji/jinmeiyo.json";
  var JINMEIYO_FORMAT = "yomu-jinmeiyo/1";
  var JLPT_SRC = "data/kanji/jlpt.json";
  var JLPT_FORMAT = "yomu-jlpt/1";
  var JLPT_LEVELS = Object.freeze(["n5", "n4", "n3", "n2", "n1"]);
  var JLPT_SIZES = Object.freeze({ n5: 79, n4: 166, n3: 367, n2: 367, n1: 1232 });
  var names = null;
  function loadNames(fetcher = fetchJson) {
    if (!names) {
      names = Promise.resolve().then(() => fetcher(JINMEIYO_SRC)).then((doc) => {
        if (!doc || doc.format !== JINMEIYO_FORMAT || typeof doc.kanji !== "string") throw new Error(`${JINMEIYO_SRC}: not ${JINMEIYO_FORMAT}`);
        return Object.freeze([...doc.kanji]);
      }).catch((e) => {
        names = null;
        throw e;
      });
    }
    return names;
  }
  var jlpt = null;
  function loadJlpt(fetcher = fetchJson) {
    if (!jlpt) {
      jlpt = Promise.resolve().then(() => fetcher(JLPT_SRC)).then((doc) => {
        if (!doc || doc.format !== JLPT_FORMAT || !doc.levels) throw new Error(`${JLPT_SRC}: not ${JLPT_FORMAT}`);
        const out = { levelOf: /* @__PURE__ */ new Map() };
        for (const id of JLPT_LEVELS) {
          if (typeof doc.levels[id] !== "string") throw new Error(`${JLPT_SRC}: no ${id}`);
          out[id] = Object.freeze([...doc.levels[id]]);
          for (const ch of out[id]) out.levelOf.set(ch, Number(id.slice(1)));
        }
        return Object.freeze(out);
      }).catch((e) => {
        jlpt = null;
        throw e;
      });
    }
    return jlpt;
  }
  async function charsOf(id, { joyo = loadJoyo, jinmeiyo = loadNames, lists = loadJlpt } = {}) {
    const level = LEVELS.find((l) => l.id === id);
    if (!level) return [];
    if (level.jlpt) return (await lists())[level.id];
    if (level.grade === null) return jinmeiyo();
    const list2 = await joyo();
    const shelf = list2.grades.find((g) => g.grade === level.grade);
    return shelf ? shelf.chars : [];
  }

  // js/kanji-page-data.js
  init_range_store();
  init_es_files();
  function createPageData({ fetchJson: fetchJson3, base = "data/" }) {
    const dir = base.endsWith("/") ? base : `${base}/`;
    const resolve = (src) => src.startsWith("data/") ? dir + src.slice(5) : src;
    const strokes = createRangeStore({
      fetchJson: fetchJson3,
      resolve,
      indexPath: `${dir}strokes/index.json`,
      what: "The stroke index"
    });
    const pages2 = createRangeStore({
      fetchJson: fetchJson3,
      resolve,
      indexPath: `${dir}kpage/index.json`,
      what: "The kanji page index"
    });
    async function strokesOf(chars3) {
      const list2 = [...new Set(chars3)];
      await strokes.need(list2);
      return new Map(list2.map((ch) => [ch, strokes.get(ch) || null]));
    }
    async function pageOf(ch) {
      await pages2.need([ch]);
      const e = pages2.get(ch) || {};
      return Object.freeze({
        words: (e.w || []).map(([written, reading, gloss]) => Object.freeze({ written, reading, gloss })),
        parts: Object.freeze(Object.fromEntries(Object.entries(e.p || {}).map(([part, list2]) => [part, [...list2]]))),
        used: [...e.u || ""],
        variants: [...e.v || ""]
      });
    }
    const es = createEsFiles({ fetchJson: fetchJson3, resolve });
    async function wordsEs(ch) {
      await pages2.need([ch]);
      const src = pages2.srcOf(ch);
      const entries = src ? await es.load(src) : null;
      const list2 = entries && Object.prototype.hasOwnProperty.call(entries, ch) ? entries[ch] : null;
      return Array.isArray(list2) ? list2 : [];
    }
    return Object.freeze({ strokesOf, pageOf, wordsEs });
  }

  // js/daily.js
  var STEP = 7919;
  function dayNumber(day) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
    return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 864e5) : 0;
  }
  function dailyIndex(day, n2) {
    if (!(n2 > 0)) return -1;
    return (dayNumber(day) * STEP % n2 + n2) % n2;
  }
  function dailyOf(doc, day, esDoc = null) {
    const rows = doc && Array.isArray(doc.rows) ? doc.rows : [];
    const k = dailyIndex(day, rows.length);
    const r = rows[k];
    if (!r) return null;
    const [ch, meaning, word, reading, gloss] = r;
    const es = esDoc && Array.isArray(esDoc.rows) && esDoc.rows.length === rows.length ? esDoc.rows[k] : null;
    const spanish2 = {};
    if (Array.isArray(es) && typeof es[0] === "string" && es[0]) spanish2.meaning = es[0];
    if (Array.isArray(es) && typeof es[1] === "string" && es[1]) spanish2.gloss = es[1];
    return Object.freeze(Object.keys(spanish2).length ? { ch, meaning, word, reading, gloss, es: Object.freeze(spanish2) } : { ch, meaning, word, reading, gloss });
  }

  // js/kanji-phrases.js
  function phrasesWithKanji(library2, ch, { limit = 6, lang: lang2 = currentLang() } = {}) {
    const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
    if (!oneKanji(ch) || !max || !library2) return [];
    const out = [];
    const listed = /* @__PURE__ */ new Set();
    for (const p of library2.phrases || []) {
      if (out.length >= max) return out;
      if (typeof p.ja !== "string" || !p.ja.includes(ch)) continue;
      const meaning = p[lang2] || p.en || null;
      out.push({ ja: p.ja, kana: p.kana || null, meaning, title: meaning || p.ja, source: { kind: "expression", id: p.id } });
      listed.add(p.ja);
    }
    for (const d of library2.dialogues || []) {
      const title = d.title?.[lang2] || d.title?.en || d.id;
      const meanings = d.translation?.[lang2] || d.translation?.en || [];
      for (const [line2, l] of (d.lines || []).entries()) {
        if (out.length >= max) return out;
        if (typeof l.ja !== "string" || !l.ja.includes(ch) || listed.has(l.ja)) continue;
        out.push({ ja: l.ja, kana: l.kana || null, meaning: meanings[line2] || null, title, source: { kind: "conversation", id: d.id, line: line2 } });
        listed.add(l.ja);
      }
    }
    return out;
  }

  // js/kana-review.js
  var QUICK_SIZE = 20;
  var QUICK_MAX = 500;
  var sizeOf = (size) => Number.isInteger(size) && size >= 1 && size <= QUICK_MAX ? size : QUICK_SIZE;
  var STRONG_BOX = 4;
  var SCRIPTS2 = ["hiragana", "katakana"];
  var CAP = 1e6;
  var DAY4 = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  var CARD_FIELDS = ["box", "due", "reviews", "lapses"];
  var object2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var isCount4 = (n2) => Number.isSafeInteger(n2) && n2 >= 0 && n2 <= CAP;
  var isDay = (v) => typeof v === "string" && DAY4.test(v);
  var earlier = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  var keyOf2 = (script, id) => `${script}:${id}`;
  var bounded = (rec) => ({ box: rec.box, due: rec.due, reviews: Math.min(CAP, rec.reviews), lapses: Math.min(CAP, rec.lapses) });
  var pools = {};
  function poolOf(script) {
    if (!pools[script]) {
      pools[script] = new Set(kanaChart(script).filter((s) => s.id !== "timing").flatMap((s) => s.cells).filter((c) => c.kana).map((c) => c.id));
    }
    return pools[script];
  }
  function validKey(key) {
    const at = key.indexOf(":");
    const script = key.slice(0, at);
    return at > 0 && SCRIPTS2.includes(script) && poolOf(script).has(key.slice(at + 1));
  }
  function cleanCard(v) {
    if (!object2(v) || !Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX) return null;
    if (!isDay(v.due) || !isCount4(v.reviews) || !isCount4(v.lapses)) return null;
    return { card: { box: v.box, due: v.due, reviews: v.reviews, lapses: v.lapses }, extra: Object.keys(v).some((k) => !CARD_FIELDS.includes(k)) };
  }
  var listEs = (items) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
  function readiness(script, pool) {
    if (!SCRIPTS2.includes(script)) return { ready: false, message: t({ en: "Choose hiragana or katakana.", es: "Elige hiragana o katakana." }) };
    const sounds2 = new Set(pool.map((c) => c.sound));
    if (sounds2.size >= 2) {
      return {
        ready: true,
        message: t({
          en: `Due kana come first, then new ones, up to ${QUICK_SIZE} in one review.`,
          es: `Primero van los kana que tocan repaso y luego los nuevos, hasta ${QUICK_SIZE} por repaso.`
        })
      };
    }
    if (!pool.length) {
      return {
        ready: false,
        message: t({
          en: "Choose at least two kana with different sounds. Small tsu and the long-vowel bar need a word, so they stay in reading practice.",
          es: "Elige al menos dos kana con sonidos distintos. La tsu peque\xF1a y la barra de vocal larga necesitan una palabra, as\xED que se quedan en la pr\xE1ctica de lectura."
        })
      };
    }
    const sound = pool[0].sound;
    if (pool.length === 1) {
      return {
        ready: false,
        message: t({
          en: `Choose at least one more kana with a sound other than ${sound}.`,
          es: `Elige al menos un kana m\xE1s, con un sonido distinto de ${sound}.`
        })
      };
    }
    const kana = pool.map((c) => c.kana);
    return {
      ready: false,
      message: t({
        en: `${kana.join(" and ")} ${pool.length === 2 ? "both" : "all"} sound ${sound}. Choose one more kana with a different sound.`,
        es: `${listEs(kana)} suenan igual: ${sound}. Elige un kana m\xE1s con otro sonido.`
      })
    };
  }
  function cleanSession(s) {
    if (!object2(s) || typeof s.id !== "string" || !s.id || s.id.length > 80 || !SCRIPTS2.includes(s.script) || !isDay(s.today)) return null;
    const pool = poolOf(s.script);
    const ids = (v) => Array.isArray(v) && v.every((id) => typeof id === "string" && pool.has(id)) && new Set(v).size === v.length;
    if (!ids(s.kana) || !s.kana.length || s.kana.length > QUICK_SIZE || !ids(s.queue) || !ids(s.ahead)) return null;
    if (!Array.isArray(s.first) || !s.first.every((p) => Array.isArray(p) && p.length === 2 && typeof p[1] === "boolean")) return null;
    const answered = s.first.map(([id]) => id);
    if (answered.some((id, i) => id !== s.kana[i])) return null;
    const waiting = s.kana.slice(answered.length);
    if (waiting.some((id, i) => s.queue[i] !== id)) return null;
    const first = new Map(s.first);
    const back = s.queue.slice(waiting.length);
    if (back.some((id) => first.get(id) !== false)) return null;
    if (!isCount4(s.repeats) || typeof s.shown !== "boolean" || s.shown && !s.queue.length) return null;
    if (s.first.filter(([id, ok]) => !ok && !back.includes(id)).length > s.repeats) return null;
    if (!object2(s.before) || Object.keys(s.before).length !== s.kana.length) return null;
    if (!s.kana.every((id) => Number.isInteger(s.before[id]) && s.before[id] >= -1 && s.before[id] <= TOP_BOX)) return null;
    if (s.ahead.some((id) => !s.kana.includes(id) || s.before[id] < 0)) return null;
    return {
      id: s.id,
      script: s.script,
      today: s.today,
      kana: [...s.kana],
      before: Object.fromEntries(s.kana.map((id) => [id, s.before[id]])),
      ahead: [...s.ahead],
      review: { queue: [...s.queue], total: s.kana.length, shown: s.shown, first, repeats: s.repeats }
    };
  }
  function moveCard(cards2, s, cellId, ok) {
    const key = keyOf2(s.script, cellId);
    const card2 = cards2[key];
    if (card2 && s.ahead.includes(cellId)) {
      cards2[key] = ok ? { ...card2, reviews: Math.min(CAP, card2.reviews + 1) } : bounded(schedule(card2, false, s.today));
    } else {
      cards2[key] = bounded(schedule(card2 || { box: 0, due: s.today, reviews: 0, lapses: 0 }, ok, s.today));
    }
  }
  function pick(cards2, script, pool, today, size) {
    const order = new Map(pool.map((c, i) => [c.id, i]));
    const card2 = (c) => cards2[keyOf2(script, c.id)];
    const due = pool.filter((c) => card2(c) && card2(c).due <= today).sort((a, b) => earlier(card2(a).due, card2(b).due) || card2(a).box - card2(b).box || order.get(a.id) - order.get(b.id));
    const fresh = pool.filter((c) => !card2(c));
    const ahead = pool.filter((c) => card2(c) && card2(c).due > today).sort((a, b) => card2(a).box - card2(b).box || earlier(card2(a).due, card2(b).due) || order.get(a.id) - order.get(b.id));
    const picked = {};
    let room = size;
    for (const [name, group] of [["due", due], ["fresh", fresh], ["ahead", ahead]]) {
      picked[name] = group.slice(0, room);
      room -= picked[name].length;
    }
    return picked;
  }
  var stepId = (s) => `${s.id}:${s.review.first.size + s.review.repeats}`;
  var cellsOf = (script, ids) => new Map(gameKana(script, ids).map((c) => [c.id, c]));
  var KanaReview = class {
    constructor(document2) {
      this.cards = {};
      this.session = null;
      this.recovered = false;
      if (document2 == null) return;
      if (!object2(document2) || document2.v !== 1 || !object2(document2.cards)) {
        this.recovered = true;
        return;
      }
      for (const [key, value] of Object.entries(document2.cards)) {
        const clean = validKey(key) ? cleanCard(value) : null;
        if (!clean || clean.extra) this.recovered = true;
        if (clean) this.cards[key] = clean.card;
      }
      if (document2.session != null) {
        this.session = cleanSession(document2.session);
        if (!this.session) this.recovered = true;
      }
    }
    /**
     * The selected kana of `script` and where each stands on `today`. The four
     * counts split `total`: fresh (never answered), due (answered, due today or
     * earlier), strong (not due, box 4 or 5) and learning (the rest). `plan`
     * is what a review of `size` would hold, group by group (start, below),
     * so the screen can say how many cards there are and in what order.
     */
    overview({ script = "hiragana", selected = [], today = dayOf(Date.now()), size = QUICK_SIZE } = {}) {
      if (!isDay(today)) throw new Error("Expected today as YYYY-MM-DD.");
      const pool = SCRIPTS2.includes(script) ? gameKana(script, selected) : [];
      const counts2 = { due: 0, fresh: 0, learning: 0, strong: 0 };
      const cells = pool.map((c) => {
        const card2 = this.cards[keyOf2(script, c.id)];
        counts2[!card2 ? "fresh" : card2.due <= today ? "due" : card2.box >= STRONG_BOX ? "strong" : "learning"] += 1;
        return { id: c.id, kana: c.kana, box: card2 ? card2.box : -1 };
      });
      const { ready, message } = readiness(script, pool);
      const picked = pick(this.cards, script, pool, today, sizeOf(size));
      const plan = { due: picked.due.length, fresh: picked.fresh.length, ahead: picked.ahead.length };
      plan.total = plan.due + plan.fresh + plan.ahead;
      return { script, total: pool.length, ...counts2, ready, message, cells, plan };
    }
    /**
     * Up to `size` kana (QUICK_SIZE unless the learner chose another, at most
     * QUICK_MAX), picked as `pick` says; each group is then shuffled with
     * `seed`, and the groups keep their order.
     */
    start({ script = "hiragana", selected = [], today = dayOf(Date.now()), seed = Date.now(), size = QUICK_SIZE } = {}) {
      if (this.session && !finished(this.session.review)) {
        throw new Error(t({ en: "Finish or leave the current review first.", es: "Primero termina el repaso actual o sal de \xE9l." }));
      }
      if (!isDay(today)) throw new Error("Expected today as YYYY-MM-DD.");
      const pool = SCRIPTS2.includes(script) ? gameKana(script, selected) : [];
      if (!readiness(script, pool).ready) {
        throw new Error(t({ en: "Choose at least two kana with different sounds.", es: "Elige al menos dos kana con sonidos distintos." }));
      }
      const card2 = (c) => this.cards[keyOf2(script, c.id)];
      const picked = pick(this.cards, script, pool, today, sizeOf(size));
      const rand = makeRand(seed);
      const chosen = [];
      for (const group of [picked.due, picked.fresh, picked.ahead]) chosen.push(...shuffle(group, rand));
      const kana = chosen.map((c) => c.id);
      this.session = {
        id: `${script}:${today}:${Number(seed) >>> 0}`,
        script,
        today,
        kana,
        before: Object.fromEntries(chosen.map((c) => [c.id, card2(c) ? card2(c).box : -1])),
        ahead: chosen.filter((c) => card2(c) && card2(c).due > today).map((c) => c.id),
        review: createReview(kana)
      };
      return this.view();
    }
    /**
     * 'show', 'again', 'got' or 'leave'. Every action but leave names the card
     * on screen by its `id` (view().session.card.id); any other id is a stale
     * or double tap and changes nothing. An answer before 'show' is refused.
     * Leaving discards the review; the kana already answered keep their schedule.
     */
    act(action, { id } = {}) {
      const s = this.session;
      if (!s) return this.view();
      if (action === "leave") {
        this.session = null;
        return this.view();
      }
      if (finished(s.review) || id !== stepId(s)) return this.view();
      if (action === "show") show(s.review);
      else if (action === "again" || action === "got") answer(s.review, action === "got", (cellId, ok) => moveCard(this.cards, s, cellId, ok));
      return this.view();
    }
    /**
     * status 'idle', 'playing' or 'complete'. Playing: the card on screen, its
     * sound and shape reminder only once shown, and `box` as it was before this
     * review (-1 never answered). Complete: what the summary says, until
     * 'leave' or a new start. `stronger` counts kana whose first answer was Got
     * it and moved them up a box (never practice ahead, never the top box).
     */
    view() {
      const base = { recovered: this.recovered, status: "idle", session: null };
      const s = this.session;
      if (!s) return base;
      const r = s.review;
      const { at, of } = position(r);
      const cells = cellsOf(s.script, s.kana);
      if (finished(r)) {
        const sum = summary(r);
        const stronger = [...r.first].filter(([id, ok]) => ok && !s.ahead.includes(id) && s.before[id] < TOP_BOX).length;
        return {
          ...base,
          status: "complete",
          session: { script: s.script, position: of, total: of, result: { reviewed: sum.reviewed, got: sum.got, again: sum.again.map((id) => cells.get(id).kana), stronger } }
        };
      }
      const cellId = current2(r);
      const cell = cells.get(cellId);
      return {
        ...base,
        status: "playing",
        session: {
          script: s.script,
          position: at,
          total: of,
          isRepeat: isRepeat(r),
          card: {
            id: stepId(s),
            cellId,
            kana: cell.kana,
            shown: r.shown,
            sound: r.shown ? cell.sound : null,
            spoken: cell.spoken,
            hint: r.shown ? cell.hint : null,
            box: s.before[cellId]
          }
        }
      };
    }
    dump() {
      const s = this.session;
      return {
        v: 1,
        cards: { ...this.cards },
        session: s && {
          id: s.id,
          script: s.script,
          today: s.today,
          kana: [...s.kana],
          queue: [...s.review.queue],
          shown: s.review.shown,
          first: [...s.review.first],
          repeats: s.review.repeats,
          before: { ...s.before },
          ahead: [...s.ahead]
        }
      };
    }
  };

  // js/kana-reads.js
  init_kana();
  var KANA_READ_THEMES = Object.freeze([
    {
      id: "cafe",
      script: "katakana",
      title: "Caf\xE9 menu",
      subtitle: "Drinks and treats in katakana",
      titleEs: "Men\xFA de cafeter\xEDa",
      subtitleEs: "Bebidas y bocados en katakana"
    },
    {
      id: "world",
      script: "katakana",
      title: "Around the world",
      subtitle: "Countries and cities in katakana",
      titleEs: "Por el mundo",
      subtitleEs: "Pa\xEDses y ciudades en katakana"
    },
    {
      id: "things",
      script: "katakana",
      title: "Everyday things",
      subtitle: "Loanwords on signs and screens",
      titleEs: "Cosas de todos los d\xEDas",
      subtitleEs: "Palabras prestadas en letreros y pantallas"
    },
    {
      id: "animals",
      script: "katakana",
      title: "At the zoo",
      subtitle: "Animals the way zoos write them",
      titleEs: "En el zool\xF3gico",
      subtitleEs: "Los animales como los escriben los zool\xF3gicos"
    },
    {
      id: "sounds",
      script: "hiragana",
      title: "Sound words",
      subtitle: "How things sound and feel, in hiragana",
      titleEs: "Onomatopeyas",
      subtitleEs: "C\xF3mo suenan y se sienten las cosas, en hiragana"
    },
    {
      id: "everyday",
      script: "hiragana",
      title: "Everyday words",
      subtitle: "Friendly words in hiragana",
      titleEs: "Palabras de todos los d\xEDas",
      subtitleEs: "Palabras amables en hiragana"
    }
  ].map((theme) => Object.freeze(theme)));
  var ITEMS = {
    cafe: [
      [
        "coffee",
        "\u30B3\u30FC\u30D2\u30FC",
        "Coffee",
        "Each bar stretches the vowel before it, so \u30B3\u30FC\u30D2\u30FC is said koohii.",
        "Caf\xE9",
        "Cada barra alarga la vocal que va antes, as\xED que \u30B3\u30FC\u30D2\u30FC se dice koohii."
      ],
      [
        "cake",
        "\u30B1\u30FC\u30AD",
        "Cake",
        "Strawberry shortcake, \u30B7\u30E7\u30FC\u30C8\u30B1\u30FC\u30AD, is the classic birthday cake in Japan.",
        "Pastel",
        "El pastel de fresas con crema, \u30B7\u30E7\u30FC\u30C8\u30B1\u30FC\u30AD, es el cl\xE1sico de los cumplea\xF1os en Jap\xF3n."
      ],
      [
        "bread",
        "\u30D1\u30F3",
        "Bread",
        "\u30D1\u30F3 came from Portuguese p\xE3o in the 1500s, long before most English loanwords.",
        "Pan",
        "\u30D1\u30F3 lleg\xF3 del portugu\xE9s p\xE3o en el siglo XVI, mucho antes que la mayor\xEDa de los pr\xE9stamos del ingl\xE9s."
      ],
      [
        "pizza",
        "\u30D4\u30B6",
        "Pizza",
        "Some Italian restaurants write \u30D4\u30C3\u30C4\u30A1, which is closer to the Italian sound.",
        "Pizza",
        "Algunos restaurantes italianos escriben \u30D4\u30C3\u30C4\u30A1, que suena m\xE1s parecido al italiano."
      ],
      [
        "ramen",
        "\u30E9\u30FC\u30E1\u30F3",
        "Ramen",
        "Instant ramen was invented in Japan in 1958.",
        "Ramen",
        "El ramen instant\xE1neo se invent\xF3 en Jap\xF3n en 1958."
      ],
      [
        "curry",
        "\u30AB\u30EC\u30FC",
        "Curry",
        "Curry on rice, \u30AB\u30EC\u30FC\u30E9\u30A4\u30B9, is one of the most loved home meals in Japan.",
        "Curry",
        "El curry con arroz, \u30AB\u30EC\u30FC\u30E9\u30A4\u30B9, es una de las comidas caseras m\xE1s queridas de Jap\xF3n."
      ],
      [
        "salad",
        "\u30B5\u30E9\u30C0",
        "Salad",
        "Potato salad, \u30DD\u30C6\u30C8\u30B5\u30E9\u30C0, is often clipped to \u30DD\u30C6\u30B5\u30E9.",
        "Ensalada",
        "La ensalada de papas, \u30DD\u30C6\u30C8\u30B5\u30E9\u30C0, muchas veces se acorta a \u30DD\u30C6\u30B5\u30E9."
      ],
      [
        "juice",
        "\u30B8\u30E5\u30FC\u30B9",
        "Juice",
        "In everyday Japanese, \u30B8\u30E5\u30FC\u30B9 can mean almost any sweet soft drink, fizzy or not.",
        "Jugo",
        "En el japon\xE9s de todos los d\xEDas, \u30B8\u30E5\u30FC\u30B9 puede ser casi cualquier bebida dulce, con gas o sin gas."
      ],
      [
        "sandwich",
        "\u30B5\u30F3\u30C9\u30A4\u30C3\u30C1",
        "Sandwich",
        "Caf\xE9s often shorten it to \u30B5\u30F3\u30C9, as in a cream-filled fruit \u30B5\u30F3\u30C9.",
        "S\xE1ndwich",
        "En los caf\xE9s suele acortarse a \u30B5\u30F3\u30C9, como en un \u30B5\u30F3\u30C9 de fruta con crema."
      ],
      [
        "hamburger",
        "\u30CF\u30F3\u30D0\u30FC\u30AC\u30FC",
        "Hamburger",
        "Drop the bun and you have \u30CF\u30F3\u30D0\u30FC\u30B0, a hamburg steak served with rice.",
        "Hamburguesa",
        "Qu\xEDtale el pan y tienes \u30CF\u30F3\u30D0\u30FC\u30B0, un filete de carne molida que se sirve con arroz."
      ],
      [
        "chocolate",
        "\u30C1\u30E7\u30B3\u30EC\u30FC\u30C8",
        "Chocolate",
        "Usually shortened to \u30C1\u30E7\u30B3, the classic Valentine's Day gift in Japan.",
        "Chocolate",
        "Casi siempre se acorta a \u30C1\u30E7\u30B3, el regalo cl\xE1sico de San Valent\xEDn en Jap\xF3n."
      ],
      [
        "milk",
        "\u30DF\u30EB\u30AF",
        "Milk",
        "In a caf\xE9 \u30DF\u30EB\u30AF is the milk for your coffee, while the carton at home is usually \u725B\u4E73.",
        "Leche",
        "En una cafeter\xEDa, \u30DF\u30EB\u30AF es la leche para tu caf\xE9, y la caja de leche de la casa suele ser \u725B\u4E73."
      ],
      [
        "soup",
        "\u30B9\u30FC\u30D7",
        "Soup",
        "In winter, vending machines sell hot corn soup, \u30B3\u30FC\u30F3\u30B9\u30FC\u30D7, in cans.",
        "Sopa",
        "En invierno, las m\xE1quinas expendedoras venden sopa de ma\xEDz caliente, \u30B3\u30FC\u30F3\u30B9\u30FC\u30D7, en lata."
      ],
      [
        "ice-cream",
        "\u30A2\u30A4\u30B9\u30AF\u30EA\u30FC\u30E0",
        "Ice cream",
        "Most people just say \u30A2\u30A4\u30B9, so \u30A2\u30A4\u30B9 means ice cream, not ice.",
        "Helado",
        "Casi todos dicen solo \u30A2\u30A4\u30B9, as\xED que \u30A2\u30A4\u30B9 es helado, no hielo."
      ],
      [
        "doughnut",
        "\u30C9\u30FC\u30CA\u30C4",
        "Doughnut",
        "The t at the end of doughnut becomes \u30C4, so the word ends in tsu.",
        "Dona",
        "La t final de doughnut se vuelve \u30C4, as\xED que la palabra termina en tsu."
      ],
      [
        "pudding",
        "\u30D7\u30EA\u30F3",
        "Custard pudding",
        "\u30D7\u30EA\u30F3 is a wobbly custard with caramel sauce, sold in every convenience store.",
        "Flan",
        "\u30D7\u30EA\u30F3 es un flan que tiembla, con salsa de caramelo, y se vende en cualquier tienda de conveniencia."
      ],
      [
        "cookie",
        "\u30AF\u30C3\u30AD\u30FC",
        "Cookie",
        "The small \u30C3 doubles the k, so \u30AF\u30C3\u30AD\u30FC is said kukkii.",
        "Galleta",
        "La \u30C3 peque\xF1a duplica la k, as\xED que \u30AF\u30C3\u30AD\u30FC se dice kukkii."
      ],
      [
        "pasta",
        "\u30D1\u30B9\u30BF",
        "Pasta",
        "A Japanese favourite is \u305F\u3089\u3053\u30B9\u30D1\u30B2\u30C3\u30C6\u30A3, spaghetti with salted fish roe.",
        "Pasta",
        "Un favorito japon\xE9s es \u305F\u3089\u3053\u30B9\u30D1\u30B2\u30C3\u30C6\u30A3, espagueti con hueva de pescado salada."
      ]
    ],
    world: [
      [
        "america",
        "\u30A2\u30E1\u30EA\u30AB",
        "America",
        "In kanji the country is shortened to \u7C73, the character for rice, as in \u7C73\u56FD.",
        "Estados Unidos",
        "En kanji el pa\xEDs se abrevia \u7C73, el car\xE1cter del arroz, como en \u7C73\u56FD."
      ],
      [
        "mexico",
        "\u30E1\u30AD\u30B7\u30B3",
        "Mexico",
        "Tacos are \u30BF\u30B3\u30B9 in Japanese, plural s and all.",
        "M\xE9xico",
        "Los tacos son \u30BF\u30B3\u30B9 en japon\xE9s, con la s del plural y todo."
      ],
      [
        "brazil",
        "\u30D6\u30E9\u30B8\u30EB",
        "Brazil",
        "Brazil is home to the largest Japanese community outside Japan.",
        "Brasil",
        "En Brasil vive la comunidad japonesa m\xE1s grande fuera de Jap\xF3n."
      ],
      [
        "italy",
        "\u30A4\u30BF\u30EA\u30A2",
        "Italy",
        "Italian food is \u30A4\u30BF\u30EA\u30A2\u6599\u7406, often just called \u30A4\u30BF\u30EA\u30A2\u30F3.",
        "Italia",
        "La comida italiana es \u30A4\u30BF\u30EA\u30A2\u6599\u7406, y muchas veces se le dice solo \u30A4\u30BF\u30EA\u30A2\u30F3."
      ],
      [
        "france",
        "\u30D5\u30E9\u30F3\u30B9",
        "France",
        "\u30D5\u30E9\u30F3\u30B9\u30D1\u30F3, French bread, is the long crusty loaf in Japanese bakeries.",
        "Francia",
        "\u30D5\u30E9\u30F3\u30B9\u30D1\u30F3, pan franc\xE9s, es el pan largo y crujiente de las panader\xEDas japonesas."
      ],
      [
        "germany",
        "\u30C9\u30A4\u30C4",
        "Germany",
        "The name comes from the Dutch word for German, so it sounds nothing like Germany.",
        "Alemania",
        "El nombre viene de la palabra holandesa para alem\xE1n, as\xED que no se parece en nada a Alemania."
      ],
      [
        "canada",
        "\u30AB\u30CA\u30C0",
        "Canada",
        "Maple syrup is \u30E1\u30FC\u30D7\u30EB\u30B7\u30ED\u30C3\u30D7, a sweet souvenir from Canada.",
        "Canad\xE1",
        "El jarabe de arce es \u30E1\u30FC\u30D7\u30EB\u30B7\u30ED\u30C3\u30D7, un recuerdo dulce de Canad\xE1."
      ],
      [
        "chile",
        "\u30C1\u30EA",
        "Chile",
        "The same two kana turn up on menus too: \u30C1\u30EA\u30BD\u30FC\u30B9 is chili sauce.",
        "Chile",
        "Los mismos dos kana aparecen tambi\xE9n en los men\xFAs: \u30C1\u30EA\u30BD\u30FC\u30B9 es salsa de chile."
      ],
      [
        "london",
        "\u30ED\u30F3\u30C9\u30F3",
        "London",
        "Each \u30F3 is a beat of its own, so \u30ED\u30F3\u30C9\u30F3 has four beats: ro-n-do-n.",
        "Londres",
        "Cada \u30F3 es un pulso propio, as\xED que \u30ED\u30F3\u30C9\u30F3 tiene cuatro pulsos: ro-n-do-n."
      ],
      [
        "paris",
        "\u30D1\u30EA",
        "Paris",
        "Say it twice, \u30D1\u30EA\u30D1\u30EA, and you have the sound of something crispy.",
        "Par\xEDs",
        "Dilo dos veces, \u30D1\u30EA\u30D1\u30EA, y tienes el sonido de algo crujiente."
      ],
      [
        "rome",
        "\u30ED\u30FC\u30DE",
        "Rome",
        "The Roman alphabet is \u30ED\u30FC\u30DE\u5B57, which is where the word romaji comes from.",
        "Roma",
        "El alfabeto romano es \u30ED\u30FC\u30DE\u5B57, y de ah\xED viene la palabra romaji."
      ],
      [
        "britain",
        "\u30A4\u30AE\u30EA\u30B9",
        "Britain",
        "The name comes from Portuguese ingl\xEAs, the word for English.",
        "Reino Unido",
        "El nombre viene del portugu\xE9s ingl\xEAs, que quiere decir ingl\xE9s."
      ],
      [
        "australia",
        "\u30AA\u30FC\u30B9\u30C8\u30E9\u30EA\u30A2",
        "Australia",
        "Its koalas and kangaroos are written in katakana too: \u30B3\u30A2\u30E9, \u30AB\u30F3\u30AC\u30EB\u30FC.",
        "Australia",
        "Sus koalas y canguros tambi\xE9n se escriben en katakana: \u30B3\u30A2\u30E9, \u30AB\u30F3\u30AC\u30EB\u30FC."
      ],
      [
        "new-york",
        "\u30CB\u30E5\u30FC\u30E8\u30FC\u30AF",
        "New York",
        "\u30CB\u30E5 is \u30CB plus a small \u30E5, said as one beat: nyu.",
        "Nueva York",
        "\u30CB\u30E5 es \u30CB m\xE1s una \u30E5 peque\xF1a, dicho en un solo pulso: nyu."
      ],
      [
        "india",
        "\u30A4\u30F3\u30C9",
        "India",
        "Curry reached Japan by way of Britain, not straight from India.",
        "India",
        "El curry lleg\xF3 a Jap\xF3n con los brit\xE1nicos, no directamente desde la India."
      ],
      [
        "egypt",
        "\u30A8\u30B8\u30D7\u30C8",
        "Egypt",
        "Japanese gives its consonants vowels, so Egypt becomes e-ji-pu-to.",
        "Egipto",
        "El japon\xE9s le pone vocal a cada consonante, as\xED que Egypt, en ingl\xE9s, se vuelve e-ji-pu-to."
      ],
      [
        "hawaii",
        "\u30CF\u30EF\u30A4",
        "Hawaii",
        "Hawaii is one of the most popular holiday spots for travellers from Japan.",
        "Haw\xE1i",
        "Haw\xE1i es uno de los destinos de vacaciones favoritos de quienes viajan desde Jap\xF3n."
      ],
      [
        "greece",
        "\u30AE\u30EA\u30B7\u30E3",
        "Greece",
        "Greek yogurt is sold in Japan as \u30AE\u30EA\u30B7\u30E3\u30E8\u30FC\u30B0\u30EB\u30C8.",
        "Grecia",
        "El yogur griego se vende en Jap\xF3n como \u30AE\u30EA\u30B7\u30E3\u30E8\u30FC\u30B0\u30EB\u30C8."
      ]
    ],
    things: [
      [
        "tv",
        "\u30C6\u30EC\u30D3",
        "TV",
        "Short for \u30C6\u30EC\u30D3\u30B8\u30E7\u30F3, television: Japanese loves to clip long loanwords.",
        "Tele",
        "Es la forma corta de \u30C6\u30EC\u30D3\u30B8\u30E7\u30F3, televisi\xF3n: al japon\xE9s le encanta acortar los pr\xE9stamos largos."
      ],
      [
        "camera",
        "\u30AB\u30E1\u30E9",
        "Camera",
        "The person behind the camera is a \u30AB\u30E1\u30E9\u30DE\u30F3, camera man.",
        "C\xE1mara",
        "Quien est\xE1 detr\xE1s de la c\xE1mara es un \u30AB\u30E1\u30E9\u30DE\u30F3, un camar\xF3grafo o un fot\xF3grafo."
      ],
      [
        "smartphone",
        "\u30B9\u30DE\u30DB",
        "Smartphone",
        "Clipped from \u30B9\u30DE\u30FC\u30C8\u30D5\u30A9\u30F3, smartphone, down to three kana.",
        "Celular",
        "Viene de \u30B9\u30DE\u30FC\u30C8\u30D5\u30A9\u30F3, smartphone, acortado a solo tres kana."
      ],
      [
        "computer",
        "\u30D1\u30BD\u30B3\u30F3",
        "Computer",
        "Short for \u30D1\u30FC\u30BD\u30CA\u30EB\u30B3\u30F3\u30D4\u30E5\u30FC\u30BF\u30FC, personal computer.",
        "Computadora",
        "Es la forma corta de \u30D1\u30FC\u30BD\u30CA\u30EB\u30B3\u30F3\u30D4\u30E5\u30FC\u30BF\u30FC, computadora personal."
      ],
      [
        "game",
        "\u30B2\u30FC\u30E0",
        "Game",
        "An arcade is a \u30B2\u30FC\u30E0\u30BB\u30F3\u30BF\u30FC, game centre, or \u30B2\u30FC\u30BB\u30F3 for short.",
        "Juego",
        "Un sal\xF3n de videojuegos se llama \u30B2\u30FC\u30E0\u30BB\u30F3\u30BF\u30FC, o \u30B2\u30FC\u30BB\u30F3 para abreviar."
      ],
      [
        "hotel",
        "\u30DB\u30C6\u30EB",
        "Hotel",
        "A capsule hotel, \u30AB\u30D7\u30BB\u30EB\u30DB\u30C6\u30EB, rents you a sleeping pod instead of a room.",
        "Hotel",
        "Un hotel c\xE1psula, \u30AB\u30D7\u30BB\u30EB\u30DB\u30C6\u30EB, te alquila una c\xE1psula para dormir en vez de una habitaci\xF3n."
      ],
      [
        "toilet",
        "\u30C8\u30A4\u30EC",
        "Toilet",
        "Signs may also say \u304A\u624B\u6D17\u3044, a politer word for the same room.",
        "Ba\xF1o",
        "Los letreros tambi\xE9n pueden decir \u304A\u624B\u6D17\u3044, una palabra m\xE1s cort\xE9s para el mismo lugar."
      ],
      [
        "bus",
        "\u30D0\u30B9",
        "Bus",
        "The same katakana also means bath, as in \u30D0\u30B9\u30BF\u30AA\u30EB, a bath towel.",
        "Autob\xFAs",
        "El mismo katakana tambi\xE9n quiere decir ba\xF1o de tina, como en \u30D0\u30B9\u30BF\u30AA\u30EB, una toalla de ba\xF1o."
      ],
      [
        "taxi",
        "\u30BF\u30AF\u30B7\u30FC",
        "Taxi",
        "In Japan the back door of a taxi opens and closes by itself.",
        "Taxi",
        "En Jap\xF3n, la puerta trasera del taxi se abre y se cierra sola."
      ],
      [
        "elevator",
        "\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC",
        "Elevator",
        "Its cousin is \u30A8\u30B9\u30AB\u30EC\u30FC\u30BF\u30FC, the escalator.",
        "Ascensor",
        "Su primo es \u30A8\u30B9\u30AB\u30EC\u30FC\u30BF\u30FC, la escalera mec\xE1nica."
      ],
      [
        "konbini",
        "\u30B3\u30F3\u30D3\u30CB",
        "Convenience store",
        "Short for \u30B3\u30F3\u30D3\u30CB\u30A8\u30F3\u30B9\u30B9\u30C8\u30A2, a shop that sells meals, stamps and concert tickets.",
        "Tienda de conveniencia",
        "Es la forma corta de \u30B3\u30F3\u30D3\u30CB\u30A8\u30F3\u30B9\u30B9\u30C8\u30A2, una tienda que vende comidas, sellos postales y entradas para conciertos."
      ],
      [
        "notebook",
        "\u30CE\u30FC\u30C8",
        "Notebook",
        "\u30CE\u30FC\u30C8 is a notebook, not a short message: a note to someone is a \u30E1\u30E2.",
        "Cuaderno",
        "\u30CE\u30FC\u30C8 es un cuaderno, no un mensaje corto: una nota para alguien es una \u30E1\u30E2."
      ],
      [
        "pen",
        "\u30DA\u30F3",
        "Pen",
        "A ballpoint pen is a \u30DC\u30FC\u30EB\u30DA\u30F3, a ball pen.",
        "Bol\xEDgrafo",
        "El bol\xEDgrafo de punta de bola es una \u30DC\u30FC\u30EB\u30DA\u30F3, del ingl\xE9s ball pen."
      ],
      [
        "piano",
        "\u30D4\u30A2\u30CE",
        "Piano",
        "Three kana and three beats, pi-a-no, close to the Italian word.",
        "Piano",
        "Tres kana y tres pulsos, pi-a-no, casi como la palabra italiana."
      ],
      [
        "shower",
        "\u30B7\u30E3\u30EF\u30FC",
        "Shower",
        "\u30B7\u30E3 is \u30B7 plus a small \u30E3, said as one beat: sha.",
        "Ducha",
        "\u30B7\u30E3 es \u30B7 m\xE1s una \u30E3 peque\xF1a, dicho en un solo pulso: sha."
      ],
      [
        "table",
        "\u30C6\u30FC\u30D6\u30EB",
        "Table",
        "Good manners at a meal are \u30C6\u30FC\u30D6\u30EB\u30DE\u30CA\u30FC, table manners.",
        "Mesa",
        "Los buenos modales en la mesa se llaman \u30C6\u30FC\u30D6\u30EB\u30DE\u30CA\u30FC, del ingl\xE9s table manners."
      ],
      [
        "restaurant",
        "\u30EC\u30B9\u30C8\u30E9\u30F3",
        "Restaurant",
        "Five beats, re-su-to-ra-n: Japanese gives the s a vowel of its own.",
        "Restaurante",
        "Cinco pulsos, re-su-to-ra-n: el japon\xE9s le da a la s una vocal propia."
      ],
      [
        "news",
        "\u30CB\u30E5\u30FC\u30B9",
        "News",
        "It starts with the same \u30CB\u30E5\u30FC as \u30CB\u30E5\u30FC\u30E8\u30FC\u30AF.",
        "Noticias",
        "Empieza con el mismo \u30CB\u30E5\u30FC de \u30CB\u30E5\u30FC\u30E8\u30FC\u30AF."
      ]
    ],
    animals: [
      [
        "lion",
        "\u30E9\u30A4\u30AA\u30F3",
        "Lion",
        "The final \u30F3 is a beat of its own, so \u30E9\u30A4\u30AA\u30F3 has four: ra-i-o-n.",
        "Le\xF3n",
        "La \u30F3 final es un pulso propio, as\xED que \u30E9\u30A4\u30AA\u30F3 tiene cuatro: ra-i-o-n."
      ],
      [
        "panda",
        "\u30D1\u30F3\u30C0",
        "Panda",
        "Pandas first came to Tokyo's Ueno Zoo in 1972 and drew huge crowds.",
        "Panda",
        "Los primeros pandas llegaron al zool\xF3gico de Ueno, en Tokio, en 1972 y atrajeron multitudes."
      ],
      [
        "gorilla",
        "\u30B4\u30EA\u30E9",
        "Gorilla",
        "Japanese uses the \u30E9 row for both l and r, so gorilla becomes gorira.",
        "Gorila",
        "El japon\xE9s usa la fila de \u30E9 para la l y para la r, as\xED que gorila se vuelve gorira."
      ],
      [
        "koala",
        "\u30B3\u30A2\u30E9",
        "Koala",
        "Three beats, ko-a-ra, with no consonant between \u30B3 and \u30A2.",
        "Koala",
        "Tres pulsos, ko-a-ra, sin consonante entre \u30B3 y \u30A2."
      ],
      [
        "rabbit",
        "\u30A6\u30B5\u30AE",
        "Rabbit",
        "In Japan, the shapes on the full moon are a rabbit pounding rice cakes.",
        "Conejo",
        "En Jap\xF3n, las manchas de la luna llena son un conejo que golpea arroz para hacer mochi."
      ],
      [
        "tiger",
        "\u30C8\u30E9",
        "Tiger",
        "The tiger is one of the twelve animals of the Japanese zodiac.",
        "Tigre",
        "El tigre es uno de los doce animales del zodiaco japon\xE9s."
      ],
      [
        "monkey",
        "\u30B5\u30EB",
        "Monkey",
        "Nikk\u014D's famous three wise monkeys see, hear and speak no evil.",
        "Mono",
        "Los famosos tres monos sabios de Nikk\u014D no ven el mal, no lo oyen y no lo dicen."
      ],
      [
        "bear",
        "\u30AF\u30DE",
        "Bear",
        "Kumamon, a round black bear, is the mascot of Kumamoto.",
        "Oso",
        "Kumamon, un oso negro y redondo, es la mascota de Kumamoto."
      ],
      [
        "horse",
        "\u30A6\u30DE",
        "Horse",
        "Horse racing, \u7AF6\u99AC, draws big crowds in Japan on weekends.",
        "Caballo",
        "Las carreras de caballos, \u7AF6\u99AC, llenan los hip\xF3dromos de Jap\xF3n los fines de semana."
      ],
      [
        "cow",
        "\u30A6\u30B7",
        "Cow",
        "Beef is \u725B\u8089, the kanji for cow followed by the kanji for meat.",
        "Vaca",
        "La carne de res es \u725B\u8089, el kanji de vaca seguido del kanji de carne."
      ],
      [
        "mouse",
        "\u30CD\u30BA\u30DF",
        "Mouse",
        "A real mouse is \u30CD\u30BA\u30DF, but the cartoon one is \u30DF\u30C3\u30AD\u30FC\u30DE\u30A6\u30B9.",
        "Rat\xF3n",
        "Un rat\xF3n de verdad es \u30CD\u30BA\u30DF, pero el de los dibujos animados es \u30DF\u30C3\u30AD\u30FC\u30DE\u30A6\u30B9."
      ],
      [
        "turtle",
        "\u30AB\u30E1",
        "Turtle",
        "An old saying gives the crane a thousand years and the turtle ten thousand.",
        "Tortuga",
        "Un viejo dicho le da a la grulla mil a\xF1os y a la tortuga diez mil."
      ],
      [
        "shark",
        "\u30B5\u30E1",
        "Shark",
        "In parts of western Japan a shark is also called \u30EF\u30CB, the word for crocodile elsewhere.",
        "Tibur\xF3n",
        "En partes del oeste de Jap\xF3n al tibur\xF3n tambi\xE9n le dicen \u30EF\u30CB, que en otros lugares es cocodrilo."
      ],
      [
        "octopus",
        "\u30BF\u30B3",
        "Octopus",
        "Takoyaki, \u305F\u3053\u713C\u304D, are balls of batter with a piece of octopus inside.",
        "Pulpo",
        "Los takoyaki, \u305F\u3053\u713C\u304D, son bolitas de masa con un trozo de pulpo adentro."
      ],
      [
        "pigeon",
        "\u30CF\u30C8",
        "Pigeon",
        "Tokyo's yellow sightseeing buses are called \u306F\u3068\u30D0\u30B9, pigeon bus.",
        "Paloma",
        "Los autobuses tur\xEDsticos amarillos de Tokio se llaman \u306F\u3068\u30D0\u30B9, autob\xFAs paloma."
      ],
      [
        "crow",
        "\u30AB\u30E9\u30B9",
        "Crow",
        "City crows in Japan are famous for raiding rubbish, so many bins wear nets.",
        "Cuervo",
        "En Jap\xF3n, los cuervos de ciudad son famosos por revolver la basura, por eso muchas bolsas se tapan con redes."
      ],
      [
        "crane",
        "\u30C4\u30EB",
        "Crane",
        "A string of a thousand paper cranes, \u5343\u7FBD\u9DB4, carries a wish for health or peace.",
        "Grulla",
        "Una cadena de mil grullas de papel, \u5343\u7FBD\u9DB4, lleva un deseo de salud o de paz."
      ],
      [
        "duck",
        "\u30A2\u30D2\u30EB",
        "Duck",
        "The ugly duckling is \u307F\u306B\u304F\u3044\u30A2\u30D2\u30EB\u306E\u5B50 in Japanese.",
        "Pato",
        "El patito feo es \u307F\u306B\u304F\u3044\u30A2\u30D2\u30EB\u306E\u5B50 en japon\xE9s."
      ]
    ],
    sounds: [
      [
        "dokidoki",
        "\u3069\u304D\u3069\u304D",
        "Heart pounding",
        "Your heart goes \u3069\u304D\u3069\u304D before a test or a first date.",
        "Coraz\xF3n acelerado",
        "El coraz\xF3n hace \u3069\u304D\u3069\u304D antes de un examen o de una primera cita."
      ],
      [
        "wakuwaku",
        "\u308F\u304F\u308F\u304F",
        "Excited",
        "The can't-wait feeling before a trip or a festival is \u308F\u304F\u308F\u304F.",
        "Emocionado",
        "Esa emoci\xF3n de no poder esperar antes de un viaje o un festival es \u308F\u304F\u308F\u304F."
      ],
      [
        "nikoniko",
        "\u306B\u3053\u306B\u3053",
        "Smiling",
        "A friend who smiles all the time is always \u306B\u3053\u306B\u3053.",
        "Sonriente",
        "Un amigo que sonr\xEDe todo el tiempo siempre est\xE1 \u306B\u3053\u306B\u3053."
      ],
      [
        "gorogoro",
        "\u3054\u308D\u3054\u308D",
        "Rumbling",
        "Thunder rumbles \u3054\u308D\u3054\u308D, and lazing around at home all day is \u3054\u308D\u3054\u308D too.",
        "Retumbando",
        "El trueno retumba \u3054\u308D\u3054\u308D, y pasar todo el d\xEDa tirado en casa tambi\xE9n es \u3054\u308D\u3054\u308D."
      ],
      [
        "pokapoka",
        "\u307D\u304B\u307D\u304B",
        "Sunny and warm",
        "Spring sunshine that warms your back is \u307D\u304B\u307D\u304B.",
        "C\xE1lido y soleado",
        "El sol de primavera que te calienta la espalda es \u307D\u304B\u307D\u304B."
      ],
      [
        "hokahoka",
        "\u307B\u304B\u307B\u304B",
        "Steaming hot",
        "Fresh rice or a just-baked sweet potato is \u307B\u304B\u307B\u304B.",
        "Humeante",
        "El arroz reci\xE9n hecho o un camote reci\xE9n horneado est\xE1 \u307B\u304B\u307B\u304B."
      ],
      [
        "guruguru",
        "\u3050\u308B\u3050\u308B",
        "Round and round",
        "Dizzy eyes in manga are drawn as \u3050\u308B\u3050\u308B spirals.",
        "Dando vueltas",
        "En el manga, los ojos mareados se dibujan como espirales \u3050\u308B\u3050\u308B."
      ],
      [
        "iraira",
        "\u3044\u3089\u3044\u3089",
        "Irritated",
        "Waiting for a late train can make anyone \u3044\u3089\u3044\u3089.",
        "Irritado",
        "Esperar un tren atrasado pone \u3044\u3089\u3044\u3089 a cualquiera."
      ],
      [
        "butsubutsu",
        "\u3076\u3064\u3076\u3064",
        "Grumbling",
        "Muttering complaints is \u3076\u3064\u3076\u3064, and so is a rash of little bumps.",
        "Refunfu\xF1ando",
        "Quejarse entre dientes es \u3076\u3064\u3076\u3064, y un sarpullido de granitos tambi\xE9n."
      ],
      [
        "boroboro",
        "\u307C\u308D\u307C\u308D",
        "Falling apart",
        "Old sneakers, a battered book or a tired body can all be \u307C\u308D\u307C\u308D.",
        "Hecho pedazos",
        "Unos zapatos viejos, un libro maltratado o un cuerpo cansado pueden estar \u307C\u308D\u307C\u308D."
      ],
      [
        "kutakuta",
        "\u304F\u305F\u304F\u305F",
        "Exhausted",
        "After a long day of sightseeing, your legs are \u304F\u305F\u304F\u305F.",
        "Agotado",
        "Despu\xE9s de un largo d\xEDa de paseo, las piernas quedan \u304F\u305F\u304F\u305F."
      ],
      [
        "batabata",
        "\u3070\u305F\u3070\u305F",
        "In a rush",
        "A hectic morning is \u3070\u305F\u3070\u305F, like wings flapping in a hurry.",
        "A las carreras",
        "Una ma\xF1ana agitada es \u3070\u305F\u3070\u305F, como alas que aletean a toda prisa."
      ],
      [
        "burabura",
        "\u3076\u3089\u3076\u3089",
        "Wandering about",
        "Strolling around town with no plan is \u3076\u3089\u3076\u3089.",
        "Paseando sin rumbo",
        "Pasear por la ciudad sin ning\xFAn plan es \u3076\u3089\u3076\u3089."
      ],
      [
        "bikkuri",
        "\u3073\u3063\u304F\u308A",
        "Surprised",
        "Say \u3073\u3063\u304F\u308A\u3057\u305F after a scare: that startled me!",
        "Sorprendido",
        "Di \u3073\u3063\u304F\u308A\u3057\u305F despu\xE9s de un susto: \xA1me asust\xE9!"
      ],
      [
        "gakkari",
        "\u304C\u3063\u304B\u308A",
        "Disappointed",
        "Rain on the day of a picnic makes everyone \u304C\u3063\u304B\u308A.",
        "Decepcionado",
        "La lluvia el d\xEDa del p\xEDcnic deja a todos \u304C\u3063\u304B\u308A."
      ],
      [
        "nonbiri",
        "\u306E\u3093\u3073\u308A",
        "Taking it easy",
        "A slow Sunday with nothing planned is \u306E\u3093\u3073\u308A.",
        "Con calma",
        "Un domingo tranquilo y sin planes es \u306E\u3093\u3073\u308A."
      ],
      [
        "gussuri",
        "\u3050\u3063\u3059\u308A",
        "Fast asleep",
        "After a warm bath you sleep \u3050\u3063\u3059\u308A all night.",
        "Profundamente dormido",
        "Despu\xE9s de un ba\xF1o caliente duermes \u3050\u3063\u3059\u308A toda la noche."
      ],
      [
        "yukkuri",
        "\u3086\u3063\u304F\u308A",
        "Slowly",
        "Ask someone to slow down with \u3086\u3063\u304F\u308A\u304A\u9858\u3044\u3057\u307E\u3059.",
        "Despacio",
        "Para pedirle a alguien que vaya m\xE1s despacio, di \u3086\u3063\u304F\u308A\u304A\u9858\u3044\u3057\u307E\u3059."
      ]
    ],
    everyday: [
      [
        "ohayou",
        "\u304A\u306F\u3088\u3046",
        "Good morning",
        "Add \u3054\u3056\u3044\u307E\u3059 to make it polite: \u304A\u306F\u3088\u3046\u3054\u3056\u3044\u307E\u3059.",
        "Buenos d\xEDas",
        "Agrega \u3054\u3056\u3044\u307E\u3059 para decirlo con cortes\xEDa: \u304A\u306F\u3088\u3046\u3054\u3056\u3044\u307E\u3059."
      ],
      [
        "arigatou",
        "\u3042\u308A\u304C\u3068\u3046",
        "Thank you",
        "The \u3046 at the end stretches the o, so it is said arigatoo.",
        "Gracias",
        "La \u3046 final alarga la o, as\xED que se dice arigatoo."
      ],
      [
        "oyasumi",
        "\u304A\u3084\u3059\u307F",
        "Good night",
        "Said when someone goes to bed, never as an evening hello.",
        "Buenas noches",
        "Se dice cuando alguien se va a dormir, nunca como saludo de la noche."
      ],
      [
        "itadakimasu",
        "\u3044\u305F\u3060\u304D\u307E\u3059",
        "Let's eat",
        "Said with hands together before a meal, thanking everyone who made it possible.",
        "A comer",
        "Se dice con las manos juntas antes de comer, para agradecer a todos los que hicieron posible la comida."
      ],
      [
        "gochisousama",
        "\u3054\u3061\u305D\u3046\u3055\u307E",
        "Thanks for the meal",
        "The partner of \u3044\u305F\u3060\u304D\u307E\u3059, said when you finish eating.",
        "Gracias por la comida",
        "Es la pareja de \u3044\u305F\u3060\u304D\u307E\u3059, y se dice al terminar de comer."
      ],
      [
        "tadaima",
        "\u305F\u3060\u3044\u307E",
        "I'm home",
        "Say it as you come through the door, and your family answers \u304A\u304B\u3048\u308A.",
        "Ya llegu\xE9",
        "Dilo al entrar por la puerta, y tu familia te responde \u304A\u304B\u3048\u308A."
      ],
      [
        "sugoi",
        "\u3059\u3054\u3044",
        "Amazing",
        "Stretch it to \u3059\u3054\u30FC\u3044 when you are really impressed.",
        "Incre\xEDble",
        "Al\xE1rgalo a \u3059\u3054\u30FC\u3044 cuando algo de verdad te impresiona."
      ],
      [
        "oishii",
        "\u304A\u3044\u3057\u3044",
        "Delicious",
        "Say it after the first bite and the cook will smile.",
        "Delicioso",
        "Dilo despu\xE9s del primer bocado y quien cocin\xF3 va a sonre\xEDr."
      ],
      [
        "kawaii",
        "\u304B\u308F\u3044\u3044",
        "Cute",
        "It covers anything cute, from kittens to tiny erasers.",
        "Lindo",
        "Sirve para todo lo lindo, desde gatitos hasta gomas de borrar diminutas."
      ],
      [
        "yatta",
        "\u3084\u3063\u305F",
        "I did it",
        "Shout \u3084\u3063\u305F when you pass a test or win a game.",
        "Lo logr\xE9",
        "Grita \u3084\u3063\u305F cuando apruebas un examen o ganas un juego."
      ],
      [
        "sakura",
        "\u3055\u304F\u3089",
        "Cherry blossom",
        "In spring, friends picnic under the \u3055\u304F\u3089, a custom called \u304A\u82B1\u898B.",
        "Flor de cerezo",
        "En primavera, los amigos hacen p\xEDcnic bajo las \u3055\u304F\u3089, una costumbre llamada \u304A\u82B1\u898B."
      ],
      [
        "sushi",
        "\u3059\u3057",
        "Sushi",
        "At conveyor-belt sushi, \u56DE\u8EE2\u5BFF\u53F8, the plates ride past your seat.",
        "Sushi",
        "En el sushi giratorio, \u56DE\u8EE2\u5BFF\u53F8, los platos pasan frente a tu asiento."
      ],
      [
        "gomennasai",
        "\u3054\u3081\u3093\u306A\u3055\u3044",
        "I'm sorry",
        "With close friends, \u3054\u3081\u3093 alone is enough.",
        "Perd\xF3n",
        "Con amigos cercanos, basta con \u3054\u3081\u3093."
      ],
      [
        "hajimemashite",
        "\u306F\u3058\u3081\u307E\u3057\u3066",
        "Nice to meet you",
        "Said only the first time you meet someone, before your name.",
        "Mucho gusto",
        "Se dice solo la primera vez que conoces a alguien, antes de tu nombre."
      ],
      [
        "ureshii",
        "\u3046\u308C\u3057\u3044",
        "Happy",
        "Use it for your own happy feelings, like opening a present.",
        "Feliz",
        "\xDAsalo para tu propia alegr\xEDa, como al abrir un regalo."
      ],
      [
        "omedetou",
        "\u304A\u3081\u3067\u3068\u3046",
        "Congratulations",
        "Put \u304A\u8A95\u751F\u65E5 in front for happy birthday: \u304A\u8A95\u751F\u65E5\u304A\u3081\u3067\u3068\u3046.",
        "Felicidades",
        "Pon \u304A\u8A95\u751F\u65E5 delante para decir feliz cumplea\xF1os: \u304A\u8A95\u751F\u65E5\u304A\u3081\u3067\u3068\u3046."
      ],
      [
        "moshimoshi",
        "\u3082\u3057\u3082\u3057",
        "Hello (on the phone)",
        "The phone hello: you would not say it face to face.",
        "Hola (por tel\xE9fono)",
        "Es el hola del tel\xE9fono: no se dice cara a cara."
      ],
      [
        "ocha",
        "\u304A\u3061\u3083",
        "Green tea",
        "In Japan \u304A\u8336 usually means green tea, often served free with meals.",
        "T\xE9 verde",
        "En Jap\xF3n, \u304A\u8336 suele ser t\xE9 verde, y muchas veces lo sirven gratis con la comida."
      ]
    ]
  };
  var THEMES = new Map(KANA_READ_THEMES.map((theme) => [theme.id, theme]));
  var itemsOf = (theme) => (ITEMS[theme] || []).map(([id, kana, en, note, es, noteEs]) => ({ id, kana, en, note, es, noteEs }));
  var meaningOf = (item) => t({ en: item.en, es: item.es });
  var noteOf = (item) => t({ en: item.note, es: item.noteEs });
  var titleOf = (theme) => t({ en: theme.title, es: theme.titleEs });
  var roundLength = (theme) => Math.min(ROUND, (ITEMS[theme] || []).length);
  var CAP2 = 1e6;
  var count2 = (n2) => Number.isSafeInteger(n2) && n2 >= 0 && n2 <= CAP2 ? n2 : 0;
  var object3 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var emptyStats2 = () => ({ rounds: 0, best: 0, correct: 0, answered: 0, assisted: 0, misses: {} });
  function kanaReadThemes() {
    return KANA_READ_THEMES.map((theme) => ({
      id: theme.id,
      script: theme.script,
      title: titleOf(theme),
      subtitle: t({ en: theme.subtitle, es: theme.subtitleEs }),
      count: ITEMS[theme.id].length
    }));
  }
  function question2(item, items, rand) {
    const options = [item];
    for (const other of shuffle(items.filter((o) => o.id !== item.id), rand)) {
      if (options.length === 4) break;
      if (options.every((o) => o.en !== other.en)) options.push(other);
    }
    return { target: item.id, options: shuffle(options.map((o) => o.id), rand) };
  }
  var KanaReads = class {
    constructor(document2) {
      this.stats = {};
      this.round = null;
      this.recovered = false;
      if (document2 == null) return;
      if (!object3(document2) || document2.v !== 1 || !object3(document2.stats)) {
        this.recovered = true;
        return;
      }
      for (const [theme, value] of Object.entries(document2.stats)) {
        if (!THEMES.has(theme) || !object3(value)) {
          this.recovered = true;
          continue;
        }
        const ids = new Set(ITEMS[theme].map(([id]) => id));
        const misses = {};
        if (!object3(value.misses)) this.recovered = true;
        for (const [id, n2] of Object.entries(object3(value.misses) ? value.misses : {})) {
          if (!ids.has(id) || n2 !== count2(n2)) this.recovered = true;
          if (ids.has(id) && count2(n2)) misses[id] = count2(n2);
        }
        const answered = count2(value.answered), correct = Math.min(answered, count2(value.correct));
        const clean = {
          rounds: count2(value.rounds),
          best: Math.min(roundLength(theme), count2(value.best)),
          correct,
          answered,
          assisted: Math.min(answered - correct, count2(value.assisted)),
          misses
        };
        if (["rounds", "best", "correct", "answered", "assisted"].some((k) => value[k] !== clean[k])) this.recovered = true;
        this.stats[theme] = clean;
      }
      if (document2.round != null) {
        if (validRound(document2.round)) this.round = JSON.parse(JSON.stringify(document2.round));
        else this.recovered = true;
      }
    }
    /** Throws when a round is in progress or the theme is unknown. */
    start({ theme, seed = Date.now() } = {}) {
      if (this.round && this.round.at < this.round.questions.length) {
        throw new Error(t({ en: "Finish or leave the current round first.", es: "Primero termina la ronda actual o sal de ella." }));
      }
      if (!THEMES.has(theme)) throw new Error(t({ en: "Choose one of the themes.", es: "Elige uno de los temas." }));
      const items = itemsOf(theme), rand = makeRand(seed);
      const misses = (this.stats[theme] || emptyStats2()).misses;
      const drawn = drawWeighted(items, roundLength(theme), (item) => weightOf(misses[item.id] || 0), rand);
      this.round = { id: `${theme}:${Number(seed) >>> 0}`, theme, questions: drawn.map((item) => question2(item, items, rand)), at: 0, picks: [], hinted: false };
      return this.view();
    }
    /**
     * 'hint', 'answer' (with `pick`, an option id), 'skip', 'next' or 'leave'.
     * Every action but leave names the question on screen by its `id`; any
     * other id is a stale or double tap and changes nothing.
     */
    act(action, { id, pick: pick2 } = {}) {
      const r = this.round;
      if (!r) return this.view();
      if (action === "leave") {
        this.round = null;
        return this.view();
      }
      const total = r.questions.length;
      if (r.at >= total || id !== `${r.id}:${r.at}`) return this.view();
      const q = r.questions[r.at];
      const answered = r.picks.length > r.at;
      if (action === "hint" && !answered) r.hinted = true;
      if ((action === "answer" || action === "skip") && !answered) {
        if (action === "answer" && !q.options.includes(pick2)) return this.view();
        const chosen = action === "skip" ? null : pick2;
        r.picks.push({ id: chosen, hint: r.hinted });
        if (chosen !== q.target && r.at + 3 < total) r.questions[r.at + 3] = { target: q.target, options: [...q.options] };
      }
      if (action === "next" && answered) {
        r.at += 1;
        r.hinted = false;
        if (r.at === total) this.record();
      }
      return this.view();
    }
    record() {
      const r = this.round, s = this.stats[r.theme] || emptyStats2(), result = this.result();
      s.rounds = Math.min(CAP2, s.rounds + 1);
      s.best = Math.max(s.best, result.correct);
      s.correct = Math.min(CAP2, s.correct + result.correct);
      s.answered = Math.min(CAP2, s.answered + result.total);
      s.assisted = Math.min(CAP2, s.assisted + result.assisted);
      r.picks.forEach((p, i) => {
        const target = r.questions[i].target;
        if (p.id !== target || p.hint) s.misses[target] = Math.min(CAP2, (s.misses[target] || 0) + 1);
      });
      this.stats[r.theme] = s;
    }
    result() {
      const r = this.round;
      return {
        correct: r.picks.filter((p, i) => p.id === r.questions[i].target && !p.hint).length,
        assisted: r.picks.filter((p) => p.hint).length,
        skipped: r.picks.filter((p) => p.id === null).length,
        total: r.questions.length
      };
    }
    view() {
      const base = { recovered: this.recovered, stats: this.stats, status: "idle", round: null };
      const r = this.round;
      if (!r) return base;
      const theme = THEMES.get(r.theme), total = r.questions.length;
      const details = { theme: r.theme, script: theme.script, title: titleOf(theme), position: Math.min(r.at + 1, total), total, result: this.result(), question: null };
      if (r.at === total) return { ...base, status: "complete", round: details };
      const byId = new Map(itemsOf(r.theme).map((item) => [item.id, item]));
      const q = r.questions[r.at], target = byId.get(q.target), pick2 = r.picks[r.at];
      const answered = Boolean(pick2);
      details.question = {
        id: `${r.id}:${r.at}`,
        kana: target.kana,
        answered,
        hinted: r.hinted,
        romaji: r.hinted || answered ? said(target.kana) : null,
        meaning: answered ? meaningOf(target) : null,
        note: answered ? noteOf(target) : null,
        correctId: answered ? target.id : null,
        pickedId: answered ? pick2.id : null,
        right: answered ? pick2.id === target.id : null,
        options: q.options.map((oid) => ({ id: oid, label: meaningOf(byId.get(oid)) }))
      };
      return { ...base, status: "playing", round: details };
    }
    dump() {
      return { v: 1, stats: this.stats, round: this.round };
    }
  };
  function validRound(r) {
    if (!object3(r) || !THEMES.has(r.theme) || typeof r.id !== "string" || !r.id || r.id.length > 80) return false;
    const total = roundLength(r.theme);
    if (!Number.isInteger(r.at) || r.at < 0 || r.at > total || !Array.isArray(r.questions) || r.questions.length !== total) return false;
    if (!Array.isArray(r.picks) || r.picks.length < r.at || r.picks.length > Math.min(total, r.at + 1) || typeof r.hinted !== "boolean") return false;
    const byId = new Map(itemsOf(r.theme).map((item) => [item.id, item]));
    return r.questions.every((q, i) => {
      if (!object3(q) || !byId.has(q.target) || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4 || !q.options.includes(q.target)) return false;
      if (!q.options.every((oid) => byId.has(oid)) || new Set(q.options.map((oid) => byId.get(oid).en)).size !== q.options.length) return false;
      if (i > 0 && r.questions[i - 1].target === q.target) return false;
      const p = r.picks[i];
      return i >= r.picks.length || object3(p) && typeof p.hint === "boolean" && (p.id === null || q.options.includes(p.id));
    });
  }

  // js/mascot-lines.js
  init_kana();
  var MASCOT_MOMENTS = Object.freeze([
    "morning",
    "day",
    "evening",
    "night",
    "welcome",
    "start",
    "perfect",
    "finish",
    "relief",
    "retry",
    "comfort",
    "fun",
    "goodbye",
    "understood"
  ]);
  var LINES = Object.freeze({
    morning: ["ohayou-gozaimasu", "\u304A\u306F\u3088\u3046 \u3054\u3056\u3044\u307E\u3059"],
    day: ["konnichiwa", "\u3053\u3093\u306B\u3061\u306F"],
    evening: ["konbanwa", "\u3053\u3093\u3070\u3093\u306F"],
    night: ["oyasuminasai", "\u304A\u3084\u3059\u307F\u306A\u3055\u3044"],
    welcome: ["okaerinasai", "\u304A\u304B\u3048\u308A\u306A\u3055\u3044"],
    start: ["yoroshiku", "\u3088\u308D\u3057\u304F \u304A\u306D\u304C\u3044\u3057\u307E\u3059"],
    perfect: ["sugoi", "\u3059\u3054\u3044"],
    finish: ["otsukaresama", "\u304A\u3064\u304B\u308C\u3055\u307E \u3067\u3059"],
    relief: ["yokatta", "\u3088\u304B\u3063\u305F"],
    retry: ["mou-ichido", "\u3082\u3046 \u3044\u3061\u3069 \u304A\u306D\u304C\u3044\u3057\u307E\u3059"],
    comfort: ["daijoubu-desu", "\u3060\u3044\u3058\u3087\u3046\u3076 \u3067\u3059"],
    fun: ["tanoshikatta", "\u305F\u306E\u3057\u304B\u3063\u305F \u3067\u3059"],
    goodbye: ["jaa-mata", "\u3058\u3083\u3042 \u307E\u305F"],
    understood: ["wakarimashita", "\u308F\u304B\u308A\u307E\u3057\u305F"]
  });
  var FINAL_WA2 = /^(こんにちは|こんばんは)$/u;
  function mascotLine(library2, moment, { lang: lang2 = "en" } = {}) {
    if (!MASCOT_MOMENTS.includes(moment)) return null;
    const [id, spaced] = LINES[moment];
    const p = (library2?.phrases || []).find((x) => x.id === id);
    if (!p) return null;
    const say2 = spaced.replace(/ /g, "") === p.kana ? spaced : p.kana;
    return { moment, id, ja: p.ja, kana: p.kana, meaning: p[lang2] || p.en, romaji: said(say2, { finalWa: FINAL_WA2.test(p.kana) }) };
  }
  function greetingMoment(hour) {
    const h = Math.floor(Number(hour));
    if (h >= 5 && h <= 10) return "morning";
    if (h >= 11 && h <= 17) return "day";
    if (h >= 18 && h <= 22) return "evening";
    return "night";
  }

  // js/kanji-cards.js
  init_kana();
  var ROUND_SIZE = 20;
  var MODES = Object.freeze(["flip", "quiz"]);
  var CARD_READINGS = 3;
  var CARD_MEANINGS = 4;
  var QUIZ_CHOICES = 4;
  var CAP3 = 1e6;
  var STRONG_BOX2 = 4;
  var DAY5 = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  var DECK = /^[a-z0-9-]{1,40}$/;
  var CARD_FIELDS2 = ["box", "due", "reviews", "lapses"];
  var object4 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var isCount5 = (n2) => Number.isSafeInteger(n2) && n2 >= 0 && n2 <= CAP3;
  var isDay2 = (v) => typeof v === "string" && DAY5.test(v);
  var isKanji4 = (ch) => typeof ch === "string" && [...ch].length === 1 && hasKanji(ch);
  var earlier2 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  var bounded2 = (rec) => ({ box: rec.box, due: rec.due, reviews: Math.min(CAP3, rec.reviews), lapses: Math.min(CAP3, rec.lapses) });
  var labelKey = (label) => String(label || "").trim().toLowerCase();
  function cardEntry(rec, { level = null, row = null, es = null } = {}) {
    if (!object4(rec)) return null;
    const m = (rec.m || []).filter((x) => !/radical/i.test(x)).slice(0, CARD_MEANINGS);
    const card2 = {
      label: row ? String(row[1]).split(",")[0].trim() : m[0] || "",
      m,
      on: (rec.on || []).slice(0, CARD_READINGS).map((r) => [r.replace(/[.-]/g, ""), readingRomaji(r)]),
      kun: (rec.kun || []).slice(0, CARD_READINGS).map((r) => [readingKana(r), readingRomaji(r)]),
      s: Number.isInteger(rec.s) ? rec.s : 0,
      ...rec.g ? { g: rec.g } : {},
      ...level ? { n: level } : {},
      ...row ? { w: [row[2], row[3], row[4]] } : {}
    };
    const spanish2 = object4(es) ? cardEs(es, card2) : null;
    return spanish2 ? { ...card2, es: spanish2 } : card2;
  }
  function cardEs({ m = null, gloss = null }, card2) {
    const out = {};
    const meanings = (Array.isArray(m) ? m : []).filter((x) => typeof x === "string" && x && !/radical/i.test(x)).slice(0, CARD_MEANINGS);
    if (meanings.length) {
      out.label = meanings[0];
      out.m = meanings;
    }
    if (card2.w && typeof gloss === "string" && gloss) out.w = [card2.w[0], card2.w[1], gloss];
    return Object.keys(out).length ? out : null;
  }
  function quizLabel(entry, spanish2 = false) {
    if (!object4(entry)) return "";
    return spanish2 && object4(entry.es) && entry.es.label || entry.label || "";
  }
  function optionWithEs(option, entry) {
    if (!object4(option) || !object4(entry) || !object4(entry.es) || !entry.es.label || option.label !== entry.es.label) return option;
    return { ch: option.ch, label: entry.label, es: { label: entry.es.label } };
  }
  function distinctLabels(chars3, labels) {
    return new Set(chars3.map((ch) => labelKey(labels[ch])).filter(Boolean)).size;
  }
  function readiness2(mode, pool, labels) {
    if (!MODES.includes(mode)) return { ready: false, message: t({ en: "Choose cards or the quiz.", es: "Elige las tarjetas o la prueba." }) };
    if (!pool.length) return { ready: false, message: t({ en: "There are no kanji in this set yet.", es: "Todav\xEDa no hay kanji en este grupo." }) };
    if (mode === "quiz" && distinctLabels(pool, labels) < QUIZ_CHOICES) {
      return {
        ready: false,
        message: t({
          en: `The quiz needs ${QUIZ_CHOICES} kanji with different meanings. Turn cards over instead, or add kanji to this set.`,
          es: `La prueba necesita ${QUIZ_CHOICES} kanji con significados distintos. Mejor voltea las tarjetas, o agrega kanji a este grupo.`
        })
      };
    }
    return {
      ready: true,
      message: mode === "quiz" ? t({ en: "Pick each kanji's meaning from four.", es: "Elige el significado de cada kanji entre cuatro." }) : t({ en: "Turn each card over and say how it went.", es: "Voltea cada tarjeta y di c\xF3mo te fue." })
    };
  }
  function cleanCard2(v) {
    if (!object4(v) || !Number.isInteger(v.box) || v.box < 0 || v.box > TOP_BOX) return null;
    if (!isDay2(v.due) || !isCount5(v.reviews) || !isCount5(v.lapses)) return null;
    return { card: { box: v.box, due: v.due, reviews: v.reviews, lapses: v.lapses }, extra: Object.keys(v).some((k) => !CARD_FIELDS2.includes(k)) };
  }
  function choicesFor(ch, pool, labels, rand) {
    const taken = /* @__PURE__ */ new Set([labelKey(labels[ch])]);
    const others = [];
    for (const other of shuffle(pool.filter((c) => c !== ch), rand)) {
      const key = labelKey(labels[other]);
      if (!key || taken.has(key)) continue;
      taken.add(key);
      others.push(other);
      if (others.length === QUIZ_CHOICES - 1) break;
    }
    return shuffle([ch, ...others], rand);
  }
  function cleanQuiz(q, chars3) {
    if (!object4(q) || !object4(q.options) || !object4(q.labels)) return null;
    const options = {};
    for (const ch of chars3) {
      const list2 = q.options[ch];
      if (!Array.isArray(list2) || list2.length !== QUIZ_CHOICES || !list2.includes(ch) || new Set(list2).size !== list2.length || !list2.every(isKanji4)) return null;
      options[ch] = [...list2];
    }
    const labels = {};
    for (const ch of new Set(Object.values(options).flat())) {
      const label = q.labels[ch];
      if (typeof label !== "string" || !label.trim() || label.length > 80) return null;
      labels[ch] = label;
    }
    return { options, labels };
  }
  function cleanSession2(s) {
    if (!object4(s) || typeof s.id !== "string" || !s.id || s.id.length > 80) return null;
    if (typeof s.deck !== "string" || !DECK.test(s.deck) || !MODES.includes(s.mode) || !isDay2(s.today)) return null;
    const unique = (v) => Array.isArray(v) && v.every(isKanji4) && new Set(v).size === v.length;
    if (!unique(s.chars) || !s.chars.length || s.chars.length > ROUND_SIZE || !unique(s.queue) || !unique(s.ahead)) return null;
    if (!Array.isArray(s.first) || !s.first.every((p) => Array.isArray(p) && p.length === 2 && typeof p[1] === "boolean")) return null;
    const answered = s.first.map(([ch]) => ch);
    if (answered.some((ch, i) => ch !== s.chars[i])) return null;
    const waiting = s.chars.slice(answered.length);
    if (waiting.some((ch, i) => s.queue[i] !== ch)) return null;
    const first = new Map(s.first);
    const back = s.queue.slice(waiting.length);
    if (back.some((ch) => first.get(ch) !== false)) return null;
    if (!isCount5(s.repeats) || typeof s.shown !== "boolean" || s.shown && !s.queue.length) return null;
    if (s.first.filter(([ch, ok]) => !ok && !back.includes(ch)).length > s.repeats) return null;
    if (!object4(s.before) || Object.keys(s.before).length !== s.chars.length) return null;
    if (!s.chars.every((ch) => Number.isInteger(s.before[ch]) && s.before[ch] >= -1 && s.before[ch] <= TOP_BOX)) return null;
    if (s.ahead.some((ch) => !s.chars.includes(ch) || s.before[ch] < 0)) return null;
    const quiz = s.mode === "quiz" ? cleanQuiz(s.quiz, s.chars) : null;
    if (s.mode === "quiz" && !quiz) return null;
    if (s.mode === "flip" && s.quiz != null) return null;
    let picked = null;
    if (s.mode === "quiz") {
      if (s.shown !== (s.picked != null)) return null;
      if (s.picked != null) {
        if (typeof s.picked !== "string" || s.picked !== "" && !quiz.options[s.queue[0]].includes(s.picked)) return null;
        picked = s.picked;
      }
    } else if (s.picked != null) return null;
    return {
      id: s.id,
      deck: s.deck,
      mode: s.mode,
      today: s.today,
      chars: [...s.chars],
      before: Object.fromEntries(s.chars.map((ch) => [ch, s.before[ch]])),
      ahead: [...s.ahead],
      quiz,
      picked,
      review: { queue: [...s.queue], total: s.chars.length, shown: s.shown, first, repeats: s.repeats }
    };
  }
  function moveCard2(cards2, s, ch, ok) {
    const card2 = cards2[ch];
    if (card2 && s.ahead.includes(ch)) {
      cards2[ch] = ok ? { ...card2, reviews: Math.min(CAP3, card2.reviews + 1) } : bounded2(schedule(card2, false, s.today));
    } else {
      cards2[ch] = bounded2(schedule(card2 || { box: 0, due: s.today, reviews: 0, lapses: 0 }, ok, s.today));
    }
  }
  var stepId2 = (s) => `${s.id}:${s.review.first.size + s.review.repeats}`;
  var KanjiCards = class {
    constructor(document2) {
      this.cards = {};
      this.session = null;
      this.recovered = false;
      if (document2 == null) return;
      if (!object4(document2) || document2.v !== 1 || !object4(document2.cards)) {
        this.recovered = true;
        return;
      }
      for (const [ch, value] of Object.entries(document2.cards)) {
        const clean = isKanji4(ch) ? cleanCard2(value) : null;
        if (!clean || clean.extra) this.recovered = true;
        if (clean) this.cards[ch] = clean.card;
      }
      if (document2.session != null) {
        this.session = cleanSession2(document2.session);
        if (!this.session) this.recovered = true;
      }
    }
    /**
     * Where a set's kanji stand on `today`. The four counts split `total`: fresh
     * (never answered here), due (answered, due today or earlier), strong (not
     * due, box 4 or 5) and learning (the rest).
     */
    overview({ chars: chars3 = [], mode = "flip", labels = {}, today = dayOf(Date.now()) } = {}) {
      if (!isDay2(today)) throw new Error("Expected today as YYYY-MM-DD.");
      const pool = [...new Set(chars3.filter(isKanji4))];
      const counts2 = { due: 0, fresh: 0, learning: 0, strong: 0 };
      for (const ch of pool) {
        const card2 = this.cards[ch];
        counts2[!card2 ? "fresh" : card2.due <= today ? "due" : card2.box >= STRONG_BOX2 ? "strong" : "learning"] += 1;
      }
      return { total: pool.length, ...counts2, ...readiness2(mode, mode === "quiz" ? pool.filter((ch) => labelKey(labels[ch])) : pool, labels) };
    }
    /**
     * Up to ROUND_SIZE kanji of `chars`: the due ones first (the longest
     * overdue, then the lower box, then the set's order), then those never
     * answered, in the set's order, and only when that is still short, practice
     * ahead (the lowest box, then the soonest due). Each group is shuffled with
     * `seed`; the groups keep their order. The quiz needs `labels` for the set.
     */
    start({ deck, chars: chars3 = [], mode = "flip", labels = {}, today = dayOf(Date.now()), seed = Date.now() } = {}) {
      if (this.session && !finished(this.session.review)) {
        throw new Error(t({ en: "Finish or leave the current round first.", es: "Primero termina la ronda actual o sal de ella." }));
      }
      if (typeof deck !== "string" || !DECK.test(deck)) throw new Error("Expected a set id.");
      if (!isDay2(today)) throw new Error("Expected today as YYYY-MM-DD.");
      let pool = [...new Set(chars3.filter(isKanji4))];
      if (mode === "quiz") pool = pool.filter((ch) => labelKey(labels[ch]));
      const { ready, message } = readiness2(mode, pool, labels);
      if (!ready) throw new Error(message);
      const order = new Map(pool.map((ch, i) => [ch, i]));
      const card2 = (ch) => this.cards[ch];
      const due = pool.filter((ch) => card2(ch) && card2(ch).due <= today).sort((a, b) => earlier2(card2(a).due, card2(b).due) || card2(a).box - card2(b).box || order.get(a) - order.get(b));
      const fresh = pool.filter((ch) => !card2(ch));
      const ahead = pool.filter((ch) => card2(ch) && card2(ch).due > today).sort((a, b) => card2(a).box - card2(b).box || earlier2(card2(a).due, card2(b).due) || order.get(a) - order.get(b));
      const rand = makeRand(seed);
      const chosen = [];
      for (const group of [due, fresh, ahead]) chosen.push(...shuffle(group.slice(0, ROUND_SIZE - chosen.length), rand));
      let quiz = null;
      if (mode === "quiz") {
        const options = Object.fromEntries(chosen.map((ch) => [ch, choicesFor(ch, pool, labels, rand)]));
        const shown = new Set(Object.values(options).flat());
        quiz = { options, labels: Object.fromEntries([...shown].map((ch) => [ch, String(labels[ch]).trim()])) };
      }
      this.session = {
        id: `${deck}:${mode}:${today}:${Number(seed) >>> 0}`,
        deck,
        mode,
        today,
        chars: chosen,
        before: Object.fromEntries(chosen.map((ch) => [ch, card2(ch) ? card2(ch).box : -1])),
        ahead: chosen.filter((ch) => card2(ch) && card2(ch).due > today),
        quiz,
        picked: null,
        review: createReview(chosen)
      };
      return this.view();
    }
    /**
     * Cards: 'show', then 'again' or 'got'. Quiz: 'answer' with `pick` (a
     * kanji among the options) or 'reveal', then 'next'. Every action but leave
     * names the card on screen by its `id`; any other id is a stale or double
     * tap and changes nothing. Leaving discards the round; kanji already
     * answered keep their boxes.
     */
    act(action, { id, pick: pick2 } = {}) {
      const s = this.session;
      if (!s) return this.view();
      if (action === "leave") {
        this.session = null;
        return this.view();
      }
      if (finished(s.review) || id !== stepId2(s)) return this.view();
      const r = s.review;
      const move = (ch, ok) => moveCard2(this.cards, s, ch, ok);
      if (s.mode === "flip") {
        if (action === "show") show(r);
        else if (action === "again" || action === "got") answer(r, action === "got", move);
      } else if (action === "answer" && s.picked === null && s.quiz.options[current2(r)].includes(pick2)) {
        s.picked = pick2;
        show(r);
      } else if (action === "reveal" && s.picked === null) {
        s.picked = "";
        show(r);
      } else if (action === "next" && s.picked !== null) {
        const ok = s.picked === current2(r);
        s.picked = null;
        answer(r, ok, move);
      }
      return this.view();
    }
    /**
     * status 'idle', 'playing' or 'complete'. Playing: the card on screen and
     * its box before this round (-1 never answered); in the quiz its four
     * options with their labels, the pick and whether it was right. Complete:
     * what the summary says, until 'leave' or a new start. `stronger` counts
     * kanji whose first answer moved them up a box (never practice ahead).
     */
    view() {
      const base = { recovered: this.recovered, status: "idle", session: null };
      const s = this.session;
      if (!s) return base;
      const r = s.review;
      const { at, of } = position(r);
      if (finished(r)) {
        const sum = summary(r);
        const stronger = [...r.first].filter(([ch2, ok]) => ok && !s.ahead.includes(ch2) && s.before[ch2] < TOP_BOX).length;
        return { ...base, status: "complete", session: { deck: s.deck, mode: s.mode, position: of, total: of, result: { reviewed: sum.reviewed, got: sum.got, again: sum.again, stronger } } };
      }
      const ch = current2(r);
      const card2 = { id: stepId2(s), ch, shown: r.shown, box: s.before[ch] };
      if (s.mode === "quiz") {
        card2.options = s.quiz.options[ch].map((c) => ({ ch: c, label: s.quiz.labels[c] }));
        card2.picked = s.picked;
        card2.right = s.picked === null ? null : s.picked === ch;
      }
      return { ...base, status: "playing", session: { deck: s.deck, mode: s.mode, position: at, total: of, isRepeat: isRepeat(r), card: card2 } };
    }
    dump() {
      const s = this.session;
      return {
        v: 1,
        cards: { ...this.cards },
        session: s && {
          id: s.id,
          deck: s.deck,
          mode: s.mode,
          today: s.today,
          chars: [...s.chars],
          queue: [...s.review.queue],
          shown: s.review.shown,
          first: [...s.review.first],
          repeats: s.review.repeats,
          before: { ...s.before },
          ahead: [...s.ahead],
          quiz: s.quiz,
          picked: s.picked
        }
      };
    }
  };

  // js/strokes.js
  var TRACE_TOLERANCE = 20;
  var TOKEN = /[MmLlHhVvCcSsZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[^\s,]/g;
  var COMMANDS = "MLHVCSZ";
  var round = (v) => Math.round(v * 100) / 100;
  var dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  var line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + 2 * (x1 - x0) / 3, y0 + 2 * (y1 - y0) / 3, x1, y1];
  function cubicsOf(d) {
    const tokens = String(d).match(TOKEN) || [];
    const out = [];
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let lastC2 = null;
    let cmd = null;
    let i = 0;
    const num = () => {
      const v = Number(tokens[i]);
      if (i >= tokens.length || !Number.isFinite(v)) throw new Error(`stroke path data is cut short: ${d}`);
      i += 1;
      return v;
    };
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) {
        cmd = tokens[i];
        i += 1;
        if (!COMMANDS.includes(cmd.toUpperCase())) throw new Error(`stroke path command ${cmd} is not drawn: ${d}`);
      } else if (cmd === null || !Number.isFinite(Number(tokens[i]))) {
        throw new Error(`stroke path data does not start with a command: ${d}`);
      }
      const rel = cmd !== cmd.toUpperCase();
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      switch (cmd.toUpperCase()) {
        case "M": {
          x = startX = num() + ox;
          y = startY = num() + oy;
          lastC2 = null;
          cmd = rel ? "l" : "L";
          break;
        }
        case "L": {
          const nx = num() + ox;
          const ny = num() + oy;
          out.push(line(x, y, nx, ny));
          [x, y, lastC2] = [nx, ny, null];
          break;
        }
        case "H": {
          const nx = num() + ox;
          out.push(line(x, y, nx, y));
          [x, lastC2] = [nx, null];
          break;
        }
        case "V": {
          const ny = num() + oy;
          out.push(line(x, y, x, ny));
          [y, lastC2] = [ny, null];
          break;
        }
        case "C": {
          const c = [x, y, num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy];
          out.push(c);
          [x, y, lastC2] = [c[6], c[7], [c[4], c[5]]];
          break;
        }
        case "S": {
          const c1 = lastC2 ? [2 * x - lastC2[0], 2 * y - lastC2[1]] : [x, y];
          const c = [x, y, c1[0], c1[1], num() + ox, num() + oy, num() + ox, num() + oy];
          out.push(c);
          [x, y, lastC2] = [c[6], c[7], [c[4], c[5]]];
          break;
        }
        default: {
          if (x !== startX || y !== startY) out.push(line(x, y, startX, startY));
          [x, y, lastC2] = [startX, startY, null];
        }
      }
    }
    if (!out.length) throw new Error(`stroke path data draws nothing: ${d}`);
    return out;
  }
  function pointOn(c, t3) {
    const u = 1 - t3;
    const a = u * u * u;
    const b = 3 * u * u * t3;
    const e = 3 * u * t3 * t3;
    const f = t3 * t3 * t3;
    return [a * c[0] + b * c[2] + e * c[4] + f * c[6], a * c[1] + b * c[3] + e * c[5] + f * c[7]];
  }
  function pointsOf(cubics, step = 2) {
    const points = [];
    for (const c of cubics) {
      const rough = Math.hypot(c[2] - c[0], c[3] - c[1]) + Math.hypot(c[4] - c[2], c[5] - c[3]) + Math.hypot(c[6] - c[4], c[7] - c[5]);
      const n2 = Math.max(2, Math.ceil(rough / step));
      for (let k = points.length ? 1 : 0; k <= n2; k += 1) points.push(pointOn(c, k / n2));
    }
    return points;
  }
  function lengthOf(points) {
    let total = 0;
    for (let k = 1; k < points.length; k += 1) total += dist(points[k - 1], points[k]);
    return total;
  }
  function strokeOf(d) {
    const cubics = cubicsOf(d);
    const points = pointsOf(cubics);
    return {
      cubics: cubics.map((c) => c.map(round)),
      start: points[0].map(round),
      end: points[points.length - 1].map(round),
      length: round(lengthOf(points)),
      points: points.map((p) => p.map(round))
    };
  }
  function strokesFor(paths) {
    return (paths || []).map(strokeOf);
  }
  function toSegment(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len3 = dx * dx + dy * dy;
    const t3 = len3 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len3)) : 0;
    return Math.hypot(p[0] - (a[0] + t3 * dx), p[1] - (a[1] + t3 * dy));
  }
  function stray(from, to) {
    let total = 0;
    for (const p of from) {
      let best = Infinity;
      for (let k = 1; k < to.length; k += 1) best = Math.min(best, toSegment(p, to[k - 1], to[k]));
      total += to.length === 1 ? dist(p, to[0]) : best;
    }
    return total / from.length;
  }
  function fitOf(stroke, drawn) {
    return (stray(drawn, stroke.points) + stray(stroke.points, drawn)) / 2;
  }
  function judgeStroke(stroke, drawn, { tolerance = TRACE_TOLERANCE } = {}) {
    if (!Array.isArray(drawn) || drawn.length < 2 || lengthOf(drawn) < 2) return { ok: false, why: "short" };
    const first = drawn[0];
    const last = drawn[drawn.length - 1];
    const startMiss = dist(first, stroke.start);
    const endMiss = dist(last, stroke.end);
    if (startMiss > tolerance || endMiss > tolerance) {
      if (dist(first, stroke.end) <= tolerance && dist(last, stroke.start) <= tolerance) return { ok: false, why: "reversed" };
      return { ok: false, why: startMiss > tolerance ? "start" : "end" };
    }
    return fitOf(stroke, drawn) <= tolerance / 2 ? { ok: true, why: null } : { ok: false, why: "shape" };
  }
  function traceStroke(strokes, next2, drawn, options = {}) {
    const expected = strokes[next2];
    if (!expected) throw new Error(`there is no stroke ${next2 + 1}`);
    const verdict = judgeStroke(expected, drawn, options);
    let best = null;
    for (let j = next2 + 1; j < strokes.length; j += 1) {
      if (!judgeStroke(strokes[j], drawn, options).ok) continue;
      const fit = fitOf(strokes[j], drawn);
      if (!best || fit < best.fit) best = { j, fit };
    }
    if (best && (!verdict.ok || best.fit < fitOf(expected, drawn) / 2)) return { ok: false, why: "order", matched: best.j };
    return { ...verdict, matched: verdict.ok ? next2 : null };
  }
  function traceWords({ why, matched } = {}, next2 = 0) {
    const n2 = next2 + 1;
    switch (why) {
      case null:
        return next2 === null ? "" : t({ en: `Stroke ${n2}: that's it.`, es: `Trazo ${n2}: \xA1eso es!` });
      case "order":
        return t({ en: `That is stroke ${matched + 1}. Stroke ${n2} comes first.`, es: `Ese es el trazo ${matched + 1}. Primero va el trazo ${n2}.` });
      case "reversed":
        return t({ en: `Stroke ${n2} goes the other way: start at the dot.`, es: `El trazo ${n2} va en el otro sentido: empieza en el punto.` });
      case "start":
        return t({ en: `Start stroke ${n2} at the dot.`, es: `Empieza el trazo ${n2} en el punto.` });
      case "end":
        return t({ en: `Carry stroke ${n2} through to its end.`, es: `Lleva el trazo ${n2} hasta el final.` });
      case "shape":
        return t({ en: `Follow the grey line of stroke ${n2} a little more closely.`, es: `Sigue un poco m\xE1s de cerca la l\xEDnea gris del trazo ${n2}.` });
      case "short":
        return t({ en: "Draw the whole stroke in one movement.", es: "Dibuja todo el trazo en un solo movimiento." });
      default:
        return "";
    }
  }

  // js/kana-to-kanji.js
  var SPELL_CHOICES = 4;
  var MISSES_KEPT = 500;
  var HIRAGANA = "\u3041-\u3096\u309D\u309E\u30FC";
  var KANJI_CHARS = "\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3005";
  var READING = new RegExp(`^[${HIRAGANA}]{1,20}$`, "u");
  var WRITTEN = new RegExp(`^[${HIRAGANA}${KANJI_CHARS}]{1,12}$`, "u");
  var KANJI = new RegExp(`[${KANJI_CHARS}]`, "u");
  var DECK2 = /^[a-z0-9-]{1,40}$/;
  var count3 = (n2) => Number.isSafeInteger(n2) && n2 >= 0 && n2 <= 1e6 ? n2 : 0;
  var emptyStats3 = () => ({ rounds: 0, best: 0, correct: 0, answered: 0, assisted: 0, misses: {} });
  var wordKey3 = (w) => `${w.written}|${w.reading}`;
  var kanjiOf2 = (written) => [...written].filter((ch) => KANJI.test(ch));
  var validEs = (es) => es === void 0 || Boolean(es) && typeof es === "object" && typeof es.gloss === "string" && es.gloss.length > 0 && es.gloss.length <= 200;
  function validWord(w) {
    return Boolean(w) && typeof w === "object" && typeof w.written === "string" && typeof w.reading === "string" && typeof w.gloss === "string" && w.gloss.length <= 200 && validEs(w.es) && WRITTEN.test(w.written) && KANJI.test(w.written) && READING.test(w.reading);
  }
  function validKey2(key) {
    const [written, reading, more] = key.split("|");
    return more === void 0 && validWord({ written, reading, gloss: "" });
  }
  function spellingPool(chars3, pages2, known = new Set(chars3)) {
    const out = /* @__PURE__ */ new Map();
    for (const ch of chars3) for (const w of pages2.get(ch) || []) {
      const gloss = typeof w.gloss === "string" ? w.gloss.slice(0, 200) : "";
      const word = { written: w.written, reading: w.reading, gloss };
      const es = w.es && typeof w.es.gloss === "string" && w.es.gloss ? w.es.gloss.slice(0, 200) : "";
      if (es) word.es = { gloss: es };
      if (!validWord(word) || kanjiOf2(word.written).some((k) => !known.has(k))) continue;
      if (!out.has(wordKey3(word))) out.set(wordKey3(word), word);
    }
    return [...out.values()];
  }
  function spellingSetup(words) {
    const pool = (Array.isArray(words) ? words : []).filter(validWord);
    const readings = new Set(pool.map((w) => w.reading)).size;
    return {
      count: pool.length,
      ready: readings >= SPELL_CHOICES,
      message: t({
        en: "This set needs words with at least four different readings. Save more kanji, or choose a level.",
        es: "Este grupo necesita palabras con al menos cuatro lecturas distintas. Guarda m\xE1s kanji o elige un nivel."
      })
    };
  }
  function questionFor(target, pool, rand) {
    const readableAs = new Set(pool.filter((w) => w.reading === target.reading).map((w) => w.written));
    const kanji = new Set(kanjiOf2(target.written)), length = [...target.written].length;
    const sharing = [], sameLength = [], rest = [];
    for (const w of pool) {
      if (w.reading === target.reading || readableAs.has(w.written)) continue;
      if (kanjiOf2(w.written).some((k) => kanji.has(k))) sharing.push(w);
      else if ([...w.written].length === length) sameLength.push(w);
      else rest.push(w);
    }
    const options = [target];
    for (const tier of [sharing, sameLength, rest]) {
      for (const w of shuffle(tier, rand)) {
        if (options.length === SPELL_CHOICES) break;
        if (options.every((o) => o.reading !== w.reading && o.written !== w.written)) options.push(w);
      }
    }
    return { target, options: shuffle(options, rand) };
  }
  function validQuestion(q) {
    if (!q || !validWord(q.target) || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > SPELL_CHOICES) return false;
    if (!q.options.every(validWord) || !q.options.some((o) => wordKey3(o) === wordKey3(q.target))) return false;
    return new Set(q.options.map((o) => o.reading)).size === q.options.length && new Set(q.options.map((o) => o.written)).size === q.options.length;
  }
  var KanaToKanji = class {
    constructor(document2) {
      this.stats = {};
      this.round = null;
      this.recovered = false;
      if (document2 == null) return;
      if (document2.v !== 1 || !document2.stats || typeof document2.stats !== "object" || Array.isArray(document2.stats)) {
        this.recovered = true;
        return;
      }
      for (const [deck, value] of Object.entries(document2.stats)) {
        if (!DECK2.test(deck) || !value || typeof value !== "object" || Array.isArray(value)) {
          this.recovered = true;
          continue;
        }
        const misses = {};
        if (!value.misses || typeof value.misses !== "object" || Array.isArray(value.misses)) this.recovered = true;
        for (const [key, n2] of Object.entries(value.misses || {})) {
          if (validKey2(key) && n2 === count3(n2) && n2 > 0) misses[key] = n2;
          else this.recovered = true;
        }
        const answered = count3(value.answered), correct = Math.min(answered, count3(value.correct));
        const normalized = { rounds: count3(value.rounds), best: Math.min(ROUND, count3(value.best)), correct, answered, assisted: Math.min(answered - correct, count3(value.assisted)), misses };
        if (["rounds", "best", "correct", "answered", "assisted"].some((k) => value[k] !== normalized[k])) this.recovered = true;
        this.stats[deck] = normalized;
      }
      if (document2.round != null) {
        if (this.validRound(document2.round)) this.round = JSON.parse(JSON.stringify(document2.round));
        else this.recovered = true;
      }
    }
    validRound(r) {
      if (!r || typeof r !== "object" || typeof r.deck !== "string" || !DECK2.test(r.deck) || typeof r.id !== "string" || r.id.length > 80) return false;
      if (!Number.isInteger(r.at) || r.at < 0 || r.at > ROUND || !Array.isArray(r.questions) || r.questions.length !== ROUND || !Array.isArray(r.picks)) return false;
      if (r.picks.length < r.at || r.picks.length > Math.min(ROUND, r.at + 1) || typeof r.hinted !== "boolean") return false;
      return r.questions.every((q, i) => {
        if (!validQuestion(q)) return false;
        const pick2 = r.picks[i];
        return i >= r.picks.length || pick2 && typeof pick2.hint === "boolean" && (pick2.id === null || q.options.some((o) => wordKey3(o) === pick2.id));
      });
    }
    /** Ten questions from `words`, the set's pool (spellingPool); missed words come up more often. */
    start({ deck, words = [], seed = Date.now() } = {}) {
      if (this.round && this.round.at < ROUND) throw new Error(t({ en: "Finish or leave the current round first.", es: "Termina o deja primero la ronda actual." }));
      if (typeof deck !== "string" || !DECK2.test(deck)) throw new Error(t({ en: "Unknown kanji set", es: "Grupo de kanji desconocido" }));
      const pool = [...new Map((Array.isArray(words) ? words : []).filter(validWord).map((w) => [wordKey3(w), w])).values()];
      if (!spellingSetup(pool).ready) throw new Error(t({ en: "This set needs words with at least four different readings.", es: "Este grupo necesita palabras con al menos cuatro lecturas distintas." }));
      const rand = makeRand(seed), misses = (this.stats[deck] || emptyStats3()).misses;
      const questions = [];
      let remaining = [];
      for (let n2 = 0; n2 < ROUND; n2++) {
        if (!remaining.length) remaining = [...pool];
        const last = questions.at(-1)?.target.reading;
        const eligible2 = remaining.filter((w) => w.reading !== last);
        const word = drawWeighted(eligible2.length ? eligible2 : remaining, 1, (w) => weightOf(misses[wordKey3(w)] || 0), rand)[0];
        remaining = remaining.filter((w) => w !== word);
        questions.push(questionFor(word, pool, rand));
      }
      this.round = { id: `${deck}:${Number(seed) >>> 0}`, deck, questions, at: 0, picks: [], hinted: false };
      return this.view();
    }
    act(action, { id, pick: pick2 } = {}) {
      const r = this.round;
      if (!r) return this.view();
      if (action === "leave") {
        this.round = null;
        return this.view();
      }
      if (r.at >= ROUND || id !== `${r.id}:${r.at}`) return this.view();
      const q = r.questions[r.at], answer3 = wordKey3(q.target);
      const answered = r.picks.length > r.at;
      if (action === "hint" && !answered) r.hinted = true;
      if ((action === "answer" || action === "skip") && !answered) {
        if (action === "answer" && !q.options.some((o) => wordKey3(o) === pick2)) return this.view();
        r.picks.push({ id: action === "skip" ? null : pick2, hint: r.hinted });
        if (pick2 !== answer3 && r.at + 3 < ROUND) {
          r.questions[r.at + 3] = { target: q.target, options: [...q.options.slice(1), q.options[0]] };
        }
      }
      if (action === "next" && answered) {
        r.at += 1;
        r.hinted = false;
        if (r.at === ROUND) this.record();
      }
      return this.view();
    }
    record() {
      const r = this.round, s = this.stats[r.deck] || emptyStats3(), result = this.result();
      s.rounds = Math.min(1e6, s.rounds + 1);
      s.best = Math.max(s.best, result.correct);
      s.correct = Math.min(1e6, s.correct + result.correct);
      s.answered = Math.min(1e6, s.answered + ROUND);
      s.assisted = Math.min(1e6, s.assisted + result.assisted);
      r.picks.forEach((p, i) => {
        const key = wordKey3(r.questions[i].target);
        if (p.id !== key || p.hint) s.misses[key] = Math.min(1e6, (s.misses[key] || 0) + 1);
      });
      const kept = Object.entries(s.misses);
      if (kept.length > MISSES_KEPT) s.misses = Object.fromEntries(kept.sort((a, b) => b[1] - a[1]).slice(0, MISSES_KEPT));
      this.stats[r.deck] = s;
    }
    result() {
      const r = this.round;
      return {
        correct: r.picks.filter((p, i) => p.id === wordKey3(r.questions[i].target) && !p.hint).length,
        assisted: r.picks.filter((p) => p.hint).length,
        skipped: r.picks.filter((p) => p.id === null).length,
        total: ROUND
      };
    }
    view() {
      const base = { recovered: this.recovered, stats: this.stats, status: "idle", round: null };
      const r = this.round;
      if (!r) return base;
      const details = { deck: r.deck, position: Math.min(r.at + 1, ROUND), total: ROUND, result: this.result(), question: null };
      if (r.at === ROUND) return { ...base, status: "complete", round: details };
      const q = r.questions[r.at], pick2 = r.picks[r.at], answer3 = wordKey3(q.target), revealed = Boolean(pick2);
      details.question = {
        id: `${r.id}:${r.at}`,
        prompt: q.target.reading,
        // The spelling finds the word's own recording (雨 plays 雨|あめ, never
        // 飴); the screen shows it only once answered.
        written: q.target.written,
        answered: revealed,
        hinted: r.hinted,
        hint: r.hinted && !revealed ? q.target.gloss : null,
        // The hint's Spanish beside it, where the word has one.
        ...r.hinted && !revealed && q.target.es ? { es: { hint: q.target.es.gloss } } : {},
        correctId: revealed ? answer3 : null,
        pickedId: pick2?.id ?? null,
        right: revealed ? pick2.id === answer3 : null,
        options: q.options.map((o) => ({
          id: wordKey3(o),
          written: o.written,
          reading: revealed ? o.reading : null,
          gloss: revealed ? o.gloss : null,
          ...revealed && o.es ? { es: { gloss: o.es.gloss } } : {}
        }))
      };
      return { ...base, status: "playing", round: details };
    }
    dump() {
      return { v: 1, stats: this.stats, round: this.round };
    }
  };

  // js/app-backup.js
  var PRACTICE = Object.freeze(["kana-games", "story", "kana-review", "kana-snacks", "kanji-cards", "kana-to-kanji", "writing-rush", "play"]);
  function backupDoc({ kanji, words, phrases, practice = {}, today, now, library: library2, app } = {}) {
    const k = validate(kanji, now).data;
    const w = validate2(words).data;
    const book = new PhraseBook(library2, phrases).dump();
    const doc = exportDoc(k, today, book.phrases, listWords(w).map(({ id, ...rec }) => rec));
    if (Object.keys(book.sources).length) doc.sources = book.sources;
    const kept = practiceOf(practice);
    if (Object.keys(kept).length) doc.practice = kept;
    if (isObject2(app)) doc.app = { name: String(app.name || ""), version: String(app.version || "") };
    return doc;
  }
  function backupWeight(summary2) {
    if (!isObject2(summary2)) return 0;
    return (summary2.kanji || 0) + (summary2.words || 0) + (summary2.phrases || 0) + (summary2.practice || []).length;
  }
  function readBackup(text) {
    const r = parse(text);
    if (!r.ok) return r;
    return { ok: true, summary: summaryOf(r) };
  }
  function backupSummary(text) {
    const r = parse(text, { allowEmpty: true });
    return r.ok ? summaryOf(r) : null;
  }
  function restoreBackup(text, { kanji, words, phrases, practice = {}, now, library: library2, replacePractice = false } = {}) {
    const r = parse(text);
    if (!r.ok) return r;
    const k = validate(kanji, now).data;
    const kanjiSum = mergeInto(k, r.data);
    const w = validate2(words).data;
    const wordSum = mergeWords(w, r.words);
    const book = new PhraseBook(library2, phrases);
    const phraseSum = book.merge(r.data.phrases || [], r.sources);
    const restored = {};
    const kept = [];
    for (const [name, doc] of Object.entries(r.practice)) {
      if (replacePractice || !isObject2(practice[name])) restored[name] = doc;
      else kept.push(name);
    }
    return {
      ok: true,
      kanji: k,
      words: w,
      phrases: book.dump(),
      practice: restored,
      sum: { ...kanjiSum, words: wordSum, phrases: phraseSum, practice: Object.keys(restored), keptPractice: kept, dropped: r.dropped }
    };
  }
  function practiceOf(raw) {
    const out = {};
    if (!isObject2(raw)) return out;
    for (const name of PRACTICE) if (isObject2(raw[name])) out[name] = raw[name];
    return out;
  }
  function parse(text, { allowEmpty = false } = {}) {
    if (typeof text !== "string") return { ok: false, reason: "json" };
    if (text.length > MAX_IMPORT_BYTES) return { ok: false, reason: "size" };
    const r = parseImport(text);
    if (!r.ok && r.reason !== "empty") return { ok: false, reason: r.reason };
    const doc = JSON.parse(text);
    const practice = practiceOf(doc.practice);
    if (!r.ok && !Object.keys(practice).length && !allowEmpty) return { ok: false, reason: "empty" };
    return {
      ok: true,
      data: r.ok ? r.data : { saved: {}, seen: {} },
      words: r.ok ? r.words : [],
      dropped: r.dropped || 0,
      sources: isObject2(doc.sources) ? doc.sources : {},
      practice,
      exported: typeof doc.exported === "string" ? doc.exported : null,
      app: isObject2(doc.app) ? { name: String(doc.app.name || ""), version: String(doc.app.version || "") } : null
    };
  }
  function summaryOf(r) {
    const summary2 = {
      exported: r.exported,
      app: r.app,
      kanji: Object.keys(r.data.saved).length,
      met: Object.keys(r.data.seen).length,
      words: r.words.length,
      phrases: (r.data.phrases || []).length,
      practice: Object.keys(r.practice),
      dropped: r.dropped
    };
    summary2.weight = backupWeight(summary2);
    return summary2;
  }

  // js/writing-rush.js
  init_kana();

  // js/kana-rows.js
  init_kana();
  var KANA_ROWS = Object.freeze(["\u3042", "\u304B", "\u3055", "\u305F", "\u306A", "\u306F", "\u307E", "\u3084", "\u3089", "\u308F"]);
  var ROW_OF = /* @__PURE__ */ new Map();
  [
    "\u3042\u3044\u3046\u3048\u304A\u3041\u3043\u3045\u3047\u3049\u3094",
    "\u304B\u304D\u304F\u3051\u3053\u304C\u304E\u3050\u3052\u3054\u3095\u3096",
    "\u3055\u3057\u3059\u305B\u305D\u3056\u3058\u305A\u305C\u305E",
    "\u305F\u3061\u3064\u3066\u3068\u3060\u3062\u3065\u3067\u3069\u3063",
    "\u306A\u306B\u306C\u306D\u306E",
    "\u306F\u3072\u3075\u3078\u307B\u3070\u3073\u3076\u3079\u307C\u3071\u3074\u3077\u307A\u307D",
    "\u307E\u307F\u3080\u3081\u3082",
    "\u3084\u3086\u3088\u3083\u3085\u3087",
    "\u3089\u308A\u308B\u308C\u308D",
    "\u308F\u3092\u3093\u308E\u3090\u3091"
  ].forEach((s, i) => {
    for (const ch of s) ROW_OF.set(ch, KANA_ROWS[i]);
  });
  function rowOf(ch) {
    return ROW_OF.get(toHira(ch)) || null;
  }

  // js/writing-rush-words.js
  var SAY = Object.freeze({
    unknown: { en: "Unknown group.", es: "Grupo desconocido." },
    busy: { en: "Finish or abandon the current run first.", es: "Primero termina o abandona la partida actual." },
    mode: { en: "Choose Rush or Marathon.", es: "Elige Contrarreloj o Marat\xF3n." },
    seconds: { en: "A rush lasts 30, 60 or 120 seconds.", es: "Una contrarreloj dura 30, 60 o 120 segundos." },
    guides: { en: "Choose with or without guides.", es: "Elige con o sin gu\xEDas." },
    noneSaved: { en: "Nothing to write yet: save kanji to My kanji first.", es: "Todav\xEDa no hay nada que escribir: primero guarda kanji en Mis kanji." },
    noStrokes: { en: "None of these characters has a stroke order yet.", es: "Ninguno de estos caracteres tiene orden de trazos todav\xEDa." },
    clock: { en: "The clock starts with your first stroke.", es: "El reloj empieza con tu primer trazo." },
    outOfBest: { en: "A stroke was shown, so this run cannot set a best.", es: "Se mostr\xF3 un trazo, as\xED que esta partida no puede marcar un r\xE9cord." },
    assistedRun: { en: "A stroke was shown, so this run does not count for your best.", es: "Se mostr\xF3 un trazo, as\xED que esta partida no cuenta para tu r\xE9cord." },
    firstBest: { en: "Your first best for this group.", es: "Tu primer r\xE9cord en este grupo." },
    finishOne: { en: "Finish a character in time to set a best.", es: "Termina un car\xE1cter a tiempo para marcar un r\xE9cord." },
    byLess: { en: "A new best, by less than a second!", es: "\xA1Nuevo r\xE9cord, por menos de un segundo!" },
    timeUp: { en: "Time's up", es: "Se acab\xF3 el tiempo" },
    marathonDone: { en: "Marathon complete", es: "Marat\xF3n completo" }
  });
  var GRADE_ES = Object.freeze({ 1: "1.er grado", 2: "2.\xBA grado", 3: "3.er grado", 4: "4.\xBA grado", 5: "5.\xBA grado", 6: "6.\xBA grado" });
  function kanjiTitle(level) {
    if (!level) return { en: "My kanji", es: "Mis kanji" };
    if (level.jlpt) return `JLPT N${level.jlpt}`;
    if (level.grade === 8) return { en: "Secondary school", es: "Secundaria" };
    if (level.grade) return { en: `Grade ${level.grade}`, es: GRADE_ES[level.grade] };
    return { en: "Kanji for names", es: "Kanji para nombres" };
  }
  function kanaTitle(head, script, count4) {
    return head ? { en: `${head} row`, es: `Fila de ${head}` } : { en: `All ${count4} ${script}`, es: `Los ${count4} ${script}` };
  }
  function clockText(ms) {
    const s = Math.floor(Math.max(0, ms) / 1e3);
    const two = (n2) => String(n2).padStart(2, "0");
    const h = Math.floor(s / 3600);
    const m = Math.floor(s % 3600 / 60);
    return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
  }
  function strokeWords(why, matched, n2, count4, plain) {
    const k = n2 + 1;
    if (why === "order" && Number.isInteger(matched) && matched > n2 && matched < count4) return traceWords({ why, matched }, n2);
    if (why === "short" || plain && ["reversed", "start", "end", "shape"].includes(why)) return traceWords({ why }, n2);
    switch (why) {
      case "reversed":
        return t({ en: `Stroke ${k} goes the other way.`, es: `El trazo ${k} va en el otro sentido.` });
      case "start":
        return t({ en: `Stroke ${k} starts somewhere else.`, es: `El trazo ${k} empieza en otro lugar.` });
      case "end":
        return t({ en: `Stroke ${k} ends somewhere else.`, es: `El trazo ${k} termina en otro lugar.` });
      case "shape":
        return t({ en: `Stroke ${k} has another shape.`, es: `El trazo ${k} tiene otra forma.` });
      default:
        return t({ en: `Not quite: draw stroke ${k} again.`, es: `Casi: dibuja otra vez el trazo ${k}.` });
    }
  }
  var shownWords = (n2) => t({ en: `Here is stroke ${n2 + 1}: trace it.`, es: `Aqu\xED est\xE1 el trazo ${n2 + 1}: tr\xE1zalo.` });
  function summaryOf2(rec, noun) {
    let s;
    if (rec.mode === "rush") {
      s = rec.written ? t({ en: `${rec.written} ${noun} in ${rec.seconds} seconds, ${rec.clean} without a miss.`, es: `${rec.written} ${noun} en ${rec.seconds} segundos, ${rec.clean} sin fallos.` }) : t({ en: `No ${noun} finished in ${rec.seconds} seconds.`, es: `No terminaste ning\xFAn ${noun} en ${rec.seconds} segundos.` });
    } else {
      const time = clockText(rec.ms);
      const misses = rec.misses === 0 ? t({ en: "without a miss", es: "sin fallos" }) : rec.misses === 1 ? t({ en: "with 1 miss", es: "con 1 fallo" }) : t({ en: `with ${rec.misses} misses`, es: `con ${rec.misses} fallos` });
      s = t({ en: `${rec.of} ${noun} in ${time}, ${misses}.`, es: `${rec.of} ${noun} en ${time}, ${misses}.` });
    }
    if (rec.assisted) {
      s += ` ${t({ en: `${rec.assisted} needed a shown stroke.`, es: rec.assisted === 1 ? "1 necesit\xF3 ver un trazo." : `${rec.assisted} necesitaron ver un trazo.` })}`;
    }
    return s;
  }
  var yourBest = (best) => best.mode === "rush" ? t({ en: `Your best is ${best.written}.`, es: `Tu r\xE9cord es ${best.written}.` }) : t({ en: `Your best is ${clockText(best.ms)}.`, es: `Tu r\xE9cord es ${clockText(best.ms)}.` });
  function bestNote(rec, { newBest, previous, best }) {
    if (rec.assisted) return t(SAY.assistedRun);
    if (!rec.written) return best ? yourBest(best) : t(SAY.finishOne);
    if (newBest && !previous) return t(SAY.firstBest);
    if (!newBest) return yourBest(best);
    if (rec.mode === "rush") return t({ en: `A new best! The last was ${previous.written}.`, es: `\xA1Nuevo r\xE9cord! El anterior era ${previous.written}.` });
    const last = clockText(previous.ms);
    return last === clockText(rec.ms) ? t(SAY.byLess) : t({ en: `A new best! The last was ${last}.`, es: `\xA1Nuevo r\xE9cord! El anterior era ${last}.` });
  }
  function optionWords(seconds) {
    return {
      modes: [
        { id: "rush", title: t({ en: "Rush", es: "Contrarreloj" }), text: t({ en: "As many as you can before the time runs out.", es: "Todos los que puedas antes de que se acabe el tiempo." }) },
        { id: "marathon", title: t({ en: "Marathon", es: "Marat\xF3n" }), text: t({ en: "Every character of the group once, as fast as you can.", es: "Cada car\xE1cter del grupo una vez, lo m\xE1s r\xE1pido que puedas." }) }
      ],
      seconds: seconds.map((n2) => ({ id: n2, title: t({ en: `${n2} seconds`, es: `${n2} segundos` }) })),
      guides: [
        { id: true, title: t({ en: "With guides", es: "Con gu\xEDas" }), text: t({ en: "The faint character, and a dot where each stroke starts.", es: "El car\xE1cter tenue y un punto donde empieza cada trazo." }) },
        { id: false, title: t({ en: "Without guides", es: "Sin gu\xEDas" }), text: t({ en: "An empty square: write it from memory.", es: "Un cuadro vac\xEDo: escr\xEDbelo de memoria." }) }
      ],
      rules: t({
        en: "The clock starts with your first stroke. Three misses on one stroke show it, and a run with a shown stroke does not set a best.",
        es: "El reloj empieza con tu primer trazo. Tres fallos en un trazo lo muestran, y una partida con un trazo mostrado no marca r\xE9cord."
      })
    };
  }
  var countWords = (count4, noun) => t({ en: `${count4} ${noun} to write.`, es: `${count4} ${noun} para escribir.` });

  // js/writing-rush.js
  var RUSH_FORMAT = "yomu-writing-rush/1";
  var RUSH_MODES = Object.freeze(["rush", "marathon"]);
  var RUSH_SECONDS = Object.freeze([30, 60, 120]);
  var ASSIST_AFTER = 3;
  var RECENT_KEPT = 10;
  var MAX_MS = 24 * 60 * 60 * 1e3;
  var MAX_STROKES = 64;
  var CAP4 = 1e6;
  var TROUBLE = 8;
  var DAY6 = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  var FIELDS = Object.freeze(["group", "mode", "guides", "seconds", "ms", "written", "clean", "misses", "assisted", "of", "day"]);
  var object5 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var isCount6 = (n2) => Number.isSafeInteger(n2) && n2 >= 0 && n2 <= CAP4;
  var isDay3 = (v) => typeof v === "string" && DAY6.test(v);
  var timeOf = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_MS ? Math.round(v) : null;
  var strokeCountOf = (strokes, ch) => {
    const n2 = object5(strokes) && Object.hasOwn(strokes, ch) ? strokes[ch] : 0;
    return Number.isSafeInteger(n2) && n2 >= 1 && n2 <= MAX_STROKES ? n2 : 0;
  };
  var GROUPS2 = Object.freeze([
    ...["hiragana", "katakana"].flatMap((script) => {
      const show2 = script === "katakana" ? toKata : (s) => s;
      const rows = KANA_ROWS.map((head) => ({
        id: `${script}-${kanaRomaji(head)}`,
        script,
        kind: "kana",
        title: kanaTitle(show2(head)),
        chars: BASIC_KANA.filter((k) => rowOf(k) === head).map(show2)
      }));
      const all = { id: `${script}-all`, script, kind: "kana", title: kanaTitle(null, script, BASIC_KANA.length), chars: BASIC_KANA.map(show2) };
      return [...rows, all];
    }),
    { id: "mine", script: "kanji", kind: "kanji", title: kanjiTitle(null), chars: null },
    ...LEVELS.map((level) => ({ id: level.id, script: "kanji", kind: "kanji", title: kanjiTitle(level), chars: null }))
  ].map((g) => Object.freeze(g)));
  var groupOf = (id) => GROUPS2.find((g) => g.id === id) || null;
  var titleOf2 = (id) => t(groupOf(id)?.title);
  function rushGroups() {
    return GROUPS2.map((g) => ({ id: g.id, script: g.script, kind: g.kind, title: t(g.title), chars: g.chars ? [...g.chars] : null }));
  }
  function rushPool({ group, chars: chars3 = [], strokes = {} } = {}) {
    const g = groupOf(group);
    if (!g) return { pool: [], count: 0, ready: false, message: t(SAY.unknown) };
    const listed = g.chars || [...new Set((Array.isArray(chars3) ? chars3 : [...String(chars3 || "")]).filter((ch) => typeof ch === "string" && [...ch].length === 1 && isKanji2(ch)))];
    const pool = listed.filter((ch) => strokeCountOf(strokes, ch) > 0);
    if (!pool.length) return { pool, count: 0, ready: false, message: t(g.id === "mine" ? SAY.noneSaved : SAY.noStrokes) };
    return { pool, count: pool.length, ready: true, message: countWords(pool.length, g.kind) };
  }
  var rushOptions = () => optionWords(RUSH_SECONDS);
  function bestKey({ group, mode, seconds = null, guides = true }) {
    const help = guides ? "guides" : "blank";
    return mode === "rush" ? `${group}:rush:${seconds}:${help}` : `${group}:marathon:${help}`;
  }
  function cleanRecord(v, withBest) {
    if (!object5(v) || !groupOf(v.group) || !RUSH_MODES.includes(v.mode) || typeof v.guides !== "boolean") return null;
    if (v.mode === "rush" ? !RUSH_SECONDS.includes(v.seconds) || v.ms !== null : v.seconds !== null || timeOf(v.ms) !== v.ms) return null;
    if (![v.written, v.clean, v.misses, v.assisted, v.of].every(isCount6) || v.of < 1) return null;
    if (v.clean + v.assisted > v.written || v.misses < v.written - v.clean + (ASSIST_AFTER - 1) * v.assisted) return null;
    if (v.mode === "marathon" && v.written !== v.of) return null;
    if (v.day !== null && !isDay3(v.day)) return null;
    if (withBest && typeof v.best !== "boolean") return null;
    const keys = withBest ? [...FIELDS, "best"] : FIELDS;
    return { record: Object.fromEntries(keys.map((k) => [k, v[k]])), extra: Object.keys(v).some((k) => !keys.includes(k)) };
  }
  var eligible = (rec) => rec.assisted === 0 && rec.written > 0;
  var beats2 = (a, b) => a.mode === "rush" ? a.written - b.written || a.clean - b.clean || b.misses - a.misses : b.ms - a.ms || b.misses - a.misses;
  var shownRecord = (rec) => rec && { ...rec, groupTitle: titleOf2(rec.group), summary: summaryOf2(rec, groupOf(rec.group).kind) };
  function dealMore(run2) {
    const last = run2.deal.length ? run2.deal[run2.deal.length - 1] : null;
    const cycle = shuffle(run2.pool, run2.rand);
    if (cycle.length > 1 && cycle[0] === last) {
      const j = 1 + Math.floor(run2.rand() * (cycle.length - 1));
      [cycle[0], cycle[j]] = [cycle[j], cycle[0]];
    }
    run2.deal.push(...cycle);
  }
  var stepId3 = (run2) => `${run2.id}:${run2.steps}`;
  var deadlineOf = (run2) => run2.mode === "rush" && run2.startedAt !== null ? run2.startedAt + run2.seconds * 1e3 : null;
  function freshChar(run2) {
    Object.assign(run2, { next: 0, strokeMisses: 0, shown: false, charMisses: 0, assisted: false, say: "" });
  }
  var WritingRush = class {
    constructor(document2) {
      this.bests = {};
      this.recent = [];
      this.run = null;
      this.serial = 0;
      this.recovered = false;
      if (document2 == null) return;
      if (!object5(document2) || document2.format !== RUSH_FORMAT) {
        this.recovered = true;
        return;
      }
      if (Object.keys(document2).some((k) => !["format", "bests", "recent"].includes(k))) this.recovered = true;
      if (!object5(document2.bests)) this.recovered = true;
      else {
        for (const [key, value] of Object.entries(document2.bests)) {
          const clean = cleanRecord(value, false);
          if (!clean || bestKey(clean.record) !== key || !eligible(clean.record)) {
            this.recovered = true;
            continue;
          }
          if (clean.extra) this.recovered = true;
          this.bests[key] = clean.record;
        }
      }
      if (!Array.isArray(document2.recent)) this.recovered = true;
      else {
        for (const value of document2.recent) {
          const clean = cleanRecord(value, true);
          if (!clean || clean.record.best && !eligible(clean.record)) {
            this.recovered = true;
            continue;
          }
          if (clean.extra) this.recovered = true;
          this.recent.push(clean.record);
        }
        if (this.recent.length > RECENT_KEPT) {
          this.recent.length = RECENT_KEPT;
          this.recovered = true;
        }
      }
    }
    /** The best a run of `rec`'s kind is measured against: a marathon's only over the same count. */
    bestFor(rec) {
      const best = this.bests[bestKey(rec)];
      return best && (rec.mode === "rush" || best.of === rec.of) ? best : null;
    }
    /**
     * A new run of `group`. `chars` are a kanji group's characters (a kana group
     * knows its own); `strokes` maps each character to its stroke count; mode
     * 'rush' with `seconds` (30, 60 or 120) or 'marathon'; `guides` true or
     * false; `today` YYYY-MM-DD for the records, or null.
     */
    start({ group, chars: chars3 = [], strokes = {}, mode = "rush", seconds = 60, guides = true, seed = Date.now(), today = null } = {}) {
      if (this.run && !this.run.result) throw new Error(t(SAY.busy));
      if (!groupOf(group)) throw new Error(t(SAY.unknown));
      if (!RUSH_MODES.includes(mode)) throw new Error(t(SAY.mode));
      if (mode === "rush" && !RUSH_SECONDS.includes(seconds)) throw new Error(t(SAY.seconds));
      if (typeof guides !== "boolean") throw new Error(t(SAY.guides));
      if (today !== null && !isDay3(today)) throw new Error("Expected today as YYYY-MM-DD or null.");
      const { pool, ready, message } = rushPool({ group, chars: chars3, strokes });
      if (!ready) throw new Error(message);
      this.serial += 1;
      const key = bestKey({ group, mode, seconds, guides });
      this.run = {
        id: `${this.serial}:${key}:${Number(seed) >>> 0}`,
        group,
        mode,
        seconds: mode === "rush" ? seconds : null,
        guides,
        day: today,
        pool,
        counts: new Map(pool.map((ch) => [ch, strokes[ch]])),
        rand: makeRand(seed),
        deal: [],
        at: 0,
        steps: 0,
        startedAt: null,
        last: 0,
        done: [],
        result: null
      };
      freshChar(this.run);
      dealMore(this.run);
      return this.view();
    }
    /**
     * 'stroke' { id, ok, why, matched, at, began }: the verdict of `trace` for
     * the stroke on the pad, named by the character's `id`; any other id is a
     * stale or doubled tap and changes nothing, and so does a stroke without a
     * time. 'time' { at }: the app's clock, which ends a rush at its deadline.
     * 'abandon': drop a run in progress (nothing of it is kept) or close a
     * finished run's result (already kept).
     */
    act(action, args = {}) {
      const run2 = this.run;
      if (!run2) return this.view();
      if (action === "abandon") {
        this.run = null;
        return this.view();
      }
      if (run2.result) return this.view();
      if (action === "time") {
        const now = timeOf(args.at);
        const deadline = deadlineOf(run2);
        if (now !== null && deadline !== null && Math.max(now, run2.last) >= deadline) this.finish(deadline);
      } else if (action === "stroke") {
        this.stroke(run2, args);
      }
      return this.view();
    }
    stroke(run2, { id, ok, why = null, matched = null, at, began } = {}) {
      let now = timeOf(at);
      if (id !== stepId3(run2) || typeof ok !== "boolean" || now === null) return;
      now = Math.max(now, run2.last);
      const count4 = run2.counts.get(run2.deal[run2.at]);
      const tap = !ok && why === "short";
      if (run2.startedAt === null && !tap) {
        const down = timeOf(began);
        run2.startedAt = down !== null && down <= now ? down : now;
      }
      const deadline = deadlineOf(run2);
      if (deadline !== null && now > deadline) {
        this.finish(deadline);
        return;
      }
      if (tap) {
        run2.say = strokeWords(why, matched, run2.next, count4, true);
        return;
      }
      run2.last = now;
      run2.steps += 1;
      if (ok) {
        Object.assign(run2, { next: run2.next + 1, strokeMisses: 0, shown: false, say: "" });
        if (run2.next >= count4) this.written(run2, now);
        return;
      }
      run2.strokeMisses += 1;
      run2.charMisses += 1;
      if (run2.strokeMisses >= ASSIST_AFTER && !run2.shown) {
        Object.assign(run2, { shown: true, assisted: true, say: shownWords(run2.next) });
      } else {
        run2.say = strokeWords(why, matched, run2.next, count4, run2.guides);
      }
    }
    /** The character on the pad is written: file it, and deal the next or finish. */
    written(run2, now) {
      run2.done.push({ ch: run2.deal[run2.at], misses: run2.charMisses, assisted: run2.assisted });
      if (run2.mode === "marathon" && run2.done.length === run2.pool.length) {
        this.finish(now);
        return;
      }
      run2.at += 1;
      if (run2.at >= run2.deal.length) dealMore(run2);
      freshChar(run2);
    }
    /** The run is over at `end`: its record, the best it is measured against, and the recent list. */
    finish(end) {
      const run2 = this.run;
      const record = {
        group: run2.group,
        mode: run2.mode,
        guides: run2.guides,
        seconds: run2.seconds,
        ms: run2.mode === "marathon" ? end - run2.startedAt : null,
        written: run2.done.length,
        clean: run2.done.filter((d) => d.misses === 0).length,
        misses: Math.min(CAP4, run2.done.reduce((n2, d) => n2 + d.misses, 0)),
        assisted: run2.done.filter((d) => d.assisted).length,
        of: run2.pool.length,
        day: run2.day
      };
      const previous = this.bestFor(record);
      const newBest = eligible(record) && (!previous || beats2(record, previous) > 0);
      if (newBest) this.bests[bestKey(record)] = record;
      this.recent.unshift({ ...record, best: newBest });
      if (this.recent.length > RECENT_KEPT) this.recent.length = RECENT_KEPT;
      run2.last = Math.max(run2.last, end);
      run2.result = { record, newBest, previous, best: this.bestFor(record) };
    }
    /**
     * status 'idle', 'playing' or 'complete', with the bests and the recent
     * results (each with its group's title and a summary). Playing and complete
     * carry the run; playing, the character on the pad (`char`); complete, the
     * `result`, until 'abandon' or a new start.
     */
    view() {
      const base = {
        recovered: this.recovered,
        status: "idle",
        bests: Object.fromEntries(Object.entries(this.bests).map(([key, rec]) => [key, shownRecord(rec)])),
        recent: this.recent.map(shownRecord),
        run: null
      };
      const run2 = this.run;
      if (!run2) return base;
      const fair = run2.done.every((d) => !d.assisted);
      const shown = {
        group: run2.group,
        title: titleOf2(run2.group),
        kind: groupOf(run2.group).kind,
        mode: run2.mode,
        seconds: run2.seconds,
        guides: run2.guides,
        of: run2.pool.length,
        position: run2.done.length + 1,
        total: run2.mode === "marathon" ? run2.pool.length : null,
        startedAt: run2.startedAt,
        deadline: deadlineOf(run2),
        written: run2.done.length,
        clean: run2.done.filter((d) => d.misses === 0).length,
        misses: run2.done.reduce((n2, d) => n2 + d.misses, 0),
        assisted: run2.done.filter((d) => d.assisted).length,
        eligible: fair,
        best: shownRecord(this.bestFor({ group: run2.group, mode: run2.mode, seconds: run2.seconds, guides: run2.guides, of: run2.pool.length })),
        note: run2.startedAt === null ? t(SAY.clock) : fair ? null : t(SAY.outOfBest),
        char: null,
        result: null
      };
      if (run2.result) {
        const { record, newBest, previous, best } = run2.result;
        const trouble = /* @__PURE__ */ new Map();
        for (const d of run2.done) {
          if (!d.misses) continue;
          const was = trouble.get(d.ch) || { ch: d.ch, misses: 0, assisted: false };
          trouble.set(d.ch, { ch: d.ch, misses: was.misses + d.misses, assisted: was.assisted || d.assisted });
        }
        Object.assign(shown, { position: run2.done.length, note: null });
        shown.result = {
          ...shownRecord(record),
          newBest,
          previous: shownRecord(previous),
          best: shownRecord(best),
          heading: t(run2.mode === "rush" ? SAY.timeUp : SAY.marathonDone),
          bestNote: bestNote(record, { newBest, previous, best }),
          trouble: [...trouble.values()].sort((a, b) => b.misses - a.misses).slice(0, TROUBLE)
        };
        return { ...base, status: "complete", run: shown };
      }
      const ch = run2.deal[run2.at];
      shown.char = {
        id: stepId3(run2),
        ch,
        strokeCount: run2.counts.get(ch),
        next: run2.next,
        misses: run2.charMisses,
        strokeMisses: run2.strokeMisses,
        shown: run2.shown,
        assisted: run2.assisted,
        say: run2.say
      };
      return { ...base, status: "playing", run: shown };
    }
    dump() {
      return { format: RUSH_FORMAT, bests: { ...this.bests }, recent: this.recent.map((rec) => ({ ...rec })) };
    }
  };

  // ../yomu-ios/bridge/entry.js
  init_es_files();
  init_spanish();

  // js/sound-drill.js
  init_notes();
  var DRILL_RULES = Object.freeze(Object.keys(SOUND_NOTES));
  var DRILL_ORDERS = Object.freeze(["rules", "mixed"]);
  function soundDrill({ lang: lang2 = currentLang(), order = "rules", seed = 1 } = {}) {
    const mixed = order === "mixed";
    const ids = mixed ? shuffle(DRILL_RULES, makeRand(seed)) : [...DRILL_RULES];
    const cards2 = [];
    for (const id of ids) {
      const note = noteFor("sound", id, lang2);
      const examples2 = note && Array.isArray(note.examples) ? note.examples.filter((e) => e && typeof e.ja === "string" && e.ja) : [];
      if (!examples2.length) continue;
      cards2.push({ id, title: note.title, rule: note.rule || "", example: examples2[0], related: examples2.slice(1), exception: note.exception || null });
    }
    return { order: mixed ? "mixed" : "rules", cards: cards2 };
  }

  // js/scan-text.js
  init_analyze();
  init_kana();
  var SMALL2 = Object.freeze({
    \u3041: "\u3042",
    \u3043: "\u3044",
    \u3045: "\u3046",
    \u3047: "\u3048",
    \u3049: "\u304A",
    \u3063: "\u3064",
    \u3083: "\u3084",
    \u3085: "\u3086",
    \u3087: "\u3088",
    \u308E: "\u308F",
    "\u3095": "\u304B",
    "\u3096": "\u3051"
  });
  var ENDS = /* @__PURE__ */ new Set(["\u3002", ".", "!", "?", "\u2026", "\u2025", "\u300D", "\u300F", ")", "\u3011", "\u3009", "\u300B", '"', "\u201D"]);
  var GOES_ON = /* @__PURE__ */ new Set([
    "\u306F",
    "\u304C",
    "\u3092",
    "\u306B",
    "\u3067",
    "\u3068",
    "\u3078",
    "\u3082",
    "\u306E",
    "\u3084",
    "\u304B\u3089",
    "\u307E\u3067",
    "\u3088\u308A",
    "\u3063\u3066",
    "\u3051\u3069",
    "\u3051\u308C\u3069",
    "\u306E\u3067",
    "\u306E\u306B",
    "\u3066",
    "\u3070",
    "\u3057"
  ]);
  var WINDOW = 12;
  var LAYOUT = /* @__PURE__ */ new Set(["punct", "space", "newline"]);
  var chars2 = (s) => Array.from(s);
  var lastOf = (s) => chars2(s).at(-1) || "";
  var firstOf = (s) => chars2(s)[0] || "";
  var tailOf = (s) => chars2(s).slice(-WINDOW).join("");
  var headOf = (s) => chars2(s).slice(0, WINDOW).join("");
  function folded(s) {
    return chars2(toHira(String(s).replace(/\s+/gu, ""))).map((ch) => SMALL2[ch] || ch).join("");
  }
  function kanaOnly(line2) {
    const s = line2.replace(/\s+/gu, "");
    return s.length > 0 && chars2(s).every(isKana);
  }
  function rubiesOf(analysis) {
    const out = [];
    for (const t3 of analysis.tokens) for (const f of t3.furigana || []) if (f.ruby) out.push(folded(f.ruby));
    return out;
  }
  function spells(s, rubies, from = 0) {
    if (!s) return -1;
    const memo = /* @__PURE__ */ new Map();
    const go = (at, k) => {
      if (at === s.length) return k;
      const key = `${at}:${k}`;
      if (memo.has(key)) return memo.get(key);
      let found = -1;
      for (let j = k; j < rubies.length && found < 0; j++) {
        if (rubies[j] && s.startsWith(rubies[j], at)) found = go(at + rubies[j].length, j + 1);
      }
      memo.set(key, found);
      return found;
    };
    return go(0, from);
  }
  async function dropFurigana(lines, analyze2) {
    const kana = lines.map(kanaOnly);
    if (!kana.some(Boolean) || !lines.some(hasKanji)) return { lines, furigana: [] };
    const readings = /* @__PURE__ */ new Map();
    const used = /* @__PURE__ */ new Map();
    const readingsAt = async (j) => {
      if (!readings.has(j)) readings.set(j, rubiesOf(await analyze2(lines[j])));
      return readings.get(j);
    };
    const near = (i, step) => {
      for (let j = i + step; j >= 0 && j < lines.length; j += step) {
        if (!kana[j]) return hasKanji(lines[j]) ? j : -1;
      }
      return -1;
    };
    const drop = /* @__PURE__ */ new Set();
    for (let i = 0; i < lines.length; i++) {
      if (!kana[i]) continue;
      const s = folded(lines[i]);
      for (const j of [near(i, 1), near(i, -1)]) {
        if (j < 0) continue;
        const end = spells(s, await readingsAt(j), used.get(j) || 0);
        if (end >= 0) {
          used.set(j, end);
          drop.add(i);
          break;
        }
      }
    }
    return {
      lines: lines.filter((_, i) => !drop.has(i)),
      furigana: lines.filter((_, i) => drop.has(i))
    };
  }
  async function wordAcross(left, right, analyze2) {
    const tail = tailOf(left);
    const r = await analyze2(tail + headOf(right));
    const at = tail.length;
    return { r, at, across: r.tokens.some((t3) => !LAYOUT.has(t3.kind) && t3.start < at && t3.end > at) };
  }
  async function closeSpaces(line2, analyze2) {
    const parts = line2.split(" ");
    let out = parts[0];
    let joins = 0;
    for (const part of parts.slice(1)) {
      if (isJapanese(lastOf(out)) && isJapanese(firstOf(part)) && (await wordAcross(out, part, analyze2)).across) {
        out += part;
        joins += 1;
      } else out += ` ${part}`;
    }
    return { line: out, joins };
  }
  async function goesOn(a, b, analyze2) {
    const last = lastOf(a);
    const first = firstOf(b);
    if (ENDS.has(last)) return false;
    if (last === "\u3001") return true;
    if (!isJapanese(last) || !isJapanese(first)) return false;
    const { r, at, across } = await wordAcross(a, b, analyze2);
    if (across) return true;
    const after = r.tokens.find((t3) => t3.start === at);
    if (after && (after.kind === "particle" || after.kind === "copula")) return true;
    const before = r.tokens.filter((t3) => t3.end === at && !LAYOUT.has(t3.kind)).at(-1);
    return Boolean(before && before.kind === "particle" && GOES_ON.has(before.surface));
  }
  async function cleanScan(text, analyze2) {
    const lines = normalize(text).split("\n").map((line2) => line2.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
    const { lines: kept, furigana } = await dropFurigana(lines, analyze2);
    let joins = 0;
    const out = [];
    for (const raw of kept) {
      const { line: line2, joins: closed } = await closeSpaces(raw, analyze2);
      joins += closed;
      if (out.length && await goesOn(out[out.length - 1], line2, analyze2)) {
        out[out.length - 1] += line2;
        joins += 1;
      } else out.push(line2);
    }
    return { text: out.join("\n"), furigana, joins };
  }

  // js/progress.js
  var PERIODS = Object.freeze(["week", "month", "all"]);
  var SPAN2 = Object.freeze({ week: 7, month: 30 });
  var MONTHS = 12;
  var NEXT_UP = 7;
  var monthOf = (day) => day.slice(0, 7);
  function prevMonth(month) {
    const [y, m] = month.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  }
  function newByTime(seen, today, period) {
    const firsts = Object.values(seen || {}).filter((s) => s && s.n >= 1).map((s) => s.first);
    if (period in SPAN2) {
      const days = Array.from({ length: SPAN2[period] }, (_, i) => addDays(today, i - SPAN2[period] + 1));
      const count5 = new Map(days.map((d) => [d, 0]));
      for (const f of firsts) if (count5.has(f)) count5.set(f, count5.get(f) + 1);
      return days.map((d) => ({ label: d, n: count5.get(d) }));
    }
    const last = monthOf(today);
    const earliest = firsts.length ? monthOf(firsts.reduce((a, b) => a < b ? a : b)) : last;
    const months = [last];
    while (months.length < MONTHS && months[0] > earliest) months.unshift(prevMonth(months[0]));
    const count4 = new Map(months.map((m) => [m, 0]));
    for (const f of firsts) if (count4.has(monthOf(f))) count4.set(monthOf(f), count4.get(monthOf(f)) + 1);
    return months.map((m) => ({ label: m, n: count4.get(m) }));
  }
  function periodStart(today, period) {
    return period in SPAN2 ? addDays(today, 1 - SPAN2[period]) : "";
  }
  function progressOf({ kanji, entries = {}, joyo = null, today, period = "week", due = 0 }) {
    const from = periodStart(today, period);
    const seen = Object.values(kanji.seen || {}).filter((s) => s && s.n >= 1);
    const texts = Object.values(entries || {}).filter((e) => e && dayOf(e.last) >= from).length;
    const boxes = Array.from({ length: TOP_BOX + 1 }, () => 0);
    let saved = 0;
    for (const rec of Object.values(kanji.saved || {})) {
      if (!rec) continue;
      boxes[Math.min(TOP_BOX, Math.max(0, rec.box | 0))] += 1;
      if (dayOf(rec.at) >= from) saved += 1;
    }
    const shelves = joyo ? progress(joyo, kanji.seen) : null;
    return {
      period,
      texts,
      met: seen.filter((s) => s.last >= from).length,
      fresh: seen.filter((s) => s.first >= from).length,
      saved,
      bars: newByTime(kanji.seen, today, period),
      grades: shelves ? shelves.byGrade : null,
      boxes,
      due,
      next: joyo ? nextToCollect(joyo, kanji.seen, NEXT_UP) : []
    };
  }

  // js/gaps.js
  init_kana();
  var REASONS = Object.freeze(["particle", "copula", "name", "script", "loan", "nostart", "guess", "compound", "word"]);
  var SCRIPTS3 = Object.freeze(["kanji", "hiragana", "katakana", "latin", "digit"]);
  var NOSTART = Object.freeze(/* @__PURE__ */ new Set([..."\u30F3\u30C3\u30FC\u3083\u3085\u3087\u30E3\u30E5\u30E7\u3041\u3043\u3045\u3047\u3049\u30A1\u30A3\u30A5\u30A7\u30A9\u308E\u30EE"]));
  var LOAN_FINAL = /* @__PURE__ */ new Set([..."\u30C9\u30C8\u30B9\u30AF\u30B0\u30EB"]);
  var CONSONANT = /* @__PURE__ */ new Set([..."\u30F3\u30C3\u30AF\u30B0\u30B9\u30BA\u30C4\u30C5\u30CC\u30D5\u30D6\u30D7\u30E0\u30EB\u30C8\u30C9"]);
  function isWordChar(ch) {
    return !!ch && (isKana(ch) || isKanji2(ch) || /[\p{L}\p{N}]/u.test(ch));
  }
  function slotsOf(text) {
    const chars3 = [...String(text || "")];
    const out = [];
    for (let k = 1; k < chars3.length; k += 1) if (isWordChar(chars3[k - 1]) && isWordChar(chars3[k])) out.push(k);
    return out;
  }
  function checkLine(key, picks) {
    const want = new Set(key);
    const got = new Set(picks);
    const right = [...got].filter((p) => want.has(p)).sort((a, b) => a - b);
    const extra = [...got].filter((p) => !want.has(p)).sort((a, b) => a - b);
    const missing = [...want].filter((p) => !got.has(p)).sort((a, b) => a - b);
    return { right, extra, missing, score: Math.max(0, right.length - extra.length) };
  }
  function wordsOf2(text, key) {
    const chars3 = [...String(text || "")];
    const cuts = new Set(key);
    const out = [];
    let cur = null;
    chars3.forEach((ch, k) => {
      if (!isWordChar(ch)) {
        cur = null;
        return;
      }
      if (!cur || cuts.has(k)) {
        cur = { from: k, to: k, text: "" };
        out.push(cur);
      }
      cur.to = k + 1;
      cur.text += ch;
    });
    return out;
  }
  function pairAt(text, key, at) {
    const words = wordsOf2(text, key);
    const a = words.find((w) => w.to === at);
    const b = words.find((w) => w.from === at);
    return [a ? a.text : "", b ? b.text : ""];
  }
  function extraReason(text, key, at) {
    const next2 = [...String(text || "")][at];
    if (NOSTART.has(next2)) return { why: "nostart-extra", k: next2 };
    const word = wordsOf2(text, key).find((w) => w.from < at && w.to > at);
    return { why: "inside", w: word ? word.text : "" };
  }

  // js/play-spaces.js
  init_kana();
  var SPACES_SRC = "data/play/spaces.json";
  var SPACES_FORMAT = "yomu-spaces/1";
  var DRAW = Object.freeze([[1, 4], [2, 4], [3, 2]]);
  var isText = (v) => typeof v === "string" && v.trim().length > 0;
  function cleanLine(l) {
    if (!l || typeof l !== "object" || !isText(l.id) || !isText(l.ja) || ![1, 2, 3].includes(l.tier)) return null;
    if (!Array.isArray(l.gaps) || !l.gaps.length) return null;
    const slots = slotsOf(l.ja);
    const open = new Set(slots);
    let last = 0;
    for (const g of l.gaps) {
      if (!g || !Number.isInteger(g.at) || !open.has(g.at) || g.at <= last || !REASONS.includes(g.why)) return null;
      last = g.at;
    }
    const out = { id: l.id, of: isText(l.of) ? l.of : l.id, tier: l.tier, ja: l.ja, gaps: l.gaps, slots, key: l.gaps.map((g) => g.at) };
    if (isText(l.en) && isText(l.es)) out.meaning = { en: l.en, es: l.es };
    return out;
  }
  function tierHint(q) {
    if (!q || q.tier !== 2) return q && q.tier === 3 ? "spacesTier3" : "spacesTier1";
    const chars3 = [...String(q.ja || "")].filter((ch) => ch !== "\u30FC");
    const held = [[isKanji2, "K"], [isKatakana2, "T"], [isHiragana2, "H"]].filter(([is]) => chars3.some(is)).map(([, x]) => x).join("");
    return held ? `spacesTier2${held}` : "spacesTier2Any";
  }
  function parseSpaces(doc) {
    if (!doc || typeof doc !== "object" || doc.format !== SPACES_FORMAT) throw new Error(`${SPACES_SRC}: format is not ${SPACES_FORMAT}`);
    if (!Array.isArray(doc.lines)) throw new Error(`${SPACES_SRC}: no lines`);
    const lines = [];
    let dropped = 0;
    for (const l of doc.lines) {
      const ok = cleanLine(l);
      if (ok) lines.push(ok);
      else dropped += 1;
    }
    return { lines, dropped };
  }
  var file = null;
  function loadSpaces(fetcher = fetchJson) {
    if (!file) {
      file = Promise.resolve().then(() => fetcher(SPACES_SRC)).then(parseSpaces).catch((err) => {
        file = null;
        throw err;
      });
    }
    return file;
  }
  function spacesRound(lines, { rand = Math.random } = {}) {
    const used = /* @__PURE__ */ new Set();
    const out = [];
    let owed = 0;
    for (const [tier, n2] of DRAW) {
      const want = n2 + owed;
      const got = [];
      for (const l of shuffle(lines.filter((x) => x.tier === tier), rand)) {
        if (got.length >= want) break;
        if (used.has(l.of)) continue;
        used.add(l.of);
        got.push(l);
      }
      owed = want - got.length;
      out.push(...got);
    }
    for (const l of shuffle(lines, rand)) {
      if (out.length >= ROUND) break;
      if (!used.has(l.of)) {
        used.add(l.of);
        out.push(l);
      }
    }
    return createRound("spaces", out.slice(0, ROUND).sort((a, b) => a.tier - b.tier), { marks: [] });
  }
  function marksOf(r) {
    if (!r || !current3(r)) return /* @__PURE__ */ new Set();
    if (!r.marks[r.at]) r.marks[r.at] = /* @__PURE__ */ new Set();
    return r.marks[r.at];
  }
  function toggleMark(r, at) {
    const q = current3(r);
    if (!q || answeredNow(r) || !q.slots.includes(at)) return false;
    const m = marksOf(r);
    if (m.has(at)) m.delete(at);
    else m.add(at);
    return true;
  }
  function checkMarks(r) {
    const q = current3(r);
    if (!q || answeredNow(r)) return null;
    const pick2 = [...marksOf(r)].sort((a, b) => a - b);
    const got = checkLine(q.key, pick2);
    const p = {
      pick: pick2,
      hit: got.right,
      extra: got.extra,
      missing: got.missing,
      score: got.score,
      right: !got.extra.length && !got.missing.length
    };
    r.picks.push(p);
    return p;
  }
  function spacesScore(r) {
    return r ? r.picks.reduce((n2, p) => n2 + (p.score || 0), 0) : 0;
  }
  function spacesTotal(r) {
    return r ? r.questions.reduce((n2, q) => n2 + q.key.length, 0) : 0;
  }
  function spacesCounts(r) {
    const right = r ? r.picks.reduce((n2, p) => n2 + p.hit.length, 0) : 0;
    const extra = r ? r.picks.reduce((n2, p) => n2 + p.extra.length, 0) : 0;
    return { right, extra, of: spacesTotal(r) };
  }
  function missedLines(r) {
    return r ? r.questions.filter((q, i) => r.picks[i] && !r.picks[i].right) : [];
  }

  // js/gap-reasons.js
  var KEY4 = Object.freeze({
    particle: "gapParticle",
    copula: "gapCopula",
    script: "gapScript",
    loan: "gapLoan",
    nostart: "gapNostart",
    guess: "gapGuess",
    compound: "gapCompound",
    "nostart-extra": "gapExtraNostart",
    inside: "gapExtraInside"
  });
  var WORD_KEY2 = Object.freeze({ form: "gapWordForm", number: "gapWordNumber", prefix: "gapWordPrefix" });
  var SCRIPT_KEY = Object.freeze({
    kanji: "gapScriptKanji",
    hiragana: "gapScriptHiragana",
    katakana: "gapScriptKatakana",
    latin: "gapScriptLatin",
    digit: "gapScriptDigit"
  });
  function reasonKey(g) {
    if (!g) return null;
    if (g.why === "name") return g.o ? "gapNameO" : "gapName";
    if (g.why === "guess" && g.k) return "gapGuessNostart";
    if (g.why === "word") return WORD_KEY2[g.f] || "gapWord";
    return KEY4[g.why] || null;
  }
  function reasonParts(g) {
    const key = reasonKey(g);
    if (!key) return [];
    const raw = ui(key);
    const out = [];
    let at = 0;
    for (const m of raw.matchAll(/\{(\w+)\}/g)) {
      if (m.index > at) out.push(raw.slice(at, m.index));
      const name = m[1];
      if (name === "from" || name === "to") out.push(ui(SCRIPT_KEY[g[name]] || "gapScriptKanji"));
      else if (name === "o") out.push(String(g.o || ""));
      else out.push({ ja: String(g[name] ?? "") });
      at = m.index + m[0].length;
    }
    if (at < raw.length) out.push(raw.slice(at));
    if (g.guess && g.why !== "guess") {
      const last = out[out.length - 1];
      if (typeof last === "string" && last.endsWith(".")) out[out.length - 1] = last.slice(0, -1);
      out.push(ui("gapGuessToo"));
    }
    return out;
  }
  function reasonText(g) {
    return reasonParts(g).map((p) => typeof p === "string" ? p : p.ja).join("");
  }

  // js/play-store.js
  init_kana();
  var KEY5 = "yomu-site:play";
  var VERSION3 = 1;
  var DAMAGED_KEY4 = `${KEY5}:damaged`;
  var GAME_IDS2 = Object.freeze(["which", "odd", "oddFree", "twins", "names", "spaces"]);
  var TOP = Object.freeze({ which: 10, odd: 999, oddFree: 10, twins: 10, names: 10, spaces: 999 });
  var MAX_MIXED2 = 400;
  var MAX_COUNT2 = 9999;
  var isObject4 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var isCount7 = (n2) => Number.isInteger(n2) && n2 >= 0;
  var isPlayChar = (ch) => typeof ch === "string" && [...ch].length === 1 && (isKana(ch) || isKanji2(ch) || ch === "\u30FC");
  function emptyData2() {
    return { games: {}, mixed: {} };
  }
  function pairKey(a, b) {
    if (!isPlayChar(a) || !isPlayChar(b) || a === b) return null;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  function pairOf(key) {
    const parts = typeof key === "string" ? key.split("|") : [];
    if (parts.length !== 2 || pairKey(parts[0], parts[1]) !== key) return null;
    return parts;
  }
  function cleanGame2(id, v) {
    if (!isObject4(v) || !isCount7(v.best) || !isCount7(v.rounds)) return null;
    if (v.best > TOP[id] || v.rounds > MAX_COUNT2 || v.best > 0 && v.rounds === 0) return null;
    return { best: v.best, rounds: v.rounds };
  }
  function capMixed(mixed) {
    const list2 = Object.entries(mixed);
    if (list2.length <= MAX_MIXED2) return mixed;
    list2.sort(([ka, a], [kb, b]) => b - a || (ka < kb ? -1 : 1));
    return Object.fromEntries(list2.slice(0, MAX_MIXED2));
  }
  function validate3(raw) {
    const data = emptyData2();
    if (!isObject4(raw)) return { data, dropped: 0, damaged: raw !== null && raw !== void 0 };
    let dropped = 0;
    if (isObject4(raw.games)) {
      for (const [id, v] of Object.entries(raw.games)) {
        const ok = GAME_IDS2.includes(id) ? cleanGame2(id, v) : null;
        if (ok) data.games[id] = ok;
        else dropped += 1;
      }
    } else if (raw.games !== void 0) dropped += 1;
    if (isObject4(raw.mixed)) {
      for (const [k, n2] of Object.entries(raw.mixed)) {
        if (pairOf(k) && Number.isInteger(n2) && n2 >= 1 && n2 <= MAX_COUNT2) data.mixed[k] = n2;
        else dropped += 1;
      }
      data.mixed = capMixed(data.mixed);
    } else if (raw.mixed !== void 0) dropped += 1;
    return { data, dropped, damaged: false };
  }
  function recordRound(data, game, score) {
    if (!GAME_IDS2.includes(game) || !isCount7(score)) return null;
    const was = data.games[game] || { best: 0, rounds: 0 };
    const s = Math.min(score, TOP[game]);
    const isBest = s > was.best;
    data.games[game] = { best: Math.max(was.best, s), rounds: Math.min(was.rounds + 1, MAX_COUNT2) };
    return { best: data.games[game].best, isBest };
  }
  function recordMixed(data, a, b) {
    const k = pairKey(a, b);
    if (!k) return 0;
    data.mixed[k] = Math.min((data.mixed[k] || 0) + 1, MAX_COUNT2);
    data.mixed = capMixed(data.mixed);
    return data.mixed[k] || 0;
  }
  function mixedCount(data, a, b) {
    const k = pairKey(a, b);
    return k ? data.mixed[k] || 0 : 0;
  }
  function openPlay({ store = createStore({ key: KEY5, version: VERSION3 }), readRaw = () => safeGet(KEY5), keepRaw = (s) => safeSet(DAMAGED_KEY4, s) } = {}) {
    let data = emptyData2();
    let note = null;
    let dropped = 0;
    let writable = true;
    const listeners = /* @__PURE__ */ new Set();
    function load() {
      const raw = readRaw();
      const loaded2 = store.load(null);
      note = null;
      dropped = 0;
      if (raw !== null && raw !== void 0 && loaded2 === null) {
        keepRaw(raw);
        data = emptyData2();
        note = "damaged";
        return api;
      }
      const v = validate3(loaded2);
      data = v.data;
      dropped = v.dropped;
      if (v.damaged || v.dropped) {
        if (raw !== null && raw !== void 0) keepRaw(raw);
        note = v.damaged ? "damaged" : "partial";
      }
      return api;
    }
    function commit() {
      writable = store.save(data);
      for (const fn of listeners) fn();
    }
    const api = {
      load,
      get data() {
        return data;
      },
      get note() {
        return note;
      },
      get dropped() {
        return dropped;
      },
      get writable() {
        return writable;
      },
      onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /** What sync decided (js/sync.js), read through this store's own validation. */
      adopt(next2) {
        data = validate3(next2).data;
        commit();
      },
      best: (game) => data.games[game] ? data.games[game].best : 0,
      rounds: (game) => data.games[game] ? data.games[game].rounds : 0,
      finish(game, score) {
        const r = recordRound(data, game, score);
        if (r) commit();
        return r;
      },
      mixed(a, b) {
        const n2 = recordMixed(data, a, b);
        if (n2) commit();
        return n2;
      },
      mixedCount: (a, b) => mixedCount(data, a, b)
    };
    return api;
  }

  // js/sync-book.js
  var BOOK_KEY = "yomu-site:sync";
  var BOOK_VERSION = 1;
  var isObject5 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var isTime4 = (v) => Number.isFinite(v) && v > 0;
  var isStamp2 = (v) => Number.isFinite(v) && v >= 0;
  function syncedPrefs(prefs) {
    const out = {};
    for (const k of PREF_KEYS) if (prefs && PREFS[k].includes(prefs[k])) out[k] = prefs[k];
    return out;
  }
  var PENDING = Object.freeze(["adopt", "replace"]);
  var FIRST = "first";
  function newBook(account2, now, prefs, epoch = 0) {
    return {
      account: account2,
      joined: now,
      epoch,
      at: 0,
      brought: { kanji: {}, phrases: {}, words: {} },
      removed: { kanji: {}, phrases: {}, words: {} },
      saves: { kanji: {}, phrases: {}, words: {} },
      heard: { kanji: {}, phrases: {}, words: {} },
      prefsAt: {},
      prefsVal: syncedPrefs(prefs)
    };
  }
  function answeredBook(account2, mode, now, prefs) {
    return { ...newBook(account2, now, prefs), pending: mode };
  }
  function answerBook(had, account2, mode, now, prefs) {
    if (had && had.account === account2 && had.pending === FIRST && mode === "adopt") return { ...had, pending: mode, joined: now };
    return answeredBook(account2, mode, now, prefs);
  }
  function clearsOf(book, who = null) {
    if (!book || book.pending === "replace") return "here";
    if (who !== null && book.account !== who) return "here";
    return book.pending ? "joining" : "account";
  }
  function cleanMap2(raw, keyOk) {
    const out = {};
    if (isObject5(raw)) {
      for (const [k, v] of Object.entries(raw)) if (keyOk(k) && isTime4(v)) out[k] = v;
    }
    return out;
  }
  function cleanHeard(raw, keyOk) {
    const out = {};
    if (!isObject5(raw)) return out;
    for (const [k, v] of Object.entries(raw)) {
      if (keyOk(k) && Array.isArray(v) && v.length === 2 && v.every(isStamp2) && (v[0] > 0 || v[1] > 0)) out[k] = [v[0], v[1]];
    }
    return out;
  }
  var isKey = (k) => HISTORY_KEY2.test(k);
  var isWord2 = (k) => WORD_KEY.test(k);
  function cleanBook(raw) {
    if (!isObject5(raw) || typeof raw.account !== "string" || !raw.account || raw.account.length > 200 || !isTime4(raw.joined)) return null;
    const brought = isObject5(raw.brought) ? raw.brought : {};
    const removed = isObject5(raw.removed) ? raw.removed : {};
    const saves = isObject5(raw.saves) ? raw.saves : {};
    const heard = isObject5(raw.heard) ? raw.heard : {};
    const prefsAt = {};
    for (const k of PREF_KEYS) if (isObject5(raw.prefsAt) && isStamp2(raw.prefsAt[k])) prefsAt[k] = raw.prefsAt[k];
    const book = {
      account: raw.account,
      joined: raw.joined,
      epoch: isStamp2(raw.epoch) ? raw.epoch : 0,
      at: isStamp2(raw.at) ? raw.at : 0,
      brought: { kanji: cleanMap2(brought.kanji, oneKanji2), phrases: cleanMap2(brought.phrases, isKey), words: cleanMap2(brought.words, isWord2) },
      removed: { kanji: cleanMap2(removed.kanji, oneKanji2), phrases: cleanMap2(removed.phrases, isKey), words: cleanMap2(removed.words, isWord2) },
      saves: { kanji: cleanMap2(saves.kanji, oneKanji2), phrases: cleanMap2(saves.phrases, isKey), words: cleanMap2(saves.words, isWord2) },
      heard: { kanji: cleanHeard(heard.kanji, oneKanji2), phrases: cleanHeard(heard.phrases, isKey), words: cleanHeard(heard.words, isWord2) },
      prefsAt,
      prefsVal: syncedPrefs(raw.prefsVal)
    };
    if (PENDING.includes(raw.pending) || raw.pending === FIRST) book.pending = raw.pending;
    if (typeof raw.kit === "string" && raw.kit && raw.kit.length <= 200 && raw.kit !== raw.account) book.kit = raw.kit;
    return book;
  }
  function heardFrom(server, before = null) {
    const out = { kanji: {}, phrases: {}, words: server.words instanceof Map ? {} : { ...before && before.words || {} } };
    for (const [ch, row] of server.kanji) {
      const s = row.saved ? row.saved.s : 0;
      if (s > 0 || row.removed > 0) out.kanji[ch] = [s, row.removed];
    }
    for (const [key, row] of server.phrases) {
      const s = row.phrase ? row.phrase.s : 0;
      if (s > 0 || row.removed > 0) out.phrases[key] = [s, row.removed];
    }
    if (server.words instanceof Map) {
      for (const [key, row] of server.words) {
        const s = row.word ? row.word.s : 0;
        if (s > 0 || row.removed > 0) out.words[key] = [s, row.removed];
      }
    }
    return out;
  }
  function heardOf(book, kind, id) {
    const map = book.heard[kind];
    if (kind === "kanji" && (id === null || id === void 0)) {
      let s = 0;
      for (const [t3] of Object.values(map)) s = Math.max(s, t3);
      return { s, removed: 0 };
    }
    const row = Object.hasOwn(map, id) ? map[id] : null;
    return row ? { s: row[0], removed: row[1] } : { s: 0, removed: 0 };
  }
  function noteRemoval(book, kind, id, at) {
    book.removed[kind][id] = Math.max(book.removed[kind][id] || 0, at);
  }
  function noteClear(book, at) {
    book.epoch = Math.max(book.epoch, at);
    for (const [ch, t3] of Object.entries(book.removed.kanji)) if (t3 <= book.epoch) delete book.removed.kanji[ch];
  }
  function notePrefs(book, prefs, at) {
    let changed = false;
    for (const [k, v] of Object.entries(syncedPrefs(prefs))) {
      if (book.prefsVal[k] === v) continue;
      book.prefsVal[k] = v;
      book.prefsAt[k] = at;
      changed = true;
    }
    return changed;
  }
  function carriedOf(book, { words = true } = {}) {
    const copy = (m) => ({ kanji: { ...m.kanji }, phrases: { ...m.phrases }, words: words ? { ...m.words } : {} });
    return { removed: copy(book.removed), saves: copy(book.saves) };
  }
  function pruneCarried(book, carried) {
    for (const part of ["removed", "saves"]) {
      for (const kind of ["kanji", "phrases", "words"]) {
        for (const [id, t3] of Object.entries(carried[part][kind] || {})) {
          if (book[part][kind][id] !== void 0 && book[part][kind][id] <= t3) delete book[part][kind][id];
        }
      }
    }
  }
  function openBook({ store = createStore({ key: BOOK_KEY, version: BOOK_VERSION }) } = {}) {
    return {
      read: () => cleanBook(store.load(null)),
      write: (book) => store.save(book),
      /** Change the book, if there is one: what a removal or a preference does while the browser has an account. */
      update(fn) {
        const book = cleanBook(store.load(null));
        if (!book) return null;
        fn(book);
        store.save(book);
        return book;
      }
    };
  }

  // js/sync-watch.js
  function storesAdapter({ kanji, history, play, words = null, prefs, remembering }) {
    const adapter = {
      applying: false,
      snapshot() {
        return {
          kanji: { saved: kanji.data.saved, seen: kanji.data.seen },
          phrases: history.savedList(),
          words: { saved: words ? words.data.saved : {} },
          play: { games: play.data.games, mixed: play.data.mixed },
          prefs: { ...prefs.get() }
        };
      },
      apply(a) {
        adapter.applying = true;
        try {
          if (Object.keys(a.saved).length || Object.keys(a.seen).length) kanji.adopt({ saved: a.saved, seen: a.seen });
          for (const key of a.unsave) history.unsave(key, remembering());
          if (a.merge.length) history.mergePhrases(a.merge);
          if (words && a.words && Object.keys(a.words).length) words.adopt(a.words);
          if (a.play) play.adopt(a.play);
          if (a.prefs) prefs.set(a.prefs);
        } finally {
          adapter.applying = false;
        }
      }
    };
    return adapter;
  }
  var NOTHING = Object.freeze({ s: 0, removed: 0 });
  var isObject6 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var REACH = Object.freeze(["here", "joining", "account"]);
  var least = (said2, now) => REACH.includes(said2) && REACH.indexOf(said2) < REACH.indexOf(now) ? said2 : now;
  function watchStores({ kanji, history, play, words = null, onPrefsSaved, books, local, now = Date.now, changed = () => {
  }, known = () => NOTHING, clears = (b) => clearsOf(b) }) {
    const mine2 = () => !local.applying;
    const account2 = (b, kind, id) => {
      const page = known(kind, id);
      const book = heardOf(b, kind, id);
      return { s: Math.max(page.s, book.s), removed: Math.max(page.removed, book.removed) };
    };
    const newestSave = (b, kind, id, own) => Math.max(own ? Math.max(own, b.brought[kind][id] || 0) : 0, b.saves[kind][id] || 0, account2(b, kind, id).s);
    const newestRemoval = (b, kind, id) => Math.max(b.removed[kind][id] || 0, kind === "kanji" ? b.epoch : 0, account2(b, kind, id).removed);
    function unsaved(kind, id, own) {
      books.update((b) => {
        noteRemoval(b, kind, id, Math.max(now(), newestSave(b, kind, id, own) + 1));
        delete b.saves[kind][id];
        delete b.brought[kind][id];
      });
    }
    function cleared(at, saved2, said2) {
      books.update((b) => {
        const kind = isObject6(said2) ? said2.kind : said2;
        const other = isObject6(said2) && said2.account !== (b ? b.account : null);
        const mine3 = other ? b && b.pending ? "here" : least(kind, "joining") : kind;
        const how = least(mine3, clears(b));
        if (how === "joining") {
          for (const [ch, rec] of Object.entries(saved2 || {})) {
            if (!b.pending && !Object.hasOwn(b.brought.kanji, ch) && !Object.hasOwn(b.saves.kanji, ch)) continue;
            noteRemoval(b, "kanji", ch, Math.max(now(), newestSave(b, "kanji", ch, rec && rec.at) + 1));
          }
        } else if (how === "account") {
          let newest = account2(b, "kanji", null).s;
          for (const [ch, rec] of Object.entries(saved2 || {})) newest = Math.max(newest, rec.at, b.brought.kanji[ch] || 0);
          for (const t3 of Object.values(b.saves.kanji)) newest = Math.max(newest, t3);
          noteClear(b, Math.max(at, newest + 1));
        }
        b.saves.kanji = {};
        b.brought.kanji = {};
      });
    }
    function saved(kind, id, at) {
      books.update((b) => {
        b.saves[kind][id] = Math.max(b.saves[kind][id] || 0, at, newestRemoval(b, kind, id) + 1);
        delete b.brought[kind][id];
      });
    }
    function imported(chars3, texts, ids = []) {
      const keys = texts.map(textKey).filter((key) => history.isSaved(key));
      const kept = chars3.filter((ch) => kanji.isSaved(ch));
      const held = words ? ids.filter((id) => id && words.byId(id)) : [];
      if (!keys.length && !kept.length && !held.length) return;
      books.update((b) => {
        const at = now();
        for (const ch of kept) b.saves.kanji[ch] = Math.max(b.saves.kanji[ch] || 0, at, newestRemoval(b, "kanji", ch) + 1);
        for (const key of keys) b.saves.phrases[key] = Math.max(b.saves.phrases[key] || 0, at, newestRemoval(b, "phrases", key) + 1);
        for (const id of held) b.saves.words[id] = Math.max(b.saves.words[id] || 0, at, newestRemoval(b, "words", id) + 1);
      });
    }
    const offs = [
      kanji.onChange((ev) => {
        if (!mine2()) return;
        const type = ev && ev.type;
        if (type === "unsave") unsaved("kanji", ev.ch, ev.rec && ev.rec.at);
        else if (type === "clear") cleared(ev.at, ev.saved, ev.said);
        else if (type === "save") saved("kanji", ev.ch, ev.at);
        else if (type === "import") imported(ev.chars || [], ev.texts || []);
        changed();
      }),
      history.onChange((ev) => {
        if (!mine2()) return;
        const type = ev && ev.type;
        if (type === "unsave") unsaved("phrases", ev.key, ev.saved);
        else if (type === "save") saved("phrases", ev.key, ev.at);
        changed();
      }),
      // A saved word, as a phrase: no Clear all reaches it (sync-rules.js).
      ...words ? [words.onChange((ev) => {
        if (!mine2()) return;
        const type = ev && ev.type;
        if (type === "unsave") unsaved("words", ev.id, ev.rec && ev.rec.at);
        else if (type === "save") saved("words", ev.id, ev.at);
        else if (type === "import") imported([], [], ev.ids || []);
        changed();
      })] : [],
      play.onChange(() => {
        if (mine2()) changed();
      }),
      onPrefsSaved((prefs) => {
        if (!mine2()) return;
        books.update((b) => notePrefs(b, prefs, now()));
        changed();
      })
    ];
    return () => {
      for (const off of offs) off();
    };
  }

  // js/account.js
  var CONVEX_URL = "https://wandering-ox-429.convex.cloud";
  var PUSH_AFTER = 4e3;
  var PULL_EVERY = 60 * 1e3;
  var NOTHING_KNOWN = Object.freeze({ s: 0, removed: 0 });
  function clerkKey(doc) {
    const meta = doc && doc.querySelector('meta[name="clerk-publishable-key"]');
    return meta && typeof meta.content === "string" ? meta.content.trim() : "";
  }
  function accountsWanted(doc, embed) {
    return !embed && clerkKey(doc).length > 0;
  }
  function failureKind(err, online = true) {
    if (!online || err instanceof TypeError) return "offline";
    const code = err && err.code;
    if (code === "not-authenticated") return "signin";
    if (code === "account-changed") return "switched";
    if (code === "too-many-rows") return "refused";
    return "server";
  }
  function startAccount(deps) {
    const { doc, win, embed, importKit, importClient, importEngine, kanji, history, play, words = null, prefs, remembering, books, ui: ui2 } = deps;
    if (!accountsWanted(doc, embed)) return null;
    const now = deps.now || Date.now;
    const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer || ((t3) => clearTimeout(t3));
    const local = storesAdapter({ kanji, history, play, words, prefs, remembering });
    const kept = books.read();
    const status = { available: false, signedIn: false, label: "", phase: "idle", at: kept ? kept.at : 0, synced: false, clears: "here", error: null };
    let kit = null;
    let client = null;
    let engine = null;
    let user = null;
    let timer = null;
    let lastPull = 0;
    let asked2 = null;
    let step = "connect";
    let gen = 0;
    let running = null;
    const carries = (b) => !!b && b.pending !== "first" && b.pending !== "replace";
    const signedAs = (b) => {
      if (user === null) return null;
      if (engine && engine.subject) return engine.subject;
      return b && b.kit === user ? b.account : user;
    };
    const clears = (b) => clearsOf(b, signedAs(b));
    const paint = () => {
      const b = books.read();
      status.synced = carries(b);
      status.clears = clears(b);
      status.account = b ? b.account : null;
      try {
        ui2.paint({ ...status });
      } catch (err) {
        console.error("[yomu] sync line", err);
      }
    };
    const live = () => status.signedIn && status.phase !== "paused";
    function fail(err) {
      const online = !(win && win.navigator && win.navigator.onLine === false);
      const kind = failureKind(err, online);
      if (status.phase !== "error" || !status.error || status.error.kind !== kind) console.warn("[yomu] sync failed, everything stays in this browser:", err);
      status.phase = "error";
      status.error = { kind };
    }
    function finished3(r) {
      if (r && r.at) status.at = r.at;
      status.phase = "synced";
      status.error = null;
      if (r && r.applied) ui2.refresh();
    }
    function failedAt(err) {
      if (err && err.code === "account-changed") {
        step = "connect";
        return;
      }
      const book = books.read();
      if (engine && engine.subject && book && book.account === engine.subject) step = "same";
    }
    async function runSync(mode, g) {
      status.phase = status.phase === "error" ? "error" : "syncing";
      paint();
      try {
        const r = await engine.sync(mode);
        if (g !== gen) return;
        step = "same";
        lastPull = now();
        finished3(r);
      } catch (err) {
        if (g !== gen) return;
        failedAt(err);
        fail(err);
      }
      paint();
    }
    async function ask(invoker, g = gen) {
      if (!asked2) return null;
      status.phase = "paused";
      status.error = null;
      paint();
      const answer3 = await ui2.ask({ label: status.label, counts: asked2.counts, since: asked2.since, first: asked2.first, invoker });
      if (g !== gen || answer3 !== "add" && answer3 !== "use") return null;
      asked2 = null;
      step = answer3 === "use" ? "replace" : "adopt";
      engine.choose(step);
      status.phase = "syncing";
      return answer3;
    }
    async function connect2(g) {
      try {
        if (!client) {
          const { ConvexHttpClient } = await importClient();
          if (g !== gen) return;
          if (!client) client = new ConvexHttpClient(CONVEX_URL);
        }
        const token = await kit.convexToken();
        if (g !== gen) return;
        if (token) client.setAuth(token);
        kit.bindConvex(client);
        if (!engine) {
          const { createSync: createSync2 } = await importEngine();
          if (g !== gen) return;
          if (!engine) engine = createSync2({ client, local, book: books, now, kit: () => user });
        }
        const begun = await engine.begin();
        if (g !== gen) return;
        if (begun.mode === "ask") {
          const old = books.read();
          const first = !!begun.first;
          asked2 = { counts: begun.counts, since: old && !first ? old.at : 0, first };
          step = "ask";
          if (await ask(null, g)) await runSync(step, g);
          return;
        }
        step = begun.mode;
        await runSync(step, g);
      } catch (err) {
        if (g !== gen) return;
        fail(err);
        paint();
      }
    }
    function resume() {
      if (running && running.gen === gen) return running.done;
      if (!live()) return Promise.resolve();
      const g = gen;
      const done = (async () => {
        if (step === "connect" || !engine) await connect2(g);
        else if (step !== "ask") await runSync(step, g);
      })().finally(() => {
        if (running && running.gen === g) running = null;
      });
      running = { gen: g, done };
      return done;
    }
    async function flush() {
      timer = null;
      if (!live()) return;
      const g = gen;
      if (running && running.gen === g) await running.done;
      if (g !== gen || !live()) return;
      if (step !== "same" || !engine || status.phase === "error") {
        await resume();
        return;
      }
      try {
        const r = await engine.flush();
        if (g !== gen) return;
        finished3(r);
        if (r && r.stale) {
          await resume();
          return;
        }
      } catch (err) {
        if (g !== gen) return;
        failedAt(err);
        fail(err);
      }
      paint();
    }
    function schedule2() {
      if (!live()) return;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        void flush();
      }, PUSH_AFTER);
    }
    watchStores({
      kanji,
      history,
      play,
      words,
      onPrefsSaved: prefs.onSaved,
      books,
      local,
      now,
      changed: schedule2,
      known: (kind, id) => engine ? engine.known(kind, id) : NOTHING_KNOWN,
      clears
    });
    function stop() {
      gen += 1;
      if (timer !== null) clearTimer(timer);
      timer = null;
      asked2 = null;
      user = null;
      step = "connect";
      running = null;
      if (engine) engine.stop();
      if (typeof ui2.dismiss === "function") ui2.dismiss();
    }
    function recordFrom(id) {
      if (typeof id !== "string" || !id) return;
      const b = books.read();
      if (b && (b.pending !== FIRST || b.account === id || b.kit === id)) return;
      books.write(answeredBook(id, FIRST, now(), prefs.get()));
    }
    function signedIn(s) {
      if (user === s.userId) {
        status.label = s.label || "";
        paint();
        return;
      }
      if (user !== null) stop();
      user = s.userId;
      recordFrom(user);
      status.signedIn = true;
      status.label = s.label || "";
      status.phase = "syncing";
      status.error = null;
      paint();
      void resume();
    }
    function onAuth(s) {
      status.available = s.status !== "unavailable";
      if (s.signedIn) {
        signedIn(s);
        return;
      }
      stop();
      status.signedIn = false;
      status.label = "";
      status.phase = "idle";
      status.error = null;
      paint();
    }
    doc.addEventListener("visibilitychange", () => {
      if (!live()) return;
      if (doc.visibilityState === "hidden") {
        if (timer !== null) {
          clearTimer(timer);
          void flush();
        }
        return;
      }
      if (status.phase === "error" || now() - lastPull >= PULL_EVERY) void resume();
    });
    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("online", () => {
        if (live() && status.phase === "error") void resume();
      });
      win.addEventListener("storage", (e) => {
        const key = e && typeof e.key === "string" ? e.key : null;
        if (key !== null && key !== BOOK_KEY) return;
        const b = books.read();
        if (b && b.account === signedAs(b) && b.at > status.at) status.at = b.at;
        paint();
      });
    }
    const ready = (async () => {
      const mod = await importKit();
      kit = mod.NeoAuth;
      kit.onChange(onAuth);
      const s = await kit.start({});
      status.available = s.status !== "unavailable";
      paint();
      return s;
    })().catch((err) => {
      console.warn("[yomu] the sign-in kit did not start; everything stays in this browser:", err);
      paint();
      return null;
    });
    paint();
    return {
      ready,
      /** The line's Sign in: the kit's dialog, with this page's reason. */
      signIn: async (invoker) => {
        await ready;
        return kit ? kit.requireSignIn({ reason: ui2.reason(), invoker }) : false;
      },
      /** The line's Choose, while another account waits for an answer. */
      async choose(invoker) {
        if (running && running.gen === gen) return;
        if (await ask(invoker)) await resume();
      },
      get status() {
        return { ...status };
      }
    };
  }

  // js/sync-host.js
  function documentStore(initial = null, wrote = () => {
  }) {
    let doc = initial === void 0 ? null : initial;
    return {
      load: (fallback = null) => doc === null ? fallback : doc,
      save(data) {
        doc = data;
        wrote(doc);
        return true;
      },
      clear() {
        doc = null;
        wrote(null);
        return true;
      },
      put(next2) {
        doc = next2 === void 0 ? null : next2;
      },
      get document() {
        return doc;
      }
    };
  }
  function prefsMirror(initial = null, wrote = () => {
  }) {
    const values = {};
    for (const k of PREF_KEYS) if (initial && Object.hasOwn(initial, k)) values[k] = initial[k];
    return {
      get: () => values,
      set(changes) {
        for (const k of PREF_KEYS) if (changes && Object.hasOwn(changes, k)) values[k] = changes[k];
        wrote({ ...values });
      },
      onSaved: () => () => {
      }
    };
  }
  var signedOut = () => ({ status: "signed-out", signedIn: false, userId: null, label: "" });
  var signedInAs = (userId, label = "") => ({ status: "signed-in", signedIn: true, userId, label });
  function hostKit({ state = signedOut(), token = async () => null, signIn = async () => false } = {}) {
    const listeners = /* @__PURE__ */ new Set();
    let now = state;
    const NeoAuth = {
      onChange(fn) {
        listeners.add(fn);
        Promise.resolve().then(() => fn(now));
        return () => listeners.delete(fn);
      },
      start: async () => now,
      convexToken: () => token(),
      bindConvex() {
      },
      requireSignIn: (opts) => signIn(opts)
    };
    return {
      NeoAuth,
      become(next2) {
        now = next2;
        for (const fn of listeners) fn(next2);
      },
      get state() {
        return now;
      }
    };
  }
  function clientModule(transport) {
    return {
      ConvexHttpClient: class {
        constructor(url) {
          this.url = url;
        }
        setAuth() {
        }
        query(name, args) {
          return transport("query", name, args, this.url);
        }
        mutation(name, args) {
          return transport("mutation", name, args, this.url);
        }
      }
    };
  }
  function pageless(key) {
    const heard = { doc: {}, win: {} };
    const listen = (side) => (type, fn) => {
      var _a;
      ((_a = heard[side])[type] || (_a[type] = [])).push(fn);
    };
    const doc = {
      visibilityState: "visible",
      querySelector: (sel) => sel === 'meta[name="clerk-publishable-key"]' && key ? { content: key } : null,
      addEventListener: listen("doc")
    };
    const win = { navigator: { onLine: true }, addEventListener: listen("win") };
    return {
      doc,
      win,
      shown(visible) {
        doc.visibilityState = visible ? "visible" : "hidden";
        for (const fn of heard.doc.visibilitychange || []) fn();
      },
      online(is) {
        win.navigator.onLine = !!is;
        if (is) for (const fn of heard.win.online || []) fn();
      }
    };
  }
  function startHost({ key, kit, transport, engine, kanji, words = null, phrases, play, prefs, remembering = () => true, book, ui: ui2, now, setTimer, clearTimer }) {
    const page = pageless(key);
    const account2 = startAccount({
      doc: page.doc,
      win: page.win,
      embed: false,
      importKit: async () => kit,
      importClient: async () => clientModule(transport),
      importEngine: async () => engine,
      kanji,
      history: phrases,
      play,
      words,
      prefs,
      remembering,
      books: openBook({ store: book }),
      ui: ui2,
      now,
      setTimer,
      clearTimer
    });
    return { account: account2, shown: page.shown, online: page.online };
  }

  // js/sync.js
  var sync_exports = {};
  __export(sync_exports, {
    FN: () => FN,
    KANJI_BATCH: () => KANJI_BATCH,
    PHRASE_BATCH: () => PHRASE_BATCH,
    SyncError: () => SyncError,
    WORD_BATCH: () => WORD_BATCH,
    accountHolds: () => accountHolds,
    counts: () => counts,
    createSync: () => createSync,
    decide: () => decide2,
    eraseAll: () => eraseAll,
    holdsAny: () => holdsAny,
    holdsOwn: () => holdsOwn,
    isMissingFunction: () => isMissingFunction,
    joinStamps: () => joinStamps,
    pullAll: () => pullAll,
    pushAll: () => pushAll,
    wordsOf: () => wordsOf3
  });

  // js/sync-local.js
  function dayOf2(cached, w, r) {
    const hit = cached && cached.seen ? cached.seen.words.find((x) => x[0] === w && x[1] === r) : null;
    return hit ? hit[2] : null;
  }
  function localKanjiRow(ch, kanji, book, cached) {
    const rec = kanji.saved[ch];
    const met = kanji.seen[ch];
    return cleanKanjiRow({
      char: ch,
      saved: rec ? { ...rec, s: Math.max(rec.at, book.brought.kanji[ch] || 0, book.saves.kanji[ch] || 0, cached && cached.saved && cached.saved.at === rec.at ? cached.saved.s : 0) } : null,
      removed: Math.max(book.removed.kanji[ch] || 0, cached ? cached.removed : 0),
      seen: met ? { n: met.n, first: met.first, last: met.last, words: met.words.map(([w, r]) => [w, r, dayOf2(cached, w, r) || met.last]), src: met.src, h: met.h, e: book.epoch } : null
    });
  }
  function localPhraseRow(key, entry, book, cached) {
    return cleanPhraseRow({
      key,
      removed: Math.max(book.removed.phrases[key] || 0, cached ? cached.removed : 0),
      phrase: entry ? { t: entry.t, first: entry.first, last: entry.last, n: entry.n, src: entry.src, saved: entry.saved, s: Math.max(entry.saved, book.brought.phrases[key] || 0, book.saves.phrases[key] || 0, cached && cached.phrase && cached.phrase.saved === entry.saved ? cached.phrase.s : 0) } : null
    });
  }
  function localWordRow(key, rec, book, cached) {
    return cleanWordRow({
      key,
      removed: Math.max(book.removed.words[key] || 0, cached ? cached.removed : 0),
      word: rec ? { ...rec, s: Math.max(rec.at, book.brought.words[key] || 0, book.saves.words[key] || 0, cached && cached.word && cached.word.at === rec.at ? cached.word.s : 0) } : null
    });
  }
  function localPlay(play) {
    return cleanPlay({ games: play.games, mixed: Object.entries(play.mixed).map(([k, n2]) => ({ k, n: n2 })) });
  }
  function localPrefs(prefs, book) {
    return cleanPrefs({ values: Object.fromEntries(PREF_KEYS.map((k) => [k, { v: prefs[k], at: book.prefsAt[k] || 0 }])) });
  }
  function toSaved(row) {
    const x = row && row.saved;
    return x ? { at: x.at, box: x.box, due: x.due, reviews: x.reviews, lapses: x.lapses } : null;
  }
  function toSeen(row) {
    const x = row && row.seen;
    if (!x) return null;
    const out = { n: x.n, first: x.first, last: x.last, words: x.words.map(([w, r]) => [w, r]) };
    if (x.src) out.src = x.src;
    if (x.h) out.h = x.h;
    return out;
  }
  var SAVED_FIELDS = ["at", "box", "due", "reviews", "lapses"];
  var sameSaved = (a, b) => !a || !b ? !a === !b : SAVED_FIELDS.every((f) => a[f] === b[f]);
  var wordSet = (list2) => list2.map(([w, r]) => `${w}\0${r}`).sort().join("");
  function sameSeen(a, b) {
    if (!a || !b) return !a === !b;
    return a.n === b.n && a.first === b.first && a.last === b.last && a.src === b.src && a.h === b.h && wordSet(a.words) === wordSet(b.words);
  }
  var localWords = (local) => local && local.words && local.words.saved || {};
  function toWord(row) {
    const x = row && row.word;
    return x ? { w: x.w, r: x.r, g: x.g, at: x.at, box: x.box, due: x.due, reviews: x.reviews, lapses: x.lapses } : null;
  }
  var WORD_FIELDS = ["w", "r", "g", "at", "box", "due", "reviews", "lapses"];
  var sameWord = (a, b) => !a || !b ? !a === !b : WORD_FIELDS.every((f) => a[f] === b[f]);
  var PHRASE_FIELDS = ["first", "last", "n", "src", "saved"];
  var samePhrase = (e, p) => PHRASE_FIELDS.every((f) => e[f] === p[f]);
  function sinceAnswer(local, book) {
    const saved = {};
    for (const [ch, rec] of Object.entries(local.kanji.saved)) if (Object.hasOwn(book.saves.kanji, ch)) saved[ch] = rec;
    const words = {};
    for (const [key, rec] of Object.entries(localWords(local))) if (Object.hasOwn(book.saves.words, key)) words[key] = rec;
    const values = {};
    const mine2 = localPrefs(local.prefs, book);
    for (const [k, p] of Object.entries(mine2 ? mine2.values : {})) if (book.prefsAt[k]) values[k] = p;
    return {
      kanji: { saved, seen: {} },
      phrases: local.phrases.filter((e) => Object.hasOwn(book.saves.phrases, e.key)),
      words: { saved: words },
      prefs: Object.keys(values).length ? { values } : null
    };
  }
  function planSync(server, local, book, { replace = false } = {}) {
    const clear = Math.max(server.clear, book.epoch);
    const push = { clear: book.epoch > server.clear ? book.epoch : null, kanji: [], phrases: [], words: [], play: null, prefs: null };
    const own = replace ? sinceAnswer(local, book) : local;
    const apply = { saved: {}, seen: {}, unsave: [], merge: [], words: {}, play: null, prefs: null };
    const next2 = { clear, kanji: /* @__PURE__ */ new Map(), phrases: /* @__PURE__ */ new Map(), words: server.words instanceof Map ? /* @__PURE__ */ new Map() : null, play: null, prefs: null };
    const chars3 = /* @__PURE__ */ new Set([...server.kanji.keys(), ...Object.keys(local.kanji.saved), ...Object.keys(local.kanji.seen), ...Object.keys(book.removed.kanji)]);
    for (const ch of chars3) {
      const theirs = server.kanji.get(ch) || null;
      const mine2 = localKanjiRow(ch, own.kanji, book, theirs);
      const row = joinKanji(theirs, mine2, clear);
      if (row && !same(row, theirs && joinKanji(theirs, null, clear))) push.kanji.push(row);
      if (row) next2.kanji.set(ch, row);
      const saved = toSaved(row);
      const seen = toSeen(row);
      if (!sameSaved(local.kanji.saved[ch] || null, saved)) apply.saved[ch] = saved;
      if (!sameSeen(local.kanji.seen[ch] || null, seen)) apply.seen[ch] = seen;
    }
    const entries = new Map(local.phrases.map((e) => [e.key, e]));
    const ownEntries = replace ? new Map(own.phrases.map((e) => [e.key, e])) : entries;
    const keys = /* @__PURE__ */ new Set([...server.phrases.keys(), ...entries.keys(), ...Object.keys(book.removed.phrases)]);
    for (const key of keys) {
      const theirs = server.phrases.get(key) || null;
      const entry = entries.get(key) || null;
      const mine2 = localPhraseRow(key, ownEntries.get(key) || null, book, theirs);
      const row = joinPhrase(theirs, mine2);
      if (row && !same(row, theirs)) push.phrases.push(row);
      if (row) next2.phrases.set(key, row);
      const want = row && row.phrase;
      if (!want) {
        if (entry) apply.unsave.push(key);
        continue;
      }
      if (entry && samePhrase(entry, want)) continue;
      if (entry && !(mine2 && mine2.phrase && mine2.phrase.s > row.removed)) apply.unsave.push(key);
      apply.merge.push({ t: want.t, first: want.first, last: want.last, n: want.n, src: want.src, saved: want.saved });
    }
    if (server.words instanceof Map) {
      const here = localWords(local);
      const ownWords = localWords(own);
      const keys2 = /* @__PURE__ */ new Set([...server.words.keys(), ...Object.keys(here), ...Object.keys(book.removed.words)]);
      for (const key of keys2) {
        const theirs = server.words.get(key) || null;
        const mine2 = localWordRow(key, ownWords[key] || null, book, theirs);
        const row = joinWord(theirs, mine2);
        if (row && !same(row, theirs)) push.words.push(row);
        if (row) next2.words.set(key, row);
        const want = toWord(row);
        if (!sameWord(here[key] || null, want)) apply.words[key] = want;
      }
    } else if (replace) {
      const keep = localWords(own);
      for (const key of Object.keys(localWords(local))) if (!Object.hasOwn(keep, key)) apply.words[key] = null;
    }
    const myPlay = localPlay(local.play);
    const play = joinPlay(server.play, replace ? null : myPlay);
    const nothing = play && !Object.keys(play.games).length && !play.mixed.length && !server.play;
    if (play && !nothing && !same(play, server.play)) push.play = play;
    next2.play = play;
    const playHere = play || (replace ? cleanPlay({}) : myPlay);
    if (!same(playHere, myPlay)) apply.play = { games: playHere.games, mixed: Object.fromEntries(playHere.mixed.map((p) => [p.k, p.n])) };
    const prefs = joinPrefs(server.prefs, replace ? own.prefs : localPrefs(local.prefs, book));
    if (prefs && !same(prefs, server.prefs)) push.prefs = prefs;
    next2.prefs = prefs;
    const changes = {};
    if (prefs) {
      for (const [k, p] of Object.entries(prefs.values)) if (p.v !== local.prefs[k]) changes[k] = p.v;
    }
    if (Object.keys(changes).length) apply.prefs = changes;
    return { clear, push, apply, next: next2 };
  }
  function pushes(plan) {
    const p = plan.push;
    return p.clear !== null || p.kanji.length > 0 || p.phrases.length > 0 || p.words.length > 0 || !!p.play || !!p.prefs;
  }
  function applies(plan) {
    const a = plan.apply;
    return Object.keys(a.saved).length + Object.keys(a.seen).length + a.unsave.length + a.merge.length + Object.keys(a.words).length > 0 || !!a.play || !!a.prefs;
  }

  // js/sync.js
  var FN = Object.freeze({
    whoami: "sync:whoami",
    pullKanji: "sync:pullKanji",
    pullPhrases: "sync:pullPhrases",
    pullMeta: "sync:pullMeta",
    push: "sync:push",
    pullWords: "sync:pullWords",
    pushWords: "sync:pushWords",
    erase: "sync:erase"
  });
  var KANJI_BATCH = 200;
  var PHRASE_BATCH = 50;
  var WORD_BATCH = 200;
  var isMissingFunction = (err) => /Could not find public function/.test(String(err && err.message || err || ""));
  var MAX_PAGES = 500;
  var SyncError = class extends Error {
    constructor(code, cause) {
      super(code);
      this.name = "SyncError";
      this.code = code;
      this.cause = cause;
    }
  };
  function answer2(res) {
    if (!res || res.ok === false) throw new SyncError(res && res.error ? String(res.error) : "no-answer");
    return res;
  }
  async function eraseAll(client) {
    let deleted = 0;
    for (let i = 0; i < MAX_PAGES; i += 1) {
      const res = answer2(await client.mutation(FN.erase, {}));
      deleted += res.deleted || 0;
      if (res.done) return deleted;
    }
    throw new SyncError("too-many-rows");
  }
  function decide2(book, subject) {
    if (!book || book.pending === FIRST) return "adopt";
    return book.account === subject ? "same" : "ask";
  }
  function holdsOwn(snap) {
    return Object.keys(snap.kanji.saved).length > 0 || snap.phrases.length > 0 || Object.keys(wordsOf3(snap)).length > 0;
  }
  var wordsOf3 = (snap) => snap && snap.words && snap.words.saved || {};
  function accountHolds(server) {
    const known = server.words instanceof Map;
    const out = { kanji: 0, phrases: 0, words: known ? 0 : null, removed: { kanji: 0, phrases: 0, words: 0 }, cleared: server.clear > 0 };
    for (const row of known ? server.words.values() : []) {
      if (row.word) out.words += 1;
      else if (row.removed > 0) out.removed.words += 1;
    }
    for (const row of server.kanji.values()) {
      if (row.saved) out.kanji += 1;
      else if (row.removed > 0) out.removed.kanji += 1;
    }
    for (const row of server.phrases.values()) {
      if (row.phrase) out.phrases += 1;
      else if (row.removed > 0) out.removed.phrases += 1;
    }
    return out;
  }
  function holdsAny(server) {
    const a = accountHolds(server);
    return a.cleared || a.kanji + a.phrases + (a.words || 0) + a.removed.kanji + a.removed.phrases + a.removed.words > 0;
  }
  async function pullAll(client) {
    const meta = answer2(await client.query(FN.pullMeta, {}));
    const read = async (fn, clean, idOf) => {
      const rows = /* @__PURE__ */ new Map();
      let cursor = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const res = answer2(await client.query(fn, { cursor }));
        for (const raw of res.rows || []) {
          const row = clean(raw);
          if (row) rows.set(idOf(row), row);
        }
        if (res.done) return rows;
        cursor = res.cursor;
      }
      throw new SyncError("pull-too-long");
    };
    const kanji = await read(FN.pullKanji, cleanKanjiRow, (r) => r.char);
    const phrases = await read(FN.pullPhrases, cleanPhraseRow, (r) => r.key);
    let words = null;
    try {
      words = await read(FN.pullWords, cleanWordRow, (r) => r.key);
    } catch (err) {
      if (!isMissingFunction(err)) throw err;
    }
    return {
      clear: cleanClear(meta.clear),
      kanji,
      phrases,
      words,
      play: meta.play ? cleanPlay(meta.play) : null,
      prefs: meta.prefs ? cleanPrefs(meta.prefs) : null
    };
  }
  async function pushAll(client, push) {
    const kanji = push.kanji.slice();
    const phrases = push.phrases.slice();
    let wrote = 0;
    let clear = 0;
    let first = true;
    while (first || kanji.length || phrases.length) {
      const args = {};
      if (first) {
        if (push.clear !== null) args.clear = push.clear;
        if (push.play) args.play = push.play;
        if (push.prefs) args.prefs = push.prefs;
      }
      first = false;
      const k = kanji.splice(0, KANJI_BATCH);
      const p = phrases.splice(0, PHRASE_BATCH);
      if (k.length) args.kanji = k;
      if (p.length) args.phrases = p;
      if (!Object.keys(args).length) break;
      const res = answer2(await client.mutation(FN.push, args));
      wrote += res.wrote || 0;
      clear = Math.max(clear, cleanClear(res.clear));
    }
    const words = (push.words || []).slice();
    while (words.length) {
      const res = answer2(await client.mutation(FN.pushWords, { words: words.splice(0, WORD_BATCH) }));
      wrote += res.wrote || 0;
    }
    return { wrote, clear };
  }
  function counts(server, snap) {
    return { account: accountHolds(server), here: { kanji: Object.keys(snap.kanji.saved).length, phrases: snap.phrases.length, words: Object.keys(wordsOf3(snap)).length } };
  }
  function joinStamps(server, snap, at, now = at) {
    const past = (t3) => t3 > at && t3 < now ? 0 : t3 + 1;
    const joined = Math.max(at, past(server.clear));
    const brought = { kanji: {}, phrases: {}, words: {} };
    for (const ch of Object.keys(snap.kanji.saved)) {
      const row = server.kanji.get(ch);
      brought.kanji[ch] = row ? Math.max(joined, past(row.removed), past(row.seen ? row.seen.e : 0)) : joined;
    }
    for (const entry of snap.phrases) {
      const row = server.phrases.get(entry.key);
      brought.phrases[entry.key] = row ? Math.max(at, past(row.removed)) : at;
    }
    for (const key of Object.keys(wordsOf3(snap))) {
      const row = server.words instanceof Map ? server.words.get(key) : null;
      brought.words[key] = row ? Math.max(at, past(row.removed)) : at;
    }
    return { joined, brought };
  }
  function createSync({ client, local, book: books, now = Date.now, kit = () => null }) {
    let subject = null;
    let cache2 = null;
    let stops = 0;
    let queue = Promise.resolve();
    const serial = (fn) => {
      const run3 = queue.then(fn, fn);
      queue = run3.catch(() => {
      });
      return run3;
    };
    async function begin() {
      const ticket = stops;
      const who = await client.query(FN.whoami, {});
      if (ticket !== stops) throw new SyncError("stopped");
      subject = who && typeof who.subject === "string" && who.subject ? who.subject : null;
      cache2 = null;
      if (!subject) throw new SyncError("not-authenticated");
      const me = subject;
      const book = books.read();
      const mode = decide2(book, me);
      if (mode === "same") return { subject: me, mode };
      if (mode === "ask") return { subject: me, mode, counts: counts(await pullAll(client), local.snapshot()) };
      if (!book || book.account !== me) {
        const via = kit();
        const named = typeof via === "string" && via && via !== me ? { kit: via } : {};
        books.write({ ...answeredBook(me, FIRST, now(), local.snapshot().prefs), ...named });
      }
      if (holdsOwn(local.snapshot())) {
        const server = await pullAll(client);
        if (ticket !== stops || subject !== me) throw new SyncError("stopped");
        if (holdsAny(server)) return { subject: me, mode: "ask", first: true, counts: counts(server, local.snapshot()) };
      }
      books.update((b) => {
        if (b.account === me && b.pending === FIRST) {
          b.pending = "adopt";
          b.joined = now();
        }
      });
      return { subject: me, mode };
    }
    function joinBook(had, who, as, server, snap) {
      const book = had || newBook(who, now(), snap.prefs);
      delete book.pending;
      if (as === "replace") {
        book.epoch = server.clear;
        book.removed = { kanji: {}, phrases: {}, words: {} };
        book.brought = { kanji: {}, phrases: {}, words: {} };
        return book;
      }
      book.epoch = Math.max(book.epoch, server.clear);
      const { joined, brought } = joinStamps(server, snap, book.joined, now());
      book.joined = joined;
      book.brought = brought;
      return book;
    }
    async function run2(mode) {
      const who = subject;
      if (!who) throw new SyncError("not-authenticated");
      const server = await pullAll(client);
      if (subject !== who) throw new SyncError("stopped");
      const had = books.read();
      const ours = !!had && had.account === who;
      if (mode === "same" && !ours) throw new SyncError("account-changed");
      let as = ours ? had.pending || "same" : mode;
      const snap = local.snapshot();
      let start = had;
      if (as === FIRST) {
        if (!PENDING.includes(mode)) throw new SyncError("account-changed");
        start = answerBook(had, who, mode, now(), snap.prefs);
        as = mode;
      }
      const book = as === "same" ? had : joinBook(ours ? start : null, who, as, server, snap);
      const merge = planSync(server, snap, book, { replace: as === "replace" });
      local.apply(merge.apply);
      const plan = planSync(server, local.snapshot(), book);
      const carried = carriedOf(book, { words: server.words instanceof Map });
      book.epoch = plan.clear;
      if (plan.next.prefs) {
        for (const [k, p] of Object.entries(plan.next.prefs.values)) {
          book.prefsAt[k] = p.at;
          book.prefsVal[k] = p.v;
        }
      }
      book.heard = heardFrom(server, book.heard);
      books.write(book);
      cache2 = server;
      const res = await pushAll(client, plan.push);
      cache2 = plan.next;
      const at = now();
      books.update((b) => {
        if (b.account === who) {
          pruneCarried(b, carried);
          b.heard = heardFrom(plan.next, b.heard);
          b.at = at;
        }
      });
      return { ok: true, at, wrote: res.wrote, applied: applies(merge), stale: res.clear > plan.clear };
    }
    function choose(mode) {
      const who = subject;
      if (!who || !PENDING.includes(mode)) return false;
      const had = books.read();
      if (had && had.account === who && had.pending !== FIRST) return false;
      books.write(answerBook(had, who, mode, now(), local.snapshot().prefs));
      return true;
    }
    function sync(mode = "same") {
      return serial(() => run2(mode));
    }
    function flush() {
      return serial(async () => {
        const who = subject;
        if (!who) return { ok: true, wrote: 0 };
        if (!cache2) return run2("same");
        const book = books.read();
        if (!book || book.account !== who) throw new SyncError("account-changed");
        const plan = planSync(cache2, local.snapshot(), book);
        if (!pushes(plan)) return { ok: true, wrote: 0 };
        const carried = carriedOf(book, { words: cache2.words instanceof Map });
        const res = await pushAll(client, plan.push);
        cache2 = plan.next;
        const at = now();
        books.update((b) => {
          if (b.account !== who) return;
          pruneCarried(b, carried);
          b.epoch = Math.max(b.epoch, plan.clear);
          b.heard = heardFrom(plan.next, b.heard);
          b.at = at;
        });
        return { ok: true, at, wrote: res.wrote, stale: res.clear > plan.clear };
      });
    }
    function stop() {
      stops += 1;
      subject = null;
      cache2 = null;
    }
    function known(kind, id) {
      if (!cache2) return { s: 0, removed: 0 };
      if (kind === "phrases") {
        const row2 = cache2.phrases.get(id);
        return { s: row2 && row2.phrase ? row2.phrase.s : 0, removed: row2 ? row2.removed : 0 };
      }
      if (kind === "words") {
        const row2 = cache2.words instanceof Map ? cache2.words.get(id) : null;
        return { s: row2 && row2.word ? row2.word.s : 0, removed: row2 ? row2.removed : 0 };
      }
      if (id === null || id === void 0) {
        let s = 0;
        for (const row2 of cache2.kanji.values()) if (row2.saved) s = Math.max(s, row2.saved.s);
        return { s, removed: cache2.clear };
      }
      const row = cache2.kanji.get(id);
      return { s: row && row.saved ? row.saved.s : 0, removed: Math.max(cache2.clear, row ? row.removed : 0) };
    }
    return {
      begin,
      choose,
      sync,
      flush,
      stop,
      known,
      get subject() {
        return subject;
      },
      get pulled() {
        return cache2 !== null;
      }
    };
  }

  // ../yomu-ios/bridge/account.js
  function createAccountHost(stores) {
    let effects = [];
    let wrote = /* @__PURE__ */ new Map();
    let synced = /* @__PURE__ */ new Set();
    let woken = false;
    let seq = 0;
    function wake() {
      if (woken) return;
      woken = true;
      if (typeof globalThis.__accountWake === "function") globalThis.__accountWake();
    }
    const emit = (effect) => {
      effects.push(effect);
      wake();
    };
    function forSync(name, store, calls3) {
      const seen = Object.create(store);
      for (const call of calls3) {
        seen[call] = (...args) => {
          synced.add(name);
          wake();
          return store[call](...args);
        };
      }
      return seen;
    }
    const timers = /* @__PURE__ */ new Map();
    const setTimer = (fn, ms) => {
      seq += 1;
      timers.set(seq, fn);
      emit({ t: "timer", id: seq, ms });
      return seq;
    };
    const clearTimer = (id) => {
      if (timers.delete(id)) emit({ t: "clearTimer", id });
    };
    const waiting = /* @__PURE__ */ new Map();
    const transport = (kind, name, args, url) => new Promise((resolve, reject) => {
      seq += 1;
      waiting.set(seq, { resolve, reject });
      emit({ t: "request", id: seq, kind, name, args: args || {}, url });
    });
    let asking = null;
    const ui2 = {
      // Only the last line matters to a screen that has not drawn the one before.
      paint(status2) {
        effects = effects.filter((e) => e.t !== "paint");
        emit({ t: "paint", status: status2 });
      },
      ask({ label, counts: counts2, since, first }) {
        if (asking) asking(null);
        return new Promise((resolve) => {
          asking = resolve;
          emit({ t: "ask", label, counts: counts2, since, first });
        });
      },
      dismiss() {
        if (!asking) return;
        const answer3 = asking;
        asking = null;
        answer3(null);
        emit({ t: "dismiss" });
      },
      refresh() {
      },
      // the stores sync changed are named as it changes them (forSync)
      reason: () => ""
    };
    let host = null;
    let kit = null;
    let book = null;
    let client = null;
    const status = () => host && host.account ? host.account.status : null;
    const settled = (op) => (promise) => promise.then(
      (value) => emit({ t: "done", op, value: value === void 0 ? null : value }),
      (err) => emit({ t: "done", op, failure: failureKind(err), message: String(err && err.message || err) })
    );
    const calls2 = {
      /**
       * Start accounts: `key` is the Clerk publishable key (none, and nothing
       * here ever runs), `book` the sync book and `prefs` the account's
       * preferences as the app kept them, `user` who is signed in already
       * ({ id, label }) or null. True when accounts are on.
       */
      start({ key = "", book: kept = null, prefs = null, user = null }) {
        if (host) return host.account !== null;
        book = documentStore(kept, (doc) => {
          wrote.set("book", doc);
          wake();
        });
        kit = hostKit({
          state: user && user.id ? signedInAs(user.id, user.label || "") : signedOut(),
          // The token is Swift's to fetch, fresh for every request (transport).
          token: async () => "host",
          signIn: async () => {
            emit({ t: "signIn" });
            return false;
          }
        });
        host = startHost({
          key,
          kit,
          transport,
          engine: sync_exports,
          kanji: forSync("kanji", stores.kanji, ["adopt"]),
          words: forSync("words", stores.words, ["adopt"]),
          phrases: forSync("phrases", stores.phrases, ["unsave", "mergePhrases"]),
          play: forSync("play", stores.play, ["adopt"]),
          prefs: prefsMirror(prefs, (values) => {
            wrote.set("prefs", values);
            wake();
          }),
          book,
          ui: ui2,
          now: () => Date.now(),
          setTimer,
          clearTimer
        });
        return host.account !== null;
      },
      /** Who is signed in now, as Swift's sign-in says: { id, label }, or no id for nobody. */
      auth({ id = null, label = "" }) {
        if (!kit) return false;
        kit.become(id ? signedInAs(id, label || "") : signedOut());
        return true;
      },
      /**
       * A request's answer. `failure` is 'offline' (no connection: a
       * TypeError, as fetch's is), 'signin' (no token could be had) or
       * anything else, with the deployment's own message, which js/sync.js
       * reads for a function the deployment lacks.
       */
      answer({ id, value = null, failure = null, message = "" }) {
        const w = waiting.get(id);
        if (!w) return false;
        waiting.delete(id);
        if (!failure) w.resolve(value);
        else if (failure === "offline") w.reject(new TypeError(message || "offline"));
        else if (failure === "signin") w.reject(Object.assign(new Error(message || "not-authenticated"), { code: "not-authenticated" }));
        else w.reject(new Error(message || "failed"));
        return true;
      },
      /** A timer Swift set has fired. */
      timer({ id }) {
        const fn = timers.get(id);
        if (!fn) return false;
        timers.delete(id);
        fn();
        return true;
      },
      /** The app came to the front (true) or left it (false): a tab's visibilitychange. */
      shown({ visible }) {
        if (host) host.shown(!!visible);
        return !!host;
      },
      online({ is }) {
        if (host) host.online(!!is);
        return !!host;
      },
      /** The learner's answer to the question on screen: 'add', 'use', or null for Not now. */
      choose({ answer: answer3 = null }) {
        if (!asking) return false;
        const resolve = asking;
        asking = null;
        resolve(answer3 === "add" || answer3 === "use" ? answer3 : null);
        return true;
      },
      /** The line's Choose: ask again, while an account waits for an answer. */
      chooseAgain() {
        if (!host || !host.account) return false;
        void host.account.choose(null);
        return true;
      },
      /**
       * Erase everything the deployment holds for whoever is signed in
       * (js/sync.js eraseAll), before the account itself is deleted. The
       * result comes back as { t: 'done', op }.
       */
      erase({ op }) {
        client || (client = new (clientModule(transport)).ConvexHttpClient(CONVEX_URL));
        settled(op)(eraseAll(client).then((deleted) => ({ deleted })));
        return true;
      },
      /** The account is gone: nobody is signed in, and the book names nothing. */
      forget() {
        if (!kit) return false;
        kit.become(signedOut());
        if (book.document !== null) book.clear();
        return true;
      },
      status
    };
    return {
      call(name, args) {
        const fn = calls2[name];
        if (!fn) throw new Error(`no account call ${name}`);
        return fn(args || {});
      },
      /** Everything asked of Swift since the last drain: { effects, wrote, synced }. */
      drain() {
        woken = false;
        const batch = { effects, wrote: Object.fromEntries(wrote), synced: [...synced] };
        effects = [];
        wrote = /* @__PURE__ */ new Map();
        synced = /* @__PURE__ */ new Set();
        return batch;
      },
      /** Whether what the learner changes here reaches an account (js/account.js `synced`). */
      carries: () => {
        const s = status();
        return !!s && s.signedIn && s.synced;
      }
    };
  }

  // js/text-practice.js
  function textPracticeWords(analysis, language = "en") {
    const found = /* @__PURE__ */ new Set();
    const words = [];
    for (const token of analysis?.tokens || []) {
      if (!token.entry || !token.reading || token.confidence === "guess" || ["particle", "copula", "name", "punct", "space", "newline", "guess"].includes(token.kind)) continue;
      const key = `${token.base || token.surface}|${token.entry.r?.[0] || token.reading}`;
      if (found.has(key)) continue;
      const meanings = language === "es" ? token.entry.es?.g || token.entry.g : token.entry.g;
      if (!meanings?.length || !token.surface) continue;
      const sentence = sentenceAt(analysis.text, token.start, token.surface);
      if (!sentence) continue;
      found.add(key);
      words.push({
        word: token.surface,
        reading: token.reading,
        meaning: meanings.slice(0, 2).join("; "),
        english: language === "es" && !token.entry.es?.g,
        before: sentence.before,
        after: sentence.after
      });
      if (words.length === 4) break;
    }
    return words;
  }
  var TextPractice = class {
    constructor(analysis, language = "en") {
      this.words = textPracticeWords(analysis, language);
      this.cards = ["recall", "listen", "gap"].flatMap((mode) => this.words.filter((w) => mode !== "gap" || (w.before + w.after).replace(/[\s。！？!?、]/gu, "").length > 0).map((w, index) => ({ ...w, mode, id: `${mode}:${index}` })));
      this.at = 0;
      this.shown = false;
      this.remembered = 0;
      this.missed = /* @__PURE__ */ new Set();
    }
    view() {
      const card2 = this.cards[this.at];
      return {
        status: !this.cards.length ? "empty" : card2 ? "playing" : "complete",
        position: Math.min(this.at + 1, this.cards.length),
        total: this.cards.length,
        wordCount: this.words.length,
        remembered: this.remembered,
        missed: [...this.missed],
        card: card2 ? { ...card2, shown: this.shown } : null
      };
    }
    act(action, id) {
      const card2 = this.cards[this.at];
      if (!card2 || id !== card2.id) return this.view();
      if (action === "show") this.shown = true;
      else if (this.shown && ["remembered", "again"].includes(action)) {
        if (action === "remembered") this.remembered += 1;
        else this.missed.add(card2.word);
        this.at += 1;
        this.shown = false;
      }
      return this.view();
    }
  };

  // ../yomu-ios/bridge/entry.js
  var lang = useLang(globalThis.__lang || "en");
  var spanish = lang === "es";
  function readJson(path) {
    const text = globalThis.__readFile(path);
    if (typeof text !== "string") throw new Error(`not in the bundle: ${path}`);
    return JSON.parse(text);
  }
  var fetchJson2 = async (path) => readJson(path);
  function readEs(src) {
    try {
      return readJson(esSrc(src));
    } catch {
      return null;
    }
  }
  var dict = createDict({ fetchJson: fetchJson2, base: "data/" });
  var search = createSearch({ dict, fetchJson: fetchJson2, base: "data/" });
  var sets = createSets({ fetchJson: fetchJson2, base: "data/" });
  var examples = createExamples({ fetchJson: fetchJson2, base: "data/" });
  var pages = createPageData({ fetchJson: fetchJson2, base: "data/" });
  var dailyDoc;
  var dailyRows;
  var dailyEs;
  var dailyEsRows;
  var levelSources = {
    joyo: () => loadJoyo(fetchJson2),
    jinmeiyo: () => loadNames(fetchJson2),
    lists: () => loadJlpt(fetchJson2)
  };
  var library;
  var phraseBook;
  var phraseReply = () => ({ state: phraseBook.view(), document: phraseBook.dump() });
  var phraseHeard = /* @__PURE__ */ new Set();
  function openPhrases(document2) {
    library ?? (library = readJson("data/phrases/library.json"));
    phraseBook = new PhraseBook(library, document2);
    phraseBook.onChange((event) => {
      for (const fn of phraseHeard) fn(event);
    });
    return phraseBook;
  }
  function keptBook() {
    library ?? (library = readJson("data/phrases/library.json"));
    return phraseBook || new PhraseBook(library, null);
  }
  function keptKey(text) {
    if (typeof text !== "string" || !text.trim()) return null;
    const key = textKey(text);
    return keptBook().keptText(key) ? key : null;
  }
  var phrasesS = {
    onChange(fn) {
      phraseHeard.add(fn);
      return () => phraseHeard.delete(fn);
    },
    isSaved: (key) => keptBook().isSaved(key),
    savedList: () => keptBook().savedList(),
    unsave: (key) => keptBook().unsave(key),
    mergePhrases: (list2) => keptBook().mergePhrases(list2)
  };
  var games = new KanaGames();
  var textPractice;
  var textPracticeSession = 0;
  var gameReply = () => ({ state: games.view(), document: games.dump() });
  var story;
  var storyReply = () => ({ state: story.view(), document: story.dump() });
  var quick = new KanaReview();
  var quickReply = () => ({ state: quick.view(), document: quick.dump() });
  var reads = new KanaReads();
  var readsReply = () => ({ state: reads.view(), document: reads.dump() });
  var cards = new KanjiCards();
  var spell = new KanaToKanji();
  var spellReply = () => ({ state: spell.view(), document: spell.dump() });
  var rush = new WritingRush();
  async function entriesOf(chars3) {
    const info = await dict.kanji([...chars3]);
    const jlpt2 = await loadJlpt(fetchJson2);
    dailyDoc ?? (dailyDoc = readJson("data/kpage/daily.json"));
    dailyRows ?? (dailyRows = new Map(dailyDoc.rows.map((row) => [row[0], row])));
    const es = spanish ? await cardsSpanish(chars3) : null;
    return new Map([...chars3].map((ch) => [ch, cardEntry(info.get(ch), {
      level: jlpt2.levelOf.get(ch) ?? null,
      row: dailyRows.get(ch) ?? null,
      ...es ? { es: es(ch) } : {}
    })]));
  }
  function dailySpanish() {
    dailyDoc ?? (dailyDoc = readJson("data/kpage/daily.json"));
    if (dailyEs === void 0) dailyEs = readEs("data/kpage/daily.json");
    return dailyEs;
  }
  async function cardsSpanish(chars3) {
    const m = await dict.kanjiEs([...chars3]);
    const doc = dailySpanish();
    dailyEsRows ?? (dailyEsRows = new Map(doc && doc.rows.length === dailyDoc.rows.length ? dailyDoc.rows.map((row, i) => [row[0], doc.rows[i]]) : []));
    return (ch) => ({ m: m.get(ch) || null, gloss: (dailyEsRows.get(ch) || [])[1] || null });
  }
  var savedChars = () => Object.entries(mine.kanji.saved).sort(([, a], [, b]) => b.at - a.at).map(([ch]) => ch);
  async function deckChars(deck) {
    if (deck === "mine") return savedChars();
    if (!LEVELS.some((level) => level.id === deck)) throw new Error("Unknown kanji set");
    return charsOf(deck, levelSources);
  }
  function easierLevels(deck) {
    const level = LEVELS.find((l) => l.id === deck);
    if (level.jlpt) return LEVELS.filter((l) => l.jlpt && l.jlpt >= level.jlpt);
    if (level.grade) return LEVELS.filter((l) => l.grade && l.grade <= level.grade);
    return LEVELS.filter((l) => l.grade || l.id === deck);
  }
  var spellPools = /* @__PURE__ */ new Map();
  async function spellWords(deck) {
    const chars3 = await deckChars(deck);
    const key = deck === "mine" ? `mine|${chars3.join("")}` : deck;
    if (spellPools.has(key)) return spellPools.get(key);
    const known = new Set(deck === "mine" ? [...chars3, ...await deckChars("n5")] : (await Promise.all(easierLevels(deck).map((l) => deckChars(l.id)))).flat());
    const wordsOf4 = /* @__PURE__ */ new Map();
    for (const ch of chars3) {
      const { words: words2 } = await pages.pageOf(ch);
      wordsOf4.set(ch, spanish ? wordsWithEs(words2, await pages.wordsEs(ch)) : words2);
    }
    const words = spellingPool(chars3, wordsOf4, known);
    if (deck === "mine") {
      for (const k of [...spellPools.keys()]) if (k.startsWith("mine|")) spellPools.delete(k);
    }
    spellPools.set(key, words);
    return words;
  }
  async function cardsReply() {
    const state = cards.view();
    const card2 = state.session && state.session.card;
    if (card2) {
      const entry = (await entriesOf([card2.ch])).get(card2.ch);
      state.session.card = { ...card2, entry, saved: !!mine.kanji.saved[card2.ch] };
      if (spanish && Array.isArray(card2.options)) {
        const entries = await entriesOf(card2.options.map((o) => o.ch));
        state.session.card.options = card2.options.map((o) => optionWithEs(o, entries.get(o.ch)));
      }
    }
    return { state, document: cards.dump() };
  }
  var WATCH_LIMIT = 200;
  var STROKE_CACHE = 64;
  var strokeCache = /* @__PURE__ */ new Map();
  async function strokesOfChar(ch) {
    if (!strokeCache.has(ch)) {
      const paths = (await pages.strokesOf([ch])).get(ch);
      if (strokeCache.size >= STROKE_CACHE) strokeCache.delete(strokeCache.keys().next().value);
      strokeCache.set(ch, paths ? strokesFor(paths) : null);
    }
    return strokeCache.get(ch);
  }
  async function strokeCounts(chars3) {
    const paths = await pages.strokesOf([...chars3]);
    const out = {};
    for (const [ch, list2] of paths) if (Array.isArray(list2) && list2.length) out[ch] = list2.length;
    return out;
  }
  async function rushChars(group) {
    const found = rushGroups().find((g) => g.id === group);
    if (!found) return [];
    return found.chars || deckChars(group);
  }
  async function rushReply() {
    const state = rush.view();
    const char = state.run && state.run.char;
    if (char) {
      const strokes = await strokesOfChar(char.ch);
      char.strokes = strokes && strokes.map(({ cubics, start, end }) => ({ cubics, start, end }));
    }
    return { state, document: rush.dump() };
  }
  var audio;
  function audioFor(keys) {
    if (audio === void 0) {
      const text = globalThis.__readFile(AUDIO_SRC);
      audio = typeof text === "string" ? normalizeAudio(JSON.parse(text)) : null;
    }
    if (audio) for (const n2 of shardsFor(audio, keys)) addShard(audio, n2, readJson(audio.srcs[n2]));
    return audio;
  }
  var keysFor = (text, written) => keysOf(text, written ? [wordKey(written, text)] : []);
  var writes = { kanji: 0, words: 0, play: 0 };
  var fromFile = { readRaw: () => null, keepRaw: () => {
  } };
  var kanjiDoc = documentStore(null, () => {
    writes.kanji += 1;
  });
  var wordsDoc = documentStore(null, () => {
    writes.words += 1;
  });
  var playDoc = documentStore(null, () => {
    writes.play += 1;
  });
  var kanjiS = openKanji({ store: kanjiDoc, ...fromFile });
  var wordsS = openWords({ store: wordsDoc, ...fromFile });
  var playS = openPlay({ store: playDoc, ...fromFile });
  kanjiS.lendPhrases({ out: () => keptBook().dump().phrases, merge: (list2) => keptBook().mergePhrases(list2) });
  var mine = { get kanji() {
    return kanjiS.data;
  }, get words() {
    return wordsS.data;
  } };
  var loaded = { mine: false, play: false };
  var savedWordId = null;
  wordsS.onChange((event) => {
    if (event && event.type === "save") savedWordId = event.id;
  });
  var session = null;
  var account = createAccountHost({ kanji: kanjiS, words: wordsS, phrases: phrasesS, play: playS });
  function mineState(today) {
    const kanji = Object.entries(mine.kanji.saved).map(([ch, rec]) => ({ ch, ...rec })).sort((a2, b2) => b2.at - a2.at);
    const words = listWords(mine.words);
    const due = dueList(mine.kanji, today).length + dueWords(mine.words, today).length;
    const a = nextDue(mine.kanji, today);
    const b = nextDueWords(mine.words, today);
    const next2 = !a || !b ? a || b : a.day === b.day ? { day: a.day, n: a.n + b.n } : a.day < b.day ? a : b;
    const often = oftenUnsaved(mine.kanji, 12).map((ch) => ({ ch, n: mine.kanji.seen[ch].n }));
    return { kanji, words, due, next: next2, often };
  }
  function card() {
    if (!session) return null;
    const rid = current2(session);
    const pos = position(session);
    const base = { shown: session.shown, at: pos.at, of: pos.of, repeat: isRepeat(session), finished: finished(session) };
    if (rid === null) return { ...base, summary: summary(session) };
    const id = wordOfReview(rid);
    if (id === null) return { ...base, rid, kanji: rid };
    const w = mine.words.saved[id];
    return { ...base, rid, word: w ? { id, w: w.w, r: w.r, g: w.g } : null };
  }
  var playRecovered = false;
  var spaces = null;
  function spacesView() {
    const kept = playS.data.games.spaces || { best: 0, rounds: 0 };
    const base = { recovered: playRecovered, best: kept.best, rounds: kept.rounds, status: "idle", round: null };
    const r = spaces;
    if (!r) return base;
    const head = { at: Math.min(r.at, r.questions.length), of: r.questions.length, score: spacesScore(r), total: spacesTotal(r) };
    if (finished2(r)) {
      const counts2 = spacesCounts(r);
      return {
        ...base,
        status: "complete",
        round: {
          ...head,
          isBest: r.isBest === true,
          summary: ui("resultSpaces", { right: counts2.right, of: counts2.of, extra: counts2.extra }),
          missed: missedLines(r).map((q2) => ({ id: q2.id, ja: q2.ja, spaced: wordsOf2(q2.ja, q2.key).map((w) => w.text).join(" "), meaning: q2.meaning ? t(q2.meaning) : null }))
        }
      };
    }
    const q = current3(r);
    const p = answeredNow(r) ? r.picks[r.at] : null;
    const chars3 = [...q.ja];
    const check = p && {
      right: p.right,
      verdict: ui(p.right ? "spacesAllRight" : "spacesNotQuite"),
      tally: ui("spacesTally", { right: p.hit.length, of: q.key.length, extra: p.extra.length, score: p.score }),
      hit: p.hit,
      missing: p.missing,
      extra: p.extra,
      reasons: [
        ...q.gaps.map((g) => {
          const [a, b] = pairAt(q.ja, q.key, g.at);
          const found = p.hit.includes(g.at);
          return { at: g.at, kind: found ? "found" : "missed", tag: ui(found ? "spacesFound" : "spacesMissed"), pair: `${a} | ${b}`, text: reasonText(g) };
        }),
        ...p.extra.map((at) => ({ at, kind: "extra", tag: ui("spacesExtra"), pair: `${chars3[at - 1]} | ${chars3[at]}`, text: reasonText(extraReason(q.ja, q.key, at)) }))
      ]
    };
    return {
      ...base,
      status: "playing",
      round: {
        ...head,
        line: {
          id: q.id,
          ja: q.ja,
          chars: chars3,
          slots: q.slots,
          marks: [...marksOf(r)].sort((a, b) => a - b),
          prompt: ui("spacesPrompt"),
          hint: ui(tierHint(q)),
          meaning: q.meaning ? t(q.meaning) : null,
          between: q.slots.map((at) => ui("spacesBetween", { a: chars3[at - 1], b: chars3[at] })),
          check
        }
      }
    };
  }
  var spacesReply = () => ({ state: spacesView(), document: playS.data });
  var calls = {
    async kanjiLevels() {
      return Promise.all(LEVELS.map(async (level) => {
        const chars3 = await charsOf(level.id, levelSources);
        return { ...level, count: chars3.length, preview: chars3.slice(0, 6).join("") };
      }));
    },
    async kanjiLevelRows({ id, q = "", offset = 0 }) {
      if (!LEVELS.some((level) => level.id === id)) throw new Error("Unknown kanji level");
      const chars3 = await charsOf(id, levelSources);
      const info = await dict.kanji(chars3);
      const es = spanish ? await dict.kanjiEs(chars3) : null;
      const rows = chars3.map((ch) => {
        const k = { ...info.get(ch), m: shownMeanings(info.get(ch)?.m) || [] };
        return { ch, info: withEs(k, es && es.has(ch) ? { m: es.get(ch) } : null) };
      }).filter(({ ch, info: k }) => [...k.on || [], ...k.kun || [], ""].some((reading) => rowMatches([ch, readingKana(reading), k.m], q)));
      const from = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
      return { total: rows.length, rows: rows.slice(from, from + LEVEL_PAGE) };
    },
    async phraseLoad({ document: document2 }) {
      openPhrases(document2);
      return phraseReply();
    },
    /** The book as it stands, after sync changed it: the state to draw and the document to write. */
    async phraseView() {
      return phraseReply();
    },
    async phraseSave({ text, source, now }) {
      phraseBook.save(text, source, now);
      return phraseReply();
    },
    async phraseRemove({ id }) {
      phraseBook.remove(id);
      return phraseReply();
    },
    async phraseList({ q = "" }) {
      return phraseBook.view(q);
    },
    async phraseKey({ text }) {
      return textKey(text);
    },
    async phraseSource({ source, text }) {
      library ?? (library = readJson("data/phrases/library.json"));
      return phraseSource(library, source, text);
    },
    /**
     * The backup file of everything a learner keeps (app-backup.js), from the
     * documents the app read from its files: My kanji, My words, the phrase
     * book and the practice files by name. Its text, and what it holds.
     */
    async backupMake({ kanji = null, words = null, phrases = null, practice = {}, today, now, app }) {
      library ?? (library = readJson("data/phrases/library.json"));
      const text = JSON.stringify(backupDoc({ kanji, words, phrases, practice, today, now, library, app }));
      return { text, summary: backupSummary(text) };
    },
    /** The practice files a backup carries, by name (app-backup.js PRACTICE). */
    async backupPractice() {
      return PRACTICE;
    },
    /** What a backup file holds, or why it cannot be read (app-backup.js readBackup). */
    async backupRead({ text }) {
      return readBackup(text);
    },
    /**
     * A backup merged into the phone's documents by the site's rules
     * (app-backup.js restoreBackup): the documents to write and what changed.
     */
    async backupRestore({ text, kanji = null, words = null, phrases = null, practice = {}, now, replacePractice = false }) {
      library ?? (library = readJson("data/phrases/library.json"));
      return restoreBackup(text, { kanji, words, phrases, practice, now, library, replacePractice });
    },
    async readingDetails({ readings = [] }) {
      return readings.map((display) => ({ display, kana: readingKana(display), romaji: readingRomaji(display) }));
    },
    async storyLoad({ document: document2 }) {
      library ?? (library = readJson("data/phrases/library.json"));
      story = new StoryPractice(cafeScene(library), document2);
      return storyReply();
    },
    async storyStart({ role, restart = false }) {
      story.start(role, restart);
      return storyReply();
    },
    async storyAct({ action, ...args }) {
      story.act(action, args);
      return storyReply();
    },
    async gameLoad({ document: document2 }) {
      games = new KanaGames(document2);
      return gameReply();
    },
    async gameSetup(args) {
      return kanaGameSetup(args);
    },
    async gameStart(args) {
      games.start(args);
      return gameReply();
    },
    async gameAct({ action, ...args }) {
      games.act(action, args);
      return gameReply();
    },
    // The learner's weak kana in one script, for a personalized drill.
    async gameWeak(args) {
      return games.weakKana(args);
    },
    async kanaDetail({ text, lang: lang2 = "en", rules = [] }) {
      return kanaDetail(text, lang2, rules);
    },
    /** The sound rule drill's cards (sound-drill.js): in the list's order, or mixed with `seed`. */
    async soundDrill({ order = "rules", seed = 1, lang: lang2 = "en" }) {
      return soundDrill({ order, seed, lang: lang2 });
    },
    /** Scanned text ready to read (scan-text.js): furigana lines dropped, a word split by a break closed. */
    async scanText({ text = "" }) {
      return cleanScan(text, (t3) => analyze(t3, { dict }));
    },
    async textPracticeStart({ text = "" }) {
      const session2 = ++textPracticeSession;
      const analysis = await analyze(text, { dict, meanings: lang });
      if (session2 !== textPracticeSession) throw new Error("Practice was replaced");
      textPractice = new TextPractice(analysis, lang);
      return { ...textPractice.view(), session: session2 };
    },
    async textPracticeAct({ action, id, session: session2 }) {
      if (!textPractice || session2 !== textPracticeSession) throw new Error("Practice was replaced");
      return { ...textPractice.act(action, id), session: session2 };
    },
    async soundRules({ lang: lang2 = "en" }) {
      return soundRules(lang2);
    },
    async kanaChart({ script = "hiragana" }) {
      return kanaChart(script);
    },
    async kanaPractice({ script = "hiragana", selected = [] }) {
      library || (library = readJson("data/phrases/library.json"));
      return kanaPractice(library, { script, selected });
    },
    async library({ q = "" }) {
      library || (library = readJson("data/phrases/library.json"));
      return filterLibrary(library, q);
    },
    async examples({ word, reading }) {
      await examples.need([word]);
      return examples.examplesOf(word, reading) || [];
    },
    /**
     * Search: Japanese, romaji or English (search.js), one card per word and
     * each written as the site writes it (search.js byWord, writtenOf): taberu
     * finds たべる, shown as 食べる, its usual spelling.
     */
    async search({ q }) {
      const out = await search.search(q);
      const words = byWord(out.words);
      if (spanish) await dict.needEs(words.flatMap((w) => w.recs));
      const recEs = (r) => {
        const g = spanish ? dict.esOf(r) : null;
        return g ? { g } : null;
      };
      return {
        kind: out.kind,
        kanji: out.kanji,
        words: words.map((w) => {
          const { written, reading } = writtenOf(w);
          return {
            usage: usageFor({ reading }),
            key: w.key,
            via: w.via,
            romaji: w.romaji || null,
            written,
            reading,
            recs: w.recs.map((r) => withEs({ r: r.r || null, g: r.g || [], p: r.p || "", q: r.q || null }, recEs(r)))
          };
        })
      };
    },
    /** Kanji facts for `chars`, as the word sheet and a review card show them; in Spanish with `es`: { m }. */
    async kanji({ chars: chars3 }) {
      const got = await dict.kanji([...chars3]);
      if (!spanish) return Object.fromEntries(got);
      const es = await dict.kanjiEs([...got.keys()]);
      return Object.fromEntries([...got].map(([ch, info]) => [ch, withEs(info, es.has(ch) ? { m: es.get(ch) } : null)]));
    },
    /** An idiom set's rows that match `q`, from `offset`, SET_PAGE at a time (sets.js). */
    async setRows({ id, q = "", offset = 0 }) {
      if (!SET_IDS.includes(id)) throw new Error(`No collection ${id}`);
      const rows = (await sets.rows(id)).filter((row) => rowMatches(row, q));
      return {
        total: rows.length,
        page: SET_PAGE,
        rows: rows.slice(offset, offset + SET_PAGE).map(([w, r, g, common, romaji]) => ({ w, r, g, common: !!common, romaji: romaji || "" }))
      };
    },
    /** Load the saved documents, checked as the site checks a store it reads. */
    async mineLoad({ kanji, words, now }) {
      kanjiDoc.put(kanji);
      wordsDoc.put(words);
      kanjiS.load(now);
      wordsS.load();
      loaded.mine = true;
      return true;
    },
    /**
     * A backup the app has just restored into its files and loaded, said to
     * the stores as the Import it is (kanji-store.js and word-store.js merge):
     * merged a second time it changes nothing, and each kanji, word and saved
     * reading of the backup counts as saved now, so a sync keeps it over an
     * older removal made on another device (sync-watch.js imported). False
     * for a backup with nothing of the kind.
     */
    async mineImported({ text }) {
      const r = parseImport(text);
      if (!r.ok) return false;
      kanjiS.merge(r.data);
      wordsS.merge(r.words);
      return true;
    },
    async mineDump() {
      return { kanji: mine.kanji, words: mine.words };
    },
    async mineState({ today }) {
      return mineState(today);
    },
    /**
     * Review reminders: for each of `days` days from `today`, how many kanji
     * and words the schedule has due that day if none is reviewed before it
     * (kanji-store.js dueList and word-store.js dueWords, which count
     * everything due on or before the day).
     */
    async dueAhead({ today, days = 7 }) {
      const n2 = Math.max(1, Math.min(14, days | 0));
      return Array.from({ length: n2 }, (_, i) => {
        const day = addDays(today, i);
        return { day, n: dueList(mine.kanji, day).length + dueWords(mine.words, day).length };
      });
    },
    /**
     * One settled read of the reader (kanji-store.js recordReading): each kanji
     * of the text counts once per reading session and learns the dictionary
     * words it was met in, never the text. `fresh` begins a session first, with
     * the kind of text it reads (a paste, a phrase, typing after a clear).
     * True when the document changed and should be written.
     */
    async mineRead({ tokens = [], chars: chars3 = [], today, now, fresh = null, text = null }) {
      const before = writes.kanji;
      if (fresh) kanjiS.beginSession(fresh, now);
      kanjiS.record(chars3, wordsByKanji(tokens), today, { h: keptKey(text) });
      return writes.kanji !== before;
    },
    /**
     * Point the kanji of the reading on screen at its text, after the text was
     * saved or unsaved (the site's events-read.js pointKanji). Nothing is
     * counted again.
     */
    async minePoint({ chars: chars3 = [], today, text = null }) {
      const before = writes.kanji;
      kanjiS.record(chars3, null, today, { h: keptKey(text) });
      return writes.kanji !== before;
    },
    /** Save every kanji of `chars` not saved yet, as one change (kanji-store.js saveKanji): how many were saved. */
    async saveKanjiAll({ chars: chars3 = [], now }) {
      return [...new Set(chars3)].filter((ch) => kanjiS.save(ch, now)).length;
    },
    /**
     * Forget where kanji were met, keeping the saved ones (kanji-store.js
     * forgetSeen). Not while this phone syncs with an account: the site has no
     * rule that carries a forgetting, so the account would hand the record
     * back at the next sync.
     */
    async mineForgetSeen({ now }) {
      if (account.carries()) return false;
      return forgetSeen(kanjiS.data, now);
    },
    /**
     * What ties a kanji to words: the words the learner met it in (My kanji's
     * seen record), the common words written with it (data/kpage) and the
     * phrase library's lines that use it (kanji-phrases.js).
     */
    async kanjiLinks({ ch, limit = 6 }) {
      const lastPlace = (seen2, k) => {
        const kept = seen2.h ? keptBook().keptText(seen2.h) : null;
        const around3 = kept && sentenceAround(kept.text, k);
        return around3 ? { text: kept.text, around: around3, source: kept.source } : null;
      };
      library ?? (library = readJson("data/phrases/library.json"));
      const page = await pages.pageOf(ch);
      const seen = mine.kanji.seen[ch];
      const words = page.words.map(({ written, reading, gloss }) => ({ written, reading, gloss: gloss || "" }));
      return {
        met: seen ? { n: seen.n, first: seen.first, last: seen.last, words: seen.words.map(([written, reading]) => ({ written, reading })), place: lastPlace(seen, ch) } : null,
        // In Spanish each word with `es`: { gloss } where it has one.
        words: spanish ? wordsWithEs(words, await pages.wordsEs(ch)) : words,
        phrases: phrasesWithKanji(library, ch, { limit })
      };
    },
    /**
     * My progress (progress.js progressOf), over My kanji's saved and seen
     * records and the jōyō list. The app keeps no History, so `texts` is left
     * out rather than shown as nothing read; `due` is the kanji due today, as
     * the site counts it.
     */
    async progress({ today, period = "week" }) {
      const joyo = await loadJoyo(fetchJson2);
      const p = progressOf({
        kanji: mine.kanji,
        entries: {},
        joyo,
        today,
        period: PERIODS.includes(period) ? period : "week",
        due: dueList(mine.kanji, today).length
      });
      const { texts, ...shown } = p;
      return shown;
    },
    /** The kanji of the day (daily.js) for `days` days from `today`, for the Learn card and the widget; in Spanish with `es`: { meaning, gloss }. */
    async daily({ today, days = 1 }) {
      dailyDoc ?? (dailyDoc = readJson("data/kpage/daily.json"));
      const es = spanish ? dailySpanish() : null;
      const n2 = Math.max(1, Math.min(31, days | 0));
      return Array.from({ length: n2 }, (_, i) => {
        const day = addDays(today, i);
        return { day, ...dailyOf(dailyDoc, day, es) };
      });
    },
    /**
     * Learn's Today card: where Quick kana review stands for the learner's
     * script and selection (kana-review.js overview), read from its saved
     * document by a throwaway KanaReview, so the screen's own review (`quick`)
     * is never replaced. `inRound` is a review left unfinished.
     */
    async todayKana({ document: document2 = null, script, selected = [], today, size }) {
      const r = new KanaReview(document2);
      const o = r.overview({ script, selected, today, size });
      return { script: o.script, total: o.total, due: o.due, fresh: o.fresh, ready: o.ready, plan: o.plan, inRound: r.view().status === "playing" };
    },
    // Where are the spaces? (play-spaces.js), with the play document's best (play-store.js).
    async spacesLoad({ document: document2 }) {
      playDoc.put(document2);
      playS.load();
      playRecovered = playS.note !== null;
      loaded.play = true;
      return spacesReply();
    },
    /** The play document as it stands, after sync changed it: what the app writes to its file. */
    async playDump() {
      return playS.data;
    },
    async spacesStart({ seed = Date.now() }) {
      const { lines } = await loadSpaces(fetchJson2);
      spaces = spacesRound(lines, { rand: makeRand(seed) });
      return spacesReply();
    },
    /** toggle (`at`, a place between two characters), check, next, or leave. */
    async spacesAct({ action, at }) {
      if (action === "leave") spaces = null;
      else if (!spaces) throw new Error("No round");
      else if (action === "toggle") toggleMark(spaces, at);
      else if (action === "check") checkMarks(spaces);
      else if (action === "next") {
        next(spaces);
        if (finished2(spaces) && !spaces.recorded) {
          const got = playS.finish("spaces", spacesScore(spaces));
          spaces.recorded = true;
          spaces.isBest = Boolean(got && got.isBest);
        }
      } else throw new Error(`Unknown action ${action}`);
      return spacesReply();
    },
    // Quick kana review (kana-review.js): its own document, like the games.
    async quickLoad({ document: document2 }) {
      quick = new KanaReview(document2);
      return quickReply();
    },
    async quickOverview(args) {
      return quick.overview(args);
    },
    async quickStart(args) {
      quick.start(args);
      return quickReply();
    },
    async quickAct({ action, ...args }) {
      quick.act(action, args);
      return quickReply();
    },
    // Kana snacks (kana-reads.js): real words written only in kana.
    async readsLoad({ document: document2 }) {
      reads = new KanaReads(document2);
      return readsReply();
    },
    async readsThemes() {
      return kanaReadThemes();
    },
    async readsStart(args) {
      reads.start(args);
      return readsReply();
    },
    async readsAct({ action, ...args }) {
      reads.act(action, args);
      return readsReply();
    },
    /**
     * What Hoho says at `moment` (mascot-lines.js): a library phrase, so it has
     * its recordings, with the library's own note on when people say it.
     */
    async mascot({ moment, hour, lang: lang2 = "en" }) {
      library ?? (library = readJson("data/phrases/library.json"));
      const line2 = mascotLine(library, moment === "greeting" ? greetingMoment(hour) : moment, { lang: lang2 });
      if (!line2) return null;
      const note = library.phrases.find((p) => p.id === line2.id)?.note;
      return { ...line2, note: note && (note[lang2] || note.en) || null };
    },
    async saveKanji({ ch, now, on }) {
      return on ? kanjiS.save(ch, now) : kanjiS.unsave(ch);
    },
    /**
     * Save or unsave the word a token is (word-store.js savableWord): its id,
     * or null. `text` is the analyzed text the token's offsets refer to, when
     * the word was chosen in one: the word keeps the sentence it holds it in
     * (history-text.js sentenceAt), shown with it in My words.
     */
    async saveWord({ token, now, on, text = null }) {
      const word = savableWord(token);
      if (!word) return null;
      const id = wordId(word.w, word.r);
      if (!on) return wordsS.unsave(id) ? id : null;
      const from = typeof text === "string" ? sentenceAt(text, token.start, token.surface) : null;
      savedWordId = null;
      return wordsS.save(from ? { ...word, from } : word, now) ? savedWordId : null;
    },
    async unsaveWordId({ id }) {
      return wordsS.unsave(id);
    },
    /** Which of `chars` are saved, and the token's word with whether it is. */
    async savedOf({ chars: chars3 = [], token = null }) {
      const word = token ? savableWord(token) : null;
      return {
        kanji: chars3.filter((ch) => !!mine.kanji.saved[ch]),
        word: word ? { ...word, saved: !!mine.words.saved[wordId(word.w, word.r)] } : null
      };
    },
    /** A review of everything due today: the kanji first, then the words (word-store.js dueAll). */
    async reviewStart({ today }) {
      const ids = [...dueList(mine.kanji, today), ...dueWords(mine.words, today).map((id) => REVIEW_PREFIX + id)];
      session = createReview(ids);
      return card();
    },
    async reviewShow() {
      if (session) show(session);
      return card();
    },
    /** Answer the card; its schedule moves on the first answer only (review.js). */
    async reviewAnswer({ ok, today }) {
      if (!session) return null;
      answer(session, ok, (rid, right) => {
        const id = wordOfReview(rid);
        if (id === null) kanjiS.answer(rid, right, today);
        else wordsS.answer(id, right, today);
      });
      return card();
    },
    // Kana to kanji (kana-to-kanji.js): a word in hiragana, its kanji spelling
    // to pick among real words. Its own document, like the games.
    async spellLoad({ document: document2 }) {
      spell = new KanaToKanji(document2);
      return spellReply();
    },
    /** The sets a round can be dealt from: My kanji, then the levels, with how many words each holds. */
    async spellDecks() {
      return Promise.all([{ id: "mine" }, ...LEVELS].map(async (deck) => {
        const words = await spellWords(deck.id);
        return { ...deck, preview: words.slice(0, 3).map((w) => w.written).join("\u30FB"), ...spellingSetup(words) };
      }));
    },
    async spellStart({ deck, seed }) {
      spell.start({ deck, words: await spellWords(deck), seed });
      return spellReply();
    },
    async spellAct({ action, ...args }) {
      spell.act(action, args);
      return spellReply();
    },
    // Kanji cards (kanji-cards.js): a free drill with its own document, which
    // never moves My kanji's schedule.
    async cardsLoad({ document: document2 }) {
      cards = new KanjiCards(document2);
      return cardsReply();
    },
    async cardsView() {
      return cardsReply();
    },
    /**
     * The sets a round can be dealt from: My kanji, then the library's levels,
     * with where each stands. Only My kanji can be too small for the quiz's
     * four meanings, so only its labels are looked up for `mode` quiz.
     */
    async cardsDecks({ today, mode = "flip" }) {
      return Promise.all([{ id: "mine" }, ...LEVELS].map(async (deck) => {
        const chars3 = await deckChars(deck.id);
        const quiz = mode === "quiz" && deck.id === "mine";
        const labels = quiz ? Object.fromEntries([...await entriesOf(chars3)].map(([ch, e]) => [ch, quizLabel(e, spanish)])) : {};
        return { ...deck, preview: chars3.slice(0, 6).join(""), ...cards.overview({ chars: chars3, today, mode: quiz ? "quiz" : "flip", labels }) };
      }));
    },
    async cardsStart({ deck, mode = "flip", today, seed }) {
      const chars3 = await deckChars(deck);
      const labels = mode === "quiz" ? Object.fromEntries([...await entriesOf(chars3)].map(([ch, entry]) => [ch, quizLabel(entry, spanish)])) : {};
      cards.start({ deck, chars: chars3, mode, labels, today, seed });
      return cardsReply();
    },
    async cardsAct({ action, ...args }) {
      cards.act(action, args);
      return cardsReply();
    },
    /**
     * My kanji for the watch app (docs/WATCH.md, format naninani-watch/1): the
     * saved kanji, due ones first, as Tomoshibi's cards, at most WATCH_LIMIT.
     */
    async watchDeck({ today }) {
      const due = dueList(mine.kanji, today);
      const wanted = [.../* @__PURE__ */ new Set([...due, ...savedChars()])];
      const entries = await entriesOf(wanted);
      const chars3 = wanted.filter((ch) => entries.get(ch)).slice(0, WATCH_LIMIT);
      return {
        format: "naninani-watch/1",
        sent: today,
        chars: chars3.join(""),
        due: due.filter((ch) => chars3.includes(ch)).length,
        kanji: Object.fromEntries(chars3.map((ch) => [ch, entries.get(ch)]))
      };
    },
    /** How `chars` are written (strokes.js): each stroke as cubics on KanjiVG's 109 grid, in order. */
    async strokes({ chars: chars3 }) {
      const out = {};
      for (const ch of [...chars3]) {
        const strokes = await strokesOfChar(ch);
        out[ch] = strokes && strokes.map(({ cubics, start, end }) => ({ cubics, start, end }));
      }
      return out;
    },
    /** One traced stroke of `ch` judged against stroke `next` (strokes.js traceStroke), with what to say. */
    async trace({ ch, next: next2, drawn }) {
      const strokes = await strokesOfChar(ch);
      if (!strokes) throw new Error(`No strokes for ${ch}`);
      const verdict = traceStroke(strokes, next2, drawn);
      return { ...verdict, words: traceWords(verdict, next2) };
    },
    // Writing rush (writing-rush.js): rushes and marathons over a group, its
    // own document like the games. Each stroke is still judged by `trace`; the
    // app passes the verdict to rushAct 'stroke' with the clock's times.
    async rushLoad({ document: document2 }) {
      rush = new WritingRush(document2);
      return rushReply();
    },
    async rushView() {
      return rushReply();
    },
    /**
     * The groups a run can be dealt from (`script`: hiragana, katakana or kanji,
     * or every group), each with how many characters it deals, and the modes,
     * lengths and guides to choose from. A kanji group loads the stroke shards
     * its kanji fall in (a level touches most of data/strokes), parsing none.
     */
    async rushGroups({ script = null } = {}) {
      const groups = [];
      for (const group of rushGroups()) {
        if (script && group.script !== script) continue;
        const chars3 = group.chars || await deckChars(group.id);
        const { pool, count: count4, ready, message } = rushPool({ group: group.id, chars: chars3, strokes: await strokeCounts(chars3) });
        groups.push({ id: group.id, script: group.script, kind: group.kind, title: group.title, count: count4, preview: pool.slice(0, 6).join(""), ready, message });
      }
      return { groups, ...rushOptions() };
    },
    async rushStart({ group, mode, seconds, guides, seed, today }) {
      const chars3 = await rushChars(group);
      rush.start({ group, chars: chars3, strokes: await strokeCounts(chars3), mode, seconds, guides, seed, today });
      return rushReply();
    },
    async rushAct({ action, ...args }) {
      rush.act(action, args);
      return rushReply();
    }
  };
  globalThis.Yomu = {
    /** done(error, json): the analysis as JSON, the shape docs/ANALYZER.md defines. */
    analyze(text, done) {
      analyze(text, { dict, meanings: lang }).then(
        (result) => done(null, JSON.stringify(result)),
        (error) => done(String(error && error.message || error) + (error && error.cause ? " (" + error.cause + ")" : ""), null)
      );
    },
    /** done(error, json) for one of `calls`, its arguments as JSON. */
    run(name, args, done) {
      const fn = calls[name];
      if (!fn) {
        done(`no call ${name}`, null);
        return;
      }
      Promise.resolve().then(() => fn(JSON.parse(args || "{}"))).then(
        (result) => done(null, JSON.stringify(result === void 0 ? null : result)),
        (error) => done(String(error && error.message || error), null)
      );
    },
    /**
     * One of the account's calls (bridge/account.js), its arguments as JSON:
     * { ok, value } or { ok: false, error } as JSON. What a call sets going
     * (a request, a timer, the line to show) comes back through drain().
     */
    account(name, args) {
      try {
        const a = JSON.parse(args || "{}");
        if (name === "start" && !(loaded.mine && loaded.play && phraseBook)) throw new Error("the documents are not loaded");
        const value = account.call(name, a);
        return JSON.stringify({ ok: true, value: value === void 0 ? null : value });
      } catch (error) {
        return JSON.stringify({ ok: false, error: String(error && error.message || error) });
      }
    },
    /** What the account asked of the app since the last drain, as JSON: { effects, wrote, synced }. */
    drain() {
      return JSON.stringify(account.drain());
    },
    /** A note's strings, or null: kind is sound, grammar or loan. */
    note(kind, id, lang2) {
      return JSON.stringify(noteFor(kind, id, lang2) ?? null);
    },
    /** A token's part of speech in words (strings.js posWords): v5r is "godan verb, ends in る". */
    posWords(tokenJson) {
      return JSON.stringify(posWords(JSON.parse(tokenJson)));
    },
    /**
     * The recording of `text` in `voice`, or in the first voice when that one
     * failed it: a path under the bundle, or null. `written` is the word's
     * spelling when the text is a word's reading, so 雨 plays rain, not candy.
     */
    clip(text, voice, written) {
      const keys = keysFor(text, written || "");
      const clip = clipByKeys(audioFor(keys), keys, voice);
      return clip ? clip.path : null;
    },
    wordClips(linesJson, voice) {
      const lines = JSON.parse(linesJson);
      const keys = lines.map((l) => keysFor(l.text, l.written));
      const plan = wordSequence(audioFor(keys.flat()), keys, voice);
      return JSON.stringify(plan.clips.map((c) => c?.path ?? null));
    },
    /**
     * Paths for every line in one voice, or null when one line has none: a
     * dialogue or a multi-line text plays all its lines recorded, or the
     * device reads it. A line may name its own voice (speaker B's).
     */
    lineClips(linesJson, voice) {
      const lines = JSON.parse(linesJson);
      const keys = lines.flatMap((l) => keysFor(l.text, l.written));
      const a = audioFor(keys);
      if (!a) return "null";
      for (const v of voicesInTurn(a, voice)) {
        const clips = lines.map((l) => clipInVoice(a, keysFor(l.text, l.written), l.voice || v));
        if (clips.every(Boolean)) return JSON.stringify(clips.map((c) => c.path));
      }
      return "null";
    },
    /** The recorded voices, [{ id, name, label: { en, es } }], in the order the site offers them. */
    voices() {
      const a = audioFor([]);
      return JSON.stringify(a ? a.voices : []);
    }
  };
})();
/*!
 * wanakana 5.3.1
 * Romaji to kana, kana to romaji, and live IME-style input binding.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2013 WaniKani Community Github
 * https://github.com/WaniKani/WanaKana
 *
 * VENDORED, NOT HOT-LINKED. Fetched once from
 *   https://cdn.jsdelivr.net/npm/wanakana@5.3.1/esm/index.js
 * upstream sha256 fa9cfd1f841e57094da55ab372d02246277ba2e2fab2c771715dc2824d4e785f
 * by tools/vendor-wanakana.mjs on 2026-09-04. Everything below this header is
 * that file, unmodified. Do not edit it here: change the pin in
 * tools/lib/sources.mjs and re-run the script.
 *
 * Full licence text: wanakana.LICENSE, beside this file.
 */
