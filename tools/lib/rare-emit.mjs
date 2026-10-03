/**
 * Writing the second tier: its range shards, its filter parts and its index.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * Called by tools/build-dict.mjs once the first tier is written, because only
 * that run knows which (entry, spelling) pairs the first tier shipped. The
 * files sit beside the first tier's in data/dict/ under names of their own:
 * rare.json (the index, yomu-dict-rare-index/1), rNNN.json (the range
 * shards, yomu-dict-rare/1) and rfN.json (the filter parts, the first tier's
 * yomu-dict-filter/1). docs/ANALYZER.md has the formats and the measurements.
 */
import path from 'node:path';
import { writeJson, SITE, fmtBytes, pruneStale } from './emit.mjs';
import { isKana } from '../../js/kana.js';
import { pack } from './records.mjs';
import { countKeys } from './freq.mjs';
import {
  rareForms, rareEntries, filterParts, RARE_FORMAT, RARE_INDEX_FORMAT, MAX_RARE_RECORDS,
} from './rare.mjs';
import { buildFilter } from '../../js/bloom.js';

const OUT = path.join(SITE, 'data', 'dict');

/**
 * The second tier's key filters cover only keys that start with kana, in
 * parts of RARE_KEYS_PER_PART contiguous keys at RARE_BITS_PER_KEY bits.
 * Measured over the 597 of 3,112 corpus sentences that run the second phase
 * (docs/ANALYZER.md): a key that starts with a kanji nearly always shares
 * its shard with a key that exists (one kanji alone is a key of some rare
 * entry), so filtering it saved no fetch, and filter parts sized to the cap
 * over every key cost more than the shards they spared (mean 566 KB a
 * sentence against 503 KB with no filter at all). Small parts over the kana
 * keys alone bring it to 400 KB: a katakana run asks about many strings
 * that are no key (トム, メアリー), and each of those is a shard not fetched.
 * YOMU_RARE_BITS and YOMU_RARE_PART override them for a measuring run only.
 */
export const RARE_BITS_PER_KEY = Number(process.env.YOMU_RARE_BITS || 8);
export const RARE_KEYS_PER_PART = Number(process.env.YOMU_RARE_PART || 8000);

/**
 * @returns {string[]} the lines build-dict.mjs prints about the second tier
 */
export function writeRare({
  jmdict, shipped, table, sentences, firstKeys, licence,
}) {
  const forms = rareForms(jmdict.words, shipped);
  // Counted over both tiers' keys at once, so a rare spelling is credited
  // only with the matches no longer key took from it.
  const counts = countKeys(sentences, new Set([...firstKeys, ...forms.keys()]));
  const { entries, capped, records } = rareEntries(forms, table, counts);
  const all = [...entries.keys()].sort();
  const maxKey = all.reduce((m, k) => Math.max(m, k.length), 0);

  const docs = pack(all, entries, licence, RARE_FORMAT);
  const written = [];
  const shards = [];
  const sizes = [];
  docs.forEach((doc, i) => {
    const name = `r${String(i).padStart(3, '0')}.json`;
    sizes.push(writeJson(path.join(OUT, name), doc));
    written.push(path.join(OUT, name));
    shards.push({ src: `data/dict/${name}`, first: doc.first });
  });

  // The keys from the first that starts with kana to the last, every key
  // between included (ゟ and ヶ sort among the kana and are not kana), since
  // a part covers a range and must hold every key in it.
  const lo = all.findIndex((k) => isKana(k[0]));
  const hi = all.length - 1 - [...all].reverse().findIndex((k) => isKana(k[0]));
  const parts = filterParts(all.slice(lo, hi + 1), RARE_KEYS_PER_PART);
  const filters = [];
  const filterSizes = [];
  parts.forEach((part, i) => {
    const { m, k, bytes } = buildFilter(part.keys, RARE_BITS_PER_KEY);
    const name = `rf${String(i).padStart(2, '0')}.json`;
    filterSizes.push(writeJson(path.join(OUT, name), {
      _licence: licence,
      format: 'yomu-dict-filter/1',
      n: part.keys.size,
      m,
      k,
      bits: Buffer.from(bytes).toString('base64'),
    }));
    written.push(path.join(OUT, name));
    filters.push({ src: `data/dict/${name}`, first: part.first, last: part.last });
  });

  const indexBytes = writeJson(path.join(OUT, 'rare.json'), {
    _licence: licence,
    format: RARE_INDEX_FORMAT,
    keys: all.length,
    maxKey,
    filters,
    shards,
  }, 'shards');
  const gone = pruneStale(OUT, /^(r\d{3}|rf\d+)\.json$/, written);

  const total = sizes.reduce((a, b) => a + b, 0);
  const fTotal = filterSizes.reduce((a, b) => a + b, 0);
  return [
    `second tier: keys ${all.length}, records ${records}, maxKey ${maxKey}; keys over ${MAX_RARE_RECORDS} records ${capped}`,
    `second tier shards ${docs.length}: total ${fmtBytes(total)} (${total} B); index ${fmtBytes(indexBytes)}`,
    `second tier filters ${parts.length} over the ${parts.reduce((n, p) => n + p.keys.size, 0)} keys from the first that starts with kana to the last, ${RARE_KEYS_PER_PART} a part at ${RARE_BITS_PER_KEY} bits a key: total ${fmtBytes(fTotal)} (${fTotal} B)`,
    gone.length ? `removed stale second-tier files: ${gone.join(' ')}` : 'no stale second-tier files',
  ];
}
