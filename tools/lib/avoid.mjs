/**
 * English that marks a sentence or an entry a reader of any age should not
 * meet unasked: an example sentence (build-sentences.mjs) or a row of the
 * idiom collections (build-sets.mjs). Tatoeba is written by volunteers, and
 * JMdict glosses every sense; the reader does not choose what is shown.
 */
export const AVOID = /\b(sex\w*|kill\w*|murder\w*|suicide|rape\w*|naked|nude|drugs?|cocaine|heroin|porn\w*|penis|vagina|breasts?|whore|slut|bitch|fuck\w*|shit\w*|damn|nazi\w*|hitler|terroris\w*|bomb\w*|gun\w*|shoot\w*|corpse|blood\w*)\b/i;

/**
 * The explicit half of AVOID, for the idiom collections: their glosses are
 * metaphors, and "killing two birds with one stone" (一石二鳥) or a proverb
 * about a sword is a dictionary's staple, where a sentence about a killing
 * is not. Sexual terms, drugs and slurs still keep a row out.
 */
export const AVOID_EXPLICIT = /\b(sex\w*|rape\w*|naked|nude|drugs?|cocaine|heroin|porn\w*|penis|vagina|breasts?|whore|slut|bitch|fuck\w*|shit\w*)\b/i;
