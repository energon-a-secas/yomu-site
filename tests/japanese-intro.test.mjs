// The first look at Japanese (js/japanese-intro.js): both languages for every
// text, no em dash, the first sentence's colours, every example read by the
// analyzer exactly as the intro writes it (its kana and its romaji), the
// numbers it states held to the data, words set side by side said each whole,
// and a report of how many examples the recorded voices already cover.
//
//   node --test tests/japanese-intro.test.mjs
//
// An example the analyzer reads with a guess, or with another reading, is
// changed in the intro, never here: a learner taps it in the reader and must
// see what the intro says.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { INTRO, INTRO_SCRIPTS, LANGS, SIDE_BY_SIDE, introFor, sayOf, scriptParts, scriptOf } from '../js/japanese-intro.js';
import { JAPANESE_KINDS } from '../js/analyze.js';
import { hasKanji } from '../js/kana.js';
import { BASIC_KANA } from '../js/kana-chart.js';
import { normalizeAudio, addShard, shardsFor, keysOf, wordKey, clipByKeys } from '../js/audio.js';
import { sayable } from '../js/speech.js';
import { run, cut } from './helpers/disk.mjs';

const ROOT = new URL('../', import.meta.url);
const SOURCE = fs.readFileSync(new URL('js/japanese-intro.js', ROOT), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const BANNED = /\b(powerful|seamless|leverages?|robust|utili[sz]e|journey|unlock)\b/i;
const IDS = ['scripts', 'hiragana', 'katakana', 'kanji', 'sounds', 'sentence', 'path'];

const examples = () => INTRO.sections.flatMap((s) => s.examples.map((e) => ({ id: s.id, ...e })));

/** Every { en, es } the intro holds, with where it is. */
function texts() {
  const out = [];
  for (const s of INTRO.sections) {
    out.push({ at: `${s.id} title`, v: s.title });
    s.body.forEach((b, i) => out.push({ at: `${s.id} body ${i}`, v: b }));
    for (const e of s.examples) {
      out.push({ at: `${s.id} ${e.ja}`, v: { en: e.en, es: e.es } });
      if (e.note) out.push({ at: `${s.id} ${e.ja} note`, v: e.note });
    }
  }
  return out;
}

/** Every string anywhere in a value. */
function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

/** The kana the reader shows for an analysis: a word with kanji as its reading, a kana word and punctuation as written. */
const kanaOf = (r) => r.tokens.map((t) => (JAPANESE_KINDS.has(t.kind) && hasKanji(t.surface) ? t.reading : t.surface)).join('');

/**
 * The romaji the reader shows under an analysis, as one line: each word's said
 * romaji (the particle は is wa, a long vowel doubled) with a space between
 * words, 。 and 、 as . and , against the word before, and ・ as a space.
 */
function romajiOf(r) {
  let out = '';
  for (const t of r.tokens) {
    const said = (t.romaji && t.romaji.said) || '';
    if (!said) continue;
    if (JAPANESE_KINDS.has(t.kind) || t.kind === 'latin') out += (out && !out.endsWith(' ') ? ' ' : '') + said;
    else out += said.trim() ? said : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * The romaji of words set side by side with ・, as they are said: each word's
 * tokens as one word (the reader's おば and さん are obasan), a space between
 * words.
 */
function sideBySideRomajiOf(r) {
  const out = [''];
  for (const t of r.tokens) {
    if (t.surface === SIDE_BY_SIDE) { out.push(''); continue; }
    const said = (t.romaji && t.romaji.said) || '';
    if (JAPANESE_KINDS.has(t.kind)) out[out.length - 1] += said.replace(/\s+/g, '');
  }
  return out.join(' ');
}

const words = (s) => s.split(/\s+/).filter(Boolean).length;

test('seven sections in the order that builds, each short', () => {
  assert.ok(Object.isFrozen(INTRO) && Object.isFrozen(INTRO.sections[0].examples[0].parts[0]), 'the content is frozen all the way down');
  assert.deepEqual(INTRO.sections.map((s) => s.id), IDS);
  for (const s of INTRO.sections) {
    assert.ok(s.body.length >= 1 && s.body.length <= 3, `${s.id}: ${s.body.length} paragraphs`);
    assert.ok(s.examples.length >= 1 && s.examples.length <= 3, `${s.id}: ${s.examples.length} examples`);
    for (const e of s.examples) {
      for (const k of ['ja', 'kana', 'romaji', 'en', 'es']) assert.equal(typeof e[k], 'string', `${s.id} ${e.ja}: ${k}`);
    }
  }
});

test('every text is in English and in Spanish, and no string is empty', () => {
  for (const { at, v } of texts()) {
    assert.deepEqual(Object.keys(v).sort(), [...LANGS].sort(), `${at}: ${JSON.stringify(v)}`);
    for (const lang of LANGS) {
      assert.equal(typeof v[lang], 'string', `${at}: ${lang}`);
      assert.ok(v[lang].trim(), `${at}: ${lang} is empty`);
      assert.equal(v[lang], v[lang].trim(), `${at}: ${lang} has spaces at an end`);
    }
  }
  for (const s of INTRO.sections) {
    for (const v of [s.title, ...s.body]) assert.notEqual(v.es, v.en, `${s.id}: the Spanish is the English`);
  }
  for (const v of strings(INTRO)) assert.ok(v.trim(), 'an empty string');
});

test('no em dash, no en dash, none of the words the site keeps out, and kana is masculine in Spanish', () => {
  for (const v of strings(INTRO)) {
    assert.ok(!v.includes(EM_DASH) && !v.includes(EN_DASH), v);
    assert.doesNotMatch(v, BANNED);
  }
  assert.ok(!SOURCE.includes(EM_DASH), 'the module has an em dash');
  for (const { at, v } of texts()) assert.doesNotMatch(v.es, /\b(las|una|la) kana\b/i, `${at}: the app writes los kana`);
});

test('the module touches no browser global and imports only kana.js', () => {
  const code = SOURCE.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /\b(window|document|localStorage|sessionStorage|navigator|fetch)\b|\bURL\b|import\.meta/);
  assert.deepEqual([...SOURCE.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1]), ['./kana.js']);
});

test('a string is cut into runs of one script', () => {
  assert.deepEqual(scriptParts('飲みます'), [{ text: '飲', script: 'kanji' }, { text: 'みます', script: 'hiragana' }]);
  assert.deepEqual(scriptParts('コーヒー'), [{ text: 'コーヒー', script: 'katakana' }], 'the bar ー is katakana');
  assert.deepEqual(scriptParts('人々'), [{ text: '人々', script: 'kanji' }], '々 is read like a kanji');
  assert.deepEqual(scriptParts('三ヶ月'), [{ text: '三ヶ月', script: 'kanji' }]);
  assert.deepEqual(scriptParts('はい、OK 1'), [{ text: 'はい', script: 'hiragana' }, { text: '、OK 1', script: 'other' }]);
  assert.deepEqual(scriptParts(''), []);
  assert.deepEqual(scriptParts(null), []);
  assert.equal(scriptOf('ゝ'), 'hiragana');
});

test('the first sentence is coloured by script, and its colours are the splitter\'s', () => {
  const [first, ...rest] = examples();
  assert.equal(first.id, 'scripts');
  assert.equal(first.parts.map((x) => x.text).join(''), first.ja, 'the parts join back to the sentence');
  assert.deepEqual(first.parts, scriptParts(first.ja));
  for (const x of first.parts) assert.ok(INTRO_SCRIPTS.includes(x.script), x.script);
  for (const script of ['kanji', 'hiragana', 'katakana']) assert.ok(first.parts.some((x) => x.script === script), `no ${script}`);
  for (const e of rest) assert.equal(e.parts, undefined, `${e.ja}: only the first sentence is coloured`);
});

test('every example is read as the intro writes it, kana and romaji, with no guessed word', async () => {
  for (const e of examples()) {
    const r = await run(e.ja);
    assert.equal(r.tokens.map((t) => t.surface).join(''), e.ja, `${e.ja}: the text changed on the way in`);
    const guessed = r.tokens.filter((t) => JAPANESE_KINDS.has(t.kind) && (t.confidence === 'guess' || t.kind === 'unknown'));
    assert.deepEqual(guessed.map((t) => t.surface), [], `${e.ja}: ${cut(r)}`);
    assert.equal(kanaOf(r), e.kana, `${e.ja}: ${cut(r)}`);
    if (sayOf(e)) assert.equal(e.romaji, sideBySideRomajiOf(r), `${e.ja}: each word's romaji as it is said`);
    else assert.equal(e.romaji, romajiOf(r), `${e.ja}: the romaji is the reader's`);
  }
});

test('words set side by side are said one at a time, each whole', async () => {
  // The reader splits おばさん into おば and さん; said word by word, that put
  // a pause inside the four beats the note counts. sayOf gives the words to
  // say whole, each with its kana, for every example written with ・.
  const listed = examples().filter((e) => e.ja.includes(SIDE_BY_SIDE));
  assert.deepEqual(listed.map((e) => e.ja), ['紙・髪・神', 'おばさん・おばあさん', 'きって・きて', '箸・橋']);
  for (const e of listed) {
    const say = sayOf(e);
    assert.ok(say && say.length >= 2, e.ja);
    assert.equal(say.map((w) => w.text).join(SIDE_BY_SIDE), e.ja);
    assert.equal(say.map((w) => w.kana).join(SIDE_BY_SIDE), e.kana);
    assert.equal(say.length, e.romaji.split(' ').length, `${e.ja}: one romaji word per word said`);
  }
  assert.deepEqual(sayOf(listed[1]), [{ text: 'おばさん', kana: 'おばさん' }, { text: 'おばあさん', kana: 'おばあさん' }]);
  assert.deepEqual(sayOf(listed[0]).map((w) => w.kana), ['かみ', 'かみ', 'かみ']);
  const r = await run('おばさん');
  assert.ok(r.tokens.length > 1, 'the reason: the reader reads おばさん as more than one word');
  for (const e of examples().filter((x) => !x.ja.includes(SIDE_BY_SIDE))) assert.equal(sayOf(e), null, e.ja);
  assert.equal(sayOf({ ja: '紙・髪', kana: 'かみ' }), null, 'words and kana that do not pair up');
  assert.equal(sayOf(null), null);
});

test('the numbers the intro states are the data\'s', () => {
  // Every number written, in either language. A new one must be added here
  // with where it comes from.
  const said = new Set();
  for (const { v } of texts()) for (const lang of LANGS) for (const m of v[lang].matchAll(/\d[\d,]*/g)) said.add(Number(m[0].replace(/,/g, '')));
  assert.deepEqual([...said].sort((a, b) => a - b), [3, 46, 2010, 2136]);
  // 3 is the sign in the analogy. 2010 is the cabinet notice that set the
  // current jōyō list (平成22年内閣告示第2号, 30 November 2010).
  const all = (lang) => introFor(lang).sections.flatMap((s) => [s.title, ...s.body]).join(' ');
  const en = all('en');
  const es = all('es');

  assert.equal(BASIC_KANA.length, 46);
  assert.match(en, /\b46 basic kana\b/);
  assert.match(es, /\b46 kana básicos\b/);

  const joyo = JSON.parse(fs.readFileSync(new URL('data/kanji/joyo.json', ROOT), 'utf8'));
  const grades = joyo.grades;
  const listed = Object.values(grades).flatMap((g) => [...(Array.isArray(g) ? g.join('') : g)]);
  assert.equal(joyo.count, 2136);
  assert.equal(new Set(listed).size, 2136);
  assert.match(en, /\b2,136\b/);
  assert.match(es, /\b2136\b/, 'Spanish writes four digits without a separator');

  // "Most kanji have more than one reading", counted in KANJIDIC over the jōyō list.
  const facts = {};
  for (const f of fs.readdirSync(new URL('data/kanji/', ROOT)).filter((x) => /^k\d+\.json$/.test(x))) {
    Object.assign(facts, JSON.parse(fs.readFileSync(new URL(`data/kanji/${f}`, ROOT), 'utf8')).entries);
  }
  const more = listed.filter((ch) => facts[ch] && (facts[ch].on || []).length + (facts[ch].kun || []).length > 1).length;
  assert.ok(more > listed.length / 2, `${more} of ${listed.length}`);
  assert.match(en, /Most kanji also have more than one reading/);
  assert.match(es, /La mayoría de los kanji también tiene más de una lectura/);
});

test('introFor gives one language, and says when English stood in', () => {
  const both = { en: introFor('en'), es: introFor('es') };
  for (const lang of LANGS) {
    const r = both[lang];
    assert.equal(r.lang, lang);
    assert.equal(r.fallback, false);
    INTRO.sections.forEach((s, i) => {
      const out = r.sections[i];
      assert.equal(out.id, s.id);
      assert.equal(out.title, s.title[lang]);
      assert.deepEqual(out.body, s.body.map((b) => b[lang]));
      s.examples.forEach((e, j) => {
        const x = out.examples[j];
        assert.deepEqual([x.ja, x.kana, x.romaji, x.translation], [e.ja, e.kana, e.romaji, e[lang]]);
        assert.equal(x.note, e.note ? e.note[lang] : undefined);
        assert.deepEqual(x.say, sayOf(e) || undefined, `${e.ja}: the words to say whole`);
      });
    });
  }
  assert.deepEqual(both.en.sections[0].examples[0].parts, INTRO.sections[0].examples[0].parts);
  assert.deepEqual(introFor(), both.en);
  const other = introFor('fr');
  assert.equal(other.lang, 'en');
  assert.equal(other.fallback, true, 'a language the intro does not have is English, said so');
  assert.deepEqual(other.sections, both.en.sections);

  const partial = { sections: [{ id: 'x', title: { en: 'Title' }, body: [{ en: 'One.', es: 'Uno.' }], examples: [{ ja: '山', kana: 'やま', en: 'mountain', es: '' }] }] };
  const r = introFor('es', partial);
  assert.equal(r.fallback, true);
  assert.deepEqual([r.sections[0].title, r.sections[0].body[0], r.sections[0].examples[0].translation], ['Title', 'Uno.', 'mountain']);
  assert.equal(introFor('en', partial).fallback, false);
  assert.deepEqual(introFor('en', null).sections, []);
});

test('it reads in about three to five minutes', (t) => {
  const count = (lang) => {
    const r = introFor(lang);
    return r.sections.reduce((n, s) => n + words(s.title) + s.body.reduce((m, b) => m + words(b), 0)
      + s.examples.reduce((m, e) => m + words(e.translation) + (e.note ? words(e.note) : 0), 0), 0);
  };
  const en = count('en');
  const es = count('es');
  t.diagnostic(`words: ${en} in English, ${es} in Spanish, titles, paragraphs, translations and notes`);
  assert.ok(en >= 450 && en <= 1000, `${en} English words`);
  assert.ok(es >= 450 && es <= 1100, `${es} Spanish words`);
});

test('report: the examples the recorded voices already say', async (t) => {
  // Reported, never failed: a recording is a bonus, and an example is chosen
  // for what it teaches. A line is looked up whole first, then word by word
  // as the reader says it (a particle as it is said, a word with kanji by its
  // spelling and reading); words set side by side, each whole (sayOf).
  const audio = normalizeAudio(JSON.parse(fs.readFileSync(new URL('data/audio/index.json', ROOT), 'utf8')));
  const need = (keys) => {
    for (const n of shardsFor(audio, keys)) addShard(audio, n, JSON.parse(fs.readFileSync(new URL(audio.srcs[n], ROOT), 'utf8')));
  };
  const clip = (keys) => {
    need(keys);
    return clipByKeys(audio, keys, 'clear');
  };
  const tally = { line: [], words: [], some: [], none: [] };
  for (const e of examples()) {
    if (clip(keysOf(e.ja))) { tally.line.push(e.ja); continue; }
    const say = sayOf(e);
    const r = say ? null : await run(e.ja);
    const ws = say
      ? say.map((w) => ({ surface: w.text, keys: keysOf(w.kana, hasKanji(w.text) ? [wordKey(w.text, w.kana)] : []) }))
      : r.tokens.filter((x) => JAPANESE_KINDS.has(x.kind))
        .map((w) => ({ surface: w.surface, keys: keysOf(sayable(w), hasKanji(w.surface) ? [wordKey(w.surface, w.reading)] : []) }));
    const missing = ws.filter((w) => !clip(w.keys));
    if (!missing.length) tally.words.push(e.ja);
    else if (missing.length < ws.length) tally.some.push(`${e.ja} (not ${missing.map((w) => w.surface).join(', ')})`);
    else tally.none.push(e.ja);
  }
  const total = examples().length;
  t.diagnostic(`recorded: ${tally.line.length} of ${total} examples as a whole line, ${tally.words.length} more word by word, ${tally.some.length} in part, ${tally.none.length} not at all`);
  if (tally.line.length) t.diagnostic(`whole line: ${tally.line.join(' / ')}`);
  if (tally.some.length) t.diagnostic(`in part: ${tally.some.join(' / ')}`);
  if (tally.none.length) t.diagnostic(`not recorded: ${tally.none.join(' / ')}`);
  assert.equal(tally.line.length + tally.words.length + tally.some.length + tally.none.length, total);
});
