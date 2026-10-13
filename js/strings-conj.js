// The conjugation table's strings (render-conj.js), { en, es }, kept apart
// from strings.js so both stay under the 500-line rule and merged into the
// same table. Spanish is neutral. A form's name is the learner's name for it,
// never the rule id deinflect.js uses.

export const CONJ_STRINGS = Object.freeze({
  conjTitle: { en: 'All forms', es: 'Todas las formas' },
  conjCount: { en: '{n} forms', es: '{n} formas' },
  conjHere: { en: 'In the text: {form}', es: 'En el texto: {form}' },
  conjLeadNa: {
    en: 'The word stays the same; the copula after it changes.',
    es: 'La palabra no cambia; cambia la cópula que la sigue.',
  },
  conjGroupBasic: { en: 'Plain and polite', es: 'Llana y cortés' },
  conjGroupLinking: { en: 'Linking and if', es: 'Para unir y condicionales' },
  conjGroupMore: { en: 'More forms', es: 'Más formas' },
  conjSay: { en: 'Say {form}', es: 'Decir {form}' },
  speakShort: { en: 'Say', es: 'Decir' },
  conjRegister: { en: 'Register', es: 'Registro' },
  conjPlain: { en: 'Plain', es: 'Llana' },
  conjPolite: { en: 'Polite', es: 'Cortés' },
  conjDoes: { en: 'Does', es: 'Sí' },
  conjDoesnt: { en: "Doesn't", es: 'No' },
  conjNow: { en: 'Now', es: 'Ahora' },
  conjPast: { en: 'Past', es: 'Pasado' },
  conjInText: { en: 'in the text', es: 'en el texto' },
  conjAbout: { en: 'Notes:', es: 'Notas:' },
});

/** Each form's name, { en, es }. */
export const FORM_NAMES = Object.freeze({
  plain: { en: 'Dictionary (plain)', es: 'Diccionario (llana)' },
  polite: { en: 'Polite', es: 'Cortés' },
  negative: { en: 'Negative', es: 'Negativa' },
  'polite-negative': { en: 'Polite negative', es: 'Negativa cortés' },
  past: { en: 'Past', es: 'Pasado' },
  'polite-past': { en: 'Polite past', es: 'Pasado cortés' },
  'past-negative': { en: 'Past negative', es: 'Pasado negativo' },
  'polite-past-negative': { en: 'Polite past negative', es: 'Pasado negativo cortés' },
  te: { en: 'Te-form', es: 'Forma te' },
  'negative-te': { en: 'Without doing (naide)', es: 'Sin hacer (naide)' },
  adverb: { en: 'As an adverb', es: 'Como adverbio' },
  ba: { en: 'If (ba)', es: 'Si (ba)' },
  tara: { en: 'If, when (tara)', es: 'Si, cuando (tara)' },
  want: { en: 'Want to', es: 'Querer' },
  volitional: { en: "Let's (plain)", es: 'Vamos a (llana)' },
  'polite-volitional': { en: "Let's (polite)", es: 'Vamos a (cortés)' },
  potential: { en: 'Can (potential)', es: 'Poder (potencial)' },
  passive: { en: 'Passive', es: 'Pasiva' },
  causative: { en: 'Make or let (causative)', es: 'Hacer o dejar (causativa)' },
  'causative-passive': { en: 'Be made to', es: 'Ser obligado a' },
  imperative: { en: 'Command', es: 'Orden' },
});
