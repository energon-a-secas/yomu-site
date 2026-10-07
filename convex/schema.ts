import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { kanjiFields, phraseFields, playFields, prefsFields } from "./model/validators";

// One row per kanji and per saved phrase, one row each for Play, the
// preferences and the owner's latest Clear all, so no document grows with
// the learner (Convex caps one at 1 MiB). `owner` is always the caller's
// identity.subject, set by convex/model/sync.ts and never sent by a browser.
// The row shapes, and how two copies merge, are js/sync-rules.js.
export default defineSchema({
  kanji: defineTable({ owner: v.string(), ...kanjiFields }).index("by_owner_char", ["owner", "char"]),
  phrases: defineTable({ owner: v.string(), ...phraseFields }).index("by_owner_key", ["owner", "key"]),
  play: defineTable({ owner: v.string(), ...playFields }).index("by_owner", ["owner"]),
  prefs: defineTable({ owner: v.string(), ...prefsFields }).index("by_owner", ["owner"]),
  clears: defineTable({ owner: v.string(), at: v.number() }).index("by_owner", ["owner"]),
});
