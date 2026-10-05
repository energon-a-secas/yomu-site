// The strings of Play (#/play): the four games' screen, their questions,
// their answers and the result.
//
// Kept apart from strings.js so both stay under the 500-line rule;
// strings.js merges this table into the one ui() reads, and
// tests/strings.test.mjs checks that no key of one hides a key of another.
// Same rules: { en, es }, neutral Spanish, a {ch} is drawn as a character in
// its own lang="ja" span (render-save.js withKanji), and nothing here is put
// in an attribute next to a learner's text. The hints and the example words
// are content, not chrome: they live in play-kana.js and play-twins.js.

export const PLAY_STRINGS = Object.freeze({
  play: { en: 'Play', es: 'Jugar' },
  playLead: {
    en: 'Four short games with the characters that look alike. Your best scores stay in this browser.',
    es: 'Cuatro juegos cortos con los caracteres que se parecen. Tus mejores puntajes se quedan en este navegador.',
  },
  backToPlay: { en: 'Back to Play', es: 'Volver a Jugar' },

  // The four games, as the list names them.
  gameWhich: { en: 'Which one?', es: '¿Cuál es?' },
  gameWhichLead: {
    en: 'Pick the kana for a sound, or the kanji for a meaning, among the ones that look like it.',
    es: 'Elige el kana de un sonido, o el kanji de un significado, entre los que se le parecen.',
  },
  gameOdd: { en: 'Odd one out', es: 'El intruso' },
  gameOddLead: {
    en: 'Find the one character that differs in a grid of its look-alike.',
    es: 'Encuentra el único carácter distinto en un cuadro lleno de su parecido.',
  },
  gameTwins: { en: 'Twins across scripts', es: 'Gemelos entre escrituras' },
  gameTwinsLead: {
    en: 'Tell カ from 力 and ー from 一 by the word around them.',
    es: 'Distingue カ de 力 y ー de 一 por la palabra que los rodea.',
  },
  gameNames: { en: 'Name decoder', es: 'Descifra el nombre' },
  gameNamesLead: {
    en: 'Read a name written in katakana and pick how it is spelled where it comes from.',
    es: 'Lee un nombre escrito en katakana y elige cómo se escribe en su idioma de origen.',
  },
  bestOf: { en: 'Best: {n} of {of}', es: 'Mejor: {n} de {of}' },
  bestTimed: { en: 'Best: {n} in 60 seconds', es: 'Mejor: {n} en 60 segundos' },
  bestFree: { en: 'untimed: {n} of {of}', es: 'sin tiempo: {n} de {of}' },
  bestNone: { en: 'Not played yet', es: 'Todavía sin jugar' },
  roundsOne: { en: '1 round', es: '1 ronda' },
  roundsMany: { en: '{n} rounds', es: '{n} rondas' },
  start: { en: 'Start', es: 'Empezar' },
  namesMissing: {
    en: 'Not available yet: the list of names comes with the next dictionary update.',
    es: 'Todavía no está disponible: la lista de nombres llega con la próxima actualización del diccionario.',
  },
  namesLoading: { en: 'Checking the list of names', es: 'Revisando la lista de nombres' },
  namesFailed: { en: 'Could not load the list of names ({detail}).', es: 'No se pudo cargar la lista de nombres ({detail}).' },
  namesFew: { en: 'The list of names is too short to play.', es: 'La lista de nombres es demasiado corta para jugar.' },
  lookalikesLoading: { en: 'Loading the kanji that look alike', es: 'Cargando los kanji que se parecen' },
  lookalikesFailed: {
    en: 'Could not load the kanji that look alike ({detail}).',
    es: 'No se pudieron cargar los kanji que se parecen ({detail}).',
  },

  // A question.
  questionOf: { en: 'Question {at} of {of}', es: 'Pregunta {at} de {of}' },
  next: { en: 'Next', es: 'Siguiente' },
  seeScore: { en: 'See the score', es: 'Ver el resultado' },
  rightMark: { en: 'Right.', es: '¡Correcto!' },
  wrongMark: { en: 'Not that one. The right one is marked.', es: 'No es esa. La correcta está marcada.' },
  optRight: { en: 'the right answer', es: 'la respuesta correcta' },
  optYours: { en: 'your answer', es: 'tu respuesta' },
  hear: { en: 'Hear it', es: 'Escuchar' },
  keysFour: {
    en: 'Keys: 1 to 4 answer, Enter or Space goes on, Escape leaves.',
    es: 'Teclas: de 1 a 4 responden, Enter o Espacio siguen, Escape sale.',
  },
  keysThree: {
    en: 'Keys: 1 to 3 answer, Enter or Space goes on, Escape leaves.',
    es: 'Teclas: de 1 a 3 responden, Enter o Espacio siguen, Escape sale.',
  },
  keysGrid: {
    en: 'Keys: the arrows move in the grid, Enter or Space picks, Escape leaves.',
    es: 'Teclas: las flechas se mueven por el cuadro, Enter o Espacio eligen, Escape sale.',
  },

  // Which one?
  modeShow: { en: 'Characters', es: 'Caracteres' },
  modeKana: { en: 'Kana', es: 'Kana' },
  modeKanji: { en: 'Kanji', es: 'Kanji' },
  whichKana: { en: 'Which one is {romaji}?', es: '¿Cuál es {romaji}?' },
  whichKanji: { en: 'Which kanji is this?', es: '¿Qué kanji es este?' },
  poolFilled: {
    en: 'Your collection has {n} kanji with look-alikes, so this round adds kanji from the 1st and 2nd grade.',
    es: 'Tu colección tiene {n} kanji con parecidos, así que esta ronda agrega kanji de 1.er y 2.º grado.',
  },
  poolFilledNone: {
    en: 'Your collection has no kanji with look-alikes yet, so this round uses the 1st and 2nd grade.',
    es: 'Tu colección todavía no tiene kanji con parecidos, así que esta ronda usa los de 1.er y 2.º grado.',
  },

  // Odd one out.
  modeLabel: { en: 'Mode', es: 'Modo' },
  modeTimed: { en: '60 seconds', es: '60 segundos' },
  modeFree: { en: 'Untimed', es: 'Sin tiempo' },
  oddPrompt: { en: 'Find the one that is not {ch}.', es: 'Encuentra el que no es {ch}.' },
  timedIntro: {
    en: 'Find as many as you can in 60 seconds. A wrong tap costs 3 seconds. The clock starts when you do.',
    es: 'Encuentra todos los que puedas en 60 segundos. Un toque equivocado cuesta 3 segundos. El reloj empieza cuando tú empiezas.',
  },
  freeIntro: {
    en: 'Ten grids, no clock. A grid found with no wrong tap scores.',
    es: 'Diez cuadros, sin reloj. Suma el cuadro que encuentras sin ningún toque equivocado.',
  },
  startClock: { en: 'Start the clock', es: 'Iniciar el reloj' },
  timeLeft: { en: '{n} s left', es: 'Quedan {n} s' },
  foundSoFar: { en: 'Found: {n}', es: 'Encontrados: {n}' },
  gridOf: { en: 'Grid {at} of {of}', es: 'Cuadro {at} de {of}' },
  oddMissTimed: { en: 'Not that one: 3 seconds off.', es: 'No es ese: 3 segundos menos.' },
  oddMissFree: { en: 'Not that one. Keep looking.', es: 'No es ese. Sigue buscando.' },
  oddFound: { en: 'Found it.', es: '¡Lo encontraste!' },
  oddLast: { en: 'Last grid:', es: 'Cuadro anterior:' },
  gridLabel: { en: 'Grid of {n} characters', es: 'Cuadro de {n} caracteres' },

  // Twins across scripts.
  twinsPrompt: { en: 'Which script is the marked character in this word?', es: '¿En qué escritura está el carácter marcado en esta palabra?' },
  scriptHiragana: { en: 'Hiragana', es: 'Hiragana' },
  scriptKatakana: { en: 'Katakana', es: 'Katakana' },
  scriptKanji: { en: 'Kanji', es: 'Kanji' },
  twinsIs: { en: 'Here {ch} is {script}.', es: 'Aquí {ch} es {script}.' },

  // Name decoder.
  namesPrompt: { en: 'How is this name spelled where it comes from?', es: '¿Cómo se escribe este nombre en su idioma de origen?' },
  namePerson: { en: 'a name', es: 'un nombre' },
  namePlace: { en: 'a place', es: 'un lugar' },
  nameReads: { en: '{kana} reads {romaji}: {orig}', es: '{kana} se lee {romaji}: {orig}' },

  // The result.
  resultHead: { en: 'Round over', es: 'Fin de la ronda' },
  resultOf: { en: '{n} of {of}', es: '{n} de {of}' },
  resultTimed: { en: '{n} found in 60 seconds', es: '{n} encontrados en 60 segundos' },
  resultBest: { en: 'Your best: {n}', es: 'Tu mejor puntaje: {n}' },
  newBest: { en: 'A new best!', es: '¡Nuevo récord!' },
  playAgain: { en: 'Play again', es: 'Jugar otra vez' },
  mixedHead: { en: 'Mixed up this round', es: 'Confundidos en esta ronda' },
  mixedNone: { en: 'Nothing mixed up.', es: 'Nada confundido.' },
  mixedLead: {
    en: 'These come round more often next time. Save a kanji to review it in My kanji.',
    es: 'Estos aparecen más seguido la próxima vez. Guarda un kanji para repasarlo en Mis kanji.',
  },
  namesMissedHead: { en: 'Names to look at again', es: 'Nombres para mirar otra vez' },
  playDamaged: {
    en: 'Your Play scores could not be read, so they started empty. A copy of the old data is kept in this browser.',
    es: 'No se pudieron leer tus puntajes de Jugar, así que empezaron vacíos. Una copia de los datos anteriores queda en este navegador.',
  },
  playPartial: {
    en: 'Part of your Play scores could not be read and was left out ({n} entries).',
    es: 'Una parte de tus puntajes de Jugar no se pudo leer y quedó fuera ({n} entradas).',
  },
  playBlocked: {
    en: 'This browser is not keeping Play scores, so they last until this page closes.',
    es: 'Este navegador no está guardando los puntajes de Jugar, así que duran hasta que se cierre esta página.',
  },
});
