// One sentence at a time: the reading's units numbered by sentence, and the
// ones outside the current sentence put away. A unit is a top-level child of
// a .reading-line (a word, or a word with its punctuation and gap, render-
// reading.js); a sentence ends after a unit that ends in 。！？!? (or 。」),
// and every new line starts one. The view and the sentence are state.view,
// for this visit only. The selection leads: choosing a word, by tap or by
// the arrow keys, shows its sentence (paintSelection in render.js).

import { $ } from './utils.js';
import { ui } from './strings.js';

/** The punctuation that ends a sentence, a closing bracket or quote allowed after it: 。」 */
const END = /[。．！？!?.][」』）)"'”’]*$/;

/** The punctuation a unit ends with (render-reading.js draws it as .tok-plain--punct, with no token). */
function tailOf(unit) {
  if (unit.matches('.tok-plain--punct')) return unit.textContent;
  let text = '';
  for (let el = unit.lastElementChild; el && el.matches('.tok-plain--punct'); el = el.previousElementSibling) text = el.textContent + text;
  return text;
}

/** Number each unit with data-sent; returns how many sentences there are. */
export function markSentences(body) {
  let n = 0;
  let open = false;
  for (const line of body.querySelectorAll('.reading-line')) {
    if (open) { n += 1; open = false; }
    for (const unit of line.children) {
      unit.dataset.sent = String(n);
      open = true;
      if (END.test(tailOf(unit).trim())) { n += 1; open = false; }
    }
  }
  const count = n + (open ? 1 : 0);
  body.dataset.sents = String(count);
  return count;
}

/** The sentence a reading element sits in, or null. */
export function sentenceOf(el) {
  const unit = el && el.closest('[data-sent]');
  return unit ? Number(unit.dataset.sent) : null;
}

/** Show the current sentence alone in the one-sentence view, or everything otherwise. */
export function paintSentence(state) {
  const body = $('reading-body');
  const nav = $('sent-nav');
  if (!body) return;
  const count = Number(body.dataset.sents) || 0;
  const one = !!state.view.one && count > 0;
  state.view.sent = Math.min(Math.max(0, state.view.sent), Math.max(0, count - 1));
  const at = String(state.view.sent);
  for (const unit of body.querySelectorAll('[data-sent]')) unit.classList.toggle('sent-off', one && unit.dataset.sent !== at);
  for (const line of body.querySelectorAll('.reading-line')) {
    line.classList.toggle('sent-off', one && !line.querySelector(`:scope > [data-sent="${at}"]`));
  }
  for (const b of document.querySelectorAll('[data-act="read-view"]')) b.setAttribute('aria-pressed', String((b.dataset.value === 'one') === !!state.view.one));
  if (!nav) return;
  nav.hidden = !one;
  if (!one) return;
  const where = $('sent-where');
  if (where) where.textContent = ui('sentWhere', { n: state.view.sent + 1, of: count });
  const [prev, next] = nav.querySelectorAll('[data-act="sent-step"]');
  if (prev) prev.disabled = state.view.sent <= 0;
  if (next) next.disabled = state.view.sent >= count - 1;
}

/** The first word of a sentence, the one a step selects, or null. */
export function firstWordOf(n) {
  const body = $('reading-body');
  return body ? body.querySelector(`[data-sent="${n}"] .tok[data-i]:not([aria-disabled="true"]), .tok[data-sent="${n}"][data-i]`) : null;
}
