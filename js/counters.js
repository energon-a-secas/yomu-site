// The counters reference: what each counter counts, and how 1 to 10 and 何
// are read before it. No DOM.
//
// The readings are not a table here. They are numbers.js's, the same rule the
// reader applies to 三本 in a text, so the reference and the reading can never
// say two different things. What this file adds is which counters a learner
// meets first, in that order, and what each counts, written for Yomu.

import { readCounted, readQuestion, COUNTERS } from './numbers.js';

/** The counters shown, most met first, with what each counts, { en, es }. */
export const COUNTER_LIST = Object.freeze([
  ['つ', { en: 'things in general, up to ten (the native numbers)', es: 'cosas en general, hasta diez (los números nativos)' }],
  ['人', { en: 'people', es: 'personas' }],
  ['個', { en: 'small, round or compact things: apples, eggs, erasers', es: 'cosas pequeñas o compactas: manzanas, huevos, gomas' }],
  ['本', { en: 'long, thin things: pens, bottles, trees, umbrellas', es: 'cosas largas y delgadas: bolígrafos, botellas, árboles, paraguas' }],
  ['枚', { en: 'flat, thin things: paper, tickets, shirts, plates', es: 'cosas planas y delgadas: papel, boletos, camisas, platos' }],
  ['匹', { en: 'small animals: cats, dogs, fish, insects', es: 'animales pequeños: gatos, perros, peces, insectos' }],
  ['冊', { en: 'books and notebooks', es: 'libros y cuadernos' }],
  ['台', { en: 'machines and vehicles: cars, computers, bicycles', es: 'máquinas y vehículos: autos, computadoras, bicicletas' }],
  ['杯', { en: 'cups and glasses of something, bowls of rice', es: 'tazas y vasos de algo, tazones de arroz' }],
  ['回', { en: 'times, occurrences', es: 'veces' }],
  ['階', { en: 'floors of a building', es: 'pisos de un edificio' }],
  ['歳', { en: 'years of age', es: 'años de edad' }],
  ['円', { en: 'yen', es: 'yenes' }],
  ['時', { en: "o'clock", es: 'la hora (las tres, las cuatro)' }],
  ['分', { en: 'minutes', es: 'minutos' }],
  ['時間', { en: 'hours of time', es: 'horas de duración' }],
  ['日', { en: 'days of the month, and days', es: 'días del mes, y días' }],
  ['週間', { en: 'weeks', es: 'semanas' }],
  ['か月', { en: 'months of time', es: 'meses de duración' }],
  ['月', { en: 'months of the year: January is 一月', es: 'meses del año: enero es 一月' }],
  ['年', { en: 'years', es: 'años' }],
  ['番', { en: 'numbers in an order: no. 1, no. 2', es: 'números de orden: n.º 1, n.º 2' }],
  ['度', { en: 'times, and degrees', es: 'veces, y grados' }],
  ['倍', { en: 'times as much: double, triple', es: 'veces más: doble, triple' }],
  ['名', { en: 'people, formally: a booking, a class list', es: 'personas, en registro formal: una reserva, una lista' }],
  ['ヶ所', { en: 'places', es: 'lugares' }],
].map(([c, what]) => Object.freeze({ c, what: Object.freeze(what) })));

/** The numbers a row reads: 1 to 10. */
export const NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

/**
 * One counter's row: each number's reading, whether it bends (いっぽん is
 * not いちほん), and the question form with 何, or null where there is none
 * (何つ is not asked; いくつ is).
 * @returns {{ c: string, plain: string, cells: { n: number, reading: string, changed: boolean }[], question: object|null }}
 */
export function counterRow(c) {
  const spec = COUNTERS[c];
  if (!spec) return null;
  const cells = NUMBERS.map((n) => {
    const r = readCounted(n, c);
    return r ? Object.freeze({ n, reading: r.reading, changed: r.changed }) : Object.freeze({ n, reading: '', changed: false });
  });
  const q = readQuestion(c);
  return Object.freeze({
    c, plain: spec.plain, cells: Object.freeze(cells), question: q ? Object.freeze({ reading: q.reading, changed: q.changed }) : null,
  });
}
