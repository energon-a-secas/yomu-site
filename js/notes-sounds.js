// What the learner is told about each special sound. Data only; notes.js
// resolves a language and is the module the page imports.
//
// The discipline, one note per sound: a single rule sentence, then two or three
// everyday words that show it, then, where one exists, a minimal pair in which
// this sound is the only difference. Every word was chosen here.
//
// `said` and `spelled` are the two romaji lines exactly as kana.js writes them
// (tests/sounds.test.mjs recomputes both, and reads every example through
// analyze() to check it shows the sound it is the example of). `kana` is the reading, space
// separated where the romaji puts a space; it is omitted when `ja` already is
// that reading. A lone は, へ or を piece is a particle.

export const SOUND_NOTES = Object.freeze({
  'particle-wa': {
    title: { en: 'は said wa', es: 'は que se dice wa' },
    rule: {
      en: 'When は marks the topic of a sentence it is said wa, but it is still written は.',
      es: 'Cuando は marca el tema de la oración se dice wa, aunque se sigue escribiendo は.',
    },
    examples: [
      { ja: 'わたしは がくせいです', kana: 'わたし は がくせい です', said: 'watashi wa gakusee desu', spelled: 'wa-ta-shi ha ga-ku-se-i de-su', gloss: { en: 'I am a student.', es: 'Soy estudiante.' } },
      { ja: 'きょうは あめです', kana: 'きょう は あめ です', said: 'kyoo wa ame desu', spelled: 'kyo-u ha a-me de-su', gloss: { en: 'It is raining today.', es: 'Hoy llueve.' } },
    ],
    exception: {
      en: 'Inside an ordinary word は keeps its own sound: はな is hana, flower.',
      es: 'Dentro de una palabra común は conserva su sonido: はな es hana, flor.',
    },
  },

  'particle-e': {
    title: { en: 'へ said e', es: 'へ que se dice e' },
    rule: {
      en: 'When へ marks the direction you are heading it is said e, but it is still written へ.',
      es: 'Cuando へ marca la dirección hacia la que vas se dice e, aunque se sigue escribiendo へ.',
    },
    examples: [
      { ja: 'がっこうへ いきます', kana: 'がっこう へ いきます', said: 'gakkoo e ikimasu', spelled: 'ga-k-ko-u he i-ki-ma-su', gloss: { en: 'I go to school.', es: 'Voy a la escuela.' } },
      { ja: 'うちへ かえります', kana: 'うち へ かえります', said: 'uchi e kaerimasu', spelled: 'u-chi he ka-e-ri-ma-su', gloss: { en: 'I go back home.', es: 'Vuelvo a casa.' } },
    ],
    exception: {
      en: 'Inside an ordinary word へ keeps its own sound: へや is heya, room.',
      es: 'Dentro de una palabra común へ conserva su sonido: へや es heya, habitación.',
    },
  },

  'particle-o': {
    title: { en: 'を said o', es: 'を que se dice o' },
    rule: {
      en: 'を is written only as the object particle, and it is said o, the same as お.',
      es: 'を solo se escribe como partícula de objeto y se dice o, igual que お.',
    },
    examples: [
      { ja: 'みずを のみます', kana: 'みず を のみます', said: 'mizu o nomimasu', spelled: 'mi-zu wo no-mi-ma-su', gloss: { en: 'I drink water.', es: 'Tomo agua.' } },
      { ja: 'ほんを よみます', kana: 'ほん を よみます', said: 'hon o yomimasu', spelled: 'ho-n wo yo-mi-ma-su', gloss: { en: 'I read a book.', es: 'Leo un libro.' } },
    ],
    exception: {
      en: 'Keyboards and some romaji systems write it wo; in everyday speech it is o.',
      es: 'Los teclados y algunos sistemas de romaji lo escriben wo; en el habla cotidiana es o.',
    },
  },

  'fossil-wa': {
    title: { en: 'The は at the end of a greeting', es: 'La は al final de un saludo' },
    rule: {
      en: 'こんにちは and こんばんは end in an old topic particle, so their last は is said wa.',
      es: 'こんにちは y こんばんは terminan en una antigua partícula de tema, así que su última は se dice wa.',
    },
    examples: [
      { ja: 'こんにちは', said: 'konnichiwa', spelled: 'ko-n-ni-chi-ha', gloss: { en: 'Hello (during the day).', es: 'Hola (durante el día).' } },
      { ja: 'こんばんは', said: 'konbanwa', spelled: 'ko-n-ba-n-ha', gloss: { en: 'Good evening.', es: 'Buenas noches (como saludo).' } },
    ],
    exception: {
      en: 'Casual messages sometimes spell it こんにちわ, but は is the standard spelling.',
      es: 'En mensajes informales a veces se escribe こんにちわ, pero la ortografía estándar es con は.',
    },
  },

  'long-vowel': {
    title: { en: 'Long vowels', es: 'Vocales largas' },
    rule: {
      en: 'A long vowel is held for two beats, and hiragana writes the second beat as a vowel kana: い after an e sound, う after an o sound, the same vowel after a, i and u.',
      es: 'Una vocal larga dura dos tiempos, y el hiragana escribe el segundo tiempo con una vocal: い después de un sonido e, う después de un sonido o, la misma vocal después de a, i y u.',
    },
    examples: [
      { ja: 'おかあさん', said: 'okaasan', spelled: 'o-ka-a-sa-n', gloss: { en: 'mother', es: 'madre' } },
      { ja: 'せんせい', said: 'sensee', spelled: 'se-n-se-i', gloss: { en: 'teacher', es: 'docente' } },
      { ja: 'ひこうき', said: 'hikooki', spelled: 'hi-ko-u-ki', gloss: { en: 'airplane', es: 'avión' } },
    ],
    pair: {
      with: { ja: 'おばあさん', said: 'obaasan', gloss: { en: 'grandmother', es: 'abuela' } },
      without: { ja: 'おばさん', said: 'obasan', gloss: { en: 'aunt', es: 'tía' } },
    },
    exception: {
      en: 'A handful of common words spell the long o with お and the long e with え instead: おおきい (big), とおい (far), こおり (ice), おねえさん (older sister).',
      es: 'Unas pocas palabras comunes escriben la o larga con お y la e larga con え: おおきい (grande), とおい (lejos), こおり (hielo), おねえさん (hermana mayor).',
    },
  },

  'small-tsu': {
    title: { en: 'Small っ: a held beat', es: 'っ pequeña: un tiempo sostenido' },
    rule: {
      en: 'A small っ is a silent beat that holds the next consonant, so the romaji writes that consonant twice.',
      es: 'Una っ pequeña es un tiempo en silencio que sostiene la consonante siguiente, por eso el romaji la escribe dos veces.',
    },
    examples: [
      { ja: 'がっこう', said: 'gakkoo', spelled: 'ga-k-ko-u', gloss: { en: 'school', es: 'escuela' } },
      { ja: 'きっぷ', said: 'kippu', spelled: 'ki-p-pu', gloss: { en: 'ticket', es: 'boleto' } },
      { ja: 'ざっし', said: 'zasshi', spelled: 'za-s-shi', gloss: { en: 'magazine', es: 'revista' } },
    ],
    pair: {
      with: { ja: 'きって', said: 'kitte', gloss: { en: 'postage stamp', es: 'sello postal' } },
      without: { ja: 'きて', said: 'kite', gloss: { en: 'come (and...)', es: 'ven (y...)' } },
    },
    exception: {
      en: 'At the end of a word, as in あっ, nothing follows to double: the sound stops short with a catch in the throat.',
      es: 'Al final de una palabra, como en あっ, no hay nada que duplicar: el sonido se corta en seco con un cierre en la garganta.',
    },
  },

  'youon': {
    title: { en: 'Small ゃ ゅ ょ', es: 'ゃ ゅ ょ pequeñas' },
    rule: {
      en: 'A small ゃ, ゅ or ょ after a kana of the i column merges with it into a single beat: き and a small ょ make kyo.',
      es: 'Una ゃ, ゅ o ょ pequeña después de una kana de la columna i se une a ella en un solo tiempo: き y una ょ pequeña forman kyo.',
    },
    examples: [
      { ja: 'おちゃ', said: 'ocha', spelled: 'o-cha', gloss: { en: 'tea', es: 'té' } },
      { ja: 'しゃしん', said: 'shashin', spelled: 'sha-shi-n', gloss: { en: 'photo', es: 'foto' } },
      { ja: 'りょこう', said: 'ryokoo', spelled: 'ryo-ko-u', gloss: { en: 'trip', es: 'viaje' } },
    ],
    pair: {
      with: { ja: 'びょういん', said: 'byooin', gloss: { en: 'hospital', es: 'hospital' } },
      without: { ja: 'びよういん', said: 'biyooin', gloss: { en: 'hair salon', es: 'peluquería' } },
    },
  },

  'dakuten': {
    title: { en: 'The two dots ゛', es: 'Los dos puntos ゛' },
    rule: {
      en: 'Two dots on a kana voice its consonant: k becomes g, s becomes z, t becomes d, and h becomes b.',
      es: 'Dos puntos sobre una kana sonorizan su consonante: la k pasa a g, la s a z, la t a d y la h a b.',
    },
    examples: [
      { ja: 'ごはん', said: 'gohan', spelled: 'go-ha-n', gloss: { en: 'rice, a meal', es: 'arroz, comida' } },
      { ja: 'でんわ', said: 'denwa', spelled: 'de-n-wa', gloss: { en: 'telephone', es: 'teléfono' } },
      { ja: 'ともだち', said: 'tomodachi', spelled: 'to-mo-da-chi', gloss: { en: 'friend', es: 'amigo' } },
    ],
    pair: {
      with: { ja: 'かぎ', said: 'kagi', gloss: { en: 'key', es: 'llave' } },
      without: { ja: 'かき', said: 'kaki', gloss: { en: 'persimmon', es: 'caqui' } },
    },
    exception: {
      en: 'し with the dots is ji, not zi, and ち with the dots is ji as well.',
      es: 'し con los puntos es ji, no zi, y ち con los puntos también es ji.',
    },
  },

  'handakuten': {
    title: { en: 'The small circle ゜', es: 'El pequeño círculo ゜' },
    rule: {
      en: 'A small circle on は, ひ, ふ, へ or ほ turns the h into a p.',
      es: 'Un pequeño círculo sobre は, ひ, ふ, へ o ほ convierte la h en p.',
    },
    examples: [
      { ja: 'えんぴつ', said: 'enpitsu', spelled: 'e-n-pi-tsu', gloss: { en: 'pencil', es: 'lápiz' } },
      { ja: 'さんぽ', said: 'sanpo', spelled: 'sa-n-po', gloss: { en: 'a walk', es: 'un paseo' } },
      { ja: 'パン', said: 'pan', spelled: 'pa-n', gloss: { en: 'bread', es: 'pan' } },
    ],
    pair: {
      with: { ja: 'ぽかぽか', said: 'pokapoka', gloss: { en: 'pleasantly warm', es: 'agradablemente tibio' } },
      without: { ja: 'ほかほか', said: 'hokahoka', gloss: { en: 'piping hot', es: 'bien caliente' } },
    },
  },

  'n-assimilation': {
    title: { en: 'ん takes the shape of the next sound', es: 'ん toma la forma del sonido siguiente' },
    rule: {
      en: 'ん is said m before m, b or p, ng before k or g, and before a vowel or y the romaji writes it n\' so it does not start a new syllable.',
      es: 'ん se dice m antes de m, b o p, ng antes de k o g, y antes de una vocal o de y el romaji la escribe n\' para que no empiece una sílaba nueva.',
    },
    examples: [
      { ja: 'しんぶん', said: 'shinbun', spelled: 'shi-n-bu-n', gloss: { en: 'newspaper', es: 'periódico' } },
      { ja: 'ぎんこう', said: 'ginkoo', spelled: 'gi-n-ko-u', gloss: { en: 'bank', es: 'banco' } },
      { ja: 'こんや', said: 'kon\'ya', spelled: 'ko-n-ya', gloss: { en: 'tonight', es: 'esta noche' } },
    ],
    pair: {
      with: { ja: 'きんえん', said: 'kin\'en', gloss: { en: 'no smoking', es: 'prohibido fumar' } },
      without: { ja: 'きねん', said: 'kinen', gloss: { en: 'commemoration', es: 'conmemoración' } },
    },
    exception: {
      en: 'The romaji line keeps writing n before m, b and p: the change happens in the mouth, not in the spelling.',
      es: 'La línea de romaji sigue escribiendo n antes de m, b y p: el cambio ocurre en la boca, no en la escritura.',
    },
  },

  'devoiced': {
    title: { en: 'Whispered vowels', es: 'Vocales susurradas' },
    rule: {
      en: 'In standard Tokyo speech an i or u between two voiceless consonants, or the u of a final す, is whispered, so です sounds close to dess.',
      es: 'En el habla estándar de Tokio, una i o una u entre dos consonantes sordas, o la u de una す final, se susurra, así que です suena casi como dess.',
    },
    examples: [
      { ja: 'すきです', kana: 'すき です', said: 'suki desu', spelled: 'su-ki de-su', whispered: 's(u)ki des(u)', gloss: { en: 'I like it.', es: 'Me gusta.' } },
      { ja: 'ちかてつ', said: 'chikatetsu', spelled: 'chi-ka-te-tsu', whispered: 'ch(i)katetsu', gloss: { en: 'subway', es: 'metro' } },
      { ja: 'ひとつ', said: 'hitotsu', spelled: 'hi-to-tsu', whispered: 'h(i)totsu', gloss: { en: 'one (thing)', es: 'uno (objeto)' } },
    ],
    exception: {
      en: 'It varies with region and speed, and saying the vowel in full is never wrong.',
      es: 'Varía según la región y la velocidad, y pronunciar la vocal completa nunca es un error.',
    },
  },

  'ji-zu': {
    title: { en: 'ぢ and づ', es: 'ぢ y づ' },
    rule: {
      en: 'ぢ and づ sound exactly like じ and ず, and are written only where a word joins onto ち or つ, or repeats them.',
      es: 'ぢ y づ suenan exactamente como じ y ず, y solo se escriben donde una palabra se une a ち o つ, o las repite.',
    },
    examples: [
      { ja: 'はなぢ', said: 'hanaji', spelled: 'ha-na-ji', gloss: { en: 'nosebleed (はな + ち)', es: 'sangrado de nariz (はな + ち)' } },
      { ja: 'みかづき', said: 'mikazuki', spelled: 'mi-ka-zu-ki', gloss: { en: 'crescent moon (みか + つき)', es: 'luna creciente (みか + つき)' } },
      { ja: 'つづく', said: 'tsuzuku', spelled: 'tsu-zu-ku', gloss: { en: 'to continue', es: 'continuar' } },
    ],
    exception: {
      en: 'On a keyboard ぢ is typed di and づ is typed du, even though they are said ji and zu.',
      es: 'En el teclado ぢ se escribe di y づ se escribe du, aunque se pronuncian ji y zu.',
    },
  },

  'foreign-sound': {
    title: { en: 'Sounds for words from abroad', es: 'Sonidos para palabras extranjeras' },
    rule: {
      en: 'Katakana pairs a kana with a small vowel to make sounds that native words lack, such as ティ (ti), ファ (fa), ウィ (wi) and ヴァ (va).',
      es: 'El katakana une una kana con una vocal pequeña para formar sonidos que las palabras nativas no tienen, como ティ (ti), ファ (fa), ウィ (wi) y ヴァ (va).',
    },
    examples: [
      { ja: 'パーティー', said: 'paatii', spelled: 'pa-a-ti-i', gloss: { en: 'party', es: 'fiesta' } },
      { ja: 'ファイル', said: 'fairu', spelled: 'fa-i-ru', gloss: { en: 'file', es: 'archivo' } },
      { ja: 'フォーク', said: 'fooku', spelled: 'fo-o-ku', gloss: { en: 'fork', es: 'tenedor' } },
    ],
    pair: {
      with: { ja: 'ファン', said: 'fan', gloss: { en: 'a fan (of a team)', es: 'un fan (de un equipo)' } },
      without: { ja: 'ふあん', said: 'fuan', gloss: { en: 'anxiety', es: 'ansiedad' } },
    },
    exception: {
      en: 'ヴ is often replaced by the b column: バイオリン and ヴァイオリン are both in use.',
      es: 'ヴ se reemplaza a menudo por la columna b: se usan tanto バイオリン como ヴァイオリン.',
    },
  },

  'bar': {
    title: { en: 'The long bar ー', es: 'La barra larga ー' },
    rule: {
      en: 'In katakana the bar ー holds the vowel before it for one more beat.',
      es: 'En katakana la barra ー sostiene la vocal anterior durante un tiempo más.',
    },
    examples: [
      { ja: 'コーヒー', said: 'koohii', spelled: 'ko-o-hi-i', gloss: { en: 'coffee', es: 'café' } },
      { ja: 'ラーメン', said: 'raamen', spelled: 'ra-a-me-n', gloss: { en: 'ramen', es: 'ramen' } },
      { ja: 'ケーキ', said: 'keeki', spelled: 'ke-e-ki', gloss: { en: 'cake', es: 'pastel' } },
    ],
    pair: {
      with: { ja: 'ビール', said: 'biiru', gloss: { en: 'beer', es: 'cerveza' } },
      without: { ja: 'ビル', said: 'biru', gloss: { en: 'building', es: 'edificio' } },
    },
    exception: {
      en: 'Casual writing also stretches hiragana with it for effect, as in すごーい.',
      es: 'La escritura informal también la usa para alargar el hiragana, como en すごーい.',
    },
  },

  'repeat-mark': {
    title: { en: 'The repeat mark 々', es: 'La marca de repetición 々' },
    rule: {
      en: '々 repeats the kanji before it, and the repeated reading often starts with a voiced sound: 人々 is ひとびと.',
      es: '々 repite el kanji anterior, y la lectura repetida suele empezar con un sonido sonoro: 人々 es ひとびと.',
    },
    examples: [
      { ja: '人々', kana: 'ひとびと', said: 'hitobito', spelled: 'hi-to-bi-to', gloss: { en: 'people', es: 'la gente' } },
      { ja: '時々', kana: 'ときどき', said: 'tokidoki', spelled: 'to-ki-do-ki', gloss: { en: 'sometimes', es: 'a veces' } },
      { ja: '色々', kana: 'いろいろ', said: 'iroiro', spelled: 'i-ro-i-ro', gloss: { en: 'all sorts of', es: 'de todo tipo' } },
    ],
    exception: {
      en: '々 is not a kanji of its own and has no reading apart from the kanji it repeats.',
      es: '々 no es un kanji propio y no tiene lectura aparte de la del kanji que repite.',
    },
  },

  'special-reading': {
    title: { en: 'Words read as a whole', es: 'Palabras que se leen en bloque' },
    rule: {
      en: 'Some kanji words have a reading that belongs to the whole word, so it cannot be split kanji by kanji.',
      es: 'Algunas palabras en kanji tienen una lectura que pertenece a la palabra entera, así que no se puede dividir kanji por kanji.',
    },
    examples: [
      { ja: '今日', kana: 'きょう', said: 'kyoo', spelled: 'kyo-u', gloss: { en: 'today', es: 'hoy' } },
      { ja: '大人', kana: 'おとな', said: 'otona', spelled: 'o-to-na', gloss: { en: 'adult', es: 'adulto' } },
      { ja: '明日', kana: 'あした', said: 'ashita', spelled: 'a-shi-ta', gloss: { en: 'tomorrow', es: 'mañana' } },
    ],
    exception: {
      en: 'The same kanji can be read piece by piece elsewhere: 今日 is also こんにち in formal writing.',
      es: 'Los mismos kanji pueden leerse uno por uno en otros casos: 今日 también es こんにち en textos formales.',
    },
  },

  'counter-change': {
    title: { en: 'Sound changes with counters', es: 'Cambios de sonido con los contadores' },
    rule: {
      en: 'Some numbers and counters change their sound when they meet: いち and ほん become いっぽん.',
      es: 'Algunos números y contadores cambian de sonido al juntarse: いち y ほん se vuelven いっぽん.',
    },
    examples: [
      { ja: '一本', kana: 'いっぽん', said: 'ippon', spelled: 'i-p-po-n', gloss: { en: 'one (long, thin thing)', es: 'uno (objeto largo y delgado)' } },
      { ja: '三本', kana: 'さんぼん', said: 'sanbon', spelled: 'sa-n-bo-n', gloss: { en: 'three (long, thin things)', es: 'tres (objetos largos y delgados)' } },
      { ja: '六百', kana: 'ろっぴゃく', said: 'roppyaku', spelled: 'ro-p-pya-ku', gloss: { en: 'six hundred', es: 'seiscientos' } },
    ],
    exception: {
      en: 'The changes follow patterns, but each counter has its own set, so learn them with the counter.',
      es: 'Los cambios siguen patrones, pero cada contador tiene los suyos, así que conviene aprenderlos junto con el contador.',
    },
  },
});
