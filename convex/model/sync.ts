/**
 * The handlers behind convex/sync.ts, with nothing of Convex at run time but
 * the `ctx` they are given, so the node tests (tests/sync-server.test.mjs,
 * tests/sync-client.test.mjs) run these exact functions over an in-memory
 * database. convex/sync.ts adds only the argument validators.
 *
 * Every handler takes its owner from ctx.auth.getUserIdentity().subject and
 * refuses a caller with none. No argument names an owner, so no browser can
 * read or write another person's rows.
 *
 * How two copies of a row become one is js/sync-rules.js, which the page runs
 * too. A push joins each row it is sent with the stored one and writes only
 * when the join differs, so a row pushed twice writes nothing.
 */
import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  cleanKanjiRow, cleanPhraseRow, cleanPlay, cleanPrefs, cleanClear,
  joinKanji, joinPhrase, joinPlay, joinPrefs, same,
} from "../../js/sync-rules.js";

/** Rows per pull page. A kanji row is a few hundred bytes; a phrase up to 2,000 characters. */
export const KANJI_PAGE = 400;
export const PHRASE_PAGE = 100;
/** Rows per push. js/sync.js sends no more than this in one call. */
export const MAX_KANJI = 200;
export const MAX_PHRASES = 50;

export const REFUSED = { ok: false as const, error: "not-authenticated" };

type Ctx = QueryCtx | MutationCtx;
type Cursor = { cursor: string | null };
type Row = Record<string, unknown> | null;

async function ownerOf(ctx: Ctx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity ? identity.subject : null;
}

async function clearDoc(ctx: Ctx, owner: string) {
  return await ctx.db.query("clears").withIndex("by_owner", (q) => q.eq("owner", owner)).first();
}

async function oneDoc(ctx: Ctx, table: "play" | "prefs", owner: string) {
  return await ctx.db.query(table).withIndex("by_owner", (q) => q.eq("owner", owner)).first();
}

/**
 * Write `next` where `doc` stood: insert, replace, delete, or nothing when
 * the stored row already is `next`. Returns how many documents changed.
 */
async function put(ctx: MutationCtx, table: "kanji" | "phrases" | "play" | "prefs", owner: string, doc: { _id: any } | null, before: Row, next: Row) {
  if (!next) {
    if (!doc) return 0;
    await ctx.db.delete(doc._id);
    return 1;
  }
  if (!doc) {
    await ctx.db.insert(table, { owner, ...next } as any);
    return 1;
  }
  if (same(before, next)) return 0;
  await ctx.db.replace(doc._id, { owner, ...next } as any);
  return 1;
}

export async function whoami(ctx: QueryCtx) {
  const owner = await ownerOf(ctx);
  return owner ? { subject: owner } : null;
}

/** One page of the owner's kanji rows, each as the latest Clear all leaves it. */
export async function pullKanji(ctx: QueryCtx, { cursor }: Cursor) {
  const owner = await ownerOf(ctx);
  if (!owner) return REFUSED;
  const clear = cleanClear((await clearDoc(ctx, owner))?.at);
  const page = await ctx.db.query("kanji").withIndex("by_owner_char", (q) => q.eq("owner", owner)).paginate({ numItems: KANJI_PAGE, cursor });
  const rows = [];
  for (const doc of page.page) {
    const row = joinKanji(cleanKanjiRow(doc), null, clear);
    if (row) rows.push(row);
  }
  return { ok: true as const, rows, cursor: page.continueCursor, done: page.isDone, clear };
}

/** One page of the owner's saved phrases and phrase tombstones. */
export async function pullPhrases(ctx: QueryCtx, { cursor }: Cursor) {
  const owner = await ownerOf(ctx);
  if (!owner) return REFUSED;
  const page = await ctx.db.query("phrases").withIndex("by_owner_key", (q) => q.eq("owner", owner)).paginate({ numItems: PHRASE_PAGE, cursor });
  const rows = [];
  for (const doc of page.page) {
    const row = joinPhrase(cleanPhraseRow(doc), null);
    if (row) rows.push(row);
  }
  return { ok: true as const, rows, cursor: page.continueCursor, done: page.isDone };
}

/** Play, the preferences and the latest Clear all: one document each, or null. */
export async function pullMeta(ctx: QueryCtx) {
  const owner = await ownerOf(ctx);
  if (!owner) return REFUSED;
  const play = await oneDoc(ctx, "play", owner);
  const prefs = await oneDoc(ctx, "prefs", owner);
  return {
    ok: true as const,
    clear: cleanClear((await clearDoc(ctx, owner))?.at),
    play: play ? cleanPlay(play) : null,
    prefs: prefs ? cleanPrefs(prefs) : null,
  };
}

type PushArgs = { clear?: number; kanji?: unknown[]; phrases?: unknown[]; play?: unknown; prefs?: unknown };

/**
 * Join what the page sends into what is stored. The clear goes first, so
 * every row of the same push is joined under it. A row the rules cannot read
 * is skipped and counted, never stored.
 */
export async function push(ctx: MutationCtx, args: PushArgs) {
  const owner = await ownerOf(ctx);
  if (!owner) return { ...REFUSED, wrote: 0 };
  const kanji = args.kanji ?? [];
  const phrases = args.phrases ?? [];
  if (kanji.length > MAX_KANJI || phrases.length > MAX_PHRASES) return { ok: false as const, error: "too-many-rows", wrote: 0 };

  let wrote = 0;
  let skipped = 0;
  const stored = await clearDoc(ctx, owner);
  const clear = Math.max(cleanClear(stored?.at), cleanClear(args.clear));
  if (clear > 0 && !stored) { await ctx.db.insert("clears", { owner, at: clear }); wrote += 1; }
  else if (stored && clear > stored.at) { await ctx.db.patch(stored._id, { at: clear }); wrote += 1; }

  for (const raw of kanji) {
    const row = cleanKanjiRow(raw);
    if (!row) { skipped += 1; continue; }
    const doc = await ctx.db.query("kanji").withIndex("by_owner_char", (q) => q.eq("owner", owner).eq("char", row.char)).first();
    const before = doc ? cleanKanjiRow(doc) : null;
    wrote += await put(ctx, "kanji", owner, doc, before, joinKanji(before, row, clear));
  }
  for (const raw of phrases) {
    const row = cleanPhraseRow(raw);
    if (!row) { skipped += 1; continue; }
    const doc = await ctx.db.query("phrases").withIndex("by_owner_key", (q) => q.eq("owner", owner).eq("key", row.key)).first();
    const before = doc ? cleanPhraseRow(doc) : null;
    wrote += await put(ctx, "phrases", owner, doc, before, joinPhrase(before, row));
  }
  for (const [table, clean, join, value] of [["play", cleanPlay, joinPlay, args.play], ["prefs", cleanPrefs, joinPrefs, args.prefs]] as const) {
    if (value === undefined) continue;
    const row = clean(value as any);
    if (!row) { skipped += 1; continue; }
    const doc = await oneDoc(ctx, table, owner);
    const before = doc ? clean(doc as any) : null;
    wrote += await put(ctx, table, owner, doc, before, (join as any)(before, row));
  }
  return { ok: true as const, wrote, skipped, clear };
}
