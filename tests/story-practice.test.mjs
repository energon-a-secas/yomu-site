import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cafeScene } from '../js/story-cafe.js';
import { StoryPractice } from '../js/story-practice.js';
import { normalizeAudio, addShard, shardsFor, keysOf, clipInVoice } from '../js/audio.js';
import { useLang } from '../js/strings.js';

const library = JSON.parse(fs.readFileSync(new URL('../data/phrases/library.json', import.meta.url)));
const scene = cafeScene(library);
/** The character is named, never written, so this file passes its own rule. */
const EM_DASH = String.fromCharCode(0x2014);

/** `fn` with every string in Spanish (strings.js useLang), then English again. */
function inSpanish(fn) {
  useLang('es');
  try { return fn(); } finally { useLang('en'); }
}
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

test('in Spanish, the café reads in Spanish: its title and roles, each line, the choices and the endings', () => {
  inSpanish(() => {
    let story = new StoryPractice(scene);
    const before = story.view();
    assert.equal(before.scene.title, 'El café de la esquina');
    assert.equal(before.scene.subtitle, 'Peticiones corteses · 10 turnos hablados · 2 decisiones');
    assert.match(before.scene.introduction, /^Ren pasa por un pequeño café antes de tomar un tren\./);
    assert.deepEqual(before.scene.roles.map((r) => [r.name, r.description]), [['Ren', 'Visitante · practica peticiones cortas'], ['Aya', 'Barista · practica frases corteses para atender']]);
    story.start('ren');
    const first = story.view().current.line;
    assert.equal(first.meaning, 'Bienvenido. ¿Ya sabe qué va a pedir?', 'the library\'s own Spanish');
    assert.equal(first.grammar, 'ご注文 es una forma cortés de decir “su pedido”. お決まりですか pregunta si ya se decidió qué pedir.');
    story.act('continue', { id: 'welcome', status: 'tried' });
    const choice = story.view().current;
    assert.equal(choice.prompt, '¿Qué quiere pedir Ren?');
    assert.deepEqual(choice.options.map((o) => [o.label, o.meaning]), [['Un café', 'Un café, por favor.'], ['Un café latte', 'Un café latte, por favor.']]);
    assert.throws(() => story.start('aya'), { message: 'Retoma la escena actual o empiézala de nuevo.' });
    story = finish(story, 'coffee', 'here');
    const end = story.view();
    assert.deepEqual([end.current.title, end.endings], ['Una mesa tranquila', [{ id: 'table', title: 'Una mesa tranquila' }]]);
    assert.match(end.current.text, /^Aya señala el asiento junto a la ventana\./);
    const said = Object.fromEntries(end.history.map((l) => [l.id, l.meaning]));
    assert.equal(said.here, 'Sí, aquí, por favor.');
    assert.equal(said.enjoy, 'Gracias por la bebida. (Se dice antes del primer sorbo.)');
    assert.equal(said.price, 'Son quinientos yenes.');
    assert.ok(end.history.every((l) => typeof l.meaning === 'string' && typeof l.grammar === 'string'));
    assert.throws(() => story.start('nobody', true), { message: 'Elige uno de los papeles de la escena.' });
  });
  assert.equal(new StoryPractice(scene).view().scene.title, 'The corner café', 'English again');
});

test('the story document is the same in either language, and a scene begun in English resumes in Spanish', () => {
  const english = new StoryPractice(scene);
  english.start('aya');
  english.act('continue', { id: 'welcome', status: 'tried' });
  english.act('choose', { id: 'drink', choice: 'latte' });
  const document = JSON.parse(JSON.stringify(english.dump()));
  assert.equal(document.sceneVersion, 1);
  inSpanish(() => {
    const spanish = new StoryPractice(scene, document);
    assert.equal(spanish.view().recovered, false);
    assert.deepEqual(spanish.dump(), document);
    const line = spanish.view().current.line;
    assert.equal(line.id, 'latte');
    assert.equal(line.meaning, 'Un café latte, por favor.');
    assert.equal(line.grammar, 'を marca lo que pides. 一つ es “uno”; お願いします vuelve cortés el pedido.');
    assert.equal(spanish.view().history[0].meaning, 'Bienvenido. ¿Ya sabe qué va a pedir?');
    assert.deepEqual(spanish.view().choices, english.view().choices);
  });
});

test('every Spanish string of the scene is written, differs from the English, and has no em dash', () => {
  const pairs = [];
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      if ('en' in value || 'es' in value) pairs.push(value);
      else Object.values(value).forEach(collect);
    }
  };
  collect(scene);
  // Title, subtitle, introduction, two roles, thirteen lines' meaning and
  // grammar, two prompts, four options, two endings' titles and texts.
  assert.ok(pairs.length >= 41, `${pairs.length} texts`);
  for (const { en, es } of pairs) {
    assert.ok(typeof en === 'string' && en.trim(), JSON.stringify({ en, es }));
    assert.ok(typeof es === 'string' && es.trim(), `no Spanish for ${en}`);
    assert.ok(!es.includes(EM_DASH), es);
    if (/\s/.test(en)) assert.notEqual(es, en, `still English: ${en}`);
  }
  for (const file of ['story-cafe.js', 'story-practice.js']) {
    assert.ok(!fs.readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8').includes(EM_DASH), file);
  }
});
