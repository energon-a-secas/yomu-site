// The Word panel: one token, taken apart the way a learner sounds out a word
// in a language they learned by reading. c-a-r, then car: the beats as chips,
// each kana over its romaji, a control that says them one by one and then the
// whole, and around that what the dictionary knows.
//
// The panel shows both romaji lines whatever the reading's toggle says,
// because the difference between said and spelled is the lesson here.

import { h, withJa } from './utils.js';
import { ui, t, posWords, currentLang, originWords } from './strings.js';
import { beats as splitBeats, beatRomaji } from './kana.js';
import { surfaceNode } from './render-reading.js';
import { noteTitle, noteGist, tokenNotes, humanize } from './render-notes.js';
import { saveToggle, seenText } from './render-save.js';

/** A token's beats with the romaji each one is spelled with. */
export function tokenBeats(token) {
  const list = Array.isArray(token.morae) && token.morae.length
    ? token.morae
    : splitBeats(token.reading || token.surface || '');
  return list.map((kana, i) => ({ kana, romaji: beatRomaji(kana, list[i + 1] || '', list[i - 1] || '') }));
}

function section(titleKey, body, extra) {
  if (!body) return null;
  return h('div', { class: `word-part${extra ? ` ${extra}` : ''}` }, [h('h3', { class: 'word-sub' }, ui(titleKey)), body]);
}

function speakButton(act, labelKey, ok) {
  return h('button', {
    type: 'button',
    class: 'btn btn--secondary btn--sm',
    'data-act': act,
    'aria-disabled': ok ? null : 'true',
    'aria-describedby': ok ? null : 'speech-note',
  }, ui(labelKey));
}

function beatsPart(token, canSpeak) {
  const beats = tokenBeats(token);
  if (!beats.length) return null;
  return h('div', { class: 'word-part' }, [
    h('h3', { class: 'word-sub' }, ui('beats')),
    h('ol', { class: 'beats', id: 'word-beats', role: 'list', 'aria-label': ui('beatsHint') },
      beats.map((b, i) => h('li', { class: 'beat', 'data-beat': i }, [
        h('span', { class: 'beat-kana', lang: 'ja' }, b.kana),
        h('span', { class: 'beat-romaji', lang: 'ja-Latn' }, b.romaji || ' '),
      ]))),
    h('div', { class: 'word-actions' }, [
      speakButton('sound-out', 'soundOut', canSpeak),
      speakButton('say-word', 'speakWord', canSpeak),
    ]),
  ]);
}

function meaningsPart(token) {
  const glosses = token.entry && Array.isArray(token.entry.g) ? token.entry.g.filter(Boolean) : [];
  const lines = [];
  if (glosses.length) {
    lines.push(h('ol', { class: 'glosses', lang: 'en' }, glosses.map((g) => h('li', null, g))));
    if (currentLang() !== 'en') lines.push(h('p', { class: 'quiet' }, ui('meaningsEnglish')));
  } else if (token.entry) {
    lines.push(h('p', { class: 'quiet' }, ui('noMeaning')));
  }
  if (token.entry && token.entry.tier === 2) lines.push(h('p', { class: 'quiet' }, ui('rareWord')));
  // A compound says what it knows part by part (partsPart), guess or not.
  if (!token.parts && (token.kind === 'unknown' || token.confidence === 'guess')) {
    lines.push(h('p', { class: 'word-warn' }, ui('guess')));
    if (token.kind === 'katakana') lines.push(h('p', { class: 'quiet' }, ui('noSplit')));
  }
  const alts = Number(token.alts) || 0;
  if (alts === 1) lines.push(h('p', { class: 'quiet' }, ui('altsOne')));
  else if (alts > 1) lines.push(h('p', { class: 'quiet' }, ui('altsMany', { n: alts })));
  return lines.length ? section('meanings', lines) : null;
}

/**
 * A katakana compound (compounds.js), part by part: "Made of: インフォーム
 * not in the dictionary + ショップ shop". A part the dictionary does not
 * have says so instead of a gloss; a rare part says it is one.
 */
function partsPart(token) {
  const parts = Array.isArray(token.parts) ? token.parts : [];
  if (!parts.length) return null;
  const line = [];
  parts.forEach((p, k) => {
    if (k) line.push(' + ');
    line.push(h('span', { lang: 'ja' }, p.surface), ' ');
    line.push(p.gloss ? h('span', { lang: 'en' }, p.gloss) : h('span', { class: 'quiet' }, ui('notInDict')));
    if (p.tier === 2) line.push(' ', h('span', { class: 'quiet' }, `(${ui('rareTag')})`));
  });
  const covered = parts.every((p) => p.entry);
  return section('madeOf', [
    h('p', { class: 'word-made' }, line),
    h('p', { class: covered ? 'quiet' : 'word-warn' }, ui(covered ? 'compoundRule' : 'compoundGuess')),
  ]);
}

/**
 * Where the word came from: the record's `ls` and `ws` (a compound's, part by
 * part), and a shortening the loanword rules found (loanwords.js).
 */
function originPart(token) {
  const lines = [];
  const parts = Array.isArray(token.parts) ? token.parts : null;
  if (parts) {
    for (const p of parts) {
      const words = originWords(p.entry);
      if (words) lines.push(h('p', null, [h('span', { lang: 'ja' }, p.surface), `: ${words}`]));
    }
  } else {
    const words = originWords(token.entry);
    if (words) lines.push(h('p', null, words));
    const short = (token.sounds || []).find((s) => s && s.type === 'loan-short' && s.detail);
    if (short) lines.push(h('p', null, [ui('shortened', { words: '' }).trim(), ' ', h('span', { lang: 'en' }, short.detail)]));
  }
  return lines.length ? section('origin', lines) : null;
}

/**
 * A deinflection rule id (deinflect.js) and the grammar note that explains
 * the same form (notes-grammar.js) are named by different streams, and most
 * pairs differ: the rule that removes ます is `masu`, its note is `polite`.
 * A rule's own `label` is a developer's English name, never learner prose, so
 * a step is named by its note, and a rule with no note of its own is named
 * here in both languages.
 */
const RULE_NOTE = Object.freeze({
  masu: 'polite',
  'masu-past': 'polite-past',
  'masu-negative': 'polite-negative',
  'masu-past-negative': 'polite-past-negative',
  'masu-te': 'polite-te',
  'masu-volitional': 'lets',
  te: 'te-form',
  ta: 'past',
  tai: 'want',
  ba: 'cond-ba',
  'adj-ba': 'cond-ba',
  tara: 'cond-tara',
  'adj-adverb': 'adverbial',
  'adj-sou': 'sou',
  'adj-sugiru': 'sugiru',
  'te-iru-casual': 'te-iru',
  'te-shimau-casual': 'te-shimau',
  'negative-te': 'naide',
  'must-casual': 'must',
  'potential-colloquial': 'potential',
  'potential-passive': 'potential',
});

const RULE_WORDS = Object.freeze({
  stem: { en: 'The stem, the form ます attaches to', es: 'La raíz, la forma a la que se une ます' },
});

/** Dictionary form first, then each step toward what the text says. */
function chainPart(token, noteOf) {
  const chain = Array.isArray(token.chain) ? token.chain.filter(Boolean) : [];
  if (!chain.length || !token.base) return null;
  const steps = chain.slice().reverse().map((step) => {
    const id = step.rule ? RULE_NOTE[step.rule] || step.rule : null;
    const note = id ? noteOf('grammar', id) : null;
    let label = note ? noteTitle(note, id) : t(RULE_WORDS[step.rule]);
    if (!label) label = t(step.label) || humanize(step.rule);
    return h('li', { class: 'chain-step' }, withJa(label));
  });
  return section('formed', h('ol', { class: 'chain', role: 'list' }, [
    h('li', { class: 'chain-step chain-step--base' }, [
      h('span', { lang: 'ja' }, token.base), ' ',
      h('span', { class: 'quiet' }, ui('dictionaryForm')),
    ]),
    ...steps,
    h('li', { class: 'chain-step chain-step--surface', lang: 'ja' }, token.surface),
  ]));
}

function notesPart(token, noteOf) {
  const refs = tokenNotes(token);
  if (!refs.length) return null;
  return section('wordNotes', h('ul', { class: 'word-notes', role: 'list' }, refs.map((ref) => {
    const note = noteOf(ref.kind, ref.id);
    const gist = noteGist(note);
    return h('li', null, [
      h('button', {
        type: 'button',
        class: 'text-link',
        'data-act': 'note',
        'data-kind': ref.kind,
        'data-id': ref.id,
      }, withJa(noteTitle(note, ref.id))),
      gist ? h('p', { class: 'word-gist' }, withJa(gist)) : null,
    ]);
  })));
}

/**
 * The word's kanji, each with what it means, how often it was met and the
 * same save toggle the kanji table has, so a kanji can be kept from the word
 * it was found in without going to the table.
 */
function kanjiPart(token, { kidOf, kanjiOf }) {
  const chars = [...new Set(Array.isArray(token.kanji) ? token.kanji : [])];
  if (!chars.length || typeof kanjiOf !== 'function') return null;
  const rows = chars.map((ch) => {
    const kid = kidOf ? kidOf(ch) : -1;
    if (kid < 0) return null;
    const { info, saved, n } = kanjiOf(ch);
    const meaning = info && Array.isArray(info.m) ? info.m.slice(0, 3).join(', ') : '';
    const seen = seenText(n);
    return h('li', { class: 'wk' }, [
      h('span', { class: 'wk-char', lang: 'ja' }, ch),
      h('span', { class: 'wk-main' }, [
        meaning ? h('span', { class: 'wk-mean', lang: 'en' }, meaning) : null,
        seen ? h('span', { class: 'wk-seen' }, seen) : null,
      ]),
      saveToggle(ch, saved, { 'data-act': 'save-kanji', 'data-kid': kid }),
    ]);
  }).filter(Boolean);
  return rows.length ? section('wordKanji', h('ul', { class: 'wk-list', role: 'list' }, rows)) : null;
}

/**
 * @param {object|null} token
 * @param {{ noteOf: Function, kidOf: Function, canSpeak: boolean, kanjiOf?: Function }} ctx
 */
export function wordNode(token, { noteOf, kidOf, canSpeak, kanjiOf = null }) {
  if (!token) return h('p', { class: 'side-empty' }, ui('wordEmpty'));
  const romaji = token.romaji || {};
  const kinds = posWords(token);
  const lookup = token.base || token.surface;
  return [
    h('div', { class: 'word-head' }, [
      h('p', { class: 'word-surface', id: 'word-surface', lang: 'ja' }, surfaceNode(token, { kidOf, marks: false })),
      token.reading && token.reading !== token.surface
        ? h('p', { class: 'word-reading', lang: 'ja' }, token.reading)
        : null,
    ]),
    h('dl', { class: 'word-romaji' }, [
      h('div', null, [h('dt', null, ui('saidLine')), h('dd', { lang: 'ja-Latn' }, romaji.said || '')]),
      h('div', null, [h('dt', null, ui('spelledLine')), h('dd', { lang: 'ja-Latn' }, romaji.spelled || '')]),
    ]),
    beatsPart(token, canSpeak),
    kinds.length ? section('partOfSpeech', h('p', null, withJa(kinds.join('; ')))) : null,
    partsPart(token),
    meaningsPart(token),
    originPart(token),
    kanjiPart(token, { kidOf, kanjiOf }),
    chainPart(token, noteOf),
    notesPart(token, noteOf),
    h('p', { class: 'word-out' }, h('a', {
      class: 'text-link',
      href: `https://jisho.org/search/${encodeURIComponent(lookup)}`,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: ui('jishoTitle'),
    }, `${ui('jisho')} ↗`)),
  ];
}
