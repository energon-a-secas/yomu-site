// Saved phrases under plain node: a text saved on purpose with the reader's
// bookmark or a History row's, in each state of Remember (on, off, and not
// answered, which the page passes as not remembering, like off). What is
// recorded while Remember is off, the caps that never evict a saved text,
// Forget all and Turn off, the 500 cap, the backup's `phrases` field, and
// the kanji store that still holds no text. Every time is passed in.
//
// The stores are the real Persist kit over a fake localStorage, so a reload
// is two page loads over one storage, as in the other store tests.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  KEY, DAMAGED_KEY, MAX_ENTRIES, MAX_CHARS, MAX_TEXT, MAX_SAVED,
  emptyHistory, textKey, validate, recordText, evict, forgetAll, list, isSaved,
  saveText, unsaveText, savedList, unsavedList, savedCount, phrasesOf, cleanPhrases, mergePhrases,
  openHistory,
} from '../js/history-store.js';
import { KEY as KANJI_KEY, openKanji } from '../js/kanji-store.js';
import { EXPORT_FORMAT, exportDoc, parseImport } from '../js/kanji-backup.js';

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

const historyLoad = () => openHistory().load();
const A = '今日は雨が降っています。';
const B = '明日は晴れるでしょう。';
const C = '駅の前で友だちに会いました。';
/** What the page passes for Remember: only 'on' remembers; 'off' and 'ask' do not. */
const REMEMBER = { on: true, off: false, ask: false };

// ── Saving and unsaving, in each state of Remember ────────────────────────

test('Remember on: the star marks the entry already kept; unsaving leaves an ordinary entry', () => {
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100, REMEMBER.on);
  const r = saveText(d, A, 1, 'paste', 150);
  assert.deepEqual(r, { ok: true, key: textKey(A), changed: true });
  assert.deepEqual(d.entries[textKey(A)], { t: A, first: 100, last: 100, n: 1, src: 'paste', s: 1, saved: 150 });
  assert.deepEqual(saveText(d, A, 1, 'paste', 999), { ok: true, key: textKey(A), changed: false }, 'saving twice changes nothing');
  assert.equal(d.entries[textKey(A)].saved, 150);
  assert.equal(unsaveText(d, textKey(A), REMEMBER.on), true);
  assert.deepEqual(d.entries[textKey(A)], { t: A, first: 100, last: 100, n: 1, src: 'paste', s: 1 });
  assert.equal(unsaveText(d, textKey(A), REMEMBER.on), false, 'nothing to unsave');
});

for (const pref of ['off', 'ask']) {
  test(`Remember ${pref}: the star keeps that one text, read once in this session; unsaving forgets it`, () => {
    const d = emptyHistory();
    // The read itself kept nothing.
    assert.equal(recordText(d, A, 4, 'paste', 100, REMEMBER[pref]), null);
    assert.deepEqual(d, emptyHistory());
    const r = saveText(d, A, 4, 'paste', 120);
    assert.equal(r.ok, true);
    assert.deepEqual(d.entries, { [textKey(A)]: { t: A, first: 120, last: 120, n: 1, src: 'paste', s: 4, saved: 120 } });
    assert.deepEqual(d.session, { id: 4, key: textKey(A), before: null }, 'the session points at it, so a reload counts nothing');
    assert.equal(recordText(d, A, 4, 'paste', 130, REMEMBER[pref]), null);
    assert.equal(d.entries[textKey(A)].n, 1);
    assert.equal(unsaveText(d, textKey(A), REMEMBER[pref]), true);
    assert.deepEqual(d.entries, {}, 'nothing else keeps it');
    assert.equal(d.session.key, textKey(A), 'and a reload of the session does not bring it back');
    assert.equal(recordText(d, A, 4, 'paste', 140, REMEMBER[pref]), null);
    assert.deepEqual(d.entries, {});
  });
}

test('the store: save, reload, unsave, in each state, with the kind of text kept', () => {
  for (const pref of ['on', 'off', 'ask']) {
    disk.clear();
    let page = historyLoad();
    if (REMEMBER[pref]) page.record(A, 2, 'example', 100, true);
    page.save(A, 2, 'example', 110);
    page = historyLoad();
    assert.equal(page.isSaved(textKey(A)), true, pref);
    assert.equal(page.savedCount, 1, pref);
    assert.equal(page.entry(textKey(A)).src, 'example', pref);
    page.unsave(textKey(A), REMEMBER[pref]);
    page = historyLoad();
    assert.equal(page.isSaved(textKey(A)), false, pref);
    assert.equal(page.size, REMEMBER[pref] ? 1 : 0, pref);
  }
});

// ── Recording while Remember is off ───────────────────────────────────────

test('Remember off records only saved texts: a saved one read again is counted and says it was read before', () => {
  const d = emptyHistory();
  saveText(d, A, 1, 'paste', 100);
  const snapshot = JSON.stringify(d);
  assert.equal(recordText(d, B, 2, 'paste', 200, false), null, 'an unsaved text is not kept');
  assert.equal(JSON.stringify(d), snapshot, 'and nothing at all changed, not even the session');
  const before = recordText(d, `${A} `, 3, 'history', 300, false);
  assert.deepEqual(before, { n: 1, first: 100, last: 100, src: 'paste' });
  assert.deepEqual(d.entries[textKey(A)], { t: `${A} `, first: 100, last: 300, n: 2, src: 'history', s: 1, saved: 100 });
  assert.deepEqual(recordText(d, A, 3, 'history', 400, false), before, 'the same session again changes nothing');
  assert.equal(d.entries[textKey(A)].n, 2);
  assert.deepEqual(Object.keys(d.entries), [textKey(A)]);
});

test('Remember off: a reload counts nothing again and writes nothing; an unsaved read writes nothing', () => {
  let page = historyLoad();
  page.save(A, 5, 'paste', 100);
  page.record(A, 6, 'paste', 200, false);          // read again, a later session: n 2
  const raw = disk.get(KEY);
  const count = writes;
  page = historyLoad();
  assert.deepEqual(page.record(A, 6, 'paste', 999, false), { n: 1, first: 100, last: 100, src: 'paste' });
  assert.equal(page.record(B, 7, 'paste', 999, false), null);
  assert.equal(page.record(C, 7, 'typed', 999, false), null);
  assert.equal(writes, count, 'neither the reload nor the unsaved reads wrote');
  assert.equal(disk.get(KEY), raw);
  assert.equal(page.entry(textKey(A)).n, 2);
  assert.ok(!raw.includes('晴れる') && !raw.includes('駅'), 'no unsaved text was ever stored');
});

test('a saved text is never a draft: an edit away from it in the same session keeps it', () => {
  const d = emptyHistory();
  recordText(d, '今日は', 5, 'typed', 100, true, 90);   // session 5 began at 90
  saveText(d, '今日は', 5, 'typed', 105);
  recordText(d, '今日は雨', 5, 'typed', 110, true, 90);
  assert.ok(isSaved(d.entries[textKey('今日は')]), 'saved on purpose, so not a draft');
  assert.ok(d.entries[textKey('今日は雨')]);
  recordText(d, '今日は雨です', 5, 'typed', 120, true, 90);
  assert.equal(d.entries[textKey('今日は雨')], undefined, 'the unsaved draft still goes');
});

// ── The caps never evict a saved text ─────────────────────────────────────

test(`saved texts are never evicted and count toward neither cap (${MAX_ENTRIES} texts, ${MAX_CHARS} characters)`, () => {
  const d = emptyHistory();
  saveText(d, '一番古い保存の文です。', 1, 'paste', 1);       // older than everything
  for (let i = 0; i < 20; i += 1) saveText(d, `保存した文${i}です。`, 2, 'paste', 2 + i);
  for (let i = 0; i < MAX_ENTRIES; i += 1) recordText(d, `文${i}です。`, 100 + i, 'paste', 1000 + i, true);
  assert.equal(Object.keys(d.entries).length, MAX_ENTRIES + 21, 'the saved ones are not counted');
  recordText(d, '新しい文です。', 9999, 'paste', 5000, true);
  assert.equal(unsavedList(d).length, MAX_ENTRIES);
  assert.equal(savedCount(d), 21);
  assert.ok(d.entries[textKey('一番古い保存の文です。')], 'the oldest of all is saved, so it stays');
  assert.equal(d.entries[textKey('文0です。')], undefined, 'the oldest unsaved went');

  const e = emptyHistory();
  const long = (i) => `${i}${'あ'.repeat(MAX_TEXT - 4)}`;
  for (let i = 0; i < 160; i += 1) saveText(e, long(`s${i}`), 1, 'paste', 1 + i);
  for (let i = 0; i < 150; i += 1) recordText(e, long(i), i + 2, 'paste', 1000 + i, true);
  assert.equal(Object.keys(e.entries).length, 310, 'over 300,000 characters in all, but not in unsaved texts');
  assert.deepEqual(evict(e, null), []);
  recordText(e, long(150), 999, 'paste', 9999, true);
  assert.equal(savedCount(e), 160);
  assert.equal(e.entries[textKey(long(0))], undefined);
});

test('unsaving with Remember on, at the cap, keeps the unsaved text and evicts the oldest other', () => {
  const d = emptyHistory();
  saveText(d, A, 1, 'paste', 1);
  for (let i = 0; i < MAX_ENTRIES; i += 1) recordText(d, `文${i}です。`, 10 + i, 'paste', 100 + i, true);
  unsaveText(d, textKey(A), true);
  assert.ok(d.entries[textKey(A)], 'it stays, an ordinary entry');
  assert.equal(unsavedList(d).length, MAX_ENTRIES);
  assert.equal(d.entries[textKey('文0です。')], undefined);
});

// ── Forget all and Turn off ───────────────────────────────────────────────

test('Forget all forgets every unsaved text and keeps the saved ones, and what the session knew of its own', () => {
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100, true);
  recordText(d, B, 2, 'paste', 200, true);
  recordText(d, C, 3, 'paste', 300, true);
  saveText(d, A, 3, 'paste', 310);
  recordText(d, A, 4, 'link', 400, true);           // A on screen, read before
  forgetAll(d);
  assert.deepEqual(Object.keys(d.entries), [textKey(A)]);
  assert.ok(isSaved(d.entries[textKey(A)]));
  assert.deepEqual(d.session, { id: 4, key: textKey(A), before: { n: 1, first: 100, last: 100, src: 'paste' } });
  recordText(d, B, 5, 'paste', 500, true);
  forgetAll(d);
  assert.deepEqual(d.session, { id: 5, key: textKey(B), before: null }, 'an unsaved text on screen knows nothing now');
});

test('Turn off keeps the saved phrases and forgets the rest, the damaged copy too; with none saved the store goes', () => {
  disk.set(KEY, '{"__v":1,"data":{"entries":');
  let page = historyLoad();
  assert.ok(disk.has(DAMAGED_KEY));
  page.record(A, 1, 'paste', 100, true);
  page.record(B, 2, 'paste', 200, true);
  page.save(B, 2, 'paste', 210);
  page.turnOff();
  assert.equal(disk.has(DAMAGED_KEY), false);
  assert.ok(disk.has(KEY));
  page = historyLoad();
  assert.deepEqual(page.list().map((e) => e.t), [B]);
  assert.ok(!disk.get(KEY).includes('今日'), 'the unsaved text left no trace');
  page.unsave(textKey(B), false);
  page.turnOff();
  assert.equal(disk.has(KEY), false, 'nothing saved: Turn off removes the store, as before');
});

// ── At most 500 ───────────────────────────────────────────────────────────

test(`at most ${MAX_SAVED} saved phrases: the next is refused and nothing changes`, () => {
  const d = emptyHistory();
  for (let i = 0; i < MAX_SAVED; i += 1) assert.equal(saveText(d, `保存${i}の文。`, 1, 'paste', 10 + i).ok, true);
  recordText(d, A, 2, 'paste', 9000, true);
  const snapshot = JSON.stringify(d);
  assert.deepEqual(saveText(d, A, 2, 'paste', 9100), { ok: false, key: textKey(A), reason: 'full' });
  assert.deepEqual(saveText(d, B, 2, 'paste', 9100), { ok: false, key: textKey(B), reason: 'full' });
  assert.equal(JSON.stringify(d), snapshot, 'neither the text kept unsaved nor a new one');
  unsaveText(d, textKey('保存0の文。'), true);
  assert.equal(saveText(d, A, 2, 'paste', 9200).ok, true, 'one unsaved, one saved');
  assert.equal(savedCount(d), MAX_SAVED);
});

test('a stored value: a bad `saved` drops the flag, never the entry, and past 500 the earliest saved keep it', () => {
  const good = { t: A, first: 100, last: 200, n: 2, src: 'paste', s: 1 };
  for (const bad of [0, -5, 'yesterday', null, true, Infinity]) {
    const v = validate({ entries: { [textKey(A)]: { ...good, saved: bad } } });
    assert.deepEqual(v.data.entries[textKey(A)], good, String(bad));
    assert.equal(v.dropped, 0);
  }
  assert.equal(validate({ entries: { [textKey(A)]: { ...good, saved: 150 } } }).data.entries[textKey(A)].saved, 150);
  const entries = {};
  for (let i = 0; i < MAX_SAVED + 3; i += 1) {
    const t = `文${i}。`;
    entries[textKey(t)] = { t, first: 1, last: 1, n: 1, src: 'typed', s: 1, saved: 1000 - i };
  }
  const v = validate({ entries });
  assert.equal(Object.keys(v.data.entries).length, MAX_SAVED + 3);
  assert.equal(savedCount(v.data), MAX_SAVED);
  for (const i of [MAX_SAVED, MAX_SAVED + 1, MAX_SAVED + 2]) assert.equal(isSaved(v.data.entries[textKey(`文${i}。`)]), true, 'saved earliest');
  for (const i of [0, 1, 2]) assert.equal(isSaved(v.data.entries[textKey(`文${i}。`)]), false, 'saved latest');
});

test('lists: saved phrases the latest saved first, the texts read without them', () => {
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100, true);
  recordText(d, B, 2, 'paste', 200, true);
  recordText(d, C, 3, 'paste', 300, true);
  saveText(d, B, 3, 'paste', 400);
  saveText(d, A, 3, 'paste', 500);
  assert.deepEqual(savedList(d).map((e) => e.t), [A, B]);
  assert.deepEqual(unsavedList(d).map((e) => e.t), [C]);
  assert.deepEqual(list(d).map((e) => e.t), [C, B, A], 'list is still every text, latest read first');
});

// ── The backup ────────────────────────────────────────────────────────────

test('export writes the saved phrases, and only when there are some; never a key, a session or an unsaved text', () => {
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100, true);
  recordText(d, B, 2, 'phrase', 200, true);
  saveText(d, B, 2, 'phrase', 250);
  const phrases = phrasesOf(d);
  assert.deepEqual(phrases, [{ t: B, first: 200, last: 200, n: 1, src: 'phrase', saved: 250 }]);
  const kanji = { saved: {}, seen: {} };
  const doc = exportDoc(kanji, '2026-10-05', phrases);
  assert.equal(doc.format, EXPORT_FORMAT);
  assert.deepEqual(doc.phrases, phrases);
  assert.ok(!JSON.stringify(doc).includes('今日'));
  assert.ok(!('phrases' in exportDoc(kanji, '2026-10-05', [])), 'none saved: the file is as it was');
  assert.ok(!('phrases' in exportDoc(kanji, '2026-10-05')));
});

test('a backup without phrases imports as before; a damaged phrases array never stops the kanji', () => {
  const seen = { 天: { n: 2, first: '2026-09-01', last: '2026-09-02', words: [] } };
  const plain = parseImport(JSON.stringify({ format: EXPORT_FORMAT, saved: {}, seen }));
  assert.equal(plain.ok, true);
  assert.equal(plain.dropped, 0);
  assert.ok(!('phrases' in plain.data));

  const notArray = parseImport(JSON.stringify({ format: EXPORT_FORMAT, saved: {}, seen, phrases: { t: A } }));
  assert.equal(notArray.ok, true);
  assert.equal(notArray.dropped, 1);
  assert.deepEqual(Object.keys(notArray.data.seen), ['天']);
  assert.ok(!('phrases' in notArray.data));

  const good = { t: A, first: 100, last: 200, n: 2, src: 'paste', saved: 150 };
  const mixed = parseImport(JSON.stringify({
    format: EXPORT_FORMAT,
    saved: {},
    seen,
    phrases: [good, null, 'x', { ...good, t: '' }, { ...good, n: 0 }, { ...good, src: 'mail' }, { ...good, saved: 'no' },
      { ...good, t: 'あ'.repeat(MAX_TEXT + 1) }, { ...good, t: B, first: 300, last: 100 }],
  }));
  assert.equal(mixed.ok, true);
  assert.equal(mixed.dropped, 7);
  assert.deepEqual(mixed.data.phrases, [good, { ...good, t: B, first: 100, last: 300 }]);

  const only = parseImport(JSON.stringify({ format: EXPORT_FORMAT, saved: {}, seen: {}, phrases: [good] }));
  assert.equal(only.ok, true, 'a backup of phrases alone is a backup');
  const none = parseImport(JSON.stringify({ format: EXPORT_FORMAT, saved: {}, seen: {}, phrases: [null] }));
  assert.equal(none.reason, 'empty');
  assert.equal(none.dropped, 1);
  for (const raw of [undefined, null, 0, 'x', [], [[]], {}]) assert.doesNotThrow(() => cleanPhrases(raw));
});

test('merging phrases: the higher count, the earlier first, the later last and its kind, the earlier save; twice is once', () => {
  const d = emptyHistory();
  recordText(d, A, 1, 'paste', 100, true);
  recordText(d, A, 2, 'paste', 300, true);          // n 2, last 300
  saveText(d, A, 2, 'paste', 500);
  recordText(d, B, 3, 'typed', 400, true);          // kept, not saved
  const incoming = [
    { t: A, first: 50, last: 250, n: 5, src: 'link', saved: 600 },
    { t: B, first: 410, last: 900, n: 1, src: 'host', saved: 950 },
    { t: C, first: 10, last: 20, n: 3, src: 'example', saved: 30 },
  ];
  const sum = mergePhrases(d, incoming);
  assert.deepEqual(sum, { added: 1, updated: 2, full: 0 });
  assert.deepEqual(d.entries[textKey(A)], { t: A, first: 50, last: 300, n: 5, src: 'paste', s: 1, saved: 500 });
  assert.deepEqual(d.entries[textKey(B)], { t: B, first: 400, last: 900, n: 1, src: 'host', s: 3, saved: 950 }, 'a text kept unsaved becomes saved');
  assert.deepEqual(d.entries[textKey(C)], { t: C, first: 10, last: 20, n: 3, src: 'example', s: 0, saved: 30 });
  const snapshot = JSON.stringify(d);
  assert.deepEqual(mergePhrases(d, incoming), { added: 0, updated: 0, full: 0 });
  assert.equal(JSON.stringify(d), snapshot);
  // A merged entry is one the store reads back whole.
  assert.equal(validate(JSON.parse(snapshot)).dropped, 0);
});

test(`merging phrases stops at ${MAX_SAVED} and counts the rest`, () => {
  const d = emptyHistory();
  for (let i = 0; i < MAX_SAVED - 1; i += 1) saveText(d, `保存${i}の文。`, 1, 'paste', 10 + i);
  const sum = mergePhrases(d, [A, B, C].map((t) => ({ t, first: 1, last: 2, n: 1, src: 'paste', saved: 3 })));
  assert.deepEqual(sum, { added: 1, updated: 0, full: 2 });
  assert.equal(savedCount(d), MAX_SAVED);
});

test('Export then Import into a fresh browser restores the phrases and the kanji; the kanji store holds no text', () => {
  const lend = (kanji, history) => kanji.lendPhrases({ out: () => history.phrases(), merge: (p) => history.mergePhrases(p) });
  // Remember off: one text saved on purpose, its kanji pointed at it.
  const history = historyLoad();
  const kanji = openKanji().load();
  lend(kanji, history);
  kanji.beginSession('paste');
  const r = history.save(A, kanji.sessionId, kanji.sessionSource, 100);
  kanji.record(['今', '日', '雨', '降'], null, '2026-10-05', { h: r.key });
  const rawKanji = disk.get(KANJI_KEY);
  assert.ok(rawKanji.includes(r.key), 'the kanji point at the saved text by its key');
  assert.ok(!rawKanji.includes('今日は') && !rawKanji.includes('降って'), 'and never hold it');
  assert.ok(disk.get(KEY).includes(A), 'the text is in History alone');

  const file = JSON.stringify(kanji.exportDoc('2026-10-05'));
  assert.deepEqual(JSON.parse(file).phrases, [{ t: A, first: 100, last: 100, n: 1, src: 'paste', saved: 100 }]);

  disk.clear();                                       // another browser
  const h2 = historyLoad();
  const k2 = openKanji().load();
  lend(k2, h2);
  const parsed = parseImport(file);
  assert.equal(parsed.ok, true);
  const sum = k2.merge(parsed.data);
  assert.deepEqual(sum.phrases, { added: 1, updated: 0, full: 0 });
  assert.deepEqual(historyLoad().savedList().map((e) => [e.t, e.saved]), [[A, 100]]);
  assert.equal(openKanji().load().seenOf('雨').h, r.key, 'the restored kanji find their sentence again');
  assert.ok(!disk.get(KANJI_KEY).includes('今日は'), 'the imported kanji store still holds no text');

  // A store lent nothing (the tests above it, or a page that never bound it) ignores them.
  disk.clear();
  const k3 = openKanji().load();
  assert.ok(!('phrases' in k3.merge(parsed.data)));
  assert.ok(!('phrases' in k3.exportDoc('2026-10-05')));
  assert.equal(disk.has(KEY), false);
});

test('the Import note counts one saved phrase in the singular, in both languages (was "1 saved phrases")', async () => {
  const { importNote } = await import('../js/kanji-backup.js');
  const { useLang } = await import('../js/strings.js');
  const sum = (added, updated, full) => ({ savedAdded: 1, seenAdded: 18, seenUpdated: 0, phrases: { added, updated, full } });
  try {
    useLang('en');
    assert.equal(importNote(sum(1, 0, 0)), 'Imported: 1 saved kanji added, 18 kanji counts added or raised. 1 saved phrase added or updated.');
    assert.equal(importNote(sum(0, 1, 0)).split('. ').pop(), '1 saved phrase added or updated.');
    assert.equal(importNote(sum(2, 1, 0)).split('. ').pop(), '3 saved phrases added or updated.');
    assert.match(importNote(sum(1, 0, 1)), /1 saved phrase added or updated\. 1 more did not fit: 500 saved phrases is the most\.$/);
    assert.match(importNote(sum(1, 0, 2)), /2 more did not fit/);
    assert.equal(importNote({ savedAdded: 0, seenAdded: 2, seenUpdated: 0 }), 'Imported: 0 saved kanji added, 2 kanji counts added or raised.');
    assert.match(importNote(sum(0, 0, 0), 3), /3 damaged entries were left out\.$/);
    useLang('es');
    assert.match(importNote(sum(1, 0, 0)), / 1 frase guardada nueva o actualizada\.$/);
    assert.match(importNote(sum(4, 0, 0)), / 4 frases guardadas nuevas o actualizadas\.$/);
    assert.match(importNote(sum(1, 0, 1)), / Otra no cupo: 500 frases guardadas es el máximo\.$/);
    assert.match(importNote(sum(1, 0, 3)), / Otras 3 no cupieron: /);
  } finally {
    useLang('en');
  }
});
