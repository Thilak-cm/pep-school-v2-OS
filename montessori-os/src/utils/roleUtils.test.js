import test from 'node:test';
import assert from 'node:assert/strict';

import { isSuperAdmin, isClassroomAdmin, isAdminRole, getRoleLabel } from './roleUtils.js';

// --- isSuperAdmin ---

test('isSuperAdmin returns true only for "superadmin"', () => {
  assert.equal(isSuperAdmin('superadmin'), true);
  assert.equal(isSuperAdmin('classroomadmin'), false);
  assert.equal(isSuperAdmin('teacher'), false);
  assert.equal(isSuperAdmin('SuperAdmin'), false); // case-sensitive
  assert.equal(isSuperAdmin('SUPERADMIN'), false);
  assert.equal(isSuperAdmin(''), false);
  assert.equal(isSuperAdmin(null), false);
  assert.equal(isSuperAdmin(undefined), false);
});

// --- isClassroomAdmin ---

test('isClassroomAdmin returns true only for "classroomadmin"', () => {
  assert.equal(isClassroomAdmin('classroomadmin'), true);
  assert.equal(isClassroomAdmin('superadmin'), false);
  assert.equal(isClassroomAdmin('teacher'), false);
  assert.equal(isClassroomAdmin('ClassroomAdmin'), false);
  assert.equal(isClassroomAdmin(null), false);
});

// --- isAdminRole ---

test('isAdminRole returns true for both admin types, false for teacher', () => {
  assert.equal(isAdminRole('superadmin'), true);
  assert.equal(isAdminRole('classroomadmin'), true);
  assert.equal(isAdminRole('teacher'), false);
  assert.equal(isAdminRole('admin'), false); // not a valid role
  assert.equal(isAdminRole(''), false);
  assert.equal(isAdminRole(null), false);
  assert.equal(isAdminRole(undefined), false);
});

// --- getRoleLabel ---

test('getRoleLabel returns display labels for known roles', () => {
  assert.equal(getRoleLabel('superadmin'), 'Super Admin');
  assert.equal(getRoleLabel('classroomadmin'), 'Classroom Admin');
  assert.equal(getRoleLabel('teacher'), 'Teacher');
});

test('getRoleLabel falls back to raw role or "User"', () => {
  assert.equal(getRoleLabel('unknownrole'), 'unknownrole');
  assert.equal(getRoleLabel(''), 'User');
  assert.equal(getRoleLabel(null), 'User');
  assert.equal(getRoleLabel(undefined), 'User');
});
