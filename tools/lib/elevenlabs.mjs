// The ElevenLabs API, for tools/build-audio.mjs only. The page never calls it:
// the clips are made here, once, and served as files.
//
// The key is read from the environment or from the repo's .env (gitignored),
// never logged, and never written anywhere else.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.elevenlabs.io';
const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));
const NAMES = ['ELEVENLABS_API_TOKEN', 'ELEVENLABS_API_KEY'];

/** The key, or null. */
export function apiKey(env = process.env, file = ENV_FILE) {
  for (const name of NAMES) if (env[name]) return env[name].trim();
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return null; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && NAMES.includes(m[1])) return m[2].replace(/^(['"])(.*)\1$/, '$2').trim() || null;
  }
  return null;
}

export class ApiError extends Error {
  constructor(status, path, detail) {
    super(`ElevenLabs ${status} on ${path}: ${detail}`);
    this.status = status;
  }
}

/**
 * One request. JSON bodies are sent as JSON, FormData as multipart. Returns
 * parsed JSON, or { audio: Buffer, headers } when the answer is audio.
 */
export async function call(key, path, { method = 'GET', body = null, query = null } = {}) {
  const url = new URL(path, API);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const headers = { 'xi-api-key': key };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(url, { method, headers, body: payload });
  const type = res.headers.get('content-type') || '';
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, url.pathname, text.slice(0, 400));
  }
  if (type.startsWith('audio/') || type === 'application/octet-stream') {
    return { audio: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  }
  return res.json();
}
