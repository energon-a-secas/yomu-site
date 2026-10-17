// Ornamental title separators give a little context that the word lattice
// cannot see. In 魔法少女まどか☆マギカ, まど|か is more plausibly a name
// than "window?". Keep that kana together as an explicitly uncertain name.
// This does not claim to recognize a work or supply its official translation.
export function titleNames(tokens, separator, following) {
  if (!separator || !/^[☆★]$/u.test(separator.text)
      || !following || following.type !== 'jp' || !/^[\u30A1-\u30FA]/u.test(following.text)) return tokens;
  const word = tokens.at(-2);
  const question = tokens.at(-1);
  if (!word || word.kind !== 'word' || !/^\p{Script=Hiragana}{2,7}$/u.test(word.surface)
      || !String(word.entry?.p || '').split(' ').includes('n')
      || question?.kind !== 'particle' || question.surface !== 'か') return tokens;
  const before = tokens.at(-3);
  // A title's nominal prefix is allowed; a preceding verb/particle is prose.
  if (before && (before.kind !== 'word' || !/^\p{Script=Han}+$/u.test(before.surface)
      || !String(before.entry?.p || '').split(' ').includes('n'))) return tokens;
  const surface = word.surface + question.surface;
  return [...tokens.slice(0, -2), {
    kind: 'name', surface, start: word.start, end: question.end,
    base: surface, reading: surface, entry: null, alts: 0, chain: [],
    confidence: 'guess', aid: { cuts: [], parts: null },
  }];
}
