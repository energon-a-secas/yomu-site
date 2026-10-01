// The review (#/kanji/review): one kanji at a time, the answer hidden until
// asked for, then Again or Got it. js/review.js keeps the queue; this file
// draws it, and events-kanji.js moves focus so the next thing to read is
// always the thing focused: the kanji on a new card, the answer once shown,
// the summary at the end. A screen reader then hears the card, and a sighted
// keyboard user keeps their place, with nothing announced twice.
//
// Not a flash card in the visual sense: no box, no flip animation. The kanji
// large, the answer under a hairline, two buttons.

import { $, h, fill } from './utils.js';
import { ui } from './strings.js';
import { myKanji } from './kanji-store.js';
import { current, finished, isRepeat, position, summary } from './review.js';
import { view, readingsLine, meaningText, wordsLine } from './render-mykanji.js';
import { dayText, today } from './render-save.js';

function keyButton(act, label, key, cls) {
  return h('button', { type: 'button', class: `btn ${cls} rv-btn`, 'data-act': act, 'aria-keyshortcuts': key === 'Space' ? 'Space' : key }, [
    label,
    h('kbd', { class: 'rv-kbd', 'aria-hidden': 'true' }, key),
  ]);
}

function answerNodes(ch) {
  const info = view.info.get(ch);
  const seen = myKanji().seenOf(ch);
  const parts = info && Array.isArray(info.parts) ? info.parts.filter((p) => p && p !== ch) : [];
  const meaning = meaningText(info, 5);
  return h('div', { class: 'rv-answer', id: 'rv-answer', tabindex: '-1' }, [
    readingsLine(info),
    meaning ? h('p', { class: 'rv-mean' }, [h('span', { class: 'kj-key' }, ui('meaning')), ' ', h('span', { lang: 'en' }, meaning)]) : null,
    parts.length ? h('p', { class: 'mk-reads' }, [h('span', { class: 'kj-key' }, ui('parts')), ' ', h('span', { lang: 'ja' }, parts.join('、'))]) : null,
    !info && view.infoState !== 'loading' ? h('p', { class: 'quiet' }, ui('noInfo')) : null,
    wordsLine(seen && seen.words),
  ]);
}

function cardNodes(r) {
  const ch = current(r);
  const pos = position(r);
  return [
    h('h3', { class: 'mk-sec-title rv-title', id: 'rv-title' }, [
      ui('review'), ' ',
      h('span', { class: 'mk-count' }, ui('reviewOf', pos)),
      isRepeat(r) ? h('span', { class: 'rv-tag' }, ` · ${ui('reviewAgainTag')}`) : null,
    ]),
    h('p', { class: 'rv-char', id: 'rv-char', lang: 'ja', tabindex: '-1' }, ch),
    r.shown ? answerNodes(ch) : h('p', { class: 'quiet rv-prompt' }, ui('reviewPrompt')),
    h('p', { class: 'rv-actions' }, r.shown
      ? [keyButton('rv-again', ui('again'), '1', 'btn--secondary'), keyButton('rv-got', ui('gotIt'), '2', 'btn--secondary')]
      : [keyButton('rv-show', ui('reviewShow'), 'Space', 'btn--secondary')]),
    h('p', { class: 'rv-keys' }, ui('reviewKeys')),
  ];
}

function summaryNodes(r) {
  const s = summary(r);
  const now = today();
  const next = myKanji().nextDue(now);
  return [
    h('h3', { class: 'mk-sec-title', id: 'rv-done', tabindex: '-1' }, ui('reviewDone')),
    h('p', { class: 'mk-line' }, ui('reviewSummary', { n: s.reviewed, got: s.got, again: s.again.length })),
    s.again.length ? h('p', { class: 'mk-line' }, [ui('reviewAgainList'), ' ', h('span', { class: 'rv-list', lang: 'ja' }, s.again.join(' '))]) : null,
    next ? h('p', { class: 'mk-line' }, ui('nextReview', { day: dayText(next.day, now), n: next.n })) : null,
    h('p', { class: 'mk-actions' }, h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'rv-back' }, ui('backToMyKanji'))),
  ];
}

/** Draw the review into #mk-body: the card, the summary, or that nothing is due. */
export function paintReview(r) {
  const body = $('mk-body');
  if (!body) return;
  let nodes;
  if (!r || (finished(r) && !r.first.size)) {
    nodes = [
      h('p', { class: 'mk-line', id: 'rv-none', tabindex: '-1' }, ui('reviewNothing')),
      h('p', { class: 'mk-actions' }, h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'data-act': 'rv-back' }, ui('backToMyKanji'))),
    ];
  } else if (finished(r)) {
    nodes = summaryNodes(r);
  } else {
    nodes = cardNodes(r);
  }
  fill(body, h('section', { class: 'mk-sec rv', 'aria-labelledby': 'mk-title' }, nodes));
}

/** Where focus belongs after a paint: the answer, the kanji, the summary or the empty line. */
export function reviewFocus(r) {
  if (!r || (finished(r) && !r.first.size)) return $('rv-none');
  if (finished(r)) return $('rv-done');
  return r.shown ? $('rv-answer') : $('rv-char');
}
