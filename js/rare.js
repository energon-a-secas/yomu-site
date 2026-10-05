// The second phase: the stretches the first pass could only guess, read again
// with the rest of JMdict and with the names.
//
// The first pass (lattice.js) reads every text with the first tier: the
// common words and the few the corpus argued for. Letting the rest of JMdict
// compete there made readings worse (はし read 愛し, くじ read 九時), so the
// rest waits here, behind a boundary with three rules:
//
//   - it runs only where the first pass left a guess: a kanji stretch read as
//     a guessed name, a katakana run with no record, kana nothing explained;
//   - it reads only those stretches again, between the two nodes the first
//     pass placed around them, connected to them exactly as before;
//   - it never changes a token the first pass read from the first tier
//     (analyze.js builds those from the first pass's own path). A text with
//     no guess fetches nothing of either tier.
//
// Inside a stretch the search is the first pass's own (candidates.js, the
// same prices), plus three kinds of node it did not have:
//
//   rare words  JMdict outside the first tier (data/dict/rare.json), priced
//               as any word and then COST.rare, so a rare word beats a
//               guess and loses to a common word wherever both fit;
//   names       the names tier (data/names/): a strong surname or katakana
//               name under a rare word, any other name over it, so 清水さん
//               is Shimizu and 陸地 is "land", not the place かちじ;
//   katakana    the guess for a katakana run, priced by its length here, so
//               a run that is two known words splits (クリスマス|プレゼント,
//               and インフォーム|ショップ keeps "shop" where all of it was one
//               guess).
//
// What it asks the two tiers for and what it looks up come from one place,
// the lookups below, so it never reads a key it did not ask for, and a
// reading never depends on a shard an earlier text happened to load.
//
// A rare word is marked (`entry.tier`, set by dict.js) so the page can call it
// one; a name from the names tier is a `name` token with confidence 'dict'.

import { isKanji, isKatakana, isKana, isHiragana, hasKanji } from './kana.js';
import { deinflect, deinflectStem, posMatches } from './deinflect.js';
import { candidates, wordNode, NO_CHAIN } from './candidates.js';
import { bestPath } from './lattice.js';
import { COST, NOMINAL } from './costs.js';
import { nameEntry, wholeName } from './names.js';

/** The longest rare word the second phase looks for; the second tier's longer keys are phrases. */
export const RARE_MAX_KEY = 24;
/** The longest name it looks for, in UTF-16 units: ヘレンカートライト is nine. */
export const NAME_MAX_KEY = 16;

/**
 * The fewest kana a katakana guess is priced as. A run that splits into a
 * word and a guess keeps the guess at least this long, so a known word is
 * not carved out of a longer one leaving a stub (イン|フォーム, below).
 */
const KATA_PIECE = 4;

/**
 * The longest katakana guess the second phase places. Every start can reach
 * every end, so without a bound a pasted run of 2,000 katakana would place
 * two million guesses; past forty kana a run is two guesses, which says as
 * much about it as one.
 */
const KATA_MAX_PIECE = 40;

/** Less than one step of any price: orders records the prices tie on. */
const TIE = 1 / 8;

/** Kana no word starts with: the long-vowel bar, the small kana, ん. */
const NO_START = new Set([...'ーァィゥェォャュョッヮヵヶンぁぃぅぇぉゃゅょっゎん']);

/** A small tsu doubles the consonant after it, so no cut falls between them (チャッ|プリン). */
const GEMINATE = new Set(['っ', 'ッ']);

/** Particles that follow a noun, and only a noun is what a lone kanji before them is. */
const CASE = new Set(['を', 'が', 'に', 'で', 'と', 'の', 'は', 'も', 'へ', 'や', 'から', 'まで', 'より']);

const chars = (s) => [...s];

// ── Spans ────────────────────────────────────────────────────────────────

/** A first-pass node the second phase may replace: a guess, with no record behind it. */
export function isWeak(node) {
  return !node.rec && (node.cls === 'kata' || node.cls === 'name' || node.cls === 'unk');
}

/**
 * The stretches of `path` made only of weak nodes, as path indices [a, b),
 * run offsets [i, j), and the first-pass nodes on either side (`left`,
 * `right`; undefined at the edge of the run). One kana alone is left out:
 * nothing the second phase offers could replace it.
 */
export function weakSpans(run, path) {
  const spans = [];
  for (let a = 0; a < path.length; a++) {
    if (!isWeak(path[a])) continue;
    let b = a + 1;
    while (b < path.length && isWeak(path[b])) b++;
    const i = path[a].i;
    const j = path[b - 1].j;
    const cs = chars(run.slice(i, j));
    if (!(cs.length === 1 && isKana(cs[0]))) {
      spans.push({
        a, b, i, j,
        kata: cs.every(isKatakana),
        kanji: cs.every(isKanji),
        left: a > 0 ? path[a - 1] : undefined,
        right: b < path.length ? path[b] : undefined,
      });
    }
    a = b - 1;
  }
  return spans;
}

// ── What may stand where ─────────────────────────────────────────────────

/**
 * A key the second tier is asked for: anything of two or more characters, or
 * one kanji. One kana as a rare word is noise (a rare ぬ or ろ is a sound in a
 * word the first pass missed, never the word), so none is offered or asked.
 */
function askable(k) {
  return k.length >= 2 || isKanji(k);
}

/** A spelling the names tier can hold: two or more kanji, or two or more katakana. */
function nameShaped(s) {
  const cs = chars(s);
  return cs.length >= 2 && (cs.every((ch) => isKanji(ch) && ch !== 'ヶ' && ch !== '〆') || cs.every(isKatakana));
}

/**
 * Inside a stretch of kana the first pass could not read, a short word is
 * far more often a piece of a longer word or a name than a word of its own:
 * イン|フォーム read インフォームショップ as "in (tennis), form, shop",
 * カート|ライト read the surname Cartwright as "cart, light", ロイヤル|
 * シェイク|スペア read Shakespeare as "shake, spare", and あつし (a given name
 * in kana) read あつ, "pressure". So a word there needs four kana in a
 * katakana run and three in hiragana, unless it is the whole run (カギ, the
 * katakana spelling of 鍵, is a word). Kanji are not held to it: one kanji is
 * a word (税, 虜).
 *
 * A first-tier word (`common`) needs three katakana, not four: テニス, インド
 * and ロック are words a learner meets, and at four テニス|トーナメント left
 * the common half a guess beside the word it was written with. The stubs the
 * floor exists for (イン, パソ) are two, and a rare word still needs four.
 */
function tooShort(sp, i, j, common = false) {
  if (sp.kanji) return false;
  if (sp.kata && i === sp.i && j === sp.j) return false;
  return j - i < (sp.kata ? (common ? 3 : 4) : 3);
}

/**
 * Whether a piece may start at `i` of a span: a cut before ー or a small
 * kana splits one sound in two (インフォ|ームショップ, "info" and a guess
 * that starts on a bar), and so does a cut after っ. The span's own start was
 * the first pass's, so a guess may start there; a word may not (酔っぱらい's
 * stray っぱ was read as a rare word, "leaving open").
 */
function badStart(run, sp, i, word) {
  if (i > sp.i && GEMINATE.has(run[i - 1])) return true;
  return (word || i > sp.i) && NO_START.has(run[i]);
}

/**
 * Whether one kanji may stand as a rare word at [i, j). Not before kana that
 * is not a particle a noun takes (称|える, 恐|くて, and the ones that only
 * look like particles, 好|か|ない, 失|わ|ず, 悲|し|げ): that kanji is the
 * stem of a word written with unusual okurigana, and the token after it is
 * not the second phase's to change. Not right after a noun either: 飛行機|代
 * is the suffix だい, "fare", and the one-kanji rare words (代 is よ, "age",
 * first) know nothing of suffixes. The guess stays a guess in both.
 *
 * And not a kanji KANJIDIC reads with okurigana (み.る, せま.い): the first
 * pass left it alone because the word it begins was written in a way it did
 * not know, and a rare noun of that one kanji is then nearly always the wrong
 * word. Over 6,223 corpus sentences 22 lone kanji were read as rare words and
 * 11 were wrong, each a stem of this kind: 見に行く read 見 as けん "view (of
 * life)", 狭過ぎる 狭 as せ "narrowness", and 暑がり, 寒がり, お仕置き,
 * 受入れ, 干からびる. Of the ones it turns away only 嵩 (嵩張る) was right.
 */
function loneKanji(run, i, j, sp, kanji) {
  if (j === sp.j && sp.right && isHiragana(sp.right.s[0]) && !CASE.has(sp.right.s)) return false;
  if (i === sp.i && sp.left && NOMINAL.has(sp.left.cls)) return false;
  const info = kanji && typeof kanji.get === 'function' ? kanji.get(run[i]) : null;
  return !(info && Array.isArray(info.kun) && info.kun.some((r) => r.includes('.')));
}

/** What a name is followed by, where the token after it is one hiragana. */
const AFTER_NAME = new Set(['prt', 'cop', 'suf']);

/**
 * Whether a name may end at `j` of a span, judged by the first pass's next
 * token where the span ends there. Not before a verb in hiragana: オットリ
 * している is おっとり "calm", not the surname, and a name takes a particle
 * before its verb. Not before one hiragana that is no particle, copula or
 * suffix: that kana is okurigana, and 末永く (an adverb) read as the surname
 * すえなが and く, "section". A longer token is let through, because what
 * follows a name is often a phrase the first pass does not call a particle
 * (トムにとって, ジョニーという, トムよりも, トムとジョンどっち). In both
 * cases the guess stays a guess.
 */
function nameFits(j, sp) {
  const next = j === sp.j ? sp.right : undefined;
  if (!next || !isHiragana(next.s[0])) return true;
  if (next.cls === 'verb') return false;
  return chars(next.s).length > 1 || AFTER_NAME.has(next.cls);
}

/** The rare words spelled `s` the second phase could place: no particle or copula. */
function wordsSpelled(s, dict) {
  return (dict.rare(s) || []).filter((r) => !/\b(prt|cop)\b/.test(String(r.p)));
}

/**
 * Whether a name is priced under a rare word spelled the same: a strong name
 * (`s`, one other names are built on) that is a surname or written in
 * katakana. JMnedict lists a great many ordinary compounds as given names
 * and places (天上, 無双, 陸地), and there the word is meant; a surname
 * (清水, 高木) or a foreign name (ジョン over "jeon", the dish) is the name.
 *
 * Two limits, both measured (docs/ANALYZER.md): a katakana name never beats
 * the katakana spelling of a common word (`e`: キリ is 切り, イス 椅子, アリ
 * 蟻), and a surname read another way than the word beats it only when
 * most texts mean the name (`S`, built on by people at least twenty times:
 * 金子 is かねこ, not きんす "money"; 山形 やまがた, not やまなり "curved").
 * Below that the word is as often meant and the reading is what a learner
 * copies: 中吉 is ちゅうきち, a fortune slip's "middling luck", not the
 * surname なかよし, and 大安 is たいあん.
 */
function outranks(s, rec, words) {
  if (!rec.s) return false;
  if (isKatakana(s[0])) return !words.some((w) => w.e);
  if (!String(rec.n).split(' ').includes('surname')) return false;
  if (rec.S || !words.length) return true;
  // the reading the word would be shown with: 大安 is たいあん first, and
  // only also だいあん, the surname's
  return words.some((w) => (w.r ? w.r[0] : s) === (rec.r && rec.r[0]));
}

/**
 * What a katakana name pays where the same katakana spells a common word
 * (`e`): ムリ is 無理 written casually far more often than the place, and
 * as an interjection-tagged word it connects dearer to だ than a name does,
 * so ムリだよ read "place name". Before an honorific the word pays more
 * again (COST.rareBeforeHonorific), so ハナちゃん is still someone.
 */
function kanaWordCost(s, words) {
  return isKatakana(s[0]) && words.some((w) => w.e) ? COST.nameWeak : 0;
}

/**
 * The word a name is also, for the page to say: 清水 is the surname and also
 * "spring water", which a text about a well means, and nothing in the
 * sentence tells the two apart. Its reading (for a kanji spelling) and up to
 * two glosses of the first rare word spelled the same; undefined when none.
 */
function alsoWord(words) {
  const w = words[0];
  if (!w || !Array.isArray(w.g) || !w.g.length) return undefined;
  const out = { g: w.g.slice(0, 2) };
  if (w.r && w.r.length) out.r = w.r[0];
  return out;
}

// ── Lookups ──────────────────────────────────────────────────────────────

/**
 * Every rare-word lookup at position `i` of a span: the surface [i, j) and
 * the key it is looked up under, the surface itself (`d` null) or the
 * dictionary form a deinflection `d` leads to. spanKeys asks the second tier
 * for exactly these keys and phaseTwo looks up exactly these. `kanji` is the
 * text's KANJIDIC information (analyze.js loads it for every kanji in the
 * text before the first pass), so the answer never depends on what an
 * earlier text loaded.
 */
function* rareLookups(run, sp, i, kanji) {
  if (badStart(run, sp, i, true)) return;
  for (let len = 1; len <= RARE_MAX_KEY && i + len <= sp.j; len++) {
    const j = i + len;
    const s = run.slice(i, j);
    if (!askable(s) || tooShort(sp, i, j)) continue;
    if (chars(s).length === 1 && !loneKanji(run, i, j, sp, kanji)) continue;
    yield { s, j, key: s, d: null };
    if (!isKana(s[len - 1])) continue;
    for (const d of deinflect(s)) {
      if (d.base.length <= RARE_MAX_KEY && askable(d.base)) yield { s, j, key: d.base, d };
    }
  }
}

/** Every names lookup at position `i` of a span, the same way. */
function* nameLookups(run, sp, i) {
  if (badStart(run, sp, i, true)) return;
  for (let len = 2; len <= NAME_MAX_KEY && i + len <= sp.j; len++) {
    const s = run.slice(i, i + len);
    if (nameShaped(s) && !tooShort(sp, i, i + len) && nameFits(i + len, sp)) yield s;
  }
}

/**
 * What the second phase asks each tier for, over every span of one run:
 * `rare`, the keys a rare word could be, and `names`, each spelling a name
 * could be. Added to `into`, so one call per run builds the set for a text.
 * `kanji` is the run's env.kanji, the same the search reads.
 */
export function spanKeys(run, spans, into = { rare: new Set(), names: new Set(), first: new Set() }, kanji = undefined) {
  if (!into.first) into.first = new Set();
  for (const sp of spans) {
    for (let i = sp.i; i < sp.j; i++) {
      for (const { key } of rareLookups(run, sp, i, kanji)) into.rare.add(key);
      for (const s of nameLookups(run, sp, i)) into.names.add(s);
      // the first tier's ichidan verb behind a kanji guessed alone (見 of
      // 見る), which candidates() offers here as its stem
      if (sp.j - sp.i === 1 && isKanji(run[i])) for (const d of deinflectStem(run[i])) into.first.add(d.base);
    }
  }
  return into;
}

// ── The search ───────────────────────────────────────────────────────────

/** The candidates at one position of a span: the first pass's, re-priced katakana guesses, rare words and names. */
function phaseTwo(run, sp, dict, env) {
  // A rare record is priced among the first tier's records of its key too,
  // so it pays for each common reading it would displace.
  const merged = {
    get: (k) => {
      const a = dict.get(k);
      const b = dict.rare(k);
      return a && b ? [...a, ...b] : a || b;
    },
  };
  const rareEnv = { ...env, dict: merged };
  const stemEnv = { ...env, stems: true };
  const rareWord = (node, out) => {
    // A rare particle or copula would hide the closed classes the notes
    // explain (いっつも read っつ, "called"), and the first pass has those.
    if (!node || node.cls === 'prt' || node.cls === 'cop') return;
    node.rare = true;
    // `t` is the builder's evidence order (tools/lib/rare.mjs). A kana key's
    // records already pay it in kanaHomographCost; a kanji key's pay it here.
    const place = hasKanji(node.key) ? (node.rec.t || 0) * TIE : 0;
    node.cost += COST.rare - (node.rec.e ? COST.rareCommon : 0) + place;
    node.alts = Math.max(0, (dict.rare(node.key) || []).length - 1);
    out.push(node);
  };
  return (r, i) => {
    const out = [];
    if (badStart(run, sp, i, false)) return out;
    for (const node of candidates(run, i, dict, stemEnv)) {
      if (node.j > sp.j || node.cls === 'kata') continue;
      if (node.rec && tooShort(sp, node.i, node.j, true)) continue;
      out.push(node);
    }
    if (isKatakana(run[i])) {
      let e = i;
      while (e < sp.j && e - i < KATA_MAX_PIECE && isKatakana(run[e])) e++;
      for (let j = i + 1; j <= e; j++) {
        const cost = COST.kataRun + COST.kataPerChar * Math.max(j - i, KATA_PIECE);
        out.push({ i, j, s: run.slice(i, j), cls: 'kata', cost });
      }
    }
    for (const { s, j, key, d } of rareLookups(run, sp, i, env.kanji)) {
      const whole = i === 0 && j === run.length;
      for (const rec of dict.rare(key) || []) {
        if (d && !posMatches(d.type, rec.p, d.base, true)) continue;
        rareWord(wordNode(s, i, j, rec, key, d ? d.chain : NO_CHAIN, d ? d.cuts : NO_CHAIN, whole, rareEnv), out);
      }
    }
    for (const s of nameLookups(run, sp, i)) {
      const rec = dict.name(s);
      if (!rec) continue;
      const entry = nameEntry(rec);
      // names.js reads a few surnames as a whole on purpose (清水 しみず, not
      // し|みず); where the names tier agrees on the reading, so does this.
      if (entry.r && wholeName(s) === entry.r[0]) entry.f = '*';
      // rareLookups asked the second tier for every spelling a name here can
      // have (both use badStart and tooShort the same way), so this reads a
      // key that was asked for.
      const words = wordsSpelled(s, dict);
      const also = alsoWord(words);
      if (also) entry.also = also;
      out.push({
        i, j: i + s.length, s, cls: 'name', rec: entry, key: s, chain: NO_CHAIN, cuts: NO_CHAIN,
        named: true, alts: 0, cost: COST.nameKnown + (outranks(s, rec, words) ? 0 : COST.nameWeak) + kanaWordCost(s, words),
        // a katakana name's original spelling (トム is Tom), for the token
        original: typeof rec.o === 'string' && rec.o ? rec.o : undefined,
      });
    }
    return out;
  };
}

/**
 * One run's first-pass path with each weak span read again. The nodes
 * outside the spans are the same objects, untouched; a span the second
 * phase finds nothing better for comes back as it was.
 *
 * @param {string} run
 * @param {object[]} path   lattice.js pathOf(run).path
 * @param {object[]} spans  weakSpans(run, path)
 * @param {object} dict     from createDict, with needRare and needNames done
 * @param {object} env      lattice.js pathOf(run).env
 */
export function refine(run, path, spans, dict, env) {
  if (!spans.length) return path;
  const out = [];
  let at = 0;
  for (const sp of spans) {
    out.push(...path.slice(at, sp.a));
    const sub = bestPath(run, dict, {
      ...env, from: sp.i, to: sp.j, left: sp.left, right: sp.right, candidatesAt: phaseTwo(run, sp, dict, env),
    });
    out.push(...(sub.length ? sub : path.slice(sp.a, sp.b)));
    at = sp.b;
  }
  out.push(...path.slice(at));
  return out;
}
