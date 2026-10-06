// My kanji under plain node: the counting rule, the session boundaries, the
// reload, the review schedule, a review run to its summary, the backup, and
// a damaged store. Every date is passed in; nothing here reads the clock.
//
// The store is the real Persist kit over a fake localStorage, so the reload
// case is two page loads over one storage, the way a browser does it.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  KEY, DAMAGED_KEY, MAX_WORDS, INTERVALS, SOURCES,
  emptyData, validate, beginSession, recordReading, saveKanji, unsaveKanji, schedule,
  dueList, nextDue, oftenUnsaved, addDays, dayOf, sessionSource, setSessionText,
  dictionaryWord, wordsByKanji, openKanji,
} from '../js/kanji-store.js';
import { EXPORT_FORMAT, parseImport, mergeInto, exportDoc } from '../js/kanji-backup.js';
import { textKey } from '../js/history-store.js';
import { createReview, current, show, answer, finished, isRepeat, position, summary } from '../js/review.js';

const FIXTURE = JSON.parse(await readFile(new URL('./fixtures/analysis-sample.json', import.meta.url), 'utf8'));

// ── A browser's localStorage, enough of it ────────────────────────────────

let disk;
beforeEach(() => {
  disk = new Map();
  const fake = {
    getItem: (k) => (disk.has(k) ? disk.get(k) : null),
    setItem: (k, v) => { disk.set(k, String(v)); },
    removeItem: (k) => { disk.delete(k); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
});

/** A page load: the store opened and read, as myKanji() does. */
const pageLoad = () => openKanji().load();
const words = (pairs) => new Map(Object.entries(pairs));

// ── Counting ──────────────────────────────────────────────────────────────

test('a kanji counts once per session, however often the text is read', () => {
  const d = emptyData();
  beginSession(d);
  recordReading(d, ['天', '気'], null, '2026-10-01');
  recordReading(d, ['天', '気'], null, '2026-10-01');
  recordReading(d, ['天'], null, '2026-10-01');
  assert.equal(d.seen['天'].n, 1);
  assert.equal(d.seen['気'].n, 1);
});

test('a kanji typed into the same session counts once, when its read settles', () => {
  const d = emptyData();
  beginSession(d);
  const first = recordReading(d, ['今', '日'], null, '2026-10-01');
  assert.deepEqual(first.counted, ['今', '日']);
  // More typed: the old kanji are not counted again, the new one is.
  const second = recordReading(d, ['今', '日', '雨'], null, '2026-10-01');
  assert.deepEqual(second.counted, ['雨']);
  assert.deepEqual(Object.fromEntries(Object.entries(d.seen).map(([k, v]) => [k, v.n])), { 今: 1, 日: 1, 雨: 1 });
  // A read that changes nothing says so, and the store skips the write.
  assert.equal(recordReading(d, ['今', '日', '雨'], null, '2026-10-01').changed, false);
});

test('a new session counts the same kanji again, and keeps the first day and the last', () => {
  const d = emptyData();
  beginSession(d);
  recordReading(d, ['天'], null, '2026-09-28');
  beginSession(d);
  recordReading(d, ['天'], null, '2026-10-01');
  beginSession(d);
  recordReading(d, ['天'], null, '2026-09-30');   // a clock moved back still keeps first <= last
  assert.deepEqual({ n: d.seen['天'].n, first: d.seen['天'].first, last: d.seen['天'].last }, { n: 3, first: '2026-09-28', last: '2026-10-01' });
});

test('beginSession starts empty and moves the id on', () => {
  const d = emptyData();
  recordReading(d, ['天'], null, '2026-10-01');
  assert.deepEqual(d.session.counted, ['天']);
  const id = d.session.id;
  assert.equal(beginSession(d), id + 1);
  assert.deepEqual(d.session.counted, []);
});

test('characters that are not one kanji are not counted', () => {
  const d = emptyData();
  recordReading(d, ['あ', 'ab', '', '天気', null, '天'], null, '2026-10-01');
  assert.deepEqual(Object.keys(d.seen), ['天']);
});

test('words: distinct pairs, oldest dropped past eight, and never anything but a word', () => {
  const d = emptyData();
  recordReading(d, ['天'], words({ 天: [['天気', 'てんき'], ['天気', 'てんき']] }), '2026-10-01');
  assert.deepEqual(d.seen['天'].words, [['天気', 'てんき']]);
  for (let i = 0; i < 10; i += 1) {
    recordReading(d, ['天'], words({ 天: [[`天${'一二三四五六七八九十'[i]}`, `てん${i}`]] }), '2026-10-01');
  }
  assert.equal(d.seen['天'].words.length, MAX_WORDS);
  assert.deepEqual(d.seen['天'].words[MAX_WORDS - 1], ['天十', 'てん9']);
  // A sentence is not a word: too long, and refused.
  recordReading(d, ['天'], words({ 天: [['今日は天気がいいですね。本当にいい天気です。', 'きょうは']] }), '2026-10-01');
  assert.ok(d.seen['天'].words.every(([w]) => [...w].length <= 24));
});

// ── The reload ────────────────────────────────────────────────────────────

test('a reload that restores the text counts nothing; the next paste counts again', () => {
  // Paste 今日は天気: a session, two... four kanji counted.
  let page = pageLoad();
  page.beginSession();
  page.record(['今', '日', '天', '気'], null, '2026-10-01');
  // Type more: 雨 arrives and counts.
  page.record(['今', '日', '天', '気', '雨'], null, '2026-10-01');

  // Reload: the saved text is restored, not loaded anew, so no session begins.
  page = pageLoad();
  assert.equal(page.record(['今', '日', '天', '気', '雨'], null, '2026-10-01').length, 0);
  assert.deepEqual(Object.values(page.data.seen).map((s) => s.n), [1, 1, 1, 1, 1]);

  // Paste a new text that shares 天: a new session, so 天 counts a second time.
  page.beginSession();
  page.record(['天', '使'], null, '2026-10-01');
  page = pageLoad();
  assert.equal(page.seenOf('天').n, 2);
  assert.equal(page.seenOf('使').n, 1);
  assert.equal(page.seenOf('雨').n, 1);
});

test('the store never holds the text: only kanji, counts, days and dictionary words', () => {
  const page = pageLoad();
  page.beginSession();
  page.record(['私', '学', '校', '行', '先', '生', '飲'], wordsByKanji(FIXTURE.tokens), '2026-10-01');
  const raw = disk.get(KEY);
  assert.ok(!raw.includes('。'), 'no sentence punctuation');
  assert.ok(!raw.includes(FIXTURE.text.split('\n')[0]), 'not the first line');
  assert.ok(!raw.includes('学校へ'), 'not a run across words');
  const strings = [];
  JSON.parse(raw, (k, v) => { if (typeof v === 'string') strings.push(v); return v; });
  assert.ok(strings.every((s) => [...s].length <= 24), strings.filter((s) => s.length > 24).join(', '));
});

// ── Dictionary words ──────────────────────────────────────────────────────

test('an inflected verb is kept as its dictionary form, read from the stem', () => {
  const byChar = wordsByKanji(FIXTURE.tokens);
  assert.deepEqual(byChar.get('行'), [['行く', 'いく']]);
  assert.deepEqual(byChar.get('飲'), [['飲む', 'のむ']]);
  assert.deepEqual(byChar.get('学'), [['学校', 'がっこう']]);
  assert.deepEqual(byChar.get('私'), [['私', 'わたし']]);
});

test('a stem whose reading changes takes the reading its record lists (来ました is くる)', () => {
  const token = {
    kind: 'inflected', surface: '来ました', base: '来る', reading: 'きました', confidence: 'dict',
    furigana: [{ text: '来', ruby: 'き' }, { text: 'ました' }], entry: { r: ['くる'], g: ['to come'] },
  };
  assert.deepEqual(dictionaryWord(token), ['来る', 'くる']);
});

test('names, guesses and numbers read by rule are not dictionary words', () => {
  assert.equal(dictionaryWord({ kind: 'name', surface: '田中', reading: 'たなか', confidence: 'guess', entry: null }), null);
  assert.equal(dictionaryWord({ kind: 'number', surface: '三人', reading: 'さんにん', confidence: 'rule', entry: null }), null);
  assert.equal(dictionaryWord({ kind: 'particle', surface: 'は', reading: 'は', confidence: 'dict', entry: { g: ['topic'] } }), null);
});

// ── Saving and the schedule ───────────────────────────────────────────────

test('a kanji saved is in box 0 and due the day it was saved', () => {
  const d = emptyData();
  const now = new Date(2026, 9, 1, 21, 30);
  assert.equal(saveKanji(d, '天', now), true);
  assert.equal(saveKanji(d, '天', now), false);
  assert.deepEqual(d.saved['天'], { at: +now, box: 0, due: '2026-10-01', reviews: 0, lapses: 0 });
  assert.deepEqual(dueList(d, '2026-10-01'), ['天']);
  assert.equal(unsaveKanji(d, '天'), true);
  assert.deepEqual(dueList(d, '2026-10-01'), []);
});

test('Got it climbs the boxes, due in 1, 2, 4, 8 and 16 days, and stays at 16', () => {
  let rec = { at: 1, box: 0, due: '2026-10-01', reviews: 0, lapses: 0 };
  let day = '2026-10-01';
  const gaps = [];
  for (let i = 0; i < 7; i += 1) {
    rec = schedule(rec, true, day);
    gaps.push([rec.box, rec.due]);
    day = rec.due;
  }
  assert.deepEqual(gaps, [
    [1, '2026-10-02'], [2, '2026-10-04'], [3, '2026-10-08'], [4, '2026-10-16'],
    [5, '2026-11-01'], [5, '2026-11-17'], [5, '2026-12-03'],
  ]);
  assert.deepEqual(INTERVALS, [0, 1, 2, 4, 8, 16]);
  assert.equal(rec.reviews, 7);
  assert.equal(rec.lapses, 0);
});

test('Again sends a kanji back to box 1, due tomorrow, from any box', () => {
  const rec = schedule({ at: 1, box: 4, due: '2026-10-01', reviews: 6, lapses: 0 }, false, '2026-10-01');
  assert.deepEqual(rec, { at: 1, box: 1, due: '2026-10-02', reviews: 7, lapses: 1 });
});

test('days cross month and year ends', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(dayOf(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('due kanji come longest overdue first, then lower box, then first saved', () => {
  const d = emptyData();
  d.saved = {
    天: { at: 3, box: 2, due: '2026-10-01', reviews: 2, lapses: 0 },
    気: { at: 2, box: 0, due: '2026-10-01', reviews: 0, lapses: 0 },
    雨: { at: 9, box: 3, due: '2026-09-20', reviews: 3, lapses: 0 },
    今: { at: 1, box: 0, due: '2026-10-01', reviews: 0, lapses: 0 },
    日: { at: 1, box: 1, due: '2026-10-05', reviews: 1, lapses: 0 },
    木: { at: 1, box: 1, due: '2026-10-05', reviews: 1, lapses: 0 },
  };
  assert.deepEqual(dueList(d, '2026-10-01'), ['雨', '今', '気', '天']);
  assert.deepEqual(nextDue(d, '2026-10-01'), { day: '2026-10-05', n: 2 });
  assert.equal(nextDue(emptyData(), '2026-10-01'), null);
});

test('seen often, not saved: by count, then the latest met, at most the limit', () => {
  const d = emptyData();
  d.seen = {
    天: { n: 5, first: '2026-09-01', last: '2026-09-02', words: [] },
    気: { n: 9, first: '2026-09-01', last: '2026-09-02', words: [] },
    雨: { n: 5, first: '2026-09-01', last: '2026-09-30', words: [] },
    今: { n: 2, first: '2026-09-01', last: '2026-09-02', words: [] },
  };
  saveKanji(d, '気', new Date(2026, 9, 1));
  assert.deepEqual(oftenUnsaved(d), ['雨', '天', '今']);
  assert.deepEqual(oftenUnsaved(d, 2), ['雨', '天']);
});

// ── A review, start to summary ────────────────────────────────────────────

test('a review: Again comes round again, the schedule moves once per kanji', () => {
  const page = pageLoad();
  const day = '2026-10-01';
  for (const ch of ['天', '気', '雨']) page.save(ch, new Date(2026, 9, 1, 9));
  const r = createReview(page.due(day));
  assert.equal(r.total, 3);
  const apply = (ch, ok) => page.answer(ch, ok, day);

  assert.equal(answer(r, true, apply), null, 'no answer before the card is shown');
  assert.deepEqual(position(r), { at: 1, of: 3 });
  show(r); answer(r, true, apply);                 // 天: Got it
  const second = current(r);
  show(r); answer(r, false, apply);                // 気: Again
  show(r); answer(r, true, apply);                 // 雨: Got it
  assert.equal(current(r), second, 'the Again comes round again');
  assert.ok(isRepeat(r));
  assert.deepEqual(position(r), { at: 2, of: 3 });
  show(r); answer(r, true, apply);                 // 気 again: practice only
  assert.ok(finished(r));

  assert.deepEqual(summary(r), { reviewed: 3, got: 2, again: [second], left: 0 });
  assert.deepEqual(page.savedOf(second), { ...page.savedOf(second), box: 1, due: '2026-10-02', reviews: 1, lapses: 1 });
  assert.equal(page.savedOf('天').box, 1);
  assert.equal(page.savedOf('天').due, '2026-10-02');
  assert.deepEqual(page.due(day), []);
  assert.deepEqual(page.due('2026-10-02').sort(), ['天', '気', '雨'].sort());
});

// ── Backup ────────────────────────────────────────────────────────────────

test('export carries saved and seen, never the session', () => {
  const page = pageLoad();
  page.beginSession();
  page.record(['天'], words({ 天: [['天気', 'てんき']] }), '2026-10-01');
  page.save('天', new Date(2026, 9, 1));
  const doc = page.exportDoc('2026-10-01');
  assert.equal(doc.format, EXPORT_FORMAT);
  assert.equal(doc.exported, '2026-10-01');
  assert.ok(!('session' in doc));
  assert.deepEqual(Object.keys(doc.saved), ['天']);
  assert.deepEqual(doc.seen['天'].words, [['天気', 'てんき']]);
});

test('import refuses what is not a backup, and says why', () => {
  assert.deepEqual(parseImport('{not json'), { ok: false, reason: 'json' });
  assert.deepEqual(parseImport('[]'), { ok: false, reason: 'format' });
  assert.deepEqual(parseImport(JSON.stringify({ format: 'something-else/1', saved: {} })), { ok: false, reason: 'format' });
  assert.equal(parseImport(JSON.stringify({ format: EXPORT_FORMAT, saved: {}, seen: {} })).reason, 'empty');
});

test('import keeps what is valid and counts what it left out', () => {
  const doc = {
    format: EXPORT_FORMAT,
    saved: {
      天: { at: 1759300000000, box: 2, due: '2026-10-03', reviews: 2, lapses: 0 },
      x: { at: 1, box: 0, due: '2026-10-01', reviews: 0, lapses: 0 },          // not a kanji
      気: { at: 1, box: 9, due: '2026-10-01', reviews: 0, lapses: 0 },          // no box 9
      雨: { at: 1, box: 1, due: 'tomorrow', reviews: 0, lapses: 0 },            // not a day
    },
    seen: {
      天: { n: 4, first: '2026-09-01', last: '2026-09-30', words: [['天気', 'てんき'], ['天', 1], 'x'] },
      今日: { n: 1, first: '2026-09-01', last: '2026-09-01', words: [] },          // two characters
      日: { n: 0, first: '2026-09-01', last: '2026-09-01', words: [] },            // never seen
    },
  };
  const r = parseImport(JSON.stringify(doc));
  assert.equal(r.ok, true);
  assert.equal(r.dropped, 5);
  assert.deepEqual(Object.keys(r.data.saved), ['天']);
  assert.deepEqual(Object.keys(r.data.seen), ['天']);
  assert.deepEqual(r.data.seen['天'].words, [['天気', 'てんき']]);
});

test('merge keeps the higher counts, the earlier first day, and the busier schedule', () => {
  const d = emptyData();
  d.seen = {
    天: { n: 3, first: '2026-09-10', last: '2026-09-20', words: [['天気', 'てんき']] },
    気: { n: 7, first: '2026-08-01', last: '2026-09-01', words: [] },
  };
  d.saved = { 天: { at: 500, box: 1, due: '2026-10-02', reviews: 1, lapses: 1 } };
  const incoming = {
    seen: {
      天: { n: 5, first: '2026-09-01', last: '2026-09-15', words: [['天使', 'てんし']] },
      気: { n: 2, first: '2026-09-05', last: '2026-09-25', words: [['気分', 'きぶん']] },
      雨: { n: 1, first: '2026-09-02', last: '2026-09-02', words: [] },
    },
    saved: {
      天: { at: 900, box: 3, due: '2026-10-09', reviews: 4, lapses: 0 },
      雨: { at: 700, box: 0, due: '2026-09-02', reviews: 0, lapses: 0 },
    },
  };
  const sum = mergeInto(d, incoming);
  assert.deepEqual(d.seen['天'], { n: 5, first: '2026-09-01', last: '2026-09-20', words: [['天気', 'てんき'], ['天使', 'てんし']] });
  assert.deepEqual(d.seen['気'], { n: 7, first: '2026-08-01', last: '2026-09-25', words: [['気分', 'きぶん']] });
  assert.deepEqual(d.saved['天'], { at: 500, box: 3, due: '2026-10-09', reviews: 4, lapses: 1 });
  assert.deepEqual(d.saved['雨'], incoming.saved['雨']);
  assert.deepEqual(sum, { savedAdded: 1, savedUpdated: 1, seenAdded: 1, seenUpdated: 2 });
  // The same file twice changes nothing more.
  assert.deepEqual(mergeInto(d, incoming), { savedAdded: 0, savedUpdated: 0, seenAdded: 0, seenUpdated: 0 });
});

test('an exported file imports into another browser whole', () => {
  const a = pageLoad();
  a.beginSession();
  a.record(['天', '気'], words({ 天: [['天気', 'てんき']], 気: [['天気', 'てんき']] }), '2026-10-01');
  a.save('天', new Date(2026, 9, 1));
  const file = JSON.stringify(a.exportDoc('2026-10-01'));
  disk.clear();                                   // another browser
  const b = pageLoad();
  const r = parseImport(file);
  assert.equal(r.ok, true);
  b.merge(r.data);
  assert.deepEqual(pageLoad().data.saved, a.data.saved);
  assert.deepEqual(pageLoad().data.seen, a.data.seen);
});

// ── A damaged store ───────────────────────────────────────────────────────

test('a store that is not JSON opens empty, says so, and keeps the old copy', () => {
  disk.set(KEY, '{"__v":1,"data":{"saved":');
  const page = pageLoad();
  assert.equal(page.note, 'damaged');
  assert.deepEqual(page.data, emptyData());
  assert.equal(disk.get(DAMAGED_KEY), '{"__v":1,"data":{"saved":');
  // It still works, and its first write replaces the damage.
  page.save('天', new Date(2026, 9, 1));
  assert.equal(pageLoad().note, null);
  assert.ok(pageLoad().isSaved('天'));
});

test('a store from another version, or not an object, opens empty with the note', () => {
  disk.set(KEY, JSON.stringify({ __v: 2, data: { saved: {} } }));
  assert.equal(pageLoad().note, 'damaged');
  disk.set(KEY, JSON.stringify({ __v: 1, data: 'nope' }));
  assert.equal(pageLoad().note, 'damaged');
});

test('a store with some bad entries keeps the rest and counts what it dropped', () => {
  disk.set(KEY, JSON.stringify({
    __v: 1,
    data: {
      saved: { 天: { at: 5, box: 0, due: '2026-10-01', reviews: 0, lapses: 0 }, 気: { at: 'x' } },
      seen: { 天: { n: 1, first: '2026-10-01', last: '2026-10-01', words: [] }, abc: { n: 1 } },
      session: { id: 4, counted: ['天', 'x', '天'] },
    },
  }));
  const page = pageLoad();
  assert.equal(page.note, 'partial');
  assert.equal(page.dropped, 2);
  assert.deepEqual(Object.keys(page.data.saved), ['天']);
  assert.deepEqual(page.data.session, { id: 4, counted: ['天'] });
  assert.ok(disk.has(DAMAGED_KEY));
});

test('validate never throws on anything stored', () => {
  for (const raw of [null, undefined, 0, 'x', [], [1], { saved: [] }, { seen: 'x' }, { session: { id: -1, counted: 'x' } }, { saved: { 天: null } }]) {
    assert.doesNotThrow(() => validate(raw));
  }
});

test('a write that fails leaves the page working and says the store is not kept', () => {
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  const page = pageLoad();
  page.save('天', new Date(2026, 9, 1));
  assert.ok(page.isSaved('天'));
  assert.equal(page.writable, false);
});

test('clear all forgets saved and seen, and starts a new session', () => {
  const page = pageLoad();
  page.beginSession();
  page.record(['天'], null, '2026-10-01');
  page.save('天', new Date(2026, 9, 1));
  const id = page.data.session.id;
  page.clearAll();
  const again = pageLoad();
  assert.deepEqual(again.data.saved, {});
  assert.deepEqual(again.data.seen, {});
  assert.deepEqual(again.data.session, { id: id + 1, counted: [] });
});

// ── When a session began ──────────────────────────────────────────────────

test('a session knows when it began; one from an older store does not, and a bad start is left out', () => {
  const d = emptyData();
  beginSession(d, 'paste', 5000);
  assert.deepEqual(d.session, { id: 1, counted: [], src: 'paste', at: 5000 });
  setSessionText(d, 'k1');
  recordReading(d, ['天'], null, '2026-10-01');
  assert.deepEqual([d.session.at, d.session.h], [5000, 'k1'], 'the start stays while the session moves');
  assert.equal(validate({ session: { id: 3, counted: [], at: 5000 } }).data.session.at, 5000);
  for (const at of [0, -1, 'x', NaN, null, Infinity, [5000]]) {
    const v = validate({ session: { id: 3, counted: ['天'], at } });
    assert.deepEqual([v.data.session, v.dropped], [{ id: 3, counted: ['天'] }, 0], `${at}: the start goes, the session stays`);
  }
  assert.equal('at' in validate({ session: { id: 7, counted: [] } }).data.session, false, 'a session kept by an older page');
});

test('a session the page could not read starts when the page loads; clear all starts one too; the store stays version 1', () => {
  let page = openKanji().load(1000);
  assert.deepEqual([page.sessionId, page.sessionAt], [0, 1000], 'nothing stored: session 0 starts now');
  page.beginSession('paste', 2000);
  page = openKanji().load(3000);
  assert.deepEqual([page.sessionId, page.sessionAt], [1, 2000], 'a reload is the session it was');
  assert.equal(JSON.parse(disk.get(KEY)).__v, 1);
  disk.set(KEY, '{"__v":1,"data":{"sa');
  page = openKanji().load(4000);
  assert.equal(page.note, 'damaged');
  assert.deepEqual([page.sessionId, page.sessionAt], [0, 4000], 'the ids count from 0 again, and the start says when');
  page.clearAll(5000);
  page = openKanji().load(6000);
  assert.deepEqual(page.data.session, { id: 1, counted: [], at: 5000 });
  disk.set(KEY, JSON.stringify({ __v: 1, data: { saved: {}, seen: {}, session: { id: 7, counted: [] } } }));
  assert.equal(openKanji().load(7000).sessionAt, null, 'an older store\'s session: its start is unknown');
  disk.set(KEY, JSON.stringify({ __v: 1, data: { saved: {}, seen: {}, session: 'x' } }));
  // One load: the repaired store is written at once (keepStart), so a second
  // load reads a whole store and has no note to give.
  const partial = openKanji().load(8000);
  assert.deepEqual([partial.sessionAt, partial.note], [8000, 'partial'], 'a session that did not read starts now');
  assert.equal(openKanji().load(9000).sessionAt, 8000, 'and the repaired store keeps that start');
});

// ── Where a kanji was last met: sources and History keys ──────────────────

test('the kinds of text a session can read', () => {
  assert.deepEqual([...SOURCES], ['paste', 'typed', 'example', 'phrase', 'link', 'host', 'history']);
});

test('a session knows its kind of text; one from an older store, or of no known kind, is typed', () => {
  const d = emptyData();
  beginSession(d, 'paste');
  assert.deepEqual(d.session, { id: 1, counted: [], src: 'paste' }, 'no history key until the text is remembered');
  beginSession(d, 'mail');
  assert.equal(d.session.src, 'typed');
  const old = validate({ session: { id: 7, counted: ['天'] } }).data;
  assert.equal(sessionSource(old), 'typed');
  recordReading(old, ['雨'], null, '2026-10-01');
  assert.equal(old.seen['雨'].src, 'typed');
});

test('a fresh count takes the session\'s kind and history key; without a key it has none', () => {
  const d = emptyData();
  beginSession(d, 'example');
  recordReading(d, ['天'], null, '2026-10-01');
  assert.deepEqual(d.seen['天'], { n: 1, first: '2026-10-01', last: '2026-10-01', words: [], src: 'example' });
  beginSession(d, 'history');
  setSessionText(d, 'k1');
  recordReading(d, ['天', '気'], null, '2026-10-02');
  assert.equal(d.seen['天'].n, 2);
  assert.deepEqual([d.seen['天'].src, d.seen['天'].h], ['history', 'k1']);
  assert.deepEqual([d.seen['気'].src, d.seen['気'].h], ['history', 'k1']);
  // The next text is not remembered: the kanji met in it point at no text.
  beginSession(d, 'paste');
  recordReading(d, ['天'], null, '2026-10-03');
  assert.equal(d.seen['天'].src, 'paste');
  assert.equal('h' in d.seen['天'], false);
  assert.equal(d.seen['気'].h, 'k1', 'a kanji not met again keeps its text');
});

test('a kanji already counted follows the text as it is edited, without being counted again', () => {
  const d = emptyData();
  beginSession(d, 'typed');
  setSessionText(d, 'aaa');
  recordReading(d, ['今', '日'], null, '2026-10-01');
  assert.equal(setSessionText(d, 'bbb'), true);
  const r = recordReading(d, ['今', '日', '雨'], null, '2026-10-01');
  assert.deepEqual(r.counted, ['雨']);
  assert.deepEqual(['今', '日', '雨'].map((ch) => [d.seen[ch].n, d.seen[ch].h]), [[1, 'bbb'], [1, 'bbb'], [1, 'bbb']]);
  assert.equal(recordReading(d, ['今', '日', '雨'], null, '2026-10-01').changed, false, 'nothing differs, nothing to write');
  assert.equal(setSessionText(d, 'bbb'), false);
  setSessionText(d, null);
  assert.equal(recordReading(d, ['今'], null, '2026-10-01').changed, true, 'the key went: that is a change');
  assert.equal('h' in d.seen['今'], false);
  assert.equal(d.seen['今'].n, 1);
});

test('a bad kind or key is left out on load, and the record kept', () => {
  disk.set(KEY, JSON.stringify({
    __v: 1,
    data: {
      seen: {
        天: { n: 2, first: '2026-10-01', last: '2026-10-02', words: [], src: 'mail', h: 'abc' },
        気: { n: 1, first: '2026-10-01', last: '2026-10-01', words: [], src: 'link', h: '今日は雨' },
        雨: { n: 1, first: '2026-10-01', last: '2026-10-01', words: [], src: 'host', h: 'k9' },
      },
      session: { id: 3, counted: ['天'], src: 'nowhere', h: 'Not A Key' },
    },
  }));
  const page = pageLoad();
  assert.equal(page.note, null, 'a field is not an entry: nothing was left out');
  assert.deepEqual(page.seenOf('天'), { n: 2, first: '2026-10-01', last: '2026-10-02', words: [], h: 'abc' });
  assert.deepEqual(page.seenOf('気'), { n: 1, first: '2026-10-01', last: '2026-10-01', words: [], src: 'link' });
  assert.deepEqual(page.seenOf('雨'), { n: 1, first: '2026-10-01', last: '2026-10-01', words: [], src: 'host', h: 'k9' });
  assert.deepEqual(page.data.session, { id: 3, counted: ['天'] });
  assert.equal(page.sessionSource, 'typed');
});

test('the store still never holds the text when its kanji point at a remembered one', () => {
  const page = pageLoad();
  page.beginSession('paste');
  const h = textKey(FIXTURE.text);
  page.record(['私', '学', '校', '行', '先', '生', '飲'], wordsByKanji(FIXTURE.tokens), '2026-10-01', { h });
  const raw = disk.get(KEY);
  assert.ok(raw.includes(h), 'the key is there');
  assert.ok(!raw.includes('。'), 'no sentence punctuation');
  assert.ok(!raw.includes(FIXTURE.text.split('\n')[0]), 'not the first line');
  assert.ok(!raw.includes('学校へ'), 'not a run across words');
  const strings = [];
  JSON.parse(raw, (k, v) => { if (typeof v === 'string') strings.push(v); return v; });
  assert.ok(strings.every((x) => [...x].length <= 24), strings.filter((x) => x.length > 24).join(', '));
  assert.equal(pageLoad().seenOf('学').h, h);
});

test('record with a key moves the session and counts in one write', () => {
  let saves = 0;
  const page = openKanji({ store: { load: () => null, save: () => { saves += 1; return true; } }, readRaw: () => null, keepRaw: () => {} }).load();
  page.beginSession('link');
  saves = 0;
  page.record(['天'], null, '2026-10-01', { h: 'k1' });
  assert.equal(saves, 1);
  page.record(['天'], null, '2026-10-01', { h: 'k1' });
  assert.equal(saves, 1, 'the same read again writes nothing');
  page.record(['天'], null, '2026-10-01', { h: 'k2' });
  assert.equal(saves, 2);
  assert.equal(page.data.session.h, 'k2');
  assert.equal(page.seenOf('天').h, 'k2');
});

test('New is a kanji counted for the first time in this session, and stays so on a reload', () => {
  let page = pageLoad();
  page.beginSession('paste');
  page.record(['天'], null, '2026-10-01');
  page.beginSession('paste');
  page.record(['天', '雨'], null, '2026-10-02');
  assert.equal(page.isNew('雨'), true);
  assert.equal(page.isNew('天'), false, 'met in an earlier session');
  page = pageLoad();
  assert.equal(page.isNew('雨'), true);
  page.beginSession('typed');
  assert.equal(page.isNew('雨'), false, 'not counted in this session');
});

test('export and import carry the kind and the key; a merge takes them from the later day', () => {
  const a = pageLoad();
  a.beginSession('phrase');
  a.record(['天'], null, '2026-10-01', { h: 'k1' });
  const file = JSON.stringify(a.exportDoc('2026-10-01'));
  const r = parseImport(file);
  assert.deepEqual(r.data.seen['天'], { n: 1, first: '2026-10-01', last: '2026-10-01', words: [], src: 'phrase', h: 'k1' });

  const d = emptyData();
  d.seen = { 天: { n: 3, first: '2026-09-01', last: '2026-09-20', words: [], src: 'paste', h: 'mine' } };
  mergeInto(d, { seen: { 天: { n: 2, first: '2026-09-05', last: '2026-09-30', words: [], src: 'host' } }, saved: {} });
  assert.deepEqual(d.seen['天'], { n: 3, first: '2026-09-01', last: '2026-09-30', words: [], src: 'host' });
  const sum = mergeInto(d, { seen: { 天: { n: 1, first: '2026-09-30', last: '2026-09-30', words: [], src: 'link', h: 'k2' } }, saved: {} });
  assert.equal(d.seen['天'].src, 'host', 'on the same day this browser\'s own record stands');
  assert.equal(sum.seenUpdated, 0);
});

test('a first visit writes nothing, and its session start is written when History first asks for it', () => {
  let kept = null;
  const store = { load: () => (kept === null ? null : JSON.parse(kept)), save: (d) => { kept = JSON.stringify(d); return true; } };
  const first = openKanji({ store, readRaw: () => kept, keepRaw: () => {} }).load(1000);
  assert.equal(first.sessionAt, 1000);
  assert.equal(kept, null, 'a visit that records nothing stores nothing');
  assert.equal(first.startAt(), 1000);
  assert.equal(JSON.parse(kept).session.at, 1000, 'written before History relies on it, though no kanji is counted');
  const again = openKanji({ store, readRaw: () => kept, keepRaw: () => {} }).load(5000);
  assert.equal(again.sessionAt, 1000, 'a reload is the same session, begun when it began');
});

test('a damaged store is repaired with its new session start written at once', () => {
  let kept = '{"__v":1,"data":{"sa';
  const store = { load: () => { try { return JSON.parse(kept).data; } catch { return null; } }, save: (d) => { kept = JSON.stringify({ __v: 1, data: d }); return true; } };
  const page = openKanji({ store, readRaw: () => kept, keepRaw: () => {} }).load(2000);
  assert.equal(page.note, 'damaged');
  assert.equal(JSON.parse(kept).data.session.at, 2000);
});

test('a session read from the store is not written again on load', () => {
  let saves = 0;
  const stored = { saved: {}, seen: {}, session: { id: 4, counted: [], at: 1000 } };
  const store = { load: () => stored, save: () => { saves += 1; return true; } };
  openKanji({ store, readRaw: () => JSON.stringify(stored), keepRaw: () => {} }).load(9000);
  assert.equal(saves, 0);
});
