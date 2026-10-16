// The saved words' strings (word-store.js, render-words.js, the review's
// word card and the due lines that count words too), { en, es }.

export const WORDS_STRINGS = Object.freeze({
  saveWord: { en: 'Save {ch} to My words', es: 'Guardar {ch} en Mis palabras' },
  wordsFull: {
    en: 'My words holds {n} words, the most it keeps. Unsave one to save another.',
    es: 'Mis palabras guarda {n} palabras, el máximo. Quita una para guardar otra.',
  },
  navWords: { en: 'Words', es: 'Palabras' },
  wordsHead: { en: 'My words', es: 'Mis palabras' },
  wordsLead: {
    en: 'Words you saved from the Word panel, reviewed with your kanji: the word first, then its reading and meaning.',
    es: 'Palabras que guardaste desde el panel de la palabra, repasadas con tus kanji: primero la palabra, luego su lectura y su significado.',
  },
  wordsEmpty: {
    en: 'No words yet. Choose a word in the reader and press its bookmark to save it here.',
    es: 'Todavía no hay palabras. Elige una palabra en el lector y pulsa su marcador para guardarla aquí.',
  },
  wordsDue: { en: 'due {day}', es: 'para el {day}' },
  wordsDueNow: { en: 'due now', es: 'para repasar ya' },
  wordUnsave: { en: 'Unsave {ch}', es: 'Quitar {ch}' },
  wordRead: { en: 'Read {ch}', es: 'Leer {ch}' },
  wordOne: { en: '1 word', es: '1 palabra' },
  wordMany: { en: '{n} words', es: '{n} palabras' },
  dueWordsOnly: { en: '{w} due.', es: '{w} para repasar.' },
  dueBoth: { en: '{k} kanji and {w} are due.', es: 'Hay {k} kanji y {w} para repasar.' },
  nextReviewWords: { en: 'Next review: {day}, {w}.', es: 'Próximo repaso: {day}, {w}.' },
  nextReviewBoth: { en: 'Next review: {day}, {k} kanji and {w}.', es: 'Próximo repaso: {day}, {k} kanji y {w}.' },
  reviewSummaryMixed: {
    en: 'You reviewed {n}, kanji and words: {got} on the first try, {again} with Again.',
    es: 'Repasaste {n}, entre kanji y palabras: {got} al primer intento y {again} con Otra vez.',
  },
  reviewSummaryWords: {
    en: 'You reviewed {w}: {got} on the first try, {again} with Again.',
    es: 'Repasaste {w}: {got} al primer intento y {again} con Otra vez.',
  },
  rvWordMeaning: { en: 'Meaning', es: 'Significado' },
  rvWordRead: { en: 'Read it', es: 'Leerla' },
  importedWordsOne: { en: '1 saved word added or updated.', es: '1 palabra guardada nueva o actualizada.' },
  importedWordsMany: { en: '{n} saved words added or updated.', es: '{n} palabras guardadas nuevas o actualizadas.' },
});
