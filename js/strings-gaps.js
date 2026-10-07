// The Gaps option's strings (render-gaps.js), and the reasons js/gaps.js
// gives each gap, { en, es }, kept apart from strings.js so both stay under
// the 500-line rule and merged into the same table. "Where are the spaces?"
// shows the same reasons; its own screen's strings are strings-play.js's.
//
// A reason names a word or a kana of the text: {w}, {k}, {a}, {b} and {base}
// are Japanese and are drawn in a lang="ja" span (render-gaps.js), {o} is a
// name's own spelling, {from} and {to} a script (gapScript*). Spanish is
// neutral.

export const GAPS_STRINGS = Object.freeze({
  gaps: { en: 'Gaps', es: 'Espacios' },
  gapsHint: {
    en: 'A gap marks where one word ends and the next begins. Point at one, or choose a word, to read why it is there.',
    es: 'Un espacio marca dónde termina una palabra y empieza la siguiente. Señala uno, o elige una palabra, para leer por qué está ahí.',
  },
  gapsTitle: { en: 'Where it starts and ends', es: 'Dónde empieza y termina' },
  gapBefore: { en: 'Before it', es: 'Antes' },
  gapAfter: { en: 'After it', es: 'Después' },
  gapInside: { en: 'Inside it', es: 'Dentro' },
  // Where a word has no gap, what stands there instead (gaps.js besideOf).
  gapEdgeStart: { en: 'The line starts here: no gap to find.', es: 'Aquí empieza la línea: no hay espacio que buscar.' },
  gapEdgeEnd: { en: 'The line ends here: no gap to find.', es: 'Aquí termina la línea: no hay espacio que buscar.' },
  gapEdgePunct: { en: 'A mark of punctuation stands here and shows the edge already.', es: 'Aquí hay un signo de puntuación, que ya muestra el borde.' },
  gapEdgeSpace: { en: 'A space is typed here already.', es: 'Aquí ya hay un espacio escrito.' },
  gapEdgeLatin: { en: 'Latin letters stand here, and the change of script shows the edge.', es: 'Aquí hay letras latinas, y el cambio de escritura muestra el borde.' },
  gapEdgeOther: { en: 'No Japanese word touches it here: no gap to find.', es: 'Aquí no la toca ninguna palabra japonesa: no hay espacio que buscar.' },

  // One reason per gap (js/gaps.js REASONS).
  gapParticle: { en: '{w} is a particle, a word of its own.', es: '{w} es una partícula, una palabra aparte.' },
  gapCopula: { en: '{w} is a form of the copula, to be.', es: '{w} es una forma de la cópula, ser.' },
  gapName: { en: '{w} is a name.', es: '{w} es un nombre.' },
  gapNameO: { en: '{w} is a name: {o}.', es: '{w} es un nombre: {o}.' },
  gapScript: { en: 'The script changes: {from} to {to}.', es: 'Cambia la escritura: de {from} a {to}.' },
  gapLoan: {
    en: '{w} ends the way a loanword often does: {k} after a consonant sound.',
    es: '{w} termina como suele terminar un préstamo: {k} tras un sonido de consonante.',
  },
  gapNostart: {
    en: 'No word starts with {k}, so the word runs on through it to here.',
    es: 'Ninguna palabra empieza con {k}, así que la palabra sigue hasta aquí.',
  },
  gapGuess: {
    en: 'The reading is a guess here: no dictionary word backs this edge.',
    es: 'Aquí la lectura es una suposición: ninguna palabra del diccionario respalda este borde.',
  },
  gapGuessNostart: {
    en: 'No word starts with {k}, so this edge is the reading guessing.',
    es: 'Ninguna palabra empieza con {k}, así que este borde es una suposición de la lectura.',
  },
  // Added to any other reason when a guessed word touches the gap.
  gapGuessToo: { en: '; the reading here is a guess.', es: '; aquí la lectura es una suposición.' },
  gapCompound: { en: 'Two words make one katakana word: {a} + {b}.', es: 'Dos palabras forman una sola en katakana: {a} + {b}.' },
  gapWord: { en: '{w} is a word the dictionary knows, and it ends here.', es: '{w} es una palabra del diccionario, y termina aquí.' },
  gapWordForm: { en: '{w} is a form of {base}, a word the dictionary knows, and it ends here.', es: '{w} es una forma de {base}, una palabra del diccionario, y termina aquí.' },
  gapWordNumber: { en: '{w} is a number and its counter, and it ends here.', es: '{w} es un número con su contador, y termina aquí.' },
  gapWordPrefix: {
    en: '{w} is a prefix the dictionary lists as a word of its own, put before another word.',
    es: '{w} es un prefijo que el diccionario trae como palabra aparte, puesto antes de otra palabra.',
  },

  // Why a space placed in the game is not one.
  gapExtraNostart: { en: 'No word starts with {k}, so no space goes before it.', es: 'Ninguna palabra empieza con {k}, así que no va un espacio antes.' },
  gapExtraInside: { en: '{w} is one word.', es: '{w} es una sola palabra.' },

  // The scripts, as {from} and {to}.
  gapScriptKanji: { en: 'kanji', es: 'kanji' },
  gapScriptHiragana: { en: 'hiragana', es: 'hiragana' },
  gapScriptKatakana: { en: 'katakana', es: 'katakana' },
  gapScriptLatin: { en: 'Latin letters', es: 'letras latinas' },
  gapScriptDigit: { en: 'digits', es: 'cifras' },
});
