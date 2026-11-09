// Writing rush: the groups and what they deal, rushes and marathons stroke by
// stroke, misses and shown strokes, the deadline and the marathon's clock,
// bests and recent results, and the document read back entry by entry. The
// Spanish of everything a learner reads is writing-rush-es.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WritingRush, rushGroups, rushPool, bestKey, clockText, RUSH_FORMAT, RUSH_SECONDS, ASSIST_AFTER, RECENT_KEPT,
} from '../js/writing-rush.js';
import { BASIC_KANA } from '../js/kana-chart.js';
import { LEVELS } from '../js/levels.js';
import { strokesFor, traceStroke } from '../js/strokes.js';
import { TODAY, stroke, write, playRight, start } from './helpers/rush.mjs';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
/** Every character's stroke paths as data/strokes holds them; the app's bridge counts them the same way. */
const PATHS = new Map();
for (const f of fs.readdirSync(path.join(DATA, 'strokes')).filter((x) => /^s\d+\.json$/.test(x))) {
  for (const [ch, paths] of Object.entries(JSON.parse(fs.readFileSync(path.join(DATA, 'strokes', f), 'utf8')).entries)) PATHS.set(ch, paths);
}
const countsOf = (chars) => Object.fromEntries([...chars].filter((ch) => PATHS.has(ch)).map((ch) => [ch, PATHS.get(ch).length]));
const KA = 'かきくけこ';
const SEVEN = '日月火水木金土';
test('the groups: ten rows and all 46 in each script, then My kanji and the levels kanji cards use', () => {
  const groups = rushGroups();
  assert.equal(groups.length, 36);
  assert.equal(new Set(groups.map((g) => g.id)).size, groups.length);
  assert.ok(groups.every((g) => /^[a-z0-9-]+$/.test(g.id)));
  const byId = new Map(groups.map((g) => [g.id, g]));
  assert.deepEqual(byId.get('hiragana-a').chars, [...'あいうえお']);
  assert.deepEqual(byId.get('hiragana-ya').chars, [...'やゆよ']);
  assert.deepEqual(byId.get('hiragana-wa').chars, [...'わをん'], 'ん is filed with わ and を, as kana-rows.js files it');
  assert.deepEqual(byId.get('katakana-wa').chars, [...'ワヲン']);
  assert.equal(byId.get('hiragana-wa').title, 'わ row');
  assert.equal(byId.get('katakana-ka').title, 'カ row');
  for (const script of ['hiragana', 'katakana']) {
    const all = byId.get(`${script}-all`);
    assert.equal(all.chars.length, 46);
    assert.equal(all.title, `All 46 ${script}`);
    const rows = groups.filter((g) => g.script === script && g.id !== all.id);
    assert.equal(rows.length, 10);
    assert.deepEqual(rows.flatMap((g) => g.chars), all.chars, 'the rows split the 46, in chart order');
    assert.ok(all.chars.every((ch) => PATHS.has(ch)), 'every basic kana has a stroke order');
  }
  assert.deepEqual(byId.get('hiragana-all').chars, BASIC_KANA);
  const kanji = groups.filter((g) => g.kind === 'kanji');
  assert.deepEqual(kanji.map((g) => g.id), ['mine', ...LEVELS.map((l) => l.id)]);
  assert.ok(kanji.every((g) => g.chars === null && g.script === 'kanji'));
  assert.deepEqual(kanji.map((g) => g.title).slice(0, 9), ['My kanji', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Secondary school', 'Kanji for names']);
  assert.equal(byId.get('n5').title, 'JLPT N5');
});

test('only characters with a stroke order are dealt', () => {
  const names = [...JSON.parse(fs.readFileSync(path.join(DATA, 'kanji', 'jinmeiyo.json'), 'utf8')).kanji];
  const pool = rushPool({ group: 'names', chars: names, strokes: countsOf(names) });
  assert.equal(names.length, 838);
  assert.equal(pool.count, names.filter((ch) => PATHS.has(ch)).length);
  assert.equal(names.length - pool.count, 64, 'the 64 name kanji KanjiVG does not draw');
  assert.ok(pool.pool.every((ch) => PATHS.has(ch)));
  assert.equal(pool.message, `${pool.count} kanji to write.`);
  const odd = rushPool({ group: 'n5', chars: [...SEVEN], strokes: { 日: 0, 月: -1, 火: 1.5, 水: '4', 木: Number.NaN, 金: 8, 土: 3 } });
  assert.deepEqual(odd.pool, ['金', '土'], 'a count that is not a whole positive number is no stroke order');
  assert.deepEqual(rushPool({ group: 'mine', chars: ['日', '日', 'あ', 'AB', '月', 7], strokes: countsOf('日月あ') }).pool, ['日', '月'], 'kanji only, once each');
  assert.deepEqual(rushPool({ group: 'mine', chars: '月日', strokes: countsOf('日月') }).pool, ['月', '日'], 'a string of kanji is read too');
  assert.deepEqual(rushPool({ group: 'hiragana-ka', chars: ['日'], strokes: countsOf(`${KA}日`) }).pool, [...KA], 'a kana group deals its own kana');
  assert.deepEqual(rushPool({ group: 'hiragana-ka', strokes: countsOf('かくけこ') }).pool, [...'かくけこ']);
  const none = rushPool({ group: 'mine', chars: [], strokes: {} });
  assert.deepEqual([none.ready, none.count, none.message], [false, 0, 'Nothing to write yet: save kanji to My kanji first.']);
  assert.equal(rushPool({ group: 'g1', chars: ['俠'], strokes: countsOf('俠') }).message, 'None of these characters has a stroke order yet.');
  assert.equal(rushPool({ group: 'n6' }).message, 'Unknown group.');
  assert.throws(() => new WritingRush().start({ group: 'mine', chars: [], strokes: {} }), { message: none.message });
  // Played to the end, a marathon over a set with a kanji KanjiVG lacks never deals it.
  const chars = [...SEVEN, '俠'];
  const { dealt } = playRight(start({ group: 'mine', chars, strokes: countsOf(chars), mode: 'marathon' }));
  assert.deepEqual([...dealt].sort(), [...SEVEN].sort());
});

test('a marathon deals every character with strokes once, in an order the seed decides', () => {
  const orders = new Set();
  // 俠 is a name kanji KanjiVG does not draw; the か row is passed without こ's count.
  const cases = [['hiragana-ka', null, countsOf('かきくけ'), [...'かきくけ']], ['mine', [...SEVEN, '俠'], countsOf(`${SEVEN}俠`), [...SEVEN]]];
  for (let seed = 1; seed <= 60; seed += 1) {
    for (const [group, chars, strokes, pool] of cases) {
      const play = () => playRight(start({ group, chars, strokes, mode: 'marathon', seed }));
      const { v, dealt } = play();
      assert.equal(v.status, 'complete');
      assert.equal(v.run.result.of, pool.length);
      assert.equal(dealt.length, pool.length, `seed ${seed}: every character once`);
      assert.deepEqual([...dealt].sort(), [...pool].sort(), `seed ${seed}: only characters with strokes`);
      assert.deepEqual(play().dealt, dealt, 'the same seed deals the same order');
      if (group === 'mine') orders.add(dealt.join(''));
    }
  }
  assert.ok(orders.size > 40, `only ${orders.size} orders in 60 seeds`);
});

test('a rush deals the group again in a new order when it runs out, never one twice in a row', () => {
  const ones = Object.fromEntries([...KA].map((ch) => [ch, 1]));
  let reshuffled = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    const { v, dealt } = playRight(start({ group: 'hiragana-ka', strokes: ones, mode: 'rush', seconds: 30, seed }), { gap: 20, limit: 23 });
    assert.equal(v.status, 'playing');
    assert.equal(dealt.length, 23);
    for (let i = 0; i + 5 <= dealt.length; i += 5) assert.deepEqual(dealt.slice(i, i + 5).sort(), [...KA].sort(), `seed ${seed}: cycle ${i / 5 + 1}`);
    assert.ok(dealt.every((ch, i) => i === 0 || ch !== dealt[i - 1]), `seed ${seed}: ${dealt.join('')}`);
    if (dealt.slice(0, 5).join('') !== dealt.slice(5, 10).join('')) reshuffled += 1;
    // A set with a kanji KanjiVG does not draw deals the rest, cycle after cycle.
    const mine = playRight(start({ group: 'mine', chars: ['日', '俠', '月', '山'], strokes: { 日: 1, 月: 1, 山: 1 }, seconds: 30, seed }), { gap: 20, limit: 12 }).dealt;
    for (let i = 0; i < 12; i += 3) assert.deepEqual(mine.slice(i, i + 3).sort(), ['山', '日', '月'], `seed ${seed}: ${mine.join('')}`);
  }
  assert.ok(reshuffled > 50, 'each cycle is a new order');
  const two = playRight(start({ group: 'mine', chars: ['日', '月'], strokes: { 日: 1, 月: 1 }, seconds: 30, seed: 9 }), { gap: 20, limit: 12 }).dealt;
  assert.ok(two.every((ch, i) => i === 0 || ch !== two[i - 1]), two.join(''));
  const one = playRight(start({ group: 'mine', chars: ['日'], strokes: { 日: 1 }, seconds: 30 }), { gap: 20, limit: 4 }).dealt;
  assert.deepEqual(one, ['日', '日', '日', '日'], 'a group of one repeats it');
});

test('a miss is drawn again; the third miss on one stroke shows it and the character is assisted', () => {
  const rush = start({ group: 'mine', chars: ['日'], strokes: { 日: 4 }, mode: 'marathon', guides: false });
  const clock = { t: 0 };
  let v = stroke(rush, clock, false, 'start');
  assert.deepEqual([v.run.char.next, v.run.char.misses, v.run.char.strokeMisses, v.run.char.shown], [0, 1, 1, false]);
  assert.equal(v.run.char.say, 'Stroke 1 starts somewhere else.', 'no dot to point at in an empty square');
  v = stroke(rush, clock, false, 'reversed');
  assert.equal(v.run.char.say, 'Stroke 1 goes the other way.');
  v = stroke(rush, clock, false, 'shape');
  assert.equal(ASSIST_AFTER, 3);
  assert.deepEqual([v.run.char.shown, v.run.char.assisted, v.run.char.say], [true, true, 'Here is stroke 1: trace it.']);
  v = stroke(rush, clock, false, 'end');
  assert.deepEqual([v.run.char.misses, v.run.char.shown, v.run.char.say], [4, true, 'Stroke 1 ends somewhere else.']);
  v = stroke(rush, clock, true);
  assert.deepEqual([v.run.char.next, v.run.char.strokeMisses, v.run.char.shown, v.run.char.assisted, v.run.char.say], [1, 0, false, true, '']);
  v = stroke(rush, clock, false, 'order', 100, { matched: 3 });
  assert.equal(v.run.char.say, 'That is stroke 4. Stroke 2 comes first.');
  v = stroke(rush, clock, false, 'mystery');
  assert.equal(v.run.char.say, 'Not quite: draw stroke 2 again.');
  v = write(rush, clock);
  assert.equal(v.status, 'complete');
  assert.deepEqual([v.run.result.written, v.run.result.clean, v.run.result.misses, v.run.result.assisted], [1, 0, 6, 1]);
  // Once an assisted character is written, the run says it can no longer set a best.
  const two = start({ group: 'mine', chars: ['日', '月'], strokes: { 日: 1, 月: 1 }, mode: 'marathon' });
  for (let k = 0; k < ASSIST_AFTER; k += 1) v = stroke(two, clock, false, 'shape');
  assert.deepEqual([v.run.char.assisted, v.run.eligible, v.run.note], [true, true, null], 'not until it is written');
  v = stroke(two, clock, true);
  assert.deepEqual([v.run.written, v.run.assisted, v.run.misses, v.run.eligible], [1, 1, 3, false]);
  assert.equal(v.run.note, 'A stroke was shown, so this run cannot set a best.');
  // Misses are counted per stroke: two on each of two strokes show neither.
  const other = start({ group: 'mine', chars: ['日'], strokes: { 日: 4 }, mode: 'marathon' });
  for (const ok of [false, false, true, false, false, true]) v = stroke(other, clock, ok, 'shape');
  assert.deepEqual([v.run.char.next, v.run.char.misses, v.run.char.assisted], [2, 4, false]);
  assert.equal(v.run.char.say, '');
  v = stroke(other, clock, false, 'shape');
  assert.equal(v.run.char.say, 'Follow the grey line of stroke 3 a little more closely.', 'with guides, the pad\'s own words');
});

test('a tap is not a stroke, and a stale, doubled or untimed stroke changes nothing', () => {
  const rush = start({ group: 'hiragana-ka', strokes: countsOf(KA), mode: 'marathon' });
  const before = rush.view().run.char;
  let v = rush.act('stroke', { id: before.id, ok: false, why: 'short', began: 100, at: 120 });
  assert.equal(v.run.char.id, before.id, 'a tap takes no step');
  assert.deepEqual([v.run.char.misses, v.run.startedAt, v.run.char.say], [0, null, 'Draw the whole stroke in one movement.']);
  v = rush.act('stroke', { id: before.id, ok: true, began: 500, at: 700 });
  assert.equal(v.run.startedAt, 500, 'the clock starts with the first stroke, not the tap');
  const after = rush.act('stroke', { id: before.id, ok: true, began: 800, at: 900 });
  assert.equal(after.run.char.next, 1, 'the same id twice is one stroke');
  for (const bad of [{ id: 'nope', ok: true, at: 1000 }, { id: v.run.char.id, ok: 'yes', at: 1000 }, { id: v.run.char.id, ok: true }, { id: v.run.char.id, ok: true, at: -5 }, { id: v.run.char.id, ok: true, at: '1000' }]) {
    assert.deepEqual(rush.act('stroke', bad), after, JSON.stringify(bad));
  }
  assert.deepEqual(rush.act('jump', { id: v.run.char.id, at: 1000 }), after);
});

test('a rush starts its clock with the first stroke and counts only what is written by the deadline', () => {
  const rush = start({ group: 'hiragana-ka', strokes: countsOf(KA), seconds: 30 });
  assert.equal(rush.act('time', { at: 90000 }).status, 'playing', 'no stroke yet, no clock');
  assert.equal(rush.view().run.note, 'The clock starts with your first stroke.');
  const clock = { t: 5000 };
  let v = write(rush, clock);
  assert.deepEqual([v.run.startedAt, v.run.deadline, v.run.written, v.run.note], [5000, 35000, 1, null]);
  assert.equal(rush.act('time', { at: 34999 }).status, 'playing', 'before the deadline time changes nothing');
  // Write until the next character would end past the deadline, then finish one exactly on it.
  while (clock.t + 100 * v.run.char.strokeCount < 34000) v = write(rush, clock);
  const written = v.run.written;
  const { strokeCount } = v.run.char;
  for (let k = 0; k < strokeCount - 1; k += 1) v = stroke(rush, clock, true);
  v = rush.act('stroke', { id: v.run.char.id, ok: true, began: 34950, at: 35000 });
  assert.equal(v.run.written, written + 1, 'a character finished on the deadline counts');
  // The next character is in progress, missed and even shown at the deadline: it counts for nothing.
  clock.t = 35000;
  for (let k = 0; k < ASSIST_AFTER; k += 1) v = rush.act('stroke', { id: rush.view().run.char.id, ok: false, why: 'shape', at: 35000 });
  assert.equal(v.run.char.assisted, true);
  v = rush.act('time', { at: 35001 });
  assert.equal(v.status, 'complete');
  assert.deepEqual([v.run.result.written, v.run.result.misses, v.run.result.assisted, v.run.result.newBest], [written + 1, 0, 0, true]);
  assert.equal(v.run.result.heading, "Time's up");
  assert.equal(v.run.result.summary, `${written + 1} kana in 30 seconds, ${written + 1} without a miss.`);
  // A stroke that ends after the deadline ends the run, and does not count.
  const late = start({ group: 'mine', chars: ['日'], strokes: { 日: 1 }, seconds: 30 });
  late.act('stroke', { id: late.view().run.char.id, ok: true, began: 0, at: 10 });
  v = late.act('stroke', { id: late.view().run.char.id, ok: true, began: 29990, at: 30011 });
  assert.equal(v.status, 'complete');
  assert.equal(v.run.result.written, 1);
  // A first stroke longer than the rush ends it with nothing written.
  const slow = start({ group: 'mine', chars: ['日'], strokes: { 日: 1 }, seconds: 30 });
  v = slow.act('stroke', { id: slow.view().run.char.id, ok: true, began: 1000, at: 32000 });
  assert.deepEqual([v.status, v.run.result.written, v.run.result.newBest], ['complete', 0, false]);
  assert.equal(v.run.result.summary, 'No kanji finished in 30 seconds.');
  assert.equal(v.run.result.bestNote, 'Finish a character in time to set a best.');
});

test('a marathon runs from the first stroke\'s touch-down to the last stroke, and times never run backwards', () => {
  const rush = start({ group: 'mine', chars: ['日', '月', '一'], strokes: { 日: 2, 月: 2, 一: 1 }, mode: 'marathon' });
  const clock = { t: 2000 };
  let v = stroke(rush, clock, false, 'shape');
  assert.equal(v.run.startedAt, 2000, 'a miss is a stroke: the clock is running');
  assert.equal(v.run.deadline, null);
  while (v.status === 'playing') v = stroke(rush, clock, true);
  assert.equal(v.run.result.ms, clock.t - 100 + 50 - 2000);
  assert.deepEqual([v.run.result.written, v.run.result.of, v.run.result.clean, v.run.result.misses], [3, 3, 2, 1]);
  assert.equal(v.run.result.summary, '3 kanji in 0:00, with 1 miss.');
  assert.equal(v.run.result.heading, 'Marathon complete');
  // Without a touch-down time the first stroke's end starts the clock; a time
  // earlier than the latest is read as the latest.
  const back = start({ group: 'mine', chars: ['日'], strokes: { 日: 2 }, mode: 'marathon' });
  back.act('stroke', { id: back.view().run.char.id, ok: true, at: 1500 });
  v = back.act('stroke', { id: back.view().run.char.id, ok: true, began: 900, at: 1200 });
  assert.equal(v.run.result.ms, 0);
  const fine = start({ group: 'mine', chars: ['日'], strokes: { 日: 2 }, mode: 'marathon' });
  fine.act('stroke', { id: fine.view().run.char.id, ok: true, began: 1000, at: 1500 });
  v = fine.act('stroke', { id: fine.view().run.char.id, ok: true, began: 1400, at: 61900 });
  assert.equal(v.run.result.ms, 60900);
  assert.equal(v.run.result.summary, '1 kanji in 1:00, without a miss.');
});

test('bests are kept per group, mode, guides and rush length, and a result says whether it is new', () => {
  const rush = new WritingRush();
  const strokes = countsOf(`${KA}さしすせそ${SEVEN}`);
  /** A 30-second rush of the か row writing `n` characters right, then `missesOnLast` misses on the next. */
  const rushOf = (n, { seconds = 30, guides = true, group = 'hiragana-ka', misses = 0, seed = 1 } = {}) => {
    rush.start({ group, chars: [...SEVEN], strokes, seconds, guides, seed, today: TODAY });
    const clock = { t: 0 };
    for (let k = 0; k < misses; k += 1) stroke(rush, clock, false, 'shape', 10);
    for (let k = 0; k < n; k += 1) write(rush, clock, 10);
    return rush.act('time', { at: seconds * 1000 + 10 }).run.result;
  };
  let r = rushOf(5);
  assert.deepEqual([r.newBest, r.previous, r.bestNote], [true, null, 'Your first best for this group.']);
  assert.equal(r.best.written, 5);
  r = rushOf(4);
  assert.deepEqual([r.newBest, r.bestNote], [false, 'Your best is 5.']);
  r = rushOf(5);
  assert.equal(r.newBest, false, 'a tie is not a new best');
  r = rushOf(5, { misses: 1 });
  assert.equal(r.newBest, false, 'as many, but less clean');
  r = rushOf(7);
  assert.deepEqual([r.newBest, r.previous.written, r.bestNote], [true, 5, 'A new best! The last was 5.']);
  rush.start({ group: 'hiragana-ka', strokes, seconds: 30, seed: 2 });
  assert.equal(rush.view().run.best.written, 7, 'a run shows the best it is measured against');
  assert.equal(rush.view().run.best.summary, '7 kana in 30 seconds, 7 without a miss.');
  rush.act('abandon');
  assert.equal(rushOf(3, { seconds: 60 }).newBest, true, 'another length is another best');
  assert.equal(rushOf(2, { guides: false }).newBest, true, 'without guides is another best');
  assert.equal(rushOf(1, { group: 'hiragana-sa' }).newBest, true, 'another group is another best');
  r = rushOf(9, { misses: ASSIST_AFTER });
  assert.equal(r.written, 9, 'more than the best, the shown character among them');
  assert.deepEqual([r.assisted, r.newBest, r.bestNote], [1, false, 'A stroke was shown, so this run does not count for your best.']);
  assert.deepEqual(Object.keys(rush.bests).sort(), [
    'hiragana-ka:rush:30:blank', 'hiragana-ka:rush:30:guides', 'hiragana-ka:rush:60:guides', 'hiragana-sa:rush:30:guides',
  ]);
  assert.equal(rush.bests['hiragana-ka:rush:30:guides'].written, 7, 'the assisted run did not replace the best');
  assert.equal(bestKey({ group: 'n5', mode: 'marathon', seconds: 60, guides: false }), 'n5:marathon:blank');
  // A marathon: faster is better, the same second says so, and My kanji's
  // best stands for as many kanji as it was set on. The seven kanji take 31
  // strokes, so a pace of a stroke a second ends at 0:30.
  const marathon = (chars, gap) => {
    rush.start({ group: 'mine', chars, strokes: countsOf(chars), mode: 'marathon', today: TODAY });
    return playRight(rush, { clock: { t: 0 }, gap }).v.run.result;
  };
  r = marathon([...SEVEN], 1000);
  assert.deepEqual([r.newBest, r.of, r.ms, r.summary], [true, 7, 30500, '7 kanji in 0:30, without a miss.']);
  r = marathon([...SEVEN], 1100);
  assert.deepEqual([r.newBest, r.ms, r.bestNote], [false, 33550, 'Your best is 0:30.']);
  r = marathon([...SEVEN], 999);
  assert.deepEqual([r.newBest, r.ms, r.previous.ms, r.bestNote], [true, 30470, 30500, 'A new best, by less than a second!']);
  r = marathon([...SEVEN], 500);
  assert.deepEqual([r.newBest, r.ms, r.bestNote], [true, 15250, 'A new best! The last was 0:30.']);
  rush.start({ group: 'mine', chars: [...SEVEN, '山'], strokes: countsOf(`${SEVEN}山`), mode: 'marathon' });
  assert.equal(rush.view().run.best, null, 'a best over seven kanji is no measure for eight');
  rush.act('abandon');
  r = marathon([...SEVEN, '山'], 2000);
  assert.deepEqual([r.newBest, r.previous, r.of], [true, null, 8], 'a grown My kanji starts a new best');
  assert.equal(rush.bests['mine:marathon:guides'].of, 8);
});

test('the recent results are the last ten, newest first, each saying whether it set a best', () => {
  const rush = new WritingRush();
  for (let n = 1; n <= RECENT_KEPT + 2; n += 1) {
    rush.start({ group: 'mine', chars: ['日'], strokes: { 日: 1 }, seconds: 30, today: TODAY });
    const clock = { t: 0 };
    for (let k = 0; k < n; k += 1) write(rush, clock, 10);
    rush.act('time', { at: 31000 });
  }
  const { recent } = rush.view();
  assert.equal(recent.length, RECENT_KEPT);
  assert.deepEqual(recent.map((r) => r.written), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  assert.ok(recent.every((r) => r.best), 'each beat the last');
  assert.equal(recent[0].summary, '12 kanji in 30 seconds, 12 without a miss.');
  assert.equal(recent[0].groupTitle, 'My kanji');
});

test('the document keeps bests and recent results, never a run in progress', () => {
  const rush = start({ group: 'hiragana-ka', strokes: countsOf(KA), mode: 'marathon' });
  playRight(rush);
  assert.equal(rush.view().status, 'complete');
  rush.start({ group: 'hiragana-ka', strokes: countsOf(KA), mode: 'marathon', seed: 2 });
  assert.equal(rush.view().status, 'playing', 'a finished run\'s result gives way to a new run');
  assert.throws(() => rush.start({ group: 'hiragana-ka', strokes: countsOf(KA) }), { message: 'Finish or abandon the current run first.' });
  write(rush, { t: 0 });
  const doc = JSON.parse(JSON.stringify(rush.dump()));
  assert.deepEqual(Object.keys(doc).sort(), ['bests', 'format', 'recent']);
  assert.equal(doc.format, RUSH_FORMAT);
  assert.equal(doc.recent.length, 1, 'the run in progress is not in it');
  const again = new WritingRush(doc);
  assert.equal(again.recovered, false);
  const { run: _run, status, ...kept } = again.view();
  assert.deepEqual([status, _run], ['idle', null], 'a load starts with no run');
  const { run: _r, status: _s, ...was } = rush.view();
  assert.deepEqual(kept, was);
  // Abandoning a run keeps nothing of it; abandoning a result only closes it.
  let v = rush.act('abandon');
  assert.deepEqual([v.status, v.recent.length], ['idle', 1]);
  rush.start({ group: 'hiragana-ka', strokes: countsOf(KA), mode: 'marathon', seed: 4 });
  playRight(rush);
  v = rush.act('abandon');
  assert.deepEqual([v.status, v.recent.length], ['idle', 2]);
  assert.deepEqual(rush.act('stroke', { id: 'x', ok: true, at: 1 }), v, 'nothing to act on');
});

test('a damaged document keeps every good best and result, and says it was recovered', () => {
  const rec = (over = {}) => ({ group: 'hiragana-ka', mode: 'rush', guides: true, seconds: 30, ms: null, written: 12, clean: 10, misses: 2, assisted: 0, of: 5, day: TODAY, ...over });
  const good = rec();
  const marathon = rec({ group: 'n5', mode: 'marathon', seconds: null, ms: 95000, written: 79, clean: 79, misses: 0, of: 79, day: null });
  const doc = {
    format: RUSH_FORMAT,
    bests: {
      [bestKey(good)]: good,
      [bestKey(marathon)]: { ...marathon, mood: 'great' },
      'hiragana-sa:rush:30:guides': rec(),
      'hiragana-ka:rush:60:guides': rec({ seconds: 60, assisted: 1, misses: 5 }),
      'hiragana-ka:rush:120:guides': rec({ seconds: 120, clean: 13 }),
      'zz:rush:30:guides': rec({ group: 'zz' }),
      'hiragana-ka:rush:30:blank': rec({ guides: false, misses: 1 }),
      'n4:marathon:guides': rec({ group: 'n4', mode: 'marathon', seconds: null, ms: 1000, written: 3, of: 166 }),
    },
    recent: [{ ...good, best: true }, { ...good, best: 'yes' }, { ...rec({ assisted: 1, misses: 5 }), best: true }, { ...rec({ day: '2026-13-01' }), best: false }, 'junk', { ...marathon, best: false }],
  };
  const rush = new WritingRush(JSON.parse(JSON.stringify(doc)));
  assert.equal(rush.recovered, true);
  assert.deepEqual(rush.bests, { [bestKey(good)]: good, [bestKey(marathon)]: marathon }, 'only the good bests, an unknown field left out');
  assert.deepEqual(rush.recent, [{ ...good, best: true }, { ...marathon, best: false }]);
  // One broken part never takes the other with it.
  const noRecent = new WritingRush({ format: RUSH_FORMAT, bests: { [bestKey(good)]: good }, recent: 'lost' });
  assert.deepEqual([noRecent.recovered, Object.keys(noRecent.bests), noRecent.recent], [true, [bestKey(good)], []]);
  const noBests = new WritingRush({ format: RUSH_FORMAT, bests: [good], recent: [{ ...good, best: true }] });
  assert.deepEqual([noBests.recovered, noBests.bests, noBests.recent.length], [true, {}, 1]);
  const extra = new WritingRush({ format: RUSH_FORMAT, bests: { [bestKey(good)]: good }, recent: [], run: { at: 3 } });
  assert.deepEqual([extra.recovered, Object.keys(extra.bests).length, extra.run], [true, 1, null], 'a stored run is never resumed');
  const long = new WritingRush({ format: RUSH_FORMAT, bests: {}, recent: Array.from({ length: 14 }, () => ({ ...good, best: false })) });
  assert.deepEqual([long.recovered, long.recent.length], [true, RECENT_KEPT]);
  for (const bad of ['nonsense', [], { format: 'yomu-writing-rush/2', bests: { [bestKey(good)]: good }, recent: [] }, { bests: {}, recent: [] }]) {
    const r = new WritingRush(bad);
    assert.deepEqual([r.recovered, r.bests, r.recent], [true, {}, []], JSON.stringify(bad));
  }
  const fresh = new WritingRush();
  assert.equal(fresh.recovered, false);
  // Written back, a recovered document reads clean.
  assert.equal(new WritingRush(JSON.parse(JSON.stringify(rush.dump()))).recovered, false);
});

test('traced with the writing pad\'s judge, a marathon of the か row runs clean, and a reversed stroke is a miss', () => {
  const rush = start({ group: 'hiragana-ka', strokes: countsOf(KA), mode: 'marathon', guides: false, seed: 5 });
  const clock = { t: 0 };
  let v = rush.view();
  let reversedOnce = false;
  while (v.status === 'playing') {
    const { ch, next, id } = v.run.char;
    const strokes = strokesFor(PATHS.get(ch));
    const points = reversedOnce ? strokes[next].points : [...strokes[next].points].reverse();
    const verdict = traceStroke(strokes, next, points);
    v = rush.act('stroke', { id, ...verdict, began: clock.t, at: clock.t + 300 });
    clock.t += 400;
    if (!reversedOnce) {
      reversedOnce = true;
      assert.deepEqual([verdict.ok, v.run.char.say], [false, 'Stroke 1 goes the other way.']);
    }
  }
  assert.deepEqual([v.run.result.written, v.run.result.clean, v.run.result.misses, v.run.result.newBest], [5, 4, 1, true]);
  assert.equal(v.run.result.trouble.length, 1);
});

test('the clock reads minutes and seconds, and hours past an hour', () => {
  assert.deepEqual([0, 999, 59999, 61000, 600000, 3725000].map(clockText), ['0:00', '0:00', '0:59', '1:01', '10:00', '1:02:05']);
  assert.deepEqual(RUSH_SECONDS, [30, 60, 120]);
});
