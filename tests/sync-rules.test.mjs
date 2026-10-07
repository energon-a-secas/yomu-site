// The merge rules of sync (js/sync-rules.js), which the page and the Convex
// functions both run. Every case is joined in both orders and again with its
// own result, because two devices sync in either order and a row pushed twice
// must change nothing. The last tests throw seeded random rows at the joins.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  joinKanji, joinPhrase, joinPlay, joinPrefs, cleanKanjiRow, cleanPhraseRow, cleanPlay, cleanPrefs,
  rankWords, same, SOURCES, isKanji, GAMES, MAX_MIXED, PREFS, MAX_WORDS,
} from '../js/sync-rules.js';
import { SOURCES as STORE_SOURCES, MAX_WORDS as STORE_WORDS, TOP_BOX } from '../js/kanji-store.js';
import { isKanji as kanaIsKanji } from '../js/kana.js';
import { TOP, MAX_MIXED as PLAY_MIXED } from '../js/play-store.js';
import { ROMAJI, UNSAVED } from '../js/state.js';
import { LANGS } from '../js/strings.js';
import { textKey } from '../js/history-text.js';

const T = (n) => 1_700_000_000_000 + n * 1000;

/** join in both orders, both equal; joining the result again with either side changes nothing. */
function both(join, a, b, ...rest) {
  const ab = join(a, b, ...rest);
  const ba = join(b, a, ...rest);
  assert.ok(same(ab, ba), `not commutative:\n${JSON.stringify(ab)}\n${JSON.stringify(ba)}`);
  assert.ok(same(join(ab, a, ...rest), ab), 'joining the result with the first side changed it');
  assert.ok(same(join(ab, b, ...rest), ab), 'joining the result with the second side changed it');
  assert.ok(same(join(ab, ab, ...rest), ab), 'not idempotent');
  return ab;
}

const saved = (at, extra = {}) => ({ at, box: 0, due: '2026-10-01', reviews: 0, lapses: 0, s: at, ...extra });
const seen = (n, first, last, words = [], extra = {}) => ({ n, first, last, words, e: 0, ...extra });
const krow = (fields) => cleanKanjiRow({ char: '天', saved: null, removed: 0, seen: null, ...fields });

test('the rules repeat the stores\' own constants and kanji test exactly', () => {
  assert.deepEqual([...SOURCES], [...STORE_SOURCES]);
  assert.equal(MAX_WORDS, STORE_WORDS);
  assert.equal(TOP_BOX, 5);
  assert.deepEqual({ ...GAMES }, { ...TOP });
  assert.equal(MAX_MIXED, PLAY_MIXED);
  assert.deepEqual(PREFS.lang, [...LANGS]);
  assert.deepEqual(PREFS.romaji, [...ROMAJI]);
  assert.deepEqual(PREFS.unsaved, [...UNSAVED]);
  for (let cp = 0x3000; cp < 0xa000; cp += 1) {
    const ch = String.fromCodePoint(cp);
    assert.equal(isKanji(ch), kanaIsKanji(ch), ch);
  }
  for (const ch of ['𠀋', '𪚲', '々', '〆', 'ヶ', 'a', 'あ']) assert.equal(isKanji(ch), kanaIsKanji(ch), ch);
});

test('seen counts: the higher count, the earliest first day, the latest last day', () => {
  const a = krow({ seen: seen(3, '2026-09-01', '2026-09-10') });
  const b = krow({ seen: seen(5, '2026-09-04', '2026-09-08') });
  const j = both(joinKanji, a, b);
  assert.equal(j.seen.n, 5);
  assert.equal(j.seen.first, '2026-09-01');
  assert.equal(j.seen.last, '2026-09-10');
});

test('where a kanji was last met goes with the later last day, and a tie is the same either way', () => {
  const a = krow({ seen: seen(1, '2026-09-01', '2026-09-10', [], { src: 'paste', h: 'abc' }) });
  const b = krow({ seen: seen(1, '2026-09-01', '2026-09-12', [], { src: 'example' }) });
  const j = both(joinKanji, a, b);
  assert.equal(j.seen.src, 'example');
  assert.equal(j.seen.h, undefined, 'h comes with the same copy as src, never mixed');
  const c = krow({ seen: seen(1, '2026-09-01', '2026-09-12', [], { src: 'typed', h: 'zz' }) });
  both(joinKanji, b, c);
});

test('words: a union of at most eight, the most recently met kept, oldest first', () => {
  const w = (i, d) => [`日${i}`, `に${i}`, d];
  const a = krow({ seen: seen(9, '2026-01-01', '2026-09-01', [1, 2, 3, 4, 5].map((i) => w(i, `2026-0${i}-01`))) });
  const b = krow({ seen: seen(4, '2026-01-01', '2026-09-09', [6, 7, 8, 9].map((i) => w(i, '2026-09-09')).concat([w(1, '2026-09-09')])) });
  const j = both(joinKanji, a, b);
  // Nine words in the union: 日2, met last on 2026-02-01, is the oldest and goes.
  assert.deepEqual(j.seen.words.map((x) => x[0]), ['日3', '日4', '日5', '日1', '日6', '日7', '日8', '日9']);
  assert.ok(j.seen.words.some((x) => x[0] === '日1' && x[2] === '2026-09-09'), 'a word met again takes its later day');
  // Nine met on one day: eight are kept, chosen by the word, the same eight in either order.
  const day = (lo) => krow({ seen: seen(1, '2026-09-09', '2026-09-09', [1, 2, 3, 4, 5].map((i) => w(i + lo, '2026-09-09'))) });
  const same9 = both(joinKanji, day(0), day(4));
  assert.equal(same9.seen.words.length, MAX_WORDS);
  assert.ok(!same9.seen.words.some((x) => x[0] === '日9'));
});

test('schedules: the one with more reviews wins, lapses the max, the earliest save', () => {
  const a = krow({ saved: saved(T(1), { box: 3, due: '2026-10-09', reviews: 4, lapses: 1 }) });
  const b = krow({ saved: saved(T(2), { box: 1, due: '2026-10-02', reviews: 2, lapses: 2 }) });
  const j = both(joinKanji, a, b);
  assert.deepEqual(j.saved, { at: T(1), box: 3, due: '2026-10-09', reviews: 4, lapses: 2, s: T(2) });
  // mergeInto keeps this browser's schedule on a tie; sync takes the later due, then the higher box.
  const c = krow({ saved: saved(T(1), { box: 2, due: '2026-10-05', reviews: 4, lapses: 0 }) });
  assert.equal(both(joinKanji, a, c).saved.due, '2026-10-09');
});

test('unsaving: a removal newer than the save wins, and the tombstone is kept', () => {
  const kept = krow({ saved: saved(T(1)), seen: seen(2, '2026-09-01', '2026-09-02') });
  const gone = krow({ removed: T(5), seen: seen(2, '2026-09-01', '2026-09-02') });
  const j = both(joinKanji, kept, gone);
  assert.equal(j.saved, null);
  assert.equal(j.removed, T(5));
  assert.equal(j.seen.n, 2, 'unsaving a kanji never forgets that it was met');
  // A third device that never heard of the removal pushes its old copy later.
  assert.equal(both(joinKanji, j, krow({ saved: saved(T(1), { reviews: 9 }) })).saved, null);
  // Even with no count, the row stays as a tombstone.
  const bare = both(joinKanji, krow({ saved: saved(T(1)) }), krow({ removed: T(5) }));
  assert.deepEqual(bare, { char: '天', saved: null, removed: T(5), seen: null });
});

test('saving again after a removal wins over the removal, and starts the schedule afresh', () => {
  const old = krow({ saved: saved(T(1), { box: 4, reviews: 7 }) });
  const gone = krow({ removed: T(5) });
  // The device that saves again knew of the removal (it made it, or pulled
  // it), so its row carries the removal too.
  const again = krow({ saved: saved(T(9)), removed: T(5) });
  const j = both(joinKanji, both(joinKanji, old, gone), again);
  assert.deepEqual(j.saved, saved(T(9)));
  assert.ok(same(joinKanji(joinKanji(old, again), gone), j), 'the old schedule comes back in no order');
  assert.ok(same(joinKanji(old, joinKanji(again, gone)), j));
});

test('the one grouping that differs: two saves made apart, merged before an older removal reaches them', () => {
  // Saved on A at T1 (7 reviews) and, never having had it, on C at T9; the
  // two meet first, then B's removal at T5 (B saw only A's save). The kanji
  // stays saved in every order, since C's save is newer than the removal;
  // which schedule it keeps depends on the order the server saw them in.
  // CLAUDE.md, "Accounts and sync", names this case.
  const a = krow({ saved: saved(T(1), { box: 4, reviews: 7 }) });
  const c = krow({ saved: saved(T(9)) });
  const b = krow({ removed: T(5) });
  const first = joinKanji(joinKanji(a, c), b);
  const second = joinKanji(a, joinKanji(c, b));
  assert.ok(first.saved && second.saved);
  assert.equal(first.saved.reviews, 7);
  assert.equal(second.saved.reviews, 0);
});

test('a save is compared with a removal by its latest save, so two saves merged earlier survive an older removal', () => {
  // Saved on two devices independently (T1 and T9), merged; a removal at T5
  // from a device that saw only the first arrives afterwards.
  const merged = both(joinKanji, krow({ saved: saved(T(1)) }), krow({ saved: saved(T(9)) }));
  assert.equal(merged.saved.at, T(1), 'the earliest save is the one shown');
  const j = both(joinKanji, merged, krow({ removed: T(5) }));
  assert.ok(j.saved, 'the save at T9 is newer than the removal');
});

test('Clear all: saves not newer than it go, counts made before a device heard of it go, newer ones stay', () => {
  const clear = T(10);
  const before = krow({ saved: saved(T(3)), seen: seen(6, '2026-01-01', '2026-09-30', [], { e: 0 }) });
  const after = krow({ saved: saved(T(12)), seen: seen(1, '2026-10-01', '2026-10-01', [], { e: clear }) });
  const j = both(joinKanji, before, after, clear);
  assert.deepEqual(j.saved, saved(T(12)));
  assert.equal(j.seen.n, 1, 'the six texts counted before the clear do not come back');
  assert.equal(j.seen.e, clear);
  assert.equal(joinKanji(before, null, clear), null, 'a row the clear empties is no row');
  // A device that knew the clear says so through its counts' `e`, even when
  // the other side was not told: the stale copy goes either way.
  assert.ok(same(joinKanji(before, after), j));
  // A removal older than the clear is covered by it, and dropped.
  assert.equal(joinKanji(krow({ removed: T(4) }), null, clear), null);
  assert.equal(joinKanji(krow({ removed: T(14) }), null, clear).removed, T(14));
});

const phrase = (t, extra = {}) => ({ t, first: T(1), last: T(2), n: 1, src: 'paste', saved: T(1), s: T(1), ...extra });
const prow = (t, fields) => cleanPhraseRow({ key: textKey(t), removed: 0, phrase: null, ...fields });

test('phrases: higher count, earliest first, latest last (its kind of text with it), earliest save', () => {
  const t = '雨が降っています。';
  const a = prow(t, { phrase: phrase(t, { n: 3, last: T(5), src: 'example', saved: T(2), s: T(2) }) });
  const b = prow(t, { phrase: phrase(t, { n: 2, first: T(0.5), last: T(4), src: 'paste', saved: T(1), s: T(3) }) });
  const j = both(joinPhrase, a, b);
  assert.deepEqual(j.phrase, { t, first: T(0.5), last: T(5), n: 3, src: 'example', saved: T(1), s: T(3) });
});

test('unsaving a phrase: the removal wins over an older save, keeps no text, and a newer save wins over it', () => {
  const t = '駅はどこですか。';
  const kept = prow(t, { phrase: phrase(t) });
  const gone = prow(t, { removed: T(5) });
  const j = both(joinPhrase, kept, gone);
  assert.deepEqual(j, { key: textKey(t), removed: T(5), phrase: null });
  assert.ok(!JSON.stringify(j).includes(t), 'a dead row holds no text');
  const again = prow(t, { phrase: phrase(t, { saved: T(8), s: T(8) }) });
  assert.equal(both(joinPhrase, j, again).phrase.saved, T(8));
  assert.equal(both(joinPhrase, j, kept).phrase, null, 'a stale copy pushed later does not bring it back');
});

test('a phrase whose text is not its key\'s text is not a phrase', () => {
  const row = cleanPhraseRow({ key: textKey('一'), removed: 0, phrase: phrase('二') });
  assert.equal(row.phrase, null);
  assert.equal(cleanPhraseRow({ key: 'NOT-A-KEY', removed: 0, phrase: null }), null);
});

test('Play: the best and the rounds per game, the count per pair, the 400 most mixed', () => {
  const a = cleanPlay({ games: { which: { best: 7, rounds: 3 }, odd: { best: 12, rounds: 1 } }, mixed: [{ k: 'シ|ツ', n: 4 }] });
  const b = cleanPlay({ games: { which: { best: 9, rounds: 2 }, twins: { best: 5, rounds: 5 } }, mixed: [{ k: 'シ|ツ', n: 2 }, { k: 'ソ|ン', n: 1 }] });
  const j = both(joinPlay, a, b);
  assert.deepEqual(j.games, { which: { best: 9, rounds: 3 }, odd: { best: 12, rounds: 1 }, twins: { best: 5, rounds: 5 } });
  assert.deepEqual(j.mixed, [{ k: 'シ|ツ', n: 4 }, { k: 'ソ|ン', n: 1 }]);
  const many = (n0) => cleanPlay({ games: {}, mixed: Array.from({ length: 300 }, (_, i) => ({ k: `${String.fromCodePoint(0x4e00 + n0 + i)}|${String.fromCodePoint(0x9000 + n0 + i)}`, n: 1 + (i % 7) })) });
  const big = both(joinPlay, many(0), many(150));
  assert.equal(big.mixed.length, MAX_MIXED);
  assert.ok(cleanPlay({ games: { which: { best: 11, rounds: 1 } }, mixed: [] }).games.which === undefined, 'a score over the top is not a score');
});

test('preferences: per preference, the later change wins; a tie is the same in either order', () => {
  const a = cleanPrefs({ values: { lang: { v: 'es', at: T(5) }, furigana: { v: false, at: T(1) } } });
  const b = cleanPrefs({ values: { lang: { v: 'en', at: T(3) }, furigana: { v: true, at: T(2) }, slow: { v: true, at: 0 } } });
  const j = both(joinPrefs, a, b);
  assert.deepEqual(j.values, { lang: { v: 'es', at: T(5) }, furigana: { v: true, at: T(2) }, slow: { v: true, at: 0 } });
  both(joinPrefs, cleanPrefs({ values: { romaji: { v: 'said', at: 0 } } }), cleanPrefs({ values: { romaji: { v: 'off', at: 0 } } }));
  assert.deepEqual(cleanPrefs({ values: { lang: { v: 'fr', at: 1 }, remember: { v: 'on', at: 1 }, translate: { v: 'on', at: 1 } } }).values, {},
    'remember and translate are device choices and never travel');
});

// ── Seeded random rows ────────────────────────────────────────────────────

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function generators(r) {
  const pick = (list) => list[Math.floor(r() * list.length)];
  const day = () => `2026-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 10)}`;
  const time = () => T(1 + Math.floor(r() * 12));
  const word = () => [pick(['天気', '天', '雨天', '天国', '晴天', '天才', '天井', '天使', '天文', '天体']), pick(['てん', 'あま']), day()];
  const kanji = () => cleanKanjiRow({
    char: '天',
    saved: r() < 0.7 ? { at: time(), box: Math.floor(r() * 6), due: day(), reviews: Math.floor(r() * 4), lapses: Math.floor(r() * 3), s: time() } : null,
    removed: r() < 0.4 ? time() : 0,
    seen: r() < 0.8 ? { n: 1 + Math.floor(r() * 5), first: day(), last: day(), words: Array.from({ length: Math.floor(r() * 7) }, word), src: pick([undefined, ...SOURCES]), h: pick([undefined, 'a1', 'b2']), e: pick([0, 0, T(4), T(8)]) } : null,
  });
  const t = pick(['一つ', '二つ', '三つ']);
  const phraseRow = () => cleanPhraseRow({
    key: textKey('一つ'),
    removed: r() < 0.4 ? time() : 0,
    phrase: r() < 0.7 ? { t: pick(['一つ', ' 一つ', '一つ ']), first: time(), last: time(), n: 1 + Math.floor(r() * 4), src: pick(SOURCES), saved: time(), s: time() } : null,
  });
  void t;
  const play = () => cleanPlay({
    games: Object.fromEntries(['which', 'odd', 'twins'].filter(() => r() < 0.7).map((id) => [id, { best: 1 + Math.floor(r() * 9), rounds: 1 + Math.floor(r() * 9) }])),
    mixed: Array.from({ length: Math.floor(r() * 5) }, () => ({ k: pick(['シ|ツ', 'ソ|ン', 'ク|ワ']), n: 1 + Math.floor(r() * 9) })),
  });
  const prefs = () => cleanPrefs({ values: Object.fromEntries(['lang', 'furigana', 'romaji'].filter(() => r() < 0.7).map((k) => [k, { v: pick(PREFS[k]), at: pick([0, T(1), T(2), T(3)]) }])) });
  return { kanji, phraseRow, play, prefs, clear: () => pick([0, 0, T(4), T(8)]) };
}

test('random rows: every join is commutative and idempotent, and absorbs what it already holds', () => {
  const g = generators(rng(20261007));
  for (let i = 0; i < 3000; i += 1) {
    const c = g.clear();
    both(joinKanji, g.kanji(), g.kanji(), c);
    both(joinPhrase, g.phraseRow(), g.phraseRow());
    both(joinPlay, g.play(), g.play());
    both(joinPrefs, g.prefs(), g.prefs());
  }
});

test('random rows: three copies end in the same place in any grouping, for counts, words, Play and preferences', () => {
  const g = generators(rng(7));
  const assoc = (join, a, b, c, ...rest) => same(join(join(a, b, ...rest), c, ...rest), join(a, join(b, c, ...rest), ...rest));
  for (let i = 0; i < 3000; i += 1) {
    const clear = g.clear();
    const [a, b, c] = [g.kanji(), g.kanji(), g.kanji()];
    const seenOnly = (x) => x && { char: x.char, saved: null, removed: 0, seen: x.seen };
    assert.ok(assoc(joinKanji, seenOnly(a), seenOnly(b), seenOnly(c), clear), 'seen');
    assert.ok(assoc(joinPlay, g.play(), g.play(), g.play()), 'play');
    assert.ok(assoc(joinPrefs, g.prefs(), g.prefs(), g.prefs()), 'prefs');
    // Whether a kanji is saved, and whether a phrase is, never depends on the grouping.
    const live = (x) => !!(x && x.saved);
    assert.equal(live(joinKanji(joinKanji(a, b, clear), c, clear)), live(joinKanji(a, joinKanji(b, c, clear), clear)), 'saved or not');
    const [p, q, s] = [g.phraseRow(), g.phraseRow(), g.phraseRow()];
    const pl = (x) => !!(x && x.phrase);
    assert.equal(pl(joinPhrase(joinPhrase(p, q), s)), pl(joinPhrase(p, joinPhrase(q, s))), 'phrase saved or not');
  }
});

test('rankWords keeps one copy of a word, at its latest day', () => {
  assert.deepEqual(rankWords([['天気', 'てんき', '2026-01-01'], ['天気', 'てんき', '2026-03-01']]), [['天気', 'てんき', '2026-03-01']]);
});
