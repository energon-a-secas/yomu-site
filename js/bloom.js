// Whether a dictionary key can exist, before its shard is fetched.
//
// A text of twenty characters asks about two hundred substrings and their
// deinflected bases, and all but a few dozen are no key at all. Each one
// used to fetch the shard it would sort into, so a kana sentence loaded most
// of the dictionary to learn that たしはが is not a word. data/dict/filter.json
// is a Bloom filter over every key outside the core shard: it answers "no"
// for a key that is not there, almost always, and "maybe" for one that is,
// always. At the 16 bits a key the builder spends (tools/lib/layout.mjs) a
// missing key gets a "maybe" about once in 2,000. dict.js fetches a range
// shard only on a "maybe".
//
// The hash is FNV-1a over UTF-16 code units, the unit the shard rule sorts
// by, run with two offsets and combined as h1 + i * h2 (Kirsch and
// Mitzenmacher). tools/build-dict.mjs imports this file to build the filter,
// so the page and the builder cannot hash differently. Math.imul keeps every
// step in 32 bits, so node and every browser agree bit for bit.

const OFFSET_A = 0x811c9dc5;
const OFFSET_B = 0x9747b28c;
const PRIME = 0x01000193;

function fnv(key, offset) {
  let h = offset;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, PRIME);
  }
  return h >>> 0;
}

/** The `k` bit positions of `key` in a filter of `m` bits. */
export function positions(key, m, k) {
  const s = String(key);
  const a = fnv(s, OFFSET_A);
  // Odd, so the probe steps through every residue when m is a power of two
  // and never repeats one position k times when it is not.
  const b = fnv(s, OFFSET_B) | 1;
  const out = new Array(k);
  for (let i = 0; i < k; i++) out[i] = (a + i * (b >>> 0)) % m;
  return out;
}

/** Bytes from base64, in the page (atob) and under node (atob since 16). */
function decode(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * A filter from its document (`yomu-dict-filter/1`: `m` bits, `k` hashes,
 * `bits` in base64, bit i at byte i >> 3, mask 1 << (i & 7)).
 * @returns {{ has(key: string): boolean }}
 */
export function readFilter(doc) {
  const m = Number(doc && doc.m);
  const k = Number(doc && doc.k);
  if (!(m > 0) || !(k > 0) || typeof doc.bits !== 'string') throw new Error('it is not a filter');
  const bits = decode(doc.bits);
  if (bits.length * 8 < m) throw new Error(`it holds ${bits.length * 8} bits, not ${m}`);
  return Object.freeze({
    has(key) {
      for (const p of positions(key, m, k)) if (!(bits[p >> 3] & (1 << (p & 7)))) return false;
      return true;
    },
  });
}

/**
 * A filter over `keys` with `bitsPerKey` bits each and the number of hashes
 * that minimises false positives for that size (bitsPerKey times ln 2).
 * @returns {{ m: number, k: number, bytes: Uint8Array }}
 */
export function buildFilter(keys, bitsPerKey) {
  const list = [...keys];
  const m = Math.max(8, Math.ceil(list.length * bitsPerKey / 8) * 8);
  const k = Math.max(1, Math.round(bitsPerKey * Math.LN2));
  const bytes = new Uint8Array(m / 8);
  for (const key of list) for (const p of positions(key, m, k)) bytes[p >> 3] |= 1 << (p & 7);
  return { m, k, bytes };
}
