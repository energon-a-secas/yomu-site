// Special sounds, found on real analyze() output, and the notes that explain
// them.
//
//   node --test tests/sounds.test.mjs
//
// Every type sounds.js can emit has a case where it must appear and a case
// where it must not: the second is the one that keeps the module honest,
// because a sound that fires everywhere teaches nothing. Spans index the
// token's reading, so each positive case also checks which kana it covers.
//
// The second half holds notes-sounds.js to kana.js: every example's two
// romaji lines are recomputed, and every example is read through analyze()
// to check it shows the sound it is an example of.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SOUND_TYPES, detectSounds } from '../js/sounds.js';
import { LOAN_TYPES } from '../js/loanwords.js';
import { SOUND_NOTES, noteFor } from '../js/notes.js';
import { said, spelled, devoiced, devoicedNotation } from '../js/kana.js';
import { run, saidLine, cut } from './helpers/disk.mjs';

const EM_DASH = String.fromCharCode(0x2014);
const BANNED = /\b(powerful|seamless|leverages?|robust|utili[sz]e)\b/i;

/** The sounds of one type in one token, found by the token's surface. */
async function soundsOf(text, surface, type) {
  const r = await run(text);
  const t = r.tokens.find((x) => x.surface === surface);
  assert.ok(t, `${surface} is not a token of ${text} (${cut(r)})`);
  return { t, list: t.sounds.filter((s) => s.type === type) };
}

/** The reading kana a sound covers, one string per span. */
const covered = (t, s) => (s.spans || [s.at]).map(([a, b]) => t.reading.slice(a, b));

/**
 * type -> { yes: [text, surface, detail?, kana covered?], no: [text, surface, why] }
 */
const CASES = {
  'particle-wa': { yes: ['わたしはがくせいです', 'は', 'wa', ['は']], no: ['はなです', 'はな', 'inside a word は keeps its sound'] },
  'particle-e': { yes: ['がっこうへいきます', 'へ', 'e', ['へ']], no: ['へやにいます', 'へや', 'inside a word へ is he'] },
  'particle-o': { yes: ['おちゃをのみます', 'を', 'o', ['を']], no: ['おちゃをのみます', 'おちゃ', 'お is not を'] },
  'fossil-wa': { yes: ['こんにちは', 'こんにちは', 'wa', ['は']], no: ['今日はいい天気です', 'は', 'a topic は after 今日 is the particle, not the fossil'] },
  'long-vowel': { yes: ['せんせい', 'せんせい', 'ee', ['せい']], no: ['おもう', 'おもう', 'the う of a godan verb is its own beat'] },
  'small-tsu': { yes: ['きっぷ', 'きっぷ', 'p', ['っ']], no: ['きつね', 'きつね', 'a full-size つ is tsu'] },
  'youon': { yes: ['きょうは', 'きょう', 'kyo', ['きょ']], no: ['きようです', 'きよう', 'a full-size よ is its own beat'] },
  'dakuten': { yes: ['ぎんこうでごはんをたべました', 'たべました', 'へ', ['べ']], no: ['かっこう', 'かっこう', 'no voiced kana'] },
  'handakuten': { yes: ['ぽかぽか', 'ぽかぽか', 'ほほ', ['ぽ', 'ぽ']], no: ['ははです', 'はは', 'no circle'] },
  'n-assimilation': { yes: ['しんぶん', 'しんぶん', 'm', ['ん']], no: ['ほんです', 'ほん', 'a final ん meets the next token, which the rule cannot see'] },
  'devoiced': { yes: ['すきです', 'すき', 's(u)ki', ['す']], no: ['すぎです', 'すぎ', 'す before a voiced ぎ keeps its vowel'] },
  'ji-zu': { yes: ['はなぢ', 'はなぢ', 'ji', ['ぢ']], no: ['じしょ', 'じしょ', 'じ is the ordinary spelling'] },
  'foreign-sound': { yes: ['パーティー', 'パーティー', 'ti', ['てぃ']], no: ['コーヒー', 'コーヒー', 'a bar is not a foreign digraph'] },
  'bar': { yes: ['ラーメン', 'ラーメン', 'a', ['ー']], no: ['パン', 'パン', 'no bar'] },
  'repeat-mark': { yes: ['人々', '人々', '人', ['びと']], no: ['人', '人', 'no mark'] },
  'special-reading': { yes: ['今日', '今日', '今日', ['きょう']], no: ['学生', '学生', 'がく|せい splits kanji by kanji'] },
  'counter-change': { yes: ['一本', '一本', null, ['いっぽん']], no: ['二本', '二本', 'にほん bends nothing'] },
};

test('every sound type has a case both ways, and nothing else does', () => {
  assert.deepEqual(Object.keys(CASES).sort(), [...SOUND_TYPES].sort());
});

for (const type of SOUND_TYPES) {
  const { yes, no } = CASES[type];
  test(`${type}: found in ${yes[0]}`, async () => {
    const [text, surface, detail, kana] = yes;
    const { t, list } = await soundsOf(text, surface, type);
    assert.equal(list.length, 1, `${surface} should carry one ${type}, has ${JSON.stringify(t.sounds)}`);
    if (detail !== undefined) assert.equal(list[0].detail, detail);
    if (kana) assert.deepEqual(covered(t, list[0]), kana);
  });
  test(`${type}: not in ${no[0]} (${no[2]})`, async () => {
    const [text, surface] = no;
    const { list } = await soundsOf(text, surface, type);
    assert.deepEqual(list, []);
  });
}

// ── Shapes ───────────────────────────────────────────────────────────────

test('voiced kana are one entry per token, with every span in it', async () => {
  const r = await run('だいがくせいのばんごはんはぜんぜんだめでした');
  for (const t of r.tokens) {
    const marks = t.sounds.filter((s) => s.type === 'dakuten');
    const voiced = [...t.reading].filter((ch) => /[がぎぐげござじずぜぞだぢづでどばびぶべぼ]/.test(ch)).length;
    assert.equal(marks.length, voiced ? 1 : 0, t.surface);
    if (voiced) {
      assert.equal(marks[0].spans.length, voiced, t.surface);
      assert.deepEqual(marks[0].at, marks[0].spans[0]);
    }
  }
  // One entry per token that has any, however many voiced kana it holds:
  // this sentence has eight of them in five tokens, and the page used to
  // list the same two dots eight times.
  const all = r.tokens.flatMap((t) => t.sounds).filter((s) => s.type === 'dakuten');
  assert.equal(all.reduce((n, s) => n + s.spans.length, 0), 8);
  assert.equal(all.length, 5);
});

test('every span lies inside the reading, and the list is in order', async () => {
  const r = await run('今日はコーヒーを一本と、パーティーでラーメンを食べました。人々はがっこうへいきます。');
  for (const t of r.tokens) {
    let last = -1;
    for (const s of t.sounds) {
      for (const [a, b] of s.spans || [s.at]) {
        assert.ok(a >= 0 && b <= t.reading.length && a < b, `${t.surface} ${s.type} ${a}-${b}`);
      }
      assert.ok(s.at[0] >= last, `${t.surface} sounds out of order`);
      last = s.at[0];
      // a loanword rule is a sound entry too (loanwords.js), with its own types
      assert.ok(SOUND_TYPES.includes(s.type) || LOAN_TYPES.includes(s.type), s.type);
    }
  }
});

test('a final す is whispered at the end of a sentence and not before a voiced sound', async () => {
  const end = await run('すきです。');
  const desu = end.tokens.find((t) => t.surface === 'です');
  assert.ok(desu.sounds.some((s) => s.type === 'devoiced' && s.detail === 'des(u)'));
  const mid = await run('すきですが、');
  const desu2 = mid.tokens.find((t) => t.surface === 'です');
  assert.ok(!desu2.sounds.some((s) => s.type === 'devoiced'));
});

test('punctuation, spaces and latin text carry no sounds', () => {
  for (const kind of ['punct', 'space', 'latin', 'newline']) {
    assert.deepEqual(detectSounds({ kind, surface: 'は', reading: 'は', furigana: [{ text: 'は' }] }), []);
  }
});

// ── The notes ────────────────────────────────────────────────────────────

const PARTICLE_PIECES = new Set(['は', 'へ', 'を']);

/** Every string in a note, with where it sits, for the prose checks. */
function strings(v, at = '') {
  if (typeof v === 'string') return [[at, v]];
  if (!v || typeof v !== 'object') return [];
  return Object.entries(v).flatMap(([k, x]) => strings(x, at ? `${at}.${k}` : k));
}

test('every sound type has a note, and every note a sound type', () => {
  assert.deepEqual(Object.keys(SOUND_NOTES).sort(), [...SOUND_TYPES].sort());
});

for (const [id, note] of Object.entries(SOUND_NOTES)) {
  test(`note ${id}: English and Spanish everywhere, no em dash, no banned word`, () => {
    for (const field of ['title', 'rule']) {
      assert.ok(note[field].en && note[field].es, `${id}.${field}`);
    }
    if (note.exception) assert.ok(note.exception.en && note.exception.es, `${id}.exception`);
    for (const e of note.examples) assert.ok(e.gloss.en && e.gloss.es, `${id} ${e.ja}`);
    if (note.pair) for (const side of ['with', 'without']) assert.ok(note.pair[side].gloss.en && note.pair[side].gloss.es);
    assert.ok(note.examples.length >= 2, `${id} needs two examples`);
    for (const [where, s] of strings(note)) {
      assert.ok(!s.includes(EM_DASH), `${id}.${where} has an em dash`);
      assert.ok(!BANNED.test(s), `${id}.${where} uses a banned word`);
    }
    for (const lang of ['en', 'es']) assert.equal(noteFor('sound', id, lang).fallback, false);
  });

  test(`note ${id}: every example's romaji is what kana.js writes`, () => {
    for (const e of note.examples) {
      const pieces = (e.kana || e.ja).split(' ');
      const line = pieces.map((p) => said(p, { particle: PARTICLE_PIECES.has(p), finalWa: id === 'fossil-wa' })).join(' ');
      assert.equal(e.said, line, `${e.ja} said`);
      assert.equal(e.spelled, pieces.map((p) => spelled(p)).join(' '), `${e.ja} spelled`);
      if (e.whispered) {
        const w = pieces.map((p, k) => devoicedNotation(p, devoiced(p, { final: k === pieces.length - 1 })) || said(p)).join(' ');
        assert.equal(e.whispered, w, `${e.ja} whispered`);
      }
    }
    if (note.pair) for (const side of ['with', 'without']) assert.equal(note.pair[side].said, said(note.pair[side].ja), side);
  });

  test(`note ${id}: every example shows the sound when Yomu reads it`, async () => {
    const shown = [...note.examples.map((e) => [e.ja, e.said]), ...(note.pair ? [[note.pair.with.ja, note.pair.with.said]] : [])];
    for (const [ja, line] of shown) {
      const r = await run(ja);
      assert.ok(r.tokens.some((t) => t.sounds.some((s) => s.type === id)), `${ja} (${cut(r)}) shows no ${id}`);
      assert.equal(saidLine(r), line, `${ja} is said differently in the reader`);
    }
    if (note.pair) {
      const r = await run(note.pair.without.ja);
      assert.ok(!r.tokens.some((t) => t.sounds.some((s) => s.type === id)), `${note.pair.without.ja} should not show ${id}`);
    }
  });
}
