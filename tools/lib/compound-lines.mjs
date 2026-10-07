/**
 * Lines with a katakana compound, for the hard end of "Where are the
 * spaces?" (tools/lib/spaces.mjs). Written for Yomu and dedicated to the
 * public domain (CC0), like the phrase library; nothing here was taken from a
 * textbook, an app or a corpus.
 *
 * Why they are here and not in data/phrases/library.json: on 2026-10-07 not
 * one line of the library holds a katakana compound the analyzer splits into
 * parts (カフェラテ, メニュー and スプーン are each one dictionary word), so
 * the game's last tier had nothing to draw from. The library is the Phrases
 * dialog's content, and a line written to test a compound does not belong
 * among phrases a learner says. Each line here was chosen because the
 * analyzer reads its compound as two dictionary words with no guess, and
 * each carries its kana, which the build compares with the analyzer's
 * reading exactly as the library's lines are compared: a line whose reading
 * the build does not confirm is left out, never fixed by hand.
 *
 * The compounds cover the three reasons a part's edge can show: a loanword
 * ending (ゴールド|カード, ダンス|レッスン), a kana no word starts with
 * (ギター|ケース, ラーメン|ショップ) and two plain parts (テニス|トーナメント).
 *
 * The rest of each line is held to the same checks as the library's: on
 * 2026-10-07 hotel-lobby read 待っています, a te-form and いる that the
 * build now leaves out (`two`), so it says 待ちます instead.
 */

export const COMPOUND_LINES = Object.freeze([
  {
    id: 'tennis-tournament', ja: 'テニストーナメントに出ます。', kana: 'テニストーナメントにでます',
    en: 'I am playing in a tennis tournament.', es: 'Voy a jugar en un torneo de tenis.',
  },
  {
    id: 'ramen-shop', ja: '駅の前にラーメンショップがあります。', kana: 'えきのまえにラーメンショップがあります',
    en: 'There is a ramen shop in front of the station.', es: 'Hay una tienda de ramen frente a la estación.',
  },
  {
    id: 'gold-card', ja: 'ゴールドカードで払います。', kana: 'ゴールドカードではらいます',
    en: 'I will pay with a gold card.', es: 'Voy a pagar con una tarjeta dorada.',
  },
  {
    id: 'pink-shirt', ja: 'ピンクシャツを買いました。', kana: 'ピンクシャツをかいました',
    en: 'I bought a pink shirt.', es: 'Compré una camisa rosada.',
  },
  {
    id: 'hotel-lobby', ja: 'ホテルロビーで待ちます。', kana: 'ホテルロビーでまちます',
    en: 'I will wait in the hotel lobby.', es: 'Esperaré en el vestíbulo del hotel.',
  },
  {
    id: 'guitar-case', ja: 'ギターケースは重いです。', kana: 'ギターケースはおもいです',
    en: 'The guitar case is heavy.', es: 'El estuche de la guitarra pesa mucho.',
  },
  {
    id: 'piano-lesson', ja: '毎週ピアノレッスンがあります。', kana: 'まいしゅうピアノレッスンがあります',
    en: 'I have a piano lesson every week.', es: 'Tengo clase de piano cada semana.',
  },
  {
    id: 'camera-bag', ja: 'カメラバッグを忘れました。', kana: 'カメラバッグをわすれました',
    en: 'I forgot my camera bag.', es: 'Olvidé el bolso de la cámara.',
  },
  {
    id: 'concert-tickets', ja: 'コンサートチケットを二枚ください。', kana: 'コンサートチケットをにまいください',
    en: 'Two concert tickets, please.', es: 'Dos entradas para el concierto, por favor.',
  },
  {
    id: 'dance-lesson', ja: 'ダンスレッスンは何時からですか。', kana: 'ダンスレッスンはなんじからですか',
    en: 'What time does the dance lesson start?', es: '¿A qué hora empieza la clase de baile?',
  },
  {
    id: 'lunch-menu', ja: 'ランチメニューを見せてください。', kana: 'ランチメニューをみせてください',
    en: 'Please show me the lunch menu.', es: 'Muéstreme el menú del almuerzo, por favor.',
  },
  {
    id: 'kitchen-towel', ja: 'キッチンタオルはどこですか。', kana: 'キッチンタオルはどこですか',
    en: 'Where is the kitchen towel?', es: '¿Dónde está la toalla de cocina?',
  },
]);
