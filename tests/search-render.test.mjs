// Search's results as the page draws them (js/render-search.js, the shelf
// rows in js/render-sets.js), over the committed data, on a stand-in
// document (tests/helpers/fake-document.mjs): in Spanish a card shows its
// Spanish meanings and says how it was found, and a romaji sentence typed
// together is offered whole with Read it.
//
//   node --test tests/search-render.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSearch } from '../js/search.js';
import { resultNodes } from '../js/render-search.js';
import { setListNodes } from '../js/render-sets.js';
import { useLang } from '../js/strings.js';
import { installFakeDocument, elements } from './helpers/fake-document.mjs';
import { dict, fetchJson, DATA } from './helpers/disk.mjs';

installFakeDocument();
const s = createSearch({ dict: dict(), fetchJson, base: `${DATA}/` });
const text = (nodes) => nodes.map((n) => n.textContent).join(' ');
const withLang = async (lang, fn) => { useLang(lang); try { return await fn(); } finally { useLang('en'); } };

test('in Spanish a card shows its Spanish meanings, lang es, and says it was found by its Spanish', () => withLang('es', async () => {
  const d = dict();
  const found = await s.search('gato', { lang: 'es' });
  await d.needEs(found.words.flatMap((w) => w.recs));
  const kanjiEs = await d.kanjiEs(found.kanji);
  const { nodes } = resultNodes(found, new Map(), 'gato', undefined, undefined, undefined, { of: (r) => d.esOf(r), kanji: kanjiEs });
  const gloss = [...elements(nodes)].find((e) => e.className === 'sr-gloss');
  const spans = [...elements(gloss.childNodes)];
  assert.equal(spans[0].attrs.get('lang'), 'es');
  assert.match(spans[0].textContent, /^gato/);
  assert.match(text(nodes), /Español: gato/);
  const tile = [...elements(nodes)].find((e) => e.className === 'kp-go-mean');
  assert.equal(tile.attrs.get('lang'), 'es', 'the kanji tile in Spanish too');
}));

test('in Spanish a meaning the dictionary has only in English says so', () => withLang('es', async () => {
  const found = await s.search('amberjack', { lang: 'es' });
  const { nodes } = resultNodes(found, new Map(), 'amberjack', undefined, undefined, undefined, { of: () => null });
  assert.match(text(nodes), /Significado en inglés: /);
}));

test('a romaji sentence typed together is offered whole, with Read it, above its words', async () => {
  const found = await s.search('watashiwagakuseidesu');
  const { nodes, kept } = resultNodes(found, new Map(), 'watashiwagakuseidesu');
  assert.equal(nodes[0].className, 'sr-sentence');
  assert.match(nodes[0].textContent, /私は学生です/);
  const read = [...elements(nodes[0].childNodes)].find((e) => e.attrs.get('data-act') === 'sr-read');
  assert.equal(kept.words[Number(read.attrs.get('data-ix'))], '私は学生です', 'Read it reads the sentence, kept by place, not in an attribute');
  assert.match(text(nodes), /A word of the sentence: わたし/);
});

test('the shelf shows a row\'s Spanish on a page in Spanish, and its English otherwise', () => {
  const row = ['時は金なり', 'ときはかねなり', ['time is money'], 1, 'toki wa kane nari', ['el tiempo es oro']];
  const gloss = (nodes) => [...elements(nodes)].find((e) => e.className === 'sr-gloss');
  const en = gloss(setListNodes([row], 1, 1).nodes);
  assert.equal(en.attrs.get('lang'), 'en');
  assert.equal(en.textContent, 'time is money');
  useLang('es');
  try {
    const es = gloss(setListNodes([row], 1, 1).nodes);
    assert.equal(es.attrs.get('lang'), 'es');
    assert.equal(es.textContent, 'el tiempo es oro');
    const plain = gloss(setListNodes([row.slice(0, 5)], 1, 1).nodes);
    assert.equal(plain.textContent, 'time is money', 'a row without Spanish keeps its English');
  } finally { useLang('en'); }
});

test('in Spanish a card says it was found by the learner\'s word as typed, accent and all (it said dias for días)', () => withLang('es', async () => {
  const found = await s.search('días', { lang: 'es' });
  const { nodes } = resultNodes(found, new Map(), 'días', undefined, undefined, undefined, { of: () => null });
  assert.match(text(nodes), /Español: días/);
  assert.doesNotMatch(text(nodes), /Español: dias/);
}));
