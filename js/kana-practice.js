// Kana-only reading drills. Authored starter lines are original to Yomu and
// dedicated to CC0, like the phrase library. No generated or user text is sent
// to a service. Eligibility checks complete sounds: き does not imply きゃ.
import { beats, toHira, toKata } from './kana.js';
import { PRACTICE_SOUNDS } from './kana-chart.js';

const STARTERS = [
  ['no', 'いいえ', 'いいえ', 'No.'],
  ['blue-house', '青い家', 'あおい いえ', 'A blue house.'],
  ['persimmon', '赤い柿', 'あかい かき', 'A red persimmon.'],
  ['here', 'ここ？', 'ここ？', 'Here?'],
  ['big-pond', '大きい池', 'おおきい いけ', 'A big pond.'],
  ['morning', '朝', 'あさ', 'Morning.'],
  ['sushi', '寿司', 'すし', 'Sushi.'],
  ['little', '少し', 'すこし', 'A little.'],
  ['small-stone', '小さい石', 'ちいさい いし', 'A small stone.'],
  ['summer-morning', '夏の朝', 'なつの あさ', 'A summer morning.'],
  ['cat', '猫はここ', 'ねこは ここ', 'The cat is here.'],
  ['mountain', '山の上', 'やまの うえ', 'On top of the mountain.'],
  ['what', 'これは何？', 'これは なに？', 'What is this?'],
  ['book', '私の本', 'わたしの ほん', 'My book.'],
  ['snow-night', '雪の夜', 'ゆきの よる', 'A snowy night.'],
  ['rain', '今日は雨', 'きょうは あめ', 'It is rainy today.'],
  ['tea', 'お茶を飲みます', 'おちゃを のみます', 'I drink tea.'],
  ['bag', '鞄はどこ？', 'かばんは どこ？', 'Where is the bag?'],
  ['ticket', '切符を買います', 'きっぷを かいます', 'I buy a ticket.'],
  ['coffee', 'コーヒー', 'こーひー', 'Coffee.'],
].map(([id, ja, kana, en]) => ({ id: `kana-${id}`, ja, kana, en }));

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
    exercises: rows.map((p) => ({ id: p.id, text: show(p.kana), original: p.ja, meaning: p.en })),
  };
}
