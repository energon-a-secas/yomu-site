// The view, apart from the analyzer: index.html's own <main>, painted from a
// hand-written analysis, then checked.
//
// Why a fixture and not the analyzer: the page's job is to draw what it is
// given, and a check that fails here should point at the page, never at a
// dictionary shard or a segmentation choice. tests/fixtures/analysis-sample.json
// is shaped exactly like analyze() output (docs/ANALYZER.md) and covers
// particles, long vowels in kanji and katakana, small tsu, two conjugated
// verbs with chains, devoicing, a line break and sentence punctuation.
//
// The markup is read from ../index.html at run time rather than copied here,
// so the harness cannot drift from the page it vouches for. It is our own file
// parsed by DOMParser, whose documents run no scripts, and it is moved in with
// importNode; no string of markup is ever assigned to innerHTML.
//
// Preferences, the saved text and My kanji share this origin with the real
// page, so all three are put back as they were when the checks finish.

import { useFixture } from '../js/reader.js';
import { state, loadPrefs, TEXT_KEY } from '../js/state.js';
import { paintAll } from '../js/render.js';
import { bindEvents, loadText } from '../js/events.js';
import { h } from '../js/utils.js';
import { ui } from '../js/strings.js';
import { wordNode } from '../js/render-word.js';

const PREFS_KEY = 'yomu-site:preferences';
const KANJI_KEY = 'yomu-site:kanji';
const results = [];
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok });
  $('hz-results').append(h('li', { 'data-ok': String(!!ok) }, detail ? `${name}: ${detail}` : name));
}

function keep(key) {
  let value = null;
  try { value = localStorage.getItem(key); } catch { /* storage blocked */ }
  return () => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* storage blocked */ }
  };
}

async function mountPage() {
  const res = await fetch('../index.html');
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const main = doc.getElementById('main');
  $('hz-page').append(document.importNode(main, true));
}

/** An element's text as read on the line, ruby left out. */
function plain(el) {
  const copy = el.cloneNode(true);
  for (const rt of copy.querySelectorAll('rt')) rt.remove();
  return copy.textContent;
}

function fire(el, type, init = {}) {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', ...init }));
}

const restore = [];

async function run() {
  restore.push(keep(TEXT_KEY), keep(PREFS_KEY), keep(KANJI_KEY));
  // My kanji starts empty, so every kanji in the fixture is unsaved and new.
  try { localStorage.removeItem(KANJI_KEY); } catch { /* storage blocked */ }
  const fixture = await (await fetch('fixtures/analysis-sample.json')).json();
  let notes = {};
  try { notes = await import('../js/notes.js'); } catch { /* notes are optional here */ }
  const kanji = new Map(fixture.kanji.map((k) => [k.ch, k]));
  useFixture({ analyze: async () => ({ tokens: fixture.tokens, kanji: fixture.kanji }), notes, kanji });

  await mountPage();
  loadPrefs(state);
  state.prefs.furigana = true;
  state.prefs.romaji = 'said';
  state.prefs.highlights = true;
  paintAll(state);
  bindEvents();
  await loadText(fixture.text);
  await wait(50);

  const body = $('reading-body');
  const toks = [...body.querySelectorAll('.tok')];
  const selectable = fixture.tokens.filter((t) => !['punct', 'space', 'newline', 'latin'].includes(t.kind));
  check('one button per word', toks.length === selectable.length, `${toks.length} of ${selectable.length}`);

  const lines = [...body.querySelectorAll('.reading-line')];
  check('a newline token ends a line', lines.length === 2, `${lines.length} lines`);

  const drawn = lines.map((l) => [...l.querySelectorAll('.tok-surface, .tok-plain')]
    .map((el) => [...el.childNodes].map((n) => (n.nodeName === 'RUBY' ? [...n.childNodes].filter((c) => c.nodeName !== 'RT').map((c) => c.textContent).join('') : n.textContent)).join(''))
    .join('')).join('\n');
  check('the surfaces tile the text', drawn === fixture.text);

  const rubies = fixture.tokens.flatMap((t) => t.furigana || []).filter((f) => f.ruby).length;
  check('every ruby part is a <ruby>', body.querySelectorAll('ruby').length === rubies, `${body.querySelectorAll('ruby').length} of ${rubies}`);

  const said = toks.map((b) => b.querySelector('.tok-romaji--said').textContent).join(' ');
  check('the said line reads as Genki writes it', said === selectable.map((t) => t.romaji.said).join(' '), said);

  const inText = [...document.querySelectorAll('.it-line')];
  const voiced = inText.find((b) => b.dataset.id === 'dakuten');
  check('voiced marks are counted per sentence', voiced && /2/.test(voiced.querySelector('.it-count').textContent), voiced ? voiced.querySelector('.it-count').textContent : 'no line');
  check('each sound and grammar id is listed once', new Set(inText.map((b) => `${b.dataset.kind}:${b.dataset.id}`)).size === inText.length);

  const learner = /[぀-ヿ一-鿿]/;
  const leaks = [...document.querySelectorAll('#hz-page *')].flatMap((el) => [...el.attributes]
    .filter((a) => a.name !== 'placeholder' && a.name !== 'href' && learner.test(a.value)).map((a) => `${el.tagName}.${a.name}`));
  check('no attribute carries the text', leaks.length === 0, leaks.slice(0, 3).join(', '));

  // My kanji in the reader: a bookmark per row, a count, and a mark on every
  // kanji not saved yet, which saving clears in place.
  const entries = [...document.querySelectorAll('#kanji-body .kj-entry')];
  const toggles = entries.map((li) => li.querySelector(':scope > .save-toggle'));
  check('each kanji row has a save toggle beside its button', entries.length === fixture.kanji.length && toggles.every((b) => b && b.tagName === 'BUTTON' && b.getAttribute('aria-pressed') === 'false'), `${toggles.filter(Boolean).length} of ${fixture.kanji.length}`);
  check('the toggle is named for its kanji, in text', toggles.every((b, kid) => b.textContent.includes(fixture.kanji[kid].ch) && b.querySelector('[lang="ja"]')), toggles[0] ? toggles[0].textContent : '');
  check('each row says this is the first time', entries.every((li) => (li.querySelector('.kj-seen') || {}).textContent === ui('seenFirst')), ui('seenFirst'));
  const marked = () => body.querySelectorAll('.kj.is-unsaved').length;
  const allKj = body.querySelectorAll('.kj[data-kid]').length;
  check('every kanji not saved carries the mark', marked() === allKj && allKj > 0, `${marked()} of ${allKj}`);
  const before = (el) => getComputedStyle(el, '::before').content;
  const firstKj = body.querySelector('.kj[data-kid="0"]');
  check('the mark is drawn', before(firstKj) !== 'none' && before(firstKj) !== 'normal', before(firstKj));
  const keepTok = body.querySelector('.tok');
  toggles[0].click();
  await wait(20);
  check('saving presses the toggle', toggles[0].getAttribute('aria-pressed') === 'true');
  check('saving clears that kanji\'s mark and no other', body.querySelectorAll('.kj.is-unsaved[data-kid="0"]').length === 0 && marked() === allKj - body.querySelectorAll('.kj[data-kid="0"]').length);
  check('saving reads nothing again: the reading is the same nodes', keepTok.isConnected);
  check('the saved kanji is drawn without the mark', ['none', 'normal'].includes(before(firstKj)), before(firstKj));
  // The header is not in the harness; the embed bar's link carries the same count.
  const dueCount = document.querySelector('#hz-page [data-due-count]');
  check('the My kanji link counts one review due', dueCount && !dueCount.hidden && dueCount.textContent.startsWith('1'), dueCount ? dueCount.textContent : 'no count');
  document.querySelector('[data-pref="unsaved"][data-value="off"]').click();
  const unsavedKj = body.querySelector('.kj.is-unsaved');
  check('Unsaved kanji Off hides the mark', unsavedKj && ['none', 'normal'].includes(before(unsavedKj)), unsavedKj ? before(unsavedKj) : 'none left');
  document.querySelector('[data-pref="unsaved"][data-value="mark"]').click();

  // A word, chosen by click: the Word panel, its beats and its chain.
  const iku = toks.find((b) => plain(b.querySelector('.tok-surface')) === '行きました');
  iku.click();
  await wait(30);
  check('a click chooses the word', iku.getAttribute('aria-pressed') === 'true');
  check('the Word panel shows it', $('word-surface') && plain($('word-surface')) === '行きました');
  const beats = [...document.querySelectorAll('#word-beats .beat')].length;
  check('its beats are chips', beats === 5, `${beats} chips`);
  const chain = [...document.querySelectorAll('.chain-step')].map((li) => li.textContent);
  check('the chain runs from the dictionary form to the text', chain.length >= 3 && chain[0].includes('行く') && chain[chain.length - 1].includes('行きました'), chain.join(' > '));
  const wordToggle = document.querySelector('#word-body .wk .save-toggle');
  const kidIku = wordToggle ? wordToggle.dataset.kid : null;
  check('the Word panel lists its kanji with the same toggle', wordToggle && wordToggle.getAttribute('aria-pressed') === 'false' && wordToggle.textContent.includes('行'));
  if (wordToggle) wordToggle.click();
  await wait(20);
  check('saving from the Word panel presses its row in the table too', document.querySelector(`#kanji-body .save-toggle[data-kid="${kidIku}"]`).getAttribute('aria-pressed') === 'true'
    && body.querySelectorAll(`.kj.is-unsaved[data-kid="${kidIku}"]`).length === 0);

  // The keyboard: one tab stop, arrows move it, Enter chooses.
  check('the reading is one tab stop', body.querySelectorAll('.tok[tabindex="0"]').length === 1);
  iku.focus();
  iku.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  const next = document.activeElement;
  check('ArrowRight moves to the next word', next !== iku && next.classList.contains('tok'));

  // The three display toggles are attributes, and CSS does the rest.
  document.querySelector('[data-pref="furigana"][data-value="off"]').click();
  document.querySelector('[data-pref="romaji"][data-value="spelled"]').click();
  document.querySelector('[data-pref="highlights"][data-value="off"]').click();
  const rt = body.querySelector('rt');
  check('Furigana off hides the ruby', getComputedStyle(rt).display === 'none');
  check('Romaji spelled shows the spelled line', getComputedStyle(toks[0].querySelector('.tok-romaji--spelled')).display !== 'none'
    && getComputedStyle(toks[0].querySelector('.tok-romaji--said')).display === 'none');
  const mark = body.querySelector('.snd:not([data-snd="dakuten"])');
  check('Highlights off hides the marks', mark && getComputedStyle(mark).borderBottomColor === 'rgba(0, 0, 0, 0)');
  for (const [pref, value] of [['furigana', 'on'], ['romaji', 'said'], ['highlights', 'on']]) {
    document.querySelector(`[data-pref="${pref}"][data-value="${value}"]`).click();
  }

  // Lights: a kanji row lights its characters, and a note line its spans.
  // The focused word lights its own kanji, so focus leaves the reading first.
  document.activeElement.blur();
  const row = document.querySelector('.kj-row');
  fire(row, 'pointerover');
  const lit = body.querySelectorAll(`.kj.is-lit[data-kid="${row.dataset.kid}"]`).length;
  check('pointing at a kanji row lights it in the text', lit > 0, `${lit} lit`);
  fire(row, 'pointerout');
  check('and leaving it puts the light out', body.querySelectorAll(`.kj.is-lit[data-kid="${row.dataset.kid}"]`).length === 0);

  const longLine = inText.find((b) => b.dataset.id === 'long-vowel');
  fire(longLine, 'pointerover');
  check('pointing at a note line lights its spans', body.querySelectorAll('.is-lit').length > 0 && body.classList.contains('has-lit'));
  fire(longLine, 'pointerout');
  longLine.click();
  await wait(30);
  check('choosing a note line opens its note', $('note-title') && !$('panel-notes').hasAttribute('data-empty'), $('note-title') ? $('note-title').textContent : '');

  const leaksAfter = [...document.querySelectorAll('#hz-page *')].flatMap((el) => [...el.attributes]
    .filter((a) => a.name !== 'placeholder' && a.name !== 'href' && learner.test(a.value)).map((a) => `${el.tagName}.${a.name}`));
  check('no attribute carries a kanji after saving either', leaksAfter.length === 0, leaksAfter.slice(0, 3).join(', '));

  // The Word panel on two hand-written tokens (fixtures/word-panel.json): a
  // rare word says so with a label, and a part no record covers shows its
  // sound-alike on a line of its own, never where a gloss goes.
  const panel = await (await fetch('fixtures/word-panel.json')).json();
  const ctx = { noteOf: () => null, kidOf: () => -1, canSpeak: false };
  const paint = (token) => {
    const box = h('div', { class: 'hz-word' }, wordNode(token, ctx));
    $('hz-page').append(box);
    return box;
  };
  const textOnly = (el) => [...el.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && n.tagName === 'SPAN' && n.children.length === 0));
  const rare = paint(panel.tokens[0]).querySelector('.word-rare');
  const tag = rare && rare.querySelector('.word-tag');
  check('a rare word carries a visible label', tag && tag.textContent === ui('rareLabel') && getComputedStyle(tag).display !== 'none' && tag.getBoundingClientRect().width > 0, tag ? tag.textContent : 'no label');
  check('and one sentence: not a common word, read from the full dictionary', rare && rare.textContent.includes(ui('rareWord')) && textOnly(rare), rare ? rare.textContent : '');
  check('a word of the first tier has no such label', !paint(fixture.tokens[0]).querySelector('.word-rare'));
  const compound = paint(panel.tokens[1]);
  const like = compound.querySelector('.word-like');
  const sentence = `インフォーム: ${ui('soundsLike')} 'inform' ${ui('soundsLikeNote')}`;
  check('a part\'s sound-alike is a line of its own that says it is a guess', like && like.textContent === sentence && textOnly(like), like ? like.textContent : 'no line');
  const made = compound.querySelector('.word-made');
  check('and never a gloss: the part still says it is not in the dictionary', made && !made.textContent.includes('inform') && made.textContent.includes(ui('notInDict')) && !compound.querySelector('.glosses'), made ? made.textContent : '');
  for (const box of document.querySelectorAll('.hz-word')) box.remove();

  const failed = results.filter((r) => !r.ok).length;
  $('hz-summary').textContent = failed ? `${failed} of ${results.length} checks failed` : `All ${results.length} checks passed`;
  window.__harness = { passed: results.length - failed, failed, results };
}

run().catch((err) => {
  console.error('[harness]', err);
  $('hz-summary').textContent = `The harness could not run: ${err && err.message ? err.message : err}`;
  window.__harness = { passed: results.filter((r) => r.ok).length, failed: 1, error: String(err), results };
}).finally(() => {
  for (const put of restore) put();
});
