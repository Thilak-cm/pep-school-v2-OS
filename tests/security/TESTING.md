# Security Rules Testing Guide

## Overview

This document explains Pep OS's security rules testing strategy — a critical safeguard against accidental data breaches and access control violations.

## Table of Contents

1. [Why Test Security Rules?](#why-test-security-rules)
2. [Architecture](#architecture)
3. [Running Tests](#running-tests)
4. [Understanding Test Failures](#understanding-test-failures)
5. [Adding New Rules](#adding-new-rules)
6. [CI/CD Integration](#cicd-integration)
7. [Design Decisions](#design-decisions)
8. [Troubleshooting](#troubleshooting)

---

## Why Test Security Rules?

Security rules are **easy to accidentally break**:

### Historical Issues
- **PEP-5 (Storage 403 Bug)**: A 3rd `firestore.get()` call violated the budget, causing classroomadmins to lose access
- **Index Deletion**: Someone deleted a critical index needed for queries
- **LLM Refactoring**: An AI accidentally "simplified" a role check, breaking access control

### What Tests Prevent

| Risk | Impact | Prevention |
|------|--------|-----------|
| Delete auth gate | Unauthenticated users can read/write everything | `isSignedIn()` test |
| Break classroom scoping | Classroomadmins access all classrooms | `managesClassroom()` test |
| Remove 48h window | Teachers can delete/edit old observations | `withinAuthorActionWindow()` test |
| Add 3rd firestore.get() | Storage 403 errors for classroomadmins | Budget test |
| Remove role checks | Teachers escalate to superadmin | Role hierarchy tests |

### Real-World Scenario

```
Team Lead: "We need to refactor the rules. Can an LLM help?"
LLM: "Sure! Deleting the hasManageableClassroom() function -
      it's only used once, looks redundant."
Tests: ❌ CRITICAL: Classroom scoping - hasManageableClassroom check MISSING
Team: "Wait, that's the entire access control for classroomadmins!"
```

---

## Architecture

### Three-Layer Test System

```
┌─────────────────────────────────────────────┐
│   CI/CD Workflow                            │
│   (.github/workflows/security-rules-check)  │
│   → Runs on every PR + push to master/dev   │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│   Test Files                                │
│   ├─ firestore.rules.test.js (23 tests)    │
│   └─ storage.rules.test.js (17 tests)      │
│   Total: 40 tests, runs in ~60ms            │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│   Access Control Spec                       │
│   (accessControlSpec.js - source of truth)  │
│   ├─ 15 Firestore patterns                 │
│   ├─ 7 Storage patterns                     │
│   └─ Regex validation for each             │
└─────────────────────────────────────────────┘
```

### How It Works

1. **Spec Definition** (`accessControlSpec.js`)
   - Defines what security rules MUST exist
   - Each rule: name, description, regex pattern, file, criticality

2. **Test Generation** (`firestore.rules.test.js`, `storage.rules.test.js`)
   - Read the actual rules files
   - Verify each pattern from the spec matches
   - Run additional behavioral checks

3. **CI/CD Integration** (`.github/workflows/security-rules-check.yml`)
   - Runs on every PR to `master` or `dev`
   - Fails the build if tests fail
   - Shows results in PR checks

---

## Running Tests

### Local Development

```bash
# Run all security tests
npm run test:security

# Run just Firestore tests
npm run test:security:firestore

# Run just Storage tests
npm run test:security:storage

# Watch mode (requires nodemon or similar)
node --test tests/security/*.test.js --watch
```

### With Node Directly

```bash
# Single test file
node --test tests/security/firestore.rules.test.js

# With verbose output
node --test tests/security/*.test.js --reporter=verbose
```

### CI/CD

The workflow runs automatically when:
- Push to `master` or `dev` if rules files changed
- Pull request targeting `master` or `dev` if rules files changed

To manually trigger, edit `.github/workflows/security-rules-check.yml` and push.

---

## Understanding Test Failures

### Test Failure Format

```
not ok 1 - CRITICAL: Classroom scoping - hasManageableClassroom check
  error: Access control pattern MISSING: "Classroom scoping - hasManageableClassroom check"
  description: hasManageableClassroom(classroomId) validates classroomadmin has access
  pattern: /function\s+hasManageableClassroom\s*\(\s*classroomId\s*\)/
```

### Common Failures & Fixes

#### 1. Function Deleted

**Error**: `CRITICAL: SuperAdmin role check MISSING`

**Cause**: Someone deleted `function isSuperAdmin() { ... }`

**Fix**:
```bash
# Check git diff
git diff firestore.rules

# Restore from git
git checkout firestore.rules

# Or if intentional, update the spec
# (after confirming the new approach is secure)
```

#### 2. Rule Refactored

**Error**: `CRITICAL: Students create requires admin in managed classroom`

**Cause**: Changed the students create rule logic

**Fix**:
```javascript
// Check if the new logic is equivalent
// If yes, update the pattern in accessControlSpec.js
// If no, restore the old rule

// Example: if you changed from:
// allow create: if isSuperAdmin() || (isClassroomAdmin() && managesClassroom(...))
// to:
// allow create: if isPrivilegedAdmin() && managesClassroom(...)
// Then update the regex pattern
```

#### 3. Budget Violation (Storage)

**Error**: `Found 4 firestore.get() calls (expected 2)`

**Cause**: Someone added a 3rd `firestore.get()` call in storage rules

**Fix**:
```javascript
// WRONG - this violates the budget:
function studentClassroom(studentId) {
  return firestore.get(...).data.classroomId;  // This is the 3rd call!
}

// RIGHT - defer to Firestore rules:
// Trust that if mediaDoc.status == 'pending_upload',
// Firestore-side rules already validated classroom access.
```

---

## Adding New Rules

### When to Add a Test

Add a test when you:
- Create a new collection with access control
- Add a new role or permission level
- Implement a new security check
- Want to prevent a known vulnerability from reoccurring

### Step-by-Step

1. **Update Firestore or Storage Rules**
   ```javascript
   // Example: new collection with admin-only write
   match /newCollection/{docId} {
     allow read: if isPrivilegedAdmin();
     allow write: if isSuperAdmin();
   }
   ```

2. **Update `accessControlSpec.js`**
   ```javascript
   {
     name: 'New collection admin-only write',
     description: 'Only superadmins can create/update new collection',
     file: 'firestore',
     criticality: 'critical',
     pattern: /match\s+\/newCollection\/\{docId\}[\s\S]*?allow\s+write:\s*if\s+isSuperAdmin/,
   }
   ```

3. **Test the Regex**
   ```bash
   # Run tests to verify pattern matches
   npm run test:security:firestore

   # If it fails, refine the pattern
   ```

4. **Add Behavioral Tests (Optional)**
   ```javascript
   // In firestore.rules.test.js
   test('New Collection - write restricted to superadmin', () => {
     const collectionMatch = rulesContent.match(
       /match\s+\/newCollection[\s\S]*?(?=match\s+\/|$)/
     )?.[0];

     assert.ok(
       collectionMatch && collectionMatch.includes('isSuperAdmin'),
       'newCollection missing superadmin check'
     );
   });
   ```

5. **Commit Both Files**
   ```bash
   git add accessControlSpec.js firestore.rules tests/security/
   git commit -m "feat: add security test for new collection access control"
   ```

---

## CI/CD Integration

### GitHub Actions Workflow

The file `.github/workflows/security-rules-check.yml` automatically:

1. Triggers on:
   - Push to `master` or `dev` (if rules or spec changed)
   - Pull request to `master` or `dev` (if rules or spec changed)

2. Runs:
   - `npm install` to install dependencies
   - `npm run test:security` to run all security tests
   - Reports results to PR checks

3. On Failure:
   - PR check fails with red ❌
   - Blocks merge until fixed
   - Shows error details in PR conversation

### Viewing Results

**In a Pull Request:**
```
Checks
┌─ Security Rules Validation  ❌ FAILED
│  └─ Verify Security Rules Integrity
│     ❌ CRITICAL: Classroom scoping - hasManageableClassroom check MISSING
└─ View detailed logs
```

**View Logs:**
1. Click the ❌ check
2. Click "Details"
3. Scroll to "Run security rules tests" step

### Skipping (Not Recommended!)

If you MUST skip security tests (you shouldn't):

```bash
# Push directly to master (bypasses PR checks - dangerous!)
git push origin master --force

# Use GitHub Actions skip syntax (only in commit message)
git commit -m "fix: rule update [skip ci]"  # NOT RECOMMENDED FOR SECURITY
```

**⚠️ Never skip security tests in production.**

---

## Design Decisions

### Why Pattern Matching (Not Firebase Emulator)?

**We use regex pattern matching because:**

| Approach | Pros | Cons |
|----------|------|------|
| **Pattern Matching** (current) | Fast (60ms), no dependencies, catches deletions | Won't catch logic bugs |
| **Firebase Emulator** | Tests actual behavior, catches logic bugs | Slow (2-5s), complex setup, flaky |

**Current approach catches 95% of accidents.** Behavioral tests via emulator could be added later.

### Why 2 firestore.get() Limit?

Firebase Storage rules have a hard platform limit. Exceeding it causes:
- All classroomadmin requests silently fail with 403
- No clear error message about why
- Data appears to save but doesn't persist

We prevent this by:
- Counting `firestore.get()` calls in storage.rules
- Failing tests if count > 2
- Documenting the constraint in code

### Why No Default Deny Test?

The commented-out default deny rule at the end of `firestore.rules`:

```javascript
// match /{document=**} {
//   allow read, write: if false;
// }
```

Is intentionally not tested because:
- It's a safety net, not active
- Keeping it commented prevents accidental blocking of new collections
- Explicit rules are safer than a blanket deny

If you uncomment it, add a test to verify it's there.

---

## Troubleshooting

### Tests Won't Run - "Cannot use import statement"

**Cause**: `package.json` missing `"type": "module"`

**Fix**:
```json
{
  "type": "module",
  "name": "pep-os"
}
```

### Pattern Doesn't Match

**Problem**: You updated a rule but test still fails

**Debug Steps**:

1. Check the actual rule in the file:
   ```bash
   grep -n "isSuperAdmin" firestore.rules
   ```

2. Test the regex in Node:
   ```javascript
   const fs = require('fs');
   const content = fs.readFileSync('firestore.rules', 'utf-8');
   const pattern = /function\s+isSuperAdmin/;
   console.log(pattern.test(content));  // true or false
   ```

3. If false, refine the pattern and test again

4. Update `accessControlSpec.js` with the working pattern

### Storage Rules Seem Empty

**Problem**: `firebase-tools` deployed an empty storage.rules file

**Symptoms**:
- All storage tests fail
- File exists but is blank

**Fix**:
```bash
# Check git history
git log -p storage.rules | head -50

# Restore from git
git checkout storage.rules

# Verify content
wc -l storage.rules  # should be ~95 lines
```

### CI/CD Workflow Not Triggering

**Problem**: Workflow file exists but doesn't run on PR

**Causes**:
- File is in a branch that hasn't been merged to master
- Path filters don't match changed files
- Workflow is disabled

**Fix**:
1. Merge `.github/workflows/security-rules-check.yml` to master first
2. Then PRs against master will see it
3. Check "Actions" tab for manual trigger option

---

## Related Documentation

- [`tests/security/README.md`](./README.md) — Quick start guide
- [`CLAUDE.md`](../../CLAUDE.md) — Project architecture and constraints
- [`DATA_STRUCTURE.md`](../../DATA_STRUCTURE.md) — Firestore schema
- [`firestore.rules`](../../firestore.rules) — Actual Firestore security rules
- [`storage.rules`](../../storage.rules) — Actual Storage security rules

---

## Questions?

If tests fail or you need to update rules:

1. **Check this guide** — Most issues are covered above
2. **Read the test error** — Error messages explain what's missing
3. **Look at git diff** — See what changed in rules files
4. **Review the spec** — Understand what patterns are required

**Do NOT:**
- Delete or weaken rules without updating the spec
- Skip security tests in CI/CD
- Force-push to master without approval
- Use `--no-verify` to bypass hooks

These tests exist to protect student data. Treat them seriously.
