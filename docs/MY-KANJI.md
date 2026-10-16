# My kanji: the store, History and saved phrases

Moved out of the project's CLAUDE.md on 2026-10-14, word for word, so the
file every session loads stays short. CLAUDE.md keeps a summary and the
rules a change must not break; this is the full account, and the one to
edit.

The kanji a learner saves for review, how many texts they met each kanji
in, the collection those counts make, and, if the learner allowed it, the
texts themselves, and the phrases saved on purpose. `js/kanji-store.js`
(pure functions plus the store, no DOM), `js/kanji-words.js` (the
dictionary word a token was met as, re-exported by the store),
`js/kanji-backup.js` (Export and Import), `js/review.js` (one review's queue, no DOM), `js/collection.js`
(the jōyō list and progress, no DOM), `js/history-store.js` (History and
saved phrases, no DOM) with `js/history-text.js` (the text key, the clip,
the last-seen sentence; re-exported by the store), `js/render-save.js` (the
save toggles, the unsaved marks, the due count), `js/render-remember.js`
(the reader's ask card, the text's bookmark, "You read this before", the
new-kanji toast, the last-seen line), `js/render-mykanji.js`,
`js/render-review.js`, `js/render-collection.js` and
`js/render-history.js` (the screens), `js/events-kanji.js` (routes, the
list's actions, keys, backup) and `js/events-collect.js` (the
Collection's, History's, the bookmark's and the ask card's actions).
`npm test` runs `tests/kanji-store.test.mjs`, `tests/collection.test.mjs`,
`tests/history-store.test.mjs` and `tests/phrases.test.mjs`; the view
harness checks the toggles and marks.

**One store, `localStorage['yomu-site:kanji']`, Persist kit version 1:**
`{ saved: { char: { at, box, due, reviews, lapses } }, seen: { char: { n,
first, last, words, src?, h? } }, session: { id, counted, src?, h?, at? } }`.
`words` is at most eight `[written, reading]` dictionary forms per kanji
(`dictionaryWord` turns 降っています into 降る ふる); no sentence and no
pasted text is ever stored, and the test reads the raw store to prove it,
with `h` set too. Every field is validated on load; a store that does not
read degrades to empty with a note on the screen, and its raw value is
copied to `yomu-site:kanji:damaged` first. A bad `src`, `h` or `at` is
dropped and its record kept. `at` is when the session began (ms): set by
`beginSession(src, now)` and `clearAll(now)`, and by `load(now)` when there
is no session to read (nothing stored, or a damaged store, whose ids then
count from 0 again). Such a start must be written before History relies on
it: kept in memory only, a reload before the first count (a text with no
kanji makes none) stamped a later `at`, and History kept drafts it should
have deleted (the review of 2026-10-05 reproduced it). A damaged store is
rewritten with it at once; a first visit writes nothing until History
records, which reads the start through `startAt()`, so a visitor who never
reads anything stores nothing. A session kept by a page from before it has
none.

**Each session has a source, and each kanji remembers where it was last
met.** `SOURCES` is paste, typed, example, phrase, link, host, history.
`loadText(text, { source })` names it (examples, the phrases dialog, `#t=`,
the host's `yomu:load`, History's Read again); a paste or drop that begins a
session is paste; the box emptied by hand, and Clear, are typed. A session
kept by a page from before sources (no `src`) reads as typed. A kanji's
`src` and `h` follow the session: a fresh count sets them, and a kanji
already counted in this session takes the current ones without being counted
again, because the history key moves while a learner edits the text.

**The collection is derived, never stored.** Collected means `seen[ch].n >=
1`. The shelves are `data/kanji/joyo.json` (`yomu-joyo/1`: the 2,136 jōyō
kanji by KANJIDIC grade 1 to 6 and 8, newspaper frequency order),
emitted by `node tools/build-joyo.mjs` from the committed kanji shards
(`tools/build-kanji.mjs` writes it too, through the same
`tools/lib/joyo.mjs`); `tools/check-data.mjs` rebuilds it in memory and
fails a hand edit. It is fetched on the first settled read that is not a
restore and holds kanji, or when the Collection opens; never on boot. A
shelf's tiles are drawn only while its `<details>` is open (the `toggle`
event, which does not bubble, is heard by a capturing listener). Clearing My
kanji empties the collection; it never touches History.

**History is opt-in, and a separate store.** `state.prefs.remember` is `ask`
(the default), `on` or `off`, saved with the other preferences. The reader
asks once, after the first read that found Japanese (`#remember-ask`, a card,
not a modal, after the reading and its Translation); History's switch is the
only control after that. While it is
not `on`, `js/history-store.js` is opened only to read the saved phrases,
and written only to save or unsave one or to count a saved one read again
(below). `localStorage['yomu-site:history']`, Persist kit version 1:
`{ entries: { key: { t, first, last, n, src, s, saved? } }, session: { id,
key, before } }`. `key` is `textKey(text)`, cyrb53 of the NFKC,
whitespace-folded text in base36; the kanji store keeps only that key, as
`h`, never the text. A text is recorded where My kanji counts (`noteKanji`
in `events-read.js`): History first, then the session's `h`, then the kanji,
so the counted kanji point at it. The same text in the same session changes
nothing (a reload records nothing, and `before`, stored with the session,
still answers "You read this before"); an edit within a session deletes the
draft it leaves behind when this session created it: the same session id,
and first read no earlier than the session's `at`. An id alone is not enough,
because a kanji store that starts empty reuses ids, and an old text read once
under the same id was taken for a draft and deleted (measured in the browser
on 2026-10-05). A session with no `at` (from a page before it) deletes no
draft; `partialMatch` uses the same test to skip this session's own texts,
so an old text with a reused id is a partial match again. At most 300 texts and
300,000 characters; the least recently read goes first. Turn off forgets
every text not saved (`turnOff`: with none saved it is `erase`, the store
and the damaged copy removed) after a confirm; the kanji store's `h` keys
are left dangling, which is harmless, since the last-seen line falls back to
the kind of text.

**A saved phrase is a History entry with `saved` (a ms timestamp), and
Remember does not decide whether it is kept.** The bookmark beside Clear
(`#save-text`, shown on the same test as the ask card) and the one on each
History row save the text as last read (`state.analysis.read`), never the
box mid-edit. Saving never touches the Remember preference or the card.
With Remember not `on`, saving creates the entry, read once in this
session, and points the session at it, so a reload counts nothing; no
other text is recorded then, and a later read of a saved text (same key)
is counted with "You read this before". Saved entries count toward neither
cap and are never evicted, never deleted as a draft, and survive Forget
all and Turn off, whose dialogs count the texts not saved and say the saved
ones stay. Unsaving with Remember on leaves an ordinary entry; otherwise
the entry is deleted, since nothing else keeps it. At most 500 (`MAX_SAVED`):
the 501st is refused with a note and nothing changes. A kanji whose `h` is
a saved entry shows its sentence with Remember off too. History lists
"Saved phrases" first (always, when any exist), then the switch, then "Texts
you read" (the entries not saved, only while Remember is on), one filter for
both. Export writes them as `phrases` (`history-store.js phrasesOf`, only
when there is one) and Import validates and merges them (`cleanPhrases`,
`mergePhrases`: higher count, earlier first, later last, earlier save).
Export and Import live in `events-kanji.js`, so the kanji store is lent the
two History calls (`myKanji().lendPhrases`, bound in `events-collect.js`)
rather than opening History itself. The import note (`kanji-backup.js
importNote`, pure, tested in `tests/phrases.test.mjs`) counts the saved
kanji and kanji counts, then the saved phrases added or updated and any
that did not fit, each phrase count in the singular when it is one.

**"Times seen" counts texts, not keystrokes.** A session begins in
`events-read.js`: `loadText()` (an example, a phrase or dialogue, `#t=`, an
embed `yomu:load`), a paste or drop into an empty box or a paste over all of
it, Clear, or the box emptied by hand (the same state Clear leaves). A paste
added to the text already there continues its session: a passage pasted line
by line counted its first line once per line. Each kanji counts once per session, when
`analyzeNow()` settles, so a kanji typed in later counts after the debounce
and never per keystroke. The boot restore is `loadText(text, { restore: true
})`, which begins no session: the counted set is in the store, so a reload
counts nothing. A new caller of `loadText` that is not new content must pass
`restore` too.

**`#/kanji` and its sub-routes are routes, never text.** `takeFragmentText`
reads only `#t=`. `#/kanji` (the list), `#/kanji/collection` and
`#/kanji/history` are the three places of the screen's nav; the parent of
the review, the Collection and History is the list. The reader is hidden,
not emptied, while a route shows. A
new text the host sends (`yomu:load`, `hostLoad()`) goes back to the reader
first, by a replaceState that moves no focus: in Runcible a learner who
closed the sheet on My kanji saw their list again behind the next phrase.
The same text sent again stays put and is no new session, because WebKit
fires the frame's load on a hash change and Runcible then resends it.
Back is `history.back()` only when the history entry before this one (each
entry is stamped `state.yomuIx`) is the parent route; otherwise it is a
replaceState, so Back never leaves the site and never steps into a review.
Start review applies the route at once, because a Space pressed before
`hashchange` fired landed on the list. A route change closes any open dialog
first: browser Back with a tile's dialog open drew History under a dialog
that stayed up.

**No kanji is written into an attribute here either.** Toggles find their
kanji by `data-kid` (the analysis' kanji list) or `data-ix` (the list the
screen drew; a Collection tile adds `data-shelf`), and a toggle's name ("Save
天 to My kanji") is a visually hidden label in text nodes, as is a tile's ("雨,
seen in 3 texts"). History's rows are found the same way, and their buttons
are described by the row's text through `aria-describedby`, an id. Meanings and readings come from `reader.js kanjiInfo()`
(the dictionary's kanji shards), never from the store.

**My words is a store of its own, reviewed with the kanji.** The Word
panel's bookmark (`word-save`, beside the word) saves the chosen token as its
dictionary form and reading, 食べました as 食べる たべる, with its first
meaning cut to one line of at most 120 characters; a particle, a number, a
name and a guess have no bookmark (`render.js savableWord`).
`localStorage['yomu-site:words']`, Persist kit version 1:
`{ saved: { id: { w, r, g, at, box, due, reviews, lapses } } }`, `id` the
cyrb53 of written form and reading in base36 (`wordId`), so 方 read かた and
方 read ほう are two words and a key is ASCII, which sync needs. Read field by
field like the kanji store; a value the kit cannot read is kept aside as
`yomu-site:words:damaged`, and nothing is written for a first visit. At most
2,000 saved here (`MAX_SAVED_WORDS`): the next save is refused with a note,
and Import counts what did not fit; what sync brings from the account is
kept whole (docs/SYNC.md). Another tab's write is read again
(`events-words.js bindWords`). The schedule is
the kanji's (`kanji-store.js schedule`). A review takes the due kanji, then
the due words (`dueAll`); a word sits in the review's queue as `w:` and its
id, which no one-character kanji can be, its card shows the word, then its
reading with romaji and its meaning, and `answerAny` moves the schedule of
whichever it is. The list's due line, the header's due count and the
summary's next review name kanji, words or both. `#/kanji/words` lists them,
the most recently saved first, with Read it and the bookmark that unsaves;
the backup carries them as `words` (only when there is one), merged on
Import by more reviews, the earlier save and the higher lapses
(`mergeWords`).

**Review schedule:** saved is box 0, due that day; Got it moves up one box,
due in 1, 2, 4, 8, 16 days (top box repeats 16); Again is box 1, due tomorrow,
and comes round again in the same review as practice that does not move the
schedule a second time.

**Safari never focuses a clicked button**, so focus after a repaint is
restored for keyboard users and cannot be asserted after a mouse click in
WebKit. The header link is 36px tall on a phone because the header kit sizes
header controls; everything on the screen itself is 44px under
`pointer: coarse`.
