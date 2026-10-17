# Third common-word band: Clear recordings

Recorded 17 October 2026. Local data ready for bundling; website deployment and
TestFlight upload are separate steps. [Machine-readable evidence](audio-band3.json).

## Results

- **5,013 new clips accepted** from 5,168 planned words.
- **155 rejected** after the existing checks; their fallback remains.
- 13,170 voice clips in total, up from 8,157.
- 24.82 MB of new MP3 content; 67.12 MB total.
- **7,852 account credits used**, including the pilot, retries and
  checking charges. 11,307 credits remain out of 40,000.
  The owner approved a 13,000-credit ceiling for this run.

The old 5,293-word estimate was historical. The current script finds
5,581 eligible dictionary records, 5,241 unique
word keys, and 73 keys already included in earlier script entries.
That leaves 5,168 new words to attempt.

These are word recordings. Other selected voices borrow Clear for these words.
Natural playback of arbitrary unrecorded sentences still uses device speech;
this run does not introduce on-demand synthesis of pasted text.

## Accounting and validation

The account started at 20,841 used credits and finished at
28,693 in the latest balance check. The subscription reset is
2026-11-17. The usage API reports transcription (STT)
charges separately from speech (TTS), confirming why speech response headers
understate account use. Balances can lag requests; the batch runner waits for
settlement and keeps extra headroom. It never purchases additional credits.

All 8,157 previous MP3 files, their records and existing lookup
entries were compared with the starting revision and remain unchanged. Every
new accepted key resolves to its Clear file for all four selected voices;
failed takes have no new index entry. No acceptance rule was relaxed.

The generator now counts UTF-8 bytes when splitting audio indexes, preventing
Japanese keys from exceeding the data-file size cap. Completed workers are
checkpointed after request failures, and interrupted retries remain resumable.
Run the final tests after recording stops, since the generator checkpoints its
index periodically during a batch.

Final automated evidence:

- Shared-site suite: 1,309 passed, 0 failed.
- Data checker: check-data: 708 files, 88033.6 KB, all pass.
- MP3 samples: 26 decoded successfully; 24 kHz mono MP3.

Full results are recorded in the machine-readable report.
**Human listening remains pending.** A matching transcript does not verify pitch
accent or naturalness. Rejected takes remain in the ignored
`.forge/audio-rejects/` directory for a separate review.

## Listening samples

Open the MP3 links below. Compare the intended reading, long vowels, small っ,
and combined sounds; also listen in the next native build with Slow and Stop.
The sample includes short words, katakana, combined sounds and accepted retries.

| Word | Intended reading | Dictionary meaning | Takes | Audio |
|---|---|---|---|---|
| 生まれる | うまれる | to be born | 1 | [Play](../data/audio/clear/14xubkxvziv.mp3) |
| てつ | てつ | iron (Fe) | 2 | [Play](../data/audio/clear/gsy8olkpc6.mp3) |
| アメリカン | あめりかん | American | 2 | [Play](../data/audio/clear/239qpw2x7bj.mp3) |
| 停止 | ていし | stoppage | 2 | [Play](../data/audio/clear/f3bis8w5xr.mp3) |
| 弾丸 | だんがん | bullet | 2 | [Play](../data/audio/clear/14zvnte2him.mp3) |
| 笑み | えみ | smile | 3 | [Play](../data/audio/clear/iswuhwh6at.mp3) |
| あう | あう | to meet | 1 | [Play](../data/audio/clear/tyvox1jseb.mp3) |
| こす | こす | to cross over (e.g. mountain) | 1 | [Play](../data/audio/clear/23lntkp9sv5.mp3) |
| イブ | いぶ | eve (esp. Christmas Eve) | 1 | [Play](../data/audio/clear/1kzrlxe3gu.mp3) |
| 居る | おる | to be (animate) | 1 | [Play](../data/audio/clear/1tcvihasyq3.mp3) |
| ニュー | にゅー | new | 1 | [Play](../data/audio/clear/1pe4fakugla.mp3) |
| 予想以上 | よそういじょう | more than expected | 1 | [Play](../data/audio/clear/u7bsgde850.mp3) |
| 契約書 | けいやくしょ | (written) contract | 1 | [Play](../data/audio/clear/xnpm6hdavf.mp3) |
| 校長 | こうちょう | principal | 1 | [Play](../data/audio/clear/115urpjix0r.mp3) |
| 苗字 | みょうじ | surname | 1 | [Play](../data/audio/clear/1ab5wirz4ib.mp3) |
| アド | あど | ad | 1 | [Play](../data/audio/clear/1jpmtht78ja.mp3) |
| キャラクター | きゃらくたー | character | 1 | [Play](../data/audio/clear/212247knd9u.mp3) |
| ステージ | すてーじ | stage (platform) | 1 | [Play](../data/audio/clear/rsm3f7qmmg.mp3) |
| バッテリー | ばってりー | battery | 2 | [Play](../data/audio/clear/h6l8vjhws6.mp3) |
| ポリ | ぽり | poly- | 1 | [Play](../data/audio/clear/25dlzhrp8rw.mp3) |
| 下さる | くださる | to give | 1 | [Play](../data/audio/clear/21yrpuagc0v.mp3) |
| 入り口 | いりぐち | entrance | 1 | [Play](../data/audio/clear/1jtrka1iceq.mp3) |
| 学習者 | がくしゅうしゃ | learner | 1 | [Play](../data/audio/clear/1vyw40gb5r0.mp3) |
| 旅行者 | りょこうしゃ | traveller | 1 | [Play](../data/audio/clear/upx2m3ofak.mp3) |
| 男たち | おとこたち | men | 1 | [Play](../data/audio/clear/1xrcj93ry39.mp3) |
| 記念碑 | きねんひ | commemorative plaque (usu. on a stone) | 1 | [Play](../data/audio/clear/11fkz0wfkwo.mp3) |
