// Native kana recall, shared with any future web presentation. No DOM, audio
// player or storage. The older web Play scores keep their own v1 document.
// The original shape reminders in this file are dedicated to CC0.
import { kanaChart, kanaRomaji } from './kana-chart.js';
import { KANA_SETS } from './play-kana.js';
import { ROUND, makeRand, shuffle, drawWeighted, weightOf } from './play-rounds.js';

export const KANA_GAME_MODES = ['read', 'listen', 'apart'];
const scripts = ['hiragana', 'katakana'];
const count = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000 ? n : 0;
const keyOf = (script, mode) => `${script}:${mode}`;
const emptyStats = () => ({ rounds: 0, best: 0, correct: 0, answered: 0, assisted: 0, misses: {} });

// Original shape reminders for kana outside the existing look-alike sets.
// These are observations of the printed forms, not stroke-order diagrams.
const extraHints = {
  'う': 'A short mark sits above one curved stroke. Keep the top mark separate in your mental picture.',
  'え': 'A short mark sits over a zigzag that sweeps out to the right at the bottom.',
  'か': 'Look for the separate short stroke on the right of the hooked shape.',
  'く': 'One bent stroke opens to the right, like an angle bracket.',
  'け': 'A short bar crosses the tall stroke on the right; a separate stroke stands on the left.',
  'し': 'One long stroke bends gently up to the right at the bottom.',
  'す': 'A long bar crosses a stroke that loops, then trails downward.',
  'せ': 'Two upright strokes cross a bar. The lower stroke sweeps right underneath.',
  'そ': 'Follow the zigzag at the top into the broad curve underneath.',
  'つ': 'One broad curve opens to the left, with no separate top mark.',
  'て': 'A flat top turns into a curve below it, like a small open umbrella.',
  'と': 'A short slanted stroke sits above a wide curve that opens upward.',
  'な': 'A small cross is on the left; the loop belongs to the lower right.',
  'の': 'One stroke curls around into an open spiral.',
  'ひ': 'A deep scoop hangs between two short outward ends.',
  'ふ': 'A central curve has small strokes around it. Remember the whole cluster.',
  'へ': 'A shallow roof rises on the left and slopes down to the right.',
  'む': 'A bar and a loop are on the left, with a small separate mark on the right.',
  'や': 'A long curved stroke crosses the slanted stem, with a small mark above.',
  'ゆ': 'A wide loop is crossed by a long stroke through its middle.',
  'よ': 'A short right-facing bar sits above the loop at the bottom.',
  'ら': 'A separate mark sits above a curve with a short slanted start.',
  'を': 'Follow the upper cross down into the broad curve underneath.',
  'ん': 'A sloping stroke turns into a low wave that rises at the right.',
  'イ': 'A short diagonal meets a longer upright below it.',
  'エ': 'Two level bars are joined by one upright in the middle.',
  'オ': 'A bar crosses an upright; a diagonal reaches down to the left.',
  'カ': 'A bent stroke makes the right side; a long diagonal cuts down to the left.',
  'キ': 'Two bars cross one slanted upright.',
  'サ': 'A bar crosses two uprights, with the right one extending downward.',
  'セ': 'A slanted bar meets an upright that bends right along the bottom.',
  'ト': 'A long upright has one short diagonal branch on its right.',
  'ナ': 'One bar crosses a stroke that falls to the lower left.',
  'ニ': 'Two separate level bars; the lower one is longer.',
  'ネ': 'A short mark is above the crossing strokes; a small branch reaches right.',
  'ハ': 'Two separate strokes spread outward toward the bottom.',
  'ヒ': 'A short top bar meets an upright that bends right along the bottom.',
  'ヘ': 'One shallow angled roof, rising left and falling right.',
  'ホ': 'A bar and an upright form a cross, with short strokes on both lower sides.',
  'ミ': 'Three separate slanted bars, one below another.',
  'ム': 'A diagonal turns into a flat base; a short stroke closes the lower right.',
  'モ': 'Two bars cross an upright that hooks to the right at the bottom.',
  'ヤ': 'A slanted bar bends at the right; a longer stroke cuts through it.',
  'リ': 'Two near-upright strokes; the right one reaches farther down.',
  'ル': 'A short left stroke sits beside a longer stroke that turns up to the right.',
  'レ': 'One upright bends up to the right at the bottom.',
  'ロ': 'Four sides enclose an empty square.',
};

function hintFor(cell, script) {
  const set = KANA_SETS.find((s) => s.script === script && s.chars.some(([ch]) => ch === cell.kana));
  const found = set?.chars.find(([ch]) => ch === cell.kana)?.[1].en;
  if (found) return found;
  if (extraHints[cell.kana]) return extraHints[cell.kana];
  const letters = [...cell.kana];
  if (letters.length > 1) {
    return `${letters[0]} + small ${letters.slice(1).join('')} makes ${cell.kana}, ${kanaRomaji(cell.spoken)}. Say the combination as one beat.`;
  }
  const decomposed = cell.kana.normalize('NFD');
  if (decomposed.includes('\u3099')) return `${decomposed[0]} gains two dots: ${cell.kana}, ${kanaRomaji(cell.spoken)}. The dots change the sound, not the base shape.`;
  if (decomposed.includes('\u309a')) return `${decomposed[0]} gains a small circle: ${cell.kana}, ${kanaRomaji(cell.spoken)}. The circle makes a p sound.`;
  return `Trace the shape of ${cell.kana} with your eyes, then listen and say ${kanaRomaji(cell.spoken)}.`;
}

export function gameKana(script = 'hiragana', selected = []) {
  const allowed = new Set(Array.isArray(selected) ? selected : []);
  return kanaChart(script).filter((s) => s.id !== 'timing').flatMap((s) => s.cells)
    .filter((c) => c.kana && allowed.has(c.id))
    .map((c) => ({ ...c, sound: kanaRomaji(c.spoken), hint: hintFor(c, script) + (c.id === 'を' ? ' Usually pronounced o; some charts label it wo.' : '') }));
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
    message: mode === 'apart' ? 'Choose both members of a similar pair, such as ぬ / め or シ / ツ. Only selected kana appear.' : 'Choose at least two kana with different sounds. Small tsu and the long-vowel bar need a word, so they stay in reading practice.',
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
    this.round = null;
    this.recovered = false;
    if (document == null) return;
    if (document.v !== 1 || typeof document.stats !== 'object' || !document.stats) { this.recovered = true; return; }
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

  validRound(r) {
    if (!r || !scripts.includes(r.script) || !KANA_GAME_MODES.includes(r.mode) || !kanaGameSetup(r).ready || typeof r.id !== 'string' || r.id.length > 80 || !Number.isInteger(r.at) || r.at < 0 || r.at > ROUND || !Array.isArray(r.questions) || r.questions.length !== ROUND || !Array.isArray(r.picks)) return false;
    if (r.picks.length < r.at || r.picks.length > Math.min(ROUND, r.at + 1) || typeof r.hinted !== 'boolean') return false;
    const pool = gameKana(r.script, r.selected), byId = new Map(pool.map((c) => [c.id, c]));
    return r.questions.every((q, i) => {
      const target = byId.get(q.target);
      if (!target || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4 || !q.options.includes(q.target)) return false;
      const options = q.options.map((id) => byId.get(id));
      if (options.some((c) => !c) || new Set(options.map((c) => c.sound)).size !== options.length) return false;
      if (r.mode === 'apart' && options.some((c) => c.id !== target.id && !neighbours(target, pool, r.script).some((n) => n.id === c.id))) return false;
      const pick = r.picks[i];
      return i >= r.picks.length || (pick && typeof pick.hint === 'boolean' && (pick.id === null || q.options.includes(pick.id)));
    });
  }

  start({ script = 'hiragana', mode = 'read', selected = [], seed = Date.now() } = {}) {
    if (this.round && this.round.at < ROUND) throw new Error('Finish or leave the current round first.');
    if (!kanaGameSetup({ script, mode, selected }).ready) throw new Error('Choose at least two useful kana.');
    const pool = gameKana(script, selected), rand = makeRand(seed);
    const candidates = mode === 'apart' ? pool.filter((c) => neighbours(c, pool, script).length) : pool;
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
    return this.view();
  }

  act(action, { id, pick } = {}) {
    const r = this.round;
    if (!r) return this.view();
    if (action === 'leave') { this.round = null; return this.view(); }
    if (r.at >= ROUND || id !== `${r.id}:${r.at}`) return this.view();
    const q = r.questions[r.at];
    const answered = r.picks.length > r.at;
    if (action === 'hint' && !answered) r.hinted = true;
    if ((action === 'answer' || action === 'skip') && !answered) {
      if (action === 'answer' && !q.options.includes(pick)) return this.view();
      r.picks.push({ id: action === 'skip' ? null : pick, hint: r.hinted });
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
    s.best = Math.max(s.best, result.correct);
    s.correct = Math.min(1000000, s.correct + result.correct);
    s.answered = Math.min(1000000, s.answered + ROUND);
    s.assisted = Math.min(1000000, s.assisted + result.assisted);
    r.picks.forEach((p, i) => {
      if (p.id !== r.questions[i].target || p.hint) {
        const id = r.questions[i].target;
        s.misses[id] = Math.min(1000000, (s.misses[id] || 0) + 1);
      }
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
    const details = { script: r.script, mode: r.mode, position: Math.min(r.at + 1, ROUND), total: ROUND, result: this.result(), question: null };
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

  dump() { return { v: 1, stats: this.stats, round: this.round }; }
}

const structuredRound = (r) => JSON.parse(JSON.stringify(r));
