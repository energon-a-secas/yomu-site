/**
 * Where each dictionary key is shipped: the core shard, or a range shard
 * behind the key filter.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * A text of twenty characters asks the dictionary about two hundred
 * substrings. Sorted into 27 contiguous ranges, the few dozen that exist
 * land in a dozen shards, because a sentence starts words with a dozen
 * different kana: わたしはがくせいです touched eight before anything else.
 * Most of those keys are the same ones in every text (は, い, す, です, する,
 * the one-kana words every substring hits). So the keys texts ask for most,
 * per byte, go in one core shard every text loads, and the rest stay in
 * ranges, fetched only when the filter says the shard holds a key the text
 * asked for.
 *
 * "Asks for" is measured, not guessed: every SAMPLE_EVERY-th sentence of the
 * corpus is cut into runs the way analyze.js cuts them, each run into the
 * keys candidates.js would look up, and a key's score is the number of
 * sentences that needed it divided by its bytes. Nothing of the corpus ships.
 */
import { isJapanese } from '../../js/kana.js';
import { keysForRun } from '../../js/candidates.js';
import { buildFilter } from '../../js/bloom.js';

/** Every tenth sentence: 24,892 of them, enough that the core no longer moves. */
export const SAMPLE_EVERY = 10;

/**
 * Bits per key in the filter. Chosen by measurement (docs/ANALYZER.md,
 * "Data formats"): below this, a false "maybe" fetches a range shard the
 * text did not need often enough to show in the median; above it, the file
 * grows for nothing.
 */
export const BITS_PER_KEY = Number(process.env.YOMU_BITS_PER_KEY || 16);

const isDigit = (ch) => ch >= '0' && ch <= '9';

/** The Japanese runs of a sentence, as analyze.js's pieces() finds them. */
export function runsOf(text) {
  const out = [];
  let cur = '';
  for (const ch of String(text).normalize('NFKC')) {
    if (isJapanese(ch) || isDigit(ch)) cur += ch;
    else if (cur) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

/** The keys that exist among those a text asks the dictionary for. */
export function neededKeys(text, keys, maxKey) {
  const out = new Set();
  for (const run of runsOf(text)) for (const k of keysForRun(run, maxKey)) if (keys.has(k)) out.add(k);
  return out;
}

/**
 * The core: the keys with the most sampled sentences needing them per byte,
 * until `room` bytes are spent. Ties go to plain string order, so two runs
 * over the same corpus choose the same file.
 *
 * @param {Set<string>} keys       every key
 * @param {string[]} sentences     the corpus
 * @param {number} maxKey
 * @param {(key: string) => number} bytesOf  the key's line in a shard
 * @param {number} room            bytes the core's entries may take
 * @returns {{ core: Set<string>, sampled: number }}
 */
export function chooseCore(keys, sentences, maxKey, bytesOf, room) {
  const df = new Map();
  let sampled = 0;
  for (let i = 0; i < sentences.length; i += SAMPLE_EVERY) {
    sampled += 1;
    for (const k of neededKeys(sentences[i], keys, maxKey)) df.set(k, (df.get(k) || 0) + 1);
  }
  const ranked = [...df.keys()]
    .map((k) => ({ k, score: df.get(k) / bytesOf(k) }))
    .sort((a, b) => b.score - a.score || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  const core = new Set();
  let size = 0;
  for (const { k } of ranked) {
    const n = bytesOf(k);
    if (size + n > room) continue;
    core.add(k);
    size += n;
  }
  return { core, sampled };
}

/** The filter document over the keys that live in range shards. */
export function filterDoc(keys, licence) {
  const { m, k, bytes } = buildFilter(keys, BITS_PER_KEY);
  return {
    _licence: licence,
    format: 'yomu-dict-filter/1',
    n: keys.size,
    m,
    k,
    bits: Buffer.from(bytes).toString('base64'),
  };
}
