# Yomu analyzer: the contract every module is built against

Yomu reads pasted Japanese and returns tokens. This file is the one place the
token shape, the data formats and the module boundaries are written down. A
module that disagrees with it is the one that is wrong.

Nothing here is copied from Genki, the Japan Foundation apps, Yomitan,
rikaichan or MeCab. Genki was read for structure only (what order the special
sounds come in, how one rule is shown with a minimal pair); every rule, note
and example string in this repository is written here.

## Pipeline

```
text ──normalize──▶ lines ──runs──▶ [jp run | other]
                                      │
                           candidates(run)  ◀── deinflect(substring)
                                      │
                           dict.need(keys) ──index, filter, core──▶ range shards
                                      │     the filter lets through ──▶ dict.get(key)
                                      │
                           lattice(run, edges) ──best path──▶ tokens
                                      │
                           enrich(token): reading, furigana, morae,
                                          romaji said/spelled, sounds[], grammar[]
                                      │
                           kanjiList(tokens) ◀── kanji shards
```

One call to `dict.need`, one path. What a key needs to know about another
key is shipped on its record by the builder (`o`, `b`, `c` below), so the
analyzer never fetches a second key to price the first. Until 2026-09-29 it
segmented each run twice, fetching the kanji spellings of the kana words on
the first path and the readings of kanji keys with several records, and a
kana sentence loaded up to 20 of the 27 shards.

`analyze(text, { lang })` in `js/analyze.js` is the only entry point the view
calls. It returns `{ text, tokens, kanji, unknown }`: `text` is the normalized
input, `unknown` counts tokens with no dictionary support, and `kanji` lists
every kanji in order of first appearance as
`{ char, info, readings, whole, wholeRuns, tokens }`. `readings` are the ones
this text gives the character; a reading that belongs to a whole word
(今日 きょう) is listed too, with `whole: true` and
`wholeRuns: [{ run: '今日', reading: 'きょう' }]`, so the page can say "read as
a whole" instead of teaching きょう as a reading of 今.

It is async because shards load on demand, and it is pure otherwise: the
same text and the same data give the same tokens.

## Modules (js/)

| Module | Owns | Imports |
|---|---|---|
| `kana.js` | script tests, hiragana/katakana folding, morae, romaji (spelled and said) | nothing |
| `deinflect.js` | the rule table and `deinflect(surface)` | nothing |
| `dict.js` | the shard index, the core and the key filter, fetching, `need(keys)`, `get(key)`, kanji info | `bloom.js` |
| `bloom.js` | the key filter: its hash, reading it, and building it (the builder imports this file) | nothing |
| `lattice.js` | the best path through a run, and the tokens built from it | `kana.js`, `deinflect.js`, `costs.js`, `names.js`, `candidates.js`, `spellings.js` |
| `candidates.js` | every node that could start at one position of a run, with its own cost | `kana.js`, `deinflect.js`, `numbers.js`, `costs.js`, `names.js`, `key-rules.js`, `spellings.js` |
| `spellings.js` | what a kana word learns from its kanji spelling, read off the record: the rank of kana homographs (すき is 好き before 隙, `b`, ties by `t`) and the morpheme cuts of a kana compound (そのうち is その\|内, `c`) | `kana.js`, `costs.js` |
| `costs.js` | the closed classes (particles, copula), every cost, connection costs, homograph ranking | `kana.js` |
| `key-rules.js` | dictionary keys the lattice refuses (ですか, ませんか, 雨が降る, になると) | `kana.js`, `costs.js` |
| `names.js` | which kanji runs are names, and a per-kanji guess at their reading | `kana.js`, `deinflect.js`, `numbers.js` |
| `numbers.js` | reading numbers, counters and 何 + counter, and the sound changes between them | nothing |
| `sounds.js` | special-sound detection per token, with spans | `kana.js` |
| `grammar.js` | particle, copula and ending notes per token and per pair of tokens | nothing |
| `notes.js` | every learner-facing explanation string, `{ en, es }` | nothing |
| `furigana.js` | aligning a reading to a surface, per kanji where the data allows | `kana.js` |
| `analyze.js` | the pipeline above | all of the above |
| `render*.js`, `events*.js`, `state.js` | the page | `analyze.js`, `notes.js`, `strings.js` |

The analyzer modules (`kana` to `analyze`) never touch the DOM, so `npm test`
runs them under plain node with the real shards read from disk.

## The token

```js
{
  i: 0,                 // index in the flat token list
  kind: 'word',         // word | inflected | particle | copula | katakana | name | unknown | punct | space | latin | number | newline
  surface: '食べました', // exactly the characters of the text this token covers
  start: 12, end: 17,   // offsets into the normalized text
  base: '食べる',        // dictionary form (word, inflected, copula); surface otherwise
  reading: 'たべました', // hiragana reading of the SURFACE, not of the base
  furigana: [           // one entry per run of the surface, in order
    { text: '食', ruby: 'た' },
    { text: 'べました' },          // kana runs carry no ruby
  ],
  morae: ['た','べ','ま','し','た'],
  romaji: { said: 'tabemashita', spelled: 'ta-be-ma-shi-ta' },
  entry: { r: [...], g: [...], p: 'v1 vt' } | null,   // the chosen dictionary record
  alts: 2,              // how many other records share the key (homographs)
  chain: [ { rule: 'masu-past', label: 'polite past' } ],   // deinflection steps, surface to base
  sounds: [ { type: 'long-vowel', at: [3, 5], detail: 'oo' } ],   // spans are offsets inside `reading`
  grammar: [ { id: 'polite-past' } ],                 // ids into notes.js
  kanji: ['食'],        // kanji characters in the surface, in order
  confidence: 'dict',   // dict | rule | guess ; guess means no dictionary support
}
```

Three fields appear only where they apply:

- a `furigana` entry carries `whole: true` when the dictionary says its run is read as a whole (`f` is `*`: 今日 きょう), so nothing shares the ruby out between the characters;
- a `dakuten`, `handakuten` or `devoiced` sound is one entry per token, with every kana it covers in `spans` (`at` is the first), so a sentence with eight voiced kana lists the mark once per word, not eight times;
- a `furigana` entry of a `number` token carries `whole: true` when the number and its counter are read as one word (八日 ようか, 二十歳 はたち, 一人 ひとり), exactly as a dictionary `*` does;
- a `number` token carries `counterChange`, true when a number and its counter bent each other (いっぽん) or the number bent inside itself (ろっぴゃく).

Rules the token obeys:

- Tokens tile the text: concatenating every `surface` gives the normalized text back. A test asserts this for every fixture.
- `reading` is always hiragana, even for a katakana surface; `romaji` is computed from it.
- `sounds[].at` indexes into `reading` (not `surface`), because a special sound is a property of what is said.
- A token never carries learner-facing prose. It carries ids; `notes.js` turns an id into `{ en, es }`.

## Romaji: two lines, on purpose

- **said** follows Genki: long vowels doubled (`sayoonara`, `sensee`, `koohii`), particles written as pronounced (`wa`, `e`, `o`), っ doubles the next consonant (`kitte`, `matcha`), ん is `n`, and `n'` before a vowel or y (`kin'en`, `kon'ya`). Never macrons.
- **spelled** is kana by kana with hyphens between beats (`sa-yo-u-na-ra`), so the learner sees why the two lines differ.
- A vowel pair is merged into a long vowel only inside one morpheme: inside one kanji's reading, or inside a kana-only word. It is not merged across a kanji and its okurigana (`思う` stays `omou`), across two kanji (`小売` stays `kouri`), or on the final う of a v5u verb (`追う` stays `ou`).
- A kana-only word is one morpheme unless its kanji spelling says otherwise: そのうち is その内 and said `sonouchi`, ていれ is 手入れ and said `teire`. A word usually written in kana takes only the cuts before a kanji from its spelling, because its okurigana can be fused into it (ありがとう, 有り難う, stays `arigatoo`).
- A は inside a dictionary expression that the expression's own pieces make a particle is said `wa`: ではまた `dewamata`, ということは `toiukotowa`.
- Devoicing (`desu` said close to `dess`) is a note, never a change to the romaji line.

## Data formats (data/)

Built by hand-run scripts under `tools/`, committed, never fetched from an
upstream by the page. Every JSON file carries a `_licence` block and stays
under 140 KB.

The dictionary is cut from jmdict-eng, pinned in `tools/lib/sources.mjs`.
Its entries with a common spelling (jmdict-eng-common, 22,637 of 218,672)
all ship. An entry outside that set ships only for one of three reasons, each
naming the keys it ships under (`tools/lib/extra.mjs` explains them):

- **evidence**: a kanji spelling of two or more characters the corpus matches
  at least `MIN_MATCHES` (5) times, from an entry that is not an expression,
  that the analyzer does not already read as a conjugation, a stem, a common
  key with a particle or an honorific prefix, or a run of common keys read the
  same way (殺人犯, 犬小屋 いぬごや, 七面鳥, 学園祭 がくえんさい); a suffix
  (`suf`, `ctr`) also ships under its hiragana reading when that is a common
  key (置き under おき, for 十分おきに);
- **kana**: a word usually written in kana, spelled with one shipped kanji,
  whose hiragana is no key yet (すもも); only the kana ships;
- **suru**: under a common hiragana key none of whose records takes する, the
  one outside entry that does, spelled with the most frequent kanji (帰社
  under きしゃ). A noun that takes no する pays `COST.suruNeedsVs` before one.

A record from outside the common set whose spelling the corpus never matched
is priced as having no evidence (band 8), so it wins only where the context
asks for it. Its key's band is set on the common keys' scale, which moves no
common key's band.

`MIN_MATCHES` was measured over the same 3,016 texts, against the data with
no entry from outside the common set (38,415 keys, 3,908.5 KB):

| N | keys added | records added | bytes added | name guesses (209) | texts changed |
|---:|---:|---:|---:|---:|---:|
| kana and suru only | 58 | 722 | 52.5 KB | 209 | 4 |
| 20 | 162 | 831 | 62.8 KB | 202 | 21 |
| 10 | 334 | 1,004 | 80.5 KB | 196 | 33 |
| **5** | **944** | **1,625** | **146.7 KB** | **179** | **62** |
| 3 | 1,998 | 2,699 | 261.1 KB | 160 | 87 |

At 5 every changed text reads better (a name guess becomes a word, a compound
takes its own reading) and the tests pass; at 3, 六百 stops being a number
and 清水 a surname, and six tests fail. The first version of these rules,
which filtered out only conjugations and a key with a particle, added 5,679
keys and 679 KB at 3, and even at 20 read はし as 愛し "lovely" and くじ as
９時.

`data/dict/index.json`, format `yomu-dict-index/2`:

```json
{ "_licence": {}, "format": "yomu-dict-index/2",
  "keys": 39359, "maxKey": 22,
  "core": { "src": "data/dict/core.json", "keys": 1178 },
  "filter": { "src": "data/dict/filter.json" },
  "shards": [ { "src": "data/dict/w00.json", "first": "〇" } ] }
```

A key is in the core or in exactly one range shard, never both. The core
(`yomu-dict-core/1`, the shard shape below) holds the keys texts ask the
dictionary for most, per byte: the builder cuts every tenth corpus sentence
into the keys `candidates.js` would look up and fills 140 KB with the keys the
most sentences needed (`tools/lib/layout.mjs`). Every text loads it. A key
outside it belongs to the last range shard whose `first` is `<=` the key,
compared with plain JS string order (UTF-16 code units) in both the builder
and the page, and that shard is fetched only when the filter says the key may
be there.

`data/dict/filter.json`, format `yomu-dict-filter/1`, is a Bloom filter over
every range key: `{ n, m, k, bits }`, `n` keys, `m` bits, `k` hashes, the bits
in base64 (bit i at byte i >> 3, mask 1 << (i & 7)), hashed as `js/bloom.js`
hashes (FNV-1a over UTF-16 code units, two offsets, double hashing). It never
calls a present key absent (`tools/check-data.mjs` tests every range key) and
calls about one absent key in 2,000 present. Its size was measured, over 4,979
corpus sentences the core was not chosen from:

| bits per key | filter | dictionary files per text: median, mean, p90 |
|---:|---:|---|
| before 2026-09-29: no core, no filter, two passes | none | 18, 17.43, 22 |
| 8 | 51.0 KB | 6, 5.84, 9 |
| 12 | 75.8 KB | 4, 3.82, 6 |
| 14 | 88.2 KB | 3, 3.51, 6 |
| **16** | **100.6 KB** | **3, 3.41, 6** |
| 20 | 125.4 KB | 3, 3.35, 5 |

The table was measured on the common set alone (27 range shards). With the
entries outside it added (28 range shards, 103.1 KB of filter), the shipped
build reads 3, 3.46, 6 on the same sentences.

`data/dict/wNN.json`, format `yomu-dict/1`:

```json
{ "_licence": {}, "format": "yomu-dict/1", "first": "…", "last": "…",
  "entries": {
    "勉強": [ { "r": ["べんきょう"], "g": ["study", "diligence", "experience"], "p": "n vs", "f": "べん|きょう", "q": 2 } ],
    "わたし": [ { "g": ["I", "me"], "p": "pn", "k": ["私"], "u": 1, "q": 1 } ]
  } }
```

| Field | Meaning |
|---|---|
| `r` | kana readings valid for this key; omitted when the key is itself kana |
| `g` | up to 3 English glosses, one per sense |
| `p` | part-of-speech tags, space separated, JMdict codes (`v1`, `v5k`, `adj-i`, `prt`, `cop`…) |
| `f` | per-kanji split of the first reading for multi-kanji runs, `|` between kanji, `;` between runs, `*` when the run is read as a whole (今日) |
| `k` | for a kana key, up to 2 kanji spellings of the same entry |
| `u` | 1 when the entry is usually written in kana |
| `x` | 1 when the key is another key plus a trailing particle (今日は, 実は, 一緒に): the lattice prefers the split unless the key is the whole run |
| `q` | frequency band from Tatoeba, 1 (most frequent) to 5; absent means unranked |
| `o` | on a record of a kanji key with several records: how far down the kanji lists of its first reading's records this spelling sits, 3 when that reading lists it nowhere (本 is the ほん record's first spelling, the もと record's second); absent means 0 |
| `b` | on a record of a kana key with several records: the band of its kanji spelling, taken two worse where that band is earned by another reading (入る by はいる, 五 by ご) or by a conjugated stem (動 by 動いて); absent means the key's own band two worse |
| `c` | on a record of a hiragana key: offsets where its kanji spelling says one morpheme ends and the next begins, only where that splits a pair the said line would merge (そのうち is その\|内, `[2]`) |
| `t` | on a record of a kana key that another record of the key ties with on every price known before context (band, kanji met in kana, q): its place among them, 1 to 5, by how often the corpus matched its own kanji spelling; absent on the one matched most |

`o`, `b` and `c` are what the page used to fetch other shards to learn;
`tools/lib/prices.mjs` works them out once, from the records it ships. `t`
is what the page used to leave to record order: 貴方 and 彼方 are one band
under あなた, 所 and 床 one band under とこ, and whichever JMdict filed first
won. A record with no spelling counts nothing, so いくら stays 幾ら "how much"
over the roe. `tests/regressions.test.mjs` reads a set of these with every
key's records reversed and rotated and expects the same words.

A key holds at most six records. A kana key's records are different words,
so before the cap they are ordered by the corpus: common spellings first,
then by what the page would charge each one in kana text (the band of its own
kanji spelling, discounted where that band is someone else's, as
`kanaRecordPrice` in `js/spellings.js` prices it), then JMdict order. A kanji
key keeps JMdict order, because its records share one string and one count.

`data/kanji/index.json` lists the characters in each kanji shard;
`data/kanji/kNN.json` (format `yomu-kanji/1`) holds
`{ on: [], kun: [], m: [], s: strokes, g: grade, j: jlpt, f: freq, parts: [] }`
per character. `parts` are KanjiVG's top-level named elements.

## Licences

- JMdict (jmdict-simplified's jmdict-eng) and KANJIDIC: Electronic Dictionary Research and Development Group, CC BY-SA 4.0. The acknowledgement is shown on the page whenever a gloss or a kanji reading is.
- KanjiVG: Ulrich Apel, CC BY-SA 3.0, for `parts`.
- Tatoeba: CC BY 2.0 FR, used only to rank keys; no sentence ships.
- The phrase library and every note are written here and are public domain.
