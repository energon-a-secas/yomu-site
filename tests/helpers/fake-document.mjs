// A small stand-in for the document: what h() and the kanji page's render
// use (createElement, attributes, text, hidden), so a page can be drawn under
// node and its buttons read back. Used by tests/kanji-page-say.test.mjs and
// tests/kanji-page-voices.test.mjs.

export class FakeNode {
  constructor() { this.childNodes = []; this.parentNode = null; }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; }
  append(...cs) { for (const c of cs) this.appendChild(c instanceof FakeNode ? c : new FakeText(c)); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
}

export class FakeText extends FakeNode {
  constructor(text) { super(); this.data = String(text); }
  get textContent() { return this.data; }
}

export class FakeElement extends FakeNode {
  constructor(tag) { super(); this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.className = ''; this.hidden = false; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  get textContent() { return super.textContent; }
  set textContent(v) { this.childNodes = []; this.append(String(v)); }
}

/** Put the stand-in in place of the document. */
export function installFakeDocument() {
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (ns, tag) => new FakeElement(tag),
    createTextNode: (text) => new FakeText(text),
  };
}

/** Every element under `nodes`, in document order. */
export function* elements(nodes) {
  for (const n of nodes) {
    if (!(n instanceof FakeElement)) continue;
    yield n;
    yield* elements(n.childNodes);
  }
}
