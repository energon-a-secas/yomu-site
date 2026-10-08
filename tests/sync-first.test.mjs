// A first sign-in when this browser and the account both hold data. A
// browser that never synced used to bring all of its own data into the
// account it first signed in to, on purpose, so a save older than a removal
// or a Clear all the account had made came back on every device (the
// review's P1 and P2). The learner now chooses, with the Add / Use question
// an account switch asks: Add brings this browser's data, as before; Use
// takes the account's, and this browser's own stays behind. A first device
// with an empty account, or a browser with nothing saved, joins without
// asking.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeDb } from './helpers/fake-convex.mjs';
import { device, T } from './helpers/sync-device.mjs';
import { decide, holdsOwn } from '../js/sync.js';
import { answeredBook, FIRST } from '../js/sync-book.js';
import { textKey } from '../js/history-store.js';

/**
 * The kanji the account holds saved: a row the account's Clear all covers
 * is dead, and is deleted only when a push next touches it.
 */
function savedOn(server) {
  const rows = server.rowsOf('user_a');
  const clear = Math.max(0, ...rows.clears.map((c) => c.at));
  return rows.kanji.filter((r) => r.saved && r.saved.s > Math.max(clear, r.removed)).map((r) => r.char).sort();
}
const savedHere = (d) => Object.keys(d.kanji.data.saved).sort();

/** P1: X saved 天 at T0, never signed in; Y saved, synced, unsaved it at T11. */
async function removedInAccount() {
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 0 });
  x.kanji.save('天', x.now());
  const y = device(server, 'user_a', { at: 1 });
  y.kanji.save('天', y.now());
  await y.signIn();
  y.tick(10);
  y.kanji.unsave('天');
  await y.sync.flush();
  x.tick(20);
  return { server, x, y };
}

/** P2: X saved three kanji, never signed in; Y saved, synced, cleared, T11. */
async function clearedInAccount() {
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 0 });
  for (const ch of ['一', '二', '三']) x.kanji.save(ch, x.now());
  const y = device(server, 'user_a', { at: 1 });
  for (const ch of ['一', '二', '三']) y.kanji.save(ch, y.now());
  await y.signIn();
  y.tick(10);
  y.kanji.clearAll(y.now());
  await y.sync.flush();
  x.tick(30);
  return { server, x, y };
}

test('the decision by the book alone: no book, or a first sign-in not settled, is a first join', () => {
  assert.equal(decide(null, 'user_a'), 'adopt');
  const first = answeredBook('user_a', FIRST, T(1), {});
  assert.equal(decide(first, 'user_a'), 'adopt', 'begin() settles it, and may ask');
  assert.equal(decide(first, 'user_b'), 'adopt', 'a first sign-in that never settled is still one for another account');
  assert.equal(holdsOwn({ kanji: { saved: {}, seen: { 天: {} } }, phrases: [] }), false, 'counts alone are not asked about');
});

test('a never-synced browser holding a kanji the account removed is asked first, and nothing moves until it answers', async () => {
  const { server, x } = await removedInAccount();
  const before = JSON.stringify(x.kanji.data);
  const asked = await x.signIn({ answer: null });
  assert.equal(asked.mode, 'ask');
  assert.equal(asked.first, true);
  assert.deepEqual(asked.counts, { account: { kanji: 0, phrases: 0 }, here: { kanji: 1, phrases: 0 } });
  assert.equal(JSON.stringify(x.kanji.data), before, 'nothing changed here');
  assert.equal(x.mutations().length, 0, 'and nothing was sent');
  assert.deepEqual(savedOn(server), []);
  assert.equal(x.books.read().pending, FIRST, 'the join waits in the book, its way not settled');
  const again = await x.signIn({ answer: null });
  assert.equal(again.first, true, 'a sign-in after Not now asks again');
});

test('P1 with Add: the kanji the account removed comes back, here and on every device', async () => {
  const { server, x, y } = await removedInAccount();
  await x.signIn({ answer: 'adopt' });
  assert.ok(x.kanji.isSaved('天'));
  assert.deepEqual(savedOn(server), ['天']);
  await y.sync.sync('same');
  assert.ok(y.kanji.isSaved('天'), 'Add brought this browser\'s data, as a first sign-in always did');
  assert.equal(x.books.read().pending, undefined);
});

test('P1 with Use: the removal stands, and this browser takes the account\'s data', async () => {
  const { server, x, y } = await removedInAccount();
  await x.signIn({ answer: 'replace' });
  assert.equal(x.kanji.isSaved('天'), false, 'this browser\'s old save stayed behind');
  assert.deepEqual(savedOn(server), []);
  await y.sync.sync('same');
  assert.equal(y.kanji.isSaved('天'), false);
  assert.equal(x.books.read().pending, undefined);
});

test('P2 with Add: the kanji the account cleared come back everywhere', async () => {
  const { server, x, y } = await clearedInAccount();
  const asked = await x.signIn({ answer: null });
  assert.equal(asked.first, true, 'a Clear all is data: the account was used');
  await x.signIn({ answer: 'adopt' });
  assert.deepEqual(savedHere(x), ['一', '三', '二']);
  await y.sync.sync('same');
  assert.deepEqual(savedHere(y), ['一', '三', '二']);
  assert.deepEqual(savedOn(server), ['一', '三', '二']);
});

test('P2 with Use: the Clear all stands, here and on every device', async () => {
  const { server, x, y } = await clearedInAccount();
  await x.signIn({ answer: 'replace' });
  assert.deepEqual(savedHere(x), []);
  await y.sync.sync('same');
  assert.deepEqual(savedHere(y), []);
  assert.deepEqual(savedOn(server), []);
});

test('Use on a first join takes the account\'s phrases, scores and display, and leaves this browser\'s behind', async () => {
  const server = fakeDb();
  const y = device(server, 'user_a', { at: 0 });
  y.kanji.save('雪', y.now());
  y.saveText('雪がふる。');
  y.play.finish('which', 3);
  y.setPref('romaji', 'off');
  await y.signIn();
  const x = device(server, 'user_a', { at: 5 });
  x.kanji.save('月', x.now());
  x.read(['月']);
  x.saveText('月がきれい。');
  x.play.finish('which', 9);
  await x.signIn({ answer: 'replace' });
  assert.deepEqual(savedHere(x), ['雪']);
  assert.equal(x.kanji.seenOf('月'), null, 'its counts stayed behind');
  assert.deepEqual(x.history.savedList().map((e) => e.t), ['雪がふる。']);
  assert.equal(x.history.isSaved(textKey('月がきれい。')), false);
  assert.equal(x.play.best('which'), 3);
  assert.equal(x.state.prefs.romaji, 'off');
  assert.ok(!JSON.stringify(server.rowsOf('user_a')).includes('月'), 'nothing of this browser\'s went to the account');
});

test('no question: a first device with an empty account joins as before, its data and all', async () => {
  const server = fakeDb();
  const a = device(server, 'user_a', { at: 0 });
  a.kanji.save('天', a.now());
  a.saveText('天気がいい。');
  const begun = await a.sync.begin();
  assert.equal(begun.mode, 'adopt');
  assert.equal(begun.first, undefined);
  assert.equal(a.books.read().pending, 'adopt', 'settled: it joins as is');
  await a.sync.sync(begun.mode);
  assert.deepEqual(savedOn(server), ['天']);
  assert.equal(server.rowsOf('user_a').phrases.length, 1);
});

test('no question: a browser with nothing saved joins an account with data, and its counts and scores come along', async () => {
  const server = fakeDb();
  const y = device(server, 'user_a', { at: 0 });
  y.kanji.save('雪', y.now());
  y.play.finish('which', 3);
  await y.signIn();
  const x = device(server, 'user_a', { at: 5 });
  x.read(['月']);
  x.play.finish('which', 9);
  const begun = await x.sync.begin();
  assert.equal(begun.mode, 'adopt', 'counts and scores alone are not asked about');
  assert.equal(x.mutations().length, 0);
  await x.sync.sync(begun.mode);
  assert.deepEqual(savedHere(x), ['雪']);
  assert.ok(x.kanji.seenOf('月'), 'its counts joined');
  await y.sync.sync('same');
  assert.ok(y.kanji.seenOf('月'));
  assert.equal(y.play.best('which'), 9);
});

test('no question: a browser that holds only phrases is asked too, and one with nothing at all is not', async () => {
  const server = fakeDb();
  const y = device(server, 'user_a', { at: 0 });
  y.kanji.save('雪', y.now());
  await y.signIn();
  const x = device(server, 'user_a', { at: 5 });
  x.saveText('雨がふる。');
  assert.equal((await x.signIn({ answer: null })).first, true, 'a saved phrase is data of its own');
  const z = device(server, 'user_a', { at: 6 });
  assert.equal((await z.sync.begin()).mode, 'adopt');
});

test('a first sign-in not settled is never run as an ordinary sync: it is decided again', async () => {
  const { x } = await removedInAccount();
  await x.signIn({ answer: null });                  // asked, and Not now
  await assert.rejects(x.sync.sync('same'), (err) => err.code === 'account-changed');
  assert.equal(x.mutations().length, 0, 'nothing was sent');
  assert.equal(x.books.read().pending, FIRST);
  assert.equal((await x.signIn({ answer: null })).first, true, 'begin() asks again');
});

// A Clear all made while a first sign-in waits for its answer (Not now)
// empties this browser, which is what its dialog says. A review found it
// kept as a Clear all of the account, so Add then emptied the account on
// every device, kanji this browser never showed included. Until the
// account's data arrives, a Clear all is a removal of each kanji it emptied
// here: Add carries those, as it carries an unsave, and Use drops them.

for (const answer of ['adopt', 'replace']) {
  test(`Not now, Clear all, then ${answer === 'adopt' ? 'Add' : 'Use'}: the account keeps the kanji this browser never held`, async () => {
    const server = fakeDb();
    const y = device(server, 'user_a', { at: 0 });
    for (const ch of ['一', '二']) y.kanji.save(ch, y.now());
    await y.signIn();
    const x = device(server, 'user_a', { at: 5 });
    x.kanji.save('一', x.now());
    x.kanji.save('三', x.now());
    x.saveText('雨がふる。');
    assert.equal((await x.signIn({ answer: null })).first, true, 'asked, and Not now');
    x.tick(1);
    x.kanji.clearAll(x.now());
    const book = x.books.read();
    assert.equal(book.epoch, 0, 'no Clear all of the account is kept');
    assert.deepEqual(Object.keys(book.removed.kanji).sort(), ['一', '三'], 'a removal of each kanji it emptied');
    x.tick(1);
    await x.signIn({ answer });
    assert.deepEqual(server.rowsOf('user_a').clears, [], 'the account was not cleared');
    const kept = answer === 'adopt' ? ['二'] : ['一', '二'];
    assert.deepEqual(savedOn(server), kept, answer === 'adopt' ? 'Add carries the removal of 一, which it held' : 'Use leaves the account as it was');
    assert.deepEqual(savedHere(x), kept);
    await y.sync.sync('same');
    assert.deepEqual(savedHere(y), kept, 'another device agrees');
  });
}

test('a begin() that outlives a sign-out writes nothing over the book the next sign-in keeps', async () => {
  // js/account.js writes a first sign-in's join when the kit says who
  // signed in. A whoami still out from the account before must not write
  // its subject over that book when it answers, which would drop what the
  // learner did since under the new one.
  const server = fakeDb();
  const x = device(server, 'user_a', { at: 0 });
  x.kanji.save('天', x.now());
  let release;
  const gate = new Promise((r) => { release = r; });
  const whoami = x.client.query;
  x.client.query = async (name, args) => { if (name === 'sync:whoami') await gate; return whoami(name, args); };
  const stale = x.sync.begin();
  x.sync.stop();                                            // signed out, then user_b signed in
  x.books.write(answeredBook('user_b', FIRST, T(1), {}));
  x.books.update((b) => { b.removed.kanji['天'] = T(2); });   // user_b's unsave, kept for its join
  release();
  await assert.rejects(stale, (err) => err.code === 'stopped');
  assert.equal(x.books.read().account, 'user_b');
  assert.equal(x.books.read().removed.kanji['天'], T(2), 'the new sign-in\'s unsave is kept');
  assert.equal(x.sync.subject, null, 'and the stale answer named nobody');
});
