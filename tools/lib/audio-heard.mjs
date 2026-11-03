// The heard-by list (tools/audio-heard.json): a take that failed its
// transcript check, which a person listened to and called right, ships.
//
// The check can only fail a right clip, never pass a wrong one, and most of
// what it fails is the transcriber writing a right sound another way (ゆ as
// "You", み as "Me", a loanword as English). Such a take sits in
// .forge/audio-rejects/ until a person hears it. They mark it on the listening
// page (`node tools/build-audio.mjs --listen`, tools/lib/audio-listen.mjs),
// paste the export into tools/audio-heard.json, and the next run of
// build-audio.mjs ships it, with no call to ElevenLabs (docs/AUDIO.md).
//
// An entry names the take by its voice, its line's key, its number in the
// record's last run (the file <voice>-<id>-<take>.mp3) and a hash of its bytes,
// so what ships is the take that was heard: a later run that remade the line
// changes the file, and the entry stops matching. A take ships only while the
// list names it; an entry taken out of the list takes its clip out again.
//
// tools/audio-heard.json, format yomu-audio-heard/1:
//   heard  [{ voice, key, take, sha, by, date }]
//          voice  a role of tools/lib/audio-voices.mjs (clear, calm, ...)
//          key    the line's key, as audio-made.json records it (雨|あめ, ほ)
//          take   0, 1 or 2: the attempt in the record's last run
//          sha    the first 16 hex digits of the take's SHA-256
//          by     who heard it
//          date   when, YYYY-MM-DD

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const HEARD_FORMAT = 'yomu-audio-heard/1';
const SHA = /^[0-9a-f]{16}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A clip's record in tools/audio-made.json. */
export const madeKey = (voice, id) => `${voice}/${id}`;

/** A rejected take's file in .forge/audio-rejects/, as build-audio.mjs writes it. */
export const rejectName = (voice, id, take) => `${voice}-${id}-${take}.mp3`;

/** The hash an entry names its take by. */
export function takeHash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

/**
 * The entries of a heard-by document. Throws on anything malformed, since the
 * file is written by hand from the listening page's export and a run that
 * ships clips should not guess what was meant.
 */
export function parseHeard(doc, { voices, attempts }) {
  if (!doc || doc.format !== HEARD_FORMAT || !Array.isArray(doc.heard)) {
    throw new Error(`tools/audio-heard.json: expected format ${HEARD_FORMAT} with a heard list`);
  }
  const seen = new Set();
  return doc.heard.map((e, i) => {
    const where = `tools/audio-heard.json heard[${i}]`;
    if (!e || typeof e !== 'object') throw new Error(`${where}: not an object`);
    if (!voices.includes(e.voice)) throw new Error(`${where}: unknown voice ${JSON.stringify(e.voice)}`);
    if (typeof e.key !== 'string' || !e.key) throw new Error(`${where}: needs the line's key`);
    if (!Number.isInteger(e.take) || e.take < 0 || e.take >= attempts) throw new Error(`${where}: take must be 0 to ${attempts - 1}`);
    if (typeof e.sha !== 'string' || !SHA.test(e.sha)) throw new Error(`${where}: sha must be 16 hex digits`);
    if (typeof e.by !== 'string' || !e.by.trim()) throw new Error(`${where}: needs who heard it`);
    if (typeof e.date !== 'string' || !DATE.test(e.date)) throw new Error(`${where}: date must be YYYY-MM-DD`);
    const k = `${e.voice}/${e.key}`;
    if (seen.has(k)) throw new Error(`${where}: ${k} is listed twice, and one take ships`);
    seen.add(k);
    return { voice: e.voice, key: e.key, take: e.take, sha: e.sha, by: e.by.trim(), date: e.date };
  });
}

/** The heard-by document for a list of entries, one entry a line, so a change diffs as that entry. */
export function serializeHeard(entries) {
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const rows = [...entries].sort((a, b) => order(a.voice, b.voice) || order(a.key, b.key))
    .map((e) => `    ${JSON.stringify({ voice: e.voice, key: e.key, take: e.take, sha: e.sha, by: e.by, date: e.date })}`);
  return `{\n  "format": ${JSON.stringify(HEARD_FORMAT)},\n  "heard": [${rows.length ? `\n${rows.join(',\n')}\n  ` : ''}]\n}\n`;
}

/**
 * What the list changes, read only: the takes to ship, the shipped ones to
 * take out (a record whose heard take no entry names any more), the entries
 * already in place, and the entries that cannot ship, each with why.
 *
 *   lines       Map of key -> the current script's line
 *   made        tools/audio-made.json's records
 *   sigOf       (voiceId, line) -> the signature a clip of it is made under now
 *   rejectsDir  where the takes are
 *   clipPathOf  (voiceId, id) -> the clip's path under data/audio/
 */
export function heardPlan(entries, { lines, made, sigOf, rejectsDir, clipPathOf }) {
  const named = new Map(entries.map((e) => [`${e.voice}/${e.key}`, e]));
  const unship = [];
  for (const [mk, rec] of Object.entries(made)) {
    if (!rec || !rec.heardBy) continue;
    const e = named.get(`${mk.split('/')[0]}/${rec.key}`);
    if (!e || e.sha !== rec.heardBy.sha) unship.push(mk);
  }
  const gone = new Set(unship);
  const ship = [];
  const skip = [];
  let already = 0;
  for (const e of entries) {
    const why = (text) => skip.push({ entry: e, why: text });
    const line = lines.get(e.key);
    if (!line) { why('its line is not in the script any more'); continue; }
    if (line.voices && !line.voices.includes(e.voice)) { why(`${e.voice} does not record this line`); continue; }
    const mk = madeKey(e.voice, line.id);
    const rec = made[mk];
    if (!rec) { why('it was never made'); continue; }
    if (rec.ok && !rec.heardBy) { why('a later take passed its check, so nothing waits to ship'); continue; }
    if (rec.ok && !gone.has(mk) && fs.existsSync(clipPathOf(e.voice, line.id))) { already += 1; continue; }
    if (rec.sig !== sigOf(e.voice, line)) { why('what is sent for it changed since the take was made'); continue; }
    const tries = Array.isArray(rec.tries) ? rec.tries : [];
    if (e.take >= tries.length) { why(`the record's last run made no take ${e.take}`); continue; }
    const src = path.join(rejectsDir, rejectName(e.voice, line.id, e.take));
    if (!fs.existsSync(src)) { why(`${path.basename(src)} is not in ${rejectsDir}`); continue; }
    const bytes = fs.readFileSync(src);
    if (takeHash(bytes) !== e.sha) { why(`${path.basename(src)} is not the take that was heard`); continue; }
    ship.push({ entry: e, mk, id: line.id, bytes, heard: tries[e.take] });
  }
  return { ship, unship, skip, already };
}

/**
 * Carry out a heardPlan: take the dropped clips out, then copy each heard take
 * to its clip path and mark its record kept. The record's own fields stay
 * those of its last take; `heardBy` says which take shipped and who heard it.
 */
export function applyHeard(plan, { made, clipPathOf }) {
  for (const mk of plan.unship) {
    const rec = made[mk];
    const [voice, id] = mk.split('/');
    const clip = clipPathOf(voice, id);
    if (fs.existsSync(clip)) fs.unlinkSync(clip);
    delete rec.heardBy;
    rec.ok = false;
  }
  for (const s of plan.ship) {
    const { voice, take, sha, by, date } = s.entry;
    const clip = clipPathOf(voice, s.id);
    fs.mkdirSync(path.dirname(clip), { recursive: true });
    fs.writeFileSync(clip, s.bytes);
    const rec = made[s.mk];
    rec.ok = true;
    delete rec.pending;
    rec.heardBy = { by, date, take, sha, sent: s.heard.sent, transcript: s.heard.transcript, bytes: s.bytes.length };
  }
}
