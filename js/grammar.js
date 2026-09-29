// Grammar ids per token and per pair of tokens.
//
// A token carries ids, never prose (docs/ANALYZER.md, "The token"); notes.js
// turns an id into { en, es }. Three sources feed this module: the particle a
// particle token is, the copula form a copula token is, and the deinflection
// chain an inflected token was reduced through. A few patterns need two
// tokens (待って + ください, 行く + と, 行きません + か), and those ids carry
// `at`, the token index span [start, end) they cover, on every token in it.
//
// Like sounds.js, it would rather say nothing than say something false: a が
// after a predicate is "but", not the subject marker, so it gets no id, and a
// か between two nouns is "or", so it gets none either.

/** Every id annotateGrammar can emit. notes.js has a note for each. */
export const GRAMMAR_IDS = Object.freeze([
  // particles
  'topic-wa', 'subject-ga', 'object-o', 'direction-e', 'ni', 'de', 'de-and', 'to-and', 'to-quote',
  'mo', 'no', 'ka-question', 'ne', 'yo', 'kara', 'made', 'yori', 'ya', 'kedo', 'node',
  'dake', 'shika', 'nado', 'na-prohibition',
  // the copula
  'desu', 'deshita', 'deshou', 'darou', 'da', 'datta',
  'ja-nai', 'ja-arimasen', 'ja-nakatta', 'ja-arimasen-deshita', 'nara',
  // endings, from the deinflection chain
  'polite', 'polite-past', 'polite-negative', 'polite-past-negative', 'lets', 'polite-te',
  'te-form', 'te-iru', 'past', 'negative', 'past-negative', 'want', 'potential', 'passive',
  'causative', 'volitional', 'imperative', 'cond-ba', 'cond-tara', 'cond-nara',
  'adj-negative', 'adj-past', 'adj-te', 'adverbial', 'tari', 'nagara', 'nasai',
  'sou', 'sugiru', 'yasui', 'nikui', 'te-shimau', 'te-miru', 'naide', 'must',
  // patterns across two tokens
  'te-kudasai', 'cond-to', 'invitation', 'offer',
]);

// ── Particles ────────────────────────────────────────────────────────────

/** Particles whose id does not depend on the neighbours. */
export const PARTICLE_IDS = Object.freeze({
  'は': 'topic-wa', 'を': 'object-o', 'へ': 'direction-e', 'に': 'ni', 'で': 'de',
  'も': 'mo', 'の': 'no', 'ね': 'ne', 'ねえ': 'ne', 'よ': 'yo', 'から': 'kara', 'まで': 'made',
  'より': 'yori', 'や': 'ya', 'けど': 'kedo', 'けれど': 'kedo', 'けれども': 'kedo',
  'ので': 'node', 'だけ': 'dake', 'しか': 'shika', 'など': 'nado',
});

/**
 * Two particles the lattice may hand over as one token. A closed list rather
 * than a greedy split, because のに, でも and かも are words of their own and
 * splitting them would name the wrong grammar.
 */
export const PARTICLE_PAIRS = Object.freeze({
  'には': ['ni', 'topic-wa'], 'では': ['de', 'topic-wa'], 'へは': ['direction-e', 'topic-wa'],
  'にも': ['ni', 'mo'], 'へも': ['direction-e', 'mo'], 'からは': ['kara', 'topic-wa'],
  'までは': ['made', 'topic-wa'], 'からも': ['kara', 'mo'], 'よね': ['yo', 'ne'],
});

// ── The copula ───────────────────────────────────────────────────────────

export const COPULA_IDS = Object.freeze({
  'です': 'desu', 'でした': 'deshita', 'でしょう': 'deshou', 'だろう': 'darou',
  'だ': 'da', 'だった': 'datta', 'だったら': 'cond-tara', 'でしたら': 'cond-tara',
  'じゃない': 'ja-nai', 'ではない': 'ja-nai',
  'じゃありません': 'ja-arimasen', 'ではありません': 'ja-arimasen',
  'じゃないです': 'ja-arimasen', 'ではないです': 'ja-arimasen',
  'じゃなかった': 'ja-nakatta', 'ではなかった': 'ja-nakatta',
  'じゃありませんでした': 'ja-arimasen-deshita', 'ではありませんでした': 'ja-arimasen-deshita',
  'じゃなかったです': 'ja-arimasen-deshita', 'ではなかったです': 'ja-arimasen-deshita',
});

// ── The deinflection chain ───────────────────────────────────────────────

/**
 * Chain step to grammar id, keyed by the rule id in js/deinflect.js (the `id`
 * of each R(...) there). Each line also names the label the step carries in
 * deinflect.js and, where it differs, in the scratch prototype the rules were
 * productionised from (lattice/deinflect.mjs, 2026-09-28), so the two streams
 * can be checked against each other line by line. null means the step is
 * machinery (the masu-stem) or a form with no note yet.
 */
export const RULE_TO_GRAMMAR = Object.freeze({
  'masu': 'polite',                          // 'polite ending'; prototype 'polite ending ます'
  'masu-past': 'polite-past',                // 'polite past'
  'masu-negative': 'polite-negative',        // 'polite negative'
  'masu-past-negative': 'polite-past-negative', // 'polite past negative'
  'masu-volitional': 'lets',                 // "polite volitional (let's)"
  'masu-te': 'polite-te',                    // 'polite te-form'
  'stem': null,                              // 'stem', 'stem (-aru verb)'; prototype 'stem (honorific -aru verb)'
  'tai': 'want',                             // 'want to'; prototype 'want to (desire)'
  'nagara': 'nagara',                        // 'while doing'
  'nasai': 'nasai',                          // 'polite command'
  'sou': 'sou',                              // 'looks about to' (not in the prototype)
  'adj-sou': 'sou',                          // 'looks (sou)' (not in the prototype)
  'sugiru': 'sugiru',                        // 'too much' (not in the prototype)
  'adj-sugiru': 'sugiru',                    // 'too (sugiru)' (not in the prototype)
  'yasui': 'yasui',                          // 'easy to' (not in the prototype)
  'nikui': 'nikui',                          // 'hard to' (not in the prototype)
  'te': 'te-form',                           // 'te-form'
  'adj-te': 'adj-te',                        // 'te-form of an adjective'
  'ta': 'past',                              // 'past'; prototype 'past (ta-form)'
  'adj-past': 'adj-past',                    // 'past of an adjective'
  'tari': 'tari',                            // 'listing (tari)'
  'tara': 'cond-tara',                       // 'conditional (tara)'
  'te-iru': 'te-iru',                        // 'progressive (te iru)'
  'te-iru-casual': 'te-iru',                 // 'progressive, casual (teru)'
  'te-shimau-casual': 'te-shimau',           // 'done, casual (chau)', 'done, casual (jau)' (not in the prototype)
  'te-shimau': 'te-shimau',                  // 'done (te shimau)' (not in the prototype)
  'te-miru': 'te-miru',                      // 'try doing (te miru)' (not in the prototype)
  'must-casual': 'must',                     // 'must, casual (nakucha)', 'must, casual (nakya)' (not in the prototype)
  'negative': 'negative',                    // 'negative'
  'negative-te': 'naide',                    // 'without doing' (not in the prototype)
  'adj-negative': 'adj-negative',            // 'negative of an adjective'
  'adj-adverb': 'adverbial',                 // 'adverb (ku)'; prototype 'adverbial (ku)'
  'adj-ba': 'cond-ba',                       // 'conditional of an adjective'; prototype 'conditional (ba) of an adjective'
  'potential': 'potential',                  // 'potential'
  'potential-passive': ['potential', 'passive'], // 'potential or passive'
  'potential-colloquial': 'potential',       // 'potential, colloquial (ra dropped)'
  'passive': 'passive',                      // 'passive'
  'causative': 'causative',                  // 'causative'
  'volitional': 'volitional',                // "volitional (let's)"; prototype also "volitional (let's / I will)"
  'imperative': 'imperative',                // 'command'
  'ba': 'cond-ba',                           // 'conditional (ba)'
});

/**
 * The same map keyed by label, for a chain step that carries no rule id the
 * table above knows: every label in deinflect.js and in the prototype.
 */
export const LABEL_TO_GRAMMAR = Object.freeze({
  'polite ending': 'polite',
  'polite ending ます': 'polite',
  'polite past': 'polite-past',
  'polite negative': 'polite-negative',
  'polite past negative': 'polite-past-negative',
  "polite volitional (let's)": 'lets',
  'polite te-form': 'polite-te',
  'stem': null,
  'stem (-aru verb)': null,
  'stem (honorific -aru verb)': null,
  'want to': 'want',
  'want to (desire)': 'want',
  'while doing': 'nagara',
  'polite command': 'nasai',
  'looks about to': 'sou',
  'looks (sou)': 'sou',
  'too much': 'sugiru',
  'too (sugiru)': 'sugiru',
  'easy to': 'yasui',
  'hard to': 'nikui',
  'te-form': 'te-form',
  'te-form of an adjective': 'adj-te',
  'past': 'past',
  'past (ta-form)': 'past',
  'past of an adjective': 'adj-past',
  'listing (tari)': 'tari',
  'conditional (tara)': 'cond-tara',
  'progressive (te iru)': 'te-iru',
  'progressive, casual (teru)': 'te-iru',
  'done, casual (chau)': 'te-shimau',
  'done, casual (jau)': 'te-shimau',
  'done (te shimau)': 'te-shimau',
  'try doing (te miru)': 'te-miru',
  'must, casual (nakucha)': 'must',
  'must, casual (nakya)': 'must',
  'negative': 'negative',
  'without doing': 'naide',
  'negative of an adjective': 'adj-negative',
  'adverb (ku)': 'adverbial',
  'adverbial (ku)': 'adverbial',
  'conditional of an adjective': 'cond-ba',
  'conditional (ba) of an adjective': 'cond-ba',
  'potential': 'potential',
  'potential or passive': ['potential', 'passive'],
  'potential, colloquial (ra dropped)': 'potential',
  'passive': 'passive',
  'causative': 'causative',
  "volitional (let's)": 'volitional',
  "volitional (let's / I will)": 'volitional',
  'volitional': 'volitional',
  'command': 'imperative',
  'conditional (ba)': 'cond-ba',
});

const KNOWN = new Set(GRAMMAR_IDS);
const POLITE_FAMILY = new Set(['polite-past', 'polite-negative', 'polite-past-negative', 'lets', 'polite-te']);

const asList = (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * The ids one chain step stands for. Rule id first, then label, then a rule id
 * that is already a grammar id; an unknown step names nothing rather than
 * something wrong.
 */
function stepIds(step) {
  if (!step) return [];
  const rule = step.rule;
  if (rule && Object.prototype.hasOwnProperty.call(RULE_TO_GRAMMAR, rule)) return asList(RULE_TO_GRAMMAR[rule]);
  const label = step.label;
  if (label && Object.prototype.hasOwnProperty.call(LABEL_TO_GRAMMAR, label)) return asList(LABEL_TO_GRAMMAR[label]);
  if (rule && KNOWN.has(rule)) return [rule];
  return [];
}

/**
 * Grammar ids for a deinflection chain, in the order the endings are added
 * (base first, surface last): 食べさせられませんでした is causative, potential,
 * passive, polite-past-negative.
 *
 * The chain goes from surface to base and also records the machinery: 食べた
 * is ta then te, because the ta-form reuses the te-form's rows. So a te-form
 * that is not the surface step is how another step was built and is dropped;
 * a past under たら or たり likewise; the ない under ないで; the bare ます
 * under ました; and a verb's ない under かった becomes the one id
 * past-negative.
 */
export function chainGrammar(chain) {
  const steps = (Array.isArray(chain) ? chain : []).map(stepIds);
  const layers = steps.map((list, k) => list.filter((id) => {
    if (id === 'te-form') return k === 0;
    if (id === 'past') return !steps.slice(0, k).some((s) => s.includes('cond-tara') || s.includes('tari'));
    if (id === 'negative' && k > 0) {
      return !steps[k - 1].includes('naide') && !steps[k - 1].includes('adj-past') && !steps[k - 1].includes('must');
    }
    return true;
  }));
  steps.forEach((list, k) => {
    if (k > 0 && list.includes('negative') && steps[k - 1].includes('adj-past')) {
      layers[k - 1] = layers[k - 1].map((id) => (id === 'adj-past' ? 'past-negative' : id));
    }
  });
  const ids = layers.reverse().flat();
  const polite = ids.some((id) => POLITE_FAMILY.has(id));
  return [...new Set(ids.filter((id) => !(id === 'polite' && polite)))];
}

// ── Reading the neighbours ───────────────────────────────────────────────

const SENTENCE_END = new Set([...'。？！?!」』…．.']);
const QUOTE_CLOSE = new Set([...'」』']);
const QUOTE_VERBS = new Set([
  '言う', 'いう', '云う', '思う', 'おもう', '考える', 'かんがえる', '聞く', 'きく',
  '答える', 'こたえる', '伝える', 'つたえる', '呼ぶ', 'よぶ', '申す', 'もうす',
  'おっしゃる', '仰る', '感じる', 'かんじる',
]);
const INTERROGATIVES = new Set([
  'なに', 'なん', '何', 'だれ', '誰', 'どこ', '何処', 'いつ', 'どれ', 'どちら', 'どう', 'どの',
]);
const PLAIN_NONPAST = new Set(['negative', 'potential', 'passive', 'causative', 'te-iru', 'adj-negative']);
const KUDASAI = new Set(['ください', '下さい', 'くださる', '下さる']);
const IRU = new Set(['いる', '居る']);
const FAVOUR_VERBS = new Set(['くれる', '呉れる', 'もらう', '貰う', 'いただく', '頂く', 'くださる', '下さる']);

const tags = (t) => String((t && t.entry && t.entry.p) || '').split(/\s+/).filter(Boolean);
// JMdict's vs is a noun that takes する (勉強), and vt / vi only say
// transitive or not; none of the three makes the token a verb.
const isVerb = (t) => tags(t).some((p) => p.startsWith('v') && p !== 'vs' && p !== 'vt' && p !== 'vi');
const isAdjI = (t) => tags(t).some((p) => p === 'adj-i' || p === 'adj-ix');
const chainOf = (t) => (t && Array.isArray(t.chain) ? t.chain : []);
const surfaceId = (t) => { const ids = chainGrammar(chainOf(t)); return ids[ids.length - 1] || null; };
const baseOf = (t) => String((t && (t.base || t.surface)) || '');

function isPredicate(t) {
  if (!t) return false;
  if (t.kind === 'copula' || t.kind === 'inflected') return true;
  return t.kind === 'word' && (isVerb(t) || isAdjI(t));
}

function isNoun(t) {
  if (!t) return false;
  if (['katakana', 'name', 'number', 'latin'].includes(t.kind)) return true;
  return t.kind === 'word' && !isVerb(t) && !isAdjI(t);
}

/** A word the dictionary lists as a na-adjective: 静か, きれい, 元気. */
export const isNaAdjective = (t) => !!t && t.kind === 'word' && tags(t).includes('adj-na');

/** A verb in its dictionary form: 行く, not 行った or 行きます. */
const isDictionaryVerb = (t) => !!t && (t.kind === 'word' || t.kind === 'inflected') && isVerb(t) && !chainOf(t).length;

/** Plain and non-past: 行く, 行かない, 行ける, 見ている, and a bare ない. */
function isPlainNonPast(t) {
  if (!t) return false;
  if (isDictionaryVerb(t)) return true;
  if (t.surface === 'ない' && (t.kind === 'word' || t.kind === 'inflected')) return true;
  return chainOf(t).length > 0 && PLAIN_NONPAST.has(surfaceId(t));
}

function isEnd(t) {
  return !t || t.kind === 'newline' || (t.kind === 'punct' && SENTENCE_END.has(String(t.surface).slice(-1)));
}

function neighbour(tokens, i, dir) {
  for (let k = i + dir; k >= 0 && k < tokens.length; k += dir) {
    if (tokens[k] && tokens[k].kind !== 'space') return k;
  }
  return -1;
}

// ── Annotation ───────────────────────────────────────────────────────────

/**
 * Fill token.grammar on every token, in place, and return the same array.
 * Existing grammar is replaced, so running it twice gives the same result.
 * `at` is [first token index, last token index + 1], like start and end.
 */
export function annotateGrammar(tokens) {
  if (!Array.isArray(tokens)) return tokens;
  for (const t of tokens) if (t) t.grammar = [];
  const add = (k, id, at) => {
    const t = tokens[k];
    if (!t || !KNOWN.has(id)) return;
    const key = at ? `${id}@${at[0]}:${at[1]}` : id;
    if (t.grammar.some((g) => (g.at ? `${g.id}@${g.at[0]}:${g.at[1]}` : g.id) === key)) return;
    t.grammar.push(at ? { id, at } : { id });
  };
  const span = (a, b, id) => { const at = [a, b + 1]; for (let k = a; k <= b; k++) add(k, id, at); };
  const at = (k) => (k >= 0 ? tokens[k] : null);

  tokens.forEach((t, i) => {
    if (!t) return;
    const p = neighbour(tokens, i, -1);
    const n = neighbour(tokens, i, 1);
    if (t.kind === 'particle') particle(t, i, p, n, at, add, span);
    else if (t.kind === 'copula') copula(t, i, p, n, at, add);
    if (t.kind !== 'particle' && t.kind !== 'copula') for (const id of chainGrammar(chainOf(t))) add(i, politeCommand(t, id));
    pairs(t, i, n, at, span);
  });
  return tokens;
}

/** なさる's command is なさい (ごめんなさい, お休みなさい): the polite one. */
const NASARU = new Set(['なさる', '為さる']);
function politeCommand(t, id) {
  return id === 'imperative' && NASARU.has(baseOf(t)) ? 'nasai' : id;
}

function particle(t, i, p, n, at, add, span) {
  const s = String(t.surface || '');
  const prev = at(p);
  const next = at(n);
  // After a na-adjective で is です in its te-form, "and": 静かできれいな町
  // carried the note for the で of place and means.
  if (s === 'で' && isNaAdjective(prev)) return add(i, 'de-and');
  if (PARTICLE_IDS[s]) return add(i, PARTICLE_IDS[s]);
  if (PARTICLE_PAIRS[s]) return PARTICLE_PAIRS[s].forEach((id) => add(i, id));
  if (s === 'が') {
    // After a predicate が is "but" (高いですが、), which this module has no id for.
    if (prev && !isPredicate(prev) && prev.kind !== 'punct' && prev.kind !== 'newline') add(i, 'subject-ga');
    return;
  }
  if (s === 'か') {
    if (isNoun(prev) && isNoun(next)) return;                                       // コーヒーか紅茶: "or"
    if (prev && INTERROGATIVES.has(baseOf(prev)) && !isEnd(next)) return;           // 何か, 誰か: "some-"
    return add(i, 'ka-question');
  }
  if (s === 'と') {
    if ((next && QUOTE_VERBS.has(baseOf(next))) || (prev && QUOTE_CLOSE.has(String(prev.surface).slice(-1)))) return add(i, 'to-quote');
    if (isPlainNonPast(prev)) return span(p, i, 'cond-to');
    // "and, with" joins nouns. After 行った or 高い, と with no quoting verb in
    // sight is a quote whose verb comes later, or something rarer; say nothing.
    if (isNoun(prev) || (prev && prev.kind === 'particle')) add(i, 'to-and');
    return;
  }
  if (s === 'な') {
    if (isDictionaryVerb(prev)) add(i, 'na-prohibition');
    return;
  }
  if (s === 'なら') add(i, isPredicate(prev) ? 'cond-nara' : 'nara');
}

function copula(t, i, p, n, at, add) {
  let s = String(t.surface || '');
  if (s === 'なら') return add(i, isPredicate(at(p)) ? 'cond-nara' : 'nara');
  // でしょうか and ですね arrive as one token in some segmentations.
  const tail = { 'か': 'ka-question', 'ね': 'ne', 'よ': 'yo' }[s.slice(-1)];
  if (tail && !COPULA_IDS[s] && COPULA_IDS[s.slice(0, -1)]) { add(i, tail); s = s.slice(0, -1); }
  if (COPULA_IDS[s]) add(i, COPULA_IDS[s]);
}

/** Patterns that need the next token: てください, て + いる, ませんか, ましょうか. */
function pairs(t, i, n, at, span) {
  const next = at(n);
  if (!next) return;
  const top = surfaceId(t);
  obligation(t, i, n, at, span);
  if (top === 'te-form') {
    if (KUDASAI.has(String(next.surface)) || KUDASAI.has(baseOf(next))) span(i, n, 'te-kudasai');
    else if (IRU.has(String(next.base || ''))) span(i, n, 'te-iru');
  }
  if (next.kind === 'particle' && next.surface === 'か') {
    // 取ってくれませんか and 見せてもらえませんか ask a favour; they are not
    // invitations, and this module has no note for a request, so it says
    // nothing about them.
    const favour = FAVOUR_VERBS.has(baseOf(t));
    if (top === 'polite-negative' && !favour && isEnd(at(nextAfter(at, n)))) span(i, n, 'invitation');
    if (top === 'lets') span(i, n, 'offer');
  }
}

/** いけない, いけません, ならない, なりません: the "it will not do" of have-to. */
const MUST_TAIL = /^(いけな|いけま|ならな|なりま)/;
const isMustTail = (t) => !!t && (t.kind === 'word' || t.kind === 'inflected') && MUST_TAIL.test(String(t.surface));

/**
 * Have to, spelled out over two or three tokens: 行かなければ|ならない,
 * 行かなくて|は|いけない, 行かない|と|いけない. The verb keeps its own ending
 * (the lattice refuses the expression keys that would swallow it), and the
 * span says what the pieces make together.
 */
function obligation(t, i, n, at, span) {
  const s = String(t.surface || '');
  const next = at(n);
  if (!chainOf(t).length || !next) return;
  if (s.endsWith('なければ') && isMustTail(next)) return span(i, n, 'must');
  const n2 = nextAfter(at, n);
  const third = n2 >= 0 ? at(n2) : null;
  if (!isMustTail(third) || next.kind !== 'particle') return;
  if ((s.endsWith('なくて') && next.surface === 'は') || (s.endsWith('ない') && next.surface === 'と')) span(i, n2, 'must');
}

/** The index after n, skipping spaces, through the same `at` accessor. */
function nextAfter(at, n) {
  for (let k = n + 1; ; k++) {
    const t = at(k);
    if (t === null || t === undefined) return -1;
    if (t.kind !== 'space') return k;
  }
}
