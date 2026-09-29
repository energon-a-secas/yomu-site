// The real shards, read from disk the way the page fetches them.
//
// Every analyzer test runs against data/ as committed, not a hand lexicon:
// a segmentation that only passes on a toy dictionary has not been tested.
// One dictionary is shared per test file, so shards load once, the way one
// page serves every paste after the first.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDict } from '../../js/dict.js';
import { analyze } from '../../js/analyze.js';

export const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA = resolve(SITE, 'data');

/** A fetchJson for createDict that reads a path under the site from disk. */
export async function fetchJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** A fresh dictionary over the committed data/, with no shard loaded yet. */
export function diskDict() {
  return createDict({ fetchJson, base: `${DATA}/` });
}

let shared = null;

/** The dictionary this test file shares. */
export function dict() {
  if (!shared) shared = diskDict();
  return shared;
}

/** analyze() against the real data. */
export function run(text) {
  return analyze(text, { dict: dict() });
}

/** The Japanese tokens of a result, without punctuation and spaces. */
export function words(result) {
  return result.tokens.filter((t) => !['punct', 'space', 'newline'].includes(t.kind));
}

/** The surfaces joined with |, the shape the failure messages print. */
export function cut(result) {
  return result.tokens.map((t) => t.surface).join('|');
}

/** The said line of a whole result, words separated by spaces. */
export function saidLine(result) {
  return words(result).map((t) => t.romaji.said).filter(Boolean).join(' ');
}
