// Text a camera or a photo gave, made ready to read: Naninani's Scan
// (1.3.0). docs/READER.md, "Scanned text", has what Live Text was measured
// handing back and why each rule below is the one it is.
//
// Live Text gives back the lines it saw. Three things in them are the page's
// layout, not its text:
//   - furigana comes back as lines of its own, before the line it sits on
//     (きょう, あめ, then 今日は雨が降っています。), at times with a space
//     inside (き よう) or a small kana read as a large one;
//   - a vertical page keeps its column breaks, even inside a word
//     (…見つ / けました。), where horizontal lines come back joined;
//   - a gap in the print comes back as a space or a line break, as a menu's
//     dish and its price do.
// cleanScan drops a line of kana that spells the readings of kanji on a line
// beside it, closes a space or a line break that falls inside a word, and
// joins a line break the sentence plainly runs through: a particle or a
// copula on either side of it, or a comma before it. Everything else stays
// as scanned, so a menu keeps one item a line.
//
// `analyze` is the analyzer with its dictionary (`(text) => analyze(text,
// { dict })`), passed in so the app's bridge and the tests use their own.

import { normalize } from './analyze.js';
import { isKana, isJapanese, hasKanji, toHira } from './kana.js';

/** Small kana a scan of tiny print may read large, folded so both compare alike. */
const SMALL = Object.freeze({
  ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ', ゕ: 'か', ゖ: 'け',
});
/** Marks a line ends on when its break is the text's own (after normalize: ！ is !). */
const ENDS = new Set(['。', '.', '!', '?', '…', '‥', '」', '』', ')', '】', '〉', '》', '"', '”']);
/** Particles no sentence ends on, so a line ending on one goes on to the next. */
const GOES_ON = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'へ', 'も', 'の', 'や', 'から', 'まで', 'より',
  'って', 'けど', 'けれど', 'ので', 'のに', 'て', 'ば', 'し']);
/** Characters each side of a break shown to the analyzer: more than any word it reads. */
const WINDOW = 12;
const LAYOUT = new Set(['punct', 'space', 'newline']);

const chars = (s) => Array.from(s);
const lastOf = (s) => chars(s).at(-1) || '';
const firstOf = (s) => chars(s)[0] || '';
const tailOf = (s) => chars(s).slice(-WINDOW).join('');
const headOf = (s) => chars(s).slice(0, WINDOW).join('');

/** Kana for comparing: hiragana, small kana large, no spaces. */
function folded(s) {
  return chars(toHira(String(s).replace(/\s+/gu, ''))).map((ch) => SMALL[ch] || ch).join('');
}

/** A line of kana alone, spaces aside: what furigana always is. */
function kanaOnly(line) {
  const s = line.replace(/\s+/gu, '');
  return s.length > 0 && chars(s).every(isKana);
}

/** The readings of a line's kanji, in order: each run's ruby, as the reader shows it. */
function rubiesOf(analysis) {
  const out = [];
  for (const t of analysis.tokens) for (const f of t.furigana || []) if (f.ruby) out.push(folded(f.ruby));
  return out;
}

/**
 * Whether `s` is the readings from `from` on, in order, each one whole, any
 * of them skipped (printed furigana sits only over the kanji a reader may not
 * know): the index after the last reading used, or -1.
 */
export function spells(s, rubies, from = 0) {
  if (!s) return -1;
  const memo = new Map();
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

/**
 * Drops each line of kana that spells the readings of the kanji line after
 * it (where Live Text puts furigana) or, failing that, before it. A kanji
 * line's readings are used once and in order, so two lines of furigana never
 * claim the same kanji.
 */
async function dropFurigana(lines, analyze) {
  const kana = lines.map(kanaOnly);
  if (!kana.some(Boolean) || !lines.some(hasKanji)) return { lines, furigana: [] };
  const readings = new Map();
  const used = new Map();
  const readingsAt = async (j) => {
    if (!readings.has(j)) readings.set(j, rubiesOf(await analyze(lines[j])));
    return readings.get(j);
  };
  // The nearest line in this direction that is not kana alone, if it has kanji.
  const near = (i, step) => {
    for (let j = i + step; j >= 0 && j < lines.length; j += step) {
      if (!kana[j]) return hasKanji(lines[j]) ? j : -1;
    }
    return -1;
  };
  const drop = new Set();
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
    furigana: lines.filter((_, i) => drop.has(i)),
  };
}

/** Whether the analyzer reads a word across the junction between `left` and `right`. */
async function wordAcross(left, right, analyze) {
  const tail = tailOf(left);
  const r = await analyze(tail + headOf(right));
  const at = tail.length;
  return { r, at, across: r.tokens.some((t) => !LAYOUT.has(t.kind) && t.start < at && t.end > at) };
}

/** Closes each space between two Japanese characters that falls inside a word. */
async function closeSpaces(line, analyze) {
  const parts = line.split(' ');
  let out = parts[0];
  let joins = 0;
  for (const part of parts.slice(1)) {
    if (isJapanese(lastOf(out)) && isJapanese(firstOf(part)) && (await wordAcross(out, part, analyze)).across) {
      out += part;
      joins += 1;
    } else out += ` ${part}`;
  }
  return { line: out, joins };
}

/**
 * Whether the line break between `a` and `b` is only where the column or
 * the line ran out: a word runs across it, a particle or a copula begins
 * `b` (no sentence does), `a` ends on a particle no sentence ends on, or on
 * a comma. A break after a sentence's end, or beside anything that is not
 * Japanese, stays.
 */
async function goesOn(a, b, analyze) {
  const last = lastOf(a);
  const first = firstOf(b);
  if (ENDS.has(last)) return false;
  if (last === '、') return true;
  if (!isJapanese(last) || !isJapanese(first)) return false;
  const { r, at, across } = await wordAcross(a, b, analyze);
  if (across) return true;
  const after = r.tokens.find((t) => t.start === at);
  if (after && (after.kind === 'particle' || after.kind === 'copula')) return true;
  const before = r.tokens.filter((t) => t.end === at && !LAYOUT.has(t.kind)).at(-1);
  return Boolean(before && before.kind === 'particle' && GOES_ON.has(before.surface));
}

/**
 * The scan's text ready to read, with what was taken out: `furigana`, the
 * lines dropped as furigana, and `joins`, how many spaces and line breaks
 * were closed.
 */
export async function cleanScan(text, analyze) {
  const lines = normalize(text).split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
  const { lines: kept, furigana } = await dropFurigana(lines, analyze);
  let joins = 0;
  const out = [];
  for (const raw of kept) {
    const { line, joins: closed } = await closeSpaces(raw, analyze);
    joins += closed;
    if (out.length && await goesOn(out[out.length - 1], line, analyze)) {
      out[out.length - 1] += line;
      joins += 1;
    } else out.push(line);
  }
  return { text: out.join('\n'), furigana, joins };
}
