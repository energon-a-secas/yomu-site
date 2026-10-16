# Yomu on a phone

Moved out of the project's CLAUDE.md on 2026-10-14, word for word, so the
file every session loads stays short. CLAUDE.md keeps a summary and the
rules a change must not break; this is the full account, and the one to
edit.

`tests/mobile.browser.mjs` is the check, and npm test does not run it (it
needs Playwright's browsers and a server): serve the site, then `node
tests/mobile.browser.mjs`, with `--base=`, `--shots=DIR`,
`--browsers=webkit,chromium`, `--devices=se,15,pixel,s24,se1` and `--langs=en,es` to
narrow it, and `PLAYWRIGHT_MODULE` naming Playwright's `index.mjs` when the
monorepo's `node_modules` is not three directories up (a worktree kept
elsewhere). It walks every screen (the empty page, a reading, the word (with All
forms open), kanji and notes panels, a kanji page and a move inside it,
Phrases, the header's menu, My kanji with its sync line, a
review, the Collection and a tile, History, Clear all, Search with each of its tabs and a
kana's page, Sign in, all five games
to their result, Retry after a failed shard) at 375x667, 393x852, 412x915,
360x780 and 320x568 with each device's touch and user agent, the reader on its
side too, the header alone with no review due and with 128 and at eight
widths from 701 to 899px (no device lands there; in Spanish the language
toggle ran under Iniciar sesión until it showed only one code), in both
languages, and fails on what is Yomu's: focus in the text box after a tap, a
focus ring on the header button a tap closed a dialog back to, the first word
below the fold, the switches unfolded on a phone, horizontal scroll, a
control under 44px, a field under 16px, something focused or chosen under the
header or the word sheet, a dialog that does not fit, a header that does not
hold My kanji and Sign in (with Phrases in its ⋯ menu on a phone), two of its
controls or the due count overlapping, a tap at a control's edge that lands
on another, a console error.
It fails on a romaji line wider than the reading, and on a Word panel note
button under 44px wide however short its title.
It fails on the send links or Read along above the reading on a phone, or the
tools above it on two rows there; on a wider screen, on Read along off Speak
all's row, and on the send links anywhere but the row under it.
It fails on a chosen word out of sight, under the header or under the sheet
after the phone is turned on its side and back.
What belongs to a fleet kit it prints as a note. `tests/mobile.test.mjs`
holds the markup and stylesheet half under npm test. Run the browser check
after a change to the reader's markup, a phone block of `style.css`, a header
control or a dialog; it took 5.5 minutes on 2026-10-08.

**A tap never leaves focus in the text box.** On an iPhone, focus in the box
during a tap raises the keyboard over the reading the tap just loaded (the
learner met it with an example). `js/press.js` remembers what pressed the last
control, and `focusHome` (an example, Retry, the Remember card's answers,
History's Read again) sends focus to `main` after a touch or a pen, or, with
no press heard, on a coarse primary pointer; after a key or a mouse, to the box
as before. A key pressed inside a field is not a keyboard user: an on-screen
keyboard types there too. `openDialog` focuses its opener before
`showModal()`, and blurs a field the opener is not, because the platform gives
focus back on close to what had it at `showModal()`, before the close listener
runs, and Safari focuses no button a tap presses: choosing a phrase closed the
dialog into the box. Clear still focuses the box; a learner who clears is
about to type. After a touch or a pen, the focus a dialog gives back carries
no ring (`dialogs.js focusBack`, `focus({ focusVisible: false })`, which
Chromium, WebKit and Firefox read): script focus takes its ring from what had
focus before, a text box always has one, and real iOS showed the box's ring on
Frases after Leerla. A control in the header kit's closed ⋯ menu (Phrases, on
a phone) cannot take focus, so a dialog it opened gives focus to the ⋯ button
instead; it fell to `<body>`.

**The reading starts under one row of tools.** On a phone (under 600px wide,
or 480px tall on its side) the eight display switches fold behind
`#display-toggle` (`aria-expanded`, `data-folded` on `#display-panel`, not
saved; above that the button is not drawn), the Remember card comes after the
reading and its Translation, Read along and Repeat after me after the reading
and its sentence bar, the send links and their note after those, just above
the Translation, and the hint's arrow-key line (`.key-hint`) is not drawn
under `pointer: coarse`. The first word of a reading: 972px down a 375x667
screen (1045 in Spanish) before, 429 after; on its side, 717 before and 408
after, still under a 375px fold. So the row above the reading is Speak all,
Slow and Display: with Read along and Repeat after me on it too, it took two
rows on every phone (the first check after read along shipped). On a wider
screen `js/layout.js` moves both blocks into the tools: Read along and Repeat
after me onto the row of Speak all and Slow, the send links onto the row
under it (at 600px the four listening buttons and the links do not fit one
row: 568px of bar for about 700 of controls). After the reading, a
2,000-character text put the links 9,955px down a desktop. Moved, never
drawn twice, so the controls keep their one listener and the tab order
follows the page; `layout.js PHONE` and the phone block of `style.css` are
the same query. The Translation's lines name the row by its
label, Send the text to, never by a place.

**The phone header keeps one control beside Sign in.** Under the kit's
700px, My kanji is the one `data-keep-mobile` action, and Phrases, Play and
the language toggle are in the ⋯ menu. With Phrases kept too, the menu
covered 11px of Sign in at 360px (6 in Spanish) and 30 at 320, and a tap on
Sign in's left edge opened the menu. The bar now has 40px to spare at 360 and
13 at 320, where My kanji takes 6px of side padding (under 360px; the kit
owns a control's height, the gaps, the menu and the Sign in slot, and a
labelled control's padding is the site's `.btn`). Past 700px every control
is in the bar, and the kit does not fold what does not fit: in Spanish the
language toggle ran 46px under Iniciar sesión at 734 (an iPhone 15 on its
side) and 12 at 768, so up to 900px the four labelled controls take 5px of
side padding, and the language toggle shows only the code it switches to.
Search, an icon in the bar, put Sign in over the toggle again in Spanish
(28px at 701, 4 at 768, 3 at 852): from 701 to 759px Search leaves the bar
and its twin beside Clear (`.input-search`) stands in on the reader. Under
900px the reviews-due count rides on My kanji's corner: as a part of the
label it widened the button by 30px. The check measures the bar at every
phone's width, upright and on its side, in both languages, with no review due
and with 128, and fails on any overlap or a tap at a control's edge that
lands on another. The fleet's `scripts/check_site_shell.py` allows one kept
action beside auth and home, and Yomu passes it. When a phone turns past
700px the kit puts the menu's controls back after My kanji, so it reads My
kanji, Phrases, Play: the kit's order, not the page's.

**What scrolls into view stops below the header and above the sheet.** `html`
has `scroll-padding-top` for the header kit's bar, which comes back on every
scroll up: WebKit scrolled a word the arrow keys reached to the very top,
under it. A line of "In this text" that opens a note stays above the word
sheet as the chosen word does (`events.js reveal`, `scroll-margin-bottom`);
the sheet rose over it, focus and all. A turn of the phone with the sheet up
brings that word or line back above the sheet (`events.js bindTurn`): nothing
listened, the turned layout left the word under the sheet in both engines,
and WebKit, which has no scroll anchoring, lost a word in a long text by
thousands of pixels. Only a change of width counts, because Safari's
toolbars change the height as the page scrolls. It measures the band between
the header's scroll padding and the sheet's top (`intoBand`): scrollIntoView
with the sheet's scroll-margin left the word 28px under the sheet in WebKit
one turn in three. The sheet's padding and the
toast's offset add `env(safe-area-inset-bottom)`, which is 0 until the page
declares `viewport-fit=cover`, as the kits do. A text field is 16px under
`pointer: coarse` (`.mk-filter-input` was 14): iOS zooms the page into a
smaller one when it takes focus.

**What still overlaps belongs to a fleet kit**, and the check lists it: the
Beacon (36px, bottom left) over whatever scrolls under it, controls included
(Again in a review, a cell of Odd one out, a place in Where are the spaces?,
Sound it out); the footer's links at 24px, and English on a Spanish page (the
kit has no language hook, and reads the disclaimer's `data-label` once); the
header's 36px controls; the header's ⋯ menu, at least 260px wide and
anchored to the right edge of the actions, which runs 40px off the left of a
320px screen and cuts the first letters of Phrases, Play and the language
toggle there (it meets the edge at 360); the Auth Kit dialog's Privacy and
Terms at 18px.
