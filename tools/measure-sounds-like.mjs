#!/usr/bin/env node
/**
 * How often the sound-alike guess (js/sounds-like.js) names the English a
 * katakana word was written for, measured on JMdict's own loanwords held out
 * from everything the guess learns from.
 *
 *   node tools/measure-sounds-like.mjs              the held-out quarter, the rule in LIKE
 *   node tools/measure-sounds-like.mjs --dev        the development quarter
 *   node tools/measure-sounds-like.mjs --dev --search   the rules worth trying, on it
 *
 * Reads only the committed data/dict/ shards (tools/lib/sounds-like.mjs); it
 * needs no network and changes no file. The loanwords are split by a hash of
 * the key: the odds are counted on half, the rule was chosen on a quarter
 * (--dev), and the last quarter is read with that rule and nothing tuned on
 * it. A held-out word's own key is taken out of the word list too, so the
 * guess can only find its English the way it finds the English of a part no
 * record has: because some other record glosses with it.
 *
 * A guess is right when it is the word's first gloss, cut to one word
 * (ショップ "shop"), or the English source JMdict names (`ls`). Nothing else
 * counts: "attend" for アテンド, whose gloss is "attendance", is wrong here.
 */
import path from 'node:path';
import { SITE } from './lib/emit.mjs';
import {
  readDictionary, glossWords, loanwords, countPieces, splitOf,
} from './lib/sounds-like.mjs';
import {
  LIKE, groupsOfWord, groupsOfKana, createModel, rank, decide,
} from '../js/sounds-like.js';

const args = new Set(process.argv.slice(2));
const SPLIT = args.has('--dev') ? 'dev' : 'test';

const dict = readDictionary(path.join(SITE, 'data'));
const all = loanwords(dict);
const held = new Set(all.filter((x) => splitOf(x.key) !== 'train').map((x) => x.key));
const words = glossWords(dict, held);
const groups = new Map();
for (const [w, n] of words) {
  for (const g of groupsOfWord(w)) {
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push([w, n]);
  }
}
const { counts, lined } = countPieces(all.filter((x) => splitOf(x.key) === 'train'));
const logp = createModel(counts);
const cases = all.filter((x) => splitOf(x.key) === SPLIT);

/** Every candidate for one case, ranked once per pair of weights, and whether its gold is among them. */
const memo = new Map();
function ranked(c, p) {
  const id = `${c.key}\u0000${p.loose}\u0000${p.common}`;
  if (!memo.has(id)) {
    const list = rank(c.key, groupsOfKana(c.key).flatMap((g) => groups.get(g) || []), logp, p);
    memo.set(id, { list, reach: list.some((x) => c.gold.includes(x.word)) });
  }
  return memo.get(id);
}

const BUCKETS = [[2, 3], [4, 5], [6, 7], [8, Infinity]];
const bucketOf = (n) => BUCKETS.findIndex(([lo, hi]) => n >= lo && n <= hi);

function measure(p) {
  const rows = BUCKETS.map(() => ({ n: 0, reach: 0, answered: 0, right: 0 }));
  const wrong = [];
  for (const c of cases) {
    const row = rows[bucketOf([...c.key].length)];
    const { list, reach } = ranked(c, p);
    row.n += 1;
    if (reach) row.reach += 1;
    const word = decide(c.key, list, p);
    if (!word) continue;
    row.answered += 1;
    if (c.gold.includes(word)) row.right += 1;
    else wrong.push(`${c.key} ${c.gold[0]}: ${word}`);
  }
  const sum = (f) => rows.reduce((s, r) => s + r[f], 0);
  return { rows, wrong, n: sum('n'), reach: sum('reach'), answered: sum('answered'), right: sum('right') };
}

const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : 'none');

function print(p, m) {
  process.stdout.write(`${SPLIT} quarter: ${m.n} loanwords (of ${all.length}; odds counted on ${lined} that line up), `
    + `${words.size} words in the list without the held-out keys\n`);
  process.stdout.write(`rule ${JSON.stringify(p)}\n\n`);
  process.stdout.write('| katakana | loanwords | gloss in the list and lined up | answered (coverage) | right | top-1 precision |\n');
  process.stdout.write('|---|---:|---:|---:|---:|---:|\n');
  m.rows.forEach((r, k) => {
    const [lo, hi] = BUCKETS[k];
    const label = hi === Infinity ? `${lo}+` : `${lo} to ${hi}`;
    process.stdout.write(`| ${label} | ${r.n} | ${r.reach} | ${r.answered} (${pct(r.answered, r.n)}) | ${r.right} | ${pct(r.right, r.answered)} |\n`);
  });
  process.stdout.write(`| **all** | **${m.n}** | **${m.reach}** | **${m.answered} (${pct(m.answered, m.n)})** | **${m.right}** | **${pct(m.right, m.answered)}** |\n`);
  if (args.has('--wrong')) process.stdout.write(`\nwrong (${m.wrong.length}): ${m.wrong.join('; ')}\n`);
}

if (args.has('--search')) {
  const found = [];
  // Every rule here keeps each length it answers at 80 in 100 or better on
  // this quarter, not only the total, and the best answer the most.
  for (const common of [0, 0.25, 0.5, 1]) for (const loose of [1, 3]) for (const margin of [1, 2, 3]) {
    for (const shortMargin of [2, 3, 4, 6]) for (const worst of [-Infinity, -6, -5, -4]) for (const minKana of [3, 4, 5]) {
      if (shortMargin < margin) continue;
      const p = { ...LIKE, common, loose, margin, shortMargin, worst, minKana };
      const m = measure(p);
      const even = m.rows.every((r) => !r.answered || r.right / r.answered >= 0.8);
      found.push({ p, even, answered: m.answered, precision: m.right / Math.max(m.answered, 1), rows: m.rows });
    }
  }
  const best = found.filter((f) => f.even && f.precision >= 0.85).sort((a, b) => b.answered - a.answered).slice(0, 12);
  for (const f of best) {
    const { common, loose, margin, shortMargin, worst, minKana } = f.p;
    const per = f.rows.map((r) => `${r.answered}:${pct(r.right, r.answered)}`).join(' ');
    process.stdout.write(`${JSON.stringify({ common, loose, margin, shortMargin, worst, minKana })} answers ${f.answered}, ${pct(f.precision, 1)} [${per}]\n`);
  }
} else {
  print(LIKE, measure(LIKE));
}
