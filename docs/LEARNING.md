# Shared learning activities

The native Naninani 1.1 increment presents these modules in SwiftUI. They have
no DOM or native dependency, and can support a web presentation later. They do
not change the existing web Play scores, sync document or routes.

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
