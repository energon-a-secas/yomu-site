# Yomu on Convex

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
at the dev deployment. To ship, from the main checkout and never from a
worktree:

```bash
npx convex deploy                       # pushes schema and functions to wandering-ox-429
```

then put `https://wandering-ox-429.convex.cloud` in `js/account.js`
(`CONVEX_URL`) and in `index.html`'s CSP `connect-src`, in one commit
(`tests/sync-account.test.mjs` fails when they disagree), and run
`packages/neorgon-ui/sync-auth.sh` from the root so every site's "Your
Neorgon sites" lists Yomu. The production deployment needs no environment
variable: there is no admin role.
