// The page's strings, as one table: strings.js merges the collection's and
// History's strings (strings-collect.js) and Play's (strings-play.js) into
// what ui() reads. Every string
// has both languages and the same placeholders in each, neither table hides
// a key of the other, and every key the page names, in a module or in
// index.html, is there: a missing key draws an empty string and a warning,
// and nothing else would notice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STRINGS } from '../js/strings.js';
import { COLLECT_STRINGS } from '../js/strings-collect.js';
import { PLAY_STRINGS } from '../js/strings-play.js';
import { READER_STRINGS } from '../js/strings-reader.js';
import { GAPS_STRINGS } from '../js/strings-gaps.js';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = /\b(powerful|seamless|leverages?|robust|utili[sz]e)\b/i;
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('the collection\'s strings are in the table, and none is overridden by a key of the same name', () => {
  for (const [key, value] of Object.entries(COLLECT_STRINGS)) {
    assert.equal(STRINGS[key], value, key);
  }
});

test('Play\'s strings are in the table, none overridden, and no key is in both merged tables', () => {
  for (const [key, value] of Object.entries(PLAY_STRINGS)) {
    assert.equal(STRINGS[key], value, key);
    assert.ok(!Object.hasOwn(COLLECT_STRINGS, key), `${key} is in both strings-collect.js and strings-play.js`);
  }
});

test('the Gaps option\'s strings are in the table, none overridden, and no key is in another merged table', () => {
  for (const [key, value] of Object.entries(GAPS_STRINGS)) {
    assert.equal(STRINGS[key], value, key);
    for (const other of [COLLECT_STRINGS, PLAY_STRINGS, READER_STRINGS]) assert.ok(!Object.hasOwn(other, key), `${key} is in two tables`);
  }
});

test('every new string has English and neutral Spanish, the same placeholders, and none of the banned words', () => {
  const tables = [COLLECT_STRINGS, PLAY_STRINGS, READER_STRINGS, GAPS_STRINGS];
  for (const [key, value] of tables.flatMap((x) => Object.entries(x))) {
    assert.equal(typeof value.en, 'string', `${key}.en`);
    assert.equal(typeof value.es, 'string', `${key}.es`);
    assert.ok(value.en.trim() && value.es.trim(), key);
    assert.deepEqual(placeholders(value.es), placeholders(value.en), `${key}: placeholders`);
    for (const s of [value.en, value.es]) {
      assert.ok(!s.includes('\u2014'), `${key}: a dash`);
      assert.ok(!BANNED.test(s), `${key}: ${s}`);
    }
    assert.ok(!/\bvosotros\b|\b(tenéis|podéis|habéis)\b/i.test(value.es), `${key}: vosotros`);
  }
});

test('every key the page names is in the table', () => {
  const named = new Set();
  const js = join(SITE, 'js');
  for (const file of readdirSync(js).filter((f) => f.endsWith('.js') && !f.startsWith('neorgon-'))) {
    const src = readFileSync(join(js, file), 'utf8');
    for (const m of src.matchAll(/\b(?:ui|withKanji|uiNodes)\('([A-Za-z][A-Za-z0-9]*)'/g)) named.add(m[1]);
  }
  const html = readFileSync(join(SITE, 'index.html'), 'utf8');
  for (const m of html.matchAll(/data-ui(?:-label|-title)?="([A-Za-z][A-Za-z0-9]*)"/g)) named.add(m[1]);
  for (const g of [1, 2, 3, 4, 5, 6, 8]) named.add(`grade${g}`);
  assert.ok(named.size > 100, `only ${named.size} keys found`);
  const missing = [...named].filter((k) => !Object.hasOwn(STRINGS, k));
  assert.deepEqual(missing, []);
});
