// One device for the sync tests: the page's real stores (My kanji, History,
// Play), opened over memory and wired the way js/account.js wires them
// (storesAdapter, watchStores with the engine's known()), a book, and the
// sync client against a fake Convex (fake-convex.mjs) that runs the real
// server handlers. `failing.on(name)` makes a call throw as a lost
// connection does. Clocks are in minutes from T(0) and each device has its
// own, which is how the clock-skew tests set one behind another.

import { fakeClient, memoryStore } from './fake-convex.mjs';
import { createSync } from '../../js/sync.js';
import { storesAdapter, watchStores } from '../../js/sync-watch.js';
import { openBook } from '../../js/sync-book.js';
import { openKanji } from '../../js/kanji-store.js';
import { openHistory } from '../../js/history-store.js';
import { openPlay } from '../../js/play-store.js';

export const T = (n) => 1_700_000_000_000 + n * 60_000;
export const day = (n) => new Date(T(n)).toISOString().slice(0, 10);

export function device(server, subject, { at = 0, remember = 'on', fail } = {}) {
  let clock = T(at);
  const now = () => clock;
  const kanji = openKanji({ store: memoryStore(), readRaw: () => null, keepRaw: () => {} }).load(now());
  const history = openHistory({ store: memoryStore(), readRaw: () => null, keepRaw: () => {}, dropRaw: () => {} }).load();
  const play = openPlay({ store: memoryStore(), readRaw: () => null, keepRaw: () => {} }).load();
  const state = { prefs: { lang: 'en', furigana: true, romaji: 'said', highlights: true, unsaved: 'mark', slow: false, remember, translate: 'off' } };
  const prefsListeners = new Set();
  const savePrefs = () => { for (const fn of prefsListeners) fn(state.prefs); };
  const local = storesAdapter({
    kanji, history, play,
    prefs: { get: () => state.prefs, set: (c) => { Object.assign(state.prefs, c); savePrefs(); } },
    remembering: () => state.prefs.remember === 'on',
  });
  const bookStore = memoryStore();
  const books = openBook({ store: bookStore });
  let pushes = 0;
  let sync = null;
  watchStores({
    kanji, history, play, books, local, now,
    onPrefsSaved: (fn) => { prefsListeners.add(fn); return () => prefsListeners.delete(fn); },
    changed: () => { pushes += 1; },
    known: (kind, id) => sync.known(kind, id),     // as js/account.js wires it
  });
  const failing = { on: fail || (() => false) };
  const client = fakeClient(server, subject, { fail: (...a) => failing.on(...a) });
  sync = createSync({ client, local, book: books, now });
  return {
    kanji, history, play, state, books, bookStore, client, sync, failing,
    get changes() { return pushes; },
    tick(n = 1) { clock += n * 60_000; return clock; },
    now,
    setPref(k, v) { state.prefs[k] = v; savePrefs(); },
    /** Read a text: count its kanji and their words, as events-read.js noteKanji does. */
    read(chars, words = {}) {
      kanji.beginSession('paste', now());
      kanji.record(chars, new Map(Object.entries(words)), day(clock / 60_000 - T(0) / 60_000));
    },
    saveText(text) { return history.save(text, kanji.sessionId, 'paste', now()); },
    /**
     * A sign-in, as js/account.js runs it. A browser that never joined an
     * account, holding saved kanji or phrases, is asked first when the
     * account holds data too (CLAUDE.md); the learner's answer is `answer`,
     * Add by default, which is what every test written before that question
     * existed assumed. `answer: null` returns the question instead, as does
     * a sign-in to another account.
     */
    async signIn({ answer = 'adopt' } = {}) {
      const b = await sync.begin();
      if (b.mode === 'ask' && b.first && answer) {
        sync.choose(answer);
        return sync.sync(answer);
      }
      if (b.mode === 'ask') return b;
      return sync.sync(b.mode);
    },
    mutations: () => client.calls.filter((c) => c.kind === 'mutation'),
  };
}

export const today = (d) => day(Math.round((d.now() - T(0)) / 60_000));
