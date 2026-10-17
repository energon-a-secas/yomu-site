import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cafeScene } from '../js/story-cafe.js';
import { StoryPractice } from '../js/story-practice.js';
import { normalizeAudio, addShard, shardsFor, keysOf, clipInVoice } from '../js/audio.js';

const library = JSON.parse(fs.readFileSync(new URL('../data/phrases/library.json', import.meta.url)));
const scene = cafeScene(library);
function finish(story, drink, visit) {
  let guard = 0;
  while (story.view().current.kind !== 'ending' && guard++ < 20) {
    const current = story.view().current;
    story.act(current.kind === 'choice' ? 'choose' : 'continue', {
      id: current.id, choice: current.id === 'drink' ? drink : visit, status: 'tried',
    });
    story = new StoryPractice(scene, JSON.parse(JSON.stringify(story.dump())));
  }
  assert.ok(guard < 20, 'all paths terminate');
  return story;
}

for (const role of ['ren', 'aya']) for (const drink of ['coffee', 'latte']) for (const visit of ['here', 'away']) {
  test(`café ${role}/${drink}/${visit}: choices and every turn survive relaunch and reach the intended ending`, () => {
    let story = new StoryPractice(scene); story.start(role);
    story = finish(story, drink, visit);
    const s = story.view();
    assert.equal(s.current.kind, 'ending');
    assert.equal(s.current.id, visit === 'here' ? 'table' : 'train');
    assert.deepEqual(s.choices, { drink, visit });
    assert.equal(s.turns, 10); assert.equal(s.tried, 10); assert.equal(s.role, role);
    assert.equal(s.history.length, 10);
    assert.ok(s.history.every((l) => l.ja && l.kana && l.meaning && l.grammar && l.recording));
    assert.equal(s.endings.length, 1);
  });
}

test('both endings are remembered, restart is explicit, and stale/double taps cannot skip a turn', () => {
  let story = new StoryPractice(scene); story.start('ren');
  assert.throws(() => story.start('aya'));
  story.act('continue', { id: 'welcome', status: 'tried' });
  assert.equal(story.view().current.kind, 'choice');
  story.act('continue', { id: 'welcome' });
  story.act('choose', { id: 'drink', choice: 'not-a-drink' });
  assert.equal(story.view().turns, 1);
  story = finish(story, 'coffee', 'here');
  story.start('aya');
  story = finish(story, 'latte', 'away');
  assert.deepEqual(story.view().endings.map((e) => e.id), ['table', 'train']);
  story.start('ren'); story.act('continue', { id: 'welcome', status: 'skipped' });
  assert.equal(story.view().tried, 0);
  story.start('aya', true);
  assert.equal(story.view().turns, 0);
  assert.equal(story.view().endings.length, 2);
});

test('damaged progress preserves its valid prefix and rejects unknown document versions', () => {
  const story = new StoryPractice(scene); story.start('ren');
  story.act('continue', { id: 'welcome', status: 'tried' });
  const doc = JSON.parse(JSON.stringify(story.dump()));
  doc.path.push({ id: 'drink', choice: 'invalid' });
  const restored = new StoryPractice(scene, doc);
  assert.equal(restored.view().recovered, true);
  assert.equal(restored.view().turns, 1);
  assert.equal(restored.view().current.id, 'drink');
  for (const document of [false, 'broken', {}, { ...doc, v: 99 }, { ...doc, sceneVersion: 2 }]) {
    const loaded = new StoryPractice(scene, document);
    assert.equal(loaded.view().recovered, true);
    assert.equal(loaded.view().started, false);
  }
});

test('every spoken line is already recorded in both character voices, with no fallback needed', () => {
  const root = new URL('../', import.meta.url);
  const audio = normalizeAudio(JSON.parse(fs.readFileSync(new URL('data/audio/index.json', root))));
  for (const line of Object.values(scene.nodes).filter((n) => n.kind === 'line')) {
    const keys = keysOf(line.ja);
    for (const shard of shardsFor(audio, keys)) addShard(audio, shard, JSON.parse(fs.readFileSync(new URL(audio.srcs[shard], root))));
    for (const voice of ['clear', 'male']) {
      const clip = clipInVoice(audio, keys, voice);
      assert.ok(clip, `${line.id}: ${voice}`);
      assert.ok(fs.statSync(new URL(clip.path, root)).size > 0, line.id);
    }
  }
});
