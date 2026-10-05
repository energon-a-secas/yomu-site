// What the reader says about the collection and about History: the card
// that asks once whether to remember texts, the "You read this before" line,
// the toast after a read that collected a kanji, and the line that says where
// a kanji was last seen (on the My kanji list and in the Collection's
// dialog).
//
// The card and the line sit under the status line and are painted with it
// (render-chrome.js paintStatus calls paintRemember), so they follow every
// read, every Clear and every language switch. The line is a polite live
// region that stays in the page with only its text changing, the same rule
// the status line keeps, and it changes only when what it says changes.
//
// A last-seen sentence comes from History, so it is drawn only while
// remembering is on; a kanji whose text was forgotten, or that was met while
// it was off, says what kind of text it was met in instead. The sentence is
// text nodes, the kanji in a <mark>, never an attribute.

import { $, h, fill, showToast } from './utils.js';
import { ui, currentLang } from './strings.js';
import { state } from './state.js';
import { isLexical } from './reader.js';
import { myKanji, dayOf, addDays } from './kanji-store.js';
import { myHistory, sentenceAround } from './history-store.js';
import { loadJoyo, progress, crossed } from './collection.js';
import { dayText, today } from './render-save.js';

/** A shelf's name: "1st grade", ..., "Secondary school". */
export function gradeName(grade) {
  return ui(`grade${grade}`);
}

/** A count in the reader's language: 2,136 or 2136. */
export function count(n) {
  return Number(n).toLocaleString(currentLang());
}

/** "today", "yesterday" or "on Oct 2", for a timestamp. */
export function whenText(ms, now = today()) {
  const day = dayOf(ms);
  if (day === now) return ui('whenToday');
  if (day === addDays(now, -1)) return ui('whenYesterday');
  return ui('whenOn', { day: dayText(day, now) });
}

/** Whether a read found Japanese to read: a word, not only Latin letters or punctuation. */
export function hasJapanese(analysis) {
  return !!analysis && Array.isArray(analysis.tokens) && analysis.tokens.some((t) => isLexical(t) && t.kind !== 'latin');
}

// ── The reader ────────────────────────────────────────────────────────────

/** What History knew before, in words. */
export function seenBeforeText(before) {
  if (!before) return '';
  if (before.partial) {
    return ui(before.partial.kind === 'inside' ? 'partInside' : 'partHolds', { when: whenText(before.partial.last) });
  }
  return ui(before.n === 1 ? 'seenBeforeOnce' : 'seenBeforeMany', { n: before.n, when: whenText(before.last) });
}

let shown = '';

/**
 * The ask card: while the learner has not answered, after a read that found
 * Japanese. The banner: while remembering is on and History knew the text
 * on screen.
 */
export function paintRemember(s = state) {
  const card = $('remember-ask');
  if (card) card.hidden = !(s.prefs.remember === 'ask' && s.text.trim() && hasJapanese(s.analysis));
  const line = $('seen-before');
  if (!line) return;
  const msg = s.prefs.remember === 'on' && s.text.trim() ? seenBeforeText(s.seenBefore) : '';
  if (msg === shown && (msg !== '') === !!line.firstChild) return;
  shown = msg;
  fill(line, msg ? [msg, ' ', h('a', { class: 'text-link', href: '#/kanji/history' }, ui('navHistory'))] : []);
}

/**
 * After a read that was not a restore: name the kanji it collected for the
 * first time, and once the jōyō list is in, how far along the list the
 * learner is and any milestone the read crossed. The list is fetched here
 * the first time, never on boot; a failure leaves the toast without the count.
 */
export function announceCollected(fresh, mine = myKanji()) {
  loadJoyo().catch(() => null);          // the first read with kanji fetches the list
  const firsts = (fresh || []).filter((ch) => mine.seenOf(ch) && mine.seenOf(ch).n === 1);
  if (!firsts.length) return Promise.resolve(null);
  const head = ui(firsts.length === 1 ? 'toastNewOne' : 'toastNewMany', { list: firsts.join(' ') });
  return loadJoyo().then((joyo) => {
    const seen = mine.data.seen;
    const without = { ...seen };
    for (const ch of firsts) delete without[ch];
    const after = progress(joyo, seen);
    const step = crossed(progress(joyo, without), after);
    const parts = [head, ui('toastJoyo', { have: count(after.have), total: count(after.total) })];
    for (const grade of step.grades) parts.push(ui('toastGrade', { grade: gradeName(grade) }));
    if (step.counts.length) parts.push(ui('toastCount', { n: count(step.counts[step.counts.length - 1]) }));
    return parts.join(' ');
  }, () => head).then((msg) => {
    showToast(msg, { duration: 5000 });
    return msg;
  });
}

// ── Where a kanji was last seen ───────────────────────────────────────────

const SOURCE_LINE = {
  paste: 'lastSeenPaste',
  typed: 'lastSeenTyped',
  example: 'lastSeenExample',
  phrase: 'lastSeenPhrase',
  host: 'lastSeenHost',
  link: 'lastSeenLink',
  history: 'lastSeenHistory',
};

/** The remembered text a kanji was last met in, while remembering is on, or null. */
function rememberedText(seen) {
  if (!seen || !seen.h || state.prefs.remember !== 'on') return null;
  const entry = myHistory().entry(seen.h);
  return entry ? entry.t : null;
}

/**
 * "Last seen in: 今日は雨です。" with the kanji marked, when its text is
 * remembered; otherwise "Last seen Oct 2, in a text you pasted", or just the
 * day when the kind of text is not known. Null for a kanji never met.
 */
export function lastSeenLine(ch, seen, now = today()) {
  if (!seen) return null;
  const around = sentenceAround(rememberedText(seen), ch);
  if (around) {
    return h('p', { class: 'mk-last' }, [
      h('span', { class: 'kj-key' }, ui('lastSeenIn')), ' ',
      h('span', { class: 'mk-sentence', lang: 'ja' }, [around.before, h('mark', null, around.ch), around.after].filter((x) => x !== '')),
    ]);
  }
  const key = SOURCE_LINE[seen.src] || 'lastSeen';
  return h('p', { class: 'mk-last mk-meta' }, ui(key, { day: dayText(seen.last, now) }));
}
