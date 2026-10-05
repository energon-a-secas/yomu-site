// JMnedict's name types, said in words, for the analyzer and the page alike.
//
// A leaf with no imports, so the Word panel can say a name's types in the
// reader's language without loading the analyzer before the first text
// (js/reader.js imports analyze.js on demand): names.js re-exports this for
// the analyzer's side.

/**
 * `g` on a name's entry is the English side, because a dictionary gloss is
 * English throughout (the page says so beside it); `nt` keeps the ids, so
 * the page can say them in Spanish. `person` is a katakana name of one
 * particular person (ナポレオン): the names tier ships that type for katakana
 * spellings only (tools/lib/jmnedict.mjs).
 */
export const NAME_TYPES = Object.freeze({
  surname: Object.freeze({ en: 'surname', es: 'apellido' }),
  given: Object.freeze({ en: 'given name', es: 'nombre de pila' }),
  masc: Object.freeze({ en: 'given name (male)', es: 'nombre de pila (masculino)' }),
  fem: Object.freeze({ en: 'given name (female)', es: 'nombre de pila (femenino)' }),
  place: Object.freeze({ en: 'place name', es: 'nombre de lugar' }),
  person: Object.freeze({ en: 'person', es: 'persona' }),
});

/**
 * The same types inside the Word panel's name line, which already sits in
 * parentheses: "Name: Mary (female given name)", where NAME_TYPES would nest
 * a second pair, "(given name (female))".
 */
export const NAME_LINE_TYPES = Object.freeze({
  ...NAME_TYPES,
  masc: Object.freeze({ en: 'male given name', es: 'nombre de pila masculino' }),
  fem: Object.freeze({ en: 'female given name', es: 'nombre de pila femenino' }),
});
