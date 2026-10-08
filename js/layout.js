// Where a part of the reader sits on a phone and on a wider screen, when CSS
// alone would draw it in one place and leave the focus order in another.
//
// The send links (DeepL, Google Translate and their note) come after the
// reading on a phone, under 600px wide or 480px tall on its side: above it,
// with the tools, the row and its note took three lines of the screen before
// the first word. On a wider screen they go back on the row of Speak all and
// Slow, where they were before: after the reading, a 2,000-character text put
// them 9,955px down a 1440x1000 desktop. The block is moved, never drawn
// twice, so the links keep the one listener events.js gave them and the tab
// order follows the page. style.css's phone block uses the same query.

export const PHONE = '(max-width: 599.98px), (max-height: 480px)';

/** After the reading on a phone; on a wider screen, in the row of Speak all and Slow. */
export function placeSend(phone) {
  const block = document.getElementById('send-block');
  const reading = document.getElementById('reading');
  const bar = reading && reading.querySelector('.tools-bar');
  if (!block || !bar) return;
  const held = block.contains(document.activeElement) ? document.activeElement : null;
  if (phone) {
    if (block.parentElement !== reading) reading.append(block);
  } else if (block.parentElement !== bar) {
    const toggle = document.getElementById('display-toggle');
    bar.insertBefore(block, toggle && toggle.parentElement === bar ? toggle : null);
  }
  // A focused link moved in the page loses focus in some browsers.
  if (held && document.activeElement !== held) held.focus({ preventScroll: true });
}

/** Place the block now, and again whenever the screen crosses the phone line. */
export function bindLayout() {
  if (typeof matchMedia !== 'function') return;
  const phone = matchMedia(PHONE);
  placeSend(phone.matches);
  phone.addEventListener('change', (e) => placeSend(e.matches));
}
