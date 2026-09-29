// What the learner is told about each grammar id. Data only; notes.js
// resolves a language and is the module the page imports.
//
// Each note starts from what the learner wants to say, not from the name of
// the form: `meaning` reads "you did something, politely" rather than "polite
// past tense". `pattern` shows how the form is built; one example sentence,
// written here, shows it used. Kanji stay at the level a first-year learner
// meets, because Yomu can read the example back to them.

const n = (title, pattern, meaning, example) => ({ title, pattern, meaning, example });

export const GRAMMAR_NOTES = Object.freeze({
  // ── Particles ──────────────────────────────────────────────────────────
  'topic-wa': n(
    { en: 'は: the topic', es: 'は: el tema' },
    { en: 'noun + は', es: 'sustantivo + は' },
    { en: 'You name what you are talking about, then say something about it.', es: 'Nombras aquello de lo que hablas y luego dices algo sobre eso.' },
    { ja: '猫はかわいいです。', en: 'Cats are cute.', es: 'Los gatos son adorables.' }),
  'subject-ga': n(
    { en: 'が: who or what does it', es: 'が: quién o qué lo hace' },
    { en: 'noun + が', es: 'sustantivo + が' },
    { en: 'You point out who or what does something or is something, often as new information.', es: 'Señalas quién o qué hace o es algo, a menudo como información nueva.' },
    { ja: '雨が降っています。', en: 'It is raining.', es: 'Está lloviendo.' }),
  'object-o': n(
    { en: 'を: what the action falls on', es: 'を: sobre qué recae la acción' },
    { en: 'noun + を + verb', es: 'sustantivo + を + verbo' },
    { en: 'You say what you eat, read, buy or otherwise act on.', es: 'Dices qué comes, lees, compras o sobre qué actúas.' },
    { ja: 'パンを買いました。', en: 'I bought bread.', es: 'Compré pan.' }),
  'direction-e': n(
    { en: 'へ: toward', es: 'へ: hacia' },
    { en: 'place + へ + verb of movement', es: 'lugar + へ + verbo de movimiento' },
    { en: 'You say where you are heading.', es: 'Dices hacia dónde vas.' },
    { ja: '駅へ行きます。', en: 'I am going to the station.', es: 'Voy a la estación.' }),
  'ni': n(
    { en: 'に: at a point, to a target', es: 'に: en un punto, hacia un destino' },
    { en: 'noun + に', es: 'sustantivo + に' },
    { en: 'You pin something to the place where it is, to a time, or to the person or place it goes to.', es: 'Ubicas algo en el lugar donde está, en un momento, o en la persona o el lugar al que va.' },
    { ja: '七時に起きます。', en: 'I get up at seven.', es: 'Me levanto a las siete.' }),
  'de': n(
    { en: 'で: where, or with what', es: 'で: dónde, o con qué' },
    { en: 'noun + で', es: 'sustantivo + で' },
    { en: 'You say where an action happens, or the tool or means you use for it.', es: 'Dices dónde ocurre una acción, o la herramienta o el medio que usas.' },
    { ja: 'バスで学校へ行きます。', en: 'I go to school by bus.', es: 'Voy a la escuela en autobús.' }),
  'de-and': n(
    { en: 'で after a na-adjective: and', es: 'で después de un adjetivo na: y' },
    { en: 'na-adjective + で', es: 'adjetivo na + で' },
    { en: 'You join one description to the next. This で is です in its te-form, not the で of place.', es: 'Unes una descripción con la siguiente. Este で es です en su forma て, no el で de lugar.' },
    { ja: 'この町は静かできれいです。', en: 'This town is quiet and pretty.', es: 'Este pueblo es tranquilo y bonito.' }),
  'to-and': n(
    { en: 'と: and, with', es: 'と: y, con' },
    { en: 'noun + と + noun', es: 'sustantivo + と + sustantivo' },
    { en: 'You list every item, or say who you do something with.', es: 'Enumeras todos los elementos, o dices con quién haces algo.' },
    { ja: '友だちと映画を見ました。', en: 'I watched a film with a friend.', es: 'Vi una película con un amigo.' }),
  'to-quote': n(
    { en: 'と: quoting', es: 'と: para citar' },
    { en: 'sentence + と + 言う / 思う', es: 'oración + と + 言う / 思う' },
    { en: 'You report what someone said, or what you think.', es: 'Cuentas lo que alguien dijo, o lo que piensas.' },
    { ja: '明日は寒いと思います。', en: 'I think it will be cold tomorrow.', es: 'Creo que mañana hará frío.' }),
  'mo': n(
    { en: 'も: also', es: 'も: también' },
    { en: 'noun + も', es: 'sustantivo + も' },
    { en: 'You say the same is true of this too; it takes the place of は, が or を.', es: 'Dices que lo mismo vale para esto; ocupa el lugar de は, が o を.' },
    { ja: '私も行きます。', en: 'I am going too.', es: 'Yo también voy.' }),
  'no': n(
    { en: 'の: of, \'s', es: 'の: de' },
    { en: 'noun + の + noun', es: 'sustantivo + の + sustantivo' },
    { en: 'You join two nouns, the first describing or owning the second.', es: 'Unes dos sustantivos: el primero describe o posee al segundo.' },
    { ja: 'これは姉のかさです。', en: 'This is my older sister\'s umbrella.', es: 'Este es el paraguas de mi hermana mayor.' }),
  'ka-question': n(
    { en: 'か: a question', es: 'か: una pregunta' },
    { en: 'sentence + か', es: 'oración + か' },
    { en: 'You turn a statement into a question; no question mark is needed.', es: 'Conviertes una afirmación en pregunta; no hace falta signo de interrogación.' },
    { ja: 'トイレはどこですか。', en: 'Where is the restroom?', es: '¿Dónde está el baño?' }),
  'ne': n(
    { en: 'ね: right?', es: 'ね: ¿verdad?' },
    { en: 'sentence + ね', es: 'oración + ね' },
    { en: 'You invite the listener to agree, or share a feeling with them.', es: 'Invitas a quien escucha a estar de acuerdo, o compartes un sentimiento.' },
    { ja: '今日は暑いですね。', en: 'It is hot today, isn\'t it?', es: 'Hoy hace calor, ¿verdad?' }),
  'yo': n(
    { en: 'よ: I am telling you', es: 'よ: te lo digo' },
    { en: 'sentence + よ', es: 'oración + よ' },
    { en: 'You give the listener something you think they do not know yet.', es: 'Das a quien escucha algo que crees que todavía no sabe.' },
    { ja: 'この店は安いですよ。', en: 'This shop is cheap, you know.', es: 'Esta tienda es barata, ¿sabes?' }),
  'kara': n(
    { en: 'から: from, because', es: 'から: desde, porque' },
    { en: 'noun + から; sentence + から', es: 'sustantivo + から; oración + から' },
    { en: 'After a noun you say where or when something starts; after a sentence you give a reason.', es: 'Tras un sustantivo dices dónde o cuándo empieza algo; tras una oración das una razón.' },
    { ja: '授業は九時からです。', en: 'Class starts at nine.', es: 'La clase empieza a las nueve.' }),
  'made': n(
    { en: 'まで: until, as far as', es: 'まで: hasta' },
    { en: 'noun + まで', es: 'sustantivo + まで' },
    { en: 'You say where or when something ends.', es: 'Dices dónde o cuándo termina algo.' },
    { ja: '駅まで歩きます。', en: 'I walk as far as the station.', es: 'Camino hasta la estación.' }),
  'yori': n(
    { en: 'より: than', es: 'より: que (al comparar)' },
    { en: 'A は B より + adjective', es: 'A は B より + adjetivo' },
    { en: 'You compare two things and say which one has more of a quality.', es: 'Comparas dos cosas y dices cuál tiene más de una cualidad.' },
    { ja: '今日は昨日より寒いです。', en: 'Today is colder than yesterday.', es: 'Hoy hace más frío que ayer.' }),
  'ya': n(
    { en: 'や: and, among others', es: 'や: y, entre otros' },
    { en: 'noun + や + noun', es: 'sustantivo + や + sustantivo' },
    { en: 'You give a few examples from a longer list.', es: 'Das algunos ejemplos de una lista más larga.' },
    { ja: 'りんごやみかんを買いました。', en: 'I bought apples, tangerines and other things.', es: 'Compré manzanas, mandarinas y otras cosas.' }),
  'kedo': n(
    { en: 'けど: but', es: 'けど: pero' },
    { en: 'sentence + けど', es: 'oración + けど' },
    { en: 'You set up a contrast, or soften what you are about to say.', es: 'Planteas un contraste, o suavizas lo que vas a decir.' },
    { ja: '高いけど、おいしいです。', en: 'It is expensive, but it tastes good.', es: 'Es caro, pero es delicioso.' }),
  'node': n(
    { en: 'ので: since, so', es: 'ので: como, ya que' },
    { en: 'sentence + ので', es: 'oración + ので' },
    { en: 'You give a reason in a softer, more explanatory way than から.', es: 'Das una razón de forma más suave y explicativa que con から.' },
    { ja: '雨なので、うちにいます。', en: 'Since it is raining, I am staying home.', es: 'Como llueve, me quedo en casa.' }),
  'dake': n(
    { en: 'だけ: only', es: 'だけ: solo' },
    { en: 'noun + だけ', es: 'sustantivo + だけ' },
    { en: 'You say that nothing beyond this is involved.', es: 'Dices que no hay nada más allá de esto.' },
    { ja: '水だけ飲みます。', en: 'I only drink water.', es: 'Solo tomo agua.' }),
  'shika': n(
    { en: 'しか: nothing but', es: 'しか: nada más que' },
    { en: 'noun + しか + negative verb', es: 'sustantivo + しか + verbo en negativo' },
    { en: 'You stress that there is only this, often with a sense of too little; the verb is always negative.', es: 'Recalcas que solo hay esto, a menudo con la idea de que es poco; el verbo siempre va en negativo.' },
    { ja: '百円しかありません。', en: 'I have only a hundred yen.', es: 'No tengo más que cien yenes.' }),
  'nado': n(
    { en: 'など: and the like', es: 'など: y cosas así' },
    { en: 'noun + など', es: 'sustantivo + など' },
    { en: 'You hint that there is more of the same kind; it often closes a list made with や.', es: 'Sugieres que hay más de lo mismo; a menudo cierra una lista hecha con や.' },
    { ja: 'ペンやノートなどを買いました。', en: 'I bought pens, notebooks and so on.', es: 'Compré bolígrafos, cuadernos y cosas así.' }),
  'na-prohibition': n(
    { en: 'な: don\'t', es: 'な: no lo hagas' },
    { en: 'verb dictionary form + な', es: 'verbo en forma de diccionario + な' },
    { en: 'You forbid something bluntly, as a sign does or as close friends might.', es: 'Prohíbes algo de forma tajante, como un cartel o entre amigos cercanos.' },
    { ja: '忘れるな。', en: 'Don\'t forget.', es: 'No lo olvides.' }),

  // ── The copula ─────────────────────────────────────────────────────────
  'desu': n(
    { en: 'です: is, politely', es: 'です: es, con cortesía' },
    { en: 'noun or adjective + です', es: 'sustantivo o adjetivo + です' },
    { en: 'You say what something is, or describe it, politely.', es: 'Dices qué es algo, o lo describes, con cortesía.' },
    { ja: '私は学生です。', en: 'I am a student.', es: 'Soy estudiante.' }),
  'deshita': n(
    { en: 'でした: was, politely', es: 'でした: era, con cortesía' },
    { en: 'noun + でした', es: 'sustantivo + でした' },
    { en: 'You say what something was, politely.', es: 'Dices qué era algo, con cortesía.' },
    { ja: '昨日は休みでした。', en: 'Yesterday was a day off.', es: 'Ayer fue día libre.' }),
  'deshou': n(
    { en: 'でしょう: probably', es: 'でしょう: probablemente' },
    { en: 'noun, adjective or verb + でしょう', es: 'sustantivo, adjetivo o verbo + でしょう' },
    { en: 'You say something is likely, or check that the listener agrees, politely.', es: 'Dices que algo es probable, o confirmas que quien escucha está de acuerdo, con cortesía.' },
    { ja: '明日は晴れるでしょう。', en: 'It will probably be sunny tomorrow.', es: 'Mañana probablemente hará sol.' }),
  'darou': n(
    { en: 'だろう: probably, plainly', es: 'だろう: probablemente, en forma llana' },
    { en: 'noun, adjective or verb + だろう', es: 'sustantivo, adjetivo o verbo + だろう' },
    { en: 'You guess that something is likely, in plain speech or when thinking aloud.', es: 'Supones que algo es probable, en habla llana o pensando en voz alta.' },
    { ja: '彼は来ないだろう。', en: 'He probably won\'t come.', es: 'Probablemente él no venga.' }),
  'da': n(
    { en: 'だ: is, plainly', es: 'だ: es, en forma llana' },
    { en: 'noun + だ', es: 'sustantivo + だ' },
    { en: 'You say what something is to friends and family, or in writing.', es: 'Dices qué es algo entre amigos y familia, o por escrito.' },
    { ja: '今日は日曜日だ。', en: 'Today is Sunday.', es: 'Hoy es domingo.' }),
  'datta': n(
    { en: 'だった: was, plainly', es: 'だった: era, en forma llana' },
    { en: 'noun + だった', es: 'sustantivo + だった' },
    { en: 'You say what something was, in plain speech.', es: 'Dices qué era algo, en habla llana.' },
    { ja: 'テストはかんたんだった。', en: 'The test was easy.', es: 'La prueba fue fácil.' }),
  'ja-nai': n(
    { en: 'じゃない: is not, plainly', es: 'じゃない: no es, en forma llana' },
    { en: 'noun + じゃない (ではない)', es: 'sustantivo + じゃない (ではない)' },
    { en: 'You say something is not the case, in plain speech; ではない is the more formal spelling.', es: 'Dices que algo no es así, en habla llana; ではない es la variante más formal.' },
    { ja: 'それはうそじゃない。', en: 'That is not a lie.', es: 'Eso no es mentira.' }),
  'ja-arimasen': n(
    { en: 'じゃありません: is not, politely', es: 'じゃありません: no es, con cortesía' },
    { en: 'noun + じゃありません (ではありません, じゃないです)', es: 'sustantivo + じゃありません (ではありません, じゃないです)' },
    { en: 'You say something is not the case, politely.', es: 'Dices que algo no es así, con cortesía.' },
    { ja: '今日は休みじゃありません。', en: 'Today is not a day off.', es: 'Hoy no es día libre.' }),
  'ja-nakatta': n(
    { en: 'じゃなかった: was not, plainly', es: 'じゃなかった: no era, en forma llana' },
    { en: 'noun + じゃなかった (ではなかった)', es: 'sustantivo + じゃなかった (ではなかった)' },
    { en: 'You say something was not the case, in plain speech.', es: 'Dices que algo no era así, en habla llana.' },
    { ja: '昨日は雨じゃなかった。', en: 'It did not rain yesterday.', es: 'Ayer no llovió.' }),
  'ja-arimasen-deshita': n(
    { en: 'じゃありませんでした: was not, politely', es: 'じゃありませんでした: no era, con cortesía' },
    { en: 'noun + じゃありませんでした (じゃなかったです)', es: 'sustantivo + じゃありませんでした (じゃなかったです)' },
    { en: 'You say something was not the case, politely.', es: 'Dices que algo no era así, con cortesía.' },
    { ja: 'その日は休みじゃありませんでした。', en: 'That day was not a day off.', es: 'Ese día no fue libre.' }),
  'nara': n(
    { en: 'なら: as for, if it is', es: 'なら: en cuanto a, si se trata de' },
    { en: 'noun + なら', es: 'sustantivo + なら' },
    { en: 'You pick up something just mentioned and say what applies to it.', es: 'Retomas algo recién mencionado y dices qué vale para eso.' },
    { ja: 'すしなら、この店がいいですよ。', en: 'If it is sushi you want, this place is good.', es: 'Si buscas sushi, este lugar es bueno.' }),

  // ── Polite endings ─────────────────────────────────────────────────────
  'polite': n(
    { en: '〜ます: the polite verb', es: '〜ます: el verbo cortés' },
    { en: 'verb stem + ます', es: 'raíz verbal + ます' },
    { en: 'You say what you do, or will do, politely.', es: 'Dices lo que haces, o harás, con cortesía.' },
    { ja: '毎日コーヒーを飲みます。', en: 'I drink coffee every day.', es: 'Tomo café todos los días.' }),
  'polite-past': n(
    { en: '〜ました: did, politely', es: '〜ました: hice, con cortesía' },
    { en: 'verb stem + ました', es: 'raíz verbal + ました' },
    { en: 'You did something, and you say it politely.', es: 'Hiciste algo y lo dices con cortesía.' },
    { ja: '昨日すしを食べました。', en: 'I ate sushi yesterday.', es: 'Ayer comí sushi.' }),
  'polite-negative': n(
    { en: '〜ません: do not, politely', es: '〜ません: no hago, con cortesía' },
    { en: 'verb stem + ません', es: 'raíz verbal + ません' },
    { en: 'You do not do something, or will not, and you say it politely.', es: 'No haces algo, o no lo harás, y lo dices con cortesía.' },
    { ja: 'お酒は飲みません。', en: 'I do not drink alcohol.', es: 'No tomo alcohol.' }),
  'polite-past-negative': n(
    { en: '〜ませんでした: did not, politely', es: '〜ませんでした: no hice, con cortesía' },
    { en: 'verb stem + ませんでした', es: 'raíz verbal + ませんでした' },
    { en: 'You did not do something, and you say it politely.', es: 'No hiciste algo y lo dices con cortesía.' },
    { ja: '今朝は朝ごはんを食べませんでした。', en: 'I did not eat breakfast this morning.', es: 'Esta mañana no desayuné.' }),
  'lets': n(
    { en: '〜ましょう: let\'s', es: '〜ましょう: hagamos' },
    { en: 'verb stem + ましょう', es: 'raíz verbal + ましょう' },
    { en: 'You suggest doing something together, politely.', es: 'Propones hacer algo juntos, con cortesía.' },
    { ja: 'いっしょに帰りましょう。', en: 'Let\'s go home together.', es: 'Volvamos juntos a casa.' }),
  'polite-te': n(
    { en: '〜まして: the polite te-form', es: '〜まして: la forma て cortés' },
    { en: 'verb stem + まして', es: 'raíz verbal + まして' },
    { en: 'You link a cause or a first action to what follows, very politely, as in speeches and announcements.', es: 'Unes una causa o una primera acción con lo que sigue, con mucha cortesía, como en discursos y anuncios.' },
    { ja: '遅れまして、すみません。', en: 'I am sorry for being late.', es: 'Disculpe la demora.' }),
  'invitation': n(
    { en: '〜ませんか: won\'t you?', es: '〜ませんか: ¿no quieres...?' },
    { en: 'verb stem + ませんか', es: 'raíz verbal + ませんか' },
    { en: 'You invite someone to do something, leaving them room to say no.', es: 'Invitas a alguien a hacer algo, dejándole espacio para decir que no.' },
    { ja: 'いっしょに昼ごはんを食べませんか。', en: 'Would you like to have lunch together?', es: '¿Almorzamos juntos?' }),
  'offer': n(
    { en: '〜ましょうか: shall I? shall we?', es: '〜ましょうか: ¿lo hago yo? ¿lo hacemos?' },
    { en: 'verb stem + ましょうか', es: 'raíz verbal + ましょうか' },
    { en: 'You offer to do something for someone, or suggest doing it together.', es: 'Te ofreces a hacer algo por alguien, o propones hacerlo juntos.' },
    { ja: '荷物を持ちましょうか。', en: 'Shall I carry your bags?', es: '¿Te llevo el equipaje?' }),

  // ── Plain verb forms ───────────────────────────────────────────────────
  'te-form': n(
    { en: 'The te-form', es: 'La forma て' },
    { en: 'verb + て / で', es: 'verbo + て / で' },
    { en: 'You join actions in order, give a reason, or build a request or another form on it.', es: 'Encadenas acciones en orden, das una razón, o formas sobre ella un pedido u otra forma.' },
    { ja: '朝起きて、シャワーをあびます。', en: 'I get up in the morning and take a shower.', es: 'Me levanto por la mañana y me ducho.' }),
  'te-kudasai': n(
    { en: '〜てください: please do', es: '〜てください: por favor, haz' },
    { en: 'verb te-form + ください', es: 'verbo en forma て + ください' },
    { en: 'You ask someone to do something, politely.', es: 'Pides a alguien que haga algo, con cortesía.' },
    { ja: 'ちょっと待ってください。', en: 'Please wait a moment.', es: 'Espere un momento, por favor.' }),
  'te-iru': n(
    { en: '〜ている: doing now, or the state that remains', es: '〜ている: haciendo ahora, o el estado que queda' },
    { en: 'verb te-form + いる', es: 'verbo en forma て + いる' },
    { en: 'You say an action is going on, or that its result still holds.', es: 'Dices que una acción está en curso, o que su resultado sigue vigente.' },
    { ja: '今テレビを見ています。', en: 'I am watching TV now.', es: 'Ahora estoy viendo la tele.' }),
  'past': n(
    { en: 'The plain past (ta-form)', es: 'El pasado llano (forma た)' },
    { en: 'verb + た / だ', es: 'verbo + た / だ' },
    { en: 'You did something, and you say it plainly.', es: 'Hiciste algo y lo dices en forma llana.' },
    { ja: '昨日本を買った。', en: 'I bought a book yesterday.', es: 'Ayer compré un libro.' }),
  'negative': n(
    { en: 'The plain negative (nai-form)', es: 'El negativo llano (forma ない)' },
    { en: 'verb + ない', es: 'verbo + ない' },
    { en: 'You do not do something, and you say it plainly.', es: 'No haces algo y lo dices en forma llana.' },
    { ja: '今日は行かない。', en: 'I am not going today.', es: 'Hoy no voy.' }),
  'past-negative': n(
    { en: 'The plain past negative', es: 'El pasado negativo llano' },
    { en: 'verb + なかった', es: 'verbo + なかった' },
    { en: 'You did not do something, and you say it plainly.', es: 'No hiciste algo y lo dices en forma llana.' },
    { ja: 'ゆうべは寝なかった。', en: 'I did not sleep last night.', es: 'Anoche no dormí.' }),
  'want': n(
    { en: '〜たい: want to', es: '〜たい: querer' },
    { en: 'verb stem + たい', es: 'raíz verbal + たい' },
    { en: 'You say what you want to do; from there it changes like an adjective.', es: 'Dices lo que quieres hacer; a partir de ahí se conjuga como un adjetivo.' },
    { ja: '日本へ行きたいです。', en: 'I want to go to Japan.', es: 'Quiero ir a Japón.' }),
  'potential': n(
    { en: 'The potential: can do', es: 'El potencial: poder hacer' },
    { en: 'verb + える / られる', es: 'verbo + える / られる' },
    { en: 'You say you are able to do something.', es: 'Dices que puedes hacer algo.' },
    { ja: 'ひらがなが読めます。', en: 'I can read hiragana.', es: 'Puedo leer hiragana.' }),
  'passive': n(
    { en: 'The passive: done to someone', es: 'La pasiva: algo que le hacen a alguien' },
    { en: 'verb + れる / られる', es: 'verbo + れる / られる' },
    { en: 'You say something was done to someone, often with a sense that it affected them.', es: 'Dices que a alguien le hicieron algo, a menudo con la idea de que lo afectó.' },
    { ja: '犬にかまれました。', en: 'I was bitten by a dog.', es: 'Me mordió un perro.' }),
  'causative': n(
    { en: 'The causative: make or let', es: 'El causativo: hacer o dejar que' },
    { en: 'verb + せる / させる', es: 'verbo + せる / させる' },
    { en: 'You say someone makes or lets another person do something.', es: 'Dices que alguien hace o deja que otra persona haga algo.' },
    { ja: '子どもに野菜を食べさせます。', en: 'I have my child eat vegetables.', es: 'Hago que mi hijo coma verduras.' }),
  'volitional': n(
    { en: 'The volitional: let\'s, I will', es: 'El volitivo: vamos a, voy a' },
    { en: 'verb + よう / おう', es: 'verbo + よう / おう' },
    { en: 'You suggest doing something together, or say what you mean to do, plainly.', es: 'Propones hacer algo juntos, o dices lo que piensas hacer, en forma llana.' },
    { ja: 'そろそろ帰ろう。', en: 'Let\'s head home soon.', es: 'Volvamos a casa ya.' }),
  'imperative': n(
    { en: 'The command form', es: 'La forma imperativa' },
    { en: 'verb + ろ, or the e sound of the ending', es: 'verbo + ろ, o el sonido e de la terminación' },
    { en: 'You give a blunt order; it is heard in sports, on signs and in emergencies more than in conversation.', es: 'Das una orden tajante; se oye más en los deportes, en carteles y en emergencias que en la conversación.' },
    { ja: '逃げろ！', en: 'Run for it!', es: '¡Escapa!' }),
  'nasai': n(
    { en: '〜なさい: do it (firmly)', es: '〜なさい: hazlo (con firmeza)' },
    { en: 'verb stem + なさい', es: 'raíz verbal + なさい' },
    { en: 'You tell someone to do something, as a parent or a teacher would.', es: 'Le dices a alguien que haga algo, como lo haría un padre o un docente.' },
    { ja: '早く寝なさい。', en: 'Go to bed now.', es: 'Acuéstate ya.' }),
  'nagara': n(
    { en: '〜ながら: while', es: '〜ながら: mientras' },
    { en: 'verb stem + ながら', es: 'raíz verbal + ながら' },
    { en: 'You do two things at once; the main action comes last.', es: 'Haces dos cosas a la vez; la acción principal va al final.' },
    { ja: '音楽を聞きながら、勉強します。', en: 'I study while listening to music.', es: 'Estudio mientras escucho música.' }),
  'te-shimau': n(
    { en: '〜てしまう / 〜ちゃう: done, for good or for worse', es: '〜てしまう / 〜ちゃう: hecho del todo, para bien o para mal' },
    { en: 'verb te-form + しまう; in casual speech ちゃう / じゃう', es: 'verbo en forma て + しまう; en habla informal, ちゃう / じゃう' },
    { en: 'You say something got done completely, or happened when you wish it had not.', es: 'Dices que algo se hizo por completo, o que pasó aunque no querías.' },
    { ja: 'ケーキを全部食べちゃった。', en: 'I ate the whole cake.', es: 'Me comí todo el pastel.' }),
  'te-miru': n(
    { en: '〜てみる: try it and see', es: '〜てみる: probar a ver' },
    { en: 'verb te-form + みる', es: 'verbo en forma て + みる' },
    { en: 'You do something to find out how it goes; みる is the verb "see".', es: 'Haces algo para ver qué tal resulta; みる es el verbo "ver".' },
    { ja: 'このケーキを食べてみてください。', en: 'Try this cake.', es: 'Prueba este pastel.' }),
  'must': n(
    { en: '〜なければ / 〜なくちゃ: have to', es: '〜なければ / 〜なくちゃ: tener que' },
    { en: 'verb ない form, い dropped, + ければ いけない / ならない; casually なくちゃ or なきゃ', es: 'verbo en forma ない sin la い + ければ いけない / ならない; en habla informal, なくちゃ o なきゃ' },
    { en: 'You say something has to be done. Word for word it is "if I do not, it will not do".', es: 'Dices que algo se tiene que hacer. Palabra por palabra es "si no lo hago, no está bien".' },
    { ja: 'もう帰らなくちゃ。', en: 'I have to go home now.', es: 'Ya me tengo que ir a casa.' }),
  'naide': n(
    { en: '〜ないで: without doing, please don\'t', es: '〜ないで: sin hacer, por favor no' },
    { en: 'verb ない form + で', es: 'verbo en forma ない + で' },
    { en: 'You say something is done without another thing; with ください you ask someone not to do it.', es: 'Dices que algo se hace sin otra cosa; con ください pides a alguien que no lo haga.' },
    { ja: 'ここで写真をとらないでください。', en: 'Please don\'t take photos here.', es: 'Por favor, no tomes fotos aquí.' }),
  'sou': n(
    { en: '〜そう: looks like, about to', es: '〜そう: parece, está por' },
    { en: 'verb stem or adjective without the final い + そう', es: 'raíz verbal o adjetivo sin la い final + そう' },
    { en: 'You say how something looks to you, or that it seems about to happen.', es: 'Dices cómo te parece algo a la vista, o que parece a punto de pasar.' },
    { ja: 'このケーキはおいしそうです。', en: 'This cake looks delicious.', es: 'Este pastel se ve delicioso.' }),
  'sugiru': n(
    { en: '〜すぎる: too much', es: '〜すぎる: demasiado' },
    { en: 'verb stem or adjective without the final い + すぎる', es: 'raíz verbal o adjetivo sin la い final + すぎる' },
    { en: 'You say something goes past the right amount.', es: 'Dices que algo pasa de la medida justa.' },
    { ja: '昨日は食べすぎました。', en: 'I ate too much yesterday.', es: 'Ayer comí demasiado.' }),
  'yasui': n(
    { en: '〜やすい: easy to', es: '〜やすい: fácil de' },
    { en: 'verb stem + やすい', es: 'raíz verbal + やすい' },
    { en: 'You say something is easy to do; it then changes like an adjective.', es: 'Dices que algo es fácil de hacer; luego se conjuga como un adjetivo.' },
    { ja: 'このペンは書きやすいです。', en: 'This pen is easy to write with.', es: 'Con este bolígrafo es fácil escribir.' }),
  'nikui': n(
    { en: '〜にくい: hard to', es: '〜にくい: difícil de' },
    { en: 'verb stem + にくい', es: 'raíz verbal + にくい' },
    { en: 'You say something is hard to do; it then changes like an adjective.', es: 'Dices que algo es difícil de hacer; luego se conjuga como un adjetivo.' },
    { ja: 'このペンは書きにくいです。', en: 'This pen is hard to write with.', es: 'Es difícil escribir con este bolígrafo.' }),
  'tari': n(
    { en: '〜たり〜たり: things like', es: '〜たり〜たり: cosas como' },
    { en: 'plain past + り, twice, + する', es: 'pasado llano + り, dos veces, + する' },
    { en: 'You mention a couple of actions from a longer list.', es: 'Mencionas un par de acciones de una lista más larga.' },
    { ja: '週末はそうじをしたり、買い物をしたりします。', en: 'On weekends I do things like cleaning and shopping.', es: 'Los fines de semana hago cosas como limpiar e ir de compras.' }),

  // ── Conditions ─────────────────────────────────────────────────────────
  'cond-ba': n(
    { en: '〜ば: if', es: '〜ば: si' },
    { en: 'verb e sound + ば; adjective + ければ', es: 'verbo en sonido e + ば; adjetivo + ければ' },
    { en: 'You state a condition, and what follows is its result.', es: 'Planteas una condición y lo que sigue es su resultado.' },
    { ja: '安ければ、買います。', en: 'If it is cheap, I will buy it.', es: 'Si es barato, lo compro.' }),
  'cond-tara': n(
    { en: '〜たら: if, once', es: '〜たら: si, una vez que' },
    { en: 'plain past + ら', es: 'pasado llano + ら' },
    { en: 'You say what happens once something is done, or if it turns out to be true.', es: 'Dices qué pasa una vez que algo se hace, o si resulta ser cierto.' },
    { ja: 'うちに着いたら、電話します。', en: 'I will call when I get home.', es: 'Te llamo cuando llegue a casa.' }),
  'cond-nara': n(
    { en: '〜なら: if that is the case', es: '〜なら: si ese es el caso' },
    { en: 'verb or adjective + なら', es: 'verbo o adjetivo + なら' },
    { en: 'You take what the listener said or plans, and give advice or a reaction on that basis.', es: 'Tomas lo que quien escucha dijo o planea, y das un consejo o una reacción a partir de eso.' },
    { ja: '京都へ行くなら、秋がいいですよ。', en: 'If you are going to Kyoto, autumn is a good time.', es: 'Si vas a Kioto, el otoño es buena época.' }),
  'cond-to': n(
    { en: '〜と: whenever', es: '〜と: siempre que' },
    { en: 'verb dictionary form or ない form + と', es: 'verbo en forma de diccionario o forma ない + と' },
    { en: 'You say one thing always, or naturally, follows another.', es: 'Dices que una cosa siempre, o de forma natural, sigue a otra.' },
    { ja: '春になると、さくらがさきます。', en: 'When spring comes, the cherry trees bloom.', es: 'Cuando llega la primavera, florecen los cerezos.' }),

  // ── Adjective endings ──────────────────────────────────────────────────
  'adj-negative': n(
    { en: 'Adjective negative: 〜くない', es: 'Adjetivo en negativo: 〜くない' },
    { en: 'i-adjective without the final い + くない', es: 'adjetivo en い sin la い final + くない' },
    { en: 'You say something does not have a quality; the たい and ない forms change the same way.', es: 'Dices que algo no tiene una cualidad; las formas en たい y ない cambian igual.' },
    { ja: 'この部屋は広くないです。', en: 'This room is not big.', es: 'Esta habitación no es grande.' }),
  'adj-past': n(
    { en: 'Adjective past: 〜かった', es: 'Adjetivo en pasado: 〜かった' },
    { en: 'i-adjective without the final い + かった', es: 'adjetivo en い sin la い final + かった' },
    { en: 'You say something had a quality in the past.', es: 'Dices que algo tenía una cualidad en el pasado.' },
    { ja: '旅行は楽しかったです。', en: 'The trip was fun.', es: 'El viaje fue divertido.' }),
  'adj-te': n(
    { en: 'Adjective te-form: 〜くて', es: 'Adjetivo en forma て: 〜くて' },
    { en: 'i-adjective without the final い + くて', es: 'adjetivo en い sin la い final + くて' },
    { en: 'You join one description to another, or give it as a reason.', es: 'Unes una descripción con otra, o la das como razón.' },
    { ja: 'この店は安くておいしいです。', en: 'This place is cheap and the food is good.', es: 'En este lugar la comida es barata y rica.' }),
  'adverbial': n(
    { en: 'Adjective as adverb: 〜く', es: 'Adjetivo como adverbio: 〜く' },
    { en: 'i-adjective without the final い + く + verb', es: 'adjetivo en い sin la い final + く + verbo' },
    { en: 'You say how something is done, or what it becomes.', es: 'Dices cómo se hace algo, o en qué se convierte.' },
    { ja: '字を大きく書いてください。', en: 'Please write the letters big.', es: 'Escribe las letras grandes, por favor.' }),
});
