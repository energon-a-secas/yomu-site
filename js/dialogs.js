/** The platform owns trapping and Escape; this module owns launch/return focus. */
import { isField, pressedByTouch } from './press.js';

const openers = new WeakMap();

/**
 * What takes focus for `el`: itself while it is drawn, or, while it sits in
 * the header kit's closed ⋯ menu (Phrases, on a phone), the ⋯ button, the
 * control the learner pressed to reach it. A button in a closed menu cannot
 * take focus, and focus fell to <body>.
 */
function drawn(el) {
  if (!el || !el.isConnected || typeof el.focus !== 'function') return null;
  if (el.getClientRects().length) return el;
  const menu = el.closest('.header-overflow');
  const toggle = menu && menu.querySelector('.header-overflow-toggle');
  return toggle && toggle.getClientRects().length ? toggle : null;
}

const ringed = (el) => { try { return el.matches(':focus-visible'); } catch { return false; } };

/**
 * Focus for `el`, without a ring after a touch or a pen. Script focus takes
 * its ring from what had focus before, and a text box always has one, so on
 * an iPhone the box's ring rode onto the header button a dialog gave focus
 * back to. `focusVisible: false` is read where a browser knows it (Chromium,
 * WebKit and Firefox, measured) and ignored elsewhere; focus already there
 * with a ring is let go first, since focusing it again changes nothing.
 */
function focusBack(el) {
  if (!el) return;
  // A field's ring is the caret's, and blurring it would drop the keyboard.
  if (!pressedByTouch() || isField(el)) {
    el.focus({ preventScroll: true });
    return;
  }
  if (el === document.activeElement && ringed(el)) el.blur();
  el.focus({ preventScroll: true, focusVisible: false });
}

/**
 * The platform gives focus back on close to what had it at showModal(), before
 * the close listener below runs. Safari focuses no button a tap presses, so on
 * an iPhone that was still the text box: choosing a phrase closed the dialog
 * into the box and raised the keyboard over the new reading. So the opener
 * takes focus first, and a field the opener is not lets it go.
 */
export function openDialog(dialog, opener = document.activeElement) {
  if (!dialog || dialog.open) return;
  const back = drawn(opener) || opener;
  openers.set(dialog, back);
  if (back && back.isConnected && typeof back.focus === 'function') focusBack(back);
  const held = document.activeElement;
  if (held !== back && isField(held)) held.blur();
  dialog.showModal();
  if (document.documentElement.dataset.embed === '1') placeNear(dialog, back);
}

/**
 * In an embed the frame is as tall as its page (up to the host's cap), so a
 * modal centred in the frame's viewport could open a screen or two away from
 * the part of the frame the host's sheet shows: a dimmed sheet with no dialog
 * in it. There the dialog opens beside what opened it, inside the part of the
 * frame that is on screen. The frame cannot read the host's scroll, but an
 * IntersectionObserver with no root reports what of this document the top
 * page shows, in the frame's own coordinates, in Chromium, WebKit and Firefox
 * alike, cross-origin included; its first report is that band, now.
 */
function placeNear(dialog, opener) {
  const rect = opener && opener.isConnected ? opener.getBoundingClientRect() : null;
  const want = rect ? rect.top - 16 : 0;
  let band = null;
  // Several dialogs fill in after they open (a kanji's details, the phrase
  // list), so the clamp runs again whenever the dialog's height changes.
  const place = () => {
    const h = dialog.offsetHeight;
    const lo = band ? band.top + 8 : 8;
    const hi = band ? band.bottom - h - 8 : window.innerHeight - h - 8;
    // Taller than what shows: its top at the top of what shows.
    let top = hi < lo ? lo : Math.max(lo, Math.min(want, hi));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    dialog.style.top = `${Math.round(top)}px`;
  };
  dialog.style.marginTop = '0';
  dialog.style.marginBottom = '0';
  dialog.style.bottom = 'auto';
  place();
  const watchers = [];
  if (typeof IntersectionObserver === 'function') {
    const seen = new IntersectionObserver((entries) => {
      seen.disconnect();
      const e = entries[entries.length - 1];
      if (e && e.isIntersecting && dialog.open) {
        band = { top: e.intersectionRect.top, bottom: e.intersectionRect.bottom };
        place();
      }
    });
    seen.observe(document.documentElement);
    watchers.push(seen);
  }
  if (typeof ResizeObserver === 'function') {
    const grow = new ResizeObserver(place);
    grow.observe(dialog);
    watchers.push(grow);
  }
  dialog.addEventListener('close', () => { for (const w of watchers) w.disconnect(); }, { once: true });
}

/** Bind once. Keep a visible close button for touch users. */
export function bindDialog(dialog, fallback) {
  dialog.addEventListener('click', (event) => {
    // A click on the backdrop lands on the dialog element itself.
    if (event.target === dialog || event.target.closest('[data-dialog-close]')) dialog.close();
  });
  // Contain Escape so a site's page shortcut does not also dismiss a sheet.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });
  dialog.addEventListener('close', () => {
    focusBack(drawn(openers.get(dialog)) || drawn(fallback) || fallback);
    openers.delete(dialog);
  });
}
