// What data/audio/index.json and its key shards hold, worked out from the
// record of what was kept (build-audio.mjs writeIndex writes it out). Apart
// from the tool so a test can hold a record to the index without a run.

import { audioKey } from '../../js/audio.js';

/**
 * The voices that kept any clip, and every key a line answers to with the
 * voices whose clip of it is kept as a mask (bit i is voices[i]). A line no
 * voice kept is not in the index at all. A beat said as another (ぢ as じ)
 * answers with that beat's entry.
 *
 *   kept     (voiceId, id) -> whether the record says kept and the file is there
 *   voices   the roles, in the order the page offers them
 *   aliases  { beat: the beat it is said as }
 */
export function indexEntries(script, { kept, voices, aliases = {} }) {
  const used = voices.filter((v) => script.some((l) => kept(v.id, l.id)));
  const entries = new Map();
  const put = (key, entry) => { if (!entries.has(key)) entries.set(key, entry); };
  for (const line of script) {
    let mask = 0;
    used.forEach((v, i) => { if (kept(v.id, line.id)) mask |= 1 << i; });
    if (mask) for (const k of line.keys) put(k, [line.id, mask]);
  }
  for (const [from, to] of Object.entries(aliases)) {
    const target = entries.get(audioKey(to));
    if (target) put(audioKey(from), target);
  }
  return { voices: used, entries };
}
