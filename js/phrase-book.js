// Explicitly saved readings for native clients. Reuse History's text identity,
// limits and backup format; never enable automatic history or infer a source.
import { emptyHistory, cleanPhrases, mergePhrases, phrasesOf, savedList, saveText, unsaveText, textKey, normalizeText, MAX_TEXT, MAX_SAVED } from './history-store.js';
import { rowMatches } from './sets.js';

export const PHRASE_BOOK_FORMAT = 'yomu-phrase-book/1';
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Only authored library references whose text still matches can be followed. */
export function phraseSource(library, source, text, lang = 'en') {
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

export class PhraseBook {
  constructor(library, document, lang = 'en') {
    this.library = library;
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
    if (typeof text !== 'string' || !text.trim()) { this.message = 'Read a phrase before saving it.'; return; }
    text = text.trim();
    if (text.length > MAX_TEXT) { this.message = `Save up to ${MAX_TEXT.toLocaleString('en-US')} characters per phrase. Shorten this reading first; nothing has been truncated.`; return; }
    if (!Number.isFinite(now) || now <= 0) throw new Error('Invalid save time');
    const valid = phraseSource(this.library, source, text, this.lang);
    const result = saveText(this.data, text, 0, valid ? 'phrase' : 'typed', now);
    if (!result.ok) { this.message = `Your ${MAX_SAVED}-phrase collection is full. Remove a phrase to save another.`; return; }
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

  dump() { return { format: PHRASE_BOOK_FORMAT, phrases: phrasesOf(this.data), sources: { ...this.sources } }; }
}

export { textKey as phraseKey };
