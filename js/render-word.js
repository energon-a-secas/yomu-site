// The Word panel: one token, taken apart the way a learner sounds out a word
// in a language they learned by reading. c-a-r, then car: the beats as chips,
// each kana over its romaji, a control that says them one by one and then the
// whole, and around that what the dictionary knows.
//
// The panel shows both romaji lines whatever the reading's toggle says,
// because the difference between said and spelled is the lesson here.

import { h, withJa } from './utils.js';
import { ui, t, posWords, currentLang } from './strings.js';
import { beats as splitBeats, beatRomaji } from './kana.js';
import { surfaceNode } from './render-reading.js';
import { noteTitle, noteGist, tokenNotes, humanize } from './render-notes.js';

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
  if (token.kind === 'unknown' || token.confidence === 'guess') lines.push(h('p', { class: 'word-warn' }, ui('guess')));
  const alts = Number(token.alts) || 0;
  if (alts === 1) lines.push(h('p', { class: 'quiet' }, ui('altsOne')));
  else if (alts > 1) lines.push(h('p', { class: 'quiet' }, ui('altsMany', { n: alts })));
  return lines.length ? section('meanings', lines) : null;
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
 * @param {object|null} token
 * @param {{ noteOf: Function, kidOf: Function, canSpeak: boolean }} ctx
 */
export function wordNode(token, { noteOf, kidOf, canSpeak }) {
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
    meaningsPart(token),
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
