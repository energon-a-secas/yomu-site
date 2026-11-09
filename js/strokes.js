// Stroke geometry for writing practice. KanjiVG's path data (data/strokes,
// on its 109-unit grid) as absolute cubic segments any view can draw, points
// along each stroke, and a judge for a stroke traced by hand: was it the
// stroke that comes next, drawn from its start to its end, along its line.
// No DOM, timer or storage: the iOS app's bridge imports it as it is.
//
// The judge is deliberately forgiving about neatness and strict about order
// and direction, which are what a writing tutorial teaches. Distances are in
// grid units; a learner's finger is wide, so the ends may miss by a fifth of
// the square, and the line may stray by half that on average. What the
// learner is told (traceWords) is { en, es }, in the current language
// (strings.js useLang); the errors about path data are for programmers.

import { t } from './strings.js';

export const GRID = 109;
export const TRACE_TOLERANCE = 20;

const TOKEN = /[MmLlHhVvCcSsZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[^\s,]/g;
const COMMANDS = 'MLHVCSZ';
const round = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The first point of a path's data: where its stroke number goes. */
export function startOf(d) {
  const m = /^[Mm]\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/.exec(d);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

const line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3, x1, y1];

/**
 * A path's data as absolute cubic segments [x0, y0, c1x, c1y, c2x, c2y, x1, y1].
 * Lines become straight cubics. Throws on a command it does not draw, so new
 * data with arcs or quadratics fails loudly instead of drawing wrong.
 */
export function cubicsOf(d) {
  const tokens = String(d).match(TOKEN) || [];
  const out = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastC2 = null;
  let cmd = null;
  let i = 0;
  const num = () => {
    const v = Number(tokens[i]);
    if (i >= tokens.length || !Number.isFinite(v)) throw new Error(`stroke path data is cut short: ${d}`);
    i += 1;
    return v;
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) {
      cmd = tokens[i];
      i += 1;
      if (!COMMANDS.includes(cmd.toUpperCase())) throw new Error(`stroke path command ${cmd} is not drawn: ${d}`);
    } else if (cmd === null || !Number.isFinite(Number(tokens[i]))) {
      throw new Error(`stroke path data does not start with a command: ${d}`);
    }
    const rel = cmd !== cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = startX = num() + ox;
        y = startY = num() + oy;
        lastC2 = null;
        cmd = rel ? 'l' : 'L'; // more pairs after a move are lines
        break;
      }
      case 'L': {
        const nx = num() + ox;
        const ny = num() + oy;
        out.push(line(x, y, nx, ny));
        [x, y, lastC2] = [nx, ny, null];
        break;
      }
      case 'H': {
        const nx = num() + ox;
        out.push(line(x, y, nx, y));
        [x, lastC2] = [nx, null];
        break;
      }
      case 'V': {
        const ny = num() + oy;
        out.push(line(x, y, x, ny));
        [y, lastC2] = [ny, null];
        break;
      }
      case 'C': {
        const c = [x, y, num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy];
        out.push(c);
        [x, y, lastC2] = [c[6], c[7], [c[4], c[5]]];
        break;
      }
      case 'S': {
        // The first control point mirrors the last cubic's second one.
        const c1 = lastC2 ? [2 * x - lastC2[0], 2 * y - lastC2[1]] : [x, y];
        const c = [x, y, c1[0], c1[1], num() + ox, num() + oy, num() + ox, num() + oy];
        out.push(c);
        [x, y, lastC2] = [c[6], c[7], [c[4], c[5]]];
        break;
      }
      default: { // Z
        if (x !== startX || y !== startY) out.push(line(x, y, startX, startY));
        [x, y, lastC2] = [startX, startY, null];
      }
    }
  }
  if (!out.length) throw new Error(`stroke path data draws nothing: ${d}`);
  return out;
}

function pointOn(c, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const e = 3 * u * t * t;
  const f = t * t * t;
  return [a * c[0] + b * c[2] + e * c[4] + f * c[6], a * c[1] + b * c[3] + e * c[5] + f * c[7]];
}

/** Points along cubic segments, about `step` units apart, both ends included. */
export function pointsOf(cubics, step = 2) {
  const points = [];
  for (const c of cubics) {
    const rough = Math.hypot(c[2] - c[0], c[3] - c[1]) + Math.hypot(c[4] - c[2], c[5] - c[3]) + Math.hypot(c[6] - c[4], c[7] - c[5]);
    const n = Math.max(2, Math.ceil(rough / step));
    for (let k = points.length ? 1 : 0; k <= n; k += 1) points.push(pointOn(c, k / n));
  }
  return points;
}

/** How long a line through `points` is. */
export function lengthOf(points) {
  let total = 0;
  for (let k = 1; k < points.length; k += 1) total += dist(points[k - 1], points[k]);
  return total;
}

/**
 * One stroke, ready to draw and to trace: its cubics, where it starts (and
 * so where its number goes), where it ends, its length and points along it.
 */
export function strokeOf(d) {
  const cubics = cubicsOf(d);
  const points = pointsOf(cubics);
  return {
    cubics: cubics.map((c) => c.map(round)),
    start: points[0].map(round),
    end: points[points.length - 1].map(round),
    length: round(lengthOf(points)),
    points: points.map((p) => p.map(round)),
  };
}

/** A character's strokes in drawing order, from its path data. */
export function strokesFor(paths) {
  return (paths || []).map(strokeOf);
}

function toSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function stray(from, to) {
  let total = 0;
  for (const p of from) {
    let best = Infinity;
    for (let k = 1; k < to.length; k += 1) best = Math.min(best, toSegment(p, to[k - 1], to[k]));
    total += to.length === 1 ? dist(p, to[0]) : best;
  }
  return total / from.length;
}

/** How far a drawn line and a stroke stray from each other, on average, both ways. */
export function fitOf(stroke, drawn) {
  return (stray(drawn, stroke.points) + stray(stroke.points, drawn)) / 2;
}

/**
 * A drawn stroke against one expected stroke: { ok, why }. `why` is null
 * when it fits, else 'short' (a tap), 'reversed' (drawn from the end),
 * 'start' or 'end' (an end misses), or 'shape' (it wanders off the line).
 */
export function judgeStroke(stroke, drawn, { tolerance = TRACE_TOLERANCE } = {}) {
  if (!Array.isArray(drawn) || drawn.length < 2 || lengthOf(drawn) < 2) return { ok: false, why: 'short' };
  const first = drawn[0];
  const last = drawn[drawn.length - 1];
  const startMiss = dist(first, stroke.start);
  const endMiss = dist(last, stroke.end);
  if (startMiss > tolerance || endMiss > tolerance) {
    if (dist(first, stroke.end) <= tolerance && dist(last, stroke.start) <= tolerance) return { ok: false, why: 'reversed' };
    return { ok: false, why: startMiss > tolerance ? 'start' : 'end' };
  }
  return fitOf(stroke, drawn) <= tolerance / 2 ? { ok: true, why: null } : { ok: false, why: 'shape' };
}

/**
 * The next stroke of a tracing: `strokes` in order, `next` the index the
 * learner should draw, `drawn` their points on the grid. A line that fits a
 * later stroke better than the next one is that stroke drawn too early:
 * { ok: false, why: 'order', matched }. Otherwise the next stroke's verdict.
 */
export function traceStroke(strokes, next, drawn, options = {}) {
  const expected = strokes[next];
  if (!expected) throw new Error(`there is no stroke ${next + 1}`);
  const verdict = judgeStroke(expected, drawn, options);
  let best = null;
  for (let j = next + 1; j < strokes.length; j += 1) {
    if (!judgeStroke(strokes[j], drawn, options).ok) continue;
    const fit = fitOf(strokes[j], drawn);
    if (!best || fit < best.fit) best = { j, fit };
  }
  if (best && (!verdict.ok || best.fit < fitOf(expected, drawn) / 2)) return { ok: false, why: 'order', matched: best.j };
  return { ...verdict, matched: verdict.ok ? next : null };
}

/** What the learner is told for each verdict, with the stroke numbers filled in. */
export function traceWords({ why, matched } = {}, next = 0) {
  const n = next + 1;
  switch (why) {
    case null: return next === null ? '' : t({ en: `Stroke ${n}: that's it.`, es: `Trazo ${n}: ¡eso es!` });
    case 'order': return t({ en: `That is stroke ${matched + 1}. Stroke ${n} comes first.`, es: `Ese es el trazo ${matched + 1}. Primero va el trazo ${n}.` });
    case 'reversed': return t({ en: `Stroke ${n} goes the other way: start at the dot.`, es: `El trazo ${n} va en el otro sentido: empieza en el punto.` });
    case 'start': return t({ en: `Start stroke ${n} at the dot.`, es: `Empieza el trazo ${n} en el punto.` });
    case 'end': return t({ en: `Carry stroke ${n} through to its end.`, es: `Lleva el trazo ${n} hasta el final.` });
    case 'shape': return t({ en: `Follow the grey line of stroke ${n} a little more closely.`, es: `Sigue un poco más de cerca la línea gris del trazo ${n}.` });
    case 'short': return t({ en: 'Draw the whole stroke in one movement.', es: 'Dibuja todo el trazo en un solo movimiento.' });
    default: return '';
  }
}
