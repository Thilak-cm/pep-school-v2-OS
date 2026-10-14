import test from 'node:test';
import assert from 'node:assert/strict';

import { createTimelineQueries } from './timelineQueries.js';

function createMockFirestore({ docs = [] } = {}) {
  const calls = [];
  const mockDocs = docs.map((d) => ({
    id: d.id,
    data: () => d,
    ref: d._ref || { path: `students/${d.studentId || 's1'}/observations/${d.id}`, parent: { parent: { id: d.studentId || 's1' } } },
  }));
  const firestore = {
    collection: (...args) => ['collection', ...args],
    collectionGroup: (...args) => ['collectionGroup', ...args],
    getCountFromServer: async (q) => {
      calls.push({ type: 'count', query: q });
      return { data: () => ({ count: docs.length }) };
    },
    getDocs: async (q) => {
      calls.push({ type: 'getDocs', query: q });
      return { docs: mockDocs };
    },
    limit: (value) => ['limit', value],
    orderBy: (...args) => ['orderBy', ...args],
    query: (...args) => ['query', ...args],
    startAfter: (value) => ['startAfter', value],
    where: (...args) => ['where', ...args],
    count: () => ['count'],
  };
  return { firestore, calls };
}

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

// --- Server-side filter tests ---

test('fetchClassroomTimelineNotes composes authors filter as where-in clause', async () => {
  const { firestore, calls } = createMockFirestore({
    docs: [{ id: 'obs-1', classroomId: 'c1', createdBy: 'u1', observedAt: 100 }],
  });
  const { fetchClassroomTimelineNotes } = createTimelineQueries({ db: 'db', firestore });

  const result = await fetchClassroomTimelineNotes({
    classroomId: 'c1', pageSize: 20, filters: { authors: ['u1', 'u2'] },
  });

  const queryArgs = calls[0].query;
  assert.ok(queryArgs.some((c) =>
    Array.isArray(c) && c[0] === 'where' && c[1] === 'createdBy' && c[2] === 'in',
  ), 'should include createdBy in clause');
  assert.equal(result.notes.length, 1);
});

test('fetchClassroomTimelineNotes composes types filter as where-in clause', async () => {
  const { firestore, calls } = createMockFirestore({
    docs: [{ id: 'obs-1', classroomId: 'c1', type: 'voice', observedAt: 100 }],
  });
  const { fetchClassroomTimelineNotes } = createTimelineQueries({ db: 'db', firestore });

  await fetchClassroomTimelineNotes({
    classroomId: 'c1', pageSize: 20, filters: { types: ['voice', 'text'] },
  });

  const queryArgs = calls[0].query;
  assert.ok(queryArgs.some((c) =>
    Array.isArray(c) && c[0] === 'where' && c[1] === 'type' && c[2] === 'in',
  ), 'should include type in clause');
});

test('fetchClassroomTimelineNotes composes combined authors + types filters', async () => {
  const { firestore, calls } = createMockFirestore({
    docs: [{ id: 'obs-1', classroomId: 'c1', createdBy: 'u1', type: 'voice', observedAt: 100 }],
  });
  const { fetchClassroomTimelineNotes } = createTimelineQueries({ db: 'db', firestore });

  await fetchClassroomTimelineNotes({
    classroomId: 'c1', pageSize: 20, filters: { authors: ['u1'], types: ['voice'] },
  });

  const queryArgs = calls[0].query;
  const hasCreatedBy = queryArgs.some((c) => Array.isArray(c) && c[1] === 'createdBy');
  const hasType = queryArgs.some((c) => Array.isArray(c) && c[1] === 'type');
  assert.ok(hasCreatedBy && hasType, 'should include both createdBy and type clauses');
});

test('fetchClassroomTimelineNotes composes dateFrom/dateTo as range bounds', async () => {
  const { firestore, calls } = createMockFirestore({
    docs: [{ id: 'obs-1', classroomId: 'c1', observedAt: 100 }],
  });
  const { fetchClassroomTimelineNotes } = createTimelineQueries({ db: 'db', firestore });

  await fetchClassroomTimelineNotes({
    classroomId: 'c1', pageSize: 20, filters: { dateFrom: 50, dateTo: 150 },
  });

  const queryArgs = calls[0].query;
  const hasGte = queryArgs.some((c) => Array.isArray(c) && c[1] === 'observedAt' && c[2] === '>=');
  const hasLte = queryArgs.some((c) => Array.isArray(c) && c[1] === 'observedAt' && c[2] === '<=');
  assert.ok(hasGte && hasLte, 'should include observedAt range bounds');
});

test('fetchClassroomTimelineNotes returns lastDocSnapshot for cursor pagination', async () => {
  const { firestore } = createMockFirestore({
    docs: [{ id: 'obs-1', classroomId: 'c1', observedAt: 100 }],
  });
  const { fetchClassroomTimelineNotes } = createTimelineQueries({ db: 'db', firestore });

  const result = await fetchClassroomTimelineNotes({ classroomId: 'c1', pageSize: 20 });

  assert.ok(result.lastDocSnapshot !== undefined, 'should return lastDocSnapshot');
  assert.equal(result.lastDocSnapshot.id, 'obs-1');
});

test('fetchClassroomTimelineNotes without filters returns notes + lastDocSnapshot (backward compat)', async () => {
  const { firestore } = createMockFirestore({
    docs: [{ id: 'obs-1', classroomId: 'c1', observedAt: 100 }],
  });
  const { fetchClassroomTimelineNotes } = createTimelineQueries({ db: 'db', firestore });

  const result = await fetchClassroomTimelineNotes({ classroomId: 'c1', pageSize: 20 });

  assert.equal(result.notes.length, 1);
  assert.equal(result.notes[0].id, 'obs-1');
});

test('fetchStudentTimelineNotes composes authors filter', async () => {
  const { firestore, calls } = createMockFirestore({
    docs: [{ id: 'obs-1', studentId: 's1', createdBy: 'u1', observedAt: 100 }],
  });
  const { fetchStudentTimelineNotes } = createTimelineQueries({ db: 'db', firestore });

  await fetchStudentTimelineNotes({
    studentId: 's1', pageSize: 20, filters: { authors: ['u1'] },
  });

  const queryArgs = calls[0].query;
  assert.ok(queryArgs.some((c) =>
    Array.isArray(c) && c[0] === 'where' && c[1] === 'createdBy' && c[2] === 'in',
  ));
});

test('fetchStudentTimelineNotes composes types filter', async () => {
  const { firestore, calls } = createMockFirestore({
    docs: [{ id: 'obs-1', studentId: 's1', type: 'lesson', observedAt: 100 }],
  });
  const { fetchStudentTimelineNotes } = createTimelineQueries({ db: 'db', firestore });

  await fetchStudentTimelineNotes({
    studentId: 's1', pageSize: 20, filters: { types: ['lesson'] },
  });

  const queryArgs = calls[0].query;
  assert.ok(queryArgs.some((c) =>
    Array.isArray(c) && c[0] === 'where' && c[1] === 'type' && c[2] === 'in',
  ));
});

test('fetchStudentTimelineNotes returns lastDocSnapshot', async () => {
  const { firestore } = createMockFirestore({
    docs: [{ id: 'obs-1', studentId: 's1', observedAt: 100 }],
  });
  const { fetchStudentTimelineNotes } = createTimelineQueries({ db: 'db', firestore });

  const result = await fetchStudentTimelineNotes({ studentId: 's1', pageSize: 20 });

  assert.ok(result.lastDocSnapshot);
  assert.equal(result.lastDocSnapshot.id, 'obs-1');
});

test('fetchFilteredCount returns count for classroom with filters', async () => {
  const { firestore, calls } = createMockFirestore({
    docs: [{ id: 'obs-1' }, { id: 'obs-2' }, { id: 'obs-3' }],
  });
  const { fetchFilteredCount } = createTimelineQueries({ db: 'db', firestore });

  const count = await fetchFilteredCount({
    scope: 'classroom', id: 'c1',
    filters: { authors: ['u1'], types: ['voice'] },
  });

  assert.equal(count, 3);
  const countCall = calls.find((c) => c.type === 'count');
  assert.ok(countCall, 'should call getCountFromServer');
});

test('fetchFilteredCount returns count for student with filters', async () => {
  const { firestore } = createMockFirestore({
    docs: [{ id: 'obs-1' }, { id: 'obs-2' }],
  });
  const { fetchFilteredCount } = createTimelineQueries({ db: 'db', firestore });

  const count = await fetchFilteredCount({
    scope: 'student', id: 's1',
    filters: { types: ['lesson'] },
  });

  assert.equal(count, 2);
});

test('fetchFilteredCount includes dateFrom/dateTo range', async () => {
  const { firestore, calls } = createMockFirestore({ docs: [] });
  const { fetchFilteredCount } = createTimelineQueries({ db: 'db', firestore });

  await fetchFilteredCount({
    scope: 'classroom', id: 'c1',
    filters: { dateFrom: 50, dateTo: 150 },
  });

  const countCall = calls.find((c) => c.type === 'count');
  const queryArgs = countCall.query;
  const hasGte = queryArgs.some((c) => Array.isArray(c) && c[1] === 'observedAt' && c[2] === '>=');
  const hasLte = queryArgs.some((c) => Array.isArray(c) && c[1] === 'observedAt' && c[2] === '<=');
  assert.ok(hasGte && hasLte, 'count query should include date range bounds');
});
