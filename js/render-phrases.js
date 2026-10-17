// The Phrases dialog: the library by category, then the dialogues.
//
// Choosing a phrase reads it, and Listen says it from its recording
// (js/audio.js); a dialogue's Listen says it line by line, speaker B in a
// second voice. A phrase marked chunk: true also offers Chunk it, which opens
// its beats under the row and says them one by one before the whole phrase. The chips are drawn when the row opens, not before, so a long
// library does not build a few hundred hidden lists.

import { h, speakerIcon } from './utils.js';
import { ui, t, registerWord, currentLang } from './strings.js';
import { beatRomaji } from './kana.js';
import { phraseBeats } from './library.js';
import { canRead } from './kana-rows.js';

function speakAttrs(canSpeak) {
  return canSpeak ? {} : { 'aria-disabled': 'true', 'aria-describedby': 'phrases-speech-note' };
}

/**
 * Seventy rows each have a Read it and a Chunk it; tabbing through them said
 * "Read it, Chunk it, Read it" with nothing to tell them apart. Each button
 * is described by its own phrase and translation, and Chunk it names the
 * area it opens. The ids come from the library (ours), never from the text.
 */
function phraseRow(p, canSpeak) {
  const meta = [registerWord(p.register), t(p.situation)].filter(Boolean).join(' · ');
  const id = `ph-${p.id}`;
  const described = `${id}-ja ${id}-tr`;
  const speak = speakAttrs(canSpeak);
  return h('li', { class: 'ph' }, [
    h('div', { class: 'ph-main' }, [
      h('p', { class: 'ph-ja', lang: 'ja', id: `${id}-ja` }, p.ja),
      p.kana && p.kana !== p.ja ? h('p', { class: 'ph-kana', lang: 'ja' }, p.kana) : null,
      h('p', { class: 'ph-tr', id: `${id}-tr` }, t({ en: p.en, es: p.es })),
      meta ? h('p', { class: 'ph-meta' }, meta) : null,
      p.note ? h('p', { class: 'ph-note' }, t(p.note)) : null,
    ]),
    h('div', { class: 'ph-actions' }, [
      h('button', {
        type: 'button', class: 'btn btn--ghost btn--sm ph-listen', 'data-act': 'ph-listen', 'data-id': p.id,
        ...speak, 'aria-describedby': [described, speak['aria-describedby']].filter(Boolean).join(' '),
      }, [speakerIcon(), h('span', null, ui('listen'))]),
      h('button', {
        type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'read-phrase', 'data-id': p.id, 'aria-describedby': described,
      }, ui('readPhrase')),
      p.chunk ? h('button', {
        type: 'button',
        class: 'btn btn--ghost btn--sm',
        'data-act': 'chunk',
        'data-id': p.id,
        'aria-expanded': 'false',
        'aria-controls': `${id}-chunk`,
        ...speak,
        'aria-describedby': [described, speak['aria-describedby']].filter(Boolean).join(' '),
      }, ui('chunkIt')) : null,
    ]),
    p.chunk ? h('div', { class: 'ph-chunk', id: `${id}-chunk`, 'data-chunk': p.id, hidden: true }) : null,
  ]);
}

/** The chips for one phrase, drawn into its row when Chunk it is pressed. */
export function chunkNodes(phrase) {
  const beats = phraseBeats(phrase);
  return [
    h('ol', { class: 'beats beats--phrase', role: 'list' }, beats.map((b, i) => h('li', { class: 'beat', 'data-beat': i }, [
      h('span', { class: 'beat-kana', lang: 'ja' }, b),
      h('span', { class: 'beat-romaji', lang: 'ja-Latn' }, beatRomaji(b, beats[i + 1] || '', beats[i - 1] || '') || ' '),
    ]))),
    h('p', { class: 'quiet' }, ui('chunkHint')),
  ];
}

function dialogueRow(d, canSpeak) {
  const speak = speakAttrs(canSpeak);
  const lang = currentLang();
  const tr = d.translation && Array.isArray(d.translation[lang]) ? d.translation[lang]
    : d.translation && Array.isArray(d.translation.en) ? d.translation.en : [];
  return h('li', { class: 'dlg' }, [
    h('h4', { class: 'dlg-title', id: `dlg-${d.id}` }, t(d.title)),
    d.scene ? h('p', { class: 'quiet' }, t(d.scene)) : null,
    h('ol', { class: 'dlg-lines', role: 'list' }, d.lines.map((l, i) => h('li', null, [
      l.speaker ? h('span', { class: 'dlg-speaker' }, l.speaker) : null,
      h('span', { class: 'dlg-ja', lang: 'ja' }, l.ja),
      tr[i] ? h('span', { class: 'dlg-tr' }, tr[i]) : null,
    ]))),
    h('div', { class: 'dlg-actions' }, [
      h('button', {
        type: 'button', class: 'btn btn--ghost btn--sm ph-listen', 'data-act': 'dlg-listen', 'data-id': d.id,
        ...speak, 'aria-describedby': [`dlg-${d.id}`, speak['aria-describedby']].filter(Boolean).join(' '),
      }, [speakerIcon(), h('span', null, ui('listenDialogue'))]),
      h('button', {
        type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'read-dialogue', 'data-id': d.id, 'aria-describedby': `dlg-${d.id}`,
      }, ui('readDialogue')),
    ]),
  ]);
}

/**
 * "Only phrases I can read": a toggle, and what it found. With no row marked
 * on the kana chart there is nothing to read with, and the line says where
 * to mark them (events-kana-rows.js opens the chart).
 */
function readableBar(readable, shown, total) {
  const bar = [h('button', {
    type: 'button', class: 'btn btn--ghost btn--sm ph-readable', 'data-act': 'ph-readable', 'aria-pressed': String(!!readable.on),
  }, ui('phReadable'))];
  if (readable.on && !readable.known.length) {
    bar.push(h('p', { class: 'quiet ph-readable-note', role: 'status' }, [ui('phNoRows'), ' ',
      h('button', { type: 'button', class: 'text-link', 'data-act': 'ph-mark-rows' }, ui('phMarkRows'))]));
  } else if (readable.on) {
    bar.push(h('p', { class: 'quiet ph-readable-note', role: 'status' }, ui('phReadableCount', { n: shown, total })));
  }
  return h('div', { class: 'ph-readable-bar' }, bar);
}

/**
 * The dialog body for a loaded library. `readable` is { on, known }: with
 * it on, only the phrases and dialogues whose kana use the known rows of
 * the kana chart (kana-rows.js canRead), kanji read as their kana.
 */
export function phrasesNode(lib, { canSpeak, speechReason, readable = { on: false, known: [] } }) {
  const out = [h('p', { class: 'quiet' }, ui('phrasesLead'))];
  if (!canSpeak && speechReason) out.push(h('p', { class: 'quiet', id: 'phrases-speech-note' }, speechReason));
  const keep = (p) => !readable.on || canRead(p, readable.known);
  const keepDialogue = (d) => !readable.on || d.lines.every((l) => !l || !l.ja || canRead(l, readable.known));
  const total = lib.categories.reduce((n, c) => n + c.phrases.length, 0);
  const cats = lib.categories.map((c) => ({ ...c, phrases: c.phrases.filter(keep) })).filter((c) => c.phrases.length);
  const dialogues = lib.dialogues.filter(keepDialogue);
  out.push(readableBar(readable, cats.reduce((n, c) => n + c.phrases.length, 0), total));
  for (const c of cats) {
    out.push(h('section', { class: 'ph-cat', 'aria-labelledby': `cat-${c.id}` }, [
      h('h3', { class: 'ph-cat-title', id: `cat-${c.id}` }, t(c.title)),
      h('ul', { class: 'ph-list', role: 'list' }, c.phrases.map((p) => phraseRow(p, canSpeak))),
    ]));
  }
  if (dialogues.length) {
    out.push(h('section', { class: 'ph-cat', 'aria-labelledby': 'cat-dialogues' }, [
      h('h3', { class: 'ph-cat-title', id: 'cat-dialogues' }, ui('dialogues')),
      h('ul', { class: 'ph-list', role: 'list' }, dialogues.map((d) => dialogueRow(d, canSpeak))),
    ]));
  }
  return out;
}
