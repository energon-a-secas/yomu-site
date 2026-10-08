// A Convex deployment in memory, for the sync tests: a database with the
// indexes convex/schema.ts declares, and a client that calls the real
// handlers of convex/model/sync.ts with an identity of the test's choosing,
// the way `npx convex run --identity` does. Node runs the .ts by type
// stripping.
//
// The database holds documents to Convex's own rules, so a row that the real
// deployment would refuse fails here too: object keys must be ASCII and not
// start with "$" (a kanji or a kana pair is a value, never a key), no field
// may be undefined, and a document is at most 1 MiB.

import * as model from '../../convex/model/sync.ts';

const INDEXES = {
  kanji: { by_owner_char: ['owner', 'char'] },
  phrases: { by_owner_key: ['owner', 'key'] },
  play: { by_owner: ['owner'] },
  prefs: { by_owner: ['owner'] },
  clears: { by_owner: ['owner'] },
};

function checkValue(v, path = 'document') {
  if (v === undefined) throw new Error(`${path} is undefined, which Convex refuses`);
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error(`${path} is not finite`); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => checkValue(x, `${path}[${i}]`)); return; }
  if (typeof v !== 'object') throw new Error(`${path} is a ${typeof v}`);
  for (const [k, x] of Object.entries(v)) {
    if (!k || k.startsWith('$') || [...k].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) >= 127)) {
      throw new Error(`${path} has the key ${JSON.stringify(k)}: Convex keys are non-control ASCII`);
    }
    checkValue(x, `${path}.${k}`);
  }
}

export function fakeDb() {
  const tables = new Map(Object.keys(INDEXES).map((t) => [t, new Map()]));
  let nextId = 1;
  let writes = 0;
  const copy = (x) => (x === null || x === undefined ? null : structuredClone(x));
  const where = (id) => {
    for (const [name, rows] of tables) if (rows.has(id)) return { name, rows };
    throw new Error(`no document ${id}`);
  };
  const store = (table, id, doc) => {
    const { _id, _creationTime, ...fields } = doc;
    checkValue(fields);
    if (JSON.stringify(fields).length > 1024 * 1024) throw new Error('a document over 1 MiB');
    tables.get(table).set(id, { ...structuredClone(fields), _id: id, _creationTime: _creationTime ?? nextId });
    writes += 1;
  };

  const db = {
    query(table) {
      return {
        withIndex(index, build) {
          const fields = INDEXES[table][index];
          if (!fields) throw new Error(`no index ${index} on ${table}`);
          const eqs = [];
          const q = { eq(field, value) { if (field !== fields[eqs.length]) throw new Error(`${field} out of index order`); eqs.push([field, value]); return q; } };
          if (build) build(q);
          const rows = () => [...tables.get(table).values()]
            .filter((d) => eqs.every(([f, v]) => d[f] === v))
            .sort((a, b) => {
              for (const f of fields) { if (a[f] < b[f]) return -1; if (a[f] > b[f]) return 1; }
              return a._creationTime - b._creationTime;
            });
          return {
            first: async () => copy(rows()[0]),
            collect: async () => rows().map(copy),
            paginate: async ({ numItems, cursor }) => {
              const all = rows();
              const start = cursor ? Number(cursor) : 0;
              const page = all.slice(start, start + numItems);
              return { page: page.map(copy), isDone: start + page.length >= all.length, continueCursor: String(start + page.length) };
            },
          };
        },
      };
    },
    async insert(table, doc) { const id = `${table}:${nextId++}`; store(table, id, doc); return id; },
    async replace(id, doc) { const { name, rows } = where(id); store(name, id, { ...doc, _creationTime: rows.get(id)._creationTime }); },
    async patch(id, fields) { const { name, rows } = where(id); store(name, id, { ...rows.get(id), ...fields }); },
    async delete(id) { where(id).rows.delete(id); writes += 1; },
    async get(id) { for (const rows of tables.values()) if (rows.has(id)) return copy(rows.get(id)); return null; },
  };
  return {
    db,
    tables,
    get writes() { return writes; },
    /** Every document of one owner, without system fields, for comparing. */
    rowsOf(owner) {
      const out = {};
      for (const [name, rows] of tables) out[name] = [...rows.values()].filter((d) => d.owner === owner).map(({ _id, _creationTime, ...d }) => d);
      return out;
    },
  };
}

const HANDLERS = {
  'sync:whoami': model.whoami,
  'sync:pullKanji': model.pullKanji,
  'sync:pullPhrases': model.pullPhrases,
  'sync:pullMeta': model.pullMeta,
  'sync:push': model.push,
};

/**
 * A ConvexHttpClient stand-in signed in as `subject` (null: no identity).
 * `fail(name, args)` returning true makes that call throw as a lost
 * connection does; `calls` lists every call made.
 */
export function fakeClient(server, subject, { fail = () => false } = {}) {
  const calls = [];
  const ctx = () => ({
    db: server.db,
    auth: { getUserIdentity: async () => (subject ? { subject, issuer: 'https://clerk.neorgon.com', tokenIdentifier: `https://clerk.neorgon.com|${subject}` } : null) },
  });
  const call = async (kind, name, args) => {
    calls.push({ kind, name, args });
    if (fail(name, args)) throw new TypeError('Failed to fetch');
    if (!HANDLERS[name]) throw new Error(`no function ${name}`);
    checkValue(args, `${name} args`);
    // What crosses the wire is JSON both ways.
    return JSON.parse(JSON.stringify(await HANDLERS[name](ctx(), structuredClone(args))));
  };
  return {
    calls,
    query: (name, args) => call('query', name, args),
    mutation: (name, args) => call('mutation', name, args),
    setAuth() {},
    clearAuth() {},
  };
}

/** A Persist kit store in memory: what openKanji, openHistory, openPlay and openBook take as `store`. */
export function memoryStore() {
  let raw = null;
  return {
    load: (fallback = null) => (raw === null ? fallback : JSON.parse(raw)),
    save: (data) => { raw = JSON.stringify(data); return true; },
    clear: () => { raw = null; return true; },
    get raw() { return raw; },
  };
}
