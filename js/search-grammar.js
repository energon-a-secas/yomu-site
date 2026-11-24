// The grammar a romaji sentence's reading is held to before Search offers
// it (js/search-romaji.js asks): a said e before a verb of going or coming is
// へ, a form that ends a clause is no word before a case particle, and a
// reading is offered only where it is one to trust (trusted), since a wrong
// sentence teaches wrong Japanese and Read the sentence sends it to the
// reader. No DOM. docs/ANALYZER.md, "Only a sentence to trust".

import { isKatakana, toHira } from './kana.js';
import { HONORIFICS } from './search-names.js';

/**
 * The worst band a word may have in an offered reading with no predicate
 * (bands run 1 to 5 from Tatoeba, 6 unranked): a word and its particle stand
 * on the word alone, so a rarer one is no reading (紺に, while konnichiwa was
 * typed), while a verb, an adjective or the copula holds a sentence together
 * (anokokosuiteimasuka: 空く is band 4).
 */
export const SENTENCE_BAND = 3;

/**
 * Verbs of going and coming, each spelling with the readings that are that
 * verb: a said e before one is へ (tokyoeikimasu is 東京へ行きます, not
 * 問う虚栄来ます). The reading counts: 入る read いる is no verb of going
 * (okane irimasu is お金いります, never 悪寒へ入ります).
 */
export const MOTION = Object.freeze(new Map(Object.entries({
  行く: ['いく', 'ゆく'],
  来る: ['くる'],
  帰る: ['かえる'],
  戻る: ['もどる'],
  向かう: ['むかう'],
  出かける: ['でかける'],
  出掛ける: ['でかける'],
  通う: ['かよう'],
  引っ越す: ['ひっこす'],
  着く: ['つく'],
  入る: ['はいる'],
  進む: ['すすむ'],
  移る: ['うつる'],
  急ぐ: ['いそぐ'],
  渡る: ['わたる'],
  登る: ['のぼる'],
  上る: ['のぼる'],
  下る: ['くだる'],
  走る: ['はしる'],
  歩く: ['あるく'],
  飛ぶ: ['とぶ'],
  逃げる: ['にげる'],
  届く: ['とどく'],
  送る: ['おくる'],
  出る: ['でる'],
  寄る: ['よる'],
  上がる: ['あがる'],
  降りる: ['おりる'],
  参る: ['まいる'],
  伺う: ['うかがう'],
  いらっしゃる: ['いらっしゃる'],
}).map(([k, r]) => [k, Object.freeze(r)])));

/** Forms that end a clause: a case particle straight after one reads wrong (ashita ame ga is 雨, not 編め). */
const UNFINISHED = new Set(['imperative', 'volitional', 'masu-volitional']);
/** The case particles (and は, も): what a noun takes, and what an imperative before one shows was a noun. */
const CASE = new Set(['が', 'を', 'に', 'で', 'へ', 'は', 'も', 'の', 'から', 'まで', 'より']);
/**
 * The particles a verb in its dictionary form does not take straight after
 * it (行くのは, never 行くは). Not が, which after a verb is "but" (お金はあるが
 * 時間がない).
 */
const NOUN_CASE = new Set(['は', 'を', 'も', 'で']);
/**
 * A particle a verb may have swallowed, as written or as said (お for を,
 * わ for は): どこ出会います is どこで会います, 上着起きている 上着を着ている,
 * 洗濯機わかったの 洗濯機は買ったの.
 */
const EATEN = new Set(['が', 'を', 'お', 'に', 'で', 'へ', 'は', 'わ', 'も', 'の']);
/** Particles that end a sentence: a word and one of these alone, typed together, is more often a word the dictionary lacks (棚か for tanaka). */
const FINAL = new Set(['か', 'ね', 'よ', 'な', 'ぞ', 'さ', 'わ']);
/** A part of speech that makes a predicate: a verb, an adjective, a na-adjective (suki) or a set expression (お願いします). */
const PREDICATE = /^(?:v[15].*|vk|vs-[is]|vz|adj-i|adj-ix|adj-na|exp)$/;
/** The e row: an e after one of these may be a long vowel said ee (せんせえ for せんせい). */
const E_ROW = new Set([...'えけげせぜてでねへべぺめれ']);

/** Whether a token is a particle or the copula: what may stand either side of a rarer word. */
export const isGrammar = (t) => !t || t.kind === 'particle' || t.kind === 'copula';
/** Whether a token is a verb, an adjective, the copula or a set expression (お願いします). */
export const isPredicate = (t) => t.kind === 'copula' || t.kind === 'inflected'
  || String((t.entry && t.entry.p) || '').split(/\s+/).some((p) => PREDICATE.test(p));
/** Whether a token is written in katakana: a loanword the romaji may be, read from an edit (ペン). */
export const isKatakanaWord = (t) => [...t.surface].every(isKatakana);
/** Whether a token is a noun or a prefix that a word straight after it would be glued to. */
export const isNoun = (t) => ['word', 'katakana'].includes(t.kind) && /^(?:n|pref)\b/.test((t.entry && t.entry.p) || '');
/** A token's parts of speech, as its record lists them. */
export const posOf = (t) => String((t.entry && t.entry.p) || '').split(/\s+/);
/** A number, as the analyzer's number token or a word whose first part of speech is num (千, 十). */
export const isNumber = (t) => t.kind === 'number' || posOf(t)[0] === 'num';
/** A pronoun (どこ, これ). */
export const isPronoun = (t) => t.kind === 'word' && posOf(t).includes('pn');
/** A noun that is no adverb too: 明日 and 今日 stand straight before a verb (ashita ikimasu). */
export const isPlainNoun = (t) => isNoun(t) && !posOf(t).some((p) => ['adv', 'n-adv', 'n-t', 'adv-to'].includes(p));
/** A verb other than する, which a noun takes straight before it (勉強します). */
export const isVerb = (t) => ['word', 'inflected'].includes(t.kind) && posOf(t).some((p) => /^(?:v[15]|vk|vz)/.test(p));
/** する or できる, which a noun of the vs kind takes straight before it (勉強します, 運転できます). */
const isSuru = (t) => ['する', 'できる'].includes(t.base) || posOf(t).includes('vs-i');
/**
 * A quantity: a number, or a word written with one (二人, 一杯, 一口), which
 * stands straight before a verb (姪が二人いる) and after a loanword (コーヒー一杯).
 */
export const isQuantity = (t) => isNumber(t)
  || /^[一二三四五六七八九十百千万何数０-９0-9]/.test(String((t.entry && Array.isArray(t.entry.k) && t.entry.k[0]) || t.base || t.surface));
/** An inflected form that ends no clause it could stand in the middle of: an imperative, a volitional or a bare stem (取れ, while tomodachitoresutoran was typed). */
const unfinishedForm = (t) => t.kind === 'inflected' && t.chain && t.chain.length
  && (UNFINISHED.has(t.chain[0].rule) || (t.chain.length === 1 && t.chain[0].rule === 'stem'));

/**
 * Whether a one-kana noun sits straight after a noun or a prefix, with no
 * particle between: what the lattice makes of letters that are no
 * sentence (reunite is 霊|う|にて, kohi wo 小|火|を). After この, an
 * adjective or a verb it is a word (この日, 赤い火).
 */
export function stray(tokens) {
  return tokens.some((t, i) => {
    if (!i || t.surface.length !== 1 || !t.entry || !['word', 'katakana'].includes(t.kind)) return false;
    const before = tokens[i - 1];
    return ['word', 'katakana'].includes(before.kind) && /^(?:n|pref)\b/.test((before.entry && before.entry.p) || '');
  });
}

/**
 * The rules that read the dictionary, over search-romaji.js's lookups:
 * `firstTier(kana)`, `sentenceKey(token)`, `needBands(results)` and
 * `usualBand(result)`.
 */
export function createGrammar({
  firstTier, sentenceKey, needBands, usualBand,
}) {
  /**
   * The parts of a reading with each said e before a verb of going or coming
   * (MOTION) made a particle typed on its own, as if typed tokyo e ikimasu:
   * tokyoeikimasu read whole was 問う虚栄来ます. The e follows at least two
   * kana, and what comes after it, read by the analyzer, opens with an
   * inflected form of such a verb (行きます, 来ました, 帰る; never a bare stem,
   * and never a word: tokyoekimade is 東京駅まで). A word that ends in ん
   * runs into the e as ね (nihoneikimasu is にほねいきます): a ね before such a
   * verb is ん and the particle where what comes before, with ん, is a word.
   * Never where the kana is the word's own (ownKana: 駅前, お金, 跳ね, いいね,
   * 先生 said sensee).
   */
  async function motionParticles(parts, firstToken) {
    const out = [];
    for (let j = 0; j < parts.length; j += 1) {
      let p = parts[j];
      if (p.particle) { out.push(p); continue; }
      for (let at = 1; at < p.kana.length; at += 1) {
        const ch = p.kana[at];
        if (!((ch === 'え' && at >= 2) || ch === 'ね')) continue;
        const before = ch === 'ね' ? `${p.kana.slice(0, at)}ん` : p.kana.slice(0, at);
        // What follows, up to the next particle typed on its own.
        let rest = p.kana.slice(at + 1);
        for (let k = j + 1; k < parts.length && !parts[k].particle; k += 1) rest += parts[k].kana;
        if (!rest || !await opensWithMotion(rest, firstToken)) continue;
        if (await ownKana(p.kana.slice(0, at), ch)) continue;
        if (ch === 'ね' && !(await firstTier(before)).some((r) => r.via === 'exact')) continue;
        out.push({ kana: before, particle: false }, { kana: 'え', particle: true });
        p = { kana: p.kana.slice(at + 1), particle: false };
        at = 0;
      }
      if (p.kana) out.push(p);
    }
    return out;
  }

  /**
   * Whether `kana` is a verb form on its own: a form of a first-tier verb,
   * or, where deinflect.js finds none (とられた), one inflected token the
   * analyzer reads it as.
   */
  async function verbAlone(kana, analyzeText) {
    if (!kana) return false;
    if ((await firstTier(kana)).some((r) => r.via === 'form')) return true;
    if (!analyzeText) return false;
    const read = (await analyzeText(kana)).tokens;
    return read.length === 1 && read[0].kind === 'inflected' && isVerb(read[0]) && read[0].confidence !== 'guess';
  }

  /**
   * Whether a said e or a ね after `stretch` belongs to the word before it,
   * so it is no particle: the stretch with it is a word (えきまえ, おかね,
   * はね, いいね), a ね follows a verb, an adjective or a form of one
   * (すごいね, たべたね), or an e after the e row is a long vowel said ee
   * (せんせえ is せんせい).
   */
  async function ownKana(stretch, ch) {
    if ((await firstTier(stretch + ch)).some((r) => r.via === 'exact')) return true;
    if (ch === 'ね') {
      return (await firstTier(stretch)).some((r) => r.via === 'form'
        || (r.via === 'exact' && r.recs.some((rec) => String(rec.p || '').split(/\s+/).some((x) => PREDICATE.test(x)))));
    }
    return E_ROW.has(stretch.at(-1)) && (await firstTier(`${stretch}い`)).some((r) => r.via === 'exact');
  }

  /**
   * Whether a key's records hold a verb of going or coming, read as that
   * verb: 行く (read いく where a reading is given), or いく for 行く; not
   * いる for 入る.
   */
  const isMotion = (key, recs) => recs.some((r) => {
    if (MOTION.has(key)) return !Array.isArray(r.r) || !r.r.length || r.r.some((x) => MOTION.get(key).includes(toHira(x)));
    return (r.k || []).some((k) => MOTION.has(k) && MOTION.get(k).includes(toHira(key)));
  });

  /**
   * The verb of going or coming an inflected token is, as read or as its
   * kana also reads (いった is 要った to the analyzer alone, and 行った too):
   * `{ key, rec }`, or null. Never a bare stem (行き alone is a noun too).
   */
  async function motionOf(t) {
    if (!t || t.kind !== 'inflected' || !t.chain || !t.chain.length || (t.chain.length === 1 && t.chain[0].rule === 'stem')) return null;
    if (t.entry && isMotion(t.base, [t.entry])) return { key: t.base, rec: t.entry };
    const res = (await firstTier(t.surface)).find((r) => r.via === 'form' && isMotion(r.key, r.recs));
    return res ? { key: res.key, rec: res.recs.find((r) => isMotion(res.key, [r])) || res.recs[0] } : null;
  }

  /** Whether `text`, read by the analyzer, opens with an inflected form of a verb of going or coming. */
  async function opensWithMotion(text, firstToken) {
    return !!(await motionOf(await firstToken(text)));
  }

  /**
   * After へ, an inflected form a verb of going or coming also explains is
   * that verb: a stretch after a particle typed apart is read alone, and the
   * analyzer alone reads いった as 要った (tokyo e itta is 東京へ行った). Not
   * after に, where it is as often 言った (tomodachi ni itta).
   */
  async function goingAfterParticles(tokens) {
    for (let i = 1; i < tokens.length; i += 1) {
      const before = tokens[i - 1];
      if (before.kind !== 'particle' || before.surface !== 'へ') continue;
      const m = await motionOf(tokens[i]);
      if (m && m.rec !== tokens[i].entry) tokens[i] = { ...tokens[i], entry: m.rec, base: m.key };
    }
  }

  /**
   * A form that ends a clause read straight before a case particle, as the
   * noun the same kana is: あしたあめがふります is 明日|雨|が|降ります, though
   * the analyzer, reading the whole, took 編め (knit), and せんしゅうかれ|は
   * is 先週彼は, not 刈れ. The noun is the analyzer's own reading of the kana
   * with the particle, else of the kana alone (かれは alone is 枯葉). False
   * where no noun or pronoun fits: the reading is then no sentence.
   */
  async function finishClauses(tokens, analyzeText) {
    const isNounWord = (x, surface) => x && x.kind === 'word' && x.surface === surface && x.entry
      && posOf(x).some((p) => p === 'n' || p === 'pn');
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      const t = tokens[i];
      const next = tokens[i + 1];
      if (next.kind !== 'particle') continue;
      // An imperative or a volitional before a case particle; a verb in its
      // dictionary form before one that wants a noun (暮らすは for kurasu wa,
      // 得るで for meeru de: the plain verb takes の first, 暮らすのは).
      const unfinished = t.kind === 'inflected' && t.chain && t.chain.length && UNFINISHED.has(t.chain[0].rule) && CASE.has(next.surface);
      const plain = t.kind === 'word' && isVerb(t) && NOUN_CASE.has(next.surface);
      if (!unfinished && !plain) continue;
      let [noun] = (await analyzeText(t.surface + next.surface)).tokens;
      if (!isNounWord(noun, t.surface)) {
        const alone = (await analyzeText(t.surface)).tokens;
        noun = alone.length === 1 ? alone[0] : null;
      }
      if (!isNounWord(noun, t.surface)) return false;
      tokens[i] = noun;
    }
    return true;
  }

  /**
   * Whether a sentence reading (no guess, a word and some grammar, no stray
   * kana) is one to offer, since a wrong sentence teaches wrong Japanese:
   *
   * - every word is a first-tier word (a rare word or a guess is no reading
   *   to trust), and of band SENTENCE_BAND or better unless the reading has
   *   a predicate (anokokosuiteimasuka, 空いています, is band 4; 紺に, while
   *   konnichiwa was typed, has no predicate to hold its 紺);
   * - the last token is a dictionary word, the copula or a particle (紺ん is
   *   not; 雨でした and 学生じゃない are);
   * - a word and a sentence-final particle typed together are not the whole
   *   reading (棚か for tanaka; 見損なったよ, a verb, is), and no
   *   sentence-final particle comes before the copula (棚かです);
   * - no kana put in after the last letter typed makes a last word of one or
   *   two kana (今日はああ while kyouwaame was typed);
   * - no verb that opens with a particle it swallowed straight after a noun,
   *   a pronoun, a name or its honorific (どこ出会います, 上着起きている,
   *   田中さん似合いました);
   * - a verb straight after a noun with no particle between is one speech
   *   drops を or が before (寿司食べたい, お弁当温めますか): the noun a
   *   common one of two kana or more (one of two among the commonest), the
   *   verb no imperative, volitional or bare stem, and not なる (昨日は友達取れ,
   *   for tomodachito typed on its way to resutoran, is not); する and できる
   *   after a noun of that kind, and any verb after a quantity, stand
   *   (運転できます, 姪が二人いる);
   * - no できる after a verb, two copulas (山だです), を or が after a case
   *   particle (一人でを留守番), て after no verb or adjective (万ての取った),
   *   a counter after no number (間人 for manin) or a lone お or ご after a
   *   word, where it is を said (それお証明);
   * - a katakana word read from an edit stands as a word: no noun, name,
   *   honorific or lone kana just before it (まリア for maria), and after it
   *   only grammar, another loanword, a verb, する, ください or a quantity
   *   (昨日は友達とレス虎, while resutoran was typed, is not; これはペンです,
   *   コピーしてください and テレビ見ます are).
   */
  async function trusted(tokens, { putInLast, analyzeText }) {
    const last = tokens.at(-1);
    if (!last || !(last.rule || last.kind === 'name' || last.kind === 'copula' || (last.entry && last.confidence !== 'guess'))) return false;
    if (tokens.length === 2 && last.kind === 'particle' && !last.rule && FINAL.has(last.surface) && !isPredicate(tokens[0])) return false;
    if (putInLast && last.kind !== 'particle' && last.kind !== 'copula' && [...last.surface].length <= 2) return false;
    const words = tokens.filter((t) => !isGrammar(t) && t.kind !== 'name' && t.kind !== 'number' && t.entry);
    if (words.some((t) => t.entry.tier === 2)) return false;
    if (!tokens.some(isPredicate)) {
      const banded = words.map((t) => ({ key: sentenceKey(t), recs: [t.entry] }));
      await needBands(banded);
      if (banded.some((res) => usualBand(res) > SENTENCE_BAND)) return false;
    }
    for (const [i, t] of tokens.entries()) {
      const before = tokens[i - 1];
      if (!before) continue;
      if (isVerb(t) && (isPlainNoun(before) || isPronoun(before) || before.kind === 'name' || HONORIFICS.includes(before.surface))) {
        // A verb that opens with a particle and is a verb without it ate the
        // particle: どこ出会いますか is どこで会いますか, 改札出会いましょう
        // 改札で会いましょう, 上着起きている 上着を着ている (お is を said),
        // 田中さん似合いました 田中さんに会いました. Not できる, far commoner
        // than で and 来る or 着る (運転できます, 日本語できる).
        if (t.base !== 'できる' && EATEN.has(t.surface[0]) && await verbAlone(t.surface.slice(1), analyzeText)) return false;
        // Speech drops を or が between a noun and a verb (寿司食べたい,
        // テレビ見ます, お弁当温めますか), but not after a word of one kana, a
        // rare one or one of two kana that is not among the commonest, and
        // not before an imperative, a volitional or a bare stem: what a
        // reading makes of a particle it ate (卵や気忘れません, お橋は乙消します,
        // 昨日は友達取れ while tomodachito resutoran was typed).
        // なる takes に (幸せになれない, never 幸せなれない).
        if (isPlainNoun(before) && !isQuantity(before) && !(isSuru(t) && posOf(before).includes('vs'))) {
          const res = { key: sentenceKey(before), recs: [before.entry] };
          await needBands([res]);
          const len = [...before.surface].length;
          if (len < 2 || usualBand(res) > (len === 2 ? SENTENCE_BAND - 1 : SENTENCE_BAND) || unfinishedForm(t) || t.base === 'なる') return false;
        }
      }
      // できる takes a noun, never a verb (乗り吸ってできますか for norisute dekimasu ka).
      if (t.base === 'できる' && (before.kind === 'inflected' || isVerb(before))) return false;
      // Two copulas (山だです for yamada desu), を or が straight after a
      // particle other than の (一人でを留守番, 車をを借り, for o typed apart as
      // the お of お留守番), and て straight after no verb or adjective
      // (万ての取った for manten o totta).
      if (t.kind === 'copula' && before.kind === 'copula') return false;
      if (t.kind === 'particle' && ['を', 'が'].includes(t.surface) && before.kind === 'particle' && before.surface !== 'の'
        && (CASE.has(before.surface) || before.surface === 'と')) return false;
      if (t.kind === 'particle' && t.surface === 'て' && !t.rule && before.kind !== 'inflected' && !isVerb(before)
        && !posOf(before).some((p) => /^adj-i/.test(p))) return false;
      // A counter straight after no number (間人 for manin, 満員), and a lone
      // お or ご straight after a word, where it is を said (それお証明 for
      // sore o shoomee, 書くお提出).
      if (t.kind === 'word' && posOf(t)[0] === 'ctr' && !isQuantity(before)) return false;
      if (['お', 'ご'].includes(t.surface) && posOf(t)[0] === 'pref' && (isNoun(before) || isPronoun(before) || isVerb(before))) return false;
      // A sentence-final particle never comes before the copula (棚かです for tanaka desu).
      if (t.kind === 'copula' && before.kind === 'particle' && FINAL.has(before.surface)) return false;
      // ん is a particle after a verb (登るんです), never after a noun (自家ん for jikan).
      if (t.kind === 'particle' && t.surface === 'ん' && !t.entry && isNoun(before)) return false;
      // A number straight after a verb or the copula is と or a word read as
      // one (だった十もう for datta to omou), and one straight after a noun a
      // word read as a number (南蛮千 for nanbansen, 何番線); ご beside a
      // number is 五 (４０ご分, ご百円).
      if (isNumber(t) && (before.kind === 'copula' || before.kind === 'inflected')) return false;
      if (isNumber(t) && t.kind === 'word' && isPlainNoun(before)) return false;
      if ((t.surface === 'ご' && isNumber(before)) || (before.surface === 'ご' && isNumber(t))) return false;
      // この, その, どの straight after a noun (紺どの for kondo no).
      if (posOf(t).includes('adj-pn') && isPlainNoun(before)) return false;
    }
    for (const [i, t] of tokens.entries()) {
      if (!isKatakanaWord(t)) continue;
      const before = tokens[i - 1];
      const after = tokens[i + 1];
      if (before && isPlainNoun(before) && !isKatakanaWord(before) && !isQuantity(before)) return false;
      // Nor a name, its honorific or a lone kana: what an edit leaves of a
      // name the dictionary lacks (まリア for maria, 田中さんカラメル for
      // tanaka san kara meeru).
      if (before && (before.kind === 'name' || HONORIFICS.includes(before.surface)
        || ([...before.surface].length === 1 && !isGrammar(before) && !isNumber(before)))) return false;
      // A loanword takes grammar, another loanword, a verb, する, ください or
      // a quantity after it (コピーして, テレビ見ます, ビールください,
      // コーヒー一杯), as a noun does; never another noun or an adjective (レス虎).
      if (after && !isGrammar(after) && !isKatakanaWord(after) && !isVerb(after) && !isSuru(after) && !isQuantity(after)
        && after.base !== 'ください') return false;
    }
    return true;
  }

  return Object.freeze({
    motionParticles, goingAfterParticles, finishClauses, trusted,
  });
}
