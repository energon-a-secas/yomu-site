# CLAUDE.md: Yomu

A Japanese reader. Paste a line and Yomu splits it into words, puts furigana
over the kanji, writes two romaji lines (how it is said, in Genki's
convention, and how it is spelled, kana by kana), names the special sounds and
the grammar, and lists the kanji with their readings in this text. Runcible
embeds it (`docs/EMBED.md`). Everything runs in the browser from committed
JSON; nothing is sent anywhere unless the learner clicks a translate link,
or signs in, which is optional and syncs My kanji, saved phrases, Play and
the display preferences to their account (Accounts and sync, below).

**Live:** yomu.neorgon.com · **Port:** 8895

## Run

```bash
make serve       # http://localhost:8895
make validate    # node tools/check-data.mjs, then npm test
make data        # rebuild data/dict, data/kanji, data/names, data/like and data/play from the pinned upstreams (manual)
npm test         # node --test tests/*.test.mjs
node tools/compare-readings.mjs <old data/> [data/]   # every token two builds read differently, over Tatoeba
npx convex dev --once   # push convex/ to the dev deployment (convex/README.md); never `npx convex deploy` from a worktree
```

`npm test` is the definition of done for anything under `js/` that is not a
render module. The analyzer has no DOM, so the sentence suites run under plain
node against the committed shards (`tests/helpers/disk.mjs`).
`tests/harness.html` renders a fixture analysis without the analyzer.

## Where things are

- `docs/ANALYZER.md` is the contract: the pipeline, the module table, the
  token shape, the data formats. A module that disagrees with it is the one
  that is wrong; if the contract was wrong, change it in the same commit.
- `docs/EMBED.md` is the `yomu-embed/1` protocol. Runcible's host side is
  `projects/runcible-site/js/yomu-host.js`; the two share no code.
- `js/kana.js` owns every romaji decision. `js/notes*.js` owns every
  explanation string, `{ en, es }`. A token carries ids, never prose.

## Gotchas

**Romaji has two lines on purpose, and a long vowel never crosses a morpheme.**
`said` doubles う after an o beat and い after an e beat (さようなら sayoonara,
せんせい sensee) only inside one morpheme. The cuts come from the furigana
split, the deinflection chain and the final kana of a v5u verb, so 思う stays
omou and 小売 stays kouri. Particles (は, へ, を inside particle and copula
tokens) are read wa, e, o; the fossil は of こんにちは rides on the record's `w`
flag. Devoicing is a note in Genki's s(u)kides(u) notation, never a change to
the romaji line. A kana and a small vowel are one beat and one syllable
(フィレンツェ fi-re-n-tse, ピッツァ pittsa): the digraphs are `GENKI_MAP`, and
`kana.js` repeats them after っ and ん, because wanakana's own table wins
there and read スパゲッティ as supagettei. A new digraph goes in `GENKI_MAP`
only, and `tools/build-sounds-like.mjs` is rerun, since `loan-align.js`
lines up beats by their romaji.

**A key is in the core or in one range shard, and a range shard is fetched
only when the filter lets one of the text's keys through.** A key outside
`data/dict/core.json` resolves to the last range shard whose `first` is <= the
key, in plain JS string order; the builder and `js/dict.js` must agree on that
order (UTF-16 code units, not locale), and both hash with `js/bloom.js`. A
sentence loads a median of three dictionary files (it was eighteen), a long
paragraph most of them. The first pass calls `dict.need` once (the second
phase calls it again only for the ichidan verb behind a kanji guessed
alone): anything a key needs from another key (`o`, `b`, `c`) is on its
record, built by `tools/lib/prices.mjs`. A cost that reads a second key with
`dict.get` must be shipped the same way, or it reads whatever an earlier
paste happened to load.

**Record order is filing order, and no reading may depend on it.** Two
records of a kana key that every context-free price ties are ordered by the
builder's `t` (the corpus count of their spellings), and the regression test
reads its cases with every key's records reversed and rotated. Kanji keys
with several readings (方 かた and ほう, 中 なか and ちゅう) still tie on the
same count, so reversing the records changes 185 of 3,016 test texts; a new
signal for those is open work, not a reason to reorder the data.

**Every JSON file is at most 140,000 bytes.** `tools/check-data.mjs` fails on
141 KB. The builders pack contiguous key ranges up to that size.

**The dictionary glosses are upstream data, not our copy.** Seven JMdict
glosses contain a word the fleet's copy rules ban (パワフル is "powerful"); the
builder drops a banned word only when the sense has another gloss. Do not
"fix" them in `data/`: rebuild, never hand-edit a shard. The same goes for
KANJIDIC's radical numbers ("one radical (no.1)" beside "one" for 一, 99
kanji in all): the data keeps them and `reader.js shownMeanings` leaves them
out of every meaning the page draws, while another meaning is left.

**Words outside JMdict's common set ship by rule, not by count alone.**
`tools/lib/extra.mjs` names the four rules and `MIN_MATCHES` (5) is
measured (docs/ANALYZER.md). Lowering it is not free: at 3, 六百 became a
word instead of a number, 清水 "spring water" instead of the surname, and six
tests failed; filtering out only conjugations, the full release shipped
verb stems and phrases (はし read 愛し, くじ read ９時). Rebuild with
`node tools/build-dict.mjs`, then compare the old data/ with the new over the
corpus (`node tools/compare-readings.mjs`, a copy of the old tree as its first
argument) and diff the sentence suites before changing it. The fourth rule,
mixed, ships a spelling like あめ色 (飴色, amber) whose hiragana the first
tier reads as another word (あめ is 雨 first) and folds its katakana form
(アメ色) onto it; its hiragana part needs two kana and may not start with a
particle after a kanji (何がし read 何がしたい as 何がし|たい), and it is
banded only on `MIN_MATCHES` matches, so the bands the common keys fill do not
grow. `YOMU_RULES_OFF=mixed` (or `asked`) builds without a rule, for a
measuring run only.

**A number before 名 is a count of people, めい.** 名 is in the counter
table (`numbers.js`), so 十名 is じゅうめい and 三名 さんめい, one number token;
until 2026-10-05 the run reached the second phase as a kanji stretch and read
as the surname とな and the place さんみょう. A counter added to that table
wins over any name across it, because `names.js` never reads a name across a
number and its counter. A number token whose whole surface is a first-tier
key read the same way keeps that record as its `entry` (何名 "how many
people", 何分 "what minute", `lattice.js countedRecord`), and stays a number:
same kind, reading and notes, and the Word panel still calls it a number.
十分 read じゅっぷん takes nothing from 十分 じゅうぶん "enough".

**The rest of JMdict and the names are read only where the first pass
guessed, and never change a token it read.** The second phase (`js/rare.js`,
docs/ANALYZER.md "The second phase") reads a stretch of guessed tokens again
with the second tier (`data/dict/rare.json`, `rNNN`, `rfNN`: every entry
and spelling the first tier does not ship) and the names
(`data/names/`, JMnedict). A token outside such a stretch is the token the
first pass built, field for field (its grammar notes excepted, which are
worked out after both passes from the token before it), and
`tests/tiers.test.mjs` holds it to that; a text with no guess fetches no
file of either. Letting the rare words into the first pass is what read はし
as 愛し: do not. A rare word carries `entry.tier === 2`; a name the names
tier knows is `kind: 'name'` with `confidence: 'dict'` and its JMnedict
reading, and one it does not know is still a guess read kun by kun
(`names.js`). The Word panel labels a rare word ("Rare word", and one
sentence: not among the common words, read from the full dictionary). The
footer line names JMnedict and the Sources dialog quotes its acknowledgement
(`tools/lib/licence.mjs`); both stay while any name can show.

**A name's reading and strength are evidence JMnedict holds, and each count
has a trap.** `tools/lib/jmnedict.mjs` counts the names built on a spelling
(`ext`), the full names that end with it (`suf`) and longer given names
(`gext`). A longer given name read the short one as みさ (美咲央), a katakana
place made バグ a strong name (バグダッド), and places named 東 + something
read 東大 ひがしおお: each is excluded, and `tests/names.test.mjs` holds the
rules to a JMnedict of a few entries. A strong katakana name never beats the
kana spelling of a common word (`e`), and a kanji surname read another way
than the rare word beats it only when sure (`S`), because the reading is
what a learner copies (`js/rare.js` outranks).

**A katakana name says how it is written: JMnedict's spellings, Tatoeba's
choice.** Every katakana given name, surname, person and place JMnedict
spells in Latin letters ships (`o`, about 31,000 names, corpus or not), and
the token carries it as `name: { o, types }` (トム is Tom); the Word panel
shows "Name: Tom (given name)" on a line of its own. JMnedict's order is no
evidence (its first was Jon, Keito, Malhia), so `tools/lib/original.mjs`
picks the spelling the English sentences linked to the name's sentences
use most (John, Kate, Maria), and only a name the corpus never met keeps
the first. Do not go back to JMnedict's order or to counting spellings
over JMnedict (romanizations win: Keito 73, Kate 4). `person` ships for katakana only: a kanji spelling
typed person (相模) stays out. A katakana record's types lead with those of
the JMnedict sense its `o` came from (`jmnedict.mjs latinTypesOf`): キャシー
is "Casei" a surname and "Cathy" a woman's name, so Cathy is `fem surname`,
and リヨン Lyon `place fem`. `data/names/popular.json` is the Name decoder's
input: its format (`yomu-names-popular/1`, rows `[katakana, Latin, given |
surname | person | place, count]`) is emitted by `build-names.mjs` (each row
read by the analyzer, kept only when the page reads it as that name: バラ is
a rose) and `check-data.mjs` holds it to `tools/lib/popular.mjs`. Its type
is the record's first, except that a `place` the corpus uses as a person (an
honorific after it, or Mr., Mrs., Ms. or Dr. before its spelling in the
linked English, in 2 sentences and a fifth of its count: スミス and 7 more)
is a `person` there and only there; the Word panel keeps JMnedict's. A
spelling with no capital (エイヴォン "avon") and a name met only as the
stem of 語 or 人 (ベルベル, タタール, タガログ) are left out; a name typed
only `person` stays out, as before. Change the format only together with
that game.

**A katakana compound is one token, and the lattice already chose its
parts.** `compounds.js` joins katakana pieces that touch (テニス|トーナメント,
インフォーム|ショップ) into one token with `parts` after both passes; it does
not search for a split of its own. The second phase's floors (three kana for
a common word, four for a rare one) are what keep イン|フォーム out, and a
"fewest parts of two beats" search puts it back. A part with no record stays
a guess with no gloss: the page says "not in the dictionary", never a gloss
it made up.

**A part's sound-alike is a measured guess, and it is never a gloss.**
`sounds-like.js` gives such a part `soundsLike` (インフォーム "inform") from
the loanword rules run backwards over the English words JMdict glosses with
(`data/like/`), and the Word panel shows it on a line of its own as "a guess
from the sound, not a dictionary entry"; the part's `gloss` stays null. The
rule in `LIKE` was chosen on a development quarter of JMdict's own loanwords
and read once on a held-out quarter (docs/ANALYZER.md, "Sounds like
English"): change it, or the odds, only with `node tools/measure-sounds-like.mjs`
before and after, never tune it on the held-out quarter, and do not ship a
rule under 80 in 100 on the words it answers. `data/like/` is emitted from
the committed shards by `node tools/build-sounds-like.mjs`, so rerun it after
`build-dict.mjs`; nothing fetches it for a text with no such part.

**Loanword rules are sound entries, told apart by the `loan-` prefix.**
`loanwords.js` adds them to `token.sounds` so the page lights their kana and
keeps their note open the way it does for a sound; `render-notes.js` groups
them under "Loanword rules" by the prefix, because the page imports no
analyzer module before the first text. Every rule but f and wasei needs the
English lined up consonant by consonant with the `ls` source or the first
gloss (`loan-align.js`); a word `ls` says is from another language gets none
(ビール is Dutch), and a later gloss is ignored for a word marked `u` (サバ
is 鯖, and its slang sense "server" read as v written バ).

**The text stays in the browser; a saved phrase also goes to the account
of a learner who signs in.** The text persists under
`localStorage['yomu-site:text']`, and under
`localStorage['yomu-site:history']` while the learner has Remember on, or
when they saved that text on purpose with the bookmark (see My kanji below);
never in the URL, an attribute, the title or the beacon target. A backup
file carries the saved phrases and no other text. Signed in (Accounts and
sync, below), what leaves the device is the saved phrases (their text, the
counts and the times), My kanji (schedules, counts, the eight words per
kanji, `src` and the history key `h`, never a sentence), Play's store, and
lang, furigana, romaji, highlights, unsaved and slow; never the text in the
box, a History text not saved, the remember and translate choices, or the
session. An unsaved phrase leaves its key and the time of the removal on
the server, never its text. Signed out, nothing leaves.
`#t=<text>` is read once (for links from other Neorgon sites, with their own
authored text) and removed with `history.replaceState`. The DeepL and Google
links are built at click time.

**The Translation is the browser's, on the device, and only after a click.**
`js/translate.js` wraps the Translator API (Chrome 138+, Edge 148+, desktop
only; Firefox, Safari and phones have none) and `js/render-translate.js`
draws the section under the reading. Creating a translator whose model must
still be downloaded needs the learner's activation, so the first one is made
inside the Translate here click, before anything is awaited; after that
`prefs.translate` is `on` and every settled read is translated on the device
with nothing to click, until Hide. The translation lives in memory only (20
at most), as a text node, and is not a live region. A cross-origin frame gets
the API only through its host's `allow="translator"`; without it
`availability()` rejects, which reads as unavailable, never as an error.
Every request ends in something the learner can act on, the translation or a
failure line with Try again: in a real Chrome 154 run a create() never
settled and "Translating on this device." stayed until a reload. So
`translate.js` gives a request up after `QUIET_MS` (20 s) with neither a
`downloadprogress` event nor a result; each event starts the wait again, so a
slow download is never cut off. Progress reaches every request waiting on a
translator, and only while it waits: a download heard after the failure must
not put "Downloading" back on screen with nothing left to end it. A
translator whose create() or translate() failed or hung is forgotten, so Try
again makes a fresh one; a result that arrives after its request gave up only
fills the cache. `failureKind` names what the page says in plain words:
NotAllowedError needs a click; QuotaExceededError, or NotSupportedError, is
the browser busy (Chrome refuses a translator over its per-profile service
count with NotSupportedError "Unable to create translator", and writes "The
translation service count exceeded the limitation." to the console only, so
the name is the only signal; `check()` has already ruled out an unsupported
pair); anything else shows its own text. The same NotSupportedError also
carries Chrome's permanent refusals (policy, a broken or crashed service),
which "try again in a moment" will not cure; the busy line names DeepL and
Google for that reason. A translate() fires no progress, so one that takes
longer than the quiet period on a slow machine is reported as stalled; its
late result still fills the cache, and Try again answers from it. Chrome's
`inputQuota` is Infinity, so a QuotaExceededError there is not a long text.
Headless Playwright browsers ship no model, so the section is tested with a
fake API (`tests/translate.test.mjs`, the quiet period injected as
`quietMs`) and by hand in a real Chrome.

**The embed answers only listed origins.** `js/embed.js` accepts messages from
`https://runcible.neorgon.com` and Runcible's dev server on 8878, checks
`event.source === window.parent`, and posts only to the origin of the last
accepted `yomu:hello`. A new host goes into that list and into `docs/EMBED.md`
in the same commit.

**An embedded frame is as tall as its page, so nothing may be fixed to the
frame's viewport and expected on screen.** The host sizes the iframe from
`yomu:height`, so the frame's viewport is the whole page and the host's sheet
shows only a window of it. The first cross-browser check found the
new-kanji toast drawn below that window in all six runs, and a kanji's
dialog centred a screen away from it. So in an embed `render-remember.js
notify()` writes the toast's text into `#embed-note`, a line under the
status, cleared when the next session begins; and `dialogs.js openDialog`
places a dialog beside its opener inside the band of the frame the top page
shows, which an IntersectionObserver with no root reports in the frame's own
coordinates (measured the same in Chromium, WebKit and Firefox, cross-origin).
A new floating element in an embed needs one of the two. Play's answers are
the third case: `events-play.js reveal` calls `scrollIntoView({ block:
'nearest' })` on the feedback, a new grid, a question or a result, now and
again once the host has resized the frame. Measured 2026-10-05 from inside
the cross-origin frame in Runcible's sheet at 390x844, it scrolls the sheet
in Chromium and Firefox and does not in WebKit (`focus()` does not either),
so in WebKit only the layout keeps them in view: `play.css` draws Next on the
feedback's first row, a found grid's feedback takes the prompt's place above
the grid, and under 600px wide (a phone, or any host's sheet) the options
and grids are compact, cells 48 to 56px and never under 44 on a coarse
pointer. A control that follows an answer goes inside the feedback block,
never under it.

**Nothing from Genki, the Japan Foundation apps, Tofugu, Yomitan, rikaichan
or 10ten is in this repository.** The deinflection table was written for
Yomu from grammar; Genki was read for its order and its romaji convention
only; the phrase library and every note are original. Keep it that way: GPL
rule tables cannot be copied into this MIT site, and textbook text is
copyrighted.

## My kanji

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
not a modal); History's switch is the only control after that. While it is
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

**Review schedule:** saved is box 0, due that day; Got it moves up one box,
due in 1, 2, 4, 8, 16 days (top box repeats 16); Again is box 1, due tomorrow,
and comes round again in the same review as practice that does not move the
schedule a second time.

**Safari never focuses a clicked button**, so focus after a repaint is
restored for keyboard users and cannot be asserted after a mouse click in
WebKit. The header link is 36px tall on a phone because the header kit sizes
header controls; everything on the screen itself is 44px under
`pointer: coarse`.

## Play

Four games with the characters that look alike, at `#/play`: Which one?
(`#/play/which`, the kana for a romaji, or the kanji for its meanings and a
reading, among its look-alikes), Odd one out (`#/play/odd`, a grid of one
character hiding one look-alike), Twins across scripts (`#/play/twins`, カ or
力 by the word around it) and Name decoder (`#/play/names`, a katakana name
to its original spelling). `js/routes.js` names every route (moved out of
`events-kanji.js`, which still applies them, with the same history stamps and
Back for Play: a game's parent is `#/play`, `#/play`'s the reader).
`js/events-play.js` (the hook that draws a route, the rounds, the keys, the
actions), `js/events-odd.js` (Odd one out's grid and clock),
`js/render-play.js` (the list, the result, the shared lines),
`js/render-games.js` (the four question screens), and, with no DOM,
`js/play-rounds.js`, `js/play-store.js`, `js/play-data.js`,
`js/play-clock.js` (Odd one out's deadline), `js/play-kana.js` and
`js/play-twins.js` (the authored content, CC0), all run by
`tests/play.test.mjs`. The section is `#play` in `index.html`; the
header's Play link moves into the kit's ⋯ menu on a phone (with it kept, the
Spanish header ran 2px past 390), and the embed bar has one beside My kanji.

**A round is ten questions, and only the first answer counts.** Keys 1 to 4
(1 to 3 in Twins) answer, Enter or Space goes on, Escape leaves (its default
prevented, so an embedded Yomu does not close the host's sheet too), and no
key acts in a field, mid-IME, with a modifier or while a dialog is open.
Focus goes to the prompt on a new question, to the feedback once answered,
to the heading on the result; Back from a game focuses its Start. Entering a
game begins a new round; leaving abandons it, and nothing of it is kept.
Odd one out's clock starts only on Start the clock, is a deadline that
stands still while the game is not on screen, and loses 3 seconds per wrong
tap; the untimed ten grids are the default under `prefers-reduced-motion`.
Not on screen is the page hidden (`visibilitychange`), `#pl-body` out of
what the top page shows (an IntersectionObserver with no root), or a frame
its host no longer draws: when Runcible closes its sheet the frame's
`visibilityState` stays visible, and a clock that heard only the first ran
out behind the closed sheet and recorded a round of 0. Measured 2026-10-05:
Chromium and WebKit report the closed sheet to the observer; Firefox
reports nothing, stops drawing the frame and reads its viewport as 0 by 0,
which every tick checks. A round that runs out ends only once an observer
has just seen the game on screen (`events-odd.js confirmEnd`), and the
arithmetic is `js/play-clock.js`, pure, in `performance.now()` (an observer
entry's `time` says when it saw the game leave). A
clock started before the grid's pairs are in waits for them: Firefox once
moved focus from the first grid to the prompt when the load finished after
the click.

**One store, `localStorage['yomu-site:play']`, Persist kit version 1:**
`{ games: { which|odd|oddFree|twins|names: { best, rounds } }, mixed:
{ 'シ|ツ': n } }`. `odd` is timed and `oddFree` untimed, since the scores do
not compare. A `mixed` key is two of the games' own characters, sorted
(`pairKey`), counted at each wrong answer; Which one? and Odd one out draw a
pair mixed up `n` times `1 + 2 min(n, 5)` times as often. No text is kept.
Read field by field like the kanji store; a damaged value is copied to
`yomu-site:play:damaged` and the page starts empty with a note.

**The kanji look-alikes are a rule over the shards, measured.**
`data/play/lookalikes.json` (`yomu-lookalikes/1`, 378 jōyō kanji, 288 pairs,
7.3 KB) is emitted by `node tools/build-lookalikes.mjs` from the committed
kanji shards' KanjiVG `parts` and KANJIDIC strokes plus `CLASSIC`, the pairs
parts cannot see (土 士, 己 已 巳, ...), all in `tools/lib/lookalikes.mjs`;
`tools/check-data.mjs` rebuilds it in memory and fails a file that is not
that output, a key outside the jōyō list, more than five, a self-listing or
a pair one way only. **Rerun the builder after any rebuild of
`data/kanji/`.** The rules: one kanji is the other plus a stroke (日 白), the
same parts within a stroke (未 末 本), the same parts but a look-alike one
(休 体), the same phonetic with two left or two top radicals (待 持, 帳 張),
or the same top or enclosing part (雪 雲, 間 問). The criterion: would a
learner who knows neither confuse them at a glance, the same layout and
most of the ink shared. Sixty pairs drawn at random from the shipped file
(`--sample 60 20261005`): 58 look alike. The first draft also took a shared
left radical with small right parts (記 討, 打 払), which cost 6 of 60;
dropped. What the rule still gets wrong: KanjiVG's parts say nothing of
layout, so 員 唄 (口 over 貝, beside it) pass as the same parts; a part list
that leaves out an unnamed middle reads 微 散 as one radical apart; and it
misses pairs whose difference is not a whole part (思 恵, 賃 貸, 遣 遺 are in
`CLASSIC` for that). 247 of the 378 have one look-alike, so Which one? fills
its four options from look-alikes of look-alikes, then the pool's kanji
nearest in strokes. Meanings are KANJIDIC's English; in Spanish the screen
says so once.

**The Name decoder reads `data/names/popular.json`, which the dictionary
build emits** (`yomu-names-popular/1`: `[katakana, original, given | surname
| person | place, Tatoeba count]`, most used first). The game names only two
classes, "a name" or "a place" (`play-rounds.js nameClass`), and draws the
three other spellings from the answer's class: JMnedict's finer types are
wrong for many a famous foreign name, and options of one finer type gave the
answer away (フランツ Franz among Fairmont, Lucca and Tampa). The corpus has
no person evidence for ロミオ, フランツ or ゴッホ, so they are still places.
Before it ships the file is a 404,
which the list and the game say in words ("Not available yet") and never
throw; Chromium and WebKit still log that one 404 as a console line, since a
static page can only learn a file is missing by asking. Tests use the
hand-written `tests/fixtures/popular-names.json`; never copy it into `data/`.

**The hints and the twins' words are ours.** Which kana and kanji look alike
is a fact; every hint, word and note in `js/play-kana.js` and
`js/play-twins.js` was written for Yomu from the shapes, and none was taken
from Tofugu, the Japan Foundation apps, Genki, WaniKani, an Anki deck or a
published list. 卜 has no word a beginner meets; its two words are the real
ones and its note says it is rare.

## Accounts and sync

Optional, through the Neorgon Auth Kit (`packages/neorgon-ui/auth/README.md`,
vendored as `js/neorgon-auth.js`, `js/neorgon-auth-sites.js`,
`css/neorgon-auth.css`; the slot is `div.neo-auth` before `.header-home`,
the key is the fleet's production `pk_live_`). Signed in, My kanji, the
saved phrases, Play's store and the six display preferences sync to Convex
project `yomu` (team lucio; dev deployment `jovial-mouse-131`, its URL in
`js/account.js CONVEX_URL`; `convex/README.md`). Signed out, or never signed
in, every store stays in this browser exactly as before. The rules in
brief, which a review checks the code against, open `convex/README.md`
("Sync rules"); the paragraphs below say why each is so. The modules:
`js/sync-rules.js` (the rows and how two copies join, pure; the page,
`convex/model/sync.ts` and the tests import this one file, which is `.js`
because a browser cannot strip types), `js/sync-local.js` (the stores as
rows, and one sync's plan: what to push, what to change here, what the
server holds after), `js/sync.js` (pull, merge, push; imported on sign-in
only), `js/sync-book.js` (`localStorage['yomu-site:sync']`: the account this
browser syncs with, and the kit's id for it when that is not whoami's, an
answer to the account question not yet finished, when it joined and what it
brought, the last Clear all it applied, removals not
yet carried, save stamps not yet carried, what it last heard of the
account's rows, when each preference changed),
`js/sync-watch.js` (the stores as sync changes
them, and the listeners that stamp an unsave, a Clear all, a save and an
Import),
`js/account.js` (the guard, the kit, the timers, the step a retry runs;
every dependency passed in), `js/events-sync.js` (the page's
dependencies), `js/render-sync.js` (the My kanji line `#mk-sync`, the
`#sync-dialog` question, in its two wordings, and the Clear all dialog's
words) and `js/strings-sync.js`.
`npm test` runs `tests/sync-rules.test.mjs`, `tests/sync-server.test.mjs`
(the real handlers over an in-memory database,
`tests/helpers/fake-convex.mjs`, which refuses what Convex refuses),
`tests/sync-client.test.mjs` (devices made of the real
stores, `tests/helpers/sync-device.mjs`, three of them in random order,
converging), `tests/sync-stamps.test.mjs` (Import, and clocks that disagree),
`tests/sync-join.test.mjs` (what a join stamps),
`tests/sync-saves.test.mjs` (a save keeps its own time through a merge),
`tests/sync-first.test.mjs` (what a first sign-in asks, and each answer),
`tests/sync-account.test.mjs` and `tests/sync-tabs.test.mjs` (two tabs of
one browser over the same storage).

**An anonymous visit fetches nothing from Clerk, Convex or esm.sh.**
`app.js` imports `events-sync.js` only with a key on the page and only
after an embed has returned, so a frame starts no kit. The kit loads
clerk-js only with a Neorgon session or on Sign in; the Convex client
(`https://esm.sh/convex@1.46.0/browser`, the version in package.json, and
the CSP allows that one path) and `sync.js` are imported on sign-in. A
static import of any of them (`import ... from`, a side-effect `import '...'`,
an `export ... from`, in either quote, with no spaces, with comments inside
the braces, before the specifier or before the `import`, across lines,
after another statement on its line, or with a query on the specifier)
fails `tests/sync-account.test.mjs`, which
also fails when the CSP's connect-src lacks `CONVEX_URL` or script-src lacks
the pinned path: a new deployment changes both in one commit. The client is
`ConvexHttpClient`, so there is no websocket and no `wss:` in the CSP.

**Every join is commutative and idempotent, and rows are cleaned before they
are compared.** Convex hands objects back with their keys sorted, so
`same()` (canonical JSON) only works on rows rebuilt by a `clean*` function.
A push joins each row with the stored one and writes only a change; a sync
with nothing new writes nothing, which the three-device test asserts. A
kanji, a kana pair or a text is a value, never an object key: Convex keys
are ASCII (`mixed` travels as `[{ k, n }]`).

**A removal is a tombstone that wins over an older save and loses to a newer
one.** A row carries `removed`; a saved kanji or phrase carries `s`, the
latest time it was saved (`at` and `saved` stay the earliest, as Import
keeps them). The stores never hold `s`: `sync-local.js` rebuilds it as the
latest of the save's own time, the book's stamps for that save (its join
stamp in `brought`, and `saves`, both below), and the server's `s` when the
server's save is the same save (the same `at`, or `saved`). Borrowing the
server's `s` for a different save brought a save made before a Clear all
back to life inside the newer one (its regression test is in
`tests/sync-client.test.mjs`).

**Every save made here is stamped in the book with its own time.**
`sync-watch.js` writes it into `saves` (one past the newest removal this
browser knows, when that is later), the stamp never goes down, and it is
forgotten only once a push has carried it. The store cannot keep that
time: a merge moves its save time back to the earliest copy's. Before the
stamp, a save of 二 at T20 by a browser that did not hold it took the
account's T10 in the merge, borrowed the account's `s`, and lost to
another device's offline unsave at T15, with every clock correct
(`tests/sync-saves.test.mjs`, kanji and phrases, and saves made after an
answer to the account question). A removal is written to the book only by
the learner's own unsave: `sync-watch.js` ignores what sync writes
(`applying`), since a removal stamped "now" while applying another device's
would outrank a save made after it. The book is read from storage on every
sync, never cached, because another tab may have written a removal.

**Clear all is one tombstone for the whole of My kanji, and a count has no
time.** The owner's `clear` kills every save not newer than it and every
seen record counted under an older clear (`e`, the clear its device knew).
So a device that counted kanji after the clear, before it heard of it,
loses those counts at its next sync; a push answers with the server's
clear, and a newer one makes the client pull at once. That is a Clear all
made once the account's data has arrived here. One made before (the book
`pending`: a first sign-in or an Add whose sync has not applied the pull)
is an unsave of each kanji it emptied here, stamped as one, and no clear
(`sync-watch.js cleared`): Add carries those removals, and the account's
other rows stay. A review found it kept as the account's clear, which
emptied every device of kanji this browser never showed while the dialog
said "in this browser" (`tests/sync-account.test.mjs`,
`tests/sync-first.test.mjs`). Under a pending Use, and while someone other
than the book's account is signed in (another account's question open or
put off, or whoami still out after a switch), it records no removal at
all: it stays in this browser. A review found one made with another
account's question open kept as the old account's clear while the dialog
said every device of the account empties: the answer replaced that book,
so it reached neither account. The dialog has three wordings, by
`sync-book.js clearsOf`: this browser (no book, a pending Use, or another
account than the book's signed in, `clearBody`), the kanji held here (a
pending first sign-in or Add, `clearBodyJoining`), the account (joined,
`clearBodySynced`). The dialog keeps the words it opened with until it
closes, and the click hands them to the clear with the account they were
about (`render-sync.js openClearWords` and `clearScope`, `clearAll(now,
said)`): `sync-watch.js` does what they said, or what a Clear all does now
when that reaches less, so a first sync landing under the open dialog, or
another tab, never makes the click do more than the words said. If another
account signed in under the open dialog, the clear never reaches it
account-wide: joined to it, only the kanji this browser brought to it go;
its join pending, the clear stays here and brings nothing, so it keeps its
own copy (round 7's review found the click emptying that account). A review found the words relabelled under the
open dialog, from the kanji held here to the whole account, and the click
then emptying the account. Another tab's write to the book reaches this
one as a storage event, on which `account.js` paints the line and the
words again: painted from its own syncs only, a tab whose pull failed went
on saying the account keeps its kanji after another tab had joined it,
while its Clear all emptied the account (`tests/sync-tabs.test.mjs`).

**A browser that never synced is asked before its data meets an
account's.** On a first sign-in `account.js` writes the join into the
book (`pending: 'first'`) as soon as the kit says who signed in, for the
kit's user id (the Clerk user id, which is the subject whoami answers
with), and `sync.js begin()` checks it against whoami: a book pending for
another subject is another account's first sign-in, begun again for
whoami's, carrying nothing it kept. That book names the kit's id when the
two differ (`kit`, which should never be written: both are the Clerk user
id), and `account.js recordFrom` keeps it on the page loaded again under
that id. A review found the reload writing the kit's id over it, which
dropped an unsave made there since (`tests/sync-tabs.test.mjs`). If this
browser holds a saved kanji or a
saved phrase, and the account holds a saved or removed kanji or phrase, or a
Clear all (`sync.js accountHolds`), it asks the Add / Use question an
account switch asks, worded for this case (the `syncFirst*` strings: "This
browser has kanji and phrases from before you signed in. Add them to your
account, or use your account's data here?"). Its counts are what it asks
about: the account's saved kanji and phrases, and a line each for the
account's removals and its Clear all when it holds them (`syncFirstRemoved`,
`syncFirstCleared`). A first device with an empty account, and a browser
with nothing saved, join without asking, as Add: counts, scores and display
settings alone are never asked about, on either side. A kanji row holding
only counts used to ask, with the dialog reading "saved kanji 0, saved
phrases 0", and Use then dropped this browser's saves for an account that
had saved nothing (`tests/sync-first.test.mjs`). A browser that never synced
used to bring its data with no question, so a kanji the learner had removed
or cleared on another device came back on every device (the review's P1 and
P2, both answers in `tests/sync-first.test.mjs`). Not now leaves the join
pending `first`, and the next sign-in asks again. The fleet's Clerk session
covers every `*.neorgon.com` site, so the first visit by someone already
signed in on another Neorgon site is a first sign-in, and is asked the same
way.

**Add brings all of this browser's data; Use brings none of it.** With Add
(answered, or a first sign-in not asked) the browser takes the account's
clear as its own and every save it holds counts as made when it joined.
The book's `joined` is when the join was settled (begin() decided it, or
the learner answered), or one past the account's Clear all when that is
later; each save the browser brings is stamped in the book (`brought`) at
`joined`, or one past the account's removal of that row when that is
later (`sync.js joinStamps`; the next paragraph says which later ones
count): another device's clock may run ahead, and
joining at this clock's now lost a whole browser's saves to a clear stamped
an hour in the future (`tests/sync-stamps.test.mjs`). So with Add a save
older than a removal or a Clear all the account made before this browser
joined comes back, on every device: the learner chose to bring it. With
Use the account's removal or clear stands, and what this browser held
stays behind. This browser's data was never in the account, so Use loses
it; the dialog says so, and to export first.

**A pending join does not depend on when another device's removal
arrives.** A removal or a Clear all stamped after `joined` and before the
time of the sync that finishes the join is taken as made after the join,
and wins, whether it reached the account before that sync or after it;
only one stamped at that sync's time or later, which no correct clock has
made yet, is stepped past (`sync.js joinStamps`). Before, an Add answered
at T10 whose pull failed kept a kanji another device unsaved at T15 when
the unsave reached the account before the retry at T20, and lost it when
the unsave arrived after (the review's probe-addwindow; both orders and
both kinds of join in `tests/sync-join.test.mjs`). What is left depends
on clocks, not on network timing: a removal made before the answer by a
clock ahead of this one, by less than the wait, lands inside that window
and wins.

**Only what the browser brings is stamped, each row on its own.**
`brought` is taken from the stores before anything of the account's is
applied, and written with the merge, so a retry after a failed push, or a
reload, stamps the same rows and no others. What the join received from the
account keeps the account's own stamp. Stamping every save the stores held
after the merge sent the received ones back stamped `joined`: a removal or
a Clear all another device made offline before the join, pushed after it,
then lost to them, and with a clock an hour ahead somewhere the received
rows landed an hour in the future (`tests/sync-join.test.mjs`). A stamp is
dropped by the learner's own unsave, new save or Clear all of that row.

**Import is a choice made now.** A kanji or phrase that Import brings back
keeps its backup's schedule and counts, but is stamped in the book
(`saves`) as saved now and one past any removal or Clear all this browser
knows, so Export, Clear all, Import is not undone by the next sync. The
stamp outranks a clear made elsewhere that this browser had not heard of
too, since by the clocks the Import came after it; the counts do not,
because a count has no time (above). A removal made after the Import still
wins. Stamps are forgotten once a push carried them: the account then holds
that save's `s`, which `sync-local.js` borrows.

**Clocks disagree, and the learner's last action wins anyway.** Every time
is the device's own clock. A removal or a Clear all made here is stamped at
least one past the newest save this browser knows for that row (the
store's own, a stamp in the book, the account's copy as this browser last
pulled or pushed it): `max(now, known s + 1)`. A save made here is
stamped `max(its own time, known removal + 1)`. Without the first, a
device an hour behind unsaved a kanji and saw it come straight back;
without the second, the same device could not save again what it had just
removed. Both are in `tests/sync-stamps.test.mjs`. The account's copy is
the page's (`sync.js known()`) and the book's (`heard`, each row's newest
`s` and removal, written with every sync and push), which a reload keeps:
with the page's alone, a reload before the first pull (offline, for as long
as it lasted) stamped against the store alone, whose save time is the
earliest, and another device's newer stamp that this browser had already
pulled, a join stamp or a removal from a clock ahead, outranked the
learner's later unsave, save or Clear all.

**The eight words per kanji are the eight met last.** A word travels with
the day it was last met (`[written, reading, day]`, the server's day or the
kanji's last day here), and the join keeps the eight latest; the store
keeps `[written, reading]` in that order.

**One sync plans twice.** It plans against the pull, applies the changes
here through the stores' own calls (My kanji `adopt()` and Play `adopt()`
through their `validate()`, History's `unsave()` and `mergePhrases()`, the
preference setter), then plans again from the stores as they now are and
pushes that: History's merge folds an ordinary entry's reads into a phrase
it saves again, and pushing the first plan left the account a sync behind.

**Another account is asked about, never merged.** `decide()`: no book, or
a first sign-in not settled, is a first join (`adopt`, asked about as
above); the book's account merges (`same`); another one opens
`#sync-dialog` with what each side holds. Add is `adopt`
and Use is `replace`; Not now pauses sync and the line offers Choose. The
answer goes into the book as it is given (`sync.js choose()`): a book for
the new account with `pending` set until a sync finishes it, so a retry, a
reload or another tab finishes that answer, and what the learner saves,
removes, clears or changes in between goes to the new account, as in any
sync. It used to live only in the page: after Use a save made before the
retry was wiped by it, and after Add an unsave, a Clear all or a
preference change went into the old account's book and was dropped
(`tests/sync-account.test.mjs`). Add joins as above, from the time of the
answer (`joined`, `brought`), and carries every removal made since (a
Clear all before the account's data arrived as the removals of the kanji
it emptied here). Use takes the account's data and, of this browser's
own, only what the learner did after answering: a save stamped in the
book since the answer (`saves`, by hand or by Import; the answer starts the
book afresh) and a preference changed since (`sync-local.js sinceAnswer`).
The store's own save time is not read: Import keeps a backup's, and one
exported on a clock ahead looked made after the answer and entered the
account, though the dialog said this browser's kanji were gone
(`tests/sync-stamps.test.mjs`). A removal or a Clear all made under a
pending Use before the account's data has arrived here applies here only,
never to the account (`sync.js joinBook`): the learner could not have seen
the account's rows, and carrying it cleared kanji of the account's this
browser never showed. Once the data has arrived (the sync that finishes the
answer applied it), removals and a Clear all go to the account as usual; the
Clear all dialog says this browser only until then. What it held at the
answer stays behind, with its counts and Play's scores, and the old
account's removals not yet pushed are dropped with that account. The old
account keeps what it already had and nothing more: what changed here since
its last sync with it is never sent to it, and with Use it is gone from this
browser too. The dialog says exactly that, and when that last sync was; do
not promise the old account more. A sign-out closes an open question
(`ui.dismiss`), and an answer given after it applies to nobody.

**A tab answered second runs as an ordinary sync.** Two tabs signed in to
the new account both ask. A tab left paused on the question (Not now) does
not hear the other tab's answer and stays paused until Choose; answered
then, it finds the book already naming the account, writes nothing, and
runs as an ordinary sync on it: the first answer stands, and is finished
there if it is still pending (`tests/sync-tabs.test.mjs`).

**A failure changes nothing, is said once, and the retry runs the step that
failed.** A pull that fails applies nothing; a push that fails keeps the
merge and the remembered account. A first sign-in's join is in the book
from the kit's sign-in (`pending: 'first'`, then `'adopt'` once settled,
as an answered Add), so the retry continues it, and an unsave, a save, a
Clear all (as the unsaves above) or a preference change made in between
counts. It used to write nothing until a sync finished, and then nothing
until begin() had whoami's answer: an unsave made while the pull failed,
the Convex client failed to load, whoami was out or the token was refused
was recorded nowhere, and the retry brought the account's copy back
(`tests/sync-join.test.mjs`, `tests/sync-account.test.mjs`). A begin()
whose whoami answers after a sign-out writes nothing (`stopped`), so it
cannot put the old subject over the next sign-in's book. `account.js` keeps
the step a sign-in is at: `connect` (whoami, and the pull behind the account
question or a first sign-in's), `ask`, the chosen `adopt` or `replace`, then
`same` once the book names the account (a sync wrote it, or it holds the
pending join). The next change, the `online` event and the page shown again
(a pull at most once a minute when nothing failed) all run that step, one at
a time. A retry used to be an ordinary sync, which `sync.js` refuses with no
book (`account-changed`), so a first sign-in that failed once never
recovered without a reload. A book that already names the signed-in account
is joined, or holds the answer that will join it, so `sync.js` runs an
`adopt` or a `replace` on it as `same`, or as its pending answer: another
tab may have written it since begin() or the answer, and a second join would
drop that tab's removals not yet pushed and count what it received from the
account as its own (`tests/sync-tabs.test.mjs`). A first sign-in still
`first` is never run as `same`: `run()` refuses it, and the step goes back
to `connect`, where begin() settles it or asks. The line says the failure's
kind in a plain sentence (offline, the sign-in not accepted, another tab
switched accounts, refused, a server error), never a code or a Convex
request id; those go to the console.

**Two joins depend on the grouping, and it does not matter which.**
`joinKanji` and `joinPhrase` are commutative and idempotent but not
associative. A copy that a removal kills can still have lent its values to
a live copy it met before the removal reached them: for a saved kanji, the
schedule, `at` and `lapses` (`tests/sync-rules.test.mjs`, "the one grouping
that differs"); for a phrase, its read count `n`, its last read (`last`,
`src`, and `t`, the spelling read then, which may differ from another
copy's in spaces or width and still have the same key) and the earliest
`saved`. It is harmless because whether a kanji or a phrase is saved, and
a phrase's key, are the same in any grouping (the newest save against the
newest removal, both maxima, which the random test asserts), seen counts,
words, Play and preferences are fully associative, and every device takes
the account's row at its next sync, so the devices still agree with each
other. What the order decides is a review schedule, a read count, the
last-read time and spelling, or the date History sorts a saved phrase by.

**Sign-in cannot be tried on localhost.** The production key refuses it and
the kit's dialog says so (expected). The functions are checked with
`npx convex run sync:<fn> --identity '{"subject":"user_a","issuer":"https://clerk.neorgon.com"}'`
(`convex/README.md`); a real Clerk session against the deployment, and the
production deployment (`wandering-ox-429`, which exists and holds no
functions yet), are untested.

## Do not touch

- `js/vendor/wanakana.js`: upstream 5.3.1, MIT, byte for byte.
- `js/neorgon-*.js`, `css/neorgon-*.css`: vendored kits, refreshed by `packages/neorgon-ui/sync-*.sh` (the Auth Kit by `sync-auth.sh`).
- `convex/_generated/`: written by `npx convex dev`, and gitignored.
- `data/dict/**`, `data/kanji/**`, `data/names/**`: emitted by `tools/build-*.mjs` from the pins in `tools/lib/sources.mjs` (`build-names.mjs` after `build-dict.mjs`, which it reads, and it writes `data/names/popular.json` too; `data/kanji/joyo.json` by `build-joyo.mjs` from the committed shards, or by `build-kanji.mjs`). Rebuild, do not hand-edit.
- `data/like/**`: emitted by `tools/build-sounds-like.mjs` from the committed `data/dict/` (after `build-dict.mjs`). Rebuild, do not hand-edit.
- `data/play/lookalikes.json`: emitted by `tools/build-lookalikes.mjs` from the committed `data/kanji/` (after `build-kanji.mjs` or `build-joyo.mjs`). Rebuild, do not hand-edit.
- `favicon.*`, `apple-touch-icon.png`, `web-app-manifest-*.png`, `site.webmanifest`: generated by `packages/neorgon-ui/sync-favicon.sh` once the site has a hub card.
