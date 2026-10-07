#!/usr/bin/env node
/**
 * data/play/spaces.json, the lines of "Where are the spaces?" and their
 * answer key, from the phrase library, tools/lib/compound-lines.mjs and the
 * analyzer run over the committed shards.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD.
 * Run it by hand, commit the output, never wire it into CI or `make serve`:
 *
 *   node tools/build-spaces.mjs           write the file and print what it kept
 *   node tools/build-spaces.mjs --why     also list every line left out, and why
 *
 * It needs no upstream and no cache. Run it again after any change to the
 * analyzer (js/), the dictionary (tools/build-dict.mjs, build-names.mjs) or
 * the library, since tests/spaces.test.mjs builds the file again in memory
 * and fails one that is not this output. tools/lib/spaces.mjs says which
 * lines are kept and which are left out.
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeJson, SITE, fmtBytes } from './lib/emit.mjs';
import { spacesDoc, spacesLicence, SPACES_SRC } from './lib/spaces.mjs';
import { COMPOUND_LINES } from './lib/compound-lines.mjs';
import { createDict } from '../js/dict.js';
import { analyze } from '../js/analyze.js';

const read = (rel) => JSON.parse(fs.readFileSync(path.join(SITE, rel), 'utf8'));

async function main() {
  const dict = createDict({ fetchJson: async (p) => JSON.parse(fs.readFileSync(p, 'utf8')), base: `${path.join(SITE, 'data')}/` });
  const { doc, report } = await spacesDoc({
    library: read('data/phrases/library.json'),
    compounds: COMPOUND_LINES,
    analyze: (text) => analyze(text, { dict }),
    licence: spacesLicence(read('data/dict/index.json')._licence, read('data/names/index.json')._licence),
  });
  const bytes = writeJson(path.join(SITE, SPACES_SRC), doc, 'lines');
  const left = Object.entries(report.left).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ');
  const why = Object.entries(report.reasons).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ');
  process.stdout.write(`spaces: ${report.sentences} sentences read (and ${report.spelled} spelled in kana); `
    + `${doc.count} lines kept, tier 1 ${doc.tiers[1]}, tier 2 ${doc.tiers[2]}, tier 3 ${doc.tiers[3]}; ${fmtBytes(bytes)}\n`);
  process.stdout.write(`  by source: ${Object.entries(report.sources).map(([k, n]) => `${k} ${n}`).join(', ')}\n`);
  process.stdout.write(`  left out: ${left}\n  reasons: ${why}\n`);
  if (process.argv.includes('--why')) {
    for (const l of report.leftOut) process.stdout.write(`  ${l.why.padEnd(8)} ${l.id.padEnd(32)} ${l.text}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
