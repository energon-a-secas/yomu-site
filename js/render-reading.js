// The reading: every token an inline unit, furigana over its kanji, the
// surface, and the romaji line under it.
//
// What is drawn here is decided by the token and by nothing else; the three
// display toggles are attributes on the reading's root and CSS does the rest,
// so switching Furigana or Romaji never rebuilds a node and never moves focus.
//
// Special sounds: a token's sounds[].at index into its READING, not its
// surface (docs/ANALYZER.md), because a sound is a property of what is said.
// So the reading is walked alongside the furigana: a ruby part owns as many
// reading characters as its ruby, a kana part owns as many as it has. A mark
// inside a ruby lands on the ruby text, and on the kanji under it for when the
// furigana is off. When the walk and the reading disagree in length, the mark
// goes on the whole token instead of on a guessed character.
//
// Kanji are found again by their position in the text's kanji list (data-kid),
// never by the character itself: no piece of the learner's text is written
// into an attribute.
//
// Gaps (gaps.js): every edge between two words gets an empty span.gap
// between their buttons, and every edge between two parts of a katakana
// compound a span.gap--part inside its surface. Both are always built, and
// drawn only while #reading[data-gaps="on"], so the toggle repaints nothing.
// They hold no text, so copying the reading copies nothing they add, and
// they are found again by data-gap, their index in the analysis' gap list.

import { h } from './utils.js';
import { isKanji } from './kana.js';

const PLAIN = new Set(['punct', 'space', 'newline', 'latin']);
const LIGHT = new Set(['particle', 'copula']);

/** Can a learner select this token. */
export function selectable(token) {
  if (!token || PLAIN.has(token.kind)) return false;
  if (token.kind === 'number') return !!token.reading;
  return true;
}

/** The ids of a token's grammar notes, whether given as strings or { id }. */
export function grammarIds(token) {
  return (token.grammar || []).map((g) => (typeof g === 'string' ? g : g && g.id)).filter(Boolean);
}

export function soundTypes(token) {
  return [...new Set((token.sounds || []).map((s) => s && s.type).filter(Boolean))];
}

/**
 * Where a conjugated ending begins, in code points of the surface, or -1.
 * The ending is what the surface has beyond what it shares with the
 * dictionary form: 食べました against 食べる gives ました. It is drawn lighter,
 * like a particle, so the eye lands on the part that carries the meaning.
 */
export function endingStart(token) {
  if (token.kind !== 'inflected' || !token.base) return -1;
  const s = [...token.surface];
  const b = [...token.base];
  let i = 0;
  while (i < s.length && i < b.length && s[i] === b[i]) i++;
  return i > 0 && i < s.length ? i : -1;
}

/**
 * The sound types on each reading character, space separated, or null. Spans
 * overlap (the bar in コーヒー is both a long vowel and a bar), so a character
 * carries every type that covers it and [data-snd~="bar"] still finds it.
 */
function soundMarks(token) {
  const reading = [...(token.reading || '')];
  const marks = reading.map(() => []);
  for (const s of token.sounds || []) {
    if (!s || !s.type) continue;
    // A grouped sound (the two marks, whispered vowels) lists every place it
    // sits in `spans`; marking only `at` lit the first voiced kana of a word.
    for (const span of Array.isArray(s.spans) ? s.spans : [s.at]) {
      const [a, b] = Array.isArray(span) ? span : [];
      if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
      for (let x = Math.max(0, a); x < b && x < marks.length; x++) if (!marks[x].includes(s.type)) marks[x].push(s.type);
    }
  }
  return { reading, marks: marks.map((m) => (m.length ? m.join(' ') : null)) };
}

function parts(token) {
  const f = Array.isArray(token.furigana) && token.furigana.length ? token.furigana : [{ text: token.surface }];
  return f.filter((p) => p && typeof p.text === 'string');
}

/** Consecutive characters that share a mark and a weight become one span. */
function runs(chars, typeOf, lightFrom, offset) {
  const out = [];
  let cur = null;
  chars.forEach((ch, j) => {
    const type = typeOf(j);
    const light = lightFrom >= 0 && offset + j >= lightFrom;
    if (!cur || cur.type !== type || cur.light !== light) {
      cur = { type, light, text: '' };
      out.push(cur);
    }
    cur.text += ch;
  });
  return out.map((r) => {
    const cls = [r.type ? 'snd' : '', r.light ? 'tok-ending' : ''].filter(Boolean).join(' ');
    return cls ? h('span', { class: cls, 'data-snd': r.type || null }, r.text) : r.text;
  });
}

function kanjiSpan(ch, kidOf) {
  const kid = kidOf ? kidOf(ch) : -1;
  return h('span', { class: 'kj', 'data-kid': kid >= 0 ? kid : null }, ch);
}

/** An edge between two words, or two parts of a compound: an empty mark, its index in data-gap. */
export function gapNode(ix, { part = false, guess = false } = {}) {
  const cls = ['gap', part ? 'gap--part' : '', guess ? 'gap--guess' : ''].filter(Boolean).join(' ');
  return h('span', { class: cls, 'data-gap': ix, 'aria-hidden': 'true' });
}

/**
 * The surface with its ruby. With marks off (the Word panel's large copy) the
 * sounds are not drawn; the panel lists them in words instead. `cuts` are
 * the edges between a compound's parts, `{ at, ix }` with `at` in code
 * points of the surface: a hairline is drawn at each.
 */
export function surfaceNode(token, { kidOf = null, marks = true, cuts = [] } = {}) {
  const ps = parts(token);
  const { reading, marks: typeAt } = marks ? soundMarks(token) : { reading: [], marks: [] };
  const walked = ps.reduce((n, p) => n + [...(p.ruby || p.text)].length, 0);
  const aligned = marks && walked === reading.length;
  const lightFrom = endingStart(token);
  const wrap = h('span', { class: 'tok-surface' });
  let r = 0;
  let s = 0;
  for (const p of ps) {
    const chars = [...p.text];
    if (p.ruby) {
      const rubyChars = [...p.ruby];
      const at = r;
      const types = aligned ? [...new Set(rubyChars.map((_, j) => typeAt[at + j]).filter(Boolean).join(' ').split(' '))].filter(Boolean) : [];
      const base = chars.map((ch) => (isKanji(ch) ? kanjiSpan(ch, kidOf) : ch));
      const rt = h('rt', null, runs(rubyChars, (j) => (aligned ? typeAt[at + j] : null), -1, 0));
      wrap.appendChild(h('ruby', {
        class: types.length ? 'snd-base' : null,
        'data-snd': types.length ? types.join(' ') : null,
      }, [...base, rt]));
      r += rubyChars.length;
    } else {
      // Split at the compound's edges, so a hairline can stand between two parts.
      let from = 0;
      const here = cuts.filter((c) => c.at > s && c.at < s + chars.length);
      for (const piece of [...here, null]) {
        const to = piece ? piece.at - s : chars.length;
        const at = r + from;
        const nodes = runs(chars.slice(from, to), (j) => (aligned ? typeAt[at + j] : null), lightFrom, s + from);
        for (const n of nodes) wrap.appendChild(typeof n === 'string' ? document.createTextNode(n) : n);
        if (piece) wrap.appendChild(gapNode(piece.ix, { part: true, guess: piece.guess }));
        from = to;
      }
      r += chars.length;
    }
    s += chars.length;
  }
  return wrap;
}

/**
 * One token. A selectable one is a button; the rest are text. The button has
 * no aria-label: its name is its own content, the surface and the ruby over
 * it, so the learner's text stays in text nodes and out of attributes, and the
 * romaji lines are aria-hidden because a screen reader says the kana better.
 */
export function tokenNode(token, { kidOf = null, cuts = [] } = {}) {
  if (!selectable(token)) {
    return h('span', { class: `tok-plain tok-plain--${token.kind || 'other'}` }, token.surface);
  }
  const types = soundTypes(token);
  const walked = parts(token).reduce((n, p) => n + [...(p.ruby || p.text)].length, 0);
  const whole = types.length && walked !== [...(token.reading || '')].length;
  const cls = ['tok', `tok--${token.kind}`];
  if (LIGHT.has(token.kind)) cls.push('tok--light');
  if (token.confidence === 'guess' || token.kind === 'unknown') cls.push('tok--guess');
  if (whole) cls.push('snd-whole');
  const said = (token.romaji && token.romaji.said) || '';
  const spelled = (token.romaji && token.romaji.spelled) || '';
  return h('button', {
    type: 'button',
    class: cls.join(' '),
    'data-i': token.i,
    'data-gram': grammarIds(token).join(' ') || null,
    'data-snd': whole ? types.join(' ') : null,
    'aria-pressed': 'false',
    tabindex: '-1',
  }, [
    surfaceNode(token, { kidOf, cuts }),
    h('span', { class: 'tok-romaji tok-romaji--said', 'aria-hidden': 'true', lang: 'ja-Latn' }, said || ' '),
    h('span', { class: 'tok-romaji tok-romaji--spelled', 'aria-hidden': 'true', lang: 'ja-Latn' }, spelled || ' '),
  ]);
}

/**
 * The whole reading as lines. A newline token ends a line; the newline itself
 * is not drawn. Returns the lines and the index of the token that should hold
 * the one tab stop (the selected one, or the first selectable).
 */
/** Punctuation that closes what came before it, and never starts a line. */
const CLOSING = /^[。、．，！？!?.,…‥」』）)〉》】〕ー〜~：:；;]+$/u;
/** Punctuation that opens what comes after it, and never ends a line. */
const OPENING = /^[「『（(〈《【〔]+$/u;

export function readingNodes(tokens, { selected = null, kidOf = null, gaps = [] } = {}) {
  // The gap before each token, and the hairlines inside each compound.
  const before = new Map();
  const inside = new Map();
  gaps.forEach((g, ix) => {
    if (g.part === null) before.set(g.j, ix);
    else {
      const t = tokens[g.i];
      if (!t) return;
      const list = inside.get(g.i) || [];
      list.push({ at: [...t.surface.slice(0, g.at - t.start)].length, ix, guess: !!g.guess });
      inside.set(g.i, list);
    }
  });
  const lines = [];
  let line = h('p', { class: 'reading-line' });
  let blank = true;
  let last = null;          // the node a closing mark may join
  let opener = null;        // an opening mark waiting for its word
  // Each word is its own wrapping unit, so a line may break between any two.
  // A 。 or 」 is kept with the word before it and a 「 with the word after,
  // the way Japanese typesetting keeps them, rather than left on a line alone.
  const put = (node) => {
    if (opener) {
      opener.appendChild(node);
      node = opener;
      opener = null;
    }
    line.appendChild(node);
    last = node;
  };
  const group = (node) => {
    if (node.classList.contains('tok-group')) return node;
    const g = h('span', { class: 'tok-group' });
    node.replaceWith(g);
    g.appendChild(node);
    return g;
  };
  for (const token of tokens) {
    if (token.kind === 'newline') {
      if (opener) { line.appendChild(opener); opener = null; }
      if (blank) line.classList.add('reading-line--blank');
      lines.push(line);
      line = h('p', { class: 'reading-line' });
      blank = true;
      last = null;
      continue;
    }
    const node = tokenNode(token, { kidOf, cuts: inside.get(token.i) || [] });
    if (token.kind === 'punct' && CLOSING.test(token.surface) && last && !opener) {
      last = group(last);
      last.appendChild(node);
    } else if (token.kind === 'punct' && OPENING.test(token.surface)) {
      if (opener) opener.appendChild(node);
      else opener = h('span', { class: 'tok-group' }, node);
    } else if (token.kind === 'space') {
      if (opener) { line.appendChild(opener); opener = null; }
      line.appendChild(node);
      last = null;
    } else {
      if (before.has(token.i)) put(gapNode(before.get(token.i), { guess: !!gaps[before.get(token.i)].guess }));
      put(node);
    }
    if (token.kind !== 'space') blank = false;
  }
  if (opener) line.appendChild(opener);
  if (!blank || !lines.length) lines.push(line);
  const first = tokens.find(selectable);
  const stop = selected !== null && tokens[selected] && selectable(tokens[selected]) ? selected : first ? first.i : null;
  return { lines, stop };
}
