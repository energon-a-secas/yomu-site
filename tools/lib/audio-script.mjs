// What Yomu records, read from the site's own text: the sound notes, every
// beat Sound it out can play, the phrase library, and the grammar and
// loanword notes' examples; then every word of that text, the dictionary's
// most common words, the readings and words of the kanji pages, and the
// words of the example sentences that have no clip, most frequent first. A
// new example or phrase is in the next run's script with nothing to list here.
//
// Each line says what to send (`tts`) and what it must sound like (`said`,
// the said romaji, or `kana` for a lone beat).
// Order is priority: when a budget runs out, the sounds are already made.

import fs from 'node:fs';
import path from 'node:path';
import { SOUND_NOTES } from '../../js/notes-sounds.js';
import { GRAMMAR_NOTES } from '../../js/notes-grammar.js';
import { LOAN_NOTES } from '../../js/notes-loan.js';
import { GENKI_MAP, SAID_AS, toKata, toHira, hasKanji, beats, readingKana, readingRomaji } from '../../js/kana.js';
import { audioKey, wordKey, clipId, keysOf } from '../../js/audio.js';
import { analyze } from '../../js/analyze.js';
import { loadJlpt } from '../../js/levels.js';
import { deinflect, posMatches } from '../../js/deinflect.js';

export const KINDS = Object.freeze(['sound', 'kana', 'phrase', 'note', 'word', 'common', 'reading', 'kanji', 'corpus']);

// What build-audio.mjs makes when no --kinds is given: every kind but the
// corpus, whose thousands of words a run takes only when asked
// (--kinds=corpus), so a budget meant for the site's own text never runs on
// into them. Its --listen still lists every kind's failed takes.
export const DEFAULT_KINDS = Object.freeze(KINDS.filter((k) => k !== 'corpus'));

// The kinds whose line is one word or one reading: sent as its `tts`, never
// analyzed again (build-audio.mjs sendText), and checked as its own reading
// (audio-check.mjs expected).
export const WORD_KINDS = Object.freeze(new Set(['word', 'common', 'reading', 'kanji', 'corpus']));

// The words of the example sentences are recorded in Clear alone, as common
// bands 2 and 3 and the kanji pages are: every voice borrows Clear's clip
// (js/audio.js wordSequence), and the reader's word by word plays one voice
// for the whole passage anyway.
export const CORPUS_VOICES = Object.freeze(['clear']);

// The kanji pages' readings and words are recorded in Clear alone, as common
// bands 2 and 3 are: another voice borrows Clear's clip (js/audio.js
// clipByKeys), and a page holds thousands of words a fourth voice would cost.
export const KANJI_PAGE_VOICES = Object.freeze(['clear']);

// The kanji whose readings were recorded first (Naninani 1.2.0), by JLPT
// study level: the on and kun readings a kanji page says (KANJIDIC, as
// js/kana.js readingKana gives them), each filed under its kana, which is
// the key the page plays. Clear alone records them; any other voice borrows
// its clip (js/audio.js clipByKeys).
export const READING_LEVELS = Object.freeze(['n5', 'n4', 'n3']);
const READING_VOICES = Object.freeze(['clear']);

// Which voices record the common words of each frequency band (q, 1 the most
// frequent): band 1 in every voice, bands 2 and 3 in Clear alone, whose clip any
// other voice borrows (js/audio.js clipByKeys). Coverage, size and account
// costs are recorded in docs/AUDIO.md and docs/AUDIO-BAND3.md.
export const COMMON_BANDS = Object.freeze({ 1: null, 2: Object.freeze(['clear']), 3: Object.freeze(['clear']) });

// Every beat the reader can sound out: the plain kana, the voiced ones, the
// small-ya, yu and yo beats, and the loanword digraphs of GENKI_MAP. A beat
// said as another (js/kana.js SAID_AS) has no clip of its own and plays that
// beat's: を is said お, ぢ and づ じ and ず, ぢゃ ぢゅ ぢょ ぢぇ じゃ じゅ じょ
// じぇ, and ゐ and ゑ, dropped from modern spelling but still met in names and
// old texts, い and え. Recording them would pay for a sound Yomu already has.
const PLAIN = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん'];
const VOICED = [...'がぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽ'];
const YOUON = ['き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'び', 'ぴ'].flatMap((k) => ['ゃ', 'ゅ', 'ょ'].map((s) => k + s));

/** Every beat with its own clip, as the reader splits it (hiragana). */
export function beatInventory() {
  return [...PLAIN, ...VOICED, ...YOUON, ...Object.keys(GENKI_MAP)];
}

/** The beats that are said as another and so play its clip (the index's aliases, audio-index.mjs). */
export function beatAliases() {
  return { ...SAID_AS };
}

/**
 * A line is filed under its text and, when it has one, its kana reading, so
 * the reader's Say it on 今日 (said as きょう) plays the recording of 今日.
 */
function line(kind, fields) {
  const key = audioKey(fields.ja);
  const keys = [...new Set([key, fields.kana ? audioKey(fields.kana) : key])];
  return { kind, key, keys, id: clipId(key), ...fields };
}

/**
 * A lone beat is sent in katakana: in hiragana a voice may read は as the
 * particle wa or へ as e, and katakana is only ever read as the sound.
 */
function beatLine(beat) {
  return line('kana', { ja: beat, tts: toKata(beat), kana: beat, also: Object.entries(SAID_AS).filter(([, to]) => to === beat).map(([from]) => from) });
}

function soundLines() {
  const out = [];
  for (const [noteId, note] of Object.entries(SOUND_NOTES)) {
    const examples = [...(note.examples || [])];
    if (note.pair) examples.push(note.pair.with, note.pair.without);
    for (const ex of examples.filter(Boolean)) {
      // The note's reading when the example is written in kanji (今日 is
      // きょう, never こんにち), joined up: a space would be said as a pause.
      const tts = hasKanji(ex.ja) && ex.kana ? ex.kana.replace(/\s+/g, '') : ex.ja;
      const l = line('sound', { ja: ex.ja, kana: ex.kana, tts, said: ex.said, note: noteId });
      // An example that is one word in kanji (今日) is that word's clip too.
      if (hasKanji(ex.ja) && ex.kana && !/\s/.test(ex.kana)) l.keys.push(wordKey(ex.ja, ex.kana));
      out.push(l);
    }
  }
  return out;
}

function phraseLines(library) {
  const out = [];
  for (const p of (library && library.phrases) || []) out.push(line('phrase', { ja: p.ja, kana: p.kana, tts: p.ja, phrase: p.id }));
  for (const d of (library && library.dialogues) || []) {
    for (const l of d.lines || []) if (l && l.ja) out.push(line('phrase', { ja: l.ja, kana: l.kana, tts: l.ja, dialogue: d.id }));
  }
  return out;
}

function noteLines() {
  const out = [];
  for (const [id, note] of Object.entries(GRAMMAR_NOTES)) {
    if (note.example && note.example.ja) out.push(line('note', { ja: note.example.ja, tts: note.example.ja, note: id }));
  }
  for (const [id, note] of Object.entries(LOAN_NOTES)) {
    for (const ex of note.examples || []) out.push(line('note', { ja: ex.ja, tts: ex.ja, said: ex.said, note: id }));
  }
  return out;
}

/**
 * The whole script, one line per key: a text two places share (こんにちは is a
 * sound example and a phrase) is recorded once, under the first, which is the
 * one with the highest priority.
 */
export function audioScript({ library = null, kinds = KINDS } = {}) {
  const all = [];
  if (kinds.includes('sound')) all.push(...soundLines());
  if (kinds.includes('kana')) all.push(...beatInventory().map(beatLine));
  if (kinds.includes('phrase')) all.push(...phraseLines(library));
  if (kinds.includes('note')) all.push(...noteLines());
  const seen = new Map();
  for (const l of all) if (!seen.has(l.key)) seen.set(l.key, l);
  return [...seen.values()];
}

const LAYOUT = new Set(['punct', 'space', 'newline']);
const rangeOk = (n) => n >= 2;

/**
 * What to send for a word: its kanji when the dictionary gives that spelling
 * one reading (雨), its reading when it has more (今日, きょう or こんにち; 方,
 * かた or ほう) or it is a number with its counter, since a transcript shows
 * the same kanji for every reading. A word in kana goes as itself.
 */
function wordTts(written, reading, readings, isNumber = false) {
  if (!hasKanji(written)) return written;
  return isNumber || readings.size !== 1 ? reading : written;
}

/** A word line: filed under its word key; one of two beats or fewer is checked from a triple take. */
function wordLine(kind, written, reading, fields) {
  const key = wordKey(written, reading);
  return { kind, key, keys: [key], id: clipId(key), ja: written, kana: reading, triple: beats(reading).length <= 2, ...fields };
}

/**
 * Every word of Yomu's own text beyond its lines: a phrase's 元気, the おば
 * and さん the analyzer reads おばさん as. What the Word panel says when one is
 * chosen. A word of one kana is a beat already: a particle は is said わ, and
 * わ is a beat.
 */
export async function wordLines(lines, dict) {
  const out = [];
  for (const l of lines) {
    if (l.kind === 'kana') continue;
    const a = await analyze(l.ja, { dict });
    for (const t of a.tokens) {
      if (LAYOUT.has(t.kind) || t.kind === 'guess') continue;
      const reading = toHira(t.reading || t.surface || '');
      if (!rangeOk(beats(reading).length)) continue;
      const readings = new Set(((t.entry && t.entry.r) || []).map(toHira));
      out.push(wordLine('word', t.surface, reading, {
        tts: wordTts(t.surface, reading, readings, t.kind === 'number'),
        said: t.romaji && t.romaji.said,
      }));
    }
  }
  return out;
}

/** Every first-tier key with its records, from the committed core and range shards, in file order. */
function firstTier(dataDir) {
  const dir = path.join(dataDir, 'dict');
  const files = fs.readdirSync(dir).filter((f) => /^(core|w\d+)\.json$/.test(f)).sort();
  const out = [];
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [key, recs] of Object.entries(doc.entries || {})) out.push([key, recs]);
  }
  return out;
}

/** Every reading the dictionary gives a spelling, across all its records, in hiragana. */
const readingsOf = (key, recs) => new Set(recs.flatMap((r) => (r.r && r.r.length ? r.r : [key])).map(toHira));

/**
 * The dictionary's most common words, by Tatoeba band (`q` on a record,
 * docs/ANALYZER.md): each spelling with the reading its record gives, in the
 * voices COMMON_BANDS names. Read from the committed first-tier shards.
 */
export function commonLines(dataDir, bands = COMMON_BANDS) {
  const out = [];
  for (const [key, recs] of firstTier(dataDir)) {
    const readings = readingsOf(key, recs);
    for (const rec of recs) {
      if (!Object.hasOwn(bands, rec.q)) continue;
      const reading = toHira((rec.r && rec.r[0]) || key);
      if (!rangeOk(beats(reading).length)) continue;
      const voices = bands[rec.q];
      out.push(wordLine('common', key, reading, { tts: wordTts(key, reading, readings), band: rec.q, ...(voices ? { voices: [...voices] } : {}) }));
    }
  }
  return out.sort((a, b) => a.band - b.band);
}

const readSite = (dataDir, src) => JSON.parse(fs.readFileSync(path.join(path.dirname(dataDir), src), 'utf8'));
const KANA_PAGE = /^[\u3041-\u30ff]$/u;

/**
 * The kanji pages in the order a learner meets them: the kana pages first,
 * hiragana then katakana, then every kanji by its frequency rank, a kanji
 * with none after every ranked one, by stroke count (the rank
 * build-kanji-page.mjs offers neighbours by), so a run cut short by its
 * budget has covered the most common pages whole.
 */
export function kanjiPages(dataDir) {
  const info = new Map();
  for (const s of readSite(dataDir, 'data/kanji/index.json').shards) {
    for (const [ch, e] of Object.entries(readSite(dataDir, s.src).entries || {})) info.set(ch, e);
  }
  const words = new Map();
  for (const s of readSite(dataDir, 'data/kpage/index.json').shards) {
    for (const [ch, e] of Object.entries(readSite(dataDir, s.src).entries || {})) if (e && Array.isArray(e.w)) words.set(ch, e.w);
  }
  const jsOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const kana = [...words.keys()].filter((ch) => KANA_PAGE.test(ch)).sort(jsOrder);
  const rank = (ch) => (info.get(ch).f ?? 10000) * 100 + (info.get(ch).s || 0);
  const kanji = [...info.keys()].sort((a, b) => rank(a) - rank(b) || jsOrder(a, b));
  return [...kana, ...kanji].map((ch) => ({ ch, info: info.get(ch) || null, words: words.get(ch) || [] }));
}

/**
 * What the kanji page says when pressed (render-kanji-page.js): each page's
 * on and kun readings (the hero's Say it and each reading button speak
 * readingKana(r), so a reading is filed under that kana and needs no lookup),
 * then its words (each button looks up wordKey(written, reading)). One page
 * after another in kanjiPages order, a reading and a word interleaved by page
 * rather than by kind. A reading is sent in katakana, which a voice reads as
 * the sound and never as a particle, and checked against its own romaji,
 * since the analyzer reads a bare へき as the particle へ and き. A reading of
 * one beat is a beat already, and one that starts or ends in a small っ (ジッ,
 * っこ) is half a sound beside a doubled consonant, said alone by nobody.
 */
export function kanjiPageLines(dataDir) {
  const tier = new Map(firstTier(dataDir).map(([key, recs]) => [key, readingsOf(key, recs)]));
  const out = [];
  for (const page of kanjiPages(dataDir)) {
    const said = page.info ? [...(page.info.on || []), ...(page.info.kun || [])] : [];
    for (const r of said) {
      const kana = readingKana(r);
      if (!kana || !rangeOk(beats(kana).length) || /^[っー]|っ$/.test(kana)) continue;
      out.push(wordLine('reading', kana, kana, { tts: toKata(kana), said: readingRomaji(kana), page: page.ch, voices: [...KANJI_PAGE_VOICES] }));
    }
    for (const [written, reading] of page.words) {
      const kana = toHira(reading || written);
      if (!rangeOk(beats(kana).length)) continue;
      out.push(wordLine('kanji', written, kana, { tts: wordTts(written, kana, tier.get(written) || new Set([kana])), page: page.ch, voices: [...KANJI_PAGE_VOICES] }));
    }
  }
  return out;
}

/**
 * Every reading of the kanji in `levels`, easiest level first, one line per
 * kana: 日 gives にち and じつ; its ひ is a beat, recorded already. Read from
 * the committed JLPT list and KANJIDIC shards.
 */
export async function readingLines(dataDir, levels = READING_LEVELS) {
  const site = path.dirname(dataDir);
  const jlpt = await loadJlpt(async (src) => JSON.parse(fs.readFileSync(path.join(site, src), 'utf8')));
  const kanjiDir = path.join(dataDir, 'kanji');
  const readings = new Map();
  for (const f of fs.readdirSync(kanjiDir).filter((name) => /^k\d+\.json$/.test(name))) {
    const doc = JSON.parse(fs.readFileSync(path.join(kanjiDir, f), 'utf8'));
    for (const [ch, rec] of Object.entries(doc.entries || {})) readings.set(ch, [...(rec.on || []), ...(rec.kun || [])]);
  }
  const out = [];
  const seen = new Set();
  for (const level of levels) {
    for (const ch of jlpt[level] || []) {
      for (const reading of readings.get(ch) || []) {
        const kana = readingKana(reading);
        if (!rangeOk(beats(kana).length)) continue;
        const l = wordLine('reading', kana, kana, { tts: kana, kanji: ch, level, voices: [...READING_VOICES] });
        if (seen.has(l.key)) continue;
        seen.add(l.key);
        out.push(l);
      }
    }
  }
  return out;
}

/**
 * Which half of the example sentences ranks the corpus kind: those with an
 * even Tatoeba id. The odd ids are held out, so what a run gains is measured
 * on sentences that did not choose its words (tools/measure-audio-corpus.mjs).
 * Even and odd split the shipped sentences 15,612 to 15,900 (17 November
 * 2026), and as evenly in every era of Tatoeba's ids.
 */
export const isRankingSentence = (id) => Number(id) % 2 === 0;

/**
 * The example sentences a word shows first (data/sent's sNNN shards; the
 * more/ shards wait behind More examples), one per Tatoeba id, in id order:
 * [{ id, ja, en }], `en` the linked English. Each was read by the analyzer
 * with no guess when it was filed (tools/build-sentences.mjs).
 */
export function corpusSentences(dataDir) {
  const dir = path.join(dataDir, 'sent');
  const byId = new Map();
  for (const f of fs.readdirSync(dir).filter((name) => /^s\d+\.json$/.test(name)).sort()) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const rows of Object.values(doc.entries || {})) {
      for (const [, examples] of rows) for (const [id, ja, en] of examples || []) if (!byId.has(id)) byId.set(id, { id, ja, en: en || '' });
    }
  }
  return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

const PARTICLE_SAID = Object.freeze({ 'は': 'わ', 'へ': 'え', 'を': 'お' });

/**
 * What Naninani's word by word says for a token and the keys it finds the
 * clip by, in order (yomu-ios Speech.spokenWord and written(), then
 * bridge/entry.js keysFor): the reading, a particle said as one (は as わ);
 * the spelling, except for a particle in kana, whose word key would find the
 * beat ha; the spelling's word key first, the bare text after. The site's
 * events-say.js lookupOf files a word the same way.
 */
export function spokenWord(token) {
  const reading = (token && (token.reading || token.surface)) || '';
  const text = token && token.kind === 'particle' ? PARTICLE_SAID[reading] || reading : reading;
  const written = token && (token.kind !== 'particle' || hasKanji(token.surface || '')) ? token.surface : null;
  return { text, written, keys: keysOf(text, written ? [wordKey(written, text)] : []) };
}

const LATIN_OR_DIGIT = /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]/u;
const KATAKANA_WORD = /^[゠-ヿ]+$/u;

/**
 * The consonants of a romaji or English word as katakana borrows them:
 * vowels and y dropped, a doubled letter once, and the pairs Japanese does
 * not tell apart made one (l and r, v and b, z and j, a hard c and k).
 * Sam and サム samu are both "sm"; Ziri and ジリ jiri both "jr".
 */
export function consonants(word) {
  return String(word || '').toLowerCase()
    .replace(/ck/g, 'k').replace(/c(?!h)/g, 'k')
    .replace(/[aeiouy'’]/g, '')
    .replace(/z/g, 'j').replace(/l/g, 'r').replace(/v/g, 'b')
    .replace(/(.)\1+/g, '$1');
}

/**
 * A katakana word the sentence's English calls by a name: a capitalized
 * English word with the token's consonants that none of its glosses holds.
 * Tatoeba's Sam and Ziri are read as the words サム "sum" and ジリ "Dili";
 * the analyzer tags neither as a name, and the English does. Over the
 * corpus kind's every candidate (17 November 2026) this found six katakana
 * words, each a name in that sentence (サム, ジリ, リー, ブレーク, ポチ,
 * イッチ) and nothing else; on a word in kanji or hiragana the same cue
 * matched It, She and My, so it is asked of katakana alone.
 */
export function namedInEnglish(token, en) {
  if (!en || !token || !KATAKANA_WORD.test(token.surface || '')) return false;
  const said = consonants(token.romaji && token.romaji.said);
  if (!said) return false;
  const glosses = ((token.entry && token.entry.g) || []).join(' ').toLowerCase();
  return (String(en).match(/\b[A-Z][a-z]+\b/g) || []).some((w) => consonants(w) === said && !glosses.includes(w.toLowerCase()));
}

/**
 * Why a token has no word of its own to record, or null when it has one:
 * the punctuation, a name, a number (said by its counter's rule), a Latin
 * word or a digit, a guess or a kana nothing explains, a particle in kana
 * (said as a beat: は is わ), and anything of one beat (a beat already). A
 * name is mostly Tatoeba's cast (トム, メアリー, ジョン, and the Sam the
 * analyzer reads as サム "sum", namedInEnglish), never a word a learner looks
 * up, and a voice says a person's name as it guesses it.
 */
export function corpusLeftOut(token, en = '') {
  if (!token || LAYOUT.has(token.kind)) return 'punctuation';
  if (token.kind === 'name' || token.name || namedInEnglish(token, en)) return 'a name';
  if (token.kind === 'number') return 'a number';
  if (token.kind === 'latin' || LATIN_OR_DIGIT.test(token.surface || '')) return 'Latin or a digit';
  if (token.kind === 'unknown' || token.confidence === 'guess') return 'a guess';
  if (token.kind === 'particle' && !hasKanji(token.surface || '')) return 'a particle in kana';
  const { text, written } = spokenWord(token);
  if (!written || !rangeOk(beats(toHira(text)).length)) return 'one beat';
  return null;
}

/** The corpus word a token is, `{ written, reading, said, readings, inflected }`, or null when it is none. */
function corpusWord(token, dict, en = '') {
  if (corpusLeftOut(token, en)) return null;
  const { text, written } = spokenWord(token);
  const reading = toHira(text);
  // Every reading the dictionary gives the spelling, or the dictionary form
  // of an inflected one, across all its records: 行った goes as いった, since
  // 行く is いく or ゆく, and 食べた as 食べた (wordTts).
  const base = token.base && token.base !== token.surface ? token.base : token.surface;
  const readings = new Set([...((token.entry && token.entry.r) || []), ...readingsOf(base, (dict && dict.get(base)) || [])].map(toHira));
  return { written, reading, said: token.romaji && token.romaji.said, readings, inflected: !!(token.chain && token.chain.length) };
}

const okurigana = (s) => s.match(/[ぁ-ゟ]*$/u)[0];

/** An inflected form in kanji that wordTts would send as it is written, so needs kanjiReadings asked too. */
const asksKanji = (w) => w.inflected && hasKanji(w.written) && wordTts(w.written, w.reading, w.readings) === w.written;

/**
 * How the kanji of an inflected form can be read, over every dictionary form
 * the deinflector finds for it whose part of speech admits the form: 通って
 * is 通う's かよ or 通る's とお, 勝った 勝つ's か or 勝る's まさ. One reading
 * means a transcript of the form in kanji can only be that form. The bases'
 * shards must be loaded (corpusLines needs them all at once).
 */
function kanjiReadings(surface, dict) {
  const out = new Set();
  for (const c of deinflect(surface)) {
    for (const rec of dict.get(c.base) || []) {
      if (!posMatches(c.type, rec.p, c.base)) continue;
      const tail = okurigana(c.base);
      for (const r of (rec.r && rec.r.length ? rec.r : [c.base]).map(toHira)) out.add(r.endsWith(tail) ? r.slice(0, r.length - tail.length) : r);
    }
  }
  return out;
}

/**
 * What a corpus word sends: wordTts's rule, and an inflected form in kanji
 * only when no other dictionary form reads its kanji another way. A
 * transcript shows 通って for かよって and for とおって alike, so 通って goes
 * as Yomu reads it, and 食べた as 食べた.
 */
function corpusSend(w, dict) {
  if (!asksKanji(w)) return wordTts(w.written, w.reading, w.readings);
  return kanjiReadings(w.written, dict).size === 1 ? w.written : w.reading;
}

const jsOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const katakanaIn = (s) => (s.match(/[゠-ヿ]/gu) || []).length;

/**
 * Which spelling a key says when it folds two together (ジャガイモ and
 * じゃがいも are both the key じゃがいも, トントン and とんとん both とんとん): the
 * one the sentences write most, then the one with more katakana, which a
 * voice only ever reads as the sound, then code-point order. Taking the first
 * met made what is sent hang on the sentences' order, and a change in what is
 * sent remakes a clip already paid for.
 */
const spellingOrder = (a, b) => b.count - a.count || katakanaIn(b.w.written) - katakanaIn(a.w.written) || jsOrder(a.w.written, b.w.written);

/**
 * The words of `sentences` ([{ ja, en }]) as the reader plays them word by
 * word, one line per key, the most frequent first: each spoken token filed
 * under the key Naninani looks it up by (spokenWord), conjugated forms as
 * they stand (している, 行った|いった), since a reader plays the form on the
 * page. A name, a particle in kana, a number, a Latin word and a single beat
 * are left out (corpusLeftOut). `count` is how often the key was met; equal
 * counts go in key order, and a key two spellings share says the one
 * `spellingOrder` puts first, so the list is the same on every run and in
 * whatever order the sentences come. `also` is the token's other lookup
 * key, its bare kana. Clear alone records them. fullScript drops a key
 * another kind holds, and puts this kind last.
 */
export async function corpusLines(sentences, dict) {
  const found = new Map();
  for (const s of sentences) {
    const a = await analyze(s.ja, { dict });
    for (const t of a.tokens) {
      const w = corpusWord(t, dict, s.en);
      if (!w) continue;
      const key = wordKey(w.written, w.reading);
      let hit = found.get(key);
      if (!hit) found.set(key, (hit = { key, count: 0, spellings: new Map() }));
      hit.count += 1;
      const spelt = hit.spellings.get(w.written);
      if (spelt) spelt.count += 1;
      else hit.spellings.set(w.written, { count: 1, w, also: spokenWord(t).keys.filter((k) => k !== key) });
    }
  }
  const words = [...found.values()].map(({ key, count, spellings }) => {
    const { w, also } = [...spellings.values()].sort(spellingOrder)[0];
    return { key, count, ...w, also };
  });
  await dict.need([...new Set(words.filter(asksKanji).flatMap((w) => deinflect(w.written).map((c) => c.base)))]);
  return words.sort((a, b) => b.count - a.count || jsOrder(a.key, b.key)).map((w) => wordLine('corpus', w.written, w.reading, {
    tts: corpusSend(w, dict),
    said: w.said,
    count: w.count,
    also: w.also,
    voices: [...CORPUS_VOICES],
  }));
}

/**
 * The corpus lines a script takes, in their order, given the keys its other
 * lines hold (`taken`, which it adds to): none whose key a line holds,
 * recorded or not, and none whose other lookup key (its bare kana) a line
 * holds, since the reader finds that clip first. A word sent as the same kana
 * as a word above it (行った|いった, 言った|いった and いった all send いった)
 * is the same request, so it is filed under that line's clip rather than
 * paid for again.
 *
 * `kept` are the lines whose clip was kept already (keptCorpusLine), taken
 * first, whatever this ranking says of them: one whose bare kana another
 * line has come to hold stays too, since the reader tries its own key
 * first. Only a key an earlier kind holds outranks one; that line then has
 * the clip's id, so the clip stays, made again only if it sends otherwise.
 */
export function takeCorpus(lines, taken, kept = []) {
  const out = [];
  const bySend = new Map();
  const ranked = new Map(lines.map((l) => [l.key, l]));
  for (const l of kept) {
    if (taken.has(l.key)) continue;
    l.keys = l.keys.filter((k) => k === l.key || !taken.has(k));
    for (const k of l.keys) taken.add(k);
    l.count = ranked.has(l.key) ? ranked.get(l.key).count : 0;
    if (!bySend.has(l.tts)) bySend.set(l.tts, l);
    out.push(l);
  }
  for (const l of lines) {
    if (taken.has(l.key) || l.also.some((k) => taken.has(k))) continue;
    taken.add(l.key);
    const same = bySend.get(l.tts);
    if (same) { same.keys.push(l.key); continue; }
    bySend.set(l.tts, l);
    out.push(l);
  }
  return out;
}

/**
 * The corpus lines whose clip was kept, as each was when it was made:
 * build-audio.mjs writes them here (corpusKept) and fullScript takes them
 * back. The corpus is ranked again on every run, so without this record an
 * analyzer change, new sentences or another kind taking a word's bare kana
 * would drop a recorded word from the script, and the run's prune would
 * delete the clip it paid for. Taking a word out is deleting its row; the
 * next run prunes its clip.
 */
export const CORPUS_KEPT = 'tools/audio-corpus.json';

const KEPT_FIELDS = ['key', 'keys', 'ja', 'kana', 'tts', 'said', 'also'];

/** The kept corpus rows in `site` (the repository root), or none. */
export function readCorpusKept(site) {
  const file = path.join(site, CORPUS_KEPT);
  if (!fs.existsSync(file)) return [];
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(rows)) throw new Error(`${CORPUS_KEPT}: expected a list of lines`);
  for (const r of rows) {
    if (!r || typeof r.key !== 'string' || !Array.isArray(r.keys) || !r.keys.includes(r.key) || typeof r.ja !== 'string' || typeof r.kana !== 'string' || typeof r.tts !== 'string') {
      throw new Error(`${CORPUS_KEPT}: a line needs key, keys holding it, ja, kana and tts`);
    }
  }
  return rows;
}

/** A kept row as a script line: the same key, id, keys and send as when its clip was made. */
export function keptCorpusLine(row) {
  return {
    kind: 'corpus', key: row.key, keys: [...row.keys], id: clipId(row.key), ja: row.ja, kana: row.kana,
    triple: beats(row.kana).length <= 2, tts: row.tts, said: row.said, count: 0, also: [...(row.also || [])],
    voices: [...CORPUS_VOICES], kept: true,
  };
}

/**
 * The rows to keep after a run: every row kept before, in its order, with
 * any key that came to share its clip added, then each corpus line of
 * `script` whose clip `isKept(line)` says was kept, in script order.
 */
export function corpusKept(script, isKept, before = []) {
  const rows = new Map(before.map((r) => [r.key, { ...r, keys: [...r.keys] }]));
  for (const l of script) {
    if (l.kind !== 'corpus') continue;
    const row = rows.get(l.key);
    if (row) { for (const k of l.keys) if (!row.keys.includes(k)) row.keys.push(k); continue; }
    if (isKept(l)) rows.set(l.key, Object.fromEntries(KEPT_FIELDS.map((f) => [f, Array.isArray(l[f]) ? [...l[f]] : l[f]])));
  }
  return [...rows.values()];
}

/**
 * The whole script with its words, one line per key, in priority order: the
 * lines, then the words of Yomu's text, then the common words by band, then
 * the kanji pages' readings and words, then the example sentences' words. A
 * key a line already holds is not recorded again, so a page's word that is a
 * common word keeps that clip. The corpus kind comes last and is read
 * against every other kind, whatever `kinds` asks for (takeCorpus).
 * `corpus` is the sentences it ranks its words on: the ranking half of the
 * example sentences unless a test gives others. `kept` is the corpus rows
 * whose clip was kept: tools/audio-corpus.json unless a test gives others.
 */
export async function fullScript({ library, dict, dataDir, kinds = KINDS, corpus = null, kept = null }) {
  const lines = audioScript({ library, kinds: KINDS });
  const want = kinds.includes('corpus') ? KINDS : kinds;
  const extra = [];
  if (want.includes('word')) extra.push(...await wordLines(lines, dict));
  if (want.includes('common')) extra.push(...commonLines(dataDir));
  // Two scripts of readings met when Naninani 1.2.0 merged (docs/AUDIO.md,
  // The kanji pages): the N5 to N3 readings were recorded from readingLines,
  // sent as their kana, so a key they hold keeps that line and its record;
  // the kanji pages' lines add every other reading, sent in katakana, and
  // the pages' words.
  if (want.includes('reading')) extra.push(...await readingLines(dataDir));
  if (want.includes('reading') || want.includes('kanji')) extra.push(...kanjiPageLines(dataDir).filter((l) => want.includes(l.kind)));
  const taken = new Set(lines.flatMap((l) => l.keys));
  const out = [];
  for (const l of extra) {
    if (taken.has(l.key)) continue;
    taken.add(l.key);
    out.push(l);
  }
  if (want.includes('corpus')) {
    const ranking = corpus || corpusSentences(dataDir).filter((s) => isRankingSentence(s.id));
    const rows = kept || readCorpusKept(path.dirname(dataDir));
    out.push(...takeCorpus(await corpusLines(ranking, dict), taken, rows.map(keptCorpusLine)));
  }
  return [...lines, ...out].filter((l) => kinds.includes(l.kind));
}
