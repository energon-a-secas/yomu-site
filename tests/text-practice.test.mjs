import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TextPractice, textPracticeWords } from '../js/text-practice.js';
import { analyze } from '../js/analyze.js';
import { run, diskDict } from './helpers/disk.mjs';

test('a real reading yields bounded, distinct words and keeps conjugated forms', async () => {
  const analysis = await run('今日は雨が降っています。雨が降っています。明日は青い空を見ます。');
  const before = JSON.stringify(analysis);
  const words = textPracticeWords(analysis);
  assert.ok(words.length > 0 && words.length <= 4);
  assert.equal(new Set(words.map((w) => w.word)).size, words.length);
  assert.ok(words.some((w) => w.word === '降っています'));
  assert.ok(!words.some((w) => ['は', 'が', '。'].includes(w.word)));
  assert.equal(JSON.stringify(analysis), before, 'the original reading stays intact');
});

test('Spanish meanings come from the same analysis, with explicit English fallback', async () => {
  const analysis = await analyze('雨が降っています。', { dict: diskDict(), meanings: 'es' });
  const words = textPracticeWords(analysis, 'es');
  const rain = words.find((w) => w.word === '雨');
  assert.equal(rain.english, false);
  assert.match(rain.meaning, /lluvia/u);
  for (const token of analysis.tokens) if (token.entry) delete token.entry.es;
  assert.ok(textPracticeWords(analysis, 'es').every((w) => w.english));
});

test('only a revealed answer can advance and stale taps cannot skip the next card', async () => {
  const session = new TextPractice(await run('今日は雨です。'));
  const first = session.view();
  assert.deepEqual(session.act('remembered', first.card.id), first);
  assert.equal(session.act('show', first.card.id).card.shown, true);
  const next = session.act('again', first.card.id);
  assert.equal(next.position, 2);
  assert.deepEqual(session.act('again', first.card.id), next);
  assert.deepEqual(session.act('show', first.card.id), next);
});

test('all modes finish with honest self-assessment counts and unique missed words', async () => {
  const session = new TextPractice(await run('今日は雨が降っています。'));
  const modes = new Set();
  let state = session.view();
  let answered = 0;
  while (state.status === 'playing') {
    modes.add(state.card.mode);
    const id = state.card.id;
    session.act('show', id);
    state = session.act(answered++ % 2 ? 'remembered' : 'again', id);
  }
  assert.deepEqual([...modes], ['recall', 'listen', 'gap']);
  assert.equal(answered, state.total);
  assert.equal(state.remembered, Math.floor(answered / 2));
  assert.equal(new Set(state.missed).size, state.missed.length);
  assert.equal(state.card, null);
  assert.deepEqual(session.act('remembered', 'old'), state);
});

test('empty and punctuation-only readings offer no fabricated questions', async () => {
  for (const text of ['', '。！？']) {
    const session = new TextPractice(await run(text));
    assert.equal(session.view().status, 'empty');
    assert.equal(session.view().total, 0);
  }
});

test('a single word has recall and listening but no contextless gap', async () => {
  const session = new TextPractice(await run('雨。'));
  assert.deepEqual(session.cards.map((c) => c.mode), ['recall', 'listen']);
});

test('sentence gaps keep the exact occurrence after an emoji and another sentence', async () => {
  const text = '☔ 雨です。今日は雨が降っています。';
  const analysis = await run(text);
  const token = analysis.tokens.find((t) => t.surface === '降っています');
  const words = textPracticeWords({ text: analysis.text, tokens: [token] });
  assert.equal(words[0].before + words[0].word + words[0].after, '今日は雨が降っています。');
});
