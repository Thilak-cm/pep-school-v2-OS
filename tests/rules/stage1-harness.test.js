import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearTestData,
  closeTestEnvironment,
  createAuthenticatedDb,
  initializeRulesTestEnvironment,
  seedFirestore,
} from './harness.js';
import { baseFixture } from './fixtures.js';

test.before(async () => {
  await initializeRulesTestEnvironment();
});

test.after(async () => {
  await closeTestEnvironment();
});

test.beforeEach(async () => {
  await clearTestData();
  await seedFirestore(baseFixture());
});

test('emulator harness seeds production-shaped fixture data and reads through rules', async () => {
  const db = createAuthenticatedDb('teacherAAuthor');
  const snapshot = await db.collection('students').doc('studentA').get();

  assert.equal(snapshot.exists, true);
  assert.equal(snapshot.data().classroomId, 'classroomA');
});
