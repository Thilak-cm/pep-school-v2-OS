import test from 'node:test';
import assert from 'node:assert/strict';

import { createTimelineQueries } from './timelineQueries.js';

test('fetchStudentBatchObservations queries all siblings by batchId', async () => {
  const calls = [];
  const firestore = {
    collection: (...args) => ['collection', ...args],
    getDocs: async (q) => {
      calls.push(q);
      return { docs: [{ id: 'obs-2', data: () => ({ batchId: 'batch-1' }), ref: { path: 'students/s1/observations/obs-2' } }] };
    },
    query: (...args) => args,
    where: (...args) => ['where', ...args],
  };
  const { fetchStudentBatchObservations } = createTimelineQueries({ db: 'db', firestore });

  const result = await fetchStudentBatchObservations({ studentId: 's1', batchId: 'batch-1' });

  assert.equal(result[0].id, 'obs-2');
  assert.deepEqual(calls[0], [
    ['collection', 'db', 'students', 's1', 'observations'],
    ['where', 'batchId', '==', 'batch-1'],
  ]);
});
