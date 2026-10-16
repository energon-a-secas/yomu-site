// Where a part of the reader sits on a phone and on a wider screen, when CSS
// alone would draw it in one place and leave the focus order in another.
//
// On a phone, under 600px wide or 480px tall on its side, two blocks come
// after the reading: Read along with Repeat after me, then the send links
// (DeepL, Google Translate and their note). Above it, they took two more rows
// of the screen before the first word; the tools there stay one row, Speak
// all, Slow and Display. On a wider screen both go back into the tools: Read
// along and Repeat after me on the row of Speak all and Slow, the send links
// on the row under it with their note. After the reading, a 2,000-character
// text put the links 9,955px down a 1440x1000 desktop. A block is moved,
// never drawn twice, so its controls keep the one listener events.js gave
// them and the tab order follows the page. style.css's phone block uses the
// same query.

export const PHONE = '(max-width: 599.98px), (max-height: 480px)';

/** Move `block` to `place()`, keeping focus on a control inside it. */
function move(block, place) {
  const held = block.contains(document.activeElement) ? document.activeElement : null;
  place();
  // A focused control moved in the page loses focus in some browsers.
  if (held && document.activeElement !== held) held.focus({ preventScroll: true });
}

/** After the reading on a phone; on a wider screen, in the tools above it. */
export function placeBlocks(phone) {
  const reading = document.getElementById('reading');
  const bar = reading && reading.querySelector('.tools-bar');
  const listen = document.getElementById('listen-block');
  const send = document.getElementById('send-block');
  const status = document.getElementById('read-along-status');
  if (!bar) return;
  const toggle = document.getElementById('display-toggle');
  const beforeToggle = toggle && toggle.parentElement === bar ? toggle : null;
  if (listen && phone && listen.parentElement === bar && status) move(listen, () => status.before(listen));
  if (listen && !phone && listen.parentElement !== bar) move(listen, () => bar.insertBefore(listen, beforeToggle));
  if (send && phone && send.parentElement !== reading) move(send, () => reading.append(send));
  if (send && !phone && send.parentElement !== bar) move(send, () => bar.insertBefore(send, beforeToggle));
}

/** Place the blocks now, and again whenever the screen crosses the phone line. */
export function bindLayout() {
  if (typeof matchMedia !== 'function') return;
  const phone = matchMedia(PHONE);
  placeBlocks(phone.matches);
  phone.addEventListener('change', (e) => placeBlocks(e.matches));
}
