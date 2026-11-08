import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backupDoc, readBackup, restoreBackup, backupWeight, backupSummary, PRACTICE } from '../js/app-backup.js';
import { emptyData, saveKanji, recordReading } from '../js/kanji-store.js';
import { validate as validateWords, saveWord, listWords } from '../js/word-store.js';
import { parseImport, EXPORT_FORMAT, MAX_IMPORT_BYTES } from '../js/kanji-backup.js';
import { PhraseBook, phraseKey } from '../js/phrase-book.js';

const library = JSON.parse(readFileSync(new URL('../data/phrases/library.json', import.meta.url)));
const NOW = Date.UTC(2026, 10, 7, 12);
const TODAY = '2026-11-07';
/** The character is named, never written, so this file passes its own rule. */
const EM_DASH = String.fromCharCode(0x2014);

/** One phone's documents: two saved kanji (one reviewed), a met kanji, a word, two saved readings, two practice files. */
function phone() {
  const kanji = emptyData(NOW);
  saveKanji(kanji, '雨', NOW);
  saveKanji(kanji, '読', NOW);
  kanji.saved['雨'] = { ...kanji.saved['雨'], box: 2, due: '2026-11-09', reviews: 3 };
  recordReading(kanji, ['雨', '今'], null, TODAY);
  const words = validateWords(null).data;
  saveWord(words, { w: '雨', r: 'あめ', g: 'rain' }, NOW);
  const d = library.dialogues[0];
  const book = new PhraseBook(library);
  book.save('今日は雨。', null, NOW);
  book.save(d.lines[1].ja, { kind: 'conversation', id: d.id, line: 1 }, NOW + 1);
  const practice = {
    'kana-games': { v: 2, progress: { a: 1 } },
    'kana-review': { v: 1, cards: { 'hiragana:a': { box: 3 } } },
  };
  return { kanji, words, phrases: book.dump(), practice };
}

const textOf = (docs, extra = {}) => JSON.stringify(backupDoc({ ...docs, today: TODAY, now: NOW, library, ...extra }));

test('a backup round-trips everything a learner keeps into an empty phone', () => {
  const docs = phone();
  const text = textOf(docs, { app: { name: 'Naninani', version: '1.2.0 (15)' } });
  const read = readBackup(text);
  assert.equal(read.ok, true);
  assert.deepEqual(read.summary, {
    exported: TODAY, app: { name: 'Naninani', version: '1.2.0 (15)' },
    kanji: 2, met: 2, words: 1, phrases: 2, practice: ['kana-games', 'kana-review'], dropped: 0, weight: 7,
  });
  const r = restoreBackup(text, { kanji: null, words: null, phrases: null, practice: {}, now: NOW, library });
  assert.equal(r.ok, true);
  assert.deepEqual(r.kanji.saved, docs.kanji.saved);
  assert.deepEqual(r.kanji.seen, docs.kanji.seen);
  assert.deepEqual(listWords(r.words), listWords(docs.words));
  assert.deepEqual(r.phrases, docs.phrases);
  assert.deepEqual(r.practice, docs.practice);
  assert.deepEqual(r.sum.practice, ['kana-games', 'kana-review']);
  assert.equal(r.sum.savedAdded, 2);
  assert.equal(r.sum.words.added, 1);
  assert.equal(r.sum.phrases.added, 2);
});

test('the reading session never leaves the phone, and the library source of a saved reading comes back', () => {
  const docs = phone();
  docs.kanji.session = { id: 1, at: NOW, counted: ['雨'] };
  const doc = backupDoc({ ...docs, today: TODAY, now: NOW, library });
  assert.equal(doc.session, undefined);
  const d = library.dialogues[0];
  const r = restoreBackup(JSON.stringify(doc), { now: NOW, library });
  const restored = new PhraseBook(library, r.phrases).view().items.find((p) => p.text === d.lines[1].ja);
  assert.equal(restored.source.id, d.id);
  assert.equal(restored.source.line, 1);
});

test("the site's own Import reads a file the app wrote, and the app restores a file the site wrote", () => {
  const docs = phone();
  const site = parseImport(textOf(docs));
  assert.equal(site.ok, true);
  assert.equal(Object.keys(site.data.saved).length, 2);
  assert.equal(site.words.length, 1);
  assert.equal(site.data.phrases.length, 2);
  // A file from the site: no sources, no practice.
  const fromSite = JSON.stringify({ format: EXPORT_FORMAT, exported: TODAY, site: 'https://yomu.neorgon.com/', saved: docs.kanji.saved, seen: {} });
  const r = restoreBackup(fromSite, { now: NOW, library });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.kanji.saved).sort(), ['読', '雨']);
  assert.deepEqual(r.practice, {});
  assert.deepEqual(readBackup(fromSite).summary.practice, []);
});

test('restoring into a phone with data merges by the site rules, and twice changes nothing more', () => {
  const docs = phone();
  const text = textOf(docs);
  const here = emptyData(NOW);
  saveKanji(here, '雨', NOW + 5);
  saveKanji(here, '花', NOW + 5);
  const first = restoreBackup(text, { kanji: here, now: NOW, library });
  // 雨 on both: the backup's schedule has more reviews behind it and wins; the earlier save is kept.
  assert.deepEqual(first.kanji.saved['雨'], { ...docs.kanji.saved['雨'], at: NOW });
  assert.ok(first.kanji.saved['花'], "this phone's own kanji stays");
  assert.equal(first.sum.savedAdded, 1);
  assert.equal(first.sum.savedUpdated, 1);
  const second = restoreBackup(text, { kanji: first.kanji, words: first.words, phrases: first.phrases, practice: first.practice, now: NOW, library });
  assert.deepEqual(second.kanji, first.kanji);
  assert.deepEqual(second.words, first.words);
  assert.deepEqual(second.phrases, first.phrases);
  assert.equal(second.sum.savedAdded + second.sum.savedUpdated + second.sum.seenAdded + second.sum.seenUpdated, 0);
  assert.equal(second.sum.words.added + second.sum.words.updated, 0);
  assert.equal(second.sum.phrases.added + second.sum.phrases.updated, 0);
});

test("practice the phone lacks comes from the backup; the phone's own is replaced only when asked", () => {
  const docs = phone();
  const text = textOf(docs);
  const mine = { 'kana-games': { v: 2, progress: { mine: true } } };
  const kept = restoreBackup(text, { practice: mine, now: NOW, library });
  assert.deepEqual(Object.keys(kept.practice), ['kana-review']);
  assert.deepEqual(kept.sum.keptPractice, ['kana-games']);
  const replaced = restoreBackup(text, { practice: mine, now: NOW, library, replacePractice: true });
  assert.deepEqual(replaced.practice['kana-games'], docs.practice['kana-games']);
  assert.deepEqual(replaced.sum.keptPractice, []);
});

test('only the known practice documents travel, and only as objects', () => {
  const docs = phone();
  const practice = { ...docs.practice, 'kana-snacks': [1, 2], 'not-a-module': { v: 1 }, story: 'damaged' };
  const doc = backupDoc({ ...docs, practice, today: TODAY, now: NOW, library });
  assert.deepEqual(Object.keys(doc.practice), ['kana-games', 'kana-review']);
  const planted = JSON.stringify({ ...doc, practice: { ...doc.practice, 'not-a-module': { v: 1 }, story: 7 } });
  assert.deepEqual(readBackup(planted).summary.practice, ['kana-games', 'kana-review']);
  assert.ok(PRACTICE.every((name) => /^[a-z-]+$/.test(name)));
  // Timed writing's bests and recent results travel too (writing-rush.js).
  assert.ok(PRACTICE.includes('writing-rush'));
});

test('a damaged, foreign, empty or oversized file is refused before anything changes', () => {
  assert.deepEqual(readBackup('{not json'), { ok: false, reason: 'json' });
  assert.deepEqual(readBackup(JSON.stringify({ format: 'other/1' })), { ok: false, reason: 'format' });
  assert.deepEqual(readBackup(JSON.stringify({ format: EXPORT_FORMAT, saved: {}, seen: {} })), { ok: false, reason: 'empty' });
  assert.deepEqual(readBackup('x'.repeat(MAX_IMPORT_BYTES + 1)), { ok: false, reason: 'size' });
  assert.deepEqual(readBackup(undefined), { ok: false, reason: 'json' });
  assert.deepEqual(restoreBackup('{not json', { now: NOW, library }), { ok: false, reason: 'json' });
  // Practice alone is something to restore.
  const practiceOnly = JSON.stringify({ format: EXPORT_FORMAT, saved: {}, seen: {}, practice: { story: { v: 1 } } });
  assert.deepEqual(readBackup(practiceOnly).summary.practice, ['story']);
});

test('a damaged entry is left out and counted, and never stops the rest restoring', () => {
  const docs = phone();
  const doc = backupDoc({ ...docs, today: TODAY, now: NOW, library });
  doc.saved['猫'] = { at: 'yesterday' };
  doc.phrases.push({ t: 42 });
  const r = restoreBackup(JSON.stringify(doc), { now: NOW, library });
  assert.equal(r.ok, true);
  assert.equal(r.sum.dropped, 2);
  assert.deepEqual(Object.keys(r.kanji.saved).sort(), ['読', '雨']);
  assert.equal(r.phrases.phrases.length, 2);
});

test('the phrase book merge keeps the limit and its own sources', () => {
  const book = new PhraseBook(library);
  book.save('今日は雨。', null, NOW);
  const p = library.phrases[0];
  const sum = book.merge([{ t: p.ja, first: NOW, last: NOW, n: 1, src: 'paste', saved: NOW }], { [phraseKey(p.ja)]: { kind: 'expression', id: p.id } });
  assert.equal(sum.added, 1);
  assert.equal(book.view().items.find((i) => i.text === p.ja).source.id, p.id);
  // A source that no longer matches its text is not followed.
  const other = new PhraseBook(library);
  other.merge([{ t: 'ちがう', first: NOW, last: NOW, n: 1, src: 'paste', saved: NOW }], { [phraseKey('ちがう')]: { kind: 'expression', id: p.id } });
  assert.equal(other.view().items[0].source, null);
});

test("a new phone's backup holds nothing: it has a summary of zeros, and is refused as a file to restore", () => {
  const text = JSON.stringify(backupDoc({ today: TODAY, now: NOW, library }));
  assert.deepEqual(readBackup(text), { ok: false, reason: 'empty' });
  assert.deepEqual(backupSummary(text), {
    exported: TODAY, app: null, kanji: 0, met: 0, words: 0, phrases: 0, practice: [], dropped: 0, weight: 0,
  });
  assert.equal(backupSummary('{'), null);
  assert.equal(backupSummary(JSON.stringify({ format: 'other/1' })), null);
  assert.equal(backupSummary(textOf(phone())).weight, 7);
});

test('a backup weighs what a learner would miss: saved kanji, words, readings and practice', () => {
  const summary = readBackup(textOf(phone())).summary;
  assert.equal(backupWeight(summary), 2 + 1 + 2 + 2);
  assert.equal(backupWeight(null), 0);
  assert.equal(backupWeight({ kanji: 0, words: 0, phrases: 0, practice: [], met: 40 }), 0);
});

test('the module that writes the backup carries no long dash', () => {
  for (const file of ['../js/app-backup.js', '../js/phrase-book.js']) {
    assert.ok(!readFileSync(new URL(file, import.meta.url), 'utf8').includes(EM_DASH), file);
  }
});
