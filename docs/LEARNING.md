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
