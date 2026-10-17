import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { run, cut } from './helpers/disk.mjs';
import { filterLibrary } from '../js/library-filter.js';

const library = JSON.parse(await readFile(new URL('../data/phrases/library.json', import.meta.url)));

test('a kana name in an ornamental title is not taught as a question', async () => {
  const result = await run('魔法少女まどか☆マギカ');
  assert.equal(cut(result), '魔法|少女|まどか|☆|マギカ');
  const madoka = result.tokens.find((t) => t.surface === 'まどか');
  assert.equal(madoka.kind, 'name');
  assert.equal(madoka.confidence, 'guess');
  assert.equal(madoka.romaji.said, 'madoka');
  assert.equal(madoka.entry, null);
  assert.deepEqual(madoka.grammar, []);
  assert.equal(result.text.slice(madoka.start, madoka.end), 'まどか');
});

test('title context does not swallow a real question or ordinary kana prose', async () => {
  for (const text of ['行きますか', '魔法少女ですか☆マギカ', 'これはまどか☆マギカ', 'まどか？']) {
    const result = await run(text);
    assert.ok(result.tokens.some((t) => t.surface === 'か' && t.grammar.some((g) => g.id === 'ka-question')), text);
  }
  assert.equal(cut(await run('魔法少女まどか。マギカ')), '魔法|少女|まど|か|。|マギカ');
});

test('the library searches Japanese, English and said romaji in both shelves', () => {
  for (const q of ['こんにちは', 'konnichiwa', 'hello']) {
    assert.ok(filterLibrary(library, q).phrases.some((p) => p.ja.includes('こんにちは')), q);
  }
  for (const q of ['コーヒー', 'koohii', 'coffee']) {
    assert.ok(filterLibrary(library, q).phrases.length, q);
  }
  assert.ok(filterLibrary(library, 'coffee').dialogues.length);
  assert.equal(filterLibrary(library, 'zzzyyyxx').phrases.length, 0);
  assert.equal(filterLibrary(library, 'zzzyyyxx').dialogues.length, 0);
  assert.deepEqual(filterLibrary(library, '  '), library);
  const filtered = filterLibrary(library, 'coffee');
  assert.ok(filtered.categories.every((c) => c.items.every((id) => filtered.phrases.some((p) => p.id === id))));
  assert.ok(library.phrases.length > filtered.phrases.length, 'search never mutates the library');
});
