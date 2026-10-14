# Play: the five games

Moved out of the project's CLAUDE.md on 2026-10-14, word for word, so the
file every session loads stays short. CLAUDE.md keeps a summary and the
rules a change must not break; this is the full account, and the one to
edit.

Five games at `#/play`, four with the characters that look alike: Which one?
(`#/play/which`, the kana for a romaji, or the kanji for its meanings and a
reading, among its look-alikes), Odd one out (`#/play/odd`, a grid of one
character hiding one look-alike), Twins across scripts (`#/play/twins`, カ or
力 by the word around it) and Name decoder (`#/play/names`, a katakana name
to its original spelling); and Where are the spaces? (`#/play/spaces`,
¿Dónde van los espacios?, where one word ends and the next begins, below). `js/routes.js` names every route (moved out of
`events-kanji.js`, which still applies them, with the same history stamps and
Back for Play: a game's parent is `#/play`, `#/play`'s the reader).
`js/events-play.js` (the hook that draws a route, the rounds, the keys, the
actions), `js/events-odd.js` (Odd one out's grid and clock),
`js/render-play.js` (the list, the result, the shared lines),
`js/render-games.js` (the four question screens), and, with no DOM,
`js/play-rounds.js`, `js/play-store.js`, `js/play-data.js`,
`js/play-clock.js` (Odd one out's deadline), `js/play-kana.js` and
`js/play-twins.js` (the authored content, CC0), all run by
`tests/play.test.mjs`; Where are the spaces? is `js/play-spaces.js` (no
DOM, run by `tests/spaces.test.mjs`), `js/render-spaces.js` and
`js/events-spaces.js`. The section is `#play` in `index.html`; the
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
`{ games: { which|odd|oddFree|twins|names|spaces: { best, rounds } }, mixed:
{ 'シ|ツ': n } }`. `odd` is timed and `oddFree` untimed, since the scores do
not compare; `spaces` is points (below), at most 999 like `odd`. A `mixed` key is two of the games' own characters, sorted
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
answer away (フランツ Franz among Fairmont, Lucca and Tampa). The English
cues made ゴッホ and モリー names and ミラノ and エベレスト places; ロミオ,
フランツ and ノラ, whose English holds too few cues, are names by the
authored list. Fix a row's class by changing the class, never by leaving
the row out: a rule that left rows out took right ones with the wrong.
Before it ships the file is a 404,
which the list and the game say in words ("Not available yet") and never
throw; Chromium and WebKit still log that one 404 as a console line, since a
static page can only learn a file is missing by asking. Tests use the
hand-written `tests/fixtures/popular-names.json`; never copy it into `data/`.

**Where are the spaces? asks for the reader's gaps, and its answer key is
the analysis, emitted.** A question is one line shown with no gaps (the
line, then a board of it: each character, and a toggle button at each place
between two characters words are made of, `gaps.js slotsOf`); the learner
marks places and checks, and the first check counts. Missed and extra places
are marked on the board, each with words for a screen reader, and the
feedback lists every space of the answer with its reason from Gaps (the same
`render-gaps.js reasonNodes`), then each extra with why there is none (the
word it cut, or a kana no word starts with). A line scores the spaces placed
right minus the extras, never below 0 (`gaps.js checkLine`), so marking
every place scores nothing; the round's score is the sum. Ten lines, four
hiragana (the particles are the clue), four with kanji and katakana, two
katakana compounds (`play-spaces.js DRAW`; a short tier lends its turn to the
next), never two spellings of one sentence. Keys: the arrows, Home and End
move between the places, which hold one tab stop; Space marks (the button's
own press); Enter checks, its press prevented so it marks nothing; then
Enter or Space goes on. The places are 44px targets everywhere: a character
is 28px wide and its button, 44px, is pulled 14px over the character on each
side, so they tile the line without overlapping, and the board's right
padding holds the last one's reach (`play.css`). Closing punctuation stays
with the character before it, opening with the one after. The lines are
`data/play/spaces.json` (`yomu-spaces/1`), emitted by
`node tools/build-spaces.mjs` through `tools/lib/spaces.mjs` from the phrase
library and `tools/lib/compound-lines.mjs`; `tests/spaces.test.mjs` builds it
again with the analyzer and fails when they differ, so **rerun the builder
after any change to the analyzer, the dictionary or the library**, and
`tools/check-data.mjs` holds its shape. **A key must never dock a learner
for a split the language makes**, so a line is kept only where the analysis
settles where its words part: `tools/lib/spaces-settled.mjs` leaves out a
line with two neighbouring tokens that spell one dictionary word of either
tier, read as the line reads them (卵|焼き, 作り|方; an expression, JMdict's
`exp`, is several words and does not count), a number whose counter runs on
into the next word (何番|線), a word that ends in a particle after a word
(何と in 何と言いますか, 一緒に, だっけ), or one token the grammar writes as
two words (a te-form and its verb, 待っています; お願いします where the same
file splits 連絡|します; ありがとう|ございました), and a kana spelling whose
analysis reads a word of the written line as another (いって as 要る). Each
check reads the dictionary through `dictWords`, over a dictionary of its own;
none is a list of lines. Measured 2026-10-07: 121 lines (tiers 48, 61, 12),
67 of the library's 151 sentences as written, 42 in hiragana from the
library's own kana, and the twelve compound lines (docs/ANALYZER.md, "Gaps",
has what is left out and why). The library holds no katakana compound the
analyzer splits; the compound lines were written for Yomu, each with its
kana, and are held to the same rules as the library's (hotel-lobby says
待ちます, since 待っています is a te-form and its verb). The hint over a line
names its scripts (`play-spaces.js tierHint`), so a line with no kanji is
never told it has some, and the result's "Lines to look at again" holds the
word "space" for a screen reader in each gap, visually hidden.

**The hints and the twins' words are ours.** Which kana and kanji look alike
is a fact; every hint, word and note in `js/play-kana.js` and
`js/play-twins.js` was written for Yomu from the shapes, and none was taken
from Tofugu, the Japan Foundation apps, Genki, WaniKani, an Anki deck or a
published list. 卜 has no word a beginner meets; its two words are the real
ones and its note says it is rare.
