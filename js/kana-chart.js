// Shared chart data for the web reference and native kana practice. Section
// titles and the timing marks' words are { en, es }, resolved to the current
// language (strings.js useLang) when the chart is built; ids never change.
import { t } from './strings.js';
import { beats, beatRomaji, toHira, toKata, GENKI_MAP } from './kana.js';

export const GOJUON = Object.freeze([
  'あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの',
  'はひふへほ', 'まみむめも', 'や ゆ よ', 'らりるれろ', 'わ   を', 'ん    ',
]);
export const VOICED = Object.freeze(['がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ']);
export const COMBINED = Object.freeze(['き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'び', 'ぴ']);

export function kanaRomaji(kana) {
  const list = beats(kana);
  return list.map((b, i) => beatRomaji(b, list[i + 1] || '', list[i - 1] || '')).join('');
}

const basic = GOJUON.flatMap((row) => [...row]);
const voiced = VOICED.flatMap((row) => [...row]);
const combined = COMBINED.flatMap((k) => ['ゃ', 'ゅ', 'ょ'].map((y) => k + y));
export const BASIC_KANA = Object.freeze(basic.filter((k) => k !== ' '));
export const PRACTICE_SOUNDS = Object.freeze([...BASIC_KANA, ...voiced, ...combined, 'っ', 'ー', ...Object.keys(GENKI_MAP)]);

export function kanaChart(script = 'hiragana') {
  const show = script === 'katakana' ? toKata : toHira;
  const sections = [
    ['basic', { en: 'Basic kana', es: 'Kana básicos' }, 5, basic],
    ['voiced', { en: 'Voiced sounds', es: 'Sonidos sonoros' }, 5, voiced],
    ['combined', { en: 'Combinations', es: 'Combinaciones' }, 3, combined],
    ['timing', { en: 'Small tsu and long vowels', es: 'Tsu pequeña y vocales largas' }, 2, ['っ', 'ー']],
  ];
  if (script === 'katakana') sections.push(['loan', { en: 'Loanword combinations', es: 'Combinaciones para palabras prestadas' }, 3, Object.keys(GENKI_MAP)]);
  const pause = t({ en: 'pause', es: 'pausa' });
  const longVowel = t({ en: 'long vowel', es: 'vocal larga' });
  return sections.map(([id, title, columns, sounds]) => ({
    id, title: t(title), columns,
    cells: sounds.map((k, i) => ({
      id: k === ' ' ? `${id}-empty-${i}` : k,
      kana: k === ' ' ? '' : show(k),
      romaji: k === 'っ' ? pause : k === 'ー' ? longVowel : kanaRomaji(k),
      // These timing marks need context, not an isolated spoken symbol.
      spoken: k === 'っ' ? 'きって' : k === 'ー' ? 'コーヒー' : ({ 'を': 'お', 'ぢ': 'じ', 'づ': 'ず' }[k] || k),
      example: k === 'っ' ? show('きって') : k === 'ー' ? show('こーひー') : null,
    })),
  }));
}
