// Kana snacks (js/kana-reads.js): the authored words, their recordings, and
// rounds that follow kana-games.js.
//
//   node --test tests/kana-reads.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KanaReads, KANA_READ_THEMES, kanaReadThemes, kanaReadItems } from '../js/kana-reads.js';
import { said } from '../js/kana.js';
import { ROUND } from '../js/play-rounds.js';
import { normalizeAudio, addShard, shardsFor, keysOf, clipInVoice, clipByKeys } from '../js/audio.js';

const ROOT = new URL('../', import.meta.url);
const SCRIPT = { hiragana: /^[ぁ-ゖー]+$/u, katakana: /^[ァ-ヺー]+$/u };
/** The character is named, never written, so this file passes its own rule. */
const EM_DASH = String.fromCharCode(0x2014);
/** The house copy rule, assembled from halves as tests/library.test.mjs does. */
const BANNED = new RegExp(`\\b(${['power' + 'ful', 'seam' + 'less', 'lever' + 'ages?', 'rob' + 'ust', 'util' + 'i[sz]e[sd]?'].join('|')})\\b`, 'i');

const question = (g) => g.view().round.question;
const target = (g) => g.dump().round.questions[g.dump().round.at].target;
const reload = (g) => new KanaReads(JSON.parse(JSON.stringify(g.dump())));
const act = (g, action, extra = {}) => g.act(action, { id: question(g).id, ...extra });
const wrong = (g) => question(g).options.find((o) => o.id !== target(g)).id;

for (const theme of KANA_READ_THEMES) {
  test(`${theme.id}: a round of ${ROUND} plays to the end, survives every relaunch and records once`, () => {
    let g = new KanaReads();
    g.start({ theme: theme.id, seed: 31 });
    const items = new Map(kanaReadItems(theme.id).map((item) => [item.id, item]));
    const seen = [];
    for (let n = 0; n < ROUND; n++) {
      const q = question(g);
      assert.equal(g.view().round.position, n + 1);
      assert.equal(g.view().round.script, theme.script);
      assert.equal(g.view().round.title, theme.title);
      assert.equal(q.answered, false);
      assert.deepEqual([q.romaji, q.meaning, q.note, q.correctId, q.pickedId, q.right], [null, null, null, null, null, null]);
      assert.equal(q.options.length, 4);
      assert.ok(q.options.some((o) => o.id === target(g)));
      assert.equal(new Set(q.options.map((o) => o.label)).size, 4, 'four different meanings');
      assert.ok(q.options.every((o) => items.get(o.id).en === o.label));
      assert.equal(q.kana, items.get(target(g)).kana);
      seen.push(target(g));
      act(g, 'answer', { pick: target(g) });
      g = reload(g);
      const a = question(g);
      assert.deepEqual([a.answered, a.right, a.correctId, a.pickedId], [true, true, target(g), target(g)]);
      assert.equal(a.romaji, said(a.kana));
      assert.equal(a.meaning, items.get(target(g)).en);
      assert.equal(a.note, items.get(target(g)).note);
      act(g, 'next');
      g = reload(g);
    }
    assert.equal(new Set(seen).size, ROUND, 'no word twice in a round answered right');
    assert.equal(g.view().status, 'complete');
    assert.equal(g.view().round.question, null);
    assert.deepEqual(g.view().round.result, { correct: ROUND, assisted: 0, skipped: 0, total: ROUND });
    assert.deepEqual(g.dump().stats[theme.id], { rounds: 1, best: ROUND, correct: ROUND, answered: ROUND, assisted: 0, misses: {} });
    const restored = reload(g);
    restored.act('next', { id: `${restored.dump().round.id}:${ROUND - 1}` });
    assert.equal(restored.dump().stats[theme.id].rounds, 1, 'a finished round records once');
    restored.start({ theme: theme.id, seed: 32 });
    assert.equal(restored.view().status, 'playing');
  });
}

test('every word is kana of its theme\'s script only, with its own meaning and a short note', () => {
  assert.deepEqual(KANA_READ_THEMES.map((t) => t.id), ['cafe', 'world', 'things', 'animals', 'sounds', 'everyday']);
  assert.ok(Object.isFrozen(KANA_READ_THEMES) && KANA_READ_THEMES.every((t) => Object.isFrozen(t)));
  const ids = new Set();
  for (const theme of kanaReadThemes()) {
    const items = kanaReadItems(theme.id);
    assert.equal(theme.count, items.length);
    assert.ok(items.length >= 12 && items.length <= 18, `${theme.id}: ${items.length} words`);
    assert.ok(theme.title && theme.subtitle);
    assert.equal(new Set(items.map((i) => i.en)).size, items.length, `${theme.id}: two words share a meaning`);
    assert.equal(new Set(items.map((i) => i.kana)).size, items.length);
    for (const item of items) {
      assert.match(item.id, /^[a-z][a-z0-9-]*$/);
      assert.ok(!ids.has(item.id), `${item.id} twice`);
      ids.add(item.id);
      assert.match(item.kana, SCRIPT[theme.script], `${theme.id}/${item.id}: ${item.kana}`);
      const words = item.en.split(/\s+/);
      assert.ok(words.length >= 1 && words.length <= 4, `${item.id}: ${item.en}`);
      assert.match(said(item.kana), /^[a-z']+$/, `${item.id}: ${said(item.kana)}`);
      assert.match(item.note, /^[^.!?]+[.!?]$/u, `${item.id}: one sentence`);
      assert.ok(item.note.length <= 110, `${item.id}: a short note`);
      for (const text of [item.en, item.note, theme.title, theme.subtitle]) {
        assert.ok(!text.includes(EM_DASH), `${item.id}: a dash`);
        assert.ok(!BANNED.test(text), `${item.id}: ${text}`);
      }
    }
  }
  assert.deepEqual(kanaReadItems('nope'), []);
  const source = fs.readFileSync(new URL('js/kana-reads.js', ROOT), 'utf8');
  assert.ok(!source.includes(EM_DASH) && !BANNED.test(source));
});

test('every word already has a recorded clip in Clear, which any other voice falls back to', () => {
  const audio = normalizeAudio(JSON.parse(fs.readFileSync(new URL('data/audio/index.json', ROOT))));
  let male = 0;
  for (const theme of KANA_READ_THEMES) {
    for (const item of kanaReadItems(theme.id)) {
      const keys = keysOf(item.kana);
      for (const shard of shardsFor(audio, keys)) addShard(audio, shard, JSON.parse(fs.readFileSync(new URL(audio.srcs[shard], ROOT))));
      const clip = clipInVoice(audio, keys, 'clear');
      assert.ok(clip, `${theme.id}/${item.id}: no Clear clip for ${item.kana}`);
      assert.ok(fs.statSync(new URL(clip.path, ROOT)).size > 0, item.id);
      for (const voice of ['calm', 'bright', 'male']) assert.ok(clipByKeys(audio, keys, voice), `${item.id}: ${voice}`);
      if (clipInVoice(audio, keys, 'male')) male += 1;
    }
  }
  assert.ok(male >= 40, `${male} words in the Male voice of their own`);
});

test('only the first answer counts, and a hint marks the question assisted', () => {
  const g = new KanaReads();
  g.start({ theme: 'world', seed: 5 });
  act(g, 'hint');
  const hinted = question(g);
  assert.equal(hinted.hinted, true);
  assert.equal(hinted.romaji, said(hinted.kana));
  assert.equal(hinted.answered, false);
  assert.equal(hinted.meaning, null);
  act(g, 'answer', { pick: target(g) });
  assert.equal(question(g).right, true);
  const before = JSON.stringify(g.dump());
  act(g, 'answer', { pick: wrong(g) });
  act(g, 'skip');
  act(g, 'hint');
  assert.equal(JSON.stringify(g.dump()), before, 'a second answer changes nothing');
  act(g, 'answer', { pick: 'not-an-option' });
  assert.equal(JSON.stringify(g.dump()), before);
  act(g, 'next');
  assert.equal(question(g).hinted, false, 'the next question starts without a hint');
  const missed = g.dump().round.questions[0].target;
  for (let n = 1; n < ROUND; n++) { act(g, 'answer', { pick: target(g) }); act(g, 'next'); }
  assert.deepEqual(g.view().round.result, { correct: ROUND - 1, assisted: 1, skipped: 0, total: ROUND });
  const stats = g.dump().stats.world;
  assert.equal(stats.assisted, 1);
  assert.equal(stats.best, ROUND - 1);
  assert.deepEqual(stats.misses, { [missed]: 1 }, 'a hinted word is drawn more often later');
});

test('a skip reveals the answer, counts as skipped, and the missed word comes back three questions later', () => {
  const g = new KanaReads();
  g.start({ theme: 'animals', seed: 8 });
  const skipped = target(g);
  act(g, 'skip');
  const s = question(g);
  assert.deepEqual([s.answered, s.pickedId, s.right, s.correctId], [true, null, false, skipped]);
  assert.ok(s.meaning && s.note && s.romaji);
  assert.deepEqual(g.dump().round.questions[3].target, skipped);
  act(g, 'next');
  const missedOptions = question(g).options;
  const missed = target(g);
  act(g, 'answer', { pick: wrong(g) });
  assert.equal(question(g).right, false);
  assert.equal(g.dump().round.questions[4].target, missed);
  assert.deepEqual(g.dump().round.questions[4].options, missedOptions.map((o) => o.id));
  act(g, 'next');
  for (let n = 2; n < 7; n++) { act(g, 'answer', { pick: target(g) }); act(g, 'next'); }
  // From the eighth question there is no room left to come back.
  const late = JSON.stringify(g.dump().round.questions);
  act(g, 'answer', { pick: wrong(g) });
  assert.equal(JSON.stringify(g.dump().round.questions), late);
  act(g, 'next');
  for (let n = 8; n < ROUND; n++) { act(g, 'answer', { pick: target(g) }); act(g, 'next'); }
  assert.deepEqual(g.view().round.result, { correct: ROUND - 3, assisted: 0, skipped: 1, total: ROUND });
  assert.equal(g.dump().stats.animals.misses[skipped], 1);
  assert.equal(g.dump().stats.animals.misses[missed], 1);
});

test('a stale or double tap cannot answer or skip the next question', () => {
  const g = new KanaReads();
  assert.equal(g.act('answer', { id: 'x', pick: 'coffee' }).status, 'idle');
  g.start({ theme: 'cafe', seed: 13 });
  const unchanged = (fn, why) => { const before = JSON.stringify(g.dump()); fn(); assert.equal(JSON.stringify(g.dump()), before, why); };
  const first = question(g).id;
  unchanged(() => act(g, 'next'), 'next before an answer');
  unchanged(() => g.act('answer', { id: 'cafe:13:1', pick: target(g) }), 'a future id');
  unchanged(() => g.act('hint', {}), 'no id');
  act(g, 'answer', { pick: target(g) });
  act(g, 'next');
  unchanged(() => g.act('answer', { id: first, pick: target(g) }), 'an old id cannot answer');
  unchanged(() => g.act('skip', { id: first }), 'an old id cannot skip');
  unchanged(() => g.act('next', { id: first }), 'an old id cannot move on');
  assert.equal(question(g).answered, false);
});

test('leaving discards an unfinished round; a round in progress blocks a new one', () => {
  const g = new KanaReads();
  g.start({ theme: 'sounds', seed: 1 });
  act(g, 'answer', { pick: target(g) }); act(g, 'next');
  assert.throws(() => g.start({ theme: 'sounds' }), /Finish or leave/);
  assert.throws(() => new KanaReads().start({ theme: 'nope' }), /themes/);
  assert.throws(() => new KanaReads().start(), /themes/);
  g.act('leave');
  assert.equal(g.view().status, 'idle');
  assert.deepEqual(g.dump(), { v: 1, stats: {}, round: null });
  g.start({ theme: 'everyday', seed: 1 });
  assert.equal(g.view().round.position, 1);
  assert.equal(g.view().round.theme, 'everyday');
});

test('a word never comes twice in a row, and words missed before are drawn more often', () => {
  let withMisses = 0, without = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const g = new KanaReads();
    g.start({ theme: 'things', seed });
    for (let n = 0; n < ROUND; n++) {
      act(g, 'answer', { pick: (seed + n) % 3 ? target(g) : wrong(g) });
      act(g, 'next');
    }
    const order = g.dump().round.questions.map((q) => q.target);
    assert.ok(order.every((t, i) => i === 0 || t !== order[i - 1]), order.join(' '));
    assert.equal(reload(g).view().recovered, false);
    const fresh = new KanaReads();
    fresh.start({ theme: 'things', seed });
    if (fresh.dump().round.questions.some((q) => q.target === 'pen')) without += 1;
    const weighted = new KanaReads({ v: 1, stats: { things: { rounds: 3, best: 7, correct: 20, answered: 30, assisted: 0, misses: { pen: 5 } } }, round: null });
    weighted.start({ theme: 'things', seed });
    if (weighted.dump().round.questions.some((q) => q.target === 'pen')) withMisses += 1;
  }
  assert.ok(withMisses > without + 20, `${withMisses} rounds with a word missed five times, ${without} without`);
});

test('damaged documents and rounds cannot crash loading or create false completions', () => {
  for (const document of [false, 'bad', [], {}, { v: 99, stats: {} }, { v: 1, stats: [] }, { v: 1, stats: {}, round: {} }]) {
    const g = new KanaReads(document);
    assert.equal(g.view().status, 'idle', JSON.stringify(document));
    assert.equal(g.view().recovered, true);
  }
  assert.equal(new KanaReads(undefined).view().recovered, false);
  const g = new KanaReads();
  g.start({ theme: 'cafe', seed: 3 });
  act(g, 'answer', { pick: target(g) });
  const good = JSON.parse(JSON.stringify(g.dump()));
  assert.equal(new KanaReads(good).view().recovered, false);
  const damages = [
    (r) => { r.at = 9; },
    (r) => { r.theme = 'world'; },
    (r) => { r.questions.pop(); },
    (r) => { r.questions[0].target = 'unknown'; },
    (r) => { r.questions[1].options = [r.questions[1].target, r.questions[1].target]; },
    (r) => { r.questions[1].options = [r.questions[1].target, 'tv']; },
    (r) => { r.questions[2] = { ...r.questions[1] }; },
    (r) => { r.picks = [null]; },
    (r) => { r.picks = [{ id: 'tv', hint: false }]; },
    (r) => { r.picks.push({ id: null, hint: false }, { id: null, hint: false }); },
    (r) => { r.hinted = 'yes'; },
    (r) => { r.id = 42; },
  ];
  for (const [n, damage] of damages.entries()) {
    const document = JSON.parse(JSON.stringify(good));
    damage(document.round);
    const loaded = new KanaReads(document);
    assert.equal(loaded.view().status, 'idle', `damage ${n}`);
    assert.equal(loaded.view().recovered, true, `damage ${n}`);
  }
});

test('damaged counters keep their valid fields and signal a recovery', () => {
  const g = new KanaReads({ v: 1, stats: {
    cafe: { rounds: 2, best: 90, answered: 20, correct: 30, assisted: 'many', misses: { coffee: 2, tea: 4, cake: -1 } },
    nope: { rounds: 1, best: 1, answered: 10, correct: 1, assisted: 0, misses: {} },
    world: 'broken',
  }, round: null });
  assert.equal(g.view().recovered, true);
  assert.deepEqual(g.dump().stats, { cafe: { rounds: 2, best: 10, answered: 20, correct: 20, assisted: 0, misses: { coffee: 2 } } });
  const clean = { v: 1, stats: { sounds: { rounds: 1, best: 6, correct: 6, answered: 10, assisted: 2, misses: { iraira: 3 } } }, round: null };
  assert.equal(new KanaReads(clean).view().recovered, false);
  assert.deepEqual(new KanaReads(clean).dump(), clean);
});
