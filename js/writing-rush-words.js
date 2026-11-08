// What the writing rush (writing-rush.js) says: group names, the picker's
// options, what a stroke's verdict says in an empty square, the summary of a
// finished run and what it says about bests, and the refusals. Each is
// { en, es }, resolved by strings.js t() when a function is called, never
// when a module loads. Spanish is neutral, as the site writes it: a run is a
// partida, a miss a fallo, a best a récord (Play's "¡Nuevo récord!").

import { t } from './strings.js';
import { traceWords } from './strokes.js';

export const SAY = Object.freeze({
  unknown: { en: 'Unknown group.', es: 'Grupo desconocido.' },
  busy: { en: 'Finish or abandon the current run first.', es: 'Primero termina o abandona la partida actual.' },
  mode: { en: 'Choose Rush or Marathon.', es: 'Elige Contrarreloj o Maratón.' },
  seconds: { en: 'A rush lasts 30, 60 or 120 seconds.', es: 'Una contrarreloj dura 30, 60 o 120 segundos.' },
  guides: { en: 'Choose with or without guides.', es: 'Elige con o sin guías.' },
  noneSaved: { en: 'Nothing to write yet: save kanji to My kanji first.', es: 'Todavía no hay nada que escribir: primero guarda kanji en Mis kanji.' },
  noStrokes: { en: 'None of these characters has a stroke order yet.', es: 'Ninguno de estos caracteres tiene orden de trazos todavía.' },
  clock: { en: 'The clock starts with your first stroke.', es: 'El reloj empieza con tu primer trazo.' },
  outOfBest: { en: 'A stroke was shown, so this run cannot set a best.', es: 'Se mostró un trazo, así que esta partida no puede marcar un récord.' },
  assistedRun: { en: 'A stroke was shown, so this run does not count for your best.', es: 'Se mostró un trazo, así que esta partida no cuenta para tu récord.' },
  firstBest: { en: 'Your first best for this group.', es: 'Tu primer récord en este grupo.' },
  finishOne: { en: 'Finish a character in time to set a best.', es: 'Termina un carácter a tiempo para marcar un récord.' },
  byLess: { en: 'A new best, by less than a second!', es: '¡Nuevo récord, por menos de un segundo!' },
  timeUp: { en: "Time's up", es: 'Se acabó el tiempo' },
  marathonDone: { en: 'Marathon complete', es: 'Maratón completo' },
});

const GRADE_ES = Object.freeze({ 1: '1.er grado', 2: '2.º grado', 3: '3.er grado', 4: '4.º grado', 5: '5.º grado', 6: '6.º grado' });

/** A kanji group's name: My kanji (no level), or a levels.js level. */
export function kanjiTitle(level) {
  if (!level) return { en: 'My kanji', es: 'Mis kanji' };
  if (level.jlpt) return `JLPT N${level.jlpt}`;
  if (level.grade === 8) return { en: 'Secondary school', es: 'Secundaria' };
  if (level.grade) return { en: `Grade ${level.grade}`, es: GRADE_ES[level.grade] };
  return { en: 'Kanji for names', es: 'Kanji para nombres' };
}

/** A kana group's name: the row of `head`, or all `count` of the script when there is no head. */
export function kanaTitle(head, script, count) {
  return head ? { en: `${head} row`, es: `Fila de ${head}` } : { en: `All ${count} ${script}`, es: `Los ${count} ${script}` };
}

/** A whole number of milliseconds as the clock reads: 2:31, or 1:02:05 past an hour. */
export function clockText(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const two = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/**
 * What a verdict says about stroke `n` (0-based) of a character of `count`.
 * With guides (`plain`) the writing pad's own words (strokes.js traceWords),
 * which point at the dot and the grey line. An empty square has neither, even
 * once a stroke is shown (the app chooses how to draw it), so there the words
 * say only what was wrong.
 */
export function strokeWords(why, matched, n, count, plain) {
  const k = n + 1;
  if (why === 'order' && Number.isInteger(matched) && matched > n && matched < count) return traceWords({ why, matched }, n);
  if (why === 'short' || (plain && ['reversed', 'start', 'end', 'shape'].includes(why))) return traceWords({ why }, n);
  switch (why) {
    case 'reversed': return t({ en: `Stroke ${k} goes the other way.`, es: `El trazo ${k} va en el otro sentido.` });
    case 'start': return t({ en: `Stroke ${k} starts somewhere else.`, es: `El trazo ${k} empieza en otro lugar.` });
    case 'end': return t({ en: `Stroke ${k} ends somewhere else.`, es: `El trazo ${k} termina en otro lugar.` });
    case 'shape': return t({ en: `Stroke ${k} has another shape.`, es: `El trazo ${k} tiene otra forma.` });
    default: return t({ en: `Not quite: draw stroke ${k} again.`, es: `Casi: dibuja otra vez el trazo ${k}.` });
  }
}

/** Said when stroke `n` (0-based) is shown after its third miss. */
export const shownWords = (n) => t({ en: `Here is stroke ${n + 1}: trace it.`, es: `Aquí está el trazo ${n + 1}: trázalo.` });

/** One sentence for a finished run (a record): what was written, how fast, how cleanly. `noun` is kana or kanji. */
export function summaryOf(rec, noun) {
  let s;
  if (rec.mode === 'rush') {
    s = rec.written
      ? t({ en: `${rec.written} ${noun} in ${rec.seconds} seconds, ${rec.clean} without a miss.`, es: `${rec.written} ${noun} en ${rec.seconds} segundos, ${rec.clean} sin fallos.` })
      : t({ en: `No ${noun} finished in ${rec.seconds} seconds.`, es: `No terminaste ningún ${noun} en ${rec.seconds} segundos.` });
  } else {
    const time = clockText(rec.ms);
    const misses = rec.misses === 0 ? t({ en: 'without a miss', es: 'sin fallos' })
      : rec.misses === 1 ? t({ en: 'with 1 miss', es: 'con 1 fallo' })
        : t({ en: `with ${rec.misses} misses`, es: `con ${rec.misses} fallos` });
    s = t({ en: `${rec.of} ${noun} in ${time}, ${misses}.`, es: `${rec.of} ${noun} en ${time}, ${misses}.` });
  }
  if (rec.assisted) {
    s += ` ${t({ en: `${rec.assisted} needed a shown stroke.`, es: rec.assisted === 1 ? '1 necesitó ver un trazo.' : `${rec.assisted} necesitaron ver un trazo.` })}`;
  }
  return s;
}

const yourBest = (best) => (best.mode === 'rush'
  ? t({ en: `Your best is ${best.written}.`, es: `Tu récord es ${best.written}.` })
  : t({ en: `Your best is ${clockText(best.ms)}.`, es: `Tu récord es ${clockText(best.ms)}.` }));

/**
 * What a finished run's result says about bests: `newBest`, the best it was
 * measured against (`previous`, null for none) and the best now (`best`).
 */
export function bestNote(rec, { newBest, previous, best }) {
  if (rec.assisted) return t(SAY.assistedRun);
  if (!rec.written) return best ? yourBest(best) : t(SAY.finishOne);
  if (newBest && !previous) return t(SAY.firstBest);
  if (!newBest) return yourBest(best);
  if (rec.mode === 'rush') return t({ en: `A new best! The last was ${previous.written}.`, es: `¡Nuevo récord! El anterior era ${previous.written}.` });
  const last = clockText(previous.ms);
  return last === clockText(rec.ms) ? t(SAY.byLess) : t({ en: `A new best! The last was ${last}.`, es: `¡Nuevo récord! El anterior era ${last}.` });
}

/** The modes, lengths (`seconds`) and guides a picker offers, with what each means. */
export function optionWords(seconds) {
  return {
    modes: [
      { id: 'rush', title: t({ en: 'Rush', es: 'Contrarreloj' }), text: t({ en: 'As many as you can before the time runs out.', es: 'Todos los que puedas antes de que se acabe el tiempo.' }) },
      { id: 'marathon', title: t({ en: 'Marathon', es: 'Maratón' }), text: t({ en: 'Every character of the group once, as fast as you can.', es: 'Cada carácter del grupo una vez, lo más rápido que puedas.' }) },
    ],
    seconds: seconds.map((n) => ({ id: n, title: t({ en: `${n} seconds`, es: `${n} segundos` }) })),
    guides: [
      { id: true, title: t({ en: 'With guides', es: 'Con guías' }), text: t({ en: 'The faint character, and a dot where each stroke starts.', es: 'El carácter tenue y un punto donde empieza cada trazo.' }) },
      { id: false, title: t({ en: 'Without guides', es: 'Sin guías' }), text: t({ en: 'An empty square: write it from memory.', es: 'Un cuadro vacío: escríbelo de memoria.' }) },
    ],
    rules: t({
      en: 'The clock starts with your first stroke. Three misses on one stroke show it, and a run with a shown stroke does not set a best.',
      es: 'El reloj empieza con tu primer trazo. Tres fallos en un trazo lo muestran, y una partida con un trazo mostrado no marca récord.',
    }),
  };
}

/** How many of a group's characters there are to write. */
export const countWords = (count, noun) => t({ en: `${count} ${noun} to write.`, es: `${count} ${noun} para escribir.` });
