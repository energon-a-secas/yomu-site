// One review of the kanji due today: a queue, a card that is either hidden
// or shown, and the answers given so far. No DOM and no clock, so
// tests/kanji-store.test.mjs runs a whole review under plain node.
//
// The schedule moves once per kanji per review, on its first answer. Again
// sends a kanji back to box 1, due tomorrow, and puts it at the end of this
// review's queue so it comes round again before the summary; that second look
// is practice, and whatever is answered then does not move the schedule
// again. Without that rule, Again followed a minute later by Got it would
// leave a kanji the learner just failed due in two days instead of one.

/** A review of `chars`, in the order given (kanji-store.js dueList orders them). */
export function createReview(chars) {
  const queue = [...new Set(chars || [])];
  return { queue, total: queue.length, shown: false, first: new Map(), repeats: 0 };
}

/** The kanji on the card, or null when the review is over. */
export function current(r) {
  return r.queue.length ? r.queue[0] : null;
}

export function finished(r) {
  return r.queue.length === 0;
}

/** Turn the card over. */
export function show(r) {
  if (!finished(r)) r.shown = true;
  return r.shown;
}

/** Is the kanji on the card one already answered in this review. */
export function isRepeat(r) {
  const ch = current(r);
  return ch !== null && r.first.has(ch);
}

/**
 * The card's place: "3 of 10" counts kanji, so a repeat shows the number of
 * the kanji it repeats rather than growing the total.
 */
export function position(r) {
  const ch = current(r);
  if (ch === null) return { at: r.total, of: r.total };
  return { at: isRepeat(r) ? [...r.first.keys()].indexOf(ch) + 1 : r.first.size + 1, of: r.total };
}

/**
 * Answer the card on screen. `apply(ch, ok)` is called on a kanji's first
 * answer only, which is where the store moves its schedule. An answer before
 * the card is shown is refused: the point of the card is to recall first.
 * Returns the kanji answered, or null.
 */
export function answer(r, ok, apply) {
  const ch = current(r);
  if (ch === null || !r.shown) return null;
  r.queue.shift();
  r.shown = false;
  if (!r.first.has(ch)) {
    r.first.set(ch, !!ok);
    if (typeof apply === 'function') apply(ch, !!ok);
  } else {
    r.repeats += 1;
  }
  if (!ok) r.queue.push(ch);
  return ch;
}

/** What the summary says: how many, how many on the first try, and which needed Again. */
export function summary(r) {
  const again = [...r.first].filter(([, ok]) => !ok).map(([ch]) => ch);
  return { reviewed: r.first.size, got: r.first.size - again.length, again, left: r.queue.length };
}
