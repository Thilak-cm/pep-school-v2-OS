import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineQueries } from './timelineQueries.js';

test('fetches all classroom batch siblings by classroomId and batchId', async () => {
  const calls = [];
  const firestore = {
    collection: (...args) => ['collection', ...args],
    collectionGroup: (...args) => ['collectionGroup', ...args],
    getDocs: async (query) => {
      calls.push(query);
      return {
        docs: [{
          id: 'obs-2',
          data: () => ({ batchId: 'batch-1' }),
          ref: { path: 'students/s1/observations/obs-2', parent: { parent: { id: 's1' } } },
        }],
      };
    },
    limit: (value) => ['limit', value],
    orderBy: (...args) => ['orderBy', ...args],
    query: (...args) => ['query', ...args],
    startAfter: (value) => ['startAfter', value],
    where: (...args) => ['where', ...args],
  };

  const { fetchClassroomBatchObservations } = createTimelineQueries({ db: 'db', firestore });
  const result = await fetchClassroomBatchObservations({ classroomId: 'classroom-1', batchId: 'batch-1' });

  assert.equal(result.length, 1);
  assert.deepEqual(calls[0], [
    'query',
    ['collectionGroup', 'db', 'observations'],
    ['where', 'classroomId', '==', 'classroom-1'],
    ['where', 'batchId', '==', 'batch-1'],
  ]);
});
