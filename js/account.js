// Accounts: the Neorgon Auth Kit, and sync once someone signs in.
//
// Dormant unless the page carries <meta name="clerk-publishable-key"> and is
// not an embedded frame: then nothing here imports anything, the header slot
// stays hidden, and the stores stay in this browser as they always were.
// With a key, the kit (same-origin js/neorgon-auth.js) starts and shows
// "Sign in"; it loads clerk-js from clerk.neorgon.com only when a Neorgon
// session exists or someone asks to sign in. The Convex client (esm.sh,
// pinned) and js/sync.js are imported on sign-in, never before, so an
// anonymous visitor makes no request to Clerk, Convex or esm.sh.
//
// Every dependency is passed in (events-sync.js passes the page's), so
// tests/sync-account.test.mjs runs this file under plain node with fakes.

import { storesAdapter, watchStores } from './sync-watch.js';

/** The dev deployment of Convex project yomu. Public: a Convex URL is not a secret, the token is. */
export const CONVEX_URL = 'https://jovial-mouse-131.convex.cloud';
/** Pinned to package.json's convex, under one path, which index.html's CSP allows and nothing wider. */
export const CONVEX_CLIENT = 'https://esm.sh/convex@1.46.0/browser';
/** A change is pushed this long after the last one. */
export const PUSH_AFTER = 4000;
/** A page shown again pulls at most this often. */
export const PULL_EVERY = 60 * 1000;

const NOTHING_KNOWN = Object.freeze({ s: 0, removed: 0 });

export function clerkKey(doc) {
  const meta = doc && doc.querySelector('meta[name="clerk-publishable-key"]');
  return meta && typeof meta.content === 'string' ? meta.content.trim() : '';
}

/** Whether this page has accounts at all: a key, and not an embed (the frame hides the header, so there is nowhere to sign in). */
export function accountsWanted(doc, embed) {
  return !embed && clerkKey(doc).length > 0;
}

/**
 * What kind of failure an error is, which is all the line says about it:
 * 'offline'; 'signin', the account did not accept this sign-in's token;
 * 'switched', another tab changed the account this browser syncs with;
 * 'refused', the server said no to what was sent; 'server', anything else,
 * a Convex error with its request id included. The error itself goes to the
 * console, never to the page: a code or a request id is no help to a learner.
 */
export function failureKind(err, online = true) {
  if (!online || err instanceof TypeError) return 'offline';
  const code = err && err.code;
  if (code === 'not-authenticated') return 'signin';
  if (code === 'account-changed') return 'switched';
  if (code === 'too-many-rows') return 'refused';
  return 'server';
}

/**
 * Start accounts on this page, or do nothing at all. Returns null when
 * dormant, otherwise { ready, signIn(invoker), choose(invoker), status }.
 *
 * deps: doc, win, embed; importKit, importClient, importEngine (the three
 * dynamic imports); kanji, history, play (the stores); prefs { get, set,
 * onSaved }; remembering(); books (sync-book.js openBook()); ui { paint(status),
 * ask(info) -> 'add' | 'use' | null, dismiss(), refresh(), reason() }; now;
 * setTimer, clearTimer.
 */
export function startAccount(deps) {
  const { doc, win, embed, importKit, importClient, importEngine, kanji, history, play, prefs, remembering, books, ui } = deps;
  if (!accountsWanted(doc, embed)) return null;
  const now = deps.now || Date.now;
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((t) => clearTimeout(t));

  const local = storesAdapter({ kanji, history, play, prefs, remembering });
  const kept = books.read();
  const status = { available: false, signedIn: false, label: '', phase: 'idle', at: kept ? kept.at : 0, synced: false, error: null };
  let kit = null;
  let client = null;
  let engine = null;
  let user = null;
  let timer = null;
  let lastPull = 0;
  let asked = null;      // the question waiting for an answer: { counts, since, first }
  // The step every retry runs (the online event, the page shown again, a
  // change): 'connect' (whoami, and the pull behind the account question)
  // until the server has said which way this sign-in goes; 'ask' while the
  // learner decides; then the sync that was chosen, 'adopt' (a first
  // sign-in, or Add) or 'replace' (Use); and 'same' once this account is in
  // the book. Never 'same' before that: there is no book for it to run on,
  // and js/sync.js refuses it. A join is written into the book as it is
  // decided (a first sign-in's in engine.begin, an answer in engine.choose),
  // so the book names the account from then on, and a sync there finishes
  // the join it holds.
  let step = 'connect';
  let gen = 0;           // a sign-out or another account: what was under way stops touching the page
  let running = null;    // { gen, done }: the one resume under way

  /**
   * Whether what the learner changes here reaches an account (`synced`,
   * which words the Clear all dialog and Play's lead): a book that joined
   * one, or a join that will carry it. A first sign-in that has not settled
   * its way carries nothing yet.
   */
  const carries = () => { const b = books.read(); return !!b && b.pending !== 'first'; };
  const paint = () => {
    status.synced = carries();
    try { ui.paint({ ...status }); } catch (err) { console.error('[yomu] sync line', err); }
  };
  const live = () => status.signedIn && status.phase !== 'paused';

  function fail(err) {
    const online = !(win && win.navigator && win.navigator.onLine === false);
    const kind = failureKind(err, online);
    // Said once on the line, and once on the console, however often it repeats.
    if (status.phase !== 'error' || !status.error || status.error.kind !== kind) console.warn('[yomu] sync failed, everything stays in this browser:', err);
    status.phase = 'error';
    status.error = { kind };
  }

  function finished(r) {
    if (r && r.at) status.at = r.at;
    status.phase = 'synced';
    status.error = null;
    if (r && r.applied) ui.refresh();
  }

  /**
   * The step to retry after a failed sync. A book that names this account
   * leaves an ordinary sync to finish what is in it: the push, when a sync
   * got as far as writing the book (the pull went through, the push did
   * not), or the pending join (a first sign-in's, or the learner's answer),
   * when the pull after it failed. Another tab's account in the book means
   * deciding again.
   */
  function failedAt(err) {
    if (err && err.code === 'account-changed') { step = 'connect'; return; }
    const book = books.read();
    if (engine && engine.subject && book && book.account === engine.subject) step = 'same';
  }

  async function runSync(mode, g) {
    status.phase = status.phase === 'error' ? 'error' : 'syncing';
    paint();
    try {
      const r = await engine.sync(mode);
      if (g !== gen) return;
      step = 'same';
      lastPull = now();
      finished(r);
    } catch (err) {
      if (g !== gen) return;
      failedAt(err);
      fail(err);
    }
    paint();
  }

  /**
   * Another account signed in, or a first sign-in where both this browser
   * and the account hold data (`first`): ask, and sync only with an answer.
   * Resolves to the answer, or null.
   */
  async function ask(invoker, g = gen) {
    if (!asked) return null;
    status.phase = 'paused';
    status.error = null;     // the pull behind the question went through
    paint();
    const answer = await ui.ask({ label: status.label, counts: asked.counts, since: asked.since, first: asked.first, invoker });
    // Signed out, or someone else signed in, while the question was open: the answer was for nobody.
    if (g !== gen || (answer !== 'add' && answer !== 'use')) return null;
    asked = null;
    step = answer === 'use' ? 'replace' : 'adopt';
    // Kept at once, so a sync that fails finishes this answer on its retry,
    // and what the learner does meanwhile goes to the new account. Another
    // tab's answer, already in the book, stands instead.
    engine.choose(step);
    status.phase = 'syncing';
    return answer;
  }

  /** The client, the engine and whoami, then the sync begin() decided on, or the question. */
  async function connect(g) {
    try {
      if (!client) {
        const { ConvexHttpClient } = await importClient();
        if (g !== gen) return;
        if (!client) client = new ConvexHttpClient(CONVEX_URL);
      }
      const token = await kit.convexToken();
      if (g !== gen) return;
      if (token) client.setAuth(token);
      kit.bindConvex(client);      // kept on a fresh token from here on
      if (!engine) {
        const { createSync } = await importEngine();
        if (g !== gen) return;
        if (!engine) engine = createSync({ client, local, book: books, now });
      }
      const begun = await engine.begin();
      if (g !== gen) return;
      if (begun.mode === 'ask') {
        const old = books.read();
        const first = !!begun.first;
        asked = { counts: begun.counts, since: old && !first ? old.at : 0, first };
        step = 'ask';
        if (await ask(null, g)) await runSync(step, g);
        return;
      }
      step = begun.mode;
      await runSync(step, g);
    } catch (err) {
      if (g !== gen) return;
      fail(err);
      paint();
    }
  }

  /** Run the step this sign-in is at (see `step`), once at a time. */
  function resume() {
    if (running && running.gen === gen) return running.done;
    if (!live()) return Promise.resolve();
    const g = gen;
    const done = (async () => {
      if (step === 'connect' || !engine) await connect(g);
      else if (step !== 'ask') await runSync(step, g);
    })().finally(() => { if (running && running.gen === g) running = null; });
    running = { gen: g, done };
    return done;
  }

  async function flush() {
    timer = null;
    if (!live()) return;
    const g = gen;
    if (running && running.gen === g) await running.done;   // the sync under way first; this change goes after it
    if (g !== gen || !live()) return;
    // Until a sync has finished for this account, or after one failed, the retry is the whole step.
    if (step !== 'same' || !engine || status.phase === 'error') { await resume(); return; }
    try {
      const r = await engine.flush();
      if (g !== gen) return;
      finished(r);
      if (r && r.stale) { await resume(); return; }   // a Clear all made elsewhere: read it now
    } catch (err) {
      if (g !== gen) return;
      failedAt(err);
      fail(err);
    }
    paint();
  }

  function schedule() {
    if (!live()) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => { void flush(); }, PUSH_AFTER);
  }

  watchStores({
    kanji, history, play, onPrefsSaved: prefs.onSaved, books, local, now, changed: schedule,
    known: (kind, id) => (engine ? engine.known(kind, id) : NOTHING_KNOWN),
  });

  function stop() {
    gen += 1;
    if (timer !== null) clearTimer(timer);
    timer = null;
    asked = null;
    user = null;
    step = 'connect';
    running = null;
    if (engine) engine.stop();
    // A question left open would otherwise answer for whoever is signed in by then.
    if (typeof ui.dismiss === 'function') ui.dismiss();
  }

  function signedIn(s) {
    if (user === s.userId) { status.label = s.label || ''; paint(); return; }   // a new label, nothing more
    if (user !== null) stop();      // another account, straight after the last one
    user = s.userId;
    status.signedIn = true;
    status.label = s.label || '';
    status.phase = 'syncing';
    status.error = null;
    paint();
    void resume();
  }

  function onAuth(s) {
    status.available = s.status !== 'unavailable';
    if (s.signedIn) { signedIn(s); return; }
    stop();
    status.signedIn = false;
    status.label = '';
    status.phase = 'idle';
    status.error = null;
    paint();
  }

  doc.addEventListener('visibilitychange', () => {
    if (!live()) return;
    if (doc.visibilityState === 'hidden') {
      if (timer !== null) { clearTimer(timer); void flush(); }
      return;
    }
    if (status.phase === 'error' || now() - lastPull >= PULL_EVERY) void resume();
  });
  if (win && typeof win.addEventListener === 'function') win.addEventListener('online', () => { if (live() && status.phase === 'error') void resume(); });

  const ready = (async () => {
    const mod = await importKit();
    kit = mod.NeoAuth;
    kit.onChange(onAuth);
    const s = await kit.start({});
    status.available = s.status !== 'unavailable';
    paint();
    return s;
  })().catch((err) => {
    console.warn('[yomu] the sign-in kit did not start; everything stays in this browser:', err);
    paint();
    return null;
  });
  paint();

  return {
    ready,
    /** The line's Sign in: the kit's dialog, with this page's reason. */
    signIn: async (invoker) => { await ready; return kit ? kit.requireSignIn({ reason: ui.reason(), invoker }) : false; },
    /** The line's Choose, while another account waits for an answer. */
    async choose(invoker) {
      if (running && running.gen === gen) return;
      if (await ask(invoker)) await resume();
    },
    get status() { return { ...status }; },
  };
}
