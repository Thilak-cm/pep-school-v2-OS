import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMediaItemsForObservation,
  groupMediaObservations,
} from './groupedMediaUtils.js';

const media = (id, batchId, storagePath, observedAt = id) => ({
  id,
  type: 'media',
  batchId,
  mediaKind: 'photo',
  media: [{ storagePath }],
  observedAt,
  studentId: 'student-1',
});

test('groups every observation sharing a batchId into one media item', () => {
  const grouped = groupMediaObservations([
    media('one', 'batch-1', 'one.webp'),
    media('two', 'batch-1', 'two.webp'),
    media('three', 'batch-1', 'three.webp'),
    { id: 'text-1', type: 'text' },
  ]);

  assert.equal(grouped.length, 2);
  const batch = grouped.find((item) => item.batchId === 'batch-1');
  assert.equal(batch.mediaItems.length, 3);
  assert.deepEqual(batch.mediaItems.map((item) => item.storagePath), ['one.webp', 'two.webp', 'three.webp']);
});

test('keeps a singleton media observation as an ordinary media item', () => {
  const [item] = groupMediaObservations([media('one', 'batch-1', 'one.webp')]);
  assert.equal(item.id, 'one');
  assert.equal(item.mediaItems.length, 1);
});

test('does not group PDFs with photo/video batches', () => {
  const grouped = groupMediaObservations([
    media('photo', 'batch-1', 'photo.webp'),
    { ...media('pdf', 'batch-2', 'note.pdf'), mediaKind: 'pdf' },
  ]);

  assert.equal(grouped.length, 2);
  assert.equal(grouped.find((item) => item.id === 'pdf').mediaItems.length, 1);
});

test('normalizes one media observation into carousel-compatible items', () => {
  const items = buildMediaItemsForObservation(media('one', 'batch-1', 'one.webp'));
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceObservation.id, 'one');
  assert.equal(items[0].storagePath, 'one.webp');
});
