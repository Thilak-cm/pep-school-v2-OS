import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTHOR_ACTION_WINDOW_HOURS,
  isObservationAuthor,
  isWithinAuthorActionWindow,
  isAuthorActionExpired,
  canDeleteObservation,
  canEditObservation,
  canReassignObservation,
  canViewObservation,
  canStarObservation,
  canCreateObservationForStudent,
  getObservationPermissions
} from './observationPermissions.js';

// Test helpers
const teacher = { uid: 'teacher-1' };
const otherTeacher = { uid: 'teacher-2' };

const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);

const makeObs = (createdBy, hoursOld = 1) => ({
  createdBy,
  createdAt: hoursAgo(hoursOld)
});

// --- Constants ---

test('AUTHOR_ACTION_WINDOW_HOURS is 48', () => {
  assert.equal(AUTHOR_ACTION_WINDOW_HOURS, 48);
});

// --- isObservationAuthor ---

test('isObservationAuthor: matches createdBy', () => {
  assert.equal(isObservationAuthor({ createdBy: 'teacher-1' }, teacher), true);
});

test('isObservationAuthor: matches teacherId', () => {
  assert.equal(isObservationAuthor({ teacherId: 'teacher-1' }, teacher), true);
});

test('isObservationAuthor: no match', () => {
  assert.equal(isObservationAuthor({ createdBy: 'teacher-2' }, teacher), false);
});

test('isObservationAuthor: null safety', () => {
  assert.equal(isObservationAuthor(null, teacher), false);
  assert.equal(isObservationAuthor({ createdBy: 'x' }, null), false);
  assert.equal(isObservationAuthor(null, null), false);
});

// --- isWithinAuthorActionWindow ---

test('48h window: observation 1 hour old → within window', () => {
  assert.equal(isWithinAuthorActionWindow(makeObs('x', 1)), true);
});

test('48h window: observation 47 hours old → within window', () => {
  assert.equal(isWithinAuthorActionWindow(makeObs('x', 47)), true);
});

test('48h window: observation 49 hours old → outside window', () => {
  assert.equal(isWithinAuthorActionWindow(makeObs('x', 49)), false);
});

test('48h window: observation exactly 48 hours old → boundary (within, <= check)', () => {
  // Subtract 1 second to avoid Date.now() drift between timestamp creation and assertion
  const obs = { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000 + 1000) };
  assert.equal(isWithinAuthorActionWindow(obs), true);
});

test('48h window: observation 48.01 hours old → outside window', () => {
  const obs = { createdAt: new Date(Date.now() - 48.01 * 60 * 60 * 1000) };
  assert.equal(isWithinAuthorActionWindow(obs), false);
});

test('48h window: handles Firestore timestamp with seconds', () => {
  const secondsAgo = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
  const obs = { createdAt: { seconds: secondsAgo } };
  assert.equal(isWithinAuthorActionWindow(obs), true);
});

test('48h window: handles Firestore timestamp with toDate()', () => {
  const obs = { createdAt: { toDate: () => hoursAgo(1) } };
  assert.equal(isWithinAuthorActionWindow(obs), true);
});

test('48h window: falls back to observedAt then timestamp', () => {
  assert.equal(isWithinAuthorActionWindow({ observedAt: hoursAgo(1) }), true);
  assert.equal(isWithinAuthorActionWindow({ timestamp: hoursAgo(1) }), true);
});

test('48h window: returns false for missing/invalid timestamps', () => {
  assert.equal(isWithinAuthorActionWindow({}), false);
  assert.equal(isWithinAuthorActionWindow({ createdAt: 'garbage' }), false);
  assert.equal(isWithinAuthorActionWindow({ createdAt: null }), false);
});

test('48h window: custom time limit', () => {
  const obs = makeObs('x', 5);
  assert.equal(isWithinAuthorActionWindow(obs, 4), false);  // 5h > 4h limit
  assert.equal(isWithinAuthorActionWindow(obs, 6), true);   // 5h < 6h limit
});

// --- canDeleteObservation / canEditObservation / canReassignObservation ---

test('admins can always delete/edit/reassign', () => {
  const oldObs = makeObs('other-teacher', 100); // very old, not the author
  assert.equal(canDeleteObservation(oldObs, teacher, 'superadmin'), true);
  assert.equal(canEditObservation(oldObs, teacher, 'superadmin'), true);
  assert.equal(canReassignObservation(oldObs, teacher, 'superadmin'), true);
  assert.equal(canDeleteObservation(oldObs, teacher, 'classroomadmin'), true);
  assert.equal(canEditObservation(oldObs, teacher, 'classroomadmin'), true);
  assert.equal(canReassignObservation(oldObs, teacher, 'classroomadmin'), true);
});

test('teacher (author) can delete/edit/reassign within 48h', () => {
  const recentObs = makeObs('teacher-1', 1);
  assert.equal(canDeleteObservation(recentObs, teacher, 'teacher'), true);
  assert.equal(canEditObservation(recentObs, teacher, 'teacher'), true);
  assert.equal(canReassignObservation(recentObs, teacher, 'teacher'), true);
});

test('teacher (author) CANNOT delete/edit/reassign after 48h', () => {
  const oldObs = makeObs('teacher-1', 49);
  assert.equal(canDeleteObservation(oldObs, teacher, 'teacher'), false);
  assert.equal(canEditObservation(oldObs, teacher, 'teacher'), false);
  assert.equal(canReassignObservation(oldObs, teacher, 'teacher'), false);
});

test('teacher (not author) CANNOT delete/edit/reassign even if recent', () => {
  const recentObs = makeObs('teacher-1', 1);
  assert.equal(canDeleteObservation(recentObs, otherTeacher, 'teacher'), false);
  assert.equal(canEditObservation(recentObs, otherTeacher, 'teacher'), false);
  assert.equal(canReassignObservation(recentObs, otherTeacher, 'teacher'), false);
});

test('null user or observation → always false', () => {
  assert.equal(canDeleteObservation(null, teacher, 'superadmin'), false);
  assert.equal(canDeleteObservation(makeObs('x'), null, 'superadmin'), false);
  assert.equal(canEditObservation(null, teacher, 'teacher'), false);
});

// --- isAuthorActionExpired ---

test('isAuthorActionExpired: true when author + outside window + teacher', () => {
  const oldObs = makeObs('teacher-1', 49);
  assert.equal(isAuthorActionExpired(oldObs, teacher, 'teacher'), true);
});

test('isAuthorActionExpired: false for admins (they always have access)', () => {
  const oldObs = makeObs('teacher-1', 49);
  assert.equal(isAuthorActionExpired(oldObs, teacher, 'superadmin'), false);
  assert.equal(isAuthorActionExpired(oldObs, teacher, 'classroomadmin'), false);
});

test('isAuthorActionExpired: false when still within window', () => {
  const recentObs = makeObs('teacher-1', 1);
  assert.equal(isAuthorActionExpired(recentObs, teacher, 'teacher'), false);
});

test('isAuthorActionExpired: false when not the author', () => {
  const oldObs = makeObs('teacher-1', 49);
  assert.equal(isAuthorActionExpired(oldObs, otherTeacher, 'teacher'), false);
});

// --- canViewObservation ---

test('admins can view any observation', () => {
  const obs = { createdBy: 'other', isPrivate: true };
  assert.equal(canViewObservation(obs, teacher, 'superadmin'), true);
});

test('teachers can view their own observations (even private)', () => {
  const privateObs = { createdBy: 'teacher-1', isPrivate: true };
  assert.equal(canViewObservation(privateObs, teacher, 'teacher'), true);
});

test('teachers can view public observations from others', () => {
  const publicObs = { createdBy: 'other', isPrivate: false };
  assert.equal(canViewObservation(publicObs, teacher, 'teacher'), true);
});

test('teachers CANNOT view private observations from others', () => {
  const privateObs = { createdBy: 'other', isPrivate: true };
  assert.equal(canViewObservation(privateObs, teacher, 'teacher'), false);
});

// --- canStarObservation ---

test('admins can star any observation', () => {
  const obs = { createdBy: 'other' };
  assert.equal(canStarObservation(obs, teacher, 'superadmin'), true);
});

test('teachers can only star their own observations', () => {
  assert.equal(canStarObservation({ createdBy: 'teacher-1' }, teacher, 'teacher'), true);
  assert.equal(canStarObservation({ createdBy: 'other' }, teacher, 'teacher'), false);
});

// --- canCreateObservationForStudent ---

test('admins can create for any student', () => {
  const student = { classroomId: 'class-A' };
  assert.equal(canCreateObservationForStudent(student, teacher, 'superadmin'), true);
});

test('teachers can create for students in their classrooms', () => {
  const student = { classroomId: 'class-A' };
  assert.equal(canCreateObservationForStudent(student, teacher, 'teacher', ['class-A', 'class-B']), true);
});

test('teachers CANNOT create for students outside their classrooms', () => {
  const student = { classroomId: 'class-C' };
  assert.equal(canCreateObservationForStudent(student, teacher, 'teacher', ['class-A', 'class-B']), false);
});

test('canCreateObservation handles classroomId as object ref', () => {
  const student = { classroomId: { id: 'class-A' } };
  assert.equal(canCreateObservationForStudent(student, teacher, 'teacher', ['class-A']), true);
});

// --- getObservationPermissions ---

test('getObservationPermissions returns all flags for admin', () => {
  const obs = makeObs('other', 100);
  const perms = getObservationPermissions(obs, teacher, 'superadmin');
  assert.equal(perms.canView, true);
  assert.equal(perms.canEdit, true);
  assert.equal(perms.canDelete, true);
  assert.equal(perms.canReassign, true);
  assert.equal(perms.canStar, true);
});

test('getObservationPermissions: teacher author within window', () => {
  const obs = makeObs('teacher-1', 1);
  const perms = getObservationPermissions(obs, teacher, 'teacher');
  assert.equal(perms.canView, true);
  assert.equal(perms.canEdit, true);
  assert.equal(perms.canDelete, true);
  assert.equal(perms.canReassign, true);
  assert.equal(perms.canStar, true);
});

test('getObservationPermissions: teacher author after 48h', () => {
  const obs = makeObs('teacher-1', 49);
  const perms = getObservationPermissions(obs, teacher, 'teacher');
  assert.equal(perms.canView, true);
  assert.equal(perms.canEdit, false);
  assert.equal(perms.canDelete, false);
  assert.equal(perms.canReassign, false);
  assert.equal(perms.canStar, true); // can still star own obs
});
