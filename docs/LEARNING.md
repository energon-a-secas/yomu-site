# Shared learning activities

The native Naninani 1.1 increment presents these modules in SwiftUI. They have
no DOM or native dependency, and can support a web presentation later. They do
not change the existing web Play scores, sync document or routes.

## Languages

What a learner reads in these modules is `{ en, es }`, resolved by
`strings.js` `t()` in the current language (`useLang`) when a function is
called, never when a module loads: the native app sets the language after
every import has run (`bridge/entry.js`). That covers the kana chart's titles,
kana details and practice, the games' shape hints (the look-alike ones from
`play-kana.js` and the 47 written in `kana-games.js`), their setup messages
and errors, quick kana review, Kana snacks (each word's meaning and note, no
two meanings alike within a theme in either language), kanji cards' messages,
the tracing verdicts, the phrase book's messages, the café story and Kana to
kanji. Dictionary data stays English, as on the site: JMdict glosses (Kana to
kanji's meanings), KANJIDIC meanings (kanji cards) and Tatoeba translations.
Documents hold ids and counts, never this text, so a round begun in one
language resumes in the other. Each module's tests switch with
`useLang('es')` and restore English; `tests/kana-learning-es.test.mjs` holds
every hint the games can show, in both scripts, to its own Spanish.

## Kana recall

`js/kana-games.js` reuses `kana-chart.js`, the original CC0 shape hints in
`play-kana.js`, and Play's seeded shuffle, weighted draws and ten-question
round length. Additional shape reminders in the new module are original CC0
copy. They describe printed forms; they are not stroke-order instructions or
copied illustrated mnemonics.

Read, Listen and Tell them apart keep hiragana/katakana separate. Prompts and
answers come only from the selected sounds. Timing marks need a word and are
excluded. Choices have distinct actual sounds, including お/を, じ/ぢ and ず/づ;
the listening question never exposes its target as visible/accessible prompt
text. Tell them apart needs at least two selected members of a look-alike set.

Only the first answer counts. Hints mark an attempt assisted, revealing an
answer records a skip, and missed shapes return later in the round where there
is room. Completed-round misses weight later rounds. Correct counts and best
rounds are unaided first answers. No timer, lives or passing threshold exists.

The `v: 1` native game document has `stats` per script/mode and an optional
`round` with selected IDs, validated question/option IDs, position, picks and
hint state. A round resumes after a relaunch. Completing it records counters
once; explicitly leaving it discards that attempt. Old web Play abandoned-round
and score semantics are untouched. Unknown documents and broken rounds produce
a recovery notice; the native file layer keeps original bytes before writing.

`tests/kana-games.test.mjs` covers all six script/mode combinations, small sets,
homophones, assistance, skips, first-answer idempotence, later revisits, stale
taps, relaunch, invalid data and leaving a round.

### Weak kana drills

Asked for on 6 November 2026: drills of the kana a learner gets wrong or is
slow to answer. Each kana keeps a record per script, across the three modes
(`kana` in the document, keyed `script:id`): how often it was asked and
missed, a recent miss rate in thousandths, and the average time of its right,
unaided answers, in milliseconds. Both averages move by 0.35 per answer, so a
kana leaves the list after a few right, quick answers; the lifetime counts
stay for the screen ("missed 3 of 10"). The app measures the time from the
question appearing to the tap and sends it with the answer; only a right,
unaided answer in Read or Tell them apart is kept (a listening question's
time includes its recording), and a time under 0.2 s or over 30 s is a stray
tap or a learner who looked away. `weakKana({ script })` lists at most eight,
weakest first: a recent miss rate of 0.25 or more, or an average 1.4 times
the learner's own median (once four kana have times, and two answers of the
kana itself). A drill is `start({ ..., focus })`: only the focus kana are
asked, the wrong answers still come from the whole selection, and it needs
two of them with different sounds. A drill counts as a round but never sets
the best score. `tests/kana-weak.test.mjs` holds the arithmetic, the limits,
recovery from damaged records and a tampered drill.

## Kana to kanji

Asked for on 6 November 2026: a word written in hiragana, and its kanji
spelling to pick. `js/kana-to-kanji.js` deals from the kanji page's words
(`data/kpage`, JMdict's first tier, up to ten per kanji): `spellingPool`
keeps a set's words written only with kanji the learner is taken to know and
read in hiragana alone (the app passes the set and every easier level of its
kind; My kanji with the N5 kanji). The wrong answers share a kanji with the
answer where the set has them, then match its length, so けんきゅうしつ is
asked among 研究, 研究室, 学究 and 図書室. No two choices read alike, and no
choice is a spelling the set also reads as the prompt (今日 for こんにち when
きょう is in the set), so exactly one answer is right. Rounds follow Kana
recall: ten questions, the first answer counts, the meaning is the hint, a
missed word returns three questions later with its choices turned, and missed
words weight later rounds (500 kept per set). Once answered, every choice
shows its reading. Meanings are JMdict's English. The `v: 1` document keeps
counters per set and the round's own words, read back field by field.
`tests/kana-to-kanji.test.mjs` covers the pool, fairness over many seeds,
first-answer accounting, revisits, weighting and recovery.

## The corner café

`js/story-cafe.js` defines one versioned scene. The setting and branching
structure are original CC0 project text, built from existing CC0 phrase-library
lines. It has two adult roles, ten spoken turns, two choices (drink and
here/takeaway) and two friendly endings. It makes no claim to be a graded
curriculum or a complete romance game.

Every line has a stable library reference, Japanese, reading, contextual
English and a short language note. `tests/story-practice.test.mjs` verifies that
each line already has a clip in both default character voices, Clear and Male.
The increment generates **zero new recordings** and spends **zero credits**.
Playback lookup still identifies the actual voice if another selection falls
back, or device speech if the selected option is Device.

`js/story-practice.js` owns progression. Its `v: 1` document includes scene ID
and version, selected role, started state, a validated path and discovered
endings. The current node is derived by walking that path. Invalid records
cannot jump branches; a valid prefix survives recovery. Stale taps cannot
advance a different turn. Restart replaces the current path and retains endings.

An attempt is only a learner's “I tried it” action. Skipping never blocks a
choice or ending, and timing never updates completion. Native playback and a
monotonic optional repeat timer are presentation concerns. The timer follows
the actual clip duration, Slow setting and chosen multiplier, pauses on
background/audio interruption and never claims to assess pronunciation. There
is no microphone permission, recording or network service.

The tests walk every choice combination as either role, serialize between
turns, validate recovery, check both endings and reject duplicate/invalid actions.
Human listening and learner playtesting remain separate acceptance evidence.

## Quick kana review

`js/kana-review.js` is a short self-graded pass over the selected kana of one
script, so weak kana come back sooner than strong ones. Each kana keeps a
Leitner box on My kanji's schedule (`kanji-store.js schedule`: Got it moves up
a box, 1, 2, 4, 8, 16 days; Again is box 1, due tomorrow). The review itself
is `review.js`: a card is hidden until shown, Again sends the kana to the back
of the queue, and only its first answer in a review moves the schedule.

A review holds up to `QUICK_SIZE` (20) kana: the due ones first (longest
overdue, then lower box, then chart order), then never-answered ones in chart
order, and only when that is still short, practice ahead (lowest box, then
soonest due). Each group is shuffled with the seed and the groups keep their
order. A kana practised ahead keeps its box and day on Got it and only counts
the review; Again is a lapse either way. Every answer is scheduled from the
day the review began. Prompts, sounds and shape reminders are
`kana-games.js gameKana`'s, and the timing marks are never cards.

The `v: 1` document is `{ cards, session }`. A card is keyed by script and
chart cell id (`'katakana:か'` is カ) and holds `box`, `due`, `reviews` and
`lapses`. The session keeps its kana, review.js's queue, shown flag, first
answers and repeats, each kana's box before the review and the kana practised
ahead. A card's id is the session's id and the answers so far, so a stale or
double tap never answers the next card. Bad cards are dropped one by one, a
session that breaks the review's shape is dropped whole, and either sets the
recovery flag. Leaving discards the review; answered kana keep their schedule.

`tests/kana-review.test.mjs` covers due, new and early kana in both scripts,
Again and first-answer accounting, stale taps, show before answer, the
overview's counts, selections with fewer than two sounds, the order and the
cap, leaving, resuming after every action, and damaged documents.

## Kana snacks

`js/kana-reads.js` is a ten-question game: read a real word written only in
hiragana or only in katakana and pick its meaning from four English options.
Six themes (café menu, around the world, everyday things, at the zoo in
katakana; sound words and everyday words in hiragana) hold 18 words each,
with a short meaning and a one-sentence note. The words, meanings and notes
are original CC0 text. The romaji shown after a hint or an answer is the
reader's said line (`kana.js said`), never a romanizer of its own.

Rounds follow kana recall: draws without repeats weighted by earlier misses,
three distractors from the same theme with different meanings, the first
answer counts, a hint marks the question assisted, a skip or a miss comes
back three questions later when there is room, and a stale tap names an old
question and changes nothing. The `v: 1` document has `stats` per theme
(`rounds`, `best`, `correct`, `answered`, `assisted`, `misses` per word) and
an optional `round`, validated as kana recall validates its own.

Every word already has a recorded clip in the Clear voice, which the other
voices fall back to; 49 of the 108 also have their own Male clip.
`tests/kana-reads.test.mjs` reads the committed `data/audio` index to prove
it, checks that each word is kana of its theme's script only (with ー and
small kana) and that no two words of a theme share a meaning, and plays every
theme to the end with a relaunch after each step. The game adds **zero new
recordings**.

## A kanji's library lines

`js/kanji-phrases.js phrasesWithKanji(library, ch, { limit, lang })` lists the
library lines that contain one kanji: its expressions first, then dialogue
lines, at most `limit` (6), with the meaning and title the phrase book shows.
Each carries the source `phrase-book.js phraseSource` follows back, and
`tests/kanji-phrases.test.mjs` follows every one of them for a dozen kanji in
English and Spanish. Anything but exactly one kanji finds nothing.

## Hoho's lines

`js/mascot-lines.js` maps fourteen moments (greetings by the hour, welcome,
start, a perfect round, the end of a session, relief, retry, comfort, fun,
goodbye, understood) to library phrases, so every line has its library
reading and meaning and is already recorded in every voice.
`greetingMoment(hour)` picks morning (5 to 10), day (11 to 17), evening
(18 to 22) or night. The romaji is `kana.js said` over the library's kana
with a space between words (yoroshiku onegaishimasu), and こんにちは and
こんばんは end in wa. `tests/mascot-lines.test.mjs` checks every phrase id,
its Clear and Male clips, the romaji and the hour boundaries. No new
recordings.

## Kanji cards

`js/kanji-cards.js` is Tomoshibi's glowing card as a drill over any set of
kanji: My kanji, a JLPT study level or a school grade. Two ways to play:
turn the card over and say Again or Got it, or pick the kanji's meaning from
four. A round is `review.js`, as in Quick kana review: up to 20 kanji, due
ones first, then new ones in the set's order, then practice ahead; Again
sends a kanji to the back, and only its first answer moves its box. In the
quiz a pick turns the card over and shows the verdict, and Next is the
answer that moves the box; a revealed answer counts as Again.

It is a free drill, the owner's choice (6 November 2026): each kanji keeps a
Leitner box in this document, on My kanji's schedule but apart from it, and
nothing here moves a saved kanji's review. The quiz needs four kanji whose
labels differ; `overview` says so before a round can start.

`cardEntry(rec, { level, row })` is the card itself: the short label (the
kanji-of-the-day row's first gloss, else KANJIDIC's first meaning, never a
radical's name), up to four meanings, up to three on and three kun readings
as [kana, romaji], strokes, grade, JLPT level and an example word. It is the
rule Tomoshibi's watch data was built with, moved here: for all 760 kanji in
Tomoshibi's `kanji.json` it gives identical JSON, so the iOS app's watch
payload decodes with the watch's own struct. `tests/kanji-cards.test.mjs`
plays whole rounds in both ways, the stale-tap guard, the deal order, quiz
options and document recovery.

## Writing

`js/strokes.js` turns KanjiVG's path data (`data/strokes`, the 109-unit
grid) into absolute cubic segments any view can draw, points along each
stroke, and a judge for a stroke traced by hand. `traceStroke(strokes, next,
drawn)` is forgiving about neatness and strict about order and direction:
the ends may miss by 20 units and the line may stray by 10 on average, but a
stroke drawn from its end is `reversed`, and a line that fits a later stroke
better is that stroke drawn too early (`order`, with `matched`).
`traceWords` says it in a sentence. The kanji page now places its stroke
numbers with the same `startOf`. `tests/strokes.test.mjs` parses every
stroke in the data (a path command the drawing does not handle fails
loudly), checks that each starts where its number goes, and judges traces of
か and 書 (whose horizontal strokes sit ten units apart).
