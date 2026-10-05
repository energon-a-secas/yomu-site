/**
 * Kanji that look alike, for Play (#/play): data/play/lookalikes.json,
 * format yomu-lookalikes/1.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/build-lookalikes.mjs.
 *
 * One function builds the document, so the builder and tools/check-data.mjs
 * cannot disagree: the checker rebuilds it in memory from the committed kanji
 * shards and fails a file that is not that output, the way it holds the jōyō
 * list.
 *
 *   { _licence, format: 'yomu-lookalikes/1', count,
 *     kanji: { '待': '持侍特時', ... } }
 *
 * A key is a jōyō kanji; its value is at most MAX_LOOKALIKES kanji that look
 * like it, best first. A pair between two jōyō kanji is listed both ways
 * (every pair is chosen whole, greedily, best first, while both ends have
 * room), and a look-alike outside the jōyō list comes only from CLASSIC.
 *
 * What the shards can see is each kanji's stroke count (`s`, KANJIDIC) and
 * its top-level parts (`parts`, KanjiVG), in KanjiVG's order, left to right
 * and top to bottom. Not where a part sits: 唄 and 員 both read [口, 貝]. The
 * rules, best first:
 *
 *   classic  CLASSIC below: pairs whose parts say nothing (土 士 have none).
 *   inside   one kanji is the other plus a stroke: the parts of B are [A],
 *            or A and one of SMALL, and B has one stroke more (日 白, 王 玉).
 *   same     the same parts in the same order, at most one stroke apart, the
 *            parts holding at least SHARE of the strokes (未 末 本).
 *   swap     the same parts but one, where those two look alike by `inside`
 *            (休 体: 木 and 本). Not by CLASSIC: that read 東 相 (日 目) and
 *            加 召 (力 刀), each pair in two layouts; and not a first part
 *            that is LEFT for one and not the other (旺 皇: 日 beside, 白 on
 *            top).
 *   phonetic the same parts but the first, at most one stroke apart, the two
 *            first parts both LEFT or both TOP, so the layout is the same,
 *            and the shared parts holding at least SHARE of the strokes
 *            (待 持, 帳 張, 職 識). Not two ENCLOSURE parts: 囗 and 尸 read
 *            固 居 as a pair.
 *   radical  the same first part but one other, the first part a TOP or
 *            ENCLOSURE one (雪 雲, 間 問). Not a left one: 記 討 訓 share
 *            言 and little else a glance would mistake, and 連 軒 share 車
 *            in two different layouts (the first measurement, CLAUDE.md).
 *
 * Measured on 60 pairs drawn at random from the output; CLAUDE.md, "Play",
 * has the share and what the rules still get wrong.
 */

export const LOOKALIKES_FORMAT = 'yomu-lookalikes/1';
export const LOOKALIKES_SRC = 'data/play/lookalikes.json';
export const MAX_LOOKALIKES = 5;

/** Shared parts must hold this share of the larger kanji's strokes. */
export const SHARE = 0.6;

/**
 * Pairs the parts cannot see, authored for Yomu from the shapes. A string is
 * a group: every two of its kanji look alike. A fact about shapes, written
 * here; no published list was copied.
 */
export const CLASSIC = Object.freeze([
  '土士', '己已巳', '日曰', '千干', '刀力', '人入八', '大犬太', '右石', '王玉主',
  '貝見', '午牛', '矢失', '天夫', '末未',
  '田由', '目日', '鳥島', '鳥馬', '若苦', '徴微', '輸輪', '拾捨',
  '思恵', '賃貸', '遣遺', '侯候', '減滅',
]);

/**
 * KanjiVG names a part by its full form and KANJIDIC counts that form's
 * strokes: 艹 is counted as 艸, six. These are the counts as the part is
 * written inside a kanji, and the parts KANJIDIC has no entry for.
 */
const PART_STROKES = Object.freeze({
  '艹': 3, '⻌': 3, '⻖': 3, '⻏': 3, '⺍': 3, '⺕': 3, '𠂉': 2, '𠂊': 2, '⺨': 3, '⺤': 4, '⺌': 3, '龶': 4, '⺦': 2,
});

/** A part this small added to a kanji makes another kanji that looks like it (王 玉). */
const SMALL = new Set([...'丶丿一亠']);

/** Parts that sit on the left, on top, or around: two kanji whose first parts share a class share a layout. */
const LEFT = new Set([...'亻彳扌氵忄犭礻衤⻖木禾米糸言金日月火土王石目口女子弓足車馬魚飠貝舟耳歹方牛虫酉立巾片革骨冫']);
const TOP = new Set([...'艹宀冖罒⺍⺌雨竹癶穴亠𠂉人爫⺤耂']);
const ENCLOSURE = new Set([...'門囗广厂尸疒⻌冂勹戸']);

const RANK = Object.freeze({ classic: 6, inside: 5, same: 4, swap: 3, phonetic: 2, radical: 1 });

const classOf = (p) => (LEFT.has(p) ? 'left' : TOP.has(p) ? 'top' : ENCLOSURE.has(p) ? 'around' : null);
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Every look-alike pair, as [{ a, b, why, score }]. `entries` maps a kanji to
 * its shard entry (Map or object); `joyo` is the jōyō kanji, in list order.
 */
export function lookalikePairs(entries, list) {
  const get = entries instanceof Map ? (ch) => entries.get(ch) : (ch) => entries[ch];
  // A jōyō kanji no shard holds is the jōyō check's to report; here it has no parts.
  const joyo = list.filter((ch) => get(ch));
  const J = new Set(joyo);
  const strokes = (p) => PART_STROKES[p] ?? (get(p) && Number.isInteger(get(p).s) ? get(p).s : null);
  const out = new Map();
  const add = (a, b, why, score) => {
    if (a === b || !get(a) || !get(b)) return;
    const k = pairKey(a, b);
    const was = out.get(k);
    const s = RANK[why] + score;
    if (!was || was.score < s) out.set(k, { a: a < b ? a : b, b: a < b ? b : a, why, score: s });
  };

  for (const group of CLASSIC) {
    const g = [...group];
    for (let i = 0; i < g.length; i += 1) for (let j = i + 1; j < g.length; j += 1) add(g[i], g[j], 'classic', 0);
  }

  // Two parts one stroke apart make two kanji that look alike (swap).
  const alike = new Set();
  for (const b of joyo) {
    const parts = get(b).parts || [];
    let a = null;
    if (parts.length === 1) [a] = parts;
    else if (parts.length === 2 && SMALL.has(parts[1])) [a] = parts;
    else if (parts.length === 2 && SMALL.has(parts[0])) a = parts[1];
    if (a && J.has(a) && get(b).s - get(a).s === 1) {
      add(a, b, 'inside', 0);
      alike.add(pairKey(a, b));
    }
  }

  for (let i = 0; i < joyo.length; i += 1) {
    const a = joyo[i];
    const ea = get(a);
    const pa = ea.parts || [];
    if (!pa.length) continue;
    for (let j = i + 1; j < joyo.length; j += 1) {
      const b = joyo[j];
      const eb = get(b);
      const pb = eb.parts || [];
      const apart = Math.abs(ea.s - eb.s);
      if (pa.length !== pb.length || apart > 1) continue;
      const most = Math.max(ea.s, eb.s);
      const even = apart ? 0 : 0.1;
      const diff = [];
      pa.forEach((p, k) => { if (p !== pb[k]) diff.push(k); });
      if (!diff.length) {
        const known = pa.map(strokes);
        if (known.includes(null)) continue;
        const share = known.reduce((n, x) => n + x, 0) / most;
        if (share >= SHARE) add(a, b, 'same', share / 2 + even);
        continue;
      }
      if (diff.length !== 1 || pa.length < 2) continue;
      const at = diff[0];
      const x = pa[at];
      const y = pb[at];
      const sx = strokes(x);
      const sy = strokes(y);
      if (sx === null || sy === null) continue;
      if (alike.has(pairKey(x, y))) {
        if (at > 0 || LEFT.has(x) === LEFT.has(y)) add(a, b, 'swap', even);
        continue;
      }
      const share = Math.min(ea.s - sx, eb.s - sy) / most;
      if (share < SHARE || Math.abs(sx - sy) > 1) continue;
      if (at === 0) {
        const side = classOf(x);
        if ((side === 'left' || side === 'top') && side === classOf(y)) add(a, b, 'phonetic', share / 2 + even);
      } else {
        if (TOP.has(pa[0]) || ENCLOSURE.has(pa[0])) add(a, b, 'radical', share / 2 + even);
      }
    }
  }
  return [...out.values()];
}

/**
 * Each jōyō kanji's look-alikes, best first, at most MAX_LOOKALIKES. Pairs
 * are taken whole, best score first (then the commoner pair, by KANJIDIC's
 * frequency rank, then by code point), while both ends that are jōyō have
 * room, so a pair between two jōyō kanji is listed both ways.
 */
export function lookalikeMap(entries, joyo) {
  const get = entries instanceof Map ? (ch) => entries.get(ch) : (ch) => entries[ch];
  const J = new Set(joyo);
  const rank = (ch) => (get(ch) && Number.isInteger(get(ch).f) ? get(ch).f : 9999);
  const pairs = lookalikePairs(entries, joyo).sort((p, q) => q.score - p.score
    || Math.max(rank(p.a), rank(p.b)) - Math.max(rank(q.a), rank(q.b))
    || (p.a + p.b < q.a + q.b ? -1 : 1));
  const lists = new Map();
  const room = (ch) => !J.has(ch) || (lists.get(ch) || []).length < MAX_LOOKALIKES;
  const put = (ch, other, score) => {
    if (!J.has(ch)) return;
    if (!lists.has(ch)) lists.set(ch, []);
    lists.get(ch).push([other, score]);
  };
  for (const p of pairs) {
    if (!J.has(p.a) && !J.has(p.b)) continue;
    if (!room(p.a) || !room(p.b)) continue;
    put(p.a, p.b, p.score);
    put(p.b, p.a, p.score);
  }
  const order = new Map(joyo.map((ch, i) => [ch, i]));
  return new Map([...lists]
    .sort(([a], [b]) => order.get(a) - order.get(b))
    .map(([ch, list]) => [ch, list.map(([o]) => o)]));
}

/** The yomu-lookalikes/1 document. `licence` is the block the kanji shards carry. */
export function lookalikesDoc(entries, joyo, licence) {
  const map = lookalikeMap(entries, joyo);
  const kanji = {};
  for (const [ch, list] of map) kanji[ch] = list.join('');
  return {
    _licence: {
      ...licence,
      inputs: [
        ...((licence && licence.inputs) || []),
        {
          id: 'authored',
          source: 'Written for Yomu: the rules and the classic pairs in tools/lib/lookalikes.mjs',
          url: 'https://creativecommons.org/publicdomain/zero/1.0/',
          spdx: 'CC0-1.0',
          screen: 'none',
          use: 'which kanji look alike, chosen by rule from the parts and the strokes',
        },
      ],
      generated_by: 'tools/build-lookalikes.mjs',
    },
    format: LOOKALIKES_FORMAT,
    count: map.size,
    kanji,
  };
}

/**
 * What is wrong with a yomu-lookalikes/1 document, as a list of reasons
 * (empty when nothing is). `entries` is every kanji the shards hold, `joyo`
 * the jōyō list in order. Checks the shape, that every key is jōyō and every
 * kanji a known one, no kanji twice in a list or listed as its own, the cap,
 * the symmetry between jōyō kanji, the count, and, last, that the file is
 * what lookalikesDoc builds from the same shards.
 */
export function lookalikesProblems(doc, entries, joyo) {
  const has = entries instanceof Map ? (ch) => entries.has(ch) : (ch) => Object.hasOwn(entries, ch);
  const out = [];
  const J = new Set(joyo);
  const map = doc && doc.kanji;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return ['kanji is not an object'];
  const lists = new Map();
  for (const [ch, v] of Object.entries(map)) {
    if (!J.has(ch)) out.push(`${ch} is a key but not a jōyō kanji`);
    if (typeof v !== 'string' || !v) { out.push(`${ch}: the look-alikes are not a string of kanji`); continue; }
    const list = [...v];
    if (list.length > MAX_LOOKALIKES) out.push(`${ch} has ${list.length} look-alikes, more than ${MAX_LOOKALIKES}`);
    if (new Set(list).size !== list.length) out.push(`${ch} lists a kanji twice`);
    if (list.includes(ch)) out.push(`${ch} is listed as its own look-alike`);
    for (const o of list) if (!has(o)) out.push(`${ch}: ${o} is not a kanji the shards hold`);
    lists.set(ch, list);
  }
  for (const [ch, list] of lists) {
    for (const o of list) {
      if (J.has(o) && !(lists.get(o) || []).includes(ch)) out.push(`${ch} lists ${o}, but ${o} does not list ${ch}`);
    }
  }
  if (doc.count !== lists.size) out.push(`count is ${doc.count}, the file holds ${lists.size}`);
  if (!out.length) {
    const built = lookalikesDoc(entries, joyo, doc._licence).kanji;
    const same = Object.keys(built).length === lists.size && Object.entries(built).every(([ch, v]) => map[ch] === v);
    if (!same) out.push('is not what the shards give; run node tools/build-lookalikes.mjs');
  }
  return out;
}
