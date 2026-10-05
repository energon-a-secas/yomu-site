// The small pieces every My kanji surface shares: the save toggle (for a
// kanji, and for a text on History's rows), "seen 3 times", a stored word
// with its furigana, and a due day in words.
//
// The save toggle is a real button with aria-pressed, and its name says which
// kanji it saves ("Save 天 to My kanji"). That name is built from text nodes,
// the kanji in a lang="ja" span inside a visually hidden label, because no
// character a learner read is ever written into an attribute (CLAUDE.md, "The
// text stays in the browser"); a button's name is its content when it has no
// aria-label, so nothing is lost. The visible part is a bookmark, outlined
// while the kanji is not saved and filled once it is.

import { $, h } from './utils.js';
import { ui, currentLang } from './strings.js';
import { align } from './furigana.js';
import { myKanji, dayOf, addDays } from './kanji-store.js';

const SVG = 'http://www.w3.org/2000/svg';

/** A ui string with {ch} in it as nodes: the kanji in a lang="ja" span. */
export function withKanji(key, ch, vars) {
  const raw = ui(key, vars);
  const at = raw.indexOf('{ch}');
  if (at < 0) return [raw];
  return [raw.slice(0, at), h('span', { lang: 'ja' }, ch), raw.slice(at + 4)].filter((x) => x !== '');
}

function bookmark() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'save-icon');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M7 3.5h10a1 1 0 0 1 1 1V20.5l-6-4.2-6 4.2V4.5a1 1 0 0 1 1-1Z');
  svg.appendChild(path);
  return svg;
}

/**
 * The save toggle for one kanji. `attrs` says how the click finds the kanji
 * again: data-kid in the reader (the analysis' kanji list), data-ix on the
 * My kanji screen (the list it drew).
 */
export function saveToggle(ch, saved, attrs) {
  return h('button', { type: 'button', class: 'save-toggle', 'aria-pressed': saved ? 'true' : 'false', ...attrs }, [
    bookmark(),
    h('span', { class: 'sr-only' }, withKanji('saveKanji', ch)),
  ]);
}

/**
 * The save toggle for a text, on a History row: the same bookmark, named
 * "Save this text" in text nodes and never by the text itself. `attrs` finds
 * the row (data-ix) and points aria-describedby at the row's text, by id.
 * The reader's own (#save-text) is in index.html.
 */
export function textToggle(saved, attrs) {
  return h('button', { type: 'button', class: 'save-toggle', 'aria-pressed': saved ? 'true' : 'false', ...attrs }, [
    bookmark(),
    h('span', { class: 'sr-only' }, ui('saveText')),
  ]);
}

/** "seen 3 times", "first time" (or "seen once" on the list), or '' before the first count. */
export function seenText(n, onList = false) {
  if (!Number.isInteger(n) || n < 1) return '';
  // Beside the text it was just met in, once is the first time; on the My
  // kanji list, which is about every text, it is once.
  if (n === 1) return ui(onList ? 'seenOnce' : 'seenFirst');
  return ui('seenTimes', { n });
}

/** A stored [written, reading] pair, with its furigana. */
export function wordRuby([written, reading]) {
  let parts;
  try { parts = align(written, reading).furigana; } catch { parts = [{ text: written, ruby: reading }]; }
  return h('span', { class: 'mk-word', lang: 'ja' }, parts.map((p) => (p.ruby
    ? h('ruby', null, [p.text, h('rt', null, p.ruby)])
    : p.text)));
}

/** The day this page treats as today. One place, so a test can see what the page sees. */
export function today() {
  return dayOf(new Date());
}

/** A YYYY-MM-DD day in words: today, tomorrow, or a short date. */
export function dayText(day, now = today()) {
  if (day === now) return ui('today');
  if (day === addDays(now, 1)) return ui('tomorrow');
  const [y, m, d] = day.split('-').map(Number);
  const opts = { month: 'short', day: 'numeric' };
  if (String(y) !== now.slice(0, 4)) opts.year = 'numeric';
  try {
    return new Date(y, m - 1, d).toLocaleDateString(currentLang(), opts);
  } catch {
    return day;
  }
}

/**
 * The header's My kanji link and the embed bar's: how many reviews are due,
 * shown as a number and said in words.
 */
export function paintDueCount() {
  const n = myKanji().due(today()).length;
  for (const el of document.querySelectorAll('[data-due-count]')) {
    el.hidden = n === 0;
    el.replaceChildren(
      h('span', { class: 'mk-due-n', 'aria-hidden': 'true' }, String(n)),
      h('span', { class: 'sr-only' }, ui('dueCountSr', { n })),
    );
  }
}

/**
 * Bring every save toggle and every unsaved-kanji mark in the reader in line
 * with the store, in place: saving 天 clears its mark everywhere at once and
 * nothing is read again, rebuilt or moved, so focus stays on the button.
 */
export function paintSavedMarks(state) {
  const order = (state.analysis && state.analysis.order) || [];
  const mine = myKanji();
  const saved = order.map((ch) => mine.isSaved(ch));
  const body = $('reading-body');
  if (body) {
    for (const el of body.querySelectorAll('.kj[data-kid]')) {
      el.classList.toggle('is-unsaved', saved[Number(el.dataset.kid)] === false);
    }
  }
  for (const b of document.querySelectorAll('[data-act="save-kanji"][data-kid]')) {
    b.setAttribute('aria-pressed', String(!!saved[Number(b.dataset.kid)]));
  }
  paintDueCount();
}
