// My progress (#/kanji/progress): the screen for what progress.js computes.
// Bars and shelves are drawn as boxes with a height or a width, and each
// chart says its numbers in words too, for a screen reader.

import { h } from './utils.js';
import { ui } from './strings.js';
import { gradeName, count } from './render-remember.js';
import { PERIODS } from './progress.js';

function stat(n, labelKey, fromKey) {
  return h('div', { class: 'pg-stat' }, [
    h('span', { class: 'pg-n' }, count(n)),
    h('span', { class: 'pg-label' }, ui(n === 1 ? `${labelKey}One` : labelKey)),
    fromKey ? h('span', { class: 'pg-from' }, ui(fromKey)) : null,
  ]);
}

function bars(p) {
  const max = Math.max(1, ...p.bars.map((b) => b.n));
  const list = p.bars.map((b) => b.n).join(', ');
  return h('section', { class: 'pg-sec', 'aria-labelledby': 'pg-new-h' }, [
    h('h3', { class: 'mk-sec-title', id: 'pg-new-h' }, ui('pgNewTitle')),
    h('div', { class: 'pg-bars', role: 'img', 'aria-label': ui(p.period === 'all' ? 'pgNewMonth' : 'pgNewDay', { list }) },
      p.bars.map((b) => h('span', { class: `pg-bar${b.n ? '' : ' pg-bar--zero'}`, style: `height: ${Math.max(3, Math.round((b.n / max) * 100))}%`, title: `${b.label}: ${b.n}` }))),
  ]);
}

function grades(p) {
  const body = p.grades
    ? h('ul', { class: 'pg-grades', role: 'list' }, p.grades.map((g) => h('li', { class: 'pg-grade' }, [
      h('span', { class: 'pg-grade-name' }, gradeName(g.grade)),
      h('span', { class: 'pg-track', 'aria-hidden': 'true' }, h('span', { class: 'pg-fill', style: `width: ${Math.round((g.have / g.total) * 100)}%` })),
      h('span', { class: 'pg-grade-n' }, `${count(g.have)} / ${count(g.total)}`),
    ])))
    : h('p', { class: 'quiet', role: 'status' }, ui('pgLoading'));
  return h('section', { class: 'pg-sec', 'aria-labelledby': 'pg-grades-h' }, [h('h3', { class: 'mk-sec-title', id: 'pg-grades-h' }, ui('pgGrades')), body]);
}

function boxes(p) {
  return h('section', { class: 'pg-sec', 'aria-labelledby': 'pg-box-h' }, [
    h('h3', { class: 'mk-sec-title', id: 'pg-box-h' }, ui('pgBoxes')),
    h('ul', { class: 'pg-boxes', role: 'list' }, p.boxes.map((n, i) => h('li', { class: 'pg-box' }, [
      h('span', { class: 'pg-box-n' }, count(n)), h('span', { class: 'pg-box-label' }, ui('pgBox', { n: i })),
    ]))),
    h('p', { class: 'quiet pg-note' }, ui('pgBoxNote')),
  ]);
}

function nextUp(p, firstGrade) {
  const due = p.due === 0 ? ui('pgDueNone') : p.due === 1 ? ui('pgDueOne') : ui('pgDue', { n: count(p.due) });
  return h('section', { class: 'pg-sec pg-next', 'aria-labelledby': 'pg-next-h' }, [
    h('h3', { class: 'mk-sec-title', id: 'pg-next-h' }, ui('pgNext')),
    h('p', null, due),
    p.next.length && firstGrade ? h('p', null, [ui('pgUnmet', { grade: gradeName(firstGrade) }), ' ', h('span', { class: 'pg-unmet', lang: 'ja' }, p.next.join(' '))]) : null,
    p.due ? h('p', { class: 'mk-actions' }, h('button', { type: 'button', class: 'btn btn--primary', 'data-act': 'mk-start' }, ui('startReview'))) : null,
  ]);
}

/**
 * The whole screen.
 * @param {object} p  progress.js progressOf()
 */
export function progressNodes(p) {
  const firstGrade = p.grades ? (p.grades.find((g) => g.have < g.total) || {}).grade : null;
  return [
    h('h3', { class: 'mk-sec-title' }, ui('pgTitle')),
    h('p', { class: 'quiet' }, ui('pgLead')),
    h('div', { class: 'seg pg-periods', role: 'group', 'aria-label': ui('pgPeriod') }, PERIODS.map((id) => h('button', {
      type: 'button', class: 'seg-btn', 'data-act': 'pg-period', 'data-period': id, 'aria-pressed': String(id === p.period),
    }, ui(`pg_${id}`)))),
    h('div', { class: 'pg-stats' }, [
      stat(p.texts, 'pgTexts', 'pgTextsFrom'),
      stat(p.met, 'pgMet'),
      stat(p.fresh, 'pgFresh', 'pgFreshFrom'),
      stat(p.saved, 'pgSaved'),
    ]),
    bars(p),
    nextUp(p, firstGrade),
    grades(p),
    boxes(p),
    h('p', { class: 'quiet pg-note' }, ui('pgNoDates')),
  ];
}
