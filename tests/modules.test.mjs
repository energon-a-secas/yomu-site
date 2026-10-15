// Every page module parses. Most of js/ is imported by some suite, but the
// event modules need a DOM and none is: a broken import there passed npm test
// on 2026-10-14 and left the page blank. `node --check` parses without running.
//
//   node --test tests/modules.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const JS = fileURLToPath(new URL('../js/', import.meta.url));

test('every module under js/ parses', async () => {
  const files = readdirSync(JS).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 50);
  const bad = [];
  await Promise.all(files.map((f) => run(process.execPath, ['--check', `${JS}${f}`]).catch((e) => bad.push(`${f}: ${String(e.stderr).split('\n').slice(0, 2).join(' ')}`))));
  assert.deepEqual(bad, []);
});
