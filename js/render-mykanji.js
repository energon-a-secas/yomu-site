// The My kanji screen (#/kanji): what is due, what is saved, what was met
// often and not saved, and the backup. A list is a list: one hairline between
// items, no cards, and the accent spent on nothing but the one Start review.
//
// Every button that acts on a kanji finds it through data-ix, its place in
// the list this file last drew (view.saved, view.often), so no character is
// written into an attribute here either. A repaint draws both lists again
// from the store and hands focus to what took the place of the button that
// was pressed, so removing or saving a kanji never drops focus on <body>.
//
// Meanings and readings are not in the store: they come from the kanji
// dictionary through reader.js kanjiInfo(), once per screen, into view.info.
// Until they arrive a row shows its kanji, its counts and its words.

import { $, h, fill } from './utils.js';
import { ui } from './strings.js';
import { toHira } from './kana.js';
import { toHiragana } from './vendor/wanakana.js';
import { myKanji, dayOf } from './kanji-store.js';
import { saveToggle, seenText, wordRuby, dayText, today, withKanji } from './render-save.js';

export const SORTS = Object.freeze(['recent', 'seen', 'due']);
const SORT_LABEL = { recent: 'sortRecent', seen: 'sortSeen', due: 'sortDue' };
export const OFTEN_LIMIT = 20;

/** The screen's own state: what it drew, how it is sorted, what it knows. */
export const view = {
  mode: 'list',               // list | review
  sort: 'recent',
  filter: '',
  saved: [],                  // the chars of the Saved list, as drawn (data-ix)
  often: [],                  // the chars of Seen often, as drawn
  info: new Map(),            // char -> kanji dictionary record
  infoState: 'idle',          // idle | loading | ready | error
  infoError: '',
  note: '',                   // the last action's result, said in #mk-note
};

/** "on テン、 kun あめ" as nodes, or null. */
export function readingsLine(info) {
  if (!info) return null;
  const part = (label, items) => (Array.isArray(items) && items.length
    ? h('span', { class: 'kj-read' }, [h('span', { class: 'kj-key' }, label), ' ', h('span', { lang: 'ja' }, items.join('、'))])
    : null);
  const on = part(ui('onReading'), info.on);
  const kun = part(ui('kunReading'), info.kun);
  return on || kun ? h('p', { class: 'mk-reads' }, [on, kun]) : null;
}

export function meaningText(info, max = 4) {
  return info && Array.isArray(info.m) ? info.m.slice(0, max).join(', ') : '';
}

/** "Met in 天気 天" with furigana, or null. */
export function wordsLine(words) {
  if (!Array.isArray(words) || !words.length) return null;
  return h('p', { class: 'mk-words' }, [
    h('span', { class: 'kj-key' }, ui('metIn')), ' ',
    ...words.flatMap((w, i) => [i ? ' ' : null, wordRuby(w)]).filter(Boolean),
  ]);
}

// ── Sorting and the filter ────────────────────────────────────────────────

export function sortSaved(data, chars, sort) {
  const rec = (ch) => data.saved[ch];
  const n = (ch) => (data.seen[ch] ? data.seen[ch].n : 0);
  const list = chars.slice();
  if (sort === 'seen') list.sort((a, b) => n(b) - n(a) || rec(b).at - rec(a).at);
  else if (sort === 'due') list.sort((a, b) => (rec(a).due < rec(b).due ? -1 : rec(a).due > rec(b).due ? 1 : rec(a).box - rec(b).box || rec(a).at - rec(b).at));
  else list.sort((a, b) => rec(b).at - rec(a).at);
  return list;
}

/**
 * Does a saved kanji match the filter: its character, a meaning, an on or
 * kun reading, or a word it was met in. Kana is folded to hiragana and
 * romaji is read as kana too, so "ten", "てん" and "テン" all find 天.
 */
export function matches(ch, info, seen, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const kana = toHira(q);
  const fromRomaji = /^[a-z' -]+$/.test(q) ? toHiragana(q.replace(/[ -]/g, '')) : '';
  const hay = [
    ch,
    ...(info && Array.isArray(info.m) ? info.m.map((m) => String(m).toLowerCase()) : []),
    ...(info ? [...(info.on || []), ...(info.kun || [])].map((r) => toHira(String(r)).replace(/[.-]/g, '')) : []),
    ...(seen && Array.isArray(seen.words) ? seen.words.flat() : []),
  ];
  return hay.some((x) => x.includes(q) || (kana && x.includes(kana)) || (fromRomaji && /^[぀-ゟ]+$/.test(fromRomaji) && x.includes(fromRomaji)));
}

// ── Sections ──────────────────────────────────────────────────────────────

function sectionHead(id, key, count) {
  return h('h3', { class: 'mk-sec-title', id, tabindex: '-1' }, [
    ui(key),
    Number.isInteger(count) ? h('span', { class: 'mk-count' }, ` ${count}`) : null,
  ]);
}

function dueSection(mine, now) {
  const due = mine.due(now).length;
  const saved = Object.keys(mine.data.saved).length;
  let line;
  if (due) line = ui(due === 1 ? 'dueOne' : 'dueMany', { n: due });
  else if (saved) {
    const next = mine.nextDue(now);
    line = next ? ui('dueNone', { day: dayText(next.day, now) }) : ui('reviewNothing');
  } else line = ui('dueEmpty');
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'mk-due-h' }, [
    sectionHead('mk-due-h', 'dueHead', due),
    h('p', { class: 'mk-line' }, line),
    due ? h('p', { class: 'mk-actions' }, h('button', { type: 'button', class: 'btn btn--primary', 'data-act': 'mk-start' }, ui('startReview'))) : null,
  ]);
}

function savedItem(ch, ix, mine, now) {
  const info = view.info.get(ch);
  const rec = mine.savedOf(ch);
  const seen = mine.seenOf(ch);
  const meta = [
    seen ? seenText(seen.n) : ui('notSeen'),
    ui('savedOn', { day: dayText(dayOf(rec.at), now) }),
    ui('dueOn', { day: dayText(rec.due <= now ? now : rec.due, now) }),
  ];
  return h('li', { class: 'mk-item' }, [
    h('span', { class: 'mk-char', lang: 'ja' }, ch),
    h('div', { class: 'mk-main' }, [
      meaningText(info) ? h('p', { class: 'mk-mean', lang: 'en' }, meaningText(info)) : null,
      readingsLine(info),
      h('p', { class: 'mk-meta' }, meta.join(' · ')),
      wordsLine(seen && seen.words),
    ]),
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm mk-remove', 'data-act': 'mk-remove', 'data-ix': ix }, [
      h('span', { 'aria-hidden': 'true' }, ui('remove')),
      h('span', { class: 'sr-only' }, withKanji('removeKanji', ch)),
    ]),
  ]);
}

/** The Saved list alone: the filter and the sort repaint only this. */
export function savedListNodes(mine, now = today()) {
  const all = sortSaved(mine.data, Object.keys(mine.data.saved), view.sort);
  const shown = all.filter((ch) => matches(ch, view.info.get(ch), mine.seenOf(ch), view.filter));
  view.saved = shown;
  if (!all.length) return [h('p', { class: 'mk-empty' }, ui('savedEmpty'))];
  if (!shown.length) return [h('p', { class: 'mk-empty' }, ui('filterNone'))];
  return [h('ul', { class: 'mk-list', role: 'list' }, shown.map((ch, ix) => savedItem(ch, ix, mine, now)))];
}

function savedSection(mine, now) {
  const count = Object.keys(mine.data.saved).length;
  const controls = count ? h('div', { class: 'mk-controls' }, [
    h('div', { class: 'seg', role: 'group', 'aria-labelledby': 'mk-sort-label' }, [
      h('span', { class: 'seg-label', id: 'mk-sort-label' }, ui('sortBy')),
      ...SORTS.map((s) => h('button', {
        type: 'button', class: 'seg-btn', 'data-act': 'mk-sort', 'data-sort': s, 'aria-pressed': String(view.sort === s),
      }, ui(SORT_LABEL[s]))),
    ]),
    h('div', { class: 'mk-filter' }, [
      h('label', { class: 'seg-label', for: 'mk-filter' }, ui('filter')),
      h('input', {
        type: 'search', id: 'mk-filter', class: 'mk-filter-input', autocomplete: 'off', spellcheck: 'false',
        'aria-describedby': 'mk-filter-hint', 'aria-controls': 'mk-saved-list',
      }),
      h('span', { class: 'sr-only', id: 'mk-filter-hint' }, ui('filterHint')),
    ]),
  ]) : null;
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'mk-saved-h' }, [
    sectionHead('mk-saved-h', 'savedHead', count),
    controls,
    h('div', { id: 'mk-saved-list' }, savedListNodes(mine, now)),
  ]);
}

function oftenSection(mine) {
  const seenAny = Object.keys(mine.data.seen).length > 0;
  const chars = mine.often(OFTEN_LIMIT);
  view.often = chars;
  let body;
  if (!seenAny) body = h('p', { class: 'mk-empty' }, ui('oftenEmpty'));
  else if (!chars.length) body = h('p', { class: 'mk-empty' }, ui('oftenAllSaved'));
  else {
    body = h('ul', { class: 'mk-list mk-list--often', role: 'list' }, chars.map((ch, ix) => {
      const info = view.info.get(ch);
      const seen = mine.seenOf(ch);
      return h('li', { class: 'mk-item' }, [
        h('span', { class: 'mk-char mk-char--sm', lang: 'ja' }, ch),
        h('div', { class: 'mk-main' }, [
          meaningText(info, 3) ? h('p', { class: 'mk-mean', lang: 'en' }, meaningText(info, 3)) : null,
          h('p', { class: 'mk-meta' }, seenText(seen.n)),
          wordsLine(seen.words.slice(-3)),
        ]),
        saveToggle(ch, false, { 'data-act': 'mk-save', 'data-ix': ix }),
      ]);
    }));
  }
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'mk-often-h' }, [sectionHead('mk-often-h', 'oftenHead'), body]);
}

function backupSection() {
  return h('section', { class: 'mk-sec', 'aria-labelledby': 'mk-backup-h' }, [
    sectionHead('mk-backup-h', 'backupHead'),
    h('p', { class: 'quiet' }, ui('backupLead')),
    h('p', { class: 'mk-actions' }, [
      h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'mk-export' }, ui('exportFile')),
      h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'mk-import' }, ui('importFile')),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm mk-danger', 'data-act': 'mk-clear', 'aria-haspopup': 'dialog' }, ui('clearAll')),
    ]),
  ]);
}

/** The one line under the title: the store's health, loading, or the last action. */
export function paintNote(mine = myKanji()) {
  const el = $('mk-note');
  if (!el) return;
  const lines = [];
  if (mine.note === 'damaged') lines.push(ui('storeDamaged'));
  else if (mine.note === 'partial') lines.push(ui('storePartial', { n: mine.dropped }));
  if (!mine.writable) lines.push(ui('storeBlocked'));
  if (view.infoState === 'loading') lines.push(ui('loadingKanji'));
  else if (view.infoState === 'error') lines.push(ui('kanjiInfoFailed', { detail: view.infoError }));
  if (view.note) lines.push(view.note);
  const text = lines.join(' ');
  if (el.textContent !== text) el.textContent = text;
  el.hidden = !text;
}

/** The list screen: due, saved, seen often, backup. */
export function listNodes(mine = myKanji(), now = today()) {
  return [dueSection(mine, now), savedSection(mine, now), oftenSection(mine), backupSection()];
}

/** Draw the list screen into #mk-body, keeping the filter's text and focus. */
export function paintList(mine = myKanji()) {
  const body = $('mk-body');
  if (!body) return;
  const now = today();
  fill(body, listNodes(mine, now));
  const input = $('mk-filter');
  if (input) input.value = view.filter;
  paintNote(mine);
}

/** Repaint the Saved list only, so the filter box keeps focus while typing. */
export function paintSavedList(mine = myKanji()) {
  const list = $('mk-saved-list');
  if (list) fill(list, savedListNodes(mine));
  for (const b of document.querySelectorAll('[data-act="mk-sort"]')) b.setAttribute('aria-pressed', String(b.dataset.sort === view.sort));
}
