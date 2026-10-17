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
   ぢ and づ play じ and ず, and を plays お, which is how each is said.
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
   8 KB, a sentence 15 to 25 KB.
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
node tools/build-audio.mjs --dry-run              # what would be made, about what it costs
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
trials and two full runs, came to 9,714 credits.

## What the first set holds

1,586 clips kept, 1,487 of them on the first take: 31.9 minutes of speech,
11.6 MB.

| Kind | Clear | Calm | Bright | Male |
|---|---|---|---|---|
| phrase (124) | 124 | 124 | 124 | 124 |
| note (99) | 99 | 98 | 99 | 99 |
| sound (63) | 61 | 63 | 61 | 62 |
| kana (137) | 114 | 113 | 108 | 111 |

What failed, and so plays in another voice or the device's:

- **Loanword digraphs** (ティ, ディ, トゥ, ウィ, ヴァ and the rest of
  `GENKI_MAP`), 21 to 24 a voice: the transcriber writes them as English (T,
  D, "two", "oui", "yeah") or the voice says the native version (ヴァ as バ,
  which is how most speakers say it, though Yomu's romaji writes va). Retrying
  with new seeds passed 2 of 54. A word with one is sounded out by the device.
- **A few common beats** outside Clear: Bright ほ, り, ゆ, りゃ, みゃ; Calm ひゃ, べ;
  Male み, び, にゃ, ぴゃ. Some are the transcriber writing a right sound in
  another script (ゆ "You", み "Me", び "B", にゃ "Ня"); some may be real (ほ
  heard はあ, べ heard で). They are not shipped unheard. The chosen voice
  borrows Clear's clip for a text, and Clear says a whole sequence the chosen
  voice cannot, so the beats stay recorded and in one voice.
- **Loanwords heard as English**: ファン ("Fang") in three voices, パーティー
  ("Party") in Clear; and ふあん in Bright, ナイター in Calm.

Every rejected take is in `.forge/audio-rejects/` (not in git). A person who
listens and finds one right can ship it; that is not built yet.

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

## The page

- **One seam.** `speech.js speak()` looks the text up and plays the clip in
  the chosen voice, or hands the text to the device. Every caller gains
  recordings without change; a word's callers (Say the word, Sound it out's
  last step, a word on the kanji page) also pass its `wordKey` as `lookup`,
  tried before the text. A particle passes none: は is said わ, and the clip
  filed under は is the beat ha.
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
