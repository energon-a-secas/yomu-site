// The string tables of the features added after strings.js reached its
// 500-line limit, merged here so strings.js imports one table for all of
// them: the conjugation table's (strings-conj.js), and each one after it.

import { CONJ_STRINGS } from './strings-conj.js';

export const MORE_STRINGS = Object.freeze({
  ...CONJ_STRINGS,
});
