// The four games' question screens, drawn into #pl-body by render-play.js:
// a mode switch where a game has one, the question, the options as buttons,
// and, once answered, the right option marked, a one-line reason and Next.
//
// Focus is events-play.js's: a new question focuses its prompt (#pl-prompt),
// an answer its feedback (#pl-feedback), so a screen reader hears the
// question, then the answer, and a keyboard user's next key goes on. The key
// hints are drawn as <kbd> and hidden on a touch screen, as the review's are.
//
// A cycle on purpose, and a safe one: render-play.js imports gameNodes from
// here and this file imports its helpers from there; neither touches the
// other while it loads.

import { h, withJa } from './utils.js';
import { ui, t } from './strings.js';
import { spelled } from './kana.js';
import { view, meaningText } from './render-mykanji.js';
import {
  play, uiNodes, ja, kanjiLine, nameLine, wordLine, readingOf,
} from './render-play.js';
import {
  current, answeredNow, nameClass, ROUND,
} from './play-rounds.js';
import { KANA_SETS } from './play-kana.js';
import { TWINS } from './play-twins.js';
import { withKanji } from './render-save.js';

const SCRIPT_KEY = { hiragana: 'scriptHiragana', katakana: 'scriptKatakana', kanji: 'scriptKanji' };
const CLASS_KEY = { person: 'namePerson', place: 'namePlace' };

function seg(labelKey, act, values, pressed) {
  const id = `pl-seg-${act}`;
  return h('div', { class: 'mk-controls' }, h('div', { class: 'seg', role: 'group', 'aria-labelledby': id }, [
    h('span', { class: 'seg-label', id }, ui(labelKey)),
    ...values.map(([value, key]) => h('button', {
      type: 'button', class: 'seg-btn', 'data-act': act, 'data-mode': value, 'aria-pressed': String(pressed === value),
    }, ui(key))),
  ]));
}

function keysLine(key) {
  return h('p', { class: 'rv-keys' }, ui(key));
}

function questionHead(r) {
  return h('h3', { class: 'mk-sec-title rv-title' }, h('span', { class: 'mk-count' }, ui('questionOf', { at: Math.min(r.at + 1, r.questions.length), of: r.questions.length })));
}

function hearButton() {
  if (!play.speech) return null;
  return h('button', { type: 'button', class: 'btn btn--ghost btn--sm pl-hear', 'data-act': 'pl-hear' }, ui('hear'));
}

/**
 * The options, as buttons keyed 1 to n. Once the question is answered the
 * right one is marked, and a wrong pick too, each with words for a screen
 * reader, and none acts again.
 */
function optionList(r, label, { wide = false } = {}) {
  const cls = wide ? `pl-opts pl-opts--wide${current(r).options.length === 3 ? ' pl-opts--three' : ''}` : 'pl-opts';
  const q = current(r);
  const done = answeredNow(r);
  const pick = done ? r.picks[r.at].pick : null;
  return h('ul', { class: cls, role: 'list' }, q.options.map((opt, ix) => {
    const right = done && opt === q.answer;
    const wrong = done && opt === pick && !right;
    return h('li', null, h('button', {
      type: 'button',
      class: `pl-opt${right ? ' is-right' : ''}${wrong ? ' is-wrong' : ''}`,
      'data-act': 'pl-pick',
      'data-ix': ix,
      'aria-keyshortcuts': String(ix + 1),
      'aria-disabled': done ? 'true' : null,
    }, [
      h('kbd', { class: 'rv-kbd', 'aria-hidden': 'true' }, String(ix + 1)),
      label(opt),
      right ? h('span', { class: 'pl-tag' }, [h('span', { 'aria-hidden': 'true' }, '✓'), h('span', { class: 'sr-only' }, `, ${ui('optRight')}`)]) : null,
      wrong ? h('span', { class: 'pl-tag' }, [h('span', { 'aria-hidden': 'true' }, '✗'), h('span', { class: 'sr-only' }, `, ${ui('optYours')}`)]) : null,
    ]));
  }));
}

/**
 * The feedback block: the mark, the reason lines and Next, in that order for
 * a screen reader and the keyboard. play.css draws Next on the mark's row, so
 * the way on takes no line of its own: in a host's sheet at 390x844 it sat
 * below what the sheet shows, and WebKit lets no frame scroll its host.
 */
function feedbackBlock({ right, mark, why, last, cls = '' }) {
  return h('div', { class: `pl-feedback${right ? ' is-right' : ''}${cls}`, id: 'pl-feedback', tabindex: '-1' }, [
    h('p', { class: 'pl-mark' }, mark),
    ...why.filter(Boolean).map((line) => h('p', { class: 'pl-why' }, line)),
    h('p', { class: 'mk-actions' }, h('button', {
      type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'pl-next', 'aria-keyshortcuts': 'Enter Space',
    }, ui(last ? 'seeScore' : 'next'))),
  ]);
}

/** After an answer: right or not, why, and the way on. */
function feedback(r, why) {
  const p = r.picks[r.at];
  return feedbackBlock({
    right: p.right, mark: ui(p.right ? 'rightMark' : 'wrongMark'), why, last: r.at >= r.questions.length - 1,
  });
}

function prompt(children, cls = '') {
  return h('div', { class: `pl-prompt ${cls}`.trim(), id: 'pl-prompt', tabindex: '-1' }, children);
}

function loading(state, error, keys) {
  if (state === 'error') return h('p', { class: 'read-error', role: 'alert' }, [h('span', null, ui(keys.failed, { detail: error })), ' ', h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'pl-retry' }, ui('retry'))]);
  return h('p', { class: 'mk-empty' }, ui(keys.loading));
}

// ── Which one? ────────────────────────────────────────────────────────────

function whichNodes() {
  const w = play.which;
  const out = [seg('modeShow', 'pl-mode', [['kana', 'modeKana'], ['kanji', 'modeKanji']], w.mode)];
  if (w.mode === 'kanji') {
    if (play.look.state !== 'ready') return [...out, loading(play.look.state, play.look.error, { failed: 'lookalikesFailed', loading: 'lookalikesLoading' })];
    if (w.filled) out.push(h('p', { class: 'quiet' }, w.own ? ui('poolFilled', { n: w.own }) : ui('poolFilledNone')));
  }
  const r = w.round;
  if (!r || !current(r)) return out;
  const q = current(r);
  let ask;
  if (q.kind === 'kana') {
    ask = prompt([h('p', { class: 'pl-ask' }, uiNodes('whichKana', { romaji: h('strong', { class: 'pl-romaji-big' }, q.romaji) })), hearButton()]);
  } else {
    const info = view.info.get(q.answer);
    const reading = readingOf(info);
    ask = prompt([
      h('p', { class: 'pl-ask' }, ui('whichKanji')),
      info ? h('p', { class: 'pl-meaning' }, [h('span', { lang: 'en' }, meaningText(info, 2)), reading ? [' · ', ja(reading)] : null])
        : h('p', { class: 'quiet' }, ui(view.info.has(q.answer) ? 'noInfo' : 'loadingKanji')),
    ]);
  }
  out.push(h('section', { class: 'mk-sec pl-q', 'aria-labelledby': 'pl-title' }, [
    questionHead(r),
    ask,
    optionList(r, (ch) => ja(ch, 'pl-ch')),
    answeredNow(r) ? feedback(r, whichWhy(q, r.picks[r.at])) : null,
    keysLine('keysFour'),
  ]));
  return out;
}

function whichWhy(q, p) {
  if (q.kind === 'kana') {
    return [
      [ja(q.answer, 'pl-kch'), ' ', h('span', { class: 'pl-romaji' }, q.romaji), ': ', ...withJa(t(q.hint))],
      p.right ? null : [ja(p.pick, 'pl-kch'), ' ', h('span', { class: 'pl-romaji' }, spelled(p.pick))],
    ];
  }
  const other = p.right ? q.options.find((o) => o !== q.answer) : p.pick;
  return [kanjiLine(q.answer), other ? kanjiLine(other) : null];
}

// ── Odd one out ───────────────────────────────────────────────────────────

/** Why the odd one is odd: the kana's hint from the set holding both, or both kanji. */
export function oddWhy(g) {
  const set = KANA_SETS.find((s) => s.chars.some(([ch]) => ch === g.odd) && s.chars.some(([ch]) => ch === g.base));
  if (set) {
    const hint = set.chars.find(([ch]) => ch === g.odd)[1];
    return [ja(g.odd, 'pl-kch'), ' ', h('span', { class: 'pl-romaji' }, spelled(g.odd)), ': ', ...withJa(t(hint))];
  }
  return [kanjiLine(g.odd), ' · ', kanjiLine(g.base)];
}

function gridNodes(g, focusIx) {
  const n = g.size * g.size;
  const cells = [];
  for (let i = 0; i < n; i += 1) {
    const ch = i === g.at ? g.odd : g.base;
    const found = g.solved && i === g.at;
    const missed = g.missed && g.missed.has(i);
    cells.push(h('button', {
      type: 'button',
      class: `pl-cell${found ? ' is-right' : ''}${missed ? ' is-wrong' : ''}`,
      'data-act': 'pl-cell',
      'data-ix': i,
      tabindex: i === focusIx ? '0' : '-1',
      'aria-disabled': g.solved ? 'true' : null,
    }, ja(ch)));
  }
  return h('div', {
    class: 'pl-grid', role: 'group', 'data-size': g.size, 'aria-label': ui('gridLabel', { n }), 'aria-describedby': g.solved && play.odd.mode === 'free' ? 'pl-feedback' : 'pl-prompt',
  }, cells);
}

function oddNodes() {
  const o = play.odd;
  const s = o.sit;
  const out = [seg('modeLabel', 'pl-oddmode', [['timed', 'modeTimed'], ['free', 'modeFree']], o.mode)];
  if (o.mode === 'timed' && (!s || (!o.running && !s.found && !s.grid))) {
    out.push(h('section', { class: 'mk-sec pl-q', 'aria-labelledby': 'pl-title' }, [
      prompt(h('p', { class: 'mk-line' }, ui('timedIntro'))),
      h('p', { class: 'mk-actions' }, h('button', { type: 'button', class: 'btn btn--primary', 'data-act': 'pl-clock' }, ui('startClock'))),
      keysLine('keysGrid'),
    ]));
    return out;
  }
  if (!s || !s.grid) return out;
  const g = s.grid;
  const found = o.mode === 'free' && g.solved;
  const status = o.mode === 'timed'
    ? [h('span', { id: 'pl-timer', role: 'timer' }, ui('timeLeft', { n: Math.ceil(o.left / 1000) })), ' · ', ui('foundSoFar', { n: s.found })]
    : [ui('gridOf', { at: Math.min(s.found + (g.solved ? 0 : 1), ROUND), of: ROUND })];
  // A found grid's feedback takes the prompt's place, above the grid: below
  // it, the reason and Next fell under what a host's sheet shows, at 390 and
  // at 1440, and a grid is too tall to keep them in view any other way.
  out.push(h('section', { class: 'mk-sec pl-q', 'aria-labelledby': 'pl-title' }, [
    h('p', { class: 'pl-status mk-count' }, status),
    o.mode === 'free' && !s.found && !g.solved ? h('p', { class: 'quiet' }, ui('freeIntro')) : null,
    found
      ? feedbackBlock({ right: true, mark: ui('oddFound'), why: [oddWhy(g)], last: s.over, cls: ' pl-feedback--top' })
      : prompt(h('p', { class: 'pl-ask' }, withKanji('oddPrompt', g.base)), 'pl-prompt--odd'),
    found ? null : h('p', { class: 'pl-live', id: 'pl-live', 'aria-live': 'polite' }, o.line || ''),
    gridNodes(g, Number.isInteger(o.cursor) ? o.cursor : 0),
    o.mode === 'timed' && o.last ? h('p', { class: 'pl-why pl-last' }, [h('span', { class: 'kj-key' }, ui('oddLast')), ' ', ...oddWhy(o.last)]) : null,
    keysLine('keysGrid'),
  ]));
  return out;
}

// ── Twins across scripts ──────────────────────────────────────────────────

function markedWord(word, ch) {
  return h('p', { class: 'pl-word', lang: 'ja' }, [...word].map((c) => (c === ch ? h('mark', { class: 'pl-twin' }, c) : c)));
}

function twinsNodes() {
  const r = play.twins.round;
  if (!r || !current(r)) return [];
  const q = current(r);
  const pair = TWINS.find((p) => p.id === q.id);
  return [h('section', { class: 'mk-sec pl-q', 'aria-labelledby': 'pl-title' }, [
    questionHead(r),
    prompt([h('p', { class: 'pl-ask' }, ui('twinsPrompt')), markedWord(q.word, q.ch)]),
    optionList(r, (s) => h('span', { class: 'pl-opt-text' }, ui(SCRIPT_KEY[s])), { wide: true }),
    answeredNow(r) ? feedback(r, [
      uiNodes('twinsIs', { ch: ja(q.ch, 'pl-kch'), script: h('strong', null, ui(SCRIPT_KEY[q.answer])) }),
      wordLine(q.word, q.reading, q.meaning),
      pair ? withJa(t(pair.note)) : null,
    ]) : null,
    keysLine('keysThree'),
  ])];
}

// ── Name decoder ──────────────────────────────────────────────────────────

function namesNodes() {
  if (play.names.state === 'missing') return [h('p', { class: 'mk-empty' }, ui('namesMissing'))];
  if (play.names.state !== 'ready') return [loading(play.names.state, play.names.error, { failed: 'namesFailed', loading: 'namesLoading' })];
  const r = play.name.round;
  if (!r || !current(r)) return [h('p', { class: 'mk-empty' }, ui('namesFew'))];
  const q = current(r);
  return [h('section', { class: 'mk-sec pl-q', 'aria-labelledby': 'pl-title' }, [
    questionHead(r),
    prompt([
      h('p', { class: 'pl-ask' }, ui('namesPrompt')),
      h('p', { class: 'pl-name' }, [ja(q.kata), ' ', h('span', { class: 'mk-meta' }, ui(CLASS_KEY[nameClass(q.type)]))]),
      hearButton(),
    ]),
    optionList(r, (s) => h('span', { class: 'pl-opt-text' }, s), { wide: true }),
    answeredNow(r) ? feedback(r, [nameLine(q.kata, q.answer)]) : null,
    keysLine('keysFour'),
  ])];
}

/** The nodes of one game's question screen. */
export function gameNodes(game) {
  if (game === 'which') return whichNodes();
  if (game === 'odd') return oddNodes();
  if (game === 'twins') return twinsNodes();
  if (game === 'names') return namesNodes();
  return [];
}

