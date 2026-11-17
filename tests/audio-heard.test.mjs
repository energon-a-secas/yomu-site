// The heard-by list (tools/lib/audio-heard.mjs): a take that failed its
// transcript check ships only when a person heard it and called it right,
// only while the list names it, and only the very take that was heard. The
// listening page (tools/lib/audio-listen.mjs) lists what waits to be heard.
// Everything here runs on a scratch directory: no clip is made, nothing is
// sent, and the committed data/audio/ is never touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  HEARD_FORMAT, parseHeard, serializeHeard, heardPlan, applyHeard, takeHash, rejectName, madeKey,
} from '../tools/lib/audio-heard.mjs';
import { indexEntries } from '../tools/lib/audio-index.mjs';
import { listenRows, listenPage, listenGroups } from '../tools/lib/audio-listen.mjs';
import { SITE } from './helpers/disk.mjs';

const VOICES = [
  { id: 'clear', name: 'Konoha', label: { en: 'Clear' } },
  { id: 'calm', name: 'Yuki', label: { en: 'Calm' } },
];
const OPTS = { voices: VOICES.map((v) => v.id), attempts: 3 };

const line = (key, id) => ({ kind: 'kana', key, keys: [key], id, ja: key, kana: key });
const failed = (key, sig, transcripts) => ({
  sig, key, kind: 'kana', ok: false, transcript: transcripts.at(-1), want: key,
  tries: transcripts.map((t, i) => ({ sent: i === transcripts.length - 1 ? key : key.toUpperCase(), transcript: t, got: t })),
});

/** A scratch site: three lines, Calm failed each, and its takes on disk. */
function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-heard-'));
  const rejectsDir = path.join(dir, 'rejects');
  fs.mkdirSync(rejectsDir);
  const lines = new Map([['ほ', line('ほ', 'h0')], ['み', line('み', 'm0')], ['ゆ', line('ゆ', 'y0')]]);
  const made = {
    'clear/h0': { sig: 'c', key: 'ほ', kind: 'kana', ok: true },
    'calm/h0': failed('ほ', 's-h', ['はあ', 'はあ', 'ほお']),
    'calm/m0': failed('み', 's-m', ['Me', 'Me', 'Me']),
    'calm/y0': failed('ゆ', 'old', ['You', 'You', 'You']),
  };
  const takes = {};
  for (const [mk, rec] of Object.entries(made)) {
    if (rec.ok) continue;
    const [voice, id] = mk.split('/');
    rec.tries.forEach((_, take) => {
      const bytes = Buffer.from(`${mk} take ${take}`);
      fs.writeFileSync(path.join(rejectsDir, rejectName(voice, id, take)), bytes);
      takes[`${mk}/${take}`] = bytes;
    });
  }
  // Clear's ゆ failed once and passed on its second take: its failed take is
  // on disk, and nothing about it waits to be heard.
  made['clear/y0'] = { sig: 'c', key: 'ゆ', kind: 'kana', ok: true, tries: [{ sent: 'ユ', transcript: 'You', got: 'You' }] };
  fs.writeFileSync(path.join(rejectsDir, rejectName('clear', 'y0', 0)), 'clear yu take 0');
  const clipPathOf = (voice, id) => path.join(dir, 'audio', voice, `${id}.mp3`);
  fs.mkdirSync(path.join(dir, 'audio', 'clear'), { recursive: true });
  fs.writeFileSync(clipPathOf('clear', 'h0'), 'clear ho');
  // ゆ's text changed after its takes were made: its record is under an old signature.
  const sigOf = (voice, l) => ({ 'calm/h0': 's-h', 'calm/m0': 's-m', 'calm/y0': 'new' }[madeKey(voice, l.id)] || 'c');
  const kept = (voice, id) => !!(made[madeKey(voice, id)] && made[madeKey(voice, id)].ok && fs.existsSync(clipPathOf(voice, id)));
  const indexed = () => indexEntries([...lines.values()], { kept, voices: VOICES }).entries;
  const ctx = { lines, made, sigOf, rejectsDir, clipPathOf };
  return { dir, rejectsDir, lines, made, takes, ctx, clipPathOf, indexed, sigOf };
}

const entry = (s, mk, take, extra = {}) => {
  const [voice, id] = mk.split('/');
  const key = [...s.lines.values()].find((l) => l.id === id).key;
  return { voice, key, take, sha: takeHash(s.takes[`${mk}/${take}`]), by: 'owner', date: '2026-11-03', ...extra };
};

test('a listed take ships and is indexed; an unlisted one, and one whose text changed, are not', () => {
  const s = scratch();
  const list = [entry(s, 'calm/h0', 1), entry(s, 'calm/y0', 0)];
  const plan = heardPlan(list, s.ctx);
  assert.deepEqual(plan.ship.map((x) => x.mk), ['calm/h0']);
  assert.deepEqual(plan.skip.map((x) => x.entry.key), ['ゆ'], 'ゆ is made under an old signature');
  assert.match(plan.skip[0].why, /changed/);
  applyHeard(plan, s.ctx);
  assert.deepEqual(fs.readFileSync(s.clipPathOf('calm', 'h0')), s.takes['calm/h0/1'], 'the take that was heard, byte for byte');
  const rec = s.made['calm/h0'];
  assert.equal(rec.ok, true);
  assert.deepEqual({ take: rec.heardBy.take, by: rec.heardBy.by, transcript: rec.heardBy.transcript }, { take: 1, by: 'owner', transcript: 'はあ' });
  assert.equal(rec.transcript, 'ほお', 'the record keeps its last take\'s own fields');
  const ix = s.indexed();
  assert.deepEqual(ix.get('ほ'), ['h0', 0b11], 'Clear and now Calm');
  assert.equal(ix.get('み'), undefined, 'み was not heard');
  assert.equal(ix.get('ゆ'), undefined, 'ゆ cannot ship');
  assert.equal(fs.existsSync(s.clipPathOf('calm', 'y0')), false);
  // A second pass changes nothing.
  const again = heardPlan(list, s.ctx);
  assert.deepEqual([again.ship.length, again.unship.length, again.already], [0, 0, 1]);
});

test('only the take that was heard ships: another file under its name, or a take the run never made, does not', () => {
  const s = scratch();
  fs.writeFileSync(path.join(s.rejectsDir, rejectName('calm', 'm0', 2)), 'a later run remade this take');
  const plan = heardPlan([entry(s, 'calm/m0', 2), { ...entry(s, 'calm/h0', 0), take: 2, sha: takeHash(Buffer.from('nothing')) }], s.ctx);
  assert.equal(plan.ship.length, 0);
  assert.deepEqual(plan.skip.map((x) => x.why.includes('not the take that was heard')), [true, true]);
  s.made['calm/h0'].tries = s.made['calm/h0'].tries.slice(0, 1);
  const short = heardPlan([entry(s, 'calm/h0', 2)], s.ctx);
  assert.match(short.skip[0].why, /no take 2/, 'a take from an older run is not this record\'s');
  fs.rmSync(path.join(s.rejectsDir, rejectName('calm', 'h0', 0)));
  assert.match(heardPlan([entry(s, 'calm/h0', 0)], s.ctx).skip[0].why, /is not in/);
});

test('a take ships only while the list names it', () => {
  const s = scratch();
  applyHeard(heardPlan([entry(s, 'calm/h0', 1)], s.ctx), s.ctx);
  assert.ok(s.indexed().has('ほ') && s.made['calm/h0'].heardBy);
  const plan = heardPlan([], s.ctx);
  assert.deepEqual(plan.unship, ['calm/h0']);
  applyHeard(plan, s.ctx);
  assert.equal(fs.existsSync(s.clipPathOf('calm', 'h0')), false);
  assert.equal(s.made['calm/h0'].ok, false);
  assert.equal(s.made['calm/h0'].heardBy, undefined);
  assert.deepEqual(s.indexed().get('ほ'), ['h0', 0b01], 'Clear\'s clip only');
  // Another take named instead replaces the one that shipped.
  applyHeard(heardPlan([entry(s, 'calm/h0', 1)], s.ctx), s.ctx);
  const swap = heardPlan([entry(s, 'calm/h0', 2)], s.ctx);
  assert.deepEqual([swap.unship, swap.ship.map((x) => x.entry.take)], [['calm/h0'], [2]]);
  applyHeard(swap, s.ctx);
  assert.deepEqual(fs.readFileSync(s.clipPathOf('calm', 'h0')), s.takes['calm/h0/2']);
  assert.equal(s.made['calm/h0'].ok, true);
});

test('a take that passed its check later, or a voice that does not record the line, ships nothing', () => {
  const s = scratch();
  s.made['calm/h0'] = { ...s.made['calm/h0'], ok: true };
  s.lines.set('み', { ...s.lines.get('み'), voices: ['clear'] });
  const plan = heardPlan([entry(s, 'calm/h0', 1), entry(s, 'calm/m0', 0)], s.ctx);
  assert.equal(plan.ship.length, 0);
  assert.match(plan.skip[0].why, /passed its check/);
  assert.match(plan.skip[1].why, /does not record/);
});

test('the heard-by file is read strictly, written one entry a line, and the committed one parses', () => {
  const ok = { voice: 'calm', key: 'ほ', take: 1, sha: '0123456789abcdef', by: 'owner', date: '2026-11-03' };
  const doc = (heard) => ({ format: HEARD_FORMAT, heard });
  assert.deepEqual(parseHeard(doc([ok]), OPTS), [ok]);
  assert.throws(() => parseHeard({ format: 'nope', heard: [] }, OPTS), /format/);
  for (const [field, value] of [['voice', 'loud'], ['take', 3], ['take', 1.5], ['sha', 'abc'], ['by', ' '], ['date', '3 Nov'], ['key', '']]) {
    assert.throws(() => parseHeard(doc([{ ...ok, [field]: value }]), OPTS), Error, `${field} ${value}`);
  }
  assert.throws(() => parseHeard(doc([ok, { ...ok, take: 2 }]), OPTS), /twice/, 'one take a line ships');
  const two = [{ ...ok, voice: 'male' }, ok, { ...ok, key: 'み' }];
  const text = serializeHeard(two);
  assert.equal(text.split('\n').filter((l) => l.includes('"sha"')).length, 3, 'one entry a line');
  assert.deepEqual(parseHeard(JSON.parse(text), { ...OPTS, voices: ['calm', 'male'] }).map((e) => `${e.voice}/${e.key}`), ['calm/ほ', 'calm/み', 'male/ほ']);
  assert.equal(serializeHeard([]), `{\n  "format": "${HEARD_FORMAT}",\n  "heard": []\n}\n`);
  const committed = JSON.parse(fs.readFileSync(path.join(SITE, 'tools', 'audio-heard.json'), 'utf8'));
  const voices = ['clear', 'calm', 'bright', 'male'];
  assert.doesNotThrow(() => parseHeard(committed, { voices, attempts: 3 }));
  assert.equal(fs.readFileSync(path.join(SITE, 'tools', 'audio-heard.json'), 'utf8'), serializeHeard(parseHeard(committed, { voices, attempts: 3 })), 'as the listening page exports it');
});

test('the listening page lists the takes that wait, with the first voice\'s kept clip beside them', () => {
  const s = scratch();
  const pageDir = path.join(s.dir, 'page');
  applyHeard(heardPlan([entry(s, 'calm/h0', 1)], s.ctx), s.ctx);
  const keptClip = (voice, id) => (fs.existsSync(s.clipPathOf(voice, id)) ? s.clipPathOf(voice, id) : null);
  const rows = listenRows({ script: [...s.lines.values()], made: s.made, voices: VOICES, sigOf: s.sigOf, rejectsDir: s.rejectsDir, pageDir, keptClip });
  assert.deepEqual(rows.map((r) => `${r.voice}/${r.key}`), ['calm/ほ', 'calm/み'], 'shipped ほ can still be changed; Calm\'s ゆ is under an old signature, Clear\'s passed');
  const ho = rows[0];
  assert.deepEqual(ho.takes.map((t) => [t.take, t.heard, t.src]), [0, 1, 2].map((n) => [n, n === 2 ? 'ほお' : 'はあ', `../rejects/calm-h0-${n}.mp3`]));
  assert.equal(ho.takes[1].sha, takeHash(s.takes['calm/h0/1']));
  assert.deepEqual(ho.compare, { voice: 'Clear', src: '../audio/clear/h0.mp3' });
  assert.equal(rows[1].compare, null, 'Clear has no clip of み');
  // A transcript is data: nothing in it can close the page's script element.
  rows[1].takes[0].heard = '</script><script>alert(1)</script>';
  const html = listenPage(rows, [], { generated: '2026-11-03' });
  const data = html.match(/<script type="application\/json" id="listen-data">([^]*?)<\/script>/)[1];
  assert.ok(!data.includes('</script'), 'escaped');
  assert.equal(JSON.parse(data).rows[1].takes[0].heard, '</script><script>alert(1)</script>');
  assert.ok(html.includes(serializeHeard.toString()), 'the page exports with the very function the tool reads with');
  assert.ok(!/https?:\/\//.test(html), 'it loads nothing from anywhere');
  assert.ok(!html.includes('tighten-beats'), 'every beat take here was made today, after beat shaping: nothing to shape');
  fs.rmSync(s.dir, { recursive: true, force: true });
});

test('the listening page says to shape a beat only while a beat take older than beat shaping waits, and counts them', () => {
  const s = scratch();
  const pageDir = path.join(s.dir, 'page');
  // Calm's ほ takes were made on 17 October, before beat shaping; its み takes today.
  const october = new Date('2026-10-17T03:00:00Z');
  for (const take of [0, 1, 2]) fs.utimesSync(path.join(s.rejectsDir, rejectName('calm', 'h0', take)), october, october);
  const rows = listenRows({ script: [...s.lines.values()], made: s.made, voices: VOICES, sigOf: s.sigOf, rejectsDir: s.rejectsDir, pageDir, keptClip: () => null });
  assert.deepEqual(rows.map((r) => [r.key, r.takes.map((t) => !!t.unshaped)]), [['ほ', [true, true, true]], ['み', [false, false, false]]]);
  const html = listenPage(rows, [], { generated: '2026-11-17' });
  assert.ok(html.includes('3 of the beat takes here were made before beat shaping'), 'counted from the files\' dates');
  assert.ok(html.includes('tools/tighten-beats.mjs'), 'and says to shape a beat shipped from one');
  const one = listenPage([{ ...rows[0], takes: rows[0].takes.slice(0, 1) }], [], { generated: '2026-11-17' });
  assert.ok(one.includes('1 of the beat takes here was made before beat shaping') && one.includes('it still holds its vowel'));
  assert.ok(!listenPage(rows.slice(1), [], { generated: '2026-11-17' }).includes('tighten-beats'), 'a beat take made since needs no shaping');
  fs.rmSync(s.dir, { recursive: true, force: true });
});

test('the listening page lists the most used first: readings by kanji page, common words by band, words, then beats', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-listen-'));
  const rejectsDir = path.join(dir, 'rejects');
  fs.mkdirSync(rejectsDir);
  // In script order: the lines, their words, the common words, then the readings.
  const script = [
    { kind: 'sound', key: 'おばあさん', id: 's0' },
    { kind: 'kana', key: 'ゆ', id: 'k0' },
    { kind: 'phrase', key: 'こんにちは', id: 'p0' },
    { kind: 'word', key: 'おば', id: 'w0' },
    { kind: 'common', key: '雨|あめ', id: 'c1', band: 1 },
    { kind: 'common', key: '町|まち', id: 'c3', band: 3 },
    { kind: 'common', key: '空|そら', id: 'c2', band: 2 },
    { kind: 'common', key: '海|うみ', id: 'c1b', band: 1 },
    { kind: 'reading', key: 'じつ', id: 'r0', voices: ['clear'] },
    { kind: 'reading', key: 'げつ', id: 'r1', voices: ['clear'] },
    { kind: 'reading', key: 'じっ', id: 'r2', voices: ['clear'] },
  ].map((l) => ({ ...l, keys: [l.key], ja: l.key }));
  const made = {};
  for (const l of script) {
    made[madeKey('clear', l.id)] = failed(l.key, 'c', ['x']);
    fs.writeFileSync(path.join(rejectsDir, rejectName('clear', l.id, 0)), `${l.id} take 0`);
  }
  // 月 is a more frequent page than 日's じつ; じっ is on no kanji page (a final small っ).
  const readingOrder = new Map([['げつ', 0], ['じつ', 7]]);
  const rows = listenRows({
    script, made, voices: VOICES.slice(0, 1), sigOf: () => 'c', rejectsDir, pageDir: dir, keptClip: () => null, readingOrder,
  });
  assert.deepEqual(rows.map((r) => r.key), ['げつ', 'じつ', 'じっ', '雨|あめ', '海|うみ', '空|そら', '町|まち', 'おば', 'ゆ', 'おばあさん', 'こんにちは']);
  assert.deepEqual(listenGroups(rows).map((g) => [g.group, g.lines, g.takes]), [
    ['reading', 3, 3], ['common 1', 2, 2], ['common 2', 1, 1], ['common 3', 1, 1], ['word', 1, 1], ['kana', 1, 1], ['sound', 1, 1], ['phrase', 1, 1],
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});
