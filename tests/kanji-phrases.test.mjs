// A kanji's library lines (js/kanji-phrases.js), followed back to the library
// by phrase-book.js, as a saved phrase is.
//
//   node --test tests/kanji-phrases.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { phrasesWithKanji } from '../js/kanji-phrases.js';
import { phraseSource } from '../js/phrase-book.js';
import { useLang } from '../js/strings.js';

const library = JSON.parse(fs.readFileSync(new URL('../data/phrases/library.json', import.meta.url)));
const KANJI = ['日', '何', '願', '分', '一', '時', '行', '駅', '大', '本', '五', '円'];

/** `fn` with every string in Spanish (strings.js useLang), then English again. */
function inSpanish(fn) {
  useLang('es');
  try { return fn(); } finally { useLang('en'); }
}

test('every line found follows back to the library, in either language', () => {
  for (const lang of ['en', 'es']) {
    for (const ch of KANJI) {
      const found = phrasesWithKanji(library, ch, { limit: 50, lang });
      assert.ok(found.length > 0, ch);
      for (const p of found) {
        assert.ok(p.ja.includes(ch), `${ch}: ${p.ja}`);
        const back = phraseSource(library, p.source, p.ja, lang);
        assert.ok(back, `${ch}: ${JSON.stringify(p.source)}`);
        assert.equal(back.title, p.title);
        assert.equal(back.meaning, p.meaning);
        assert.equal(typeof p.kana, 'string', 'the library gives every line its kana');
      }
    }
  }
});

test('expressions come first, then dialogue lines, and the limit holds', () => {
  for (const ch of KANJI) {
    const all = phrasesWithKanji(library, ch, { limit: 100 });
    const kinds = all.map((p) => p.source.kind);
    const rank = { expression: 0, conversation: 1 };
    assert.deepEqual(kinds, [...kinds].sort((a, b) => rank[a] - rank[b]), `${ch}: ${kinds.join(' ')}`);
    const expressions = library.phrases.filter((p) => p.ja.includes(ch)).map((p) => p.id);
    assert.deepEqual(all.filter((p) => p.source.kind === 'expression').map((p) => p.source.id), expressions);
    for (const n of [0, 1, 2, 3]) assert.equal(phrasesWithKanji(library, ch, { limit: n }).length, Math.min(n, all.length));
    assert.deepEqual(phrasesWithKanji(library, ch), all.slice(0, 6), 'six by default');
    assert.equal(new Set(all.map((p) => p.ja)).size, all.length, 'no line twice');
  }
  const day = phrasesWithKanji(library, '日', { limit: 100 });
  assert.ok(day.some((p) => p.source.kind === 'expression') && day.some((p) => p.source.kind === 'conversation'));
  const line = day.find((p) => p.source.kind === 'conversation');
  assert.equal(typeof line.source.line, 'number');
  assert.equal(line.title, library.dialogues.find((d) => d.id === line.source.id).title.en);
});

test('a kanji the library never uses, or anything but one kanji, finds nothing', () => {
  for (const ch of ['鬱', '龍']) {
    assert.ok(![...library.phrases, ...library.dialogues.flatMap((d) => d.lines)].some((p) => p.ja.includes(ch)));
    assert.deepEqual(phrasesWithKanji(library, ch), []);
  }
  for (const input of ['か', 'カ', 'a', '', '日本', null, undefined, 7, ['日'], '。']) {
    assert.deepEqual(phrasesWithKanji(library, input), [], String(input));
  }
  assert.deepEqual(phrasesWithKanji(null, '日'), []);
});

test('in Spanish, a kanji\'s lines carry the library\'s Spanish without being asked, and follow back the same way', () => {
  const english = phrasesWithKanji(library, '日', { limit: 100 });
  inSpanish(() => {
    for (const ch of KANJI) {
      const spanish = phrasesWithKanji(library, ch, { limit: 50 });
      assert.deepEqual(spanish, phrasesWithKanji(library, ch, { limit: 50, lang: 'es' }), ch);
      for (const p of spanish) {
        const back = phraseSource(library, p.source, p.ja);
        assert.deepEqual([back.title, back.meaning], [p.title, p.meaning], `${ch}: ${p.ja}`);
      }
    }
    const day = phrasesWithKanji(library, '日', { limit: 100 });
    assert.deepEqual(day.map((p) => p.source), english.map((p) => p.source), 'the same lines in either language');
    assert.equal(day.find((p) => p.source.id === 'nihongo-benkyou').meaning, 'Estoy estudiando japonés.');
    const line = day.find((p) => p.source.kind === 'conversation');
    const d = library.dialogues.find((x) => x.id === line.source.id);
    assert.deepEqual([line.title, line.meaning], [d.title.es, d.translation.es[line.source.line]]);
    assert.notEqual(line.meaning, english.find((p) => p.source.kind === 'conversation').meaning);
    assert.equal(phrasesWithKanji(library, '日', { limit: 100, lang: 'en' })[0].meaning, english[0].meaning, 'an explicit lang still wins');
  });
  assert.deepEqual(phrasesWithKanji(library, '日', { limit: 100 }), english, 'English again');
});
