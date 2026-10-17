// What Yomu records, read from the site's own text: the sound notes, every
// beat Sound it out can play, the phrase library, and the grammar and
// loanword notes' examples; then every word of that text, and the
// dictionary's most common words. A new example or phrase is in the next
// run's script with nothing to list here.
//
// Each line says what to send (`tts`) and what it must sound like (`said`,
// the said romaji, or `kana` for a lone beat).
// Order is priority: when a budget runs out, the sounds are already made.

import fs from 'node:fs';
import path from 'node:path';
import { SOUND_NOTES } from '../../js/notes-sounds.js';
import { GRAMMAR_NOTES } from '../../js/notes-grammar.js';
import { LOAN_NOTES } from '../../js/notes-loan.js';
import { GENKI_MAP, toKata, toHira, hasKanji, beats } from '../../js/kana.js';
import { audioKey, wordKey, clipId } from '../../js/audio.js';
import { analyze } from '../../js/analyze.js';

export const KINDS = Object.freeze(['sound', 'kana', 'phrase', 'note', 'word', 'common']);

// Which voices record the common words of each frequency band (q, 1 the most
// frequent): band 1 in every voice, band 2 in Clear alone, whose clip any
// other voice borrows (js/audio.js clipByKeys). Every voice through band 2
// would add about 26 MB to the 42.3 that all of data/audio holds (docs/AUDIO.md).
export const COMMON_BANDS = Object.freeze({ 1: null, 2: Object.freeze(['clear']) });

// Every beat the reader can sound out: the plain kana, the voiced ones, the
// small-ya, yu and yo beats, and the loanword digraphs of GENKI_MAP. ゐ and ゑ
// are out of use; ぢ and づ are said as じ and ず, so they share those clips.
const PLAIN = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん'];
const VOICED = [...'がぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽ'];
const YOUON = ['き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'び', 'ぴ'].flatMap((k) => ['ゃ', 'ゅ', 'ょ'].map((s) => k + s));
const SAID_AS = Object.freeze({ 'ぢ': 'じ', 'づ': 'ず', 'を': 'お' });

/** Every beat with its own clip, as the reader splits it (hiragana). */
export function beatInventory() {
  return [...PLAIN, ...VOICED, ...YOUON, ...Object.keys(GENKI_MAP)];
}

/** The beats that are said as another and so play its clip. */
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

/**
 * The dictionary's most common words, by Tatoeba band (`q` on a record,
 * docs/ANALYZER.md): each spelling with the reading its record gives, in the
 * voices COMMON_BANDS names. Read from the committed first-tier shards.
 */
export function commonLines(dataDir, bands = COMMON_BANDS) {
  const dir = path.join(dataDir, 'dict');
  const files = fs.readdirSync(dir).filter((f) => /^(core|w\d+)\.json$/.test(f)).sort();
  const out = [];
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [key, recs] of Object.entries(doc.entries || {})) {
      const readings = new Set(recs.flatMap((r) => (r.r && r.r.length ? r.r : [key])).map(toHira));
      for (const rec of recs) {
        if (!Object.hasOwn(bands, rec.q)) continue;
        const reading = toHira((rec.r && rec.r[0]) || key);
        if (!rangeOk(beats(reading).length)) continue;
        const voices = bands[rec.q];
        out.push(wordLine('common', key, reading, { tts: wordTts(key, reading, readings), band: rec.q, ...(voices ? { voices: [...voices] } : {}) }));
      }
    }
  }
  return out.sort((a, b) => a.band - b.band);
}

/**
 * The whole script with its words, one line per key, in priority order: the
 * lines, then the words of Yomu's text, then the common words by band. A key
 * a line already holds is not recorded again.
 */
export async function fullScript({ library, dict, dataDir, kinds = KINDS }) {
  const lines = audioScript({ library, kinds: KINDS });
  const extra = [];
  if (kinds.includes('word')) extra.push(...await wordLines(lines, dict));
  if (kinds.includes('common')) extra.push(...commonLines(dataDir));
  const taken = new Set(lines.flatMap((l) => l.keys));
  const out = lines.filter((l) => kinds.includes(l.kind));
  for (const l of extra) {
    if (taken.has(l.key)) continue;
    taken.add(l.key);
    out.push(l);
  }
  return out;
}
