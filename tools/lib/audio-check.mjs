// Does a clip say what Yomu shows? The clip is transcribed (ElevenLabs
// Scribe) and the transcript read by Yomu's own analyzer, so a transcript in
// kanji, kana or a mix compares on how it is said: 切手 and きって are both
// kitte, and おばさん for おばあさん is obasan, not obaasan, which fails.
//
// A sentence or word compares on the said romaji, with spaces and
// punctuation folded away and the apostrophe kept, since kin'en (禁煙) and
// kinen (記念) differ only there. A lone beat compares on its kana: the
// analyzer would read a lone は as the particle wa.
//
// A lone beat is transcribed from its clip played three times (triple() in
// audio-finish.mjs), and passes when the transcript is that beat, held
// longer or not. Measured on 2026-10-16: said once, ア came back ああ, コ こう,
// ス そう and イ いいえ, a transcriber guessing a word from half a second of
// sound; played three times the same takes came back あ、あ、あ, こう、こう、こう
// and すーすーすー. A held vowel is how a mora said alone sounds, so it passes;
// another consonant or vowel (エ heard で, a voiced onset) still fails. A
// transcript in Latin letters is the transcriber hearing English (の came
// back "No。No。No。"), so it is read as romaji. ん alone is the one beat a
// transcript cannot show: six spellings of it (ン, ん, んー, ン。, 「ん」, ンン)
// all came back うん, the only way to write a hum, so うん passes for ん and
// its clips are listed for a person to hear (docs/AUDIO.md). A beat heard as
// one kanji (じ as 字, き as 木) passes when that kanji has the beat among its
// readings: the analyzer reads a lone 字 as あざ, which is no fault of the clip.

import { analyze } from '../../js/analyze.js';
import { toHira, isAllKana, beats, vowelOf } from '../../js/kana.js';
import { audioKey } from '../../js/audio.js';
import { toHiragana, isRomaji } from '../../js/vendor/wanakana.js';

const LAYOUT = new Set(['punct', 'space', 'newline']);

const spoken = (analysis) => ((analysis && analysis.tokens) || []).filter((t) => !LAYOUT.has(t.kind));

/** The said romaji of an analysis, word by word. */
export function saidOf(analysis) {
  return spoken(analysis).map((t) => (t.romaji && t.romaji.said) || '').join(' ').trim();
}

/** The reading of an analysis in hiragana, as one string. */
export function readingOf(analysis) {
  return toHira(spoken(analysis).map((t) => t.reading || t.surface || '').join(''));
}

// The kana that hold a beat's vowel longer: こう and こお are both a held こ.
const HELD = Object.freeze({ a: 'あ', i: 'い', u: 'う', e: 'えい', o: 'おう' });

/** Kana with every held vowel, ー and っ taken out: こうこうこう is こここ. */
export function unheld(hira) {
  const out = [];
  for (const b of beats(hira)) {
    if (b === 'ー' || b === 'っ') continue;
    const v = out.length ? vowelOf(out[out.length - 1]) : null;
    if (v && HELD[v].includes(b)) continue;
    out.push(b);
  }
  return out.join('');
}

// The long-vowel bar as the kana that spells the same sound: ちゅー is ちゅう,
// せー is せい, らー is らあ. A transcript writes チュー for ちゅう.
const BAR_AS = Object.freeze({ a: 'あ', i: 'い', u: 'う', e: 'い', o: 'う' });

/** Kana with each bar written as its vowel, so ちゅー and ちゅう compare equal. */
export function barless(hira) {
  const out = [];
  for (const b of beats(hira)) {
    const v = b === 'ー' && out.length ? vowelOf(out[out.length - 1]) : null;
    out.push(v ? BAR_AS[v] : b);
  }
  return out.join('');
}

/** Said romaji folded for comparison: letters and the apostrophe only. */
export function foldSaid(s) {
  return String(s || '').toLowerCase().replace(/[^a-z']/g, '');
}

export function makeCheck(dict) {
  const read = (text) => analyze(text, { dict });

  /**
   * What a line must sound like: { said, reading, times } or, for a lone
   * beat, { kana }. A word of two beats or fewer (おば, さん) is heard from
   * its clip played three times, as a beat is, so it must come back three
   * times over or once.
   */
  async function expected(line) {
    if (line.kind === 'kana') return { kana: line.kana };
    const kanaOnly = line.kana || (/\p{Script=Han}/u.test(line.ja) ? '' : line.ja);
    // A word is said as its own reading: 中 read ちゅう is chuu, though the
    // analyzer reads a bare 中 as naka (a right clip failed that way).
    const isWord = (line.kind === 'word' || line.kind === 'common') && line.kana;
    const analysis = await read(isWord ? line.kana : line.ja);
    return {
      said: line.said || saidOf(analysis),
      reading: kanaOnly ? toHira(audioKey(kanaOnly)) : readingOf(analysis),
      times: line.triple ? 3 : 1,
    };
  }

  /**
   * Can the transcript be read as `reading`, word by word, taking any
   * reading the dictionary gives a word? The transcriber chooses the kanji:
   * it wrote まち (town) as 街, which the analyzer reads gai, and a right clip
   * failed. A word sent in kanji has one reading in its own entry
   * (build-audio.mjs sendText), so no wrong reading can pass this way.
   */
  async function couldRead(text, wanted) {
    const reading = barless(wanted);
    let at = new Set([0]);
    for (const t of spoken(await read(text))) {
      const options = new Set([barless(toHira(t.reading || t.surface))]);
      if (!(t.chain && t.chain.length)) {
        for (const rec of dict.get(t.surface) || []) for (const r of rec.r || [t.surface]) options.add(barless(toHira(r)));
      }
      const next = new Set();
      for (const p of at) for (const o of options) if (o && reading.startsWith(o, p)) next.add(p + o.length);
      if (!next.size) return false;
      at = next;
    }
    return at.has(reading.length);
  }

  /** { ok, got } for a transcript against what was expected. */
  async function verdict(want, transcript) {
    const text = String(transcript || '').trim();
    if (!text) return { ok: false, got: '' };
    if (want.kana) {
      const folded = audioKey(isRomaji(audioKey(text)) ? toHiragana(audioKey(text).toLowerCase()) : text);
      const got = unheld(isAllKana(folded) ? toHira(folded) : readingOf(await read(text)));
      const heard = want.kana === 'ん' ? [got, got.replaceAll('うん', 'ん')] : [got];
      if (heard.some((g) => g === want.kana.repeat(3) || g === want.kana)) return { ok: true, got };
      const kanji = [...new Set([...folded].filter((ch) => /\p{Script=Han}/u.test(ch)))];
      if (kanji.length === 1 && folded.replaceAll(kanji[0], '') === '') {
        const info = ((await read(kanji[0])).kanji || [])[0];
        const readings = info && info.info ? [...(info.info.on || []), ...(info.info.kun || [])] : [];
        if (readings.some((r) => toHira(String(r).replace(/[.-].*$/, '')) === want.kana)) return { ok: true, got: `${kanji[0]} ${want.kana}` };
      }
      return { ok: false, got };
    }
    const got = saidOf(await read(text));
    const said = foldSaid(want.said);
    const g = foldSaid(got);
    if (g === said || (want.times === 3 && g === said.repeat(3))) return { ok: true, got };
    const readings = want.reading ? [want.reading, ...(want.times === 3 ? [want.reading.repeat(3)] : [])] : [];
    for (const r of readings) if (await couldRead(text, r)) return { ok: true, got: `${got} (read as ${want.reading})` };
    return { ok: false, got };
  }

  return { expected, verdict };
}
