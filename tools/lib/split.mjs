/**
 * The `f` field: which part of a reading belongs to which kanji.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * The page puts furigana over each kanji rather than over a whole word when it
 * can, because 勉強 read べん|きょう teaches two characters and べんきょう over
 * both teaches none. Okurigana the page can align by itself (the kana in the
 * key match the kana in the reading); what it cannot do is cut a run of two or
 * more kanji, so that cut is made here, once, against KANJIDIC, and shipped.
 *
 * A reading is split only when every kanji in the run matches one of its own
 * KANJIDIC readings, allowing the sound changes that happen at a join:
 *
 *   on readings        folded to hiragana (ガク becomes がく)
 *   kun readings       the stem before the dot (まな.ぶ gives まな), hyphens dropped
 *   rendaku            a later kanji's first kana voiced (ひと|びと, さん|ぼん)
 *   handakuten         a later kanji's は row made p (いっ|ぱい)
 *   gemination         a final つ く ち き り becoming っ (がっ|こう, にっ|き)
 *   々                  the previous kanji again, voiced or not (とき|どき)
 *   ヶ                  か, が, こ or け
 *   nanori             name readings, and only when nothing else splits (に|ほん)
 *   absorbed okurigana a kun verb's stem with its okurigana folded in, the way
 *                      compounds drop the kana: う.ける gives うけ in 受付, あつか.う
 *                      gives あつかい in 取扱. Counted as a sound change, so the
 *                      plain stem always wins when both fit.
 *
 * When no split exists the run is `*`, read as a whole: 今日, 大人, 田舎.
 * A wrong split is worse than none (it teaches a reading the character does
 * not have), so the search prefers a `*` over any guess, and among splits it
 * prefers the one that needs fewest nanori and fewest sound changes.
 */
import { isKana, isKanji, toHira } from '../../js/kana.js';

const VOICE = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
  さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢじ', つ: 'づず', て: 'で', と: 'ど',
  は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};
const HALF = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };
const GEMINATES = new Set([...'つくちきり']);
const KE = ['か', 'が', 'こ', 'け'];

// The i-row kana of a godan ending: the form a verb takes inside a compound
// noun (取る gives 取り, 扱う gives 扱い).
const I_ROW = {
  う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り',
};

/**
 * What a kun reading's okurigana can fold into when the compound writes no
 * kana for it. A final る may be ichidan (drop it: う.ける gives うけ) or godan
 * (make it i-row: と.る gives とり); the reading being matched decides which.
 */
function absorbed(stem, oku) {
  const out = [];
  const last = oku[oku.length - 1];
  if (last === 'る') out.push(stem + oku.slice(0, -1));
  if (I_ROW[last]) out.push(stem + oku.slice(0, -1) + I_ROW[last]);
  return out;
}

/**
 * Base readings per character from KANJIDIC: `{ text, nanori, v }`, `v` being
 * 1 for an absorbed-okurigana form. Built once for every character in the
 * file, not only the joyo, because a common word can be spelled with a
 * character outside it.
 */
export function readingTable(kanjidic) {
  const table = new Map();
  for (const c of kanjidic.characters) {
    const out = [];
    const seen = new Set();
    const add = (text, nanori, v = 0) => {
      if (!text || seen.has(text)) return;
      seen.add(text);
      out.push({ text, nanori, v });
    };
    const later = [];
    for (const group of c.readingMeaning?.groups || []) {
      for (const r of group.readings) {
        if (r.type === 'ja_on') add(toHira(r.value.replace(/-/g, '')), false);
        else if (r.type === 'ja_kun') {
          const [stem, oku] = r.value.replace(/-/g, '').split('.');
          add(stem, false);
          if (oku) later.push(...absorbed(stem, oku));
        }
      }
    }
    // Added after every plain reading, so a text that is both a plain reading
    // and an absorbed form keeps the plain reading's cost.
    for (const t of later) add(t, false, 1);
    for (const n of c.readingMeaning?.nanori || []) add(toHira(n.replace(/-/g, '')), true);
    table.set(c.literal, out);
  }
  return table;
}

/**
 * Every spelling one kanji may take at a given place in a run, with its cost:
 * `n` is 1 for a nanori, `v` counts sound changes. `initial` is true for the
 * first character of the key, where rendaku and handakuten cannot happen.
 */
function spellings(bases, initial) {
  const out = [];
  for (const { text, nanori, v } of bases) {
    const n = nanori ? 1 : 0;
    const heads = [{ t: text, v }];
    if (!initial) {
      const first = text[0];
      for (const ch of VOICE[first] || '') heads.push({ t: ch + text.slice(1), v: v + 1 });
      if (HALF[first]) heads.push({ t: HALF[first] + text.slice(1), v: v + 1 });
    }
    for (const h of heads) {
      out.push({ t: h.t, n, v: h.v });
      if (h.t.length >= 2 && GEMINATES.has(h.t[h.t.length - 1])) {
        out.push({ t: `${h.t.slice(0, -1)}っ`, n, v: h.v + 1 });
      }
    }
  }
  return out;
}

/** Kanji runs, kana runs and anything else, in key order. */
export function segmentsOf(key) {
  const segs = [];
  let pos = 0;
  for (const ch of key) {
    const type = isKanji(ch) ? 'kanji' : (isKana(ch) ? 'kana' : 'other');
    const last = segs[segs.length - 1];
    if (last && last.type === type) {
      last.chars.push(ch);
    } else {
      segs.push({ type, chars: [ch], at: pos });
    }
    pos += 1;
  }
  return segs;
}

/** True when the key has a run of two or more kanji, the only case `f` is for. */
export function needsSplit(key) {
  return segmentsOf(key).some((s) => s.type === 'kanji' && s.chars.length >= 2);
}

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * Split `reading` over `key`. Returns the `f` string, one part per kanji run
 * in key order joined by `;`, each part the per-kanji readings joined by `|`,
 * or `*` for a run of two or more kanji that no split fits. A single-kanji run
 * gets the text alignment gave it, since one character is its own split.
 * Returns null when the key has no run of two or more kanji.
 */
export function splitReading(key, reading, table) {
  if (!needsSplit(key)) return null;
  const segs = segmentsOf(key);
  const r = toHira(reading);
  const L = r.length;
  const memo = new Map();

  // Every way to read one kanji run starting at reading offset `pos`, as
  // [end, pieces, cost]. Runs are short, so the walk is exhaustive.
  function runSplits(seg, pos) {
    const results = [];
    const walk = (i, at, pieces, cost, prev) => {
      if (i === seg.chars.length) { results.push([at, pieces, cost]); return; }
      const ch = seg.chars[i];
      let bases;
      if (ch === '々') bases = prev ? table.get(prev) || [] : [];
      else if (ch === 'ヶ') bases = KE.map((t) => ({ text: t, nanori: false, v: 0 }));
      else bases = table.get(ch) || [];
      // No rendaku on the first character of the key, and none for ヶ, whose
      // four spellings already include the voiced one.
      const initial = seg.at + i === 0 || ch === 'ヶ';
      for (const s of spellings(bases, initial)) {
        if (r.startsWith(s.t, at)) {
          walk(i + 1, at + s.t.length, [...pieces, s.t], add(cost, [0, s.n, s.v]),
            ch === '々' ? prev : ch);
        }
      }
    };
    walk(0, pos, [], [0, 0, 0], null);
    return results;
  }

  // Best reading of segments si.. from reading offset pos: { cost, parts } or null.
  function solve(si, pos) {
    const id = si * (L + 1) + pos;
    if (memo.has(id)) return memo.get(id);
    let best = null;
    const offer = (cost, parts) => {
      if (!best || cmp(cost, best.cost) < 0) best = { cost, parts };
    };
    if (si === segs.length) {
      best = pos === L ? { cost: [0, 0, 0], parts: [] } : null;
    } else {
      const seg = segs[si];
      if (seg.type === 'kana') {
        const text = toHira(seg.chars.join(''));
        if (r.startsWith(text, pos)) {
          const rest = solve(si + 1, pos + text.length);
          if (rest) offer(rest.cost, rest.parts);
        }
      } else if (seg.type === 'other') {
        for (let e = pos + 1; e <= L; e += 1) {
          const rest = solve(si + 1, e);
          if (rest) offer(rest.cost, rest.parts);
        }
      } else {
        for (const [end, pieces, cost] of runSplits(seg, pos)) {
          const rest = solve(si + 1, end);
          if (rest) offer(add(cost, rest.cost), [pieces.join('|'), ...rest.parts]);
        }
        // The run read as a whole. Costs one `*`, so any real split wins.
        for (let e = pos + 1; e <= L; e += 1) {
          const rest = solve(si + 1, e);
          if (!rest) continue;
          const part = seg.chars.length === 1 ? r.slice(pos, e) : '*';
          offer(add([1, 0, 0], rest.cost), [part, ...rest.parts]);
        }
      }
    }
    memo.set(id, best);
    return best;
  }

  const best = solve(0, 0);
  const runs = segs.filter((s) => s.type === 'kanji').length;
  if (!best) return Array(runs).fill('*').join(';');
  return best.parts.join(';');
}
