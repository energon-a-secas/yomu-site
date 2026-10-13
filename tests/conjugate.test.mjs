// The conjugation table (js/conjugate.js), held to the analyzer.
//
//   node --test tests/conjugate.test.mjs
//
// conjugate.js builds forms forward and deinflect.js reads them back, and the
// two were written apart. So every form of every conjugable word in the
// first tier must deinflect back to that word with a part of speech the
// record admits: a wrong ending has to be wrong the same way twice to pass.
// A sample of words goes further and runs each form through analyze(), which
// must read it as one token of the same word with the same romaji the table
// shows, so the table and the reading never say a form two ways.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { conjugate, conjugateToken, conjClass, formNote, GROUPS } from '../js/conjugate.js';
import { deinflect, posMatches } from '../js/deinflect.js';
import { GRAMMAR_NOTES } from '../js/notes.js';
import { FORM_NAMES } from '../js/strings-conj.js';
import { DATA, run } from './helpers/disk.mjs';

/** Every first-tier record: core.json and the w shards. */
function firstTier() {
  const files = ['core.json', ...readdirSync(`${DATA}/dict`).filter((f) => /^w\d+\.json$/.test(f))];
  const out = [];
  for (const f of files) {
    const { entries } = JSON.parse(readFileSync(`${DATA}/dict/${f}`, 'utf8'));
    for (const [key, recs] of Object.entries(entries)) for (const rec of recs) out.push([key, rec]);
  }
  return out;
}

const table = (w, r, p) => {
  const t = conjugate(w, r, p);
  assert.ok(t, `${w} has a table`);
  return Object.fromEntries(t.rows.map((row) => [row.id, row]));
};

test('the forms a textbook lists, for each verb class', () => {
  const cases = [
    ['食べる', 'たべる', 'v1', { negative: '食べない', te: '食べて', potential: '食べられる', volitional: '食べよう', imperative: '食べろ' }],
    ['書く', 'かく', 'v5k', { te: '書いて', past: '書いた', potential: '書ける', volitional: '書こう', imperative: '書け' }],
    ['行く', 'いく', 'v5k-s', { te: '行って', past: '行った', 'polite-past': '行きました' }],
    ['泳ぐ', 'およぐ', 'v5g', { te: '泳いで', past: '泳いだ' }],
    ['話す', 'はなす', 'v5s', { te: '話して', negative: '話さない' }],
    ['待つ', 'まつ', 'v5t', { te: '待って', negative: '待たない', polite: '待ちます' }],
    ['死ぬ', 'しぬ', 'v5n', { te: '死んで' }],
    ['遊ぶ', 'あそぶ', 'v5b', { te: '遊んで' }],
    ['読む', 'よむ', 'v5m', { te: '読んで', ba: '読めば' }],
    ['帰る', 'かえる', 'v5r', { te: '帰って', negative: '帰らない' }],
    ['買う', 'かう', 'v5u', { negative: '買わない', te: '買って', passive: '買われる' }],
    ['ある', 'ある', 'v5r-i', { negative: 'ない', 'past-negative': 'なかった', polite: 'あります' }],
    ['くださる', 'くださる', 'v5aru', { polite: 'くださいます', imperative: 'ください' }],
    ['勉強する', 'べんきょうする', 'vs-i', { negative: '勉強しない', potential: '勉強できる', te: '勉強して' }],
    ['来る', 'くる', 'vk', { negative: '来ない', polite: '来ます', ba: '来れば', imperative: '来い' }],
  ];
  for (const [w, r, p, want] of cases) {
    const t = table(w, r, p);
    for (const [id, written] of Object.entries(want)) assert.equal(t[id] && t[id].written, written, `${w} ${id}`);
  }
  const kuru = table('来る', 'くる', 'vk');
  assert.equal(kuru.negative.reading, 'こない');
  assert.equal(kuru.polite.reading, 'きます');
  assert.equal(table('ある', 'ある', 'v5r-i').potential, undefined, 'ある has no potential');
});

test('adjectives: いい conjugates from よい, a na-adjective moves only its copula', () => {
  const ii = table('いい', 'いい', 'adj-ix');
  assert.equal(ii.plain.written, 'いい');
  assert.equal(ii.polite.written, 'いいです');
  assert.equal(ii.past.written, 'よかった');
  assert.equal(ii.negative.written, 'よくない');
  const cool = table('かっこいい', 'かっこいい', 'adj-ix');
  assert.equal(cool.past.written, 'かっこよかった');
  const takai = table('高い', 'たかい', 'adj-i');
  assert.equal(takai.negative.written, '高くない');
  assert.equal(takai.negative.reading, 'たかくない');
  assert.equal(takai.adverb.written, '高く');
  const shizuka = table('静か', 'しずか', 'adj-na n');
  assert.equal(shizuka.plain.written, '静かだ');
  assert.equal(shizuka.adverb.written, '静かに');
  assert.equal(shizuka['polite-negative'].written, '静かじゃありません');
});

test('a verb wins over an adjective tag, and nothing else conjugates', () => {
  assert.equal(conjClass('adj-na v5r'), 'v5r');
  assert.equal(conjClass('n'), null);
  assert.equal(conjugate('猫', 'ねこ', 'n'), null);
  assert.equal(conjugate('食べる', 'たべ', 'v1'), null, 'a reading that does not end like the word');
});

test('every form of every first-tier verb and i-adjective deinflects back to its word', () => {
  let words = 0;
  let forms = 0;
  const wrong = [];
  for (const [key, rec] of firstTier()) {
    const cls = conjClass(rec.p);
    if (!cls || cls === 'adj-na') continue;
    for (const r of rec.r || []) {
      const t = conjugate(key, r, rec.p);
      if (!t) continue;
      words++;
      for (const row of t.rows) {
        if (row.id === 'plain') continue;
        forms++;
        // A whole-word form (ない for ある) and できる are other words, not inflections.
        if (cls === 'v5r-i' && /^な/.test(row.written)) continue;
        if (cls === 'vs-i' && row.id === 'potential') continue;
        let first = row.words[0];
        let word = key;
        // The reader reads 気がする as 気が|する and 付いてくる as 付いて|くる,
        // so their forms are する's and くる's.
        const tail = cls === 'vs-i' ? 'する' : cls === 'vk' && key.endsWith('くる') ? 'くる' : null;
        if (tail && key !== tail) {
          first = first.slice(key.length - tail.length);
          word = tail;
        }
        // いい conjugates from よい, and deinflect.js reads 格好よかった back to 格好よい.
        if (cls === 'adj-ix' && key.endsWith('いい') && row.id !== 'polite') word = `${key.slice(0, -2)}よい`;
        // あろう and あらせる: deinflect.js leaves ある's volitional out on purpose.
        if (cls === 'v5r-i' && /^(volitional|causative)$/.test(row.id)) continue;
        // 乞うて, 問うた: deinflect.js has no row for v5u-s, whose te and ta are classical.
        if (cls === 'v5u-s' && /^(te|past|tara)$/.test(row.id)) continue;
        const back = first !== word && deinflect(first).some((d) => d.base === word && posMatches(d.type, word === key || cls === 'adj-ix' ? rec.p : { する: 'vs-i', くる: 'vk' }[word], d.base, true));
        if (!back && first !== word) wrong.push(`${key} ${row.id} ${row.written}`);
      }
    }
  }
  assert.ok(words > 2000, `checked ${words} words`);
  assert.ok(forms > 30000, `checked ${forms} forms`);
  assert.deepEqual(wrong.slice(0, 60), [], `${wrong.length} forms do not come back`);
});

test('the analyzer reads each form of a sample as one token of the word, with the same romaji', async () => {
  const sample = [
    ['食べる', 'たべる', 'v1 vt'], ['書く', 'かく', 'v5k vt'], ['行く', 'いく', 'v5k-s vi'], ['来る', 'くる', 'vk vi'],
    ['思う', 'おもう', 'v5u vt'], ['待つ', 'まつ', 'v5t vt'], ['高い', 'たかい', 'adj-i'], ['静か', 'しずか', 'adj-na'],
  ];
  const wrong = [];
  for (const [w, r, p] of sample) {
    for (const row of conjugate(w, r, p).rows) {
      const toks = (await run(row.written)).tokens.filter((x) => x.kind !== 'punct');
      const said = toks.map((x) => x.romaji.said).join(' ');
      // A form the dictionary lists as a word of its own (思われる) is read as that word.
      const ofWord = toks[0].base === w || (toks[0].kind === 'word' && toks[0].surface === row.words[0]);
      if (!ofWord || said !== row.romaji) {
        wrong.push(`${row.written} table ${row.romaji}, reader ${toks.map((x) => `${x.surface}:${x.base}:${x.romaji.said}`).join(' ')}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('a token from the reading is conjugated from its dictionary form, and its own form is marked', async () => {
  const tok = (await run('昨日パンを食べました。')).tokens.find((x) => x.surface === '食べました');
  const t = conjugateToken(tok);
  assert.ok(t);
  assert.equal(t.here, 'polite-past');
  assert.equal(t.rows[0].written, '食べる');
  const went = (await run('学校に行った。')).tokens.find((x) => x.surface === '行った');
  assert.equal(conjugateToken(went).rows[0].reading, 'いく');
  const neko = (await run('猫')).tokens[0];
  assert.equal(conjugateToken(neko), null);
});

test('every form has a name in both languages, and every note it opens exists', () => {
  const ids = new Set([...GROUPS.verb, ...GROUPS.adj].flatMap((g) => g.forms));
  for (const id of ids) {
    assert.ok(FORM_NAMES[id] && FORM_NAMES[id].en && FORM_NAMES[id].es, `name for ${id}`);
    for (const cls of ['v1', 'adj-i', 'adj-na']) {
      const note = formNote(cls, id);
      if (note) assert.ok(GRAMMAR_NOTES[note], `${cls} ${id} -> ${note}`);
    }
  }
});
