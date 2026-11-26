import assert from 'node:assert/strict';
import test from 'node:test';
import { createTransitionPlayer } from '../src/transition-player.js';

function createHarness(options = { duration: 1000 }) {
  let time = 0;
  let sequence = 0;
  const scheduled = new Map();
  const events = [];
  const paints = [];
  const player = createTransitionPlayer({
    ...options,
    now: () => time,
    requestFrame(callback) {
      const id = ++sequence;
      scheduled.set(id, callback);
      return id;
    },
    cancelFrame: id => scheduled.delete(id),
    render(progress, elapsed) {
      events.push({ type: 'render', progress });
      paints.push({ progress, elapsed });
    },
    setActive: active => events.push({ type: 'active', active }),
  });

  function advanceTo(nextTime) {
    assert.ok(nextTime >= time, 'The fake clock must move forward.');
    time = nextTime;
    const callbacks = [...scheduled.values()];
    scheduled.clear();
    for (const callback of callbacks) callback(time);
  }

  function action(name) {
    return () => events.push({ type: 'commit', name });
  }

  const commits = () => events.filter(event => event.type === 'commit').map(event => event.name);
  return { player, events, paints, scheduled, advanceTo, action, commits };
}

test('the default transition lasts two seconds and commits at one second', () => {
  const h = createHarness({});
  h.player.play(h.action('profile'));
  h.advanceTo(500);
  assert.deepEqual(h.paints.at(-1), { progress: .25, elapsed: 500 });
  h.advanceTo(999);
  assert.deepEqual(h.commits(), []);
  h.advanceTo(1000);
  assert.deepEqual(h.commits(), ['profile']);
  assert.deepEqual(h.paints.at(-1), { progress: .5, elapsed: 1000 });

  h.advanceTo(1999);
  assert.equal(h.scheduled.size, 1);
  assert.deepEqual(h.events.findLast(event => event.type === 'active'), { type: 'active', active: true });
  h.advanceTo(2000);
  assert.deepEqual(h.paints.at(-1), { progress: 1, elapsed: 2000 });
  assert.equal(h.scheduled.size, 0);
  assert.deepEqual(h.events.at(-1), { type: 'active', active: false });
  assert.deepEqual(h.commits(), ['profile']);
});

test('rapid navigation commits only the latest destination before cover', () => {
  const h = createHarness();
  h.player.play(h.action('profile'));
  h.advanceTo(120);
  h.player.play(h.action('guestbook'));
  h.advanceTo(260);
  h.player.play(h.action('chat'));
  h.advanceTo(499);
  assert.deepEqual(h.commits(), []);
  assert.equal(h.scheduled.size, 1);

  h.advanceTo(500);
  assert.deepEqual(h.commits(), ['chat']);
  const commitIndex = h.events.findIndex(event => event.type === 'commit');
  assert.deepEqual(h.events[commitIndex - 1], { type: 'render', progress: .5 });
  h.advanceTo(1000);
  assert.deepEqual(h.commits(), ['chat']);
  assert.equal(h.scheduled.size, 0);
  assert.deepEqual(h.events.at(-1), { type: 'active', active: false });
});

test('navigation during reveal reverses and covers again before committing', () => {
  const h = createHarness();
  h.player.play(h.action('profile'));
  h.advanceTo(500);
  h.advanceTo(800);
  h.player.play(h.action('guestbook'));
  h.advanceTo(900);
  const lastPaint = h.events.findLast(event => event.type === 'render');
  assert.ok(Math.abs(lastPaint.progress - .3) < 1e-9);
  assert.deepEqual(h.commits(), ['profile']);

  h.advanceTo(1099);
  assert.deepEqual(h.commits(), ['profile']);
  h.advanceTo(1101);
  assert.deepEqual(h.commits(), ['profile', 'guestbook']);
  h.advanceTo(1800);
  assert.deepEqual(h.commits(), ['profile', 'guestbook']);
  assert.equal(h.scheduled.size, 0);
});

test('glyph time keeps advancing when navigation reverses coverage', () => {
  const h = createHarness();
  h.player.play(h.action('profile'));
  h.advanceTo(500);
  h.advanceTo(800);
  assert.deepEqual(h.paints.at(-1), { progress: .8, elapsed: 800 });
  h.player.play(h.action('guestbook'));
  h.advanceTo(900);
  assert.ok(Math.abs(h.paints.at(-1).progress - .3) < 1e-9);
  assert.equal(h.paints.at(-1).elapsed, 900);
  h.advanceTo(1101);
  assert.equal(h.paints.at(-1).elapsed, 1101);
  assert.deepEqual(h.commits(), ['profile', 'guestbook']);
  assert.ok(h.paints.every((paint, index) => index === 0 || paint.elapsed >= h.paints[index - 1].elapsed));
});

test('a fresh transition restarts glyph time after the previous animation and idle time', () => {
  const h = createHarness();
  h.player.play(h.action('profile'));
  h.advanceTo(1000);
  h.advanceTo(2500);
  h.player.play(h.action('guestbook'));
  assert.deepEqual(h.paints.at(-1), { progress: 0, elapsed: 0 });
  h.advanceTo(2600);
  assert.deepEqual(h.paints.at(-1), { progress: .1, elapsed: 100 });
  assert.deepEqual(h.commits(), ['profile']);
});

test('a click exactly at the midpoint commits its new target once under cover', () => {
  const h = createHarness();
  h.player.play(h.action('profile'));
  h.advanceTo(500);
  h.player.play(h.action('guestbook'));
  h.advanceTo(510);
  h.advanceTo(600);
  h.advanceTo(1000);
  assert.deepEqual(h.commits(), ['profile', 'guestbook']);
  for (const [index, event] of h.events.entries()) {
    if (event.type === 'commit') {
      assert.deepEqual(h.events[index - 1], { type: 'render', progress: .5 });
    }
  }
});

test('reduced-motion navigation commits immediately with no scheduled frames', () => {
  const h = createHarness();
  h.player.play(h.action('profile'), true);
  assert.deepEqual(h.commits(), ['profile']);
  assert.equal(h.scheduled.size, 0);
  assert.equal(h.events.some(event => event.type === 'active' && event.active), false);
  assert.deepEqual(h.events.at(-2), { type: 'render', progress: 1 });
});

test('switching to immediate navigation replaces the old pending action', () => {
  const h = createHarness();
  h.player.play(h.action('profile'));
  h.advanceTo(200);
  h.player.play(h.action('guestbook'), true);
  assert.deepEqual(h.commits(), ['guestbook']);
  assert.equal(h.scheduled.size, 0);
  h.advanceTo(1000);
  assert.deepEqual(h.commits(), ['guestbook']);
});

test('settling a hidden page commits once and releases the active overlay', () => {
  const h = createHarness();
  h.player.play(h.action('profile'));
  h.advanceTo(200);
  h.player.settle();
  h.player.settle();
  assert.deepEqual(h.commits(), ['profile']);
  assert.equal(h.scheduled.size, 0);
  assert.deepEqual(h.events.at(-1), { type: 'active', active: false });

  h.player.play(h.action('guestbook'));
  h.advanceTo(700);
  h.player.settle();
  assert.deepEqual(h.commits(), ['profile', 'guestbook']);
  assert.equal(h.scheduled.size, 0);
});

test('destroy cancels pending work and later commands cannot commit', () => {
  const h = createHarness();
  h.player.play(h.action('profile'));
  h.advanceTo(200);
  h.player.destroy();
  const eventCount = h.events.length;
  h.advanceTo(2000);
  h.player.play(h.action('guestbook'));
  h.player.play(h.action('chat'), true);
  h.player.settle();
  assert.deepEqual(h.commits(), []);
  assert.equal(h.scheduled.size, 0);
  assert.equal(h.events.length, eventCount);
});

test('a delayed background frame renders full cover before changing pages', () => {
  const h = createHarness();
  h.player.play(h.action('profile'));
  h.advanceTo(100);
  const start = h.events.length;
  h.advanceTo(5000);
  assert.deepEqual(h.events.slice(start, start + 2), [
    { type: 'render', progress: .5 },
    { type: 'commit', name: 'profile' },
  ]);
  assert.deepEqual(h.commits(), ['profile']);
  assert.deepEqual(h.events.at(-1), { type: 'active', active: false });
  assert.equal(h.scheduled.size, 0);
});

test('redraw retains transition progress without committing or advancing it', () => {
  const h = createHarness();
  h.player.play(h.action('profile'));
  h.advanceTo(250);
  h.player.redraw();
  assert.deepEqual(h.events.at(-1), { type: 'render', progress: .25 });
  assert.deepEqual(h.paints.at(-1), { progress: .25, elapsed: 250 });
  h.player.redraw();
  assert.deepEqual(h.paints.at(-1), { progress: .25, elapsed: 250 });
  assert.deepEqual(h.commits(), []);
  assert.equal(h.scheduled.size, 1);
  h.advanceTo(1000);
  const count = h.events.length;
  h.player.redraw();
  assert.equal(h.events.length, count);
});
