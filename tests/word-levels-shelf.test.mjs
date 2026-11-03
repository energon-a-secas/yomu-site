// Words by level as the page drives it (js/events-word-levels.js): which
// level a paint draws, and which row Save keeps, when levels are picked
// while others load and arrive in any order. The race this guards: N5 still
// loading, the learner picks N4, N5 arrives last, and a repaint (Save, Show
// more) drew N5's words under the N4 chip and saved them. The events module
// runs here as the page runs it, over a small stand-in for the document and
// a fetch whose files this test holds and lets go.
//
//   node --test tests/word-levels-shelf.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import { WORD_LEVELS, WORDS_FORMAT, WORDS_INDEX_FORMAT } from '../js/word-levels.js';
import { SITE } from './helpers/disk.mjs';

// ── A stand-in for the document: what h(), fill() and the paint use ──────

class FakeNode {
  constructor() { this.childNodes = []; this.parentNode = null; }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  append(...cs) { for (const c of cs) this.appendChild(c instanceof FakeNode ? c : new FakeText(c)); }
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) this.childNodes.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  replaceChildren(...cs) { while (this.firstChild) this.removeChild(this.firstChild); this.append(...cs); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
}

class FakeText extends FakeNode {
  constructor(text) { super(); this.data = String(text); }
  get textContent() { return this.data; }
}

class FakeElement extends FakeNode {
  constructor(tag) { super(); this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.className = ''; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  get textContent() { return super.textContent; }
  set textContent(v) { this.replaceChildren(String(v)); }
  focus() {}
}

const body = new FakeElement('div');
globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tag) => new FakeElement(tag),
  createElementNS: (ns, tag) => new FakeElement(tag),
  createTextNode: (text) => new FakeText(text),
  getElementById: (id) => (id === 'sr-wordlv-body' ? body : null),
  querySelector: () => null,
  querySelectorAll: () => [],
};
const stored = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (k) => (stored.has(k) ? stored.get(k) : null),
    setItem: (k, v) => { stored.set(k, String(v)); },
    removeItem: (k) => { stored.delete(k); },
  },
});

/** Every element under a node, in order. */
function* elements(node) {
  for (const c of node.childNodes) {
    if (c instanceof FakeElement) { yield c; yield* elements(c); }
  }
}

/** A node's text without its furigana (the <rt> over each kanji). */
const written = (node) => (node instanceof FakeText ? node.data
  : node.tagName === 'RT' ? '' : node.childNodes.map(written).join(''));

/** What the shelf shows: the chip pressed, and the words of the rows drawn. */
function shown() {
  const all = [...elements(body)];
  const pressed = all.filter((el) => el.getAttribute('data-act') === 'wl-pick' && el.getAttribute('aria-pressed') === 'true').map((el) => el.getAttribute('data-level'));
  const words = all.filter((el) => el.className === 'mk-word').map(written);
  const status = all.find((el) => el.getAttribute('role') === 'status' || el.getAttribute('role') === 'alert');
  return { pressed, words, failed: all.some((el) => el.getAttribute('role') === 'alert'), status: status ? status.getAttribute('role') : null };
}

// ── A fetch whose level files this test holds ────────────────────────────

const WORDS = {
  n5: [['会う', 'あう', ['to meet']], ['いくら', '', ['how much']], ['テレビ', '', ['television']]],
  n4: [['上手', 'じょうず', ['skillful']], ['一日', 'ついたち', ['first day of the month']]],
  n3: [['下手', 'へた', ['unskillful']], ['彼奴', 'あいつ', ['he']]],
  n2: [['一日', 'いちにち', ['one day']]],
  n1: [['えびす講', 'えびすこう', ['Ebisu festival']]],
};
const DOCS = new Map([['data/words/jlpt.json', {
  format: WORDS_INDEX_FORMAT,
  count: 9,
  levels: Object.fromEntries(WORD_LEVELS.map((id) => [id, { n: WORDS[id].length, files: [`data/words/${id}-0.json`] }])),
}], ...WORD_LEVELS.map((id) => [`data/words/${id}-0.json`, { format: WORDS_FORMAT, level: id, rows: WORDS[id] }])]);

const ROOT = pathToFileURL(`${SITE}/`).href;
const held = new Map(); // a file held back -> its release, once asked for
const holding = new Set();
const failing = new Set();
const asked = [];
globalThis.fetch = async (url) => {
  const rel = String(url.href || url).replace(ROOT, '');
  asked.push(rel);
  if (holding.has(rel)) {
    holding.delete(rel);
    await new Promise((go) => held.set(rel, go));
  }
  if (failing.has(rel)) { failing.delete(rel); return { ok: false, status: 503, json: async () => null }; }
  const doc = DOCS.get(rel);
  return doc ? { ok: true, status: 200, json: async () => structuredClone(doc) } : { ok: false, status: 404, json: async () => null };
};

const tick = () => new Promise((r) => setImmediate(r));
async function until(ok, what) {
  for (let i = 0; i < 200; i += 1) {
    if (ok()) return;
    await tick();
  }
  assert.fail(`never: ${what}`);
}
function release(rel) {
  assert.ok(held.has(rel), `${rel} was asked for`);
  held.get(rel)();
  held.delete(rel);
}

const { paintWordLevels, WORD_LEVELS_ACTIONS: act } = await import('../js/events-word-levels.js');
const { myWords } = await import('../js/word-store.js');
const pick = (level) => act['wl-pick']({ dataset: { level } });
const save = (ix) => act['wl-save']({ dataset: { ix: String(ix) } });

test('N5 still loading, N4 picked: N5 arriving last leaves N4 on the shelf, and Save keeps N4\'s words', async () => {
  holding.add('data/words/n5-0.json');
  const first = paintWordLevels();
  await until(() => held.has('data/words/n5-0.json'), 'N5 asked for');
  assert.deepEqual(shown().pressed, ['n5']);
  assert.equal(shown().status, 'status', 'loading');
  pick('n4');
  await until(() => shown().words.length, 'N4 drawn');
  assert.deepEqual(shown(), { pressed: ['n4'], words: ['上手', '一日'], failed: false, status: 'status' });
  release('data/words/n5-0.json');
  await first;
  await tick();
  assert.deepEqual(shown().words, ['上手', '一日'], 'the paint N4 overtook draws nothing');
  save(0);
  await tick();
  assert.deepEqual(shown().pressed, ['n4'], 'the repaint after Save is N4');
  assert.deepEqual(shown().words, ['上手', '一日'], 'with N4\'s words, not N5\'s');
  save(1);
  await tick();
  const words = myWords();
  assert.ok(words.isSaved('上手', 'じょうず') && words.isSaved('一日', 'ついたち'), 'Save kept the N4 rows the chips show');
  assert.ok(!words.isSaved('会う', 'あう') && !words.isSaved('いくら', 'いくら'), 'and no N5 word');
  pick('n5');
  assert.deepEqual(shown(), { pressed: ['n5'], words: ['会う', 'いくら', 'テレビ'], failed: false, status: 'status' }, 'N5, back again, at once');
});

test('N3 still loading, N2 picked: N3 arriving last leaves N2, Show more and Save stay on it, and N3 is there when picked', async () => {
  holding.add('data/words/n3-0.json');
  pick('n3');
  await until(() => held.has('data/words/n3-0.json'), 'N3 asked for');
  pick('n2');
  await until(() => shown().pressed[0] === 'n2' && shown().words.length, 'N2 drawn');
  release('data/words/n3-0.json');
  await until(() => !held.size, 'N3 let go');
  await tick();
  await tick();
  assert.deepEqual(shown().words, ['一日'], 'N2 stays');
  act['wl-more']();
  await tick();
  assert.deepEqual([shown().pressed, shown().words], [['n2'], ['一日']], 'Show more redraws N2');
  save(0);
  await tick();
  assert.ok(myWords().isSaved('一日', 'いちにち'), 'Save kept N2\'s 一日 いちにち');
  assert.ok(!myWords().isSaved('下手', 'へた'), 'not N3\'s first word');
  const before = asked.length;
  pick('n3');
  assert.deepEqual(shown().words, ['下手', '彼奴'], 'N3 drawn at once, from the rows that arrived under its own id');
  assert.equal(asked.length, before, 'and not fetched again');
});

test('a level that fails to load says so, and picking it again fetches it again', async () => {
  failing.add('data/words/n1-0.json');
  const warned = [];
  const warn = console.warn;
  console.warn = (...args) => warned.push(args[0]);
  try {
    pick('n1');
    await until(() => shown().failed, 'the failure drawn');
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(warned, ['[yomu] word levels'], 'and names it in the console');
  assert.deepEqual(shown().pressed, ['n1']);
  assert.deepEqual(shown().words, []);
  pick('n1');
  await until(() => shown().words.length, 'N1 drawn');
  assert.deepEqual(shown().words, ['えびす講']);
});
