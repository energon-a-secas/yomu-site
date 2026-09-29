// Grammar ids, found on real analyze() output, and the notes that explain
// them.
//
//   node --test tests/grammar.test.mjs
//
// Every id grammar.js can emit has a sentence where a given token must carry
// it and one where a given token must not. The negative cases are chosen to
// be the near misses: が after a predicate is "but", not the subject; か
// between two nouns is "or"; な after 静か is not "don't"; 食べました is not
// also plain "polite". A module that emits an id everywhere passes every
// positive case, and these are what catch it.
//
// The notes half holds notes-grammar.js to the same ids, in both languages,
// and reads each note's own example sentence to check it shows its id.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GRAMMAR_IDS, chainGrammar, annotateGrammar } from '../js/grammar.js';
import { GRAMMAR_NOTES, noteFor } from '../js/notes.js';
import { run, cut } from './helpers/disk.mjs';

const EM_DASH = String.fromCharCode(0x2014);
const BANNED = /\b(powerful|seamless|leverages?|robust|utili[sz]e)\b/i;

const idsOf = (t) => t.grammar.map((g) => g.id);

async function tokenOf(text, surface) {
  const r = await run(text);
  const t = r.tokens.find((x) => x.surface === surface);
  assert.ok(t, `${surface} is not a token of ${text} (${cut(r)})`);
  return t;
}

/** id -> [[text, surface] that carries it, [text, surface] that must not] */
const CASES = {
  // particles
  'topic-wa': [['わたしはがくせいです', 'は'], ['こんにちは', 'こんにちは']],
  'subject-ga': [['あめがふります', 'が'], ['たかいですが、おいしいです', 'が']],
  'object-o': [['ほんをよみます', 'を'], ['おちゃです', 'おちゃ']],
  'direction-e': [['がっこうへいきます', 'へ'], ['へやにいます', 'へや']],
  'ni': [['へやにいます', 'に'], ['にほんです', 'にほん']],
  'de': [['でんわでききます', 'で'], ['しずかできれいです', 'で']],
  'de-and': [['しずかできれいです', 'で'], ['でんわでききます', 'で']],
  'to-and': [['パンとたまごをかいます', 'と'], ['いくと', 'と']],
  'to-quote': [['いいとおもいます', 'と'], ['ともだちとあいます', 'と']],
  'mo': [['わたしもいきます', 'も'], ['ももをたべます', 'もも']],
  'no': [['わたしのほんです', 'の'], ['のみます', 'のみます']],
  'ka-question': [['いきますか', 'か'], ['コーヒーかこうちゃ', 'か']],
  'ne': [['いいですね', 'ね'], ['ねこです', 'ねこ']],
  'yo': [['いいですよ', 'よ'], ['よみます', 'よみます']],
  'kara': [['うちからきました', 'から'], ['からいです', 'からい']],
  'made': [['えきまであるきます', 'まで'], ['まだです', 'まだ']],
  'yori': [['バスよりでんしゃがはやい', 'より'], ['バスでいきます', 'で']],
  'ya': [['ペンやノートをかいます', 'や'], ['パンやでかいます', 'パンや']],
  'kedo': [['たかいけど、かいます', 'けど'], ['たかいです', 'たかい']],
  'node': [['あついので、まどをあけます', 'ので'], ['あついです', 'あつい']],
  'dake': [['ひとつだけください', 'だけ'], ['ひとつください', 'ひとつ']],
  'shika': [['ひとつしかありません', 'しか'], ['ひとつください', 'ひとつ']],
  'nado': [['パンなどをかいます', 'など'], ['パンとたまごをかいます', 'と']],
  'na-prohibition': [['いくな', 'な'], ['しずかなへやです', 'な']],
  // the copula
  'desu': [['がくせいです', 'です'], ['がくせいでした', 'でした']],
  'deshita': [['がくせいでした', 'でした'], ['がくせいです', 'です']],
  'deshou': [['あしたはあめでしょう', 'でしょう'], ['あしたはあめだろう', 'だろう']],
  'darou': [['あしたはあめだろう', 'だろう'], ['あしたはあめでしょう', 'でしょう']],
  'da': [['がくせいだ', 'だ'], ['がくせいだった', 'だった']],
  'datta': [['がくせいだった', 'だった'], ['がくせいだ', 'だ']],
  'ja-nai': [['がくせいじゃない', 'じゃない'], ['がくせいじゃなかった', 'じゃなかった']],
  'ja-arimasen': [['がくせいじゃありません', 'じゃありません'], ['がくせいじゃありませんでした', 'じゃありませんでした']],
  'ja-nakatta': [['がくせいじゃなかった', 'じゃなかった'], ['がくせいじゃない', 'じゃない']],
  'ja-arimasen-deshita': [['がくせいじゃありませんでした', 'じゃありませんでした'], ['がくせいじゃありません', 'じゃありません']],
  'nara': [['がくせいなら', 'なら'], ['行くなら', 'なら']],
  // endings, from the deinflection chain
  'polite': [['食べます', '食べます'], ['食べました', '食べました']],
  'polite-past': [['食べました', '食べました'], ['食べます', '食べます']],
  'polite-negative': [['食べません', '食べません'], ['食べませんでした', '食べませんでした']],
  'polite-past-negative': [['食べませんでした', '食べませんでした'], ['食べません', '食べません']],
  'lets': [['食べましょう', '食べましょう'], ['食べよう', '食べよう']],
  'polite-te': [['食べまして', '食べまして'], ['食べて', '食べて']],
  'te-form': [['食べて', '食べて'], ['食べた', '食べた']],
  'te-iru': [['食べている', '食べている'], ['食べて', '食べて']],
  'past': [['食べた', '食べた'], ['食べたら', '食べたら']],
  'negative': [['食べない', '食べない'], ['食べなかった', '食べなかった']],
  'past-negative': [['食べなかった', '食べなかった'], ['食べない', '食べない']],
  'want': [['食べたい', '食べたい'], ['食べた', '食べた']],
  'potential': [['書ける', '書ける'], ['書かれる', '書かれる']],
  'passive': [['書かれる', '書かれる'], ['書ける', '書ける']],
  'causative': [['食べさせる', '食べさせる'], ['食べられる', '食べられる']],
  'volitional': [['食べよう', '食べよう'], ['食べましょう', '食べましょう']],
  'imperative': [['食べろ', '食べろ'], ['ごめんなさい', 'なさい']],
  'cond-ba': [['食べれば', '食べれば'], ['食べたら', '食べたら']],
  'cond-tara': [['食べたら', '食べたら'], ['食べれば', '食べれば']],
  'cond-nara': [['行くなら', 'なら'], ['がくせいなら', 'なら']],
  'adj-negative': [['高くない', '高くない'], ['食べない', '食べない']],
  'adj-past': [['高かった', '高かった'], ['食べなかった', '食べなかった']],
  'adj-te': [['高くて', '高くて'], ['食べて', '食べて']],
  'adverbial': [['字を大きく書いてください', '大きく'], ['大きいです', '大きい']],
  'tari': [['食べたり', '食べたり'], ['食べたら', '食べたら']],
  'nagara': [['食べながら', '食べながら'], ['食べない', '食べない']],
  'nasai': [['食べなさい', '食べなさい'], ['食べろ', '食べろ']],
  'sou': [['高そう', '高そう'], ['高い', '高い']],
  'sugiru': [['食べすぎる', '食べすぎる'], ['食べる', '食べる']],
  'yasui': [['読みやすい', '読みやすい'], ['安い', '安い']],
  'nikui': [['書きにくい', '書きにくい'], ['にくをたべます', 'にく']],
  'te-shimau': [['食べちゃう', '食べちゃう'], ['食べて', '食べて']],
  'te-miru': [['食べてみます', '食べてみます'], ['見ます', '見ます']],
  'must': [['行かなければなりません', '行かなければ'], ['行かなければ', '行かなければ']],
  'naide': [['食べないで', '食べないで'], ['食べない', '食べない']],
  // patterns across two tokens
  'te-kudasai': [['食べてください', 'ください'], ['これをください', 'ください']],
  'cond-to': [['行くと', 'と'], ['パンと', 'と']],
  'invitation': [['行きませんか', 'か'], ['行きますか', 'か']],
  'offer': [['持ちましょうか', 'か'], ['行きましょう', '行きましょう']],
};

test('every grammar id has a case both ways, and nothing else does', () => {
  assert.deepEqual(Object.keys(CASES).sort(), [...GRAMMAR_IDS].sort());
});

for (const id of GRAMMAR_IDS) {
  const [[yesText, yesSurface], [noText, noSurface]] = CASES[id];
  test(`${id}: on ${yesSurface} in ${yesText}`, async () => {
    const t = await tokenOf(yesText, yesSurface);
    assert.ok(idsOf(t).includes(id), `${yesSurface} carries ${JSON.stringify(t.grammar)}`);
  });
  test(`${id}: not on ${noSurface} in ${noText}`, async () => {
    const t = await tokenOf(noText, noSurface);
    assert.ok(!idsOf(t).includes(id), `${noSurface} carries ${JSON.stringify(t.grammar)}`);
  });
}

// ── Shapes ───────────────────────────────────────────────────────────────

test('a two-token pattern is on both tokens, with the same span', async () => {
  const r = await run('ちょっと待ってください。');
  const spans = r.tokens.flatMap((t) => t.grammar.filter((g) => g.id === 'te-kudasai').map((g) => [t.i, g.at]));
  assert.equal(spans.length, 2);
  const [[i0, at0], [i1, at1]] = spans;
  assert.deepEqual(at0, at1);
  assert.deepEqual(at0, [i0, i1 + 1]);
});

test('a chain names its endings base first, and machinery not at all', () => {
  const chain = (...rules) => rules.map((rule) => ({ rule, label: '' }));
  // 食べさせられませんでした, surface to base
  assert.deepEqual(
    chainGrammar(chain('masu-past-negative', 'masu', 'stem', 'potential-passive', 'causative')),
    ['causative', 'potential', 'passive', 'polite-past-negative'],
  );
  // 食べた is ta over te: the te-form is how the past is built, not a second form
  assert.deepEqual(chainGrammar(chain('ta', 'te')), ['past']);
  // 食べなかった: a verb's negative under かった is one id
  assert.deepEqual(chainGrammar(chain('adj-past', 'negative')), ['past-negative']);
  assert.deepEqual(chainGrammar([]), []);
});

test('annotating twice gives the same ids', async () => {
  const r = await run('雨が降ったら、うちにいます。');
  const once = JSON.stringify(r.tokens.map((t) => t.grammar));
  annotateGrammar(r.tokens);
  assert.equal(JSON.stringify(r.tokens.map((t) => t.grammar)), once);
});

// ── The notes ────────────────────────────────────────────────────────────

test('every grammar id has a note, and every note an id', () => {
  assert.deepEqual(Object.keys(GRAMMAR_NOTES).sort(), [...GRAMMAR_IDS].sort());
});

for (const id of GRAMMAR_IDS) {
  test(`note ${id}: English and Spanish everywhere, no em dash, no banned word`, () => {
    const note = GRAMMAR_NOTES[id];
    for (const field of ['title', 'pattern', 'meaning']) assert.ok(note[field].en && note[field].es, `${id}.${field}`);
    assert.ok(note.example.ja && note.example.en && note.example.es, `${id}.example`);
    for (const s of [note.title, note.pattern, note.meaning].flatMap((x) => [x.en, x.es]).concat([note.example.ja, note.example.en, note.example.es])) {
      assert.ok(!s.includes(EM_DASH), `${id} has an em dash`);
      assert.ok(!BANNED.test(s), `${id} uses a banned word: ${s}`);
    }
    for (const lang of ['en', 'es']) assert.equal(noteFor('grammar', id, lang).fallback, false);
  });

  test(`note ${id}: its example shows ${id} when Yomu reads it`, async () => {
    const r = await run(GRAMMAR_NOTES[id].example.ja);
    const found = r.tokens.some((t) => idsOf(t).includes(id));
    assert.ok(found, `${GRAMMAR_NOTES[id].example.ja} reads ${cut(r)} with no ${id}`);
  });
}
