// "Where are the spaces?": the line, its board of places, the marks once it
// is checked, the reasons, and the lines a result lists again. Drawn into
// #pl-body by render-games.js; events-spaces.js keeps the round.
//
// The board is the line again, one character after another with a toggle
// button at every place between two characters words are made of
// (gaps.js slotsOf). The characters are aria-hidden: a screen reader reads
// the line once, in the prompt, and then each place by its name, "between
// 私 and は", in a visually hidden span, text nodes like every name here. A
// button finds its place by data-ix, its index in the line's places, never by
// a character in an attribute. Every place is a 44px target: the buttons
// stand 44px apart and each reaches over half of the character on either
// side, which takes no target from anyone, since a character is not one.

import { h } from './utils.js';
import { ui, t, currentLang } from './strings.js';
import { pairAt, extraReason } from './gaps.js';
import { reasonNodes } from './render-gaps.js';
import { play, uiNodes, ja } from './render-play.js';
import {
  keysLine, questionHead, feedbackBlock, prompt, loading,
} from './render-games.js';
import { current, answeredNow } from './play-rounds.js';
import { marksOf, tierHint } from './play-spaces.js';

/** Punctuation that closes what came before it, and that opens what comes after (render-reading.js keeps them the same way). */
const CLOSING = /^[。、．，！？!?.,…‥」』）)〉》】〕]$/u;
const OPENING = /^[「『（(〈《【〔]$/u;

/** What a place is once the line is checked: found, missed, extra, or nothing. */
function stateAt(p, at) {
  if (!p) return null;
  if (p.hit.includes(at)) return 'found';
  if (p.missing.includes(at)) return 'missed';
  if (p.extra.includes(at)) return 'extra';
  return null;
}

const MARK = Object.freeze({ found: '✓', missed: '+', extra: '✗' });
const MARK_WORDS = Object.freeze({ found: 'spacesMarkFound', missed: 'spacesMarkMissed', extra: 'spacesMarkExtra' });

function slotButton(q, ix, { marked, done, state, focus }) {
  const at = q.slots[ix];
  const chars = [...q.ja];
  return h('button', {
    type: 'button',
    class: `sp-slot${state ? ` is-${state}` : ''}`,
    'data-act': 'sp-slot',
    'data-ix': ix,
    'aria-pressed': String(marked),
    'aria-disabled': done ? 'true' : null,
    tabindex: focus ? '0' : '-1',
  }, [
    h('span', { class: 'sr-only' }, [
      ...uiNodes('spacesBetween', { a: ja(chars[at - 1]), b: ja(chars[at]) }),
      state ? `, ${ui(MARK_WORDS[state])}` : null,
    ]),
    h('span', { class: 'sp-bar', 'aria-hidden': 'true' }),
    state ? h('span', { class: 'sp-tag', 'aria-hidden': 'true' }, MARK[state]) : null,
  ]);
}

/** The line as a board: each character, and after it the place to mark, when there is one. */
function board(q, r) {
  const done = answeredNow(r);
  const p = done ? r.picks[r.at] : null;
  const marks = marksOf(r);
  const cursor = Math.min(Math.max(0, play.spaces.cursor | 0), q.slots.length - 1);
  const ixOf = new Map(q.slots.map((at, ix) => [at, ix]));
  // A closing mark stays with the character before it and an opening one
  // with the character after, so no row starts with 。 or ends with 「.
  const units = [];
  let opener = null;
  [...q.ja].forEach((ch, k) => {
    const cell = h('span', { class: 'sp-ch', lang: 'ja', 'aria-hidden': 'true' }, ch);
    const ix = ixOf.get(k + 1);
    const slot = ix === undefined ? null : slotButton(q, ix, {
      marked: marks.has(k + 1), done, state: stateAt(p, k + 1), focus: ix === cursor,
    });
    if (CLOSING.test(ch) && units.length && !opener) { units[units.length - 1].append(cell); return; }
    const unit = opener || h('span', { class: 'sp-unit' });
    opener = null;
    unit.append(cell);
    if (slot) unit.append(slot);
    if (OPENING.test(ch)) { opener = unit; return; }
    units.push(unit);
  });
  if (opener) units.push(opener);
  return h('div', {
    class: `sp-board${done ? ' is-done' : ''}`, role: 'group', 'aria-label': ui('spacesBoard'), 'aria-describedby': 'pl-prompt',
  }, units);
}

/** "これ | を: を is a particle.", with whether it was found. */
function reasonLine(q, g, found) {
  const [a, b] = pairAt(q.ja, q.key, g.at);
  return [
    h('span', { class: `sp-why-tag${found ? '' : ' is-missed'}` }, ui(found ? 'spacesFound' : 'spacesMissed')), ' ',
    ja(`${a} | ${b}`), ': ', ...reasonNodes(g),
  ];
}

/** "く | だ: ください is one word.", for a space placed where none goes. */
function extraLine(q, at) {
  const chars = [...q.ja];
  return [
    h('span', { class: 'sp-why-tag is-extra' }, ui('spacesExtra')), ' ',
    ja(`${chars[at - 1]} | ${chars[at]}`), ': ', ...reasonNodes(extraReason(q.ja, q.key, at)),
  ];
}

function feedback(q, r) {
  const p = r.picks[r.at];
  const lines = [
    ui('spacesTally', { right: p.hit.length, of: q.key.length, extra: p.extra.length, score: p.score }),
    ...q.gaps.map((g) => reasonLine(q, g, p.hit.includes(g.at))),
    ...p.extra.map((at) => extraLine(q, at)),
    q.meaning ? h('span', { class: 'sp-meaning' }, t(q.meaning)) : null,
  ];
  return feedbackBlock({
    right: p.right, mark: ui(p.right ? 'spacesAllRight' : 'spacesNotQuite'), why: lines, last: r.at >= r.questions.length - 1,
  });
}

/** The question screen. */
export function spacesNodes() {
  const d = play.spaces;
  if (d.state !== 'ready') return [loading(d.state, d.error, { failed: 'spacesFailed', loading: 'spacesLoading' })];
  const r = d.round;
  if (!r || !current(r)) return [h('p', { class: 'mk-empty' }, ui('spacesFew'))];
  const q = current(r);
  const done = answeredNow(r);
  return [h('section', { class: 'mk-sec pl-q', 'aria-labelledby': 'pl-title' }, [
    questionHead(r),
    prompt([
      h('p', { class: 'pl-ask' }, ui('spacesPrompt')),
      h('p', { class: 'sp-tier mk-meta' }, ui(tierHint(q))),
      h('p', { class: 'sp-line', lang: 'ja' }, q.ja),
    ]),
    board(q, r),
    done ? feedback(q, r) : h('p', { class: 'mk-actions sp-actions' }, h('button', {
      type: 'button', class: 'btn btn--primary btn--sm', 'data-act': 'sp-check', 'aria-keyshortcuts': 'Enter',
    }, ui('spacesCheck'))),
    keysLine('keysSpaces'),
  ])];
}

/**
 * A line with its spaces drawn, for the result: "これ を ください", the gaps
 * as marks, not typed spaces. The mark says nothing to a screen reader, so
 * each holds the word "space" in the page's language, visually hidden (out
 * of the flow, so the line looks as it did).
 */
export function spacedLine(q) {
  const cuts = new Set(q.key);
  const out = [];
  [...q.ja].forEach((ch, k) => {
    if (cuts.has(k)) out.push(h('span', { class: 'sp-gap' }, h('span', { class: 'sr-only', lang: currentLang() }, ` ${ui('spacesGapSaid')} `)));
    out.push(ch);
  });
  return h('span', { class: 'sp-spaced', lang: 'ja' }, out);
}

/** The result's list: the lines checked with something missed or extra, spaced as they should be. */
export function missedNodes(lines) {
  if (!lines.length) return h('p', { class: 'mk-empty' }, ui('spacesNoneMissed'));
  return h('ul', { class: 'mk-list', role: 'list' }, lines.map((q) => h('li', { class: 'sp-again' }, [
    spacedLine(q),
    q.meaning ? h('span', { class: 'mk-meta' }, t(q.meaning)) : null,
  ])));
}
