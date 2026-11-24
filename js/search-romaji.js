// Romaji in Search: the words a romaji query spells, as typed or with the
// fewest edits, and the sentence it may be (js/search.js asks; the rules of
// what letters spell are search-latin.js's, the reading of a sentence
// search-sentence.js's, imported only the first time one is read, since it
// brings the analyzer). No DOM. docs/ANALYZER.md, "Romaji however it is
// typed", "A sentence typed together" and "Only a sentence to trust".
//
// A sentence is offered only where its reading is one to trust
// (search-grammar.js trusted): a wrong one teaches wrong Japanese, and its
// Read the sentence button sends it to the reader. Where none is, the words
// the reading found are listed, and no sentence. The sure names
// (search-names.js) are read as names, and a said e before a verb of going or
// coming as へ.

import { toHira, isKanji } from './kana.js';
import {
  romajiEdits, romajiVariants, kanaForms, particleKana,
} from './search-latin.js';
import { createNames, cutsName, HONORIFICS } from './search-names.js';
import { createGrammar, stray } from './search-grammar.js';

/** Readings of a romaji word tried, and the most edits one may hold (search-latin.js romajiVariants). */
export const ROMAJI_READINGS = 64;
export const ROMAJI_EDITS = 3;
/** The most kana read as a sentence: each is a first pass over the whole text, every keystroke. */
export const SENTENCE_MAX = 60;

/**
 * Search's romaji half over search.js's lookups: `dict` (createDict()'s),
 * `japanese(q, extra)` (the first tier, else the rare words and names),
 * `common(keys, seen)` (the first tier only), `result(key, recs, via, extra)`,
 * `japaneseKeys(q)` and `loadNames()`, which gives data/search/names.json
 * (the sure names by reading; tools/build-name-readings.mjs).
 */
export function createRomajiSearch({
  dict, japanese, common, result, japaneseKeys, loadNames = async () => null,
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
  /**
   * How common a word is as it is written: its kana key's own band where
   * the dictionary says it is usually written in kana (もらう, まっすぐ: their
   * kanji 貰う and 真っ直ぐ are band 4), else as wordBand.
   */
  const usualBand = (res) => Math.min(...res.recs.map((r) => (r.u && ![...res.key].some(isKanji) && r.q ? r.q : bandOf(res, r))));
  async function needBands(results) {
    const spellings = results.filter((res) => ![...res.key].some(isKanji))
      .flatMap((res) => res.recs.map((r) => Array.isArray(r.k) && r.k[0]).filter(Boolean));
    if (spellings.length) await dict.need([...new Set(spellings)]);
  }
  const {
    nameIndex, nameAt, nameResults, withNames, splitNames, partNames,
  } = createNames({
    dict, result, loadNames, spells: async (kana) => (await firstTier(kana)).length > 0,
  });
  const {
    motionParticles, goingAfterParticles, finishClauses, trusted,
  } = createGrammar({
    firstTier, sentenceKey, needBands, usualBand,
  });

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
  /** Pronouns a said わ after is the topic of, not part of a word (かれは is also 枯葉). */
  const TOPIC_PRONOUNS = ['かのじょ', 'かれ'];

  /**
   * What a romaji query spells as words: `typed`, the first-tier words its
   * letters spell as typed (or, with a particle typed on its own, as written:
   * konnichi wa is こんにちは); `edited`, those of the fewest edits when none
   * does; `asTyped`, the rare words and names spelled as typed; and
   * `names`, the sure names it spells, alone or with an honorific or the
   * copula after them (tanaka is 田中, never 棚 and か), listed after the
   * typed words where a word spells it too (satou is 砂糖, then 佐藤:
   * `namesAfter`); and `sentence`, set when the query may be a sentence: no
   * word spells it, a particle was typed on its own, a name has an honorific
   * or the copula after it, or a said particle ends an uncommon word whose
   * stem is among the commonest (kyouwa is 今日は, though 協和 is a word). A
   * name alone is no sentence.
   */
  async function romajiWords(reading) {
    const { kana, particles } = reading;
    const tag = (list, read = kana) => list.map((r) => Object.freeze({ ...r, romaji: read }));
    const parts = partsOf(reading);
    const asWritten = parts.map((p) => (p.particle ? particleKana(p.kana) : p.kana)).join('');
    if (particles.length) {
      const words = await firstTier(asWritten);
      if (words.length) {
        return {
          typed: tag(words, asWritten), edited: [], asTyped: [], names: [], namesAfter: false, sentence: null,
        };
      }
    }
    const plain = await japanese(kana, kanaForms(kana));
    const typed = tag(plain.some((r) => r.via === 'exact' || r.via === 'form') ? await firstTier(kana) : []);
    const asTyped = tag(plain.filter((r) => r.via === 'rare' || r.via === 'name'));
    const named = particles.length ? null : await nameAt(kana);
    // A name a typed word already writes the same way is that word (林).
    const spelled = new Set(typed.flatMap((r) => [r.key, ...r.recs.flatMap((x) => x.k || [])]));
    const names = named ? (await nameResults(named)).filter((r) => !spelled.has(r.key)) : [];
    const edited = typed.length ? [] : await variantWords(kana);
    const strong = parts.some((p) => p.particle && SURELY_PARTICLE.has(particleKana(p.kana)));
    const out = {
      typed, edited, asTyped, names, namesAfter: typed.length > 0,
    };
    if (particles.length) return { ...out, sentence: { strong } };
    // A name of several spellings (いとう: 伊東, 伊藤) cannot be written in a sentence: its spellings are the answer.
    if (names.length && !typed.length) return { ...out, sentence: named.rest && named.spellings.length === 1 ? { strong: false } : null };
    if (!typed.length && !edited.length && !asTyped.length) return { ...out, sentence: { strong: false } };
    if (typed.length && kana.length >= 3 && SAID.has(kana.at(-1))) {
      const stem = await firstTier(kana.slice(0, -1));
      if (stem.some((r) => r.via === 'exact' && wordBand(r) === 1) && typed.every((r) => wordBand(r) >= 4)) {
        return { ...out, sentence: { strong: true, tail: true } };
      }
    }
    return { ...out, sentence: null };
  }

  /**
   * A part typed on its own that no first-tier word spells as typed, as the
   * word of fewest edits that does (tokyo ni: ときょ is とうきょう), in
   * katakana where only that is a word (pen, koohii); `fixed` when changed,
   * so no edit is tried inside it. A sure name's reading stays as typed,
   * fixed, unless the edit only writes a particle said as it is written
   * (dewa is では, though でわ is the name 出羽).
   */
  async function partWord(kana) {
    if ((await firstTier(kana)).length) return { kana, fixed: false };
    const [w] = await variantWords(kana, 2);
    // A sure name is no word mistyped: itou is never 一等 (withNames writes it where it can).
    if ((await nameIndex()).by[kana] && !(w && saidOnly(kana, w.romaji))) return { kana, fixed: true };
    if (!w) return { kana, fixed: false };
    return { kana: w.via === 'exact' && ![...w.key].some(isKanji) ? w.key : w.romaji, fixed: true };
  }

  /** Whether `b` is `a` with only particles said as written: わ for は, お for を, え for へ (でわ, では). */
  const saidOnly = (a, b) => a.length === b.length && [...a].every((ch, i) => ch === b[i] || particleKana(ch) === b[i]);

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

  /** A particle the search reads by its own rule, not the analyzer: typed on its own, or said at the end of a word. */
  const ruleParticle = (kana) => {
    const surface = particleKana(kana);
    return {
      surface, base: surface, kind: 'particle', confidence: 'rule', entry: null, rule: true,
    };
  };

  /**
   * A romaji query read as a sentence: the parts typed on their own that are
   * particles kept apart (sensei ni aimasu is never 似合います), a said e
   * before a verb of going or coming made one (motionParticles), each other
   * stretch read by the analyzer with its edits (search-sentence.js) and its
   * sure names with an honorific written as names (withNames), and a said
   * particle that ends an uncommon word read as one where the stem is among
   * the commonest (きょうわいいてんき is 今日は, not 協和). Where that reading is
   * no sentence to trust, or cuts into a sure name with no honorific, it is
   * read again with those names written too (tanaka desu is 田中です, not
   * 棚かです).
   *
   * `{ words, sentence }` where the reading is one to offer (trusted);
   * `{ words, sentence: null }` where it read the whole query with no guess
   * but is not one to trust, its words for Search to list (a wrong sentence
   * is worse than none; the words it read are still what the letters spell);
   * null where it is no reading.
   */
  async function readRomaji(reading, { tail = false } = {}) {
    if (reading.kana.length > SENTENCE_MAX) return null;
    const reader = await sentenceReader();
    const analyzeText = (text) => reader.analyzeText(text, dict);
    const firstToken = async (text) => (await analyzeText(text)).tokens[0];
    let parts = partsOf(reading);
    if (tail) parts = [{ kana: reading.kana.slice(0, -1), particle: false }, { kana: reading.kana.slice(-1), particle: true }];
    parts = await motionParticles(parts, firstToken);
    if (parts.length > 1) {
      parts = await Promise.all(parts.map(async (p) => (p.particle ? p : { ...p, ...await partWord(p.kana) })));
    }
    const chunks = [];
    for (const p of parts) {
      const last = chunks.at(-1);
      if (p.particle || !last || last.particle) chunks.push(p.particle ? p : { particle: false, parts: [p] });
      else last.parts.push(p);
    }
    const first = await readChunks(chunks, { reader, analyzeText, plain: false });
    let read = first.read;
    if (first.left && !(read && read.sentence && !first.cut)) {
      const again = await readChunks(chunks, { reader, analyzeText, plain: true });
      read = again.read && again.read.sentence ? again.read : read || again.read;
    }
    if (read) return read;
    // No reading at all: the sure names typed as parts are what to list
    // (watashi wa abe desu: 安倍, 安部 and 阿部), not English that names one word.
    const words = await partNames(parts.filter((p) => !p.particle).map((p) => p.kana));
    return words.length ? { words, sentence: null } : null;
  }

  /**
   * The chunks of readRomaji read by the analyzer, `plain` saying whether a
   * sure name with no honorific is written as the name (withNames): `{ read,
   * left, cut }`, `read` as readRomaji gives it, `left` whether such a name
   * was left out, `cut` whether the reading cuts into one (cutsName).
   */
  async function readChunks(chunks, { reader, analyzeText, plain }) {
    const { readSentence, katakanaEdits, SENTENCE_BUDGET } = reader;
    const budget = { left: SENTENCE_BUDGET };
    const tokens = [];
    let left = false;
    let cut = false;
    // Whether a kana was put in after the last letter typed: the learner may be typing that word still.
    let putInLast = false;
    const readChunk = async (text, fixed) => {
      const inside = (e) => fixed.some(([a, b]) => (e.kind === 'ins' ? e.at > a && e.at < b : e.at < b && e.at + (e.len || 1) > a));
      const edits = [...romajiEdits(text), ...await katakanaEdits(text, dict)].filter((e) => !inside(e))
        .sort((x, y) => x.at - y.at);
      const read = await readSentence(text, edits, dict, { budget: Math.max(budget.left, 4) });
      budget.left -= read.tried;
      return { ...read, putIn: read.edits.some((e) => e.kind === 'ins' && e.at === text.length) };
    };
    for (const [n, c] of chunks.entries()) {
      if (c.particle) {
        tokens.push(ruleParticle(c.kana));
        continue;
      }
      let text = '';
      const fixed = [];
      const starts = new Set();
      for (const p of c.parts) {
        starts.add(text.length);
        if (p.fixed) fixed.push([text.length, text.length + p.kana.length]);
        text += p.kana;
      }
      const named = await withNames(text, fixed, starts, { plain });
      left ||= named.left.length > 0;
      let read = await readChunk(named.text, named.fixed);
      // A name the analyzer did not read as that name is read again as kana.
      if (named.names.length && !named.names.every((m) => read.tokens.some((t) => t.kind === 'name' && t.surface === m.spelling))) {
        read = await readChunk(text, fixed);
      }
      // かれわ opening a stretch is 彼は, never 枯葉 or 刈れ and a word
      // (karewagakuseidesu read 枯葉学生です, karewaishi 刈れ廃止): the rest is
      // read on its own, and kept where it reads with no guess and no stray
      // kana, or where the whole read かれは as one word. Alone it can miss
      // what the whole reads (いもおとお, with no かれは before it, stays いも
      // お とお), so the whole is kept otherwise.
      const lead = TOPIC_PRONOUNS.find((x) => text.startsWith(`${x}わ`) && text.length > x.length + 1);
      if (lead) {
        const from = lead.length + 1;
        const rest = await readChunk(text.slice(from), fixed.map(([a, b]) => [Math.max(0, a - from), b - from]).filter(([, b]) => b > 0));
        const clean = !rest.tokens.some((t) => t.confidence === 'guess' || t.kind === 'unknown') && !stray(rest.tokens);
        if (clean || (read.tokens[0] && read.tokens[0].surface === `${lead}は`)) {
          read = { tokens: [(await analyzeText(lead)).tokens[0], ruleParticle('わ'), ...rest.tokens], kana: `${lead}は${rest.kana}`, putIn: rest.putIn };
        }
      }
      // A said particle ending an uncommon word whose stem is among the commonest is a particle.
      const split = await saidParticles(read.tokens);
      if (split.length) {
        const pieces = [];
        let at = 0;
        for (const end of split) { pieces.push(read.kana.slice(at, end - 1), read.kana[end - 1]); at = end; }
        pieces.push(read.kana.slice(at));
        const all = [];
        let putIn = false;
        for (const [i, piece] of pieces.entries()) {
          if (!piece) continue;
          if (i % 2) {
            all.push(ruleParticle(piece));
            putIn = false;
          } else {
            const r = await readChunk(piece, [[0, piece.length]]);
            all.push(...r.tokens);
            ({ putIn } = r);
          }
        }
        // A kana put in at the end of the whole stretch is at the end of its last piece.
        read = { tokens: all, putIn: read.putIn || putIn };
      }
      if (n === chunks.length - 1) putInLast = read.putIn;
      cut ||= named.left.length > 0 && cutsName(read.tokens, named.left);
      tokens.push(...read.tokens);
    }
    return { read: await judged(tokens, { putInLast, reader, analyzeText }), left, cut };
  }

  /**
   * A sentence's tokens as readRomaji gives them: the verbs of going after
   * へ and the clauses finished (search-grammar.js), each loanword typed in
   * romaji as its katakana word, then judged (trusted, and no sure name read
   * as two words: splitNames).
   */
  async function judged(tokens, { putInLast, reader, analyzeText }) {
    const { sentenceWords, writtenToken } = reader;
    await goingAfterParticles(tokens);
    const finished = await finishClauses(tokens, analyzeText);
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
    const isName = (t) => t.kind === 'name' && t.entry && dict.name(t.surface);
    const wordTokens = tokens.filter((t) => rescued.has(t) || isName(t) || sentenceWords([t]).length);
    const words = await Promise.all(wordTokens.map((t) => (rescued.has(t) || isName(t) ? t : commonest(t))));
    const swapped = new Map(wordTokens.map((t, i) => [t, words[i]]));
    const content = words.filter((t) => t.kind !== 'copula');
    // A name, or a noun, with an honorific is a phrase of its own (田中さん; 林さん for hayashi san).
    const honored = japaneseTokens.some((t, i) => (t.kind === 'name' || (t.kind === 'word' && /^n\b/.test((t.entry && t.entry.p) || '')))
      && japaneseTokens[i + 1] && HONORIFICS.includes(japaneseTokens[i + 1].surface));
    // Grammar: a particle, the copula, an inflection or a set expression that is no noun (水ください; 草 is no grammar).
    const exp = (t) => t.kind === 'word' && ((p) => p.includes('exp') && !p.includes('n'))(String((t.entry && t.entry.p) || '').split(/\s+/));
    const grammar = tokens.filter((t) => ['particle', 'copula', 'inflected'].includes(t.kind) || exp(t));
    if (guesses || japaneseTokens.length < 2 || !content.length || (!grammar.length && !honored) || stray(japaneseTokens)) return null;
    // The reading as it would be offered: the commoner verb, and each rescued loanword as its katakana word.
    const final = japaneseTokens.map((t) => (rescued.has(t)
      ? {
        ...t, surface: rescued.get(t), base: rescued.get(t), kind: 'katakana', confidence: 'dict', entry: dict.get(rescued.get(t))[0],
      }
      : swapped.get(t) || t));
    const split = await splitNames(final);
    const offered = finished && !split.length && await trusted(final, { putInLast, analyzeText });
    const seen = new Set();
    const out = [];
    const add = (res) => {
      if (seen.has(res.key)) return;
      seen.add(res.key);
      out.push(res);
    };
    for (const [t, w] of swapped) {
      // A name a reading split into words is listed as its spellings, where its first word stood.
      const at = japaneseTokens.indexOf(t);
      const name = split.find((m) => m.from === at);
      if (name) {
        (await nameResults(name)).forEach(add);
        continue;
      }
      if (split.some((m) => at > m.from && at < m.to)) continue;
      const romaji = toHira(isName(t) ? t.reading : t.surface);
      // A word of a reading not offered is a word the letters spell, no word of a sentence.
      const via = offered ? 'sentence' : (t.kind === 'inflected' ? 'form' : 'exact');
      if (rescued.has(t)) add(result(rescued.get(t), dict.get(rescued.get(t)), via, { romaji }));
      else if (isName(t)) add(result(t.surface, [dict.name(t.surface)], 'name', { romaji }));
      else add(result(sentenceKey(w), [w.entry], via, { romaji }));
    }
    if (!offered) return { words: out, sentence: null };
    const kana = tokens.map((t) => (t.kind === 'name' ? toHira(t.reading) : t.surface)).join('');
    const text = tokens.map((t) => (rescued.has(t) ? rescued.get(t) : writtenToken(swapped.get(t) || t))).join('');
    return { words: out, sentence: Object.freeze({ kana, text }) };
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
