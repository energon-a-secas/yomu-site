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
import { newBook, pruneRemovals } from './sync-book.js';

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
 * Which way a sign-in goes: 'adopt' on a browser that never synced (its data
 * joins the account), 'same' for the account it last synced with, and 'ask'
 * for another one, which is never merged without the learner's say.
 */
export function decide(book, subject) {
  if (!book) return 'adopt';
  return book.account === subject ? 'same' : 'ask';
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

  /** Who the server says is signed in, and which way this sign-in goes. For 'ask', what each side holds. */
  async function begin() {
    const who = await client.query(FN.whoami, {});
    subject = who && typeof who.subject === 'string' && who.subject ? who.subject : null;
    cache = null;
    if (!subject) throw new SyncError('not-authenticated');
    const mode = decide(books.read(), subject);
    if (mode !== 'ask') return { subject, mode };
    return { subject, mode, counts: counts(await pullAll(client), local.snapshot()) };
  }

  async function run(mode) {
    const who = subject;
    if (!who) throw new SyncError('not-authenticated');
    const server = await pullAll(client);
    if (subject !== who) throw new SyncError('stopped');
    // From here until the push there is no await, so a removal made while
    // the pull was out is already in the book, and none can slip in between.
    const had = books.read();
    if (mode === 'same' && (!had || had.account !== who)) throw new SyncError('account-changed');
    const snap = local.snapshot();
    // A browser joining the account brings what it holds in as saved now; one
    // taking the account's data instead brings nothing in (joined at 1 ms).
    const book = mode === 'same' ? had : newBook(who, mode === 'replace' ? 1 : now(), snap.prefs, server.clear);
    const merge = planSync(server, snap, book, { replace: mode === 'replace' });
    local.apply(merge.apply);
    if (mode === 'replace') book.removed = { kanji: {}, phrases: {} };
    // What the account lacks is worked out from the stores as the merge left
    // them, since a store's own merge may keep more than the join did: History
    // folds an ordinary entry's reads into a phrase it saves again.
    const plan = planSync(server, local.snapshot(), book);
    const carried = { kanji: { ...book.removed.kanji }, phrases: { ...book.removed.phrases } };
    book.epoch = plan.clear;
    if (plan.next.prefs) {
      for (const [k, p] of Object.entries(plan.next.prefs.values)) { book.prefsAt[k] = p.at; book.prefsVal[k] = p.v; }
    }
    books.write(book);   // the account is remembered from here, even if the push fails
    cache = server;
    const res = await pushAll(client, plan.push);
    cache = plan.next;
    const at = now();
    books.update((b) => { if (b.account === who) { pruneRemovals(b, carried); b.at = at; } });
    return { ok: true, at, wrote: res.wrote, applied: applies(merge), stale: res.clear > plan.clear };
  }

  /** Pull, merge here, push. `mode` is 'adopt', 'same' or 'replace' (begin() says which, or the learner did). */
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
      const carried = { kanji: { ...book.removed.kanji }, phrases: { ...book.removed.phrases } };
      const res = await pushAll(client, plan.push);
      cache = plan.next;
      const at = now();
      books.update((b) => { if (b.account === who) { pruneRemovals(b, carried); b.epoch = Math.max(b.epoch, plan.clear); b.at = at; } });
      return { ok: true, at, wrote: res.wrote, stale: res.clear > plan.clear };
    });
  }

  /** Signed out: stop. The stores and the book stay as they are. */
  function stop() {
    subject = null;
    cache = null;
  }

  return {
    begin, sync, flush, stop,
    get subject() { return subject; },
    get pulled() { return cache !== null; },
  };
}
