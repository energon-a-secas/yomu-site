// The stores, as sync reads and changes them, and what of the learner's own
// changes sync must carry. Loaded by js/account.js whenever the page carries
// a Clerk key, signed in or not: a browser that synced before keeps its
// removals in its book while signed out, so signing in again cannot bring
// back a kanji or a phrase unsaved meanwhile. A browser that never synced
// has no book, and nothing here writes anything for it.

import { noteRemoval, noteClear, notePrefs } from './sync-book.js';

/**
 * Every change goes through a store's own call: My kanji's adopt() (its
 * validation), History's unsave() and mergePhrases(), Play's adopt(), and the
 * page's preference setter. `applying` is true while sync writes, so a change
 * it causes is not taken for the learner's (a removal, a preference) and sent
 * back as one: a removal stamped "now" while applying another device's would
 * outrank a save made after it.
 */
export function storesAdapter({ kanji, history, play, prefs, remembering }) {
  const adapter = {
    applying: false,
    snapshot() {
      return {
        kanji: { saved: kanji.data.saved, seen: kanji.data.seen },
        phrases: history.savedList(),
        play: { games: play.data.games, mixed: play.data.mixed },
        prefs: { ...prefs.get() },
      };
    },
    apply(a) {
      adapter.applying = true;
      try {
        if (Object.keys(a.saved).length || Object.keys(a.seen).length) kanji.adopt({ saved: a.saved, seen: a.seen });
        for (const key of a.unsave) history.unsave(key, remembering());
        if (a.merge.length) history.mergePhrases(a.merge);
        if (a.play) play.adopt(a.play);
        if (a.prefs) prefs.set(a.prefs);
      } finally {
        adapter.applying = false;
      }
    },
  };
  return adapter;
}

/**
 * Listen to the four stores. An unsave and a Clear all go into the book as
 * tombstones, a preference saved with a new value is stamped, and
 * `changed()` hears every change the learner made (js/account.js debounces
 * a push on it). Returns a function that stops listening.
 */
export function watchStores({ kanji, history, play, onPrefsSaved, books, local, now = Date.now, changed = () => {} }) {
  const mine = () => !local.applying;
  const offs = [
    kanji.onChange((ev) => {
      if (!mine()) return;
      if (ev && ev.type === 'unsave') books.update((b) => noteRemoval(b, 'kanji', ev.ch, now()));
      else if (ev && ev.type === 'clear') books.update((b) => noteClear(b, ev.at));
      changed();
    }),
    history.onChange((ev) => {
      if (!mine()) return;
      if (ev && ev.type === 'unsave') books.update((b) => noteRemoval(b, 'phrases', ev.key, now()));
      changed();
    }),
    play.onChange(() => { if (mine()) changed(); }),
    onPrefsSaved((prefs) => {
      if (!mine()) return;
      books.update((b) => notePrefs(b, prefs, now()));
      changed();
    }),
  ];
  return () => { for (const off of offs) off(); };
}
