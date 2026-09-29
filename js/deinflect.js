// Deinflection: from what is written back to the form a dictionary lists.
//
// The rule table in this file was written for this project, from the grammar,
// first as a research prototype for Runcible's reader (2026-09-28) and then
// productionised here. No GPL rule table was consulted while writing it: not
// rikaichan's, not Yomichan's or Yomitan's, not 10ten's. If a rule here looks
// like one of theirs, it is because Japanese conjugates the same way for
// everybody.
//
// How it works. A candidate is { text, type, chain }. The pasted span starts
// with every type at once (it could be anything). A rule applies when the text
// ends with the rule's `from` and the candidate's type set meets the rule's
// `in`; the rewritten candidate carries the rule's `out` set. The lattice then
// accepts a candidate as a word only when a dictionary record at that text has
// a part of speech inside the candidate's type set (`posMatches`). So this file
// proposes and the dictionary disposes: 行って yields 行う, 行つ and 行る as well
// as 行く, and only 行く is in the dictionary with a matching tag.
//
// Four decisions the research recorded, kept here on purpose:
//   1. A bare masu-stem is not a start state. 食べ on its own is not a word, and
//      letting it be one made the lattice cut 食べ|ます. STEM is reachable only
//      through ます, たい, ながら, なさい, そう, すぎる, やすい and にくい.
//   2. いい (adj-ix) never conjugates from いい: the past of いい is よかった.
//      `posMatches` refuses a conjugated candidate whose base ends in いい,
//      and `adjIxReading` picks the よ reading when a conjugated one is shown.
//   3. 来 written in kanji keeps one character while its reading moves between
//      こ, き and く. That is the reader's problem, not this table's: see
//      `kuruReading`.
//   4. する and くる are irregular, and their rules are a closed list that fires
//      only on the whole text (して is する; 話して is not 話する). A noun that
//      takes する is read as two tokens, 勉強|して, which is what a learner
//      is taught anyway.

/** Word classes and the in-between forms the chain passes through. */
export const T = Object.freeze({
  V1: 1 << 0, V5U: 1 << 1, V5K: 1 << 2, V5KS: 1 << 3, V5G: 1 << 4, V5S: 1 << 5,
  V5T: 1 << 6, V5N: 1 << 7, V5B: 1 << 8, V5M: 1 << 9, V5R: 1 << 10, V5RI: 1 << 11,
  V5ARU: 1 << 12, VK: 1 << 13, VS: 1 << 14, ADJI: 1 << 15,
  // Never a dictionary part of speech: the places a chain passes through.
  STEM: 1 << 16, TE: 1 << 17, TA: 1 << 18, POLITE: 1 << 19, SURF: 1 << 20,
});

/** Every type at once, which is what a pasted span is before a rule applies. */
export const ANY = (1 << 21) - 1;

/**
 * JMdict part-of-speech codes to the types above. adj-ix is here because
 * よかった is a real conjugation of the よい spelling; `posMatches` is where
 * いい is kept from conjugating.
 */
export const POS_TYPE = Object.freeze({
  'v1': T.V1, 'v1-s': T.V1, 'v5u': T.V5U, 'v5u-s': T.V5U, 'v5k': T.V5K, 'v5k-s': T.V5KS,
  'v5g': T.V5G, 'v5s': T.V5S, 'v5t': T.V5T, 'v5n': T.V5N, 'v5b': T.V5B, 'v5m': T.V5M,
  'v5r': T.V5R, 'v5r-i': T.V5RI, 'v5aru': T.V5ARU, 'vk': T.VK, 'vs-i': T.VS,
  'adj-i': T.ADJI, 'adj-ix': T.ADJI,
});

const {
  V1, V5U, V5K, V5KS, V5G, V5S, V5T, V5N, V5B, V5M, V5R, V5RI, V5ARU, VK, VS, ADJI,
  STEM, TE, TA, POLITE, SURF,
} = T;

/**
 * One rule. `id` is what the grammar notes key on and is shared by every rule
 * that makes the same form; `label` is a plain English name for a developer,
 * never learner prose (docs/ANALYZER.md, "The token").
 */
function R(id, from, to, inT, outT, label, whole = false) {
  return Object.freeze({ id, from, to, in: inT, out: outT, label, whole });
}

// Godan rows: [dictionary ending, i-row, a-row, e-row, o-row, te, ta, type].
// v5k-s is 行く, whose te-form is 行って and not 行いて; v5r-i is ある, whose
// negative is ない and not あらない; v5aru is ござる, くださる, なさる, whose
// stem ends in い.
const GODAN = [
  ['う', 'い', 'わ', 'え', 'お', 'って', 'った', V5U],
  ['く', 'き', 'か', 'け', 'こ', 'いて', 'いた', V5K],
  ['く', 'き', 'か', 'け', 'こ', 'って', 'った', V5KS],
  ['ぐ', 'ぎ', 'が', 'げ', 'ご', 'いで', 'いだ', V5G],
  ['す', 'し', 'さ', 'せ', 'そ', 'して', 'した', V5S],
  ['つ', 'ち', 'た', 'て', 'と', 'って', 'った', V5T],
  ['ぬ', 'に', 'な', 'ね', 'の', 'んで', 'んだ', V5N],
  ['ぶ', 'び', 'ば', 'べ', 'ぼ', 'んで', 'んだ', V5B],
  ['む', 'み', 'ま', 'め', 'も', 'んで', 'んだ', V5M],
  ['る', 'り', 'ら', 'れ', 'ろ', 'って', 'った', V5R | V5RI | V5ARU],
];

const ROW = (fn) => GODAN.map(([d, i, a, e, o, te, ta, t]) => fn({ d, i, a, e, o, te, ta, t }));
const NOT_ARU = ~(V5RI | V5ARU);

export const RULES = Object.freeze([
  // A. The polite family collapses onto ます, and ます onto the stem.
  R('masu-past', 'ました', 'ます', SURF | TA, POLITE, 'polite past'),
  R('masu-negative', 'ません', 'ます', SURF, POLITE, 'polite negative'),
  R('masu-past-negative', 'ませんでした', 'ます', SURF | TA, POLITE, 'polite past negative'),
  R('masu-volitional', 'ましょう', 'ます', SURF, POLITE, "polite volitional (let's)"),
  R('masu-te', 'まして', 'ます', SURF, POLITE, 'polite te-form'),
  R('masu', 'ます', '', POLITE, STEM, 'polite ending'),

  // B. The stem back to the dictionary form. Ichidan adds る; godan moves from
  // the i-row to the u-row. The -aru verbs make their stem with い.
  R('stem', '', 'る', STEM, V1 | VK, 'stem'),
  R('stem', 'い', 'る', STEM, V5ARU, 'stem (honorific -aru verb)'),
  ...ROW(({ d, i, t }) => R('stem', i, d, STEM, t & ~V5ARU, 'stem')),

  // C. Endings that hang off the stem and then conjugate as something else.
  R('tai', 'たい', '', ADJI, STEM, 'want to (desire)'),
  R('nagara', 'ながら', '', SURF, STEM, 'while doing'),
  R('nasai', 'なさい', '', SURF, STEM, 'polite command'),
  R('sou', 'そう', '', SURF, STEM, 'looks about to'),
  R('sugiru', 'すぎる', '', V1, STEM, 'too much'),
  R('yasui', 'やすい', '', ADJI, STEM, 'easy to'),
  R('nikui', 'にくい', '', ADJI, STEM, 'hard to'),

  // D. The te-form, and the ta-form, which shares every row with it.
  R('te', 'て', 'る', TE, V1 | VK, 'te-form'),
  ...ROW(({ d, te, t }) => R('te', te, d, TE, t, 'te-form')),
  R('adj-te', 'くて', 'い', TE, ADJI, 'te-form of an adjective'),
  R('ta', 'た', 'て', TA, TE, 'past (ta-form)'),
  R('ta', 'だ', 'で', TA, TE, 'past (ta-form)'),
  R('adj-past', 'かった', 'い', TA, ADJI, 'past of an adjective'),
  R('tari', 'たり', 'た', SURF, TA, 'listing (tari)'),
  R('tari', 'だり', 'だ', SURF, TA, 'listing (tari)'),
  R('tara', 'たら', 'た', SURF, TA, 'conditional (tara)'),
  R('tara', 'だら', 'だ', SURF, TA, 'conditional (tara)'),

  // E. Forms built on the te-form that conjugate like an ichidan or godan verb.
  R('te-iru', 'ている', 'て', V1, TE, 'progressive (te iru)'),
  R('te-iru', 'でいる', 'で', V1, TE, 'progressive (te iru)'),
  R('te-iru-casual', 'てる', 'て', V1, TE, 'progressive, casual (teru)'),
  R('te-iru-casual', 'でる', 'で', V1, TE, 'progressive, casual (teru)'),
  R('te-shimau-casual', 'ちゃう', 'て', V5U, TE, 'done, casual (chau)'),
  R('te-shimau-casual', 'じゃう', 'で', V5U, TE, 'done, casual (jau)'),
  // The uncontracted しまう and the みる of "try and see". Without them
  // 忘れてしまいました was two words and しまいました meant "to finish",
  // and 食べてみます read みます as 診る, "to look after (medically)".
  R('te-shimau', 'てしまう', 'て', V5U, TE, 'done (te shimau)'),
  R('te-shimau', 'でしまう', 'で', V5U, TE, 'done (te shimau)'),
  R('te-miru', 'てみる', 'て', V1, TE, 'try doing (te miru)'),
  R('te-miru', 'でみる', 'で', V1, TE, 'try doing (te miru)'),

  // F. The plain negative, which conjugates like an adjective.
  R('negative', 'ない', 'る', ADJI, V1 | VK, 'negative'),
  ...ROW(({ d, a, t }) => R('negative', a + 'ない', d, ADJI, t & ~V5RI, 'negative')),
  R('negative-te', 'ないで', 'ない', SURF, ADJI, 'without doing'),
  // Have to, casual: なくちゃ is なくては and なきゃ is なければ, each with
  // its いけない left unsaid. 帰らなくちゃ was 帰らなく and ちゃ, "tea".
  R('must-casual', 'なくちゃ', 'ない', SURF, ADJI, 'must, casual (nakucha)'),
  R('must-casual', 'なきゃ', 'ない', SURF, ADJI, 'must, casual (nakya)'),

  // G. Adjective forms.
  R('adj-negative', 'くない', 'い', ADJI, ADJI, 'negative of an adjective'),
  R('adj-adverb', 'く', 'い', SURF, ADJI, 'adverbial (ku)'),
  R('adj-ba', 'ければ', 'い', SURF, ADJI, 'conditional (ba) of an adjective'),
  R('adj-sou', 'そう', 'い', SURF, ADJI, 'looks (sou)'),
  R('adj-sugiru', 'すぎる', 'い', V1, ADJI, 'too (sugiru)'),

  // H. Potential: godan e-row plus る, and ichidan られる (which is also the
  // passive, so it gets its own id), and the colloquial ra-less れる.
  ...ROW(({ d, e, t }) => R('potential', e + 'る', d, V1, t & NOT_ARU, 'potential')),
  R('potential-passive', 'られる', 'る', V1, V1 | VK, 'potential or passive'),
  R('potential-colloquial', 'れる', 'る', V1, V1, 'potential, colloquial (ra dropped)'),

  // I. Passive: godan a-row plus れる.
  ...ROW(({ d, a, t }) => R('passive', a + 'れる', d, V1, t & NOT_ARU, 'passive')),

  // J. Causative: godan a-row plus せる, ichidan させる.
  ...ROW(({ d, a, t }) => R('causative', a + 'せる', d, V1, t & NOT_ARU, 'causative')),
  R('causative', 'させる', 'る', V1, V1 | VK, 'causative'),

  // K. Volitional.
  R('volitional', 'よう', 'る', SURF, V1 | VK, "volitional (let's)"),
  ...ROW(({ d, o, t }) => R('volitional', o + 'う', d, SURF, t & ~V5RI, "volitional (let's)")),

  // L. Imperative. The -aru verbs command with い (ください, なさい), and so
  // does 来 in kanji (来い).
  R('imperative', 'ろ', 'る', SURF, V1, 'command'),
  R('imperative', 'い', 'る', SURF, V5ARU | VK, 'command'),
  ...ROW(({ d, e, t }) => R('imperative', e, d, SURF, t & NOT_ARU, 'command')),

  // M. The ba conditional.
  R('ba', 'れば', 'る', SURF, V1 | VK, 'conditional (ba)'),
  ...ROW(({ d, e, t }) => R('ba', e + 'ば', d, SURF, t, 'conditional (ba)')),

  // N. する and くる, a closed list: each fires only when it is the whole text.
  R('stem', 'し', 'する', STEM, VS, 'stem', true),
  R('te', 'して', 'する', TE, VS, 'te-form', true),
  R('negative', 'しない', 'する', ADJI, VS, 'negative', true),
  R('passive', 'される', 'する', V1, VS, 'passive', true),
  R('causative', 'させる', 'する', V1, VS, 'causative', true),
  R('volitional', 'しよう', 'する', SURF, VS, "volitional (let's)", true),
  R('imperative', 'しろ', 'する', SURF, VS, 'command', true),
  R('ba', 'すれば', 'する', SURF, VS, 'conditional (ba)', true),
  R('stem', 'き', 'くる', STEM, VK, 'stem', true),
  R('te', 'きて', 'くる', TE, VK, 'te-form', true),
  R('negative', 'こない', 'くる', ADJI, VK, 'negative', true),
  R('potential-passive', 'こられる', 'くる', V1, VK, 'potential or passive', true),
  R('causative', 'こさせる', 'くる', V1, VK, 'causative', true),
  R('volitional', 'こよう', 'くる', SURF, VK, "volitional (let's)", true),
  R('imperative', 'こい', 'くる', SURF, VK, 'command', true),
  R('ba', 'くれば', 'くる', SURF, VK, 'conditional (ba)', true),
]);

// Rules indexed by the last character of `from`, so a candidate only tries the
// rules that could match it. The empty-`from` rule (stem back to る) is kept
// apart and tried on every candidate.
const BY_LAST = new Map();
const EMPTY_FROM = [];
for (const r of RULES) {
  if (!r.from) { EMPTY_FROM.push(r); continue; }
  const last = r.from[r.from.length - 1];
  if (!BY_LAST.has(last)) BY_LAST.set(last, []);
  BY_LAST.get(last).push(r);
}

/** Six steps is enough for 食べさせられませんでした and bounds the search. */
const MAX_STEPS = 6;
const CACHE_CAP = 60000;
const cache = new Map();

function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Every way `surface` could be an inflection of a shorter dictionary form.
 *
 * @param {string} surface
 * @returns {{ base: string, type: number, chain: { rule: string, label: string }[], cuts: number[] }[]}
 *   `chain` runs from the surface to the base (chain[0] is the outermost
 *   ending). `cuts` are the morpheme joins the chain proves, as offsets into
 *   `surface`: 食べさせられる gives [2, 4], 食べ|させ|られる. The surface
 *   itself is not in the list; the lattice looks it up directly.
 */
export function deinflect(surface) {
  const s = String(surface || '');
  if (!s) return [];
  const hit = cache.get(s);
  if (hit) return hit;

  const out = [];
  const start = { text: s, type: ANY & ~STEM, chain: [], cuts: [], stable: s.length };
  const queue = [start];
  const seen = new Set([`${s}:${start.type}`]);
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    if (c.chain.length >= MAX_STEPS) continue;
    const rules = BY_LAST.get(c.text[c.text.length - 1]) || [];
    for (const list of [rules, EMPTY_FROM]) {
      for (const r of list) {
        if (!(c.type & r.in)) continue;
        if (r.whole ? c.text !== r.from : !c.text.endsWith(r.from)) continue;
        const keep = c.text.length - r.from.length;
        const text = c.text.slice(0, keep) + r.to;
        if (!text) continue;
        const key = `${text}:${r.out}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // The join this step proves sits after the part the rule kept, plus
        // whatever `from` and `to` share (ました to ます keeps its ま). The
        // irregular stems し, さ, す, き, こ and く are one kana, so a closed-list
        // rule always joins after its first character: し|て, こ|られる.
        const join = r.whole ? 1 : keep + commonPrefix(r.from, r.to);
        const cuts = join > 0 && join <= c.stable && join < s.length && !c.cuts.includes(join)
          ? [...c.cuts, join] : c.cuts;
        const next = {
          text, type: r.out,
          chain: [...c.chain, { rule: r.id, label: r.label }],
          cuts, stable: Math.min(c.stable, keep),
        };
        queue.push(next);
        out.push(next);
      }
    }
  }

  const result = Object.freeze(out.map((c) => Object.freeze({
    base: c.text,
    type: c.type,
    chain: Object.freeze(c.chain),
    cuts: Object.freeze([...c.cuts].sort((a, b) => a - b)),
  })));
  if (cache.size >= CACHE_CAP) cache.clear();
  cache.set(s, result);
  return result;
}

/**
 * The masu-stem read as a noun, which Japanese does all the time: 焼き in
 * 卵焼き, 召し上がり in お召し上がりですか, 食べ in 食べ始める. `deinflect`
 * never offers a bare stem (decision 1 above); the lattice asks for one here,
 * separately, and prices it high enough that 食べ|ます never beats 食べます.
 *
 * @param {string} surface
 * @returns {{ base: string, type: number, chain: { rule: string, label: string }[], cuts: number[] }[]}
 */
export function deinflectStem(surface) {
  const s = String(surface || '');
  const out = [];
  if (!s) return out;
  for (const r of RULES) {
    if (r.id !== 'stem' || r.whole || !(r.in & STEM) || !s.endsWith(r.from)) continue;
    const base = s.slice(0, s.length - r.from.length) + r.to;
    if (base === s) continue;
    out.push(Object.freeze({
      base, type: r.out, chain: Object.freeze([{ rule: r.id, label: r.label }]), cuts: Object.freeze([]),
    }));
  }
  return out;
}

/**
 * Whether a dictionary record's part-of-speech string admits a candidate.
 * `conjugated` is true when the candidate came through at least one rule.
 */
export function posMatches(type, pos, base, conjugated = true) {
  const tags = String(pos || '').split(' ');
  // The data lists ございます as a key (exp aux-v) but not ござる, so a
  // polite form that lands on a ます key that is itself an expression is
  // accepted as that key: ございました is ございます in the past.
  if ((type & T.POLITE) && base.endsWith('ます') && (tags.includes('exp') || tags.includes('aux-v'))) return true;
  for (const p of tags) {
    const t = POS_TYPE[p];
    if (!t || !(t & type)) continue;
    if (p === 'adj-ix' && conjugated && base.endsWith('いい')) continue;
    return true;
  }
  return false;
}

/** True when the part-of-speech string names a verb or an i-adjective. */
export function isConjugable(pos) {
  return String(pos || '').split(' ').some((p) => POS_TYPE[p]);
}

/**
 * The reading to show for a conjugated adj-ix: the よ one. 良かった is
 * よかった; a record that lists いい first would otherwise read いかった.
 */
export function adjIxReading(readings) {
  const list = readings || [];
  return list.find((r) => r.startsWith('よ') || r.includes('よい')) || list[0];
}

/**
 * 来 in kanji: one character, three readings. The form decides, and the form
 * is visible in what follows the kanji.
 *   こ  来ない, 来なかった, 来よう, 来られる, 来させる, 来い
 *   く  来る, 来れば
 *   き  everything built on the stem or the te-form (来ます, 来て, 来た, 来たい)
 */
export function kuruReading(surface) {
  const tail = surface.slice(surface.indexOf('来') + 1);
  if (/^(な|よう|られ|させ|い$)/.test(tail)) return 'こ';
  if (/^(る|れば)/.test(tail)) return 'く';
  return 'き';
}
