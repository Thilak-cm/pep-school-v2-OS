import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LESSON_PROGRAM_DIMENSIONS,
  deriveDimensionKeyFromProgram,
  normalizeClassroomId,
  getLessonDimensions
} from './lessonNoteConstraints.js';

// --- deriveDimensionKeyFromProgram ---

test('deriveDimensionKey: exact program names', () => {
  assert.equal(deriveDimensionKeyFromProgram('toddler'), 'toddler');
  assert.equal(deriveDimensionKeyFromProgram('primary'), 'primary');
  assert.equal(deriveDimensionKeyFromProgram('elementary'), 'elementary');
  assert.equal(deriveDimensionKeyFromProgram('adolescent'), 'adolescent');
});

test('deriveDimensionKey: case insensitive, substring match', () => {
  assert.equal(deriveDimensionKeyFromProgram('Toddler Community'), 'toddler');
  assert.equal(deriveDimensionKeyFromProgram('PRIMARY_PROGRAM'), 'primary');
  assert.equal(deriveDimensionKeyFromProgram('lower-elementary'), 'elementary');
  assert.equal(deriveDimensionKeyFromProgram('ADOLESCENT_WORKSHOP'), 'adolescent');
});

test('deriveDimensionKey: defaults to "primary" for unknown/missing', () => {
  assert.equal(deriveDimensionKeyFromProgram('unknown'), 'primary');
  assert.equal(deriveDimensionKeyFromProgram(''), 'primary');
  assert.equal(deriveDimensionKeyFromProgram(null), 'primary');
  assert.equal(deriveDimensionKeyFromProgram(undefined), 'primary');
});

test('deriveDimensionKey: priority — toddler checked before elementary', () => {
  // If someone had "toddler-elementary" it should match toddler first
  assert.equal(deriveDimensionKeyFromProgram('toddler-elementary'), 'toddler');
});

test('each dimension key maps to valid dimensions array', () => {
  for (const key of ['toddler', 'primary', 'elementary', 'adolescent']) {
    const dims = LESSON_PROGRAM_DIMENSIONS[key];
    assert.ok(Array.isArray(dims), `${key} should have dimensions array`);
    assert.ok(dims.length >= 3, `${key} should have at least 3 dimensions`);
    dims.forEach((d) => assert.equal(typeof d, 'string'));
  }
});

// --- normalizeClassroomId ---

test('normalizeClassroomId: plain string ID', () => {
  assert.equal(normalizeClassroomId('class-123'), 'class-123');
});

test('normalizeClassroomId: Firestore path → extracts last segment', () => {
  assert.equal(normalizeClassroomId('classrooms/class-123'), 'class-123');
  assert.equal(normalizeClassroomId('branches/branch-1/classrooms/class-123'), 'class-123');
});

test('normalizeClassroomId: object with id', () => {
  assert.equal(normalizeClassroomId({ id: 'class-123' }), 'class-123');
});

test('normalizeClassroomId: object with path', () => {
  assert.equal(normalizeClassroomId({ path: 'classrooms/class-123' }), 'class-123');
});

test('normalizeClassroomId: falsy input returns null', () => {
  assert.equal(normalizeClassroomId(null), null);
  assert.equal(normalizeClassroomId(undefined), null);
  assert.equal(normalizeClassroomId(''), null);
  assert.equal(normalizeClassroomId(0), null);
});

test('normalizeClassroomId: object without id or path returns null', () => {
  assert.equal(normalizeClassroomId({}), null);
  assert.equal(normalizeClassroomId({ name: 'test' }), null);
});

// --- getLessonDimensions ---

test('getLessonDimensions: extracts from ratings field', () => {
  const obs = {
    ratings: { 'Focused during lesson': 'yes', 'Grasped work': 'partial' }
  };
  const dims = getLessonDimensions(obs);
  assert.equal(dims.length, 2);
  assert.equal(dims[0].name, 'Focused during lesson');
  assert.equal(dims[0].value, 'yes');
});

test('getLessonDimensions: uses dimensionRatings as fallback', () => {
  const obs = {
    dimensionRatings: { 'Attentive': 'no' }
  };
  const dims = getLessonDimensions(obs);
  assert.equal(dims.length, 1);
  assert.equal(dims[0].value, 'no');
});

test('getLessonDimensions: respects dimensionOrder', () => {
  const obs = {
    dimensionOrder: ['B', 'A'],
    ratings: { A: 'yes', B: 'no' }
  };
  const dims = getLessonDimensions(obs);
  assert.equal(dims[0].name, 'B');
  assert.equal(dims[1].name, 'A');
});

test('getLessonDimensions: defaults missing ratings to "na"', () => {
  const obs = {
    dimensionOrder: ['Missing'],
    ratings: {}
  };
  const dims = getLessonDimensions(obs);
  assert.equal(dims[0].value, 'na');
});

test('getLessonDimensions: empty observation returns empty array', () => {
  assert.deepEqual(getLessonDimensions({}), []);
  assert.deepEqual(getLessonDimensions(), []);
});
