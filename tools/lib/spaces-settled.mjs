/**
 * Whether Yomu's analysis settles where the words of a line part, for "Where
 * are the spaces?" (tools/lib/spaces.mjs, which leaves out a line it does
 * not settle). A key must never dock a learner for a split the language
 * makes, so each check here finds a place where the language parts the words
 * another way as readily, from the analysis and the dictionary alone, never
 * from a list of lines:
 *
 *   joined    two or more neighbouring tokens spell one dictionary word
 *   counter   a number's counter and the word after it spell one
 *   tail      a word ends in a particle after a word
 *   two       one token is two words to the grammar
 *
 * and `otherWord`, for a kana spelling that reads a word of its written line
 * as another word. spaces.mjs says why each is left out, with examples.
 */
import { isWordToken, isGuess } from '../../js/gaps.js';
import { isKanji, toHira } from '../../js/kana.js';
import { PARTICLES, COPULA } from '../../js/costs.js';
import { analyze } from '../../js/analyze.js';

/** The verbs a te-form lends itself to (補助動詞), in their dictionary form: a closed class, as the particles are. */
export const AUXILIARIES = Object.freeze(['いる', 'いく', 'くる', 'おく', 'しまう', 'みる', 'ある', 'あげる', 'くれる', 'もらう']);
const TE_AUX = new RegExp(`[てで](?:${AUXILIARIES.join('|')})$`, 'u');
/** The deinflection rules that join a te-form and its verb with the verb spelled out (deinflect.js). */
const TE_RULES = new Set(['te-iru', 'te-shimau', 'te-miru']);
/** The longest stretch of tokens read again as one word. */
const MAX_JOIN = 12;

/**
 * The dictionary the checks read, over its own copy of the shards so that
 * nothing they load reaches the lines' analysis: `lookup(key)`, a key's
 * records in both tiers, first tier then rare (dict.js `need`/`get`,
 * `needRare`/`rare`), and `read(text)`, the analyzer over a piece of a
 * token, to ask what the piece is on its own.
 */
export function dictWords(dict) {
  return Object.freeze({
    async lookup(key) {
      await dict.need([key]);
      await dict.needRare([key]);
      return [...(dict.get(key) || []), ...(dict.rare(key) || [])];
    },
    read: (text) => analyze(text, { dict }),
  });
}

const posOf = (rec) => (rec && typeof rec.p === 'string' ? rec.p.split(' ') : []);

/**
 * Is `key` one dictionary word read `reading`: a record that is not an
 * expression (JMdict's `exp` is a phrase of several words, ですか or
 * 気をつけて), whose reading is the line's. A kana key is its own reading.
 */
async function isOneWord(lookup, key, reading) {
  const want = toHira(reading);
  if (!want) return false;
  const kanji = [...key].some(isKanji);
  for (const rec of await lookup(key)) {
    if (posOf(rec).includes('exp')) continue;
    if (kanji ? Array.isArray(rec.r) && rec.r.some((x) => toHira(x) === want) : toHira(key) === want) return true;
  }
  return false;
}

/** A word token that a dictionary word may run across: not a particle or a copula form, which are a closed class. */
const joinable = (t) => isWordToken(t) && t.kind !== 'particle' && t.kind !== 'copula';

/**
 * Each stretch of touching joinable tokens from `n` on, as one string and its
 * reading, starting with `first` (the whole of token n, or a part of it).
 */
function* stretches(tokens, n, first) {
  let surface = first.surface;
  let reading = first.reading;
  for (let b = n + 1; b < tokens.length; b += 1) {
    if (!joinable(tokens[b]) || tokens[b].start !== tokens[b - 1].end) return;
    surface += tokens[b].surface;
    reading += tokens[b].reading || '';
    if ([...surface].length > MAX_JOIN) return;
    yield { surface, reading, to: b };
  }
}

/** Two or more neighbouring tokens that spell one dictionary word, as `卵|焼き`, or null. */
async function joinedWord(r, lookup) {
  const t = r.tokens;
  for (let n = 0; n < t.length; n += 1) {
    if (!joinable(t[n])) continue;
    for (const s of stretches(t, n, { surface: t[n].surface, reading: t[n].reading || '' })) {
      if (await isOneWord(lookup, s.surface, s.reading)) return t.slice(n, s.to + 1).map((x) => x.surface).join('|');
    }
  }
  return null;
}

/** A number whose counter (its last furigana part) and the words after it spell one dictionary word, as `何番|線`, or null. */
async function counterWord(r, lookup) {
  const t = r.tokens;
  for (let n = 0; n < t.length; n += 1) {
    const f = t[n].kind === 'number' && Array.isArray(t[n].furigana) ? t[n].furigana : [];
    if (f.length < 2) continue;
    const last = f[f.length - 1];
    for (const s of stretches(t, n, { surface: last.text, reading: last.ruby || last.text })) {
      if (await isOneWord(lookup, s.surface, s.reading)) return t.slice(n, s.to + 1).map((x) => x.surface).join('|');
    }
  }
  return null;
}

/**
 * A word that is a dictionary word and a particle, read the same, or a
 * copula form and a particle, as `何|と` or `だ|っけ`, or null. After a
 * word, the particle is one of the analyzer's (costs.js PARTICLES) and the
 * word holds a kanji; after the copula, any kana the dictionary lists first
 * as a particle (`prt`) is one too. The dictionary's single-kana particles
 * (て, つ, い) are what a word's last kana often spells, so they count only
 * there.
 */
async function particleTail(r, lookup) {
  for (const t of r.tokens) {
    if (!joinable(t) || !t.reading) continue;
    const chars = [...t.surface];
    const reading = toHira(t.reading);
    for (let n = 1; n < chars.length && n <= 3; n += 1) {
      const tail = chars.slice(-n).join('');
      const head = chars.slice(0, -n).join('');
      if (!reading.endsWith(tail)) continue;
      if (Object.hasOwn(COPULA, head) && (PARTICLES.includes(tail) || (await lookup(tail)).some((rec) => posOf(rec)[0] === 'prt'))) {
        return `${head}|${tail}`;
      }
      if (PARTICLES.includes(tail) && [...head].some(isKanji) && (await isOneWord(lookup, head, reading.slice(0, -n)))) return `${head}|${tail}`;
    }
  }
  return null;
}

/**
 * One token the grammar writes as two words, as `持っていきます` or
 * `お願い|します`, or null: a te-form and the verb it lends, a copula form
 * said in two, or an expression (its record `exp`) that is a word and a form
 * of する or ございます, the two verbs the analyzer gives a word of their own
 * after another (連絡|します; ございます, which the library's own notes call
 * an old polite "to be"), the readings adding up. する must follow a word
 * the dictionary says takes it (`vs`).
 */
async function twoWords(r, read) {
  for (const t of r.tokens) {
    if (t.kind === 'copula' && Array.isArray(COPULA[t.surface]) && COPULA[t.surface].length > 1) return t.surface;
    if (Array.isArray(t.chain) && t.chain.some((c) => c && TE_RULES.has(c.rule))) return t.surface;
    if (t.kind !== 'particle' && t.kind !== 'copula' && TE_AUX.test(t.base || '')) return t.surface;
    if (!joinable(t) || !posOf(t.entry).includes('exp') || !t.reading) continue;
    const chars = [...t.surface];
    for (let n = 1; n < chars.length; n += 1) {
      const [a, ...moreA] = (await read(chars.slice(0, n).join(''))).tokens;
      const [b, ...moreB] = (await read(chars.slice(n).join(''))).tokens;
      if (!a || !b || moreA.length || moreB.length || isGuess(a) || isGuess(b) || b.kind !== 'inflected') continue;
      if (b.base !== 'ございます' && !(b.base === 'する' && posOf(a.entry).includes('vs'))) continue;
      if (toHira(`${a.reading}${b.reading}`) === toHira(t.reading)) return `${a.surface}|${b.surface}`;
    }
  }
  return null;
}

/**
 * Why the analysis does not settle where the words of a line part, as
 * `{ why, at }` (`at` the words that show it), or null when it does.
 * `words` is `dictWords(dict)`.
 */
export async function unsettled(r, { lookup, read }) {
  let at = await joinedWord(r, lookup);
  if (at) return { why: 'joined', at };
  at = await counterWord(r, lookup);
  if (at) return { why: 'counter', at };
  at = await particleTail(r, lookup);
  if (at) return { why: 'tail', at };
  at = await twoWords(r, read);
  if (at) return { why: 'two', at };
  return null;
}

/**
 * A word of the written line its kana spelling reads as another word, as
 * `行って/いって`, or null: the kana token's record must be the written
 * word's, its spellings (`k`) holding the written dictionary form.
 */
export function otherWord(written, kana) {
  const a = written.tokens.filter(isWordToken);
  const b = kana.tokens.filter(isWordToken);
  if (a.length !== b.length) return `${a.length}/${b.length} words`;
  for (let n = 0; n < a.length; n += 1) {
    const x = a[n];
    const y = b[n];
    if (![...x.surface].some(isKanji)) continue;
    const spellings = y.entry && Array.isArray(y.entry.k) ? y.entry.k : [];
    if (y.base !== x.base && !spellings.includes(x.base)) return `${x.surface}/${y.surface}`;
  }
  return null;
}
