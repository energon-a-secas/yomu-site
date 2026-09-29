// What a word costs and what it costs to sit next to another one.
//
// lattice.js finds the cheapest path; this file is the price list it reads,
// kept apart so the numbers can be read (and argued with) in one place, and
// so lattice.js stays under the 500-line rule. The closed classes live here
// too, because a particle's cost and the pairs it may form are one decision.
//
// Every number started in Runcible's reader research (2026-09-28). A change
// since is written next to the number it changed, with the case that forced
// it.

import { hasKanji } from './kana.js';

// ── Closed classes ────────────────────────────────────────────────────────

/**
 * Particles. A dictionary would offer these too, and so would a dozen nouns
 * spelled with the same kana (は tooth, が moth, に load); a closed list with
 * its own cost is what keeps わたしは from reading "I tooth". ん is not a
 * particle in the grammar books' sense but it attaches the same way
 * (行くんです), and without it every such sentence had an unknown token.
 */
export const PARTICLES = Object.freeze([
  'は', 'へ', 'を', 'が', 'に', 'で', 'と', 'も', 'の', 'や', 'か', 'から', 'まで', 'より',
  'ね', 'よ', 'けど', 'ので', 'だけ', 'しか', 'など', 'な', 'って', 'ん',
  // ね and な drawn out, which the data has no key for: ねえねえ read
  // ね|え|ね|え, "root, eh, right?, picture".
  'ねえ', 'なあ',
]);
export const PARTICLE = new Set(PARTICLES);

/** Two particles that legitimately sit side by side. Any other pair costs. */
export const PARTICLE_PAIRS = Object.freeze(new Set([
  'には', 'では', 'とは', 'へは', 'にも', 'でも', 'とも', 'からは', 'までは', 'のは', 'のが', 'かも', 'へも',
]));

/** Particles that may end a sentence without a cost: か, ね, よ, な, けど, の. */
export const SENTENCE_FINAL = Object.freeze(new Set(['か', 'ね', 'よ', 'な', 'けど', 'の', 'ねえ', 'なあ']));

/**
 * Particles that end a clause, and so end a run before 、 as readily as a
 * sentence ends before 。: 食べてから、 暑いから、 雨なので、 高いですが、.
 * から at the end of a run paid 30 while the noun 殻 paid nothing, so
 * 食べてから、 read "eat, shell".
 */
const CLAUSE_FINAL = new Set(['から', 'ので', 'が', 'けど', 'し', 'のに', 'まで']);

/**
 * The copula family, each with the words its said line is written in:
 * じゃありません is said "ja arimasen", two words, the way a textbook writes it.
 */
export const COPULA = Object.freeze({
  'です': ['です'], 'でした': ['でした'], 'でしょう': ['でしょう'], 'だろう': ['だろう'],
  'だ': ['だ'], 'だった': ['だった'],
  'じゃありません': ['じゃ', 'ありません'], 'ではありません': ['では', 'ありません'],
  'じゃありませんでした': ['じゃ', 'ありません', 'でした'], 'ではありませんでした': ['では', 'ありません', 'でした'],
  'じゃない': ['じゃ', 'ない'], 'ではない': ['では', 'ない'],
  'じゃなかった': ['じゃ', 'なかった'], 'ではなかった': ['では', 'なかった'],
  'なら': ['なら'], 'だったら': ['だったら'], 'でしたら': ['でしたら'],
});

/**
 * Copula forms that follow a verb or an adjective as readily as a noun:
 * 行くでしょう, 行くだろう, 行くなら. Every other form after a verb pays.
 */
const AFTER_PREDICATE = new Set(['でしょう', 'だろう', 'なら']);

/**
 * Particles a copula follows with nothing odd about it: 九時からです,
 * 一つだけです, 五分ぐらいです, 行くんです. After は or を it would be.
 */
const BEFORE_COPULA = new Set(['から', 'まで', 'だけ', 'ぐらい', 'くらい', 'など', 'ばかり', 'ほど', 'の', 'ん']);

/** Sentence-final particles that only ever follow a predicate. */
const AFTER_PREDICATE_ONLY = new Set(['もの', 'もん', 'ものの']);

/** Greetings whose last は is the old particle, said wa, if the data lacks `w`. */
export const FINAL_WA = new Set(['こんにちは', 'こんばんは']);

/**
 * Words that measure a span of time, which is what a number of minutes or
 * days is before them and "enough" is not: 十分かかります, 十分後, 十分以内.
 */
const DURATION = new Set([
  '後', '前', '間', '以内', '以上', '以下', 'ぐらい', 'くらい', 'ほど', 'ごろ', '頃', '過ぎ', 'すぎ',
  'おき', '置き', 'かかる', '掛かる', '経つ', 'たつ', '遅れる', 'おくれる', '遅刻',
]);

/** Verbs of going, which is what follows へ. 行って after へ is 行く, not 言う. */
const MOTION = new Set([
  '行く', 'いく', '来る', 'くる', '帰る', 'かえる', '戻る', 'もどる', '向かう', 'むかう',
  '出かける', 'でかける', '入る', 'はいる', '出る', 'でる', '着く', 'つく',
]);

// ── Costs ─────────────────────────────────────────────────────────────────

export const COST = Object.freeze({
  word: 100,          // any dictionary word, before the adjustments below
  // By q band, 1 (most frequent) to 5; index 0 is "unranked". The research
  // had one bit (common -15, rare +10); the band spreads it over five steps
  // around the same midpoint, so a q1 word beats a q4 homograph.
  q: [10, -20, -15, -10, -5, 0],
  kanaForKanji: 20,   // a kana key for a word usually written in kanji
  kanaCompound: 40,   // ...and straight after a noun, with no particle (connect)
  oneKana: 200,       // a one-kana word: は "tooth" must lose to は the particle
  step: 5,            // per deinflection step: the shorter chain wins a tie
  xSplit: 60,         // key = key + particle (今日は), not the whole run: split
  aux: 80,            // a dictionary auxiliary (ます, たい as keys): the chain owns these
  particle: 80,
  copula: 70,
  kataRun: 150,       // a katakana run the dictionary does not have
  number: 50,         // ASCII digits, with or without a counter
  numberKanji: 95,    // kanji numerals: a dictionary key with the same span wins
                      // (十分 is じゅうぶん, "enough", unless written 10分)
  bareNumber: 10,     // a number with no counter after it
  numberKey: 25,      // a key spelled like a number and counter, unless q1:
                      // 五分 ごぶ (q3) loses to ごふん, 十分 じゅうぶん (q1) wins
  // ...unless what follows it measures time: 駅まで十分かかります is ten
  // minutes, and so are 十分後 and 十分ぐらい. A q1 key spelled like a number
  // and counter pays this before a word from DURATION, which is more than
  // the 15 its q1 band saved it, so the number wins there and only there.
  durationKey: 40,
  nounVerb: 30,       // a noun straight into a verb, no particle (connect)
  homographSpelling: 10, // per place this kanji sits down its reading's list
  homographAffix: 10, // an affix-first record, where another is not
  homographKanaUsual: 20, // a record marked usually-kana, met in kanji
  stemNoun: 60,       // a verb stem read as a noun (卵焼き's 焼き); dearer than
                      // any conjugation of the same characters
  name: 250,          // a kanji run with no dictionary support, read as a name
  namePerChar: 30,
  // A closed stretch of two or more kanji that no dictionary key touches
  // (names.js, `unsupported`). Two single-kanji words are the only other way
  // through it, and they cost 140 at the least (田 80 + 中 read じゅう as a
  // suffix 80, -20 to connect), so 120 wins: 田中 was 田|中 "rice field,
  // throughout" before this. It stays above a kanji number with its counter
  // (95), so 五本 is still five long things and not a surname.
  nameRun: 120,
  nameRunPerChar: 10, // each kanji past the second
  tsu: 150,           // one kana plus a final small tsu: あっ, えっ
  unkKana: 400,       // one kana nothing else explains
});

/**
 * A kanji key with several records (本 is もと and ほん, 前 is ぜん and まえ)
 * lists them in the upstream's order, which says nothing about which is
 * meant, and its q band is the key's, shared by all of them. Three signals
 * in the data do say something, and each record pays for the ones against
 * it, relative to the key's best record:
 *
 *   - its reading's kana record lists this spelling further down: the ほん
 *     record lists 本 first, the もと record lists it after 元 (この本 was
 *     このもと);
 *   - its first part of speech is an affix while another record's is not:
 *     前 as ぜん is first a prefix, as まえ a noun (駅の前 was えきのぜん), and
 *     月 as がつ is a suffix (月がきれい was がつ);
 *   - it is marked usually written in kana, met here in kanji: 何時 is なんじ,
 *     and いつ is written いつ.
 *
 * And one for verbs: a verb record also tagged as a suffix is the reading
 * compounds use (入る as いる, in 気に入る) and loses to one that is not
 * (お風呂に入ります was いります). The kana key's q band is no signal: it is
 * shared by every homophone, so いる "to be" made 入る いる, and しん outranked
 * こころ. Measured over the 123 common kanji keys with several records.
 */
export function homographCost(key, rec, dict) {
  if (!dict || !hasKanji(key)) return 0;
  const recs = dict.get(key);
  if (!recs || recs.length < 2 || !recs.includes(rec)) return 0;
  // Relative to the key's own best record, so a key with several records
  // never loses to a different key for having them.
  const raw = recs.map((r) => homographRaw(key, r, recs));
  return raw[recs.indexOf(rec)] - Math.min(...raw);
}

/**
 * Two keys whose records tie on every signal above, where the tie went to the
 * upstream's order and the order picked the reading a textbook does not
 * teach: 窓が開いています was ひらいています, and 下手 was したて, a sumo
 * grip. The data has no per-record frequency that could decide these, so
 * they are listed, one line each, and nothing else is. A 開く that follows
 * を is the transitive ひらく (本を開く), which connect() handles.
 */
const TEXTBOOK = Object.freeze({ '開く': 'あく', '下手': 'へた' });
const TRANSITIVE_AFTER_O = Object.freeze({ '開く': 'ひらく' });

/** 開く read ひらく and conjugated, but not into its potential: 窓を開けて is 開ける. */
function isTransitiveReading(node) {
  if (!node.rec || !node.rec.r || TRANSITIVE_AFTER_O[node.key] !== node.rec.r[0]) return false;
  return !(node.chain || []).some((c) => c.rule === 'potential' || c.rule === 'passive');
}

const AFFIX = new Set(['pref', 'suf', 'n-pref', 'n-suf', 'ctr']);
const SUFFIX_TAGS = new Set(['suf', 'n-suf', 'ctr']);
const tagsOf = (r) => String(r.p || '').split(' ');

function homographRaw(key, rec, recs) {
  const tags = tagsOf(rec);
  let cost = rec.u ? COST.homographKanaUsual : 0;
  if (TEXTBOOK[key] && rec.r && rec.r[0] !== TEXTBOOK[key]) cost += COST.homographSpelling;
  if (AFFIX.has(tags[0]) && recs.some((r) => !AFFIX.has(tagsOf(r)[0]))) cost += COST.homographAffix;
  const verb = (r) => classOf(r.p) === 'verb';
  if (verb(rec) && tags.includes('suf') && recs.some((r) => r !== rec && verb(r) && !tagsOf(r).includes('suf'))) {
    cost += COST.homographAffix;
  }
  // How far down its reading's kana records this spelling sits, which the
  // builder works out and ships as `o` (tools/lib/prices.mjs), so the
  // reading's shard is never fetched to find it out.
  return cost + COST.homographSpelling * (rec.o || 0);
}

/**
 * The q band a record may use. A kana key's band is a count of the string,
 * and when the string is one of the closed particles, or an interjection,
 * the count is theirs: から is q1 because of "from", so 殻 "shell" and 空
 * "empty", spelled から too, are not, and はい is q1 because of "yes", not
 * 灰 "ash". Such a record is priced as unranked. Only the closed list: もの
 * is q1 because of 物, not because of its rare sentence-final particle.
 */
export function bandOf(key, rec, dict) {
  if (!rec.k || !rec.k.length || rec.u || classOf(rec.p) === 'prt') return rec.q;
  if (PARTICLE.has(key)) return 0;
  const recs = (dict && dict.get(key)) || [];
  return recs.some((r) => r !== rec && isInterjection(r)) ? 0 : rec.q;
}

/** The class a dictionary record connects as. */
export function classOf(pos) {
  const tags = String(pos || '').split(' ');
  const has = (t) => tags.includes(t);
  if (has('prt')) return 'prt';
  if (has('cop')) return 'cop';
  if (tags.some((t) => /^v(1|5|k$|s-i$|s-s$|z$)/.test(t))) return 'verb';
  if (has('adj-i') || has('adj-ix')) return 'adj';
  if (has('exp') || has('int')) return 'exp';
  // この, あの, 大きな: they lead a noun and nothing else, and a suffix never
  // follows one (この人 read このじん while この connected as a noun).
  if (has('adj-pn')) return 'det';
  if (tags.some((t) => t.startsWith('aux'))) return 'aux';
  // A pronoun connects like a noun: 何 is "pn pref" in the data, and as a
  // prefix it would never take です.
  const nounish = has('n') || has('pn');
  if (nounish) return 'noun';
  // The first tag is the record's main use: 御 (ご) is "pref suf", a prefix
  // first, and read as a suffix it lost ご注文 to 語 "word". An adverb that
  // can also prefix is an adverb: また "again" is "adv conj pref", and as a
  // prefix it could not end じゃあ、また, which then read 股 "groin".
  if (tags[0] === 'pref') return 'pref';
  if (has('suf') || has('ctr')) return 'suf';
  if (has('pref') && !has('adv')) return 'pref';
  return 'noun';
}

export const NOMINAL = new Set(['noun', 'kata', 'num', 'name', 'suf']);

/** What it costs for `next` to follow `prev`. null is the edge of the run. */
export function connect(prev, next) {
  const extra = prev && prev.countLike && next && isDuration(next) ? COST.durationKey : 0;
  return extra + pairCost(prev, next);
}

function isDuration(node) {
  if (DURATION.has(node.key || node.s)) return true;
  return !!(node.rec && node.rec.k && node.rec.k.some((k) => DURATION.has(k)));
}

function pairCost(prev, next) {
  const p = prev ? prev.cls : 'bos';
  const n = next ? next.cls : 'eos';
  // A prefix is only a prefix before a noun. This check sat below the
  // particle branch, so 幾 (いく, "some") followed by と cost nothing and
  // won いくと from the verb 行く on record order alone.
  // Before an adjective it is a prefix too, the colloquial kind: 超おいしい,
  // 超おいしかった, which paid 150 and read 超|おい|しかった, "nephew, scold".
  if (p === 'pref') return n === 'noun' ? -20 : n === 'adj' ? 0 : 150;
  if (p === 'det') return ['noun', 'kata', 'name', 'num'].includes(n) ? -20 : 60;
  if (n === 'prt') {
    // を is nothing but a particle, so it may open a run (after a comma).
    if (p === 'bos') return next.s === 'を' ? 0 : 300;
    // もの "because" ends a sentence after a predicate (だもの, 行くもの),
    // never after a noun or a particle; the dictionary's record for it made
    // すもももももも... end in もの|うち.
    if (AFTER_PREDICATE_ONLY.has(next.s) && !['verb', 'adj', 'cop'].includes(p)) return 150;
    if (NOMINAL.has(p)) return -30;
    // The same particle twice (も|も, は|は) is never Japanese.
    if (p === 'prt') return PARTICLE_PAIRS.has(prev.s + next.s) ? -10 : prev.s === next.s ? 150 : 40;
    return 0;
  }
  if (n === 'cop') {
    if (NOMINAL.has(p)) return -30;
    if (p === 'adj') return -20;
    // Before AFTER_PREDICATE, なら after 行く paid 50 and lost to 奈良; and
    // before BEFORE_COPULA, 九時からです read から as 空 "empty".
    if (p === 'verb') return AFTER_PREDICATE.has(next.s) ? 0 : 50;
    if (p === 'prt') return AFTER_PREDICATE.has(next.s) || BEFORE_COPULA.has(prev.s) ? 0 : 50;
    return 0;
  }
  if (n === 'eos') {
    if (p === 'prt') return SENTENCE_FINAL.has(prev.s) || CLAUSE_FINAL.has(prev.s) ? 0 : 30;
    return 0;
  }
  if (n === 'suf') return NOMINAL.has(p) ? -20 : 150;
  // After a number and its counter, a noun that is also a suffix is read as
  // the suffix: 三日後 is みっかご and 十分後 じゅっぷんご, where 後 on its
  // own is あと; 五人分 is ぶん, not ふん.
  if (n === 'noun' && p === 'num' && next.rec && tagsOf(next.rec).some((t) => SUFFIX_TAGS.has(t))) return -20;
  // A word usually written in kanji, met in hiragana straight after a noun,
  // is more often a particle and a word than a compound: わたしのうち is
  // の|うち "my house", not 農地 "farmland", こんどはへん is は|へん, and
  // すもももももも has particles between its もも. Kana text writes its
  // compounds as one key (にほんご, あさごはん), which never pays this.
  if (n === 'noun' && NOMINAL.has(p)) return next.kanaSpelled ? 20 + COST.kanaCompound : 20;
  if (n === 'verb') {
    if (p === 'verb') return (next.s === 'ください' || next.s === '下さい') ? -30 : 20;
    // 勉強|します: a noun that takes する, followed by する.
    if (p === 'noun' && prev.rec && /\bvs\b/.test(prev.rec.p) && (next.key === 'する' || next.key === '為る')) return -30;
    if (p === 'prt' && prev.s === 'へ' && isMotion(next)) return -20;
    if (p === 'prt' && prev.s === 'を' && isTransitiveReading(next)) return -20;
    // A noun straight into a verb, with no particle between, is rarer in
    // writing than a noun, a particle and a verb, so where the kana allow
    // both the particle wins: 袋|は|いりません, "no bag, thanks", was
    // 袋|はいりません, "the bag does not go in". Adverbs are exempt; they
    // lead verbs all the time (ゆっくり話して).
    if (prev && isBareNoun(prev)) return COST.nounVerb;
  }
  if (n === 'exp' && p === 'verb' && (next.s === 'ください' || next.s === '下さい')) return -30;
  // An interjection opens an utterance; straight after a particle that does
  // not end one it is almost never meant. にほんへはいつきましたか read
  // へ|はい|つきました, "to Japan, yes, arrived", where は|いつ is "when".
  if (n === 'exp' && p === 'prt' && !SENTENCE_FINAL.has(prev.s) && next.rec && isInterjection(next.rec)) return 150;
  return 0;
}

const isInterjection = (rec) => tagsOf(rec).every((t) => t === 'int');

function isBareNoun(node) {
  // A suffix ends a noun (田中|さん, 学生|達), so it counts as one. A number
  // does not: 三人来ました is how Japanese counts. Nor does a pronoun: いつ
  // takes no particle before its verb (いつ来ましたか), and speech drops the
  // one after これ and それ all the time.
  if (node.cls === 'kata' || node.cls === 'name' || node.cls === 'suf') return true;
  return node.cls === 'noun' && !(node.rec && /\b(adv|pn)\b/.test(node.rec.p));
}

function isMotion(node) {
  if (MOTION.has(node.key)) return true;
  return !!(node.rec && node.rec.k && node.rec.k.some((k) => MOTION.has(k)));
}
