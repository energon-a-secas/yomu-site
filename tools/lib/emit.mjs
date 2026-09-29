/**
 * Serializing and writing a data file, measured against the size cap.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { walkStrings, EM_DASH } from './licence.mjs';

/**
 * The one size cap, 140 KB read as 140,000 bytes. That is the stricter of the
 * two readings of "KB", so a file passes whichever one a reader holds it to
 * (tests/library.test.mjs counts in thousands). tools/check-data.mjs reads
 * this same constant.
 */
export const MAX_BYTES = 140 * 1000;

/** Absolute path of the yomu-site root, from tools/lib/. */
export const SITE = path.resolve(new URL('../..', import.meta.url).pathname);

/**
 * Readable JSON that still diffs well: the header fields one per line, and a
 * map of records one record per line. A committed shard is reviewed as a diff,
 * so one 140 KB line is not acceptable, and two-space pretty print would spend
 * a third of the size cap on indentation.
 *
 * `rows` names the one field whose members go one per line (`entries`).
 */
export function serialize(doc, rows = 'entries') {
  const lines = ['{'];
  const keys = Object.keys(doc);
  keys.forEach((key, i) => {
    const tail = i === keys.length - 1 ? '' : ',';
    const v = doc[key];
    if (key === rows && v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = Object.keys(v);
      lines.push(`${JSON.stringify(key)}: {`);
      inner.forEach((k, j) => {
        lines.push(`${JSON.stringify(k)}: ${JSON.stringify(v[k])}${j === inner.length - 1 ? '' : ','}`);
      });
      lines.push(`}${tail}`);
      return;
    }
    if (key === rows && Array.isArray(v)) {
      lines.push(`${JSON.stringify(key)}: [`);
      v.forEach((el, j) => lines.push(JSON.stringify(el) + (j === v.length - 1 ? '' : ',')));
      lines.push(`]${tail}`);
      return;
    }
    lines.push(`${JSON.stringify(key)}: ${JSON.stringify(v)}${tail}`);
  });
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export function fmtBytes(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)} KB` : `${n} B`;
}

/**
 * Write one data file. Refuses, rather than emits, a file that breaks a rule
 * the checker would fail it on later: a banned dash anywhere, or a size over
 * the cap. Failing here names the builder that made it; failing in the
 * checker only names the file.
 */
export function writeJson(absPath, doc, rows = 'entries') {
  for (const [at, s] of walkStrings(doc)) {
    if (s.includes(EM_DASH)) {
      process.stderr.write(`REFUSED ${absPath}: em dash at ${at}: ${s.slice(0, 80)}\n`);
      process.exit(1);
    }
  }
  const text = serialize(doc, rows);
  JSON.parse(text); // never emit something the browser cannot parse
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_BYTES) {
    process.stderr.write(`REFUSED ${absPath}: ${fmtBytes(bytes)} is over the ${fmtBytes(MAX_BYTES)} cap\n`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, text);
  return bytes;
}

/** Remove files in `dir` matching `pattern` that this run did not write. */
export function pruneStale(dir, pattern, written) {
  if (!fs.existsSync(dir)) return [];
  const keep = new Set(written.map((p) => path.basename(p)));
  const gone = [];
  for (const name of fs.readdirSync(dir)) {
    if (pattern.test(name) && !keep.has(name)) {
      fs.unlinkSync(path.join(dir, name));
      gone.push(name);
    }
  }
  return gone;
}
