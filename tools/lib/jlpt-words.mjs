/**
 * Jonathan Waller's JLPT vocabulary lists: reading his archived pages,
 * finding each word in Yomu's dictionary, the words the shelf keeps, and
 * the rules the yomu-jlpt-words documents hold (tools/build-jlpt-words.mjs
 * writes them, tools/check-data.mjs holds them to the rules,
 * js/word-levels.js reads them).
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * Of each row of his tables the spelling and the reading are kept, in his
 * order, with the glosses of the dictionary record the word is. His
 * English is read only to choose among the records one spelling and
 * reading name (あの: the filler "say", or "that"), and is not kept, as his
 * kanji lists' readings and meanings are not (tools/lib/jlpt.mjs).
 *
 * The parser was written before any of his vocabulary pages was read (the
 * captures could not be fetched from the session that wrote it): it finds
 * the tables by their headings, the way his kanji pages head theirs, reads
 * every table so headed (a list split over several), and reports the rows
 * holding Japanese it did not read, in those tables or outside them, which
 * the builder refuses. A page it cannot find a table in is refused too, and
 * so is a row it cannot be sure which word of the dictionary is
 * (resolveRow), so the first real run either reads all his rows or says
 * why it did not.
 */
import {
  WORDS_FORMAT, WORDS_INDEX_FORMAT, WORD_LEVELS, JLPT_WORD_SIZES, WORDS_SRC, isKanaWord,
} from '../../js/word-levels.js';
import { toHira } from '../../js/kana.js';
import { glossWords } from '../../js/search.js';
import { MAX_FIELD } from '../../js/word-store.js';
import { serialize, MAX_BYTES } from './emit.mjs';
import { licenceBlock, LICENCES } from './licence.mjs';

export {
  WORDS_FORMAT, WORDS_INDEX_FORMAT, WORD_LEVELS, JLPT_WORD_SIZES, WORDS_SRC,
};

// ── His pages ─────────────────────────────────────────────────────────────

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * A cell's text: tags out, entities decoded, runs of space (an ideographic
 * one too) as one. A line break, or the end of a paragraph or block, is a
 * space, so two readings a cell gives on two lines stay two (readingsOf).
 */
export function cellText(html) {
  return String(html)
    .replace(/<br\b[^>]*>|<\/(p|div|li)\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITY[e.toLowerCase()] ?? m;
    })
    .replace(/[\s　]+/g, ' ')
    .trim();
}

const HEADS = { kanji: /^kanji$/i, kana: /^(hiragana|kana|reading|furigana)$/i, english: /^(english|meaning)$/i };

/** The cells of one table row, from the text after its <tr>: [is a heading, html] each. */
function cellsOf(chunk) {
  const out = [];
  const re = /<(t[dh])\b[^>]*>([\s\S]*?)(?=<\/t[dh]\s*>|<t[dh]\b|$)/gi;
  for (const m of chunk.matchAll(re)) out.push([m[1].toLowerCase() === 'th', m[2]]);
  return out;
}

/** Kana or kanji: a cell with any is Japanese, and a row with one may be a word. */
const JAPANESE = /[\u3041-\u30ff\u3400-\u9fff々〆〜～]/;

/**
 * One archived vocabulary page: `rows`, for each row of every table whose
 * headings name a Kanji column and a Hiragana one, [kanji cell, kana cell,
 * English cell], each '' when the page leaves it empty (or has no English
 * column); `tables`, how many tables were so headed; `short`, the cells of
 * each other row of those tables that holds Japanese, as a row short of
 * the Kanji and Hiragana cells (one cell across the table, a section
 * heading in kana) or one with both of them empty; and `stray`, the cells
 * of each row outside them that has two cells or more, one of them
 * Japanese, as when a table goes on without its headings. The builder
 * refuses `short` and `stray` rows rather than drop them. A heading row a
 * table repeats is passed over, and so is a row with no Japanese in it.
 */
export function wallerPage(html) {
  const chunks = String(html).split(/<tr\b[^>]*>/i).slice(1);
  let cols = null;
  let tables = 0;
  const rows = [];
  const short = [];
  const stray = [];
  for (const raw of chunks) {
    const end = raw.search(/<\/table\s*>/i);
    const cells = cellsOf(end >= 0 ? raw.slice(0, end) : raw);
    const heads = cells.filter(([th]) => th).map(([, c]) => cellText(c));
    const at = Object.fromEntries(Object.entries(HEADS).map(([k, re]) => [k, heads.findIndex((t) => re.test(t))]));
    if (heads.length && heads.length === cells.length && at.kanji >= 0 && at.kana >= 0) {
      if (!cols) tables += 1;
      cols = at;
    } else if (cols) {
      const tds = cells.filter(([th]) => !th).map(([, c]) => cellText(c));
      const row = tds.length > Math.max(cols.kanji, cols.kana)
        ? [tds[cols.kanji], tds[cols.kana], cols.english >= 0 ? (tds[cols.english] || '') : '']
        : null;
      if (row && (row[0] || row[1])) rows.push(row);
      else {
        const all = cells.map(([, c]) => cellText(c));
        if (all.some((t) => JAPANESE.test(t))) short.push(all);
      }
    } else {
      const tds = cells.map(([, c]) => cellText(c));
      if (tds.length >= 2 && tds.some((t) => JAPANESE.test(t))) stray.push(tds);
    }
    if (end >= 0) cols = null;
  }
  if (!tables) throw new Error('no table headed Kanji and Hiragana');
  if (!rows.length) throw new Error('the tables headed Kanji and Hiragana have no rows');
  return { rows, tables, short, stray };
}

/** The rows of one vocabulary page (wallerPage), the tables' rows alone. */
export const wallerWords = (html) => wallerPage(html).rows;

/**
 * A row of his as the shelf keeps it: [written, reading], the kanji
 * spelling written and the kana its reading, or a word with no kanji
 * spelling written as his kana cell gives it, with reading '' (a katakana
 * word his kana column gives in hiragana is the katakana word).
 */
export function rowOf([kanji, kana]) {
  const written = kanji || kana;
  const reading = kana || '';
  if (!written) return null;
  if (!kanji) return [written, ''];
  if (isKanaWord(written) && (!reading || toHira(reading) === toHira(written))) return [written, ''];
  return [written, reading];
}

/**
 * What separates two spellings or two readings a cell gives: a ・, a comma
 * (、，,), a slash (/／), a semicolon (;；), or a space, which is what a
 * line break in the cell becomes (cellText).
 */
const ALTERNATIVES = /\s*[・、，,／/;；]\s*|\s+/;

/**
 * The ways a row of his may be read, each [written, reading] as rowOf reads
 * it: `whole`, the cells as they are (null for a row with neither);
 * `joined`, the cells with what separates (ALTERNATIVES) taken out, as
 * ボール・ペン is ボールペン and どうぞ よろしく is どうぞよろしく, or null
 * when that is the whole; and `parts`, for a cell giving two spellings or
 * two readings (一昨日, おととい・おとつい), each spelling with each
 * reading, in his order (empty for a row whose cells give one each).
 * resolveRow says which of them the row is.
 */
export function readingsOf(cells) {
  const [kanji = '', kana = ''] = cells;
  const whole = rowOf([kanji, kana]);
  if (!whole) return { whole: null, joined: null, parts: [] };
  const split = (t) => t.split(ALTERNATIVES).filter(Boolean);
  const join = (t) => split(t).join('');
  const joinedRow = rowOf([join(kanji), join(kana)]);
  const joined = joinedRow && wordKey(joinedRow) !== wordKey(whole) ? joinedRow : null;
  const ks = kanji ? split(kanji) : [''];
  const hs = kana ? split(kana) : [''];
  const parts = new Map();
  if (ks.length > 1 || hs.length > 1) {
    for (const k of ks) {
      for (const h of hs) {
        const row = rowOf([k, h]);
        if (row && !parts.has(wordKey(row))) parts.set(wordKey(row), row);
      }
    }
  }
  return { whole, joined, parts: [...parts.values()] };
}

/** Every [written, reading] readingsOf names for a row of his: the keys the dictionary is asked for. */
export function rowsOf(cells) {
  const { whole, joined, parts } = readingsOf(cells);
  const out = new Map();
  for (const row of [whole, joined, ...parts]) if (row && !out.has(wordKey(row))) out.set(wordKey(row), row);
  return [...out.values()];
}

/** One word, whatever level holds it: the same spelling read the same way. */
export const wordKey = ([written, reading]) => `${written}\u0000${reading || written}`;

/** How a left-out row is named in tools/build-jlpt-words.mjs LEFT_OUT: `written reading`, or a kana word alone. */
export const leftOutName = ([written, reading]) => (reading ? `${written} ${reading}` : written);

// ── The dictionary ────────────────────────────────────────────────────────

/**
 * The records of a dictionary tier a word may be, through `records(key)`
 * (a key's records, or undefined). A word written in kana is its own key,
 * and every record of it is a candidate, being a different word; one read
 * another way names nothing. A word written with a kanji is each record of
 * its key read that way (`r`), or, when there is none, each record of its
 * reading that spells it so (`k`), which is how the first tier files a word
 * it ships only in kana (彼奴 under あいつ).
 */
export function candidatesOf(records, written, reading = '') {
  if (typeof written !== 'string' || !written) return [];
  const said = reading || written;
  const own = records(written) || [];
  if (isKanaWord(written)) return said === written ? own : [];
  const hira = toHira(said);
  const read = own.filter((rec) => Array.isArray(rec.r) && rec.r.some((r) => r === said || toHira(r) === hira));
  if (read.length) return read;
  return (records(hira) || []).filter((rec) => Array.isArray(rec.k) && rec.k.includes(written));
}

/** The keys candidatesOf may read for these rows of [written, reading]. */
export function keysOf(rows) {
  const keys = new Set();
  for (const [written, reading] of rows) {
    keys.add(written);
    if (reading) keys.add(toHira(reading));
  }
  return [...keys];
}

/** How many words a record's glosses share with his English, as Search splits them (glossWords). */
export function englishScore(rec, english) {
  const his = new Set(glossWords(english || ''));
  let n = 0;
  for (const w of new Set(glossWords(((rec && rec.g) || []).join(' ')))) if (his.has(w)) n += 1;
  return n;
}

/**
 * The record a row of his is, of its candidates: the one whose glosses share
 * the most words with his English (englishScore); on a tie, for a word
 * written in kana, one JMdict says is usually written in kana or that has
 * no kanji spelling, before one usually written in kanji (いか the
 * cuttlefish, not 以下); then the dictionary's own order. Null with no
 * candidate.
 */
export function chooseRecord(candidates, english, kanaWritten = false) {
  if (!candidates.length) return null;
  const score = (rec) => englishScore(rec, english);
  const kanaFirst = (rec) => (kanaWritten && (rec.u || !rec.k) ? 1 : 0);
  let best = candidates[0];
  for (const rec of candidates.slice(1)) {
    const d = score(rec) - score(best) || kanaFirst(rec) - kanaFirst(best);
    if (d > 0) best = rec;
  }
  return best;
}

// ── The rows the shelf keeps ──────────────────────────────────────────────

/** Two records are one word here when they give the same glosses, which is all a row keeps of one. */
const meaningOf = (rec) => JSON.stringify(rec.g || []);

/**
 * Which word of the dictionary a row of his is, through `lookup(written,
 * reading)` (its candidate records) and `readAs` (a row's leftOutName to
 * the [written, reading] a person read it as): `{ row, rec, first, how }`,
 * the reading taken, its record, its first candidate, and how it was read,
 * or `{ why }` when it is not read. In order:
 *
 *   - a row `readAs` names is the word it names, which must be one;
 *   - the cells as they are (`how` 'whole');
 *   - the cells joined ('joined', readingsOf), when his English, if he gives
 *     any, shares a word with that record's glosses: ボール・ペン is
 *     ボールペン "ball-point pen";
 *   - each part ('parts'), when every part is a word and all are the same
 *     word, which is the first: 一昨日 read おととい or おとつい is one
 *     record, so the row is 一昨日 おととい.
 *
 * Anything else is not read, with the reason: a cell whose parts are
 * different words (ボール・ペン, if ボールペン were no word, is ボール
 * "ball" and ペン "pen") is never taken as its first part, and a part the
 * dictionary lacks is never passed over, as either would put a wrong word
 * on the shelf with a real record's glosses, which no check could catch.
 */
export function resolveRow(cells, lookup, readAs = new Map()) {
  const { whole, joined, parts } = readingsOf(cells);
  if (!whole) return { why: 'is empty' };
  const english = cells[2] || '';
  const at = (row, how) => {
    const cands = lookup(row[0], row[1]);
    const rec = chooseRecord(cands, english, !row[1]);
    return rec ? { row, rec, first: cands[0], how } : null;
  };
  const name = leftOutName(whole);
  if (readAs.has(name)) {
    const as = readAs.get(name);
    const row = Array.isArray(as) ? rowOf(as) : null;
    return (row && at(row, 'READ_AS')) || { why: `READ_AS reads it as ${JSON.stringify(as)}, which is no word of the dictionary` };
  }
  const own = at(whole, 'whole');
  if (own) return own;
  if (joined) {
    const one = at(joined, 'joined');
    if (one && (!english || englishScore(one.rec, english) > 0)) return one;
    if (one) return { why: `read as one word it is ${leftOutName(joined)} ${JSON.stringify(one.rec.g[0])}, which his English does not name` };
  }
  if (!parts.length) return { why: 'is no word of the dictionary' };
  const each = parts.map((row) => [row, at(row, 'parts')]);
  if (each.every(([, got]) => got) && new Set(each.map(([, got]) => meaningOf(got.rec))).size === 1) return each[0][1];
  const said = each.map(([row, got]) => `${leftOutName(row)} ${got ? JSON.stringify(got.rec.g[0]) : '(no word)'}`);
  return { why: `its parts are not one word: ${said.join(', ')}` };
}

/**
 * The words each level keeps, from his rows (`raw`, a level id to rows of
 * [kanji cell, kana cell, English cell]) and `lookup(written, reading)`,
 * the candidate records of a word (candidatesOf over the first tier, or the
 * rare words when the first tier has none), each row read by resolveRow.
 * Each kept row is [written, reading, the chosen record's glosses]. A word
 * his lists repeat (the same spelling and reading, or the same spelling of
 * the same record read another way, 一昨日 おととい after 一昨日 おとつい)
 * stays at the first level that has it, the easiest, and the repeat is
 * reported; a row named in `leftOut` (leftOutName of the row as rowOf
 * reads it, to a reason) is left out and reported; a row read other than
 * as its cells are is reported in `read`, to be checked against his page;
 * any other row resolveRow does not read is `unresolved`, with its reason,
 * which the builder refuses to write, as it does a `leftOut` name no row
 * matched (`stale`) and a `readAs` one (`staleReadAs`). `chosen` counts
 * the rows whose record his English chose over the first candidate.
 */
export function chooseRows(raw, lookup, leftOut = new Map(), readAs = new Map()) {
  const levels = {};
  const seen = new Map();
  const repeats = [];
  const left = [];
  const read = [];
  const unresolved = [];
  const named = new Set();
  const namedAs = new Set();
  let chosen = 0;
  for (const id of WORD_LEVELS) {
    levels[id] = [];
    for (const cells of raw[id] || []) {
      const whole = rowOf(cells);
      if (!whole) continue;
      const name = leftOutName(whole);
      if (leftOut.has(name)) { named.add(name); left.push({ id, row: whole, why: leftOut.get(name) }); continue; }
      if (readAs.has(name)) namedAs.add(name);
      const got = resolveRow(cells, lookup, readAs);
      if (!got.rec) { unresolved.push({ id, row: whole, cells, why: got.why }); continue; }
      const { row, rec } = got;
      if (got.how !== 'whole') read.push({ id, cells, row, how: got.how, g: rec.g[0] });
      const key = wordKey(row);
      const same = `${row[0]}\u0000${meaningOf(rec)}`;
      const was = seen.get(key) || seen.get(same);
      if (was) { repeats.push({ id, row, first: was }); continue; }
      if (rec !== got.first) chosen += 1;
      seen.set(key, id);
      seen.set(same, id);
      levels[id].push([row[0], row[1], rec.g.slice()]);
    }
  }
  const stale = [...leftOut.keys()].filter((name) => !named.has(name));
  const staleReadAs = [...readAs.keys()].filter((name) => !namedAs.has(name));
  return { levels, repeats, left, read, unresolved, stale, staleReadAs, chosen };
}

// ── The documents ─────────────────────────────────────────────────────────

/**
 * The `_licence` block of every word file. Each row carries JMdict glosses
 * as they are, which are CC BY-SA, so EDRDG's licence governs the file, as
 * it does every other file that carries the dictionary's text (data/sets,
 * data/spell); Waller's lists, CC BY, are the input that says which words
 * each level holds. jlptWordsProblems holds the files to this shape.
 */
export function wordsLicence(generatedBy, extra = {}) {
  return licenceBlock('edrdg', generatedBy, {
    ...extra,
    inputs: [['wallerWords', 'which words each level holds, in his order: the spelling and the reading of each row of his lists']],
  });
}

/** Why a file's `_licence` is not wordsLicence's shape, or null. */
function licenceProblem(block) {
  if (!block || block.id !== LICENCES.edrdg.id) return `_licence is ${block ? block.id : 'missing'}, not ${LICENCES.edrdg.id}: the glosses are JMdict's, under its share-alike licence`;
  if (!Array.isArray(block.inputs) || !block.inputs.some((inp) => inp && inp.id === LICENCES.wallerWords.id)) return `_licence.inputs does not credit Waller's lists (${LICENCES.wallerWords.id})`;
  return null;
}

/** A level's rows in files under the cap, in order: `n5-0.json`, `n5-1.json` and so on. */
function pack(id, rows, licence) {
  const header = Buffer.byteLength(serialize({ _licence: licence, format: WORDS_FORMAT, level: id, rows: [] }, 'rows'));
  const files = [];
  let cur = [];
  let size = header;
  for (const row of rows) {
    const n = Buffer.byteLength(`${JSON.stringify(row)},\n`);
    if (cur.length && size + n > MAX_BYTES - 64) { files.push(cur); cur = []; size = header; }
    cur.push(row);
    size += n;
  }
  if (cur.length) files.push(cur);
  return files.map((list) => ({ _licence: licence, format: WORDS_FORMAT, level: id, rows: list }));
}

/**
 * The documents for these levels (a level id to its rows): the index,
 * data/words/jlpt.json, and each level's files, as [path, doc] pairs.
 */
export function jlptWordsDocs(levels, licence) {
  const files = [];
  const out = {};
  let count = 0;
  for (const id of WORD_LEVELS) {
    const rows = levels[id] || [];
    const docs = rows.length ? pack(id, rows, licence) : [];
    out[id] = {
      n: rows.length,
      files: docs.map((doc, i) => {
        const rel = `data/words/${id}-${i}.json`;
        files.push([rel, doc]);
        return rel;
      }),
    };
    count += rows.length;
  }
  return { index: { _licence: licence, format: WORDS_INDEX_FORMAT, count, levels: out }, files };
}

/** Why a row is not [written, reading, glosses] as the page and Save read one, or null. */
function rowProblem(row) {
  if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== 'string' || typeof row[1] !== 'string') return 'is not [written, reading, glosses]';
  const [written, reading, glosses] = row;
  if (!Array.isArray(glosses) || !glosses.length || glosses.length > 3 || glosses.some((g) => typeof g !== 'string' || !g)) return 'has no glosses, or more than three';
  if (!written || written !== written.trim()) return 'has no written form, or one with space around it';
  if ([...written].length > MAX_FIELD || [...reading].length > MAX_FIELD) return `is longer than ${MAX_FIELD} characters, which Save refuses`;
  if (!reading) return isKanaWord(written) ? null : 'has no reading, and its written form is not kana';
  if (!isKanaWord(reading)) return 'has a reading that is not kana';
  if (reading === written) return 'gives its reading when it is the written form';
  return null;
}

/**
 * What is wrong with the word lists, as sentences: the index (`index`,
 * data/words/jlpt.json) and the files it lists, read through `fileOf(path)`
 * (a parsed file, or undefined). Each carries wordsLicence's block, its
 * levels are N5 to N1 in order, each row
 * is [written, reading, glosses], no word is in two levels or twice in one,
 * every count is what the files hold and `sizes` pins, and, with
 * `resolves(written, reading, glosses)`, every row is a record of the
 * dictionary: true, false, or undefined where it cannot tell, as when a
 * copy of data/ has no rare tier.
 */
export function jlptWordsProblems(index, fileOf, { sizes = JLPT_WORD_SIZES, resolves = null } = {}) {
  const out = [];
  if (!index || index.format !== WORDS_INDEX_FORMAT) return [`is not ${WORDS_INDEX_FORMAT}`];
  const indexLicence = licenceProblem(index._licence);
  if (indexLicence) out.push(indexLicence);
  const levels = index.levels;
  if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return ['levels is not an object'];
  if (Object.keys(levels).join() !== WORD_LEVELS.join()) out.push(`levels are ${JSON.stringify(Object.keys(levels))}, not ${JSON.stringify(WORD_LEVELS)}`);
  const seen = new Map();
  let total = 0;
  for (const id of WORD_LEVELS) {
    const entry = levels[id];
    if (!entry || !Array.isArray(entry.files) || !entry.files.length || !Number.isInteger(entry.n)) { out.push(`${id} is not { n, files }`); continue; }
    let n = 0;
    let unknown = 0;
    for (const rel of entry.files) {
      const doc = fileOf(rel);
      if (!doc) { out.push(`${id} lists ${rel}, which is missing`); continue; }
      if (doc.format !== WORDS_FORMAT || doc.level !== id || !Array.isArray(doc.rows)) { out.push(`${rel} is not a ${WORDS_FORMAT} file of ${id}`); continue; }
      const fileLicence = licenceProblem(doc._licence);
      if (fileLicence) out.push(`${rel}: ${fileLicence}`);
      doc.rows.forEach((row, i) => {
        const bad = rowProblem(row);
        if (bad) { out.push(`${rel}: row ${i} ${bad}`); return; }
        const name = leftOutName(row);
        const key = wordKey(row);
        if (seen.has(key)) out.push(`${name} is in ${seen.get(key)} and ${id}`);
        else seen.set(key, id);
        if (resolves && resolves(row[0], row[1], row[2]) === false && (unknown += 1) <= 3) {
          out.push(`${id}: ${name} ${JSON.stringify(row[2])} is no record of the dictionary`);
        }
      });
      n += doc.rows.length;
    }
    if (entry.n !== n) out.push(`${id} says ${entry.n} words, its files hold ${n}`);
    if (!Number.isInteger(sizes[id])) out.push(`${id}: no size is pinned in js/word-levels.js JLPT_WORD_SIZES`);
    else if (n !== sizes[id]) out.push(`${id} holds ${n} words, not ${sizes[id]}`);
    total += n;
  }
  if (index.count !== total) out.push(`count is ${index.count}, and the levels hold ${total}`);
  return out;
}

/**
 * The resolves rule over two tiers given as key-to-records lookups: a row
 * is a record of the first tier when the first tier has the word, and of
 * the rare words only when it does not (the builder's order); undefined
 * when that would need a rare tier `rare` is null for.
 */
export function resolvesIn(first, rare = null) {
  const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((g, i) => g === b[i]);
  return (written, reading, glosses) => {
    const own = candidatesOf(first, written, reading);
    if (own.length) return own.some((rec) => same(rec.g, glosses));
    if (!rare) return undefined;
    return candidatesOf(rare, written, reading).some((rec) => same(rec.g, glosses));
  };
}
