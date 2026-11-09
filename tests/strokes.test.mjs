// Stroke geometry for writing practice: KanjiVG paths as cubics, points along
// them, and the judge of a stroke traced by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cubicsOf, strokeOf, strokesFor, startOf, judgeStroke, traceStroke, traceWords, lengthOf } from '../js/strokes.js';
import { useLang } from '../js/strings.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'strokes');
const shard = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')).entries;
const near = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);
/** The character is named, never written, so this file passes its own rule. */
const EM_DASH = String.fromCharCode(0x2014);

/** `fn` with every string in Spanish (strings.js useLang), then English again. */
function inSpanish(fn) {
  useLang('es');
  try { return fn(); } finally { useLang('en'); }
}

test('path data becomes absolute cubics: relative, smooth and implied lines', () => {
  assert.deepEqual(cubicsOf('M10,10C20,10,30,20,40,40'), [[10, 10, 20, 10, 30, 20, 40, 40]]);
  const [first, second] = cubicsOf('M10,10c10,0,20,10,30,30s20,10,30,10');
  assert.deepEqual(first, [10, 10, 20, 10, 30, 20, 40, 40]);
  assert.ok(near(second, [40, 40, 50, 60, 60, 50, 70, 50]), 'S mirrors the last control point');
  const [line] = cubicsOf('M0,0 30,0');
  assert.ok(near(line, [0, 0, 10, 0, 20, 0, 30, 0]), 'pairs after a move are lines');
  assert.deepEqual(cubicsOf('M1.5.5c1-1,2-2,3-3')[0].slice(0, 2), [1.5, 0.5], 'packed numbers split as SVG reads them');
});

test('a command the drawing does not handle fails loudly', () => {
  assert.throws(() => cubicsOf('M0,0A10,10,0,0,1,20,20'), /command A is not drawn/);
  assert.throws(() => cubicsOf('M0,0Q10,10,20,20'), /command Q is not drawn/);
  assert.throws(() => cubicsOf('M0,0C1,1,2'), /cut short/);
  assert.throws(() => cubicsOf('M5,5'), /draws nothing/);
});

test('every stroke in the data draws, starting where its number goes', () => {
  let strokes = 0;
  for (const name of fs.readdirSync(DIR).filter((f) => /^s\d+\.json$/.test(f))) {
    for (const [ch, paths] of Object.entries(shard(name))) {
      for (const d of paths) {
        const s = strokeOf(d);
        assert.ok(s.length > 0, `${ch} has an empty stroke`);
        assert.ok(near(s.start, startOf(d), 0.01), `${ch}: the stroke starts where its number goes`);
        strokes += 1;
      }
    }
  }
  assert.ok(strokes > 60000, `only ${strokes} strokes`);
});

test('a traced stroke is judged by order, direction, ends and line', () => {
  const ka = strokesFor(shard('s00.json')['か']);
  assert.equal(ka.length, 3);
  assert.deepEqual(traceStroke(ka, 0, ka[0].points), { ok: true, why: null, matched: 0 });
  assert.equal(traceStroke(ka, 0, [...ka[0].points].reverse()).why, 'reversed');
  assert.deepEqual(traceStroke(ka, 0, ka[1].points), { ok: false, why: 'order', matched: 1 });
  assert.equal(traceStroke(ka, 0, [ka[0].start, ka[0].start]).why, 'short', 'a tap is not a stroke');
  assert.equal(traceStroke(ka, 0, [[100, 100], [105, 105], [108, 108]]).why, 'start');
  const half = ka[0].points.slice(0, Math.floor(ka[0].points.length / 2));
  assert.equal(judgeStroke(ka[0], half).why, 'end', 'stopping halfway misses the end');
});

test('a wobbly hand still passes; a stroke beside the right one in a dense kanji is not taken for it', () => {
  const ka = strokesFor(shard('s00.json')['か']);
  const wobbly = ka[2].points.map(([x, y], i) => [x + (i % 2 ? 3 : -3), y + (i % 3 ? 2 : -2)]);
  assert.equal(traceStroke(ka, 2, wobbly).ok, true);
  const sho = strokesFor(shard('s14.json')['書']);
  for (let i = 0; i < sho.length; i += 1) {
    assert.deepEqual(traceStroke(sho, i, sho[i].points), { ok: true, why: null, matched: i }, `書 stroke ${i + 1}`);
  }
});

test('what the learner is told names the strokes', () => {
  assert.equal(traceWords({ why: 'order', matched: 3 }, 1), 'That is stroke 4. Stroke 2 comes first.');
  assert.equal(traceWords({ why: 'reversed' }, 0), 'Stroke 1 goes the other way: start at the dot.');
  assert.equal(traceWords({ why: null }, 2), "Stroke 3: that's it.");
  assert.ok(lengthOf([[0, 0], [3, 4]]) === 5);
});

test('in Spanish, what the learner is told names the same strokes', () => {
  const ka = strokesFor(shard('s00.json')['か']);
  inSpanish(() => {
    assert.equal(traceWords(traceStroke(ka, 0, ka[1].points), 0), 'Ese es el trazo 2. Primero va el trazo 1.');
    assert.equal(traceWords(traceStroke(ka, 0, [...ka[0].points].reverse()), 0), 'El trazo 1 va en el otro sentido: empieza en el punto.');
    assert.equal(traceWords(traceStroke(ka, 2, ka[2].points), 2), 'Trazo 3: ¡eso es!');
    assert.equal(traceWords({ why: 'short' }, 0), 'Dibuja todo el trazo en un solo movimiento.');
    assert.equal(traceWords({ why: null }, null), '');
  });
  assert.equal(traceWords({ why: null }, 2), "Stroke 3: that's it.", 'English again');
});

test('every Spanish verdict is written, differs from the English, keeps its stroke numbers and has no em dash', () => {
  for (const why of [null, 'order', 'reversed', 'start', 'end', 'shape', 'short']) {
    const english = traceWords({ why, matched: 4 }, 2);
    const spanish = inSpanish(() => traceWords({ why, matched: 4 }, 2));
    assert.ok(spanish.trim(), String(why));
    assert.notEqual(spanish, english, String(why));
    assert.ok(!spanish.includes(EM_DASH), String(why));
    assert.deepEqual(spanish.match(/\d+/g)?.sort(), english.match(/\d+/g)?.sort(), `${why}: the same stroke numbers`);
  }
  assert.ok(!fs.readFileSync(new URL('../js/strokes.js', import.meta.url), 'utf8').includes(EM_DASH));
});
