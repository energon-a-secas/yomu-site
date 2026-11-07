// Kana snacks: read a real word written only in hiragana or only in katakana,
// then pick what it means from four meanings, in English or in Spanish (the
// current language, strings.js useLang). Six small themes, ten questions a
// round, for fun. No DOM, audio player, storage or clock.
//
// Every word, meaning and note below, in either language, is original to
// Yomu and dedicated to CC0. Within a theme no two words share a meaning in
// either language, so a question's four answers always differ. Every word
// already has a recorded clip in the Clear voice
// (tests/kana-reads.test.mjs reads the committed data/audio index), so the
// game needs no new recordings, and every word is kana of its theme's script
// only. The romaji shown is the reader's said line (kana.js said), never a
// spelling of its own.
//
// The rounds follow kana-games.js: only the first answer counts, a hint marks
// the question assisted, a missed word comes back three questions later when
// there is room, words missed in finished rounds are drawn more often, and a
// tap that names an old question changes nothing. The `v: 1` document keeps
// counters per theme and the round in progress, never text.

import { t } from './strings.js';
import { said } from './kana.js';
import { ROUND, makeRand, shuffle, drawWeighted, weightOf } from './play-rounds.js';

// title and subtitle are English; titleEs and subtitleEs are their Spanish.
export const KANA_READ_THEMES = Object.freeze([
  { id: 'cafe', script: 'katakana', title: 'Café menu', subtitle: 'Drinks and treats in katakana',
    titleEs: 'Menú de cafetería', subtitleEs: 'Bebidas y bocados en katakana' },
  { id: 'world', script: 'katakana', title: 'Around the world', subtitle: 'Countries and cities in katakana',
    titleEs: 'Por el mundo', subtitleEs: 'Países y ciudades en katakana' },
  { id: 'things', script: 'katakana', title: 'Everyday things', subtitle: 'Loanwords on signs and screens',
    titleEs: 'Cosas de todos los días', subtitleEs: 'Palabras prestadas en letreros y pantallas' },
  { id: 'animals', script: 'katakana', title: 'At the zoo', subtitle: 'Animals the way zoos write them',
    titleEs: 'En el zoológico', subtitleEs: 'Los animales como los escriben los zoológicos' },
  { id: 'sounds', script: 'hiragana', title: 'Sound words', subtitle: 'How things sound and feel, in hiragana',
    titleEs: 'Onomatopeyas', subtitleEs: 'Cómo suenan y se sienten las cosas, en hiragana' },
  { id: 'everyday', script: 'hiragana', title: 'Everyday words', subtitle: 'Friendly words in hiragana',
    titleEs: 'Palabras de todos los días', subtitleEs: 'Palabras amables en hiragana' },
].map((theme) => Object.freeze(theme)));

// [id, kana, meaning, note, Spanish meaning, Spanish note]
const ITEMS = {
  cafe: [
    ['coffee', 'コーヒー', 'Coffee', 'Each bar stretches the vowel before it, so コーヒー is said koohii.',
      'Café', 'Cada barra alarga la vocal que va antes, así que コーヒー se dice koohii.'],
    ['cake', 'ケーキ', 'Cake', 'Strawberry shortcake, ショートケーキ, is the classic birthday cake in Japan.',
      'Pastel', 'El pastel de fresas con crema, ショートケーキ, es el clásico de los cumpleaños en Japón.'],
    ['bread', 'パン', 'Bread', 'パン came from Portuguese pão in the 1500s, long before most English loanwords.',
      'Pan', 'パン llegó del portugués pão en el siglo XVI, mucho antes que la mayoría de los préstamos del inglés.'],
    ['pizza', 'ピザ', 'Pizza', 'Some Italian restaurants write ピッツァ, which is closer to the Italian sound.',
      'Pizza', 'Algunos restaurantes italianos escriben ピッツァ, que suena más parecido al italiano.'],
    ['ramen', 'ラーメン', 'Ramen', 'Instant ramen was invented in Japan in 1958.',
      'Ramen', 'El ramen instantáneo se inventó en Japón en 1958.'],
    ['curry', 'カレー', 'Curry', 'Curry on rice, カレーライス, is one of the most loved home meals in Japan.',
      'Curry', 'El curry con arroz, カレーライス, es una de las comidas caseras más queridas de Japón.'],
    ['salad', 'サラダ', 'Salad', 'Potato salad, ポテトサラダ, is often clipped to ポテサラ.',
      'Ensalada', 'La ensalada de papas, ポテトサラダ, muchas veces se acorta a ポテサラ.'],
    ['juice', 'ジュース', 'Juice', 'In everyday Japanese, ジュース can mean almost any sweet soft drink, fizzy or not.',
      'Jugo', 'En el japonés de todos los días, ジュース puede ser casi cualquier bebida dulce, con gas o sin gas.'],
    ['sandwich', 'サンドイッチ', 'Sandwich', 'Cafés often shorten it to サンド, as in a cream-filled fruit サンド.',
      'Sándwich', 'En los cafés suele acortarse a サンド, como en un サンド de fruta con crema.'],
    ['hamburger', 'ハンバーガー', 'Hamburger', 'Drop the bun and you have ハンバーグ, a hamburg steak served with rice.',
      'Hamburguesa', 'Quítale el pan y tienes ハンバーグ, un filete de carne molida que se sirve con arroz.'],
    ['chocolate', 'チョコレート', 'Chocolate', 'Usually shortened to チョコ, the classic Valentine\'s Day gift in Japan.',
      'Chocolate', 'Casi siempre se acorta a チョコ, el regalo clásico de San Valentín en Japón.'],
    ['milk', 'ミルク', 'Milk', 'In a café ミルク is the milk for your coffee, while the carton at home is usually 牛乳.',
      'Leche', 'En una cafetería, ミルク es la leche para tu café, y la caja de leche de la casa suele ser 牛乳.'],
    ['soup', 'スープ', 'Soup', 'In winter, vending machines sell hot corn soup, コーンスープ, in cans.',
      'Sopa', 'En invierno, las máquinas expendedoras venden sopa de maíz caliente, コーンスープ, en lata.'],
    ['ice-cream', 'アイスクリーム', 'Ice cream', 'Most people just say アイス, so アイス means ice cream, not ice.',
      'Helado', 'Casi todos dicen solo アイス, así que アイス es helado, no hielo.'],
    ['doughnut', 'ドーナツ', 'Doughnut', 'The t at the end of doughnut becomes ツ, so the word ends in tsu.',
      'Dona', 'La t final de doughnut se vuelve ツ, así que la palabra termina en tsu.'],
    ['pudding', 'プリン', 'Custard pudding', 'プリン is a wobbly custard with caramel sauce, sold in every convenience store.',
      'Flan', 'プリン es un flan que tiembla, con salsa de caramelo, y se vende en cualquier tienda de conveniencia.'],
    ['cookie', 'クッキー', 'Cookie', 'The small ッ doubles the k, so クッキー is said kukkii.',
      'Galleta', 'La ッ pequeña duplica la k, así que クッキー se dice kukkii.'],
    ['pasta', 'パスタ', 'Pasta', 'A Japanese favourite is たらこスパゲッティ, spaghetti with salted fish roe.',
      'Pasta', 'Un favorito japonés es たらこスパゲッティ, espagueti con hueva de pescado salada.'],
  ],
  world: [
    ['america', 'アメリカ', 'America', 'In kanji the country is shortened to 米, the character for rice, as in 米国.',
      'Estados Unidos', 'En kanji el país se abrevia 米, el carácter del arroz, como en 米国.'],
    ['mexico', 'メキシコ', 'Mexico', 'Tacos are タコス in Japanese, plural s and all.',
      'México', 'Los tacos son タコス en japonés, con la s del plural y todo.'],
    ['brazil', 'ブラジル', 'Brazil', 'Brazil is home to the largest Japanese community outside Japan.',
      'Brasil', 'En Brasil vive la comunidad japonesa más grande fuera de Japón.'],
    ['italy', 'イタリア', 'Italy', 'Italian food is イタリア料理, often just called イタリアン.',
      'Italia', 'La comida italiana es イタリア料理, y muchas veces se le dice solo イタリアン.'],
    ['france', 'フランス', 'France', 'フランスパン, French bread, is the long crusty loaf in Japanese bakeries.',
      'Francia', 'フランスパン, pan francés, es el pan largo y crujiente de las panaderías japonesas.'],
    ['germany', 'ドイツ', 'Germany', 'The name comes from the Dutch word for German, so it sounds nothing like Germany.',
      'Alemania', 'El nombre viene de la palabra holandesa para alemán, así que no se parece en nada a Alemania.'],
    ['canada', 'カナダ', 'Canada', 'Maple syrup is メープルシロップ, a sweet souvenir from Canada.',
      'Canadá', 'El jarabe de arce es メープルシロップ, un recuerdo dulce de Canadá.'],
    ['chile', 'チリ', 'Chile', 'The same two kana turn up on menus too: チリソース is chili sauce.',
      'Chile', 'Los mismos dos kana aparecen también en los menús: チリソース es salsa de chile.'],
    ['london', 'ロンドン', 'London', 'Each ン is a beat of its own, so ロンドン has four beats: ro-n-do-n.',
      'Londres', 'Cada ン es un pulso propio, así que ロンドン tiene cuatro pulsos: ro-n-do-n.'],
    ['paris', 'パリ', 'Paris', 'Say it twice, パリパリ, and you have the sound of something crispy.',
      'París', 'Dilo dos veces, パリパリ, y tienes el sonido de algo crujiente.'],
    ['rome', 'ローマ', 'Rome', 'The Roman alphabet is ローマ字, which is where the word romaji comes from.',
      'Roma', 'El alfabeto romano es ローマ字, y de ahí viene la palabra romaji.'],
    ['britain', 'イギリス', 'Britain', 'The name comes from Portuguese inglês, the word for English.',
      'Reino Unido', 'El nombre viene del portugués inglês, que quiere decir inglés.'],
    ['australia', 'オーストラリア', 'Australia', 'Its koalas and kangaroos are written in katakana too: コアラ, カンガルー.',
      'Australia', 'Sus koalas y canguros también se escriben en katakana: コアラ, カンガルー.'],
    ['new-york', 'ニューヨーク', 'New York', 'ニュ is ニ plus a small ュ, said as one beat: nyu.',
      'Nueva York', 'ニュ es ニ más una ュ pequeña, dicho en un solo pulso: nyu.'],
    ['india', 'インド', 'India', 'Curry reached Japan by way of Britain, not straight from India.',
      'India', 'El curry llegó a Japón con los británicos, no directamente desde la India.'],
    ['egypt', 'エジプト', 'Egypt', 'Japanese gives its consonants vowels, so Egypt becomes e-ji-pu-to.',
      'Egipto', 'El japonés le pone vocal a cada consonante, así que Egypt, en inglés, se vuelve e-ji-pu-to.'],
    ['hawaii', 'ハワイ', 'Hawaii', 'Hawaii is one of the most popular holiday spots for travellers from Japan.',
      'Hawái', 'Hawái es uno de los destinos de vacaciones favoritos de quienes viajan desde Japón.'],
    ['greece', 'ギリシャ', 'Greece', 'Greek yogurt is sold in Japan as ギリシャヨーグルト.',
      'Grecia', 'El yogur griego se vende en Japón como ギリシャヨーグルト.'],
  ],
  things: [
    ['tv', 'テレビ', 'TV', 'Short for テレビジョン, television: Japanese loves to clip long loanwords.',
      'Tele', 'Es la forma corta de テレビジョン, televisión: al japonés le encanta acortar los préstamos largos.'],
    ['camera', 'カメラ', 'Camera', 'The person behind the camera is a カメラマン, camera man.',
      'Cámara', 'Quien está detrás de la cámara es un カメラマン, un camarógrafo o un fotógrafo.'],
    ['smartphone', 'スマホ', 'Smartphone', 'Clipped from スマートフォン, smartphone, down to three kana.',
      'Celular', 'Viene de スマートフォン, smartphone, acortado a solo tres kana.'],
    ['computer', 'パソコン', 'Computer', 'Short for パーソナルコンピューター, personal computer.',
      'Computadora', 'Es la forma corta de パーソナルコンピューター, computadora personal.'],
    ['game', 'ゲーム', 'Game', 'An arcade is a ゲームセンター, game centre, or ゲーセン for short.',
      'Juego', 'Un salón de videojuegos se llama ゲームセンター, o ゲーセン para abreviar.'],
    ['hotel', 'ホテル', 'Hotel', 'A capsule hotel, カプセルホテル, rents you a sleeping pod instead of a room.',
      'Hotel', 'Un hotel cápsula, カプセルホテル, te alquila una cápsula para dormir en vez de una habitación.'],
    ['toilet', 'トイレ', 'Toilet', 'Signs may also say お手洗い, a politer word for the same room.',
      'Baño', 'Los letreros también pueden decir お手洗い, una palabra más cortés para el mismo lugar.'],
    ['bus', 'バス', 'Bus', 'The same katakana also means bath, as in バスタオル, a bath towel.',
      'Autobús', 'El mismo katakana también quiere decir baño de tina, como en バスタオル, una toalla de baño.'],
    ['taxi', 'タクシー', 'Taxi', 'In Japan the back door of a taxi opens and closes by itself.',
      'Taxi', 'En Japón, la puerta trasera del taxi se abre y se cierra sola.'],
    ['elevator', 'エレベーター', 'Elevator', 'Its cousin is エスカレーター, the escalator.',
      'Ascensor', 'Su primo es エスカレーター, la escalera mecánica.'],
    ['konbini', 'コンビニ', 'Convenience store', 'Short for コンビニエンスストア, a shop that sells meals, stamps and concert tickets.',
      'Tienda de conveniencia', 'Es la forma corta de コンビニエンスストア, una tienda que vende comidas, sellos postales y entradas para conciertos.'],
    ['notebook', 'ノート', 'Notebook', 'ノート is a notebook, not a short message: a note to someone is a メモ.',
      'Cuaderno', 'ノート es un cuaderno, no un mensaje corto: una nota para alguien es una メモ.'],
    ['pen', 'ペン', 'Pen', 'A ballpoint pen is a ボールペン, a ball pen.',
      'Bolígrafo', 'El bolígrafo de punta de bola es una ボールペン, del inglés ball pen.'],
    ['piano', 'ピアノ', 'Piano', 'Three kana and three beats, pi-a-no, close to the Italian word.',
      'Piano', 'Tres kana y tres pulsos, pi-a-no, casi como la palabra italiana.'],
    ['shower', 'シャワー', 'Shower', 'シャ is シ plus a small ャ, said as one beat: sha.',
      'Ducha', 'シャ es シ más una ャ pequeña, dicho en un solo pulso: sha.'],
    ['table', 'テーブル', 'Table', 'Good manners at a meal are テーブルマナー, table manners.',
      'Mesa', 'Los buenos modales en la mesa se llaman テーブルマナー, del inglés table manners.'],
    ['restaurant', 'レストラン', 'Restaurant', 'Five beats, re-su-to-ra-n: Japanese gives the s a vowel of its own.',
      'Restaurante', 'Cinco pulsos, re-su-to-ra-n: el japonés le da a la s una vocal propia.'],
    ['news', 'ニュース', 'News', 'It starts with the same ニュー as ニューヨーク.',
      'Noticias', 'Empieza con el mismo ニュー de ニューヨーク.'],
  ],
  animals: [
    ['lion', 'ライオン', 'Lion', 'The final ン is a beat of its own, so ライオン has four: ra-i-o-n.',
      'León', 'La ン final es un pulso propio, así que ライオン tiene cuatro: ra-i-o-n.'],
    ['panda', 'パンダ', 'Panda', 'Pandas first came to Tokyo\'s Ueno Zoo in 1972 and drew huge crowds.',
      'Panda', 'Los primeros pandas llegaron al zoológico de Ueno, en Tokio, en 1972 y atrajeron multitudes.'],
    ['gorilla', 'ゴリラ', 'Gorilla', 'Japanese uses the ラ row for both l and r, so gorilla becomes gorira.',
      'Gorila', 'El japonés usa la fila de ラ para la l y para la r, así que gorila se vuelve gorira.'],
    ['koala', 'コアラ', 'Koala', 'Three beats, ko-a-ra, with no consonant between コ and ア.',
      'Koala', 'Tres pulsos, ko-a-ra, sin consonante entre コ y ア.'],
    ['rabbit', 'ウサギ', 'Rabbit', 'In Japan, the shapes on the full moon are a rabbit pounding rice cakes.',
      'Conejo', 'En Japón, las manchas de la luna llena son un conejo que golpea arroz para hacer mochi.'],
    ['tiger', 'トラ', 'Tiger', 'The tiger is one of the twelve animals of the Japanese zodiac.',
      'Tigre', 'El tigre es uno de los doce animales del zodiaco japonés.'],
    ['monkey', 'サル', 'Monkey', 'Nikkō\'s famous three wise monkeys see, hear and speak no evil.',
      'Mono', 'Los famosos tres monos sabios de Nikkō no ven el mal, no lo oyen y no lo dicen.'],
    ['bear', 'クマ', 'Bear', 'Kumamon, a round black bear, is the mascot of Kumamoto.',
      'Oso', 'Kumamon, un oso negro y redondo, es la mascota de Kumamoto.'],
    ['horse', 'ウマ', 'Horse', 'Horse racing, 競馬, draws big crowds in Japan on weekends.',
      'Caballo', 'Las carreras de caballos, 競馬, llenan los hipódromos de Japón los fines de semana.'],
    ['cow', 'ウシ', 'Cow', 'Beef is 牛肉, the kanji for cow followed by the kanji for meat.',
      'Vaca', 'La carne de res es 牛肉, el kanji de vaca seguido del kanji de carne.'],
    ['mouse', 'ネズミ', 'Mouse', 'A real mouse is ネズミ, but the cartoon one is ミッキーマウス.',
      'Ratón', 'Un ratón de verdad es ネズミ, pero el de los dibujos animados es ミッキーマウス.'],
    ['turtle', 'カメ', 'Turtle', 'An old saying gives the crane a thousand years and the turtle ten thousand.',
      'Tortuga', 'Un viejo dicho le da a la grulla mil años y a la tortuga diez mil.'],
    ['shark', 'サメ', 'Shark', 'In parts of western Japan a shark is also called ワニ, the word for crocodile elsewhere.',
      'Tiburón', 'En partes del oeste de Japón al tiburón también le dicen ワニ, que en otros lugares es cocodrilo.'],
    ['octopus', 'タコ', 'Octopus', 'Takoyaki, たこ焼き, are balls of batter with a piece of octopus inside.',
      'Pulpo', 'Los takoyaki, たこ焼き, son bolitas de masa con un trozo de pulpo adentro.'],
    ['pigeon', 'ハト', 'Pigeon', 'Tokyo\'s yellow sightseeing buses are called はとバス, pigeon bus.',
      'Paloma', 'Los autobuses turísticos amarillos de Tokio se llaman はとバス, autobús paloma.'],
    ['crow', 'カラス', 'Crow', 'City crows in Japan are famous for raiding rubbish, so many bins wear nets.',
      'Cuervo', 'En Japón, los cuervos de ciudad son famosos por revolver la basura, por eso muchas bolsas se tapan con redes.'],
    ['crane', 'ツル', 'Crane', 'A string of a thousand paper cranes, 千羽鶴, carries a wish for health or peace.',
      'Grulla', 'Una cadena de mil grullas de papel, 千羽鶴, lleva un deseo de salud o de paz.'],
    ['duck', 'アヒル', 'Duck', 'The ugly duckling is みにくいアヒルの子 in Japanese.',
      'Pato', 'El patito feo es みにくいアヒルの子 en japonés.'],
  ],
  sounds: [
    ['dokidoki', 'どきどき', 'Heart pounding', 'Your heart goes どきどき before a test or a first date.',
      'Corazón acelerado', 'El corazón hace どきどき antes de un examen o de una primera cita.'],
    ['wakuwaku', 'わくわく', 'Excited', 'The can\'t-wait feeling before a trip or a festival is わくわく.',
      'Emocionado', 'Esa emoción de no poder esperar antes de un viaje o un festival es わくわく.'],
    ['nikoniko', 'にこにこ', 'Smiling', 'A friend who smiles all the time is always にこにこ.',
      'Sonriente', 'Un amigo que sonríe todo el tiempo siempre está にこにこ.'],
    ['gorogoro', 'ごろごろ', 'Rumbling', 'Thunder rumbles ごろごろ, and lazing around at home all day is ごろごろ too.',
      'Retumbando', 'El trueno retumba ごろごろ, y pasar todo el día tirado en casa también es ごろごろ.'],
    ['pokapoka', 'ぽかぽか', 'Sunny and warm', 'Spring sunshine that warms your back is ぽかぽか.',
      'Cálido y soleado', 'El sol de primavera que te calienta la espalda es ぽかぽか.'],
    ['hokahoka', 'ほかほか', 'Steaming hot', 'Fresh rice or a just-baked sweet potato is ほかほか.',
      'Humeante', 'El arroz recién hecho o un camote recién horneado está ほかほか.'],
    ['guruguru', 'ぐるぐる', 'Round and round', 'Dizzy eyes in manga are drawn as ぐるぐる spirals.',
      'Dando vueltas', 'En el manga, los ojos mareados se dibujan como espirales ぐるぐる.'],
    ['iraira', 'いらいら', 'Irritated', 'Waiting for a late train can make anyone いらいら.',
      'Irritado', 'Esperar un tren atrasado pone いらいら a cualquiera.'],
    ['butsubutsu', 'ぶつぶつ', 'Grumbling', 'Muttering complaints is ぶつぶつ, and so is a rash of little bumps.',
      'Refunfuñando', 'Quejarse entre dientes es ぶつぶつ, y un sarpullido de granitos también.'],
    ['boroboro', 'ぼろぼろ', 'Falling apart', 'Old sneakers, a battered book or a tired body can all be ぼろぼろ.',
      'Hecho pedazos', 'Unos zapatos viejos, un libro maltratado o un cuerpo cansado pueden estar ぼろぼろ.'],
    ['kutakuta', 'くたくた', 'Exhausted', 'After a long day of sightseeing, your legs are くたくた.',
      'Agotado', 'Después de un largo día de paseo, las piernas quedan くたくた.'],
    ['batabata', 'ばたばた', 'In a rush', 'A hectic morning is ばたばた, like wings flapping in a hurry.',
      'A las carreras', 'Una mañana agitada es ばたばた, como alas que aletean a toda prisa.'],
    ['burabura', 'ぶらぶら', 'Wandering about', 'Strolling around town with no plan is ぶらぶら.',
      'Paseando sin rumbo', 'Pasear por la ciudad sin ningún plan es ぶらぶら.'],
    ['bikkuri', 'びっくり', 'Surprised', 'Say びっくりした after a scare: that startled me!',
      'Sorprendido', 'Di びっくりした después de un susto: ¡me asusté!'],
    ['gakkari', 'がっかり', 'Disappointed', 'Rain on the day of a picnic makes everyone がっかり.',
      'Decepcionado', 'La lluvia el día del pícnic deja a todos がっかり.'],
    ['nonbiri', 'のんびり', 'Taking it easy', 'A slow Sunday with nothing planned is のんびり.',
      'Con calma', 'Un domingo tranquilo y sin planes es のんびり.'],
    ['gussuri', 'ぐっすり', 'Fast asleep', 'After a warm bath you sleep ぐっすり all night.',
      'Profundamente dormido', 'Después de un baño caliente duermes ぐっすり toda la noche.'],
    ['yukkuri', 'ゆっくり', 'Slowly', 'Ask someone to slow down with ゆっくりお願いします.',
      'Despacio', 'Para pedirle a alguien que vaya más despacio, di ゆっくりお願いします.'],
  ],
  everyday: [
    ['ohayou', 'おはよう', 'Good morning', 'Add ございます to make it polite: おはようございます.',
      'Buenos días', 'Agrega ございます para decirlo con cortesía: おはようございます.'],
    ['arigatou', 'ありがとう', 'Thank you', 'The う at the end stretches the o, so it is said arigatoo.',
      'Gracias', 'La う final alarga la o, así que se dice arigatoo.'],
    ['oyasumi', 'おやすみ', 'Good night', 'Said when someone goes to bed, never as an evening hello.',
      'Buenas noches', 'Se dice cuando alguien se va a dormir, nunca como saludo de la noche.'],
    ['itadakimasu', 'いただきます', 'Let\'s eat', 'Said with hands together before a meal, thanking everyone who made it possible.',
      'A comer', 'Se dice con las manos juntas antes de comer, para agradecer a todos los que hicieron posible la comida.'],
    ['gochisousama', 'ごちそうさま', 'Thanks for the meal', 'The partner of いただきます, said when you finish eating.',
      'Gracias por la comida', 'Es la pareja de いただきます, y se dice al terminar de comer.'],
    ['tadaima', 'ただいま', 'I\'m home', 'Say it as you come through the door, and your family answers おかえり.',
      'Ya llegué', 'Dilo al entrar por la puerta, y tu familia te responde おかえり.'],
    ['sugoi', 'すごい', 'Amazing', 'Stretch it to すごーい when you are really impressed.',
      'Increíble', 'Alárgalo a すごーい cuando algo de verdad te impresiona.'],
    ['oishii', 'おいしい', 'Delicious', 'Say it after the first bite and the cook will smile.',
      'Delicioso', 'Dilo después del primer bocado y quien cocinó va a sonreír.'],
    ['kawaii', 'かわいい', 'Cute', 'It covers anything cute, from kittens to tiny erasers.',
      'Lindo', 'Sirve para todo lo lindo, desde gatitos hasta gomas de borrar diminutas.'],
    ['yatta', 'やった', 'I did it', 'Shout やった when you pass a test or win a game.',
      'Lo logré', 'Grita やった cuando apruebas un examen o ganas un juego.'],
    ['sakura', 'さくら', 'Cherry blossom', 'In spring, friends picnic under the さくら, a custom called お花見.',
      'Flor de cerezo', 'En primavera, los amigos hacen pícnic bajo las さくら, una costumbre llamada お花見.'],
    ['sushi', 'すし', 'Sushi', 'At conveyor-belt sushi, 回転寿司, the plates ride past your seat.',
      'Sushi', 'En el sushi giratorio, 回転寿司, los platos pasan frente a tu asiento.'],
    ['gomennasai', 'ごめんなさい', 'I\'m sorry', 'With close friends, ごめん alone is enough.',
      'Perdón', 'Con amigos cercanos, basta con ごめん.'],
    ['hajimemashite', 'はじめまして', 'Nice to meet you', 'Said only the first time you meet someone, before your name.',
      'Mucho gusto', 'Se dice solo la primera vez que conoces a alguien, antes de tu nombre.'],
    ['ureshii', 'うれしい', 'Happy', 'Use it for your own happy feelings, like opening a present.',
      'Feliz', 'Úsalo para tu propia alegría, como al abrir un regalo.'],
    ['omedetou', 'おめでとう', 'Congratulations', 'Put お誕生日 in front for happy birthday: お誕生日おめでとう.',
      'Felicidades', 'Pon お誕生日 delante para decir feliz cumpleaños: お誕生日おめでとう.'],
    ['moshimoshi', 'もしもし', 'Hello (on the phone)', 'The phone hello: you would not say it face to face.',
      'Hola (por teléfono)', 'Es el hola del teléfono: no se dice cara a cara.'],
    ['ocha', 'おちゃ', 'Green tea', 'In Japan お茶 usually means green tea, often served free with meals.',
      'Té verde', 'En Japón, お茶 suele ser té verde, y muchas veces lo sirven gratis con la comida.'],
  ],
};

const THEMES = new Map(KANA_READ_THEMES.map((theme) => [theme.id, theme]));
const itemsOf = (theme) => (ITEMS[theme] || []).map(([id, kana, en, note, es, noteEs]) => ({ id, kana, en, note, es, noteEs }));
// What the learner reads, resolved when it is shown (strings.js t).
const meaningOf = (item) => t({ en: item.en, es: item.es });
const noteOf = (item) => t({ en: item.note, es: item.noteEs });
const titleOf = (theme) => t({ en: theme.title, es: theme.titleEs });
const roundLength = (theme) => Math.min(ROUND, (ITEMS[theme] || []).length);
const CAP = 1000000;
const count = (n) => (Number.isSafeInteger(n) && n >= 0 && n <= CAP ? n : 0);
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const emptyStats = () => ({ rounds: 0, best: 0, correct: 0, answered: 0, assisted: 0, misses: {} });

/** The themes, each with how many words it holds, titled in the current language. */
export function kanaReadThemes() {
  return KANA_READ_THEMES.map((theme) => ({
    id: theme.id, script: theme.script, title: titleOf(theme),
    subtitle: t({ en: theme.subtitle, es: theme.subtitleEs }), count: ITEMS[theme.id].length,
  }));
}

/** A theme's words, `{ id, kana, en, note, es, noteEs }`, or [] for an unknown theme. */
export function kanaReadItems(theme) {
  return itemsOf(theme);
}

/** The word and up to three others of its theme, each with a different meaning. */
function question(item, items, rand) {
  const options = [item];
  for (const other of shuffle(items.filter((o) => o.id !== item.id), rand)) {
    if (options.length === 4) break;
    if (options.every((o) => o.en !== other.en)) options.push(other);
  }
  return { target: item.id, options: shuffle(options.map((o) => o.id), rand) };
}

/** The document holds bounded counters and a resumable round, never text. */
export class KanaReads {
  constructor(document) {
    this.stats = {};
    this.round = null;
    this.recovered = false;
    if (document == null) return;
    if (!object(document) || document.v !== 1 || !object(document.stats)) { this.recovered = true; return; }
    for (const [theme, value] of Object.entries(document.stats)) {
      if (!THEMES.has(theme) || !object(value)) { this.recovered = true; continue; }
      const ids = new Set(ITEMS[theme].map(([id]) => id));
      const misses = {};
      if (!object(value.misses)) this.recovered = true;
      for (const [id, n] of Object.entries(object(value.misses) ? value.misses : {})) {
        if (!ids.has(id) || n !== count(n)) this.recovered = true;
        if (ids.has(id) && count(n)) misses[id] = count(n);
      }
      const answered = count(value.answered), correct = Math.min(answered, count(value.correct));
      const clean = {
        rounds: count(value.rounds), best: Math.min(roundLength(theme), count(value.best)), correct, answered,
        assisted: Math.min(answered - correct, count(value.assisted)), misses,
      };
      if (['rounds', 'best', 'correct', 'answered', 'assisted'].some((k) => value[k] !== clean[k])) this.recovered = true;
      this.stats[theme] = clean;
    }
    if (document.round != null) {
      if (validRound(document.round)) this.round = JSON.parse(JSON.stringify(document.round));
      else this.recovered = true;
    }
  }

  /** Throws when a round is in progress or the theme is unknown. */
  start({ theme, seed = Date.now() } = {}) {
    if (this.round && this.round.at < this.round.questions.length) {
      throw new Error(t({ en: 'Finish or leave the current round first.', es: 'Primero termina la ronda actual o sal de ella.' }));
    }
    if (!THEMES.has(theme)) throw new Error(t({ en: 'Choose one of the themes.', es: 'Elige uno de los temas.' }));
    const items = itemsOf(theme), rand = makeRand(seed);
    const misses = (this.stats[theme] || emptyStats()).misses;
    // Each word once, the ones missed in earlier rounds drawn more often.
    const drawn = drawWeighted(items, roundLength(theme), (item) => weightOf(misses[item.id] || 0), rand);
    this.round = { id: `${theme}:${Number(seed) >>> 0}`, theme, questions: drawn.map((item) => question(item, items, rand)), at: 0, picks: [], hinted: false };
    return this.view();
  }

  /**
   * 'hint', 'answer' (with `pick`, an option id), 'skip', 'next' or 'leave'.
   * Every action but leave names the question on screen by its `id`; any
   * other id is a stale or double tap and changes nothing.
   */
  act(action, { id, pick } = {}) {
    const r = this.round;
    if (!r) return this.view();
    if (action === 'leave') { this.round = null; return this.view(); }
    const total = r.questions.length;
    if (r.at >= total || id !== `${r.id}:${r.at}`) return this.view();
    const q = r.questions[r.at];
    const answered = r.picks.length > r.at;
    if (action === 'hint' && !answered) r.hinted = true;
    if ((action === 'answer' || action === 'skip') && !answered) {
      if (action === 'answer' && !q.options.includes(pick)) return this.view();
      const chosen = action === 'skip' ? null : pick;
      r.picks.push({ id: chosen, hint: r.hinted });
      // A missed word comes back a few questions later in this round. The
      // round keeps its length: no lives, no punishment.
      if (chosen !== q.target && r.at + 3 < total) r.questions[r.at + 3] = { target: q.target, options: [...q.options] };
    }
    if (action === 'next' && answered) {
      r.at += 1;
      r.hinted = false;
      if (r.at === total) this.record();
    }
    return this.view();
  }

  record() {
    const r = this.round, s = this.stats[r.theme] || emptyStats(), result = this.result();
    s.rounds = Math.min(CAP, s.rounds + 1);
    s.best = Math.max(s.best, result.correct);
    s.correct = Math.min(CAP, s.correct + result.correct);
    s.answered = Math.min(CAP, s.answered + result.total);
    s.assisted = Math.min(CAP, s.assisted + result.assisted);
    r.picks.forEach((p, i) => {
      const target = r.questions[i].target;
      if (p.id !== target || p.hint) s.misses[target] = Math.min(CAP, (s.misses[target] || 0) + 1);
    });
    this.stats[r.theme] = s;
  }

  result() {
    const r = this.round;
    return {
      correct: r.picks.filter((p, i) => p.id === r.questions[i].target && !p.hint).length,
      assisted: r.picks.filter((p) => p.hint).length,
      skipped: r.picks.filter((p) => p.id === null).length,
      total: r.questions.length,
    };
  }

  view() {
    const base = { recovered: this.recovered, stats: this.stats, status: 'idle', round: null };
    const r = this.round;
    if (!r) return base;
    const theme = THEMES.get(r.theme), total = r.questions.length;
    const details = { theme: r.theme, script: theme.script, title: titleOf(theme), position: Math.min(r.at + 1, total), total, result: this.result(), question: null };
    if (r.at === total) return { ...base, status: 'complete', round: details };
    const byId = new Map(itemsOf(r.theme).map((item) => [item.id, item]));
    const q = r.questions[r.at], target = byId.get(q.target), pick = r.picks[r.at];
    const answered = Boolean(pick);
    details.question = {
      id: `${r.id}:${r.at}`, kana: target.kana, answered, hinted: r.hinted,
      romaji: r.hinted || answered ? said(target.kana) : null,
      meaning: answered ? meaningOf(target) : null, note: answered ? noteOf(target) : null,
      correctId: answered ? target.id : null, pickedId: answered ? pick.id : null,
      right: answered ? pick.id === target.id : null,
      options: q.options.map((oid) => ({ id: oid, label: meaningOf(byId.get(oid)) })),
    };
    return { ...base, status: 'playing', round: details };
  }

  dump() { return { v: 1, stats: this.stats, round: this.round }; }
}

function validRound(r) {
  if (!object(r) || !THEMES.has(r.theme) || typeof r.id !== 'string' || !r.id || r.id.length > 80) return false;
  const total = roundLength(r.theme);
  if (!Number.isInteger(r.at) || r.at < 0 || r.at > total || !Array.isArray(r.questions) || r.questions.length !== total) return false;
  if (!Array.isArray(r.picks) || r.picks.length < r.at || r.picks.length > Math.min(total, r.at + 1) || typeof r.hinted !== 'boolean') return false;
  const byId = new Map(itemsOf(r.theme).map((item) => [item.id, item]));
  return r.questions.every((q, i) => {
    if (!object(q) || !byId.has(q.target) || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4 || !q.options.includes(q.target)) return false;
    if (!q.options.every((oid) => byId.has(oid)) || new Set(q.options.map((oid) => byId.get(oid).en)).size !== q.options.length) return false;
    if (i > 0 && r.questions[i - 1].target === q.target) return false;
    const p = r.picks[i];
    return i >= r.picks.length || (object(p) && typeof p.hint === 'boolean' && (p.id === null || q.options.includes(p.id)));
  });
}
