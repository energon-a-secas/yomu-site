// What pressed the last control: a key, a mouse, a finger or a pen.
//
// A phone raises its on-screen keyboard whenever focus lands in a text field
// during a tap, and on a 667px screen the keyboard covers the reading the tap
// just loaded. The learner met it on an iPhone with an example: focusHome
// put focus back in the text box. So a control that is about to vanish
// (an example, Retry, the ask card's answers, History's Read again) sends
// focus to the box only for a key or a mouse, and to the page's main region
// after a touch or a pen. A keyboard user keeps the box, as before.
//
// A key pressed inside a field says nothing about what pressed the next
// button: an on-screen keyboard sends its keys into the box too. With no
// press heard yet (a screen reader's activation can arrive with no pointer
// event at all), the device decides: a coarse primary pointer is a finger.

let pressedWith = null;

/** A text field, where focus raises an on-screen keyboard. */
export function isField(el) {
  if (!el || typeof el.closest !== 'function') return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !/^(button|checkbox|radio|range|color|file|image|reset|submit|hidden)$/i.test(el.type || '');
}

/**
 * Whether focus should stay out of the text box after this press: `last` is
 * the last press heard ('keyboard', 'mouse', 'touch', 'pen' or null) and
 * `coarse` whether the device's primary pointer is a finger. Pure, for tests.
 */
export function keepOutOfField(last, coarse) {
  if (last === 'touch' || last === 'pen') return true;
  if (last === 'keyboard' || last === 'mouse') return false;
  return !!coarse;
}

/** Listen once per document, in the capture phase, before any action runs. */
export function watchPress(doc = document) {
  doc.addEventListener('pointerdown', (e) => { pressedWith = e.pointerType || 'mouse'; }, true);
  doc.addEventListener('touchstart', () => { pressedWith = 'touch'; }, { capture: true, passive: true });
  doc.addEventListener('keydown', (e) => { if (!isField(e.target)) pressedWith = 'keyboard'; }, true);
}

/** After the last press, would focus in a text field raise an on-screen keyboard. */
export function pressedByTouch() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return keepOutOfField(pressedWith, coarse);
}
