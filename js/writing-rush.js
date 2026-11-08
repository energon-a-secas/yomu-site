// Writing rush: timed writing over a group of kana or kanji, each character
// traced stroke by stroke and judged by the writing pad's own judge
// (strokes.js traceStroke, which the app calls as `trace` and whose verdict
// it passes on here). Asked for on 7 November 2026: a game "timed to write
// them with or without assistance", in rushes and marathons over groups of
// kana and kanji. No DOM, storage or clock: every time, the day and the seed
// are arguments (the seed falls back to Date.now(), as kanji cards' does), and
// the document is plain data the native file layer keeps.
//
// Groups (rushGroups): each script's ten gojūon rows of basic kana (the わ
// row holds わ, を and ん, as kana-rows.js files them) and all 46 of them;
// and the kanji sets kanji cards and Kana to kanji use: My kanji (the caller
// passes the saved kanji) and levels.js LEVELS (the school grades, the name
// kanji, JLPT N5 to N1, which the caller also passes). Only a character with
// a stroke order is dealt: the caller passes each one's number of strokes
// (`strokes`), and a character without a whole positive count is left out
// (64 of the name kanji have no KanjiVG drawing).
//
// Modes:
//   rush       30, 60 or 120 seconds. The group is dealt in a seeded random
//              order, dealt again in a new order whenever it runs out, and
//              with two characters or more never one twice in a row.
//   marathon   every character of the group once, in a seeded random order.
// Guides: with them the pad shows the faint character and the next stroke's
// start, as the writing pad does; without them, an empty square. The judge
// is the same either way; only what the verdicts say differs.
//
// What counts, stroke by stroke (act 'stroke' with the verdict of `trace`):
//   miss       a stroke the judge refuses for any reason but 'short'. The
//              learner draws that stroke again. A 'short' verdict is a tap,
//              not a stroke: it counts nothing and starts no clock.
//   shown      on the third miss of one stroke (ASSIST_AFTER) the stroke is
//              shown until it is traced, and its character is assisted.
//   written    a character whose last stroke was traced: in a rush, at or
//              before the deadline. A character still in progress at the
//              deadline counts for nothing, its misses and shown stroke too.
//   clean      a written character with no miss (so never assisted).
//   assisted   a written character that needed a shown stroke.
//   misses     every miss on the written characters.
//
// Time is the app's monotonic clock in milliseconds from the run's start,
// paused while the app is away, sent with every stroke: `at` when the finger
// lifted, `began` when it touched down. A time earlier than the latest one is
// read as the latest. The clock starts with the first stroke (its `began`)
// in both modes, as Play's timed game starts when the learner does: a rush
// ends `seconds` after it (the deadline), and a marathon's time runs from it
// to the moment the last character's last stroke was traced. The app sends
// 'time' when its countdown reaches the deadline; a stroke that ends after
// the deadline ends the run too, and is not counted.
//
// Bests: one per group, mode, guides and, in a rush, length (bestKey). A
// rush ranks by characters written, then clean ones, then fewer misses; a
// marathon by its time, then fewer misses, and only against a best over the
// same number of characters (My kanji grows: the first marathon over a new
// count sets that count's best). A run becomes the best only when it beats
// the best strictly and is not assisted. A run with an assisted character
// is kept in the recent results but never becomes a best, since a best is
// the learner's own writing; nor does a rush with nothing written. Runs with
// guides and runs without keep separate bests, so a guided run sets a guided
// best. The first eligible run of a key is its first best: `newBest` with no
// `previous`.
//
// The document, format RUSH_FORMAT:
//   bests    { key: record }       one per bestKey
//   recent   [record + best]       the last RECENT_KEPT runs, newest first
// A record is { group, mode, guides, seconds, ms, written, clean, misses,
// assisted, of, day }: `seconds` a rush's length (else null), `ms` a
// marathon's time (else null), `of` the group's dealable characters, `day`
// the YYYY-MM-DD the caller gave (or null); a recent one adds `best`, whether
// it set a new best. Each entry is read on its own, so a damaged one is
// dropped without the others, and anything dropped sets `recovered`. A run in
// progress is never in the document: it is not resumed, the app abandons it
// when it leaves the screen ('abandon'), and a load starts with none.
//
// What the learner reads (group names, verdicts, results, refusals) is in
// writing-rush-words.js, { en, es }, resolved by strings.js t() when a
// function is called.

import { t } from './strings.js';
import { isKanji, toKata } from './kana.js';
import { BASIC_KANA, kanaRomaji } from './kana-chart.js';
import { KANA_ROWS, rowOf } from './kana-rows.js';
import { LEVELS } from './levels.js';
import { makeRand, shuffle } from './play-rounds.js';
import { SAY, kanjiTitle, kanaTitle, strokeWords, shownWords, summaryOf, bestNote, optionWords, countWords } from './writing-rush-words.js';

export { clockText, summaryOf } from './writing-rush-words.js';

export const RUSH_FORMAT = 'yomu-writing-rush/1';
export const RUSH_MODES = Object.freeze(['rush', 'marathon']);
export const RUSH_SECONDS = Object.freeze([30, 60, 120]);
/** Misses on one stroke before it is shown. */
export const ASSIST_AFTER = 3;
export const RECENT_KEPT = 10;

const MAX_MS = 24 * 60 * 60 * 1000;
const MAX_STROKES = 64;
const CAP = 1000000;
const TROUBLE = 8;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const FIELDS = Object.freeze(['group', 'mode', 'guides', 'seconds', 'ms', 'written', 'clean', 'misses', 'assisted', 'of', 'day']);

const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (n) => Number.isSafeInteger(n) && n >= 0 && n <= CAP;
const isDay = (v) => typeof v === 'string' && DAY.test(v);
const timeOf = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_MS ? Math.round(v) : null);
const strokeCountOf = (strokes, ch) => {
  const n = object(strokes) && Object.hasOwn(strokes, ch) ? strokes[ch] : 0;
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_STROKES ? n : 0;
};

// ── Groups ──────────────────────────────────────────────────────────────

const GROUPS = Object.freeze([
  ...['hiragana', 'katakana'].flatMap((script) => {
    const show = script === 'katakana' ? toKata : (s) => s;
    const rows = KANA_ROWS.map((head) => ({
      id: `${script}-${kanaRomaji(head)}`, script, kind: 'kana',
      title: kanaTitle(show(head)),
      chars: BASIC_KANA.filter((k) => rowOf(k) === head).map(show),
    }));
    const all = { id: `${script}-all`, script, kind: 'kana', title: kanaTitle(null, script, BASIC_KANA.length), chars: BASIC_KANA.map(show) };
    return [...rows, all];
  }),
  { id: 'mine', script: 'kanji', kind: 'kanji', title: kanjiTitle(null), chars: null },
  ...LEVELS.map((level) => ({ id: level.id, script: 'kanji', kind: 'kanji', title: kanjiTitle(level), chars: null })),
].map((g) => Object.freeze(g)));

const groupOf = (id) => GROUPS.find((g) => g.id === id) || null;
const titleOf = (id) => t(groupOf(id)?.title);

/**
 * Every group, in a picker's order: each script's rows, then all 46, then My
 * kanji and the levels. A kana group lists its `chars`; a kanji group's
 * (null here) are the caller's: My kanji's saved ones or the level's.
 */
export function rushGroups() {
  return GROUPS.map((g) => ({ id: g.id, script: g.script, kind: g.kind, title: t(g.title), chars: g.chars ? [...g.chars] : null }));
}

/**
 * What a group deals: its characters that have a stroke order, once each, in
 * the group's order. A kana group deals its own kana and ignores `chars`; a
 * kanji group deals the kanji of `chars`. `strokes` maps a character to its
 * number of strokes. With `ready`, and what to say: how many there are, or
 * why there is nothing to write.
 */
export function rushPool({ group, chars = [], strokes = {} } = {}) {
  const g = groupOf(group);
  if (!g) return { pool: [], count: 0, ready: false, message: t(SAY.unknown) };
  const listed = g.chars || [...new Set((Array.isArray(chars) ? chars : [...String(chars || '')])
    .filter((ch) => typeof ch === 'string' && [...ch].length === 1 && isKanji(ch)))];
  const pool = listed.filter((ch) => strokeCountOf(strokes, ch) > 0);
  if (!pool.length) return { pool, count: 0, ready: false, message: t(g.id === 'mine' ? SAY.noneSaved : SAY.noStrokes) };
  return { pool, count: pool.length, ready: true, message: countWords(pool.length, g.kind) };
}

/** The modes, lengths and guides a picker offers, with what each means, and the rules in a sentence. */
export const rushOptions = () => optionWords(RUSH_SECONDS);

/** Where a run's best is kept: group, mode, a rush's length, and guides or blank. */
export function bestKey({ group, mode, seconds = null, guides = true }) {
  const help = guides ? 'guides' : 'blank';
  return mode === 'rush' ? `${group}:rush:${seconds}:${help}` : `${group}:marathon:${help}`;
}

// ── Records ─────────────────────────────────────────────────────────────

/** A record read field by field: null when it cannot be used, `extra` when unknown fields were left out. */
function cleanRecord(v, withBest) {
  if (!object(v) || !groupOf(v.group) || !RUSH_MODES.includes(v.mode) || typeof v.guides !== 'boolean') return null;
  if (v.mode === 'rush' ? !RUSH_SECONDS.includes(v.seconds) || v.ms !== null : v.seconds !== null || timeOf(v.ms) !== v.ms) return null;
  if (![v.written, v.clean, v.misses, v.assisted, v.of].every(isCount) || v.of < 1) return null;
  // Every written character that is not clean missed once at least, and an
  // assisted one three times; a marathon writes its whole group.
  if (v.clean + v.assisted > v.written || v.misses < v.written - v.clean + (ASSIST_AFTER - 1) * v.assisted) return null;
  if (v.mode === 'marathon' && v.written !== v.of) return null;
  if (v.day !== null && !isDay(v.day)) return null;
  if (withBest && typeof v.best !== 'boolean') return null;
  const keys = withBest ? [...FIELDS, 'best'] : FIELDS;
  return { record: Object.fromEntries(keys.map((k) => [k, v[k]])), extra: Object.keys(v).some((k) => !keys.includes(k)) };
}

const eligible = (rec) => rec.assisted === 0 && rec.written > 0;
/** More than 0 when `a` beats `b`. */
const beats = (a, b) => (a.mode === 'rush'
  ? a.written - b.written || a.clean - b.clean || b.misses - a.misses
  : b.ms - a.ms || b.misses - a.misses);
const shownRecord = (rec) => rec && { ...rec, groupTitle: titleOf(rec.group), summary: summaryOf(rec, groupOf(rec.group).kind) };

// ── A run ───────────────────────────────────────────────────────────────
//
// Kept in memory only:
//   id        serial:key:seed, so a step's id (id:steps) names one stroke
//   pool      the dealable characters; counts their strokes
//   deal      the order so far; a rush appends a new cycle when it runs out
//   at        the place in `deal` of the character on the pad
//   next, strokeMisses, shown, charMisses, assisted, say   that character's state
//   steps     strokes taken (right or missed): the stale-tap guard
//   startedAt the first stroke's touch-down, or null; last, the latest time
//   done      [{ ch, misses, assisted }] the characters written, in order
//   result    once the run is over: { record, newBest, previous, best }

function dealMore(run) {
  const last = run.deal.length ? run.deal[run.deal.length - 1] : null;
  const cycle = shuffle(run.pool, run.rand);
  if (cycle.length > 1 && cycle[0] === last) {
    const j = 1 + Math.floor(run.rand() * (cycle.length - 1));
    [cycle[0], cycle[j]] = [cycle[j], cycle[0]];
  }
  run.deal.push(...cycle);
}

const stepId = (run) => `${run.id}:${run.steps}`;
const deadlineOf = (run) => (run.mode === 'rush' && run.startedAt !== null ? run.startedAt + run.seconds * 1000 : null);

function freshChar(run) {
  Object.assign(run, { next: 0, strokeMisses: 0, shown: false, charMisses: 0, assisted: false, say: '' });
}

export class WritingRush {
  constructor(document) {
    this.bests = {};
    this.recent = [];
    this.run = null;
    this.serial = 0;
    this.recovered = false;
    if (document == null) return;
    if (!object(document) || document.format !== RUSH_FORMAT) { this.recovered = true; return; }
    if (Object.keys(document).some((k) => !['format', 'bests', 'recent'].includes(k))) this.recovered = true;
    if (!object(document.bests)) this.recovered = true;
    else {
      for (const [key, value] of Object.entries(document.bests)) {
        const clean = cleanRecord(value, false);
        // A best belongs under its own key, and only an eligible run is one.
        if (!clean || bestKey(clean.record) !== key || !eligible(clean.record)) { this.recovered = true; continue; }
        if (clean.extra) this.recovered = true;
        this.bests[key] = clean.record;
      }
    }
    if (!Array.isArray(document.recent)) this.recovered = true;
    else {
      for (const value of document.recent) {
        const clean = cleanRecord(value, true);
        if (!clean || (clean.record.best && !eligible(clean.record))) { this.recovered = true; continue; }
        if (clean.extra) this.recovered = true;
        this.recent.push(clean.record);
      }
      if (this.recent.length > RECENT_KEPT) { this.recent.length = RECENT_KEPT; this.recovered = true; }
    }
  }

  /** The best a run of `rec`'s kind is measured against: a marathon's only over the same count. */
  bestFor(rec) {
    const best = this.bests[bestKey(rec)];
    return best && (rec.mode === 'rush' || best.of === rec.of) ? best : null;
  }

  /**
   * A new run of `group`. `chars` are a kanji group's characters (a kana group
   * knows its own); `strokes` maps each character to its stroke count; mode
   * 'rush' with `seconds` (30, 60 or 120) or 'marathon'; `guides` true or
   * false; `today` YYYY-MM-DD for the records, or null.
   */
  start({ group, chars = [], strokes = {}, mode = 'rush', seconds = 60, guides = true, seed = Date.now(), today = null } = {}) {
    if (this.run && !this.run.result) throw new Error(t(SAY.busy));
    if (!groupOf(group)) throw new Error(t(SAY.unknown));
    if (!RUSH_MODES.includes(mode)) throw new Error(t(SAY.mode));
    if (mode === 'rush' && !RUSH_SECONDS.includes(seconds)) throw new Error(t(SAY.seconds));
    if (typeof guides !== 'boolean') throw new Error(t(SAY.guides));
    if (today !== null && !isDay(today)) throw new Error('Expected today as YYYY-MM-DD or null.');
    const { pool, ready, message } = rushPool({ group, chars, strokes });
    if (!ready) throw new Error(message);
    this.serial += 1;
    const key = bestKey({ group, mode, seconds, guides });
    this.run = {
      id: `${this.serial}:${key}:${Number(seed) >>> 0}`, group, mode, seconds: mode === 'rush' ? seconds : null, guides, day: today,
      pool, counts: new Map(pool.map((ch) => [ch, strokes[ch]])), rand: makeRand(seed), deal: [], at: 0,
      steps: 0, startedAt: null, last: 0, done: [], result: null,
    };
    freshChar(this.run);
    dealMore(this.run);
    return this.view();
  }

  /**
   * 'stroke' { id, ok, why, matched, at, began }: the verdict of `trace` for
   * the stroke on the pad, named by the character's `id`; any other id is a
   * stale or doubled tap and changes nothing, and so does a stroke without a
   * time. 'time' { at }: the app's clock, which ends a rush at its deadline.
   * 'abandon': drop a run in progress (nothing of it is kept) or close a
   * finished run's result (already kept).
   */
  act(action, args = {}) {
    const run = this.run;
    if (!run) return this.view();
    if (action === 'abandon') { this.run = null; return this.view(); }
    if (run.result) return this.view();
    if (action === 'time') {
      const now = timeOf(args.at);
      const deadline = deadlineOf(run);
      if (now !== null && deadline !== null && Math.max(now, run.last) >= deadline) this.finish(deadline);
    } else if (action === 'stroke') {
      this.stroke(run, args);
    }
    return this.view();
  }

  stroke(run, { id, ok, why = null, matched = null, at, began } = {}) {
    let now = timeOf(at);
    if (id !== stepId(run) || typeof ok !== 'boolean' || now === null) return;
    now = Math.max(now, run.last);
    const count = run.counts.get(run.deal[run.at]);
    const tap = !ok && why === 'short';
    if (run.startedAt === null && !tap) {
      const down = timeOf(began);
      run.startedAt = down !== null && down <= now ? down : now;
    }
    const deadline = deadlineOf(run);
    if (deadline !== null && now > deadline) { this.finish(deadline); return; }
    if (tap) { run.say = strokeWords(why, matched, run.next, count, true); return; }
    run.last = now;
    run.steps += 1;
    if (ok) {
      Object.assign(run, { next: run.next + 1, strokeMisses: 0, shown: false, say: '' });
      if (run.next >= count) this.written(run, now);
      return;
    }
    run.strokeMisses += 1;
    run.charMisses += 1;
    if (run.strokeMisses >= ASSIST_AFTER && !run.shown) {
      Object.assign(run, { shown: true, assisted: true, say: shownWords(run.next) });
    } else {
      run.say = strokeWords(why, matched, run.next, count, run.guides);
    }
  }

  /** The character on the pad is written: file it, and deal the next or finish. */
  written(run, now) {
    run.done.push({ ch: run.deal[run.at], misses: run.charMisses, assisted: run.assisted });
    if (run.mode === 'marathon' && run.done.length === run.pool.length) { this.finish(now); return; }
    run.at += 1;
    if (run.at >= run.deal.length) dealMore(run);
    freshChar(run);
  }

  /** The run is over at `end`: its record, the best it is measured against, and the recent list. */
  finish(end) {
    const run = this.run;
    const record = {
      group: run.group, mode: run.mode, guides: run.guides, seconds: run.seconds,
      ms: run.mode === 'marathon' ? end - run.startedAt : null,
      written: run.done.length,
      clean: run.done.filter((d) => d.misses === 0).length,
      misses: Math.min(CAP, run.done.reduce((n, d) => n + d.misses, 0)),
      assisted: run.done.filter((d) => d.assisted).length,
      of: run.pool.length, day: run.day,
    };
    const previous = this.bestFor(record);
    const newBest = eligible(record) && (!previous || beats(record, previous) > 0);
    if (newBest) this.bests[bestKey(record)] = record;
    this.recent.unshift({ ...record, best: newBest });
    if (this.recent.length > RECENT_KEPT) this.recent.length = RECENT_KEPT;
    run.last = Math.max(run.last, end);
    run.result = { record, newBest, previous, best: this.bestFor(record) };
  }

  /**
   * status 'idle', 'playing' or 'complete', with the bests and the recent
   * results (each with its group's title and a summary). Playing and complete
   * carry the run; playing, the character on the pad (`char`); complete, the
   * `result`, until 'abandon' or a new start.
   */
  view() {
    const base = {
      recovered: this.recovered,
      status: 'idle',
      bests: Object.fromEntries(Object.entries(this.bests).map(([key, rec]) => [key, shownRecord(rec)])),
      recent: this.recent.map(shownRecord),
      run: null,
    };
    const run = this.run;
    if (!run) return base;
    // No written character was assisted: the run can still set a best.
    const fair = run.done.every((d) => !d.assisted);
    const shown = {
      group: run.group, title: titleOf(run.group), kind: groupOf(run.group).kind, mode: run.mode, seconds: run.seconds, guides: run.guides,
      of: run.pool.length, position: run.done.length + 1, total: run.mode === 'marathon' ? run.pool.length : null,
      startedAt: run.startedAt, deadline: deadlineOf(run),
      written: run.done.length,
      clean: run.done.filter((d) => d.misses === 0).length,
      misses: run.done.reduce((n, d) => n + d.misses, 0),
      assisted: run.done.filter((d) => d.assisted).length,
      eligible: fair,
      best: shownRecord(this.bestFor({ group: run.group, mode: run.mode, seconds: run.seconds, guides: run.guides, of: run.pool.length })),
      note: run.startedAt === null ? t(SAY.clock) : fair ? null : t(SAY.outOfBest),
      char: null,
      result: null,
    };
    if (run.result) {
      const { record, newBest, previous, best } = run.result;
      const trouble = new Map();
      for (const d of run.done) {
        if (!d.misses) continue;
        const was = trouble.get(d.ch) || { ch: d.ch, misses: 0, assisted: false };
        trouble.set(d.ch, { ch: d.ch, misses: was.misses + d.misses, assisted: was.assisted || d.assisted });
      }
      Object.assign(shown, { position: run.done.length, note: null });
      shown.result = {
        ...shownRecord(record), newBest, previous: shownRecord(previous), best: shownRecord(best),
        heading: t(run.mode === 'rush' ? SAY.timeUp : SAY.marathonDone),
        bestNote: bestNote(record, { newBest, previous, best }),
        trouble: [...trouble.values()].sort((a, b) => b.misses - a.misses).slice(0, TROUBLE),
      };
      return { ...base, status: 'complete', run: shown };
    }
    const ch = run.deal[run.at];
    shown.char = {
      id: stepId(run), ch, strokeCount: run.counts.get(ch), next: run.next,
      misses: run.charMisses, strokeMisses: run.strokeMisses, shown: run.shown, assisted: run.assisted, say: run.say,
    };
    return { ...base, status: 'playing', run: shown };
  }

  dump() {
    return { format: RUSH_FORMAT, bests: { ...this.bests }, recent: this.recent.map((rec) => ({ ...rec })) };
  }
}
