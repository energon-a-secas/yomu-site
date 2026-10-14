# Accounts and sync

Moved out of the project's CLAUDE.md on 2026-10-14, word for word, so the
file every session loads stays short. CLAUDE.md keeps a summary and the
rules a change must not break; this is the full account, and the one to
edit.

Optional, through the Neorgon Auth Kit (`packages/neorgon-ui/auth/README.md`,
vendored as `js/neorgon-auth.js`, `js/neorgon-auth-sites.js`,
`css/neorgon-auth.css`; the slot is `div.neo-auth` before `.header-home`,
the key is the fleet's production `pk_live_`). Signed in, My kanji, the
saved phrases, Play's store and the six display preferences sync to Convex
project `yomu` (team lucio; production deployment `wandering-ox-429`, its
URL in `js/account.js CONVEX_URL`; dev `jovial-mouse-131`;
`convex/README.md`). Signed out, or never signed in, every store stays in
this browser exactly as before. The rules in
brief, which a review checks the code against, open `convex/README.md`
("Sync rules"); the paragraphs below say why each is so. The modules:
`js/sync-rules.js` (the rows and how two copies join, pure; the page,
`convex/model/sync.ts` and the tests import this one file, which is `.js`
because a browser cannot strip types), `js/sync-local.js` (the stores as
rows, and one sync's plan: what to push, what to change here, what the
server holds after), `js/sync.js` (pull, merge, push; imported on sign-in
only), `js/sync-book.js` (`localStorage['yomu-site:sync']`: the account this
browser syncs with, and the kit's id for it when that is not whoami's, an
answer to the account question not yet finished, when it joined and what it
brought, the last Clear all it applied, removals not
yet carried, save stamps not yet carried, what it last heard of the
account's rows, when each preference changed),
`js/sync-watch.js` (the stores as sync changes
them, and the listeners that stamp an unsave, a Clear all, a save and an
Import),
`js/account.js` (the guard, the kit, the timers, the step a retry runs;
every dependency passed in), `js/events-sync.js` (the page's
dependencies), `js/render-sync.js` (the My kanji line `#mk-sync`, the
`#sync-dialog` question, in its two wordings, and the Clear all dialog's
words) and `js/strings-sync.js`.
`npm test` runs `tests/sync-rules.test.mjs`, `tests/sync-server.test.mjs`
(the real handlers over an in-memory database,
`tests/helpers/fake-convex.mjs`, which refuses what Convex refuses),
`tests/sync-client.test.mjs` (devices made of the real
stores, `tests/helpers/sync-device.mjs`, three of them in random order,
converging), `tests/sync-stamps.test.mjs` (Import, and clocks that disagree),
`tests/sync-join.test.mjs` (what a join stamps),
`tests/sync-saves.test.mjs` (a save keeps its own time through a merge),
`tests/sync-first.test.mjs` (what a first sign-in asks, and each answer),
`tests/sync-account.test.mjs` and `tests/sync-tabs.test.mjs` (two tabs of
one browser over the same storage).

**An anonymous visit fetches nothing from Clerk, Convex or esm.sh.**
`app.js` imports `events-sync.js` only with a key on the page and only
after an embed has returned, so a frame starts no kit. The kit loads
clerk-js only with a Neorgon session or on Sign in; the Convex client
(`https://esm.sh/convex@1.46.0/browser`, the version in package.json, and
the CSP allows that one path) and `sync.js` are imported on sign-in. A
static import of any of them (`import ... from`, a side-effect `import '...'`,
an `export ... from`, in either quote, with no spaces, with comments inside
the braces, before the specifier or before the `import`, across lines,
after another statement on its line, or with a query on the specifier)
fails `tests/sync-account.test.mjs`, which
also fails when the CSP's connect-src lacks `CONVEX_URL` or script-src lacks
the pinned path: a new deployment changes both in one commit. The client is
`ConvexHttpClient`, so there is no websocket and no `wss:` in the CSP.

**Every join is commutative and idempotent, and rows are cleaned before they
are compared.** Convex hands objects back with their keys sorted, so
`same()` (canonical JSON) only works on rows rebuilt by a `clean*` function.
A push joins each row with the stored one and writes only a change; a sync
with nothing new writes nothing, which the three-device test asserts. A
kanji, a kana pair or a text is a value, never an object key: Convex keys
are ASCII (`mixed` travels as `[{ k, n }]`).

**A removal is a tombstone that wins over an older save and loses to a newer
one.** A row carries `removed`; a saved kanji or phrase carries `s`, the
latest time it was saved (`at` and `saved` stay the earliest, as Import
keeps them). The stores never hold `s`: `sync-local.js` rebuilds it as the
latest of the save's own time, the book's stamps for that save (its join
stamp in `brought`, and `saves`, both below), and the server's `s` when the
server's save is the same save (the same `at`, or `saved`). Borrowing the
server's `s` for a different save brought a save made before a Clear all
back to life inside the newer one (its regression test is in
`tests/sync-client.test.mjs`).

**Every save made here is stamped in the book with its own time.**
`sync-watch.js` writes it into `saves` (one past the newest removal this
browser knows, when that is later), the stamp never goes down, and it is
forgotten only once a push has carried it. The store cannot keep that
time: a merge moves its save time back to the earliest copy's. Before the
stamp, a save of 二 at T20 by a browser that did not hold it took the
account's T10 in the merge, borrowed the account's `s`, and lost to
another device's offline unsave at T15, with every clock correct
(`tests/sync-saves.test.mjs`, kanji and phrases, and saves made after an
answer to the account question). A removal is written to the book only by
the learner's own unsave: `sync-watch.js` ignores what sync writes
(`applying`), since a removal stamped "now" while applying another device's
would outrank a save made after it. The book is read from storage on every
sync, never cached, because another tab may have written a removal.

**Clear all is one tombstone for the whole of My kanji, and a count has no
time.** The owner's `clear` kills every save not newer than it and every
seen record counted under an older clear (`e`, the clear its device knew).
So a device that counted kanji after the clear, before it heard of it,
loses those counts at its next sync; a push answers with the server's
clear, and a newer one makes the client pull at once. That is a Clear all
made once the account's data has arrived here. One made before (the book
`pending`: a first sign-in or an Add whose sync has not applied the pull)
is an unsave of each kanji it emptied here, stamped as one, and no clear
(`sync-watch.js cleared`): Add carries those removals, and the account's
other rows stay. A review found it kept as the account's clear, which
emptied every device of kanji this browser never showed while the dialog
said "in this browser" (`tests/sync-account.test.mjs`,
`tests/sync-first.test.mjs`). Under a pending Use, and while someone other
than the book's account is signed in (another account's question open or
put off, or whoami still out after a switch), it records no removal at
all: it stays in this browser. A review found one made with another
account's question open kept as the old account's clear while the dialog
said every device of the account empties: the answer replaced that book,
so it reached neither account. The dialog has three wordings, by
`sync-book.js clearsOf`: this browser (no book, a pending Use, or another
account than the book's signed in, `clearBody`), the kanji held here (a
pending first sign-in or Add, `clearBodyJoining`), the account (joined,
`clearBodySynced`). The dialog keeps the words it opened with until it
closes, and the click hands them to the clear with the account they were
about (`render-sync.js openClearWords` and `clearScope`, `clearAll(now,
said)`): `sync-watch.js` does what they said, or what a Clear all does now
when that reaches less, so a first sync landing under the open dialog, or
another tab, never makes the click do more than the words said. If another
account signed in under the open dialog, the clear never reaches it
account-wide: joined to it, only the kanji this browser brought to it go;
its join pending, the clear stays here and brings nothing, so it keeps its
own copy (round 7's review found the click emptying that account). A review found the words relabelled under the
open dialog, from the kanji held here to the whole account, and the click
then emptying the account. Another tab's write to the book reaches this
one as a storage event, on which `account.js` paints the line and the
words again: painted from its own syncs only, a tab whose pull failed went
on saying the account keeps its kanji after another tab had joined it,
while its Clear all emptied the account (`tests/sync-tabs.test.mjs`).

**A browser that never synced is asked before its data meets an
account's.** On a first sign-in `account.js` writes the join into the
book (`pending: 'first'`) as soon as the kit says who signed in, for the
kit's user id (the Clerk user id, which is the subject whoami answers
with), and `sync.js begin()` checks it against whoami: a book pending for
another subject is another account's first sign-in, begun again for
whoami's, carrying nothing it kept. That book names the kit's id when the
two differ (`kit`, which should never be written: both are the Clerk user
id), and `account.js recordFrom` keeps it on the page loaded again under
that id. A review found the reload writing the kit's id over it, which
dropped an unsave made there since (`tests/sync-tabs.test.mjs`). If this
browser holds a saved kanji or a
saved phrase, and the account holds a saved or removed kanji or phrase, or a
Clear all (`sync.js accountHolds`), it asks the Add / Use question an
account switch asks, worded for this case (the `syncFirst*` strings: "This
browser has kanji and phrases from before you signed in. Add them to your
account, or use your account's data here?"). Its counts are what it asks
about: the account's saved kanji and phrases, and a line each for the
account's removals and its Clear all when it holds them (`syncFirstRemoved`,
`syncFirstCleared`). A first device with an empty account, and a browser
with nothing saved, join without asking, as Add: counts, scores and display
settings alone are never asked about, on either side. A kanji row holding
only counts used to ask, with the dialog reading "saved kanji 0, saved
phrases 0", and Use then dropped this browser's saves for an account that
had saved nothing (`tests/sync-first.test.mjs`). A browser that never synced
used to bring its data with no question, so a kanji the learner had removed
or cleared on another device came back on every device (the review's P1 and
P2, both answers in `tests/sync-first.test.mjs`). Not now leaves the join
pending `first`, and the next sign-in asks again. The fleet's Clerk session
covers every `*.neorgon.com` site, so the first visit by someone already
signed in on another Neorgon site is a first sign-in, and is asked the same
way.

**Add brings all of this browser's data; Use brings none of it.** With Add
(answered, or a first sign-in not asked) the browser takes the account's
clear as its own and every save it holds counts as made when it joined.
The book's `joined` is when the join was settled (begin() decided it, or
the learner answered), or one past the account's Clear all when that is
later; each save the browser brings is stamped in the book (`brought`) at
`joined`, or one past the account's removal of that row when that is
later (`sync.js joinStamps`; the next paragraph says which later ones
count): another device's clock may run ahead, and
joining at this clock's now lost a whole browser's saves to a clear stamped
an hour in the future (`tests/sync-stamps.test.mjs`). So with Add a save
older than a removal or a Clear all the account made before this browser
joined comes back, on every device: the learner chose to bring it. With
Use the account's removal or clear stands, and what this browser held
stays behind. This browser's data was never in the account, so Use loses
it; the dialog says so, and to export first.

**A pending join does not depend on when another device's removal
arrives.** A removal or a Clear all stamped after `joined` and before the
time of the sync that finishes the join is taken as made after the join,
and wins, whether it reached the account before that sync or after it;
only one stamped at that sync's time or later, which no correct clock has
made yet, is stepped past (`sync.js joinStamps`). Before, an Add answered
at T10 whose pull failed kept a kanji another device unsaved at T15 when
the unsave reached the account before the retry at T20, and lost it when
the unsave arrived after (the review's probe-addwindow; both orders and
both kinds of join in `tests/sync-join.test.mjs`). What is left depends
on clocks, not on network timing: a removal made before the answer by a
clock ahead of this one, by less than the wait, lands inside that window
and wins.

**Only what the browser brings is stamped, each row on its own.**
`brought` is taken from the stores before anything of the account's is
applied, and written with the merge, so a retry after a failed push, or a
reload, stamps the same rows and no others. What the join received from the
account keeps the account's own stamp. Stamping every save the stores held
after the merge sent the received ones back stamped `joined`: a removal or
a Clear all another device made offline before the join, pushed after it,
then lost to them, and with a clock an hour ahead somewhere the received
rows landed an hour in the future (`tests/sync-join.test.mjs`). A stamp is
dropped by the learner's own unsave, new save or Clear all of that row.

**Import is a choice made now.** A kanji or phrase that Import brings back
keeps its backup's schedule and counts, but is stamped in the book
(`saves`) as saved now and one past any removal or Clear all this browser
knows, so Export, Clear all, Import is not undone by the next sync. The
stamp outranks a clear made elsewhere that this browser had not heard of
too, since by the clocks the Import came after it; the counts do not,
because a count has no time (above). A removal made after the Import still
wins. Stamps are forgotten once a push carried them: the account then holds
that save's `s`, which `sync-local.js` borrows.

**Clocks disagree, and the learner's last action wins anyway.** Every time
is the device's own clock. A removal or a Clear all made here is stamped at
least one past the newest save this browser knows for that row (the
store's own, a stamp in the book, the account's copy as this browser last
pulled or pushed it): `max(now, known s + 1)`. A save made here is
stamped `max(its own time, known removal + 1)`. Without the first, a
device an hour behind unsaved a kanji and saw it come straight back;
without the second, the same device could not save again what it had just
removed. Both are in `tests/sync-stamps.test.mjs`. The account's copy is
the page's (`sync.js known()`) and the book's (`heard`, each row's newest
`s` and removal, written with every sync and push), which a reload keeps:
with the page's alone, a reload before the first pull (offline, for as long
as it lasted) stamped against the store alone, whose save time is the
earliest, and another device's newer stamp that this browser had already
pulled, a join stamp or a removal from a clock ahead, outranked the
learner's later unsave, save or Clear all.

**The eight words per kanji are the eight met last.** A word travels with
the day it was last met (`[written, reading, day]`, the server's day or the
kanji's last day here), and the join keeps the eight latest; the store
keeps `[written, reading]` in that order.

**One sync plans twice.** It plans against the pull, applies the changes
here through the stores' own calls (My kanji `adopt()` and Play `adopt()`
through their `validate()`, History's `unsave()` and `mergePhrases()`, the
preference setter), then plans again from the stores as they now are and
pushes that: History's merge folds an ordinary entry's reads into a phrase
it saves again, and pushing the first plan left the account a sync behind.

**Another account is asked about, never merged.** `decide()`: no book, or
a first sign-in not settled, is a first join (`adopt`, asked about as
above); the book's account merges (`same`); another one opens
`#sync-dialog` with what each side holds. Add is `adopt`
and Use is `replace`; Not now pauses sync and the line offers Choose. The
answer goes into the book as it is given (`sync.js choose()`): a book for
the new account with `pending` set until a sync finishes it, so a retry, a
reload or another tab finishes that answer, and what the learner saves,
removes, clears or changes in between goes to the new account, as in any
sync. It used to live only in the page: after Use a save made before the
retry was wiped by it, and after Add an unsave, a Clear all or a
preference change went into the old account's book and was dropped
(`tests/sync-account.test.mjs`). Add joins as above, from the time of the
answer (`joined`, `brought`), and carries every removal made since (a
Clear all before the account's data arrived as the removals of the kanji
it emptied here). Use takes the account's data and, of this browser's
own, only what the learner did after answering: a save stamped in the
book since the answer (`saves`, by hand or by Import; the answer starts the
book afresh) and a preference changed since (`sync-local.js sinceAnswer`).
The store's own save time is not read: Import keeps a backup's, and one
exported on a clock ahead looked made after the answer and entered the
account, though the dialog said this browser's kanji were gone
(`tests/sync-stamps.test.mjs`). A removal or a Clear all made under a
pending Use before the account's data has arrived here applies here only,
never to the account (`sync.js joinBook`): the learner could not have seen
the account's rows, and carrying it cleared kanji of the account's this
browser never showed. Once the data has arrived (the sync that finishes the
answer applied it), removals and a Clear all go to the account as usual; the
Clear all dialog says this browser only until then. What it held at the
answer stays behind, with its counts and Play's scores, and the old
account's removals not yet pushed are dropped with that account. The old
account keeps what it already had and nothing more: what changed here since
its last sync with it is never sent to it, and with Use it is gone from this
browser too. The dialog says exactly that, and when that last sync was; do
not promise the old account more. A sign-out closes an open question
(`ui.dismiss`), and an answer given after it applies to nobody.

**A tab answered second runs as an ordinary sync.** Two tabs signed in to
the new account both ask. A tab left paused on the question (Not now) does
not hear the other tab's answer and stays paused until Choose; answered
then, it finds the book already naming the account, writes nothing, and
runs as an ordinary sync on it: the first answer stands, and is finished
there if it is still pending (`tests/sync-tabs.test.mjs`).

**A failure changes nothing, is said once, and the retry runs the step that
failed.** A pull that fails applies nothing; a push that fails keeps the
merge and the remembered account. A first sign-in's join is in the book
from the kit's sign-in (`pending: 'first'`, then `'adopt'` once settled,
as an answered Add), so the retry continues it, and an unsave, a save, a
Clear all (as the unsaves above) or a preference change made in between
counts. It used to write nothing until a sync finished, and then nothing
until begin() had whoami's answer: an unsave made while the pull failed,
the Convex client failed to load, whoami was out or the token was refused
was recorded nowhere, and the retry brought the account's copy back
(`tests/sync-join.test.mjs`, `tests/sync-account.test.mjs`). A begin()
whose whoami answers after a sign-out writes nothing (`stopped`), so it
cannot put the old subject over the next sign-in's book. `account.js` keeps
the step a sign-in is at: `connect` (whoami, and the pull behind the account
question or a first sign-in's), `ask`, the chosen `adopt` or `replace`, then
`same` once the book names the account (a sync wrote it, or it holds the
pending join). The next change, the `online` event and the page shown again
(a pull at most once a minute when nothing failed) all run that step, one at
a time. A retry used to be an ordinary sync, which `sync.js` refuses with no
book (`account-changed`), so a first sign-in that failed once never
recovered without a reload. A book that already names the signed-in account
is joined, or holds the answer that will join it, so `sync.js` runs an
`adopt` or a `replace` on it as `same`, or as its pending answer: another
tab may have written it since begin() or the answer, and a second join would
drop that tab's removals not yet pushed and count what it received from the
account as its own (`tests/sync-tabs.test.mjs`). A first sign-in still
`first` is never run as `same`: `run()` refuses it, and the step goes back
to `connect`, where begin() settles it or asks. The line says the failure's
kind in a plain sentence (offline, the sign-in not accepted, another tab
switched accounts, refused, a server error), never a code or a Convex
request id; those go to the console.

**Two joins depend on the grouping, and it does not matter which.**
`joinKanji` and `joinPhrase` are commutative and idempotent but not
associative. A copy that a removal kills can still have lent its values to
a live copy it met before the removal reached them: for a saved kanji, the
schedule, `at` and `lapses` (`tests/sync-rules.test.mjs`, "the one grouping
that differs"); for a phrase, its read count `n`, its last read (`last`,
`src`, and `t`, the spelling read then, which may differ from another
copy's in spaces or width and still have the same key) and the earliest
`saved`. It is harmless because whether a kanji or a phrase is saved, and
a phrase's key, are the same in any grouping (the newest save against the
newest removal, both maxima, which the random test asserts), seen counts,
words, Play and preferences are fully associative, and every device takes
the account's row at its next sync, so the devices still agree with each
other. What the order decides is a review schedule, a read count, the
last-read time and spelling, or the date History sorts a saved phrase by.

**Sign-in cannot be tried on localhost.** The production key refuses it and
the kit's dialog says so (expected). The functions are checked with
`npx convex run sync:<fn> --identity '{"subject":"user_a","issuer":"https://clerk.neorgon.com"}'`
(`convex/README.md`). The production deployment (`wandering-ox-429`) has
held the functions since 2026-10-08 and the page points at it; a real Clerk
session against it is checked on the live domain only.
