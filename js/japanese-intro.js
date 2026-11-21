// A first look at Japanese for someone starting from nothing: one sentence in
// three scripts, then hiragana, katakana, why kanji, the sounds, how a
// sentence works and what to expect. About four minutes of reading, in English
// and in Spanish. Data, plus the function that resolves it for a language the
// way notes.js resolves a note, and the script splitter the first example's
// colours are checked against.
//
// Rules the content keeps (tests/japanese-intro.test.mjs holds them):
//   - every text is { en, es }, and none is empty;
//   - every example's `kana` is the analyzer's reading of its `ja` over the
//     committed data, with no guessed word, so tapping it in the reader shows
//     what the intro says; a kana word keeps its own script (コーヒー stays
//     katakana), a word with kanji is given its reading;
//   - every example's `romaji` is the analyzer's said romaji, a word at a time
//     as the reader shows it (the particle は is wa), since a beginner cannot
//     read kana yet; a word a paragraph or a note asks the reader to say gets
//     its romaji in brackets, unless an example beside it already shows it;
//   - every number is the data's: 46 is kana-chart.js BASIC_KANA, 2,136 is
//     data/kanji/joyo.json, and "most kanji have more than one reading" is
//     KANJIDIC's count over the jōyō list;
//   - examples that the recorded voices already cover are preferred, and the
//     test reports how many are.
//
// No DOM and no browser global is touched at load: the iOS app's bridge
// imports this module into a bare JavaScriptCore context.

import { isKanji, isHiragana, isKatakana } from './kana.js';

export const LANGS = Object.freeze(['en', 'es']);

/** The scripts a part of a Japanese string is coloured as. */
export const INTRO_SCRIPTS = Object.freeze(['kanji', 'hiragana', 'katakana', 'other']);

const freeze = (v) => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
};

const p = (en, es) => ({ en, es });

export const INTRO = freeze({
  sections: [
    {
      id: 'scripts',
      title: p('One sentence, three scripts', 'Una oración, tres escrituras'),
      body: [
        p('Japanese is written with three scripts, often all in one sentence. Each has its own job: kanji carry the meaning, hiragana carries the grammar around them, and katakana writes words from other languages.',
          'El japonés usa tres escrituras, muchas veces en una misma oración. Cada una tiene su función: los kanji aportan el significado, el hiragana marca la gramática que los rodea y el katakana escribe palabras de otros idiomas.'),
        p('It looks like three systems. In fact it is two small sets of kana (hiragana and katakana) for the same sounds, and one large set of characters you learn a word at a time.',
          'Parecen tres sistemas. En realidad son dos conjuntos pequeños de kana (hiragana y katakana) para los mismos sonidos, y uno grande de caracteres que aprendes palabra por palabra.'),
      ],
      examples: [
        {
          ja: '私はコーヒーを飲みます。',
          kana: 'わたしはコーヒーをのみます。',
          romaji: 'watashi wa koohii o nomimasu.',
          en: 'I drink coffee.',
          es: 'Yo tomo café.',
          note: p('Kanji: 私 (I) and 飲 (drink). Hiragana: は, を and みます, so 飲みます is one word in two scripts. Katakana: コーヒー (coffee).',
            'Kanji: 私 (yo) y 飲 (beber). Hiragana: は, を y みます, así que 飲みます junta dos escrituras en una sola palabra. Katakana: コーヒー (café).'),
          parts: [
            { text: '私', script: 'kanji' },
            { text: 'は', script: 'hiragana' },
            { text: 'コーヒー', script: 'katakana' },
            { text: 'を', script: 'hiragana' },
            { text: '飲', script: 'kanji' },
            { text: 'みます', script: 'hiragana' },
            { text: '。', script: 'other' },
          ],
        },
      ],
    },
    {
      id: 'hiragana',
      title: p('Hiragana: the sounds and the grammar', 'Hiragana: los sonidos y la gramática'),
      body: [
        p('Hiragana writes the sounds of Japanese: 46 basic kana, plus a few marks that make more, like the two dots ゛ that turn か (ka) into が (ga). Each kana is a sound, not a meaning, and any Japanese word can be written with them.',
          'El hiragana escribe los sonidos del japonés: 46 kana básicos, más unas pocas marcas que forman otros, como los dos puntos ゛ que convierten か (ka) en が (ga). Cada kana es un sonido, no un significado, y con ellos se puede escribir cualquier palabra japonesa.'),
        p('In a sentence it writes the grammar: the endings of verbs and adjectives, and small words called particles, like は (wa) and を (o). It also writes words usually spelled without kanji, like ありがとう. Books for small children are mostly in hiragana. So is furigana: the small kana printed over or beside a kanji to show how it is read.',
          'En una oración escribe la gramática: las terminaciones de verbos y adjetivos, y unas palabras pequeñas llamadas partículas, como は (wa) y を (o). También escribe palabras que suelen ir sin kanji, como ありがとう. Los libros para niños pequeños están escritos sobre todo en hiragana. El furigana también suele ir en hiragana: son los kana pequeños que se imprimen sobre un kanji o a su lado para mostrar cómo se lee.'),
      ],
      examples: [
        {
          ja: '飲みます',
          kana: 'のみます',
          romaji: 'nomimasu',
          en: 'I drink',
          es: 'tomo',
          note: p('飲 carries the meaning, drink. The hiragana after it is the ending, and it changes: 飲みました (nomimashita) means I drank.',
            '飲 aporta el significado, beber. El hiragana que le sigue es la terminación, que cambia: 飲みました (nomimashita) es tomé.'),
        },
        {
          ja: 'ありがとう',
          kana: 'ありがとう',
          romaji: 'arigatoo',
          en: 'thank you',
          es: 'gracias',
        },
      ],
    },
    {
      id: 'katakana',
      title: p('Katakana: the same sounds, other shapes', 'Katakana: los mismos sonidos, otras formas'),
      body: [
        p('Katakana writes the same sounds as hiragana in more angular shapes: か and カ are both ka. Both sets were made from kanji over a thousand years ago: か is a flowing form of 加, and カ is its left side.',
          'El katakana escribe los mismos sonidos que el hiragana con formas más angulosas: か y カ se leen ka. Los dos conjuntos nacieron de los kanji hace más de mil años: か es una forma fluida de 加, y カ es su parte izquierda.'),
        p('It writes words from other languages (many from English, but not all), foreign names and lots of sound words. It can also make a word stand out, the way italics do.',
          'Escribe palabras de otros idiomas (muchas vienen del inglés, pero no todas), nombres extranjeros y muchas onomatopeyas. También puede resaltar una palabra, como la cursiva.'),
      ],
      examples: [
        {
          ja: 'パン',
          kana: 'パン',
          romaji: 'pan',
          en: 'bread',
          es: 'pan',
          note: p('From Portuguese pão.', 'Del portugués pão.'),
        },
        {
          ja: 'マリア',
          kana: 'マリア',
          romaji: 'maria',
          en: 'Maria',
          es: 'María',
          note: p('Most foreign names are written in katakana, so yours probably is too.',
            'La mayoría de los nombres extranjeros se escriben en katakana, así que seguramente el tuyo también.'),
        },
        {
          ja: 'ドキドキ',
          kana: 'ドキドキ',
          romaji: 'dokidoki',
          en: 'thump-thump: a racing heart',
          es: 'pum, pum: el corazón acelerado',
          note: p('A sound word.', 'Una onomatopeya.'),
        },
      ],
    },
    {
      id: 'kanji',
      title: p('Kanji: why Japanese uses them', 'Kanji: por qué los usa el japonés'),
      body: [
        p('Kanji came from China at a time when Japanese had no writing of its own. Each one stands for a meaning, just as 3 means the same whether you say three or tres. Most kanji also have more than one reading. The kun reading is the Japanese word for the meaning and is usual when the kanji stands alone. The on reading is adapted from the Chinese sound and is usual in words of several kanji.',
          'Los kanji llegaron de China cuando el japonés todavía no tenía escritura propia. Cada uno representa un significado, como el 3, que quiere decir lo mismo si dices tres o three. La mayoría de los kanji también tiene más de una lectura. La lectura kun es la palabra japonesa para ese significado y es la habitual cuando el kanji va solo. La lectura on es una adaptación del sonido chino y es la habitual en palabras de varios kanji.'),
        p('They are worth it: many words sound alike, and Japanese is written without spaces. Kanji show which word is meant and help the eye find where each word starts.',
          'Y valen la pena: muchas palabras suenan igual y el japonés se escribe sin espacios. Los kanji dejan claro qué palabra es y ayudan a ver dónde empieza cada una.'),
        p('Since 2010, Japan\'s official list for everyday writing, the jōyō kanji, has 2,136. You can start with a handful, in the words you meet, with furigana until you know them.',
          'Desde 2010, la lista oficial de kanji de uso diario en Japón, llamada jōyō, tiene 2136. Puedes empezar con unos pocos, en las palabras que vayas encontrando, con furigana hasta que los reconozcas.'),
      ],
      examples: [
        {
          ja: '山',
          kana: 'やま',
          romaji: 'yama',
          en: 'mountain',
          es: 'montaña',
          note: p('Alone it is read やま, its kun reading. In 富士山, Mount Fuji, it is read さん (san), its on reading.',
            'Cuando va solo, se lee やま, su lectura kun. En 富士山, el monte Fuji, se lee さん (san), su lectura on.'),
        },
        {
          ja: '紙・髪・神',
          kana: 'かみ・かみ・かみ',
          romaji: 'kami kami kami',
          en: 'paper, hair, god',
          es: 'papel, pelo, dios',
          note: p('Three words written かみ in kana: the kanji tell them apart.',
            'Tres palabras que se escriben かみ en kana: los kanji las distinguen.'),
        },
        {
          ja: '李も桃も桃のうち',
          kana: 'すもももももももものうち',
          romaji: 'sumomo mo momo mo momo no uchi',
          en: 'Plums and peaches are both kinds of peach.',
          es: 'Las ciruelas y los duraznos son tipos de durazno.',
          note: p('A tongue twister. Written all in kana, it is a row of も; the kanji show where each word starts.',
            'Un trabalenguas. Escrito todo en kana, es una fila de も; los kanji muestran dónde empieza cada palabra.'),
        },
      ],
    },
    {
      id: 'sounds',
      title: p('Sounds: count the beats', 'Sonidos: cuenta los pulsos'),
      body: [
        p('Japanese is timed in beats, one per kana. A small ゃ, ゅ or ょ (ya, yu, yo) shares a beat with the kana before it: とうきょう, Tokyo, has four beats, to-u-kyo-u. A う after an o makes the o long, so it is said to-o-kyo-o.',
          'El japonés se mide en pulsos, uno por kana. Una ゃ, ゅ o ょ pequeña (ya, yu, yo) comparte el pulso del kana anterior: とうきょう, Tokio, tiene cuatro, to-u-kyo-u. Una う después de o alarga la o, así que se dice to-o-kyo-o.'),
        p('The five vowels, a, i, u, e and o, are close to the Spanish ones (the u with the lips less rounded). The r is one quick tap, like the r in Spanish pero or the tt in American English butter.',
          'Aquí llevas ventaja: las cinco vocales se parecen mucho a las del español (la u, con los labios menos redondeados). Y la r es un solo toque rápido, como la r de pero, nunca la rr de perro.'),
        p('What is new is length: a long vowel or a small っ is a beat of its own, and dropping it can change the word. Pitch, high and low, matters too, but you can start without it and pick it up by listening.',
          'Lo nuevo es la duración. En español, alargar una vocal no cambia el significado. En japonés, una vocal larga o una っ pequeña es un pulso más, y sin ese pulso la palabra puede ser otra. El tono, alto y bajo, también importa, pero puedes empezar sin él e irlo captando al escuchar.'),
      ],
      examples: [
        {
          ja: 'おばさん・おばあさん',
          kana: 'おばさん・おばあさん',
          romaji: 'oba san obaasan',
          en: 'aunt, grandmother',
          es: 'tía, abuela',
          note: p('Four beats, o-ba-sa-n, then five, o-ba-a-sa-n: a different person.',
            'Cuatro pulsos, o-ba-sa-n, y luego cinco, o-ba-a-sa-n: otra persona.'),
        },
        {
          ja: 'きって・きて',
          kana: 'きって・きて',
          romaji: 'kitte kite',
          en: 'postage stamp, come',
          es: 'sello postal, ven',
          note: p('Three beats, ki-t-te, with a short stop at っ; then two, ki-te.',
            'Tres pulsos, ki-t-te, con una pausa breve en la っ; luego dos, ki-te.'),
        },
        {
          ja: '箸・橋',
          kana: 'はし・はし',
          romaji: 'hashi hashi',
          en: 'chopsticks, bridge',
          es: 'palillos, puente',
          note: p('Told apart by pitch: in Tokyo speech, high then low is chopsticks, low then high is bridge.',
            'Se distinguen por el tono: en el habla de Tokio, alto y luego bajo es palillos; bajo y luego alto, puente.'),
        },
      ],
    },
    {
      id: 'sentence',
      title: p('How a sentence works', 'Cómo funciona una oración'),
      body: [
        p('The verb comes last. Particles, the small words placed after a word, show that word\'s role. は marks the topic, what the sentence is about, and is said wa. を marks what the action falls on and is said o.',
          'El verbo va al final. Las partículas son palabras pequeñas que van detrás de una palabra y muestran qué papel cumple. は marca el tema, de qué trata la oración, y se dice wa. を marca sobre qué recae la acción y se dice o.'),
        p('です (desu) and ます (masu) make a sentence polite, and most learners start with that style. Between friends, people use plain forms, like 飲む (nomu) for 飲みます.',
          'です (desu) y ます (masu) hacen cortés una oración, y la mayoría empieza a aprender por ese estilo. Entre amigos se usan formas llanas, como 飲む (nomu) en vez de 飲みます.'),
        p('The subject is often left out when it is clear, and the verb does not change with the person. 飲みます can mean I drink, you drink, she drinks or we drink.',
          'Como en español, el sujeto se omite cuando está claro. El japonés va más allá: el verbo no cambia según la persona, así que 飲みます puede ser tomo, tomas, toma o tomamos.'),
      ],
      examples: [
        {
          ja: '私はコーヒーを飲みます。',
          kana: 'わたしはコーヒーをのみます。',
          romaji: 'watashi wa koohii o nomimasu.',
          en: 'I drink coffee.',
          es: 'Yo tomo café.',
          note: p('Word for word: I (topic) coffee (object) drink.',
            'Palabra por palabra: yo (tema) café (objeto) tomo.'),
        },
        {
          ja: 'コーヒーを飲みますか。はい、飲みます。',
          kana: 'コーヒーをのみますか。はい、のみます。',
          romaji: 'koohii o nomimasu ka. hai, nomimasu.',
          en: 'Do you drink coffee? Yes, I do.',
          es: '¿Tomas café? Sí, tomo.',
          note: p('か makes a question. Neither sentence says who, and the verb is the same in both.',
            'か convierte la oración en pregunta. Ninguna de las dos dice quién, y el verbo es el mismo en ambas.'),
        },
      ],
    },
    {
      id: 'path',
      title: p('What to expect', 'Qué te espera'),
      body: [
        p('Start with hiragana, then katakana: both are small sets you can finish. Kanji come after, a few at a time, in the words you meet rather than from a list. They keep coming for as long as you read.',
          'Empieza por el hiragana y sigue con el katakana: los dos son conjuntos pequeños que puedes aprender completos. Después vienen los kanji, unos pocos a la vez, en las palabras que vayas encontrando y no en una lista. Y siguen llegando mientras leas.'),
        p('Romaji, Japanese written in Latin letters, helps at the start, but Japanese is not written that way. Lean on it less as the kana settle in.',
          'El romaji, el japonés escrito con letras latinas, ayuda al principio, pero el japonés no se escribe así. Úsalo cada vez menos a medida que los kana se te hagan familiares.'),
        p('In Naninani, paste or scan Japanese in Read to see furigana over the kanji and romaji under each word. Tap any word for its meaning, sounds and kanji. Practise the kana in Learn, under Hiragana & Katakana.',
          'En Naninani, pega o escanea japonés en Leer para ver furigana sobre los kanji y romaji debajo de cada palabra. Toca cualquier palabra para ver su significado, sus sonidos y sus kanji. Practica los kana en Hiragana y katakana, dentro de Aprender.'),
      ],
      examples: [
        {
          ja: 'ひらがなが読めます。',
          kana: 'ひらがながよめます。',
          romaji: 'hiragana ga yomemasu.',
          en: 'I can read hiragana.',
          es: 'Puedo leer hiragana.',
          note: p('A first goal within reach.', 'Una primera meta a tu alcance.'),
        },
        {
          ja: '少しずつ',
          kana: 'すこしずつ',
          romaji: 'sukoshizutsu',
          en: 'little by little',
          es: 'poco a poco',
        },
      ],
    },
  ],
});

// ── Scripts ───────────────────────────────────────────────────────────────

/** The script one character is coloured as: kanji (々 and ヶ included), hiragana, katakana (ー included) or other. */
export function scriptOf(ch) {
  if (isKanji(ch)) return 'kanji';
  if (isHiragana(ch)) return 'hiragana';
  if (isKatakana(ch)) return 'katakana';
  return 'other';
}

/** A string cut into runs of one script: 飲みます is [飲 kanji, みます hiragana]. */
export function scriptParts(text) {
  const out = [];
  for (const ch of String(text ?? '')) {
    const script = scriptOf(ch);
    const last = out[out.length - 1];
    if (last && last.script === script) last.text += ch;
    else out.push({ text: ch, script });
  }
  return out;
}

// ── One language ──────────────────────────────────────────────────────────

/**
 * The intro with every { en, es } replaced by a string in `lang`.
 *
 * @param {string} lang   'en' or 'es'; anything else reads as English
 * @param {object} intro  the content, INTRO unless a test passes its own
 * @returns {{ lang, fallback, sections }} sections as [{ id, title, body:
 *          [string], examples: [{ ja, kana, romaji, translation, note?,
 *          parts? }] }]; `fallback` is true when any string was missing in
 *          `lang` and the English stood in, as in notes.js noteFor
 */
export function introFor(lang = 'en', intro = INTRO) {
  const want = LANGS.includes(lang) ? lang : 'en';
  let fallback = want !== lang;
  const pick = (v) => {
    if (typeof v === 'string') return v;
    if (v && typeof v[want] === 'string' && v[want]) return v[want];
    if (want !== 'en') fallback = true;
    return v && typeof v.en === 'string' ? v.en : '';
  };
  const example = (e) => {
    const r = { ja: e.ja, kana: e.kana, romaji: e.romaji || '', translation: pick({ en: e.en, es: e.es }) };
    if (e.note) r.note = pick(e.note);
    if (e.parts) r.parts = e.parts.map((x) => ({ text: x.text, script: x.script }));
    return r;
  };
  const sections = ((intro && intro.sections) || []).map((s) => ({
    id: s.id,
    title: pick(s.title),
    body: (s.body || []).map(pick),
    examples: (s.examples || []).map(example),
  }));
  return { lang: want, fallback, sections };
}
