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

export function clerkKey(doc) {
  const meta = doc && doc.querySelector('meta[name="clerk-publishable-key"]');
  return meta && typeof meta.content === 'string' ? meta.content.trim() : '';
}

/** Whether this page has accounts at all: a key, and not an embed (the frame hides the header, so there is nowhere to sign in). */
export function accountsWanted(doc, embed) {
  return !embed && clerkKey(doc).length > 0;
}

/**
 * Start accounts on this page, or do nothing at all. Returns null when
 * dormant, otherwise { ready, signIn(invoker), choose(invoker), status }.
 *
 * deps: doc, win, embed; importKit, importClient, importEngine (the three
 * dynamic imports); kanji, history, play (the stores); prefs { get, set,
 * onSaved }; remembering(); books (sync-book.js openBook()); ui { paint(status),
 * ask(info) -> 'add' | 'use' | null, refresh(), reason() }; now; setTimer,
 * clearTimer.
 */
export function startAccount(deps) {
  const { doc, win, embed, importKit, importClient, importEngine, kanji, history, play, prefs, remembering, books, ui } = deps;
  if (!accountsWanted(doc, embed)) return null;
  const now = deps.now || Date.now;
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((t) => clearTimeout(t));

  const local = storesAdapter({ kanji, history, play, prefs, remembering });
  const kept = books.read();
  const status = { available: false, signedIn: false, label: '', phase: 'idle', at: kept ? kept.at : 0, synced: !!kept, error: null };
  let kit = null;
  let client = null;
  let engine = null;
  let user = null;
  let timer = null;
  let lastPull = 0;
  let asked = null;      // the question waiting for an answer: { counts }

  const paint = () => { try { ui.paint({ ...status }); } catch (err) { console.error('[yomu] sync line', err); } };
  const syncing = () => !!engine && status.signedIn && status.phase !== 'paused';

  function fail(err) {
    const offline = (win && win.navigator && win.navigator.onLine === false) || err instanceof TypeError;
    const kind = offline ? 'offline' : 'server';
    // Said once on the line, and once on the console, however often it repeats.
    if (status.phase !== 'error' || !status.error || status.error.kind !== kind) console.warn('[yomu] sync failed, everything stays in this browser:', err);
    status.phase = 'error';
    status.error = { kind, detail: offline ? '' : String((err && (err.code || err.message)) || err) };
  }

  function finished(r) {
    if (r && r.at) status.at = r.at;
    status.phase = 'synced';
    status.error = null;
    status.synced = true;
    if (r && r.applied) ui.refresh();
  }

  async function runSync(mode = 'same') {
    if (!engine) return;
    status.phase = status.phase === 'error' ? 'error' : 'syncing';
    paint();
    try {
      const r = await engine.sync(mode);
      lastPull = now();
      finished(r);
    } catch (err) {
      fail(err);
    }
    paint();
  }

  async function flush() {
    timer = null;
    if (!syncing()) return;
    try {
      const r = await engine.flush();
      finished(r);
      if (r && r.stale) { await runSync('same'); return; }   // a Clear all made elsewhere: read it now
    } catch (err) {
      fail(err);
    }
    paint();
  }

  function schedule() {
    if (!syncing()) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => { void flush(); }, PUSH_AFTER);
  }

  watchStores({ kanji, history, play, onPrefsSaved: prefs.onSaved, books, local, now, changed: schedule });

  /** Another account signed in: ask, and sync only with an answer. */
  async function ask(invoker) {
    if (!asked) return;
    status.phase = 'paused';
    paint();
    const answer = await ui.ask({ label: status.label, counts: asked.counts, invoker });
    if (answer !== 'add' && answer !== 'use') return;
    asked = null;
    await runSync(answer === 'use' ? 'replace' : 'adopt');
  }

  function stop() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    asked = null;
    user = null;
    if (engine) engine.stop();
  }

  async function signedIn(s) {
    status.signedIn = true;
    status.label = s.label || '';
    if (user === s.userId && engine) { paint(); return; }   // a new label, nothing more
    user = s.userId;
    status.phase = 'syncing';
    status.error = null;
    paint();
    try {
      if (!client) {
        const { ConvexHttpClient } = await importClient();
        client = new ConvexHttpClient(CONVEX_URL);
      }
      const token = await kit.convexToken();
      if (token) client.setAuth(token);
      kit.bindConvex(client);      // kept on a fresh token from here on
      if (!engine) {
        const { createSync } = await importEngine();
        engine = createSync({ client, local, book: books, now });
      }
      const begun = await engine.begin();
      if (begun.mode === 'ask') {
        asked = { counts: begun.counts };
        await ask(null);
        return;
      }
      await runSync(begun.mode);
    } catch (err) {
      fail(err);
      paint();
    }
  }

  function onAuth(s) {
    status.available = s.status !== 'unavailable';
    if (s.signedIn) { void signedIn(s); return; }
    stop();
    status.signedIn = false;
    status.label = '';
    status.phase = 'idle';
    status.error = null;
    paint();
  }

  doc.addEventListener('visibilitychange', () => {
    if (!syncing()) return;
    if (doc.visibilityState === 'hidden') {
      if (timer !== null) { clearTimer(timer); void flush(); }
      return;
    }
    if (now() - lastPull >= PULL_EVERY) void runSync('same');
  });
  if (win && typeof win.addEventListener === 'function') win.addEventListener('online', () => { if (syncing() && status.phase === 'error') void runSync('same'); });

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
    choose: (invoker) => ask(invoker),
    get status() { return { ...status }; },
  };
}
