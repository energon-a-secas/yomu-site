// The Word panel's "All forms": every form of the chosen verb or adjective
// (conjugate.js), folded under one summary that names the form the text
// used, so the panel opens on the word and not on twenty rows.
//
// A row is the form's name (a button that opens its grammar note, when one
// explains it), the form with the word's own furigana, its romaji as the
// reader would say it, and Say. Say finds its form by `data-form`, an id:
// no Japanese is written into an attribute.

import { h } from './utils.js';
import { ui, t } from './strings.js';
import { FORM_NAMES } from './strings-conj.js';
import { formNote } from './conjugate.js';
import { align } from './furigana.js';

const GROUP_TITLE = Object.freeze({ basic: 'conjGroupBasic', linking: 'conjGroupLinking', more: 'conjGroupMore' });

/** The form, written, with ruby over the stem's kanji and the ending as it is. */
function formJa(row) {
  const parts = row.stem && row.stemReading ? align(row.stem, row.stemReading).furigana : [];
  const nodes = parts.map((p) => (p.ruby
    ? h('ruby', null, [p.text, h('rp', null, '('), h('rt', null, p.ruby), h('rp', null, ')')])
    : p.text));
  nodes.push(row.written.slice(row.stem.length));
  return h('span', { class: 'conj-ja', lang: 'ja' }, nodes);
}

function formName(table, row) {
  const name = t(FORM_NAMES[row.id]);
  const note = formNote(table.cls, row.id);
  if (!note) return h('span', { class: 'conj-name' }, name);
  return h('button', {
    type: 'button', class: 'text-link conj-name', 'data-act': 'note', 'data-kind': 'grammar', 'data-id': note,
  }, name);
}

function rowNode(table, row, canSpeak) {
  const here = row.id === table.here;
  return h('li', { class: `conj-row${here ? ' conj-row--here' : ''}` }, [
    formName(table, row),
    h('span', { class: 'conj-form' }, [
      formJa(row),
      h('span', { class: 'conj-romaji', lang: 'ja-Latn' }, row.romaji),
    ]),
    h('button', {
      type: 'button',
      class: 'btn btn--ghost btn--sm conj-say',
      'data-act': 'say-form',
      'data-form': row.id,
      'aria-disabled': canSpeak ? null : 'true',
      'aria-describedby': canSpeak ? null : 'speech-note',
    }, [h('span', { 'aria-hidden': 'true' }, ui('speakShort')), h('span', { class: 'sr-only' }, ui('conjSay', { form: t(FORM_NAMES[row.id]) }))]),
  ]);
}

/**
 * @param {{ cls: string, kind: string, rows: object[], here: string|null }|null} table  conjugateToken()
 * @param {boolean} canSpeak
 */
export function conjPart(table, canSpeak) {
  if (!table || !table.rows.length) return null;
  const groups = [];
  for (const row of table.rows) {
    let g = groups[groups.length - 1];
    if (!g || g.id !== row.group) groups.push(g = { id: row.group, rows: [] });
    g.rows.push(row);
  }
  const here = table.here ? t(FORM_NAMES[table.here]) : '';
  return h('details', { class: 'word-part conj', id: 'word-conj' }, [
    h('summary', { class: 'conj-sum' }, [
      h('span', { class: 'conj-title' }, ui('conjTitle')),
      h('span', { class: 'conj-count' }, ui('conjCount', { n: table.rows.length })),
      here ? h('span', { class: 'conj-here' }, ui('conjHere', { form: here })) : null,
    ]),
    h('p', { class: 'quiet conj-lead' }, ui(table.cls === 'adj-na' ? 'conjLeadNa' : 'conjLead')),
    ...groups.map((g) => h('div', { class: 'conj-group' }, [
      h('h4', { class: 'word-sub' }, ui(GROUP_TITLE[g.id])),
      h('ul', { class: 'conj-list', role: 'list' }, g.rows.map((row) => rowNode(table, row, canSpeak))),
    ])),
  ]);
}
