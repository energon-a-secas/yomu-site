// The Gaps option's listeners, bound once from bindEvents.
//
// A pointer over a gap shows its reason beside it; a tap or click on a gap
// between two words pins the reason until the next tap, Escape, a scroll or
// a resize. A hairline inside a compound is inside the word's button, so a
// tap there chooses the word, and the Word panel says what the hairline
// means, as it does for every gap around the chosen word: that is the way
// to a reason for a keyboard and a screen reader, since a gap takes no focus
// and adds no tab stop to the reading.

import { $ } from './utils.js';
import { state, savePrefs } from './state.js';
import { paintWord } from './render.js';
import { showTip, hideTip, tipState, paintGapsHint } from './render-gaps.js';

const on = () => !!state.prefs.gaps;

function gapOf(el) {
  const gaps = state.analysis && state.analysis.gaps;
  const ix = el ? Number(el.dataset.gap) : -1;
  return gaps && Number.isInteger(ix) ? gaps[ix] || null : null;
}

/**
 * Gaps was just switched: the hint the first time it goes on (it stays until
 * Gaps goes off, and never comes back), and the Word panel's lines.
 */
export function gapsToggled() {
  hideTip();
  if (state.prefs.gaps && !state.prefs.gapsSeen) {
    state.prefs.gapsSeen = true;
    state.gapsHint = true;
    savePrefs(state);
  } else if (!state.prefs.gaps) {
    state.gapsHint = false;
  }
  paintGapsHint(state);
  paintWord(state);
}

export function bindGaps() {
  const body = $('reading-body');
  if (!body) return;
  body.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('.gap');
    if (!el || !on() || tipState().pinned || e.pointerType === 'touch') return;
    showTip(el, gapOf(el));
  });
  body.addEventListener('pointerout', (e) => {
    const el = e.target.closest && e.target.closest('.gap');
    if (!el || tipState().pinned || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    hideTip();
  });
  // A gap between two words is outside every button: a click there is a click on the gap.
  const pin = (el) => {
    const { el: shown, pinned } = tipState();
    if (pinned && shown === el) hideTip();
    else showTip(el, gapOf(el), { pinned: true });
  };
  const wordGap = (target) => {
    const el = target && target.closest ? target.closest('.gap') : null;
    return el && !el.closest('.tok') && on() ? el : null;
  };
  body.addEventListener('click', (e) => {
    const el = wordGap(e.target);
    if (el) pin(el);
  });
  // A tap is read from the touch itself. WebKit moves the click of a tap on
  // a 12px gap to the word beside it (measured 2026-10-07: the pointerdown
  // was on the gap, the click on the word), so a tap that starts and ends on
  // a gap without moving pins the reason and has its click cancelled.
  let touch = null;
  body.addEventListener('touchstart', (e) => {
    const p = e.changedTouches[0];
    touch = wordGap(e.target) && p ? { el: wordGap(e.target), x: p.clientX, y: p.clientY } : null;
  }, { passive: true });
  body.addEventListener('touchend', (e) => {
    const p = e.changedTouches[0];
    const t = touch;
    touch = null;
    if (!t || !p || Math.abs(p.clientX - t.x) > 10 || Math.abs(p.clientY - t.y) > 10) return;
    e.preventDefault();
    pin(t.el);
  });
  // Anywhere else, a tap puts a pinned reason away.
  document.addEventListener('click', (e) => {
    if (!tipState().pinned) return;
    if (e.target.closest && e.target.closest('#reading-body .gap')) return;
    hideTip();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tipState().el) hideTip();
  });
  addEventListener('resize', () => hideTip());
}
