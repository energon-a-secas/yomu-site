#!/usr/bin/env node
/**
 * data/kanji/index.json and data/kanji/kNN.json, the table the page shows
 * beside a word: each kanji's readings, meanings, stroke count, grade, JLPT
 * level, frequency and named parts.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-kanji.mjs        (or: make data)
 *
 * Which characters: every joyo kanji (KANJIDIC grades 1 to 6 and 8) and every
 * character KANJIDIC gives a newspaper frequency rank, which adds the few
 * hundred jinmeiyo and older characters that still turn up in print. That is
 * about 2,600, ordered by frequency so that the first shard holds the
 * characters a reader meets first and a short text usually needs one fetch.
 *
 * `parts` come from KanjiVG, not KANJIDIC: the components KanjiVG names one
 * level under the character (語 is 言 and 吾), which is the level a learner
 * recognises. KANJIDIC's radical is one classification number; KanjiVG's
 * groups are how the character is drawn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadZippedJson, loadKanjiVgDir, upstream } from './lib/sources.mjs';
import { licenceBlock, unshippable, EM_DASH } from './lib/licence.mjs';
import {
  writeJson, serialize, MAX_BYTES, SITE, fmtBytes, pruneStale,
} from './lib/emit.mjs';
import { JOYO_GRADES, readingsOfType, selection } from './lib/kanjidic.mjs';

const TOOL = 'tools/build-kanji.mjs';
const OUT = path.join(SITE, 'data', 'kanji');
const MAX_MEANINGS = 3;
const MAX_PARTS = 4;

// ── KanjiVG ───────────────────────────────────────────────────────────────

const TAG = /<g\b([^>]*?)(\/?)>|<\/g>/g;
const ATTR = (name) => new RegExp(`\\b${name}="([^"]*)"`);

/** The `<g>` tree of one SVG, as nested `{ id, element, kids }`. */
function groupTree(svg) {
  const root = { kids: [] };
  const stack = [root];
  TAG.lastIndex = 0;
  let m = TAG.exec(svg);
  while (m) {
    if (m[0] === '</g>') {
      if (stack.length > 1) stack.pop();
    } else {
      const attrs = m[1];
      const node = {
        id: (ATTR('id').exec(attrs) || [])[1] || '',
        element: (ATTR('kvg:element').exec(attrs) || [])[1] || null,
        kids: [],
      };
      stack[stack.length - 1].kids.push(node);
      if (!m[2]) stack.push(node);
    }
    m = TAG.exec(svg);
  }
  return root;
}

function findById(node, id) {
  if (node.id === id) return node;
  for (const k of node.kids) {
    const hit = findById(k, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * The named components one level under the character's root group. A child
 * with no name of its own (学's top half is only marked as the phonetic) is
 * looked through once, to its own named children, so 学 gives ⺍ 冖 子 rather
 * than just 子. Deeper than that is strokes, not parts.
 */
function partsOf(svg, char) {
  const cp = char.codePointAt(0).toString(16).padStart(5, '0');
  const rootGroup = findById(groupTree(svg), `kvg:${cp}`);
  if (!rootGroup) return null;
  const out = [];
  const take = (el) => {
    if (el && el !== char && !out.includes(el)) out.push(el);
  };
  for (const kid of rootGroup.kids) {
    if (kid.element) take(kid.element);
    else for (const grand of kid.kids) take(grand.element);
  }
  return out.slice(0, MAX_PARTS);
}

// ── KANJIDIC ──────────────────────────────────────────────────────────────

const stats = { passedOver: 0, noSvg: [], noRoot: [] };

/**
 * Up to three English meanings. A meaning with an em dash never ships; one of
 * the five banned words is passed over when the character has other meanings
 * to show, and kept when it has none, the same rule build-dict.mjs applies to
 * glosses.
 */
function meaningsOf(character) {
  const all = [];
  for (const group of character.readingMeaning?.groups || []) {
    for (const m of group.meanings) {
      if (m.lang === 'en' && !m.value.includes(EM_DASH) && !all.includes(m.value)) all.push(m.value);
    }
  }
  const preferred = all.filter((m) => !unshippable(m));
  if (preferred.length < Math.min(all.length, MAX_MEANINGS)) stats.passedOver += 1;
  return (preferred.length ? preferred : all).slice(0, MAX_MEANINGS);
}

function entryOf(character, svgDir) {
  const e = {
    on: readingsOfType(character, 'ja_on'),
    kun: readingsOfType(character, 'ja_kun'),
    m: meaningsOf(character),
    s: character.misc.strokeCounts[0],
  };
  if (character.misc.grade != null) e.g = character.misc.grade;
  if (character.misc.jlptLevel != null) e.j = character.misc.jlptLevel;
  if (character.misc.frequency != null) e.f = character.misc.frequency;
  const cp = character.literal.codePointAt(0).toString(16).padStart(5, '0');
  const file = path.join(svgDir, `${cp}.svg`);
  let parts = [];
  if (!fs.existsSync(file)) stats.noSvg.push(character.literal);
  else {
    const got = partsOf(fs.readFileSync(file, 'utf8'), character.literal);
    if (got === null) stats.noRoot.push(character.literal);
    else parts = got;
  }
  e.parts = parts;
  return e;
}

function pack(chars, entries, licence) {
  const header = Buffer.byteLength(serialize({ _licence: licence, format: 'yomu-kanji/1', entries: {} }));
  const shards = [];
  let cur = [];
  let size = header;
  for (const ch of chars) {
    const n = Buffer.byteLength(`${JSON.stringify(ch)}: ${JSON.stringify(entries.get(ch))},\n`);
    if (cur.length && size + n > MAX_BYTES) {
      shards.push(cur);
      cur = [];
      size = header;
    }
    cur.push(ch);
    size += n;
  }
  if (cur.length) shards.push(cur);
  return shards.map((list) => ({
    _licence: licence,
    format: 'yomu-kanji/1',
    entries: Object.fromEntries(list.map((ch) => [ch, entries.get(ch)])),
  }));
}

function main() {
  const t0 = Date.now();
  const kanjidic = loadZippedJson('kanjidic');
  const svgDir = loadKanjiVgDir();
  const chosen = selection(kanjidic);
  const entries = new Map(chosen.map((c) => [c.literal, entryOf(c, svgDir)]));

  const licence = licenceBlock('edrdg', TOOL, {
    upstream: [upstream('kanjidic'), upstream('kanjivg')],
    inputs: [['kanjivg', 'parts, the named components under each character']],
  });
  const docs = pack(chosen.map((c) => c.literal), entries, licence);

  const written = [];
  const sizes = [];
  const shards = [];
  docs.forEach((doc, i) => {
    const name = `k${String(i).padStart(2, '0')}.json`;
    const file = path.join(OUT, name);
    sizes.push(writeJson(file, doc));
    written.push(file);
    shards.push({ src: `data/kanji/${name}`, chars: Object.keys(doc.entries).join('') });
  });
  const indexBytes = writeJson(path.join(OUT, 'index.json'), {
    _licence: licence,
    format: 'yomu-kanji-index/1',
    count: chosen.length,
    shards,
  }, 'shards');
  const gone = pruneStale(OUT, /^k\d+\.json$/, written);

  const joyo = chosen.filter((c) => JOYO_GRADES.has(c.misc.grade)).length;
  const ranked = chosen.filter((c) => c.misc.frequency != null).length;
  const withParts = [...entries.values()].filter((e) => e.parts.length).length;
  const total = sizes.reduce((a, b) => a + b, 0);
  const out = [
    `kanji ${chosen.length} (joyo ${joyo}, frequency-ranked ${ranked}, both ${joyo + ranked - chosen.length})`,
    `shards ${docs.length}: ${sizes.map((b) => `${fmtBytes(b)} (${b} B)`).join(', ')}; total ${fmtBytes(total)}; index ${fmtBytes(indexBytes)}`,
    `with parts ${withParts}; no KanjiVG file ${stats.noSvg.length}${stats.noSvg.length ? ` (${stats.noSvg.join('')})` : ''}; no root group ${stats.noRoot.length}`,
    `characters with a meaning passed over (dash or banned word) ${stats.passedOver}`,
    gone.length ? `removed stale shards: ${gone.join(' ')}` : 'no stale shards',
    `wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  ];
  process.stdout.write(`${out.join('\n')}\n`);
}

main();
