// The string tables of the features added after strings.js reached its
// 500-line limit, merged here so strings.js imports one table for all of
// them: the conjugation table's (strings-conj.js), the kanji page's
// (strings-kpage.js), search's (strings-search.js), My progress's
// (strings-progress.js), the reading view's (strings-reading.js), and each
// one after them.

import { CONJ_STRINGS } from './strings-conj.js';
import { KPAGE_STRINGS } from './strings-kpage.js';
import { SEARCH_STRINGS } from './strings-search.js';
import { PROGRESS_STRINGS } from './strings-progress.js';
import { READING_STRINGS } from './strings-reading.js';
import { WORDS_STRINGS } from './strings-words.js';
import { SAY_STRINGS } from './strings-say.js';

export const MORE_STRINGS = Object.freeze({
  ...CONJ_STRINGS,
  ...KPAGE_STRINGS,
  ...SEARCH_STRINGS,
  ...PROGRESS_STRINGS,
  ...READING_STRINGS,
  ...WORDS_STRINGS,
  ...SAY_STRINGS,
});
