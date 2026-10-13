// The Word panel's "All forms": every form of the chosen verb or adjective
// (conjugate.js), folded under one summary that names the form the text
// used, so the panel opens on the word and not on twenty rows.
//
// Inside, the eight forms a learner meets first are a grid, now or past by
// does or doesn't, in the plain or the polite register (a switch, starting
// on the register of the form in the text); then the linking forms as cards,
// then the rest as rows. A form is a button that says it; a form's name,
// where a grammar note explains it, opens the note. Every button finds its
// form by `data-form`, an id: no Japanese is written into an attribute.

import { h } from './utils.js';
import { ui, t } from './strings.js';
import { FORM_NAMES } from './strings-conj.js';
import { formNote } from './conjugate.js';
import { align } from './furigana.js';

/** The grid's cells, by register: [now does, now doesn't, past does, past doesn't]. */
const GRID = Object.freeze({
  plain: Object.freeze(['plain', 'negative', 'past', 'past-negative']),
  polite: Object.freeze(['polite', 'polite-negative', 'polite-past', 'polite-past-negative']),
});

/** The register a table opens on: the text's own, when its form is in the grid. */
export function registerOf(table) {
  return table && GRID.polite.includes(table.here) ? 'polite' : 'plain';
}

/** The form, written, with ruby over the stem's kanji and the ending as it is. */
function formJa(row) {
  const parts = row.stem && row.stemReading ? align(row.stem, row.stemReading).furigana : [];
  const nodes = parts.map((p) => (p.ruby
    ? h('ruby', null, [p.text, h('rp', null, '('), h('rt', null, p.ruby), h('rp', null, ')')])
    : p.text));
  nodes.push(row.written.slice(row.stem.length));
  return h('span', { class: 'conj-ja', lang: 'ja' }, nodes);
}

/** A form's name: a link to its grammar note where there is one, else plain text. */
function formName(table, id) {
  const name = t(FORM_NAMES[id]);
  const note = formNote(table.cls, id);
  if (!note) return h('span', { class: 'conj-name' }, name);
  return h('button', {
    type: 'button', class: 'text-link conj-name', 'data-act': 'note', 'data-kind': 'grammar', 'data-id': note,
  }, name);
}

/** A button that says one form, labelled for a screen reader by the form's name. */
function sayButton(table, row, canSpeak, cls, children) {
  return h('button', {
    type: 'button',
    class: `${cls}${row.id === table.here ? ` ${cls}--here` : ''}`,
    'data-act': 'say-form',
    'data-form': row.id,
    'aria-disabled': canSpeak ? null : 'true',
    'aria-describedby': canSpeak ? null : 'speech-note',
  }, [
    ...children,
    h('span', { class: 'sr-only' }, ui('conjSay', { form: t(FORM_NAMES[row.id]) })),
  ]);
}

function gridPart(table, reg, byId, canSpeak) {
  const ids = GRID[reg];
  const cell = (id) => {
    const row = byId.get(id);
    if (!row) return h('span', { class: 'conj-cell conj-cell--none' });
    return sayButton(table, row, canSpeak, 'conj-cell', [
      formJa(row),
      h('span', { class: 'conj-romaji', lang: 'ja-Latn' }, row.romaji),
      row.id === table.here ? h('span', { class: 'conj-here-tag' }, ui('conjInText')) : null,
    ]);
  };
  const notes = ids.filter((id) => byId.has(id) && formNote(table.cls, id));
  return h('div', { class: 'conj-basic' }, [
    h('div', { class: 'seg conj-reg', role: 'group', 'aria-label': ui('conjRegister') }, ['plain', 'polite'].map((r) => h('button', {
      type: 'button', class: 'seg-btn', 'data-act': 'conj-reg', 'data-reg': r, 'aria-pressed': String(r === reg),
    }, ui(r === 'plain' ? 'conjPlain' : 'conjPolite')))),
    h('div', { class: 'conj-grid' }, [
      h('span', { 'aria-hidden': 'true' }),
      h('span', { class: 'conj-axis' }, ui('conjDoes')),
      h('span', { class: 'conj-axis' }, ui('conjDoesnt')),
      h('span', { class: 'conj-axis conj-axis--row' }, ui('conjNow')),
      cell(ids[0]), cell(ids[1]),
      h('span', { class: 'conj-axis conj-axis--row' }, ui('conjPast')),
      cell(ids[2]), cell(ids[3]),
    ]),
    notes.length ? h('p', { class: 'conj-notes' }, [
      h('span', { class: 'quiet' }, `${ui('conjAbout')} `),
      ...notes.flatMap((id, i) => [i ? ' · ' : null, formName(table, id)]).filter(Boolean),
    ]) : null,
  ]);
}

function cardsPart(table, rows, canSpeak) {
  return h('div', { class: 'conj-cards' }, rows.map((row) => h('div', { class: `conj-card${row.id === table.here ? ' conj-card--here' : ''}` }, [
    formName(table, row.id),
    sayButton(table, row, canSpeak, 'conj-say-form', [
      formJa(row),
      h('span', { class: 'conj-romaji', lang: 'ja-Latn' }, row.romaji),
    ]),
  ])));
}

function listPart(table, rows, canSpeak) {
  return h('ul', { class: 'conj-list', role: 'list' }, rows.map((row) => h('li', { class: `conj-row${row.id === table.here ? ' conj-row--here' : ''}` }, [
    formName(table, row.id),
    sayButton(table, row, canSpeak, 'conj-say-form conj-say-form--end', [
      formJa(row),
      h('span', { class: 'conj-romaji', lang: 'ja-Latn' }, row.romaji),
    ]),
  ])));
}

/**
 * @param {{ cls: string, kind: string, rows: object[], here: string|null }|null} table  conjugateToken()
 * @param {boolean} canSpeak
 * @param {{ reg?: string|null, open?: boolean }} [view]  the register chosen, and whether the section is open
 */
export function conjPart(table, canSpeak, { reg = null, open = false } = {}) {
  if (!table || !table.rows.length) return null;
  const byId = new Map(table.rows.map((row) => [row.id, row]));
  const register = reg === 'plain' || reg === 'polite' ? reg : registerOf(table);
  const inGrid = new Set([...GRID.plain, ...GRID.polite]);
  const linking = table.rows.filter((row) => row.group === 'linking');
  const more = table.rows.filter((row) => row.group === 'more');
  const here = table.here ? t(FORM_NAMES[table.here]) : '';
  return h('details', { class: 'word-part conj', id: 'word-conj', open: open || null }, [
    h('summary', { class: 'conj-sum' }, [
      h('span', { class: 'conj-title' }, ui('conjTitle')),
      h('span', { class: 'conj-count' }, ui('conjCount', { n: table.rows.length })),
      here ? h('span', { class: 'conj-here' }, ui('conjHere', { form: here })) : null,
    ]),
    table.cls === 'adj-na' ? h('p', { class: 'quiet conj-lead' }, ui('conjLeadNa')) : null,
    table.rows.some((row) => inGrid.has(row.id)) ? gridPart(table, register, byId, canSpeak) : null,
    linking.length ? h('div', { class: 'conj-group' }, [h('h4', { class: 'word-sub' }, ui('conjGroupLinking')), cardsPart(table, linking, canSpeak)]) : null,
    more.length ? h('div', { class: 'conj-group' }, [h('h4', { class: 'word-sub' }, ui('conjGroupMore')), listPart(table, more, canSpeak)]) : null,
  ]);
}
