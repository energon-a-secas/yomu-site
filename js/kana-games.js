// Native kana recall, shared with any future web presentation. No DOM, audio
// player or storage. The older web Play scores keep their own v1 document.
// The original shape reminders in this file are dedicated to CC0.
import { kanaChart, kanaRomaji } from './kana-chart.js';
import { KANA_SETS } from './play-kana.js';
import { ROUND, makeRand, shuffle, drawWeighted, weightOf } from './play-rounds.js';
import { t } from './strings.js';

export const KANA_GAME_MODES = ['read', 'listen', 'apart'];
const scripts = ['hiragana', 'katakana'];
const count = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000 ? n : 0;
const keyOf = (script, mode) => `${script}:${mode}`;
const emptyStats = () => ({ rounds: 0, best: 0, correct: 0, answered: 0, assisted: 0, misses: {} });

// Personalized drills. Each kana keeps, per script and across modes, how often
// it was asked and missed (wrong, revealed or hinted, as the round's misses
// count it), a recent miss rate in thousandths, and a running average of the
// time a right, unaided answer took. Both averages move by ALPHA per answer,
// so a kana leaves the weak list after a few right, quick answers instead of
// carrying one old miss forever. A listening question's time includes its
// recording, so only reading and telling-apart answers are timed. A time
// outside FAST_MS..SLOW_MS is a stray tap or a learner who looked away, and is
// not counted. A kana is weak when its recent miss rate reaches WEAK_RECENT,
// or when its pace runs SLOW_FACTOR times the learner's own median.
export const WEAK_LIMIT = 8;
const FAST_MS = 200;
const SLOW_MS = 30000;
const SLOW_FACTOR = 1.4;
const WEAK_RECENT = 250;
const ALPHA = 0.35;
const isAnswerTime = (ms) => Number.isInteger(ms) && ms >= FAST_MS && ms <= SLOW_MS;
const chartIds = (script) => kanaChart(script).filter((s) => s.id !== 'timing').flatMap((s) => s.cells).filter((c) => c.kana).map((c) => c.id);

// Original shape reminders for kana outside the existing look-alike sets.
// These are observations of the printed forms, not stroke-order diagrams.
// Each is { en, es }, resolved to the current language (strings.js) when a
// round is viewed, like play-kana.js's look-alike hints.
const hint = (en, es) => Object.freeze({ en, es });
const extraHints = {
  'う': hint('A short mark sits above one curved stroke. Keep the top mark separate in your mental picture.', 'Una marca corta va sobre un solo trazo curvo. En tu imagen mental, deja la marca de arriba separada.'),
  'え': hint('A short mark sits over a zigzag that sweeps out to the right at the bottom.', 'Una marca corta va sobre un zigzag que abajo sale hacia la derecha.'),
  'か': hint('Look for the separate short stroke on the right of the hooked shape.', 'Busca el trazo corto y separado a la derecha de la forma con gancho.'),
  'く': hint('One bent stroke opens to the right, like an angle bracket.', 'Un solo trazo doblado que se abre a la derecha, como el signo <.'),
  'け': hint('A short bar crosses the tall stroke on the right; a separate stroke stands on the left.', 'Una barra corta cruza el trazo alto de la derecha; a la izquierda hay un trazo aparte.'),
  'し': hint('One long stroke bends gently up to the right at the bottom.', 'Un solo trazo largo que abajo se curva suavemente hacia arriba, a la derecha.'),
  'す': hint('A long bar crosses a stroke that loops, then trails downward.', 'Una barra larga cruza un trazo que forma un lazo y luego baja.'),
  'せ': hint('Two upright strokes cross a bar. The lower stroke sweeps right underneath.', 'Dos trazos verticales cruzan una barra. El de abajo se extiende hacia la derecha por debajo.'),
  'そ': hint('Follow the zigzag at the top into the broad curve underneath.', 'Sigue el zigzag de arriba hasta la curva ancha de abajo.'),
  'つ': hint('One broad curve opens to the left, with no separate top mark.', 'Una sola curva ancha que se abre a la izquierda, sin marca separada arriba.'),
  'て': hint('A flat top turns into a curve below it, like a small open umbrella.', 'Una parte de arriba plana que baja en curva, como un paraguas pequeño abierto.'),
  'と': hint('A short slanted stroke sits above a wide curve that opens upward.', 'Un trazo corto inclinado va sobre una curva ancha que se abre hacia arriba.'),
  'な': hint('A small cross is on the left; the loop belongs to the lower right.', 'A la izquierda hay una cruz pequeña; el lazo está abajo a la derecha.'),
  'の': hint('One stroke curls around into an open spiral.', 'Un solo trazo que gira en una espiral abierta.'),
  'ひ': hint('A deep scoop hangs between two short outward ends.', 'Una curva honda cuelga entre dos extremos cortos que salen hacia afuera.'),
  'ふ': hint('A central curve has small strokes around it. Remember the whole cluster.', 'Una curva central con trazos pequeños alrededor. Recuerda el grupo completo.'),
  'へ': hint('A shallow roof rises on the left and slopes down to the right.', 'Un tejado bajo que sube por la izquierda y baja hacia la derecha.'),
  'む': hint('A bar and a loop are on the left, with a small separate mark on the right.', 'A la izquierda hay una barra y un lazo, con una marca pequeña y separada a la derecha.'),
  'や': hint('A long curved stroke crosses the slanted stem, with a small mark above.', 'Un trazo largo y curvo cruza el tallo inclinado, con una marca pequeña arriba.'),
  'ゆ': hint('A wide loop is crossed by a long stroke through its middle.', 'Un lazo ancho atravesado por un trazo largo en el medio.'),
  'よ': hint('A short right-facing bar sits above the loop at the bottom.', 'Una barra corta hacia la derecha va sobre el lazo de abajo.'),
  'ら': hint('A separate mark sits above a curve with a short slanted start.', 'Una marca separada va sobre una curva que empieza con un trazo corto inclinado.'),
  'を': hint('Follow the upper cross down into the broad curve underneath.', 'Sigue la cruz de arriba hasta la curva ancha de abajo.'),
  'ん': hint('A sloping stroke turns into a low wave that rises at the right.', 'Un trazo inclinado se convierte en una onda baja que sube a la derecha.'),
  'イ': hint('A short diagonal meets a longer upright below it.', 'Una diagonal corta se une a un trazo vertical más largo debajo.'),
  'エ': hint('Two level bars are joined by one upright in the middle.', 'Dos barras horizontales unidas por un trazo vertical en el medio.'),
  'オ': hint('A bar crosses an upright; a diagonal reaches down to the left.', 'Una barra cruza un trazo vertical; una diagonal baja hacia la izquierda.'),
  'カ': hint('A bent stroke makes the right side; a long diagonal cuts down to the left.', 'Un trazo doblado forma el lado derecho; una diagonal larga baja hacia la izquierda.'),
  'キ': hint('Two bars cross one slanted upright.', 'Dos barras cruzan un trazo vertical inclinado.'),
  'サ': hint('A bar crosses two uprights, with the right one extending downward.', 'Una barra cruza dos trazos verticales, y el de la derecha se alarga hacia abajo.'),
  'セ': hint('A slanted bar meets an upright that bends right along the bottom.', 'Una barra inclinada se une a un trazo vertical que abajo se dobla hacia la derecha.'),
  'ト': hint('A long upright has one short diagonal branch on its right.', 'Un trazo vertical largo con una rama diagonal corta a la derecha.'),
  'ナ': hint('One bar crosses a stroke that falls to the lower left.', 'Una barra cruza un trazo que cae hacia abajo a la izquierda.'),
  'ニ': hint('Two separate level bars; the lower one is longer.', 'Dos barras horizontales separadas; la de abajo es más larga.'),
  'ネ': hint('A short mark is above the crossing strokes; a small branch reaches right.', 'Una marca corta va sobre los trazos que se cruzan; una rama pequeña sale a la derecha.'),
  'ハ': hint('Two separate strokes spread outward toward the bottom.', 'Dos trazos separados que se abren hacia abajo.'),
  'ヒ': hint('A short top bar meets an upright that bends right along the bottom.', 'Una barra corta arriba se une a un trazo vertical que abajo se dobla hacia la derecha.'),
  'ヘ': hint('One shallow angled roof, rising left and falling right.', 'Un solo tejado bajo en ángulo, que sube por la izquierda y baja por la derecha.'),
  'ホ': hint('A bar and an upright form a cross, with short strokes on both lower sides.', 'Una barra y un trazo vertical forman una cruz, con trazos cortos abajo a cada lado.'),
  'ミ': hint('Three separate slanted bars, one below another.', 'Tres barras inclinadas y separadas, una debajo de otra.'),
  'ム': hint('A diagonal turns into a flat base; a short stroke closes the lower right.', 'Una diagonal se convierte en una base plana; un trazo corto cierra abajo a la derecha.'),
  'モ': hint('Two bars cross an upright that hooks to the right at the bottom.', 'Dos barras cruzan un trazo vertical que abajo se curva hacia la derecha.'),
  'ヤ': hint('A slanted bar bends at the right; a longer stroke cuts through it.', 'Una barra inclinada se dobla a la derecha; un trazo más largo la atraviesa.'),
  'リ': hint('Two near-upright strokes; the right one reaches farther down.', 'Dos trazos casi verticales; el de la derecha baja más.'),
  'ル': hint('A short left stroke sits beside a longer stroke that turns up to the right.', 'Un trazo corto a la izquierda junto a otro más largo que sube hacia la derecha.'),
  'レ': hint('One upright bends up to the right at the bottom.', 'Un solo trazo vertical que abajo se dobla hacia arriba, a la derecha.'),
  'ロ': hint('Four sides enclose an empty square.', 'Cuatro lados encierran un cuadrado vacío.'),
};

function hintFor(cell, script) {
  const set = KANA_SETS.find((s) => s.script === script && s.chars.some(([ch]) => ch === cell.kana));
  const found = set?.chars.find(([ch]) => ch === cell.kana)?.[1];
  if (found) return t(found);
  if (extraHints[cell.kana]) return t(extraHints[cell.kana]);
  const letters = [...cell.kana], sound = kanaRomaji(cell.spoken);
  if (letters.length > 1) {
    const small = letters.slice(1).join('');
    return t({
      en: `${letters[0]} + small ${small} makes ${cell.kana}, ${sound}. Say the combination as one beat.`,
      es: `${letters[0]} + ${small} pequeña forman ${cell.kana}, ${sound}. Di la combinación en un solo tiempo.`,
    });
  }
  const decomposed = cell.kana.normalize('NFD');
  if (decomposed.includes('\u3099')) {
    return t({
      en: `${decomposed[0]} gains two dots: ${cell.kana}, ${sound}. The dots change the sound, not the base shape.`,
      es: `${decomposed[0]} lleva dos puntos: ${cell.kana}, ${sound}. Los puntos cambian el sonido, no la forma de base.`,
    });
  }
  if (decomposed.includes('\u309a')) {
    return t({
      en: `${decomposed[0]} gains a small circle: ${cell.kana}, ${sound}. The circle makes a p sound.`,
      es: `${decomposed[0]} lleva un circulito: ${cell.kana}, ${sound}. El círculo da un sonido p.`,
    });
  }
  return t({
    en: `Trace the shape of ${cell.kana} with your eyes, then listen and say ${sound}.`,
    es: `Recorre con la vista la forma de ${cell.kana}, luego escucha y di ${sound}.`,
  });
}

export function gameKana(script = 'hiragana', selected = []) {
  const allowed = new Set(Array.isArray(selected) ? selected : []);
  return kanaChart(script).filter((s) => s.id !== 'timing').flatMap((s) => s.cells)
    .filter((c) => c.kana && allowed.has(c.id))
    .map((c) => ({ ...c, sound: kanaRomaji(c.spoken), hint: hintFor(c, script) + (c.id === 'を' ? t({ en: ' Usually pronounced o; some charts label it wo.', es: ' Suele pronunciarse o; algunas tablas la escriben wo.' }) : '') }));
}

function neighbours(cell, pool, script) {
  const shapes = new Set(KANA_SETS.filter((s) => s.script === script && s.chars.some(([ch]) => ch === cell.kana)).flatMap((s) => s.chars.map(([ch]) => ch)));
  return pool.filter((other) => other.sound !== cell.sound && shapes.has(other.kana));
}

export function kanaGameSetup({ script = 'hiragana', mode = 'read', selected = [] } = {}) {
  const pool = gameKana(script, selected);
  const candidates = mode === 'apart' ? pool.filter((c) => neighbours(c, pool, script).length) : pool;
  const useful = new Set(candidates.map((c) => c.sound)).size;
  return {
    count: candidates.length,
    ready: scripts.includes(script) && KANA_GAME_MODES.includes(mode) && useful >= 2,
    message: mode === 'apart'
      ? t({ en: 'Choose both members of a similar pair, such as ぬ / め or シ / ツ. Only selected kana appear.', es: 'Elige los dos miembros de un par parecido, como ぬ / め o シ / ツ. Solo aparecen los kana elegidos.' })
      : t({ en: 'Choose at least two kana with different sounds. Small tsu and the long-vowel bar need a word, so they stay in reading practice.', es: 'Elige al menos dos kana con sonidos distintos. La tsu pequeña y la barra de vocal larga necesitan una palabra, así que se quedan en la práctica de lectura.' }),
  };
}

function question(cell, pool, mode, script, rand) {
  const others = mode === 'apart' ? neighbours(cell, pool, script) : pool.filter((c) => c.id !== cell.id);
  const options = [cell];
  for (const c of shuffle(others, rand)) {
    if (options.length === 4) break;
    if (options.every((o) => o.sound !== c.sound)) options.push(c);
  }
  return { target: cell.id, options: shuffle(options.map((c) => c.id), rand) };
}

/** The document contains bounded counters and a resumable round, not user text. */
export class KanaGames {
  constructor(document) {
    this.stats = {};
    this.kana = {};
    this.round = null;
    this.recovered = false;
    if (document == null) return;
    if (document.v !== 1 || typeof document.stats !== 'object' || !document.stats) { this.recovered = true; return; }
    if (document.kana != null) this.readKana(document.kana);
    for (const script of scripts) for (const mode of KANA_GAME_MODES) {
      const key = keyOf(script, mode), value = document.stats[key];
      if (value == null) continue;
      if (typeof value !== 'object' || Array.isArray(value)) { this.recovered = true; continue; }
      const validIds = new Set(kanaChart(script).flatMap((s) => s.cells).filter((c) => c.kana).map((c) => c.id));
      const misses = {};
      if (typeof value.misses !== 'object' || !value.misses || Array.isArray(value.misses)) this.recovered = true;
      for (const [id, n] of Object.entries(value.misses || {})) {
        if (!validIds.has(id) || n !== count(n)) this.recovered = true;
        if (validIds.has(id) && count(n)) misses[id] = count(n);
      }
      const answered = count(value.answered), correct = Math.min(answered, count(value.correct));
      const normalized = { rounds: count(value.rounds), best: Math.min(ROUND, count(value.best)), correct, answered, assisted: Math.min(answered - correct, count(value.assisted)), misses };
      if (['rounds', 'best', 'correct', 'answered', 'assisted'].some((k) => value[k] !== normalized[k])) this.recovered = true;
      this.stats[key] = normalized;
    }
    if (document.round != null) {
      if (this.validRound(document.round)) this.round = structuredRound(document.round);
      else this.recovered = true;
    }
  }

  /** Per-kana records, read field by field: a damaged one is dropped and flagged. */
  readKana(value) {
    if (typeof value !== 'object' || Array.isArray(value)) { this.recovered = true; return; }
    const valid = new Set(scripts.flatMap((script) => chartIds(script).map((id) => `${script}:${id}`)));
    for (const [key, rec] of Object.entries(value)) {
      const ok = valid.has(key) && rec && typeof rec === 'object' && !Array.isArray(rec)
        && rec.seen === count(rec.seen) && rec.missed === count(rec.missed) && rec.missed <= rec.seen
        && rec.recent === count(rec.recent) && rec.recent <= 1000 && (rec.missed > 0 || rec.recent === 0)
        && rec.timed === count(rec.timed) && rec.timed <= rec.seen
        && (rec.ms === null ? rec.timed === 0 : isAnswerTime(rec.ms) && rec.timed > 0);
      if (!ok) { this.recovered = true; continue; }
      this.kana[key] = { seen: rec.seen, missed: rec.missed, recent: rec.recent, ms: rec.ms, timed: rec.timed };
    }
  }

  validRound(r) {
    if (!r || !scripts.includes(r.script) || !KANA_GAME_MODES.includes(r.mode) || !kanaGameSetup(r).ready || typeof r.id !== 'string' || r.id.length > 80 || !Number.isInteger(r.at) || r.at < 0 || r.at > ROUND || !Array.isArray(r.questions) || r.questions.length !== ROUND || !Array.isArray(r.picks)) return false;
    if (r.picks.length < r.at || r.picks.length > Math.min(ROUND, r.at + 1) || typeof r.hinted !== 'boolean') return false;
    const pool = gameKana(r.script, r.selected), byId = new Map(pool.map((c) => [c.id, c]));
    if (r.focus !== undefined && (!Array.isArray(r.focus) || !r.focus.length || new Set(r.focus).size !== r.focus.length || r.focus.some((id) => !byId.has(id)))) return false;
    return r.questions.every((q, i) => {
      const target = byId.get(q.target);
      if (!target || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4 || !q.options.includes(q.target)) return false;
      if (r.focus && !r.focus.includes(q.target)) return false;
      const options = q.options.map((id) => byId.get(id));
      if (options.some((c) => !c) || new Set(options.map((c) => c.sound)).size !== options.length) return false;
      if (r.mode === 'apart' && options.some((c) => c.id !== target.id && !neighbours(target, pool, r.script).some((n) => n.id === c.id))) return false;
      const pick = r.picks[i];
      return i >= r.picks.length || (pick && typeof pick.hint === 'boolean' && (pick.id === null || q.options.includes(pick.id))
        && (pick.ms === undefined || (isAnswerTime(pick.ms) && pick.id === q.target && !pick.hint && r.mode !== 'listen')));
    });
  }

  /**
   * A round of ten. `focus`, when given, is a drill: only those kana are asked
   * (the learner's weak kana), while the wrong answers still come from the
   * whole `selected` pool, so a drill of three kana keeps four real choices.
   */
  start({ script = 'hiragana', mode = 'read', selected = [], focus = null, seed = Date.now() } = {}) {
    if (this.round && this.round.at < ROUND) throw new Error(t({ en: 'Finish or leave the current round first.', es: 'Termina o deja primero la ronda actual.' }));
    if (!kanaGameSetup({ script, mode, selected }).ready) throw new Error(t({ en: 'Choose at least two useful kana.', es: 'Elige al menos dos kana útiles.' }));
    const pool = gameKana(script, selected), rand = makeRand(seed);
    let candidates = mode === 'apart' ? pool.filter((c) => neighbours(c, pool, script).length) : pool;
    if (focus != null) {
      const wanted = new Set(Array.isArray(focus) ? focus : []);
      if (!wanted.size || [...wanted].some((id) => !pool.some((c) => c.id === id))) throw new Error(t({ en: 'A drill asks only kana from the selection.', es: 'Una práctica dirigida pregunta solo kana de tu selección.' }));
      candidates = candidates.filter((c) => wanted.has(c.id));
      if (new Set(candidates.map((c) => c.sound)).size < 2) throw new Error(t({ en: 'A drill needs at least two kana with different sounds.', es: 'Una práctica dirigida necesita al menos dos kana con sonidos distintos.' }));
    }
    const stats = this.stats[keyOf(script, mode)] || emptyStats();
    const questions = [];
    let remaining = [];
    for (let n = 0; n < ROUND; n++) {
      if (!remaining.length) remaining = [...candidates];
      const last = questions.at(-1)?.target;
      const eligible = remaining.filter((c) => c.id !== last);
      const cell = drawWeighted(eligible.length ? eligible : remaining, 1, (c) => weightOf(stats.misses[c.id] || 0), rand)[0];
      remaining = remaining.filter((c) => c.id !== cell.id);
      questions.push(question(cell, pool, mode, script, rand));
    }
    this.round = { id: `${script}:${mode}:${Number(seed) >>> 0}`, script, mode, selected: pool.map((c) => c.id), questions, at: 0, picks: [], hinted: false };
    if (focus != null) this.round.focus = candidates.map((c) => c.id);
    return this.view();
  }

  /**
   * The learner's weak kana in `script`, weakest first: those missed lately
   * (by the recent miss rate) and those answered slowly (by how far past the
   * learner's own median). `ready` says whether they make a drill: at least
   * two kana with different sounds.
   */
  weakKana({ script = 'hiragana', limit = WEAK_LIMIT } = {}) {
    if (!scripts.includes(script)) return { script, median: null, kana: [], ready: false };
    const cells = new Map(gameKana(script, chartIds(script)).map((c, i) => [c.id, { ...c, order: i }]));
    const records = Object.entries(this.kana)
      .filter(([key]) => key.startsWith(`${script}:`))
      .map(([key, rec]) => ({ id: key.slice(script.length + 1), ...rec }))
      .filter((rec) => cells.has(rec.id) && rec.seen > 0);
    const times = records.filter((rec) => rec.ms !== null).map((rec) => rec.ms).sort((a, b) => a - b);
    const median = times.length >= 4 ? times[Math.floor(times.length / 2)] : null;
    const kana = records
      .map((rec) => {
        const slow = median !== null && rec.timed >= 2 && rec.ms >= median * SLOW_FACTOR;
        const missing = rec.recent >= WEAK_RECENT;
        return { ...rec, slow, missing, score: (missing ? rec.recent / 1000 : 0) + (slow ? Math.min(1.5, rec.ms / median - 1) : 0) };
      })
      .filter((rec) => rec.missing || rec.slow)
      .sort((a, b) => b.score - a.score || b.missed - a.missed || cells.get(a.id).order - cells.get(b.id).order)
      .slice(0, Math.max(1, Math.min(WEAK_LIMIT, limit | 0)))
      .map((rec) => {
        const cell = cells.get(rec.id);
        return { id: rec.id, kana: cell.kana, sound: cell.sound, seen: rec.seen, missed: rec.missed, ms: rec.ms, missing: rec.missing, slow: rec.slow };
      });
    return { script, median, kana, ready: new Set(kana.map((k) => k.sound)).size >= 2 };
  }

  act(action, { id, pick, ms } = {}) {
    const r = this.round;
    if (!r) return this.view();
    if (action === 'leave') { this.round = null; return this.view(); }
    if (r.at >= ROUND || id !== `${r.id}:${r.at}`) return this.view();
    const q = r.questions[r.at];
    const answered = r.picks.length > r.at;
    if (action === 'hint' && !answered) r.hinted = true;
    if ((action === 'answer' || action === 'skip') && !answered) {
      if (action === 'answer' && !q.options.includes(pick)) return this.view();
      const entry = { id: action === 'skip' ? null : pick, hint: r.hinted };
      // How long a right, unaided answer took, as the app measured it.
      if (action === 'answer' && pick === q.target && !r.hinted && r.mode !== 'listen' && isAnswerTime(ms)) entry.ms = ms;
      r.picks.push(entry);
      // Revisit a missed shape later in this round, with a few questions in
      // between. The round stays ten questions; no punishment or extra lives.
      if (pick !== q.target && r.at + 3 < ROUND) {
        const later = r.at + 3;
        r.questions[later] = { target: q.target, options: [...q.options] };
      }
    }
    if (action === 'next' && answered) {
      r.at += 1; r.hinted = false;
      if (r.at === ROUND) this.record();
    }
    return this.view();
  }

  record() {
    const r = this.round, key = keyOf(r.script, r.mode), s = this.stats[key] || emptyStats();
    const result = this.result();
    s.rounds = Math.min(1000000, s.rounds + 1);
    // A perfect drill on two kana is not a best score for the whole selection.
    if (!r.focus) s.best = Math.max(s.best, result.correct);
    s.correct = Math.min(1000000, s.correct + result.correct);
    s.answered = Math.min(1000000, s.answered + ROUND);
    s.assisted = Math.min(1000000, s.assisted + result.assisted);
    r.picks.forEach((p, i) => {
      const id = r.questions[i].target;
      const missed = p.id !== id || p.hint;
      if (missed) s.misses[id] = Math.min(1000000, (s.misses[id] || 0) + 1);
      const k = this.kana[`${r.script}:${id}`] || { seen: 0, missed: 0, recent: 0, ms: null, timed: 0 };
      k.seen = Math.min(1000000, k.seen + 1);
      if (missed) k.missed = Math.min(k.seen, k.missed + 1);
      k.recent = Math.round(k.recent + ALPHA * ((missed ? 1000 : 0) - k.recent));
      if (p.ms !== undefined) {
        k.ms = k.ms === null ? p.ms : Math.round(k.ms + ALPHA * (p.ms - k.ms));
        k.timed = Math.min(k.seen, k.timed + 1);
      }
      this.kana[`${r.script}:${id}`] = k;
    });
    this.stats[key] = s;
  }

  result() {
    const r = this.round;
    return {
      correct: r.picks.filter((p, i) => p.id === r.questions[i].target && !p.hint).length,
      assisted: r.picks.filter((p) => p.hint).length,
      skipped: r.picks.filter((p) => p.id === null).length,
      total: ROUND,
    };
  }

  view() {
    const base = { recovered: this.recovered, stats: this.stats, status: 'idle', round: null };
    const r = this.round;
    if (!r) return base;
    const details = { script: r.script, mode: r.mode, drill: Boolean(r.focus), position: Math.min(r.at + 1, ROUND), total: ROUND, result: this.result(), question: null };
    if (r.at === ROUND) return { ...base, status: 'complete', round: details };
    const pool = gameKana(r.script, r.selected), byId = new Map(pool.map((c) => [c.id, c]));
    const q = r.questions[r.at], target = byId.get(q.target), pick = r.picks[r.at];
    const revealed = Boolean(pick);
    details.question = {
      id: `${r.id}:${r.at}`, prompt: r.mode === 'read' ? target.kana : r.mode === 'apart' ? target.sound : null,
      spoken: target.spoken, answered: revealed, hinted: r.hinted,
      hint: r.hinted && !revealed ? target.hint : null,
      correctId: revealed ? target.id : null, pickedId: pick?.id ?? null,
      right: revealed ? pick.id === target.id : null,
      options: q.options.map((id) => {
        const c = byId.get(id);
        return { id, label: r.mode === 'read' ? c.sound : c.kana, kana: revealed ? c.kana : null, romaji: revealed ? c.sound : null, hint: revealed ? c.hint : null };
      }),
    };
    return { ...base, status: 'playing', round: details };
  }

  dump() { return { v: 1, stats: this.stats, kana: this.kana, round: this.round }; }
}

const structuredRound = (r) => JSON.parse(JSON.stringify(r));
