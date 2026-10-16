# The reader: Gaps, the display choices, the Translation, the handwritten form

Moved out of the project's CLAUDE.md on 2026-10-16, word for word, when the
file passed the 40,000 characters the fleet's smoke check allows an
instruction file (it was 46,075). CLAUDE.md keeps a summary of each and the
rules a change must not break; this is the full account, and the one to
edit.

**Gaps are drawn, never typed, and their reasons are decided in one pure
module.** The Display row's Gaps (`state.prefs.gaps`, Off by default, a
boolean read field by field like the other toggles; `gapsSeen` remembers that
the one-line hint, `#gaps-hint`, was shown once) sets `#reading[data-gaps]`,
and CSS does the rest: `render-reading.js` always builds an empty `span.gap`
between two word tokens that touch and a `span.gap--part` inside a katakana
compound's surface at each edge between its parts, so the toggle repaints
nothing. A word's gap goes in one `.tok-group` with the word it follows: as
its own flex item it wrapped away, leaving a row that started on a bar (the
review of 2026-10-07 saw it at 390 in all three browsers), so do not put it
back between the two buttons. A gap holds no text node, so copying the reading
copies nothing it adds (measured in Chromium, WebKit and Firefox: the pasted
text with Gaps on is the text with Gaps off). `js/gaps.js` decides each edge's
one reason from the tokens alone (docs/ANALYZER.md, "Gaps"), in the order
particle, copula, an edge before a no-start kana (a guess), name, script, loan,
nostart, guess, compound, word; the
strings are `strings-gaps.js`'s and `render-gaps.js` draws them. Hiragana ん and
っ are not in `NOSTART`: the analyzer reads the explanatory ん (登る|ん|です) and
the quoting って (行く|って|言った) as words of their own, and a game that said no
word starts with ん had keys that started one with it; `tests/spaces.test.mjs` holds every key to every reason the game
can show. An edge before a kana in `NOSTART` is a guess, never a change of
script (す|ご|ー|いね: the bar lengthens ご). A guess touching a gap is said in
words whatever reason won ("...; the reading here is a guess"), in the tip and
the Word panel, not only by the dashed line. A reason reaches a pointer by
hover (`#gap-tip`, inside the reading, never fixed to the viewport, so a
scroll carries it with its gap), a tap on a gap pins it, and every repaint of
the reading (`render.js paintReading`) puts it away, or a pinned reason stayed
over a new text naming a word that was gone. The Word panel lists the gaps
before, inside and after the chosen word as text, which is the way for a
keyboard and a screen reader: a gap takes no focus and no tab stop. Where
there is no gap it names what stands there (`gaps.js besideOf`: the line's
start or end, punctuation, a space, Latin letters). WebKit gives the click of
a tap on a 12px gap to the word beside it (the pointerdown was on the gap), so
`events-gaps.js` reads a tap from `touchend` and cancels its click; do not
move that back to `click` alone.

**Furigana has three choices over two preferences, and only one of them syncs.**
On, Not in My kanji and Off write `prefs.furigana` (synced, a boolean) and
`prefs.furiSaved` (this browser's only); `render-chrome.js prefValue` reads
them back as one value and sets `#reading[data-furigana]` to on, saved or
off. Not in My kanji hides a ruby whose kanji are all saved
(`render-save.js paintSavedMarks` toggles `ruby.is-known`), with `visibility`,
so a save never moves the line. The Kanji select (`prefs.kanjiShown`: all, only My kanji, or My
kanji and the school years up to one, this browser's only) keeps as kanji a
ruby whose kanji are all familiar (`ruby.is-familiar`, set beside
`is-known`) and draws every other one as its kana, inline and dotted under,
by CSS alone (`#reading[data-kanji="some"]`): every character under a ruby
is a span (`.kj`, or `.kj-other`), so all of them can be put away, and a
ruby over 々 alone follows the kanji before it. The size (S, M, L, `prefs.size`) is this
browser's too: `sync-rules.js PREFS` keeps the six it had, and the server's
validators would refuse a seventh. One sentence at a time (`reading-view.js`,
`events-view.js`) numbers the reading's units by sentence after each paint
(a unit ending in 。！？, or a new line, ends one) and puts the others away;
the view lasts the visit. Choosing a word shows its sentence, and so does the
arrow keys' roving focus (`events.js roveTo` calls `followFocus`), because
focus cannot land on a word that is not drawn. Read along (`read-along.js`, beside Slow on a
wider screen and after the reading on a phone, `docs/PHONE.md`) says the text sentence by
sentence in that view, from each word's
reading (`speech.js sayable`), lighting each word on a timing estimated
from its beats (`read-along-time.js`) and learned from how long each
sentence took; a browser's boundary events only move the light forward and
only once their word is nearly due (`believe`), because Chromium on macOS
sends them all 90 ms in. Repeat after me pauses as long as the sentence took
after each one; no microphone. A run stops on Stop, a new text
(`render.js paintReading`), leaving the reader, or a voice someone else
cancelled (Speak all), which it then leaves speaking (`keepVoice`). The kana chart marks the rows a learner
knows (`prefs.kanaRows`, this browser's only), and the phrase library's
"Only phrases I can read" keeps the phrases and dialogues whose kana use only
those rows (`kana-rows.js`: a voiced kana counts as its plain row, a small one
as its big one's, っ as た, ん and を as わ). Measured on the library: 18 of
71 phrases with あ to ま, all with every row.

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

**The handwritten form is Klee One, served by Yomu, and loads on first use.**
Print and handwriting differ (さ, き, 令), and a learner copies the hand. The
kanji page (under the large character) and the kana chart (beside Hiragana
and Katakana) have a Print / Handwritten switch (`render-hand.js`,
`events-hand.js`, `state.prefs.hand`, this browser's only), which sets
`html[data-hand]`; CSS swaps `.kp-big` and `.kc-kana` to it. `fonts/klee/`
is Klee One (SIL OFL 1.1, no Reserved Font Name, so the subset keeps its
name) cut by `tools/build-font.mjs` (python3 with fonttools and brotli) into
woff2 slices of 200 glyphs by code point, the kana in the first (24.5 KB), a
kanji slice about 65 KB, 7,719 characters and 2.5 MB in all, with OFL.txt
beside them as the licence asks; no layout features, which were 135 KB of the
kana's 160. Nothing loads until the switch is first on: then
`fonts/klee/index.json` (`yomu-font/1`, each slice's characters), whose
slices `hand.js loadHand` registers with the FontFace API, so the browser
fetches a slice only when it draws one of its characters (one file for a
kanji page). With the switch left on, the index loads when a kanji page or
the chart opens. The print font stays next in line, so a kanji Klee One lacks
(2,847 of the shards' 10,384, 寬 among the name kanji) is drawn in print and
the kanji page says so (`handMissing`). Google Fonts would have sent every
visitor's address to Google; `font-src 'self'` stays as it is.
