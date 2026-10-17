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
make data        # rebuild data/dict, data/kanji, data/names, data/like, data/play, data/strokes, data/kpage, data/search, data/spell, data/sets and data/sent from the pinned upstreams (manual)
npm test         # node --test tests/*.test.mjs
node tests/mobile.browser.mjs [--base=http://localhost:8895/] [--shots=DIR]   # every screen on five phones, WebKit and Chromium (On a phone, below)
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
verb stems and phrases (はし read 愛し, くじ read ９時). A match that ends in
a kanji and runs on into okurigana is the verb's, not the spelling's
(`extra.mjs runsIntoOkurigana`): counted, 雨降 "sea hare" shipped on 35
sentences of casual 雨降ってる and read 雨降って地固まる as 雨降|って (queue
#148). Only the whole spelling or its last kanji is tried (寝心地よい holds
心地よい, and 寝心地 is still the noun), a spelling ending in kana is left
alone, and after an entry that takes する, し, す, さ or せ is that する
(退出した). The names tier's "in the corpus at least once" applies the same
test (`jmnedict.mjs attested`). Rebuild with
`node tools/build-dict.mjs`, then compare the old data/ with the new over the
corpus (`node tools/compare-readings.mjs`, a copy of the old tree as its first
argument) and diff the sentence suites before changing it. The fourth rule,
mixed, ships a spelling like あめ色 (飴色, amber) whose hiragana the first
tier reads as another word (あめ is 雨 first) and folds its katakana form
(アメ色) onto it; its hiragana part needs two kana and may not start with a
particle after a kanji (何がし read 何がしたい as 何がし|たい), and it is
banded only on `MIN_MATCHES` matches, so the bands the common keys fill do not
grow. A spelling JMdict gives several entries goes to the one the corpus
matches (つき物 is 付き物, whose all-kanji 付物 is search-only, not 憑き物).
Every record of a mixed spelling carries `m`, and `m` is all the lattice's
`COST.endsInsideWord` reads (毎秋りんご園 is 秋|りんご): such a key pays it
when its closing hiragana and the rest of the hiragana after it are one banded
word, and no particle or copula form follows the key. Do not scope it by the
band again: half the first tier has no band, and the corpus cannot see what
that misreads (一区切り read 一|区|切り). The cost reads the hiragana stretch
with `dict.get` and ships nothing, which stays deterministic only because
`keysForRun` asks for every hiragana substring up to `maxKey` and the filter
has no false negatives (the argument `countedRecord` also rests on).
`YOMU_RULES_OFF=mixed` (or `asked`) builds without a rule, for a measuring run
only.

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
is a `person` there and only there; the Word panel keeps JMnedict's.
Failing that, the linked English decides the game's class
(`popular.mjs englishCues`): the spelling followed by a verb from a fixed
list (Gogh painted, Molly has), after Van, or after a de that opens the
name is a person cue (de Nerval; Rio de Janeiro, a capitalised word
before de, is none), after in, to, from, at, near, visit, visited, "the
city of", Mt. or Mount a place cue, and before a name JMnedict knows only
as a given name just the last three (talked to Tom is no place); two of
one kind and twice the other move a `place` to `person`, or a person's
name to `place` only when JMnedict types the spelling a place too
(エメット is typed only surname, and "in Emmet's sense" is two place cues).
Nine rows moved, all judged right (docs/ANALYZER.md). Rows no evidence
reaches take a class from `tools/lib/name-classes.mjs` (ロミオ, フランツ,
ノラ: people), keyed by both spellings, each with a reason, applied before
the honorifics, held to the checker's bounds and printed by the build; add
an entry there, never a cue fitted to one row. A
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

**Gaps are drawn, never typed.** The Display row's Gaps (Off by default)
marks every edge between two words; `js/gaps.js` decides each edge's one
reason from the tokens alone and `render-gaps.js` draws it. A gap holds no
text node (copying the reading copies nothing it adds), takes no focus, and
the Word panel lists the gaps as text for a keyboard and a screen reader.
Read `docs/READER.md` before changing them.

**Other written forms are shown with what JMdict or KANJIDIC says of them.**
A word's other spellings (`data/spell/`, `tools/build-spellings.mjs`, per
key and reading, since 方 read さま and read ほう are two words) show in the
Word panel's "Also written" and on each Search card, each with JMdict's tag
in words: old spelling, rare, irregular, ateji, or seldom seen for a
search-only form (喰べる). They load from one shared loader
(`other-forms.js pageForms`) with plain fetch, so they never count toward a
read's progress, and the Word panel paints again when they arrive; All forms
keeps its open state and register through that repaint (`state.conj`,
`events-word.js`). A kanji's other shapes (国: 國 圀) are KANJIDIC's variants,
resolved from JIS codes by `build-kanji-page.mjs` into `data/kpage/` `v`;
KANJIDIC does not say which is older, so the page calls them other forms.
Search shows a kana key whose records are different words as one card per
word (さけ: 酒 and 鮭, `render-search.js byWord`).

**An example sentence is filed by the analyzer, and ships with its credit.**
`data/sent/` holds up to three Tatoeba sentences per word and reading, and
`data/sent/more/` up to seven after them, which the Word panel fetches only
on More examples (`state.exMore`, `events-word.js`): at ten a shard the
panel's one fetch would have held half the words. The three are chosen as
they were before More existed, and the checker holds each row's count of
more to the more shards. Both are chosen
by `tools/build-sentences.mjs` from every linked sentence of 30 characters or
fewer, each read by the analyzer, so 食べました is an example of 食べる. A
sentence with a guessed token is left out, and a token whose key has other
records (`alts`) files nothing: the analyzer read 赤の方が好き as 方 かた, and an
example must not teach a wrong reading (方 has none; 274 words in all). An
English blocklist (`AVOID`) keeps out topics a dictionary should not show a
reader of any age. These are the only Tatoeba sentences that ship: each links
to its page on tatoeba.org (the CC BY 2.0 FR credit, `examples.js
tatoebaUrl`), the Sources dialog says so, and their files carry the
`tatoebaSentences` licence with the screen credit required. The Word panel
shows them with Read it; a Search card shows the first.

**A kanji page is a dialog, never an address.** `#kanji-dialog`
(`events-kanji-page.js`) opens from the page button beside a kanji in the
Kanji panel, the Word panel and the Collection's tile dialog, and holds the
kanji it shows, and the ones Back returns to, in memory: a kanji is part of
a reading, and the reading stays out of the URL. Its strokes are KanjiVG's
paths (`data/strokes/`, kanji and kana) drawn with one dash each
(`pathLength` 1), stepped with back, Draw (Pause while it runs) and next;
its words (each with Read it), the kanji sharing each part and the kanji built
on it are `data/kpage/` (`tools/build-kanji-page.mjs` says how each is
chosen). Every reading and every word on the page says itself when pressed
(`kp-say-item`, the kana kept in `sounds`), at the Slow rate when Slow is on,
with its romaji under it: `kana.js readingRomaji` drops KANJIDIC's okurigana
dot, keeps an affix's hyphen (ひと- hito-) and writes a final small っ as an
apostrophe (ジッ ji'), since it doubles a sound that is not there. All romaji
outside the reading follows the reader's Romaji switch through
`html[data-romaji]` (`render-romaji.js`), so one switch serves the kanji page,
My kanji, Search and the Idioms shelves. "Looks like" lists Play's look-alikes
of the kanji with what tells each apart (`lookalike-apart.js`, from KanjiVG's
parts, then the stroke counts); the list loads with the page, and a list that
fails leaves the section out. KanjiVG and KANJIDIC disagree on nine jōyō stroke counts (the 2010
additions such as 葛 and 遡, which KanjiVG draws in their printed form, and
牙); the page says so beside the drawing, and `tests/kanji-page.test.mjs`
names the nine, so a rebuild that changes them fails.

**The handwritten form is Klee One, served by Yomu, and loads on first
use** (`hand.js`, `fonts/klee/` from `tools/build-font.mjs`): nothing loads
until the switch is first on, no request goes to a font host, and a kanji
the hand lacks stays in print with a line saying so. `docs/READER.md` has
the slicing and the measurements.

**Search keeps its query in the field, never in the address.** `#/search`
(`events-search.js`, a route that draws its own section like Play's,
`routes.js sectionOf`) reads Japanese the way the reader does (the key in
both scripts and every dictionary form `deinflect.js` finds, then the rare
words and the names), romaji as kana and as English, and English through
`data/search/`, an index of the first tier's gloss words to keys; the builder
and the page split words with the same `search.js glossWords`. One word is
one result, filed under the spelling the dictionary marks usual (`u`), so
eat finds 食べる once, not たべる too. English that finds fewer than
`RARE_WHEN` (5) common words asks the rare words too (`data/search/xNNN.json`,
index `rare.json`), and each rare result is drawn from its index row (reading,
the first two meanings, part of speech, how many more), never from
`data/dict/rNNN`: the rare tier is 316 shards, and ten results fetching their
own would cost a search a megabyte. "eat" fetches no rare file at all, and
`tests/search.test.mjs` holds it to that. A rare word has no frequency, so its
rows rank by sense, word place and key length; two spellings with one reading
and first meaning are one row (ご破算, not 御破算 too). Kanji by parts follows KanjiVG's parts
to their own parts (語 is 言 and 吾, 吾 has 口), and a part that leads
nowhere with the chosen ones is disabled, not removed. KanjiVG names some
parts by a code (CDP-8BC4) or a layout (⿱日隹); neither is offered, here or
on the kanji page. Read it sends a word to the reader as a new text.

**The idioms are JMdict's tags; the JLPT kanji lists are Waller's, unofficial.**
Search's Idioms tab (`events-sets.js`, `sets.js`, `render-sets.js`) browses
`data/sets/`: every entry with a sense JMdict tags `yoji` (1,836), `proverb`
(938) or `id` (1,288), built by `tools/build-sets.mjs` from the full JMdict,
so the reader's dictionary and its readings are untouched. An idiom is a
tagged sense that is also an expression (`exp`): JMdict tags single words
used figuratively too (嵐, uproar), and they are not what a learner calls an
idiom. A row's spelling and reading are the ones the tagged sense applies to
(嚏's charm is くさめ, not くしゃみ). A row JMdict tags vulgar, or whose English
holds a word in `tools/lib/avoid.mjs AVOID_EXPLICIT`, is left out; not the full
`AVOID` the example sentences use, which dropped 一石二鳥 for "killing".
Common entries first, then by reading; a set loads whole (two files of at
most 140 KB) and shows 50 rows at a time. A row carries the reader's said
romaji, word by word (saru mo ki kara ochiru), from the analyzer at build
time, or '' where it guessed or read the row otherwise (about a quarter);
the page then spells the reading as one word. Search opens on Look up
(Words, Kanji by parts); Browse shows six shelves (Kana, Counters, Kanji by
level and the three collections), so nothing sits off screen in a row of tabs.
Kanji by level (`levels.js`, `render-levels.js`, `events-levels.js`) lists a
school year from `data/kanji/joyo.json` or the 838 name kanji from
`data/kanji/jinmeiyo.json` (KANJIDIC grades 9 and 10, emitted with the jōyō
list by `tools/build-joyo.mjs` and rebuilt by the checker), or a JLPT level,
N5 to N1, from `data/kanji/jlpt.json`: Jonathan Waller's lists (79, 166, 367,
367 and 1,232 kanji), from the Wayback Machine's 2018 captures of tanos.co.uk,
which no longer answers, pinned in `tools/lib/sources.mjs` and kept by
`tools/build-jlpt.mjs` as which kanji each level holds and nothing else of
his. His terms (the archived "Use my data!" page) are Creative Commons BY with
credit to the site: the level view names him, says unofficial and links the
terms, and the Sources dialog says the same. The kanji page and a Collection
tile name a kanji's N-level, or KANJIDIC's pre-2010 level for one his lists
leave out. Each level shows 50 at a time, each kanji
with its readings in romaji, Save and its page. Practise starts a review of
the level's first 20 kanji not saved (`events-kanji.js startPractice`) that
moves no schedule: `answer()` is given no `apply`, and the summary offers to
save the ones missed. A practice is the review route with `review.practice`. `data/sets/wNN.json` (index
`words.json`) files each first-tier key with a kanji to up to three rows that
hold it, its own row first, then the best of each collection: the Word
panel's "In idioms and proverbs", and the collection a Search result names
when it is one. Word lists by JLPT level and Kanken were asked for (queue
#143) and are not here: neither upstream holds word levels. KANJIDIC's JLPT
field is the four levels the test dropped in 2010, which imiwa renames N5 to
N1; a learner would study the wrong list, so the N-levels are Waller's.

**The display choices are local but one.** Furigana (On, Not in My
kanji, Off), the size, the Kanji select, one sentence at a time, read along
and the kana rows a learner knows are `docs/READER.md`. Of them only
`prefs.furigana` syncs: `sync-rules.js PREFS` keeps the six it has, and the
server's validators would refuse a seventh.

**The Word panel's All forms is built forward and checked backward.**
`conjugate.js` makes every form of a verb or adjective from its dictionary
form and part of speech; `tests/conjugate.test.mjs` reads every form of every
first-tier verb and i-adjective back through `deinflect.js`, and a sample
through the analyzer, whose romaji the table must match. A space in an ending
is a word break where the reader starts a new token (食べません|でした,
高い|です, 静か|じゃない): the written form drops it and the romaji keeps it,
as the reading's does.

**The text stays in the browser; a saved phrase also goes to the account
of a learner who signs in.** The text persists under
`localStorage['yomu-site:text']`, and under
`localStorage['yomu-site:history']` while the learner has Remember on, or
when they saved that text on purpose with the bookmark (see My kanji below);
never in the URL, an attribute, the title or the beacon target. A backup
file carries the saved phrases and no other text. Signed in (Accounts and
sync, below), what leaves the device is the saved phrases (their text, the
counts and the times), My kanji (schedules, counts, the eight words per
kanji, `src` and the history key `h`, never a sentence), the saved words
(dictionary form, reading, first meaning, schedule), Play's store, and
lang, furigana, romaji, highlights, unsaved and slow; never the text in the
box, a History text not saved, the remember and translate choices, or the
session. An unsaved phrase leaves its key and the time of the removal on
the server, never its text. Signed out, nothing leaves.
`#t=<text>` is read once (for links from other Neorgon sites, with their own
authored text) and removed with `history.replaceState`. The DeepL and Google
links are built at click time.

**Recorded voices are Yomu's own text only, made once, and checked.**
`data/audio/` holds clips of the sound notes, every beat, the phrase library,
the notes' examples and their words in four ElevenLabs voices, and of the
first tier's common words (band 1 in all four, band 2 in Clear, which the
others borrow), a word filed under spelling and reading (雨|あめ), made by
`tools/build-audio.mjs` (a manual step that spends the owner's credits) and
each transcribed and read back by the analyzer before it is kept; a clip that
never passes is left out, and the page uses the device's voice. `speech.js
speak()` is the one seam; a sequence is all clips or all device. The page
never calls ElevenLabs. Read `docs/AUDIO.md` before changing the script, the
check, or what is sent: a word with two readings in one entry goes as kana,
a choice between two words does not (Yomu reads 字 as あざ).

**The Translation is the browser's, on the device, and only after a
click** (`translate.js`, `render-translate.js`; Chrome and Edge on a desktop
only). The first translator is made inside the Translate here click, before
anything is awaited, and every request ends in the translation or a failure
line with Try again (`QUIET_MS`). Read `docs/READER.md` before touching it.

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

## On a phone

`node tests/mobile.browser.mjs` is the check; npm test does not run it (it
needs Playwright's browsers and a running server). Run it after a change to
the reader's markup, a phone block of `style.css`, a header control or a
dialog: about 5.5 minutes, five phones, WebKit and Chromium, both languages.
**Read `docs/PHONE.md` before changing any of those**: what the check walks
and fails on, and why a tap never leaves focus in the text box, the display
switches fold, the phone header keeps only My kanji beside Sign in, and what
scrolls into view stops under the header and above the word sheet. What
still overlaps (the Beacon, the footer's links, the header's 36px controls)
belongs to a fleet kit, and the check prints it as a note.

Under 700px wide and 480px tall a tab bar (`#tabbar`, `events-tabbar.js`) holds Read, Search, My
kanji (with the due count, any `[data-due-count]`) and Play, never in an
embed. It is fixed, so everything that rides the bottom moves up by
`--tabbar-h`: the body's padding (the footer), the word sheet's and the parts
tray's sticky `bottom`, the toast, and the Beacon through its own
`--beacon-offset` token; the footer's back-to-top already steps aside over a
control. Not `scroll-padding-bottom`: with it WebKit scrolled My kanji's title
under the header when History took focus (320 and 375px), and the check finds
nothing focused under the bar without it. A phone on its side (under 480px
tall) shows no bar: under the word sheet it left the chosen word no room. The header is unchanged: My kanji stays its one kept action, so the
fleet's shell check and the header tests hold as they were.

## My kanji

The kanji a learner saves for review, the texts they met each kanji in, the
Collection those counts make, History (opt-in) and the phrases saved on
purpose. **Read `docs/MY-KANJI.md` before touching `js/kanji-store.js`,
`js/history-store.js`, `js/review.js`, `js/collection.js`, their render and
events modules, or the routes under `#/kanji`.** The rules a change must not
break: the kanji store holds no sentence and no pasted text (at most eight
dictionary forms per kanji, and a history key `h`); History is written only
while Remember is `on`, or to save, unsave or count a saved phrase; a caller
of `loadText` that is not new content passes `restore`, or a reload counts
kanji again; the Collection is derived from the counts, never stored; and no
kanji is written into an attribute.
My progress (`#/kanji/progress`, `progress.js` pure, `render-progress.js`,
`events-progress.js`) is derived the same way and stores nothing, its period
included: reviews keep no dates, so it draws no reviews per day, and texts
count only what History holds.
My words (`#/kanji/words`, `word-store.js`, `render-words.js`,
`events-words.js`) are the words saved with the Word panel's bookmark, each
its dictionary form and reading (`render.js savableWord`: a word or an
inflected form with a meaning, never a particle, number, name or guess), its
first meaning for the card and a saved kanji's schedule, in
`localStorage['yomu-site:words']` under a cyrb53 id of the two (`wordId`,
ASCII, for sync), at most 2,000. One review holds both: `dueAll` is the due
kanji then the due words, a word's place in the queue `w:` and its id, and
`answerAny` moves the right schedule. The backup carries them as `words`,
and signed in they sync as a saved phrase does, through `pullWords` and
`pushWords` of their own (docs/SYNC.md).

## Play

Five games at `#/play`: Which one?, Odd one out, Twins across scripts, Name
decoder and Where are the spaces?. **Read `docs/PLAY.md` before touching
`js/play-*.js`, `js/events-play.js`, `js/events-odd.js`, `js/*spaces*.js` or
their data.** Only the first answer of a question counts, a round is ten
questions and nothing of an abandoned one is kept, the hints and words are
written for Yomu (never taken from a textbook or a published list), and the
data under `data/play/` is emitted (Do not touch, below).

## Accounts and sync

Optional, through the Neorgon Auth Kit. Signed in, My kanji, the saved
phrases, the saved words, Play's store and six display preferences sync to Convex project
`yomu` (production `wandering-ox-429`, dev `jovial-mouse-131`); signed out,
every store stays in this browser. **Read `docs/SYNC.md` and
`convex/README.md` ("Sync rules") before any change to `js/sync*.js`,
`js/account.js`, `js/events-sync.js`, `js/render-sync.js` or `convex/`**:
the joins, the tombstones, the first sign-in question and the clocks were
each shaped by a review, and the tests that hold them are named there. Two
rules worth carrying: an anonymous visit fetches nothing from Clerk, Convex or
esm.sh (`tests/sync-account.test.mjs` fails on a static import of any of
them), and sign-in cannot be tried on localhost, since the production key
refuses it.

## Do not touch

- `js/vendor/wanakana.js`: upstream 5.3.1, MIT, byte for byte.
- `js/neorgon-*.js`, `css/neorgon-*.css`: vendored kits, refreshed by `packages/neorgon-ui/sync-*.sh` (the Auth Kit by `sync-auth.sh`).
- `convex/_generated/`: written by `npx convex dev`, and gitignored.
- `data/dict/**`, `data/kanji/**`, `data/names/**`: emitted by `tools/build-*.mjs` from the pins in `tools/lib/sources.mjs` (`build-names.mjs` after `build-dict.mjs`, which it reads, and it writes `data/names/popular.json` too; `data/kanji/joyo.json` by `build-joyo.mjs` from the committed shards, or by `build-kanji.mjs`). Rebuild, do not hand-edit.
- `data/like/**`: emitted by `tools/build-sounds-like.mjs` from the committed `data/dict/` (after `build-dict.mjs`). Rebuild, do not hand-edit.
- `data/sent/**` (and `data/sent/more/`): emitted by `tools/build-sentences.mjs` from the pinned Tatoeba exports, read through the analyzer over the committed `data/` (after `build-dict.mjs`; about five minutes). Rebuild, do not hand-edit.
- `data/spell/**`: emitted by `tools/build-spellings.mjs` from the pinned full JMdict and the committed first tier (after `build-dict.mjs`). Rebuild, do not hand-edit.
- `data/sets/**`: emitted by `tools/build-sets.mjs` from the pinned full JMdict alone. Rebuild, do not hand-edit.
- `data/search/**`: emitted by `tools/build-search.mjs` from the committed `data/dict/`, `data/kanji/` and `data/strokes/` (after `build-kanji-page.mjs`). Rebuild, do not hand-edit.
- `data/strokes/**`, `data/kpage/**`: emitted by `tools/build-kanji-page.mjs` from KanjiVG (the pin in `tools/lib/sources.mjs`) and the committed `data/dict/` and `data/kanji/` (after `build-dict.mjs` and `build-kanji.mjs`). Rebuild, do not hand-edit.
- `data/kanji/jinmeiyo.json`: emitted by `tools/build-joyo.mjs` (and `build-kanji.mjs`) from the committed kanji shards. Rebuild, do not hand-edit.
- `fonts/klee/**`: emitted by `tools/build-font.mjs` from the pinned Klee One and its OFL.txt (`tools/lib/sources.mjs`) over the committed kanji shards. Rebuild, do not hand-edit.
- `data/kanji/jlpt.json`: emitted by `tools/build-jlpt.mjs` from Waller's archived pages (the pins in `tools/lib/sources.mjs`); the checker holds it to his sizes and to the kanji shards. Rebuild, do not hand-edit.
- `data/play/lookalikes.json`: emitted by `tools/build-lookalikes.mjs` from the committed `data/kanji/` (after `build-kanji.mjs` or `build-joyo.mjs`). Rebuild, do not hand-edit.
- `data/play/spaces.json`: emitted by `tools/build-spaces.mjs` from the phrase library, `tools/lib/compound-lines.mjs` and the analyzer over the committed `data/` (after any change to `js/`'s analyzer, the dictionary or the library). Rebuild, do not hand-edit.
- `data/audio/**`, `tools/audio-made.json`: emitted by `tools/build-audio.mjs` (docs/AUDIO.md), which spends ElevenLabs credits. Rerun it, do not hand-edit; `check-data.mjs` holds the files to the index.
- `favicon.*`, `apple-touch-icon.png`, `web-app-manifest-*.png`, `site.webmanifest`: generated by `packages/neorgon-ui/sync-favicon.sh` once the site has a hub card.
