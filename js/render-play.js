// Play (#/play): the four games as a list, and what every game screen
// shares: the title, the note, the answer marks, the reason lines and the
// result. The question screens are render-games.js; events-play.js keeps the
// rounds and the clock and calls paintPlay() after every change.
//
// It looks like My kanji because it is drawn with My kanji's pieces: a
// hairline list, .seg switches, .btn variants, the accent spent on one
// action per screen (Play again), and a right answer lit with the
// Collection's tile wash. Characters reach the page as text nodes, in
// lang="ja" spans; a button finds its option by data-ix, its place in the
// list this file drew, never by a character in an attribute.

import { $, h, fill, withJa } from './utils.js';
import { ui, t, currentLang } from './strings.js';
import { spelled, beats, toHira } from './kana.js';
import { myKanji } from './kanji-store.js';
import { view, meaningText } from './render-mykanji.js';
import { saveToggle } from './render-save.js';
import { myPlay, TOP } from './play-store.js';
import { mixUps, ROUND } from './play-rounds.js';
import { gameOf, GAMES } from './routes.js';
import { gameNodes } from './render-games.js';

/** The screen's own state; events-play.js changes it and repaints. */
export const play = {
  route: 'play',
  note: '',
  look: { state: 'idle', map: null, error: '' },
  names: { state: 'idle', rows: null, error: '' },
  which: { mode: 'kana', round: null, pool: null, filled: false, own: 0 },
  odd: { mode: null, sit: null, left: 60000, running: false, line: '', last: null },
  twins: { round: null },
  name: { round: null },
  result: null,
  saveList: [],
  speech: false,
};

const GAME_KEY = { which: 'gameWhich', odd: 'gameOdd', twins: 'gameTwins', names: 'gameNames' };
const LEAD_KEY = { which: 'gameWhichLead', odd: 'gameOddLead', twins: 'gameTwinsLead', names: 'gameNamesLead' };

/** A ui string with {name} placeholders filled by nodes (a character in its lang="ja" span). */
export function uiNodes(key, nodes) {
  const raw = ui(key);
  const out = [];
  let at = 0;
  for (const m of raw.matchAll(/\{(\w+)\}/g)) {
    if (m.index > at) out.push(raw.slice(at, m.index));
    out.push(Object.hasOwn(nodes, m[1]) ? nodes[m[1]] : m[0]);
    at = m.index + m[0].length;
  }
  if (at < raw.length) out.push(raw.slice(at));
  return out;
}

export const ja = (text, cls) => h('span', { lang: 'ja', class: cls || null }, text);

/** A kanji's reading for a prompt: its first kun reading as a word, or its first on reading. */
export function readingOf(info) {
  const clean = (r) => String(r || '').replace(/[.-]/g, '');
  const kun = ((info && info.kun) || []).map(clean).filter(Boolean);
  const on = ((info && info.on) || []).map(clean).filter(Boolean);
  return kun[0] || on[0] || '';
}

/** "未 not yet, un- (ミ, いま)": a kanji, two meanings and its readings, as nodes. */
export function kanjiLine(ch) {
  const info = view.info.get(ch);
  const reads = info ? [...new Set([...(info.on || []).slice(0, 1), ...(info.kun || []).slice(0, 1)].map((r) => String(r).replace(/[.-]/g, '')))] : [];
  return h('span', { class: 'pl-kline' }, [
    ja(ch, 'pl-kch'), ' ',
    info ? h('span', { lang: 'en' }, meaningText(info, 2)) : h('span', { class: 'quiet' }, ui(view.info.has(ch) ? 'noInfo' : 'loadingKanji')),
    reads.length ? [' (', ja(reads.join('、')), ')'] : null,
  ]);
}

/** "ト-ム reads to-mu: Tom", for a name. */
export function nameLine(kata, orig) {
  return h('span', null, uiNodes('nameReads', {
    kana: ja(beats(kata).join('-')),
    romaji: h('span', { class: 'pl-romaji' }, spelled(kata)),
    orig: h('strong', null, orig),
  }));
}

/** A word with its reading, its romaji and its meaning: "カメラ かめら (ka-me-ra): camera". */
export function wordLine(word, reading, meaning) {
  return h('span', null, [
    ja(word, 'pl-wword'), ' ', ja(reading), ' ', h('span', { class: 'pl-romaji' }, `(${spelled(toHira(reading))})`), ': ', t(meaning),
  ]);
}

// ── The list of games ─────────────────────────────────────────────────────

function bestLine(game) {
  const store = myPlay();
  const rounds = store.rounds(game === 'odd' ? 'odd' : game) + (game === 'odd' ? store.rounds('oddFree') : 0);
  let best;
  if (game === 'odd') {
    const parts = [];
    if (store.rounds('odd')) parts.push(ui('bestTimed', { n: store.best('odd') }));
    if (store.rounds('oddFree')) parts.push(ui('bestFree', { n: store.best('oddFree'), of: TOP.oddFree }));
    best = parts.length ? parts.join(', ') : ui('bestNone');
  } else {
    best = store.rounds(game) ? ui('bestOf', { n: store.best(game), of: ROUND }) : ui('bestNone');
  }
  return rounds ? `${best} · ${ui(rounds === 1 ? 'roundsOne' : 'roundsMany', { n: rounds })}` : best;
}

function gameRow(game) {
  const id = `pl-h-${game}`;
  const missing = game === 'names' && play.names.state !== 'ready';
  let state = null;
  if (game === 'names' && play.names.state === 'missing') state = ui('namesMissing');
  else if (game === 'names' && play.names.state === 'error') state = ui('namesFailed', { detail: play.names.error });
  else if (game === 'names' && play.names.state !== 'ready') state = ui('namesLoading');
  return h('li', { class: 'pl-game' }, [
    h('div', { class: 'mk-main' }, [
      h('h3', { class: 'pl-game-name', id }, ui(GAME_KEY[game])),
      h('p', { class: 'mk-mean' }, withJa(ui(LEAD_KEY[game]))),
      h('p', { class: 'mk-meta' }, bestLine(game)),
      state ? h('p', { class: 'mk-meta pl-state' }, state) : null,
    ]),
    missing ? null : h('button', {
      type: 'button', class: 'btn btn--secondary btn--sm pl-start', 'data-act': 'pl-start', 'data-game': game, 'aria-describedby': id,
    }, ui('start')),
  ]);
}

function hubNodes() {
  return [h('ul', { class: 'mk-list pl-games', role: 'list' }, GAMES.map(gameRow))];
}

// ── The result ────────────────────────────────────────────────────────────

function mixedNodes(r) {
  if (r.game === 'names') {
    if (!r.mixups.length) return h('p', { class: 'mk-empty' }, ui('mixedNone'));
    return h('ul', { class: 'mk-list', role: 'list' }, r.mixups.map(([kata, orig]) => h('li', { class: 'pl-mix' }, [
      h('span', { class: 'pl-mix-pair' }, ja(kata)), h('span', { class: 'mk-main' }, nameLine(kata, orig)),
    ])));
  }
  if (!r.mixups.length) return h('p', { class: 'mk-empty' }, ui('mixedNone'));
  const mine = myKanji();
  play.saveList = [];
  return [
    h('p', { class: 'quiet' }, ui('mixedLead')),
    h('ul', { class: 'mk-list', role: 'list' }, r.mixups.map(([a, b]) => h('li', { class: 'pl-mix' }, [
      h('span', { class: 'pl-mix-pair', lang: 'ja' }, `${a} ${b}`),
      h('span', { class: 'pl-mix-kanji' }, [a, b].filter((ch) => /\p{Script=Han}/u.test(ch)).map((ch) => {
        const ix = play.saveList.push(ch) - 1;
        return h('span', { class: 'pl-mix-one' }, [kanjiLine(ch), saveToggle(ch, mine.isSaved(ch), { 'data-act': 'pl-save', 'data-ix': ix })]);
      })),
    ]))),
  ];
}

function resultNodes(r) {
  const of = r.timed ? null : (r.of || ROUND);
  return [h('section', { class: 'mk-sec pl-result', 'aria-labelledby': 'pl-done' }, [
    h('h3', { class: 'mk-sec-title', id: 'pl-done', tabindex: '-1' }, ui('resultHead')),
    h('p', { class: 'pl-score' }, r.timed ? ui('resultTimed', { n: r.score }) : ui('resultOf', { n: r.score, of })),
    h('p', { class: 'mk-line' }, [ui('resultBest', { n: r.best }), r.isBest ? h('strong', { class: 'pl-new' }, ` ${ui('newBest')}`) : null]),
    h('p', { class: 'mk-actions' }, h('button', { type: 'button', class: 'btn btn--primary', 'data-act': 'pl-again' }, ui('playAgain'))),
  ]), h('section', { class: 'mk-sec', 'aria-labelledby': 'pl-mixed-h' }, [
    h('h3', { class: 'mk-sec-title', id: 'pl-mixed-h', tabindex: '-1' }, ui(r.game === 'names' ? 'namesMissedHead' : 'mixedHead')),
    mixedNodes(r),
  ])];
}

/** The result of a round, from the round and the store's answer. */
export function resultOf(game, round, rec, extra = {}) {
  return {
    game, score: extra.score ?? 0, of: extra.of, timed: !!extra.timed, best: rec ? rec.best : 0, isBest: !!(rec && rec.isBest), mixups: extra.mixups || (round ? mixUps(round) : []),
  };
}

// ── The screen ────────────────────────────────────────────────────────────

/** The note under the title: the store's health, the meanings' language, the last action. */
function paintNote(game) {
  const el = $('pl-note');
  if (!el) return;
  const store = myPlay();
  const lines = [];
  if (store.note === 'damaged') lines.push(ui('playDamaged'));
  else if (store.note === 'partial') lines.push(ui('playPartial', { n: store.dropped }));
  if (!store.writable) lines.push(ui('playBlocked'));
  if (game === 'which' && play.which.mode === 'kanji' && currentLang() !== 'en') lines.push(ui('meaningsEnglish'));
  if (play.note) lines.push(play.note);
  const text = lines.join(' ');
  if (el.textContent !== text) el.textContent = text;
  el.hidden = !text;
}

/** Draw the route on screen into #pl-body: the list, a game, or a game's result. */
export function paintPlay() {
  const body = $('pl-body');
  if (!body) return;
  const game = gameOf(play.route);
  const title = $('pl-title');
  if (title) title.textContent = ui(game ? GAME_KEY[game] : 'play');
  const back = $('pl-back-label');
  if (back) back.textContent = ui(game ? 'backToPlay' : 'backToReader');
  const lead = $('pl-lead');
  if (lead) lead.hidden = !!game;
  if (!game) fill(body, hubNodes());
  else if (play.result && play.result.game === game) fill(body, resultNodes(play.result));
  else fill(body, gameNodes(game));
  paintNote(game);
}

/** Where focus belongs after a paint: the result, the feedback, the prompt, or the title. */
export function playFocus() {
  const game = gameOf(play.route);
  if (!game) return $('pl-title');
  if (play.result && play.result.game === game) return $('pl-done');
  return $('pl-feedback') || $('pl-prompt') || $('pl-title');
}
