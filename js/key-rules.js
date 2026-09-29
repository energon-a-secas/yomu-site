// Dictionary keys the lattice refuses to use, whatever they would cost.
//
// The data has keys that are real Japanese but make bad tokens for a
// learner: a particle pair (には), an expression spelled wholly from
// particles and the copula (ですか, んです), a polite ending with a particle
// (ませんか), a phrase with a particle inside it (雨が降る), and a verb with
// と after it (になると). Each hides a piece the notes are meant to explain,
// and each has a path through the lattice made of the pieces, so refusing
// the key never leaves a run with no reading. Split out of lattice.js to
// keep it under 500 lines; every rule here was forced by a sentence, named
// beside it.

import { hasKanji } from './kana.js';
import { PARTICLE, PARTICLE_PAIRS, COPULA, classOf } from './costs.js';

/**
 * Whether the record `rec` under `key`, covering the surface `s`, may not be
 * a candidate.
 *
 * @param {string} s        the surface the node would cover
 * @param {string} key      the dictionary key (the base, for a conjugation)
 * @param {object} rec      the record
 * @param {string} cls      classOf(rec.p)
 * @param {boolean} atStart the node opens a run that follows nothing, where
 *                          a conjunction stands: でも、 だから、 すると、
 * @param {{ get(k: string): any }} dict
 */
export function refused(s, key, rec, cls, atStart, dict) {
  // The closed lists own these spellings; the dictionary's record for them
  // is still used, for its gloss, when the token is built. A particle pair
  // as a key would swallow the は that the said line and the notes need to
  // see, so a pair is two tokens, except at the start of a run, where only
  // the key can stand (でも、 opening a sentence is "but").
  if (cls === 'prt' && PARTICLE.has(s)) return true;
  if (cls === 'prt' && PARTICLE_PAIRS.has(s) && !atStart) return true;
  if (COPULA[s] && !['noun', 'verb', 'adj'].includes(cls)) return true;
  // ですか, んです and だから are keys too, spelled wholly from the closed
  // classes. Those already make です|か and ん|です, and as one token the
  // particle or the copula vanished from the notes whenever the key was
  // cheaper than the split (何分ぐらいですか, 登るんです). At the start of a
  // run the key stands, as a particle pair does: だから、 is "so".
  if (closedTiling(s) && !atStart) return true;
  // ませんか and ましょうか are keys (exp), and 行き and 持ち are nouns, so
  // 行き|ませんか beat 行きません|か and the invitation and offer notes never
  // fired. A polite ending belongs to the verb's chain; the particle after
  // it stands alone.
  if (ENDING_THEN_PARTICLE.test(s)) return true;
  // なくてはいけない, なければならない and ないといけない are expressions in
  // the data, and each opens on a verb's negative ending. As a key it could
  // start partway through the verb: 行かなくてはいけない read 行|か|
  // なくてはいけない, "gyoo ka nakutehaikenai", with a lone 行 and a question
  // か. The verb keeps its ending; the は, と and いけない stand on their own.
  if (NEGATIVE_HEAD.test(key) && String(rec.p).split(' ').includes('exp') && !atStart) return true;
  if (isPhrase(key, rec, dict)) return true;
  return verbThenTo(key, dict) && !atStart;
}

const ENDING_THEN_PARTICLE = /^ま(す|した|せん|せんでした|しょう)(か|ね|よ)$/;
const NEGATIVE_HEAD = /^な(くて|けれ|いと|くちゃ|きゃ)/;

/** Whether `s` is two or more particles and copula forms, one a copula. */
function closedTiling(s, sawCopula = false, pieces = 0) {
  if (!s) return sawCopula && pieces >= 2;
  for (let k = 1; k <= s.length; k++) {
    const head = s.slice(0, k);
    const cop = !!COPULA[head];
    if ((cop || PARTICLE.has(head)) && closedTiling(s.slice(k), sawCopula || cop, pieces + 1)) return true;
  }
  return false;
}

const INNER_PARTICLES = new Set(['が', 'を', 'に', 'は', 'で', 'と', 'も', 'へ']);

/**
 * A phrase key: an expression that is two dictionary words joined by a
 * particle (雨が降る, 気をつける, ことができる). As one token it hides the
 * particle a learner is meant to see, so it is read as its pieces, and the
 * pieces always exist because both sides were checked here. A side must be
 * a key of its own and either hold a kanji or be two kana long, which keeps
 * ちがう (ち|が|う) and ありがとうございます (とうございます is no key) whole.
 * Added after the real data arrived: 雨が降ったら read as one token.
 */
function isPhrase(key, rec, dict) {
  if (!dict || !String(rec.p).split(' ').includes('exp') || key.length < 3) return false;
  for (let k = 1; k < key.length - 1; k++) {
    if (!INNER_PARTICLES.has(key[k])) continue;
    const left = key.slice(0, k);
    const right = key.slice(k + 1);
    const solid = (x) => hasKanji(x) || x.length >= 2;
    if (solid(left) && solid(right) && dict.get(left) && dict.get(right)) return true;
  }
  return false;
}

/**
 * A key that is a verb in its dictionary form and the particle と, perhaps
 * after a particle: になると, となると, すると, and なると, which is also a
 * fish cake. Whole, it hides the と that says "whenever": 春になると read
 * "when it comes to", then 春|に|なると "spring, naruto". Refused except at
 * the start of a run, where すると、 is "then".
 */
function verbThenTo(key, dict) {
  if (!dict || key.length < 3 || !key.endsWith('と')) return false;
  const verbAt = (x) => (dict.get(x) || []).some((r) => classOf(r.p) === 'verb');
  const mid = key.slice(0, -1);
  return verbAt(mid) || (PARTICLE.has(mid[0]) && verbAt(mid.slice(1)));
}
