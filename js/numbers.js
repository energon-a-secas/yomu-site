// Numbers and the counters that follow them.
//
// A number is not in any dictionary, and its reading is a rule: 3 is さん, 300
// is さんびゃく, 800 is はっぴゃく. A counter then bends the last sound of the
// number it follows (1本 いっぽん, 3本 さんぼん, 6本 ろっぽん) and sometimes the
// number itself (4時 is よじ, not よんじ; 1人 is ひとり). Those bends are the
// lesson, so the token says when one happened (`counterChange`).
//
// The lattice asks two things of this module: is there a number starting here,
// and if a counter follows, what is the whole thing read as. Everything is a
// table below; nothing is guessed.

const KANJI_DIGIT = Object.freeze({
  '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
});
const KANJI_UNIT = Object.freeze({ '十': 10, '百': 100, '千': 1000 });
const KANJI_BIG = Object.freeze({ '万': 1e4, '億': 1e8, '兆': 1e12 });

export function isKanjiNumeral(ch) {
  return ch in KANJI_DIGIT || ch in KANJI_UNIT || ch in KANJI_BIG;
}

const isDigit = (ch) => ch >= '0' && ch <= '9';

/**
 * Read a kanji numeral: 二十五, 三百, 二〇二六 (digit by digit), 一万二千.
 * Returns null for a string that is not one well-formed number.
 */
export function parseKanjiNumber(str) {
  const chars = [...str];
  if (!chars.length) return null;
  if (chars.every((c) => c in KANJI_DIGIT)) {
    return chars.length > 1 && chars[0] === '〇' ? null : Number(chars.map((c) => KANJI_DIGIT[c]).join(''));
  }
  let total = 0;
  let section = 0;
  let digit = null;
  for (const c of chars) {
    if (c in KANJI_DIGIT) {
      if (digit !== null) return null; // 二三 with units around it is not a number
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

// ── Reading a number ──────────────────────────────────────────────────────

const ONES = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
const HUNDREDS = { 1: 'ひゃく', 3: 'さんびゃく', 6: 'ろっぴゃく', 8: 'はっぴゃく' };
const THOUSANDS = { 1: 'せん', 3: 'さんぜん', 8: 'はっせん' };
const BIGS = [[1e12, 'ちょう'], [1e8, 'おく'], [1e4, 'まん']];

/**
 * A number under 10,000 as pieces, each with the place it stands for, so a
 * counter can bend the last one. 3805 is さんぜん|はっぴゃく|ご.
 */
function below10k(n) {
  const out = [];
  const th = Math.floor(n / 1000);
  const hu = Math.floor(n / 100) % 10;
  const te = Math.floor(n / 10) % 10;
  const on = n % 10;
  if (th) out.push({ kana: THOUSANDS[th] || `${ONES[th]}せん`, place: 1000, digit: th });
  if (hu) out.push({ kana: HUNDREDS[hu] || `${ONES[hu]}ひゃく`, place: 100, digit: hu });
  if (te) out.push({ kana: te === 1 ? 'じゅう' : `${ONES[te]}じゅう`, place: 10, digit: te });
  if (on) out.push({ kana: ONES[on], place: 1, digit: on });
  return out;
}

/** The whole number as pieces. Past the trillions it is read digit by digit. */
export function numberPieces(n) {
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return [{ kana: 'ぜろ', place: 1, digit: 0 }];
  if (n >= 1e16 || !Number.isInteger(n)) {
    return [...String(n)].map((d) => ({ kana: d === '0' ? 'ぜろ' : ONES[Number(d)], place: 1, digit: Number(d) }));
  }
  const out = [];
  let rest = n;
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

export function readNumber(n) {
  const p = numberPieces(n);
  return p ? p.map((x) => x.kana).join('') : null;
}

/**
 * Whether a number bends inside itself, the way a counter bends one: 300 is
 * さんびゃく, not さんひゃく; 600 ろっぴゃく; 8000 はっせん. The hundreds and
 * thousands tables above are exactly those bends; 100 and 1000 dropping
 * their いち is not a sound change and does not count.
 */
export function numberBends(n) {
  const pieces = numberPieces(n) || [];
  return pieces.some((p) => (p.place === 100 || p.place === 1000) && p.digit > 1
    && p.kana !== ONES[p.digit] + (p.place === 100 ? 'ひゃく' : 'せん'));
}

// ── Counters ──────────────────────────────────────────────────────────────
//
// `last` is what the number ends on: 1 to 9 for a ones digit, or the place
// (10, 100, 1000, 10000...) when the ones are zero. Each counter says, for a
// `last`, what the last piece of the number becomes and how the counter is
// read. Rows that bend alike share a helper.

/**
 * The small-tsu bend: the last piece loses its final kana to っ before a
 * counter that starts with k, s, t, p or h. いち to いっ, ろく to ろっ, はち to
 * はっ, じゅう to じゅっ, はっぴゃく to はっぴゃっ. `places` says which endings
 * bend for this row; the s row stops at 1, 8 and 10 (ろくさい, ひゃくさい).
 */
function geminate(last, kana, places) {
  return places.includes(last) ? `${kana.slice(0, -1)}っ` : kana;
}

const KH_PLACES = [1, 6, 8, 10, 100];
const S_PLACES = [1, 8, 10];

/** Counters on the h row: 本 ほん, 分 ふん, 杯 はい, 匹 ひき. */
function hRow(plain, voiced, half, { three = voiced, four = plain } = {}) {
  return (last, kana) => {
    const small = geminate(last, kana, KH_PLACES);
    if (small !== kana) return [small, half];
    if (last === 3) return [kana, three];
    if (last === 1000 || last >= 10000) return [kana, voiced];
    if (last === 4) return [kana, four];
    return [kana, plain];
  };
}

/** Counters on the k and s rows: 回, 個, 階 (k); 歳, 冊, 週間 (s). */
function ksRow(plain, { three = plain, places = KH_PLACES } = {}) {
  return (last, kana) => {
    const small = geminate(last, kana, places);
    if (small !== kana) return [small, plain];
    if (last === 3) return [kana, three];
    return [kana, plain];
  };
}

/** Counters that bend only 4, 7 and 9, the way time does. */
function fourSevenNine(plain, four, seven, nine) {
  return (last, kana) => {
    if (last === 4) return [four, plain];
    if (last === 7) return [seven, plain];
    if (last === 9) return [nine, plain];
    return [kana, plain];
  };
}

const DAYS = Object.freeze({
  1: 'ついたち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか', 6: 'むいか', 7: 'なのか',
  8: 'ようか', 9: 'ここのか', 10: 'とおか', 14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか',
});
const TSU = Object.freeze({
  1: 'ひとつ', 2: 'ふたつ', 3: 'みっつ', 4: 'よっつ', 5: 'いつつ', 6: 'むっつ', 7: 'ななつ', 8: 'やっつ', 9: 'ここのつ',
});

/**
 * Every counter the lattice recognises, longest first where one is a prefix
 * of another (時間 before 時). `whole` reads the entire number and counter at
 * once (ひとり, はつか, みっつ) and returns null when the value is out of range.
 */
const BASE = {
  '時間': { plain: 'じかん', bend: fourSevenNine('じかん', 'よ', 'なな', 'く') },
  '時': { plain: 'じ', bend: fourSevenNine('じ', 'よ', 'しち', 'く') },
  // Half past: 四時半 is よじはん, one number and one counter. Without it,
  // 四 came out of the dictionary as し and took the suffix 時半 (ima shi
  // jihan desu), for every hour.
  '時半': { plain: 'じはん', bend: fourSevenNine('じはん', 'よ', 'しち', 'く') },
  '分': { plain: 'ふん', bend: hRow('ふん', 'ぷん', 'ぷん', { three: 'ぷん', four: 'ぷん' }) },
  '秒': { plain: 'びょう', bend: (last, kana) => [kana, 'びょう'] },
  '人': {
    plain: 'にん',
    whole: (n) => (n === 1 ? 'ひとり' : n === 2 ? 'ふたり' : undefined),
    bend: fourSevenNine('にん', 'よ', 'なな', 'きゅう'),
  },
  '本': { plain: 'ほん', bend: hRow('ほん', 'ぼん', 'ぽん') },
  '枚': { plain: 'まい', bend: (last, kana) => [kana, 'まい'] },
  // People, formally (a booking, a class list): 三名 is さんめい, and no
  // number bends before it. 名 alone is な, "name", and 十名 and 三名 were
  // read as the surnames とな and さんみょう until 名 joined this table.
  '名': { plain: 'めい', bend: (last, kana) => [kana, 'めい'] },
  '円': { plain: 'えん', bend: fourSevenNine('えん', 'よ', 'なな', 'きゅう') },
  '歳': { plain: 'さい', whole: (n) => (n === 20 ? 'はたち' : undefined), bend: ksRow('さい', { places: S_PLACES }) },
  '月': {
    plain: 'がつ',
    whole: (n) => (n < 1 || n > 12 ? null : undefined),
    bend: fourSevenNine('がつ', 'し', 'しち', 'く'),
  },
  '日': { plain: 'にち', whole: (n) => DAYS[n] },
  '年': { plain: 'ねん', bend: fourSevenNine('ねん', 'よ', 'なな', 'きゅう') },
  '回': { plain: 'かい', bend: ksRow('かい') },
  '個': { plain: 'こ', bend: ksRow('こ') },
  '階': { plain: 'かい', bend: ksRow('かい', { three: 'がい' }) },
  '杯': { plain: 'はい', bend: hRow('はい', 'ばい', 'ぱい') },
  '匹': { plain: 'ひき', bend: hRow('ひき', 'びき', 'ぴき') },
  '冊': { plain: 'さつ', bend: ksRow('さつ', { places: S_PLACES }) },
  '台': { plain: 'だい', bend: (last, kana) => [kana, 'だい'] },
  '番': { plain: 'ばん', bend: (last, kana) => [kana, 'ばん'] },
  '度': { plain: 'ど', bend: (last, kana) => [kana, 'ど'] },
  '倍': { plain: 'ばい', bend: (last, kana) => [kana, 'ばい'] },
  'つ': { plain: 'つ', whole: (n) => TSU[n] || null },
};

// Months and places counted with a small ka, in each of the ways it is
// written: 一か月 is いっかげつ, 三ヶ所 is さんかしょ. Without these, か was
// the question particle and 月 was つき (ichi ka tsuki), and ヶ所 after a
// number was read as a surname.
const KA = ['か', 'ヶ', 'ケ', 'カ', 'ヵ', '箇'];
for (const ka of KA) {
  BASE[`${ka}月`] = { plain: 'かげつ', bend: ksRow('かげつ') };
  BASE[`${ka}所`] = { plain: 'かしょ', bend: ksRow('かしょ') };
}

/**
 * A length of time is the counter and 間: 三年間 さんねんかん, 十分間
 * じゅっぷんかん. The number bends exactly as it does before the counter
 * alone, so each is the counter's own row with かん after it, and its parts
 * keep 間 apart (十日[とおか] 間[かん]). One difference: a single day of
 * time is いちにち, not the date ついたち. 時間 and 週間 are counters of their
 * own above, because 七時間 is ななじかん where 七時 is しちじ.
 */
const SPAN = ['年', '分', '秒', '日', ...KA.map((ka) => `${ka}月`)];
for (const c of SPAN) {
  const spec = { ...BASE[c], tail: ['間', 'かん'] };
  if (c === '日') spec.whole = (n) => (n === 1 ? undefined : DAYS[n]);
  BASE[`${c}間`] = spec;
}
BASE['週間'] = { plain: 'しゅうかん', bend: ksRow('しゅうかん', { places: S_PLACES }) };

export const COUNTERS = Object.freeze(BASE);

const COUNTER_KEYS = Object.keys(COUNTERS).sort((a, b) => b.length - a.length);

/** The counter that starts at `i` in `text`, or null. */
export function counterAt(text, i) {
  for (const k of COUNTER_KEYS) if (text.startsWith(k, i)) return k;
  return null;
}

/** A counter's own row, and the 間 a length of time adds after it. */
function withTail(spec, read) {
  if (!read || !spec.tail) return read;
  const [text, kana] = spec.tail;
  return { ...read, reading: read.reading + kana, tail: { text, kana } };
}

/**
 * Read a number followed by a counter.
 * @returns {{ numberKana: string, counterKana: string, reading: string, changed: boolean,
 *   whole?: true, tail?: { text: string, kana: string } } | null}
 *   `numberKana` + `counterKana` is the reading, split where the digits end,
 *   so furigana can sit over each. When the pair is read as one word (ひとり,
 *   はつか) `whole` is true, `counterKana` is '' and the split is not shown.
 *   `tail` is the 間 of a length of time, read after both.
 */
export function readCounted(n, counter) {
  const spec = COUNTERS[counter];
  const pieces = numberPieces(n);
  if (!spec || !pieces) return null;
  const plainNumber = pieces.map((p) => p.kana).join('');
  const plain = plainNumber + spec.plain;
  if (spec.whole) {
    const w = spec.whole(n);
    if (w === null) return null;
    if (typeof w === 'string') {
      // みっつ keeps its つ visible as the counter's own kana.
      if (counter === 'つ') return { numberKana: w.slice(0, -1), counterKana: 'つ', reading: w, changed: w !== plain };
      return withTail(spec, { numberKana: w, counterKana: '', reading: w, changed: w !== plain, whole: true });
    }
  }
  if (!spec.bend) return withTail(spec, { numberKana: plainNumber, counterKana: spec.plain, reading: plain, changed: false });
  const tail = pieces[pieces.length - 1];
  const last = tail.place === 1 ? tail.digit : tail.place;
  const [lastKana, counterKana] = spec.bend(last, tail.kana);
  const numberKana = pieces.slice(0, -1).map((p) => p.kana).join('') + lastKana;
  const reading = numberKana + counterKana;
  return withTail(spec, { numberKana, counterKana, reading, changed: reading !== plain });
}

/**
 * The furigana parts of a number and its counter, for the lattice to hand to
 * analyze.js: the number, the counter, and the 間 of a length of time, each
 * with its own ruby. A pair read as one word (八日 ようか, 二十歳 はたち,
 * 一人 ひとり) is one ruby marked `whole`, as 今日 is: neither 八 nor 日 is
 * read よう or か on its own, and the kanji list must not teach that it is.
 */
export function countedParts(numberText, counter, read) {
  const head = read.tail ? counter.slice(0, -read.tail.text.length) : counter;
  const out = read.whole
    ? [{ text: numberText + head, ruby: read.numberKana, whole: true }]
    : [{ text: numberText, ruby: read.numberKana }];
  // The small ka is always か, whichever way it is written, so it gets its
  // own ruby and 月 keeps げつ: ヶ[か]月[げつ], never one ruby over both.
  if (!read.whole && head.length === 2 && KA.includes(head[0])) {
    out.push({ text: head[0], ruby: 'か' }, { text: head[1], ruby: read.counterKana.slice(1) });
  } else if (!read.whole) out.push({ text: head, ruby: read.counterKana });
  if (read.tail) out.push({ text: read.tail.text, ruby: read.tail.kana });
  return out;
}

/**
 * 何 before a counter asks how many, and bends the counter the way 3 does,
 * because both end in ん: 何本 なんぼん, 何階 なんがい, 何分 なんぷん, as
 * さんぼん, さんがい, さんぷん. A counter read as one word with its number
 * (ひとり, みっか) is read plainly after 何: 何人 なんにん, 何日 なんにち. 何つ is
 * not how the question is asked (that is いくつ), so つ gives null.
 * @returns {{ numberKana: string, counterKana: string, reading: string, changed: boolean } | null}
 */
export function readQuestion(counter) {
  const spec = COUNTERS[counter];
  if (!spec || counter === 'つ') return null;
  const [numberKana, counterKana] = spec.bend ? spec.bend(3, 'なん') : ['なん', spec.plain];
  const reading = numberKana + counterKana;
  return withTail(spec, { numberKana, counterKana, reading, changed: reading !== `なん${spec.plain}` });
}

/**
 * Where a number and its counter starting at `i` end, or -1: 三時, 5本,
 * 何分. names.js asks this so a surname is never read across one.
 */
export function countedEnd(text, i) {
  if (text[i] === '何') {
    const counter = counterAt(text, i + 1);
    return counter && readQuestion(counter) ? i + 1 + counter.length : -1;
  }
  const num = numberAt(text, i);
  if (!num) return -1;
  const counter = counterAt(text, num.end);
  return counter && readCounted(num.value, counter) ? num.end + counter.length : -1;
}

/**
 * A number starting at `i`: ASCII digits (full-width ones are ASCII after
 * NFKC), with commas between groups of three, or kanji numerals.
 * @returns {{ end: number, value: number, kanji: boolean } | null}
 */
export function numberAt(text, i) {
  if (isDigit(text[i])) {
    let j = i;
    let digits = '';
    while (j < text.length) {
      if (isDigit(text[j])) { digits += text[j]; j++; continue; }
      if (text[j] === ',' && /^\d{3}(?!\d)/.test(text.slice(j + 1, j + 5)) && digits.length) { j++; continue; }
      break;
    }
    return { end: j, value: Number(digits), kanji: false };
  }
  if (!isKanjiNumeral(text[i])) return null;
  let j = i;
  while (j < text.length && isKanjiNumeral(text[j])) j++;
  // Take the longest prefix that parses: 三十一日 is 三十一 then 日.
  for (let end = j; end > i; end--) {
    const value = parseKanjiNumber(text.slice(i, end));
    if (value !== null) return { end, value, kanji: true };
  }
  return null;
}
