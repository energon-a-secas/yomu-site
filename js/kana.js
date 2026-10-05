// Script tests, script folding, beats, and the two romaji lines.
//
// Every other analyzer module leans on this one, so it has no knowledge of
// words: it is told where the morpheme cuts are and whether a token is a
// particle, and it never guesses either.
//
// Two romaji lines, on purpose (docs/ANALYZER.md, "Romaji"):
//   said     how it is pronounced, in Genki's convention: sayoonara, sensee,
//            watashi wa, hon o, koohii. Doubled vowels, never macrons.
//   spelled  kana by kana with a hyphen between beats: sa-yo-u-na-ra. The
//            difference between the two lines IS the special-sounds lesson.
//
// wanakana does the per-kana table (it already writes n' before a vowel and
// doubles the consonant after っ). What it does not do, and this file adds:
// long vowels written the way they are said, particle readings, and Genki's
// spelling of the foreign-sound digraphs.

import { toRomaji } from './vendor/wanakana.js';

/**
 * Genki's spelling of the katakana digraphs that exist only for loanwords.
 * wanakana folds katakana to hiragana before it maps, so the keys are hiragana.
 *
 * A kana and a small vowel are one beat (beats() joins them), so each is one
 * syllable here too. wanakana reads a small vowel it has no digraph for as a
 * vowel of its own, which split one beat into two sounds: フィレンツェ came
 * out fi-re-n-tsue. The second row is the rest of the loanword table (ツァ,
 * ツィ, ツェ, ツォ, テュ, イェ, the k and g rows with a small vowel, スィ,
 * ズィ), spelled the way the first row is.
 */
export const GENKI_MAP = Object.freeze({
  'てぃ': 'ti', 'でぃ': 'di', 'でゅ': 'dyu', 'とぅ': 'tu', 'どぅ': 'du',
  'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
  'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo', 'ゔ': 'vu',
  'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo',
  'ちぇ': 'che', 'しぇ': 'she', 'じぇ': 'je',
  'つぁ': 'tsa', 'つぃ': 'tsi', 'つぇ': 'tse', 'つぉ': 'tso',
  'てゅ': 'tyu', 'いぇ': 'ye',
  'くぁ': 'kwa', 'くぃ': 'kwi', 'くぇ': 'kwe', 'くぉ': 'kwo',
  'ぐぁ': 'gwa', 'ぐぃ': 'gwi', 'ぐぇ': 'gwe', 'ぐぉ': 'gwo',
  'すぃ': 'si', 'ずぃ': 'zi',
});

/**
 * The same digraphs after っ and after ん, which wanakana reads with its own
 * table before it looks at ours: without these the said line read ネッティ as
 * nettei, ウォッツァ as wottsua and サンウィッチ as san'uitchi while the
 * spelled line, which maps beat by beat, had ne-t-ti and sa-n-wi-t-chi. The
 * doubled letter is the one beatRomaji gives っ (t before ch); ん takes n'
 * before a vowel or y, as everywhere else in the said line.
 */
const SOKUON_MAP = Object.fromEntries(Object.entries(GENKI_MAP).map(([k, v]) => [`っ${k}`, `${v.startsWith('ch') ? 't' : v[0]}${v}`]));
const NASAL_MAP = Object.fromEntries(Object.entries(GENKI_MAP)
  .filter(([k]) => 'あいうえお'.includes(k[0]))
  .map(([k, v]) => [`ん${k}`, `n${/^[aiueoy]/.test(v) ? "'" : ''}${v}`]));

const ROMAJI_OPTS = Object.freeze({ customRomajiMapping: { ...GENKI_MAP, ...SOKUON_MAP, ...NASAL_MAP } });

// ── Script tests ──────────────────────────────────────────────────────────

/** ぁ to ゖ, plus the hiragana iteration marks. */
export function isHiragana(ch) {
  return (ch >= 'ぁ' && ch <= 'ゖ') || ch === 'ゝ' || ch === 'ゞ';
}

/** ァ to ヺ and the long-vowel bar, but not ヶ (which is read like a kanji). */
export function isKatakana(ch) {
  if (ch === 'ヶ') return false;
  return (ch >= 'ァ' && ch <= 'ヺ') || ch === 'ー' || ch === 'ヽ' || ch === 'ヾ';
}

export function isKana(ch) {
  return isHiragana(ch) || isKatakana(ch);
}

/**
 * A kanji, or a mark that behaves like one in a reading: 々 (repeat the last
 * kanji), 〆, and ヶ as in 三ヶ月 (read か, が, こ or け, never "ke").
 */
export function isKanji(ch) {
  return /\p{Script=Han}/u.test(ch) || ch === '々' || ch === '〆' || ch === 'ヶ';
}

/** Anything a Japanese run is made of. Punctuation is not. */
export function isJapanese(ch) {
  return isKana(ch) || isKanji(ch);
}

export function hasKanji(str) {
  for (const ch of String(str || '')) if (isKanji(ch)) return true;
  return false;
}

export function isAllKana(str) {
  const s = String(str || '');
  if (!s) return false;
  for (const ch of s) if (!isKana(ch)) return false;
  return true;
}

// ── Folding ───────────────────────────────────────────────────────────────

/** Katakana to hiragana, character by character. The bar ー stays a bar. */
export function toHira(str) {
  let out = '';
  for (const ch of String(str || '')) {
    const c = ch.codePointAt(0);
    out += (c >= 0x30a1 && c <= 0x30f6) || c === 0x30fd || c === 0x30fe
      ? String.fromCodePoint(c - 0x60)
      : ch;
  }
  return out;
}

/** Hiragana to katakana, character by character. */
export function toKata(str) {
  let out = '';
  for (const ch of String(str || '')) {
    const c = ch.codePointAt(0);
    out += (c >= 0x3041 && c <= 0x3096) || c === 0x309d || c === 0x309e
      ? String.fromCodePoint(c + 0x60)
      : ch;
  }
  return out;
}

// ── Beats (morae) ─────────────────────────────────────────────────────────

const SMALL = new Set([...'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ']);
const OWN_BEAT = new Set([...'っッんンー']);

/**
 * Split kana into beats, the unit a learner sounds out. A small ゃ ゅ ょ or a
 * small vowel joins the kana before it (きょ, ファ); っ, ん and ー are each a
 * beat of their own, which is exactly what makes がっこう four beats long.
 */
export function beats(kana) {
  const out = [];
  for (const ch of String(kana || '')) {
    const prev = out[out.length - 1];
    if (SMALL.has(ch) && prev && !OWN_BEAT.has(prev.slice(-1))) out[out.length - 1] = prev + ch;
    else out.push(ch);
  }
  return out;
}

const VOWELS = 'aiueo';

/** The vowel a beat ends on, or null for っ, ん and ー. */
export function vowelOf(beat) {
  if (!beat || OWN_BEAT.has(beat)) return null;
  const r = toRomaji(toHira(beat), ROMAJI_OPTS);
  const last = r.slice(-1);
  return VOWELS.includes(last) ? last : null;
}

/** One beat as romaji, for a chip under a kana. っ and ー need their neighbours. */
export function beatRomaji(beat, next = '', prev = '') {
  if (beat === 'っ' || beat === 'ッ') {
    const n = next ? toRomaji(toHira(next), ROMAJI_OPTS) : '';
    if (!n) return '';
    return n.startsWith('ch') ? 't' : n[0];
  }
  if (beat === 'ー') return vowelOf(prev) || '';
  if (beat === 'ん' || beat === 'ン') return 'n';
  return toRomaji(toHira(beat), ROMAJI_OPTS);
}

/** sa-yo-u-na-ra: every beat, as written, a hyphen between them. */
export function spelled(kana) {
  const bs = beats(kana);
  return bs.map((b, i) => beatRomaji(b, bs[i + 1], bs[i - 1])).filter(Boolean).join('-');
}

// ── The said line ─────────────────────────────────────────────────────────

const PARTICLE_READ = Object.freeze({ 'は': 'わ', 'へ': 'え', 'を': 'お' });

/**
 * Split kana at the given cut offsets (code-unit offsets into `kana`, as the
 * furigana split and the deinflection chain report them). A long vowel is
 * never merged across a cut: 思う is おも|う, said omou, not omoo.
 */
function segments(kana, cuts) {
  const sorted = [...new Set(cuts || [])].filter((c) => c > 0 && c < kana.length).sort((a, b) => a - b);
  const out = [];
  let from = 0;
  for (const c of sorted) { out.push(kana.slice(from, c)); from = c; }
  out.push(kana.slice(from));
  return out;
}

/**
 * Inside one morpheme, write a long vowel the way it is said: う after an o
 * beat and い after an e beat become ー (おとうさん → おとーさん, せんせい →
 * せんせー). In katakana the bar already says it, so only エイ is rewritten
 * (Genki writes ハイウェイ as haiwee); オウ in katakana keeps its u.
 */
function lengthen(seg) {
  const bs = beats(seg);
  for (let i = 1; i < bs.length; i++) {
    const v = vowelOf(bs[i - 1]);
    const b = bs[i];
    if (v === 'o' && b === 'う') bs[i] = 'ー';
    else if (v === 'e' && (b === 'い' || b === 'イ')) bs[i] = 'ー';
  }
  return bs.join('');
}

/**
 * How it is said, in Genki's romaji.
 *
 * @param {string} kana     the reading (hiragana or katakana)
 * @param {object} opts
 * @param {number[]} opts.cuts   morpheme boundaries inside `kana`
 * @param {boolean} opts.particle  every は へ を in this token is a particle
 *                                 (true for particle and copula tokens)
 * @param {boolean} opts.finalWa   the last は is the old particle, as in
 *                                 こんにちは and こんばんは
 */
export function said(kana, { cuts = [], particle = false, finalWa = false } = {}) {
  let s = String(kana || '');
  if (!s) return '';
  if (particle) s = [...s].map((ch) => PARTICLE_READ[ch] || ch).join('');
  if (finalWa && s.endsWith('は')) s = s.slice(0, -1) + 'わ';
  const merged = segments(s, cuts).map(lengthen).join('');
  // wanakana doubles the vowel before ー only in katakana, so romanise from
  // katakana. The digraph map is keyed in hiragana because wanakana folds first.
  return toRomaji(toKata(merged), ROMAJI_OPTS).toLowerCase();
}

// ── Devoicing ─────────────────────────────────────────────────────────────

const VOICELESS = /^(k|s|sh|t|ch|ts|h|f|p)/;

function consonantOf(beat) {
  if (!beat || beat === 'ん' || beat === 'ー') return '';
  if (beat === 'っ') return 'q';
  const r = toRomaji(toHira(beat), ROMAJI_OPTS);
  const m = r.match(/^[^aiueo]*/);
  return m ? m[0] : '';
}

/**
 * Beats whose vowel is whispered in standard Tokyo speech: an i or u between
 * two voiceless consonants (す|き, き|っ|ぷ), and a final す at the end of an
 * utterance (です, ます). Returned as beat indices. Conservative on purpose:
 * a missed whisper costs nothing, an invented one teaches a wrong sound.
 */
export function devoiced(kana, { final = false } = {}) {
  const bs = beats(toHira(kana));
  const out = [];
  for (let i = 0; i < bs.length; i++) {
    const v = vowelOf(bs[i]);
    if (v !== 'i' && v !== 'u') continue;
    const c = consonantOf(bs[i]);
    if (!VOICELESS.test(c)) continue;
    const next = bs[i + 1];
    if (next) {
      const nc = consonantOf(next === 'っ' ? bs[i + 2] : next);
      if (next === 'っ' || VOICELESS.test(nc)) out.push(i);
    } else if (final && bs[i] === 'す') {
      out.push(i);
    }
  }
  return out;
}

/** Genki's notation for whispered vowels: s(u)kides(u). */
export function devoicedNotation(kana, indices) {
  if (!indices || !indices.length) return '';
  const bs = beats(toHira(kana));
  const set = new Set(indices);
  return bs.map((b, i) => {
    const r = beatRomaji(b, bs[i + 1], bs[i - 1]);
    if (!set.has(i)) return r;
    return r.replace(/[iu]$/, (v) => `(${v})`);
  }).join('');
}
