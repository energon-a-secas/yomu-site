// Every learner-facing string the page draws, as { en, es }.
//
// Resolution follows Runcible's rule: a bare string is legal (a proper name, a
// Japanese example), English is the fallback, then Spanish, then an empty
// string. undefined never reaches the DOM.
//
// Notes about sounds and grammar do not live here. They belong to notes.js,
// which the analyzer's ids point into; this file is the page's own copy: the
// controls, the empty state, the errors, and the words for parts of speech.
// Spanish is neutral: no vosotros, no regional words. The collection's and
// History's strings are in strings-collect.js, and Play's in strings-play.js,
// merged into the same table.

import { COLLECT_STRINGS } from './strings-collect.js';
import { PLAY_STRINGS } from './strings-play.js';

export const LANGS = Object.freeze(['en', 'es']);

let current = 'en';

/** Set the language every later t() and ui() call resolves to. */
export function useLang(lang) {
  current = LANGS.includes(lang) ? lang : 'en';
  return current;
}

export function currentLang() {
  return current;
}

/** Resolve a { en, es } object, or pass a plain string through. */
export function t(obj, lang = current) {
  if (obj === null || obj === undefined) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return String(obj);
  for (const key of [lang, 'en', 'es']) {
    const v = obj[key];
    if (v !== null && v !== undefined && v !== '') return String(v);
  }
  return '';
}

/** A page string by key, with {name} placeholders filled from vars. */
export function ui(key, vars) {
  const raw = t(STRINGS[key]);
  if (!raw && typeof console !== 'undefined') console.warn(`[yomu] no string "${key}"`);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

export const STRINGS = Object.freeze({
  ...COLLECT_STRINGS,
  ...PLAY_STRINGS,
  pageTitle: { en: 'Yomu | Read Japanese word by word', es: 'Yomu | Lee japonés palabra por palabra' },
  subtitle: { en: 'Read Japanese word by word', es: 'Lee japonés palabra por palabra' },
  skip: { en: 'Skip to content', es: 'Saltar al contenido' },
  phrases: { en: 'Phrases', es: 'Frases' },
  langName: { en: 'English', es: 'Español' },
  langToggle: { en: 'Language: English. Switch to Spanish', es: 'Idioma: español. Cambiar a inglés' },

  textLabel: { en: 'Japanese text', es: 'Texto en japonés' },
  textHint: {
    en: 'Paste a line you met: a sign, a lyric, a message, a sentence from a book.',
    es: 'Pega una línea que encontraste: un cartel, una canción, un mensaje, una frase de un libro.',
  },
  clear: { en: 'Clear', es: 'Borrar' },
  tooLong: { en: 'Reading the first {n} characters.', es: 'Se leen los primeros {n} caracteres.' },

  display: { en: 'Display', es: 'Vista' },
  furigana: { en: 'Furigana', es: 'Furigana' },
  romaji: { en: 'Romaji', es: 'Romaji' },
  highlights: { en: 'Highlights', es: 'Marcas' },
  on: { en: 'On', es: 'Sí' },
  off: { en: 'Off', es: 'No' },
  said: { en: 'Said', es: 'Dicho' },
  spelled: { en: 'Spelled', es: 'Escrito' },

  speakAll: { en: 'Speak all', es: 'Leer todo' },
  stop: { en: 'Stop', es: 'Detener' },
  slow: { en: 'Slow', es: 'Lento' },
  sendTo: { en: 'Send the text to', es: 'Enviar el texto a' },
  sendHint: {
    en: 'Opens a new tab. The text leaves this page only when you click one of these.',
    es: 'Abre una pestaña nueva. El texto sale de esta página solo cuando haces clic en uno de estos.',
  },
  deepl: { en: 'DeepL', es: 'DeepL' },
  google: { en: 'Google Translate', es: 'Google Traductor' },
  sendTitle: { en: 'Opens {site} in a new tab with this text', es: 'Abre {site} en una pestaña nueva con este texto' },

  speechChecking: { en: 'Looking for a Japanese voice on this device.', es: 'Buscando una voz japonesa en este dispositivo.' },
  speechNone: {
    en: 'This device has no Japanese voice, so nothing can be read aloud. Add one in your system speech settings.',
    es: 'Este dispositivo no tiene voz japonesa, así que no se puede leer en voz alta. Agrega una en los ajustes de voz del sistema.',
  },
  speechNoApi: { en: 'This browser cannot read aloud.', es: 'Este navegador no puede leer en voz alta.' },

  loadingReader: { en: 'Loading the reader', es: 'Cargando el lector' },
  loadingShards: { en: 'Looking up {done} of {total} dictionary files', es: 'Consultando {done} de {total} archivos del diccionario' },
  failedFile: { en: 'Could not load {file} ({detail}).', es: 'No se pudo cargar {file} ({detail}).' },
  failedReader: { en: 'The reader could not start ({detail}).', es: 'El lector no pudo iniciar ({detail}).' },
  retry: { en: 'Retry', es: 'Reintentar' },
  readOne: { en: 'Read 1 word.', es: 'Se leyó 1 palabra.' },
  readMany: { en: 'Read {n} words.', es: 'Se leyeron {n} palabras.' },
  guessOne: { en: '1 is not in the dictionary, so its reading is a guess.', es: '1 no está en el diccionario, así que su lectura es una suposición.' },
  guessMany: { en: '{n} are not in the dictionary, so their readings are guesses.', es: '{n} no están en el diccionario, así que sus lecturas son suposiciones.' },
  noJapanese: { en: 'No Japanese found in this text.', es: 'No se encontró japonés en este texto.' },

  emptyTitle: { en: 'Paste a line of Japanese above.', es: 'Pega arriba una línea en japonés.' },
  emptyLead: { en: 'Or start with one of these:', es: 'O empieza con una de estas:' },

  reading: { en: 'Reading', es: 'Lectura' },
  readingHint: {
    en: 'Choose a word to see it on its own. The arrow keys move between words.',
    es: 'Elige una palabra para verla sola. Las flechas recorren las palabras.',
  },
  inText: { en: 'In this text', es: 'En este texto' },
  inTextNone: { en: 'No special sounds or grammar notes in this text.', es: 'No hay sonidos especiales ni notas de gramática en este texto.' },
  soundsHead: { en: 'Sounds', es: 'Sonidos' },
  grammarHead: { en: 'Grammar', es: 'Gramática' },
  loanHead: { en: 'Loanword rules', es: 'Reglas de préstamos' },
  countSuffix: { en: 'in this text', es: 'en este texto' },
  sentencesOne: { en: 'in 1 sentence', es: 'en 1 oración' },
  sentencesMany: { en: 'in {n} sentences', es: 'en {n} oraciones' },

  show: { en: 'Show', es: 'Mostrar' },
  details: { en: 'Details', es: 'Detalles' },
  word: { en: 'Word', es: 'Palabra' },
  kanji: { en: 'Kanji', es: 'Kanji' },
  notes: { en: 'Notes', es: 'Notas' },
  closeDetails: { en: 'Close the details', es: 'Cerrar los detalles' },

  wordEmpty: { en: 'Choose a word in the reading to see it here.', es: 'Elige una palabra de la lectura para verla aquí.' },
  kanaReading: { en: 'Reading', es: 'Lectura' },
  saidLine: { en: 'Said', es: 'Se dice' },
  spelledLine: { en: 'Spelled', es: 'Se escribe' },
  beats: { en: 'Beats', es: 'Pulsos' },
  beatsHint: { en: 'One beat per kana, the way the word is timed.', es: 'Un pulso por kana, como se mide la palabra.' },
  soundOut: { en: 'Sound it out', es: 'Pronunciar por pulsos' },
  speakWord: { en: 'Say the word', es: 'Decir la palabra' },
  partOfSpeech: { en: 'Kind of word', es: 'Tipo de palabra' },
  meanings: { en: 'Meanings', es: 'Significados' },
  meaningsEnglish: { en: 'Dictionary meanings are in English.', es: 'Los significados del diccionario están en inglés.' },
  formed: { en: 'How it is formed', es: 'Cómo se forma' },
  dictionaryForm: { en: 'dictionary form', es: 'forma de diccionario' },
  wordNotes: { en: 'Notes for this word', es: 'Notas de esta palabra' },
  openNote: { en: 'Open the note', es: 'Abrir la nota' },
  jisho: { en: 'Look up on Jisho', es: 'Buscar en Jisho' },
  jishoTitle: { en: 'Opens jisho.org in a new tab with this word', es: 'Abre jisho.org en una pestaña nueva con esta palabra' },
  guess: {
    en: 'No dictionary entry for this word, so the reading is a guess.',
    es: 'Esta palabra no está en el diccionario, así que la lectura es una suposición.',
  },
  altsOne: { en: 'One other entry is written the same way.', es: 'Otra entrada se escribe igual.' },
  altsMany: { en: '{n} other entries are written the same way.', es: 'Otras {n} entradas se escriben igual.' },
  noMeaning: { en: 'No meaning listed.', es: 'Sin significado registrado.' },
  rareLabel: { en: 'Rare word', es: 'Palabra poco común' },
  rareWord: { en: 'It is not among the common words, so it was read from the full dictionary.', es: 'No está entre las palabras comunes, así que se leyó del diccionario completo.' },
  rareTag: { en: 'rare word', es: 'palabra poco común' },
  noSplit: {
    en: 'It cannot be split into dictionary words either.',
    es: 'Tampoco se puede dividir en palabras del diccionario.',
  },
  madeOf: { en: 'Made of', es: 'Formada por' },
  notInDict: { en: 'not in the dictionary', es: 'no está en el diccionario' },
  soundsLike: { en: 'Sounds like English', es: 'Suena como el inglés' },
  soundsLikeNote: { en: '(a guess from the sound, not a dictionary entry)', es: '(una suposición por el sonido, no una entrada del diccionario)' },
  compoundRule: {
    en: 'Written as one word. The dictionary has its parts, not the whole.',
    es: 'Se escribe como una sola palabra. El diccionario tiene sus partes, no el conjunto.',
  },
  compoundGuess: {
    en: 'No split into dictionary words covers all of it, so the part that is not in the dictionary is read as written.',
    es: 'Ninguna división en palabras del diccionario la cubre entera, así que la parte que no está en el diccionario se lee tal como se escribe.',
  },
  origin: { en: 'Where it comes from', es: 'De dónde viene' },
  fromLang: { en: 'From {lang}', es: 'Del {lang}' },
  fromLangWord: { en: 'From {lang}: {word}', es: 'Del {lang}: {word}' },
  fromOther: { en: 'From another language ({code})', es: 'De otro idioma ({code})' },
  wasei: { en: 'Made-in-Japan English', es: 'Inglés hecho en Japón' },
  waseiWord: { en: 'Made-in-Japan English, from {word}', es: 'Inglés hecho en Japón, a partir de {word}' },
  shortened: { en: 'Shortened from {words}', es: 'Acortada de {words}' },

  kanjiEmpty: { en: 'No kanji in this text.', es: 'No hay kanji en este texto.' },
  kanjiHint: {
    en: 'Point at a row to find that kanji in the text. On a touch screen, tap it. The bookmark saves it to My kanji.',
    es: 'Señala una fila para encontrar ese kanji en el texto. En una pantalla táctil, tócala. El marcador lo guarda en Mis kanji.',
  },
  here: { en: 'here', es: 'aquí' },
  onReading: { en: 'on', es: 'on' },
  kunReading: { en: 'kun', es: 'kun' },
  parts: { en: 'parts', es: 'partes' },
  strokes: { en: '{n} strokes', es: '{n} trazos' },
  kanjiMissing: { en: 'Not in the kanji dictionary.', es: 'No está en el diccionario de kanji.' },

  notesEmpty: {
    en: 'Choose a line under "In this text" to read its note here.',
    es: 'Elige una línea de "En este texto" para leer su nota aquí.',
  },
  noteMissing: { en: 'There is no note for this yet.', es: 'Todavía no hay nota para esto.' },
  examples: { en: 'Examples', es: 'Ejemplos' },
  example: { en: 'Example', es: 'Ejemplo' },
  pattern: { en: 'Pattern', es: 'Estructura' },
  whispered: { en: 'whispered', es: 'susurrado' },
  pairWith: { en: 'with', es: 'con' },
  pairWithout: { en: 'without', es: 'sin' },
  noteFallback: { en: 'Part of this note is only in English so far.', es: 'Parte de esta nota todavía está solo en inglés.' },
  minimalPair: { en: 'Minimal pair', es: 'Par mínimo' },
  close: { en: 'Close', es: 'Cerrar' },

  phrasesTitle: { en: 'Phrases', es: 'Frases' },
  phrasesLead: {
    en: 'Choose a phrase to read it word by word.',
    es: 'Elige una frase para leerla palabra por palabra.',
  },
  phrasesLoading: { en: 'Loading the phrases', es: 'Cargando las frases' },
  dialogues: { en: 'Dialogues', es: 'Diálogos' },
  readPhrase: { en: 'Read it', es: 'Leerla' },
  readDialogue: { en: 'Read the dialogue', es: 'Leer el diálogo' },
  chunkIt: { en: 'Chunk it', es: 'Por partes' },
  chunkHint: {
    en: 'Each beat first, then the whole phrase.',
    es: 'Primero cada pulso, luego la frase entera.',
  },
  translation: { en: 'Translation', es: 'Traducción' },

  openInYomu: { en: 'Open in Yomu', es: 'Abrir en Yomu' },

  // My kanji: the save toggle, the counts, the screen, the review, the backup.
  // A {ch} is filled with a kanji in its own lang="ja" span (render-save.js).
  myKanji: { en: 'My kanji', es: 'Mis kanji' },
  dueCountSr: { en: ', {n} due for review', es: ', {n} para repasar' },
  saveKanji: { en: 'Save {ch} to My kanji', es: 'Guardar {ch} en Mis kanji' },
  removeKanji: { en: 'Remove {ch} from My kanji', es: 'Quitar {ch} de Mis kanji' },
  seenTimes: { en: 'seen {n} times', es: 'visto {n} veces' },
  seenFirst: { en: 'first time', es: 'primera vez' },
  seenOnce: { en: 'seen once', es: 'visto una vez' },
  unsavedKanji: { en: 'Unsaved kanji', es: 'Kanji sin guardar' },
  mark: { en: 'Mark', es: 'Marcar' },
  wordKanji: { en: 'Kanji in this word', es: 'Kanji de esta palabra' },
  today: { en: 'today', es: 'hoy' },
  tomorrow: { en: 'tomorrow', es: 'mañana' },

  backToReader: { en: 'Back to the reader', es: 'Volver al lector' },
  myKanjiLead: {
    en: 'Kanji you save, and every kanji you have read here. They stay in this browser.',
    es: 'Los kanji que guardas y todos los que leíste aquí. Se quedan en este navegador.',
  },
  loadingKanji: { en: 'Loading the kanji details', es: 'Cargando los detalles de los kanji' },
  kanjiInfoFailed: { en: 'Could not load the kanji details ({detail}).', es: 'No se pudieron cargar los detalles de los kanji ({detail}).' },
  storeDamaged: {
    en: 'Your saved kanji could not be read, so My kanji started empty. A copy of the old data is kept in this browser.',
    es: 'No se pudieron leer tus kanji guardados, así que Mis kanji empezó vacío. Una copia de los datos anteriores queda en este navegador.',
  },
  storePartial: {
    en: 'Part of My kanji could not be read and was left out ({n} entries).',
    es: 'Una parte de Mis kanji no se pudo leer y quedó fuera ({n} entradas).',
  },
  storeBlocked: {
    en: 'This browser is not keeping My kanji, so it lasts until this page closes.',
    es: 'Este navegador no está guardando Mis kanji, así que dura hasta que se cierre esta página.',
  },

  dueHead: { en: 'Due for review', es: 'Para repasar' },
  dueOne: { en: '1 kanji is due.', es: 'Hay 1 kanji para repasar.' },
  dueMany: { en: '{n} kanji are due.', es: 'Hay {n} kanji para repasar.' },
  dueNone: { en: 'Nothing is due. Next review: {day}.', es: 'No hay nada para repasar. Próximo repaso: {day}.' },
  dueEmpty: {
    en: 'Nothing to review yet. A kanji you save is due the same day.',
    es: 'Todavía no hay nada para repasar. Un kanji que guardas se repasa el mismo día.',
  },
  startReview: { en: 'Start review', es: 'Empezar el repaso' },

  savedHead: { en: 'Saved', es: 'Guardados' },
  sortBy: { en: 'Sort', es: 'Ordenar' },
  sortRecent: { en: 'Recently saved', es: 'Recientes' },
  sortSeen: { en: 'Most seen', es: 'Más vistos' },
  sortDue: { en: 'Due', es: 'Por repaso' },
  filter: { en: 'Filter', es: 'Filtrar' },
  filterHint: { en: 'A kanji, a meaning or a reading', es: 'Un kanji, un significado o una lectura' },
  savedEmpty: {
    en: 'No saved kanji yet. In the reader, the bookmark beside a kanji in the Kanji table or the Word panel saves it.',
    es: 'Todavía no hay kanji guardados. En el lector, el marcador junto a un kanji en la tabla de kanji o en el panel de la palabra lo guarda.',
  },
  filterNone: { en: 'No saved kanji match the filter.', es: 'Ningún kanji guardado coincide con el filtro.' },
  savedOn: { en: 'saved {day}', es: 'guardado: {day}' },
  dueOn: { en: 'review {day}', es: 'repaso: {day}' },
  notSeen: { en: 'not met in a text yet', es: 'todavía no aparece en un texto' },
  metIn: { en: 'Met in', es: 'Visto en' },
  meaning: { en: 'Meaning', es: 'Significado' },
  remove: { en: 'Remove', es: 'Quitar' },

  oftenHead: { en: 'Seen often, not saved', es: 'Vistos a menudo, sin guardar' },
  oftenEmpty: {
    en: 'The kanji you read show up here, the ones met most first.',
    es: 'Aquí aparecen los kanji que lees, primero los que más viste.',
  },
  oftenAllSaved: { en: 'Every kanji you have met is saved.', es: 'Todos los kanji que viste están guardados.' },

  backupHead: { en: 'Backup', es: 'Copia de seguridad' },
  backupLead: {
    en: 'Export saves a file with your kanji, their counts and the phrases you saved in History, and no other text. Import adds a file to what is here.',
    es: 'Exportar guarda un archivo con tus kanji, sus conteos y las frases que guardaste en el historial, y ningún otro texto. Importar suma un archivo a lo que ya hay.',
  },
  exportFile: { en: 'Export', es: 'Exportar' },
  importFile: { en: 'Import', es: 'Importar' },
  clearAll: { en: 'Clear all', es: 'Borrar todo' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  clearTitle: { en: 'Clear all of My kanji?', es: '¿Borrar todo Mis kanji?' },
  clearBody: {
    en: 'This forgets every saved kanji, its review schedule and every count of the kanji you met, in this browser, so your collection is emptied too. History is not touched. Export first to keep a copy.',
    es: 'Esto olvida en este navegador cada kanji guardado, su calendario de repaso y cada conteo de los kanji que viste, así que tu colección también queda vacía. El historial no se toca. Exporta antes para guardar una copia.',
  },
  cleared: { en: 'My kanji is empty now.', es: 'Mis kanji quedó vacío.' },
  exported: { en: 'Saved {file}.', es: 'Se guardó {file}.' },
  imported: {
    en: 'Imported: {saved} saved kanji added, {seen} kanji counts added or raised.',
    es: 'Importado: {saved} kanji guardados nuevos, {seen} conteos de kanji nuevos o mayores.',
  },
  importDropped: { en: '{n} damaged entries were left out.', es: 'Se dejaron fuera {n} entradas dañadas.' },
  importJson: { en: 'That file is not JSON, so nothing was imported.', es: 'Ese archivo no es JSON, así que no se importó nada.' },
  importFormat: { en: 'That file is not a Yomu kanji backup, so nothing was imported.', es: 'Ese archivo no es una copia de Mis kanji de Yomu, así que no se importó nada.' },
  importEmpty: { en: 'That backup holds no kanji.', es: 'Esa copia no tiene kanji.' },
  importSize: { en: 'That file is too large to be a kanji backup.', es: 'Ese archivo es demasiado grande para ser una copia de kanji.' },
  importRead: { en: 'That file could not be read.', es: 'No se pudo leer ese archivo.' },

  review: { en: 'Review', es: 'Repaso' },
  reviewOf: { en: '{at} of {of}', es: '{at} de {of}' },
  reviewAgainTag: { en: 'once more', es: 'una vez más' },
  reviewPrompt: {
    en: 'Recall how it is read and what it means, then show the answer.',
    es: 'Recuerda cómo se lee y qué significa, y luego muestra la respuesta.',
  },
  reviewShow: { en: 'Show', es: 'Mostrar' },
  again: { en: 'Again', es: 'Otra vez' },
  gotIt: { en: 'Got it', es: 'Lo sabía' },
  leaveReview: { en: 'Leave the review', es: 'Salir del repaso' },
  reviewKeys: {
    en: 'Keys: Space shows the answer, 1 is Again, 2 is Got it, Escape leaves.',
    es: 'Teclas: Espacio muestra la respuesta, 1 es Otra vez, 2 es Lo sabía, Escape sale.',
  },
  reviewNothing: { en: 'Nothing is due right now.', es: 'No hay nada para repasar ahora.' },
  reviewDone: { en: 'Review done', es: 'Repaso terminado' },
  reviewSummary: {
    en: 'You reviewed {n} kanji: {got} on the first try, {again} with Again.',
    es: 'Repasaste {n} kanji: {got} al primer intento y {again} con Otra vez.',
  },
  reviewAgainList: { en: 'Back tomorrow:', es: 'Vuelven mañana:' },
  nextReview: { en: 'Next review: {day}, {n} kanji.', es: 'Próximo repaso: {day}, {n} kanji.' },
  backToMyKanji: { en: 'Back to My kanji', es: 'Volver a Mis kanji' },
  noInfo: { en: 'No details in the kanji dictionary.', es: 'Sin detalles en el diccionario de kanji.' },
  // JMnedict is named here because a name from the names tier can be on
  // screen at any time, and its licence asks for the acknowledgement there.
  footerNote: {
    en: 'Dictionary: JMdict, JMnedict and KANJIDIC, EDRDG, CC BY-SA 4.0. Your text stays in this browser.',
    es: 'Diccionario: JMdict, JMnedict y KANJIDIC, EDRDG, CC BY-SA 4.0. Tu texto se queda en este navegador.',
  },
});

/** Three lines to start from, one greeting, one with は and を, one with kanji. */
export const EXAMPLES = Object.freeze([
  { ja: 'おはようございます。', en: 'Good morning (polite).', es: 'Buenos días (cortés).' },
  { ja: 'わたしはパンをたべます。', en: 'I eat bread.', es: 'Yo como pan.' },
  { ja: '今日は雨が降っています。', en: 'It is raining today.', es: 'Hoy está lloviendo.' },
]);

/** The textarea placeholder: short, and itself a sentence worth reading. */
export const PLACEHOLDER = '駅はどこですか。';

// ── Parts of speech ───────────────────────────────────────────────────────
//
// JMdict tags, said in words. A tag this table does not know is shown as the
// tag itself rather than dropped: a learner can still look it up, and a
// reviewer can see which one is missing.

const GODAN_ENDING = { u: 'う', k: 'く', g: 'ぐ', s: 'す', t: 'つ', n: 'ぬ', b: 'ぶ', m: 'む', r: 'る' };

const POS = Object.freeze({
  n: { en: 'noun', es: 'sustantivo' },
  pn: { en: 'pronoun', es: 'pronombre' },
  'n-pr': { en: 'name', es: 'nombre propio' },
  'n-t': { en: 'noun of time', es: 'sustantivo de tiempo' },
  'n-adv': { en: 'noun used as an adverb', es: 'sustantivo que funciona como adverbio' },
  'n-suf': { en: 'noun used as a suffix', es: 'sustantivo que funciona como sufijo' },
  'n-pref': { en: 'noun used as a prefix', es: 'sustantivo que funciona como prefijo' },
  v1: { en: 'ichidan verb (ends in る, drops it)', es: 'verbo ichidan (termina en る y la pierde)' },
  'v1-s': { en: 'ichidan verb, special', es: 'verbo ichidan, especial' },
  vk: { en: 'the verb くる, irregular', es: 'el verbo くる, irregular' },
  vs: { en: 'noun that becomes a verb with する', es: 'sustantivo que se vuelve verbo con する' },
  'vs-i': { en: 'する verb, irregular', es: 'verbo con する, irregular' },
  'vs-s': { en: 'する verb, special', es: 'verbo con する, especial' },
  vz: { en: 'ずる verb', es: 'verbo en ずる' },
  vt: { en: 'takes an object', es: 'lleva objeto directo' },
  vi: { en: 'takes no object', es: 'no lleva objeto directo' },
  'adj-i': { en: 'i-adjective', es: 'adjetivo en -i' },
  'adj-ix': { en: 'i-adjective, いい and よい', es: 'adjetivo en -i, いい y よい' },
  'adj-na': { en: 'na-adjective', es: 'adjetivo en -na' },
  'adj-no': { en: 'can take の before a noun', es: 'puede llevar の antes de un sustantivo' },
  'adj-pn': { en: 'comes before a noun', es: 'va antes de un sustantivo' },
  'adj-t': { en: 'taru adjective', es: 'adjetivo en -taru' },
  'adj-f': { en: 'modifies the noun after it', es: 'modifica al sustantivo siguiente' },
  adv: { en: 'adverb', es: 'adverbio' },
  'adv-to': { en: 'adverb, can take と', es: 'adverbio, puede llevar と' },
  aux: { en: 'auxiliary', es: 'auxiliar' },
  'aux-v': { en: 'auxiliary verb', es: 'verbo auxiliar' },
  'aux-adj': { en: 'auxiliary adjective', es: 'adjetivo auxiliar' },
  conj: { en: 'conjunction', es: 'conjunción' },
  cop: { en: 'copula (is, are)', es: 'cópula (es, son)' },
  ctr: { en: 'counter', es: 'contador' },
  exp: { en: 'expression', es: 'expresión' },
  int: { en: 'interjection', es: 'interjección' },
  num: { en: 'number', es: 'número' },
  pref: { en: 'prefix', es: 'prefijo' },
  suf: { en: 'suffix', es: 'sufijo' },
  prt: { en: 'particle', es: 'partícula' },
  unc: { en: 'unclassified', es: 'sin clasificar' },
});

const KIND_POS = Object.freeze({
  particle: 'prt', copula: 'cop', number: 'num', name: 'n-pr',
});

/** One tag in words. v5k is "godan verb, ends in く". */
export function posWord(tag) {
  if (POS[tag]) return t(POS[tag]);
  const godan = /^v5([a-z])/.exec(tag || '');
  if (godan) {
    const end = GODAN_ENDING[godan[1]];
    const base = { en: 'godan verb', es: 'verbo godan' };
    return end ? `${t(base)}, ${t({ en: 'ends in', es: 'termina en' })} ${end}` : t(base);
  }
  return String(tag || '');
}

/** A token's part of speech in words, from its entry, or from its kind (a number with a record is still a number). */
export function posWords(token) {
  const tags = token && token.kind !== 'number' && token.entry && token.entry.p ? String(token.entry.p).split(/\s+/).filter(Boolean) : [];
  if (!tags.length && token && KIND_POS[token.kind]) tags.push(KIND_POS[token.kind]);
  const seen = new Set();
  const out = [];
  for (const tag of tags) {
    const w = posWord(tag);
    if (w && !seen.has(w)) { seen.add(w); out.push(w); }
  }
  return out;
}

/**
 * The languages JMdict names as a borrowed word's source (`ls`, ISO 639-2
 * codes), the ones the dictionary has more than a handful of. A code not
 * listed is shown as a code (fromOther).
 */
const LANG_NAMES = Object.freeze({
  eng: { en: 'English', es: 'inglés' }, fre: { en: 'French', es: 'francés' },
  ger: { en: 'German', es: 'alemán' }, ita: { en: 'Italian', es: 'italiano' },
  dut: { en: 'Dutch', es: 'neerlandés' }, por: { en: 'Portuguese', es: 'portugués' },
  lat: { en: 'Latin', es: 'latín' }, chi: { en: 'Chinese', es: 'chino' },
  spa: { en: 'Spanish', es: 'español' }, rus: { en: 'Russian', es: 'ruso' },
  san: { en: 'Sanskrit', es: 'sánscrito' }, ara: { en: 'Arabic', es: 'árabe' },
  ain: { en: 'Ainu', es: 'ainu' }, kor: { en: 'Korean', es: 'coreano' },
  gre: { en: 'Greek', es: 'griego' }, grc: { en: 'Ancient Greek', es: 'griego antiguo' },
  haw: { en: 'Hawaiian', es: 'hawaiano' }, hin: { en: 'Hindi', es: 'hindi' },
  heb: { en: 'Hebrew', es: 'hebreo' }, tur: { en: 'Turkish', es: 'turco' },
  tha: { en: 'Thai', es: 'tailandés' }, vie: { en: 'Vietnamese', es: 'vietnamita' },
  swe: { en: 'Swedish', es: 'sueco' }, may: { en: 'Malay', es: 'malayo' },
  per: { en: 'Persian', es: 'persa' }, ukr: { en: 'Ukrainian', es: 'ucraniano' },
  hun: { en: 'Hungarian', es: 'húngaro' }, ind: { en: 'Indonesian', es: 'indonesio' },
  fin: { en: 'Finnish', es: 'finés' }, dan: { en: 'Danish', es: 'danés' },
  pol: { en: 'Polish', es: 'polaco' }, nor: { en: 'Norwegian', es: 'noruego' },
});

/**
 * Where a borrowed word came from, in words, from its record's `ls` and `ws`
 * (docs/ANALYZER.md), or '' when the record says nothing.
 */
export function originWords(entry) {
  if (!entry || !Array.isArray(entry.ls) || !entry.ls[0]) return '';
  const [code, word] = entry.ls;
  if (entry.ws) return word ? ui('waseiWord', { word }) : ui('wasei');
  if (!LANG_NAMES[code]) return ui('fromOther', { code });
  const lang = t(LANG_NAMES[code]);
  return word ? ui('fromLangWord', { lang, word }) : ui('fromLang', { lang });
}

const REGISTER = Object.freeze({
  set: { en: 'set phrase', es: 'frase hecha' },
  plain: { en: 'plain', es: 'simple' },
  casual: { en: 'casual', es: 'informal' },
  polite: { en: 'polite', es: 'cortés' },
  formal: { en: 'formal', es: 'formal' },
  humble: { en: 'humble', es: 'humilde' },
  honorific: { en: 'honorific', es: 'honorífico' },
  neutral: { en: 'neutral', es: 'neutro' },
});

/** A phrase's register in words; an unknown one is shown as written. */
export function registerWord(register) {
  return REGISTER[register] ? t(REGISTER[register]) : String(register || '');
}
