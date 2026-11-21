// Romaji in Search: the words a romaji query spells, as typed or with the
// fewest edits, and the sentence it may be (js/search.js asks; the rules of
// what letters spell are search-latin.js's, the reading of a sentence
// search-sentence.js's, imported only the first time one is read, since it
// brings the analyzer). No DOM. docs/ANALYZER.md, "Romaji however it is
// typed" and "A sentence typed together".

import { toHira, isKanji } from './kana.js';
import {
  romajiEdits, romajiVariants, kanaForms, particleKana,
} from './search-latin.js';

/** Readings of a romaji word tried, and the most edits one may hold (search-latin.js romajiVariants). */
export const ROMAJI_READINGS = 64;
export const ROMAJI_EDITS = 3;
/** The most kana read as a sentence: each is a first pass over the whole text, every keystroke. */
export const SENTENCE_MAX = 60;

/**
 * Search's romaji half over search.js's lookups: `dict` (createDict()'s),
 * `japanese(q, extra)` (the first tier, else the rare words and names),
 * `common(keys, seen)` (the first tier only), `result(key, recs, via, extra)`
 * and `japaneseKeys(q)`.
 */
export function createRomajiSearch({
  dict, japanese, common, result, japaneseKeys,
}) {
  let sentenceModule = null;

  /**
   * How common a record is: the band of its kanji spelling where a kana key
   * has one, since a kana key's own band says how often the kana is the
   * spelling (協和 is 4 and 今日 1, though both are 3 or none under their
   * kana). needBands() loads those spellings first.
   */
  function bandOf(res, rec) {
    if (![...res.key].some(isKanji) && Array.isArray(rec.k) && rec.k[0]) {
      const kana = toHira(res.key);
      const bands = (dict.get(rec.k[0]) || []).filter((r) => !r.r || r.r.some((x) => toHira(x) === kana)).map((r) => r.q).filter(Boolean);
      if (bands.length) return Math.min(...bands);
    }
    return rec.q || 6;
  }
  const wordBand = (res) => Math.min(...res.recs.map((r) => bandOf(res, r)));
  async function needBands(results) {
    const spellings = results.filter((res) => ![...res.key].some(isKanji))
      .flatMap((res) => res.recs.map((r) => Array.isArray(r.k) && r.k[0]).filter(Boolean));
    if (spellings.length) await dict.need([...new Set(spellings)]);
  }

  /** First-tier words `kana` spells as typed, in any script; a form by its word's band (まって is 待つ before 舞う). */
  async function firstTier(kana) {
    const found = japaneseKeys(kana);
    const keys = { keys: [...new Set([...found.keys, ...kanaForms(kana)])], bases: found.bases };
    await dict.need(keys.keys);
    const out = common(keys);
    await needBands(out);
    const exact = out.filter((r) => r.via === 'exact');
    const forms = out.filter((r) => r.via === 'form').map((r, n) => ({ r, n }))
      .sort((x, y) => wordBand(x.r) - wordBand(y.r) || x.n - y.n).map((x) => x.r);
    return [...exact, ...forms];
  }

  /**
   * The first-tier words that spell a romaji word whole with the fewest
   * edits (search-latin.js romajiVariants), exact before forms, common ones
   * first; each says the kana it was read as (`romaji`). [] when no reading
   * of up to `most` edits is a word, and for a single kana, which is a kana
   * looked up and not a word mistyped.
   */
  async function variantWords(kana, most = ROMAJI_EDITS) {
    if (kana.length < 2) return [];
    const readings = romajiVariants(kana, { limit: ROMAJI_READINGS, most }).filter((v) => v.edits > 0);
    const asked = readings.map((v) => {
      const found = japaneseKeys(v.kana);
      return { ...v, keys: { keys: [...new Set([...found.keys, ...kanaForms(v.kana)])], bases: found.bases } };
    });
    await dict.need([...new Set(asked.flatMap((v) => v.keys.keys))]);
    for (let edits = 1; edits <= most; edits += 1) {
      const seen = new Set();
      const level = [];
      asked.filter((v) => v.edits === edits).forEach((v, n) => {
        for (const res of common(v.keys, seen)) level.push({ res: Object.freeze({ ...res, romaji: v.kana }), n, exact: res.via === 'exact' ? 0 : 1 });
      });
      if (!level.length) continue;
      await needBands(level.map((x) => x.res));
      level.sort((x, y) => x.exact - y.exact || wordBand(x.res) - wordBand(y.res) || x.n - y.n);
      return level.map((x) => x.res);
    }
    return [];
  }

  /**
   * A rare word spelled exactly as typed that is a word of its own: usually
   * written in kana, not a kana spelling of a common word (`e`), and no
   * spelling of the word an edit found. おじさん is not おじいさん, so ojisan
   * is おじさん first; こんにちわ is こんにちは's 今日は, がっこ and ありがと are
   * no word of their own, so an edit's word leads.
   */
  function ownWord(res, edited) {
    if (res.via !== 'rare') return false;
    const theirs = new Set(edited.flatMap((x) => [x.key, ...x.recs.flatMap((r) => r.k || [])]));
    return res.recs.some((r) => r.u && !r.e && Array.isArray(r.k) && r.k.length && !r.k.some((k) => theirs.has(k)));
  }

  /** search-sentence.js, imported the first time a sentence is read: it brings the analyzer. */
  function sentenceReader() {
    if (!sentenceModule) sentenceModule = import('./search-sentence.js').catch((e) => { sentenceModule = null; throw e; });
    return sentenceModule;
  }

  /** The parts of a romaji reading, [from, to) in its kana, each saying whether it is a particle typed on its own. */
  const partsOf = ({ kana, starts, particles }) => starts.map((a, i) => ({
    kana: kana.slice(a, i + 1 < starts.length ? starts[i + 1] : kana.length),
    particle: particles.includes(a),
  }));

  /** A particle a learner types on its own that is no English or Spanish word: the sentence is meant even where a meaning names every word. */
  const SURELY_PARTICLE = new Set(['わ', 'は', 'を', 'へ']);
  /** A particle written as said, which may end a word typed together (kyouwa). */
  const SAID = new Set(['わ', 'お', 'え']);

  /**
   * What a romaji query spells as words: `typed`, the first-tier words its
   * letters spell as typed (or, with a particle typed on its own, as written:
   * konnichi wa is こんにちは); `edited`, those of the fewest edits when none
   * does; `asTyped`, the rare words and names spelled as typed; and
   * `sentence`, set when the query may be a sentence: no word spells it, a
   * particle was typed on its own, or a said particle ends an uncommon word
   * whose stem is among the commonest (kyouwa is 今日は, though 協和 is a word).
   */
  async function romajiWords(reading) {
    const { kana, particles } = reading;
    const tag = (list, read = kana) => list.map((r) => Object.freeze({ ...r, romaji: read }));
    const parts = partsOf(reading);
    const asWritten = parts.map((p) => (p.particle ? particleKana(p.kana) : p.kana)).join('');
    if (particles.length) {
      const words = await firstTier(asWritten);
      if (words.length) return { typed: tag(words, asWritten), edited: [], asTyped: [], sentence: null };
    }
    const plain = await japanese(kana, kanaForms(kana));
    const typed = tag(plain.some((r) => r.via === 'exact' || r.via === 'form') ? await firstTier(kana) : []);
    const asTyped = tag(plain.filter((r) => r.via === 'rare' || r.via === 'name'));
    const edited = typed.length ? [] : await variantWords(kana);
    const strong = parts.some((p) => p.particle && SURELY_PARTICLE.has(particleKana(p.kana)));
    if (particles.length) return { typed, edited, asTyped, sentence: { strong } };
    if (!typed.length && !edited.length && !asTyped.length) return { typed, edited, asTyped, sentence: { strong: false } };
    if (typed.length && kana.length >= 3 && SAID.has(kana.at(-1))) {
      const stem = await firstTier(kana.slice(0, -1));
      if (stem.some((r) => r.via === 'exact' && wordBand(r) === 1) && typed.every((r) => wordBand(r) >= 4)) {
        return { typed, edited, asTyped, sentence: { strong: true, tail: true } };
      }
    }
    return { typed, edited, asTyped, sentence: null };
  }

  /**
   * A part typed on its own that no first-tier word spells as typed, as the
   * word of fewest edits that does (tokyo ni: ときょ is とうきょう), in
   * katakana where only that is a word (pen, koohii); `fixed` when changed,
   * so no edit is tried inside it.
   */
  async function partWord(kana) {
    if ((await firstTier(kana)).length) return { kana, fixed: false };
    const [w] = await variantWords(kana, 2);
    if (!w) return { kana, fixed: false };
    return { kana: w.via === 'exact' && ![...w.key].some(isKanji) ? w.key : w.romaji, fixed: true };
  }

  /**
   * The katakana words a stretch of hiragana may be (てれび is テレビ, こうひい
   * コーヒー), as edits for search-sentence.js: only where the hiragana is no
   * key, and kana for kana, so no place moves.
   */
  async function katakanaEdits(text, from = 2, to = 8) {
    const small = /^[ぁぃぅぇぉゃゅょゎっんー]/;
    const spans = [];
    for (let a = 0; a < text.length; a += 1) {
      if (small.test(text[a])) continue;
      for (let len = from; len <= to && a + len <= text.length; len += 1) {
        const hira = text.slice(a, a + len);
        if (!/^[ぁ-ゖ]+$/.test(hira) || /^[ぁぃぅぇぉゃゅょゎ]/.test(text[a + len] || '')) continue;
        spans.push({ a, len, hira, forms: kanaForms(hira).slice(1).filter((f) => f.length === len) });
      }
    }
    await dict.need([...new Set(spans.flatMap((x) => [x.hira, ...x.forms]))]);
    return spans.filter((x) => !dict.get(x.hira)).flatMap((x) => {
      const f = x.forms.find((k) => dict.get(k));
      return f ? [{ at: x.a, kind: 'kata', len: x.len, options: [f] }] : [];
    });
  }

  /** The key a sentence's token was read from: its dictionary form, where that key holds its record. */
  function sentenceKey(t) {
    if (t.entry.tier === 2) return t.base;
    return [t.base, t.surface].find((k) => (dict.get(k) || []).includes(t.entry)) || t.base;
  }

  /**
   * An inflected kana token read as an uncommon word where a common one
   * fits as well, as the common one: まって is 待って (band 2), though the
   * analyzer, knowing no more than the kana, reads 舞って (band 4).
   */
  async function commonest(t) {
    if (t.kind !== 'inflected' || !t.entry || [...t.surface].some(isKanji)) return t;
    const mine = { key: sentenceKey(t), recs: [t.entry] };
    await needBands([mine]);
    if (wordBand(mine) < 4) return t;
    const res = (await firstTier(t.surface)).find((r) => r.via === 'form');
    if (!res || res.recs.includes(t.entry) || wordBand(res) > 2) return t;
    return { ...t, entry: res.recs[0], base: res.key };
  }

  /**
   * A romaji query read as a sentence: the parts typed on their own that are
   * particles kept apart (sensei ni aimasu is never 似合います), each other
   * stretch read by the analyzer with its edits (search-sentence.js), and a
   * said particle that ends an uncommon word read as one where the stem is
   * among the commonest words (きょうわいいてんき is 今日は, not 協和). null
   * when the reading is no sentence: a guess, no particle, copula or
   * inflection, or no word.
   */
  async function readRomaji(reading, { tail = false } = {}) {
    if (reading.kana.length > SENTENCE_MAX) return null;
    let parts = partsOf(reading);
    if (tail) parts = [{ kana: reading.kana.slice(0, -1), particle: false }, { kana: reading.kana.slice(-1), particle: true }];
    if (parts.length > 1) {
      parts = await Promise.all(parts.map(async (p) => (p.particle ? p : { ...p, ...await partWord(p.kana) })));
    }
    const chunks = [];
    for (const p of parts) {
      const last = chunks.at(-1);
      if (p.particle || !last || last.particle) chunks.push(p.particle ? p : { particle: false, parts: [p] });
      else last.parts.push(p);
    }
    const { readSentence, sentenceWords, writtenToken, SENTENCE_BUDGET } = await sentenceReader();
    const budget = { left: SENTENCE_BUDGET };
    const tokens = [];
    let kana = '';
    const readChunk = async (text, fixed) => {
      const inside = (e) => fixed.some(([a, b]) => (e.kind === 'ins' ? e.at > a && e.at < b : e.at < b && e.at + (e.len || 1) > a));
      const edits = [...romajiEdits(text), ...await katakanaEdits(text)].filter((e) => !inside(e))
        .sort((x, y) => x.at - y.at);
      const read = await readSentence(text, edits, dict, { budget: Math.max(budget.left, 4) });
      budget.left -= read.tried;
      return read;
    };
    for (const c of chunks) {
      if (c.particle) {
        const surface = particleKana(c.kana);
        tokens.push({ surface, base: surface, kind: 'particle', confidence: 'rule', entry: null });
        kana += surface;
        continue;
      }
      let text = '';
      const fixed = [];
      for (const p of c.parts) {
        if (p.fixed) fixed.push([text.length, text.length + p.kana.length]);
        text += p.kana;
      }
      let read = await readChunk(text, fixed);
      // A said particle ending an uncommon word whose stem is among the commonest is a particle.
      const split = await saidParticles(read.tokens);
      if (split.length) {
        const pieces = [];
        let at = 0;
        for (const end of split) { pieces.push(read.kana.slice(at, end - 1), read.kana[end - 1]); at = end; }
        pieces.push(read.kana.slice(at));
        const all = [];
        let joined = '';
        for (const [i, piece] of pieces.entries()) {
          if (!piece) continue;
          if (i % 2) {
            const surface = particleKana(piece);
            all.push({ surface, base: surface, kind: 'particle', confidence: 'rule', entry: null });
            joined += surface;
          } else {
            const r = await readChunk(piece, [[0, piece.length]]);
            all.push(...r.tokens);
            joined += r.kana;
          }
        }
        read = { tokens: all, kana: joined };
      }
      tokens.push(...read.tokens);
      kana += read.kana;
    }
    // A loanword typed in romaji is hiragana to the analyzer (ぺん), and a
    // guess; its katakana, with the bar where a vowel is long, is the word (ペン).
    const guessed = tokens.filter((t) => t.confidence === 'guess' && /^[ぁ-ゖー]+$/.test(t.surface));
    const asKata = new Map(guessed.map((t) => [t, kanaForms(t.surface).slice(1)]));
    if (guessed.length) await dict.need([...asKata.values()].flat());
    const rescued = new Map();
    for (const [t, forms] of asKata) {
      const key = forms.find((k) => dict.get(k));
      if (key) rescued.set(t, key);
    }
    const japaneseTokens = tokens.filter((t) => !['punct', 'space', 'newline', 'latin'].includes(t.kind));
    const guesses = tokens.filter((t) => (t.confidence === 'guess' || t.kind === 'unknown') && !rescued.has(t)).length;
    const wordTokens = tokens.filter((t) => rescued.has(t) || sentenceWords([t]).length);
    const words = await Promise.all(wordTokens.map((t) => (rescued.has(t) ? t : commonest(t))));
    const swapped = new Map(wordTokens.map((t, i) => [t, words[i]]));
    const content = words.filter((t) => t.kind !== 'copula');
    const grammar = tokens.filter((t) => ['particle', 'copula', 'inflected'].includes(t.kind));
    if (guesses || japaneseTokens.length < 2 || !content.length || !grammar.length || stray(japaneseTokens)) return null;
    const seen = new Set();
    const out = [];
    for (const [t, w] of swapped) {
      const res = rescued.has(t)
        ? result(rescued.get(t), dict.get(rescued.get(t)), 'sentence', { romaji: toHira(t.surface) })
        : result(sentenceKey(w), [w.entry], 'sentence', { romaji: toHira(t.surface) });
      if (seen.has(res.key)) continue;
      seen.add(res.key);
      out.push(res);
    }
    const text = tokens.map((t) => (rescued.has(t) ? rescued.get(t) : writtenToken(swapped.get(t) || t))).join('');
    return { words: out, sentence: Object.freeze({ kana, text }) };
  }

  /**
   * Whether a one-kana noun sits straight after a noun or a prefix, with no
   * particle between: what the lattice makes of letters that are no
   * sentence (reunite is 霊|う|にて, kohi wo 小|火|を). After この, an
   * adjective or a verb it is a word (この日, 赤い火).
   */
  function stray(tokens) {
    return tokens.some((t, i) => {
      if (!i || t.surface.length !== 1 || !t.entry || !['word', 'katakana'].includes(t.kind)) return false;
      const before = tokens[i - 1];
      return ['word', 'katakana'].includes(before.kind) && /^(?:n|pref)\b/.test((before.entry && before.entry.p) || '');
    });
  }

  /** Where a said particle ends an uncommon word in `tokens` whose stem is among the commonest: the offsets just after it. */
  async function saidParticles(tokens) {
    const out = [];
    let at = 0;
    for (const t of tokens) {
      at += t.surface.length;
      const s = t.surface;
      if (!t.entry || t.kind !== 'word' || s.length < 3 || !SAID.has(s.at(-1)) || [...s].some(isKanji)) continue;
      const mine = { key: sentenceKey(t), recs: [t.entry] };
      await needBands([mine]);
      if (wordBand(mine) < 4) continue;
      const stem = await firstTier(s.slice(0, -1));
      if (stem.some((r) => r.via === 'exact' && wordBand(r) === 1)) out.push(at);
    }
    return out;
  }

  return Object.freeze({ romajiWords, readRomaji, ownWord });
}
