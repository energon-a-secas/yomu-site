// The strings of the kanji collection, the sources a kanji was last seen in,
// and History: the reader's ask card and "You read this before" banner, the
// save toggle for a text, the Collection and History screens, and the toasts.
//
// Kept apart from strings.js so both stay under the 500-line rule;
// strings.js merges this table into the one ui() reads, and
// tests/strings.test.mjs checks the two share no key. Same rules: { en, es },
// neutral Spanish, a {ch} is drawn as a kanji in its own lang="ja" span
// (render-save.js withKanji), and nothing here is ever put in an attribute
// with a learner's text in it.

export const COLLECT_STRINGS = Object.freeze({
  // The reader: asked once, after the first read.
  rememberAskTitle: { en: 'Remember what you read?', es: '¿Recordar lo que lees?' },
  rememberAskBody: {
    en: 'Yomu can keep the texts you read in this browser, tell you when you read one before, keep a History, and show the sentence each kanji was last seen in. Nothing is sent anywhere.',
    es: 'Yomu puede guardar en este navegador los textos que lees, avisarte cuando ya leíste uno, llevar un historial y mostrar la oración en la que viste cada kanji por última vez. No se envía nada a ningún lado.',
  },
  rememberYes: { en: 'Remember', es: 'Recordar' },
  rememberNo: { en: 'No thanks', es: 'No, gracias' },
  rememberOnToast: {
    en: 'Remembering what you read. History is under My kanji.',
    es: 'Se recordará lo que lees. El historial está en Mis kanji.',
  },

  // "You read this before", under the status line.
  whenToday: { en: 'today', es: 'hoy' },
  whenYesterday: { en: 'yesterday', es: 'ayer' },
  whenOn: { en: 'on {day}', es: 'el {day}' },
  seenBeforeOnce: { en: 'You read this before: once, {when}.', es: 'Ya leíste esto: una vez, {when}.' },
  seenBeforeMany: { en: 'You read this before: {n} times, last {when}.', es: 'Ya leíste esto: {n} veces, la última {when}.' },
  partInside: { en: 'This is part of a text you read {when}.', es: 'Esto es parte de un texto que leíste {when}.' },
  partHolds: { en: 'This holds a text you read {when}.', es: 'Esto contiene un texto que leíste {when}.' },

  // The reader's kanji table, and the toast after a read.
  newChip: { en: 'New', es: 'Nuevo' },
  toastNewOne: { en: 'New for your collection: {list}', es: 'Nuevo en tu colección: {list}' },
  toastNewMany: { en: 'New for your collection: {list}', es: 'Nuevos en tu colección: {list}' },
  toastJoyo: { en: 'Jōyō: {have} of {total}.', es: 'Jōyō: {have} de {total}.' },
  toastCount: { en: '{n} jōyō kanji!', es: '¡{n} kanji jōyō!' },
  toastGrade: { en: '{grade} complete!', es: '¡Completaste {grade}!' },

  // My kanji's three places.
  navLabel: { en: 'My kanji sections', es: 'Secciones de Mis kanji' },
  navReview: { en: 'Review', es: 'Repaso' },
  navCollection: { en: 'Collection', es: 'Colección' },
  navHistory: { en: 'History', es: 'Historial' },

  // The shelves.
  grade1: { en: '1st grade', es: '1.er grado' },
  grade2: { en: '2nd grade', es: '2.º grado' },
  grade3: { en: '3rd grade', es: '3.er grado' },
  grade4: { en: '4th grade', es: '4.º grado' },
  grade5: { en: '5th grade', es: '5.º grado' },
  grade6: { en: '6th grade', es: '6.º grado' },
  grade8: { en: 'Secondary school', es: 'Secundaria' },
  shelfExtra: { en: 'Extra', es: 'Extra' },
  shelfExtraLead: {
    en: 'Kanji you read that are not on the jōyō list: names, older forms, rarer characters.',
    es: 'Kanji que leíste y que no están en la lista jōyō: nombres, formas antiguas, caracteres menos comunes.',
  },

  // The Collection screen.
  collectionHead: { en: 'Your collection', es: 'Tu colección' },
  collectionLead: {
    en: 'Every kanji you read joins your collection. The shelves are the 2,136 jōyō kanji, the ones taught in Japanese schools, by grade.',
    es: 'Cada kanji que lees entra en tu colección. Los estantes son los 2136 kanji jōyō, los que se enseñan en las escuelas de Japón, por grado.',
  },
  collectionSum: { en: '{have} of {total} jōyō kanji', es: '{have} de {total} kanji jōyō' },
  collectionExtra: { en: '+{n} outside the jōyō list', es: '+{n} fuera de la lista jōyō' },
  lookOutHead: { en: 'Look out for', es: 'Próximos por encontrar' },
  lookOutLead: {
    en: 'The commonest kanji of {grade} you have not met yet.',
    es: 'Los kanji más comunes de {grade} que todavía no viste.',
  },
  allCollected: { en: 'Every jōyō kanji is in your collection.', es: 'Todos los kanji jōyō están en tu colección.' },
  shelvesHead: { en: 'Shelves', es: 'Estantes' },
  filterAll: { en: 'All', es: 'Todos' },
  filterHave: { en: 'Collected', es: 'En tu colección' },
  filterNot: { en: 'Not yet', es: 'Todavía no' },
  shelfOf: { en: '{have} of {total}', es: '{have} de {total}' },
  shelfComplete: { en: 'Complete', es: 'Completo' },
  shelfNone: { en: 'None on this shelf.', es: 'Ninguno en este estante.' },
  tileSeenOne: { en: '{ch}, seen in 1 text', es: '{ch}, visto en 1 texto' },
  tileSeen: { en: '{ch}, seen in {n} texts', es: '{ch}, visto en {n} textos' },
  tileNot: { en: '{ch}, not collected yet', es: '{ch}, todavía no está en tu colección' },
  joyoLoading: { en: 'Loading the jōyō list', es: 'Cargando la lista jōyō' },
  joyoFailed: { en: 'Could not load the jōyō list ({detail}).', es: 'No se pudo cargar la lista jōyō ({detail}).' },

  // The kanji dialog.
  jlptOld: { en: 'old JLPT level {n}', es: 'nivel {n} del JLPT antiguo' },
  seenSpanOne: { en: 'Seen in 1 text, {day}.', es: 'Visto en 1 texto: {day}.' },
  seenSpanMany: { en: 'Seen in {n} texts, first {first}, last {last}.', es: 'Visto en {n} textos: el primero {first}, el último {last}.' },
  notCollected: {
    en: 'Not collected yet: it joins your collection the first time you read a text with it.',
    es: 'Todavía no está en tu colección: entra la primera vez que leas un texto que lo tenga.',
  },
  dialogSaved: { en: 'Saved to My kanji', es: 'Guardado en Mis kanji' },
  dialogNotSaved: { en: 'Not saved to My kanji', es: 'Sin guardar en Mis kanji' },

  // Where a kanji was last seen.
  lastSeenIn: { en: 'Last seen in:', es: 'Visto por última vez en:' },
  lastSeen: { en: 'Last seen {day}', es: 'Visto por última vez: {day}' },
  lastSeenPaste: { en: 'Last seen {day}, in a text you pasted', es: 'Visto por última vez: {day}, en un texto que pegaste' },
  lastSeenTyped: { en: 'Last seen {day}, in a text you typed', es: 'Visto por última vez: {day}, en un texto que escribiste' },
  lastSeenExample: { en: 'Last seen {day}, in an example', es: 'Visto por última vez: {day}, en un ejemplo' },
  lastSeenPhrase: { en: 'Last seen {day}, in a phrase from the library', es: 'Visto por última vez: {day}, en una frase de la biblioteca' },
  lastSeenHost: { en: 'Last seen {day}, in a text Runcible sent', es: 'Visto por última vez: {day}, en un texto que envió Runcible' },
  lastSeenLink: { en: 'Last seen {day}, from a link', es: 'Visto por última vez: {day}, desde un enlace' },
  lastSeenHistory: { en: 'Last seen {day}, from your History', es: 'Visto por última vez: {day}, desde tu historial' },

  // The History screen.
  rememberHead: { en: 'Remember what I read', es: 'Recordar lo que leo' },
  rememberIsOn: {
    en: 'On. Yomu keeps the texts you read in this browser, up to 300 of them, and tells you when you read one before.',
    es: 'Activado. Yomu guarda en este navegador los textos que lees, hasta 300, y te avisa cuando ya leíste uno.',
  },
  rememberIsOff: {
    en: 'Off. Yomu keeps no text you read unless you save it, only which kanji you met and how often. Turn it on to keep a History, to hear when you read a text before, and to see the sentence each kanji was last seen in. The texts stay in this browser.',
    es: 'Desactivado. Yomu no guarda ningún texto que lees salvo los que guardes, solo qué kanji viste y cuántas veces. Actívalo para llevar un historial, saber cuándo ya leíste un texto y ver la oración en la que viste cada kanji por última vez. Los textos se quedan en este navegador.',
  },
  turnOn: { en: 'Turn on', es: 'Activar' },
  turnOff: { en: 'Turn off', es: 'Desactivar' },
  turnedOn: { en: 'Remembering is on.', es: 'Recordar está activado.' },
  turnedOff: { en: 'Remembering is off.', es: 'Recordar está desactivado.' },
  turnedOffForgot: { en: 'Remembering is off, and every text was forgotten.', es: 'Recordar está desactivado y se olvidaron todos los textos.' },
  offTitleOne: { en: 'Stop remembering and forget the text you read?', es: '¿Dejar de recordar y olvidar el texto que leíste?' },
  offTitleMany: { en: 'Stop remembering and forget the {n} texts?', es: '¿Dejar de recordar y olvidar los {n} textos?' },
  offBody: {
    en: 'Every text in History is forgotten in this browser. Your kanji, their counts and your collection stay.',
    es: 'Se olvida en este navegador cada texto del historial. Tus kanji, sus conteos y tu colección se quedan.',
  },
  offYes: { en: 'Forget and turn off', es: 'Olvidar y desactivar' },
  historyListHead: { en: 'Texts you read', es: 'Textos que leíste' },
  historyFilterHint: {
    en: 'Part of the text as written. Hiragana and katakana find each other, and romaji finds kana.',
    es: 'Una parte del texto tal como está escrito. Hiragana y katakana se encuentran entre sí, y el romaji encuentra kana.',
  },
  historyEmpty: {
    en: 'Nothing here yet. The texts you read from now on are listed here, the latest first.',
    es: 'Todavía no hay nada. Aquí aparecen los textos que leas desde ahora, primero el último.',
  },
  historyFilterNone: { en: 'No text matches the filter.', es: 'Ningún texto coincide con el filtro.' },
  readOnce: { en: 'Read once', es: 'Leído una vez' },
  readTimes: { en: 'Read {n} times', es: 'Leído {n} veces' },
  lastOn: { en: 'last {day}', es: 'último: {day}' },
  firstOn: { en: 'first {day}', es: 'primero: {day}' },
  srcPaste: { en: 'pasted', es: 'pegado' },
  srcTyped: { en: 'typed', es: 'escrito' },
  srcExample: { en: 'an example', es: 'un ejemplo' },
  srcPhrase: { en: 'a phrase', es: 'una frase' },
  srcLink: { en: 'from a link', es: 'desde un enlace' },
  srcHost: { en: 'from Runcible', es: 'desde Runcible' },
  srcHistory: { en: 'from History', es: 'desde el historial' },
  readAgain: { en: 'Read again', es: 'Leer otra vez' },
  forget: { en: 'Forget', es: 'Olvidar' },
  forgetAll: { en: 'Forget all', es: 'Olvidar todo' },
  forgetAllTitle: { en: 'Forget every text in History?', es: '¿Olvidar todos los textos del historial?' },
  forgetAllBody: {
    en: 'Remembering stays on, so the texts you read from now on are kept. Your kanji, their counts and your collection stay.',
    es: 'Recordar sigue activado, así que se guardan los textos que leas desde ahora. Tus kanji, sus conteos y tu colección se quedan.',
  },
  forgotOne: { en: 'That text is forgotten.', es: 'Ese texto se olvidó.' },
  forgotAll: { en: 'History is empty now.', es: 'El historial quedó vacío.' },
  historyDamaged: {
    en: 'Your History could not be read, so it started empty. A copy of the old data is kept in this browser until you forget all.',
    es: 'No se pudo leer tu historial, así que empezó vacío. Una copia de los datos anteriores queda en este navegador hasta que olvides todo.',
  },
  historyPartial: {
    en: 'Part of your History could not be read and was left out ({n} entries).',
    es: 'Una parte de tu historial no se pudo leer y quedó fuera ({n} entradas).',
  },
  historyBlocked: {
    en: 'This browser is not keeping History, so it lasts until this page closes.',
    es: 'Este navegador no está guardando el historial, así que dura hasta que se cierre esta página.',
  },

  // Saving a text on purpose: the reader's bookmark and History's rows.
  saveText: { en: 'Save this text', es: 'Guardar este texto' },
  textSaved: { en: 'Saved. Your saved phrases are in History.', es: 'Guardado. Tus frases guardadas están en el historial.' },
  textSavedOnly: {
    en: 'Saved, in History. Until you turn on Remember, Yomu keeps only the texts you save.',
    es: 'Guardado, en el historial. Hasta que actives Recordar, Yomu guarda solo los textos que guardes.',
  },
  textUnsaved: { en: 'Unsaved. It stays in History as a text you read.', es: 'Ya no está guardado. Sigue en el historial como un texto que leíste.' },
  textUnsavedGone: {
    en: 'Unsaved and forgotten: Remember is not on, so nothing else keeps it.',
    es: 'Ya no está guardado y se olvidó: Recordar no está activado, así que nada más lo guarda.',
  },
  savedFull: {
    en: 'You have {n} saved phrases, the most Yomu keeps, so this one was not saved. Unsave one in History first.',
    es: 'Tienes {n} frases guardadas, el máximo que guarda Yomu, así que esta no se guardó. Primero quita una de las guardadas en el historial.',
  },
  rowSaved: { en: 'Saved. It is under Saved phrases now.', es: 'Guardado. Ahora está en Frases guardadas.' },
  rowUnsaved: { en: 'Unsaved. It is back under Texts you read.', es: 'Ya no está guardado. Volvió a Textos que leíste.' },
  savedPhrasesHead: { en: 'Saved phrases', es: 'Frases guardadas' },
  savedPhrasesLead: {
    en: 'Texts you saved with the bookmark. They stay until you unsave them, whether Remember is on or off, and Export in My kanji writes them to your backup.',
    es: 'Textos que guardaste con el marcador. Se quedan hasta que los quites, con Recordar activado o no, y Exportar, en Mis kanji, los escribe en tu copia.',
  },
  savedFilterNone: { en: 'No saved phrase matches the filter.', es: 'Ninguna frase guardada coincide con el filtro.' },
  phraseSavedOn: { en: 'Saved {day}', es: 'Guardada: {day}' },
  phraseReadOnce: { en: 'read once', es: 'leída una vez' },
  phraseReadTimes: { en: 'read {n} times', es: 'leída {n} veces' },
  phraseLastOn: { en: 'last {day}', es: 'última: {day}' },
  forgetUnsavedOne: { en: 'Forget the text you did not save?', es: '¿Olvidar el texto que no guardaste?' },
  forgetUnsavedMany: { en: 'Forget the {n} texts you did not save?', es: '¿Olvidar los {n} textos que no guardaste?' },
  keepSavedOne: { en: 'Your saved phrase stays.', es: 'Tu frase guardada se queda.' },
  keepSavedMany: { en: 'Your {n} saved phrases stay.', es: 'Tus {n} frases guardadas se quedan.' },
  offTitleUnsavedOne: {
    en: 'Stop remembering and forget the text you did not save?',
    es: '¿Dejar de recordar y olvidar el texto que no guardaste?',
  },
  offTitleUnsavedMany: {
    en: 'Stop remembering and forget the {n} texts you did not save?',
    es: '¿Dejar de recordar y olvidar los {n} textos que no guardaste?',
  },
  offBodyKept: {
    en: 'Every text you did not save is forgotten in this browser. Your kanji, their counts and your collection stay.',
    es: 'Se olvida en este navegador cada texto que no guardaste. Tus kanji, sus conteos y tu colección se quedan.',
  },
  turnedOffKept: {
    en: 'Remembering is off. The texts you did not save were forgotten; your saved phrases stay.',
    es: 'Recordar está desactivado. Se olvidaron los textos que no guardaste; tus frases guardadas se quedan.',
  },
  forgotUnsaved: {
    en: 'The texts you did not save are forgotten. Your saved phrases stay.',
    es: 'Se olvidaron los textos que no guardaste. Tus frases guardadas se quedan.',
  },
  importedPhrases: {
    en: '{n} saved phrases added or updated.',
    es: '{n} frases guardadas nuevas o actualizadas.',
  },
  importPhrasesFull: {
    en: '{n} more did not fit: 500 saved phrases is the most.',
    es: 'Otras {n} no cupieron: 500 frases guardadas es el máximo.',
  },
});
