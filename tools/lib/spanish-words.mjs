/**
 * Spanish meanings written for Yomu. AUTHORED, NOT UPSTREAM: nothing here is
 * from JMdict or any other dictionary. Like the notes and the phrase library,
 * it is original to this project and in the public domain (CC0).
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * JMdict has Spanish for about two entries in three of the words Yomu's
 * first tier ships, and not for the commonest grammar words: は, だ, で and ね
 * have none, and は alone is more than half of the word tokens without
 * Spanish in the example sentences (yomu-ios docs/research/SPANISH-MEANINGS.md,
 * measured 2026-11-07). WORDS gives Spanish to those four, then to every
 * entry of the phrase library left without it and to the next most frequent
 * in the sentences, forty in all. With them, the word tokens with a Spanish
 * meaning went from 85.9% to 100% in the phrase library and from 82.4% to
 * 95.8% in the example sentences (every tenth of them, measured 2026-11-08;
 * docs/ANALYZER.md, "Spanish meanings").
 *
 * Each row is [JMdict entry id, the word, its meanings]: at most three, one
 * per sense the English shows, at most 60 characters each (tools/lib/
 * spanish.mjs). The Spanish is neutral Latin American, as yomu-site writes
 * it (no vosotros, no regional words), and describes a grammar word the way
 * the grammar notes do (forma llana, con cortesía). tools/build-spanish.mjs
 * uses a row only where JMdict has no Spanish for the entry, and fails on a
 * row for an entry that has some (that is a correction, below) or on an id
 * JMdict does not have.
 */
export const WORDS = Object.freeze([
  // The four the sentences meet most.
  ['2028920', 'は', ['indica el tema de la oración', 'marca un contraste con otra opción (dicha o no)', 'añade énfasis']],
  ['2089020', 'だ', ['ser, estar (forma llana)']],
  ['2028980', 'で', ['en (el lugar de la acción)', 'en (el momento de la acción)', 'con, por (el medio de la acción)']],
  ['2029080', 'ね', ['¿verdad?, ¿no?', 'oye, mira', '¿sabes?, ¿ves?']],
  // The rest of the phrase library.
  ['1010080', 'はい', ['sí', 'entendido, de acuerdo', 'presente (al pasar lista)']],
  ['2133750', 'よろしくお願いします', ['mucho gusto, cuento contigo', 'por favor, encárgate']],
  ['2845468', 'ありがとうございました', ['gracias (por algo que ya pasó)']],
  ['1583250', 'いいえ', ['no', 'de nada, no hay de qué']],
  ['1625070', '二つ目', ['segundo (de una serie)']],
  ['1002570', 'お疲れ様', ['gracias por tu esfuerzo, buen trabajo', 'hasta luego, nos vemos']],
  ['1001540', 'おめでとうございます', ['felicidades']],
  ['1612030', '申し訳ありません', ['lo siento mucho, no tengo excusa', 'muchas gracias (por la ayuda)']],
  ['2853328', 'お名前', ['nombre (con respeto)']],
  ['2005860', 'もう一度', ['una vez más, otra vez']],
  ['2513640', 'お会計', ['la cuenta (en un restaurante)']],
  ['2423940', 'カフェラテ', ['café latte, café con leche']],
  ['1770030', '持ち帰り', ['para llevar (comida)']],
  ['1189320', '何分', ['qué minuto, cuántos minutos']],
  ['1189260', '何番', ['qué número']],
  ['2131200', 'だっけ', ['¿cómo era?, ¿era...? (al tratar de recordar)', 'recuerdo que..., solía...']],
  ['1554530', 'よかったら', ['si quieres, si te parece bien']],
  ['2820690', 'いい', ['bueno, bien', 'suficiente, listo', 'provechoso, conveniente']],
  // The most frequent left in the example sentences.
  ['2086960', 'って', ['dice que, dicen que (cita informal)', 'aunque (tras un verbo en pasado)', '¿de verdad crees que...?']],
  ['2083990', 'ならない', ['no poder evitar (sentir), muchísimo', 'no se debe...', 'hay que..., tener que...']],
  ['1008590', 'として', ['como (en calidad de)', 'dejando de lado...', 'ni siquiera (con negación)']],
  ['2083570', '中 (じゅう)', ['durante todo (el día, el año)', 'dentro de (esta semana, hoy)', 'por todo (el mundo)']],
  ['1437260', '的', ['-ico, -al (forma adjetivos de sustantivos)', 'parecido a, del tipo de', 'algo así como']],
  ['1009780', 'について', ['sobre, acerca de', 'por cada']],
  ['2028960', 'や', ['y, entre otros (en una lista incompleta)', 'en cuanto, apenas', 'ser, estar']],
  ['1009610', 'にも', ['también, tampoco, incluso', 'por más que (se quiera)']],
  ['1011430', 'べき', ['debería, se debe']],
  ['2086640', 'し', ['y además', 'porque, ya que', 'es que, para empezar']],
  ['2667510', 'よね', ['¿verdad?, ¿no es así?']],
  ['2100900', 'となる', ['convertirse en, llegar a ser']],
  ['1098390', 'バス', ['autobús', 'bus (de datos, en computación)']],
  ['1009640', 'によって', ['según, debido a, por medio de']],
  ['1006200', 'すべき', ['se debería hacer, hay que hacer']],
  ['1004830', 'これら', ['estos, estas']],
  ['2029130', 'ぞ', ['da fuerza o marca una orden (al final)']],
  ['2728330', 'よりも', ['que, en comparación con', 'más que, antes que']],
]);

/**
 * Where JMdict's Spanish is not Spanish a reader should learn from, in words
 * a learner meets in nearly every text, the meanings that replace it. Each
 * row says what JMdict has: these are worth reporting to the EDRDG, and the
 * row can go once JMdict is right.
 */
export const CORRECTIONS = Object.freeze([
  ['1628500', 'です', ['ser, estar (con cortesía)'],
    'JMdict: "copula cortes en japonés" (cópula cortés, without its accents), then "ser; estar"'],
  ['2029010', 'を', ['indica el objeto directo de una acción', 'indica el sujeto de una expresión causativa', 'indica el lugar por donde se pasa'],
    'JMdict\'s third sense: "indica una área transversada", which is not Spanish (un área atravesada)'],
  ['2028990', 'に', ['en (un lugar o un momento)', 'a, hacia (una dirección)', 'para (una finalidad)'],
    'JMdict: one sense, "indica cosas tales cómo ubicación de personas u objetos, ubicación de acciones a corto plazo, etc." (tales como)'],
  ['1576260', '一日 (いちにち)', ['un día', 'todo el día', 'primer día del mes'],
    'JMdict leads with "primer día del mes", which is ついたち; いちにち is one day, the kanji of the day\'s word for 日'],
]);
