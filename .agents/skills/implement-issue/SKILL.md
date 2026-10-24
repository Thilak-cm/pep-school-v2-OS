---
name: implement-issue
description: Fill frozen stubs against committed contract tests on a feature branch. Reads types, stubs, and tests from the repo — must run in a separate session from /plan-issue.
---

# Implement Issue

Fill stub implementations to pass frozen contract tests committed by `/plan-issue`. Reads the feature branch, types, stubs, and test files directly from the repo — no plan in conversation context needed. Remote CI and PR lifecycle belong to `/review-issue` and `/merge-issue`.

## Precondition Check

1. **Identify the issue:** from user input (e.g., "implement #123") or detect from the current branch name (`gh-NNN-*`).
2. **Verify the feature branch exists** with committed contract artifacts. Check for:
   - Type definitions / interfaces
   - Stub functions (containing `throw new Error('Not implemented')` or similar)
   - Test files that import from the stubs
3. **Read the GitHub issue** via `gh issue view` for acceptance criteria, context, and any plan discussion.
4. **If no frozen artifacts found, stop:** "No committed types/stubs/tests found on this branch. Run `/plan-issue #N` first to scaffold the contract, review it, then run `/implement-issue` in a new session."

If any committed tests have import or syntax errors (not assertion failures), warn the user — the scaffold may need fixing before implementation.

## Phase 1: Implementation

1. **Run frozen tests to confirm they fail (red baseline).** Every test should fail with "Not implemented" or an assertion error. This proves the contract is intact and unfulfilled.

2. **Fill stub implementations** to make tests pass (green). Replace `throw new Error('Not implemented')` bodies with real logic. Follow the acceptance criteria from the GitHub issue and any patterns established by the type definitions.

3. **Run tests after each logical change** until all frozen tests pass. Do not modify the test files — they are the contract. If a test appears wrong, flag it and ask the user rather than changing it.

4. **Verify no regressions:** run the full related test suite (frozen + any pre-existing tests in affected areas). All must pass. **This is a hard block.**

5. **Refactor** while keeping tests green; keep patterns consistent with the existing codebase.

6. **Manual verification BEFORE committing:** present the tailored checklist (Phase 3) and wait for user confirmation. Apply any requested changes, re-run tests, and re-verify — all before commits.

7. **Commit** (only after manual verification passes): `feat/fix: [description] (#123)`. Implementation only — tests were already committed by `/plan-issue`.

**Do not modify frozen tests.** If a frozen test is wrong (testing the wrong behavior, incorrect assertion), flag it to the user. They own the contract. Only the user can approve test changes, and those should be committed separately as `fix(test): [description] (#123)`.

**No replanning:** trust the frozen contract. If something in it turns out wrong (missing type, incorrect interface), flag it and ask whether to adapt or re-scaffold.

## Phase 2: GitHub Issue Sync

Post a comment via `gh issue comment` with: branch name, local verification results (tests/lint/build), commit hashes, files modified, and per-criterion test coverage. End with "Ready for independent review".

Do NOT close the issue or move it to Done — `/review-issue` owns review readiness; `/merge-issue` owns completion.

## Phase 3: Manual Verification Gate

Start the dev server if needed and present a **tailored checklist** built from the acceptance criteria:

- **UI changes:** exact screens/modals to navigate, visual checks, interaction states (loading/disabled/errors), edge cases (empty state, overflow, rapid clicks)
- **Data/Firestore changes:** documents and fields to check in the console, CRUD operations, persistence across refresh
- **Role/permission changes:** test each role (teacher, classroomadmin, superadmin), visibility per role, access denial
- **Cloud Function changes:** how to trigger, console logs to check, expected side effects
- **Bug fixes:** original reproduction steps no longer reproduce; adjacent functionality intact

Ask: "Have you manually verified the e2e flow?" If issues found, address them, re-run tests, and ask again. **Do NOT present the next step until the user explicitly confirms it works.**

## Next Step

> After the user confirms manual verification:
>
> 1. Run `/clear` to wipe the implementation context (the branch stays checked out)
> 2. Run `/review-issue` - it auto-detects the issue from the branch name and audits the diff with fresh eyes
>
> This keeps the code review independent - no implementation bias carrying over.
