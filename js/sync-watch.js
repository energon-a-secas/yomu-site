// The stores, as sync reads and changes them, and what of the learner's own
// changes sync must carry. Loaded by js/account.js whenever the page carries
// a Clerk key, signed in or not: a browser that synced before keeps its
// removals in its book while signed out, so signing in again cannot bring
// back a kanji or a phrase unsaved meanwhile. A browser that never signed
// in has no book, and nothing here writes anything for it.

import { noteRemoval, noteClear, notePrefs } from './sync-book.js';
import { textKey } from './history-text.js';

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

const NOTHING = Object.freeze({ s: 0, removed: 0 });

/**
 * Listen to the four stores. An unsave and a Clear all go into the book as
 * tombstones, every save is stamped with its own time, a preference saved
 * with a new value is stamped, and `changed()` hears every change the
 * learner made (js/account.js debounces a push on it).
 * `known(kind, id)` is the account's copy of a row as the page last saw it
 * (js/sync.js known()). Returns a function that stops listening.
 *
 * Every time here is this device's clock, and another device's may run
 * ahead of it. So a removal or a Clear all is stamped one past the newest
 * save of that row this browser knows (the store's own, a stamp in the book,
 * the account's copy) when that is later than now, and a save is stamped
 * one past the newest removal it knows when that is later than its own
 * time: what the learner just did on the screen is what syncs, whatever
 * the clocks say.
 */
export function watchStores({ kanji, history, play, onPrefsSaved, books, local, now = Date.now, changed = () => {}, known = () => NOTHING }) {
  const mine = () => !local.applying;
  /**
   * The newest save of one row: `own` is the store's save time, which
   * sync-local.js raises to the row's join stamp when this browser brought it.
   */
  const newestSave = (b, kind, id, own) => Math.max(own ? Math.max(own, b.brought[kind][id] || 0) : 0, b.saves[kind][id] || 0, known(kind, id).s);
  /** The newest removal of one row: a removal made here, a Clear all (kanji only), the account's copy. */
  const newestRemoval = (b, kind, id) => Math.max(b.removed[kind][id] || 0, kind === 'kanji' ? b.epoch : 0, known(kind, id).removed);

  function unsaved(kind, id, own) {
    books.update((b) => {
      noteRemoval(b, kind, id, Math.max(now(), newestSave(b, kind, id, own) + 1));
      delete b.saves[kind][id];
      delete b.brought[kind][id];
    });
  }
  function cleared(at, saved) {
    books.update((b) => {
      let newest = known('kanji', null).s;
      for (const [ch, rec] of Object.entries(saved || {})) newest = Math.max(newest, rec.at, b.brought.kanji[ch] || 0);
      for (const t of Object.values(b.saves.kanji)) newest = Math.max(newest, t);
      noteClear(b, Math.max(at, newest + 1));
      b.saves.kanji = {};
      b.brought.kanji = {};
    });
  }
  /**
   * A save made here is stamped at its own time, or one past the newest
   * removal this browser knows when that is later. The store cannot keep
   * that time: a sync that merges the account's older copy of the row
   * moves the store's save back to the earliest. The stamp stays until a
   * push carries it, and never goes down. It is a new save, so it was not
   * brought to a join.
   */
  function saved(kind, id, at) {
    books.update((b) => {
      b.saves[kind][id] = Math.max(b.saves[kind][id] || 0, at, newestRemoval(b, kind, id) + 1);
      delete b.brought[kind][id];
    });
  }
  /**
   * Import is a choice made now: each save it brought back counts as saved
   * now, and after any removal or Clear all this browser knows, so the next
   * sync keeps it. Its schedule and counts are the backup's own.
   */
  function imported(chars, texts) {
    const keys = texts.map(textKey).filter((key) => history.isSaved(key));
    const kept = chars.filter((ch) => kanji.isSaved(ch));
    if (!keys.length && !kept.length) return;
    books.update((b) => {
      const at = now();
      for (const ch of kept) b.saves.kanji[ch] = Math.max(b.saves.kanji[ch] || 0, at, newestRemoval(b, 'kanji', ch) + 1);
      for (const key of keys) b.saves.phrases[key] = Math.max(b.saves.phrases[key] || 0, at, newestRemoval(b, 'phrases', key) + 1);
    });
  }

  const offs = [
    kanji.onChange((ev) => {
      if (!mine()) return;
      const type = ev && ev.type;
      if (type === 'unsave') unsaved('kanji', ev.ch, ev.rec && ev.rec.at);
      else if (type === 'clear') cleared(ev.at, ev.saved);
      else if (type === 'save') saved('kanji', ev.ch, ev.at);
      else if (type === 'import') imported(ev.chars || [], ev.texts || []);
      changed();
    }),
    history.onChange((ev) => {
      if (!mine()) return;
      const type = ev && ev.type;
      if (type === 'unsave') unsaved('phrases', ev.key, ev.saved);
      else if (type === 'save') saved('phrases', ev.key, ev.at);
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
