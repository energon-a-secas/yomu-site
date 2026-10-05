# yomu-embed/1: how another Neorgon site shows Yomu in a frame

Runcible is the first host. The coupling is an iframe URL and a postMessage
vocabulary, nothing else: the two sites share no code, deploy separately, and a
host ignores any message whose `v` it does not know.

## The frame

```
https://yomu.neorgon.com/?embed=1&lang=en      production
http://localhost:8895/?embed=1&lang=en         when the host itself is on localhost
```

- `embed=1` drops the header and footer, keeps one line (the embed bar), and
  lays the reader out as one column: the side table moves under the text.
- The embed bar holds three links. "My kanji" opens the learner's saved kanji
  inside the frame (`#/kanji`, and a review at `#/kanji/review`), with the
  number of reviews due beside it; Back on that screen returns to the reading,
  and the host's own URL never changes. "Play" opens the four look-alike
  games inside the frame (`#/play`); Escape in a game goes back to the list
  of games and is not passed to the host, as in a review. "Open in Yomu"
  opens Yomu on its own in a new tab. My kanji lives in the frame's storage, so inside
  `runcible.neorgon.com` it is the same list as on yomu.neorgon.com only where
  the browser does not partition a frame's storage by its parent.
- A `yomu:load` of a new text always shows the reading: if the learner had
  left the frame on My kanji, in a review or in Play, the frame returns to the reader
  (replacing the history entry, moving no focus) before it reads the text.
  The text already on screen, sent again, moves nothing and counts nothing
  in My kanji: a host resends after it sees the frame load, and WebKit fires
  the frame's `load` for a change of hash, which following the My kanji link
  is.
- `lang` is `en` or `es` and only sets the interface language.
- **Text never travels in the frame URL.** It arrives by message. A frame URL
  ends up in history, logs and referrers; a learner's pasted text must not.

## Host to Yomu

Every message is `{ v: 1, type, ...fields }`.

| type | fields | meaning |
|---|---|---|
| `yomu:hello` | none | the host is listening; post it on the iframe's `load`, because Yomu can be ready before the host's listener is attached |
| `yomu:load` | `text` (string, at most 2,000 characters), `lang` optional | read this text; replaces whatever is shown, on the reader whatever route the frame was on (the text already shown, sent again, stays where it is) |
| `yomu:lang` | `lang` | switch the interface language |

## Yomu to host

| type | fields | meaning |
|---|---|---|
| `yomu:ready` | `version` | posted once on boot and again in reply to every `yomu:hello` |
| `yomu:height` | `height` (CSS px) | the document height, so the host can size the frame; throttled to one per animation frame |
| `yomu:read` | `tokens`, `unknown` | a `yomu:load` finished: how many tokens, how many had no dictionary support |
| `yomu:error` | `message` | a `yomu:load` could not be read (data failed to load, text too long) |
| `yomu:escape` | none | Escape was pressed inside the frame (not in a dialog of Yomu's own, not mid-composition, not in a review, which Escape leaves first); a host that shows Yomu in a closable sheet closes it, since a key pressed in the frame never reaches the host's document |

## Origins

Yomu accepts messages only from:

- `https://runcible.neorgon.com`
- `http://localhost:8878` and `http://127.0.0.1:8878` (Runcible's dev server)

It checks `event.origin` and `event.source === window.parent` before anything
else, and posts only to the origin of the last accepted `yomu:hello`. A new host
is added to the list in `js/embed.js`, and here, in the same commit.

## Opening Yomu on its own with text

`https://yomu.neorgon.com/#t=<encodeURIComponent(text)>` reads the text once
and then removes the fragment with `history.replaceState`. A host builds this
only for text it authored itself (a chapter's phrase), never for text a learner
typed. Yomu never writes pasted text into its own URL.
