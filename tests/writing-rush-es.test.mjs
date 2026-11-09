// Writing rush in Spanish: the groups, the picker's options, what a stroke's
// verdict says, the results and the refusals, each resolved through strings.js
// like the rest of the learning modules, and none of it left in English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WritingRush, rushGroups, rushPool, rushOptions, summaryOf } from '../js/writing-rush.js';
import { EM_DASH, inSpanish, stroke, write, start } from './helpers/rush.mjs';

const SEVEN = '日月火水木金土';
/** The seven kanji's stroke counts, as data/strokes gives them. */
const SEVEN_STROKES = Object.freeze({ 日: 4, 月: 4, 火: 4, 水: 4, 木: 4, 金: 8, 土: 3 });

test('in Spanish, the groups, options, verdicts, results and refusals', () => {
  inSpanish(() => {
    const titles = new Map(rushGroups().map((g) => [g.id, g.title]));
    assert.deepEqual(['hiragana-ka', 'katakana-wa', 'hiragana-all', 'mine', 'g1', 'g2', 'g3', 'g8', 'names', 'n3'].map((id) => titles.get(id)),
      ['Fila de か', 'Fila de ワ', 'Los 46 hiragana', 'Mis kanji', '1.er grado', '2.º grado', '3.er grado', 'Secundaria', 'Kanji para nombres', 'JLPT N3']);
    const options = rushOptions();
    assert.deepEqual(options.modes.map((m) => m.title), ['Contrarreloj', 'Maratón']);
    assert.deepEqual(options.guides.map((g) => g.title), ['Con guías', 'Sin guías']);
    assert.equal(options.seconds[0].title, '30 segundos');
    assert.equal(rushPool({ group: 'n5', chars: [...SEVEN], strokes: SEVEN_STROKES }).message, '7 kanji para escribir.');
    const rush = start({ group: 'mine', chars: ['日'], strokes: { 日: 4 }, mode: 'marathon', guides: false });
    assert.equal(rush.view().run.note, 'El reloj empieza con tu primer trazo.');
    const clock = { t: 0 };
    assert.equal(stroke(rush, clock, false, 'start').run.char.say, 'El trazo 1 empieza en otro lugar.');
    assert.equal(stroke(rush, clock, false, 'end').run.char.say, 'El trazo 1 termina en otro lugar.');
    assert.equal(stroke(rush, clock, false, 'shape').run.char.say, 'Aquí está el trazo 1: trázalo.');
    assert.equal(stroke(rush, clock, false, 'reversed').run.char.say, 'El trazo 1 va en el otro sentido.');
    assert.equal(stroke(rush, clock, false, 'order', 100, { matched: 2 }).run.char.say, 'Ese es el trazo 3. Primero va el trazo 1.');
    const v = write(rush, clock);
    assert.equal(v.run.result.heading, 'Maratón completo');
    assert.equal(v.run.result.summary, '1 kanji en 0:00, con 5 fallos. 1 necesitó ver un trazo.');
    assert.equal(v.run.result.bestNote, 'Se mostró un trazo, así que esta partida no cuenta para tu récord.');
    assert.equal(v.run.note, null);
    assert.throws(() => new WritingRush().start({ group: 'zz' }), { message: 'Grupo desconocido.' });
    assert.throws(() => new WritingRush().start({ group: 'n5', chars: ['日'], strokes: { 日: 4 }, mode: 'sprint' }), { message: 'Elige Contrarreloj o Maratón.' });
    assert.throws(() => new WritingRush().start({ group: 'n5', chars: ['日'], strokes: { 日: 4 }, seconds: 45 }), { message: 'Una contrarreloj dura 30, 60 o 120 segundos.' });
    assert.throws(() => new WritingRush().start({ group: 'n5', chars: ['日'], strokes: { 日: 4 }, guides: 'yes' }), { message: 'Elige con o sin guías.' });
    assert.throws(() => new WritingRush().start({ group: 'mine', chars: [] }), { message: 'Todavía no hay nada que escribir: primero guarda kanji en Mis kanji.' });
    const busy = start({ group: 'mine', chars: ['日'], strokes: { 日: 4 } });
    assert.throws(() => busy.start({ group: 'mine', chars: ['日'], strokes: { 日: 4 } }), { message: 'Primero termina o abandona la partida actual.' });
    assert.equal(summaryOf({ mode: 'rush', seconds: 60, written: 14, clean: 11, misses: 4, assisted: 0 }, 'kana'), '14 kana en 60 segundos, 11 sin fallos.');
    assert.equal(summaryOf({ mode: 'rush', seconds: 60, written: 0, clean: 0, misses: 0, assisted: 0 }, 'kanji'), 'No terminaste ningún kanji en 60 segundos.');
  });
  assert.equal(rushGroups()[0].title, 'あ row', 'English again');
});

test('every Spanish text the rush says is written, differs from the English, and has no em dash', () => {
  const say = () => {
    const said = [...rushGroups().filter((g) => g.kind === 'kana' || g.id === 'mine' || /^g/.test(g.id) || g.id === 'names').map((g) => g.title)];
    const o = rushOptions();
    said.push(...o.modes.flatMap((m) => [m.title, m.text]), ...o.guides.flatMap((g) => [g.title, g.text]), ...o.seconds.map((s) => s.title), o.rules);
    said.push(rushPool({ group: 'mine' }).message, rushPool({ group: 'g1', chars: ['俠'] }).message, rushPool({ group: 'zz' }).message);
    for (const guides of [true, false]) {
      const rush = start({ group: 'mine', chars: ['日'], strokes: { 日: 4 }, mode: 'marathon', guides });
      const clock = { t: 0 };
      said.push(rush.view().run.note);
      for (const why of ['start', 'end', 'reversed', 'mystery', 'shape', 'short']) said.push(stroke(rush, clock, false, why).run.char.say);
      const v = write(rush, clock);
      said.push(v.run.result.heading, v.run.result.summary, v.run.result.bestNote);
    }
    for (const args of [{ group: 'zz' }, { group: 'n5', chars: ['日'], strokes: { 日: 4 }, mode: 'x' }, { group: 'n5', chars: ['日'], strokes: { 日: 4 }, seconds: 1 }, { group: 'n5', chars: ['日'], strokes: { 日: 4 }, guides: 1 }]) {
      try { new WritingRush().start(args); } catch (error) { said.push(error.message); }
    }
    return said;
  };
  const english = say();
  const spanish = inSpanish(say);
  assert.equal(spanish.length, english.length);
  spanish.forEach((es, i) => {
    assert.ok(es && es.trim(), `text ${i} is empty`);
    assert.notEqual(es, english[i], `text ${i} is still English: ${es}`);
    assert.ok(!es.includes(EM_DASH) && !english[i].includes(EM_DASH), `text ${i}: a dash`);
  });
  for (const file of ['writing-rush.js', 'writing-rush-words.js']) {
    assert.ok(!fs.readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8').includes(EM_DASH), file);
  }
});
