// The listening page: every take that failed its check and waits to be heard,
// with what was wanted, what was sent and what the transcriber wrote, and a
// choice of the take that says it right. Its export is tools/audio-heard.json
// (tools/lib/audio-heard.mjs). Written by `node tools/build-audio.mjs --listen`
// to .forge/audio-listen.html, which git ignores, beside the takes it plays;
// it is opened from disk and sends nothing anywhere.

import fs from 'node:fs';
import path from 'node:path';
import { HEARD_FORMAT, serializeHeard, madeKey, rejectName, takeHash } from './audio-heard.mjs';

// The beats first: the triage of 2026-11-02 found most of what fails there is
// the transcriber writing a right sound another way (ゆ "You", み "Me").
const KIND_ORDER = ['kana', 'sound', 'phrase', 'note', 'word', 'common', 'reading', 'kanji'];

const relUrl = (from, file) => path.relative(from, file).split(path.sep).map(encodeURIComponent).join('/');

/**
 * One row per record that waits to be heard: it failed its check (or shipped
 * from an earlier hearing, so it can be changed), it is still made under the
 * current signature, and at least one take of its last run is on disk.
 *
 *   script      the current script (kinds and voices already chosen)
 *   made        tools/audio-made.json's records
 *   voices      the roles to list, in the page's order
 *   sigOf       (voiceId, line) -> the signature a clip of it is made under now
 *   rejectsDir  where the takes are
 *   pageDir     where the page is written, for the relative links
 *   keptClip    (voiceId, id) -> the path of a kept clip, or null
 */
export function listenRows({ script, made, voices, sigOf, rejectsDir, pageDir, keptClip }) {
  const rank = (kind) => { const i = KIND_ORDER.indexOf(kind); return i < 0 ? KIND_ORDER.length : i; };
  const lines = script.map((line, n) => ({ line, n })).sort((a, b) => rank(a.line.kind) - rank(b.line.kind) || a.n - b.n);
  const rows = [];
  for (const { line } of lines) {
    for (const v of voices) {
      if (line.voices && !line.voices.includes(v.id)) continue;
      const rec = made[madeKey(v.id, line.id)];
      if (!rec || (rec.ok && !rec.heardBy) || rec.sig !== sigOf(v.id, line)) continue;
      const takes = [];
      (Array.isArray(rec.tries) ? rec.tries : []).forEach((t, take) => {
        const file = path.join(rejectsDir, rejectName(v.id, line.id, take));
        if (!fs.existsSync(file)) return;
        takes.push({ take, src: relUrl(pageDir, file), sha: takeHash(fs.readFileSync(file)), sent: t.sent || '', heard: t.transcript || t.why || '', got: t.got || '' });
      });
      if (!takes.length) continue;
      const first = voices[0] && voices[0].id !== v.id ? keptClip(voices[0].id, line.id) : null;
      rows.push({
        voice: v.id,
        voiceName: `${v.label.en} (${v.name})`,
        key: line.key,
        ja: line.ja,
        kana: line.kana && line.kana !== line.ja ? line.kana : '',
        kind: line.kind,
        want: rec.want || '',
        takes,
        compare: first ? { voice: voices[0].label.en, src: relUrl(pageDir, first) } : null,
      });
    }
  }
  return rows;
}

const PAGE_CSS = `
:root { --bg: #f7f6f2; --card: #ffffff; --ink: #1d1d1f; --muted: #5d5d66; --line: #dcdad3; --accent: #0b6e5f; --accent-ink: #ffffff; --mark: #e3f3ef; }
@media (prefers-color-scheme: dark) { :root { --bg: #15161a; --card: #1f2026; --ink: #ececf1; --muted: #a3a3ad; --line: #34353d; --accent: #4fc3ae; --accent-ink: #0d1412; --mark: #1d3330; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 1.4rem; margin: 0 0 8px; }
p { margin: 0 0 12px; }
.muted { color: var(--muted); }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
.bar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; background: var(--bg); border-bottom: 1px solid var(--line); padding: 12px 0; margin-bottom: 16px; }
.bar label { display: inline-flex; gap: 6px; align-items: center; }
select, input[type=text] { font: inherit; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; min-height: 36px; }
button { font: inherit; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); border-radius: 6px; padding: 6px 14px; min-height: 36px; cursor: pointer; }
button.quiet { background: transparent; color: var(--accent); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
.card.is-marked { border-color: var(--accent); background: var(--mark); }
.card h2 { font-size: 1.15rem; font-weight: 600; margin: 0 0 4px; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.tag { font-size: 0.8rem; font-weight: 500; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 0 8px; }
.takes { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.take { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; align-items: center; }
.take audio, .compare audio { width: 100%; max-width: 340px; height: 36px; }
.take .why { grid-column: 2; font-size: 0.9rem; color: var(--muted); overflow-wrap: anywhere; }
.choice { display: inline-flex; gap: 6px; align-items: center; min-height: 36px; }
.compare { margin-top: 8px; font-size: 0.9rem; color: var(--muted); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
textarea { width: 100%; min-height: 160px; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
.export { margin-top: 24px; }
.export .row { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.empty { padding: 24px; text-align: center; color: var(--muted); }
@media (max-width: 600px) { .bar { position: static; } }
`;

// Runs in the page. `serializeHeard` and HEARD_FORMAT are injected from
// audio-heard.mjs, so the export is byte for byte the file the tool reads.
function pageMain() {
  const data = JSON.parse(document.getElementById('listen-data').textContent);
  const STORE = 'yomu-listen:1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (_) { saved = {}; }
  const marks = new Map();
  for (const e of data.heard) marks.set(`${e.voice}/${e.key}`, { take: e.take, sha: e.sha, by: e.by, date: e.date });
  for (const [k, m] of Object.entries(saved.marks || {})) {
    if (m === null) marks.delete(k); else if (m && Number.isInteger(m.take) && typeof m.sha === 'string') marks.set(k, m);
  }
  const unmarked = new Set(Object.entries(saved.marks || {}).filter(([, m]) => m === null).map(([k]) => k));
  const $ = (id) => document.getElementById(id);
  const h = (tag, attrs, kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : String(v));
    for (const kid of [].concat(kids || [])) if (kid !== null && kid !== undefined) el.append(kid);
    return el;
  };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const byField = $('by');
  byField.value = saved.by || '';
  function save() {
    const out = {};
    for (const k of unmarked) out[k] = null;
    for (const [k, m] of marks) out[k] = m;
    try { localStorage.setItem(STORE, JSON.stringify({ by: byField.value, marks: out })); } catch (_) { /* a private window keeps nothing; the export still works */ }
  }
  function entries() {
    const by = byField.value.trim();
    return [...marks].map(([k, m]) => {
      const slash = k.indexOf('/');
      return { voice: k.slice(0, slash), key: k.slice(slash + 1), take: m.take, sha: m.sha, by: m.by || by, date: m.date || today() };
    });
  }
  function exportText() {
    const list = entries();
    const nameless = list.filter((e) => !e.by).length;
    const takes = (n) => `${n} ${n === 1 ? 'take' : 'takes'}`;
    $('export-note').textContent = nameless ? `Put your name in "Heard by" first: ${takes(nameless)} marked right with no name.` : `${takes(list.length)} marked right.`;
    $('export').value = nameless ? '' : serializeHeard(list);
  }
  function counts() {
    const shown = document.querySelectorAll('.card:not([hidden])').length;
    $('count').textContent = `${shown} of ${data.rows.length} lines shown, ${marks.size} marked right`;
  }
  function filter() {
    const v = $('f-voice').value;
    const k = $('f-kind').value;
    const s = $('f-show').value;
    for (const card of document.querySelectorAll('.card')) {
      const marked = marks.has(card.dataset.mark);
      card.hidden = (v && card.dataset.voice !== v) || (k && card.dataset.kind !== k) || (s === 'marked' && !marked) || (s === 'open' && marked);
    }
    counts();
  }
  const voices = [...new Set(data.rows.map((r) => r.voice))];
  const kinds = [...new Set(data.rows.map((r) => r.kind))];
  for (const v of voices) $('f-voice').append(h('option', { value: v }, data.rows.find((r) => r.voice === v).voiceName));
  for (const k of kinds) $('f-kind').append(h('option', { value: k }, k));
  const list = $('rows');
  if (!data.rows.length) list.append(h('p', { class: 'empty' }, 'No take is waiting to be heard.'));
  data.rows.forEach((r, i) => {
    const mk = `${r.voice}/${r.key}`;
    const name = `pick-${i}`;
    const card = h('article', { class: 'card', 'data-voice': r.voice, 'data-kind': r.kind, 'data-mark': mk });
    const pick = (take) => {
      if (take === null) { marks.delete(mk); unmarked.add(mk); } else {
        const t = r.takes.find((x) => x.take === take);
        marks.set(mk, { take, sha: t.sha, by: byField.value.trim(), date: today() });
        unmarked.delete(mk);
      }
      card.classList.toggle('is-marked', marks.has(mk));
      save(); exportText(); counts();
    };
    const current = marks.get(mk);
    const takes = r.takes.map((t) => {
      const radio = h('input', { type: 'radio', name, value: String(t.take), checked: !!(current && current.take === t.take && current.sha === t.sha) });
      radio.addEventListener('change', () => pick(t.take));
      return h('li', { class: 'take' }, [
        h('label', { class: 'choice' }, [radio, `Take ${t.take + 1} is right`]),
        h('audio', { controls: true, preload: 'none', src: t.src }),
        h('span', { class: 'why' }, ['Sent ', h('span', { lang: 'ja' }, t.sent), ', heard ', h('span', { lang: 'ja' }, t.heard || '(nothing)'), t.got ? ` (read as ${t.got})` : '']),
      ]);
    });
    const stale = current && !r.takes.some((t) => t.take === current.take && t.sha === current.sha);
    const none = h('input', { type: 'radio', name, value: '', checked: !current });
    none.addEventListener('change', () => pick(null));
    card.append(...[
      h('h2', null, [h('span', { lang: 'ja' }, r.ja), r.kana ? h('span', { lang: 'ja', class: 'muted' }, r.kana) : null, h('span', { class: 'tag' }, r.voiceName), h('span', { class: 'tag' }, r.kind)]),
      h('p', { class: 'muted' }, ['Wanted ', h('code', null, r.want || r.key), ...(r.key !== r.ja ? ['. Key ', h('code', { lang: 'ja' }, r.key)] : [])]),
      h('ul', { class: 'takes', role: 'list' }, takes),
      stale ? h('p', { class: 'muted' }, `Take ${current.take + 1} was marked right, but that file has changed since, so it will not ship. Pick again.`) : null,
      h('label', { class: 'choice' }, [none, 'None of them']),
      r.compare ? h('p', { class: 'compare' }, [`${r.compare.voice}'s kept clip, for comparison:`, h('audio', { controls: true, preload: 'none', src: r.compare.src })]) : null,
    ].filter(Boolean));
    if (current) card.classList.add('is-marked');
    list.append(card);
  });
  for (const id of ['f-voice', 'f-kind', 'f-show']) $(id).addEventListener('change', filter);
  byField.addEventListener('input', () => { save(); exportText(); });
  $('copy').addEventListener('click', async () => {
    const text = $('export').value;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch (_) { $('export').select(); document.execCommand('copy'); }
    $('copy').textContent = 'Copied';
    setTimeout(() => { $('copy').textContent = 'Copy'; }, 1500);
  });
  $('download').addEventListener('click', () => {
    const text = $('export').value;
    if (!text) return;
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: 'audio-heard.json' });
    document.body.append(a); a.click(); a.remove();
  });
  exportText();
  filter();
}

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// JSON inside a script element: a "<" could close it, so every one is escaped.
const inScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** The page for these rows and the current heard-by entries. */
export function listenPage(rows, heard, { generated }) {
  const takes = rows.reduce((n, r) => n + r.takes.length, 0);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yomu takes to hear</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
<h1>Takes to hear</h1>
<p>Each take below failed the transcript check, so it is not on the site. The check can only turn a right take away, never let a wrong one through, and most of these are the transcriber writing a right sound another way. Play a take; if it says what is wanted, mark it right. One take per line ships.</p>
<p class="muted">When you are done, copy the export into <code>tools/audio-heard.json</code> and run <code>node tools/build-audio.mjs --heard</code>, which ships the marked takes without calling ElevenLabs. Your marks stay in this browser until then. ${escHtml(String(rows.length))} lines, ${escHtml(String(takes))} takes, written ${escHtml(generated)}.</p>
<div class="bar">
<label>Heard by <input id="by" type="text" autocomplete="name" placeholder="your name" size="14"></label>
<label>Voice <select id="f-voice"><option value="">All</option></select></label>
<label>Kind <select id="f-kind"><option value="">All</option></select></label>
<label>Show <select id="f-show"><option value="">All</option><option value="open">Not marked</option><option value="marked">Marked right</option></select></label>
<span id="count" class="muted" aria-live="polite"></span>
</div>
<div id="rows"></div>
<section class="export" aria-labelledby="export-title">
<h2 id="export-title">Export</h2>
<p id="export-note" class="muted" aria-live="polite"></p>
<textarea id="export" readonly aria-labelledby="export-title"></textarea>
<div class="row"><button id="copy" type="button">Copy</button><button id="download" type="button" class="quiet">Download audio-heard.json</button></div>
</section>
</main>
<script type="application/json" id="listen-data">${inScript({ rows, heard })}</script>
<script>
const HEARD_FORMAT = ${JSON.stringify(HEARD_FORMAT)};
${serializeHeard.toString()}
(${pageMain.toString()})();
</script>
</body>
</html>
`;
}
