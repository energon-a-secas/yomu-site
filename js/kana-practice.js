// Kana-only reading drills. Authored starter lines are original to Yomu and
// dedicated to CC0, like the phrase library. No generated or user text is sent
// to a service. Eligibility checks complete sounds: き does not imply きゃ.
// A starter has an English and a Spanish meaning, as a library phrase does;
// kanaPractice gives the one in the current language (strings.js useLang).
import { t } from './strings.js';
import { beats, toHira, toKata } from './kana.js';
import { PRACTICE_SOUNDS } from './kana-chart.js';

// [id, Japanese, kana, English, Spanish]
const STARTERS = [
  ['no', 'いいえ', 'いいえ', 'No.', 'No.'],
  ['blue-house', '青い家', 'あおい いえ', 'A blue house.', 'Una casa azul.'],
  ['persimmon', '赤い柿', 'あかい かき', 'A red persimmon.', 'Un caqui rojo.'],
  ['here', 'ここ？', 'ここ？', 'Here?', '¿Aquí?'],
  ['big-pond', '大きい池', 'おおきい いけ', 'A big pond.', 'Un estanque grande.'],
  ['morning', '朝', 'あさ', 'Morning.', 'La mañana.'],
  ['sushi', '寿司', 'すし', 'Sushi.', 'Sushi.'],
  ['little', '少し', 'すこし', 'A little.', 'Un poco.'],
  ['small-stone', '小さい石', 'ちいさい いし', 'A small stone.', 'Una piedra pequeña.'],
  ['summer-morning', '夏の朝', 'なつの あさ', 'A summer morning.', 'Una mañana de verano.'],
  ['cat', '猫はここ', 'ねこは ここ', 'The cat is here.', 'El gato está aquí.'],
  ['mountain', '山の上', 'やまの うえ', 'On top of the mountain.', 'En la cima de la montaña.'],
  ['what', 'これは何？', 'これは なに？', 'What is this?', '¿Qué es esto?'],
  ['book', '私の本', 'わたしの ほん', 'My book.', 'Mi libro.'],
  ['snow-night', '雪の夜', 'ゆきの よる', 'A snowy night.', 'Una noche de nieve.'],
  ['rain', '今日は雨', 'きょうは あめ', 'It is rainy today.', 'Hoy llueve.'],
  ['tea', 'お茶を飲みます', 'おちゃを のみます', 'I drink tea.', 'Tomo té.'],
  ['bag', '鞄はどこ？', 'かばんは どこ？', 'Where is the bag?', '¿Dónde está el bolso?'],
  ['ticket', '切符を買います', 'きっぷを かいます', 'I buy a ticket.', 'Compro un boleto.'],
  ['coffee', 'コーヒー', 'こーひー', 'Coffee.', 'Café.'],
].map(([id, ja, kana, en, es]) => ({ id: `kana-${id}`, ja, kana, en, es }));

const sounds = new Set(PRACTICE_SOUNDS);
const layout = /^[\s\p{Punctuation}]+$/u;

/** Null means some text cannot be represented by our selectable sounds. */
export function requiredKana(text) {
  const needed = new Set();
  // Normalize half-width and decomposed kana before splitting into sounds.
  const normalized = toHira(String(text || '').normalize('NFKC'));
  for (const beat of beats(normalized)) {
    if (sounds.has(beat)) needed.add(beat);
    else if (!layout.test(beat)) return null;
  }
  return needed.size ? [...needed] : null;
}

export function practiceCatalog(library) {
  const seen = new Set();
  return [...STARTERS, ...(library?.phrases || [])].filter((p) => {
    const key = toHira(p.kana || '').replace(/[\s\p{Punctuation}]/gu, '');
    if (!key || seen.has(key) || !requiredKana(p.kana)) return false;
    seen.add(key);
    return true;
  });
}

export function kanaPractice(library, { script = 'hiragana', selected = [] } = {}) {
  const have = new Set(selected.filter((s) => sounds.has(s)));
  const show = script === 'katakana' ? toKata : toHira;
  const catalog = practiceCatalog(library);
  const rows = catalog.filter((p) => requiredKana(p.kana).every((s) => have.has(s)));
  return {
    total: catalog.length,
    exercises: rows.map((p) => ({ id: p.id, text: show(p.kana), original: p.ja, meaning: t({ en: p.en, es: p.es }) })),
  };
}
