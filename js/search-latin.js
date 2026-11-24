// What a query in Latin letters says: its words in Spanish, and the kana
// it spells as romaji, however the learner typed it. Pure, no DOM and no
// data: js/search.js looks the words and the kana up, and the builder
// (tools/build-search.mjs) splits the Spanish glosses with the same words.
//
// Spanish: lower case, accents and diaeresis folded (canción is cancion,
// pingüino pinguino), and ñ kept, so año and ano stay two words. The index
// lists each ñ word under its plain spelling too (`n`), so nino still finds
// niño. A word may be a plural, a feminine or a verb's form (spanishForms).
//
// Romaji: spaces and hyphens mark nothing but where a word ends, macrons are
// long vowels (Tōkyō is toukyou), and m before b, m or p is ん (shimbun).
// What a learner leaves out or writes as said comes back as edits to the
// kana, each one place: a particle written as said (wa for は, o for を, e
// for へ), a long vowel left out (gakko for がっこう, okii for おおきい) or
// written another way (oo for おう, ee for えい), and for a single word a
// missing ん before an n (konichiwa) or a missing っ (choto).

import { toHiragana } from './vendor/wanakana.js';
import { toKata, beats, vowelOf } from './kana.js';

/**
 * `text` in lower case with its accents and diaeresis taken off: canción is
 * cancion. ñ stays unless `enye` is false; then it is n too, for a filter
 * that only asks whether a word is there (sets.js rowMatches).
 */
export function foldLatin(text, { enye = true } = {}) {
  let s = String(text ?? '').normalize('NFC').toLowerCase();
  if (enye) s = s.replace(/ñ/g, '\u0001');
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return enye ? s.replace(/\u0001/g, 'ñ') : s;
}

/**
 * Spanish words that say nothing a learner searches for, read from the
 * glosses themselves (de is in a tenth of them). Kept out of the index and
 * of a query, as glossWords keeps "to" and "of", except where a gloss is the
 * word alone: 何 is "qué", so que finds it (spanishWords' `alone`).
 */
export const STOP_ES = Object.freeze(new Set(`a al algo alguien como con de del e el en es etc ej la las le les lo los
  o p para por que se su sus u un una unas uno unos y`.split(/\s+/)));

/**
 * A Spanish gloss's (or a query's) words: folded, what it puts in
 * parentheses left out, stop words dropped. With `alone`, a text that is one
 * stop word alone (qué, y) keeps it.
 */
export function spanishWords(text, { alone = false } = {}) {
  const all = foldLatin(text).replace(/\([^)]*\)/g, ' ').split(/[^a-zñ]+/).filter((w) => w.length > 0);
  const words = all.filter((w) => w.length > 1 && !STOP_ES.has(w));
  if (!words.length && alone && all.length === 1) return all;
  return words;
}

/** A Spanish word spelled with n for ñ: the plain spelling the index also lists it under. */
export const plainN = (w) => String(w).replace(/ñ/g, 'n');

/**
 * Spanish words a query of several says little with: pronouns, possessives,
 * muy, and the verbs a learner puts before what they mean (tengo hambre,
 * hace calor). Unlike STOP_ES they stay in the index and in a query of one
 * word (te is té); search.js asks a query's other words without them when
 * all of its words share nothing.
 */
export const WEAK_ES = Object.freeze(new Set(`mi mis tu tus me te nos os yo muy mucho mucha muchos muchas
  tengo tienes tiene tenemos tienen hay hace estoy estas esta estamos estan soy eres somos son voy vas va`.split(/\s+/)));

/**
 * The words a folded Spanish word may be a form of: `nouns`, a plural or a
 * feminine (libros is libro, luces luz, roja rojo, pequeña pequeño), and
 * `verbs`, the infinitive a present, preterite or gerund belongs to (bebo is
 * beber, comí comer, gusta gustar, hablando hablar). Only those the index
 * lists count, so a form that is no word costs a lookup and nothing else;
 * none is shorter than three letters (mes is not me).
 */
export function spanishForms(word) {
  const w = String(word);
  const nouns = [];
  const verbs = [];
  const cut = (end) => (w.length > end.length + 1 && w.endsWith(end) ? w.slice(0, -end.length) : null);
  const add = (list, stem, ...ends) => { if (stem) for (const e of ends) list.push(stem + e); };
  add(nouns, cut('ces'), 'z');
  add(nouns, cut('es'), '');
  add(nouns, cut('s'), '');
  add(nouns, cut('as'), 'o', 'a');
  add(nouns, cut('os'), 'o');
  add(nouns, cut('a'), 'o');
  add(verbs, cut('a'), 'ar');
  add(verbs, cut('o'), 'ar', 'er', 'ir');
  add(verbs, cut('e'), 'ar', 'er', 'ir');
  add(verbs, cut('i'), 'er', 'ir');
  for (const [end, to] of [['amos', ['ar']], ['emos', ['er']], ['imos', ['ir']], ['aba', ['ar']], ['ando', ['ar']], ['iendo', ['er', 'ir']], ['ado', ['ar']], ['ido', ['er', 'ir']]]) {
    add(verbs, cut(end), ...to);
  }
  const keep = (list) => [...new Set(list)].filter((x) => x !== w && x.length >= 3);
  return { nouns: keep(nouns), verbs: keep(verbs).filter((x) => !nouns.includes(x)) };
}

// ── Romaji ────────────────────────────────────────────────────────────────

const MACRON = Object.freeze({
  ā: 'aa', ī: 'ii', ū: 'uu', ē: 'ee', ō: 'ou', â: 'aa', î: 'ii', û: 'uu', ê: 'ee', ô: 'ou',
});

/**
 * The letters romaji uses: Hepburn's (and kunrei's si, ti, tu, hu), never l,
 * q or x, and c only in ch or cch (the IME's kocchi for こっち). wanakana
 * reads la as ぁ and ca as か, which made Spanish caliente romaji; it is not.
 */
const ROMAJI = /^(?:cch|ch|[abdefghijkmnoprstuvwyz'-])+$/;
const KANA = /^[ぁ-ゖー]+$/;

/**
 * A part typed on its own that is a particle (kyou wa, watashi no, sensei
 * ni). The first part never is: o namae is お名前.
 */
const PARTICLE_PART = /^(?:wa|ha|wo|o|e|he|ni|to|de|ga|mo|no|ka|ya|ne|yo|kara|made|yori)$/;

/** One space-free part of a romaji query, ready for wanakana. */
function letters(part) {
  // A part that ends in nn ends in one ん, as an IME writes it: wanakana's
  // こんん for konn read as 紺ん while a learner typed konnichiwa.
  return part.replace(/[āīūēōâîûêô]/g, (c) => MACRON[c]).replace(/m(?=[bmp])/g, 'n').replace(/(?<=[aeiou])nn$/, 'n');
}

/**
 * The kana a romaji query spells, each space-separated part read on its own
 * (kan i is かんい, kani かに) and joined, with where each part starts; null
 * when the query is not romaji. A hyphen between letters is a space, as a
 * textbook writes konnichi-wa and o-cha; one that ends a part is the long
 * vowel's bar (ohayo-). `particles` are the parts' offsets in the kana where
 * a later part is a particle typed on its own (kyou wa, watashi no).
 *
 * @returns {{ kana: string, starts: number[], particles: number[] } | null}
 */
export function romajiReading(q) {
  const parts = String(q ?? '').normalize('NFC').toLowerCase().trim().split(/[\s.,!?;:]+/)
    .flatMap((p) => p.split(/(?<=[a-zāīūēōâîûêô'])-(?=[a-zāīūēōâîûêô])/))
    .filter(Boolean);
  if (!parts.length) return null;
  let kana = '';
  const starts = [];
  const particles = [];
  for (const [i, raw] of parts.entries()) {
    const s = letters(raw);
    if (!ROMAJI.test(s)) return null;
    const k = toHiragana(s);
    if (!KANA.test(k)) return null;
    starts.push(kana.length);
    if (i > 0 && PARTICLE_PART.test(s)) particles.push(kana.length);
    kana += k;
  }
  return { kana, starts, particles };
}

/**
 * A query whose last letters are a syllable still being typed (kyouw,
 * konnich, tabem): the romaji reading of what comes before them, and the
 * letters held back. Only consonants are held, at most three (tch), and only
 * where what is left reads as romaji; null for a query that is romaji
 * already, and for one that would be nothing once held (ky). search.js reads
 * it only where no meaning names every word, so dog and tab stay English.
 *
 * @returns {{ reading: { kana: string, starts: number[], particles: number[] }, held: string } | null}
 */
export function heldRomaji(q) {
  const s = String(q ?? '').normalize('NFC').toLowerCase().trimEnd();
  if (!s || romajiReading(s)) return null;
  for (let cut = 1; cut <= 3 && cut < s.length; cut += 1) {
    const held = s.slice(-cut);
    if (!/^[bcdfghjkmprstvwyz]+$/.test(held)) break;
    const head = s.slice(0, -cut).replace(/[\s-]+$/, '');
    const reading = head ? romajiReading(head) : null;
    if (reading) return { reading, held };
  }
  return null;
}

/**
 * The words of `text` as the learner typed them, accents and capitals kept,
 * each beside the folded word a lookup uses: `[{ shown, folded }]`. A word
 * ends where `fold` leaves a character that is no `letter`, and what the
 * text puts in parentheses is left out, as spanishWords and glossWords do,
 * so a page can say "Spanish: días" of the dias it looked up.
 */
export function typedWords(text, { fold = (ch) => foldLatin(ch), letter = /^[a-zñ]+$/ } = {}) {
  const out = [];
  let shown = '';
  let folded = '';
  const end = () => { if (shown) out.push({ shown, folded }); shown = ''; folded = ''; };
  for (const ch of String(text ?? '').normalize('NFC').replace(/\([^)]*\)/g, ' ')) {
    const f = fold(ch);
    if (f && letter.test(f)) { shown += ch; folded += f; } else end();
  }
  end();
  return out;
}

/** spanishWords(text) as typed: the same words, in the same order, accents and capitals kept. */
export function spanishWordsTyped(text, { alone = false } = {}) {
  const all = typedWords(text);
  const words = all.filter((w) => w.folded.length > 1 && !STOP_ES.has(w.folded));
  if (!words.length && alone && all.length === 1) return all.map((w) => w.shown);
  return words.map((w) => w.shown);
}

/** A particle typed on its own as it is written: wa is は, o を, e へ; the rest as typed. */
export function particleKana(kana) {
  return PARTICLE[kana] || kana;
}

/** The kana a romaji query spells, spaces left out; '' when it is not romaji. */
export function romajiKana(q) {
  const r = romajiReading(q);
  return r ? r.kana : '';
}

/**
 * Romaji with what learners write differently taken out, for a filter that
 * compares one romaji with another (the reader's said line of an idiom):
 * accents and macrons, everything not a letter, m before b or p (sempai),
 * nn, a long vowel (gakkoo, gakkou and gakko are gako) and を's w.
 */
export function looseRomaji(text) {
  return foldLatin(text, { enye: false }).replace(/[^a-z]/g, '')
    .replace(/m(?=[bp])/g, 'n')
    .replace(/ou/g, 'o').replace(/ei/g, 'e')
    .replace(/([aeiou])\1+/g, '$1')
    .replace(/nn/g, 'n')
    .replace(/wo/g, 'o');
}

/**
 * The long vowels a beat ending in each vowel takes, the usual one first:
 * がっこう, おかあさん, せんせい, and おおきい, おねえさん.
 */
const LONG = Object.freeze({
  a: ['あ'], i: ['い'], u: ['う'], e: ['い', 'え'], o: ['う', 'お'],
});
/** A particle written as said: wa is は, o is を, e is へ. */
const PARTICLE = Object.freeze({ わ: 'は', お: 'を', え: 'へ' });
const NA_ROW = new Set([...'なにぬねの']);
/** The beats a small っ may be missing before: the k, s, t and p rows (choto, kipu, zuto). */
const TSU_ROW = new Set([...'かきくけこさしすせそたちつてとぱぴぷぺぽ']);

/**
 * The places a romaji reading may be wrong, each with what could stand
 * there instead, left to right: `{ at, ins }` puts a kana before index
 * `at`, `{ at, sub }` replaces the kana at `at`. A place offers each of its
 * `options` alone. `words` adds a missing ん before an n row kana and a
 * missing っ before a k, s, t or p beat, which only a single word asks for
 * (konichiwa, choto); in a sentence they would offer かんな for every かな.
 *
 * @returns {{ at: number, kind: 'ins'|'sub', options: string[] }[]}
 */
export function romajiEdits(kana, { words = false } = {}) {
  const s = String(kana || '');
  const out = [];
  const subs = new Map();
  const sub = (at, ch) => {
    if (!subs.has(at)) { subs.set(at, []); out.push({ at, kind: 'sub', options: subs.get(at) }); }
    if (!subs.get(at).includes(ch)) subs.get(at).push(ch);
  };
  let at = 0;
  for (const b of beats(s)) {
    const end = at + b.length;
    const v = vowelOf(b);
    const next = s[end];
    // A particle written as said, anywhere but at the start.
    if (at > 0 && b.length === 1 && PARTICLE[b]) sub(at, PARTICLE[b]);
    if (v && next !== 'ー') {
      const long = LONG[v];
      if (next === long[0]) {
        // already long
      } else if ((v === 'o' && next === 'お') || (v === 'e' && next === 'え')) {
        // oo for おう, ee for えい
        sub(end, long[0]);
      } else if (b !== 'ゃ' && b !== 'ゅ' && b !== 'ょ') {
        out.push({ at: end, kind: 'ins', options: [...long] });
      }
    }
    const before = s[at - 1];
    if (words && at > 0 && NA_ROW.has(b[0]) && before !== 'ん' && before !== 'っ') {
      out.push({ at, kind: 'ins', options: ['ん'] });
    }
    if (words && at > 0 && TSU_ROW.has(b[0]) && !'んっー'.includes(before)) {
      out.push({ at, kind: 'ins', options: ['っ'] });
    }
    at = end;
  }
  // Inserting and replacing at one index are separate places; order by index, insertions first.
  return out.sort((a, b) => a.at - b.at || (a.kind === 'ins' ? -1 : 1) - (b.kind === 'ins' ? -1 : 1));
}

/**
 * `kana` with `choice` applied: a Map from a place in `edits` (its index) to
 * the option chosen there.
 */
export function applyEdits(kana, edits, choice) {
  const ins = new Map();
  const sub = new Map();
  // Two kana put in at one index go in the order of their places (ちょ, う, っ, と).
  for (const [i, opt] of [...choice].sort((a, b) => a[0] - b[0])) {
    const e = edits[i];
    if (e.kind === 'ins') ins.set(e.at, (ins.get(e.at) || '') + e.options[opt]);
    // A katakana word in place of the hiragana the romaji spells, kana for kana (search-sentence.js).
    else if (e.kind === 'kata') [...e.options[opt]].forEach((ch, k) => sub.set(e.at + k, ch));
    else sub.set(e.at, e.options[opt]);
  }
  let out = '';
  const s = String(kana);
  for (let i = 0; i <= s.length; i += 1) {
    if (ins.has(i)) out += ins.get(i);
    if (i < s.length) out += sub.has(i) ? sub.get(i) : s[i];
  }
  return out;
}

/**
 * The readings of a romaji word, fewest edits first, at most `limit` and at
 * most `most` edits each: `[{ kana, edits }]`, the reading as typed first.
 * gakko gives がっこ, then がっこう among the readings of one edit.
 */
export function romajiVariants(kana, { limit = 64, most = 3, words = true } = {}) {
  const edits = romajiEdits(kana, { words });
  const out = [{ kana, edits: 0 }];
  const seen = new Set([kana]);
  // A missing っ counts two: ときょ is とうきょう (two long vowels) before とっきょ.
  const weight = (choice) => [...choice].reduce((n, [i]) => n + (edits[i].options[0] === 'っ' ? 2 : 1), 0);
  // Every set of `k` places, left to right, each with each of its options.
  const pick = (k, from, choice) => {
    if (out.length >= limit) return;
    if (choice.size === k) {
      const text = applyEdits(kana, edits, choice);
      const n = weight(choice);
      if (n <= most && !seen.has(text)) { seen.add(text); out.push({ kana: text, edits: n }); }
      return;
    }
    for (let i = from; i < edits.length && out.length < limit; i += 1) {
      for (let o = 0; o < edits[i].options.length; o += 1) {
        choice.set(i, o);
        pick(k, i + 1, choice);
        choice.delete(i);
      }
    }
  };
  for (let k = 1; k <= most && out.length < limit; k += 1) pick(k, 0, new Map());
  return out.map((v, n) => ({ v, n })).sort((a, b) => a.v.edits - b.v.edits || a.n - b.n).map((x) => x.v);
}

let lastKanas = { q: null, list: [] };

/**
 * The kana a romaji filter looks for: what the query spells, then its
 * readings of one or two edits (a particle as said, a long vowel left out),
 * at most `limit`; [] when it is not romaji. The last query's list is kept,
 * since a filter asks once per row.
 */
export function romajiKanas(q, { limit = 24, most = 2 } = {}) {
  if (lastKanas.q === q) return lastKanas.list;
  const kana = romajiKana(q);
  const list = kana ? romajiVariants(kana, { limit, most }).map((v) => v.kana) : [];
  lastKanas = { q, list };
  return list;
}

/**
 * Katakana with its long vowels written as the bar: コオヒイ is コーヒー,
 * コンピュウタア コンピューター. A vowel that repeats the beat before it, and う
 * after an o beat, become ー; エイ stays (ケイキ is not ケーキ).
 */
export function withBar(kata) {
  const bs = beats(String(kata || ''));
  for (let i = 1; i < bs.length; i += 1) {
    const v = vowelOf(bs[i - 1]);
    const b = bs[i];
    const same = { a: 'ア', i: 'イ', u: 'ウ', e: 'エ', o: 'オ' }[v];
    if (v && (b === same || (v === 'o' && b === 'ウ'))) bs[i] = 'ー';
  }
  return bs.join('');
}

/** The kana a romaji reading is looked up as besides itself: katakana, and katakana with the bar. */
export function kanaForms(hira) {
  const kata = toKata(hira);
  return [...new Set([hira, kata, withBar(kata)])];
}
