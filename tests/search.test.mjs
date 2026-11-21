// Search (js/search.js) over the committed data, read from disk the way the
// page fetches it, and data/search/ (tools/build-search.mjs).
//
//   node --test tests/search.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSearch, queryKind, byParts, glossWords, japaneseKeys, RARE_MAX,
} from '../js/search.js';
import { shownWord, firstTier } from '../js/render-search.js';
import { said, spelled } from '../js/kana.js';
import { dict, fetchJson, DATA } from './helpers/disk.mjs';

const s = createSearch({ dict: dict(), fetchJson, base: `${DATA}/` });
const keys = async (q) => (await s.search(q)).words.map((w) => w.key);

test('a query is Japanese, romaji, English or empty', () => {
  assert.equal(queryKind(''), 'empty');
  assert.equal(queryKind('  '), 'empty');
  assert.equal(queryKind('食べる'), 'ja');
  assert.equal(queryKind('taberu'), 'romaji');
  assert.equal(queryKind('eat'), 'en');
  assert.equal(queryKind('hot water'), 'en');
});

test('a gloss and a query split into the same words', () => {
  assert.deepEqual(glossWords('to eat (e.g. a meal)'), ['eat']);
  assert.deepEqual(glossWords("one's own HOME"), ['own', 'home']);
});

test('Japanese: as typed, in either script, and back to its dictionary form', async () => {
  assert.ok((await keys('食べた')).includes('食べる'));
  assert.ok((await keys('ねこ')).includes('ねこ'));
  assert.ok(japaneseKeys('ねこ').keys.includes('ネコ'));
  const went = (await s.search('行った')).words.find((w) => w.key === '行く');
  assert.ok(went && went.via === 'form');
  assert.ok(!(await keys('行った')).includes('行る'), 'a form the record does not admit is no result');
});

test('nothing common: the rare words, then the names', async () => {
  const tanaka = (await s.search('田中')).words;
  assert.ok(tanaka.some((w) => w.via === 'name'));
});

test('romaji is searched as kana, and as English when it is both', async () => {
  assert.equal((await keys('taberu'))[0], 'たべる');
  const sake = await keys('sake');
  assert.equal(sake[0], 'さけ');
  assert.ok(sake.includes('日本酒'), 'sake is English too');
});

test('English: the word a gloss leads with, first; several words keep what they share', async () => {
  const eat = await keys('eat');
  assert.equal(eat[0], '食べる');
  assert.ok(!eat.includes('たべる'), 'one word is one result, not its kana key too');
  assert.ok((await keys('cat')).includes('猫'));
  const hot = await keys('hot water');
  assert.equal(hot[0], '湯');
  assert.ok((await s.search('tree')).kanji.includes('木'));
  assert.deepEqual(await keys('qwxzv'), []);
});

test('English with few common words asks the rare words, drawn from their index rows alone', async () => {
  const fetched = [];
  const spy = createSearch({ dict: dict(), fetchJson: (p) => { fetched.push(p); return fetchJson(p); }, base: `${DATA}/` });
  const eat = (await spy.search('eat')).words;
  assert.ok(eat.every((w) => w.via === 'english'), 'eat has common words enough');
  assert.ok(!fetched.some((p) => /search\/(rare|x\d+)\.json$/.test(p)), 'and never fetches the rare index');

  fetched.length = 0;
  const amberjack = (await spy.search('amberjack')).words;
  assert.ok(amberjack.length && amberjack.length <= RARE_MAX);
  assert.ok(amberjack.every((w) => w.via === 'rare'));
  const buri = amberjack.find((w) => w.key === 'ぶり');
  assert.ok(buri, 'ぶり, the Japanese amberjack');
  assert.ok(!amberjack.some((w) => w.key === 'ブリ'), 'one word is one row, not its katakana too');
  assert.match(shownWord(buri).glosses[0], /amberjack/);
  assert.ok(!firstTier(buri), "a rare ぶり takes no other spellings or examples from the common ぶり's files");
  assert.ok(!fetched.some((p) => /dict\/r\d+\.json$/.test(p)), 'no rare dictionary shard is fetched');

  const abacus = await keys('abacus');
  assert.ok(abacus.includes('そろばん') && abacus.includes('アバカス'), 'common first, then rare');
  assert.ok(abacus.indexOf('そろばん') < abacus.indexOf('アバカス'));
  assert.ok(!(abacus.includes('ご破算') && abacus.includes('御破算')), 'two spellings of one word are one row');
});

test('a result carries its romaji both ways, and the Romaji switch shows one', async () => {
  const html = await import('node:fs').then((fs) => fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const search = html.slice(html.indexOf('id="sr-words"'), html.indexOf('id="sr-results"'));
  for (const v of ['said', 'spelled', 'off']) assert.match(search, new RegExp(`data-pref="romaji" data-value="${v}"`), v);
  const css = await import('node:fs').then((fs) => fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8'));
  assert.match(css, /html\[data-romaji="off"\] \.rom \{ display: none; \}/);
  assert.equal(said('せんせい'), 'sensee');
  assert.equal(spelled('せんせい'), 'se-n-se-i');
});

test('kanji by parts: every chosen part, at any depth, and only parts that still lead somewhere', async () => {
  const data = await s.loadParts();
  assert.ok(data.list.length > 200);
  const both = byParts(['口', '言'], data);
  assert.ok(both.kanji.includes('語'), '語 is 言 and 吾, and 吾 has 口');
  assert.ok(both.kanji.every((ch) => data.map.get('口').includes(ch) && data.map.get('言').includes(ch)));
  assert.ok(both.open.has('口') && both.open.has('言'));
  const inResult = new Set(both.kanji);
  assert.ok([...both.open].every((p) => data.map.get(p).some((ch) => inResult.has(ch))));
  assert.deepEqual(byParts([], data), { kanji: [], open: null });
});

test('a kana key whose records are different words is one card per word', async () => {
  const { byWord, shownWord } = await import('../js/render-search.js');
  const sake = (await s.search('さけ')).words.filter((w) => w.key === 'さけ');
  const cards = byWord(sake).map((w) => shownWord(w).written);
  assert.ok(cards.includes('酒') && cards.includes('鮭'), cards.join(' '));
  assert.equal(new Set(cards).size, cards.length);
});

// ── Spanish, and romaji however it is typed (2026-11-17) ──────────────────
//
// The owner's feedback on Naninani: Spanish found nothing in Search, the
// Phrases tab or the idiom shelves, and romaji typed together (or with a
// particle written as said, or a long vowel left out) found nothing.
// Measured before the change, over the committed data: every Spanish query
// below found nothing (gato was read as the name ガト), konnichiwa found
// こんにちわ, konnichi wa found 昭和, arigatou gozaimasu nothing, gakko がっこ,
// and the three sentences nothing.

import {
  romajiReading, romajiEdits, romajiVariants, applyEdits, withBar, spanishWords, foldLatin, looseRomaji,
} from '../js/search-latin.js';
import { mergeResults, writtenOf } from '../js/search.js';

const first = async (q, lang = 'en') => (await s.search(q, { lang })).words[0];
const written = async (q, lang = 'en') => (await s.search(q, { lang })).words.map((w) => writtenOf(w).written);

test('Latin letters are romaji only where Hepburn spells them: no l, q or x, and c only in ch', () => {
  assert.equal(queryKind('gato'), 'romaji');
  assert.equal(queryKind('arigatou gozaimasu'), 'romaji');
  assert.equal(queryKind('Tōkyō'), 'romaji', 'a macron is a long vowel');
  for (const q of ['agua caliente', 'caliente', 'casa', 'lluvia', 'canción', 'xtsu', 'hot water']) assert.equal(queryKind(q), 'en', q);
  assert.deepEqual(romajiReading('kan i'), { kana: 'かんい', starts: [0, 2], particles: [] }, 'a space ends a part: kan i is not kani');
  assert.equal(romajiReading('shimbun').kana, 'しんぶん', 'm before b is ん');
  assert.deepEqual(romajiReading('kyou wa').particles, [3], 'a particle typed on its own');
});

test('a romaji reading\'s edits: a particle as said, a long vowel left out or spelled oo or ee', () => {
  const edits = romajiEdits('がっこえ');
  const read = (choice) => applyEdits('がっこえ', edits, new Map(choice));
  const at = (kind, n) => edits.findIndex((e) => e.kind === kind && e.at === n);
  assert.equal(read([[at('ins', 3), 0]]), 'がっこうえ');
  assert.equal(read([[at('ins', 3), 0], [at('sub', 3), edits[at('sub', 3)].options.indexOf('へ')]]), 'がっこうへ');
  assert.ok(romajiEdits('せんせえ').some((e) => e.kind === 'sub' && e.options.includes('い')), 'ee for えい');
  assert.ok(!romajiEdits('わたし').some((e) => e.at === 0), 'never at the start: わたし is no particle');
  const v = romajiVariants('ときょ');
  assert.equal(v[0].kana, 'ときょ');
  assert.ok(v.some((x) => x.kana === 'とうきょう' && x.edits === 2));
  assert.ok(v.length <= 64 && v.every((x, i) => !i || x.edits >= v[i - 1].edits), 'fewest edits first, and bounded');
  assert.equal(withBar('コオヒイ'), 'コーヒー');
  assert.equal(withBar('ケイキ'), 'ケイキ', 'エイ stays');
});

test('romaji however it is typed: spaces, particles as said, long vowels left out or spelled another way', async () => {
  for (const [q, key] of [
    ['konnichiwa', 'こんにちは'], ['konnichi wa', 'こんにちは'], ['konichiwa', 'こんにちは'],
    ['arigatou gozaimasu', 'ありがとうございます'], ['arigatougozaimasu', 'ありがとうございます'], ['arigato', 'ありがとう'],
    ['gakko', 'がっこう'], ['tokyo', '東京'], ['toukyou', 'とうきょう'], ['Tōkyō', 'とうきょう'], ['tookyoo', 'とうきょう'],
    ['sensee', 'せんせい'], ['ohayo', 'おはよう'], ['shimbun', 'しんぶん'], ['konpyuta', 'コンピュータ'],
  ]) {
    const w = await first(q);
    // tokyo is English too, and English that names every word goes before an edit's reading.
    assert.ok(w && (w.key === key || writtenOf(w).written === key), `${q}: ${w && w.key}`);
  }
  assert.equal((await first('konnichiwa')).romaji, 'こんにちは', 'a result says the kana it was read as');
  assert.equal((await first('gakko')).romaji, 'がっこう');
  // A word as typed is still the word: no edit is tried where one spells it.
  assert.equal((await first('taberu')).key, 'たべる');
  assert.equal((await first('kawa')).key, 'かわ');
  assert.equal((await first('sake')).key, 'さけ');
});

test('a sentence typed together is read by the analyzer, its words in order, with the sentence', async () => {
  const cases = [
    ['nihongowobenkyoushimasu', 'にほんごをべんきょうします', '日本語を勉強します', ['日本語', '勉強', 'する']],
    ['watashiwagakuseidesu', 'わたしはがくせいです', '私は学生です', ['私', '学生', 'です']],
    ['kyouwaamedesu', 'きょうはあめです', '今日は雨です', ['今日', '雨', 'です']],
    ['watashi wa gakusei desu', 'わたしはがくせいです', '私は学生です', ['私', '学生', 'です']],
    ['nihongo wo benkyou shimasu', 'にほんごをべんきょうします', '日本語を勉強します', ['日本語', '勉強', 'する']],
    ['sushiwotabemasu', 'すしをたべます', '寿司を食べます', ['寿司', '食べる']],
    ['watashiwasushiotabemashita', 'わたしはすしをたべました', '私は寿司を食べました', ['私', '寿司', '食べる']],
    ['ashitagakkoueikimasu', 'あしたがっこうへいきます', '明日学校へ行きます', ['明日', '学校', '行く']],
    ['ashita wa ame ga furimasu', 'あしたはあめがふります', '明日は雨が降ります', ['明日', '雨', '降る']],
    ['mizu wo nomitai', 'みずをのみたい', '水を飲みたい', ['水', '飲む']],
    ['kore wa pen desu', 'これはペンです', 'これはペンです', ['これ', 'ペン', 'です']],
    ['koohii wo nomimasu', 'コーヒーをのみます', 'コーヒーを飲みます', ['コーヒー', '飲む']],
  ];
  for (const [q, kana, text, words] of cases) {
    const r = await s.search(q);
    assert.ok(r.sentence, `${q}: read as a sentence`);
    assert.equal(r.sentence.kana, kana, q);
    assert.equal(r.sentence.text, text, q);
    const mine = r.words.filter((w) => w.via === 'sentence');
    assert.deepEqual(mine.map((w) => writtenOf(w).written), words, q);
    assert.ok(mine.every((w) => w.recs.length === 1 && w.recs[0].g), `${q}: each word a dictionary record`);
  }
});

test('a word stays a word, and English or Spanish is no sentence', async () => {
  for (const [q, key] of [['onegaishimasu', 'おねがいします'], ['itadakimasu', 'いただきます'], ['ohayougozaimasu', 'おはようございます'], ['oyasuminasai', 'おやすみなさい']]) {
    const r = await s.search(q);
    assert.equal(r.sentence, undefined, q);
    assert.equal(r.words[0].key, key, q);
  }
  for (const q of ['hot water', 'agua caliente']) {
    const r = await s.search(q, { lang: q === 'hot water' ? 'en' : 'es' });
    assert.equal(r.sentence, undefined, q);
    assert.equal(r.words[0].key, '湯', q);
  }
  // Spanish words romaji can spell read as nothing in Japanese, not as a sentence of particles.
  for (const q of ['gato', 'mesa', 'nino', 'perro']) assert.equal((await s.search(q, { lang: 'es' })).sentence, undefined, q);
});

test('a particle typed on its own asks for the sentence, after the word the letters spell together', async () => {
  const r = await s.search('kyou wa');
  assert.equal(r.sentence.kana, 'きょうは');
  assert.equal(r.words[0].key, 'きょう');
  assert.ok(r.words.some((w) => w.key === 'きょうわ'), 'きょうわ (共和) is still offered');
  assert.equal((await s.search('konnichi wa')).sentence, undefined, 'one word, こんにちは, is no sentence');
});

test('Spanish: the dictionary\'s Spanish meanings, accents and plurals folded', async () => {
  for (const [q, want] of [
    ['lluvia', '雨'], ['comer', '食べる'], ['gracias', 'ありがとう'], ['escuela', '学校'], ['libro', '本'],
    ['perro', '犬'], ['canción', '歌'], ['cancion', '歌'], ['gatos', '猫'], ['qué', '何'], ['agua caliente', '湯'],
  ]) {
    const w = await first(q, 'es');
    assert.equal(w && w.key, want, q);
    assert.equal(w.via, 'spanish', q);
  }
  assert.ok((await written('tren', 'es')).slice(0, 3).includes('電車'));
  assert.ok((await written('beber agua', 'es')).includes('飲み水'), 'several words keep what they share');
  for (const q of ['buenos días', 'buenos dias']) assert.equal((await first(q, 'es')).key, 'おはよう', q);
  assert.ok((await s.search('lluvia', { lang: 'es' })).kanji.includes('雨'), 'KANJIDIC\'s Spanish names the kanji');
  assert.deepEqual(spanishWords('agua (fría, fresca)'), ['agua']);
  assert.deepEqual(spanishWords('qué', { alone: true }), ['que'], 'a stop word that is the whole gloss');
  assert.equal(foldLatin('Canción PINGÜINO año'), 'cancion pinguino año');
});

test('ñ: nino finds niño, and año and ano stay two words', async () => {
  assert.equal((await first('nino', 'es')).key, '子供');
  assert.equal((await first('año', 'es')).key, '年');
  assert.ok(!(await written('año', 'es')).includes('こう門'), 'año is not ano');
  // Typed without its ñ, a word the ñ spelling names more of is that word first: ano is año's 年.
  const ano = await written('ano', 'es');
  assert.ok(ano.indexOf('年') >= 0 && ano.indexOf('年') < ano.indexOf('こう門'), 'año first, then ano');
  assert.equal((await first('nino', 'es')).key, '子供', 'nino has no word of its own');
});

test('the learner\'s language ranks first, and a Japanese query stays Japanese', async () => {
  assert.equal((await first('gato', 'es')).key, '猫', 'in Spanish, gato is 猫 first');
  // In English, Spanish comes only where English and romaji find nothing: gato is romaji there.
  const en = await s.search('gato', { lang: 'en' });
  assert.ok(en.words.length && en.words.every((w) => w.via !== 'spanish'), 'in English, gato is romaji');
  assert.equal((await first('lluvia', 'en')).key, '雨', 'lluvia is no romaji and no English: Spanish');
  assert.equal((await first('cat', 'en')).key, '猫');
  assert.equal((await first('cat', 'es')).key, '猫', 'English still finds cat for a learner in Spanish');
  const ja = await s.search('ねこ', { lang: 'es' });
  assert.ok(ja.words.every((w) => w.via === 'exact' || w.via === 'form'));
  // sake in Spanish: 酒 by its Spanish, then the romaji's さけ keeps 鮭 and not 酒 twice.
  const sake = (await s.search('sake', { lang: 'es' })).words;
  assert.equal(writtenOf(sake[0]).written, '酒');
  const cards = byWordCards(sake);
  assert.ok(cards.includes('鮭'));
  assert.equal(cards.filter((c) => c === '酒').length, 1);
});

function byWordCards(words) {
  return words.flatMap((w) => w.recs.map((r) => writtenOf(w, r).written));
}

test('romaji that found a word keeps English and Spanish only where every word is theirs', async () => {
  const r = await s.search('konnichi wa');
  assert.ok(r.words.every((w) => w.via !== 'english' && w.via !== 'spanish' && w.via !== 'rare' || w.key === 'こんにちわ'), r.words.map((w) => `${w.key}:${w.via}`).join(' '));
  assert.ok((await s.search('sake')).words.some((w) => w.key === '日本酒'), 'sake is English too');
});

test('results merge by card: a word found twice is one card, the first reading\'s', () => {
  const a = { key: 'ねこ', recs: [{ g: ['cat'], k: ['猫'] }], via: 'exact' };
  const b = { key: '猫', recs: [{ r: ['ねこ'], g: ['cat'] }], via: 'spanish' };
  assert.deepEqual(mergeResults([[b], [a]]).map((x) => x.key), ['猫']);
  assert.deepEqual(spanishWords('Perdón, por favor'), ['perdon', 'favor']);
  assert.equal(looseRomaji('Tōkyō'), looseRomaji('tookyoo'));
  assert.equal(looseRomaji('konichiwa'), looseRomaji('konnichiwa'));
});

test('the measured failures of 2026-11-17, before and after', async () => {
  // Each was nothing (or the wrong word) before.
  assert.equal((await first('lluvia', 'es')).key, '雨');
  assert.equal((await first('konnichiwa')).key, 'こんにちは');
  assert.equal((await first('konnichi wa')).key, 'こんにちは');
  assert.equal((await first('arigatou gozaimasu')).key, 'ありがとうございます');
  assert.equal((await first('gakko')).key, 'がっこう');
  for (const q of ['nihongowobenkyoushimasu', 'watashiwagakuseidesu', 'kyouwaamedesu']) assert.ok((await s.search(q)).sentence, q);
  assert.notEqual((await first('buenos días', 'es')).key, 'ブエノスアイレス');
});

test('a sentence read stays within its budget of first passes', async () => {
  const { readSentence, SENTENCE_BUDGET } = await import('../js/search-sentence.js');
  const kana = romajiReading('watashiwaoishiiringootabemashita').kana;
  const read = await readSentence(kana, romajiEdits(kana), dict());
  assert.ok(read.tried <= SENTENCE_BUDGET, `${read.tried} first passes`);
  assert.equal(read.kana, 'わたしはおいしいりんごをたべました');
});

test('a card shows its Spanish where every record has it, and says English where not', async () => {
  const d = dict();
  const [neko] = (await s.search('gato', { lang: 'es' })).words;
  await d.needEs(neko.recs);
  const w = shownWord(neko, (r) => d.esOf(r));
  assert.equal(w.lang, 'es');
  assert.equal(w.glosses[0], 'gato');
  assert.equal(shownWord(neko).lang, 'en', 'no Spanish asked, the English as before');
  assert.equal(shownWord(neko).glosses[0], neko.recs[0].g[0]);
  const half = { key: 'x', via: 'exact', recs: [{ g: ['one'] }, { g: ['two'] }] };
  assert.equal(shownWord(half, (r) => (r.g[0] === 'one' ? ['uno'] : null)).lang, 'en', 'never Spanish and English in one card');
});

test('My kanji and History filter with Spanish meanings and romaji however it is typed', async () => {
  const { matches } = await import('../js/render-mykanji.js');
  const { textMatches } = await import('../js/render-history.js');
  const info = { m: ['water'], on: ['スイ'], kun: ['みず'], es: { m: ['agua'] } };
  for (const q of ['water', 'agua', 'AGUA', 'mizu', 'みず', 'sui']) assert.ok(matches('水', info, { words: [] }, q), q);
  assert.ok(!matches('水', info, { words: [] }, 'fuego'));
  assert.ok(matches('学', { m: ['study'], on: ['ガク'], kun: [] }, { words: [['学校', 'がっこう']] }, 'gakko'), 'a long vowel left out finds the word it was met in');
  for (const q of ['watashiwa', 'watashi wa', 'gakko', 'ame']) assert.ok(textMatches('わたしはがっこうへいく。あめ', q), q);
});

test('the page and the app filter what a learner keeps by one rule (saved-filter.js)', async () => {
  const filter = await import('../js/saved-filter.js');
  const { matches } = await import('../js/render-mykanji.js');
  const { textMatches } = await import('../js/render-history.js');
  assert.equal(matches, filter.kanjiMatches, 'My kanji on the page is the shared rule');
  assert.equal(textMatches, filter.textMatches, 'History on the page is the shared rule');
  const rain = { w: '雨', r: 'あめ', g: 'rain', from: { before: '…きょうは', word: '雨', after: 'がふっています。' } };
  for (const q of ['雨', 'ame', 'あめ', 'アメ', 'rain', 'RAIN']) assert.ok(filter.wordMatches(rain, q), q);
  for (const q of ['lluvia', 'LLUVIA']) assert.ok(filter.wordMatches(rain, q, ['lluvia']), `${q} with its Spanish`);
  assert.ok(!filter.wordMatches(rain, 'lluvia'), 'no Spanish passed, none read');
  assert.ok(filter.wordMatches({ w: '行動', r: 'こうどう', g: 'action' }, 'accion', ['acción', 'conducta']), 'accents folded');
  for (const q of ['kyouwa', 'kyou wa', 'kyowa', 'futteimasu']) assert.ok(filter.wordMatches(rain, q), `${q} in its sentence`);
  assert.ok(filter.wordMatches({ w: '学校', r: 'がっこう', g: 'school' }, 'gakko'), 'a long vowel left out');
  assert.ok(!filter.wordMatches(rain, 'fuego', ['lluvia']));
  assert.ok(filter.wordMatches(rain, '  '), 'an empty filter keeps every word');
  assert.ok(!filter.wordMatches(null, 'ame'));
});

// ── The reviews of 2026-11-17 ──────────────────────────────────────────────
//
// Two reviews of the change above measured what it still got wrong; each
// test below is one of their findings, with the queries they measured.

const sentenceOf = async (q, lang = 'en') => (await s.search(q, { lang })).sentence;
const firstWritten = async (q, lang = 'en') => {
  const w = await first(q, lang);
  return w && writtenOf(w).written;
};

test('a word with its particle typed together is read as the two (watashiwa was nothing)', async () => {
  for (const [q, text] of [
    ['watashiwa', '私は'], ['korewa', 'これは'], ['anatawa', 'あなたは'], ['watashino', '私の'], ['watashi no', '私の'],
    ['nihongowo', '日本語を'], ['gakkouni', '学校に'], ['tomodachito', '友達と'], ['tomodachi to', '友達と'], ['mizuwo', '水を'],
  ]) {
    const r = await s.search(q);
    assert.equal(r.sentence && r.sentence.text, text, q);
    assert.equal(r.words[0].via, 'sentence', q);
  }
  // A said particle ending an uncommon word whose stem is among the commonest
  // is a particle: 協和 and 共和 are band 4, 今日 band 1. 平和 is band 1, and stays.
  const kyouwa = await s.search('kyouwa');
  assert.equal(kyouwa.sentence.text, '今日は');
  assert.ok(kyouwa.words.some((w) => w.key === 'きょうわ'), '協和 is still offered');
  assert.equal((await sentenceOf('kyouwaiitenkidesune')).text, '今日はいい天気ですね', 'was 協和いい天気ですね');
  for (const q of ['heiwa', 'denwa', 'namae', 'shinwa']) assert.equal(await sentenceOf(q), undefined, q);
});

test('English and Spanish words, and names, are no sentence', async () => {
  // Each was read as one: agua ああ具ああ, manzana 万座な, tea 手ああ, mountain もうんたいん, Harajuku 腹塾.
  for (const q of ['agua', 'manzana', 'tiempo', 'semana', 'mucho', 'ahora', 'ayuda', 'naranja', 'hija', 'bonita']) {
    assert.equal(await sentenceOf(q, 'es'), undefined, q);
    assert.equal(await sentenceOf(q, 'en'), undefined, `${q} in English`);
  }
  for (const q of ['tea', 'rose', 'menu', 'mountain', 'area', 'image', 'again', 'base', 'go home', 'see you', 'Harajuku', 'Shinjuku', 'Asakusa', 'osaka']) {
    assert.equal(await sentenceOf(q), undefined, q);
  }
  // A guess, or a one-kana noun straight after a noun, is no sentence either.
  for (const q of ['korewavuidesu', 'reunite', 'kohiwonomimasu']) assert.equal(await sentenceOf(q), undefined, q);
  // Unless a particle only Japanese types is typed on its own: tea to go is English, sore wa is not.
  assert.equal(await sentenceOf('tea to go'), undefined);
  assert.equal((await sentenceOf('sore wa')).text, 'それは');
});

test('a meaning that names every word goes before what an edit spells', async () => {
  // In English: house was 法制 (ほうせい) first, see 性, time 知名, bee 米, nose 農政, dome 同盟.
  for (const [q, want] of [['house', '家'], ['see', '見る'], ['see you', '見る'], ['bee', '蜂'], ['nose', '鼻'], ['dome', 'ドーム'], ['tea', 'お茶'], ['rose', 'ばら']]) {
    assert.equal(await firstWritten(q), want, q);
  }
  assert.notEqual(await firstWritten('time'), '知名');
  // What the letters spell as typed still leads: go is ご, sake さけ, rain ライン as before.
  assert.equal((await first('go')).key, 'ご');
  assert.equal((await first('rain')).key, 'ライン');
  // In Spanish, the first meaning, then the romaji as typed: manga is 袖, then 漫画; no is いや, then の.
  for (const [q, word] of [['manga', 'まんが'], ['no', 'の'], ['ano', 'あの'], ['te', 'て']]) {
    const keys = (await s.search(q, { lang: 'es' })).words.slice(0, 3).map((w) => w.key);
    assert.ok(keys.includes(word), `${q}: ${keys.join(' ')}`);
  }
  // A Spanish word read only as a verb form does not go before the romaji: ame is 雨 (amar's ame comes after).
  assert.equal(await firstWritten('ame', 'es'), '雨');
});

test('a romaji sentence keeps the Spanish its words name (bebo agua was 米棒ああ具ああ)', async () => {
  const r = await s.search('bebo agua', { lang: 'es' });
  assert.equal(r.sentence, undefined);
  assert.ok(r.words.slice(0, 5).some((w) => ['水', '飲み水', '飲料水'].includes(w.key)), r.words.slice(0, 5).map((w) => w.key).join(' '));
});

test('a rare word spelled as typed that is a word of its own goes before an edit\'s word', async () => {
  // ojisan was おじいさん (grandfather) first, obasan おばあさん.
  assert.equal((await first('ojisan')).key, 'おじさん');
  assert.equal((await first('obasan')).key, 'おばさん');
  assert.equal((await first('ojiisan')).key, 'おじいさん');
  assert.equal((await first('obaasan')).key, 'おばあさん');
  // A spelling of the edit's word, or no word of its own, still follows it.
  assert.equal((await first('konnichiwa')).key, 'こんにちは');
  assert.equal((await first('gakko')).key, 'がっこう');
  assert.equal((await first('choto')).key, 'ちょっと');
});

test('long o and e written おお and ええ, a missing っ, cch, and a hyphen as a space', async () => {
  for (const [q, want] of [
    ['okii', '大きい'], ['kori', '氷'], ['onesan', 'お姉さん'], ['osaka', '大阪'],
    ['choto', 'ちょっと'], ['zuto', 'ずっと'], ['gakou', '学校'],
    ['kocchi', 'こっち'], ['docchi', 'どっち'], ['acchi', 'あっち'],
    ['konnichi-wa', 'こんにちは'], ['nihon-go', '日本語'], ['o-cha', 'お茶'],
  ]) {
    assert.equal(await firstWritten(q), want, q);
  }
  assert.equal(romajiReading('ohayo-').kana, 'おはよー', 'a hyphen that ends a part is the bar');
  // A missing っ counts two edits: ときょ is とうきょう before とっきょ (特許).
  assert.equal((await s.search('tokyo e ikimasu')).sentence.text, '東京へ行きます');
});

test('a sentence: katakana words, particles typed apart kept apart, and the commoner verb', async () => {
  for (const [q, text] of [
    ['terebiwomimasu', 'テレビを見ます'], ['koohiiwonomimasu', 'コーヒーを飲みます'], ['toirewadokodesuka', 'トイレはどこですか'],
    ['korewapendesu', 'これはペンです'], ['tokyoniikimasu', '東京に行きます'], ['tokyo ni ikimasu', '東京に行きます'],
    ['sensei ni aimasu', '先生に会います'], ['chotto matte', 'ちょっと待って'], ['mattekudasai', '待ってください'],
    ['watashi wa nihon jin desu', '私は日本人です'],
  ]) {
    assert.equal((await sentenceOf(q)).text, text, q);
  }
  assert.equal((await first('matte')).key, 'まつ', 'matte is 待つ before 舞う');
});

test('Spanish: phrases of several words, forms, greetings, and English only where it names every word', async () => {
  for (const [q, want] of [
    ['tengo hambre', '空腹'], ['te amo', '愛する'], ['mi amigo', '友人'], ['hola', 'こんにちは'], ['buenas tardes', 'こんばんは'],
    ['buenos días', 'おはよう'], ['comí', '食べる'], ['hablo', '話す'], ['hablé', '話す'], ['lápices', '鉛筆'], ['felices', '嬉しい'],
    ['amiga', '友人'], ['siempre', 'いつも'],
  ]) {
    assert.equal(await firstWritten(q, 'es'), want, q);
  }
  const top = async (q, n) => (await s.search(q, { lang: 'es' })).words.slice(0, n).map((w) => writtenOf(w).written);
  for (const [q, want, n] of [['me gusta', '好き', 2], ['tu nombre', '名前', 2], ['muy bien', 'よく', 4], ['roja', '赤', 2], ['luces', '光', 2], ['libros', '本', 2], ['pequeña', '小', 2]]) {
    assert.ok((await top(q, n)).includes(want), `${q}: ${(await top(q, n)).join(' ')}`);
  }
  // Spanish's articles are no English on a Spanish page: el gato was エルサルバドル too, carne de cerdo FIFA.
  assert.ok(!(await top('el gato', 10)).includes('エルサルバドル'));
  assert.ok(!(await top('carne de cerdo', 10)).includes('フィナカップ'));
  // An English learner sees no Spanish false friend: sales was 塩, pie 足.
  assert.ok(!(await s.search('sales', { lang: 'en' })).kanji.includes('塩'));
  assert.ok(!(await s.search('pie', { lang: 'en' })).words.some((w) => w.via === 'spanish'));
  // An accent is no letter in the English index: café is cafe.
  assert.deepEqual((await s.search('café', { lang: 'en' })).words.map((w) => w.key), (await s.search('cafe', { lang: 'en' })).words.map((w) => w.key));
  assert.ok((await s.search('café', { lang: 'en' })).words.length);
});

test('a sentence read keeps its edit prices, its budget and its length', async () => {
  const { readSentence, SENTENCE_BUDGET } = await import('../js/search-sentence.js');
  const { SENTENCE_MAX } = await import('../js/search.js');
  // Without a price on ee for えい, めえる (meeru, mail) became 滅入る.
  const kana = romajiReading('tsukurikatameerudeokurune').kana;
  assert.ok((await readSentence(kana, romajiEdits(kana), dict())).kana.includes('めえる'));
  // Twenty-four said particles would take 91 first passes; 48 are spent.
  const wa = romajiReading('wa'.repeat(25)).kana;
  const read = await readSentence(wa, romajiEdits(wa), dict());
  assert.equal(SENTENCE_BUDGET, 48);
  assert.ok(read.tried <= 48 && read.tried > 40, `${read.tried} first passes`);
  // Past SENTENCE_MAX kana no sentence is read: a paste is no query.
  const long = 'kinouwatomodachitoeigawomimashita'.repeat(4);
  assert.ok(romajiReading(long).kana.length > SENTENCE_MAX);
  assert.equal(await sentenceOf(long), undefined);
});
