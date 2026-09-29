# CLAUDE.md: Yomu

A Japanese reader. Paste a line and Yomu splits it into words, puts furigana
over the kanji, writes two romaji lines (how it is said, in Genki's
convention, and how it is spelled, kana by kana), names the special sounds and
the grammar, and lists the kanji with their readings in this text. Runcible
embeds it (`docs/EMBED.md`). Everything runs in the browser from committed
JSON; nothing is sent anywhere unless the learner clicks a translate link.

**Live:** yomu.neorgon.com (not published yet) · **Port:** 8895

## Run

```bash
make serve       # http://localhost:8895
make validate    # node tools/check-data.mjs, then npm test
make data        # rebuild data/dict and data/kanji from the pinned upstreams (manual)
npm test         # node --test tests/*.test.mjs
```

`npm test` is the definition of done for anything under `js/` that is not a
render module. The analyzer has no DOM, so the sentence suites run under plain
node against the committed shards (`tests/helpers/disk.mjs`).
`tests/harness.html` renders a fixture analysis without the analyzer.

## Where things are

- `docs/ANALYZER.md` is the contract: the pipeline, the module table, the
  token shape, the data formats. A module that disagrees with it is the one
  that is wrong; if the contract was wrong, change it in the same commit.
- `docs/EMBED.md` is the `yomu-embed/1` protocol. Runcible's host side is
  `projects/runcible-site/js/yomu-host.js`; the two share no code.
- `js/kana.js` owns every romaji decision. `js/notes*.js` owns every
  explanation string, `{ en, es }`. A token carries ids, never prose.

## Gotchas

**Romaji has two lines on purpose, and a long vowel never crosses a morpheme.**
`said` doubles う after an o beat and い after an e beat (さようなら sayoonara,
せんせい sensee) only inside one morpheme. The cuts come from the furigana
split, the deinflection chain and the final kana of a v5u verb, so 思う stays
omou and 小売 stays kouri. Particles (は, へ, を inside particle and copula
tokens) are read wa, e, o; the fossil は of こんにちは rides on the record's `w`
flag. Devoicing is a note in Genki's s(u)kides(u) notation, never a change to
the romaji line.

**A key is in the core or in one range shard, and a range shard is fetched
only when the filter lets one of the text's keys through.** A key outside
`data/dict/core.json` resolves to the last range shard whose `first` is <= the
key, in plain JS string order; the builder and `js/dict.js` must agree on that
order (UTF-16 code units, not locale), and both hash with `js/bloom.js`. A
sentence loads a median of three dictionary files (it was eighteen), a long
paragraph most of them. The analyzer calls `dict.need` once: anything a key
needs from another key (`o`, `b`, `c`) is on its record, built by
`tools/lib/prices.mjs`. A cost that reads a second key with `dict.get` must be
shipped the same way, or it reads whatever an earlier paste happened to load.

**Record order is filing order, and no reading may depend on it.** Two
records of a kana key that every context-free price ties are ordered by the
builder's `t` (the corpus count of their spellings), and the regression test
reads its cases with every key's records reversed and rotated. Kanji keys
with several readings (方 かた and ほう, 中 なか and ちゅう) still tie on the
same count, so reversing the records changes 185 of 3,016 test texts; a new
signal for those is open work, not a reason to reorder the data.

**Every JSON file is at most 140,000 bytes.** `tools/check-data.mjs` fails on
141 KB. The builders pack contiguous key ranges up to that size.

**The dictionary glosses are upstream data, not our copy.** Seven JMdict
glosses contain a word the fleet's copy rules ban (パワフル is "powerful"); the
builder drops a banned word only when the sense has another gloss. Do not
"fix" them in `data/`: rebuild, never hand-edit a shard.

**Words outside JMdict's common set ship by rule, not by count alone.**
`tools/lib/extra.mjs` names the three rules and `MIN_MATCHES` (5) is
measured (docs/ANALYZER.md). Lowering it is not free: at 3, 六百 became a
word instead of a number, 清水 "spring water" instead of the surname, and six
tests failed; filtering out only conjugations, the full release shipped
verb stems and phrases (はし read 愛し, くじ read ９時). Rebuild with
`node tools/build-dict.mjs` and diff the sentence suites before changing it.

**Names are guesses.** JMnedict is not pinned, so a kanji run no dictionary
key spans (田中, 山田) becomes one `name` token with a per-kanji reading that
prefers kun readings, and `confidence: 'guess'`. The page says so.

**The text stays in the browser.** It persists only under
`localStorage['yomu-site:text']`, never in the URL, a data attribute, the
title or the beacon target. `#t=<text>` is read once (for links from other
Neorgon sites, with their own authored text) and removed with
`history.replaceState`. The DeepL and Google links are built at click time.

**The embed answers only listed origins.** `js/embed.js` accepts messages from
`https://runcible.neorgon.com` and Runcible's dev server on 8878, checks
`event.source === window.parent`, and posts only to the origin of the last
accepted `yomu:hello`. A new host goes into that list and into `docs/EMBED.md`
in the same commit.

**Nothing from Genki, the Japan Foundation apps, Tofugu, Yomitan, rikaichan
or 10ten is in this repository.** The deinflection table was written for
Yomu from grammar; Genki was read for its order and its romaji convention
only; the phrase library and every note are original. Keep it that way: GPL
rule tables cannot be copied into this MIT site, and textbook text is
copyrighted.

## Do not touch

- `js/vendor/wanakana.js`: upstream 5.3.1, MIT, byte for byte.
- `js/neorgon-*.js`, `css/neorgon-*.css`: vendored kits, refreshed by `packages/neorgon-ui/sync-*.sh`.
- `data/dict/**`, `data/kanji/**`: emitted by `tools/build-*.mjs` from the pins in `tools/lib/sources.mjs`. Rebuild, do not hand-edit.
- `favicon.*`, `apple-touch-icon.png`, `web-app-manifest-*.png`, `site.webmanifest`: generated by `packages/neorgon-ui/sync-favicon.sh` once the site has a hub card.
