// Katakana compounds, where a borrowed word came from, and the loanword
// rules, found on real analyze() output, and the notes that explain them.
//
//   node --test tests/loanwords.test.mjs
//
// Like tests/sounds.test.mjs: every rule has a case where it must appear and
// one where it must not, because a rule that fires everywhere teaches
// nothing, and every note's examples are read through the analyzer to check
// they show the rule they are the example of.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LOAN_TYPES, loanRules, isLoanType } from '../js/loanwords.js';
import { englishUnits, alignEntry } from '../js/loan-align.js';
import { joinKatakana } from '../js/compounds.js';
import { LOAN_NOTES, noteFor } from '../js/notes.js';
import { originWords, useLang } from '../js/strings.js';
import { summarize, tokenNotes } from '../js/render-notes.js';
import { said, spelled } from '../js/kana.js';
import { run, saidLine, cut } from './helpers/disk.mjs';

const EM_DASH = String.fromCharCode(0x2014);
const BANNED = /\b(powerful|seamless|leverages?|robust|utili[sz]e)\b/i;

/** The one Japanese token of a text that is a single word. */
async function only(text) {
  const r = await run(text);
  const ws = r.tokens.filter((t) => t.kind !== 'punct');
  assert.equal(ws.length, 1, `${text} is not one token: ${cut(r)}`);
  return ws[0];
}

const loanOf = (t, type) => t.sounds.filter((s) => s.type === type);
const covered = (t, s) => (s.spans || [s.at]).map(([a, b]) => t.reading.slice(a, b));

// ── Compounds ────────────────────────────────────────────────────────────

test('インフォームショップ is one word made of a guess and shop, and says which part it could not find', async () => {
  const t = await only('インフォームショップ');
  assert.equal(t.kind, 'katakana');
  assert.equal(t.romaji.said, 'infoomushoppu');
  assert.deepEqual(t.parts.map((p) => [p.surface, p.reading, p.gloss, p.tier]), [
    ['インフォーム', 'いんふぉーむ', null, null],
    ['ショップ', 'しょっぷ', 'shop', 1],
  ]);
  // no dictionary word covers インフォーム, so nothing invents a gloss for it
  assert.equal(t.gloss, null);
  assert.equal(t.confidence, 'guess');
  assert.equal(t.entry, null);
});

test('a katakana run the dictionary has whole is not split (コーヒーショップ, ゲームセンター)', async () => {
  for (const [text, gloss] of [['コーヒーショップ', 'coffee shop'], ['ゲームセンター', 'game arcade']]) {
    const t = await only(text);
    assert.equal(t.parts, undefined, text);
    assert.equal(t.confidence, 'dict', text);
    assert.equal(t.entry.g[0], gloss, text);
  }
});

test('a run of dictionary words is one word with parts and a joined gloss, from either tier', async () => {
  for (const [text, parts, gloss, said] of [
    ['スマートフォンケース', [['スマートフォン', 2], ['ケース', 1]], 'smartphone + case (container)', 'sumaatofonkeesu'],
    ['アイスクリームショップ', [['アイスクリーム', 1], ['ショップ', 1]], 'ice cream + shop', 'aisukuriimushoppu'],
    ['テニストーナメント', [['テニス', 1], ['トーナメント', 1]], 'tennis + tournament', 'tenisutoonamento'],
  ]) {
    const t = await only(text);
    assert.deepEqual(t.parts.map((p) => [p.surface, p.tier]), parts, text);
    assert.equal(t.gloss, gloss, text);
    assert.equal(t.confidence, 'rule', text);
    assert.equal(t.romaji.said, said, text);
    // the reading, beats and spelled line are the compound's own
    assert.equal(t.reading, t.parts.map((p) => p.reading).join(''), text);
    assert.equal(t.romaji.spelled, spelled(t.reading), text);
  }
  // a compound is not a guess, so it is not counted as one
  assert.equal((await run('アイスクリームショップに行く。')).unknown, 0);
});

test('a run no split into dictionary words covers stays one honest guess (ジャバウォック, ズンドコベロンチョ, ピロピロリン)', async () => {
  for (const text of ['ジャバウォック', 'ズンドコベロンチョ', 'ピロピロリン']) {
    const t = await only(text);
    assert.equal(t.confidence, 'guess', text);
    assert.equal(t.entry, null, text);
    // no parts means no split was found; the page says so
    assert.ok(!t.parts || t.parts.some((p) => !p.entry), text);
    assert.equal(t.gloss ?? null, null, text);
  }
});

test('a compound joins only katakana that touch: a particle, a name or punctuation keeps words apart', async () => {
  assert.equal(cut(await run('コーヒーとケーキ')), 'コーヒー|と|ケーキ');
  assert.equal(cut(await run('コーヒー・ケーキ')), 'コーヒー|・|ケーキ');
  // a sentence around a compound keeps its own tokens
  const r = await run('テニストーナメントに出る。');
  assert.equal(cut(r), 'テニストーナメント|に|出る|。');
});

test('joinKatakana leaves a lone token and every other token as the same object', () => {
  const a = { kind: 'katakana', surface: 'パン', start: 0, end: 2, reading: 'ぱん', entry: { g: ['bread'] } };
  const b = { kind: 'particle', surface: 'を', start: 2, end: 3, reading: 'を', entry: null };
  const out = joinKatakana([a, b]);
  assert.equal(out[0], a);
  assert.equal(out[1], b);
  const c = { kind: 'katakana', surface: 'ケース', start: 2, end: 5, reading: 'けーす', entry: { g: ['case'] } };
  const [joined] = joinKatakana([a, c]);
  assert.equal(joined.surface, 'パンケース');
  assert.equal(joined.gloss, 'bread + case');
  assert.deepEqual([joined.start, joined.end], [0, 5]);
  // a cut between the parts, so no long vowel is made across two words
  assert.deepEqual(joined.aid.cuts, [2]);
});

// ── Where a word comes from ──────────────────────────────────────────────

test('the origin line reads ls and ws, in both languages', async () => {
  const cases = [
    ['アルバイト', 'From German: Arbeit', 'Del alemán: Arbeit'],
    ['パン', 'From Portuguese: pão', 'Del portugués: pão'],
    ['ナイター', 'Made-in-Japan English, from nighter', 'Inglés hecho en Japón, a partir de nighter'],
  ];
  for (const [text, en, es] of cases) {
    const t = await only(text);
    useLang('en');
    assert.equal(originWords(t.entry), en, text);
    useLang('es');
    assert.equal(originWords(t.entry), es, text);
  }
  useLang('en');
  // a word JMdict names no source for says nothing, rather than "English"
  assert.equal(originWords((await only('ショップ')).entry), '');
  assert.equal(originWords({ ls: ['xyz', null] }), 'From another language (xyz)');
});

test('a shortened word says what it was cut from (パソコン from personal computer)', async () => {
  const t = await only('パソコン');
  const [s] = loanOf(t, 'loan-short');
  assert.equal(s.detail, 'personal computer');
  assert.deepEqual(covered(t, s), ['ぱそこん']);
});

// ── Each rule, both ways ─────────────────────────────────────────────────

/** type -> { yes: [word, detail, kana covered], no: [word, why] } */
const CASES = {
  'loan-vowel': { yes: ['ショップ', 'u', ['ぷ']], no: ['カメラ', 'camera ends in a vowel'] },
  'loan-double': { yes: ['カップ', 'p', ['っ']], no: ['クッキー', 'the oo of cookie is no single short vowel'] },
  'loan-long': { yes: ['カー', 'ar', ['ー']], no: ['コピー', 'the y of copy is no long vowel'] },
  'loan-f': { yes: ['ファイル', 'fa', ['ふぁ']], no: ['フグ', 'puffer fish is a Japanese word'] },
  'loan-lr': { yes: ['ホテル', 'l', ['る']], no: ['ライス', 'rice has an r, not an l'] },
  'loan-v': { yes: ['テレビ', 'b', ['び']], no: ['バス', 'bus has a b, not a v'] },
  'loan-th': { yes: ['マラソン', 's', ['そ']], no: ['サイズ', 'size has an s, not a th'] },
  'loan-si': { yes: ['タクシー', 'shi', ['し']], no: ['シャツ', 'shirt has sh, not si'] },
  'loan-wasei': { yes: ['ナイター', 'nighter', ['ないたー']], no: ['ゲーム', 'game is English'] },
  'loan-short': { yes: ['リモコン', 'remote control', ['りもこん']], no: ['コンピューター', 'computer is written in full'] },
};

test('every loanword rule has a case both ways, and nothing else does', () => {
  assert.deepEqual(Object.keys(CASES).sort(), [...LOAN_TYPES].sort());
  for (const type of LOAN_TYPES) assert.ok(type.startsWith('loan-') && isLoanType(type));
});

for (const type of LOAN_TYPES) {
  const { yes, no } = CASES[type];
  test(`${type}: found in ${yes[0]}`, async () => {
    const t = await only(yes[0]);
    const list = loanOf(t, type);
    assert.equal(list.length, 1, `${yes[0]} should carry one ${type}, has ${JSON.stringify(t.sounds)}`);
    assert.equal(list[0].detail, yes[1]);
    assert.deepEqual(covered(t, list[0]), yes[2]);
  });
  test(`${type}: not in ${no[0]} (${no[1]})`, async () => {
    const t = await only(no[0]);
    assert.deepEqual(loanOf(t, type), []);
  });
}

test('a word JMdict says is from another language gets none of the English rules (ビール is Dutch bier)', async () => {
  for (const text of ['ビール', 'アルバイト', 'アンケート', 'パン']) {
    const t = await only(text);
    assert.deepEqual(t.sounds.filter((s) => isLoanType(s.type)), [], text);
  }
});

test('only katakana words have loanword rules: not kana, kanji or a katakana name', async () => {
  for (const text of ['ありがとうございます。', '学校へ行きます。', 'マリアさん']) {
    const r = await run(text);
    for (const t of r.tokens) assert.deepEqual(t.sounds.filter((s) => isLoanType(s.type)), [], `${text}: ${t.surface}`);
  }
});

test('a compound is read part by part: each rule lands on its own part (ホットドッグ, インフォームショップ)', async () => {
  const hot = await only('ホットドッグ');
  assert.deepEqual(covered(hot, loanOf(hot, 'loan-double')[0]), ['っ', 'っ']);
  assert.deepEqual(covered(hot, loanOf(hot, 'loan-vowel')[0]), ['と', 'ぐ']);
  const shop = await only('インフォームショップ');
  // f from the katakana of the part the dictionary lacks; the rest from shop
  assert.deepEqual(covered(shop, loanOf(shop, 'loan-f')[0]), ['ふぉ']);
  assert.deepEqual(covered(shop, loanOf(shop, 'loan-double')[0]), ['っ']);
  assert.deepEqual(covered(shop, loanOf(shop, 'loan-vowel')[0]), ['ぷ']);
  assert.deepEqual(loanOf(shop, 'loan-long'), []);
});

test('every rule span lies inside the reading, and the sounds stay in order', async () => {
  const r = await run('パソコンでメールを書きます。コーヒーショップをさがしています。ゲームセンターのテレビ');
  for (const t of r.tokens) {
    let last = -1;
    for (const s of t.sounds) {
      for (const [a, b] of s.spans || [s.at]) assert.ok(a >= 0 && b <= t.reading.length && a < b, `${t.surface} ${s.type}`);
      assert.ok(s.at[0] >= last, `${t.surface} out of order`);
      last = s.at[0];
    }
  }
});

test('loanRules says nothing about a token that is not a katakana word', () => {
  assert.deepEqual(loanRules(null), []);
  assert.deepEqual(loanRules({ kind: 'word', surface: '学校', reading: 'がっこう', entry: { g: ['school'] } }), []);
  assert.deepEqual(loanRules({ kind: 'name', surface: 'マリア', reading: 'まりあ', entry: null }), []);
});

// ── The line-up ──────────────────────────────────────────────────────────

test('English is cut into consonants the way katakana keeps them', () => {
  const cls = (w) => englishUnits(w).map((u) => (u.soft === undefined ? u.cls : `${u.cls}?`)).join(' ');
  assert.equal(cls('form'), 'F R? M');
  assert.equal(cls('light'), 'L F? T');
  assert.equal(cls('shop'), 'SH P');
  assert.equal(cls('box'), 'B K S');
  assert.equal(cls('station'), 'S T TI N');
  assert.equal(cls('centre'), 'S N T R?');
  assert.equal(englishUnits('café'), null);
});

test('a gloss that is a description lines up with nothing, and a later sense of a native word is not read (サバ "server")', async () => {
  assert.equal(alignEntry('アルバイト', { g: ['part-time job'] }), null);
  // サバ is 鯖, usually written in kana (u); its second sense is slang
  assert.equal(alignEntry('サバ', { g: ['mackerel', 'server (esp. in an online game)'], u: 1 }), null);
  assert.ok(alignEntry('サバ', { g: ['mackerel', 'server'] }));
});

// ── The page's grouping ──────────────────────────────────────────────────

test('"In this text" counts loanword rules under their own group, and the Word panel lists them after the sounds', async () => {
  const r = await run('パソコンでメールを書きます。');
  const sum = summarize(r.tokens);
  assert.ok(sum.loan.has('loan-short'));
  assert.ok(sum.loan.has('loan-lr'));
  for (const id of sum.sounds.keys()) assert.ok(!id.startsWith('loan-'), id);
  const mail = r.tokens.find((t) => t.surface === 'メール');
  const refs = tokenNotes(mail).map((x) => x.id);
  const firstLoan = refs.findIndex((id) => id.startsWith('loan-'));
  assert.ok(firstLoan > 0 && refs.slice(firstLoan).every((id) => id.startsWith('loan-')), refs.join(' '));
});

// ── The notes ────────────────────────────────────────────────────────────

function strings(v, at = '') {
  if (typeof v === 'string') return [[at, v]];
  if (!v || typeof v !== 'object') return [];
  return Object.entries(v).flatMap(([k, x]) => strings(x, at ? `${at}.${k}` : k));
}

test('every loanword rule has a note, and every note a rule', () => {
  assert.deepEqual(Object.keys(LOAN_NOTES).sort(), [...LOAN_TYPES].sort());
});

for (const [id, note] of Object.entries(LOAN_NOTES)) {
  test(`loan note ${id}: English and Spanish everywhere, no em dash, no banned word, found as a sound and as a loan`, () => {
    for (const field of ['title', 'rule']) assert.ok(note[field].en && note[field].es, `${id}.${field}`);
    if (note.exception) assert.ok(note.exception.en && note.exception.es, `${id}.exception`);
    for (const e of note.examples) assert.ok(e.gloss.en && e.gloss.es, `${id} ${e.ja}`);
    if (note.pair) for (const side of ['with', 'without']) assert.ok(note.pair[side].gloss.en && note.pair[side].gloss.es);
    assert.ok(note.examples.length >= 2, `${id} needs two examples`);
    for (const [where, s] of strings(note)) {
      assert.ok(!s.includes(EM_DASH), `${id}.${where} has an em dash`);
      assert.ok(!BANNED.test(s), `${id}.${where} uses a banned word`);
    }
    for (const lang of ['en', 'es']) {
      assert.equal(noteFor('sound', id, lang).fallback, false);
      assert.equal(noteFor('loan', id, lang).title, noteFor('sound', id, lang).title);
    }
  });

  test(`loan note ${id}: every example's romaji is what kana.js writes`, () => {
    for (const e of note.examples) {
      assert.equal(e.said, said(e.ja), `${e.ja} said`);
      assert.equal(e.spelled, spelled(e.ja), `${e.ja} spelled`);
    }
    if (note.pair) for (const side of ['with', 'without']) assert.equal(note.pair[side].said, said(note.pair[side].ja), side);
  });

  test(`loan note ${id}: every example shows the rule when Yomu reads it`, async () => {
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
