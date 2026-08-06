---
name: implement-issue
description: Execute an approved plan from /plan-issue. Creates feature branch, implements via TDD, pushes to remote with CI check, syncs GitHub Issue, and walks user through manual e2e verification. Must run in the same session as /plan-issue (plan is in context).
---

# Implement Issue

Execute a user-approved plan that was produced by `/plan-issue` in this same session. This skill reads the finalized plan from conversation context and proceeds directly to branch creation, TDD implementation, pushing to remote with CI verification, GitHub Issue sync, and manual e2e verification.

**Precondition:** An approved plan from `/plan-issue` must be in this conversation's context. If no plan is found, instruct the user to run `/plan-issue` first.

## When to Use This Skill

- You just finished `/plan-issue` and the user approved a plan in Phase 5
- The approved plan (with implementation path, file list, test specs) is in this conversation's context
- You're ready to write code, push, verify CI, and sync the GitHub Issue

## Workflow Overview

5-phase workflow (plan already approved):

1. **Implementation (TDD)** — Create branch, write tests first, implement code, verify coverage
2. **Push & CI Check** — Push feature branch to remote, verify CI passes
3. **GitHub Issue Sync** — Update GitHub Issue with branch, commits, files, and test results
4. **Manual Verification** — Walk user through e2e verification steps tailored to the change

## Precondition Check

Before starting Phase 1, verify:

1. **Is there an approved plan in context?** Scan conversation history for:
   - A finalized implementation path (from `/plan-issue` Phase 5 approval)
   - File list, test specification, and implementation approach sections
   - If NOT found: Stop. Tell the user: "No approved plan found in context. Run `/plan-issue` first to generate and approve a plan, then run `/implement-issue` in the same session."

2. **Extract from the approved plan:**
   - Selected implementation path (Option A/B)
   - Files to modify/create
   - Test specification (per acceptance criterion)
   - Implementation approach (step-by-step)
   - Issue number and metadata (#123)

## Phase 1: Implementation (TDD Approach)

Execute the approved plan using Test-Driven Development.

**Steps:**
1. Create a new git feature branch (mandatory) before any file edits:
   - Branch name: `{issue-id}-{slug}` (e.g., `gh-123-fix-voice-upload`)
   - Check current branch: `git branch --show-current`
   - Do NOT make any file edits on `dev`, `main`, or a reused branch from another task
   - Stash uncommitted changes if needed

2. **Write tests FIRST** (for each acceptance criterion):
   - Create/modify test files as specified in Test Specification
   - Write test cases capturing expected behavior + edge cases
   - Run tests to confirm FAIL (Red phase: `npm run test -- {test-file}`)
   - Do NOT skip this step — all acceptance criteria must have tests

3. **Implement code to pass tests**:
   - Use Edit tool for file modifications
   - Use Write tool for new files
   - Follow implementation approach from plan
   - After logical changes, run related tests
   - Continue until all tests PASS (Green phase)

4. **Verify test coverage**:
   - Run ALL related tests (baseline + new tests)
   - Confirm all acceptance criteria have passing tests
   - Check for regressions in existing tests
   - **BLOCK IF:** Any criterion lacks test coverage or tests are failing

5. **Refactor if needed** (Refactor phase):
   - Clean up code while keeping tests green
   - Ensure consistent patterns with existing codebase
   - Update tests if refactoring changes interfaces

6. **Manual verification BEFORE committing:**
   - Present a tailored verification checklist (see Phase 4 for checklist details)
   - Wait for user to verify and confirm everything looks good
   - If user wants changes: apply them, re-run tests, re-verify — all before any commits
   - Only proceed to committing after explicit user approval

7. Create commits (only after manual verification passes):
   - Commit tests separately: `test: add tests for [feature/fix] (#123)`
   - Commit implementation: `feat/fix: [description] (#123)`
   - Co-authored-by: Claude

**TDD Cycle Summary:**
```
For each acceptance criterion:
  1. RED: Write failing test (captures requirement)
  2. GREEN: Implement code to pass test (minimal implementation)
  3. REFACTOR: Clean up code while keeping tests green
  4. VERIFY: Manual verification before committing
```

**Verification Requirements:**
- All acceptance criteria have test coverage
- All tests passing (new + existing)
- No test regressions
- Manual verification passed by user
- BLOCK if any criterion lacks tests

## Phase 2: Push & CI Check

Push the feature branch to remote and verify CI passes.

**Steps:**
1. Push the feature branch to remote:
   ```bash
   git push origin {branch-name} -u
   ```

2. Check if a CI workflow was triggered:
   ```bash
   gh run list --branch {branch-name} --limit 3
   ```

3. If a CI run is in progress, monitor it:
   ```bash
   gh run watch {run-id} --exit-status
   ```
   - This blocks until the run completes and exits non-zero on failure

4. **If CI passes:** Report success, proceed to Phase 3.

5. **If CI fails:**
   - Fetch the failure logs:
     ```bash
     gh run view {run-id} --log-failed
     ```
   - Diagnose the failure (lint error, test failure, build error, etc.)
   - Apply the fix locally
   - Run local tests to verify the fix: `cd montessori-os && npm run test`
   - Commit the fix: `fix: CI failure — [description] (#XXX)`
   - Push again: `git push origin {branch-name}`
   - Re-monitor the new CI run
   - **Max 3 CI fix iterations.** If still failing after 3 attempts, escalate to user with the failure logs and ask how to proceed.

6. **If no CI workflow exists** (no GitHub Actions configured for this branch):
   - Run local verification instead:
     ```bash
     cd montessori-os && npm run lint && npm run build && npm run test
     ```
   - Report results and proceed to Phase 3

**Output:** CI status (passed/fixed/no-CI-with-local-verification)

## Phase 3: GitHub Issue Sync

Update the GitHub Issue with implementation progress and test results.

**Steps:**
1. Gather implementation details:
   - Git branch name
   - Commit hashes (test commits + implementation commits)
   - Files modified
   - Test results (pass/fail counts)
   - CI status

2. Compose GitHub Issue comment:

```markdown
## Implementation Completed

**Branch:** `{branch-name}`
**CI:** {Passed | Fixed after N attempts | Local verification passed}

**Commits:**
- {commit-hash}: test: add tests for [feature] (#XXX)
- {commit-hash}: feat/fix: [implementation] (#XXX)

**Files Modified:**
- {file1}
- {file2}

**Test Coverage:**
- Acceptance Criterion 1: Covered by {test-name}
- Acceptance Criterion 2: Covered by {test-name}
- All {N} tests passing
- No regressions in existing tests

**Ready for independent review**
```

3. Post the comment to the GitHub Issue:
   ```bash
   gh issue comment {issue-number} --body "..."
   ```

4. Do NOT change the issue state — `/review-issue` will close the issue or move it to "In Review" after independent audit passes.

**Output:** GitHub Issue updated with implementation progress. Issue stays in current state.

## Phase 4: Manual Verification Gate

Walk the user through end-to-end verification of the implementation.

**Steps:**
1. Start the dev server if not running:
   ```bash
   cd montessori-os && npm run dev
   ```

2. Present a **tailored verification checklist** based on the change type. Build this from the acceptance criteria in the approved plan. Include:

   **For UI changes:**
   - Exact screens/modals to navigate to (e.g., "Open StudentDashboard > click Generate Report")
   - Visual checks: layout, spacing, responsive behavior
   - Interaction states: loading spinners, disabled states, error messages
   - Edge cases: empty state, long text overflow, rapid clicks

   **For data/Firestore changes:**
   - Documents to check in Firebase console (collection path, expected fields)
   - CRUD operations to exercise (create, read, update, delete)
   - Data persistence: refresh the page, verify data survives

   **For role/permission changes:**
   - Roles to test with: teacher, classroomadmin, superadmin
   - What should be visible/hidden per role
   - Access denial scenarios

   **For Cloud Function changes:**
   - How to trigger the function (UI action or direct call)
   - Firebase console logs to check
   - Expected output/side effects

   **For bug fixes:**
   - Steps to reproduce the original bug (from issue description)
   - Confirm the bug no longer reproduces
   - Check adjacent functionality still works

3. Ask user to work through the checklist and confirm using AskUserQuestion:
   - Question: "Have you manually verified the e2e flow?"
   - Options: "Yes, verified and working" / "Found issues (describe)"
   - If "Found issues": Address the issues, re-run tests, re-push if needed, then ask again
   - If "Yes": Proceed to Next Step

**GUARDRAIL:** Do NOT suggest `/clear` + `/review-issue` until the user explicitly confirms "Yes, verified and working".

## Edge Cases & Guardrails

**Edge Case: No approved plan in context**
- Stop immediately. Tell user to run `/plan-issue` first.

**Edge Case: Baseline tests failing**
- Warn user about existing failures
- Ask if they should be fixed first or if implementation should proceed
- Do NOT proceed if failures are in areas being modified

**Edge Case: CI has no runs / no Actions configured**
- Fall back to local lint + build + test verification

**GUARDRAIL: Test Coverage Blocking**
- Do NOT complete implementation if any acceptance criterion lacks test coverage
- Do NOT complete if any tests are failing
- These are hard stops — enforce strictly

**GUARDRAIL: Feature Branch First**
- ALWAYS create a new feature branch before making any file edits
- Do NOT edit files on `dev`, `main`, or on a reused branch
- If branch creation is blocked, STOP and resolve before any edits

**GUARDRAIL: No Replanning**
- Trust the approved plan. Do NOT re-discuss tradeoffs or switch implementation paths.
- If something in the plan turns out to be wrong (file doesn't exist, API changed), flag it to the user and ask whether to adapt or re-plan with `/plan-issue`.

## Tools Used

- `Bash` - Git operations, run tests, push to remote, monitor CI, post GitHub Issue comments via `gh`
- `Edit` - Modify existing files
- `Write` - Create new files
- `Read` - Load context files
- `Glob` - Find test files
- `AskUserQuestion` - Verification confirmation

## Workflow Commands Reference

### Frontend (from `montessori-os/`)
```bash
npm run test -- {pattern}       # Run tests matching pattern
npm run test                     # Run all tests
npm run lint                     # ESLint check
npm run build                    # Production build
npm run dev                      # Start dev server
```

### Git Operations
```bash
git branch --show-current        # Show current branch
git checkout -b {branch}         # Create new branch
git add {files}                  # Stage changes
git commit -m "message"          # Create commit
git push origin {branch} -u     # Push to remote with tracking
git log --oneline -5             # Show recent commits
```

### CI Monitoring
```bash
gh run list --branch {branch} --limit 3   # List CI runs
gh run watch {run-id} --exit-status        # Watch CI run until complete
gh run view {run-id} --log-failed          # Get failure logs
```

### GitHub Issue Operations
```bash
gh issue view {number}                          # View issue details
gh issue comment {number} --body "message"      # Add comment to issue
gh issue edit {number} --add-label "label"      # Add label to issue
gh issue close {number}                         # Close issue
```

## Success Criteria

Implementation is complete when:

1. Approved plan extracted from context
2. Feature branch created
3. Tests written FIRST (red phase) for each acceptance criterion
4. ALL acceptance criteria have test coverage (enforced)
5. All tests passing (new + existing, no regressions)
6. Implementation executed following approved plan
7. Branch pushed to remote
8. CI passes (or local verification passes if no CI)
9. GitHub Issue updated with branch, commits, CI status, and test results
10. User has manually verified the e2e flow and confirmed it works

## Next Step

> **After the user confirms manual verification in Phase 4:**
>
> Implementation is done, CI green, and manually verified. Now clear your context and run an independent review:
>
> 1. Run `/clear` to wipe the implementation context (the branch stays checked out)
> 2. Run `/review-issue` — it will auto-detect the issue from the branch name and audit the diff with fresh eyes
>
> This ensures the code review is independent — no implementation bias carrying over.
>
> **Do NOT present this section until Phase 4 is complete and the user has explicitly confirmed "Yes, verified and working".**
