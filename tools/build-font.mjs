#!/usr/bin/env node
/**
 * fonts/klee/: the handwritten form, Klee One subset for the page, for the
 * kanji page's large character and the kana chart (js/hand.js).
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-font.mjs        (needs python3 with fonttools and brotli)
 *
 * What ships: every kana, and every kanji the kanji shards hold that Klee One
 * has (7,537 of 10,384 on 2026-10-16), as woff2 slices of 200 glyphs by code
 * point (tools/lib/font-subset.py), about 55 KB each, so a kanji page fetches
 * one; fonts/klee/index.json, `yomu-font/1`, lists each slice's characters,
 * which is how the page knows a kanji the hand lacks; and the licence, OFL.txt,
 * as the SIL Open Font License asks of a copy that ships. Klee One reserves
 * no font name, so the subset keeps its own.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fetchSource, upstream } from './lib/sources.mjs';
import { licenceBlock } from './lib/licence.mjs';
import { SITE, fmtBytes } from './lib/emit.mjs';
import { HAND_FORMAT, HAND_FAMILY } from '../js/hand.js';

const TOOL = 'tools/build-font.mjs';
const OUT = path.join(SITE, 'fonts', 'klee');
const PREFIX = 'k';

/** Every kana the chart draws, and every kanji a kanji page can show. */
function wanted() {
  let kana = '';
  for (let cp = 0x3041; cp <= 0x3096; cp += 1) kana += String.fromCodePoint(cp);
  for (let cp = 0x30a1; cp <= 0x30fa; cp += 1) kana += String.fromCodePoint(cp);
  kana += 'ーゝゞヽヾ々';
  const dir = path.join(SITE, 'data', 'kanji');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  let kanji = '';
  for (const s of index.shards) kanji += Object.keys(JSON.parse(fs.readFileSync(path.join(SITE, s.src), 'utf8')).entries).join('');
  return kana + kanji;
}

function main() {
  const ttf = fetchSource('kleeOne');
  const ofl = fetchSource('kleeOneOfl');
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (new RegExp(`^${PREFIX}\\d+\\.woff2$`).test(f)) fs.rmSync(path.join(OUT, f));
  const charsFile = path.join(os.tmpdir(), 'yomu-font-chars.txt');
  fs.writeFileSync(charsFile, wanted());
  const helper = path.join(SITE, 'tools', 'lib', 'font-subset.py');
  const slices = JSON.parse(execFileSync('python3', ['-I', helper, ttf, OUT, charsFile, PREFIX], { encoding: 'utf8', maxBuffer: 1 << 26 }));
  fs.copyFileSync(ofl, path.join(OUT, 'OFL.txt'));
  const doc = {
    _licence: licenceBlock('kleeOne', TOOL, { upstream: [upstream('kleeOne')] }),
    format: HAND_FORMAT,
    family: HAND_FAMILY,
    count: slices.reduce((n, [, chars]) => n + [...chars].length, 0),
    slices: slices.map(([name, chars]) => ({ src: `fonts/klee/${name}`, chars })),
  };
  const text = `${JSON.stringify(doc, null, 0).replace('"slices":[', '"slices":[\n').replace(/\},\{"src"/g, '},\n{"src"')}\n`;
  fs.writeFileSync(path.join(OUT, 'index.json'), text);
  const bytes = slices.reduce((n, [name]) => n + fs.statSync(path.join(OUT, name)).size, 0);
  process.stdout.write(`font: ${doc.count} characters in ${slices.length} slices, ${fmtBytes(bytes)}; kana slice ${fmtBytes(fs.statSync(path.join(OUT, slices[0][0])).size)}; index ${fmtBytes(Buffer.byteLength(text))}\n`);
}

main();
