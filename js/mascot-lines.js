// What Hoho, the app's owl, says at a moment: always a real phrase of the
// library (data/phrases/library.json), so every line already has recordings
// in every voice and the meaning and reading are the library's own. No DOM,
// no clock: the caller passes the hour. The moments and the word breaks
// below are original and, like the library, dedicated to CC0.

import { said } from './kana.js';

export const MASCOT_MOMENTS = Object.freeze([
  'morning', 'day', 'evening', 'night', 'welcome', 'start', 'perfect',
  'finish', 'relief', 'retry', 'comfort', 'fun', 'goodbye', 'understood',
]);

// moment: [library phrase id, its kana with a space between words]. The
// romaji is kana.js said over the spaced kana, so it reads in words, as
// Genki writes it (yoroshiku onegaishimasu), and a long vowel never runs
// across two words. Spaced kana that no longer match the library's are not
// used: the line then romanizes the library's kana as it stands.
const LINES = Object.freeze({
  morning: ['ohayou-gozaimasu', 'おはよう ございます'],
  day: ['konnichiwa', 'こんにちは'],
  evening: ['konbanwa', 'こんばんは'],
  night: ['oyasuminasai', 'おやすみなさい'],
  welcome: ['okaerinasai', 'おかえりなさい'],
  start: ['yoroshiku', 'よろしく おねがいします'],
  perfect: ['sugoi', 'すごい'],
  finish: ['otsukaresama', 'おつかれさま です'],
  relief: ['yokatta', 'よかった'],
  retry: ['mou-ichido', 'もう いちど おねがいします'],
  comfort: ['daijoubu-desu', 'だいじょうぶ です'],
  fun: ['tanoshikatta', 'たのしかった です'],
  goodbye: ['jaa-mata', 'じゃあ また'],
  understood: ['wakarimashita', 'わかりました'],
});

// The final は of these two greetings is the old topic particle, said wa
// (the dictionary's `w` flag; library-filter.js tests the same two).
const FINAL_WA = /^(こんにちは|こんばんは)$/u;

/** The phrase Hoho says at `moment`: { moment, id, ja, kana, meaning, romaji }, or null. */
export function mascotLine(library, moment, { lang = 'en' } = {}) {
  if (!MASCOT_MOMENTS.includes(moment)) return null;
  const [id, spaced] = LINES[moment];
  const p = (library?.phrases || []).find((x) => x.id === id);
  if (!p) return null;
  const say = spaced.replace(/ /g, '') === p.kana ? spaced : p.kana;
  return { moment, id, ja: p.ja, kana: p.kana, meaning: p[lang] || p.en, romaji: said(say, { finalWa: FINAL_WA.test(p.kana) }) };
}

/** The greeting for a local hour, 0 to 23: morning 5 to 10, day 11 to 17, evening 18 to 22, night otherwise. */
export function greetingMoment(hour) {
  const h = Math.floor(Number(hour));
  if (h >= 5 && h <= 10) return 'morning';
  if (h >= 11 && h <= 17) return 'day';
  if (h >= 18 && h <= 22) return 'evening';
  return 'night';
}
