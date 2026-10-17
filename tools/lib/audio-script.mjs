// What Yomu records, read from the site's own text: the sound notes, every
// beat Sound it out can play, the phrase library, and the grammar and
// loanword notes' examples. A new example or phrase is in the next run's
// script with nothing to list here.
//
// Each line says what to send (`tts`) and what it must sound like (`said`,
// the said romaji, or `kana` for a lone beat).
// Order is priority: when a budget runs out, the sounds are already made.

import { SOUND_NOTES } from '../../js/notes-sounds.js';
import { GRAMMAR_NOTES } from '../../js/notes-grammar.js';
import { LOAN_NOTES } from '../../js/notes-loan.js';
import { GENKI_MAP, toKata, hasKanji } from '../../js/kana.js';
import { audioKey, clipId } from '../../js/audio.js';

export const KINDS = Object.freeze(['sound', 'kana', 'phrase', 'note']);

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
      out.push(line('sound', { ja: ex.ja, kana: ex.kana, tts, said: ex.said, note: noteId }));
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
