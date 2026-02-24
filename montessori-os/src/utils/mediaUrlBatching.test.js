import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import {
  planMissingMediaUrlPaths,
  fetchMediaUrlsWithConcurrency,
} from './mediaUrlBatching';

test('planMissingMediaUrlPaths filters duplicates, empty paths, cached, and in-flight entries', () => {
  const result = planMissingMediaUrlPaths(
    ['a/path', '', null, 'a/path', 'b/path', 'c/path'],
    {
      mediaUrls: { 'b/path': 'https://example.test/b' },
      inFlightPaths: new Set(['c/path']),
    },
  );

  assert.deepEqual(result, ['a/path']);
});

test('fetchMediaUrlsWithConcurrency enforces concurrency cap', async () => {
  const paths = ['a', 'b', 'c', 'd', 'e', 'f'];
  let active = 0;
  let maxActive = 0;

  const updates = await fetchMediaUrlsWithConcurrency(
    paths,
    async (path) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(10);
      active -= 1;
      return `url:${path}`;
    },
    { concurrency: 2 },
  );

  assert.equal(maxActive <= 2, true);
  assert.deepEqual(updates, {
    a: 'url:a',
    b: 'url:b',
    c: 'url:c',
    d: 'url:d',
    e: 'url:e',
    f: 'url:f',
  });
});

test('fetchMediaUrlsWithConcurrency keeps successes when some fetches fail', async () => {
  const failures = [];

  const updates = await fetchMediaUrlsWithConcurrency(
    ['ok-1', 'bad-1', 'ok-2'],
    async (path) => {
      if (path.startsWith('bad')) {
        throw new Error(`boom:${path}`);
      }
      return `url:${path}`;
    },
    {
      concurrency: 3,
      onError: ({ path, error }) => failures.push([path, error.message]),
    },
  );

  assert.deepEqual(updates, {
    'ok-1': 'url:ok-1',
    'ok-2': 'url:ok-2',
  });
  assert.deepEqual(failures, [['bad-1', 'boom:bad-1']]);
});

test('fetchMediaUrlsWithConcurrency handles empty input and invalid concurrency', async () => {
  const noPaths = await fetchMediaUrlsWithConcurrency([], async () => 'unused', {
    concurrency: 0,
  });
  assert.deepEqual(noPaths, {});

  const updates = await fetchMediaUrlsWithConcurrency(
    ['x', 'y'],
    async (path) => `url:${path}`,
    { concurrency: -100 },
  );

  assert.deepEqual(updates, {
    x: 'url:x',
    y: 'url:y',
  });
});
