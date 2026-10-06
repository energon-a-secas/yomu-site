// History under plain node: what makes two texts the same text, the reading
// session rule (a reload records nothing, an edit leaves no draft behind),
// what "you read this before" knows, the two caps, the store's damaged copy,
// and the sentence a kanji was last seen in. Every time is passed in.
//
// The store is the real Persist kit over a fake localStorage, so a reload is
// two page loads over one storage, as in tests/kanji-store.test.mjs.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  KEY, DAMAGED_KEY, MAX_TEXT, MAX_ENTRIES, MAX_CHARS, MIN_PARTIAL, MAX_AROUND,
  emptyHistory, normalizeText, textKey, clipText, validate, recordText, partialMatch, evict,
  forget, forgetAll, list, sentenceAround, openHistory,
} from '../js/history-store.js';
import { HISTORY_KEY, KEY as KANJI_KEY, openKanji } from '../js/kanji-store.js';

let disk;
let writes;
beforeEach(() => {
  disk = new Map();
  writes = 0;
  const fake = {
    getItem: (k) => (disk.has(k) ? disk.get(k) : null),
    setItem: (k, v) => { writes += 1; disk.set(k, String(v)); },
    removeItem: (k) => { disk.delete(k); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
});

const pageLoad = () => openHistory().load();
const A = '今日は雨が降っています。';
const B = '明日は晴れるでしょう。';
const C = '駅の前で友だちに会いました。';

// ── Keys ──────────────────────────────────────────────────────────────────

test('normalizing: NFKC, every run of whitespace one space, trimmed', () => {
  assert.equal(normalizeText('  今日は\n\n\t雨　です  '), '今日は 雨 です');
  assert.equal(normalizeText('ＡＢＣ１２３'), 'ABC123');
  assert.equal(normalizeText('ｶﾞｯｺｳ'), 'ガッコウ');
  assert.equal(normalizeText(null), '');
});

test('a key is stable, the same for the same text however it is spaced, and never the text', () => {
  // Pinned: a key that changes orphans every History entry and every kanji's
  // pointer to the text it was last seen in.
  assert.equal(textKey(A), textKey(` ${A}\n`));
  assert.equal(textKey('今日は 雨'), textKey('今日は\n\n雨 '));
  assert.equal(textKey('今日は 雨'), textKey('今日は　雨'), 'an ideographic space is a space');
  assert.equal(textKey('今日は 雨'), 'x1aniwgc6s');
  assert.equal(textKey(''), textKey('   '));
  assert.notEqual(textKey(A), textKey(B));
  assert.notEqual(textKey('今日は雨'), textKey('今日は 雨'), 'a space inside is part of the text');
  for (const t of [A, B, 'x', '𠮟る', 'a'.repeat(5000)]) {
    assert.match(textKey(t), HISTORY_KEY);
    assert.ok(!textKey(t).includes(t.slice(0, 2)));
  }
});

test('a kept text is at most 2,000 characters and never cut inside a surrogate pair', () => {
  assert.equal(clipText(A), A);
  assert.equal(clipText('a'.repeat(MAX_TEXT + 5)).length, MAX_TEXT);
  const pair = `${'a'.repeat(MAX_TEXT - 1)}𠮟b`;
  assert.equal(clipText(pair), 'a'.repeat(MAX_TEXT - 1), 'the pair is dropped, not split');
  const d = emptyHistory();
  recordText(d, `${'雨'.repeat(2500)}`, 1, 'paste', 10);
  assert.equal(Object.values(d.entries)[0].t.length, MAX_TEXT);
});

// ── Recording ─────────────────────────────────────────────────────────────

test('a first read is kept with nothing known before it', () => {
  const d = emptyHistory();
  assert.equal(recordText(d, A, 1, 'paste', 100), null);
  assert.deepEqual(d.entries[textKey(A)], { t: A, first: 100, last: 100, n: 1, src: 'paste', s: 1 });
  assert.deepEqual(d.session, { id: 1, key: textKey(A), before: null });
});

test('the same text read again in the same session changes nothing, and says what it said', () => {
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100);
  recordText(d, B, 2, 'example', 200);
  const before = recordText(d, A, 3, 'link', 300);
  assert.deepEqual(before, { n: 1, first: 100, last: 100, src: 'paste' });
  const snapshot = JSON.stringify(d);
  assert.deepEqual(recordText(d, A, 3, 'link', 400), before);
  assert.deepEqual(recordText(d, `${A}  `, 3, 'link', 500), before, 'respaced is the same text');
  assert.equal(JSON.stringify(d), snapshot);
});

test('a new session reading a text again counts it, takes its kind, and says how it was before', () => {
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100);
  const before = recordText(d, A, 2, 'history', 900);
  assert.deepEqual(before, { n: 1, first: 100, last: 100, src: 'paste' });
  assert.deepEqual(d.entries[textKey(A)], { t: A, first: 100, last: 900, n: 2, src: 'history', s: 1 });
});

test('an edit within a session leaves no draft behind', () => {
  // Session 5 began at 90: a draft is deleted only by a session whose start is known.
  const d = emptyHistory();
  recordText(d, '今日', 5, 'typed', 100, true, 90);
  recordText(d, '今日は', 5, 'typed', 110, true, 90);
  recordText(d, '今日は雨', 5, 'typed', 120, true, 90);
  assert.deepEqual(Object.keys(d.entries), [textKey('今日は雨')]);
  assert.equal(d.entries[textKey('今日は雨')].n, 1);
});

test('an edit away from a text read in an earlier session keeps that text', () => {
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100);
  recordText(d, A, 2, 'paste', 200, true, 150);           // session 2 began at 150; read again: n 2
  recordText(d, `${A}そして`, 2, 'paste', 210, true, 150);  // then edited in the same session
  assert.equal(d.entries[textKey(A)].n, 2, 'not a draft: it was read before this session');
  assert.ok(d.entries[textKey(`${A}そして`)]);
  // A text read once in another session is not this session's draft either.
  const e = emptyHistory();
  recordText(e, B, 1, 'paste', 100);
  recordText(e, A, 2, 'paste', 200, true, 150);
  recordText(e, B, 2, 'paste', 210, true, 150);
  recordText(e, `${B}か`, 2, 'paste', 220, true, 150);
  assert.ok(e.entries[textKey(B)], 'B came from session 1');
  assert.equal(e.entries[textKey(A)], undefined, 'A was session 2\'s draft');
});

test('a session deletes only the drafts it made: a kanji store reset by damage reuses an old session\'s id', () => {
  // Session 1 began at 90 and read A once. Then the kanji store was damaged
  // and started empty, so its sessions counted from 0 again, and a new
  // session 1 began at 5000. A is no draft of it, whatever its id says.
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100, true, 90);
  recordText(d, B, 1, 'typed', 5010, true, 5000);
  assert.ok(d.entries[textKey(A)], 'A was read before this session began');
  recordText(d, `${B}か`, 1, 'typed', 5020, true, 5000);
  assert.equal(d.entries[textKey(B)], undefined, 'B was typed in this session: a draft');
  assert.deepEqual(Object.keys(d.entries).sort(), [textKey(A), textKey(`${B}か`)].sort());
});

test('a session whose start is unknown (a kanji store from before `at`) deletes nothing', () => {
  for (const at of [undefined, null, 0, -5, NaN, '90']) {
    const d = emptyHistory();
    recordText(d, '今日', 5, 'typed', 100, true, at);
    recordText(d, '今日は', 5, 'typed', 110, true, at);
    assert.deepEqual(Object.keys(d.entries).sort(), [textKey('今日'), textKey('今日は')].sort(), String(at));
  }
});

test('the two stores together: a fresh store\'s first session leaves no drafts, and a damaged one takes no old text for one', () => {
  // A first visit: nothing is stored, so session 0 starts when the page
  // loads, and an edit in it deletes the draft it leaves.
  let kanji = openKanji().load(1000);
  let history = pageLoad();
  const read = (text, now) => history.record(text, kanji.sessionId, kanji.sessionSource, now, true, kanji.sessionAt);
  read('今日は', 1100);
  read(A, 1200);
  assert.deepEqual(history.list().map((e) => e.t), [A]);
  // The kanji store is damaged: the next page starts it empty, its sessions
  // count from 0 again, and session 0 is the one that read A.
  disk.set(KANJI_KEY, '{"__v":1,"data":{"se');
  kanji = openKanji().load(5000);
  history = pageLoad();
  assert.deepEqual([kanji.note, kanji.sessionId, history.data.session.id], ['damaged', 0, 0]);
  read(B, 5100);
  assert.deepEqual(history.list().map((e) => e.t), [B, A], 'A was read before this session 0 began');
  kanji.beginSession('paste', 6000);
  read(C, 6100);
  read(`${C}よ`, 6200);
  assert.deepEqual(pageLoad().list().map((e) => e.t), [`${C}よ`, B, A], 'a draft of this session still goes');
});

test('"before" is kept with the session, so a reload of the same session still knows it', () => {
  let page = pageLoad();
  page.record(A, 1, 'paste', 100);
  page.record(B, 2, 'paste', 200);
  const before = page.record(A, 3, 'paste', 300);
  assert.deepEqual(before, { n: 1, first: 100, last: 100, src: 'paste' });
  const raw = disk.get(KEY);
  const count = writes;
  page = pageLoad();
  assert.deepEqual(page.record(A, 3, 'paste', 999), before);
  assert.equal(writes, count, 'a reload records nothing');
  assert.equal(disk.get(KEY), raw);
  assert.deepEqual(page.beforeOf(3, textKey(A)), before);
  assert.equal(page.beforeOf(4, textKey(A)), null);
});

// ── Part of a text read before ────────────────────────────────────────────

test('a text inside a remembered one, or holding one, is a partial match; the most recent wins', () => {
  const d = emptyHistory();
  recordText(d, `${A}${B}`, 1, 'paste', 100);
  recordText(d, A, 2, 'paste', 200);
  recordText(d, 'まったく別の文章です。', 3, 'paste', 300);
  // B is inside the first text only.
  assert.deepEqual(recordText(d, B, 4, 'paste', 400), { partial: { kind: 'inside', last: 100, n: 1 } });
  // This one holds A (last 200) and the first text holds it... it holds A only.
  assert.deepEqual(recordText(d, `前置き。${A}`, 5, 'paste', 500), { partial: { kind: 'holds', last: 200, n: 1 } });
  // Inside the first text (last 100) and holding nothing: inside.
  const e = emptyHistory();
  recordText(e, `${A}${B}`, 1, 'paste', 100);
  recordText(e, `${A}${B}おしまい`, 2, 'paste', 150);
  assert.deepEqual(partialMatch(e, normalizeText(A), 9), { partial: { kind: 'inside', last: 150, n: 1 } }, 'the most recent of two');
});

test('a partial match needs six characters on the shorter side, and ignores this session\'s draft', () => {
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100);
  assert.equal(recordText(d, '今日は', 2, 'paste', 200), null, `${[...'今日は'].length} < ${MIN_PARTIAL}: a word, not a text`);
  const e = emptyHistory();
  recordText(e, '雨です', 1, 'paste', 100);
  assert.equal(recordText(e, `今日は雨ですね。`, 2, 'paste', 200), null, 'an entry under six characters is not held');
  const f = emptyHistory();
  recordText(f, '今日は雨が降って', 7, 'typed', 100);
  assert.equal(partialMatch(f, normalizeText('今日は雨が降っています'), 7), null, 'typed a moment ago in this session');
  assert.ok(partialMatch(f, normalizeText('今日は雨が降っています'), 8));
});

test('with the session\'s start known, an older session that had the same id is a partial match again', () => {
  const f = emptyHistory();
  recordText(f, '今日は雨が降って', 7, 'typed', 100, true, 90);
  const norm = normalizeText('今日は雨が降っています');
  assert.equal(partialMatch(f, norm, 7, 90), null, 'typed in this session, begun at 90');
  assert.deepEqual(partialMatch(f, norm, 7, 500), { partial: { kind: 'holds', last: 100, n: 1 } },
    'read before this session 7 began at 500: an old session of the same id, after a damaged kanji store');
});

// ── The caps ──────────────────────────────────────────────────────────────

test(`at most ${MAX_ENTRIES} texts: the least recently read goes, never the one just read`, () => {
  const d = emptyHistory();
  for (let i = 0; i < MAX_ENTRIES; i += 1) recordText(d, `文${i}です。`, i + 1, 'paste', 1000 + i);
  assert.equal(Object.keys(d.entries).length, MAX_ENTRIES);
  recordText(d, '新しい文です。', 9999, 'paste', 5000);
  assert.equal(Object.keys(d.entries).length, MAX_ENTRIES);
  assert.equal(d.entries[textKey('文0です。')], undefined, 'the oldest went');
  assert.ok(d.entries[textKey('文1です。')]);
  // A text read with a clock behind every other is still kept: it is the current one.
  recordText(d, 'もう一つの文です。', 10000, 'paste', 1);
  assert.ok(d.entries[textKey('もう一つの文です。')]);
  assert.equal(d.entries[textKey('文1です。')], undefined);
});

test(`at most ${MAX_CHARS.toLocaleString('en')} characters in all, whatever the count`, () => {
  const d = emptyHistory();
  const long = (i) => `${i}${'あ'.repeat(MAX_TEXT - 4)}`;
  for (let i = 0; i < 150; i += 1) recordText(d, long(i), i + 1, 'paste', 100 + i);
  const size = () => Object.values(d.entries).reduce((n, e) => n + e.t.length, 0);
  assert.ok(size() <= MAX_CHARS);
  assert.equal(Object.keys(d.entries).length, 150);
  recordText(d, long(150), 151, 'paste', 999);
  assert.ok(size() <= MAX_CHARS, `${size()}`);
  assert.equal(d.entries[textKey(long(0))], undefined);
  assert.ok(d.entries[textKey(long(150))]);
  assert.deepEqual(evict(d, null), [], 'within both caps nothing more goes');
});

// ── Forgetting ────────────────────────────────────────────────────────────

test('list is newest first; forget drops one, forget all drops every text and keeps the session\'s place', () => {
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100);
  recordText(d, B, 2, 'phrase', 300);
  recordText(d, A, 3, 'history', 500);
  assert.deepEqual(list(d).map((e) => [e.t, e.n, e.src]), [[A, 2, 'history'], [B, 1, 'phrase']]);
  assert.equal(forget(d, textKey(B)), true);
  assert.equal(forget(d, textKey(B)), false);
  assert.deepEqual(list(d).map((e) => e.t), [A]);
  assert.ok(d.session.before, 'A was read before session 3');
  forget(d, textKey(A));
  assert.equal(d.session.before, null, 'nothing to say about a forgotten text');
  assert.equal(d.session.key, textKey(A), 'and a reload does not bring it back');
  assert.equal(recordText(d, A, 3, 'history', 600), null);
  assert.deepEqual(d.entries, {});
  recordText(d, B, 4, 'paste', 700);
  forgetAll(d);
  assert.deepEqual(d.entries, {});
  assert.deepEqual(d.session, { id: 4, key: textKey(B), before: null });
});

test('the store: forget all and erase leave no text behind, the damaged copy included', () => {
  disk.set(KEY, '{"__v":1,"data":{"entries":');
  let page = pageLoad();
  assert.equal(page.note, 'damaged');
  assert.ok(disk.has(DAMAGED_KEY));
  page.record(A, 1, 'paste', 100);
  page.forgetAll();
  assert.equal(disk.has(DAMAGED_KEY), false);
  assert.ok(!disk.get(KEY).includes('雨'));
  page.record(B, 2, 'paste', 200);
  page = pageLoad();
  assert.equal(page.size, 1);
  page.erase();
  assert.equal(disk.has(KEY), false);
  assert.equal(page.size, 0);
  assert.equal(pageLoad().size, 0);
});

test('opening the store writes nothing: a learner who never turned it on has none', () => {
  pageLoad();
  pageLoad().list();
  assert.equal(writes, 0);
  assert.equal(disk.has(KEY), false);
});

// ── A damaged store ───────────────────────────────────────────────────────

test('a store that is not JSON opens empty, says so, and keeps the old copy', () => {
  disk.set(KEY, '{"__v":1,"data":{"entr');
  const page = pageLoad();
  assert.equal(page.note, 'damaged');
  assert.deepEqual(page.data, emptyHistory());
  assert.equal(disk.get(DAMAGED_KEY), '{"__v":1,"data":{"entr');
  page.record(A, 1, 'paste', 100);
  assert.equal(pageLoad().note, null);
  assert.equal(pageLoad().size, 1);
});

test('entries that do not read are left out and counted, the rest kept', () => {
  const good = { t: A, first: 100, last: 200, n: 2, src: 'paste', s: 1 };
  disk.set(KEY, JSON.stringify({
    __v: 1,
    data: {
      entries: {
        [textKey(A)]: good,
        [textKey(B)]: { ...good, t: A },                   // the key of another text
        ABC: { ...good, t: B },                            // not a key
        [textKey('x')]: { ...good, t: 'x', src: 'mail' },  // no such source
        [textKey('y')]: { ...good, t: 'y', n: 0 },
        [textKey('z'.repeat(MAX_TEXT + 1))]: { ...good, t: 'z'.repeat(MAX_TEXT + 1) },
      },
      session: { id: 3, key: textKey(A), before: { partial: { kind: 'inside', last: 50, n: 1 } } },
    },
  }));
  const page = pageLoad();
  assert.equal(page.note, 'partial');
  assert.equal(page.dropped, 5);
  assert.deepEqual(Object.keys(page.data.entries), [textKey(A)]);
  assert.deepEqual(page.data.session.before, { partial: { kind: 'inside', last: 50, n: 1 } });
  assert.ok(disk.has(DAMAGED_KEY));
});

test('validate never throws on anything stored', () => {
  for (const raw of [null, undefined, 0, 'x', [], { entries: [] }, { entries: { a: null } }, { session: 'x' },
    { session: { id: -1, key: 'a' } }, { session: { id: 1, key: 'a', before: { partial: 'x' } } }]) {
    assert.doesNotThrow(() => validate(raw));
  }
  assert.equal(validate({ session: { id: 1, key: 'NOT A KEY', before: null } }).dropped, 1);
});

// ── The sentence a kanji was last seen in ─────────────────────────────────

test('the sentence around the last occurrence, ended by 。！？!? or a line break, trimmed', () => {
  assert.deepEqual(sentenceAround(`${A}明日も雨？うん。`, '雨'), { before: '明日も', ch: '雨', after: '？' });
  assert.deepEqual(sentenceAround('一行目\n  二行目の雨です。  ', '雨'), { before: '二行目の', ch: '雨', after: 'です。' });
  assert.deepEqual(sentenceAround('雨', '雨'), { before: '', ch: '雨', after: '' });
  assert.deepEqual(sentenceAround('Rain! 雨だ!', '雨'), { before: '', ch: '雨', after: 'だ!' });
  assert.deepEqual(sentenceAround('𠮟られた。', '𠮟'), { before: '', ch: '𠮟', after: 'られた。' });
  assert.equal(sentenceAround(A, '晴'), null);
  assert.equal(sentenceAround(null, '雨'), null);
});

test('a long sentence is clipped around the kanji, an ellipsis on each side that was cut', () => {
  const left = 'あ'.repeat(100);
  const right = 'い'.repeat(100);
  const both = sentenceAround(`${left}雨${right}`, '雨');
  assert.equal([...both.before, both.ch, ...both.after].length, MAX_AROUND);
  assert.ok(both.before.startsWith('…') && both.after.endsWith('…'));
  const near = sentenceAround(`あいう雨${right}`, '雨');
  assert.equal(near.before, 'あいう', 'the near side is whole, with no ellipsis');
  assert.ok(near.after.endsWith('…'));
  assert.equal([...near.before, near.ch, ...near.after].length, MAX_AROUND);
  const short = sentenceAround(`${left.slice(0, 10)}雨${right.slice(0, 10)}`, '雨');
  assert.ok(!short.before.includes('…') && !short.after.includes('…'));
});
