// Small DOM helpers, and the one rule they exist for.
//
// A learner's pasted text is the most sensitive thing on this page and the
// least trusted: it is whatever they copied from a chat or a web page. So it
// reaches the DOM as text nodes and attribute values, never as markup. h()
// makes that structural: there is no innerHTML anywhere in this site's own
// code and no escHtml either, because a helper for the unsafe path invites the
// unsafe path.

export { debounce, showToast, prefersReducedMotion } from './neorgon-dom.js';

/**
 * Build an element.
 *   h('p', 'text')
 *   h('button', { class: 'btn', type: 'button' }, [child, 'text'])
 * Attribute keys starting with "on" are refused: listeners live in events.js.
 */
export function h(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs && (typeof attrs === 'string' || attrs instanceof Node || Array.isArray(attrs))) {
    children = attrs;
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (/^on/i.test(k)) throw new Error('h(): inline handlers are not allowed, wire it in events.js');
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

/** Append a child, an array of children, or a string, to a node. */
export function append(el, children) {
  if (children === null || children === undefined || children === false) return el;
  if (Array.isArray(children)) {
    for (const c of children) append(el, c);
    return el;
  }
  el.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
  return el;
}

// ー, 〜, 々, ・ and the spacing voicing marks ゛ ゜ are Script=Common, so
// each is named; without ゛ and ゜ the notes "The two dots ゛" and "The small
// circle ゜" had them outside lang="ja".
const JA_RUN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー〜～々・゛゜]+/gu;

/**
 * English or Spanish with Japanese inside it ("は said wa", "〜ます: the
 * polite verb"), as nodes with each Japanese run in a span marked lang="ja",
 * so a screen reader switches voice for it and a Han character is drawn in a
 * Japanese face, not a Chinese one.
 */
export function withJa(text) {
  const s = String(text ?? '');
  const out = [];
  let at = 0;
  for (const m of s.matchAll(JA_RUN)) {
    if (m.index > at) out.push(s.slice(at, m.index));
    out.push(h('span', { lang: 'ja' }, m[0]));
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}

/** Remove every child of a node. */
export function clear(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Replace a node's children in one go. */
export function fill(el, children) {
  clear(el);
  return append(el, children);
}

export const $ = (id) => document.getElementById(id);

/** A selector-safe attribute match, for [data-k="…"] lookups on learner text. */
export function attrSel(name, value) {
  const v = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');
  return `[${name}="${v}"]`;
}

/** Does this device point with a finger. A tap then does what hover does. */
export function touchOnly() {
  return typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
}
