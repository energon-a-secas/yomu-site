# Yomu on Convex

## Sync rules

The contract the code is checked against. Every time is the device's own
clock, in ms; every join of two copies of a row is commutative and
idempotent (`../js/sync-rules.js`).

**What syncs**, signed in only: My kanji (each save with its review
schedule; each kanji's count, first and last day, where it was last met and
its eight most recently met words), the saved phrases (text, counts,
source), Play's best scores and mixed-up pairs, and six display
preferences (lang, furigana, romaji, highlights, unsaved, slow). **Never**:
History's texts that are not saved, the session, the text in the box, the
remember and translate preferences, an embed, and anything from a browser
that never signs in.

**How each change is stamped** (in the book, `../js/sync-book.js`, until a
push carries it):

- A save: `s`, its latest save time (`at` and `saved` stay the earliest).
  Every save made here is stamped `max(own time, newest removal known + 1)`
  and the stamp never goes down; a row's `s` is the latest of that stamp,
  its join stamp, the store's own time, and the account's `s` when the
  account's save is the same save (the same `at`, or `saved`).
- An unsave: a tombstone `removed`, stamped `max(now, newest save known +
  1)`. A copy whose `s` is not newer than `removed` is dead.
- Clear all (My kanji only): one tombstone for every kanji, the account's
  `clear`, stamped `max(now, newest kanji save known + 1)`. It kills every
  save not newer than it and every count made under an older clear. Made
  before the account's data has arrived here (a join pending: a first
  sign-in, Add or Use), it is an unsave of each kanji it emptied here
  instead, and no clear, so the account's other rows stay.
- Import: each kanji and phrase it brings back counts as saved now, one past
  any removal or Clear all known.
- Counts and Play keep no time: they join by the higher number. A
  preference carries when it last changed, and the later change wins.
- What sync itself writes is never stamped as the learner's.

**Joins.** A browser joins an account once, at a first sign-in or by the
answer to the question below, and the join is in the book from the moment
it is decided (`pending`: `first` until its way is settled, then `adopt` or
`replace`) until a sync finishes it; a retry continues it. A first
sign-in's is written when the kit says who signed in, before whoami
answers; a book pending for another subject than whoami's is another
account's, begun again for whoami's with nothing it kept. With Add, each
save the browser holds before the account's rows arrive is stamped
(`brought`) at the time the join was settled (`joined`), and stays saved
over the account's Clear all or that row's removal when that is older. One
stamped after `joined` and before the finishing sync's own time is taken as
made after the join, and wins; one stamped at that time or later, which
only a clock ahead of this one can do, is stepped past. What the join
receives from the account keeps the account's stamps.

**The Add / Use question** is asked when another account signs in on a
browser that synced before, and on a first sign-in when this browser holds
a saved kanji or phrase while the account holds a saved or removed kanji or
phrase, or a Clear all; a row holding only counts is none of these. The
dialog counts each of them. Any other first sign-in joins as Add, unasked.
Not now syncs nothing and asks again later.

- Add: this browser's data joins the account, saves counted as made at the
  answer, so one older than the account's removal or Clear all comes back
  everywhere. Removals, Clear all (the unsaves above, before the account's
  data arrived) and changes made after signing in (a first sign-in) or
  after the answer (an account switch) reach the account.
- Use: this browser takes the account's data. Of its own it keeps only
  saves counted after the answer and preferences changed since; a removal
  or Clear all made before the account's data arrived applies here only.
  Everything else of this browser's (saves, counts, scores) is gone from
  it, and on a first sign-in it was never in the account.
- After an account switch the old account keeps what it had: nothing
  changed here since its last sync with it is sent to it.

## The backend

Optional and per person: a learner who signs in keeps My kanji, the saved
phrases, Play's store and the display preferences on every device. The page
works in full without it, and an anonymous visit never calls this backend.
The client half is `../js/sync.js`; the merge rules are `../js/sync-rules.js`,
which these functions bundle from outside this folder.

Project `yomu` (team `lucio`), dev deployment `jovial-mouse-131`
(`https://jovial-mouse-131.convex.cloud`). `.env.local` names it and is
gitignored. The URL is public by design: what authorises a call is the Clerk
token Convex verifies, and every function reads its owner from it.

## What is here

| File | What it is |
|---|---|
| `schema.ts` | Five tables: `kanji` (owner, char), `phrases` (owner, key), and one row each of `play`, `prefs` and `clears` per owner, all indexed by owner |
| `auth.config.ts` | Trusts `https://clerk.neorgon.com`, application id `convex` (the JWT template) |
| `sync.ts` | `whoami`, `pullKanji`, `pullPhrases`, `pullMeta`, `push`: an argument validator and a handler each |
| `model/sync.ts` | The handlers. Each reads `ctx.auth.getUserIdentity().subject`, refuses a caller with none (`{ ok: false, error: "not-authenticated" }`), and never takes an owner from an argument |
| `model/validators.ts` | The row shapes as Convex validators; what a value may be is the rules' `clean*` |

A push joins each row with the stored one and writes only a change, so a
row sent twice writes nothing. A pull is paged (400 kanji, 100 phrases a
page). Rows that a Clear all emptied are not pulled, and are deleted when a
push next touches them.

## Running it

```bash
npx convex dev --once     # push schema and functions to the dev deployment
npm test                  # the rules, the handlers over an in-memory database, the client
```

The handlers run under plain node in `../tests/sync-server.test.mjs` and
`../tests/sync-client.test.mjs` (node strips the types of `model/sync.ts`);
`../tests/helpers/fake-convex.mjs` refuses what Convex refuses (a non-ASCII
key, an undefined field, a document over 1 MiB).

## Checking the deployment without a Clerk session

`npx convex run` takes an identity, so isolation is checked against the real
deployment with two made-up subjects:

```bash
A='{"subject":"user_a","issuer":"https://clerk.neorgon.com"}'
B='{"subject":"user_b","issuer":"https://clerk.neorgon.com"}'
npx convex run sync:pullMeta '{}'                                # refused: no identity
npx convex run sync:push '{"kanji":[...]}' --identity "$A"       # wrote 4; the same push again wrote 0
npx convex run sync:pullKanji '{"cursor":null}' --identity "$B"  # rows: [], user_a's rows unseen
```

That run (2026-10-07) left `user_a` and `user_b` test rows in the dev
deployment; no real Clerk user has those subjects.

## Production

The production deployment of project `yomu` already exists, and is empty:
`wandering-ox-429` (`https://wandering-ox-429.convex.cloud`). Convex made it
with the project; `npx convex function-spec --prod` lists no functions
(checked 2026-10-07), so nothing is deployed to it and the page still points
at the dev deployment. Ship from the main checkout, never from a worktree.
The main checkout has no `.env.local` (it is gitignored, and the one that
names the project lives in the worktree that made it), so link the checkout
to the project first, or give the deploy a production deploy key:

```bash
npx convex dev --configure existing --team lucio --project yomu --dev-deployment cloud --once
                                        # writes .env.local naming project yomu (and pushes to dev once)
npx convex deploy                       # pushes schema and functions to wandering-ox-429
```

or, with no `.env.local`, a production deploy key from the project's
settings in the Convex dashboard:

```bash
CONVEX_DEPLOY_KEY='prod:...' npx convex deploy
```

`npx convex deploy` with `CONVEX_DEPLOYMENT` set (`.env.local`) deploys to
that project's production deployment; with `CONVEX_DEPLOY_KEY` set, to the
deployment the key belongs to. The key is a secret: give it in the shell,
never in a committed file.

Then put `https://wandering-ox-429.convex.cloud` in `js/account.js`
(`CONVEX_URL`) and in `index.html`'s CSP `connect-src`, in one commit
(`tests/sync-account.test.mjs` fails when they disagree), and run
`packages/neorgon-ui/sync-auth.sh` from the root so every site's "Your
Neorgon sites" lists Yomu. The production deployment needs no environment
variable: there is no admin role.
