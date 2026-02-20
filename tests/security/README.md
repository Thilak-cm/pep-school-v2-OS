# Security Rules Tests

This directory contains tests that verify your Firebase security rules implement critical access control patterns.

**🚀 New to this? Start with [`APPROACH.md`](./APPROACH.md)** — explains the "why" behind security testing and how it all works.

**📚 Detailed guide? See [`TESTING.md`](./TESTING.md)** — comprehensive reference for running, debugging, and maintaining tests.

## Why This Matters

Security rules are easy to accidentally break:
- An LLM might delete a line thinking it's redundant
- A refactor might remove a check
- An index deployment might get interrupted

These tests catch those mistakes before they reach production.

## Running the Tests

### From the project root:
```bash
npm run test:security
```

### Or directly with Node:
```bash
node --test tests/security/*.test.js
```

### Single test file:
```bash
node --test tests/security/firestore.rules.test.js
node --test tests/security/storage.rules.test.js
```

## Test Structure

### `accessControlSpec.js` - Source of Truth
Defines all non-negotiable security patterns as data. Each rule has:
- **name**: What the rule does (e.g., "Role hierarchy")
- **description**: Why it matters
- **pattern**: Regex that must match in the rules file
- **file**: Which rules file (`firestore`, `storage`, or `both`)
- **criticality**: `critical` (breaks everything) or `important` (breaks specific flow)

### `firestore.rules.test.js` - Firestore Verification
Tests that `firestore.rules` implements:
- Authentication gate (`isSignedIn()`)
- Role hierarchy (`isSuperAdmin`, `isClassroomAdmin`, `isTeacher`)
- Classroom scoping (`hasManageableClassroom`, `managesClassroom`)
- Access control per collection (users, students, observations, etc.)
- 48-hour edit window for teachers
- Superadmin-only writes to sensitive collections

### `storage.rules.test.js` - Storage Verification
Tests that `storage.rules` implements:
- Critical budget constraint: max 2 `firestore.get()` calls (prevents the 403 bug)
- Role gate with known roles only
- Media upload validation (content types, file sizes)
- 48-hour delete window for teachers
- Default deny catch-all

## Understanding Test Failures

If a test fails, it means one of these happened:

1. **A critical function was deleted**
   - Example: Deleted `hasManageableClassroom()` by accident
   - Fix: Restore the function from git

2. **A rule pattern was refactored**
   - Example: Changed `role == 'superadmin'` to something else
   - Fix: Update the pattern in `accessControlSpec.js` if intentional, or revert if accidental

3. **A critical check was removed**
   - Example: Removed the `48-hour` window check for teachers
   - Fix: Restore it or update the spec

## Adding New Rules to the Spec

When you add a new security pattern:

1. **In your rules file:** Add the new check (e.g., new role, new collection)
2. **In `accessControlSpec.js`:**
   - Add a new object to `ACCESS_CONTROL_SPEC`
   - Include name, description, regex pattern, file, and criticality
   - Test the regex against your rules file to make sure it matches
3. **Commit both files together**

Example:
```javascript
{
  name: 'New collection access control',
  description: 'Only admins can read/write the new collection',
  file: 'firestore',
  criticality: 'critical',
  pattern: /match\s+\/newCollection\/\{docId\}[\s\S]*?allow\s+read:\s*if\s+isPrivilegedAdmin/,
}
```

## Storage Rules Budget Constraint

⚠️ **CRITICAL:** Storage rules have a strict budget of **2 `firestore.get()` calls** per rule evaluation.

If you exceed this:
- Classroomadmins will get blanket 403 errors
- The bug is hard to debug (Firebase doesn't tell you why)

The spec enforces this:
- ✅ `requesterDoc()` — 1 call
- ✅ `mediaDoc()` — 1 call
- ❌ `studentClassroomId()` — 3rd call (would break!)

Classroom-level scoping is deferred to Firestore rules. Storage rules trust the Firestore-side gate.

## Testing Locally

You can also simulate rule behavior locally using the Firebase Emulator:

```bash
npm run emulators
```

This starts Firestore and Storage emulators. You could write additional integration tests using the SDK in the future.

## References

- `CLAUDE.md` — Project architecture and constraints
- `DATA_STRUCTURE.md` — Firestore schema
- `firestore.rules` — The actual Firestore rules
- `storage.rules` — The actual Storage rules
- Linear issue tracker for security bugs
