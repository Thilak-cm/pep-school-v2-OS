import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./StudentTimeline.jsx', import.meta.url), 'utf8');

test('Student Timeline passes the complete batch into the carousel', () => {
  assert.match(source, /handleMediaClick\(obs, mediaItems, 0\)/);
  assert.match(source, /carouselList: list/);
  assert.match(source, /mediaCount/);
});

test('carousel navigation supports media items fetched as batch siblings', () => {
  assert.match(source, /itemOrObservation/);
  assert.match(source, /itemOrObservation\?\.sourceObservation/);
});
