// The kana games' and Kana to kanji's words in Spanish: every hint the games
// can show, the setup guidance and the not-ready message, resolved through
// strings.js like the rest of the learning modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameKana, kanaGameSetup } from '../js/kana-games.js';
import { spellingSetup } from '../js/kana-to-kanji.js';
import { kanaChart } from '../js/kana-chart.js';
import { useLang } from '../js/strings.js';

const ids = kanaChart().filter((s) => s.id !== 'timing').flatMap((s) => s.cells).filter((c) => c.kana).map((c) => c.id);
const hintsIn = (lang, script) => { useLang(lang); return gameKana(script, ids).map((c) => [c.kana, c.hint]); };

test('every kana hint the games can show has its own Spanish', () => {
  try {
    for (const script of ['hiragana', 'katakana']) {
      const en = hintsIn('en', script), es = new Map(hintsIn('es', script));
      assert.equal(en.length, es.size);
      for (const [kana, hint] of en) {
        assert.ok(es.get(kana) && es.get(kana) !== hint, `${kana}: ${es.get(kana)}`);
      }
    }
  } finally { useLang('en'); }
});

test('setup guidance and the not-ready message follow the language', () => {
  try {
    useLang('es');
    assert.match(kanaGameSetup({ selected: [] }).message, /^Elige al menos dos kana/);
    assert.match(kanaGameSetup({ selected: [], mode: 'apart' }).message, /^Elige los dos miembros/);
    assert.match(spellingSetup([]).message, /^Este grupo necesita/);
    useLang('en');
    assert.match(kanaGameSetup({ selected: [] }).message, /^Choose at least two kana/);
    assert.match(spellingSetup([]).message, /^This set needs/);
  } finally { useLang('en'); }
});
