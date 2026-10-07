// This browser's stores as sync rows, and the plan of one sync: which rows
// the server lacks, what changes here, and what the server holds after.
// Pure over plain data (no DOM, no storage, no network), so
// tests/sync-client.test.mjs runs it with the real stores and a fake Convex.
//
// The page's stores keep their own formats. A row carries three things a
// store does not: a save's `s` (the latest save, for comparing with a
// removal), a word's day, and a count's `e` (the Clear all its device knew).
// They are rebuilt here from the book (sync-book.js) and from the server's
// own copy of the row, so a store never has to hold them:
//
//   s    the latest of: the save's own time in the store; the book's
//        stamps for it, its join stamp when this browser brought it to the
//        account (sync-book.js `brought`) and the stamp of a save made here
//        or brought back by Import (`saves`, kept until a push carries it);
//        and the server's s when the server's save is this same save (the
//        same `at`, or for a phrase the same `saved`): a save made before a
//        removal must not borrow a newer save's time. The store's own time
//        is no stamp: merging the account's older copy moves it back to the
//        earliest, which is why a save made here is stamped in the book. A
//        save the join received from the account has no stamp here
//   day  the server's day for that word, or the kanji's last day here
//   e    the book's epoch
//
// What never becomes a row: the session, the text in the box, History's
// texts that are not saved, and the remember and translate preferences.

import {
  cleanKanjiRow, cleanPhraseRow, cleanPlay, cleanPrefs, joinKanji, joinPhrase, joinPlay, joinPrefs, same, PREF_KEYS,
} from './sync-rules.js';

function dayOf(cached, w, r) {
  const hit = cached && cached.seen ? cached.seen.words.find((x) => x[0] === w && x[1] === r) : null;
  return hit ? hit[2] : null;
}

/** One kanji as this browser holds it, against `cached`, the server's copy (or null). */
export function localKanjiRow(ch, kanji, book, cached) {
  const rec = kanji.saved[ch];
  const met = kanji.seen[ch];
  return cleanKanjiRow({
    char: ch,
    saved: rec ? { ...rec, s: Math.max(rec.at, book.brought.kanji[ch] || 0, book.saves.kanji[ch] || 0, cached && cached.saved && cached.saved.at === rec.at ? cached.saved.s : 0) } : null,
    removed: Math.max(book.removed.kanji[ch] || 0, cached ? cached.removed : 0),
    seen: met
      ? { n: met.n, first: met.first, last: met.last, words: met.words.map(([w, r]) => [w, r, dayOf(cached, w, r) || met.last]), src: met.src, h: met.h, e: book.epoch }
      : null,
  });
}

/** One saved phrase (a History entry with `saved`, or none) as this browser holds it. */
export function localPhraseRow(key, entry, book, cached) {
  return cleanPhraseRow({
    key,
    removed: Math.max(book.removed.phrases[key] || 0, cached ? cached.removed : 0),
    phrase: entry
      ? { t: entry.t, first: entry.first, last: entry.last, n: entry.n, src: entry.src, saved: entry.saved, s: Math.max(entry.saved, book.brought.phrases[key] || 0, book.saves.phrases[key] || 0, cached && cached.phrase && cached.phrase.saved === entry.saved ? cached.phrase.s : 0) }
      : null,
  });
}

export function localPlay(play) {
  return cleanPlay({ games: play.games, mixed: Object.entries(play.mixed).map(([k, n]) => ({ k, n })) });
}

export function localPrefs(prefs, book) {
  return cleanPrefs({ values: Object.fromEntries(PREF_KEYS.map((k) => [k, { v: prefs[k], at: book.prefsAt[k] || 0 }])) });
}

// ── Rows back into the stores' own shapes ─────────────────────────────────

export function toSaved(row) {
  const x = row && row.saved;
  return x ? { at: x.at, box: x.box, due: x.due, reviews: x.reviews, lapses: x.lapses } : null;
}

export function toSeen(row) {
  const x = row && row.seen;
  if (!x) return null;
  const out = { n: x.n, first: x.first, last: x.last, words: x.words.map(([w, r]) => [w, r]) };
  if (x.src) out.src = x.src;
  if (x.h) out.h = x.h;
  return out;
}

const SAVED_FIELDS = ['at', 'box', 'due', 'reviews', 'lapses'];
const sameSaved = (a, b) => (!a || !b ? !a === !b : SAVED_FIELDS.every((f) => a[f] === b[f]));
const wordSet = (list) => list.map(([w, r]) => `${w}\u0000${r}`).sort().join('\u0001');
/** The same counts, place and words; the order of the words is this browser's own (most recent last). */
function sameSeen(a, b) {
  if (!a || !b) return !a === !b;
  return a.n === b.n && a.first === b.first && a.last === b.last && a.src === b.src && a.h === b.h && wordSet(a.words) === wordSet(b.words);
}

const PHRASE_FIELDS = ['first', 'last', 'n', 'src', 'saved'];
const samePhrase = (e, p) => PHRASE_FIELDS.every((f) => e[f] === p[f]);

// ── The plan ──────────────────────────────────────────────────────────────

/**
 * With Use, this browser's own part of the join: only what the learner did
 * after answering (`book.joined`, kept in the book when the answer was
 * given). A save counted after it, by its own time or the book's stamp,
 * joins, and so does a preference changed since; whatever was saved before
 * stays behind, with every count and Play's scores. A removal or a Clear
 * all made since is in the book, and planSync carries it as always.
 */
function sinceAnswer(local, book) {
  const after = (own, stamp) => Math.max(own, stamp || 0) > book.joined;
  const saved = {};
  for (const [ch, rec] of Object.entries(local.kanji.saved)) if (after(rec.at, book.saves.kanji[ch])) saved[ch] = rec;
  const values = {};
  const mine = localPrefs(local.prefs, book);
  for (const [k, p] of Object.entries(mine ? mine.values : {})) if (book.prefsAt[k]) values[k] = p;
  return {
    kanji: { saved, seen: {} },
    phrases: local.phrases.filter((e) => after(e.saved, book.saves.phrases[e.key])),
    prefs: Object.keys(values).length ? { values } : null,
  };
}

/**
 * One sync, decided. `server` is what the account holds ({ clear, kanji:
 * Map, phrases: Map, play, prefs }, as pulled, or as this page last left it);
 * `local` is the stores' data ({ kanji: { saved, seen }, phrases: the saved
 * entries, play: { games, mixed }, prefs }); `book` is this browser's book.
 * With `replace` (Use), this browser takes the account's data and adds only
 * what the learner did after answering (sinceAnswer).
 *
 * Returns { clear, push, apply, next }: the rows the server lacks, the
 * changes to make here (each through the store's own functions), and the
 * server's rows once the push is in.
 */
export function planSync(server, local, book, { replace = false } = {}) {
  const clear = Math.max(server.clear, book.epoch);
  const push = { clear: book.epoch > server.clear ? book.epoch : null, kanji: [], phrases: [], play: null, prefs: null };
  const own = replace ? sinceAnswer(local, book) : local;
  const apply = { saved: {}, seen: {}, unsave: [], merge: [], play: null, prefs: null };
  const next = { clear, kanji: new Map(), phrases: new Map(), play: null, prefs: null };

  const chars = new Set([...server.kanji.keys(), ...Object.keys(local.kanji.saved), ...Object.keys(local.kanji.seen), ...Object.keys(book.removed.kanji)]);
  for (const ch of chars) {
    const theirs = server.kanji.get(ch) || null;
    const mine = localKanjiRow(ch, own.kanji, book, theirs);
    const row = joinKanji(theirs, mine, clear);
    if (row && !same(row, theirs && joinKanji(theirs, null, clear))) push.kanji.push(row);
    if (row) next.kanji.set(ch, row);
    const saved = toSaved(row);
    const seen = toSeen(row);
    if (!sameSaved(local.kanji.saved[ch] || null, saved)) apply.saved[ch] = saved;
    if (!sameSeen(local.kanji.seen[ch] || null, seen)) apply.seen[ch] = seen;
  }

  const entries = new Map(local.phrases.map((e) => [e.key, e]));
  const ownEntries = replace ? new Map(own.phrases.map((e) => [e.key, e])) : entries;
  const keys = new Set([...server.phrases.keys(), ...entries.keys(), ...Object.keys(book.removed.phrases)]);
  for (const key of keys) {
    const theirs = server.phrases.get(key) || null;
    const entry = entries.get(key) || null;
    const mine = localPhraseRow(key, ownEntries.get(key) || null, book, theirs);
    const row = joinPhrase(theirs, mine);
    if (row && !same(row, theirs)) push.phrases.push(row);
    if (row) next.phrases.set(key, row);
    const want = row && row.phrase;
    if (!want) { if (entry) apply.unsave.push(key); continue; }
    if (entry && samePhrase(entry, want)) continue;
    // A copy here that the join left out (dead, or replaced) is unsaved
    // first, so its older save time does not stay behind.
    if (entry && !(mine && mine.phrase && mine.phrase.s > row.removed)) apply.unsave.push(key);
    apply.merge.push({ t: want.t, first: want.first, last: want.last, n: want.n, src: want.src, saved: want.saved });
  }

  const myPlay = localPlay(local.play);
  const play = joinPlay(server.play, replace ? null : myPlay);
  const nothing = play && !Object.keys(play.games).length && !play.mixed.length && !server.play;
  if (play && !nothing && !same(play, server.play)) push.play = play;
  next.play = play;
  const playHere = play || (replace ? cleanPlay({}) : myPlay);
  if (!same(playHere, myPlay)) apply.play = { games: playHere.games, mixed: Object.fromEntries(playHere.mixed.map((p) => [p.k, p.n])) };

  const prefs = joinPrefs(server.prefs, replace ? own.prefs : localPrefs(local.prefs, book));
  if (prefs && !same(prefs, server.prefs)) push.prefs = prefs;
  next.prefs = prefs;
  const changes = {};
  if (prefs) for (const [k, p] of Object.entries(prefs.values)) if (p.v !== local.prefs[k]) changes[k] = p.v;
  if (Object.keys(changes).length) apply.prefs = changes;

  return { clear, push, apply, next };
}

/** Whether a plan sends anything at all. */
export function pushes(plan) {
  const p = plan.push;
  return p.clear !== null || p.kanji.length > 0 || p.phrases.length > 0 || !!p.play || !!p.prefs;
}

/** Whether a plan changes anything here. */
export function applies(plan) {
  const a = plan.apply;
  return Object.keys(a.saved).length + Object.keys(a.seen).length + a.unsave.length + a.merge.length > 0 || !!a.play || !!a.prefs;
}
