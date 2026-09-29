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
                           dict.need(keys) ──fetch shards──▶ dict.get(key)
                           dict.need(readings of keys with several records)
                                      │
                           lattice(run, edges) ──first path──▶ kana words on it
                                      │
                           dict.need(kanji spellings of those kana words)
                                      │
                           lattice(run, edges, spelled) ──best path──▶ tokens
                                      │
                           enrich(token): reading, furigana, morae,
                                          romaji said/spelled, sounds[], grammar[]
                                      │
                           kanjiList(tokens) ◀── kanji shards
```

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
| `dict.js` | the shard index, fetching, `need(keys)`, `get(key)`, kanji info | nothing (fetch only) |
| `lattice.js` | the best path through a run, and the tokens built from it | `kana.js`, `deinflect.js`, `costs.js`, `names.js`, `candidates.js`, `spellings.js` |
| `candidates.js` | every node that could start at one position of a run, with its own cost | `kana.js`, `deinflect.js`, `numbers.js`, `costs.js`, `names.js`, `key-rules.js`, `spellings.js` |
| `spellings.js` | what a kana word learns from its kanji spelling: the rank of kana homographs (すき is 好き before 隙) and the morpheme cuts of a kana compound (そのうち is その\|内) | `kana.js`, `costs.js`, `furigana.js` |
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

`data/dict/index.json`, format `yomu-dict-index/1`:

```json
{ "_licence": {}, "format": "yomu-dict-index/1",
  "keys": 38415, "maxKey": 12,
  "shards": [ { "src": "data/dict/w00.json", "first": "ぁ" } ] }
```

A key belongs to the last shard whose `first` is `<=` the key, compared with
plain JS string order (UTF-16 code units) in both the builder and the page.

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

`data/kanji/index.json` lists the characters in each kanji shard;
`data/kanji/kNN.json` (format `yomu-kanji/1`) holds
`{ on: [], kun: [], m: [], s: strokes, g: grade, j: jlpt, f: freq, parts: [] }`
per character. `parts` are KanjiVG's top-level named elements.

## Licences

- JMdict and KANJIDIC: Electronic Dictionary Research and Development Group, CC BY-SA 4.0. The acknowledgement is shown on the page whenever a gloss or a kanji reading is.
- KanjiVG: Ulrich Apel, CC BY-SA 3.0, for `parts`.
- Tatoeba: CC BY 2.0 FR, used only to rank keys; no sentence ships.
- The phrase library and every note are written here and are public domain.
