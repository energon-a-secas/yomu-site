// The Gaps option's words: a gap's reason as nodes, the Word panel's lines
// about the gaps around a word, the reason a pointer finds over a gap, and
// the one-line hint shown the first time Gaps is turned on.
//
// The gaps themselves are drawn by render-reading.js and decided by
// gaps.js. A reason names words of the text, which are drawn as text nodes
// in lang="ja" spans; nothing here goes into an attribute. The pointer's
// reason (#gap-tip) is a convenience for a mouse: the same reason reaches a
// keyboard, a tap and a screen reader through the Word panel, whose lines are
// text nodes like the rest of it.

import { $, h, fill } from './utils.js';
import { ui } from './strings.js';
import { gapsAround } from './gaps.js';

const KEY = Object.freeze({
  particle: 'gapParticle',
  copula: 'gapCopula',
  script: 'gapScript',
  loan: 'gapLoan',
  nostart: 'gapNostart',
  guess: 'gapGuess',
  compound: 'gapCompound',
  'nostart-extra': 'gapExtraNostart',
  inside: 'gapExtraInside',
});
const WORD_KEY = Object.freeze({ form: 'gapWordForm', number: 'gapWordNumber', prefix: 'gapWordPrefix' });
const SCRIPT_KEY = Object.freeze({
  kanji: 'gapScriptKanji', hiragana: 'gapScriptHiragana', katakana: 'gapScriptKatakana', latin: 'gapScriptLatin', digit: 'gapScriptDigit',
});

/** The string a reason is said with. */
export function reasonKey(g) {
  if (!g) return null;
  if (g.why === 'name') return g.o ? 'gapNameO' : 'gapName';
  if (g.why === 'word') return WORD_KEY[g.f] || 'gapWord';
  return KEY[g.why] || null;
}

/** A gap's reason, one sentence, as nodes: the words it names in lang="ja" spans. */
export function reasonNodes(g) {
  const key = reasonKey(g);
  if (!key) return [];
  const raw = ui(key);
  const out = [];
  let at = 0;
  for (const m of raw.matchAll(/\{(\w+)\}/g)) {
    if (m.index > at) out.push(raw.slice(at, m.index));
    const name = m[1];
    if (name === 'from' || name === 'to') out.push(ui(SCRIPT_KEY[g[name]] || 'gapScriptKanji'));
    else if (name === 'o') out.push(String(g.o || ''));
    else out.push(h('span', { lang: 'ja' }, String(g[name] ?? '')));
    at = m.index + m[0].length;
  }
  if (at < raw.length) out.push(raw.slice(at));
  return out;
}

/** The two parts on each side of a compound's edge, "クレア | オナニー". */
function partPair(token, g) {
  const parts = Array.isArray(token.parts) ? token.parts : [];
  const a = parts[g.part - 1];
  const b = parts[g.part];
  return a && b ? [h('span', { lang: 'ja' }, a.surface), ' | ', h('span', { lang: 'ja' }, b.surface), ': '] : [];
}

/**
 * The Word panel's lines: what the gap before the word, each hairline inside
 * it and the gap after it say. A word at the start of a line, or beside a
 * mark of punctuation, has no gap there to find, and says so.
 */
export function gapsPart(token, gaps) {
  if (!token || !Array.isArray(gaps)) return null;
  const { before, inside, after } = gapsAround(gaps, token.i);
  const row = (label, body) => h('div', null, [h('dt', null, ui(label)), h('dd', null, body)]);
  const edge = (g) => (g ? reasonNodes(g) : ui('gapLineEdge'));
  return h('div', { class: 'word-part word-gaps' }, [
    h('h3', { class: 'word-sub' }, ui('gapsTitle')),
    h('dl', { class: 'word-gapl' }, [
      row('gapBefore', edge(before)),
      ...inside.map((g) => row('gapInside', [...partPair(token, g), ...reasonNodes(g)])),
      row('gapAfter', edge(after)),
    ]),
  ]);
}

// ── The pointer's reason ──────────────────────────────────────────────────

let tipFor = null;

/** Show a gap's reason beside it, inside the reading, where the frame or page shows it. */
export function showTip(el, g, { pinned = false } = {}) {
  const tip = $('gap-tip');
  const reading = $('reading');
  if (!tip || !reading || !el || !g) return;
  fill(tip, reasonNodes(g));
  tip.hidden = false;
  tip.toggleAttribute('data-pinned', pinned);
  tipFor = el;
  const base = reading.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  const left = Math.max(0, Math.min(r.left + r.width / 2 - base.left - w / 2, base.width - w));
  const above = r.top - base.top - tip.offsetHeight - 6;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(above >= 0 ? above : r.bottom - base.top + 6)}px`;
}

export function hideTip() {
  const tip = $('gap-tip');
  tipFor = null;
  if (!tip || tip.hidden) return;
  tip.hidden = true;
  tip.removeAttribute('data-pinned');
  fill(tip, []);
}

/** The gap the reason on screen belongs to, and whether a tap pinned it. */
export function tipState() {
  const tip = $('gap-tip');
  return { el: tipFor, pinned: !!(tip && !tip.hidden && tip.hasAttribute('data-pinned')) };
}

/** The hint under the Display row: once, the first time Gaps is turned on, and while it stays on. */
export function paintGapsHint(state) {
  const el = $('gaps-hint');
  if (!el) return;
  const text = state.prefs.gaps && state.gapsHint ? ui('gapsHint') : '';
  // A live region that stays in the page; only its text changes.
  if (el.textContent !== text) el.textContent = text;
}
