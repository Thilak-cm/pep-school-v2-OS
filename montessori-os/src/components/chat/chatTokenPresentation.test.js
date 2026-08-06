import test from 'node:test';
import assert from 'node:assert/strict';

import { createChatTokenPresentation } from './chatTokenPresentation.js';

function createScheduler() {
  let now = 0;
  let nextId = 1;
  const frames = new Map();
  const intervals = new Map();
  return {
    now: () => now,
    requestFrame: (callback) => { const id = nextId++; frames.set(id, callback); return id; },
    cancelFrame: (id) => frames.delete(id),
    setIntervalFn: (callback) => { const id = nextId++; intervals.set(id, callback); return id; },
    clearIntervalFn: (id) => intervals.delete(id),
    stepFrame(milliseconds = 1000 / 60) {
      now += milliseconds;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(now));
    },
    tickIntervals() { [...intervals.values()].forEach((callback) => callback()); },
    get frameCount() { return frames.size; },
    get intervalCount() { return intervals.size; },
  };
}

function setup() {
  const scheduler = createScheduler();
  const tokens = [];
  const progress = [];
  let firstPresented = 0;
  const controller = createChatTokenPresentation({
    onToken: (text) => tokens.push(text),
    onProgressChange: (text) => progress.push(text),
    onFirstPresented: () => { firstPresented += 1; },
    requestFrame: scheduler.requestFrame,
    cancelFrame: scheduler.cancelFrame,
    setIntervalFn: scheduler.setIntervalFn,
    clearIntervalFn: scheduler.clearIntervalFn,
    now: scheduler.now,
  });
  return { scheduler, controller, tokens, progress, get firstPresented() { return firstPresented; } };
}

test('coalesced SSE tokens render one FIFO fragment per animation frame', () => {
  const harness = setup();
  harness.controller.enqueue('One');
  harness.controller.enqueue(' two');
  harness.controller.enqueue(' three');
  assert.deepEqual(harness.tokens, []);

  harness.scheduler.stepFrame();
  assert.deepEqual(harness.tokens, ['One']);
  assert.equal(harness.firstPresented, 1);
  harness.scheduler.stepFrame();
  assert.deepEqual(harness.tokens, ['One', ' two']);
  harness.scheduler.stepFrame();
  assert.deepEqual(harness.tokens, ['One', ' two', ' three']);
  assert.equal(harness.firstPresented, 1);
});

test('progress quips display immediately, cycle, replace, and stop after first paint', () => {
  const harness = setup();
  harness.controller.replaceProgress(['First', 'Second']);
  assert.deepEqual(harness.progress, ['First']);
  assert.equal(harness.scheduler.intervalCount, 1);
  harness.scheduler.tickIntervals();
  assert.deepEqual(harness.progress, ['First', 'Second']);

  harness.controller.replaceProgress(['Latest']);
  assert.deepEqual(harness.progress, ['First', 'Second', 'Latest']);
  assert.equal(harness.scheduler.intervalCount, 0);

  harness.controller.enqueue('Answer');
  assert.equal(harness.controller.hasPresentedToken(), false);
  harness.scheduler.stepFrame();
  assert.equal(harness.controller.hasPresentedToken(), true);
  assert.equal(harness.progress.at(-1), null);
  harness.controller.replaceProgress(['Too late']);
  assert.equal(harness.progress.at(-1), null);
});

test('unknown-only progress restores generic copy represented by null', () => {
  const harness = setup();
  harness.controller.replaceProgress(['Known']);
  harness.controller.replaceProgress([]);
  assert.equal(harness.progress.at(-1), null);
  assert.equal(harness.scheduler.intervalCount, 0);
});

test('terminal drain preserves all received text and finishes within 500ms', async () => {
  const harness = setup();
  for (let index = 0; index < 40; index += 1) harness.controller.enqueue(String(index));
  const drained = harness.controller.drain();
  while (harness.scheduler.frameCount) harness.scheduler.stepFrame();
  await drained;
  assert.equal(harness.tokens.join(''), Array.from({ length: 40 }, (_, index) => String(index)).join(''));
  assert.ok(harness.scheduler.now() <= 500, `drained at ${harness.scheduler.now()}ms`);
});

test('clear cancels timers and frames and prevents stale presentation', async () => {
  const harness = setup();
  harness.controller.replaceProgress(['First', 'Second']);
  harness.controller.enqueue('stale');
  const drained = harness.controller.drain();
  harness.controller.clear();
  await drained;
  assert.equal(harness.scheduler.frameCount, 0);
  assert.equal(harness.scheduler.intervalCount, 0);
  harness.scheduler.stepFrame();
  harness.scheduler.tickIntervals();
  assert.deepEqual(harness.tokens, []);
  assert.equal(harness.progress.at(-1), null);
});

test('pre-token terminal drain resolves immediately without presenting content', async () => {
  const harness = setup();
  await harness.controller.drain();
  assert.deepEqual(harness.tokens, []);
  assert.equal(harness.firstPresented, 0);
});
