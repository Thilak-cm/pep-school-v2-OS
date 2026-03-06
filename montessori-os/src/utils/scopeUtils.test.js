import test from 'node:test';
import assert from 'node:assert/strict';

import { filterTeachersForAdmin, isUserInScope, extractTeacherIdsFromClassrooms } from './scopeUtils.js';

// ============================================================================
// FIXTURES
// ============================================================================

const classrooms = [
  { id: 'cls-A', name: 'Classroom A', teacherIds: ['t1', 't2'] },
  { id: 'cls-B', name: 'Classroom B', teacherIds: ['t2', 't3'] },
  { id: 'cls-C', name: 'Classroom C', teacherIds: ['t4'] },
];

const teachers = [
  { id: 't1', firstName: 'Alice', role: 'teacher' },
  { id: 't2', firstName: 'Bob', role: 'teacher' },
  { id: 't3', firstName: 'Carol', role: 'teacher' },
  { id: 't4', firstName: 'Dan', role: 'teacher' },
  { id: 't5', firstName: 'Eve', role: 'teacher' }, // no classroom
];

// ============================================================================
// filterTeachersForAdmin
// ============================================================================

test('filterTeachersForAdmin returns only teachers in manageable classrooms', () => {
  // Admin manages cls-A only → should see t1, t2 (both in cls-A)
  const result = filterTeachersForAdmin(teachers, classrooms, ['cls-A']);
  const ids = result.map(t => t.id);
  assert.deepEqual(ids.sort(), ['t1', 't2']);
});

test('filterTeachersForAdmin with multiple manageable classrooms unions teachers', () => {
  // Admin manages cls-A and cls-B → t1, t2, t3
  const result = filterTeachersForAdmin(teachers, classrooms, ['cls-A', 'cls-B']);
  const ids = result.map(t => t.id);
  assert.deepEqual(ids.sort(), ['t1', 't2', 't3']);
});

test('filterTeachersForAdmin returns empty when no teachers match', () => {
  const result = filterTeachersForAdmin(teachers, classrooms, ['cls-nonexistent']);
  assert.equal(result.length, 0);
});

test('filterTeachersForAdmin handles empty classrooms array', () => {
  const result = filterTeachersForAdmin(teachers, [], ['cls-A']);
  assert.equal(result.length, 0);
});

test('filterTeachersForAdmin handles empty teachers array', () => {
  const result = filterTeachersForAdmin([], classrooms, ['cls-A']);
  assert.equal(result.length, 0);
});

test('filterTeachersForAdmin handles empty manageableClassrooms', () => {
  const result = filterTeachersForAdmin(teachers, classrooms, []);
  assert.equal(result.length, 0);
});

test('filterTeachersForAdmin excludes teacher with no classroom assignments', () => {
  // t5 has no classroom assignments → should never appear
  const result = filterTeachersForAdmin(teachers, classrooms, ['cls-A', 'cls-B', 'cls-C']);
  const ids = result.map(t => t.id);
  assert.ok(!ids.includes('t5'));
});

test('filterTeachersForAdmin preserves original teacher objects', () => {
  const result = filterTeachersForAdmin(teachers, classrooms, ['cls-C']);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 't4');
  assert.equal(result[0].firstName, 'Dan');
});

// ============================================================================
// isUserInScope
// ============================================================================

test('isUserInScope returns true for teacher in a manageable classroom', () => {
  assert.equal(isUserInScope('t1', classrooms, ['cls-A']), true);
});

test('isUserInScope returns true when teacher is in ANY manageable classroom', () => {
  // t2 is in cls-A and cls-B; admin manages cls-B
  assert.equal(isUserInScope('t2', classrooms, ['cls-B']), true);
});

test('isUserInScope returns false for teacher not in any manageable classroom', () => {
  // t4 is only in cls-C; admin manages cls-A
  assert.equal(isUserInScope('t4', classrooms, ['cls-A']), false);
});

test('isUserInScope returns false for teacher with no classroom assignments', () => {
  assert.equal(isUserInScope('t5', classrooms, ['cls-A', 'cls-B', 'cls-C']), false);
});

test('isUserInScope returns false for unknown userId', () => {
  assert.equal(isUserInScope('nonexistent', classrooms, ['cls-A']), false);
});

test('isUserInScope handles empty classrooms', () => {
  assert.equal(isUserInScope('t1', [], ['cls-A']), false);
});

test('isUserInScope handles empty manageableClassrooms', () => {
  assert.equal(isUserInScope('t1', classrooms, []), false);
});

// ============================================================================
// extractTeacherIdsFromClassrooms
// ============================================================================

test('extractTeacherIdsFromClassrooms returns unique teacher IDs from classrooms', () => {
  // t2 appears in both cls-A and cls-B but should only appear once
  const ids = extractTeacherIdsFromClassrooms(classrooms);
  assert.deepEqual([...ids].sort(), ['t1', 't2', 't3', 't4']);
});

test('extractTeacherIdsFromClassrooms deduplicates across classrooms', () => {
  const result = extractTeacherIdsFromClassrooms([
    { id: 'c1', teacherIds: ['t1', 't2'] },
    { id: 'c2', teacherIds: ['t2', 't3'] },
  ]);
  assert.deepEqual([...result].sort(), ['t1', 't2', 't3']);
});

test('extractTeacherIdsFromClassrooms returns empty array for no classrooms', () => {
  const result = extractTeacherIdsFromClassrooms([]);
  assert.equal(result.length, 0);
});

test('extractTeacherIdsFromClassrooms handles classrooms with no teacherIds', () => {
  const result = extractTeacherIdsFromClassrooms([
    { id: 'c1' },
    { id: 'c2', teacherIds: ['t1'] },
  ]);
  assert.deepEqual([...result], ['t1']);
});

test('extractTeacherIdsFromClassrooms handles classrooms with empty teacherIds', () => {
  const result = extractTeacherIdsFromClassrooms([
    { id: 'c1', teacherIds: [] },
  ]);
  assert.equal(result.length, 0);
});
