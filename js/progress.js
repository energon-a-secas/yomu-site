// My progress (#/kanji/progress): what the learner has read, computed from
// what My kanji, History and the jōyō list already hold. No DOM, and nothing
// stored: every figure is derived on each paint.
//
// What the stores can say: a kanji's first and last day met (`seen.first`,
// `seen.last`, YYYY-MM-DD), when it was saved (`saved.at`, ms) and its review
// box, and a text's first and last read (History, ms, only while Remember is
// on or for a saved phrase). Reviews keep a count but no dates, so there is no
// reviews-per-day figure, and none is invented.

import { dayOf, addDays, TOP_BOX } from './kanji-store.js';
import { progress, nextToCollect } from './collection.js';

/** The periods the screen offers, in its order. */
export const PERIODS = Object.freeze(['week', 'month', 'all']);

/** Days a period's bars cover, one bar a day; 'all' is by month instead. */
const SPAN = Object.freeze({ week: 7, month: 30 });

/** Months the 'all' chart shows at most, the latest last. */
export const MONTHS = 12;

/** Unmet jōyō kanji "Next up" names. */
export const NEXT_UP = 7;

const monthOf = (day) => day.slice(0, 7);

function prevMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * The bars of new kanji: one a day for a week or a month, ending today; one
 * a month for 'all', from the first month anything was met (at most MONTHS).
 * @returns {{ label: string, n: number }[]}
 */
export function newByTime(seen, today, period) {
  const firsts = Object.values(seen || {}).filter((s) => s && s.n >= 1).map((s) => s.first);
  if (period in SPAN) {
    const days = Array.from({ length: SPAN[period] }, (_, i) => addDays(today, i - SPAN[period] + 1));
    const count = new Map(days.map((d) => [d, 0]));
    for (const f of firsts) if (count.has(f)) count.set(f, count.get(f) + 1);
    return days.map((d) => ({ label: d, n: count.get(d) }));
  }
  const last = monthOf(today);
  const earliest = firsts.length ? monthOf(firsts.reduce((a, b) => (a < b ? a : b))) : last;
  const months = [last];
  while (months.length < MONTHS && months[0] > earliest) months.unshift(prevMonth(months[0]));
  const count = new Map(months.map((m) => [m, 0]));
  for (const f of firsts) if (count.has(monthOf(f))) count.set(monthOf(f), count.get(monthOf(f)) + 1);
  return months.map((m) => ({ label: m, n: count.get(m) }));
}

/** The first day a period counts from, or '' for all of it. */
export function periodStart(today, period) {
  return period in SPAN ? addDays(today, 1 - SPAN[period]) : '';
}

/**
 * Everything the screen draws.
 * @param {{ kanji: { saved: object, seen: object }, entries: object, joyo: object|null, today: string, period: string, due: number }} o
 *   `entries` are History's (key to { first, last, ... }); `joyo` is
 *   collection.js loadJoyo()'s, or null while it loads; `due` the count due today.
 */
export function progressOf({ kanji, entries = {}, joyo = null, today, period = 'week', due = 0 }) {
  const from = periodStart(today, period);
  const seen = Object.values(kanji.seen || {}).filter((s) => s && s.n >= 1);
  const texts = Object.values(entries || {}).filter((e) => e && dayOf(e.last) >= from).length;
  const boxes = Array.from({ length: TOP_BOX + 1 }, () => 0);
  let saved = 0;
  for (const rec of Object.values(kanji.saved || {})) {
    if (!rec) continue;
    boxes[Math.min(TOP_BOX, Math.max(0, rec.box | 0))] += 1;
    if (dayOf(rec.at) >= from) saved += 1;
  }
  const shelves = joyo ? progress(joyo, kanji.seen) : null;
  return {
    period,
    texts,
    met: seen.filter((s) => s.last >= from).length,
    fresh: seen.filter((s) => s.first >= from).length,
    saved,
    bars: newByTime(kanji.seen, today, period),
    grades: shelves ? shelves.byGrade : null,
    boxes,
    due,
    next: joyo ? nextToCollect(joyo, kanji.seen, NEXT_UP) : [],
  };
}
