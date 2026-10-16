// Search's screen (#/search): the field, its results, the parts picker, the
// kana chart, the counters and the collections (events-sets.js), and what their buttons do. js/search.js is the logic, render-search.js draws.
//
// The query lives in the field and in `sr.query`, never in the address or in
// storage. A search that finishes after the learner typed on is dropped
// (`sr.token`), so results never belong to an older query.

import { $, fill, h, debounce } from './utils.js';
import { ui } from './strings.js';
import { fetchJson, kanjiInfo, sharedDict } from './reader.js';
import { createSearch, byParts, queryKind } from './search.js';
import {
  resultNodes, partsNodes, byWord, shownWord, firstTier, PARTS_MEANT,
} from './render-search.js';
import { kanaChartNodes, countersNodes } from './render-learn.js';
import { afterPaintAll } from './render.js';
import { pageForms } from './other-forms.js';
import { pageExamples } from './examples.js';
import { pageSetWords } from './sets.js';
import { openKanjiPage } from './events-kanji-page.js';
import { onRoute, openReader } from './events-kanji.js';
import { loadText } from './events-read.js';
import { paintSets, chooseSet, currentSet } from './events-sets.js';
import { paintLevels } from './events-levels.js';
import { state, savePrefs } from './state.js';
import { KANA_ROWS } from './kana-rows.js';

const TABS = Object.freeze(['words', 'parts', 'kana', 'counters', 'sets', 'levels']);
/** Look up holds the field and the parts picker; Browse the shelves. */
const LOOK = Object.freeze(['words', 'parts']);
const groupOf = (tab) => (LOOK.includes(tab) ? 'look' : 'browse');

const sr = {
  tab: 'words',
  last: { look: 'words', browse: 'kana' },
  script: 'hiragana',
  counter: 3,
  kanaKept: [],
  query: '',
  token: 0,
  kept: { words: [], kanji: [] },
  chosen: new Set(),
  partsKept: { parts: [], kanji: [] },
  parts: null,
};

let engine = null;
let engineDict = null;

/** The search over the reader's own dictionary, made again when a Retry replaced it. */
async function searcher() {
  const dict = await sharedDict();
  if (!engine || engineDict !== dict) {
    engine = createSearch({ dict, fetchJson });
    engineDict = dict;
  }
  return engine;
}

function setStatus(text) {
  const el = $('sr-status');
  if (el) el.textContent = text;
}

async function run() {
  const q = sr.query.trim();
  const token = ++sr.token;
  const out = $('sr-results');
  if (!out) return;
  if (queryKind(q) === 'empty') {
    fill(out, tryNodes());
    setStatus('');
    return;
  }
  setStatus(ui('searching'));
  try {
    const found = await (await searcher()).search(q);
    const chars = [...new Set([...found.kanji, ...found.words.flatMap((w) => [...w.key])])];
    const forms = pageForms();
    const examples = pageExamples();
    const setWords = pageSetWords();
    const written = byWord(found.words).filter(firstTier).map((w) => shownWord(w).written);
    const [infos] = await Promise.all([
      kanjiInfo(chars),
      // Other spellings and examples are a nicety: a shard that fails leaves them out.
      forms.need(written).catch(() => {}),
      examples.need(written).catch(() => {}),
      setWords.need(written).catch(() => {}),
    ]);
    if (token !== sr.token) return;
    const { nodes, kept, status } = resultNodes(found, infos, q, (k, r) => forms.formsOf(k, r), (k, r) => examples.examplesOf(k, r), (k) => setWords.inOf(k));
    sr.kept = kept;
    fill(out, nodes);
    setStatus(status);
  } catch (err) {
    if (token !== sr.token) return;
    if (typeof console !== 'undefined') console.warn('[yomu] search', err);
    fill(out, []);
    setStatus(ui('searchFailed'));
  }
}

const runSoon = debounce(run, 220);

/** Queries to try, one of each kind, on an empty field. */
const TRIES = Object.freeze(['eat', '食べた', 'sake']);

function tryNodes() {
  return h('p', { class: 'sr-tries' }, [
    h('span', { class: 'quiet' }, ui('searchTry')),
    ...TRIES.map((q, i) => h('button', { type: 'button', class: 'sr-try', 'data-act': 'sr-try', 'data-ix': i }, h('span', { lang: /[a-z]/.test(q) ? 'en' : 'ja' }, q))),
  ]);
}

async function paintParts() {
  const body = $('sr-parts-body');
  if (!body) return;
  if (!sr.parts) {
    fill(body, h('p', { class: 'quiet', role: 'status' }, ui('partsLoading')));
    try {
      sr.parts = await (await searcher()).loadParts();
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[yomu] parts', err);
      fill(body, h('p', { class: 'word-warn', role: 'alert' }, ui('searchFailed')));
      return;
    }
  }
  const found = byParts(sr.chosen, sr.parts);
  const infos = found.kanji.length && found.kanji.length <= PARTS_MEANT ? await kanjiInfo(found.kanji) : new Map();
  const { nodes, kept } = partsNodes(sr.parts, sr.chosen, found, infos);
  sr.partsKept = kept;
  fill(body, nodes);
}

function paintKana() {
  const { nodes, kept } = kanaChartNodes(sr.script, state.prefs.kanaRows);
  sr.kanaKept = kept;
  fill($('sr-kana'), nodes);
}

function showTab(tab, { focus = false } = {}) {
  sr.tab = TABS.includes(tab) ? tab : 'words';
  const group = groupOf(sr.tab);
  sr.last[group] = sr.tab;
  for (const b of document.querySelectorAll('#search [data-act="sr-group"]')) b.setAttribute('aria-pressed', String(b.dataset.group === group));
  const look = document.querySelector('#search .sr-look');
  if (look) look.hidden = group !== 'look';
  const shelves = document.querySelector('#search .sr-shelves');
  if (shelves) shelves.hidden = group !== 'browse';
  for (const b of document.querySelectorAll('#search [data-act="sr-tab"]')) {
    const on = b.dataset.tab === sr.tab && (!b.dataset.set || b.dataset.set === currentSet());
    b.setAttribute('aria-pressed', String(on));
  }
  for (const id of TABS) if ($(`sr-${id}`)) $(`sr-${id}`).hidden = sr.tab !== id;
  if (sr.tab === 'parts') paintParts();
  if (sr.tab === 'kana') paintKana();
  if (sr.tab === 'counters') fill($('sr-counters'), countersNodes(sr.counter));
  if (sr.tab === 'sets') paintSets();
  if (sr.tab === 'levels') paintLevels();
  if (sr.tab === 'words' && focus) $('sr-input')?.focus();
}

/** After a pick the grid is drawn again: focus goes back to the same part. */
function focusPart(p) {
  const ix = sr.partsKept.parts.indexOf(p);
  const b = ix >= 0 ? document.querySelector(`#sr-parts-body [data-act="sr-part"][data-ix="${ix}"]`) : null;
  if (b) b.focus({ preventScroll: true });
}

export const SEARCH_ACTIONS = {
  'cn-pick': (b) => {
    sr.counter = Number(b.dataset.ix) || 0;
    fill($('sr-counters'), countersNodes(sr.counter));
    document.querySelector(`#sr-counters [data-act="cn-pick"][data-ix="${sr.counter}"]`)?.focus({ preventScroll: true });
  },
  'sr-try': (b) => {
    const q = TRIES[Number(b.dataset.ix)];
    const input = $('sr-input');
    if (!q || !input) return;
    input.value = q;
    sr.query = q;
    run();
    input.focus({ preventScroll: true });
  },
  'kc-kana': (b) => { const ch = sr.kanaKept[Number(b.dataset.ix)]; if (ch) openKanjiPage(ch, b); },
  // A row the learner knows: the phrase library can offer what those rows spell (events-kana-rows.js).
  'kc-row': (b) => {
    const row = KANA_ROWS[Number(b.dataset.ix)];
    if (!row) return;
    const have = new Set(state.prefs.kanaRows);
    if (have.has(row)) have.delete(row);
    else have.add(row);
    state.prefs.kanaRows = KANA_ROWS.filter((r) => have.has(r));
    savePrefs(state);
    paintKana();
    document.querySelector(`#sr-kana [data-act="kc-row"][data-ix="${b.dataset.ix}"]`)?.focus({ preventScroll: true });
  },
  'kc-script': (b) => {
    sr.script = b.dataset.script === 'katakana' ? 'katakana' : 'hiragana';
    paintKana();
    document.querySelector(`#sr-kana [data-act="kc-script"][data-script="${sr.script}"]`)?.focus();
  },
  'sr-tab': (b) => {
    if (b.dataset.set) chooseSet(b.dataset.set);
    showTab(b.dataset.tab, { focus: true });
  },
  'sr-group': (b) => {
    const group = b.dataset.group === 'browse' ? 'browse' : 'look';
    showTab(sr.last[group], { focus: group === 'look' });
  },
  'sr-kanji': (b) => { const ch = sr.kept.kanji[Number(b.dataset.ix)]; if (ch) openKanjiPage(ch, b); },
  'sr-part-kanji': (b) => { const ch = sr.partsKept.kanji[Number(b.dataset.ix)]; if (ch) openKanjiPage(ch, b); },
  'sr-read': (b) => {
    const w = sr.kept.words[Number(b.dataset.ix)];
    if (!w) return;
    openReader();
    loadText(w, { source: 'typed' }).catch(() => {});
  },
  'sr-part': (b) => {
    const p = sr.partsKept.parts[Number(b.dataset.ix)];
    if (!p || b.getAttribute('aria-disabled') === 'true') return;
    if (sr.chosen.has(p)) sr.chosen.delete(p);
    else sr.chosen.add(p);
    paintParts().then(() => focusPart(p));
  },
  'sr-parts-clear': () => {
    sr.chosen.clear();
    paintParts().then(() => $('sr-title')?.focus({ preventScroll: true }));
  },
};

/** Open Search on the kana chart, where the rows a learner knows are marked. */
export function openKanaChart() {
  location.hash = '#/search';
  showTab('kana');
  document.querySelector('#sr-kana [data-act="kc-row"]')?.focus({ preventScroll: true });
}

/** Open Search on the Words tab with `q` in the field, and search it now. */
export function searchFor(q) {
  const input = $('sr-input');
  sr.query = String(q || '');
  if (input) input.value = sr.query;
  sr.tab = 'words';
  location.hash = '#/search';
  run();
}

export function bindSearch() {
  const input = $('sr-input');
  if (input) {
    input.addEventListener('input', () => {
      sr.query = input.value;
      runSoon();
    });
    // Enter searches now; the form is not a form, so nothing is submitted.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sr.query = input.value; run(); }
    });
  }
  // A language switch repaints the tab that shows; the field keeps its query.
  afterPaintAll(() => {
    if (!$('search') || $('search').hidden) return;
    if (sr.tab === 'words' && sr.query.trim()) run();
    else if (sr.tab !== 'words') showTab(sr.tab);
  });
  onRoute((next, prev, { boot = false } = {}) => {
    if (next !== 'search') return;
    showTab(sr.tab);
    if (sr.tab === 'words' && !sr.query.trim()) run();
    if (boot) return;
    if (sr.tab === 'words' && input) input.focus({ preventScroll: true });
    else $('sr-title')?.focus({ preventScroll: true });
  });
}
