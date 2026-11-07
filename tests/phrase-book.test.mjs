import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PhraseBook, phraseKey, phraseSource } from '../js/phrase-book.js';
import { MAX_SAVED } from '../js/history-store.js';
import { useLang } from '../js/strings.js';
const library = JSON.parse(readFileSync(new URL('../data/phrases/library.json', import.meta.url)));
/** The character is named, never written, so this file passes its own rule. */
const EM_DASH = String.fromCharCode(0x2014);

/** `fn` with every string in Spanish (strings.js useLang), then English again. */
function inSpanish(fn) {
  useLang('es');
  try { return fn(); } finally { useLang('en'); }
}

/** The three messages a save can leave: nothing to save, too long, collection full. */
function saveMessages(book) {
  const said = [];
  book.save(' ', null, 1000);
  said.push(book.view().message);
  book.save('あ'.repeat(2001), null, 2000);
  said.push(book.view().message);
  for (let i = 0; i < MAX_SAVED; i++) book.save(`文${i}`, null, 3000 + i);
  book.save('もう一つ', null, 9000);
  said.push(book.view().message);
  return said;
}

test('explicit saved phrases survive reload, deduplicate spacing, and remove without recording other texts', () => {
  const book = new PhraseBook(library);
  book.save('今日は雨。', null, 1000);
  book.save(' 今日は雨。 ', null, 2000);
  assert.equal(book.view().items.length, 1);
  assert.equal(book.view().items[0].source, null);
  const restored = new PhraseBook(library, book.dump());
  assert.deepEqual(restored.view(), book.view());
  restored.remove(phraseKey('今日は雨。'));
  assert.equal(restored.view().items.length, 0);
  assert.equal(restored.dump().phrases.length, 0);
});

test('a known conversation keeps its exact line and can enrich a saved paste without inventing provenance', () => {
  const d = library.dialogues[0], line = 1;
  const source = { kind: 'conversation', id: d.id, line };
  const book = new PhraseBook(library);
  book.save(d.lines[line].ja, null, 1000);
  book.save(d.lines[line].ja, source, 2000);
  book.save(d.lines[line].ja, null, 3000);
  const restored = new PhraseBook(library, book.dump());
  assert.equal(restored.view().items.length, 1);
  assert.equal(restored.view().items[0].source.line, line);
  assert.equal(restored.view().items[0].source.id, d.id);
  assert.equal(phraseSource(library, source, 'unrelated paste'), null);
  assert.equal(phraseSource(library, { ...source, line: -1 }, d.lines[line].ja), null);
  assert.equal(phraseSource(library, { ...source, line: 0.5 }, d.lines[line].ja), null);
  assert.equal(phraseSource(library, { kind: 'conversation', id: d.id }, d.lines.map(l => l.ja).join('\n')).line, undefined);
});

test('expressions can be traced, while a changed source never loses the saved reading', () => {
  const p = library.phrases[0], book = new PhraseBook(library);
  book.save(p.ja, { kind: 'expression', id: p.id }, 1000);
  const missing = new PhraseBook({ ...library, phrases: [] }, book.dump());
  assert.equal(missing.view().items[0].text, p.ja);
  assert.equal(missing.view().items[0].source, null);
  assert.equal(missing.view().recovered, true);
  assert.equal(book.view(p.en).items.length, 1);
});

test('oversized and empty readings are refused without truncation or eviction', () => {
  const book = new PhraseBook(library);
  book.save('あ'.repeat(2000), null, 1000);
  book.save('い'.repeat(2001), null, 2000);
  assert.match(book.view().message, /nothing has been truncated/);
  assert.equal(book.view().items[0].text.length, 2000);
  book.save(' ', null, 3000);
  assert.equal(book.view().items.length, 1);
  for (let i = 1; i < MAX_SAVED; i++) book.save(`文${i}`, null, 3000 + i);
  book.save('Overflow', null, 9000);
  assert.equal(book.view().items.length, MAX_SAVED);
  assert.match(book.view().message, /full/);
});

test('damaged documents are recoverable and valid phrases survive invalid rows', () => {
  assert.equal(new PhraseBook(library, { format: 'future' }).view().recovered, true);
  const good = new PhraseBook(library);
  good.save('こんにちは。', null, 1000);
  const document = good.dump();
  document.phrases.push({ t: 'bad' });
  const recovered = new PhraseBook(library, document);
  assert.equal(recovered.view().recovered, true);
  assert.equal(recovered.view().items.length, 1);
});

test('in Spanish, a save explains itself in Spanish, its numbers written the Spanish way', () => {
  const said = inSpanish(() => saveMessages(new PhraseBook(library)));
  assert.deepEqual(said, [
    'Lee una frase antes de guardarla.',
    'Guarda hasta 2000 caracteres por frase. Primero acorta esta lectura; no se recortó nada.',
    'Tu colección de 500 frases está llena. Quita una para guardar otra.',
  ]);
  assert.match(saveMessages(new PhraseBook(library))[1], /^Save up to 2,000 characters/, 'English again');
  const english = inSpanish(() => saveMessages(new PhraseBook(library, null, 'en')));
  assert.equal(english[0], 'Read a phrase before saving it.', 'a book opened in English stays in English');
});

test('in Spanish, a saved phrase\'s source is titled from the library\'s Spanish', () => {
  const d = library.dialogues[0], line = 1, p = library.phrases[0];
  const save = () => {
    const book = new PhraseBook(library);
    book.save(d.lines[line].ja, { kind: 'conversation', id: d.id, line }, 1000);
    book.save(p.ja, { kind: 'expression', id: p.id }, 2000);
    return book;
  };
  const sources = inSpanish(() => {
    const book = save();
    assert.deepEqual(new PhraseBook(library, book.dump()).view(), book.view());
    return Object.fromEntries(book.view().items.map((i) => [i.source.kind, i.source]));
  });
  assert.deepEqual([sources.conversation.title, sources.conversation.meaning], [d.title.es, d.translation.es[line]]);
  assert.deepEqual([sources.expression.title, sources.expression.meaning], [p.es, p.es]);
  const english = Object.fromEntries(save().view().items.map((i) => [i.source.kind, i.source]));
  assert.equal(english.conversation.title, d.title.en);
  assert.notEqual(sources.conversation.title, english.conversation.title);
});

test('every Spanish message of the phrase book is written, differs from the English, and has no em dash', () => {
  const english = saveMessages(new PhraseBook(library));
  const spanish = inSpanish(() => saveMessages(new PhraseBook(library)));
  spanish.forEach((es, i) => {
    assert.ok(es.trim(), `message ${i} is empty`);
    assert.notEqual(es, english[i], `message ${i} is still English`);
    assert.ok(!es.includes(EM_DASH), `message ${i}: a dash`);
  });
  assert.ok(!readFileSync(new URL('../js/phrase-book.js', import.meta.url), 'utf8').includes(EM_DASH));
});
