// Conjugation: from the dictionary form forward to every form a learner
// meets. No DOM.
//
// deinflect.js goes the other way, from what is written back to the
// dictionary, and the two were written apart on purpose: the test
// (tests/conjugate.test.mjs) runs every form this file makes through
// deinflect() and fails unless it lands back on the word, so a mistake has
// to be made twice, in opposite directions, to ship.
//
// A form is built on the written word and on its reading at once, by the
// same ending, so the kanji never move and the furigana is the word's own:
// 書く かく gives 書かない かかない. 来る is the exception, one kanji whose
// reading moves (こ, き, く), and is built in kana and written back on 来.
//
// The table, like the rest of the Word panel, carries ids; strings-conj.js
// names each form in both languages.

import { said } from './kana.js';

// Godan endings by row: [dictionary, i, a, e, o, te, ta].
const GODAN = Object.freeze({
  'v5u': ['う', 'い', 'わ', 'え', 'お', 'って', 'った'],
  'v5u-s': ['う', 'い', 'わ', 'え', 'お', 'うて', 'うた'],
  'v5k': ['く', 'き', 'か', 'け', 'こ', 'いて', 'いた'],
  'v5k-s': ['く', 'き', 'か', 'け', 'こ', 'って', 'った'],
  'v5g': ['ぐ', 'ぎ', 'が', 'げ', 'ご', 'いで', 'いだ'],
  'v5s': ['す', 'し', 'さ', 'せ', 'そ', 'して', 'した'],
  'v5t': ['つ', 'ち', 'た', 'て', 'と', 'って', 'った'],
  'v5n': ['ぬ', 'に', 'な', 'ね', 'の', 'んで', 'んだ'],
  'v5b': ['ぶ', 'び', 'ば', 'べ', 'ぼ', 'んで', 'んだ'],
  'v5m': ['む', 'み', 'ま', 'め', 'も', 'んで', 'んだ'],
  'v5r': ['る', 'り', 'ら', 'れ', 'ろ', 'って', 'った'],
  'v5r-i': ['る', 'り', 'ら', 'れ', 'ろ', 'って', 'った'],
  'v5aru': ['る', 'い', 'ら', 'れ', 'ろ', 'って', 'った'],
});

/** The groups the table is drawn in, in order, each a list of form ids. */
export const GROUPS = Object.freeze({
  verb: Object.freeze([
    ['basic', ['plain', 'polite', 'negative', 'polite-negative', 'past', 'polite-past', 'past-negative', 'polite-past-negative']],
    ['linking', ['te', 'negative-te', 'ba', 'tara']],
    ['more', ['want', 'volitional', 'polite-volitional', 'potential', 'passive', 'causative', 'causative-passive', 'imperative']],
  ].map(([id, forms]) => Object.freeze({ id, forms: Object.freeze(forms) }))),
  adj: Object.freeze([
    ['basic', ['plain', 'polite', 'negative', 'polite-negative', 'past', 'polite-past', 'past-negative', 'polite-past-negative']],
    ['linking', ['te', 'adverb', 'ba', 'tara']],
  ].map(([id, forms]) => Object.freeze({ id, forms: Object.freeze(forms) }))),
});

/**
 * Each form's grammar note id (notes-grammar.js), where one explains it, so
 * the table can open the same note the reading opens for that form. An
 * adjective's forms have notes of their own (くない is adj-negative), and a
 * na-adjective's are the copula's (じゃない).
 */
const VERB_NOTE = Object.freeze({
  polite: 'polite',
  'polite-negative': 'polite-negative',
  'polite-past': 'polite-past',
  'polite-past-negative': 'polite-past-negative',
  past: 'past',
  negative: 'negative',
  'past-negative': 'past-negative',
  te: 'te-form',
  'negative-te': 'naide',
  ba: 'cond-ba',
  tara: 'cond-tara',
  want: 'want',
  volitional: 'volitional',
  'polite-volitional': 'lets',
  potential: 'potential',
  passive: 'passive',
  causative: 'causative',
  imperative: 'imperative',
});
const ADJ_NOTE = Object.freeze({
  negative: 'adj-negative', past: 'adj-past', te: 'adj-te', adverb: 'adverbial', ba: 'cond-ba', tara: 'cond-tara',
});
const NA_NOTE = Object.freeze({
  plain: 'da', polite: 'desu', negative: 'ja-nai', 'polite-negative': 'ja-arimasen', past: 'datta', 'polite-past': 'deshita',
  'past-negative': 'ja-nakatta', 'polite-past-negative': 'ja-arimasen-deshita', adverb: 'adverbial', ba: 'cond-nara', tara: 'cond-tara',
});

/** The grammar note that explains form `id` of a word of class `cls`, or null. */
export function formNote(cls, id) {
  const table = cls === 'adj-na' ? NA_NOTE : cls === 'adj-i' || cls === 'adj-ix' ? ADJ_NOTE : VERB_NOTE;
  return table[id] || null;
}

/** Endings for every form, from a verb's rows (the i, a, e and o endings, te and ta). */
function verbEndings({ i, a, e, o, te, ta, stem }) {
  return {
    plain: null,
    polite: `${i}ます`,
    negative: `${a}ない`,
    'polite-negative': `${i}ません`,
    past: ta,
    'polite-past': `${i}ました`,
    'past-negative': `${a}なかった`,
    'polite-past-negative': `${i}ません でした`,
    te,
    'negative-te': `${a}ないで`,
    ba: `${e}ば`,
    tara: `${ta}ら`,
    want: `${i}たい`,
    volitional: `${o}う`,
    'polite-volitional': `${i}ましょう`,
    potential: stem.potential,
    passive: `${a}れる`,
    causative: `${a}せる`,
    'causative-passive': `${a}せられる`,
    imperative: stem.imperative,
  };
}

/** An ending that replaces the whole word rather than following its stem. */
const WHOLE = '=';

function godanEndings(row, pos) {
  const [, i, a, e, o, te, ta] = row;
  const out = verbEndings({ i, a, e, o, te, ta, stem: { potential: `${e}る`, imperative: e } });
  if (pos === 'v5r-i') {
    // ある: its negative is ない, a word of its own (WHOLE), and it has no
    // potential or passive a learner uses.
    out.negative = `${WHOLE}ない`;
    out['past-negative'] = `${WHOLE}なかった`;
    out['negative-te'] = `${WHOLE}ないで`;
    out.potential = null;
    out.passive = null;
    out['causative-passive'] = null;
    out.imperative = null;
  }
  if (pos === 'v5aru') {
    // くださる, なさる, いらっしゃる: the stem and the command end in い.
    out.imperative = 'い';
    out.potential = null;
    out.passive = null;
    out.causative = null;
    out['causative-passive'] = null;
  }
  return out;
}

const ICHIDAN = Object.freeze(verbEndings({
  i: '', a: '', e: 'れ', o: 'よ', te: 'て', ta: 'た',
  stem: { potential: 'られる', imperative: 'ろ' },
}));
// The table's own ichidan rows, which the shared builder cannot spell.
const ICHIDAN_FIX = Object.freeze({ volitional: 'よう', causative: 'させる', 'causative-passive': 'させられる', passive: 'られる' });

const SURU = Object.freeze({
  plain: 'する', polite: 'します', negative: 'しない', 'polite-negative': 'しません',
  past: 'した', 'polite-past': 'しました', 'past-negative': 'しなかった', 'polite-past-negative': 'しません でした',
  te: 'して', 'negative-te': 'しないで', ba: 'すれば', tara: 'したら',
  want: 'したい', volitional: 'しよう', 'polite-volitional': 'しましょう', potential: 'できる',
  passive: 'される', causative: 'させる', 'causative-passive': 'させられる', imperative: 'しろ',
});

const KURU = Object.freeze({
  plain: 'くる', polite: 'きます', negative: 'こない', 'polite-negative': 'きません',
  past: 'きた', 'polite-past': 'きました', 'past-negative': 'こなかった', 'polite-past-negative': 'きません でした',
  te: 'きて', 'negative-te': 'こないで', ba: 'くれば', tara: 'きたら',
  want: 'きたい', volitional: 'こよう', 'polite-volitional': 'きましょう', potential: 'こられる',
  passive: 'こられる', causative: 'こさせる', 'causative-passive': 'こさせられる', imperative: 'こい',
});

const ADJ_I = Object.freeze({
  plain: 'い', polite: 'い です', negative: 'くない', 'polite-negative': 'くない です',
  past: 'かった', 'polite-past': 'かった です', 'past-negative': 'くなかった', 'polite-past-negative': 'くなかった です',
  te: 'くて', adverb: 'く', ba: 'ければ', tara: 'かったら',
});

const ADJ_NA = Object.freeze({
  plain: ' だ', polite: ' です', negative: ' じゃ ない', 'polite-negative': ' じゃ ありません',
  past: ' だった', 'polite-past': ' でした', 'past-negative': ' じゃ なかった', 'polite-past-negative': ' じゃ ありません でした',
  te: ' で', adverb: ' に', ba: ' なら', tara: ' だったら',
});

/** The part-of-speech tag this file conjugates by, or null. Verbs win over adjectives. */
export function conjClass(pos) {
  const tags = String(pos || '').split(' ').filter(Boolean);
  for (const p of tags) {
    if (GODAN[p] || p === 'v1' || p === 'v1-s' || p === 'vk' || p === 'vs-i') return p;
  }
  if (tags.includes('adj-ix')) return 'adj-ix';
  if (tags.includes('adj-i')) return 'adj-i';
  if (tags.includes('adj-na')) return 'adj-na';
  return null;
}

/** The whole of a written word and its reading, minus the same `n` kana at the end. */
function cutBoth(written, reading, n) {
  return { w: written.slice(0, written.length - n), r: reading.slice(0, reading.length - n) };
}

/**
 * One row. A space in an ending is a word break, where the reader starts a
 * new token (食べません|でした, 高い|です, 静か|じゃない): the written form
 * and the reading drop it, the romaji keeps it, and `words` lists the words.
 */
function rowOf(id, group, stemW, stemR, end, cut = stemR.length) {
  const [head, ...rest] = end.split(' ');
  const firstR = stemR + head;
  const cuts = cut > 0 && cut < firstR.length ? [cut] : [];
  return Object.freeze({
    id,
    group,
    written: stemW + end.replace(/ /g, ''),
    reading: stemR + end.replace(/ /g, ''),
    words: Object.freeze([stemW + head, ...rest].filter(Boolean)),
    stem: stemW,
    stemReading: stemR,
    // The stem and the ending are two morphemes: 思う stays omou.
    romaji: [said(firstR, { cuts }), ...rest.map((x) => said(x))].filter(Boolean).join(' '),
  });
}

function rowsFrom(endings, stemW, stemR, groups) {
  const rows = [];
  for (const g of groups) {
    for (const id of g.forms) {
      const end = endings[id];
      if (end === null || end === undefined) continue;
      // A whole-word ending (ない for ある) does not follow the stem.
      rows.push(end.startsWith(WHOLE) ? rowOf(id, g.id, '', '', end.slice(WHOLE.length)) : rowOf(id, g.id, stemW, stemR, end));
    }
  }
  return Object.freeze(rows);
}

/**
 * Every form of a word, or null when it does not conjugate (or its written
 * form and reading do not end alike, which a conjugation needs).
 *
 * @param {string} written  the dictionary form as written (食べる, 書く, 静か)
 * @param {string} reading  its reading in hiragana (たべる, かく, しずか)
 * @param {string} pos      the record's `p` (`v1 vt`, `adj-na n`)
 * @returns {{ cls: string, kind: 'verb'|'adj', rows: object[] }|null}
 */
export function conjugate(written, reading, pos) {
  const w = String(written || '');
  const r = String(reading || '');
  const cls = conjClass(pos);
  if (!cls || !w || !r) return null;
  const done = (kind, rows) => (rows.length ? Object.freeze({ cls, kind, rows }) : null);

  if (cls === 'adj-na') {
    // The word does not change; the copula after it does.
    return done('adj', rowsFrom(ADJ_NA, w, r, GROUPS.adj));
  }
  if (cls === 'adj-i' || cls === 'adj-ix') {
    if (!w.endsWith('い') || !r.endsWith('い')) return null;
    let { w: sw, r: sr } = cutBoth(w, r, 1);
    if (cls === 'adj-ix') {
      // いい conjugates from よい: よくない, よかった. A word ending in いい
      // (かっこいい) moves only its last い.
      if (sr.endsWith('い')) sr = `${sr.slice(0, -1)}よ`;
      if (sw.endsWith('い')) sw = `${sw.slice(0, -1)}よ`;
    }
    // The plain and polite forms keep the word as written: いい, いいです.
    const whole = { plain: '', polite: ' です' };
    return done('adj', rowsFrom(ADJ_I, sw, sr, GROUPS.adj).map((row) => (row.id in whole
      ? rowOf(row.id, row.group, w, r, whole[row.id], 0)
      : row)));
  }
  if (cls === 'vs-i') {
    if (!w.endsWith('する') || !r.endsWith('する')) return null;
    const { w: sw, r: sr } = cutBoth(w, r, 2);
    return done('verb', rowsFrom(SURU, sw, sr, GROUPS.verb));
  }
  if (cls === 'vk') {
    if (!r.endsWith('くる')) return null;
    if (w.endsWith('来る')) {
      const head = w.slice(0, -2);
      const headR = r.slice(0, -2);
      // 来 keeps one character; its reading is the first kana of each form.
      return done('verb', rowsFrom(KURU, '', '', GROUPS.verb).map((row) => {
        const end = KURU[row.id].slice(1);
        return rowOf(row.id, row.group, `${head}来`, headR + row.reading[0], end, 0);
      }));
    }
    if (!w.endsWith('くる')) return null;
    const { w: sw, r: sr } = cutBoth(w, r, 2);
    return done('verb', rowsFrom(KURU, sw, sr, GROUPS.verb));
  }
  if (cls === 'v1' || cls === 'v1-s') {
    if (!w.endsWith('る') || !r.endsWith('る')) return null;
    const { w: sw, r: sr } = cutBoth(w, r, 1);
    const endings = { ...ICHIDAN, ...ICHIDAN_FIX, plain: 'る' };
    if (cls === 'v1-s') endings.imperative = null; // くれる: its command is くれ, a word of its own
    return done('verb', rowsFrom(endings, sw, sr, GROUPS.verb));
  }
  const row = GODAN[cls];
  if (!row || !w.endsWith(row[0]) || !r.endsWith(row[0])) return null;
  const { w: sw, r: sr } = cutBoth(w, r, 1);
  const endings = { ...godanEndings(row, cls), plain: row[0] };
  return done('verb', rowsFrom(endings, sw, sr, GROUPS.verb));
}

/**
 * The reading of a token's dictionary form: the record's reading that
 * shares the most with what the text says, so 行った (いった) is いく and
 * not ゆく, and 来た (きた) is くる.
 */
export function baseReading(token) {
  const readings = token && token.entry && Array.isArray(token.entry.r) ? token.entry.r.filter(Boolean) : [];
  if (!readings.length) return '';
  const said0 = String(token.reading || '');
  let best = readings[0];
  let bestN = -1;
  for (const r of readings) {
    let n = 0;
    while (n < r.length && n < said0.length && r[n] === said0[n]) n++;
    if (n > bestN) { best = r; bestN = n; }
  }
  return best;
}

/**
 * The table for a token from the reading, or null. A token is conjugated
 * from its dictionary form (`base`), so 食べました shows 食べる's table with
 * the polite past marked as the form in the text.
 */
export function conjugateToken(token) {
  if (!token || !token.entry || token.entry.tier === 'name') return null;
  if (!['word', 'inflected'].includes(token.kind)) return null;
  const written = token.base || token.surface;
  const reading = baseReading(token);
  const table = conjugate(written, reading, token.entry.p);
  if (!table) return null;
  const here = table.rows.find((row) => row.written === token.surface && row.id !== 'plain')
    || table.rows.find((row) => row.written === token.surface);
  return Object.freeze({ ...table, here: here ? here.id : null });
}
