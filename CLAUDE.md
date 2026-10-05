# CLAUDE.md: Yomu

A Japanese reader. Paste a line and Yomu splits it into words, puts furigana
over the kanji, writes two romaji lines (how it is said, in Genki's
convention, and how it is spelled, kana by kana), names the special sounds and
the grammar, and lists the kanji with their readings in this text. Runcible
embeds it (`docs/EMBED.md`). Everything runs in the browser from committed
JSON; nothing is sent anywhere unless the learner clicks a translate link.

**Live:** yomu.neorgon.com (not published yet) · **Port:** 8895

## Run

```bash
make serve       # http://localhost:8895
make validate    # node tools/check-data.mjs, then npm test
make data        # rebuild data/dict, data/kanji, data/names and data/like from the pinned upstreams (manual)
npm test         # node --test tests/*.test.mjs
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
the romaji line.

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
"fix" them in `data/`: rebuild, never hand-edit a shard.

**Words outside JMdict's common set ship by rule, not by count alone.**
`tools/lib/extra.mjs` names the three rules and `MIN_MATCHES` (5) is
measured (docs/ANALYZER.md). Lowering it is not free: at 3, 六百 became a
word instead of a number, 清水 "spring water" instead of the surname, and six
tests failed; filtering out only conjugations, the full release shipped
verb stems and phrases (はし read 愛し, くじ read ９時). Rebuild with
`node tools/build-dict.mjs` and diff the sentence suites before changing it.

**A number before 名 is a count of people, めい.** 名 is in the counter
table (`numbers.js`), so 十名 is じゅうめい and 三名 さんめい, one number token;
until 2026-10-05 the run reached the second phase as a kanji stretch and read
as the surname とな and the place さんみょう. A counter added to that table
wins over any name across it, because `names.js` never reads a name across a
number and its counter.

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

**The text stays in the browser.** It persists only under
`localStorage['yomu-site:text']`, never in the URL, a data attribute, the
title or the beacon target. `#t=<text>` is read once (for links from other
Neorgon sites, with their own authored text) and removed with
`history.replaceState`. The DeepL and Google links are built at click time.

**The embed answers only listed origins.** `js/embed.js` accepts messages from
`https://runcible.neorgon.com` and Runcible's dev server on 8878, checks
`event.source === window.parent`, and posts only to the origin of the last
accepted `yomu:hello`. A new host goes into that list and into `docs/EMBED.md`
in the same commit.

**Nothing from Genki, the Japan Foundation apps, Tofugu, Yomitan, rikaichan
or 10ten is in this repository.** The deinflection table was written for
Yomu from grammar; Genki was read for its order and its romaji convention
only; the phrase library and every note are original. Keep it that way: GPL
rule tables cannot be copied into this MIT site, and textbook text is
copyrighted.

## My kanji

The kanji a learner saves for review, and how many texts they met each kanji
in. `js/kanji-store.js` (pure functions plus the store, no DOM),
`js/review.js` (one review's queue, no DOM), `js/render-save.js` (the save
toggle, the unsaved marks, the due count), `js/render-mykanji.js` and
`js/render-review.js` (the screen), `js/events-kanji.js` (routes, actions,
keys, backup). `npm test` runs `tests/kanji-store.test.mjs`; the view harness
checks the toggles and marks.

**One store, `localStorage['yomu-site:kanji']`, Persist kit version 1:**
`{ saved: { char: { at, box, due, reviews, lapses } }, seen: { char: { n,
first, last, words } }, session: { id, counted } }`. `words` is at most eight
`[written, reading]` dictionary forms per kanji (`dictionaryWord` turns
降っています into 降る ふる); no sentence and no pasted text is ever stored,
and the test reads the raw store to prove it. Every field is validated on
load; a store that does not read degrades to empty with a note on the screen,
and its raw value is copied to `yomu-site:kanji:damaged` first.

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

**`#/kanji` and `#/kanji/review` are routes, never text.** `takeFragmentText`
reads only `#t=`. The reader is hidden, not emptied, while a route shows. A
new text the host sends (`yomu:load`, `hostLoad()`) goes back to the reader
first, by a replaceState that moves no focus: in Runcible a learner who
closed the sheet on My kanji saw their list again behind the next phrase.
The same text sent again stays put and is no new session, because WebKit
fires the frame's load on a hash change and Runcible then resends it.
Back is `history.back()` only when the history entry before this one (each
entry is stamped `state.yomuIx`) is the parent route; otherwise it is a
replaceState, so Back never leaves the site and never steps into a review.
Start review applies the route at once, because a Space pressed before
`hashchange` fired landed on the list.

**No kanji is written into an attribute here either.** Toggles find their
kanji by `data-kid` (the analysis' kanji list) or `data-ix` (the list the
screen drew), and a toggle's name ("Save 天 to My kanji") is a visually hidden
label in text nodes. Meanings and readings come from `reader.js kanjiInfo()`
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

## Do not touch

- `js/vendor/wanakana.js`: upstream 5.3.1, MIT, byte for byte.
- `js/neorgon-*.js`, `css/neorgon-*.css`: vendored kits, refreshed by `packages/neorgon-ui/sync-*.sh`.
- `data/dict/**`, `data/kanji/**`, `data/names/**`: emitted by `tools/build-*.mjs` from the pins in `tools/lib/sources.mjs` (`build-names.mjs` after `build-dict.mjs`, which it reads). Rebuild, do not hand-edit.
- `data/like/**`: emitted by `tools/build-sounds-like.mjs` from the committed `data/dict/` (after `build-dict.mjs`). Rebuild, do not hand-edit.
- `favicon.*`, `apple-touch-icon.png`, `web-app-manifest-*.png`, `site.webmanifest`: generated by `packages/neorgon-ui/sync-favicon.sh` once the site has a hub card.
