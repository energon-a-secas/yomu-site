/**
 * The record a key ships: the lean projection of a JMdict entry a reader
 * needs beside a word, and the order records of one key are filed in.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * Split out of tools/build-dict.mjs when the second tier arrived, because
 * both tiers build their records the same way: a rare word in data/dict/rNNN
 * is shaped exactly like a common one in data/dict/wNN, so the page reads
 * either with one set of rules (docs/ANALYZER.md, "Data formats").
 */
import { serialize, MAX_BYTES } from './emit.mjs';
import { unshippable, EM_DASH } from './licence.mjs';
import { splitReading, needsSplit } from './split.mjs';

const MAX_SENSES = 3;
const MAX_GLOSS = 60;
const MAX_KANJI = 2;

// Readings that are not shipped in `r`: search-only (sk), irregular (ik) and
// outdated (ok) kana. こんにちわ is in JMdict as an irregular reading of 今日は
// so that a search for it finds something; it is not a reading to teach.
const SKIP_KANA = new Set(['sk', 'ik', 'ok']);
// The same three, for the kanji spellings a kana key lists in `k`.
const SKIP_KANJI = new Set(['sK', 'iK', 'oK']);

export function applies(list, key) {
  return list.includes('*') || list.includes(key);
}

/** The senses that apply to this spelling; all of them if the tags say none. */
export function sensesFor(entry, key, kind) {
  const field = kind === 'kanji' ? 'appliesToKanji' : 'appliesToKana';
  const ok = entry.sense.filter((s) => applies(s[field], key));
  return ok.length ? ok : entry.sense;
}

/**
 * At most 60 characters. Cut at a word, and drop a parenthesis the cut left
 * open, because "to be surprised (by something unexpected, et…" reads as a
 * broken page where "to be surprised…" reads as a short gloss.
 */
function trimGloss(text) {
  const s = text.trim();
  if (s.length <= MAX_GLOSS) return s;
  let cut = s.slice(0, MAX_GLOSS - 1);
  const space = cut.lastIndexOf(' ');
  if (space >= MAX_GLOSS / 2) cut = cut.slice(0, space);
  const open = cut.lastIndexOf('(');
  if (open >= 10 && cut.indexOf(')', open) < 0) cut = cut.slice(0, open);
  return `${cut.replace(/[\s,;:(]+$/, '')}…`;
}

/** What the builders print: a count per decision, summed over both tiers. */
export const stats = {
  skippedGloss: 0, emptyG: 0, capped: 0, split: 0, partial: 0, star: 0, x: 0, w: 0, ls: 0, ws: 0,
};

/**
 * The first gloss of each of the first three senses.
 *
 * Two house rules reach a gloss, and they are not equal. An em dash can never
 * ship (tools/check-data.mjs fails the file), so a gloss carrying one is passed
 * over. The five banned words are a rule about our own copy, and a gloss is
 * the EDRDG's translation, not our copy: a sense that offers another gloss
 * shows that one instead (強力 shows its second gloss, "strong"), but a sense
 * whose only gloss is the word keeps it, because パワフル with no meaning at all
 * would be a dictionary lying to keep a style rule.
 */
function glossesOf(senses) {
  const out = [];
  for (const sense of senses.slice(0, MAX_SENSES)) {
    const glosses = sense.gloss.filter((g) => g.lang === 'eng').map((g) => g.text)
      .filter((g) => !g.includes(EM_DASH));
    const pick = glosses.find((g) => !unshippable(g)) || glosses[0];
    if (pick !== sense.gloss[0]?.text) stats.skippedGloss += 1;
    if (pick) out.push(trimGloss(pick));
  }
  return out;
}

/** Every part-of-speech code the entry uses, in first-seen order. */
function posOf(entry) {
  const seen = [];
  for (const s of entry.sense) for (const p of s.partOfSpeech) if (!seen.includes(p)) seen.push(p);
  return seen.join(' ');
}

export const commonFirst = (list) => [...list.filter((f) => f.common), ...list.filter((f) => !f.common)];

/**
 * `ls` and `ws`, from the record's first sense: where a borrowed word came
 * from, as JMdict says, and whether it was made in Japan from foreign parts.
 * `ls` is [language, the source word or null]: アルバイト is ['ger', 'Arbeit'],
 * and an English loan JMdict gives no source word for is ['eng', null]. A
 * word built from two sources keeps the first JMdict lists. `ws` is 1 for
 * wasei, a word made in Japan from foreign parts: ナイター, a game under
 * lights, is English in its parts ("nighter") and Japanese as a word.
 * JMdict marks a source on 6,219 of its 218,672 entries, so most katakana
 * words carry neither: a missing `ls` means JMdict did not say, never that
 * the word is native.
 * The loanword notes read them; nothing in the lattice does.
 */
function sourceOf(sense) {
  const src = (sense && sense.languageSource) || [];
  if (!src.length) return null;
  const out = { ls: [String(src[0].lang), src[0].text ? String(src[0].text) : null] };
  if (src.some((l) => l.wasei)) out.ws = 1;
  return out;
}

/**
 * `k` for a kana key of an entry: up to MAX_KANJI of the kanji spellings
 * that reading applies to, common ones first, none JMdict tags search-only,
 * irregular or outdated. tools/lib/rare.mjs reads it without a record.
 */
export function spellingsOf(key, entry) {
  const form = entry.kana.find((k) => k.text === key);
  if (!form) return [];
  const spellings = entry.kanji
    .filter((k) => applies(form.appliesToKanji, k.text))
    .filter((k) => !k.tags.some((t) => SKIP_KANJI.has(t)));
  return commonFirst(spellings).slice(0, MAX_KANJI).map((s) => s.text);
}

/**
 * The record for one spelling of one entry. `table` is the reading table
 * tools/lib/split.mjs cuts `f` with.
 */
export function recordFor(key, { entry, kind }, table) {
  const senses = sensesFor(entry, key, kind);
  const rec = {};
  if (kind === 'kanji') {
    const all = entry.kana.filter((k) => applies(k.appliesToKanji, key));
    const shown = all.filter((k) => !k.tags.some((t) => SKIP_KANA.has(t)));
    const r = commonFirst(shown.length ? shown : all).map((k) => k.text);
    if (r.length) rec.r = r;
  }
  rec.g = glossesOf(senses);
  rec.p = posOf(entry);
  if (kind === 'kanji' && rec.r && needsSplit(key)) rec.f = splitReading(key, rec.r[0], table);
  if (kind === 'kana') {
    const k = spellingsOf(key, entry);
    if (k.length) rec.k = k;
  }
  if (senses[0].misc.includes('uk')) rec.u = 1;
  const src = sourceOf(senses[0]);
  if (src) {
    Object.assign(rec, src);
    stats.ls += 1;
    if (src.ws) stats.ws += 1;
  }
  return rec;
}

/**
 * The JMdict order of the records under one key: spellings that are common
 * in their entry first, then, for a kana key, an entry that is itself
 * written in kana (no kanji, the reading marked nokanji, or the first sense
 * usually kana) before one whose kanji spelling is the normal one, then
 * JMdict order. Without the kana rule は led with "tooth" and いる with "to
 * shoot", because 歯 and 射る have lower sequence numbers than the particle
 * and 居る. This is the order before evidence; `byEvidence` reorders a kana
 * key's records by the corpus.
 */
export function rank(f, key) {
  const common = f.common ? 0 : 1;
  if (f.kind === 'kanji') return [common, 0, f.index];
  const form = f.entry.kana.find((k) => k.text === key);
  const kanaWord = !f.entry.kanji.length || !form.appliesToKanji.length
    || sensesFor(f.entry, key, 'kana')[0].misc.includes('uk');
  return [common, kanaWord ? 0 : 1, f.index];
}

export function byRank(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * Cut the sorted keys into shards of at most MAX_BYTES each. The estimate is
 * the serializer's own line for each key, so it is exact up to the header's
 * first and last fields; a shard that still comes out over is shortened one
 * key at a time until it fits, and the key moves to the next shard.
 *
 * `format` is the shard format, `yomu-dict/1` for the first tier and
 * `yomu-dict-rare/1` for the second.
 */
export function pack(sorted, entries, licence, format = 'yomu-dict/1') {
  const header = Buffer.byteLength(serialize({
    _licence: licence, format, first: '', last: '', entries: {},
  }));
  const lineBytes = (k) => Buffer.byteLength(`${JSON.stringify(k)}: ${JSON.stringify(entries.get(k))},\n`);
  const shards = [];
  let cur = [];
  let size = header;
  for (const k of sorted) {
    const n = lineBytes(k);
    const room = MAX_BYTES - Buffer.byteLength(JSON.stringify(cur[0] || k)) - Buffer.byteLength(JSON.stringify(k));
    if (cur.length && size + n > room) {
      shards.push(cur);
      cur = [];
      size = header;
    }
    cur.push(k);
    size += n;
  }
  if (cur.length) shards.push(cur);

  const docs = [];
  for (let i = 0; i < shards.length; i += 1) {
    const keys = shards[i];
    const make = () => ({
      _licence: licence,
      format,
      first: keys[0],
      last: keys[keys.length - 1],
      entries: Object.fromEntries(keys.map((k) => [k, entries.get(k)])),
    });
    let doc = make();
    while (Buffer.byteLength(serialize(doc)) > MAX_BYTES) {
      const moved = keys.pop();
      if (i + 1 === shards.length) shards.push([]);
      shards[i + 1].unshift(moved);
      doc = make();
    }
    docs.push(doc);
  }
  return docs;
}
