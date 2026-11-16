// A short, optional practice over an existing analysis. No dictionary rules,
// persistence or spaced-review changes live here. The caller owns this session.
import { sentenceAt } from './history-text.js';

/** Four distinct dictionary words at most, keeping the form in this text. */
export function textPracticeWords(analysis, language = 'en') {
  const found = new Set();
  const words = [];
  for (const token of analysis?.tokens || []) {
    if (!token.entry || !token.reading || token.confidence === 'guess'
        || ['particle', 'copula', 'name', 'punct', 'space', 'newline', 'guess'].includes(token.kind)) continue;
    const key = `${token.base || token.surface}|${token.entry.r?.[0] || token.reading}`;
    if (found.has(key)) continue;
    const meanings = language === 'es' ? token.entry.es?.g || token.entry.g : token.entry.g;
    if (!meanings?.length || !token.surface) continue;
    const sentence = sentenceAt(analysis.text, token.start, token.surface);
    if (!sentence) continue;
    found.add(key);
    words.push({ word: token.surface, reading: token.reading, meaning: meanings.slice(0, 2).join('; '),
      english: language === 'es' && !token.entry.es?.g,
      before: sentence.before, after: sentence.after });
    if (words.length === 4) break;
  }
  return words;
}

/** Recall, listen and fill a gap, with explicit self-assessment after reveal. */
export class TextPractice {
  constructor(analysis, language = 'en') {
    this.words = textPracticeWords(analysis, language);
    this.cards = ['recall', 'listen', 'gap'].flatMap((mode) => this.words
      .filter((w) => mode !== 'gap' || (w.before + w.after).replace(/[\s。！？!?、]/gu, '').length > 0)
      .map((w, index) => ({ ...w, mode, id: `${mode}:${index}` })));
    this.at = 0;
    this.shown = false;
    this.remembered = 0;
    this.missed = new Set();
  }

  view() {
    const card = this.cards[this.at];
    return { status: !this.cards.length ? 'empty' : card ? 'playing' : 'complete',
      position: Math.min(this.at + 1, this.cards.length), total: this.cards.length,
      wordCount: this.words.length, remembered: this.remembered, missed: [...this.missed],
      card: card ? { ...card, shown: this.shown } : null };
  }

  act(action, id) {
    const card = this.cards[this.at];
    // Ignore late or duplicate taps from the card that just left the screen.
    if (!card || id !== card.id) return this.view();
    if (action === 'show') this.shown = true;
    else if (this.shown && ['remembered', 'again'].includes(action)) {
      if (action === 'remembered') this.remembered += 1;
      else this.missed.add(card.word);
      this.at += 1;
      this.shown = false;
    }
    return this.view();
  }
}
