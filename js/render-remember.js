// What the reader says about the collection and about History: the card
// that asks once whether to remember texts, the bookmark that saves the text
// on screen, the "You read this before" line, the toast after a read that
// collected a kanji, and the line that says where a kanji was last seen (on
// the My kanji list and in the Collection's dialog).
//
// The card and the line sit under the status line and are painted with it
// (render-chrome.js paintStatus calls paintRemember), so they follow every
// read, every Clear and every language switch. The line is a polite live
// region that stays in the page with only its text changing, the same rule
// the status line keeps, and it changes only when what it says changes.
//
// A last-seen sentence comes from History, so it is drawn while remembering
// is on, or, whatever Remember says, when the text was saved on purpose; a
// kanji whose text was forgotten, or that was met in a text not kept, says
// what kind of text it was met in instead. The sentence is text nodes, the
// kanji in a <mark>, never an attribute.

import { $, h, fill, showToast } from './utils.js';
import { ui, currentLang } from './strings.js';
import { state } from './state.js';
import { isLexical } from './reader.js';
import { myKanji, dayOf, addDays } from './kanji-store.js';
import { myHistory, sentenceAround, textKey, isSaved } from './history-store.js';
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

/** The text a settled read read, when it found Japanese: what the bookmark saves. */
export function readText(s = state) {
  const a = s.analysis;
  return s.text.trim() && hasJapanese(a) && typeof a.read === 'string' ? a.read : null;
}

// One key per reading, not one hash of up to 2,000 characters per paint.
const keys = new WeakMap();
function readKey(a) {
  if (!keys.has(a)) keys.set(a, textKey(a.read));
  return keys.get(a);
}

/**
 * The ask card: while the learner has not answered, after a read that found
 * Japanese. The bookmark: after the same read, whatever Remember says,
 * pressed while that text is saved. The banner: while History knew the text
 * on screen, which with Remember off is only ever a saved text.
 */
export function paintRemember(s = state) {
  const card = $('remember-ask');
  const text = readText(s);
  if (card) card.hidden = !(s.prefs.remember === 'ask' && text !== null);
  const star = $('save-text');
  if (star) {
    star.hidden = text === null;
    const pressed = text !== null && myHistory().isSaved(readKey(s.analysis));
    if (star.getAttribute('aria-pressed') !== String(pressed)) star.setAttribute('aria-pressed', String(pressed));
  }
  const line = $('seen-before');
  if (!line) return;
  const msg = s.text.trim() ? seenBeforeText(s.seenBefore) : '';
  if (msg === shown && (msg !== '') === !!line.firstChild) return;
  shown = msg;
  fill(line, msg ? [msg, ' ', h('a', { class: 'text-link', href: '#/kanji/history' }, ui('navHistory'))] : []);
}

/**
 * Say something that would be a toast. In an embed it is a line under the
 * status instead: the frame is as tall as its page, so a toast fixed to the
 * bottom of the frame sat below what the host's sheet shows, and nobody saw
 * it. The line stays until the next reading session begins (clearNote).
 */
export function notify(msg, duration = 5000) {
  const line = $('embed-note');
  if (state.embed && line) {
    fill(line, msg);
    line.hidden = false;
    return;
  }
  showToast(msg, { duration });
}

export function clearNote() {
  const line = $('embed-note');
  if (line && !line.hidden) { fill(line, []); line.hidden = true; }
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
    notify(msg, 5000);
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

/** The text a kanji was last met in, while remembering is on or when that text is saved, or null. */
function rememberedText(seen) {
  if (!seen || !seen.h) return null;
  const entry = myHistory().entry(seen.h);
  return entry && (state.prefs.remember === 'on' || isSaved(entry)) ? entry.t : null;
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
