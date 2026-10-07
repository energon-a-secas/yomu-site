// Where one word ends and the next begins, and why (js/gaps.js): the
// reasons one by one on hand-made units, then over the analyzer's own tokens
// for the committed data, then the positions, marks and score the game reads,
// and the Gaps preference.
//
//   node --test tests/gaps.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REASONS, NOSTART, scriptOf, reasonOf, gapsOf, gapsAround, unitsOf, isPrefix, slotsOf, codePointAt, checkLine,
  extraReason, wordsOf, pairAt,
} from '../js/gaps.js';
import { reasonKey } from '../js/render-gaps.js';
import { STRINGS } from '../js/strings.js';
import { run } from './helpers/disk.mjs';

const w = (surface, extra = {}) => ({ kind: 'word', surface, confidence: 'dict', ...extra });
const cp = (r, g) => codePointAt(r.text, g.at);
const brief = (r) => gapsOf(r.tokens).map((g) => `${cp(r, g)}${g.part ? 'p' : ''}:${g.why}`);

// ── One reason per edge ───────────────────────────────────────────────────

test('a particle or a copula on either side of the edge is its reason, before a change of script', () => {
  assert.deepEqual(reasonOf(w('私'), { kind: 'particle', surface: 'は' }), { why: 'particle', w: 'は' });
  assert.deepEqual(reasonOf({ kind: 'particle', surface: 'は' }, { kind: 'name', surface: 'マリア', confidence: 'dict' }), { why: 'particle', w: 'は' });
  assert.deepEqual(reasonOf({ kind: 'name', surface: 'マリア', confidence: 'dict' }, { kind: 'copula', surface: 'です' }), { why: 'copula', w: 'です' });
  // です|か: the particle after the edge is named, not the copula before it
  assert.deepEqual(reasonOf({ kind: 'copula', surface: 'です' }, { kind: 'particle', surface: 'か' }), { why: 'particle', w: 'か' });
});

test('a name the dictionary knows is the reason, with its own spelling; a guessed name is not', () => {
  const maria = { kind: 'name', surface: 'マリア', confidence: 'dict', name: { o: 'Maria', types: ['fem'] } };
  assert.deepEqual(reasonOf(maria, w('さん')), { why: 'name', w: 'マリア', o: 'Maria' });
  assert.deepEqual(reasonOf(w('田中', { kind: 'name' }), w('さん')), { why: 'name', w: '田中' });
  const guessed = { kind: 'name', surface: '鈴木', confidence: 'guess' };
  assert.equal(reasonOf(guessed, w('先生')).why, 'guess');
});

test('a change of script, read past a long-vowel bar', () => {
  assert.deepEqual(reasonOf(w('もう'), w('少し')), { why: 'script', from: 'hiragana', to: 'kanji' });
  assert.deepEqual(reasonOf(w('一枚'), w('お願いします')), { why: 'script', from: 'kanji', to: 'hiragana' });
  // すごーい ends in hiragana: the bar takes the script of the kana it lengthens
  assert.equal(reasonOf(w('すごーい'), w('ね')).why, 'word');
  assert.equal(scriptOf('ー'), 'katakana');
  assert.equal(scriptOf('５'), 'digit');
  assert.equal(scriptOf('A'), 'latin');
  assert.equal(scriptOf('、'), null);
});

test('inside katakana: a loanword ending, then a kana no word starts with, then two plain parts', () => {
  const part = (surface, entry = { g: ['x'] }) => ({ kind: 'katakana', surface, confidence: entry ? 'dict' : 'guess', entry });
  assert.deepEqual(reasonOf(part('クレアディルド', null), part('オナニー'), { inside: true }), { why: 'loan', w: 'クレアディルド', k: 'ド' });
  assert.deepEqual(reasonOf(part('ゴールド'), part('カード'), { inside: true }), { why: 'loan', w: 'ゴールド', k: 'ド' });
  assert.deepEqual(reasonOf(part('ピンク'), part('シャツ'), { inside: true }), { why: 'loan', w: 'ピンク', k: 'ク' });
  // ホテル ends in ル after テ, a beat with its own vowel: no loanword ending
  assert.deepEqual(reasonOf(part('ホテル'), part('ロビー'), { inside: true }), { why: 'compound', a: 'ホテル', b: 'ロビー' });
  assert.deepEqual(reasonOf(part('ラーメン'), part('ショップ'), { inside: true }), { why: 'nostart', k: 'ン' });
  assert.deepEqual(reasonOf(part('ギター'), part('ケース'), { inside: true }), { why: 'nostart', k: 'ー' });
  assert.deepEqual(reasonOf(part('インフォーム', null), part('ショップ'), { inside: true }), { why: 'guess' });
  for (const k of 'ンッーャュョァィゥェォ') assert.ok(NOSTART.has(k), k);
});

test('a dictionary word ends here: a plain word, a form of one, a number, a prefix', () => {
  assert.deepEqual(reasonOf(w('大人'), w('一枚')), { why: 'word', w: '大人' });
  assert.deepEqual(reasonOf({ kind: 'inflected', surface: '話して', base: '話す', confidence: 'dict' }, w('ください')), {
    why: 'word', w: '話して', f: 'form', base: '話す',
  });
  assert.deepEqual(reasonOf({ kind: 'number', surface: '十一時', confidence: 'rule' }, { kind: 'number', surface: '十五分', confidence: 'rule' }), {
    why: 'word', w: '十一時', f: 'number',
  });
  assert.deepEqual(reasonOf(w('お', { entry: { p: 'pref' } }), w('すすめ')), { why: 'word', w: 'お', f: 'prefix' });
  // また is "adv conj pref": an adverb first, so no prefix
  assert.ok(!isPrefix(w('また', { entry: { p: 'adv conj pref' } })));
  assert.ok(isPrefix(w('ご', { entry: { p: 'pref suf' } })));
});

test('every reason, and every kind of word, has a string in both languages', () => {
  const cases = [
    { why: 'particle' }, { why: 'copula' }, { why: 'name' }, { why: 'name', o: 'Tom' }, { why: 'script' }, { why: 'loan' },
    { why: 'nostart' }, { why: 'guess' }, { why: 'compound' }, { why: 'word' }, { why: 'word', f: 'form' }, { why: 'word', f: 'number' },
    { why: 'word', f: 'prefix' }, { why: 'nostart-extra' }, { why: 'inside' },
  ];
  for (const g of cases) {
    const key = reasonKey(g);
    assert.ok(key && STRINGS[key] && STRINGS[key].en && STRINGS[key].es, `${g.why} ${g.f || g.o || ''}`);
  }
  for (const why of REASONS) assert.ok(cases.some((g) => g.why === why), why);
  assert.equal(reasonKey({ why: 'nope' }), null);
});

// ── Over the analyzer's tokens ────────────────────────────────────────────

test('私はマリアです: a gap before and after the particle, and before the copula', async () => {
  const r = await run('私はマリアです');
  assert.deepEqual(brief(r), ['1:particle', '2:particle', '5:copula']);
  const g = gapsOf(r.tokens);
  assert.deepEqual(g.map((x) => [x.i, x.j, x.part]), [[0, 1, null], [1, 2, null], [2, 3, null]]);
  assert.deepEqual(gapsAround(g, 2), { before: g[1], inside: [], after: g[2] });
  assert.deepEqual(gapsAround(g, 0).before, null);
});

test('クレアディルドオナニー: one katakana word with two parts, the hairline at the loanword ending, a guess beside it', async () => {
  const r = await run('クレアディルドオナニー');
  assert.equal(r.tokens.length, 1);
  assert.deepEqual(unitsOf(r.tokens[0]).map((u) => [u.surface, u.confidence]), [['クレアディルド', 'guess'], ['オナニー', 'dict']]);
  const [g] = gapsOf(r.tokens);
  assert.deepEqual({ at: cp(r, g), part: g.part, why: g.why, k: g.k, guess: g.guess }, { at: 7, part: 1, why: 'loan', k: 'ド', guess: true });
});

test('a compound beside the words of its sentence: parts first, then the particles', async () => {
  assert.deepEqual(brief(await run('テニストーナメントに出ます。')), ['3p:compound', '9:particle', '10:particle']);
  assert.deepEqual(brief(await run('駅の前にラーメンショップがあります。')), [
    '1:particle', '2:particle', '3:particle', '4:particle', '8p:nostart', '12:particle', '13:particle',
  ]);
  assert.deepEqual(brief(await run('ゴールドカードで払います。')), ['4p:loan', '7:particle', '8:particle']);
});

test('no gap beside punctuation, a space or Latin letters, and none inside a word with no parts', async () => {
  assert.deepEqual(brief(await run('はい、どうぞ。')), []);
  assert.deepEqual(brief(await run('コーヒーショップ')), [], 'one dictionary word');
  const r = await run('Tシャツを買った');
  for (const g of gapsOf(r.tokens)) {
    assert.notEqual(r.tokens[g.i].kind, 'latin');
    assert.notEqual(r.tokens[g.j].kind, 'latin');
  }
});

// ── Positions, marks and the score (the game) ─────────────────────────────

test('the places of a line are between two characters words are made of, never beside punctuation', () => {
  assert.deepEqual(slotsOf('これをください'), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(slotsOf('はい、どうぞ。'), [1, 4, 5]);
  assert.deepEqual(slotsOf('「やさしい」は'), [2, 3, 4]);
  assert.deepEqual(slotsOf(''), []);
  assert.equal(codePointAt('𠮷野家です', 3), 2, 'a character outside the BMP is one place');
});

test('a check counts the spaces placed right minus the extras, never below nothing', () => {
  assert.deepEqual(checkLine([2, 3], [2, 3]), { right: [2, 3], extra: [], missing: [], score: 2 });
  assert.deepEqual(checkLine([2, 3], [3, 5, 1]), { right: [3], extra: [1, 5], missing: [2], score: 0 });
  assert.deepEqual(checkLine([2, 3, 6], [2, 3, 4]), { right: [2, 3], extra: [4], missing: [6], score: 1 });
  assert.equal(checkLine([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]).score, 6);
  assert.equal(checkLine([2], [1, 2, 3, 4, 5, 6]).score, 0, 'marking every place scores nothing');
});

test('an extra space names the word it cut, or the kana that starts no word', () => {
  const key = [2, 3];
  assert.deepEqual(wordsOf('これをください', key).map((x) => x.text), ['これ', 'を', 'ください']);
  assert.deepEqual(pairAt('これをください', key, 3), ['を', 'ください']);
  assert.deepEqual(extraReason('これをください', key, 5), { why: 'inside', w: 'ください' });
  assert.deepEqual(extraReason('ラーメンショップ', [4], 3), { why: 'nostart-extra', k: 'ン' });
  assert.deepEqual(wordsOf('はい、どうぞ。', []).map((x) => x.text), ['はい', 'どうぞ']);
});

// ── The preference ────────────────────────────────────────────────────────

test('Gaps is off by default, saved through the prefs store, and read back only as a boolean', async () => {
  const disk = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k) },
    configurable: true,
    writable: true,
  });
  const { state, loadPrefs, savePrefs } = await import('../js/state.js');
  const loc = { search: '' };
  const nav = { languages: ['en'] };
  assert.equal(state.prefs.gaps, false);
  assert.equal(state.prefs.gapsSeen, false);
  state.prefs.gaps = true;
  state.prefs.gapsSeen = true;
  assert.equal(savePrefs(state), true);
  const saved = JSON.parse(disk.get('yomu-site:preferences'));
  assert.equal(saved.data.gaps, true);
  assert.equal(saved.data.gapsSeen, true);
  const s = { prefs: { ...state.prefs, gaps: false, gapsSeen: false } };
  loadPrefs(s, loc, nav);
  assert.equal(s.prefs.gaps, true);
  assert.equal(s.prefs.gapsSeen, true);
  // a stale or hand-edited value is dropped, not trusted
  disk.set('yomu-site:preferences', JSON.stringify({ __v: 1, data: { gaps: 'yes', gapsSeen: 1 } }));
  const t = { prefs: { ...state.prefs, gaps: false, gapsSeen: false } };
  loadPrefs(t, loc, nav);
  assert.equal(t.prefs.gaps, false);
  assert.equal(t.prefs.gapsSeen, false);
});
