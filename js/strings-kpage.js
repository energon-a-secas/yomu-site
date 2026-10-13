// The kanji page's strings (render-kanji-page.js) and the kana charts'
// (render-kana.js), { en, es }, merged into the page's one table through
// strings-more.js. Spanish is neutral.

export const KPAGE_STRINGS = Object.freeze({
  kanjiPage: { en: 'Kanji page', es: 'Página del kanji' },
  kpOpenFull: { en: 'Strokes, parts and words', es: 'Trazos, partes y palabras' },
  openKanjiPage: { en: 'Open the page of {ch}', es: 'Abrir la página de {ch}' },
  kpStrokesTitle: { en: 'How {ch} is drawn: {n} strokes', es: 'Cómo se traza {ch}: {n} trazos' },
  kpStrokesOne: { en: 'How {ch} is drawn: 1 stroke', es: 'Cómo se traza {ch}: 1 trazo' },
  kpNoStrokes: { en: 'No stroke order for this character.', es: 'No hay orden de trazos para este carácter.' },
  kpDraw: { en: 'Draw', es: 'Trazar' },
  kpNext: { en: 'Next stroke', es: 'Siguiente trazo' },
  kpAll: { en: 'Show all', es: 'Ver todo' },
  kpCountDiffers: {
    en: 'Drawn here in {n} strokes, as KanjiVG writes it; KANJIDIC counts {s}.',
    es: 'Aquí se traza en {n} trazos, como lo escribe KanjiVG; KANJIDIC cuenta {s}.',
  },
  kpStrokeOf: { en: 'Stroke {k} of {n}', es: 'Trazo {k} de {n}' },
  kpParts: { en: 'Made of', es: 'Formado por' },
  kpPartsNone: { en: 'KanjiVG names no parts for this kanji.', es: 'KanjiVG no nombra partes para este kanji.' },
  kpAlsoWith: { en: 'Also with {ch}', es: 'También con {ch}' },
  kpUsedIn: { en: 'Part of', es: 'Forma parte de' },
  kpWords: { en: 'Words with it', es: 'Palabras con él' },
  kpWordsNone: { en: 'No common word in the dictionary is written with it.', es: 'Ninguna palabra común del diccionario se escribe con él.' },
  kpBack: { en: 'Back to {ch}', es: 'Volver a {ch}' },
  kpLoading: { en: 'Loading the page…', es: 'Cargando la página…' },
  kpFailed: { en: 'This page could not be loaded.', es: 'No se pudo cargar esta página.' },
  kpFreq: { en: 'no. {n} in newspapers', es: 'n.º {n} en la prensa' },
  kpSource: {
    en: 'Strokes from KanjiVG; words from JMdict, most used first.',
    es: 'Trazos de KanjiVG; palabras de JMdict, las más usadas primero.',
  },
});
