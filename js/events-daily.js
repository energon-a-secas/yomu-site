// The kanji of the day on the empty page (js/daily.js picks it).
//
// The empty page fetched nothing before this, and it still fetches nothing
// until the browser is idle, and never in an embed: one small file,
// data/kpage/daily.json, with plain fetch, so it never counts toward a read's
// progress. A failure leaves the slot hidden; the card is a nicety.

import { $, fill, h } from './utils.js';
import { ui } from './strings.js';
import { wordRuby, today, withKanji } from './render-save.js';
import { dailyOf } from './daily.js';
import { afterEmpty } from './render.js';
import { openKanjiPage } from './events-kanji-page.js';

const SRC = 'data/kpage/daily.json';
let doc = null;
let loading = null;
let shown = null;

function load() {
  if (doc) return Promise.resolve(doc);
  if (!loading) {
    loading = fetch(new URL(SRC, document.baseURI))
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((d) => { doc = d; return d; })
      .catch((err) => { loading = null; throw err; });
  }
  return loading;
}

function draw(slot, day) {
  shown = day.ch;
  fill(slot, [
    h('h2', { class: 'daily-title', id: 'daily-title' }, ui('dailyTitle')),
    h('div', { class: 'daily-body' }, [
      h('button', { type: 'button', class: 'daily-char', 'data-act': 'daily-open' }, [
        h('span', { lang: 'ja', 'aria-hidden': 'true' }, day.ch),
        h('span', { class: 'sr-only' }, withKanji('openKanjiPage', day.ch)),
      ]),
      h('div', { class: 'daily-text' }, [
        h('p', { class: 'daily-mean', lang: 'en' }, day.meaning),
        h('p', { class: 'daily-word' }, [wordRuby([day.word, day.reading]), ' ', h('span', { class: 'quiet', lang: 'en' }, day.gloss)]),
        h('button', { type: 'button', class: 'text-link', 'data-act': 'daily-open' }, ui('dailyOpen')),
      ]),
    ]),
  ]);
  slot.hidden = false;
}

function paintDaily() {
  const slot = $('daily');
  if (!slot || document.documentElement.dataset.embed === '1') return;
  const go = () => load().then((d) => {
    const day = dailyOf(d, today());
    if (day && slot.isConnected) draw(slot, day);
  }).catch(() => {});
  if (doc) go();
  else if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 3000 });
  else setTimeout(go, 800);
}

export const DAILY_ACTIONS = {
  'daily-open': (b) => { if (shown) openKanjiPage(shown, b); },
};

export function bindDaily() {
  afterEmpty(paintDaily);
  paintDaily();
}
