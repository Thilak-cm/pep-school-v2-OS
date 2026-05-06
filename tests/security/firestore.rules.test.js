/**
 * Firestore Security Rules Verification Tests
 *
 * These tests verify that firestore.rules implements all non-negotiable access control patterns.
 * Run with: npm test (from montessori-os/ or set up at root)
 *
 * If a test fails, it means:
 * 1. A critical security function was deleted
 * 2. A rule pattern was refactored and no longer matches
 * 3. Access control logic was accidentally modified
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ACCESS_CONTROL_SPEC } from './accessControlSpec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the firestore.rules file
const rulesPath = path.resolve(__dirname, '../../firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

// Filter spec to only Firestore rules
const firestoreRules = ACCESS_CONTROL_SPEC.filter(
  (rule) => rule.file === 'firestore' || rule.file === 'both'
);

test('Firestore Rules - All critical access control patterns present', async (t) => {
  const criticalRules = firestoreRules.filter((r) => r.criticality === 'critical');

  for (const rule of criticalRules) {
    await t.test(`CRITICAL: ${rule.name}`, () => {
      const matches = rule.pattern.test(rulesContent);
      assert.ok(
        matches,
        `
Access control pattern MISSING: "${rule.name}"
Description: ${rule.description}
Pattern: ${rule.pattern}

This is a CRITICAL rule — without it, your access control is broken.
Check firestore.rules to verify this function/rule still exists.
        `
      );
    });
  }
});

test('Firestore Rules - All important access control patterns present', async (t) => {
  const importantRules = firestoreRules.filter((r) => r.criticality === 'important');

  for (const rule of importantRules) {
    await t.test(`IMPORTANT: ${rule.name}`, () => {
      const matches = rule.pattern.test(rulesContent);
      assert.ok(
        matches,
        `
Access control pattern MISSING: "${rule.name}"
Description: ${rule.description}

This is an IMPORTANT rule — check firestore.rules to see if it was modified.
        `
      );
    });
  }
});

test('Firestore Rules - Role hierarchy is complete', () => {
  // Verify all four role checks exist
  assert.ok(rulesContent.includes('isSuperAdmin()'), 'isSuperAdmin missing');
  assert.ok(rulesContent.includes('isClassroomAdmin()'), 'isClassroomAdmin missing');
  assert.ok(rulesContent.includes('isPrivilegedAdmin()'), 'isPrivilegedAdmin missing');
  assert.ok(rulesContent.includes('isTeacher()'), 'isTeacher missing');

  // Verify the hierarchy comment or logic is intact
  const superAdminCount = (rulesContent.match(/isSuperAdmin\s*\(\s*\)/g) || []).length;
  const classroomAdminCount = (rulesContent.match(/isClassroomAdmin\s*\(\s*\)/g) || []).length;

  assert.ok(
    superAdminCount >= 5,
    `isSuperAdmin appears ${superAdminCount} times (expected >= 5). It may have been deleted.`
  );
  assert.ok(
    classroomAdminCount >= 5,
    `isClassroomAdmin appears ${classroomAdminCount} times (expected >= 5). It may have been deleted.`
  );
});

test('Firestore Rules - Students collection has proper scoping', () => {
  // Extract the students match block
  const studentMatch = rulesContent.match(
    /match\s+\/students\/\{studentId\}[\s\S]*?(?=match\s+\/|$)/
  )?.[0];
  assert.ok(studentMatch, 'Students collection rules not found');

  // Verify classroom scoping exists
  assert.ok(
    studentMatch.includes('managesClassroom'),
    'Students rules missing managesClassroom check'
  );

  // Verify create and update rules exist
  assert.ok(studentMatch.includes('allow create'), 'Students missing create rule');
  assert.ok(studentMatch.includes('allow update'), 'Students missing update rule');
});

test('Firestore Rules - Observations 48h window enforced', () => {
  // Verify the function exists
  assert.ok(
    rulesContent.includes('withinAuthorActionWindow'),
    'withinAuthorActionWindow function missing'
  );

  // Verify it checks 48 hours
  assert.ok(
    rulesContent.includes("duration.value(48, 'h')") ||
      rulesContent.includes('duration.value(48, "h")'),
    '48-hour window not found in withinAuthorActionWindow'
  );

  // Verify it's used in observations
  const observationMatch = rulesContent.match(
    /match\s+\/observations\/\{observationId\}[\s\S]*?(?=match\s+\/|$)/
  )?.[0];
  assert.ok(
    observationMatch && observationMatch.includes('withinAuthorActionWindow'),
    'Observations rules not using withinAuthorActionWindow'
  );
});

test('Firestore Rules - Superadmin-only collections are protected', () => {
  // Check each protected collection
  const protectedCollections = [
    { name: 'programs', pattern: /match\s+\/programs\/\{programId\}/ },
    { name: 'config', pattern: /match\s+\/config\/\{docId\}/ },
  ];

  for (const collection of protectedCollections) {
    const collectionMatch = rulesContent.match(
      new RegExp(`${collection.pattern.source}[\\s\\S]*?(?=match\\s+\/|$)`)
    )?.[0];
    assert.ok(
      collectionMatch,
      `${collection.name} collection rules not found`
    );

    assert.ok(
      collectionMatch.includes('isSuperAdmin') &&
        (collectionMatch.includes('allow create') || collectionMatch.includes('create')),
      `${collection.name} missing superadmin-only create rule`
    );
  }
});

test('Firestore Rules - Classroom scoping functions present', () => {
  // Both functions must exist
  assert.ok(
    rulesContent.includes('function hasManageableClassroom'),
    'hasManageableClassroom function missing'
  );
  assert.ok(
    rulesContent.includes('function managesClassroom'),
    'managesClassroom function missing'
  );

  // hasManageableClassroom should check manageableClassrooms array
  const hasManageable = rulesContent.match(/function\s+hasManageableClassroom[\s\S]*?\}/)?.[0];
  assert.ok(
    hasManageable && hasManageable.includes('manageableClassrooms'),
    'hasManageableClassroom not checking manageableClassrooms array'
  );

  // managesClassroom should combine both
  const manages = rulesContent.match(/function\s+managesClassroom[\s\S]*?\}/)?.[0];
  assert.ok(
    manages && manages.includes('isSuperAdmin') && manages.includes('hasManageableClassroom'),
    'managesClassroom not combining superadmin and scoped access'
  );
});

test('Firestore Rules - Testbench collection is superadmin-only with sessionName-only updates', () => {
  const testbenchMatch = rulesContent.match(
    /match\s+\/testbench\/\{runId\}[\s\S]*?(?=match\s+\/|$)/
  )?.[0];
  assert.ok(testbenchMatch, 'Testbench collection rules not found');

  // Superadmin can read and create
  assert.ok(
    testbenchMatch.includes('isSuperAdmin'),
    'Testbench rules missing isSuperAdmin check'
  );
  assert.ok(
    testbenchMatch.includes('allow read, create'),
    'Testbench missing read/create rule'
  );

  // Update restricted to sessionName field only by superadmin
  assert.ok(
    testbenchMatch.includes('allow update'),
    'Testbench should allow update (restricted to sessionName)'
  );
  assert.ok(
    testbenchMatch.includes('affectedKeys'),
    'Testbench update rule must use affectedKeys() to restrict fields'
  );
  assert.ok(
    testbenchMatch.includes('sessionName'),
    'Testbench update rule must restrict to sessionName field'
  );
  assert.ok(
    testbenchMatch.includes('is string'),
    'Testbench update rule must validate sessionName is string type'
  );

  // Delete still denied
  assert.ok(
    testbenchMatch.includes('allow delete: if false'),
    'Testbench docs should not be deletable'
  );

  // Teacher should NOT be mentioned (no teacher access)
  assert.ok(
    !testbenchMatch.includes('isTeacher'),
    'Testbench should not grant teacher access'
  );
});

test('Firestore Rules - Teachers cannot escalate privileges', () => {
  // Teachers should not appear in create/update/delete rules for sensitive collections
  const userMatch = rulesContent.match(/match\s+\/users\/\{uid\}[\s\S]*?(?=match\s+\/|$)/)?.[0];

  assert.ok(userMatch, 'Users collection rules not found');

  // Users delete should only allow superadmin or classroomadmin
  assert.ok(
    userMatch.includes('allow delete') &&
      (userMatch.includes('isSuperAdmin') || userMatch.includes('isPrivilegedAdmin')),
    'Users delete rule may allow teachers to delete admins'
  );
});
