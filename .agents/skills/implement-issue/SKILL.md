---
name: implement-issue
description: Execute an approved plan from /plan-issue. Creates a feature branch, implements via TDD, runs local verification, syncs the GitHub Issue, and walks the user through manual e2e verification. Must run in the same session as /plan-issue (plan is in context).
---

# Implement Issue

Execute a user-approved plan produced by `/plan-issue` in this same session. Reads the finalized plan from conversation context and proceeds directly to branch creation, TDD implementation, local verification, GitHub Issue sync, and manual e2e verification. Remote CI and PR lifecycle belong to `/review-issue` and `/merge-issue`.

## Precondition Check

Scan conversation history for an approved plan (implementation approach, file list, test specification, issue number). **If not found, stop:** "No approved plan found in context. Run `/plan-issue` first, then `/implement-issue` in the same session."

If baseline tests were failing during planning, warn the user and do NOT proceed if the failures are in areas being modified.

## Phase 1: Implementation (TDD)

1. **Create a feature branch first** — `{issue-id}-{slug}` (e.g., `gh-123-fix-voice-upload`). Never edit files on `dev`, `main`, or a reused branch. Stash unrelated changes if needed. If branch creation is blocked, stop and resolve before any edits.

2. **Write tests FIRST** for each acceptance criterion, per the plan's Test Specification. Run them to confirm they FAIL (red). Do not skip this.

3. **Implement to pass tests** (green), following the plan's approach. Run related tests after logical changes until all pass.

4. **Verify coverage:** run all related tests (baseline + new). Every acceptance criterion must have a passing test, with no regressions. **These are hard blocks.**

5. **Refactor** while keeping tests green; keep patterns consistent with the existing codebase.

6. **Manual verification BEFORE committing:** present the tailored checklist (Phase 3) and wait for user confirmation. Apply any requested changes, re-run tests, and re-verify — all before commits.

7. **Commit** (only after manual verification passes): tests separately as `test: add tests for [feature] (#123)`, implementation as `feat/fix: [description] (#123)`.

**No replanning:** trust the approved plan. If something in it turns out wrong (file missing, API changed), flag it and ask whether to adapt or re-plan.

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
> 2. Run `/review-issue` — it auto-detects the issue from the branch name and audits the diff with fresh eyes
>
> This keeps the code review independent — no implementation bias carrying over.
