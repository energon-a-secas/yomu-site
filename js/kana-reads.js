// Kana snacks: read a real word written only in hiragana or only in katakana,
// then pick what it means from four English meanings. Six small themes, ten
// questions a round, for fun. No DOM, audio player, storage or clock.
//
// Every word, meaning and note below is original to Yomu and dedicated to
// CC0. Every word already has a recorded clip in the Clear voice
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

import { said } from './kana.js';
import { ROUND, makeRand, shuffle, drawWeighted, weightOf } from './play-rounds.js';

export const KANA_READ_THEMES = Object.freeze([
  { id: 'cafe', script: 'katakana', title: 'Café menu', subtitle: 'Drinks and treats in katakana' },
  { id: 'world', script: 'katakana', title: 'Around the world', subtitle: 'Countries and cities in katakana' },
  { id: 'things', script: 'katakana', title: 'Everyday things', subtitle: 'Loanwords on signs and screens' },
  { id: 'animals', script: 'katakana', title: 'At the zoo', subtitle: 'Animals the way zoos write them' },
  { id: 'sounds', script: 'hiragana', title: 'Sound words', subtitle: 'How things sound and feel, in hiragana' },
  { id: 'everyday', script: 'hiragana', title: 'Everyday words', subtitle: 'Friendly words in hiragana' },
].map((t) => Object.freeze(t)));

// [id, kana, meaning, note]
const ITEMS = {
  cafe: [
    ['coffee', 'コーヒー', 'Coffee', 'Each bar stretches the vowel before it, so コーヒー is said koohii.'],
    ['cake', 'ケーキ', 'Cake', 'Strawberry shortcake, ショートケーキ, is the classic birthday cake in Japan.'],
    ['bread', 'パン', 'Bread', 'パン came from Portuguese pão in the 1500s, long before most English loanwords.'],
    ['pizza', 'ピザ', 'Pizza', 'Some Italian restaurants write ピッツァ, which is closer to the Italian sound.'],
    ['ramen', 'ラーメン', 'Ramen', 'Instant ramen was invented in Japan in 1958.'],
    ['curry', 'カレー', 'Curry', 'Curry on rice, カレーライス, is one of the most loved home meals in Japan.'],
    ['salad', 'サラダ', 'Salad', 'Potato salad, ポテトサラダ, is often clipped to ポテサラ.'],
    ['juice', 'ジュース', 'Juice', 'In everyday Japanese, ジュース can mean almost any sweet soft drink, fizzy or not.'],
    ['sandwich', 'サンドイッチ', 'Sandwich', 'Cafés often shorten it to サンド, as in a cream-filled fruit サンド.'],
    ['hamburger', 'ハンバーガー', 'Hamburger', 'Drop the bun and you have ハンバーグ, a hamburg steak served with rice.'],
    ['chocolate', 'チョコレート', 'Chocolate', 'Usually shortened to チョコ, the classic Valentine\'s Day gift in Japan.'],
    ['milk', 'ミルク', 'Milk', 'In a café ミルク is the milk for your coffee, while the carton at home is usually 牛乳.'],
    ['soup', 'スープ', 'Soup', 'In winter, vending machines sell hot corn soup, コーンスープ, in cans.'],
    ['ice-cream', 'アイスクリーム', 'Ice cream', 'Most people just say アイス, so アイス means ice cream, not ice.'],
    ['doughnut', 'ドーナツ', 'Doughnut', 'The t at the end of doughnut becomes ツ, so the word ends in tsu.'],
    ['pudding', 'プリン', 'Custard pudding', 'プリン is a wobbly custard with caramel sauce, sold in every convenience store.'],
    ['cookie', 'クッキー', 'Cookie', 'The small ッ doubles the k, so クッキー is said kukkii.'],
    ['pasta', 'パスタ', 'Pasta', 'A Japanese favourite is たらこスパゲッティ, spaghetti with salted fish roe.'],
  ],
  world: [
    ['america', 'アメリカ', 'America', 'In kanji the country is shortened to 米, the character for rice, as in 米国.'],
    ['mexico', 'メキシコ', 'Mexico', 'Tacos are タコス in Japanese, plural s and all.'],
    ['brazil', 'ブラジル', 'Brazil', 'Brazil is home to the largest Japanese community outside Japan.'],
    ['italy', 'イタリア', 'Italy', 'Italian food is イタリア料理, often just called イタリアン.'],
    ['france', 'フランス', 'France', 'フランスパン, French bread, is the long crusty loaf in Japanese bakeries.'],
    ['germany', 'ドイツ', 'Germany', 'The name comes from the Dutch word for German, so it sounds nothing like Germany.'],
    ['canada', 'カナダ', 'Canada', 'Maple syrup is メープルシロップ, a sweet souvenir from Canada.'],
    ['chile', 'チリ', 'Chile', 'The same two kana turn up on menus too: チリソース is chili sauce.'],
    ['london', 'ロンドン', 'London', 'Each ン is a beat of its own, so ロンドン has four beats: ro-n-do-n.'],
    ['paris', 'パリ', 'Paris', 'Say it twice, パリパリ, and you have the sound of something crispy.'],
    ['rome', 'ローマ', 'Rome', 'The Roman alphabet is ローマ字, which is where the word romaji comes from.'],
    ['britain', 'イギリス', 'Britain', 'The name comes from Portuguese inglês, the word for English.'],
    ['australia', 'オーストラリア', 'Australia', 'Its koalas and kangaroos are written in katakana too: コアラ, カンガルー.'],
    ['new-york', 'ニューヨーク', 'New York', 'ニュ is ニ plus a small ュ, said as one beat: nyu.'],
    ['india', 'インド', 'India', 'Curry reached Japan by way of Britain, not straight from India.'],
    ['egypt', 'エジプト', 'Egypt', 'Japanese gives its consonants vowels, so Egypt becomes e-ji-pu-to.'],
    ['hawaii', 'ハワイ', 'Hawaii', 'Hawaii is one of the most popular holiday spots for travellers from Japan.'],
    ['greece', 'ギリシャ', 'Greece', 'Greek yogurt is sold in Japan as ギリシャヨーグルト.'],
  ],
  things: [
    ['tv', 'テレビ', 'TV', 'Short for テレビジョン, television: Japanese loves to clip long loanwords.'],
    ['camera', 'カメラ', 'Camera', 'The person behind the camera is a カメラマン, camera man.'],
    ['smartphone', 'スマホ', 'Smartphone', 'Clipped from スマートフォン, smartphone, down to three kana.'],
    ['computer', 'パソコン', 'Computer', 'Short for パーソナルコンピューター, personal computer.'],
    ['game', 'ゲーム', 'Game', 'An arcade is a ゲームセンター, game centre, or ゲーセン for short.'],
    ['hotel', 'ホテル', 'Hotel', 'A capsule hotel, カプセルホテル, rents you a sleeping pod instead of a room.'],
    ['toilet', 'トイレ', 'Toilet', 'Signs may also say お手洗い, a politer word for the same room.'],
    ['bus', 'バス', 'Bus', 'The same katakana also means bath, as in バスタオル, a bath towel.'],
    ['taxi', 'タクシー', 'Taxi', 'In Japan the back door of a taxi opens and closes by itself.'],
    ['elevator', 'エレベーター', 'Elevator', 'Its cousin is エスカレーター, the escalator.'],
    ['konbini', 'コンビニ', 'Convenience store', 'Short for コンビニエンスストア, a shop that sells meals, stamps and concert tickets.'],
    ['notebook', 'ノート', 'Notebook', 'ノート is a notebook, not a short message: a note to someone is a メモ.'],
    ['pen', 'ペン', 'Pen', 'A ballpoint pen is a ボールペン, a ball pen.'],
    ['piano', 'ピアノ', 'Piano', 'Three kana and three beats, pi-a-no, close to the Italian word.'],
    ['shower', 'シャワー', 'Shower', 'シャ is シ plus a small ャ, said as one beat: sha.'],
    ['table', 'テーブル', 'Table', 'Good manners at a meal are テーブルマナー, table manners.'],
    ['restaurant', 'レストラン', 'Restaurant', 'Five beats, re-su-to-ra-n: Japanese gives the s a vowel of its own.'],
    ['news', 'ニュース', 'News', 'It starts with the same ニュー as ニューヨーク.'],
  ],
  animals: [
    ['lion', 'ライオン', 'Lion', 'The final ン is a beat of its own, so ライオン has four: ra-i-o-n.'],
    ['panda', 'パンダ', 'Panda', 'Pandas first came to Tokyo\'s Ueno Zoo in 1972 and drew huge crowds.'],
    ['gorilla', 'ゴリラ', 'Gorilla', 'Japanese uses the ラ row for both l and r, so gorilla becomes gorira.'],
    ['koala', 'コアラ', 'Koala', 'Three beats, ko-a-ra, with no consonant between コ and ア.'],
    ['rabbit', 'ウサギ', 'Rabbit', 'In Japan, the shapes on the full moon are a rabbit pounding rice cakes.'],
    ['tiger', 'トラ', 'Tiger', 'The tiger is one of the twelve animals of the Japanese zodiac.'],
    ['monkey', 'サル', 'Monkey', 'Nikkō\'s famous three wise monkeys see, hear and speak no evil.'],
    ['bear', 'クマ', 'Bear', 'Kumamon, a round black bear, is the mascot of Kumamoto.'],
    ['horse', 'ウマ', 'Horse', 'Horse racing, 競馬, draws big crowds in Japan on weekends.'],
    ['cow', 'ウシ', 'Cow', 'Beef is 牛肉, the kanji for cow followed by the kanji for meat.'],
    ['mouse', 'ネズミ', 'Mouse', 'A real mouse is ネズミ, but the cartoon one is ミッキーマウス.'],
    ['turtle', 'カメ', 'Turtle', 'An old saying gives the crane a thousand years and the turtle ten thousand.'],
    ['shark', 'サメ', 'Shark', 'In parts of western Japan a shark is also called ワニ, the word for crocodile elsewhere.'],
    ['octopus', 'タコ', 'Octopus', 'Takoyaki, たこ焼き, are balls of batter with a piece of octopus inside.'],
    ['pigeon', 'ハト', 'Pigeon', 'Tokyo\'s yellow sightseeing buses are called はとバス, pigeon bus.'],
    ['crow', 'カラス', 'Crow', 'City crows in Japan are famous for raiding rubbish, so many bins wear nets.'],
    ['crane', 'ツル', 'Crane', 'A string of a thousand paper cranes, 千羽鶴, carries a wish for health or peace.'],
    ['duck', 'アヒル', 'Duck', 'The ugly duckling is みにくいアヒルの子 in Japanese.'],
  ],
  sounds: [
    ['dokidoki', 'どきどき', 'Heart pounding', 'Your heart goes どきどき before a test or a first date.'],
    ['wakuwaku', 'わくわく', 'Excited', 'The can\'t-wait feeling before a trip or a festival is わくわく.'],
    ['nikoniko', 'にこにこ', 'Smiling', 'A friend who smiles all the time is always にこにこ.'],
    ['gorogoro', 'ごろごろ', 'Rumbling', 'Thunder rumbles ごろごろ, and lazing around at home all day is ごろごろ too.'],
    ['pokapoka', 'ぽかぽか', 'Sunny and warm', 'Spring sunshine that warms your back is ぽかぽか.'],
    ['hokahoka', 'ほかほか', 'Steaming hot', 'Fresh rice or a just-baked sweet potato is ほかほか.'],
    ['guruguru', 'ぐるぐる', 'Round and round', 'Dizzy eyes in manga are drawn as ぐるぐる spirals.'],
    ['iraira', 'いらいら', 'Irritated', 'Waiting for a late train can make anyone いらいら.'],
    ['butsubutsu', 'ぶつぶつ', 'Grumbling', 'Muttering complaints is ぶつぶつ, and so is a rash of little bumps.'],
    ['boroboro', 'ぼろぼろ', 'Falling apart', 'Old sneakers, a battered book or a tired body can all be ぼろぼろ.'],
    ['kutakuta', 'くたくた', 'Exhausted', 'After a long day of sightseeing, your legs are くたくた.'],
    ['batabata', 'ばたばた', 'In a rush', 'A hectic morning is ばたばた, like wings flapping in a hurry.'],
    ['burabura', 'ぶらぶら', 'Wandering about', 'Strolling around town with no plan is ぶらぶら.'],
    ['bikkuri', 'びっくり', 'Surprised', 'Say びっくりした after a scare: that startled me!'],
    ['gakkari', 'がっかり', 'Disappointed', 'Rain on the day of a picnic makes everyone がっかり.'],
    ['nonbiri', 'のんびり', 'Taking it easy', 'A slow Sunday with nothing planned is のんびり.'],
    ['gussuri', 'ぐっすり', 'Fast asleep', 'After a warm bath you sleep ぐっすり all night.'],
    ['yukkuri', 'ゆっくり', 'Slowly', 'Ask someone to slow down with ゆっくりお願いします.'],
  ],
  everyday: [
    ['ohayou', 'おはよう', 'Good morning', 'Add ございます to make it polite: おはようございます.'],
    ['arigatou', 'ありがとう', 'Thank you', 'The う at the end stretches the o, so it is said arigatoo.'],
    ['oyasumi', 'おやすみ', 'Good night', 'Said when someone goes to bed, never as an evening hello.'],
    ['itadakimasu', 'いただきます', 'Let\'s eat', 'Said with hands together before a meal, thanking everyone who made it possible.'],
    ['gochisousama', 'ごちそうさま', 'Thanks for the meal', 'The partner of いただきます, said when you finish eating.'],
    ['tadaima', 'ただいま', 'I\'m home', 'Say it as you come through the door, and your family answers おかえり.'],
    ['sugoi', 'すごい', 'Amazing', 'Stretch it to すごーい when you are really impressed.'],
    ['oishii', 'おいしい', 'Delicious', 'Say it after the first bite and the cook will smile.'],
    ['kawaii', 'かわいい', 'Cute', 'It covers anything cute, from kittens to tiny erasers.'],
    ['yatta', 'やった', 'I did it', 'Shout やった when you pass a test or win a game.'],
    ['sakura', 'さくら', 'Cherry blossom', 'In spring, friends picnic under the さくら, a custom called お花見.'],
    ['sushi', 'すし', 'Sushi', 'At conveyor-belt sushi, 回転寿司, the plates ride past your seat.'],
    ['gomennasai', 'ごめんなさい', 'I\'m sorry', 'With close friends, ごめん alone is enough.'],
    ['hajimemashite', 'はじめまして', 'Nice to meet you', 'Said only the first time you meet someone, before your name.'],
    ['ureshii', 'うれしい', 'Happy', 'Use it for your own happy feelings, like opening a present.'],
    ['omedetou', 'おめでとう', 'Congratulations', 'Put お誕生日 in front for happy birthday: お誕生日おめでとう.'],
    ['moshimoshi', 'もしもし', 'Hello (on the phone)', 'The phone hello: you would not say it face to face.'],
    ['ocha', 'おちゃ', 'Green tea', 'In Japan お茶 usually means green tea, often served free with meals.'],
  ],
};

const THEMES = new Map(KANA_READ_THEMES.map((t) => [t.id, t]));
const itemsOf = (theme) => (ITEMS[theme] || []).map(([id, kana, en, note]) => ({ id, kana, en, note }));
const roundLength = (theme) => Math.min(ROUND, (ITEMS[theme] || []).length);
const CAP = 1000000;
const count = (n) => (Number.isSafeInteger(n) && n >= 0 && n <= CAP ? n : 0);
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const emptyStats = () => ({ rounds: 0, best: 0, correct: 0, answered: 0, assisted: 0, misses: {} });

/** The themes, each with how many words it holds. */
export function kanaReadThemes() {
  return KANA_READ_THEMES.map((t) => ({ ...t, count: ITEMS[t.id].length }));
}

/** A theme's words, `{ id, kana, en, note }`, or [] for an unknown theme. */
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
    if (this.round && this.round.at < this.round.questions.length) throw new Error('Finish or leave the current round first.');
    if (!THEMES.has(theme)) throw new Error('Choose one of the themes.');
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
    const details = { theme: r.theme, script: theme.script, title: theme.title, position: Math.min(r.at + 1, total), total, result: this.result(), question: null };
    if (r.at === total) return { ...base, status: 'complete', round: details };
    const byId = new Map(itemsOf(r.theme).map((item) => [item.id, item]));
    const q = r.questions[r.at], target = byId.get(q.target), pick = r.picks[r.at];
    const answered = Boolean(pick);
    details.question = {
      id: `${r.id}:${r.at}`, kana: target.kana, answered, hinted: r.hinted,
      romaji: r.hinted || answered ? said(target.kana) : null,
      meaning: answered ? target.en : null, note: answered ? target.note : null,
      correctId: answered ? target.id : null, pickedId: answered ? pick.id : null,
      right: answered ? pick.id === target.id : null,
      options: q.options.map((oid) => ({ id: oid, label: byId.get(oid).en })),
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
