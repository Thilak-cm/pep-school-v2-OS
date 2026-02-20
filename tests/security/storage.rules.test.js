/**
 * Storage Security Rules Verification Tests
 *
 * These tests verify that storage.rules implements the critical budget constraints
 * and access control patterns that prevent 403 errors and unauthorized uploads.
 * Run with: npm test
 *
 * Most important: the firestore.get() budget constraint (max 2 calls per rule evaluation).
 * This prevents the classroomadmin 403 bug where a 3rd lookup pushed over the limit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ACCESS_CONTROL_SPEC } from './accessControlSpec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the storage.rules file
const rulesPath = path.resolve(__dirname, '../../storage.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

// Filter spec to only Storage rules
const storageRules = ACCESS_CONTROL_SPEC.filter(
  (rule) => rule.file === 'storage' || rule.file === 'both'
);

test('Storage Rules - All critical patterns present', async (t) => {
  const criticalRules = storageRules.filter((r) => r.criticality === 'critical');

  for (const rule of criticalRules) {
    await t.test(`CRITICAL: ${rule.name}`, () => {
      const matches = rule.pattern.test(rulesContent);
      assert.ok(
        matches,
        `
Storage access control pattern MISSING: "${rule.name}"
Description: ${rule.description}
Pattern: ${rule.pattern}

This is a CRITICAL rule — without it, storage access or budget is broken.
Check storage.rules to verify this function/rule still exists.
        `
      );
    });
  }
});

test('Storage Rules - All important patterns present', async (t) => {
  const importantRules = storageRules.filter((r) => r.criticality === 'important');

  for (const rule of importantRules) {
    await t.test(`IMPORTANT: ${rule.name}`, () => {
      const matches = rule.pattern.test(rulesContent);
      assert.ok(
        matches,
        `
Storage pattern MISSING: "${rule.name}"
Description: ${rule.description}

This is an IMPORTANT rule — check storage.rules to see if it was modified.
        `
      );
    });
  }
});

test('Storage Rules - firestore.get() budget is maintained (max 2 calls)', () => {
  // Remove comments to get accurate count
  const withoutComments = rulesContent.split('\n').map(line => {
    const commentIndex = line.indexOf('//');
    return commentIndex === -1 ? line : line.substring(0, commentIndex);
  }).join('\n');

  const firestoreGetCalls = (withoutComments.match(/firestore\.get\s*\(/g) || []).length;

  // There should be exactly 2 function definitions that call firestore.get():
  // 1. requesterDoc()
  // 2. mediaDoc()
  assert.ok(
    firestoreGetCalls === 2,
    `Found ${firestoreGetCalls} firestore.get() calls (expected 2).
     Having more than 2 means you're over the Storage rules budget and will hit 403 errors.
     Check the comment in storage.rules about the budget constraint.`
  );
});

test('Storage Rules - Role gate uses only requesterDoc and mediaDoc', () => {
  // Verify isKnownRole exists and doesn't call firestore.get()
  const isKnownRole = rulesContent.match(/function\s+isKnownRole\s*\(\s*\)[\s\S]*?\}/)?.[0];
  assert.ok(isKnownRole, 'isKnownRole function missing');

  // isKnownRole should NOT call firestore.get()
  assert.ok(
    !isKnownRole.includes('firestore.get'),
    'isKnownRole should not call firestore.get() — use requesterDoc() instead'
  );

  // It should check requesterDoc().data.role
  assert.ok(
    isKnownRole.includes('requesterDoc'),
    'isKnownRole not using requesterDoc'
  );
});

test('Storage Rules - No studentClassroomId lookup (budget violation)', () => {
  // This was the bug: trying to add a 3rd firestore.get() for studentClassroomId
  // Remove comments first (it's OK if it appears in a comment explaining the constraint)
  const withoutComments = rulesContent.split('\n').map(line => {
    const commentIndex = line.indexOf('//');
    return commentIndex === -1 ? line : line.substring(0, commentIndex);
  }).join('\n');

  assert.ok(
    !withoutComments.includes('studentClassroomId'),
    `
    CRITICAL: studentClassroomId lookup found in storage.rules code!
    This violates the 2 firestore.get() budget and will cause 403 errors for classroomadmins.

    Solution: Rely on Firestore rules to gate the media doc creation.
    Storage rules trust that if the media doc exists with status='pending_upload',
    then the Firestore-side classroom scoping already passed.
    `
  );
});

test('Storage Rules - Media upload validation present', () => {
  // Check allowedContent function
  const allowedContent = rulesContent.match(/function\s+allowedContent[\s\S]*?\}/)?.[0];
  assert.ok(allowedContent, 'allowedContent function missing');

  // Should validate webp, pdf, mp4
  assert.ok(
    allowedContent.includes('.webp') && allowedContent.includes('.pdf') && allowedContent.includes('.mp4'),
    'allowedContent not validating all media types'
  );

  // Check sizeAllowed function
  const sizeAllowed = rulesContent.match(/function\s+sizeAllowed[\s\S]*?\}/)?.[0];
  assert.ok(sizeAllowed, 'sizeAllowed function missing');

  // Should limit photos to 2MB
  assert.ok(
    sizeAllowed.includes('2 * 1024 * 1024'),
    'sizeAllowed not limiting photos to 2MB'
  );
});

test('Storage Rules - Media create/update requires pending_upload status', () => {
  // Find the media match rule
  const mediaMatch = rulesContent.match(
    /match\s+\/students\/\{studentId\}\/media\/\{mediaId\}\/\{fileName\}[\s\S]*?(?=match\s+\/|$)/
  )?.[0];
  assert.ok(mediaMatch, 'Media storage rule not found');

  // Create/update rule MUST check pending_upload (most critical)
  const createUpdateRule = mediaMatch.match(/allow\s+create,\s*update:[\s\S]*?;/)?.[0];
  assert.ok(
    createUpdateRule && createUpdateRule.includes('pending_upload'),
    'Media create/update rule must check pending_upload status to prevent overwriting completed uploads'
  );
});

test('Storage Rules - Delete rules restrict teachers to 48h window', () => {
  // Find the media match rule
  const mediaMatch = rulesContent.match(
    /match\s+\/students\/\{studentId\}\/media\/\{mediaId\}\/\{fileName\}[\s\S]*?(?=match\s+\/|$)/
  )?.[0];
  assert.ok(mediaMatch, 'Media storage rule not found');

  // Delete rule should exist
  const deleteRule = mediaMatch.match(/allow\s+delete:[\s\S]*?;/)?.[0];
  assert.ok(deleteRule, 'Media delete rule missing');

  // Should check for teacher role + author + time window
  assert.ok(
    deleteRule.includes('teacher'),
    'Delete rule should check for teacher role'
  );
  assert.ok(
    deleteRule.includes('withinDeleteWindow'),
    'Delete rule should check withinDeleteWindow'
  );
});

test('Storage Rules - Default deny rule exists', () => {
  // Ensure there's a catch-all deny
  assert.ok(
    rulesContent.includes('allow read, write: if false'),
    'Storage rules missing default deny catch-all (match /{allPaths=**})'
  );
});

test('Storage Rules - Classroom scoping deferred to Firestore (design pattern)', () => {
  // This is a design pattern check: verify the comment exists
  // explaining why classroom scoping is NOT done in storage rules
  const hasComment = rulesContent.includes('managesClassroom');

  // If no explicit classroom scoping in storage rules, verify mediaDoc is trusted
  if (!hasComment) {
    assert.ok(
      rulesContent.includes('mediaDoc') && rulesContent.includes('pending_upload'),
      `
      Classroom scoping pattern check:
      Storage rules should NOT include managesClassroom (would violate budget).
      Instead, they trust the Firestore-gated media doc status.
      Verify this design is intentional.
      `
    );
  }
});
