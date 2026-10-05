// Twins across scripts, for Play: eleven shapes written almost the same in
// two scripts, each side with a few words a beginner meets. No DOM.
//
// The point is reading by context: カ in カメラ is katakana, 力 in 体力 is a
// kanji, and only the word around them says so. Every word, reading and
// meaning here was written for Yomu and is public domain (CC0). A word is
// [written, reading in kana, { en, es }]; the twin is marked wherever it
// occurs in the written word (トマト has two). tests/play.test.mjs holds each
// side to its script and every word to holding its twin.
//
// 卜 has no word a beginner meets: it is a rare kanji (divination, ぼく),
// seen far more often as a part of 外, 占 and 下 than alone. Its two words
// are the real ones, and its line says so.

const t = (en, es) => Object.freeze({ en, es });

/** The three answers, in the order of the keys 1, 2 and 3. */
export const SCRIPTS = Object.freeze(['hiragana', 'katakana', 'kanji']);

export const TWINS = Object.freeze([
  {
    id: 'he',
    sides: [
      { ch: 'へ', script: 'hiragana', words: [['へび', 'へび', t('snake', 'serpiente')], ['へた', 'へた', t('bad at', 'torpe, malo para algo')], ['うちへ', 'うちへ', t('to home (へ, the particle, said e)', 'a casa (へ, la partícula, se dice e)')]] },
      { ch: 'ヘ', script: 'katakana', words: [['ヘルメット', 'へるめっと', t('helmet', 'casco')], ['ヘリコプター', 'へりこぷたー', t('helicopter', 'helicóptero')]] },
    ],
    note: t('へ and ヘ look the same in most fonts, ヘ a little more angular: the word around them tells you which.', 'へ y ヘ se ven iguales en casi todas las fuentes, ヘ un poco más angulosa: la palabra que las rodea dice cuál es.'),
  },
  {
    id: 'ka',
    sides: [
      { ch: 'カ', script: 'katakana', words: [['カメラ', 'かめら', t('camera', 'cámara')], ['カレー', 'かれー', t('curry', 'curry')], ['カード', 'かーど', t('card', 'tarjeta')]] },
      { ch: '力', script: 'kanji', words: [['力', 'ちから', t('strength', 'fuerza')], ['体力', 'たいりょく', t('stamina', 'resistencia física')], ['協力', 'きょうりょく', t('cooperation', 'cooperación')]] },
    ],
    note: t('力 (strength) is a kanji and fills its square; カ sits a little smaller, among other katakana.', '力 (fuerza) es un kanji y llena su cuadro; カ es un poco más pequeña y va entre otros katakana.'),
  },
  {
    id: 'e',
    sides: [
      { ch: 'エ', script: 'katakana', words: [['エアコン', 'えあこん', t('air conditioner', 'aire acondicionado')], ['エレベーター', 'えれべーたー', t('elevator', 'ascensor')], ['エンジン', 'えんじん', t('engine', 'motor')]] },
      { ch: '工', script: 'kanji', words: [['工場', 'こうじょう', t('factory', 'fábrica')], ['大工', 'だいく', t('carpenter', 'carpintero')], ['工事', 'こうじ', t('construction work', 'obras de construcción')]] },
    ],
    note: t('工 (craft) usually stands beside another kanji; エ beside other katakana.', '工 (oficio) suele ir junto a otro kanji; エ, junto a otros katakana.'),
  },
  {
    id: 'ro',
    sides: [
      { ch: 'ロ', script: 'katakana', words: [['ロボット', 'ろぼっと', t('robot', 'robot')], ['メロン', 'めろん', t('melon', 'melón')], ['ローマ', 'ろーま', t('Rome', 'Roma')]] },
      { ch: '口', script: 'kanji', words: [['口', 'くち', t('mouth', 'boca')], ['入口', 'いりぐち', t('entrance', 'entrada')], ['出口', 'でぐち', t('exit', 'salida')]] },
    ],
    note: t('口 (mouth) is a kanji and fills its square; ロ sits a little smaller, among other katakana.', '口 (boca) es un kanji y llena su cuadro; ロ es un poco más pequeña y va entre otros katakana.'),
  },
  {
    id: 'ni',
    sides: [
      { ch: 'ニ', script: 'katakana', words: [['テニス', 'てにす', t('tennis', 'tenis')], ['ニュース', 'にゅーす', t('news', 'noticias')], ['ミニ', 'みに', t('mini', 'mini')]] },
      { ch: '二', script: 'kanji', words: [['二', 'に', t('two', 'dos')], ['二月', 'にがつ', t('February', 'febrero')], ['二人', 'ふたり', t('two people', 'dos personas')]] },
    ],
    note: t('In 二 (two) the lower bar is clearly longer; in ニ the two are nearly even.', 'En 二 (dos) la barra de abajo es claramente más larga; en ニ las dos son casi iguales.'),
  },
  {
    id: 'ta',
    sides: [
      { ch: 'タ', script: 'katakana', words: [['タクシー', 'たくしー', t('taxi', 'taxi')], ['タオル', 'たおる', t('towel', 'toalla')], ['バター', 'ばたー', t('butter', 'mantequilla')]] },
      { ch: '夕', script: 'kanji', words: [['夕方', 'ゆうがた', t('evening', 'atardecer')], ['夕食', 'ゆうしょく', t('dinner', 'cena')], ['七夕', 'たなばた', t('the Star Festival', 'el Festival de las Estrellas')]] },
    ],
    note: t('In 夕 (evening) the inside stroke is a short dot; in タ it reaches across.', 'En 夕 (atardecer) el trazo de adentro es un punto corto; en タ llega de lado a lado.'),
  },
  {
    id: 'to',
    sides: [
      { ch: 'ト', script: 'katakana', words: [['トマト', 'とまと', t('tomato', 'tomate')], ['トイレ', 'といれ', t('toilet', 'baño')], ['テスト', 'てすと', t('test', 'examen')]] },
      { ch: '卜', script: 'kanji', words: [['卜', 'ぼく', t('divination', 'adivinación')], ['卜占', 'ぼくせん', t('fortune-telling', 'adivinación')]] },
    ],
    note: t('卜 (divination) is a rare kanji, met far more often as a part of 外, 占 and 下; in a katakana word it is ト.', '卜 (adivinación) es un kanji poco común, que se ve mucho más como parte de 外, 占 y 下; en una palabra en katakana es ト.'),
  },
  {
    id: 'ha',
    sides: [
      { ch: 'ハ', script: 'katakana', words: [['ハム', 'はむ', t('ham', 'jamón')], ['ハンカチ', 'はんかち', t('handkerchief', 'pañuelo')], ['ハンバーガー', 'はんばーがー', t('hamburger', 'hamburguesa')]] },
      { ch: '八', script: 'kanji', words: [['八', 'はち', t('eight', 'ocho')], ['八月', 'はちがつ', t('August', 'agosto')], ['八百屋', 'やおや', t('greengrocer', 'verdulería')]] },
    ],
    note: t('八 (eight) is a kanji and fills its square, its strokes spread wide; ハ sits a little smaller.', '八 (ocho) es un kanji y llena su cuadro, con los trazos bien abiertos; ハ es un poco más pequeña.'),
  },
  {
    id: 'o',
    sides: [
      { ch: 'オ', script: 'katakana', words: [['オレンジ', 'おれんじ', t('orange', 'naranja')], ['ラジオ', 'らじお', t('radio', 'radio')], ['オートバイ', 'おーとばい', t('motorcycle', 'motocicleta')]] },
      { ch: '才', script: 'kanji', words: [['天才', 'てんさい', t('genius', 'genio')], ['才能', 'さいのう', t('talent', 'talento')], ['五才', 'ごさい', t('five years old (an informal spelling of 五歳)', 'cinco años de edad (una forma informal de 五歳)')]] },
    ],
    note: t('In オ the slanted stroke starts at the crossing; in 才 (talent) it cuts across the upright.', 'En オ el trazo inclinado empieza en el cruce; en 才 (talento) atraviesa el trazo vertical.'),
  },
  {
    id: 'ri',
    sides: [
      { ch: 'り', script: 'hiragana', words: [['りんご', 'りんご', t('apple', 'manzana')], ['とり', 'とり', t('bird', 'pájaro')], ['ありがとう', 'ありがとう', t('thank you', 'gracias')]] },
      { ch: 'リ', script: 'katakana', words: [['リボン', 'りぼん', t('ribbon', 'cinta')], ['クリスマス', 'くりすます', t('Christmas', 'Navidad')], ['リモコン', 'りもこん', t('remote control', 'control remoto')]] },
    ],
    note: t('In り the left stroke turns up toward the right one; the two strokes of リ are straighter.', 'En り el trazo izquierdo sube hacia el derecho; los dos trazos de リ son más rectos.'),
  },
  {
    id: 'bar',
    sides: [
      { ch: 'ー', script: 'katakana', words: [['コーヒー', 'こーひー', t('coffee', 'café')], ['ケーキ', 'けーき', t('cake', 'pastel')], ['スーパー', 'すーぱー', t('supermarket', 'supermercado')]] },
      { ch: '一', script: 'kanji', words: [['一', 'いち', t('one', 'uno')], ['一月', 'いちがつ', t('January', 'enero')], ['一人', 'ひとり', t('one person, alone', 'una persona, solo')]] },
    ],
    note: t('ー is katakana\'s long-vowel bar: it lengthens the vowel before it. 一 (one) is a kanji.', 'ー es la barra de vocal larga del katakana: alarga la vocal anterior. 一 (uno) es un kanji.'),
  },
].map((pair) => Object.freeze({
  ...pair,
  sides: Object.freeze(pair.sides.map((s) => Object.freeze({ ...s, words: Object.freeze(s.words.map((w) => Object.freeze(w))) }))),
})));

/** The id of the pair a character belongs to, or null. */
export function twinOf(ch, pairs = TWINS) {
  const p = pairs.find((x) => x.sides.some((s) => s.ch === ch));
  return p ? p.id : null;
}
