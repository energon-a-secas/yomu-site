// The Collections tab of Search: which set shows, its filter, Show more, and
// Read it. js/sets.js is the logic, render-sets.js draws. The filter lives in
// its field and in memory, never in the address or in storage.

import { $, fill, h, debounce } from './utils.js';
import { ui } from './strings.js';
import { fetchJson } from './reader.js';
import { createSets, rowMatches, SET_IDS, SET_PAGE } from './sets.js';
import { setPickNodes, setListNodes } from './render-sets.js';
import { openReader } from './events-kanji.js';
import { loadText } from './events-read.js';

const st = {
  set: SET_IDS[0],
  filter: '',
  shown: SET_PAGE,
  kept: [],
  token: 0,
};

let store = null;
const sets = () => { store = store || createSets({ fetchJson }); return store; };

function setStatus(text) {
  const el = $('sr-set-status');
  if (el) el.textContent = text;
}

/** Draw the picker and the list; a paint that a newer one overtook draws nothing. */
export async function paintSets() {
  const pick = $('sr-set-pick');
  const list = $('sr-set-list');
  if (!pick || !list) return;
  const token = ++st.token;
  fill(pick, setPickNodes(st.set));
  setStatus(ui('setsLoading'));
  try {
    const rows = await sets().rows(st.set);
    if (token !== st.token) return;
    const found = rows.filter((r) => rowMatches(r, st.filter));
    const { nodes, kept, status } = setListNodes(found, rows.length, st.shown);
    st.kept = kept;
    fill(list, nodes);
    setStatus(status);
  } catch (err) {
    if (token !== st.token) return;
    if (typeof console !== 'undefined') console.warn('[yomu] collections', err);
    fill(list, h('p', { class: 'word-warn', role: 'alert' }, ui('searchFailed')));
    setStatus('');
  }
}

const paintSoon = debounce(() => paintSets(), 180);

export const SETS_ACTIONS = {
  'set-pick': (b) => {
    if (!SET_IDS.includes(b.dataset.set)) return;
    st.set = b.dataset.set;
    st.shown = SET_PAGE;
    paintSets().then(() => document.querySelector(`#sr-set-pick [data-set="${st.set}"]`)?.focus({ preventScroll: true }));
  },
  'set-more': () => {
    const from = st.shown;
    st.shown += SET_PAGE;
    // Focus goes to the first row the press added, so a keyboard carries on where the list grew.
    paintSets().then(() => document.querySelectorAll('#sr-set-list .sr-read')[from]?.focus());
  },
  'set-read': (b) => {
    const w = st.kept[Number(b.dataset.ix)];
    if (!w) return;
    openReader();
    loadText(w, { source: 'typed' }).catch(() => {});
  },
};

export function bindSets() {
  const input = $('sr-set-filter');
  if (!input) return;
  input.addEventListener('input', () => {
    st.filter = input.value;
    st.shown = SET_PAGE;
    paintSoon();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) e.preventDefault();
  });
}
