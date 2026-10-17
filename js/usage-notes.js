// Authored usage guidance supplements terse dictionary glosses. It does not
// replace or mutate the source dictionary, infer a conversation's intent, or
// translate an arbitrary sentence.
// Context reference: Japan Foundation, Irodori (greetings and introductions).
export function usageFor(token) {
  const reading = token.reading || token.r?.[0] || '';
  if (!['よろしくおねがいします', 'よろしくおねがいいたします'].includes(reading)) return null;
  return {
    en: {
      meanings: ['Thank you in advance for your help (a request).', 'I look forward to working with you (starting together).', 'Nice to meet you (an introduction).'],
      note: 'A polite request for goodwill or cooperation. Choose the English wording from the situation; it is not normally a request to remember someone.',
    },
    es: {
      meanings: ['Gracias de antemano por tu ayuda (al pedir un favor).', 'Espero que trabajemos bien juntos (al comenzar).', 'Mucho gusto (al presentarse).'],
      note: 'Pide buena disposición o colaboración con cortesía. La traducción depende de la situación; normalmente no pide que alguien te recuerde.',
    },
  };
}
