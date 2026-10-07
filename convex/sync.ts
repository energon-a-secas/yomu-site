import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import * as model from "./model/sync";
import { kanjiRowV, phraseRowV, playV, prefsV } from "./model/validators";

// The functions js/sync.js calls, as strings ("sync:pullKanji", ...). Each is
// the argument validator and a handler from convex/model/sync.ts, which reads
// the owner from ctx.auth.getUserIdentity() and refuses a caller with none.
// No function takes a user id.

const cursor = { cursor: v.union(v.string(), v.null()) };

/** Who the Clerk-issued token says the caller is, or null. */
export const whoami = query({ args: {}, handler: (ctx) => model.whoami(ctx) });

export const pullKanji = query({ args: cursor, handler: (ctx, args) => model.pullKanji(ctx, args) });

export const pullPhrases = query({ args: cursor, handler: (ctx, args) => model.pullPhrases(ctx, args) });

export const pullMeta = query({ args: {}, handler: (ctx) => model.pullMeta(ctx) });

export const push = mutation({
  args: {
    clear: v.optional(v.number()),
    kanji: v.optional(v.array(kanjiRowV)),
    phrases: v.optional(v.array(phraseRowV)),
    play: v.optional(playV),
    prefs: v.optional(prefsV),
  },
  handler: (ctx, args) => model.push(ctx, args),
});
