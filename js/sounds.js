// Special sounds, found per token, with spans into the token's reading.
//
// A special sound is a property of what is said, so every span indexes
// `token.reading` (hiragana), never the surface (docs/ANALYZER.md, "The
// token"). This module decides where a sound is; notes.js decides what the
// learner is told about it. Nothing here is prose.
//
// Conservative on purpose, like kana.devoiced: a sound this module misses
// costs a note, a sound it invents teaches something false. Where the token
// does not carry enough to be sure (a whole-run ruby with no `f` field, a ん
// at the end of a token), it says nothing.

import { beats, vowelOf, beatRomaji, toHira, isKatakana, isHiragana, isKanji, devoiced, devoicedNotation } from './kana.js';

/** Every type detectSounds can emit, in the order a lesson would meet them. */
export const SOUND_TYPES = Object.freeze([
  'particle-wa', 'particle-e', 'particle-o', 'fossil-wa',
  'long-vowel', 'small-tsu', 'youon', 'dakuten', 'handakuten',
  'n-assimilation', 'devoiced', 'ji-zu', 'foreign-sound', 'bar',
  'repeat-mark', 'special-reading', 'counter-change',
]);

// Kinds that never carry a sound: nothing in them is read as Japanese.
const SILENT_KINDS = new Set(['punct', 'space', 'latin', 'newline']);

// Greetings whose final は is the old topic particle. Everything else of this
// shape is marked in the dictionary with `w` rather than listed here.
const FOSSIL_WA = new Set(['こんにちは', 'こんばんは']);

const VOWEL_KANA = Object.freeze({ 'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o' });
const I_ROW = new Set([...'きしちにひみりぎじぢびぴ']);
const YOUON_SMALL = new Set([...'ゃゅょ']);
const SMALL_VOWEL = new Set([...'ぁぃぅぇぉ']);
const VOICED = new Set([...'がぎぐげござじずぜぞだぢづでどばびぶべぼゔ']);
const SEMI_VOICED = new Set([...'ぱぴぷぺぽ']);
const PARTICLE_SAID = Object.freeze({ 'は': 'わ', 'へ': 'え', 'を': 'お' });

/**
 * The sounds in one token.
 *
 * @param {object} token   a token in the shape docs/ANALYZER.md gives
 * @param {object} opts
 * @param {boolean} opts.final   the token ends an utterance: a final す is
 *                               whispered
 * @param {number[]} [opts.cuts] the morpheme cuts, as reading offsets, that
 *                               analyze.js gave kana.said (furigana.align's
 *                               `cuts`); passing them keeps the long vowels
 *                               found here and the said line in step
 * @param {boolean} [opts.finalWa] the lattice's verdict that the last は is
 *                               the old particle (its aid.finalWa)
 * @returns {{ type: string, at: [number, number], detail: string|null }[]}
 *          sorted by position; long-vowel entries also carry `mark`, the
 *          kana that spells the second beat (う い あ え お, or ー), and the
 *          dakuten, handakuten and devoiced entries, one per token, carry
 *          `spans`, every [start, end) they cover (`at` is the first)
 */
export function detectSounds(token, { final = false, cuts = null, finalWa = false, waAt = [] } = {}) {
  if (!token || SILENT_KINDS.has(token.kind)) return [];
  const reading = String(token.reading || '');
  if (!reading) return [];
  const ctx = context(token, reading, cuts);
  const wa = isFossilWa(token, reading, finalWa);
  // A は inside an expression that the lattice read as the particle
  // (ではまた, ということは) is the same old particle as the final one.
  const inner = token.kind === 'particle' || token.kind === 'copula' ? [] : waAt.filter((k) => reading[k] === 'は'
    && !(wa && k === reading.length - 1));
  ctx.waAt = inner;
  const out = [
    ...particleSounds(token, reading),
    ...(wa ? [{ type: 'fossil-wa', at: [reading.length - 1, reading.length], detail: 'wa' }] : []),
    ...inner.map((k) => ({ type: 'fossil-wa', at: [k, k + 1], detail: 'wa' })),
    ...longVowels(ctx),
    ...smallTsu(ctx),
    ...kanaMarks(ctx),
    ...nAssimilation(ctx),
    ...whispered(token, ctx, final, wa),
    ...foreignSounds(ctx),
    ...bars(ctx),
    ...repeatMarks(token, ctx),
    ...specialReadings(token, ctx),
    ...counterChange(token, reading),
  ];
  return out.sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
}

// ── What the token tells us about its reading ────────────────────────────

/**
 * Beats with their offsets, the script each reading offset came from, the
 * furigana runs mapped onto the reading, and the morpheme cuts.
 *
 * The script matters because the reading is always hiragana: a katakana オウ
 * arrives as おう, and kana.js keeps its u where a hiragana おう is a long o.
 */
function context(token, reading, given) {
  const bs = beats(reading);
  const offs = [];
  let at = 0;
  for (const b of bs) { offs.push(at); at += b.length; }
  const runs = furiganaRuns(token, reading);
  const script = new Array(reading.length).fill('hira');
  if (runs) {
    for (const r of runs) {
      if (r.ruby) { for (let k = r.from; k < r.to; k++) script[k] = 'kanji'; continue; }
      let k = r.from;
      for (const ch of r.text) { script[k] = isKatakana(ch) ? 'kata' : isHiragana(ch) ? 'hira' : 'other'; k += ch.length; }
    }
  } else if (toHira(token.surface || '') === reading) {
    let k = 0;
    for (const ch of String(token.surface)) { script[k] = isKatakana(ch) ? 'kata' : 'hira'; k += ch.length; }
  }
  const cuts = morphemeCuts(token, reading, runs);
  // The analyzer's cuts are the ones the said line used. They are added to,
  // not swapped for, the ones found here: an extra cut can only hide a long
  // vowel, never invent one.
  if (Array.isArray(given)) for (const c of given) if (c > 0 && c < reading.length) cuts.add(c);
  return { reading, bs, offs, runs, script, cuts };
}

/**
 * The furigana entries laid over the reading, each with its offsets in the
 * reading and in the surface. Null when the entries do not add up to the
 * reading, because a span computed from a misaligned ruby would point at the
 * wrong kana.
 */
function furiganaRuns(token, reading) {
  const fg = Array.isArray(token.furigana) ? token.furigana : null;
  if (!fg || !fg.length) return null;
  const runs = [];
  let at = 0;
  let sAt = 0;
  for (const f of fg) {
    const text = String((f && f.text) || '');
    const read = f && f.ruby ? String(f.ruby) : toHira(text);
    runs.push({ text, ruby: f && f.ruby ? read : null, whole: !!(f && f.whole), from: at, to: at + read.length, sFrom: sAt });
    at += read.length;
    sAt += text.length;
  }
  return at === reading.length ? runs : null;
}

const VERB_U = /^v5u(-s)?$/;

/**
 * Reading offsets where one morpheme ends and the next begins, so a vowel pair
 * across them is not a long vowel. The same places kana.said is told about:
 * between furigana runs (思う is おも|う), before the final う of a godan-u verb
 * in its dictionary form (追う in kana), between て and いる inside an inflected
 * verb (食べて|いる), and after じゃ or では in a copula (じゃ|ありません).
 */
function morphemeCuts(token, reading, runs) {
  const cuts = new Set();
  if (runs) for (const r of runs.slice(1)) cuts.add(r.from);
  const chain = Array.isArray(token.chain) ? token.chain : [];
  const pos = String((token.entry && token.entry.p) || '').split(/\s+/);
  if (!chain.length && pos.some((p) => VERB_U.test(p)) && reading.endsWith('う')) cuts.add(reading.length - 1);
  if (chain.length) {
    for (let k = 1; k < reading.length; k++) {
      if (reading[k] === 'い' && (reading[k - 1] === 'て' || reading[k - 1] === 'で')) cuts.add(k);
    }
  }
  if (token.kind === 'copula') {
    if (reading.startsWith('じゃ') || reading.startsWith('では')) cuts.add(2);
  }
  return cuts;
}

// ── Particles and the old は ─────────────────────────────────────────────

function particleSounds(token, reading) {
  const out = [];
  const role = token.kind === 'particle' || token.kind === 'copula';
  for (let k = 0; k < reading.length; k++) {
    const ch = reading[k];
    if (ch === 'は' && role) out.push({ type: 'particle-wa', at: [k, k + 1], detail: 'wa' });
    else if (ch === 'へ' && token.kind === 'particle') out.push({ type: 'particle-e', at: [k, k + 1], detail: 'e' });
    // を survives in modern writing only as the object particle, so wherever
    // the lattice put it, it is said o.
    else if (ch === 'を') out.push({ type: 'particle-o', at: [k, k + 1], detail: 'o' });
  }
  return out;
}

/**
 * The last は of a word is the old topic particle: こんにちは, a record the
 * dictionary marks `w`, a record marked `x` that is a word plus a particle
 * (今日は, 実は), or the lattice saying so. A particle or copula token's は is
 * particle-wa instead.
 */
function isFossilWa(token, reading, finalWa) {
  if (token.kind === 'particle' || token.kind === 'copula') return false;
  if (!reading.endsWith('は')) return false;
  const e = token.entry || {};
  return !!finalWa || !!e.w || !!e.x || FOSSIL_WA.has(reading) || FOSSIL_WA.has(toHira(token.base || ''));
}

// ── Long vowels ──────────────────────────────────────────────────────────

/**
 * A beat held for two. Hiragana spells the second beat with a vowel kana (い
 * after e and う after o in most words, the same vowel otherwise); katakana
 * uses the bar. おお and ええ are the minority spellings and get their own
 * detail, because the learner has to memorise which words use them.
 */
function longVowelAt(ctx, i) {
  const { bs, offs, script, cuts } = ctx;
  const v = vowelOf(bs[i - 1]);
  const b = bs[i];
  if (!v || cuts.has(offs[i])) return null;
  if (b === 'ー') return { detail: v + v, mark: 'ー' };
  const bv = VOWEL_KANA[b];
  if (!bv) return null;
  if (bv === v) return { detail: v === 'o' ? 'oo-by-o' : v === 'e' ? 'ee-by-e' : v + v, mark: b };
  if (v === 'e' && bv === 'i') return { detail: 'ee', mark: b };
  // kana.js keeps the u of a katakana オウ (ボウル), so only hiragana う
  // lengthens an o here.
  if (v === 'o' && bv === 'u' && script[offs[i]] !== 'kata') return { detail: 'oo', mark: b };
  return null;
}

function longVowels(ctx) {
  const out = [];
  const { bs, offs } = ctx;
  for (let i = 1; i < bs.length; i++) {
    const hit = longVowelAt(ctx, i);
    if (!hit) continue;
    out.push({ type: 'long-vowel', at: [offs[i - 1], offs[i] + bs[i].length], detail: hit.detail, mark: hit.mark });
    i++; // the second half of a long vowel does not start another one
  }
  return out;
}

// ── っ, small ゃゅょ, the two marks, ん ───────────────────────────────────

function smallTsu(ctx) {
  const out = [];
  const { bs, offs } = ctx;
  for (let i = 0; i < bs.length; i++) {
    if (bs[i] !== 'っ') continue;
    const next = bs[i + 1];
    const r = next && next !== 'ん' && next !== 'ー' && next !== 'っ' ? beatRomaji(next, bs[i + 2], bs[i]) : '';
    // Nothing to double inside this token (あっ, or っ before a vowel): the
    // beat is a catch in the throat, which is what 'stop' names.
    const detail = /^[bcdfghjkmprstvwyz]/.test(r) ? (r.startsWith('ch') ? 't' : r[0]) : 'stop';
    out.push({ type: 'small-tsu', at: [offs[i], offs[i] + 1], detail });
  }
  return out;
}

/**
 * Small ゃゅょ after an i-row kana, and the two diacritics.
 *
 * The diacritics are one entry per token, with every kana they sit on in
 * `spans` and the first in `at`: ぎんこうでごはんをたべました has five voiced
 * kana, and five entries made the page list the same two dots five times in
 * one sentence. `detail` is the plain kana under each mark, in order (が, で
 * give かて), so what the dots did can still be shown kana by kana.
 */
function kanaMarks(ctx) {
  const out = [];
  const { bs, offs } = ctx;
  const marks = { dakuten: [], handakuten: [] };
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (b.length === 2 && YOUON_SMALL.has(b[1]) && I_ROW.has(b[0])) {
      out.push({ type: 'youon', at: [offs[i], offs[i] + 2], detail: beatRomaji(b) });
    }
    for (let k = 0; k < b.length; k++) {
      const ch = b[k];
      const at = [offs[i] + k, offs[i] + k + 1];
      if (VOICED.has(ch)) marks.dakuten.push({ at, plain: ch.normalize('NFD')[0] });
      else if (SEMI_VOICED.has(ch)) marks.handakuten.push({ at, plain: ch.normalize('NFD')[0] });
      if (ch === 'ぢ') out.push({ type: 'ji-zu', at, detail: 'ji' });
      else if (ch === 'づ') out.push({ type: 'ji-zu', at, detail: 'zu' });
    }
  }
  for (const [type, list] of Object.entries(marks)) {
    if (!list.length) continue;
    out.push({ type, at: list[0].at, spans: list.map((m) => m.at), detail: list.map((m) => m.plain).join('') });
  }
  return out;
}

/**
 * ん before m, b, p is said m; before k, g it is said ng; before a vowel or y
 * the romaji writes n' so kin'en is not read ki-nen. Only inside the token: a
 * ん at its end meets the next token, which this function cannot see.
 */
function nAssimilation(ctx) {
  const out = [];
  const { bs, offs } = ctx;
  for (let i = 0; i < bs.length - 1; i++) {
    if (bs[i] !== 'ん') continue;
    const next = bs[i + 1];
    if (next === 'ん' || next === 'っ' || next === 'ー') continue;
    const r = beatRomaji(next, bs[i + 2], bs[i]);
    let detail = null;
    if (/^[mbp]/.test(r)) detail = 'm';
    else if (/^[kg]/.test(r)) detail = 'ng';
    else if (/^[aiueoy]/.test(r)) detail = 'apostrophe';
    if (detail) out.push({ type: 'n-assimilation', at: [offs[i], offs[i] + 1], detail });
  }
  return out;
}

// ── Whispered vowels ─────────────────────────────────────────────────────

/**
 * The reading as it is said: a particle は is わ, and so on. The swaps are one
 * kana for one kana, so beat indices and offsets do not move. Without this,
 * こんにちは would whisper the ち before a voiceless h that is never said.
 */
function saidKana(token, reading, wa, waAt) {
  let s = reading;
  if (token.kind === 'particle' || token.kind === 'copula') s = [...s].map((ch) => PARTICLE_SAID[ch] || ch).join('');
  if (waAt.length) s = [...s].map((ch, k) => (waAt.includes(k) ? 'わ' : ch)).join('');
  if (wa) s = s.slice(0, -1) + 'わ';
  return s;
}

function whispered(token, ctx, final, wa) {
  const kana = saidKana(token, ctx.reading, wa, ctx.waAt || []);
  const idx = devoiced(kana, { final });
  if (!idx.length) return [];
  // The notation is written over the said line, so a long vowel spelled with
  // う or い shows as the doubled vowel (gak(u)see), matching the romaji the
  // learner reads beside it. ー is a beat of its own, so the indices hold.
  const merged = [...ctx.bs];
  for (let i = 1; i < ctx.bs.length; i++) {
    const hit = longVowelAt(ctx, i);
    if (hit && (hit.detail === 'oo' || hit.detail === 'ee')) merged[i] = 'ー';
    if (hit) i++;
  }
  const saidBeats = beats(kana);
  const detail = devoicedNotation(merged.map((b, i) => (b === 'ー' ? b : saidBeats[i])).join(''), idx);
  // One entry per token, as for the two marks: しています whispers two
  // vowels, and two entries made the page say the same s(h)(i)teimas(u) twice.
  const spans = idx.map((i) => [ctx.offs[i], ctx.offs[i] + ctx.bs[i].length]);
  return [{ type: 'devoiced', at: spans[0], spans, detail }];
}

// ── Katakana: foreign sounds and the bar ─────────────────────────────────

/**
 * Beats that native words never make: a kana with a small vowel (ティ, ファ,
 * ウィ, シェ), a small ゅ after a non i-row kana (デュ), or any ヴ. Only where
 * the surface is katakana; a playful hiragana ねぇ is not a loanword sound.
 */
function foreignSounds(ctx) {
  const out = [];
  const { bs, offs, script } = ctx;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (script[offs[i]] !== 'kata') continue;
    const digraph = b.length === 2 && (SMALL_VOWEL.has(b[1]) || (YOUON_SMALL.has(b[1]) && !I_ROW.has(b[0])));
    if (digraph || b.includes('ゔ')) out.push({ type: 'foreign-sound', at: [offs[i], offs[i] + b.length], detail: beatRomaji(b) });
  }
  return out;
}

function bars(ctx) {
  const out = [];
  const { bs, offs } = ctx;
  for (let i = 1; i < bs.length; i++) {
    if (bs[i] !== 'ー') continue;
    const v = vowelOf(bs[i - 1]);
    if (v) out.push({ type: 'bar', at: [offs[i], offs[i] + 1], detail: v });
  }
  return out;
}

// ── Kanji: 々, whole-word readings, counters ─────────────────────────────

/** The run of the furigana that covers surface offset `s`. */
function runAt(runs, s) {
  return runs ? runs.find((r) => s >= r.sFrom && s < r.sFrom + r.text.length) : null;
}

/** ときどき: is the second half the first again, perhaps with dakuten? */
function repeatHalf(ruby) {
  if (ruby.length % 2) return -1;
  const h = ruby.length / 2;
  const first = ruby.slice(0, h);
  const second = ruby.slice(h);
  if (second === first) return h;
  if (second.slice(1) === first.slice(1) && second[0].normalize('NFD')[0] === first[0]) return h;
  return -1;
}

function repeatMarks(token, ctx) {
  const out = [];
  const surface = String(token.surface || '');
  for (let s = surface.indexOf('々'); s !== -1; s = surface.indexOf('々', s + 1)) {
    const detail = s > 0 ? surface[s - 1] : null;
    const run = runAt(ctx.runs, s);
    let at = [0, ctx.reading.length];
    if (run && run.ruby && run.text === '々') at = [run.from, run.to];
    else if (run && run.ruby) {
      // A whole-run ruby (人々 over ひとびと): the reading splits only when it
      // visibly repeats; otherwise the span is the run, which is still true.
      const h = run.text.length === 2 && run.text[1] === '々' ? repeatHalf(run.ruby) : -1;
      at = h > 0 ? [run.from + h, run.to] : [run.from, run.to];
    }
    out.push({ type: 'repeat-mark', at, detail });
  }
  return out;
}

/** Maximal runs of the surface that are not kana, in order, with offsets. */
function nonKanaRuns(surface) {
  const out = [];
  let k = 0;
  let cur = null;
  for (const ch of surface) {
    if (!isKatakana(ch) && !isHiragana(ch)) {
      if (!cur) { cur = { start: k, text: '' }; out.push(cur); }
      cur.text += ch;
    } else cur = null;
    k += ch.length;
  }
  return out;
}

/**
 * Which `f` part belongs to each non-kana run, read the way furigana.js reads
 * it (fParts there): by position when `f` names every run, by position among
 * the multi-character runs when it names only those, and not at all otherwise.
 * The two must agree, or a ruby drawn whole would be explained as something
 * else.
 */
function fPartsFor(f, runs) {
  if (typeof f !== 'string' || !f) return runs.map(() => null);
  const parts = f.split(';');
  if (parts.length === runs.length) return parts;
  const multi = runs.filter((r) => [...r.text].length > 1);
  if (parts.length !== multi.length) return runs.map(() => null);
  let k = 0;
  return runs.map((r) => ([...r.text].length > 1 ? parts[k++] : null));
}

/**
 * A multi-kanji run read as a whole (今日 is きょう, 大人 is おとな). The
 * signal is the dictionary's `f` field, where `*` marks such a run. A
 * whole-run ruby alone is not enough: it is also what furigana.js writes when
 * the data has no per-kanji split, and 学生 read as one is not a special
 * reading.
 */
function specialReadings(token, ctx) {
  if (!ctx.runs) return [];
  const others = nonKanaRuns(String(token.surface || ''));
  const parts = fPartsFor(token.entry && token.entry.f, others);
  const out = [];
  for (const run of ctx.runs) {
    if (!run.ruby || [...run.text].filter(isKanji).length < 2) continue;
    // `whole` is set only where the reading is known to belong to the run:
    // the data's `*`, or a number and counter read as one (八日 ようか).
    const idx = others.findIndex((r) => r.start === run.sFrom && r.text === run.text);
    if (run.whole || (idx >= 0 && parts[idx] === '*')) out.push({ type: 'special-reading', at: [run.from, run.to], detail: run.text });
  }
  return out;
}

/**
 * The lattice sets `counterChange` when a number and its counter bent each
 * other's sound (いっぽん, not いちほん; さんぼん, not さんほん), or when a
 * number bent inside itself (六百 ろっぴゃく, 300 さんびゃく). Which kana bent
 * is numbers.js's knowledge, not the token's, so the span is the whole reading.
 */
function counterChange(token, reading) {
  return token.counterChange ? [{ type: 'counter-change', at: [0, reading.length], detail: null }] : [];
}
