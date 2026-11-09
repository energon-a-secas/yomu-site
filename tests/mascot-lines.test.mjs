// What Hoho says (js/mascot-lines.js): library phrases that are already
// recorded, read in words, and the greeting for an hour.
//
//   node --test tests/mascot-lines.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MASCOT_MOMENTS, mascotLine, greetingMoment } from '../js/mascot-lines.js';
import { normalizeAudio, addShard, shardsFor, keysOf, clipInVoice } from '../js/audio.js';

const ROOT = new URL('../', import.meta.url);
const library = JSON.parse(fs.readFileSync(new URL('data/phrases/library.json', ROOT)));
const IDS = {
  morning: 'ohayou-gozaimasu', day: 'konnichiwa', evening: 'konbanwa', night: 'oyasuminasai',
  welcome: 'okaerinasai', start: 'yoroshiku', perfect: 'sugoi', finish: 'otsukaresama', relief: 'yokatta',
  retry: 'mou-ichido', comfort: 'daijoubu-desu', fun: 'tanoshikatta', goodbye: 'jaa-mata', understood: 'wakarimashita',
};

test('every moment is a library phrase with its own reading and meaning, read in words', () => {
  assert.ok(Object.isFrozen(MASCOT_MOMENTS));
  assert.deepEqual([...MASCOT_MOMENTS], Object.keys(IDS));
  for (const moment of MASCOT_MOMENTS) {
    const line = mascotLine(library, moment);
    const p = library.phrases.find((x) => x.id === IDS[moment]);
    assert.ok(p, `${moment}: ${IDS[moment]} is in the library`);
    assert.deepEqual({ ...line, romaji: null }, { moment, id: p.id, ja: p.ja, kana: p.kana, meaning: p.en, romaji: null });
    assert.match(line.romaji, /^[a-z]+( [a-z]+)*$/, `${moment}: ${line.romaji}`);
    assert.equal(mascotLine(library, moment, { lang: 'es' }).meaning, p.es);
  }
  const said = Object.fromEntries(MASCOT_MOMENTS.map((m) => [m, mascotLine(library, m).romaji]));
  assert.deepEqual(said, {
    morning: 'ohayoo gozaimasu', day: 'konnichiwa', evening: 'konbanwa', night: 'oyasuminasai',
    welcome: 'okaerinasai', start: 'yoroshiku onegaishimasu', perfect: 'sugoi', finish: 'otsukaresama desu',
    relief: 'yokatta', retry: 'moo ichido onegaishimasu', comfort: 'daijoobu desu', fun: 'tanoshikatta desu',
    goodbye: 'jaa mata', understood: 'wakarimashita',
  });
});

test('word breaks that no longer match the library fall back to the library\'s kana', () => {
  const edited = { ...library, phrases: library.phrases.map((p) => (p.id === 'yoroshiku' ? { ...p, kana: 'よろしくおねがいいたします' } : p)) };
  assert.equal(mascotLine(edited, 'start').romaji, 'yoroshikuonegaiitashimasu');
  assert.equal(mascotLine({ phrases: [] }, 'start'), null, 'a phrase gone from the library says nothing');
  assert.equal(mascotLine(null, 'day'), null);
});

test('every line already has a clip in the Clear and Male voices', () => {
  const audio = normalizeAudio(JSON.parse(fs.readFileSync(new URL('data/audio/index.json', ROOT))));
  for (const moment of MASCOT_MOMENTS) {
    const { ja } = mascotLine(library, moment);
    const keys = keysOf(ja);
    for (const shard of shardsFor(audio, keys)) addShard(audio, shard, JSON.parse(fs.readFileSync(new URL(audio.srcs[shard], ROOT))));
    for (const voice of ['clear', 'male']) {
      const clip = clipInVoice(audio, keys, voice);
      assert.ok(clip, `${moment}: ${voice}`);
      assert.ok(fs.statSync(new URL(clip.path, ROOT)).size > 0, `${moment}: ${voice}`);
    }
  }
});

test('the greeting follows the hour, and an unknown moment is null', () => {
  const at = (hours) => hours.map(greetingMoment);
  assert.deepEqual(at([5, 6, 10]), ['morning', 'morning', 'morning']);
  assert.deepEqual(at([11, 12, 17]), ['day', 'day', 'day']);
  assert.deepEqual(at([18, 20, 22]), ['evening', 'evening', 'evening']);
  assert.deepEqual(at([23, 0, 1, 4]), ['night', 'night', 'night', 'night']);
  assert.deepEqual(at([4.5, 10.9, NaN, -1, 24, '7']), ['night', 'morning', 'night', 'night', 'night', 'morning']);
  for (const moment of ['greeting', 'nope', '', null, undefined, 'toString', 'constructor']) {
    assert.equal(mascotLine(library, moment), null, String(moment));
  }
});
