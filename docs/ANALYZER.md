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
                           lattice(run, edges) ──best path──▶ the first pass
                                      │
                           only where it guessed (a name, a katakana run with
                           no record, kana nothing explains):
                           dict.needRare(keys) ──rare.json, kana filters──▶ rNNN
                           dict.needNames(keys) ──names/index.json──▶ nNN
                           rare.refine(span) ──best path over the span──▶ second phase
                                      │
                           tokens ─▶ joinKatakana: katakana pieces that touch
                                     become one compound with parts
                                      │
                                    enrich(token): reading, furigana, morae,
                                          romaji said/spelled, sounds[] (with
                                          the loanword rules), grammar[]
                                      │
                           kanjiList(tokens) ◀── kanji shards
```

One call to `dict.need`, one path. What a key needs to know about another
key is shipped on its record by the builder (`o`, `b`, `c` below), so the
analyzer never fetches a second key to price the first. (The second phase,
below, may call it once more, only for the ichidan verb behind a kanji the
first pass guessed alone.) Until 2026-09-29 it
segmented each run twice, fetching the kanji spellings of the kana words on
the first path and the readings of kanji keys with several records, and a
kana sentence loaded up to 20 of the 27 shards.

The second phase (2026-10-01, `js/rare.js`) is not a second pass over the
text. It runs only when the first pass left a guess, reads only the
stretches of consecutive guessed tokens, between the two tokens the first
pass placed around them (connected exactly as the first pass connected
them), and fetches the rest of JMdict and the names for those stretches
alone, with one call each. The first pass's own candidates and prices
apply inside a stretch, plus four kinds of node it never had: rare words,
names, a katakana guess priced by its length (so a run of known words
splits), and, for one kanji guessed alone, the stem of the ichidan verb it
begins (見に行く is 見る's 見: the first pass asks for no verb behind every
kanji of every text, because each such key is a chance for the filter to
let a shard through for nothing). A token outside a stretch is the token the
first pass built, with the first pass's neighbours, byte for byte: a
particle after a word the second phase found keeps its gloss, and 何 keeps
its なに or なん. Its grammar notes are the one exception, because
`annotateGrammar` works them out after both passes from the token before
it: in 億劫で, で is "and" (`de-and`) after the rare na-adjective 億劫, where
after the guess it was `de`, and its gloss is still the first pass's. A text
with no guess fetches no file of either tier. See "The second phase" below
for the prices and the measurements.

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
| `dict.js` | the shard index, the core and the key filter, fetching, `need(keys)`, `get(key)`, kanji info (listed and ranged shards); the second phase's tiers as `needRare`/`rare` and `needNames`/`name` | `bloom.js`, `range-store.js` |
| `range-store.js` | a tier loaded only when asked: an index, key filters (parts over a range, or one inline), range shards | `bloom.js` |
| `bloom.js` | the key filter: its hash, reading it, and building it (the builder imports this file) | nothing |
| `lattice.js` | the best path through a run (or through one stretch of it, between two fixed nodes), and the tokens built from it | `kana.js`, `deinflect.js`, `costs.js`, `names.js`, `candidates.js`, `spellings.js` |
| `rare.js` | the second phase: which stretches the first pass guessed, the keys they ask the rare words and the names for, and the best path through each with them | `kana.js`, `deinflect.js`, `candidates.js`, `lattice.js`, `costs.js`, `names.js` |
| `candidates.js` | every node that could start at one position of a run, with its own cost | `kana.js`, `deinflect.js`, `numbers.js`, `costs.js`, `names.js`, `key-rules.js`, `spellings.js` |
| `spellings.js` | what a kana word learns from its kanji spelling, read off the record: the rank of kana homographs (すき is 好き before 隙, `b`, ties by `t`) and the morpheme cuts of a kana compound (そのうち is その\|内, `c`) | `kana.js`, `costs.js` |
| `costs.js` | the closed classes (particles, copula), every cost, connection costs, homograph ranking | `kana.js` |
| `key-rules.js` | dictionary keys the lattice refuses (ですか, ませんか, 雨が降る, になると) | `kana.js`, `costs.js` |
| `names.js` | which kanji runs are names, a per-kanji guess at their reading, and the entry a name from the names tier carries (`NAME_TYPES`, `nameEntry`) | `kana.js`, `deinflect.js`, `numbers.js` |
| `numbers.js` | reading numbers, counters and 何 + counter, and the sound changes between them | nothing |
| `compounds.js` | katakana pieces that touch, joined into one compound token with `parts` | `kana.js` |
| `loan-align.js` | an English word lined up against katakana beats, consonant by consonant | `kana.js` |
| `loanwords.js` | the loanword rules per katakana token, as sound entries with spans (`LOAN_TYPES`) | `kana.js`, `loan-align.js` |
| `sounds.js` | special-sound detection per token, with spans, and the loanword rules | `kana.js`, `loanwords.js` |
| `grammar.js` | particle, copula and ending notes per token and per pair of tokens | nothing |
| `notes.js` | every learner-facing explanation string, `{ en, es }`: sounds (`notes-sounds.js`), loanword rules (`notes-loan.js`), grammar (`notes-grammar.js`) | the three tables |
| `furigana.js` | aligning a reading to a surface, per kanji where the data allows | `kana.js` |
| `analyze.js` | the pipeline above: the first pass, the second phase where it guessed, the tokens | all of the above |
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

A token the second phase read is shaped the same, with these marks:

- a **rare word** (a record from `data/dict/rNNN`) has `confidence: 'dict'` and `entry.tier === 2`, set by `dict.js` as the shard loads (the shards do not spend bytes on it), so the page can say "rare word"; its `alts` counts the other rare records of its key. The Word panel opens its meanings with a "Rare word" label and one sentence: it is not among the common words, so it was read from the full dictionary;
- a **name** from the names tier has `kind: 'name'`, `confidence: 'dict'`, its JMnedict reading, and `entry = { r?, g, p: 'n-pr', nt, f?, s?, also? }`: `nt` the JMnedict types (`surname`, `given`, `masc`, `fem`, `place`), most evidenced first, `g` the same in English (`['surname', 'place name']`), the way a dictionary gloss is English, and `names.js` `NAME_TYPES` holds each in `{ en, es }` for the page. `also` is the rare word spelled the same, `{ r?, g }` (its reading and up to two glosses), where there is one: 清水 is the surname and also "spring water", and nothing in 清水を飲んだ tells the two apart, so the page can say both. A name the first pass guessed keeps `entry: null` and `confidence: 'guess'`.

These fields appear only where they apply:

- a katakana **compound** (`compounds.js`, below) has `parts: [{ surface, reading, gloss, tier, entry }]`, one per dictionary word or guess the lattice placed in it (`tier` 1 or 2, null for a guess; `gloss` the record's first gloss, null for a guess), and `gloss`, the parts' glosses joined with ` + ` when every part has one (`'tennis + tournament'`), else null. Its own `entry` is null; its `confidence` is `rule` when every part is a dictionary word and `guess` otherwise;
- a loanword rule (`loan-*` in `sounds`, below) is one entry per type per token, with every place it applies in `spans`, the way the voiced marks are;
- a `furigana` entry carries `whole: true` when the dictionary says its run is read as a whole (`f` is `*`: 今日 きょう), so nothing shares the ruby out between the characters;
- a `dakuten`, `handakuten` or `devoiced` sound is one entry per token, with every kana it covers in `spans` (`at` is the first), so a sentence with eight voiced kana lists the mark once per word, not eight times;
- a `furigana` entry of a `number` token carries `whole: true` when the number and its counter are read as one word (八日 ようか, 二十歳 はたち, 一人 ひとり), exactly as a dictionary `*` does;
- a `number` token carries `counterChange`, true when a number and its counter bent each other (いっぽん) or the number bent inside itself (ろっぴゃく).

Rules the token obeys:

- Tokens tile the text: concatenating every `surface` gives the normalized text back. A test asserts this for every fixture.
- `reading` is always hiragana, even for a katakana surface; `romaji` is computed from it.
- `sounds[].at` indexes into `reading` (not `surface`), because a special sound is a property of what is said.
- A token never carries learner-facing prose. It carries ids; `notes.js` turns an id into `{ en, es }`.

## Numbers and counters

A number (digits, or kanji numerals) followed by a counter from the table in
`numbers.js` is one `number` token, read by rule, and so is 何 before one
(何本 なんぼん). The counters: 時, 時間, 時半, 分, 秒, 人, 本, 枚, 名, 円, 歳,
月, 日, 年, 回, 個, 階, 杯, 匹, 冊, 台, 番, 度, 倍, つ, か月 and か所 in each
way the small ka is written (か, ヶ, ケ, カ, ヵ, 箇), a length of time with 間
(三年間, 十分間, 一か月間) and 週間. A dictionary key spelled the same way
keeps the span only when it is among the commonest words (十分 じゅうぶん); 何名
"how many people", band 4, is the counter's なんめい.

名 counts people (a booking, a class list): いちめい, にめい, さんめい, よんめい,
ごめい, ろくめい, ななめい, はちめい, きゅうめい, じゅうめい, and no number bends
before it. Until 2026-10-05 it was no counter, and a number before it was a
kanji run the dictionary did not cover: 十名 read as the surname とな, 三名 as
the place さんみょう. A name is never read across a number and its counter
(`names.js` asks `countedEnd`), so a surname that starts with a number and 名
is read as the count.

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

The corpus counts a spelling, not a word: 上野 was matched for Ueno, the
place and surname, and shipped under its one entry outside the common set
it read every 上野 as こうずけ, Kōzuke, a former province. So a spelling that
is a names-tier name most texts mean (`S` below) read another way than every
entry it would ship for is no evidence for them (2026-10-03, one spelling:
上野). It stays out of the first tier, and the second phase reads it.

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
  "keys": 39358, "maxKey": 22,
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
| `t` | on a record of a kana key that another record of the key ties with on every price known before context (band, kanji met in kana, q): its place among them, 1 to 5, by how often the corpus matched its own kanji spelling; absent on the one matched most. In the second tier, every record's place among its key's records after the first (see below) |
| `ls` | where a borrowed word came from, from the record's first sense: `[language, source word or null]`, JMdict's ISO 639-2 code (`eng`, `ger`, `fre`, `por`...) and its source text: アルバイト `['ger', 'Arbeit']`, パン `['por', 'pão']`, an English loan JMdict names no source word for `['eng', null]`. A word built from two sources keeps the first. Absent means JMdict did not say, never that the word is native: JMdict marks a source on 6,219 of its 218,672 entries, so most katakana words carry none |
| `ws` | 1 when that source is wasei, a word made in Japan from foreign parts: ナイター `ls: ['eng', 'nighter'], ws: 1` (a game under lights). Never without `ls` |
| `e` | second tier only: 1 when the key is a kana spelling of a common word (リンゴ is 林檎's, カギ 鍵's), which the second phase trusts more than a rare word |

`ls` and `ws` are for the loanword rules (`loanwords.js`) and the Word
panel's "Where it comes from" line; nothing in the lattice reads them.
The first tier ships 646 records with `ls`, 104 of them with `ws`; the second
tier 10,772 and 4,182. They added 14.8 KB to the first tier and moved
three keys out of the core, and no reading changed.

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

`data/kanji/kNN.json` (format `yomu-kanji/1`) holds
`{ on: [], kun: [], m: [], s: strokes, g: grade, j: jlpt, f: freq, parts: [] }`
per character. `parts` are KanjiVG's top-level named elements, empty for the
3,971 characters KanjiVG does not draw (none of them joyo or ranked).

All 10,384 KANJIDIC2 characters ship (2,600 before 2026-10-01: a rare kanji
in a pasted text had no readings and no meaning in the table). The index,
`data/kanji/index.json` (format `yomu-kanji-index/2`), has two kinds of
shard:

- **listed** (`{ src, chars }`): every joyo kanji and every character with a
  newspaper rank, 2,600, in frequency order, so a short text still loads one
  kanji shard (k00 to k02 are byte for byte what they were, but for the
  date in their licence block);
- **ranged** (`{ src, first, last }`): the other 7,784, which have no
  frequency to order them by, in plain JS string order. A character the
  listed shards do not name is looked up in the range it sorts into, and a
  character past a range's `last` and before the next `first` is one
  KANJIDIC does not have, so nothing is fetched. The index stays 9.5 KB
  (9.1 KB before); listing every character would have made it 40 KB on
  every text with a kanji in it.

### The second tier: the rest of JMdict

Every JMdict entry and spelling the first tier does not ship is in the
second tier, under its own keys, built by `tools/lib/rare.mjs` in the same
run as the first (only that run knows which (entry, spelling) pairs the
first tier shipped). That includes the records the six-record cap dropped,
the rare entries spelled like a first-tier key (中 "red dragon tile"), the
other spellings of common entries (リンゴ beside りんご), and the
spellings JMdict tags search-only (ホント, ギョウザ), which the first tier
never makes keys and which people write.

- `data/dict/rare.json`, format `yomu-dict-rare-index/1`:
  `{ keys, maxKey, filters: [{ src, first, last }], shards: [{ src, first }] }`
- `data/dict/rNNN.json`, format `yomu-dict-rare/1`: the shard shape above,
  the same record fields, at most 12 records a key (82 keys have more: the
  one-syllable sounds こう, しょう, where the second phase offers nothing)
- `data/dict/rfNN.json`, format `yomu-dict-filter/1`: key filters

A key is found the way a first-tier key is: the last shard whose `first` is
`<=` it. Records of one key are filed by evidence, strongest first: a
spelling the first tier itself gives a word it ships (its kana record lists
it in `k`: うどん is written 饂飩, which JMdict tags rarely used there and
leaves untagged under ワンタン, so 饂飩 read "wonton" until 2026-10-03; 218
keys changed their first record, 面皰 にきび, 香魚 あゆ and 彼の あの
among them); a spelling JMdict does not tag irregular, outdated, rarely used
or search-only; a spelling that is its entry's headword (上気 is じょうき's
own, a variant of 浮気 "infidelity" whose kana record does not list it, and
with record order it read 顔が上気した as an affair); `e`; how often the
corpus matched the record's own spelling; JMdict's order. `t` is that place, and the second phase
prices it as a fraction of a step, so no reading depends on the order the
array happens to have.

The filters cover only the keys from the first that starts with kana to the
last, in parts of 8,000 keys at 8 bits a key; a key outside that range is
covered by no filter and its shard is fetched on sight. Simulated from the
keys each of the 597 of 3,112 corpus sentences that run the second phase
asks for (files and bytes of the second phase alone, both indexes
included):

| filters | filter files | files per sentence: median, mean | KB per sentence: median, mean |
|---|---:|---|---|
| none | 0 | 4, 5.17 | 341, 503 |
| parts sized to the cap over every key, 16 bits | 9, 1,177 KB | 5, 5.68 | 478, 566 |
| the same at 6 bits | 4, 443 KB | 5, 5.36 | 480, 521 |
| hashed by first character, kana keys, 64 parts, 8 bits | 64, 485 KB | 5, 5.94 | 341, 396 |
| **ranged, kana keys, 8,000 a part, 8 bits** | **31, 366 KB** | **5, 5.75** | **340, 400** |
| ranged, kana keys, 2,000 a part, 8 bits | 122, 630 KB | 5, 5.92 | 341, 390 |

A key that starts with a kanji nearly always shares its shard with one
that exists (one kanji alone is the key of some rare entry), so a filter
saved it nothing and cost a part; a katakana run asks about many strings
that are no key (トム, メアリー), and each is a shard not fetched.

### Names: JMnedict

`tools/build-names.mjs` cuts the names from JMnedict (pinned in
`tools/lib/sources.mjs`, 743,624 entries). It ships spellings of two or
more characters, all kanji (and 々) or all katakana, typed surname, given,
masc, fem or place, that are not first-tier keys (the first pass reads
those as words, so nothing would ask), for one of two reasons:

- **attested**: the Tatoeba corpus has it at least once; a kanji name as a
  substring, a katakana name only as a whole katakana run (アン is in every
  アンケート, パソ in every パソコン);
- **evidence**: at least 5 other JMnedict names use it, counted as below
  (built on it, ending with it after a surname, or a longer given name). Of
  a list of 102 common surnames, 13 are first-tier keys and Tatoeba has 58
  of the rest; this rule brings in the other 31 (石井, 前田, 長谷川), and
  given names Tatoeba never has (恵子, 直樹, 浩之).

One kanji alone is left out (森, 林, 東 are words as often as names), and so
are JMnedict's `unclass` and `person` types: the 2,248 katakana names of
those types the corpus has as a substring include ケット, パソ and ディ, so
スーザン, typed `unclass`, stays a guess.

JMnedict lists every reading a spelling was ever given, in kana order (田中
is たなか, and たんか, だなか, でんちゅう and six more), so the reading is
chosen by evidence the file holds (`tools/lib/jmnedict.mjs`), each count
credited to the longest candidate reading it extends:

- `ext`, how many longer JMnedict names are built on this spelling and this
  reading: a full name, a surname, a place or a station that starts with it
  (田中 たなか starts 409, たんか none; 清水 しみず 289, きよみず 12).
  Another given name does not count (美咲央 みさお is not 美咲 and 央; 26
  of them read 美咲 as みさ), nor an unclassified one, nor a longer name
  better cut inside the spelling, where a later part of it is itself a name
  read the way the longer one ends (東大井 is 東 and 大井, and such places
  read 東大 ひがしおお); a katakana name counts only as the first word of a
  full name (ジョン・ウェイン, トムハンクス), because バグダッド is not built
  on バグ, and that made バグ a strong name;
- `suf`, how many full names end with it after a JMnedict surname read one
  of its surname readings (宇佐美恵子 うさみけいこ is 宇佐美 and 恵子
  けいこ). Given names are rarely built on, and this is their evidence: 恵子
  けいこ, not えこ, which won the tie for having two types;
- `gext`, longer given names that start with it, only to break a tie of the
  two above (陽菜 ひな, from 陽菜子 ひなこ and the like).

Then a reading the characters' KANJIDIC readings can spell (秀樹 ひでき, not
ほつき); then more types; then JMnedict's order. Every reading of the
spelling competes, kept type or not, and a spelling whose best reading is
of a type that does not ship does not ship (相模 さがみ is typed only
`person`, and さがみこ, a surname with 6 against its 42, read it). The
types are listed most evidenced first: `place` by places and stations
built on it, `surname` by full names and surnames, a given-name type by
`suf` (函館 is a place first, 花子 a given name, 田中 a surname).

Measured 2026-10-03, before and after these rules, each name read in a frame
(`Xさんが来た。`, `Xに行った。`): of 142 common surnames (written down before
running), the 128 the tier holds read right both times; of the analyzer
verifier's 53 popular given names, 28 right before and 43 after (美咲,
恵子, 優子, 七海, 智子, 和也, 直人, 明美 corrected; 直樹, 由美子, 雄太,
里美, 沙織, 香織, 綾香, 愛子, 正樹, 浩之, 博之 newly in the tier; 美優 left
it, a guess again); of its 59 places, 52 right before and 54 after (相模,
上野). The ten still wrong are modern names JMnedict holds no evidence for
(大翔, 陽翔, 颯太, 結菜), first-tier words (陽子 is "proton"), and guesses.

- `data/names/index.json`, format `yomu-names-index/1`: `{ keys, maxKey,
  filter: { n, m, k, bits }, shards: [{ src, first }] }`, the filter inline
  (16 bits a key), so the second phase learns which name shard to fetch
  from the file it needs anyway
- `data/names/nNN.json`, format `yomu-names/1`: `{ first, last, entries:
  { "田中": { "r": ["たなか"], "n": "surname place", "f": "た|なか", "s": 1, "S": 1 } } }`

| Field | Meaning |
|---|---|
| `r` | the reading, one; absent for a katakana name, which is read as written |
| `n` | the types, space separated, most evidenced first: `surname`, `given`, `masc`, `fem`, `place` |
| `f` | the reading split over the kanji, cut like a dictionary `f`; `*` read as a whole |
| `s` | 1 for a strong name (`ext` of 5 or more) |
| `S` | 1 for a sure one: `ext` of 20 or more, at least 5 of them full names or surnames (never without `s`) |

### The second phase

`js/rare.js`. A **weak** node is one with no record: a guessed name, a
katakana run, one kana nothing explains. A **span** is a maximal stretch of
weak nodes, less a single kana (no rare word of one kana is offered: a rare
ぬ or ろ is a sound of a word the first pass missed, never the word). The
second phase asks the rare words for every substring of each span (up to
24 code units) and the dictionary form behind each, and the names for every
substring of two or more kanji or katakana (up to 16), with one
`needRare` and one `needNames`, and reads each span again with the first
pass's candidates (same prices) plus:

| node | price | why |
|---|---:|---|
| rare word | the word's own price, then `COST.rare` (-15): 95 for an unranked noun of two kanji | under the guessed name (120), which connects to a noun before it for 0 where a noun pays 20; at 0, ときどき蜃気楼が stayed a guess |
| ...a kana spelling of a common word (`e`) | 10 less | リンゴ, カギ, ホント |
| ...right before さん, 様, 君, ちゃん, 氏, 殿, 先生 | 40 more | before an honorific the guess wins: 悶着さん is a person |
| name, strong, and a surname or katakana | 80 | under a rare word: 清水さん, ジョン (not "jeon", the dish) |
| ...but not a katakana name where the same katakana spells a common word (`e`) | 112 + 32 | バグ, イヌ, バラ, ムリ, アリ read as names until 2026-10-03; ハナちゃん is still someone, since the word pays 40 before the honorific |
| ...nor a kanji surname read another way than the rare word, unless sure (`S`) | 112 | 中吉 is ちゅうきち, "middling luck", not なかよし; 大安 たいあん; a sure one still wins: 金子 かねこ, not きんす "money" |
| any other name | 112 | over a rare word, under a guess: 陸地 is "land", not the place かちじ; 天上 "the heavens", not a given name |
| a family name, then a given name | -60 to connect | 鈴木一郎 is two names, not one guess; only in that order (types from JMnedict), because 小田原城 read 小田\|原城, two surnames, while any two names earned it |
| a place in kanji, then a one-kanji noun | -65 to connect | 富山\|湾, 富山\|駅, 函館\|山, 軽井沢\|町, each one guess before (富山湾 とみやまいりえ); under -60 it does not beat a three-kanji guess with a q3 noun, over -68 it carves a weak whole name into a strong place and a noun (at -70, 176 of the 660 names-tier names that are a place and one kanji, 三田市 read みた\|いち) |
| a name before する | 60 more | ハグしない is "hug", not the surname Hug |
| a name after the polite お or ご | 40 more | お米屋さん is the rice shop, not the surname 米屋 |
| one kanji guessed alone, as an ichidan verb's stem | the stem as a noun: the word's price, then 60 | 見に行く was 見 read けん, a guessed name; the verb (見る) is asked for, from the first tier, only here |
| katakana guess | 150 + 30 a kana, at least 4 | a run that is known words splits (インフォーム\|ショップ, which the page then shows as one compound with these parts, below); 40 kana at most |

A known name connects like a noun (a guessed one follows a noun for 0). In
a katakana span a rare word needs four kana and in kana text three, unless
it is the whole span (カギ): イン\|フォーム, カート\|ライト and あつ (in
あつし) were what shorter words did. A first-tier word needs three katakana
(テニス\|トーナメント, インド\|レストラン, コロナ\|ワクチン), because at four
the common half of such a run stayed a guess. No piece starts on ー or a
small kana or right after っ, and no word starts on one at all (酔っぱらい's
stray っぱ read "leaving open"). A rare particle or copula is never offered.

One kanji as a rare word is offered only between a particle a noun takes
and the token after it: never before other kana (称\|える, 好\|か\|ない),
never right after a noun (飛行機\|代 is the suffix だい), and never for a
kanji KANJIDIC reads with okurigana (み.る, せま.い), which the first pass
left alone because the word it begins was written in a way it did not
know. Before that last rule 22 lone kanji in the measured sentences below
were read as rare words and 11 were wrong, every one such a stem: 見に行く
read 見 as けん "view (of life)", 狭過ぎる 狭 as せ "narrowness", and 暑がり,
寒がり, お仕置き, 受入れ, 干からびる the same way. They are guesses again; the
rule also turns away four that were right (論 in 消費社会論, 嵩, 埒, 書 in
招待書), which are guesses too.

A name is not read where the first pass's next token is a verb in hiragana
(オットリしている is おっとり "calm", not a surname) or one hiragana that is
no particle, copula or suffix, which is okurigana (末永く read the surname
すえなが and く "section"). A longer token is let through: what follows a
name is often a phrase the first pass does not call a particle (トムにとって,
ジョニーという, トムよりも).

#### Measured, 2026-10-03

Every 80th sentence of the Tatoeba export from the 7th (3,112 sentences,
the set the prices were first set on) and from the 47th (3,111, held out),
read with the code and data of 8fc56e1 (before) and of this change
(after). The export was downloaded on 2026-10-03 (248,924 sentences), so
these sets are not quite the ones of the first measurement. A guess is a
token with `confidence: 'guess'`: a guessed name, a katakana run with no
record, and one kana nothing explains (`kind: 'unknown'`).

| | tuned set | held out |
|---|---:|---:|
| tokens | 29,982 before, 29,991 after | 30,036 before, 30,054 after |
| guesses before (names, katakana, unknown kana) | 732 (179, 476, 77) | 713 (205, 434, 74) |
| guesses after (names, katakana, unknown kana) | 216 (89, 50, 77) | 183 (73, 36, 74) |
| sentences with a guess, before and after | 593, 177 | 592, 155 |
| tokens read as rare words, as names from the names tier | 177, 336 | 215, 305 |
| sentences whose tokens changed | 457 | 474 |
| first-pass tokens that changed | 0 of 29,250 | 0 of 29,323 |

The last row is the boundary, checked two ways over all 58,573 tokens the
first pass read from the first tier: against this code with the second
phase switched off (the same data), and against 8fc56e1 (the data before
`ls`/`ws`). Both times every such token is the same, field for field, sounds
and grammar included, once the two new record fields are set aside (183
tokens differ by `ls` or `ws` alone). `tests/tiers.test.mjs` holds six
sentences to it. One kana nothing explains is not the second phase's to
read, which is why that count does not move.

Of 30 changed tokens drawn at an even stride from the 490 distinct changes,
23 were right (瓢箪 ひょうたん, 内金 うちきん, 元栓 もとせん, 低血糖症
ていけっとうしょう, ブラウン and ヒル as surnames, ビデオデッキ, 特別\|税) and
7 were not: 今金 (今\|金, "money on hand now") read as a place, 十名 (ten
people) as the surname とな, アメ in アメ色 as "American", パタン (a door's
slam) as "pattern", アリさん (an ant in a story) as a given name, ロック in
the name ブライアンロック as "lock", and 埒, a guess still, read れつ from its
kanji. 十名 is the first pass's: 名 is not one of numbers.js's counters, so
the run reached the second phase as a name. (It is one since 2026-10-05, and
十名 is じゅうめい; see "Numbers and counters".)

### Sizes and fetches, 2026-10-03

| tier | keys | records | files | bytes |
|---|---:|---:|---:|---:|
| first: core, range shards, filter, index | 39,359 | 43,317 | 31 | 4,070 KB (4,055 KB before `ls`/`ws`; the core holds 1,175 keys, 3 fewer) |
| second: shards, filters, index | 432,897 | 455,073 | 348 | 44,551 KB |
| names: shards, index with filter | 14,213 | 14,213 | 8 | 986 KB (830 KB and 11,711 names after the second verification, below) |
| kanji: listed, ranged, index | 10,384 characters | | 11 | 1,224 KB (372 KB and 2,600 characters before) |

`data/` grew from 4.5 MB to 50.9 MB (46.4 MB more; the new and changed
files are 12.5 MB at gzip -9, about what git stores). `data/dict/` is the
largest directory, with 379 files; none holds more than 1,000.

The nine sentences the first tier's layout was measured on, before (8fc56e1)
and after, each read with a fresh dictionary. "Dictionary files" are the
core, range shards, rare shards and name shards; "all" adds the indexes,
filters and kanji files. KB are 1,000 bytes.

| sentence | dictionary files | all files | KB | KB gzipped |
|---|---|---|---|---|
| 今日はいい天気ですね。 | 1, 1 | 5, 5 | 395, 395 | 168, 168 |
| わたしはがくせいです。 | 4, 4 | 6, 6 | 666, 666 | 240, 240 |
| すもももももももものうち | 4, 4 | 6, 6 | 666, 666 | 243, 244 |
| 日本語を勉強しています。 | 2, 2 | 7, 7 | 675, 675 | 247, 246 |
| こんにちは、田中です。よろしくおねがいします。 | 7, 9 | 11, 15 | 1,235, 1,578 | 411, 507 |
| 雨が降ったら、うちにいます。 | 2, 2 | 6, 6 | 535, 535 | 207, 207 |
| きのうともだちとえいがをみました。 | 5, 5 | 7, 7 | 806, 806 | 285, 285 |
| 駅まで十分かかります。 | 3, 3 | 7, 7 | 675, 675 | 247, 246 |
| a 500-character paragraph | 25, 27 | 30, 35 | 3,894, 4,248 | 1,141, 1,237 |
| **median** | **4, 4** | **7, 7** | **675, 675** | **247, 246** |

Seven of the nine read with no guess and fetch exactly the files they did.
田中 and the paragraph's マリア run the second phase (four and five more
files: the rare-word index, the names index, a name shard and a rare shard,
and for the paragraph one rare-word filter part), and both were already
above the median. 田中 is now a surname
with its JMnedict reading and マリア a given name; neither is a guess.

### After the second verification, 2026-10-03

Two verifiers read the work above (the analyzer against 689 test texts, 40
new inputs and the corpus; the page in three engines). What they found, and
what changed, is in the sections above: the katakana names and the kanji
surnames a rare word now beats, `also` on a name, the polite prefix, the
place and the noun named after it, the ichidan stem of a kanji guessed
alone, the names' evidence (`ext`, `suf`, `gext`, `S`, the type order), the
spelling the first tier writes a word with (饂飩), and 上野 out of the first
tier. Two first-pass fixes came with them: くる and いく straight after a
te-form connect as verbs do after ください, at -30 (持ってきた was 持って and
北 "north", and 出ていった's いった was いる's past, "was needed").

Every 80th sentence of the same export from the 7th and the 47th (6,223),
read with the code and data of 411bf4a and of these fixes: 75 sentences
changed and the guesses fell from 394 to 383. きた "north" became くる's
past in 32, 見 (a guessed name read けん) 見る's stem in 8, いった became
"went" in 6, and 煮 and 干 are verbs; バグ, バラ (four), タレ, フキ and アリ
are words, 米屋 in お米屋さん the rice shop, 小田原城 おだわら and しろ, and
勝子, 友美 and 愛敬 read かつこ, ともみ, あいきょう; ten names list their
types in a new order (青森, 箱根 a place first; 花子, ロバート a given name).
Two changed from one wrong reading to another (キリ in キリがない is now
"paulownia", where the word meant is 切り, "end"; アイ in アイ・ラブ・ルーシー
"knotweed") and one got worse: メイ in メイの衣服 is the month May, where
the sentence meant a woman named May, a name that is no longer strong
because nothing in JMnedict is built on it.

The nine sentences fetch what they did but for two, which a rebuilt key
filter (one key fewer, 上野) let through one or two shards for absent keys:
今日はいい天気ですね。 2 dictionary files (535 KB, was 1 and 395 KB, for
いい天気ですぬ, a deinflection that is no key) and the paragraph 29 (was 27).
The median stays 4, 7 files in all and 675 KB. Over every 160th corpus
sentence from the 27th (1,556, each on a fresh dictionary) the first tier
fetched a mean of 3.499 files, against 3.510 before, and the second phase
0.745 against 0.746: which absent keys a filter lets through moves with any
rebuild, and on average it did not grow.

## Katakana compounds and loanword rules (2026-10-03)

### One word, made of parts

The lattice already splits a katakana run that has no record of its own into
the dictionary words it is written with: the first pass where every piece is
a first-tier word (アイスクリーム|ショップ), the second phase where it had to
guess, with the rest of JMdict (スマートフォン|ケース, インフォーム|ショップ).
That is the cost-minimising search over both tiers, and its floors were
measured by the second phase (three kana for a common word, four for a rare
one, no piece starting on ー or a small kana): a shorter floor read
イン|フォーム and カート|ライト. `compounds.js` does not search again. After
both passes, `joinKatakana` joins every stretch of two or more `katakana`
tokens that touch into one token, because Japanese writes a compound as one
word and Genki's romaji says it as one (infoomushoppu, koohiishoppu), and
keeps the pieces as `parts`. A part the lattice could only guess stays a
guess with no gloss, and the page says "not in the dictionary" for it; a run
the lattice left as one guess has no `parts`, and the page says no split
covers it. A particle, a name, a number or punctuation between two words
keeps them apart.

Both passes see the same join, so the boundary still holds as
`tests/tiers.test.mjs` checks it (the second phase's own tokens are joined
the same way with it switched off). The said line is built over the whole
compound with a morpheme cut between the parts, so no long vowel is made
across two words.

### The rules

`loanwords.js` adds sound entries to a `katakana` token (a compound part by
part, each against its own record), each `{ type, at, spans, detail }` with
spans into the reading, one entry per type per token (as the voiced marks
are). The page tells them from the special sounds by the `loan-` prefix,
lists them under "Loanword rules" in "In this text", and lights their kana
on hover like any sound.

| type | where | detail |
|---|---|---|
| `loan-vowel` | the vowel added after a word's last consonant: u, o after t and d (shop ショップ, bed ベッド) | `u` or `o` |
| `loan-double` | ッ before a final (or English-doubled) consonant after a single short vowel (cup カップ) | the held consonant |
| `loan-long` | ー for English -er, -or, -ar (computer, form, car) or a long vowel: a vowel pair, a silent e, an open syllable, al (team, game, table, ball) | the English letters (`er`, `ea`, `a-e`) |
| `loan-f` | フ with a small vowel (from the katakana alone), or フ lined up with an English f | `fa`, `fi`, `fe`, `fo`, `fu` |
| `loan-lr` | an r-column beat lined up with an English l (hotel ホテル) | `l` |
| `loan-v` | a b-column beat or ヴ lined up with an English v (television テレビ) | `b` or `v` |
| `loan-th` | an s- or z-column beat lined up with an English th (marathon マラソン, smooth スムーズ) | `s` or `z` |
| `loan-si` | シ for si (taxi), ティ or チ for ti (party, team), ディ or ジ for di (disk, radio) | `shi`, `ti`, `chi`, `di`, `ji` |
| `loan-wasei` | the record's `ws` | the `ls` source, or null |
| `loan-short` | a word that is the first beats of each English word of its gloss (パソコン, デパート) | the English it was cut from |

Every rule but `loan-f` and `loan-wasei` needs English evidence:
`loan-align.js` lines the katakana up with the English named in `ls`, or
with the first gloss, consonant by consonant. Every katakana consonant must
match one of the English word's in order (l with the r column, v with the b
column, th with s or z, t before i with チ), every English consonant must be
matched or be one English does not say (the r of form, the gh of light), and
at most one step may be loose (f written with the h column, as in コーヒー).
A later gloss counts too, except for a word the dictionary says is usually
written in kana (`u`), which has a kanji spelling and is a Japanese word: サバ
is 鯖, and its slang sense "server" lined up as v written バ. A shortened word
is read only off the source or the first gloss, and needs two consonants
matched and two English consonants left unsaid. A word whose `ls` names a
language other than English gets no English rule (ビール is Dutch bier).

Measured over the 4,409 katakana keys of the first tier (each read with its
first record): 3,034 show at least one rule; `loan-vowel` 1,860, `loan-long`
1,328, `loan-lr` 1,083, `loan-double` 433, `loan-f` 327, `loan-si` 313,
`loan-v` 188, `loan-wasei` 104, `loan-short` 93, `loan-th` 47. The rules cost
0.07 ms a katakana token, warm. A list of 60 common loanwords was written down
with the rules each should show before the code ran: 54 agreed. Of the six,
two were the list's mistakes the data corrected (JMdict gives コーヒー an
English source and シネマ a French one, so シネマ gets no English rule), two
were rules the list missed (the v of コンビニ, convenience; the ui of
フルーツ, fruit), and two are misses: スマホ, whose gloss is the one word
smartphone, is not found to be shortened, and ビル, whose first gloss is
"multi-floor building", lines up with nothing, so it shows neither the
shortening nor its l.

## Licences

- JMdict (jmdict-simplified's jmdict-eng) and KANJIDIC: Electronic Dictionary Research and Development Group, CC BY-SA 4.0. The acknowledgement is shown on the page whenever a gloss or a kanji reading is.
- JMnedict (jmdict-simplified's jmnedict-all), for `data/names/`: the same Group and licence. Its acknowledgement (`tools/lib/licence.mjs`, the EDRDG's sample text with the names file named) must be on the page whenever a name from the names tier is.
- KanjiVG: Ulrich Apel, CC BY-SA 3.0, for `parts`.
- Tatoeba: CC BY 2.0 FR, used only to rank keys; no sentence ships.
- The phrase library and every note are written here and are public domain.
