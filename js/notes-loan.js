// What the learner is told about each loanword rule. Data only; notes.js
// resolves a language and is the module the page imports.
//
// The same discipline as notes-sounds.js: one rule sentence, two or three
// everyday words that show it, and a minimal pair where one exists, in which
// this rule is the only difference. The examples are loanwords a beginner
// meets, and every word and sentence here was written for Yomu.
//
// `said` and `spelled` are the two romaji lines exactly as kana.js writes them,
// and every example is read through analyze() to check it shows the rule it is
// the example of (tests/loanwords.test.mjs). An example's gloss names the
// English word first, because the English is what the rule is about.

export const LOAN_NOTES = Object.freeze({
  'loan-vowel': {
    title: { en: 'A vowel added after a final consonant', es: 'Una vocal añadida después de una consonante final' },
    rule: {
      en: 'A Japanese beat ends in a vowel or ん, so an English word that ends in a consonant gets a vowel after it: u after most consonants, o after t and d.',
      es: 'Un tiempo del japonés termina en vocal o en ん, así que una palabra inglesa que termina en consonante recibe una vocal después: u tras casi todas las consonantes, o tras t y d.',
    },
    examples: [
      { ja: 'ショップ', said: 'shoppu', spelled: 'sho-p-pu', gloss: { en: 'shop', es: 'shop, tienda' } },
      { ja: 'ゲーム', said: 'geemu', spelled: 'ge-e-mu', gloss: { en: 'game', es: 'game, juego' } },
      { ja: 'ベッド', said: 'beddo', spelled: 'be-d-do', gloss: { en: 'bed', es: 'bed, cama' } },
    ],
    exception: {
      en: 'After a ch or j sound the added vowel is i: スイッチ (switch), ブリッジ (bridge). A final n needs none: ペン (pen).',
      es: 'Después de un sonido ch o j la vocal añadida es i: スイッチ (switch, interruptor), ブリッジ (bridge, puente). Una n final no necesita ninguna: ペン (pen, bolígrafo).',
    },
  },

  'loan-double': {
    title: { en: 'A small ッ after a short vowel', es: 'Una ッ pequeña después de una vocal corta' },
    rule: {
      en: 'When a short English vowel comes right before a final consonant, katakana often holds that consonant with a small ッ, which is why shop is ショップ and not ショプ.',
      es: 'Cuando una vocal corta del inglés va justo antes de una consonante final, el katakana suele sostener esa consonante con una ッ pequeña: por eso shop es ショップ y no ショプ.',
    },
    examples: [
      { ja: 'カップ', said: 'kappu', spelled: 'ka-p-pu', gloss: { en: 'cup', es: 'cup, taza' } },
      { ja: 'バッグ', said: 'baggu', spelled: 'ba-g-gu', gloss: { en: 'bag', es: 'bag, bolso' } },
      { ja: 'ベッド', said: 'beddo', spelled: 'be-d-do', gloss: { en: 'bed', es: 'bed, cama' } },
    ],
    pair: {
      with: { ja: 'バッグ', said: 'baggu', gloss: { en: 'bag', es: 'bag, bolso' } },
      without: { ja: 'バグ', said: 'bagu', gloss: { en: 'bug (a fault in a program)', es: 'bug (un error en un programa)' } },
    },
    exception: {
      en: 'It is a habit, not a law: bus is バス and bug is バグ, with no ッ.',
      es: 'Es una costumbre, no una ley: bus es バス y bug es バグ, sin ッ.',
    },
  },

  'loan-long': {
    title: { en: 'English -er, -or, -ar and long vowels as ー', es: 'El -er, -or, -ar del inglés y las vocales largas como ー' },
    rule: {
      en: 'The r of English -er, -or and -ar is not said in Japanese: the vowel before it is held for one more beat and written ー, and so is a long English vowel.',
      es: 'La r del -er, -or y -ar del inglés no se pronuncia en japonés: la vocal anterior se sostiene un tiempo más y se escribe ー, y lo mismo pasa con una vocal larga del inglés.',
    },
    examples: [
      { ja: 'コンピューター', said: 'konpyuutaa', spelled: 'ko-n-pyu-u-ta-a', gloss: { en: 'computer', es: 'computer, computadora' } },
      { ja: 'カー', said: 'kaa', spelled: 'ka-a', gloss: { en: 'car', es: 'car, automóvil' } },
      { ja: 'チーム', said: 'chiimu', spelled: 'chi-i-mu', gloss: { en: 'team', es: 'team, equipo' } },
    ],
    pair: {
      with: { ja: 'ラバー', said: 'rabaa', gloss: { en: 'rubber', es: 'rubber, goma' } },
      without: { ja: 'ラバ', said: 'raba', gloss: { en: 'mule (a Japanese word)', es: 'mula (una palabra japonesa)' } },
    },
    exception: {
      en: 'Some newer spellings leave the final ー out: コンピュータ is written too.',
      es: 'Algunas grafías más nuevas omiten la ー final: también se escribe コンピュータ.',
    },
  },

  'loan-f': {
    title: { en: 'f written with フ', es: 'La f escrita con フ' },
    rule: {
      en: 'Japanese has no f of its own, so an English f is written with フ, and before a, i, e and o with フ and a small vowel: ファ, フィ, フェ, フォ.',
      es: 'El japonés no tiene una f propia, así que la f del inglés se escribe con フ, y antes de a, i, e y o con フ y una vocal pequeña: ファ, フィ, フェ, フォ.',
    },
    examples: [
      { ja: 'ファイル', said: 'fairu', spelled: 'fa-i-ru', gloss: { en: 'file', es: 'file, archivo' } },
      { ja: 'フォーク', said: 'fooku', spelled: 'fo-o-ku', gloss: { en: 'fork', es: 'fork, tenedor' } },
      { ja: 'ゴルフ', said: 'gorufu', spelled: 'go-ru-fu', gloss: { en: 'golf', es: 'golf' } },
    ],
    pair: {
      with: { ja: 'フォーム', said: 'foomu', gloss: { en: 'form (a posture, a page to fill in)', es: 'form (una postura, un formulario)' } },
      without: { ja: 'ホーム', said: 'hoomu', gloss: { en: 'platform (at a station)', es: 'andén (de una estación)' } },
    },
    exception: {
      en: 'Some older words used the h column instead: coffee is コーヒー.',
      es: 'Algunas palabras más antiguas usaban la columna h: coffee (café) es コーヒー.',
    },
  },

  'loan-lr': {
    title: { en: 'l and r both written with the r column', es: 'La l y la r escritas con la columna r' },
    rule: {
      en: 'Japanese has one sound between l and r, so an English l is written with the r column, ラ リ ル レ ロ, the same as an r.',
      es: 'El japonés tiene un solo sonido entre la l y la r, así que la l del inglés se escribe con la columna r, ラ リ ル レ ロ, igual que una r.',
    },
    examples: [
      { ja: 'ホテル', said: 'hoteru', spelled: 'ho-te-ru', gloss: { en: 'hotel', es: 'hotel' } },
      { ja: 'ミルク', said: 'miruku', spelled: 'mi-ru-ku', gloss: { en: 'milk', es: 'milk, leche' } },
      { ja: 'ボール', said: 'booru', spelled: 'bo-o-ru', gloss: { en: 'ball', es: 'ball, pelota' } },
    ],
    exception: {
      en: 'So light and right are both ライト, and only the sentence tells them apart.',
      es: 'Por eso light (luz) y right (derecha) son las dos ライト, y solo la oración las distingue.',
    },
  },

  'loan-v': {
    title: { en: 'v written with the b column', es: 'La v escrita con la columna b' },
    rule: {
      en: 'An English v is usually written with the b column, バ ビ ブ ベ ボ, and sometimes with ヴ, a ウ with the two dots.',
      es: 'La v del inglés se escribe casi siempre con la columna b, バ ビ ブ ベ ボ, y a veces con ヴ, una ウ con los dos puntos.',
    },
    examples: [
      { ja: 'テレビ', said: 'terebi', spelled: 'te-re-bi', gloss: { en: 'television', es: 'television, televisión' } },
      { ja: 'ビデオ', said: 'bideo', spelled: 'bi-de-o', gloss: { en: 'video', es: 'video' } },
      { ja: 'サービス', said: 'saabisu', spelled: 'sa-a-bi-su', gloss: { en: 'service', es: 'service, servicio' } },
    ],
    exception: {
      en: 'Some words are written both ways: バイオリン and ヴァイオリン are both violin.',
      es: 'Algunas palabras se escriben de las dos formas: バイオリン y ヴァイオリン son violin (violín).',
    },
  },

  'loan-th': {
    title: { en: 'th written with the s or z column', es: 'La th escrita con la columna s o z' },
    rule: {
      en: 'Japanese has no th, so an English th is written with the s column, or with the z column where the th is voiced, as in smooth.',
      es: 'El japonés no tiene th, así que la th del inglés se escribe con la columna s, o con la columna z cuando la th es sonora, como en smooth.',
    },
    examples: [
      { ja: 'マラソン', said: 'marason', spelled: 'ma-ra-so-n', gloss: { en: 'marathon', es: 'marathon, maratón' } },
      { ja: 'スリル', said: 'suriru', spelled: 'su-ri-ru', gloss: { en: 'thrill', es: 'thrill, emoción fuerte' } },
      { ja: 'スムーズ', said: 'sumuuzu', spelled: 'su-mu-u-zu', gloss: { en: 'smooth', es: 'smooth, sin problemas' } },
    ],
    exception: {
      en: 'Words taken from German keep a t: テーマ (theme) comes from Thema.',
      es: 'Las palabras tomadas del alemán conservan una t: テーマ (tema) viene de Thema.',
    },
  },

  'loan-si': {
    title: { en: 'si, ti and di', es: 'si, ti y di' },
    rule: {
      en: 'Japanese has no si, ti or di, so an English si is written シ (shi), and ti and di are written ティ and ディ, or チ and ジ in older words.',
      es: 'El japonés no tiene si, ti ni di, así que el si del inglés se escribe シ (shi), y ti y di se escriben ティ y ディ, o チ y ジ en palabras más antiguas.',
    },
    examples: [
      { ja: 'タクシー', said: 'takushii', spelled: 'ta-ku-shi-i', gloss: { en: 'taxi', es: 'taxi' } },
      { ja: 'パーティー', said: 'paatii', spelled: 'pa-a-ti-i', gloss: { en: 'party', es: 'party, fiesta' } },
      { ja: 'ラジオ', said: 'rajio', spelled: 'ra-ji-o', gloss: { en: 'radio', es: 'radio' } },
    ],
    exception: {
      en: 'The older spellings stay in common words: チーム (team) and ラジオ (radio) are almost never written with ティ or ディ.',
      es: 'Las grafías antiguas se mantienen en palabras comunes: チーム (equipo) y ラジオ (radio) casi nunca se escriben con ティ ni ディ.',
    },
  },

  'loan-wasei': {
    title: { en: 'Made-in-Japan English', es: 'Inglés hecho en Japón' },
    rule: {
      en: 'Some katakana words were put together in Japan from English parts, so an English speaker would not know them: they are Japanese words.',
      es: 'Algunas palabras en katakana se armaron en Japón con piezas del inglés, así que un hablante de inglés no las conocería: son palabras japonesas.',
    },
    examples: [
      { ja: 'ナイター', said: 'naitaa', spelled: 'na-i-ta-a', gloss: { en: 'a game played under lights (from nighter)', es: 'un partido con luz artificial (de nighter)' } },
      { ja: 'ゲームセンター', said: 'geemusentaa', spelled: 'ge-e-mu-se-n-ta-a', gloss: { en: 'a game arcade (from game center)', es: 'un salón de videojuegos (de game center)' } },
      { ja: 'サラリーマン', said: 'sarariiman', spelled: 'sa-ra-ri-i-ma-n', gloss: { en: 'an office worker (from salaryman)', es: 'un oficinista (de salaryman)' } },
    ],
    exception: {
      en: 'The dictionary marks only the words it knows were made in Japan, so a word with no mark may still be one.',
      es: 'El diccionario marca solo las palabras que sabe que se hicieron en Japón, así que una palabra sin marca también puede serlo.',
    },
  },

  'loan-short': {
    title: { en: 'Shortened words', es: 'Palabras acortadas' },
    rule: {
      en: 'Long loanwords are often cut down, usually to the first beats of each English word: personal computer becomes パソコン.',
      es: 'Las palabras prestadas largas suelen acortarse, casi siempre a los primeros tiempos de cada palabra inglesa: personal computer se vuelve パソコン.',
    },
    examples: [
      { ja: 'パソコン', said: 'pasokon', spelled: 'pa-so-ko-n', gloss: { en: 'personal computer', es: 'personal computer, computadora personal' } },
      { ja: 'リモコン', said: 'rimokon', spelled: 'ri-mo-ko-n', gloss: { en: 'remote control', es: 'remote control, control remoto' } },
      { ja: 'コンビニ', said: 'konbini', spelled: 'ko-n-bi-ni', gloss: { en: 'convenience store', es: 'convenience store, tienda de conveniencia' } },
    ],
    exception: {
      en: 'The long form is often not used at all in Japan: people say パソコン, not パーソナルコンピューター.',
      es: 'Muchas veces la forma larga ni se usa en Japón: se dice パソコン, no パーソナルコンピューター.',
    },
  },
});
