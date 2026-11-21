# Recorded voices

Yomu's authored examples are recorded in four voices, so they can be heard on
any device, with a Japanese voice installed or not. Common-word recordings
extend that coverage, with Clear shared across the other voices in later bands.
Unrecorded sentences use the device's voice; matching individual words can
use their stored recordings. Started
2026-10-16; the run that made the first set is in `tools/audio-made.json`.

## What is recorded, and why only that

`tools/lib/audio-script.mjs` reads the script from the site's own data, in
priority order, so a new example or phrase is in the next run with nothing to
list:

1. **sound**: every example of every sound note, and both sides of every
   minimal pair (おばあさん and おばさん).
2. **kana**: every beat Sound it out can play: the plain and voiced kana,
   the small-ya, yu and yo beats, and the loanword digraphs of `GENKI_MAP`.
   ぢ and づ play じ and ず, を plays お, ぢゃ, ぢゅ, ぢょ and ぢぇ play じゃ,
   じゅ, じょ and じぇ, and ゐ and ゑ, which modern spelling dropped, play い and え:
   each is how the beat is said, so none is recorded (Beats said as
   another, below).
3. **phrase**: the phrase library and every dialogue line.
4. **note**: the grammar notes' examples and the loanword notes' examples.
5. **word**: every word of the lines above (`wordLines`), so a word chosen
   in a phrase or an example plays its own recording: the おば and さん that
   Yomu reads おばさん as were said by the device until 2026-10-17, which the
   owner heard as "computer like". A word of one kana is a beat already.
6. **common**: the dictionary's most common words by Tatoeba band
   (`commonLines`, the record's `q`): band 1 in every voice, bands 2 and 3
   in Clear alone (`COMMON_BANDS`), whose clip another voice borrows.
   The third band added 5,013 accepted word recordings from 5,168 new
   word keys. The [band-3 report](AUDIO-BAND3.md) records its actual scope,
   cost, validation and listening samples.
7. **reading** and **kanji**: what the kanji page says when pressed, in
   Clear alone. The N5 to N3 readings come first, from `readingLines`
   (`READING_LEVELS`), sent as their kana as they were recorded (Kanji
   readings, below); `kanjiPageLines` (`KANJI_PAGE_VOICES`) adds every other
   page's on and kun readings, sent in katakana, then the pages' words, page
   by page, the kana pages first and then every kanji by frequency rank, so a
   run its budget cuts short has covered the most common pages whole. A
   reading of one beat is a beat already. 1,453 readings are recorded: the
   N5 to N3 ones on 6 November 2026 and 686 more, in the pages' order, on 13
   November. None of the pages' words is recorded yet (Kanji readings, below).
8. **corpus**: the words of the example sentences that have no clip, as the
   reader meets them (conjugated forms included), in Clear alone, the most
   frequent first (`corpusLines`). A run makes it only when it is named
   (`--kinds=corpus`): a plain run makes every other kind (`DEFAULT_KINDS`).
   Built 17 November 2026; nothing of it is recorded yet (Words of real text,
   below).

A word is filed under its spelling and reading (`audio.js wordKey`: 雨|あめ),
never under its reading alone, so a homophone never plays another word's
clip (飴|あめ is candy), and a spelling with two readings has two clips (方|かた,
方|ほう). A word is sent in kanji only when the dictionary gives that spelling
one reading across all its entries (`wordTts`); otherwise as its reading. A
word of two beats or fewer is checked from its clip played three times, as a
beat is, and against its own reading: 中 read ちゅう once failed because the
check read a bare 中 as naka.

The clips are made once, here, and served as files from `data/audio/`. The
page never calls ElevenLabs: that would put the key in the browser and send
the learner's text to a third party, which the privacy page says never
happens. So only Yomu's own text can have a recording.

## The voices

`tools/lib/audio-voices.mjs`. Each is a native Japanese (ja-JP) voice from the
ElevenLabs Voice Library, verified there on `eleven_v4`, used by its voice id
(no voice slot is needed for that).

| Role | Voice | Why |
|---|---|---|
| `clear` (the default) | Konoha | Kanto standard, a calm explainer with a clear rhythm |
| `calm` | Yuki | composed, quiet and formal: the owner asked for something in the spirit of Persona 3's Elizabeth, and this is the manner, not her actress's voice |
| `bright` | Kuon | cheerful anime style, the library's most used Japanese voice |
| `male` | Hiroki | calm and polite; also the second speaker in a dialogue |

They were chosen from an audition of ten, every one saying the same line on
`eleven_v4`. All ten said it as Yomu reads it (checked by transcription,
below), so the choice is of manner, and a role's voice can be swapped: change
`voiceId` and rerun. The voice id is part of every clip's signature, so the
role's clips are remade and every learner keeps their choice.

## How a clip is made

`tools/build-audio.mjs`, a manual data step that spends the owner's credits.

1. **What is sent.** The text in kanji, which gives the voice its
   intonation, except two kinds of word, sent as the reading Yomu shows: a
   word whose own dictionary entry has more than one reading (今日 is きょう
   or こんにち, 明日 あした or あす, 行く いく or ゆく), and a number with its
   counter (七時 しちじ, never ななじ). A transcript cannot tell those apart,
   since both readings come back as the same kanji. 48 lines send a word that
   way. A choice between two *words* (字, じ "character" or あざ "village
   section") is left to the voice, which reads from context: Yomu itself reads
   the 字 of 字を大きく書いてください as あざ, which is wrong, and sending its
   reading would have recorded the error.
2. **Model.** `eleven_v4` for every clip, output as raw 24 kHz PCM so the clip
   is encoded once. It refuses `apply_language_text_normalization`. **There
   are no slow takes.** `eleven_v4` ignores `voice_settings.speed` (a sentence
   came out 4.16 s at 1.0 and at 0.7). `eleven_multilingual_v2` honours it
   (5.0 s became 7.2 s), but its slow takes of the sound examples failed the
   check 75 times in 252, some as the other word of the pair they exist to
   teach: slow びょういん was heard as 美容院, slow ビル as ビール. A slow
   mode that blurs a long vowel teaches the opposite of the note, so Slow
   plays the normal clip slowed instead (The page, below). The index format
   keeps a `slow` list per voice, empty, should a model ever pass.
3. **Finish.** `tools/lib/audio-finish.mjs`: silence under -50 dB trimmed from
   both ends (40 ms kept before, 80 ms after), so a beat follows a beat at
   once; levelled to -20 dBFS RMS with peaks under -1 dBFS, so no voice is
   louder than another; encoded once as 48 kbps mono MP3. A word is about
   8 KB, a sentence 15 to 25 KB. A lone beat is also shaped (Beat shaping,
   below): it keeps its onset and a natural vowel, then fades.
4. **Check.** Below. A clip that fails is made again with another seed, then
   from the analyzer's kana reading (a beat: in hiragana). After three takes
   it is left out of the index, its last take kept in `.forge/audio-rejects/`
   to be listened to, and the page says that text with the device's voice.

## The check

`tools/lib/audio-check.mjs`. Every take is transcribed with ElevenLabs Scribe
(`scribe_v2`, Japanese, no event tags) and the transcript read by Yomu's own
analyzer, so 切手 and きって are both kitte.

- **A word or sentence** passes when its said romaji, spaces and punctuation
  folded away and the apostrophe kept (kin'en is not kinen), is the line's. Or
  when the transcript can be read, word by word, as the line's reading, taking
  any reading the dictionary gives a word: the transcriber wrote まち (town) as
  街, which the analyzer reads gai. This cannot let a wrong reading through,
  because a word sent in kanji has one reading in its own entry.
- **A lone beat** is transcribed from its clip played three times, because
  said once, half a second of sound is read as a word: ア came back ああ, コ
  こう, ス そう and イ いいえ. Played three times the same takes came back
  あ、あ、あ, こう、こう、こう and すーすーすー. A held vowel is how a mora said
  alone sounds, so it passes; another consonant or vowel does not. Latin
  letters are read as romaji (の came back "No。No。No。"), and one kanji passes
  when the beat is among its readings (じ came back 字).
- **ん** cannot be checked: six spellings of it all came back うん, the only way
  to write a hum. うん passes for ん, and its clips are on the listening list.

The check was tripped on purpose before it was trusted: おばさん recorded and
checked as おばあさん, きて as きって and ワ as は were all rejected
(`tests/audio.test.mjs` keeps those transcripts).

**What the check cannot catch:** a voice that reads a kanji the other way
where Yomu sends the kanji (only possible where the dictionary entry has one
reading, so only when the voice misreads outright), and pitch accent, which a
transcript does not show. The listening list exists for those.

## Running it

```bash
node tools/build-audio.mjs --dry-run              # what would be made, about what it costs (every kind but corpus)
node tools/build-audio.mjs --dry-run --kinds=reading,kanji   # one part of the script
node tools/build-audio.mjs --dry-run --kinds=corpus --limit=500   # the corpus kind, which a run makes only when named
node tools/measure-audio-corpus.mjs               # what the corpus kind's first 500, 1,000, 2,000 and all would add (free)
node tools/build-audio.mjs --budget=100 --limit=30 # small pilot; compare account balances
node tools/build-audio.mjs --budget=100 --limit=30 --retry-failed # bounded retry pilot
```

The key is `ELEVENLABS_API_TOKEN` in the repo's `.env` (git ignores it). It
needs text to speech, speech to text, voices read and user read. The tool reads
the plan's quota first and keeps 2,000 credits out of its initial allowance.
**`--budget` counts TTS response headers, not total account charges. It is not
an account spending cap.** Concurrent requests can also exceed that threshold.
Use bounded `--limit` batches, compare `/v1/user/subscription` balances between
them, and allow time for delayed charges before starting another. Keep extra
headroom for pending charges and the account reserve. A clip whose inputs did
not change is not made again. Completed workers now checkpoint even when another
request fails; an interrupted validation retry remains pending for resumption.

Measured on the first runs (Starter plan, 40,000 credits a month): Japanese
costs about 0.45 credits a character on `eleven_v4`; a lone kana costs
nothing and a two-kana beat 1 credit. On those runs the balance fell by what
the `character-cost` headers said; on the word runs it fell faster (What the
word set holds), so budget by the balance. Everything, the audition, the
trials and two full runs, came to 9,714 credits. Why it falls faster is the
check's transcription, billed apart (What the account was charged, below).
The account is no longer on Starter either (The plan changed, in the same
section).

## What the first set holds

1,586 clips kept, 1,487 of them on the first take: 31.9 minutes of speech,
11.6 MB.

| Kind | Clear | Calm | Bright | Male |
|---|---|---|---|---|
| phrase (124) | 124 | 124 | 124 | 124 |
| note (99) | 99 | 98 | 99 | 99 |
| sound (63) | 61 | 63 | 61 | 62 |
| kana (137) | 116 | 113 | 108 | 111 |

What failed, and so plays in another voice or the device's:

- **Loanword digraphs** (ティ, ディ, トゥ, ウィ, ヴァ and the rest of
  `GENKI_MAP`), 21 to 24 a voice: the transcriber writes them as English (T,
  D, "two", "oui", "yeah") or the voice says the native version (ヴァ as バ,
  which is how most speakers say it, though Yomu's romaji writes va). Retrying
  with new seeds passed 2 of 54: Clear's でゅ and つぃ, counted in its 116
  above. The cell read 114 until 17 November 2026, when it was checked
  against the shards; the 1,586 total already held both. A word with one is
  sounded out by the device.
- **A few common beats** outside Clear: Bright ほ, り, ゆ, りゃ, みゃ; Calm ひゃ, べ;
  Male み, び, にゃ, ぴゃ. Some are the transcriber writing a right sound in
  another script (ゆ "You", み "Me", び "B", にゃ "Ня"); some may be real (ほ
  heard はあ, べ heard で). They are not shipped unheard. The chosen voice
  borrows Clear's clip for a text, and Clear says a whole sequence the chosen
  voice cannot, so the beats stay recorded and in one voice.
- **Loanwords heard as English**: ファン ("Fang") in three voices, パーティー
  ("Party") in Clear; and ふあん in Bright, ナイター in Calm.

Every rejected take is in `.forge/audio-rejects/` (not in git). A person who
listens and finds one right can ship it (Heard by a person, below).

## The first word expansion

Added 2026-10-17: the `word` and `common` kinds. With the first set, 8,157
clips are kept and 278 failed their check; 96.0% passed on the first take.
The mp3s come to 42.3 MB (57 MB on disk, in small files).

| Kind | Clear | Calm | Bright | Male |
|---|---|---|---|---|
| word (336 a voice) | 334 | 335 | 335 | 333 |
| common (2,825 in Clear, band 1's 858 in the others) | 2,752 | 836 | 831 | 815 |

What failed is mostly a piece of grammar said alone (って, でし, んです,
してい: heard as て, です or English "Stay"), a loanword heard as English
(スプーン "Spoon"), and a short word heard as another (たよう as 太陽, 風
ふう as はあ). A failed word borrows Clear's clip when Clear has it, or the
device says it.

Credits: the word and common runs took the month's use from 9,714 to 20,841
of 40,000 (19,159 left until 2026-11-17), with two runs stopped to fix the
check and one network failure resumed. The balance fell faster than the
`character-cost` headers add up: run 5 lowered it by 9,726 while its headers
summed to 7,011 at its last report. The headers count every take, retakes
included. A later usage check confirmed separate transcription charges;
the exact split for this historical run was not measured.

## The third common-word band

Completed 2026-10-17 in Clear only: **5,013 accepted clips**, **155 rejected**,
and no unattempted words in the current band. The owner approved up to 13,000
total credits, including the pilot. Actual account use was **7,852 credits**,
from 20,841 to 28,693 of 40,000; **11,307 remain** until the November 17 reset.

The addition is **24.82 MB** of MP3 content. The library now has **13,170 voice
clips, 67.12 MB**, excluding the tiny playback-unlock silence file. Previous
clips and lookups are unchanged. Every accepted new word is available through
Clear fallback for all four selected voices; rejected takes are not indexed.
Natural playback of arbitrary unrecorded sentences still uses device speech.

See [AUDIO-BAND3.md](AUDIO-BAND3.md) for automated evidence and 26 listening
samples. Human listening and publication to the website/TestFlight remain
separate steps. The original 5,293-word estimate predates the current script's
deduplication and dictionary coverage; it is not the number of new jobs.

## Heard by a person

The check can only turn a right take away, never let a wrong one through, and
most of what it turns away is the transcriber writing a right sound another
way (ゆ "You", み "Me", a loanword as English). So a take a person heard and
called right ships: `tools/audio-heard.json` (format `yomu-audio-heard/1`,
`tools/lib/audio-heard.mjs`) lists it by voice, the line's key, its take
number in the record's last run and a hash of its bytes, with who heard it
and when.

```bash
node tools/build-audio.mjs --listen   # .forge/audio-listen.html: every take that waits, with its player
node tools/build-audio.mjs --heard    # ship what tools/audio-heard.json names, rewrite the index, stop
```

The listening page is opened from disk and sends nothing anywhere. It lists
each failed record's takes, with what was wanted, what was sent and what the
transcriber wrote, and Clear's kept clip beside another voice's for
comparison. The most used come first (since 17 November 2026; the beats led
until then): the kanji readings in the kanji pages' frequency order, the
order `kanjiPageLines` records them in, then the common words by band, then
the words of Yomu's own lines, then the beats, and last the few sentences and
examples. `--listen` prints how many records and takes each group holds.
Choose the take that is right, or none; the marks stay in that browser, and
Copy or Download gives the whole file to put in `tools/audio-heard.json`,
written by the same function the tool reads it with.
Then `--heard` copies each named take to its clip path, marks its record kept
with `heardBy` (the record's other fields stay those of its last take), and
rewrites the index. No ElevenLabs call, no credit. A recording run applies the
list first too, so a heard take is never paid for again, and a dry run counts
it as made.

Three rules keep it honest. What ships is the take that was heard: an entry
whose hash no longer matches the file (a later run remade it) or whose line
is now sent differently does not ship, and the tool says why. A take ships
only while the list names it: an entry taken out takes its clip out again on
the next run. And a record that later passed its check needs no entry. The
takes live in one checkout's `.forge/`, so `--rejects=DIR` reads another
checkout's (a worktree's run, say).

Built 2026-11-03 with nothing heard yet: 433 records wait, 1,297 takes
(`--listen`), most of them common words in Clear and beats outside it.

On 17 November 2026, still with nothing heard, 587 records wait, 1,759 takes:

| Group | Records | Takes |
|---|---|---|
| reading | 154 | 462 |
| common, band 1 | 115 | 345 |
| common, band 2 | 50 | 150 |
| common, band 3 | 155 | 465 |
| word | 7 | 21 |
| kana (beats) | 100 | 298 |
| sound | 5 | 15 |
| note | 1 | 3 |

**A heard beat must be shaped before it ships to a learner.** On 17
November every beat take that waited (298) was made on 17 October, before
beat shaping (6 November 2026, below), so it still holds its vowel. After
`--heard` ships a beat from such a take, run `node tools/tighten-beats.mjs`
to see what it would change, then again with `--apply`, which shapes every
kept beat not yet shaped, before the site is published or Naninani is built
(its `scripts/bundle.sh` copies `data/audio/` as it stands). A later
`--heard` leaves a shaped beat as it is: the entry still names the take in
`.forge/`, and the clip counts as in place. The listening page says the same
above its rows while any beat take older than beat shaping waits, counted by
the take files' dates (`audio-listen.mjs`), so a take copied without its
date is not counted; a beat take made since is shaped as it is finished.

## The kanji pages

Built 2026-11-03 as script and check only. Since then 1,453 of the
readings are recorded, in Clear, in two runs (Kanji readings, below); none
of the pages' words is yet. The kanji page needed no change to play them: a
reading button, and the hero's Say it
for the first reading, speak `readingKana(r)`, which finds a reading's clip by
its kana key, and a word button already looks up its `wordKey`. A reading is
recorded once for every kanji that has it (にち serves 日 and every other
kanji read にち), and a reading or word another kind already holds keeps that
clip (にち is a common word; 日本 is band 1). A reading is sent in katakana and
checked against its own romaji (`readingRomaji`), not the analyzer's reading
of the kana: 131 of the 4,746 distinct readings come out otherwise, and a bare
へき is the particle へ and き, eki, so a take of えき would have passed. A
reading of one beat is a beat already, and one that starts or ends in a small
っ (ジッ, っこ) is not said alone.

`node tools/build-audio.mjs --dry-run --kinds=reading,kanji`, measured
2026-11-03 (free):

| | Clips | Characters |
|---|---|---|
| reading | 3,982 | 14,005 |
| kanji (words) | 7,198 | 17,627 |
| both | 11,180 | 31,632 |

About 15,800 credits at the header estimate before retakes; band 3 cost 1.52
credits a word on the account, transcription included, which puts all of it
near 17,000. In page order, the 134 kana pages need 74 clips (235
characters); then the first 100 kanji pages 276 clips (817 characters), the
first 500 1,741 (4,588), the first 1,000 4,471 (11,613), the first 2,000
8,228 (21,601) and the first 3,000 9,088 (24,129), each counted from the
first kanji page.
Run it in bounded batches with the balance read between them (Running it,
above), after the owner sets a ceiling.

**The kanji page's gate, since 17 November 2026.** Until then the page gated
its buttons on the device's Japanese voice (`canSpeak`), as the learner's text
does, so on a device without one no recorded reading or word ever played. It
now takes the gate of Yomu's own text (`events-say.js`: a recorded voice
chosen, or the device's), asked of each button, since most of its readings
and words have no clip yet: a reading, a word or Say it plays when its text
has a clip in the chosen voice, or in Clear, which every voice borrows as
`speak()` does, or when the device has a Japanese voice (`speech.js
sayDecision`, through `canSay`). `canSay` answers yes until the shards a text
needs have loaded, and on Chrome the device's voice list can arrive after the
page is drawn, so once it is drawn the page waits for the voice list and,
with a recorded voice chosen and no device voice, loads the shards its
buttons name (`speech.js sayKnown`), then marks each button again in place
(`render-kanji-page.js markSay`, from `events-kanji-page.js settleSay`); with
a device voice, or This device's voice chosen, it fetches nothing. A button
that has neither stays disabled (`aria-disabled`; a reading's frame goes dashed, a word's
speaker dims) and names the line under Say it that says why: with a recorded
voice, that not every reading and word is recorded yet and the device has no
Japanese voice for the rest; with This device's voice, the reader's own reason
(`render-chrome.js speechReason`). The buttons no longer carry `data-speak`,
so the reader's `paintSpeech` neither gates them on the device again nor
marks them when the voices arrive; `settleSay` does that.
`tests/kanji-page-say.test.mjs` holds the decision, the buttons it draws and
how they are marked once the shards load; `tests/kanji-page-voices.test.mjs`
a page drawn before the voice list arrives.

The example sentences themselves (`data/sent/`) are not recorded: Tatoeba's
text, CC BY 2.0 FR, which a recording would carry the credit of. Not built.
Their words are a kind of their own (Words of real text, below).

**Two scripts of readings, merged on 9 November 2026.** The kanji pages'
script (3 November) and Naninani 1.2.0's N5 to N3 readings (6 November) were
built apart. `fullScript` takes the N5 to N3 lines first, so the 767 readings
recorded from them keep their line and their record, and `kanjiPageLines`
adds the rest. They differ in what they send: the recorded readings went out
as their kana, while the kanji pages' script sends katakana and checks each
take against `readingRomaji`, because the analyzer reads 131 of the 4,746
distinct bare readings otherwise (a bare へき is へ and き). Checked on 13
November 2026 from `tools/audio-made.json`, with no API call: of the 767, 753
were accepted against their own romaji and 5 more by their kana; none says
another word's sound. Of the 9 left, 4 are right as recorded and differ only
in how the two romaji write a verb's う or a seam (おもう, ととのう, まよう,
たていと), and 5 end in a small っ (じっ, かっ, がっ, おっ, ほっ) and were
kept saying the beat without its stop, which the kanji pages' script would
not record at all. They are left in place for the owner's ear.

## Beat shaping

On 6 November 2026 the owner heard the lone kana as "moaning". Measured, a
lone beat in Clear ran a median 0.58 s, nearly a two-beat word's 0.65 s: the
voice holds the vowel of a mora said alone (The check, above, lets that pass
on purpose). `finish(pcm, { beat })` now cuts a lone beat to its 40 ms lead-in
and 0.30 s of voice (0.32 s for a small-kana pair such as きゃ, whose
consonant is longer), the last 80 ms faded on a quarter cosine. A beat already
that short is left alone. `tests/audio-finish.test.mjs` holds the lengths and
the fade.

The kept beats were not remade: `tools/tighten-beats.mjs` re-finished the 448
accepted beat clips in place from their own MP3 (decode, trim, shape, level,
encode once more), with no API call and no credits, and recorded
`finish: "beat-1"` with the new `seconds` and `bytes` on each record. Medians
went from 0.51 to 0.60 s down to 0.34 s in all four voices. `FINISH_VERSION`
was not bumped, because a bump remakes every clip. The owner chose the shaped
takes after a before/after listening page; re-recording beats from a spoken
row of kana cut by alignment stays the alternative if they are ever not
enough. `git checkout -- data/audio tools/audio-made.json` undoes it.

## Beats said as another

Six beats that are said as a recorded beat had no clip in any voice: ぢゃ,
ぢゅ, ぢょ, ぢぇ, ゑ and ゐ. (Other beats have none either: the loanword
digraphs that failed their check, What the first set holds, above, and kana
outside the inventory such as ゎ and ヶ.) Each is said as a beat recorded in
all four voices (じゃ, じゅ, じょ, じぇ, え and い), so since 17 November 2026
they are aliases, as ぢ, づ and を already were: an alias key holds the same
`[id, mask]` as the beat it is said as, so it plays that clip in every voice
that has it, and a lookup in katakana folds onto it (`audioKey`). `js/kana.js
SAID_AS` is the one table: `audio-script.mjs beatAliases` hands it to the
index (`audio-index.mjs indexEntries`), and `kana-chart.js` and
`kana-detail.js` give a kana's spoken form from it, so a kana detail of ゑ
says え in the device's voice too. Where the romaji is not the sound's (を
wo, ゐ wi, ゑ we), the kana detail says why: を is usually said お and some
charts write it wo, and ゐ and ゑ are old kana. The chart has none of the
six, so its cells did not change.

Nothing was recorded and no credit spent: with `tools/audio-heard.json`
empty, `node tools/build-audio.mjs --heard` only rewrote the index and its
shards (its path reads files and writes files, and calls no API). The index
went from 10,091 keys to 10,097. Every other key kept its entry, and
`tools/audio-made.json` did not change; 11 keys moved to the next shard,
because a shard is filled to its byte limit and the first five new keys moved
three boundaries (`first` of shards 1 to 3 in `index.json`). ぢぇ, added
after a review the same day, moved none.
`tests/audio.test.mjs` holds each beat said as another, in hiragana and
katakana, to its beat's clip in every voice, from the committed shards.

## Kanji readings

Recorded 2026-11-06 in Clear only, at the owner's request ("N5 to N3 now"):
855 readings of the JLPT N5 to N3 kanji had no clip under the kana the kanji
page plays. **767 were kept and 88 rejected** after three takes each (じゅっ
cannot be said alone; the transcriber wrote げつ as 月 and read it つき;
せわしい came back as 忙しい). A rejected reading keeps the device's voice.

The owner was quoted 1,200 to 1,800 credits. The account fell from 7,162 to
4,864 left: **2,298 credits**, while the TTS headers counted 1,398. The
balance fell about 1.6 times faster than the headers, as on the word runs, so
quote by the balance. A 60-clip pilot (108 credits) came first. The library
now has **13,937 voice clips, 70.27 MB**. N2 and N1 (1,054 more readings by
the same count) wait for an approved budget.

**13 November 2026, the month's last credits.** The owner confirmed the four
voices and approved the run ("For the voice I approve"); the ceiling was what
the account had left above the tool's 2,000 reserve, since the plan allows no
overage and the month's credits lapse on 17 November. A 60-clip pilot, then
four bounded batches, the balance read between them, in the kanji pages'
order (the most frequent kanji first), Clear only: **686 readings kept and 66
rejected** of 752 tried (the transcriber read ひたい as したい, になう as
似合う, かおる as 薫 read くん). The account fell from 4,676 to 2,345:
**2,331 credits**, against 1,367 by the TTS headers, 1.7 times as on the
earlier runs. Nothing was pruned. The library now has **14,623 voice clips
(70.2 MB of MP3 by file size)** and 10,091 keys. Of the reading kind, 2,384
clips remain to make (a dry run's count; the rejected are not tried again
without `--retry-failed`), and none of the kanji pages' 7,198 words is recorded:
they wait for the next month's credits and a ceiling.

## What the account was charged

Read on 16 November 2026 from ElevenLabs' usage API (`GET
/v1/usage/character-stats`, broken down by product type and by model), which
spends nothing.

**The balance falls faster than the headers because of the check.** Every
take is transcribed with Scribe (The check, above), and Scribe is billed as
speech to text, which the text to speech `character-cost` headers do not
count. On 13 November the usage API read 1,367 credits of text to speech and
964 of speech to text: 2,331, exactly what the balance fell by, so that
run's 1.7 times is the transcription. On 6 November it read 1,398 of text to
speech and 1,088 of speech to text: 2,486. That is not the fall read right
after the run (7,162 to 4,864, 2,298), but it is exactly the fall from 7,162
to the 4,676 read before the 13 November run, and the usage API's daily
split shows no use on any day between the two runs (only 17 October, 2, 3, 6
and 13 November had any). So 188 credits of the 6 November run posted after
the 4,864 reading, as Running it warns, its pilot is inside the 2,486 rather
than on top of it, and that run cost 1.78 times its headers, not the 1.6 read
straight after it. Either way a run
costs its headers plus a transcription of every take, and only the balance,
read between batches and again once late charges have posted, counts both.

**Band 3's 1.52 credits a word stands.** The account fell 4,145 credits
between the end of band 3 on 17 October (11,307 left) and the 6 November run
(7,162 left). The usage API puts all of it on 2 and 3 November, on models
this tool never calls: `eleven_v3` 2,475, `eleven_multilingual_v2` 1,487,
voice generation 70 and alignment 113. None of it was a recording run, so
the band 3 figure, and the kanji pages' estimate built on it (The kanji
pages, above), keep their numbers.

**The plan changed.** On 16 November the account read tier `payg`, a limit of
10,000 credits, 0 used, and its next reset on 17 December 2026. It is no
longer Starter's 40,000 a month, on which every figure above was measured.
The tool would read 10,000 left and keep its 2,000 in reserve, but what those
credits cost is not known here, so any run's ceiling waits for the owner to
confirm the plan and its price.

## Words of real text

Built 17 November 2026 as script, check and measurement only: **nothing was
recorded and no credit spent**. A study on 16 November found that the best
use of a credit for the reader is the most frequent words of real text that
have no clip in Clear, as they stand on the page, rather than common-word
band 4: about half of what word by word misses is a conjugated form
(している, 行った), whose dictionary form often has a clip already.

**What the kind holds.** `corpusLines` reads the example sentences a word
shows first (`data/sent/sNNN.json`, 31,512 sentences; not `more/`) with the
analyzer and files each spoken token under the key Naninani's word by word
looks it up by first (`spokenWord`, which is yomu-ios `Speech.spokenWord`
and `written()` with `bridge/entry.js keysFor`): its spelling and reading
(行った|いった), or its kana alone for a word in kana. It leaves out the
punctuation, a particle in kana (said as a beat: は is わ), a number, a Latin
word, a guess, a single beat (a beat already) and a name: the analyzer's
names (トム, メアリー, ジョン), and a katakana word the sentence's English
calls by a capitalized name that none of its glosses holds (`namedInEnglish`:
Tatoeba's Sam and Ziri are read as サム "sum" and ジリ "Dili"; over every
candidate this found six words, each a name in its sentence, and on kanji
and hiragana words the same cue matched It, She and My, so it asks katakana
only). Words are ranked by how many tokens they are in **the sentences with
an even Tatoeba id** (`isRankingSentence`; 15,612 of them), most first,
equal counts in key order; the odd ids (15,900) are held out to measure.

**What it takes.** The kind is last in `KINDS` and in `fullScript`, which
reads it against every other kind whatever `--kinds` asks for
(`takeCorpus`): it never takes a key a line holds, recorded or not, nor a
word whose other lookup key, its bare kana, a line holds, since the reader
finds that clip first. Every key with a clip is some line's, so no word it
ranks has a Clear clip already. A word sent as the same kana as a word above it
is filed under that line's clip (行った|いった, 言った|いった and いった all
send いった): 21 such keys in the first 2,000 lines. 6,654 lines remain of
16,777 words, 1,914 of them met twice or more.

**A kept clip stays.** The corpus is ranked again on every run, so a word
could leave the script, and a run's prune deletes the clip of a line the
script no longer has: when the analyzer or the sentences change the one or
two sentences that ranked it (1,284 of the first 2,000 lines are met once or
twice), or when another kind comes to hold its bare kana (68 of the first
2,000 would, were common band 4 added). So `build-audio.mjs` writes each
corpus line whose clip it keeps to `tools/audio-corpus.json` (`corpusKept`),
as it was sent, and `fullScript` takes those lines back before any new word,
whatever the ranking says (`keptCorpusLine`, `takeCorpus`). Only a key an
earlier kind takes outranks a kept line: that kind's line has the clip's id,
so the clip stays, and is made again only when that kind sends the word
another way (2 of the first 2,000 under band 4). Deleting a row makes its
word an ordinary corpus word again; if the ranking no longer takes it, the
next run prunes its clip. The file is written from the first corpus clip
kept, so it does not exist yet.

**What it sends.** `wordTts`, as the other word kinds: a word in kanji goes
in kanji only when every record of its spelling, or of an inflected form's
dictionary form, gives one reading (食べた; 行った goes as いった, since 行く
is いく or ゆく). An inflected form is also sent as its reading when another
dictionary form the deinflector finds reads its kanji otherwise
(`kanjiReadings`): 通って is 通う's かよって or 通る's とおって, 勝った 勝つ's
or 勝る's, 断った 断つ's or 断る's, and a transcript shows the same kanji for
both. That changed 12 of the first 2,000 lines; 498 of the 2,000 send kana, most
of them words written in kana. A key that folds two spellings together
(ジャガイモ and じゃがいも are both じゃがいも) sends the one the sentences
write most, then the one with more katakana, which a voice reads only as the
sound (`spellingOrder`), never the first met: the sentences' order would
then decide what is sent, and a change of what is sent remakes a clip.

**The check needs no new rule for conjugated forms.** A corpus line is a
word kind: checked against its own reading and the said romaji the reader
shows, from a triple take when it has two beats or fewer (39 of the first
2,000). Read from `tools/audio-made.json`, with no API call: the inflected
forms among the word kind's lines (Yomu's own text) passed 375 of 376 clips,
368 on the first take; the one failure is Male's したり heard as English
"Study". Copula forms passed 41 of 44 (じゃありませんでした came back
じゃあありませんでした in three voices). The pieces that failed before (って,
でし, んです, してい) were a particle in kana, which this kind leaves out, and
fragments the analyzer no longer cuts. A right transcript of each of the
first 2,000 lines, written as it is sent or as the sentence writes it,
passes the check; the only ones that do not are loanwords written in
hiragana with a long-vowel bar (おーぷん戦), which no transcriber writes.
`tests/audio-corpus.test.mjs` holds the selection, the order, what is sent,
what is taken and the check of a conjugated form.

**Dry runs and coverage.** `node tools/build-audio.mjs --dry-run
--kinds=corpus --limit=N` and `node tools/measure-audio-corpus.mjs`,
17 November 2026, free. Coverage is word by word in Clear on the 15,900
held-out sentences (108,984 spoken words), with the app's own key rule,
counting every take as passing (an upper bound: 97 in 100 band-3 words
passed). Before: **82.99%** of words, **25.76%** of sentences recorded from
start to finish.

| `--limit` | Clips | Characters | Met at least | Words | Whole sentences | Credits | Size |
|---|---|---|---|---|---|---|---|
| 500 | 500 | 1,850 | 3 times | 86.49% (+3.51 pp) | 34.88% (+9.12 pp) | about 1,000 to 1,700 | about 2.4 to 3.2 MB |
| 1,000 | 1,000 | 3,724 | 2 times | 87.09% (+4.10 pp) | 36.67% (+10.91 pp) | about 2,000 to 3,400 | about 4.8 to 6.4 MB |
| 2,000 | 2,000 | 7,174 | once | 88.00% (+5.01 pp) | 39.97% (+14.21 pp) | about 3,900 to 6,600 | about 9.6 to 12.4 MB |
| every line | 6,654 | 26,621 | once | 90.27% (+7.28 pp) | 49.03% (+23.26 pp) | about 14,400 to 24,500 | about 32 to 46 MB |

The last row is the most the kind can add as it is built: the ceiling, not a
plan. The dry run's own estimate is 925, 1,862, 3,587 and 13,311 credits, at 0.5 a
character before retakes and transcription. The credits are the account's
measured rates per character sent, everything included: band 3's 7,852
credits over the 14,462 characters its records send (0.54; 1.52 a word,
its words averaging 2.8 characters) at the low end, and the two reading runs of 6 and
13 November, 4,817 credits over 5,231 characters (0.92), at the high end.
Corpus words are longer (3.6 characters on average), and October's transcription cost
almost nothing beside November's, so the low end is a floor; the reading
runs heard a fifth of their clips three times over, against 2 in 100 here,
so the high end is a ceiling. The size is the 97 in 100 that pass, at band
3's 4,952 bytes of MP3 a clip or its 1,781 a character sent; the app
bundles all of `data/audio/`. The plan has changed since
(What the account was charged): 10,000 credits a cycle, 2,000 of them kept
back by the tool, at a price not known here. Run it in bounded batches with
the balance read between them (Running it), after the owner sets a ceiling.

The measurement also says whose the 18,539 missing words are. A line of
this kind holds 7,916 of them (5,452 in its first 2,000, 2,464 after), so a
run can record them. 4,748 are words this kind would take that the ranking
half never meets, so no line holds them, and it leaves out 689 by its rule:
356 numbers, 255 names (in 1.60% of the sentences, which therefore can never
be recorded whole), 77 Latin words and 1 particle in kana. Every line
recorded covers 7,936, 20 more than its own, because 20 words whose line of
another kind has no clip would play a corpus word's clip by their bare kana
(蜜蜂, a kanji page's word, by the corpus's みつばち). The rest are other
kinds': 4,424 the kanji pages' words, not recorded yet, which this kind does
not take (ranked by the same frequency, their first 500 would add 0.37 pp,
so they are a long tail); 520 common words and 9 readings whose check failed
(`--listen`); 216 kanji readings not recorded yet; and 17 sound examples.

`--listen` lists this kind after every other (it is not in its order), in
the script's order. Rerun the measurement after an analyzer change: what
it ranks moves, though a kept clip does not (A kept clip stays, above).

## The page

Native word-by-word playback uses `audio.js wordSequence(audio, keysList, voice)`.
It selects one recorded voice for the whole passage: the requested voice or
Clear, whichever covers more words; the requested voice wins a tie. Each word's
most specific available key is fixed before comparing voices, so a bare-kana
homophone cannot replace a spelling/reading recording. Missing positions remain
null for the caller's explicit device fallback. Natural sentence playback and
the website's existing all-recorded sequence behavior are unchanged. Tests live
in `tests/audio-sequence.test.mjs`; no synthesis or new recordings are involved.

- **One seam.** `speech.js speak()` looks the text up and plays the clip in
  the chosen voice, or hands the text to the device. Every caller gains
  recordings without change; a word's callers (Say the word, Sound it out's
  last step, a word on the kanji page) also pass its `wordKey` as `lookup`,
  tried before the text. A particle in kana passes none: は is said わ, and
  the clip filed under は is the beat ha. One whose spelling has a kanji
  (結果 tagged as a particle) passes its `wordKey`, as any word does
  (`events-say.js lookupOf`; Naninani's `Speech.written` keeps the same rule).
- **The index is sharded.** `data/audio/index.json` (format yomu-audio/2)
  names the voices and the key ranges of `kNN.json` shards (yomu-audio-clips/1,
  `{ key: [id, mask] }`, bit i of the mask is voice i's). The page fetches the
  index on the first speak and a shard when a key needs it, as the dictionary
  does. A voice without a clip borrows the first voice's (`clipByKeys`); a
  sequence borrows only as a whole (`clipInVoice`).
- **A sequence is one voice.** Sound it out plays its beats as clips only when
  every beat and the whole word have one; beats in a recording and the word in
  the device's voice would be two people.
- **iOS.** An `<audio>` element plays only from a tap, or once it has. When a
  clip has to wait for the index, `speak()` plays a twentieth of a second of
  silence in the tap itself, and every later clip reuses the element. A
  browser that still refuses hands the text to the device.
- **Slow.** The normal clip at the Slow rate with its pitch kept
  (`preservesPitch`), which cannot turn one word of a pair into the other.
- **The choice.** Display, Voice: Clear, Calm, Bright, Male, or This device's
  voice. A select, not buttons: five buttons did not fit a 320px phone. Kept in
  this browser only; the synced preferences are unchanged.
- **Two gates** (`events-say.js`). The learner's text needs the device's voice,
  as before. Yomu's own text (a note's examples, Hear both, Listen, Chunk it, a
  dialogue) works with a recorded voice on a device with no Japanese voice.
  The kanji page asks the second gate of each button, whose text may have no
  clip (The kanji pages, above).
- **A dialogue** plays line by line, speaker B in a second voice (Male, or
  Clear when Male is chosen).

`tools/check-data.mjs` holds the files to the shards: every clip a voice's
bit promises is on disk, every file on disk is one some bit promises, and
every key sits in its own shard's range, so a clip that failed its check can
never be played.

## The iOS app

Naninani (yomu-ios) bundles `data/audio/` and finds a clip through the same
code: `bridge/entry.js` calls `audio.js clipByKeys` over the shards it reads
with `__readFile`. Its Read all and a conversation's Listen play every line
recorded or none (`lineClips`), as the page's `speakText` does.
