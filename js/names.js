// Kanji runs the dictionary does not have: where one is a name, and how to
// guess its reading.
//
// Most kanji a learner pastes that no key covers are people and places:
// 田中さん, 山田さん, 鈴木さん, 佐藤です. The only other way through such a
// run is one single-kanji word per character, and that is how 田中 used to
// come out: 田 "rice field" and 中 read じゅう, "throughout". So the lattice
// offers the run as one token of kind `name`, priced by costs.js to beat
// that split, and this file says which runs qualify and reads them. The
// reading is always a guess and the token says so (confidence 'guess'):
// names are the one place Japanese readings cannot be derived from the
// characters.
//
// Knows no DOM and loads nothing; the lattice hands in the dictionary with
// the run's keys loaded and the kanji data analyze.js fetched.

import { isKanji, isKana, toHira } from './kana.js';
import { deinflect, deinflectStem, posMatches } from './deinflect.js';
import { countedEnd } from './numbers.js';

/**
 * Kanji a name never ends on, because after a name they are the suffix:
 * 田中君, 鈴木様, 山田氏, 佐藤達, 田中家. Without this, the whole run would be
 * the name and the honorific would vanish into it.
 */
const TAIL = new Set([...'君様氏殿達家']);

/** Pronouns, which start a run as themselves (私達 is not a surname). */
const HEAD = new Set([...'私僕俺彼何誰我']);

/** 々 repeats, ヶ and 〆 are marks; only the first may sit inside a name. */
const isNameChar = (ch) => isKanji(ch) && ch !== 'ヶ' && ch !== '〆';

/**
 * Whether `s`, two or more characters, is a word the lattice could use: a
 * key that is not a key plus a particle (中に is 中 and に, and must not
 * stop 田中 being a name), or a conjugated or stem form of one (焼き in
 * 卵焼き, 来ます after 田中).
 */
function isWord(s, dict) {
  const recs = dict.get(s);
  if (recs && recs.some((r) => !r.x)) return true;
  if (!isKana(s[s.length - 1])) return false;
  const found = (ds) => ds.some((d) => (dict.get(d.base) || []).some((r) => posMatches(d.type, r.p, d.base, true)));
  return found(deinflect(s)) || found(deinflectStem(s));
}

/**
 * Whether [i, j) of `run` is a stretch the dictionary says nothing about:
 * two or more kanji, inside one kanji run, touched by no word of two or more
 * characters that starts in that run (a key, or a conjugated or stem form
 * whose kana run on past it), crossed by no number with its counter (朝八時
 * is 朝 and 八時, not a surname), and closed on both sides. Closed means it
 * starts where the kanji run starts or where a word ends (社長|山田), and ends
 * where the run ends, where a word or a counted number starts (田中|社長), or
 * before an honorific kanji (田中|君). A stretch that cuts a run anywhere
 * else would be the lattice inventing a boundary nobody wrote.
 *
 * @param {string} run   one Japanese run (kana, kanji, digits)
 * @param {number} i     start offset, code units
 * @param {number} j     end offset, code units
 * @param {{ get(key: string): any }} dict  with the run's keys loaded
 * @param {number} [maxKey=12]  the longest key, so the scan stops there
 * @param {object} [memo]  any object that lives as long as one pass over
 *   `run` (the lattice passes its env); the words are found once per run
 *   and kept on it
 */
export function unsupported(run, i, j, dict, maxKey = 12, memo = {}) {
  const chars = [...run.slice(i, j)];
  if (chars.length < 2 || !chars.every(isNameChar) || chars[0] === '々') return false;
  if (HEAD.has(chars[0]) || TAIL.has(chars[chars.length - 1])) return false;
  let rs = i;
  while (rs > 0 && isNameChar(run[rs - 1])) rs--;
  let re = j;
  while (re < run.length && isNameChar(run[re])) re++;
  const idx = spansOf(run, dict, maxKey, memo);
  // A word or counted number that starts in this kanji run before j and ends
  // after i crosses the stretch. reach[] is the furthest any of them gets,
  // reset at every kana, so this is one lookup, not a rescan of the run: the
  // rescan made 2,000 kanji with no kana take 20 seconds.
  if (idx.reach[j - 1] > i) return false;
  const leftOpen = i > rs && !(idx.lastStartEndingAt[i] >= rs);
  const rightOpen = j < re && !TAIL.has(run[j]) && !idx.starts[j];
  return !leftOpen && !rightOpen;
}

/**
 * Every word of two or more characters and every counted number that starts
 * on a kanji of `run`, found once: `reach[a]` is the furthest end of any that
 * starts at or before `a` within the same kanji run, `starts[a]` says one
 * starts at `a`, and `lastStartEndingAt[b]` is the latest start of one that
 * ends at `b` (-1 for none).
 */
function spansOf(run, dict, maxKey, memo) {
  if (memo.nameSpans && memo.nameSpans.run === run) return memo.nameSpans;
  const n = run.length;
  const reach = new Int32Array(n + 1).fill(-1);
  const starts = new Uint8Array(n + 1);
  const lastStartEndingAt = new Int32Array(n + 1).fill(-1);
  for (let a = 0; a < n; a++) {
    if (!isNameChar(run[a])) continue;
    let far = a > 0 && isNameChar(run[a - 1]) ? reach[a - 1] : -1;
    const add = (b) => {
      starts[a] = 1;
      if (b > far) far = b;
      if (a > lastStartEndingAt[b]) lastStartEndingAt[b] = a;
    };
    const counted = countedEnd(run, a);
    if (counted > a) add(counted);
    for (let b = a + 2; b <= Math.min(n, a + maxKey); b++) if (isWord(run.slice(a, b), dict)) add(b);
    reach[a] = far;
  }
  memo.nameSpans = { run, reach, starts, lastStartEndingAt };
  return memo.nameSpans;
}

/** Hiragana readings of one kind from a kanji record, in the data's order. */
function forms(list, keepStem) {
  return (list || []).map(String).filter((x) => keepStem || !x.includes('.'))
    .map((x) => toHira(x.split('.')[0]).replace(/-/g, '')).filter(Boolean);
}

/** Plain kun first (やま), then affix forms (こ- for 木), never okurigana. */
function kunOf(info) {
  const list = (info && info.kun) || [];
  const plain = forms(list.filter((x) => !String(x).includes('-')), false);
  return [...plain, ...forms(list.filter((x) => String(x).includes('-')), false)];
}

/** Kun readings including the stem of an okurigana form (たか from たか.い). */
function kunWithStems(info) {
  return [...new Set([...kunOf(info), ...forms(info && info.kun, true)])];
}

function onOf(info) {
  return forms(info && info.on, true);
}

/**
 * Two kanji whose reading after the first character of a surname is not the
 * one their data would pick, and common enough to be worth a line each.
 * 藤 there is とう, and the name around it is read on: 佐藤, 伊藤, 加藤,
 * 斎藤 (as the first character it is ふじ: 藤田, 藤井). 田 there is usually
 * だ: 山田, 前田, 吉田, 池田 (森田 and 村田 keep た, and read wrong here).
 * Both are general facts about Japanese surnames, written here.
 */
const AFTER_FIRST = Object.freeze({
  '藤': { reading: 'とう', on: true },
  '田': { reading: 'だ' },
  // 口 there is ぐち: 山口, 川口, 田口, 野口, 谷口, 関口, 樋口. 山口 was
  // read やまくち.
  '口': { reading: 'ぐち' },
});

/**
 * Surnames among the hundred commonest whose reading no rule above can
 * reach, because it is not built from the characters' own readings: 清水
 * was せいすい, and 五十嵐 was the number fifty and a storm. Each is read as
 * a whole, the way 今日 is, so no character is taught a share of it. The
 * token is still a guess (清水 is きよみず in 清水寺); this only makes the
 * guess the one a reader would make.
 */
const WHOLE = Object.freeze({ '清水': 'しみず', '長谷川': 'はせがわ', '五十嵐': 'いがらし', '服部': 'はっとり' });
const WHOLE_KEYS = Object.keys(WHOLE);

/** The reading of a surname read as a whole, or null. */
export function wholeName(s) {
  return WHOLE[s] || null;
}

/** The length of a surname read as a whole that starts at `i`, or 0. */
export function wholeNameAt(run, i) {
  for (const k of WHOLE_KEYS) if (run.startsWith(k, i)) return k.length;
  return 0;
}

/**
 * Variant characters that names keep and kanji data does not list, read as
 * the character they vary: 𠮷 (the 吉 with a long bottom stroke) in 𠮷野.
 */
export const NAME_VARIANTS = Object.freeze({ '𠮷': '吉' });

/**
 * A reading for each character of a name, from kanji data.
 *
 * Kun first, because Japanese surnames mostly are (田中 たなか, 鈴木 すずき,
 * 高橋 たかはし). A name is read one way through, though: when any character
 * has no kun of its own, or holds a 藤 read とう, the whole name is read on,
 * which is what 佐藤 and 加藤 are. Only when neither reading covers every
 * character does each take what it has. Voicing at a join is guessed for
 * 田 alone (AFTER_FIRST); 小林 comes out こはやし, not こばやし, because
 * which names voice is a fact about the name, and a guess that looks like
 * knowledge is worse than one that looks like a guess.
 *
 * @param {string} s        the kanji of the name
 * @param {Map<string, object>} [kanji]  char -> { on, kun }
 * @returns {string[]} one hiragana piece per character, '' where the data has
 *   none; 々 repeats the piece before it
 */
export function guessName(s, kanji) {
  const chars = [...s];
  const info = chars.map((ch) => (kanji && ch !== '々' ? kanji.get(ch) || kanji.get(NAME_VARIANTS[ch]) : null));
  const fixed = chars.map((ch, n) => (n > 0 && chars.length > 1 ? AFTER_FIRST[ch] : null));
  const covered = (fn) => chars.every((ch, n) => (ch === '々' ? n > 0 : fixed[n] || fn(info[n]).length > 0));
  const forcedOn = fixed.some((x) => x && x.on);
  const mode = !forcedOn && covered(kunOf) ? 'kun' : covered(onOf) ? 'on' : 'each';
  const pieces = [];
  chars.forEach((ch, n) => {
    if (ch === '々') { pieces.push(pieces[n - 1] || ''); return; }
    if (fixed[n]) { pieces.push(fixed[n].reading); return; }
    const kun = mode === 'kun' ? kunOf(info[n]) : kunWithStems(info[n]);
    const on = onOf(info[n]);
    pieces.push((mode === 'on' ? on[0] : kun[0] || on[0]) || '');
  });
  return pieces;
}

// ── Names the names tier knows ────────────────────────────────────────────

/**
 * JMnedict's name types, said in words. `g` on a name's entry is the English
 * side, because a dictionary gloss is English throughout (the page says so
 * beside it); `nt` keeps the ids, so the page can say them in Spanish.
 */
export const NAME_TYPES = Object.freeze({
  surname: Object.freeze({ en: 'surname', es: 'apellido' }),
  given: Object.freeze({ en: 'given name', es: 'nombre de pila' }),
  masc: Object.freeze({ en: 'given name (male)', es: 'nombre de pila (masculino)' }),
  fem: Object.freeze({ en: 'given name (female)', es: 'nombre de pila (femenino)' }),
  place: Object.freeze({ en: 'place name', es: 'nombre de lugar' }),
});

/**
 * The entry a name token carries, from a names-tier record `{ r?, n, f?, s? }`
 * (data/names/, docs/ANALYZER.md): its reading, its types as glosses, the
 * part of speech `n-pr` the page calls "name", and `nt`, the type ids.
 */
export function nameEntry(rec) {
  const nt = String((rec && rec.n) || '').split(' ').filter((t) => NAME_TYPES[t]);
  const out = { g: [...new Set(nt.map((t) => NAME_TYPES[t].en))], p: 'n-pr', nt };
  if (rec && rec.r) out.r = [...rec.r];
  if (rec && rec.f) out.f = rec.f;
  if (rec && rec.s) out.s = 1;
  return out;
}
