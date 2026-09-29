// Furigana: which part of a reading sits over which part of the surface.
//
// The same alignment gives the morpheme cuts kana.said needs, which is why
// both come out of one function. A long vowel is merged only inside one
// morpheme (docs/ANALYZER.md, "Romaji"), and the places one morpheme ends are
// exactly the places this file can see: where a kanji meets its okurigana,
// where one kanji's reading meets the next one's (from the dictionary's `f`),
// where the deinflection chain joined an ending on, and before the final う
// of a dictionary-form v5u verb. So 思う is おも|う (omou), 子馬 is こ|うま
// (kouma), and 追う is お|う (ou), while とうきょう, with no cut, is tookyoo.

import { isKana, toHira } from './kana.js';

/** Surface split into kana runs and everything else (kanji, digits). */
function segmentsOf(surface) {
  const out = [];
  let at = 0;
  for (const ch of surface) {
    const kana = isKana(ch);
    const last = out[out.length - 1];
    if (last && last.kana === kana) last.text += ch;
    else out.push({ text: ch, kana, start: at });
    at += ch.length;
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The `f` part for each non-kana segment, or null. `f` lists the per-kanji
 * split with `;` between kanji runs. It is read by position when it names
 * every run, and by position among the multi-kanji runs when it names only
 * those; any other count is not trusted.
 */
function fParts(f, others) {
  if (!f) return others.map(() => null);
  const parts = String(f).split(';');
  if (parts.length === others.length) return parts;
  const multi = others.filter((o) => [...o.text].length > 1);
  if (parts.length === multi.length) {
    let k = 0;
    return others.map((o) => ([...o.text].length > 1 ? parts[k++] : null));
  }
  return others.map(() => null);
}

/**
 * Align a reading to its surface.
 *
 * @param {string} surface   the characters as written
 * @param {string} reading   the hiragana reading of exactly those characters
 * @param {string} [f]       the dictionary's per-kanji split (docs/ANALYZER.md)
 * @param {object} [opts]
 * @param {number[]} [opts.cuts]  morpheme joins the deinflection chain proved,
 *                                as offsets into `surface`
 * @param {boolean} [opts.v5u]    a dictionary-form v5u verb: cut before its う
 * @returns {{ furigana: { text: string, ruby?: string, whole?: true }[], cuts: number[] }}
 *   `cuts` are offsets into `reading`, sorted, each strictly inside it.
 *   `whole` marks a ruby the dictionary says is read as a whole (`f` is `*`).
 */
export function align(surface, reading, f, opts = {}) {
  const s = String(surface || '');
  const r = String(reading || '');
  const cuts = new Set();
  const segs = segmentsOf(s);
  const others = segs.filter((g) => !g.kana);

  if (!others.length) {
    for (const c of opts.cuts || []) cuts.add(c);
    if (opts.v5u) cuts.add(r.length - 1);
    return { furigana: s ? [{ text: s }] : [], cuts: finish(cuts, r) };
  }

  // Kana segments are literal; each other segment takes the shortest reading
  // that still lets the rest match. Anchored, so 食べ物 is た|べ|もの.
  const re = new RegExp(`^${segs.map((g) => (g.kana ? escapeRe(toHira(g.text)) : '(.+?)')).join('')}$`);
  const m = re.exec(r);
  if (!m) {
    // The reading does not follow the surface's kana (a jukujikun spelled
    // with kana inside it, or a data mismatch). One ruby over the whole, and
    // the chain's cuts are mapped from the end, where the okurigana is.
    const tail = segs[segs.length - 1].kana ? segs[segs.length - 1] : null;
    for (const c of opts.cuts || []) {
      if (tail && c >= tail.start) cuts.add(r.length - (s.length - c));
    }
    if (opts.v5u) cuts.add(r.length - 1);
    return { furigana: [{ text: s, ruby: r }], cuts: finish(cuts, r) };
  }

  const splits = fParts(f, others);
  const furigana = [];
  let at = 0;
  let group = 1;
  let k = 0;
  for (const g of segs) {
    g.rstart = at;
    if (g.kana) {
      furigana.push({ text: g.text });
      at += g.text.length;
    } else {
      const ruby = m[group++];
      const split = splits[k++];
      const chars = [...g.text];
      const pieces = split && split !== '*' ? split.split('|') : null;
      if (pieces && pieces.length === chars.length && pieces.every(Boolean) && pieces.join('') === ruby) {
        let inner = at;
        chars.forEach((ch, n) => {
          furigana.push({ text: ch, ruby: pieces[n] });
          if (n) cuts.add(inner);
          inner += pieces[n].length;
        });
      } else if (split === '*' && chars.length > 1) {
        // The data says no split exists (今日 きょう, 大人 おとな): the ruby
        // belongs to the run, and says so, so nothing downstream tries to
        // share it out between the characters.
        furigana.push({ text: g.text, ruby, whole: true });
      } else {
        furigana.push({ text: g.text, ruby });
      }
      at += ruby.length;
    }
    if (g.rstart > 0) cuts.add(g.rstart);
  }

  // Chain joins sit in kana, where a surface offset maps one to one.
  for (const c of opts.cuts || []) {
    const g = segs.find((x) => x.kana && c >= x.start && c <= x.start + x.text.length);
    if (g) cuts.add(g.rstart + (c - g.start));
  }
  if (opts.v5u) cuts.add(r.length - 1);
  return { furigana, cuts: finish(cuts, r) };
}

function finish(cuts, reading) {
  return [...cuts].filter((c) => c > 0 && c < reading.length).sort((a, b) => a - b);
}

/**
 * Split one kanji run's reading between its characters using kanji data, for
 * the kanji list when the dictionary gave no `f`. Tries each character's on
 * and kun readings, with the two sound changes a compound makes (a voiced
 * first kana, a final kana doubled into っ). Returns null unless exactly the
 * whole reading is used.
 *
 * @param {string} run      kanji characters
 * @param {string} reading  hiragana
 * @param {Map<string, object>} kanjiInfo  char -> { on, kun }
 */
export function splitByKanji(run, reading, kanjiInfo) {
  const chars = [...run];
  if (chars.length === 1) return [reading];
  const options = chars.map((ch, n) => {
    if (ch === '々' && n > 0) return null; // resolved against the previous piece below
    return readingsOf(kanjiInfo && kanjiInfo.get(ch));
  });
  const out = [];
  function walk(n, at) {
    if (n === chars.length) return at === reading.length;
    let list = options[n];
    if (list === null) list = out[n - 1] ? variants([out[n - 1]]) : [];
    for (const cand of list) {
      if (!cand || !reading.startsWith(cand, at)) continue;
      out[n] = cand;
      if (walk(n + 1, at + cand.length)) return true;
    }
    return false;
  }
  return walk(0, 0) ? out.slice() : null;
}

const VOICE = Object.freeze({
  'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご', 'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
  'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど', 'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ',
});
const HALF = Object.freeze({ 'は': 'ぱ', 'ひ': 'ぴ', 'ふ': 'ぷ', 'へ': 'ぺ', 'ほ': 'ぽ' });

/** Plain readings of a kanji, as hiragana, without okurigana or affix marks. */
export function readingsOf(info) {
  if (!info) return [];
  const on = (info.on || []).map((x) => toHira(String(x)).replace(/[-.]/g, ''));
  const kun = (info.kun || []).map((x) => toHira(String(x)).replace(/-/g, '').split('.')[0]);
  return variants([...new Set([...on, ...kun].filter(Boolean))]);
}

function variants(list) {
  const out = new Set();
  for (const r of list) {
    out.add(r);
    const first = r[0];
    if (VOICE[first]) out.add(VOICE[first] + r.slice(1));
    if (HALF[first]) out.add(HALF[first] + r.slice(1));
    if (r.length > 1 && 'つくちき'.includes(r[r.length - 1])) out.add(`${r.slice(0, -1)}っ`);
  }
  // Longest first, so 学校 tries がっ before が.
  return [...out].sort((a, b) => b.length - a.length);
}
