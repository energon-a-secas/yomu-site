// The sync client: on sign-in it pulls the account, merges it into this
// browser's stores through their own functions, then pushes what the account
// lacks; after that it pushes the rows a change touched, and pulls again when
// asked to. No DOM and no timers here; js/account.js owns those, and
// tests/sync-client.test.mjs drives this file against a fake Convex running
// the real server handlers (convex/model/sync.ts).
//
// Loaded only once someone is signed in (js/account.js imports it then), so
// an anonymous visit never fetches it.
//
// A failure anywhere (offline, a server error, a refused call) throws a
// SyncError and leaves the stores as they were: nothing is applied until the
// whole pull is in, and a push that fails is tried again whole, since every
// row is a join and a row sent twice changes nothing.

import { cleanKanjiRow, cleanPhraseRow, cleanPlay, cleanPrefs, cleanClear } from './sync-rules.js';
import { planSync, pushes, applies } from './sync-local.js';
import { newBook, answeredBook, answerBook, carriedOf, pruneCarried, PENDING, FIRST } from './sync-book.js';

/** The Convex functions, by name (convex/sync.ts). */
export const FN = Object.freeze({
  whoami: 'sync:whoami',
  pullKanji: 'sync:pullKanji',
  pullPhrases: 'sync:pullPhrases',
  pullMeta: 'sync:pullMeta',
  push: 'sync:push',
});
/** Rows per push call: convex/model/sync.ts MAX_KANJI and MAX_PHRASES. */
export const KANJI_BATCH = 200;
export const PHRASE_BATCH = 50;
/** Pages per pull, far past any real account (2,000 kanji is five). */
const MAX_PAGES = 500;

export class SyncError extends Error {
  constructor(code, cause) {
    super(code);
    this.name = 'SyncError';
    this.code = code;
    this.cause = cause;
  }
}

function answer(res) {
  if (!res || res.ok === false) throw new SyncError(res && res.error ? String(res.error) : 'no-answer');
  return res;
}

/**
 * Which way a sign-in goes, by the book alone: 'adopt' on a browser that
 * never joined an account (no book, or a first sign-in not settled yet),
 * which begin() turns into a question when both sides hold data; 'same' for
 * the account in the book (synced with, or answered for: run() finishes a
 * pending join); and 'ask' for another one, which is never merged without
 * the learner's say.
 */
export function decide(book, subject) {
  if (!book || book.pending === FIRST) return 'adopt';
  return book.account === subject ? 'same' : 'ask';
}

/**
 * Whether this browser holds what a first join asks about: a saved kanji or
 * a saved phrase. Counts, scores and display settings alone never ask.
 */
export function holdsOwn(snap) {
  return Object.keys(snap.kanji.saved).length > 0 || snap.phrases.length > 0;
}

/**
 * Whether the account holds any of My kanji or the saved phrases: a row of
 * either, live or removed, or a Clear all.
 */
export function holdsAny(server) {
  return server.clear > 0 || server.kanji.size > 0 || server.phrases.size > 0;
}

/** Everything the account holds, page by page. */
export async function pullAll(client) {
  const meta = answer(await client.query(FN.pullMeta, {}));
  const read = async (fn, clean, idOf) => {
    const rows = new Map();
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res = answer(await client.query(fn, { cursor }));
      for (const raw of res.rows || []) {
        const row = clean(raw);
        if (row) rows.set(idOf(row), row);
      }
      if (res.done) return rows;
      cursor = res.cursor;
    }
    throw new SyncError('pull-too-long');
  };
  return {
    clear: cleanClear(meta.clear),
    kanji: await read(FN.pullKanji, cleanKanjiRow, (r) => r.char),
    phrases: await read(FN.pullPhrases, cleanPhraseRow, (r) => r.key),
    play: meta.play ? cleanPlay(meta.play) : null,
    prefs: meta.prefs ? cleanPrefs(meta.prefs) : null,
  };
}

/** Send a plan's rows: the clear, Play and the preferences with the first batch, so every row is joined under the clear. */
export async function pushAll(client, push) {
  const kanji = push.kanji.slice();
  const phrases = push.phrases.slice();
  let wrote = 0;
  let clear = 0;
  let first = true;
  while (first || kanji.length || phrases.length) {
    const args = {};
    if (first) {
      if (push.clear !== null) args.clear = push.clear;
      if (push.play) args.play = push.play;
      if (push.prefs) args.prefs = push.prefs;
    }
    first = false;
    const k = kanji.splice(0, KANJI_BATCH);
    const p = phrases.splice(0, PHRASE_BATCH);
    if (k.length) args.kanji = k;
    if (p.length) args.phrases = p;
    if (!Object.keys(args).length) break;
    const res = answer(await client.mutation(FN.push, args));
    wrote += res.wrote || 0;
    clear = Math.max(clear, cleanClear(res.clear));
  }
  return { wrote, clear };
}

/** What each side holds, for the question asked when another account signs in. */
export function counts(server, snap) {
  let kanji = 0;
  for (const row of server.kanji.values()) if (row.saved) kanji += 1;
  let phrases = 0;
  for (const row of server.phrases.values()) if (row.phrase) phrases += 1;
  return { account: { kanji, phrases }, here: { kanji: Object.keys(snap.kanji.saved).length, phrases: snap.phrases.length } };
}

/**
 * When a joining browser's data counts as saved, row by row. `at` is when
 * the join was settled (begin() decided it, or the learner answered), `now`
 * this sync's own time. `joined` is `at`, or one past the account's Clear
 * all when another device's clock ran ahead of this one. Each save the
 * browser brings (the stores before the account's rows are applied) counts
 * as saved at `joined`, a phrase at `at`, or one past the account's removal
 * of that row when that is later: the browser keeps its own data even then,
 * and a removal stamped by a clock ahead moves only the row it removed.
 *
 * A removal or a clear stamped after `at` and before `now` is not stepped
 * past: by this clock it was made after the join was settled, so it wins,
 * whether it reached the account before this sync or after it (a pending
 * Add that waited on a retry). One stamped at `now` or later, no correct
 * clock has made yet; it is a clock ahead, and is stepped past. What the
 * join receives from the account is not brought and keeps the account's
 * own stamp, so a removal another device has not pushed yet still wins over
 * it (tests/sync-join.test.mjs).
 */
export function joinStamps(server, snap, at, now = at) {
  const past = (t) => (t > at && t < now ? 0 : t + 1);
  const joined = Math.max(at, past(server.clear));
  const brought = { kanji: {}, phrases: {} };
  for (const ch of Object.keys(snap.kanji.saved)) {
    const row = server.kanji.get(ch);
    brought.kanji[ch] = row ? Math.max(joined, past(row.removed), past(row.seen ? row.seen.e : 0)) : joined;
  }
  for (const entry of snap.phrases) {
    const row = server.phrases.get(entry.key);
    brought.phrases[entry.key] = row ? Math.max(at, past(row.removed)) : at;
  }
  return { joined, brought };
}

/**
 * One account's sync. `client` answers query(name, args) and mutation(name,
 * args) (a ConvexHttpClient on the page); `local` is sync-watch.js
 * storesAdapter(); `book` is sync-book.js openBook().
 */
export function createSync({ client, local, book: books, now = Date.now }) {
  let subject = null;
  let cache = null;      // the account as this page last read or wrote it
  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  /**
   * Who the server says is signed in, and which way this sign-in goes. For
   * 'ask', what each side holds, and `first` when this browser never joined
   * an account: it holds saved kanji or phrases of its own and the account
   * holds data too, so the learner chooses Add or Use, as for another
   * account. A first sign-in with nothing of its own, or into an account
   * that holds nothing, joins as is.
   */
  async function begin() {
    const who = await client.query(FN.whoami, {});
    subject = who && typeof who.subject === 'string' && who.subject ? who.subject : null;
    cache = null;
    if (!subject) throw new SyncError('not-authenticated');
    const me = subject;
    const book = books.read();
    const mode = decide(book, me);
    if (mode === 'same') return { subject: me, mode };
    if (mode === 'ask') return { subject: me, mode, counts: counts(await pullAll(client), local.snapshot()) };
    // A first sign-in: the join goes into the book now, pending, as an
    // answer to the account question does. A retry after a failed pull
    // continues it, and what the learner removes, saves or changes in
    // between goes to this account.
    if (!book || book.account !== me) books.write(answeredBook(me, FIRST, now(), local.snapshot().prefs));
    if (holdsOwn(local.snapshot())) {
      const server = await pullAll(client);
      if (subject !== me) throw new SyncError('stopped');
      if (holdsAny(server)) return { subject: me, mode: 'ask', first: true, counts: counts(server, local.snapshot()) };
    }
    books.update((b) => { if (b.account === me && b.pending === FIRST) { b.pending = 'adopt'; b.joined = now(); } });
    return { subject: me, mode };
  }

  /**
   * The book a join writes: the answer's own (`had`, pending) or a new one,
   * taking the account's Clear all as its own. Add brings every save the
   * stores hold now, before anything of the account's is applied (`brought`,
   * joinStamps), and carries the removals and the Clear all made since the
   * answer. Use brings none of its own, and planSync keeps only what the
   * learner did after answering; a removal or a Clear all made before the
   * account's data arrived (which is now) applies here only, since the
   * learner could not have seen the account's rows.
   */
  function joinBook(had, who, as, server, snap) {
    const book = had || newBook(who, now(), snap.prefs);
    delete book.pending;
    if (as === 'replace') {
      book.epoch = server.clear;
      book.removed = { kanji: {}, phrases: {} };
      book.brought = { kanji: {}, phrases: {} };
      return book;
    }
    book.epoch = Math.max(book.epoch, server.clear);
    const { joined, brought } = joinStamps(server, snap, book.joined, now());
    book.joined = joined;
    book.brought = brought;
    return book;
  }

  async function run(mode) {
    const who = subject;
    if (!who) throw new SyncError('not-authenticated');
    const server = await pullAll(client);
    if (subject !== who) throw new SyncError('stopped');
    // From here until the push there is no await, so a removal made while
    // the pull was out is already in the book, and none can slip in between.
    const had = books.read();
    const ours = !!had && had.account === who;
    if (mode === 'same' && !ours) throw new SyncError('account-changed');
    // A book that names this account is this browser's join with it. One
    // still waiting on an answer (`pending`, given here or in another tab)
    // is finished as that answer; one already joined syncs as 'same'
    // whatever was asked, since a second join would drop the removals the
    // book holds and count what it received from the account as its own.
    let as = ours ? had.pending || 'same' : mode;
    const snap = local.snapshot();
    let start = had;
    if (as === FIRST) {
      // A first sign-in not settled yet: an answer passed here settles it,
      // as choose() would; anything else decides again (begin()).
      if (!PENDING.includes(mode)) throw new SyncError('account-changed');
      start = answerBook(had, who, mode, now(), snap.prefs);
      as = mode;
    }
    const book = as === 'same' ? had : joinBook(ours ? start : null, who, as, server, snap);
    const merge = planSync(server, snap, book, { replace: as === 'replace' });
    local.apply(merge.apply);
    // What the account lacks is worked out from the stores as the merge left
    // them, since a store's own merge may keep more than the join did: History
    // folds an ordinary entry's reads into a phrase it saves again.
    const plan = planSync(server, local.snapshot(), book);
    const carried = carriedOf(book);
    book.epoch = plan.clear;
    if (plan.next.prefs) {
      for (const [k, p] of Object.entries(plan.next.prefs.values)) { book.prefsAt[k] = p.at; book.prefsVal[k] = p.v; }
    }
    books.write(book);   // the account is remembered from here, even if the push fails
    cache = server;
    const res = await pushAll(client, plan.push);
    cache = plan.next;
    const at = now();
    books.update((b) => { if (b.account === who) { pruneCarried(b, carried); b.at = at; } });
    return { ok: true, at, wrote: res.wrote, applied: applies(merge), stale: res.clear > plan.clear };
  }

  /**
   * The learner answered the account question: Add ('adopt') or Use
   * ('replace'). The answer goes into the book at once, as a book for this
   * account with the answer pending, so a retry after a failed sync
   * finishes it, and what the learner removes, clears or changes before
   * then goes to this account rather than the old one. A book that already
   * names this account was answered in another tab, and that answer stands,
   * unless it is a first sign-in still waiting on the answer (answerBook).
   */
  function choose(mode) {
    const who = subject;
    if (!who || !PENDING.includes(mode)) return false;
    const had = books.read();
    if (had && had.account === who && had.pending !== FIRST) return false;
    books.write(answerBook(had, who, mode, now(), local.snapshot().prefs));
    return true;
  }

  /**
   * Pull, merge here, push. `mode` is 'adopt', 'same' or 'replace': begin()
   * says which, or the learner did, through choose().
   */
  function sync(mode = 'same') {
    return serial(() => run(mode));
  }

  /**
   * Push what changed since, against the account as this page last saw it:
   * no pull, so a learner reading text after text does not fetch every row
   * each time. A page that has not pulled yet runs a whole sync instead.
   */
  function flush() {
    return serial(async () => {
      const who = subject;
      if (!who) return { ok: true, wrote: 0 };
      if (!cache) return run('same');
      const book = books.read();
      if (!book || book.account !== who) throw new SyncError('account-changed');
      const plan = planSync(cache, local.snapshot(), book);
      if (!pushes(plan)) return { ok: true, wrote: 0 };
      const carried = carriedOf(book);
      const res = await pushAll(client, plan.push);
      cache = plan.next;
      const at = now();
      books.update((b) => { if (b.account === who) { pruneCarried(b, carried); b.epoch = Math.max(b.epoch, plan.clear); b.at = at; } });
      return { ok: true, at, wrote: res.wrote, stale: res.clear > plan.clear };
    });
  }

  /** Signed out: stop. The stores and the book stay as they are. */
  function stop() {
    subject = null;
    cache = null;
  }

  /**
   * The newest save (`s`) and the newest removal the account's copy of one
   * row holds, as this page last read or wrote it: kind 'kanji' or
   * 'phrases', and for 'kanji' with no id, over every kanji (a Clear all).
   * A Clear all counts as a removal of every kanji. Nothing before a pull.
   * sync-watch.js stamps a removal after the save, and a save after the
   * removal, so a clock behind another device's cannot undo what it shows.
   */
  function known(kind, id) {
    if (!cache) return { s: 0, removed: 0 };
    if (kind === 'phrases') {
      const row = cache.phrases.get(id);
      return { s: row && row.phrase ? row.phrase.s : 0, removed: row ? row.removed : 0 };
    }
    if (id === null || id === undefined) {
      let s = 0;
      for (const row of cache.kanji.values()) if (row.saved) s = Math.max(s, row.saved.s);
      return { s, removed: cache.clear };
    }
    const row = cache.kanji.get(id);
    return { s: row && row.saved ? row.saved.s : 0, removed: Math.max(cache.clear, row ? row.removed : 0) };
  }

  return {
    begin, choose, sync, flush, stop, known,
    get subject() { return subject; },
    get pulled() { return cache !== null; },
  };
}
