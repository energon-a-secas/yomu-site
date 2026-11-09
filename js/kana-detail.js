// Explain a sound from the same morae and romaji used by the reader.
// The explanations are { en, es }, in `lang`, which defaults to the current
// language (strings.js useLang), as the notes do.
import { t, currentLang } from './strings.js';
import { beats, toHira, isKana } from './kana.js';
import { kanaRomaji } from './kana-chart.js';
import { noteFor, SOUND_NOTES } from './notes.js';

const BIG = Object.freeze({'ゃ':'や','ゅ':'ゆ','ょ':'よ','ぁ':'あ','ぃ':'い','ぅ':'う','ぇ':'え','ぉ':'お','ゎ':'わ'});

export function kanaDetail(text, lang = currentLang(), extraRules = []) {
  const list = beats(String(text).normalize('NFKC'));
  const rules = new Set(extraRules.filter(id => Object.hasOwn(SOUND_NOTES, id)));
  const say = (words) => t(words, lang);
  const parts = list.filter(b => [...b].every(isKana)).map((kana, index) => {
    const hira = toHira(kana);
    let explanation = say({
      en: 'One kana represents a sound, not a word with a fixed meaning.',
      es: 'Un kana representa un sonido, no una palabra con un significado fijo.',
    });
    let formula = null;
    let romaji = kanaRomaji(kana);
    let spoken = hira === 'っ' ? 'きって' : hira === 'ー' ? 'コーヒー' : ({'を':'お','ぢ':'じ','づ':'ず'}[hira] || kana);
    if (hira.length === 2 && BIG[hira[1]]) {
      const left = kanaRomaji(kana[0]);
      const right = kanaRomaji(BIG[hira[1]]);
      const small = say({ en: `small ${right}`, es: `${right} pequeña` });
      formula = `${kana[0]} (${left}) + ${kana[1]} (${small}) = ${kana} (${romaji})`;
      explanation = say({
        en: 'These two characters make one combined beat. Keep the second kana small.',
        es: 'Estos dos caracteres forman un solo pulso combinado. El segundo kana se escribe pequeño.',
      });
      rules.add('ゃゅょ'.includes(hira[1]) ? 'youon' : 'foreign-sound');
    } else if (hira === 'っ') {
      explanation = say({
        en: 'A small tsu holds the following consonant for one beat. It is not a separate tsu syllable.',
        es: 'Una tsu pequeña sostiene la consonante siguiente durante un pulso. No es una sílaba tsu aparte.',
      });
      rules.add('small-tsu');
    } else if (hira === 'ー') {
      explanation = say({
        en: 'Hold the vowel before this mark for one extra beat.',
        es: 'Sostén la vocal que va antes de esta marca durante un pulso más.',
      });
      rules.add('bar');
    }
    const decomposed = [...kana[0].normalize('NFD')];
    if (decomposed[1] === '\u3099' || decomposed[1] === '\u309a') {
      const dotted = decomposed[1] === '\u3099';
      const mark = dotted ? '゛' : '゜';
      rules.add(dotted ? 'dakuten' : 'handakuten');
      if (!formula) {
        formula = `${decomposed[0]} (${kanaRomaji(decomposed[0])}) + ${mark} = ${kana} (${romaji})`;
        explanation = dotted
          ? say({ en: 'The two dots change the consonant to its voiced sound.', es: 'Los dos puntos cambian la consonante por su sonido sonoro.' })
          : say({ en: 'The small circle changes an h-row sound to p.', es: 'El pequeño círculo convierte un sonido de la fila h en p.' });
      }
    }
    // A chart は is ha; the same glyph tapped as a topic particle is wa.
    // Context is supplied by the analyzer's rule ids, never inferred here.
    for (const [glyph, rule, said, sound] of [['は','particle-wa','wa','わ'], ['へ','particle-e','e','え'], ['を','particle-o','o','お']]) {
      if (hira === glyph && rules.has(rule)) {
        romaji = said;
        spoken = sound;
        explanation = say({
          en: `${kana} is pronounced ${said} here because it is a particle. The spelling stays ${kana}.`,
          es: `Aquí ${kana} se pronuncia ${said} porque es una partícula. Se sigue escribiendo ${kana}.`,
        });
      }
    }
    return {id: index, kana,
      romaji: hira === 'っ' ? say({ en: 'held beat', es: 'pulso sostenido' }) : hira === 'ー' ? say({ en: 'long vowel', es: 'vocal larga' }) : romaji,
      formula, explanation, spoken};
  });
  return { parts, notes: [...rules].map(id => noteFor('sound', id, lang)).filter(Boolean) };
}

export function soundRules(lang = currentLang()) {
  return Object.keys(SOUND_NOTES).map(id => ({id, note: noteFor('sound', id, lang)}));
}
