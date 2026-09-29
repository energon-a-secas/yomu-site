// "In this text", and the note it opens.
//
// A token carries ids, never prose (docs/ANALYZER.md): sounds[].type and
// grammar[].id point into notes.js, which owns every explanation as
// { en, es }. This file only lays a note out, and a note with a missing field
// still shows what it has rather than nothing.

import { h, withJa } from './utils.js';
import { ui, t } from './strings.js';
import { grammarIds, soundTypes } from './render-reading.js';

/**
 * Sounds counted by sentence rather than by occurrence. A voiced mark sits on
 * most lines of Japanese, several times over (です, 学校, 勉強 in one short
 * sentence), and "dakuten 14" is a tally, not something to go and look at.
 * Per sentence, the count says where to look.
 */
export const PER_SENTENCE = Object.freeze(new Set(['dakuten', 'handakuten']));

const SENTENCE_END = new Set(['。', '．', '.', '！', '!', '？', '?', '…']);

function endsSentence(token) {
  return token.kind === 'newline' || (token.kind === 'punct' && SENTENCE_END.has(token.surface));
}

/**
 * How often each sound and each grammar id occurs. A sound counts every span
 * the analyzer marked, except the PER_SENTENCE ones, which count the sentences
 * they occur in; a grammar id counts the tokens that carry it.
 */
export function summarize(tokens) {
  const sounds = new Map();
  const grammar = new Map();
  const seen = new Set();
  let sentence = 0;
  for (const token of tokens) {
    for (const s of token.sounds || []) {
      if (!s || !s.type) continue;
      if (PER_SENTENCE.has(s.type)) {
        const key = `${s.type} ${sentence}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      sounds.set(s.type, (sounds.get(s.type) || 0) + 1);
    }
    for (const id of new Set(grammarIds(token))) grammar.set(id, (grammar.get(id) || 0) + 1);
    if (endsSentence(token)) sentence += 1;
  }
  return { sounds, grammar };
}

/** long-vowel -> "long vowel", when a note has no title of its own. */
export function humanize(id) {
  return String(id || '').replace(/[-_]+/g, ' ');
}

export function noteTitle(note, id) {
  return (note && t(note.title)) || humanize(id);
}

function paragraphs(v) {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.flatMap(paragraphs);
  const s = t(v);
  return s ? s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [];
}

function ruleOf(note) {
  return note && (note.rule || note.meaning);
}

/** The first sentence of a note's rule, for the Word panel's short list. */
export function noteGist(note) {
  const first = paragraphs(ruleOf(note))[0] || '';
  const m = /^(.+?[.!?。])(\s|$)/.exec(first);
  return m ? m[1] : first;
}

function line(kind, id, count, note, open) {
  const isOpen = !!open && open.kind === kind && open.id === id;
  return h('li', null, h('button', {
    type: 'button',
    class: 'it-line',
    'data-act': 'note',
    'data-kind': kind,
    'data-id': id,
    'aria-pressed': isOpen ? 'true' : 'false',
  }, [
    h('span', { class: 'it-title' }, withJa(noteTitle(note, id))),
    kind === 'sound' && PER_SENTENCE.has(id)
      ? h('span', { class: 'it-count' }, ui(count === 1 ? 'sentencesOne' : 'sentencesMany', { n: count }))
      : h('span', { class: 'it-count' }, [String(count), h('span', { class: 'sr-only' }, ` ${ui('countSuffix')}`)]),
  ]));
}

/**
 * @param {object} summary  summarize(tokens)
 * @param {(kind: string, id: string) => object|null} noteOf
 * @param {{kind: string, id: string}|null} open  the note shown in the side column
 */
export function inTextNode(summary, noteOf, open) {
  const groups = [];
  if (summary.sounds.size) {
    groups.push(h('div', { class: 'it-group' }, [
      h('h3', { class: 'it-head' }, ui('soundsHead')),
      h('ul', { class: 'it-list', role: 'list' }, [...summary.sounds].map(([id, n]) => line('sound', id, n, noteOf('sound', id), open))),
    ]));
  }
  if (summary.grammar.size) {
    groups.push(h('div', { class: 'it-group' }, [
      h('h3', { class: 'it-head' }, ui('grammarHead')),
      h('ul', { class: 'it-list', role: 'list' }, [...summary.grammar].map(([id, n]) => line('grammar', id, n, noteOf('grammar', id), open))),
    ]));
  }
  return groups.length ? groups : h('p', { class: 'quiet' }, ui('inTextNone'));
}

// ── The note ──────────────────────────────────────────────────────────────
//
// notes.js resolves a note to strings in the reader's language. A sound note
// has a rule, examples (said, spelled, sometimes the whispered notation), a
// minimal pair { with, without } where one exists, and an exception. A grammar
// note has what it is for (meaning), how it is built (pattern), and one
// example sentence with its translation.

function field(o, ...names) {
  for (const n of names) if (o && o[n] !== undefined && o[n] !== null && o[n] !== '') return o[n];
  return null;
}

/** One example: the Japanese, then said and spelled, then what it means. */
export function exampleNode(ex, tag) {
  if (!ex) return null;
  const ja = field(ex, 'ja', 'text', 'kana');
  const kana = field(ex, 'kana');
  const said = field(ex, 'said');
  const spelled = field(ex, 'spelled');
  const whispered = field(ex, 'whispered');
  const gloss = field(ex, 'gloss', 'translation', 'meaning');
  return h('li', { class: 'ex' }, [
    tag ? h('span', { class: 'ex-tag' }, tag) : null,
    h('span', { class: 'ex-ja', lang: 'ja' }, ja || ''),
    kana && kana.replace(/\s+/g, '') !== ja ? h('span', { class: 'ex-kana', lang: 'ja' }, kana) : null,
    said ? h('span', { class: 'ex-said', lang: 'ja-Latn' }, said) : null,
    spelled && spelled !== said ? h('span', { class: 'ex-spelled', lang: 'ja-Latn' }, spelled) : null,
    whispered ? h('span', { class: 'ex-spelled' }, [h('span', { lang: 'ja-Latn' }, whispered), ` (${ui('whispered')})`]) : null,
    gloss ? h('span', { class: 'ex-gloss' }, withJa(t(gloss))) : null,
  ]);
}

function pairNodes(note) {
  const p = note && note.pair;
  if (!p || (!p.with && !p.without)) return [];
  return [
    h('h4', { class: 'note-sub' }, ui('minimalPair')),
    h('ul', { class: 'ex-list ex-list--pair', role: 'list' }, [
      exampleNode(p.with, ui('pairWith')),
      exampleNode(p.without, ui('pairWithout')),
    ]),
  ];
}

/**
 * The note panel's content: the rule, examples with said and spelled, and the
 * minimal pair that makes the rule audible.
 */
export function noteNode(note, ref) {
  if (!ref) return h('p', { class: 'side-empty' }, ui('notesEmpty'));
  const head = h('div', { class: 'note-head' }, [
    h('h3', { class: 'note-title', id: 'note-title' }, withJa(noteTitle(note, ref.id))),
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'close-note' }, ui('close')),
  ]);
  if (!note) return [head, h('p', { class: 'quiet' }, ui('noteMissing'))];

  const out = [head];
  if (note.meaning) out.push(h('p', { class: 'note-rule' }, withJa(t(note.meaning))));
  if (note.pattern) {
    // "verb te-form + しまう" is English with Japanese in it, not Japanese.
    out.push(h('p', { class: 'note-pattern' }, [h('span', { class: 'kj-key' }, ui('pattern')), ' ', h('span', null, withJa(t(note.pattern)))]));
  }
  for (const para of paragraphs(note.rule)) out.push(h('p', { class: 'note-rule' }, withJa(para)));

  const examples = Array.isArray(note.examples) ? note.examples.map((ex) => exampleNode(ex)).filter(Boolean) : [];
  if (examples.length) {
    out.push(h('h4', { class: 'note-sub' }, ui('examples')), h('ul', { class: 'ex-list', role: 'list' }, examples));
  } else if (note.example && note.example.ja) {
    out.push(h('h4', { class: 'note-sub' }, ui('example')), h('ul', { class: 'ex-list', role: 'list' }, exampleNode(note.example)));
  }
  out.push(...pairNodes(note));
  if (note.exception) out.push(h('p', { class: 'note-rule quiet' }, withJa(t(note.exception))));
  if (note.fallback) out.push(h('p', { class: 'quiet' }, ui('noteFallback')));
  return out;
}

/** The sound and grammar notes one token carries, for the Word panel. */
export function tokenNotes(token) {
  return [
    ...soundTypes(token).map((id) => ({ kind: 'sound', id })),
    ...[...new Set(grammarIds(token))].map((id) => ({ kind: 'grammar', id })),
  ];
}
