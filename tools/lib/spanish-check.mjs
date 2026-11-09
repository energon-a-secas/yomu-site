/**
 * The Spanish files (data/es/, tools/build-spanish.mjs) held to their rules,
 * for tools/check-data.mjs: the shape of each file, and what ties it to the
 * English file it mirrors.
 *
 * Each Spanish file names that English file and the digest of its body
 * (`of`, tools/lib/spanish.mjs bodyDigest). It must sit at that file's path
 * under data/es/, the digest must still be the English file's (a rebuilt
 * dictionary that moved a record would otherwise put Spanish beside the wrong
 * one), and every key it holds must be one of the English file's, with no
 * more Spanish than the key has records (words, for a kanji page; rows, for
 * the kanji of the day). And every English file that holds meanings has its
 * Spanish file, once data/ has any.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 */
import {
  ES_DICT, ES_KANJI, ES_KPAGE, ES_DAILY, ES_FORMATS, MAX_ES, MAX_ES_CHARS, esSrc, bodyDigest,
} from './spanish.mjs';

/** The English formats each Spanish format mirrors. */
const MIRRORS = {
  [ES_DICT]: ['yomu-dict/1', 'yomu-dict-core/1', 'yomu-dict-rare/1'],
  [ES_KANJI]: ['yomu-kanji/1'],
  [ES_KPAGE]: ['yomu-kpage/1'],
  [ES_DAILY]: ['yomu-daily/1'],
};
const RARE_SHARD = /^data\/dict\/r\d+\.json$/;

const isText = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max && s.trim() === s;
const isMeanings = (v, max) => Array.isArray(v) && v.length >= 1 && v.length <= MAX_ES
  && v.every((s) => isText(s, max)) && new Set(v).size === v.length;
/** A list per record or word: each item `ok` or 0, the last never 0. */
const isList = (v, ok) => Array.isArray(v) && v.length > 0 && v.every((x) => x === 0 || ok(x)) && v[v.length - 1] !== 0;

/** What is wrong with one Spanish file on its own, as reasons; [] when nothing is. */
export function spanishShape(doc) {
  const out = [];
  if (!doc.of || typeof doc.of.src !== 'string' || !/^[0-9a-f]{64}$/.test(String(doc.of.sha256))) out.push('of is not { src, sha256 }');
  if (doc.format === ES_DAILY) {
    if (!Array.isArray(doc.rows)) return [...out, 'has no rows'];
    doc.rows.forEach((r, i) => {
      if (!Array.isArray(r) || r.length !== 2 || !r.every((x) => x === null || isText(x, 200))) out.push(`row ${i} is not [meaning or null, gloss or null]`);
    });
    return out;
  }
  if (!doc.entries || typeof doc.entries !== 'object' || Array.isArray(doc.entries)) return [...out, 'has no entries'];
  const ok = {
    [ES_DICT]: (v) => isList(v, (x) => isMeanings(x, MAX_ES_CHARS)),
    [ES_KANJI]: (v) => isMeanings(v, 200),
    [ES_KPAGE]: (v) => isList(v, (x) => isText(x, MAX_ES_CHARS)),
  }[doc.format];
  let bad = 0;
  for (const [key, v] of Object.entries(doc.entries)) {
    if (doc.format === ES_KANJI && [...key].length !== 1) out.push(`${JSON.stringify(key)} is not one character`);
    if (!ok(v) && ++bad <= 3) out.push(`${JSON.stringify(key)}: ${JSON.stringify(v).slice(0, 80)} is not its Spanish in this format's shape`);
  }
  return out;
}

/** The English files that hold meanings, as the indexes list them: each must have its Spanish. */
function englishFiles(docs) {
  const out = [];
  const dict = docs.get('data/dict/index.json');
  if (dict) out.push(...(dict.core ? [dict.core.src] : []), ...(dict.shards || []).map((s) => s.src));
  for (const rel of ['data/dict/rare.json', 'data/kanji/index.json', 'data/kpage/index.json']) {
    const index = docs.get(rel);
    if (index) out.push(...(index.shards || []).map((s) => s.src));
  }
  if (docs.get('data/kpage/daily.json')) out.push('data/kpage/daily.json');
  return out.filter((src) => docs.has(src));
}

/** Whether the Spanish of `doc` fits the English file it mirrors; a reason, or null. */
function misfit(doc, english) {
  if (doc.format === ES_DAILY) {
    if (!Array.isArray(doc.rows)) return null; // spanishShape has said so
    return doc.rows.length === (english.rows || []).length ? null : `has ${doc.rows.length} rows, ${doc.of.src} has ${(english.rows || []).length}`;
  }
  for (const [key, v] of Object.entries(doc.entries || {})) {
    const there = Object.prototype.hasOwnProperty.call(english.entries || {}, key) ? english.entries[key] : undefined;
    if (there === undefined) return `${JSON.stringify(key)} is not in ${doc.of.src}`;
    const n = doc.format === ES_DICT ? there.length : doc.format === ES_KPAGE ? (there.w || []).length : 1;
    if (Array.isArray(v) && doc.format !== ES_KANJI && v.length > n) return `${JSON.stringify(key)} has Spanish for ${v.length}, ${doc.of.src} holds ${n}`;
  }
  return null;
}

/**
 * Every rule that ties the Spanish files to the English ones, as [file,
 * reason] pairs. `docs` maps each data file's path (data/...) to its parsed
 * JSON. A copy of data/ with no Spanish has nothing to hold to these rules,
 * and one without the second tier (as tests/data.test.mjs makes) nothing to
 * hold the rare shards' Spanish to.
 */
export function spanishProblems(docs) {
  const out = [];
  const spanish = [...docs].filter(([, d]) => d && ES_FORMATS.includes(d.format));
  if (!spanish.length) return out;
  const mirrored = new Set();
  for (const [rel, doc] of spanish) {
    const src = doc.of && doc.of.src;
    if (typeof src !== 'string') continue;
    if (rel !== esSrc(src)) out.push([rel, `mirrors ${src}, so it belongs at ${esSrc(src)}`]);
    const english = docs.get(src);
    if (!english) {
      if (!(RARE_SHARD.test(src) && !docs.has('data/dict/rare.json'))) out.push([rel, `mirrors ${src}, which is not there`]);
      continue;
    }
    mirrored.add(src);
    if (!MIRRORS[doc.format].includes(english.format)) { out.push([rel, `mirrors ${src}, which is ${english.format}`]); continue; }
    if (bodyDigest(english) !== doc.of.sha256) {
      out.push([rel, `was built from another ${src}: rebuild it with node tools/build-spanish.mjs`]);
      continue;
    }
    const why = misfit(doc, english);
    if (why) out.push([rel, why]);
  }
  for (const src of englishFiles(docs)) {
    if (!mirrored.has(src)) out.push([esSrc(src), `missing: ${src} has meanings and no Spanish file beside it (node tools/build-spanish.mjs)`]);
  }
  return out;
}
