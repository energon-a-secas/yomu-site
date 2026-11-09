// Explicitly saved readings for native clients. Reuse History's text identity,
// limits and backup format; never enable automatic history or infer a source.
// Source titles, meanings and messages are in `lang`, which defaults to the
// current language (strings.js useLang).
import { t, currentLang } from './strings.js';
import { emptyHistory, cleanPhrases, mergePhrases, phrasesOf, savedList, saveText, unsaveText, textKey, normalizeText, MAX_TEXT, MAX_SAVED } from './history-store.js';
import { rowMatches } from './sets.js';

export const PHRASE_BOOK_FORMAT = 'yomu-phrase-book/1';
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Only authored library references whose text still matches can be followed. */
export function phraseSource(library, source, text, lang = currentLang()) {
  if (!object(source) || typeof source.id !== 'string') return null;
  let original, title, meaning, ref;
  if (source.kind === 'conversation') {
    const d = library.dialogues.find((d) => d.id === source.id);
    if (!d) return null;
    if (source.line === undefined || source.line === null) {
      original = d.lines.map((l) => l.ja).join('\n');
      ref = { kind: source.kind, id: d.id };
    } else if (Number.isInteger(source.line) && source.line >= 0 && source.line < d.lines.length) {
      original = d.lines[source.line].ja;
      meaning = (d.translation?.[lang] || d.translation?.en)?.[source.line];
      ref = { kind: source.kind, id: d.id, line: source.line };
    } else return null;
    title = d.title[lang] || d.title.en || d.id;
  } else if (source.kind === 'expression') {
    const p = library.phrases.find((p) => p.id === source.id);
    if (!p) return null;
    original = p.ja;
    title = p[lang] || p.en || p.ja;
    meaning = p[lang] || p.en;
    ref = { kind: source.kind, id: p.id };
  } else return null;
  if (normalizeText(text) !== normalizeText(original)) return null;
  return { ...ref, title, ...(meaning ? { meaning } : {}) };
}

const lineKeys = new WeakMap();

/**
 * The library line a History key names: an expression, or one line of a
 * conversation, with its source in `lang`; null for a key no line has.
 * The keys are worked out once per library.
 */
export function libraryLine(library, key, lang = currentLang()) {
  if (!object(library) || typeof key !== 'string') return null;
  let keys = lineKeys.get(library);
  if (!keys) {
    keys = new Map();
    for (const p of library.phrases || []) if (typeof p.ja === 'string' && !keys.has(textKey(p.ja))) keys.set(textKey(p.ja), { kind: 'expression', id: p.id });
    for (const d of library.dialogues || []) {
      (d.lines || []).forEach((l, line) => {
        if (typeof l.ja === 'string' && !keys.has(textKey(l.ja))) keys.set(textKey(l.ja), { kind: 'conversation', id: d.id, line });
      });
    }
    lineKeys.set(library, keys);
  }
  const ref = keys.get(key);
  if (!ref) return null;
  const text = ref.kind === 'expression'
    ? library.phrases.find((p) => p.id === ref.id).ja
    : library.dialogues.find((d) => d.id === ref.id).lines[ref.line].ja;
  return { text, source: phraseSource(library, ref, text, lang) };
}

export class PhraseBook {
  constructor(library, document, lang) {
    this.library = library;
    // None means the current language, whenever a source or message is shown.
    this.lang = lang;
    this.data = emptyHistory();
    this.sources = {};
    this.recovered = false;
    this.message = null;
    if (document == null) return;
    if (!object(document) || document.format !== PHRASE_BOOK_FORMAT) { this.recovered = true; return; }
    const checked = cleanPhrases(document.phrases);
    const merged = mergePhrases(this.data, checked.phrases);
    this.recovered = checked.dropped > 0 || merged.full > 0 || !Array.isArray(document.phrases);
    if (object(document.sources)) {
      for (const [key, source] of Object.entries(document.sources)) {
        const entry = this.data.entries[key];
        const valid = entry && phraseSource(library, source, entry.t, lang);
        if (valid) this.sources[key] = this.reference(valid);
        else this.recovered = true;
      }
    } else if (document.sources != null) this.recovered = true;
  }

  reference({ kind, id, line }) { return { kind, id, ...(line == null ? {} : { line }) }; }

  save(text, source, now) {
    this.message = null;
    if (typeof text !== 'string' || !text.trim()) {
      this.message = t({ en: 'Read a phrase before saving it.', es: 'Lee una frase antes de guardarla.' }, this.lang);
      return;
    }
    text = text.trim();
    if (text.length > MAX_TEXT) {
      this.message = t({
        en: `Save up to ${MAX_TEXT.toLocaleString('en-US')} characters per phrase. Shorten this reading first; nothing has been truncated.`,
        es: `Guarda hasta ${MAX_TEXT.toLocaleString('es')} caracteres por frase. Primero acorta esta lectura; no se recortó nada.`,
      }, this.lang);
      return;
    }
    if (!Number.isFinite(now) || now <= 0) throw new Error('Invalid save time');
    const valid = phraseSource(this.library, source, text, this.lang);
    const result = saveText(this.data, text, 0, valid ? 'phrase' : 'typed', now);
    if (!result.ok) {
      this.message = t({
        en: `Your ${MAX_SAVED}-phrase collection is full. Remove a phrase to save another.`,
        es: `Tu colección de ${MAX_SAVED.toLocaleString('es')} frases está llena. Quita una para guardar otra.`,
      }, this.lang);
      return;
    }
    // A source-free paste never erases a known origin for the same phrase.
    if (valid && !this.sources[result.key]) this.sources[result.key] = this.reference(valid);
  }

  remove(key) {
    this.message = null;
    unsaveText(this.data, key, false);
    delete this.sources[key];
  }

  view(query = '') {
    const items = savedList(this.data).map((e) => ({
      id: e.key, text: e.t, saved: e.saved,
      source: phraseSource(this.library, this.sources[e.key], e.t, this.lang),
    }));
    return { recovered: this.recovered, message: this.message, items: items.filter((p) =>
      !query.trim() || rowMatches([p.text, p.text, [p.source?.title || '', p.source?.meaning || '']], query)) };
  }

  /**
   * Add a backup's saved phrases (History's backup list) by History's merge:
   * a phrase already here keeps its earlier save, and the collection's limit
   * holds. A library source comes along only when it still matches the
   * phrase's text and the phrase has none here. What changed, as
   * history-store.js mergePhrases counts it, with the damaged entries left out.
   */
  merge(phrases, sources) {
    this.message = null;
    const checked = cleanPhrases(phrases);
    const sum = mergePhrases(this.data, checked.phrases);
    if (object(sources)) {
      for (const [key, source] of Object.entries(sources)) {
        const entry = this.data.entries[key];
        if (!entry || this.sources[key]) continue;
        const valid = phraseSource(this.library, source, entry.t, this.lang);
        if (valid) this.sources[key] = this.reference(valid);
      }
    }
    return { ...sum, dropped: checked.dropped };
  }

  /**
   * The text a History key names among the texts a native client keeps: a
   * saved phrase, else a line of the library, each with its source; null for
   * any other text, which the client does not keep (no automatic History).
   * A kanji met in a text points at its key (kanji-store.js `h`), and the
   * client's "Last seen in" reads the sentence from here.
   */
  keptText(key) {
    const e = typeof key === 'string' ? this.data.entries[key] : null;
    if (e && e.saved) return { text: e.t, source: phraseSource(this.library, this.sources[key], e.t, this.lang) };
    return libraryLine(this.library, key, this.lang);
  }

  dump() { return { format: PHRASE_BOOK_FORMAT, phrases: phrasesOf(this.data), sources: { ...this.sources } }; }
}

export { textKey as phraseKey };
