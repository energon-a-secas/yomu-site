// The kanji page's data (js/kanji-page-data.js over data/strokes/ and
// data/kpage/, written by tools/build-kanji-page.mjs), read from disk the way
// the page fetches it.
//
//   node --test tests/kanji-page.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { createPageData } from '../js/kanji-page-data.js';
import { DATA, fetchJson } from './helpers/disk.mjs';

const pd = createPageData({ fetchJson, base: `${DATA}/` });
const joyo = Object.values(JSON.parse(readFileSync(`${DATA}/kanji/joyo.json`, 'utf8')).grades).flatMap((g) => [...g]);
const kanjidic = new Map();
for (const f of readdirSync(`${DATA}/kanji`).filter((x) => /^k\d+\.json$/.test(x))) {
  for (const [ch, e] of Object.entries(JSON.parse(readFileSync(`${DATA}/kanji/${f}`, 'utf8')).entries)) kanjidic.set(ch, e);
}

test('every jōyō kanji and every kana has its strokes', async () => {
  const kana = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぱゃっ'];
  const kata = [...'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガパャッー'];
  const got = await pd.strokesOf([...joyo, ...kana, ...kata]);
  const missing = [...got].filter(([, p]) => !p).map(([ch]) => ch);
  assert.deepEqual(missing, []);
  assert.equal(got.get('語').length, 14);
  assert.equal(got.get('あ').length, 3);
});

test('KanjiVG and KANJIDIC agree on the stroke count of all but nine jōyō kanji, which the page names', async () => {
  const got = await pd.strokesOf(joyo);
  const differ = joyo.filter((ch) => got.get(ch).length !== kanjidic.get(ch).s).sort();
  // The 2010 additions KanjiVG draws in their printed form, and 牙.
  assert.deepEqual(differ, [...'僅牙葛謎賭遜遡餅餌'].sort());
});

test('a kanji page: its words carry it, most used first; its neighbours share a part and are not itself', async () => {
  const go = await pd.pageOf('語');
  assert.ok(go.words.length >= 5 && go.words.length <= 10);
  assert.ok(go.words.every((w) => w.written.includes('語') && w.reading && w.gloss));
  assert.ok(go.words.some((w) => w.written === '日本語' && w.reading === 'にほんご'));
  assert.ok(go.parts['言'].includes('話'));
  assert.ok(!go.parts['言'].includes('語'));
  const sun = await pd.pageOf('日');
  assert.ok(sun.used.includes('明'), '日 is part of 明');
  assert.ok(!sun.words.some((w) => /[０-９0-9]/.test(w.written)), 'no word spelled with a digit');
  const none = await pd.pageOf('𠀋');
  assert.deepEqual([none.words, none.used, Object.keys(none.parts)], [[], [], []]);
});

test('a character KanjiVG does not draw reads as null', async () => {
  const got = await pd.strokesOf(['☃', '鬱']);
  assert.equal(got.get('☃'), null);
  assert.ok(Array.isArray(got.get('鬱')));
});

// ── Say it, see it (plan 1.1 to 1.3) ─────────────────────────────────────

test('a KANJIDIC reading reads in romaji: no dot, the affix hyphen kept, a final small tsu an apostrophe', async () => {
  const { readingRomaji, readingKana } = await import('../js/kana.js');
  const cases = [
    ['ゲン', 'gen', 'ge-n'], ['ひと.つ', 'hitotsu', 'hi-to-tsu'], ['ひと-', 'hito-', 'hi-to-'],
    ['-び', '-bi', '-bi'], ['おお.きい', 'ookii', 'o-o-ki-i'], ['ジッ', "ji'", "ji'"], ['ジュウ', 'juu', 'ju-u'],
  ];
  for (const [r, said, spelled] of cases) {
    assert.equal(readingRomaji(r, 'said'), said, r);
    assert.equal(readingRomaji(r, 'spelled'), spelled, r);
  }
  assert.equal(readingKana('-ま.ち'), 'まち', 'what is said has no marks, in hiragana');
  assert.equal(readingKana('タイ'), 'たい');
});

test('what tells look-alikes apart comes from their parts, then their strokes', async () => {
  const { apartOf } = await import('../js/lookalike-apart.js');
  const index = JSON.parse(readFileSync(`${DATA}/kanji/index.json`, 'utf8'));
  const all = new Map();
  for (const s of index.shards) for (const [ch, v] of Object.entries(JSON.parse(readFileSync(`${DATA}/../${s.src}`, 'utf8')).entries)) all.set(ch, v);
  const of = (c) => all.get(c);
  assert.deepEqual(apartOf('待', '持', of), { kind: 'swap', shared: ['寺'], theirs: ['扌'], mine: ['彳'] });
  assert.equal(apartOf('日', '白', of).kind, 'has', '白 has 日 inside it');
  assert.equal(apartOf('白', '日', of).kind, 'in', '日 is a part of 白');
  assert.deepEqual(apartOf('日', '目', of), { kind: 'strokes', n: 5, m: 4 });
  assert.equal(apartOf('未', '末', of).kind, 'same', 'the same parts and strokes: the data cannot say more');
  assert.equal(apartOf('未', '〆', () => undefined).kind, 'look', 'with nothing known, nothing is claimed');
  // Every look-alike Play ships gets a line the page can draw.
  const likes = JSON.parse(readFileSync(`${DATA}/play/lookalikes.json`, 'utf8')).kanji;
  for (const [ch, list] of Object.entries(likes)) {
    for (const other of list) assert.ok(['has', 'in', 'swap', 'strokes', 'same', 'look'].includes(apartOf(ch, other, of).kind), `${ch} ${other}`);
  }
});
