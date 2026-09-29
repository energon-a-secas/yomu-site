// yomu-embed/1: Yomu inside another Neorgon site's frame. docs/EMBED.md is
// the contract; this is the one implementation of Yomu's side of it.
//
// Four things in here are load bearing, and each is a bug class:
//
//  1. event.origin and event.source are checked before anything else. A
//     message from a page that is not an allowed host, or from anything but
//     the window that framed us, is dropped without a reply: a reply is
//     itself a leak.
//  2. Replies go to the origin of the last accepted yomu:hello, never to "*".
//     yomu:ready at boot has no hello yet. When the browser names the framing
//     origin (location.ancestorOrigins, or the referrer) it is posted there
//     alone, and not at all when that origin is not allowed; Chrome logs a
//     console warning for every post whose target is not the parent, so a
//     guess per allowed origin is the fallback, used only when the browser
//     names nothing. Either way the browser delivers a message only when its
//     target origin is the parent's, so a stranger gets none.
//  3. A message whose v is not 1 is ignored. A host speaking a newer version
//     keeps working with the fields it shares and sees no errors from us.
//  4. Text arrives by message, never in the frame URL, and in embed mode it
//     is not written to this origin's storage either. The host owns it.
//
// createEmbed() takes the window as an argument and touches no global, so
// tests/embed.test.mjs drives it with a fake window under plain node.

export const EMBED_VERSION = 1;
export const MAX_TEXT = 2000;

/** Hosts allowed to drive this frame. A new host is added here and in docs/EMBED.md, in one commit. */
export const ALLOWED_ORIGINS = Object.freeze([
  'https://runcible.neorgon.com',
  'http://localhost:8878',
  'http://127.0.0.1:8878',
]);

const LANGS = ['en', 'es'];

/** ?embed=1 */
export function isEmbedded(search) {
  return new URLSearchParams(search || '').get('embed') === '1';
}

/**
 * @param {object} o
 * @param {Window} o.win          the frame's window (a fake one in tests)
 * @param {string} o.version      what yomu:ready reports
 * @param {string[]} [o.allowed]  origins allowed to drive the frame
 * @param {(text: string) => Promise<{tokens: number, unknown: number}>} o.onLoad
 * @param {(lang: string) => void} o.onLang
 * @param {() => number} o.measure  the document height in CSS px
 * @param {() => string|null} [o.parentOrigin]  the framing page's origin, when the browser says
 */
export function createEmbed({ win, version, allowed = ALLOWED_ORIGINS, onLoad, onLang, measure, parentOrigin = null }) {
  let target = null;        // origin of the last accepted yomu:hello
  let queued = false;
  let lastHeight = -1;
  let loadSeq = 0;

  function send(type, fields, origin) {
    if (!origin || !win.parent || win.parent === win) return false;
    win.parent.postMessage({ v: EMBED_VERSION, ...fields, type }, origin);
    return true;
  }

  function reply(type, fields, fallbackOrigin) {
    // A load that arrives before any hello still gets an answer, sent only to
    // the origin that asked, which has already passed the allowlist.
    return send(type, fields, target || fallbackOrigin);
  }

  function announce() {
    const known = typeof parentOrigin === 'function' ? parentOrigin() : null;
    if (known) {
      if (allowed.includes(known)) send('yomu:ready', { version }, known);
      return;
    }
    for (const origin of allowed) send('yomu:ready', { version }, origin);
  }

  async function load(data, origin) {
    const seq = ++loadSeq;
    if (typeof data.text !== 'string') {
      reply('yomu:error', { message: 'yomu:load needs a text string' }, origin);
      return;
    }
    if (data.text.length > MAX_TEXT) {
      reply('yomu:error', { message: `text too long: ${data.text.length} characters, at most ${MAX_TEXT}` }, origin);
      return;
    }
    if (LANGS.includes(data.lang)) onLang(data.lang);
    try {
      const counts = await onLoad(data.text);
      // A newer load replaced this one while it read; its own reply follows.
      if (seq !== loadSeq) return;
      const c = counts || {};
      reply('yomu:read', { tokens: c.tokens | 0, unknown: c.unknown | 0 }, origin);
    } catch (err) {
      if (seq !== loadSeq) return;
      reply('yomu:error', { message: String((err && err.message) || err || 'could not read the text') }, origin);
    }
  }

  function onMessage(event) {
    if (!event || !allowed.includes(event.origin)) return;
    if (event.source !== win.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.v !== EMBED_VERSION || typeof data.type !== 'string') return;

    switch (data.type) {
      case 'yomu:hello':
        target = event.origin;
        send('yomu:ready', { version }, target);
        lastHeight = -1;        // a new listener has not seen any height yet
        queueHeight();
        break;
      case 'yomu:load':
        load(data, event.origin);
        break;
      case 'yomu:lang':
        if (LANGS.includes(data.lang)) onLang(data.lang);
        break;
      default:
        break;                  // an unknown type is not an error: ignore it
    }
  }

  /** Report the height at most once per animation frame, and only when it moved. */
  function queueHeight() {
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(() => {
      queued = false;
      if (!target) return;
      const height = Math.ceil(Number(measure()) || 0);
      if (height === lastHeight) return;
      lastHeight = height;
      send('yomu:height', { height }, target);
    });
  }

  function start() {
    win.addEventListener('message', onMessage);
    announce();
  }

  function stop() {
    win.removeEventListener('message', onMessage);
  }

  return { start, stop, queueHeight, onMessage, get target() { return target; } };
}

// ── The page side ─────────────────────────────────────────────────────────
//
// Everything below touches the real document and runs only in the browser.

/** Where "Open in Yomu" points. The text does not travel: Yomu never writes it into a URL. */
export function standaloneUrl(loc = globalThis.location) {
  const url = new URL('./', loc.href);
  return url.href;
}

/**
 * Put the page into its embed layout: no header, no footer, no floating kit
 * controls, one column, and one line with the way out.
 */
export function enterEmbedLayout(doc = globalThis.document) {
  doc.documentElement.dataset.embed = '1';
  // The beacon script runs after this one and builds its button then, so
  // hiding it below would miss it: the kit's own opt-out is the reliable way.
  if (!doc.querySelector('meta[name="beacon"]')) {
    const off = doc.createElement('meta');
    off.name = 'beacon';
    off.content = 'off';
    doc.head.appendChild(off);
  }
  for (const sel of ['.header-bar', '.neo-footer', '.neo-top', '#neo-beacon-link', '.skip-link']) {
    for (const el of doc.querySelectorAll(sel)) el.hidden = true;
  }
  const bar = doc.getElementById('embed-bar');
  if (bar) bar.hidden = false;
}

/**
 * The origin of the page that framed this one, or null when the browser does
 * not say. ancestorOrigins is Chromium and WebKit; the referrer covers
 * Firefox, whose default policy still sends the origin to a cross-origin frame.
 */
export function framingOrigin(win = globalThis.window, doc = globalThis.document) {
  try {
    const list = win.location && win.location.ancestorOrigins;
    if (list && list.length) return String(list[0]);
  } catch { /* fall through to the referrer */ }
  try {
    if (doc && doc.referrer) return new URL(doc.referrer).origin;
  } catch { /* an unparsable referrer names nothing */ }
  return null;
}

/** Start the protocol against the real window. Returns the controller. */
export function startEmbed({ version, onLoad, onLang }) {
  const win = globalThis.window;
  const doc = globalThis.document;
  const embed = createEmbed({
    win,
    version,
    onLoad,
    onLang,
    measure: () => doc.body.getBoundingClientRect().height,
    parentOrigin: () => framingOrigin(win, doc),
  });
  if (typeof globalThis.ResizeObserver === 'function') {
    new globalThis.ResizeObserver(() => embed.queueHeight()).observe(doc.body);
  }
  embed.start();
  return embed;
}
