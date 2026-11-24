// The sure names of the names tier by reading, for Search's romaji
// (js/search-romaji.js asks): a romaji query has only kana, and the names tier
// is keyed by spelling, so data/search/names.json files each sure name under
// its reading (tools/build-name-readings.mjs). No DOM. docs/ANALYZER.md, "A
// sure name reads as the name".

import { toHira } from './kana.js';

/** Honorifics a name takes: tanaka san is 田中さん. */
export const HONORIFICS = Object.freeze(['さん', 'さま', 'くん', 'ちゃん', 'せんせい', 'せんぱい']);
/** What may follow a name typed alone: an honorific, the copula, both or nothing (tanaka, tanaka san desu). */
const NAME_TAIL = /^(?:さん|さま|くん|ちゃん|せんせい|せんぱい)?(?:です|でした|だ)?$/;
/**
 * What may follow a name with no honorific inside a sentence: the copula, a
 * particle or the end. Such a name is written only where the reading without
 * it fails (withNames, `plain`): やまだ is as often 山だ.
 */
const AFTER_PLAIN = /^(?:$|だ|で|から|まで|[はわがのとにをもへ])/;
/**
 * The kana a name with an honorific may follow inside a sentence: a
 * particle, or わ said for は. Not お or え, which open more words than they
 * are particles (えきの is 駅の, never え and the name 木野).
 */
const BEFORE_NAME = new Set([...'はわがのとにをもへ']);
/** The kana a name with no honorific may follow inside a sentence: the topic (watashi no namae wa tanaka desu). */
const BEFORE_PLAIN = new Set([...'はわ']);

/**
 * The names half over search.js's lookups: `dict` (createDict()'s), `result`,
 * `loadNames()`, which gives data/search/names.json, and `spells(kana)`,
 * whether a first-tier word or a form of one spells the kana (search-romaji.js
 * firstTier).
 */
export function createNames({
  dict, result, loadNames = async () => null, spells = async (kana) => !!dict.get(kana),
}) {
  let names = null;

  /** The sure names by reading, `{ reading: [spelling] }`, loaded once; {} where the file cannot be read. */
  function nameIndex() {
    if (!names) {
      names = Promise.resolve().then(loadNames).then((doc) => {
        const by = (doc && doc.names) || {};
        return { by, longest: Math.max(0, ...Object.keys(by).map((r) => r.length)) };
      }).catch(() => { names = null; return { by: {}, longest: 0 }; });
    }
    return names;
  }

  /**
   * The sure name a romaji word is, alone or with an honorific or the copula
   * after it (tanaka, tanaka san desu): the longest reading that fits, its
   * spellings and the rest; null where none.
   */
  async function nameAt(kana) {
    const { by, longest } = await nameIndex();
    for (let end = Math.min(longest, kana.length); end >= 2; end -= 1) {
      const spellings = by[kana.slice(0, end)];
      if (spellings && NAME_TAIL.test(kana.slice(end))) return { reading: kana.slice(0, end), spellings, rest: kana.slice(end) };
    }
    return null;
  }

  /** A name's spellings as results, each read as `named.reading`. */
  async function nameResults(named) {
    await dict.needNames(named.spellings);
    return named.spellings.flatMap((sp) => {
      const rec = dict.name(sp);
      return rec ? [result(sp, [rec], 'name', { romaji: named.reading })] : [];
    });
  }

  /**
   * `text` with each sure name of one spelling written as the name: since
   * the analyzer reads 田中 as the name and たなか as 棚 and か. A name with an
   * honorific after it (tanaka san) is written where it starts the stretch,
   * a part typed on its own (`starts`) or follows a particle. One with no
   * honorific is written only with `plain`, which search-romaji.js asks for
   * only where the reading without names was no sentence to trust (tanaka
   * desu: 棚かです) or cut into the name (cutsName: watashinonamaewatanakadesu
   * read わた|なか, and is 私の名前は田中です), and only where it
   * starts the stretch, a part typed on its own or follows the topic, and
   * the copula, a particle or the end follows: やまだ is as often 山だ, みた
   * 見た and かが the start of 輝く. A first-tier word that starts where the
   * name does and runs past it is that word (ひらがなで is ひらがな, never the
   * name 比良 and がなで; かがやいて is 輝いて), and a reading a first-tier
   * word or form spells is the word unless an honorific follows (satou desu
   * is 砂糖です, satou san 佐藤さん). `fixed` spans move with the text, and
   * each name's span is fixed too. `left` is the readings of the names with
   * no honorific left out, which a reading with `plain` would write.
   */
  async function withNames(text, fixed, starts, { plain = false } = {}) {
    const { by, longest } = await nameIndex();
    const found = [];
    for (let i = 0; i < text.length; i += 1) {
      const start = !i || starts.has(i);
      if (!start && !BEFORE_NAME.has(text[i - 1])) continue;
      for (let len = Math.min(longest, text.length - i); len >= 2; len -= 1) {
        const reading = text.slice(i, i + len);
        const spellings = by[reading];
        if (!spellings || spellings.length !== 1) continue;
        const after = text.slice(i + len);
        const honored = HONORIFICS.some((h) => after.startsWith(h));
        if (!honored && !((start || BEFORE_PLAIN.has(text[i - 1])) && AFTER_PLAIN.test(after))) continue;
        found.push({
          i, reading, spelling: spellings[0], honored,
        });
        break;
      }
    }
    if (!found.length) return { text, fixed, names: [], left: [] };
    const longer = (f) => Array.from({ length: Math.max(0, Math.min(dict.maxKey || 12, text.length - f.i) - f.reading.length) },
      (_, k) => text.slice(f.i, f.i + f.reading.length + k + 1));
    await dict.need([...new Set(found.flatMap((f) => [f.reading, ...longer(f)]))]);
    const fits = [];
    let end = 0;
    for (const f of found) {
      if (f.i < end) continue;
      if (f.honored ? longer(f).some((k) => dict.get(k)) : await someAsync(longer(f), spells)) continue;
      if (!f.honored && await spells(f.reading)) continue;
      fits.push(f);
      end = f.i + f.reading.length;
    }
    const kept = fits.filter((f) => plain || f.honored);
    const left = fits.filter((f) => !kept.includes(f)).map((f) => f.reading);
    if (!kept.length) return { text, fixed, names: [], left };
    let out = '';
    const map = [];
    const names = [];
    for (let i = 0; i < text.length;) {
      const f = kept.find((x) => x.i === i);
      if (f) {
        for (let k = 0; k < f.reading.length; k += 1) map[i + k] = out.length;
        names.push({ at: out.length, ...f });
        out += f.spelling;
        i += f.reading.length;
      } else {
        map[i] = out.length;
        out += text[i];
        i += 1;
      }
    }
    map[text.length] = out.length;
    return {
      text: out,
      fixed: [...fixed.map(([a, b]) => [map[a], map[b]]), ...names.map((n) => [n.at, n.at + n.spelling.length])],
      names,
      left,
    };
  }

  /**
   * The sure names a reading spells as two words or more where a name
   * stands (after the start or a particle, before the end, the copula, a
   * particle or an honorific): watashi wa saitou desu read as 私は際頭です,
   * itou as い and 塔; at the very end, a sentence-final particle the
   * analyzer read may close it (watashi no namae wa tanaka, 私の名前は棚か).
   * Each `{ from, to, reading, spellings }`, [from, to) in `tokens`. A
   * reading that does this is no sentence to trust, and the name's
   * spellings are the words to list.
   */
  async function splitNames(tokens) {
    const { by, longest } = await nameIndex();
    const isWord = (t) => t && t.entry && !['particle', 'copula', 'name'].includes(t.kind);
    const closes = (t, j) => j === tokens.length - 1 && t.kind === 'particle' && !t.rule && ['か', 'ね', 'よ', 'な'].includes(t.surface);
    const out = [];
    for (let i = 0; i < tokens.length; i += 1) {
      if (i && tokens[i - 1].kind !== 'particle') continue;
      let kana = '';
      for (let j = i; j < tokens.length && (isWord(tokens[j]) || (j > i && closes(tokens[j], j))); j += 1) {
        kana += toHira(tokens[j].surface);
        if (kana.length > longest) break;
        const next = tokens[j + 1];
        if (j > i && by[kana] && (!next || ['particle', 'copula'].includes(next.kind) || HONORIFICS.includes(next.surface))) {
          out.push({
            from: i, to: j + 1, reading: kana, spellings: by[kana],
          });
          break;
        }
      }
    }
    return out;
  }

  /** The sure names among `readings` (parts typed on their own) as results, each name once. */
  async function partNames(readings) {
    const { by } = await nameIndex();
    const named = [...new Set(readings.filter((r) => by[r]))];
    return (await Promise.all(named.map((r) => nameResults({ reading: r, spellings: by[r] })))).flat();
  }

  return Object.freeze({
    nameIndex, nameAt, nameResults, withNames, splitNames, partNames,
  });
}

/**
 * Whether a reading's tokens cut into a name it left out: one of `left` is
 * in their kana, but nowhere from one token's start to another's end (わた|なか
 * for the たなか of watashinonamaewatanakadesu, while 前|だ holds まえだ
 * whole). search-romaji.js then reads the name as the name.
 */
export function cutsName(tokens, left) {
  const edges = new Set([0]);
  let at = 0;
  for (const t of tokens) { at += t.surface.length; edges.add(at); }
  const kana = tokens.map((t) => t.surface).join('');
  return left.some((reading) => {
    const places = [];
    for (let i = kana.indexOf(reading); i >= 0; i = kana.indexOf(reading, i + 1)) places.push(i);
    return places.length > 0 && !places.some((i) => edges.has(i) && edges.has(i + reading.length));
  });
}

/** Whether `test` holds for some item, asked one at a time. */
async function someAsync(items, test) {
  for (const x of items) if (await test(x)) return true;
  return false;
}
