---
name: implement-issue
description: Start implementation of a Linear issue with automatic context loading, implementation-path tradeoff discussion, technical planning iteration, test-driven development, and Linear sync. Use when starting work on a Linear issue—helps bridge from issue creation to code execution with structured planning, user-aligned approach selection, and test coverage enforcement.
---

# Implement Issue

Bridge the gap between Linear issue creation and implementation. This skill automates the workflow of selecting a Linear issue, loading relevant codebase context, generating a technical execution plan with test specifications, discussing tradeoffs between viable implementation paths with the user, iterating until one path is finalized, discovering existing tests, implementing via TDD, and syncing progress back to Linear.

## When to Use This Skill

- You want to start work on a Linear issue from `pep-os` workspace
- You need a structured execution plan before writing code
- You need to compare multiple implementation paths with the user before coding
- You want to enforce Test-Driven Development (TDD) for quality assurance
- You want test coverage requirements tracked and enforced
- You want implementation progress synced back to Linear automatically

## Workflow Overview

The skill follows an 8-phase workflow:

1. **Issue Selection** - Interactively filter and select a Linear issue
2. **Context Loading** - Auto-load codebase overview, staleness check, optional explore
3. **Plan Generation** - Generate technical execution plan with file paths, test specs, and implementation path options
4. **Test Discovery** - Auto-detect related tests and establish baseline
5. **Plan Approval** - User reviews tradeoffs, iterates on plan, and approves a final implementation path before implementation
6. **Implementation** - Execute plan using TDD (write tests first, then code)
7. **Linear Sync** - Update Linear issue with branch, commits, and test results
8. **Manual Verification** - User manually verifies the e2e flow before moving to review

## Phase 1: Issue Selection

Start by selecting which Linear issue to work on. Use interactive filtering to narrow down options.

**Steps:**
1. Ask user for optional filters using AskUserQuestion:
   - Assignee (default: "me")
   - State (default: "Todo")
   - Team (default: "Pep school v2 os")
   - Labels (optional multi-select)
   - Priority (optional)

2. Call `list_issues` with user-specified filters

3. Present top 20 results with format: `[PEP-123] Issue Title [High] [label1, label2]`

4. User selects issue by ID or number

5. Call `get_issue` with selected issue ID, `includeRelations=true`

**Output:** Selected issue details (title, description, acceptance criteria, labels, state)

## Phase 2: Context Loading

Auto-load high-level overview, check for staleness, and spawn Explore subagent when deeper context is needed.

**Steps:**
1. Read `.claude/skills/codebase-context-scan/references/pep-os-overview.md`
   - Extract Area Map for reference

2. **Check overview staleness**
   - Read `Generated:` timestamp from line 3 of `pep-os-overview.md`
   - Count commits since: `git log --oneline --after="{date}" | wc -l`
   - Calculate days elapsed
   - If 5+ commits OR 7+ days old: warn user, ask "Refresh with /codebase-context-scan?" via AskUserQuestion (yes/skip)
   - If yes: invoke codebase-context-scan, re-read overview
   - If skip: proceed with stale overview
   - If neither threshold met: proceed silently

3. Infer relevant area tags from issue:
   - Use issue labels first (e.g., "observation-capture" → "observation-capture" area)
   - Fall back to keyword matching on title/description
   - Area mapping examples:
     - "voice note", "voice transcription" → "observation-capture"
     - "timeline", "student timeline" → "timelines-and-media"
     - "permission", "role", "admin" → "auth-and-access"
     - "firebase", "rules", "security" → "firebase-infrastructure"

4. If the overview context is insufficient for the inferred areas, spawn the **codebase-explorer agent** (`.claude/agents/codebase-explorer.md`) to gather deeper context on the relevant files and patterns.

   **Data to pass to the codebase-explorer agent:**
   - `overview_content`: The full text of `pep-os-overview.md` (already loaded in step 1)
   - `target_areas`: The inferred area tags from step 3
   - `issue_context`: Issue title + key requirements/acceptance criteria
   - `exploration_focus`: `"implementation"` (find patterns to follow, reusable code, data flow, hook APIs, prop contracts)
   - `specific_files`: Any files explicitly mentioned in the issue description

5. Extract requirements from issue:
   - Parse issue description for user story, acceptance criteria
   - For bugs: Steps to reproduce, expected vs actual behavior

**Output:**
- Inferred area tags
- Loaded context (overview + codebase-explorer summary)
- Parsed requirements and acceptance criteria

## Phase 3: Plan Generation

Create a technical execution plan with specific file paths, test specifications, and explicit tradeoff analysis across viable implementation paths.

**Steps:**
1. Analyze requirements + context:
   - Map each acceptance criterion to code changes
   - Identify files to modify (from overview and explore context)
   - Consider constraints (e.g., Firebase Storage rules, role-based access)
   - Review related/blocking issues for additional context
   - Identify 2-3 viable implementation paths when reasonable (or explain why only one is viable)
   - Compare tradeoffs for each path (delivery speed, regression risk, complexity, maintainability, test impact)

2. Generate execution plan with sections:

```markdown
## Summary
[1-2 sentence description of implementation approach]

## Implementation Path Options

### Option A (Recommended): [Approach name]
- **What it changes:** [Short summary]
- **Pros:** [Speed, reuse, lower risk, etc.]
- **Cons:** [Complexity, technical debt, migration cost, etc.]
- **Risk Profile:** Low | Medium | High
- **Test Impact:** [Which tests are affected / need additions]

### Option B: [Approach name]
- **What it changes:** [Short summary]
- **Pros:** [...]
- **Cons:** [...]
- **Risk Profile:** Low | Medium | High
- **Test Impact:** [...]

### Decision Notes (Working Draft)
- Recommended option: [A/B]
- Open questions for user: [Tradeoffs to confirm before approval]

## Files to Modify
- `path/to/file1.js` - [What changes, which components affected]
- `path/to/file2.jsx` - [What changes]

## Files to Create (if any)
- `path/to/newfile.js` - [Purpose]

## Test Specification

### Acceptance Criterion 1: [Criterion text]
- **Test Type:** Unit | Integration | E2E
- **Test File:** `path/to/test-file.test.js` (new or existing)
- **Test Description:** Should [expected behavior]
- **Edge Cases:** [list edge cases to test]

### Acceptance Criterion 2: [Criterion text]
- **Test Type:** Integration
- **Test File:** `path/to/test-file.test.js`
- **Test Description:** Should [expected behavior]
- **Edge Cases:** [list edge cases to test]

## Implementation Approach
[Step-by-step technical approach - TDD style: write tests first, then implementation]

## Related Context
- [Reference overview sections or explore findings that informed this plan]
- [Any architectural constraints or patterns to follow]

## Verification Checklist
- [ ] All acceptance criteria have test coverage
- [ ] All new tests written and passing
- [ ] Existing related tests still passing (no regressions)
- [ ] Manual testing completed (if UI changes)
```

**CRITICAL REQUIREMENT:** Every acceptance criterion MUST map to at least one test.

**Output:** Complete technical execution plan with test specifications and implementation path tradeoffs

## Phase 4: Test Discovery & Baseline

Identify existing tests and establish baseline test results.

**Steps:**
1. Auto-detect related test files:
   - For each file to modify (e.g., `AddNoteModal.jsx`), search for test files
   - Patterns: `{filename}.test.{js,jsx,mjs}`, `__tests__/{filename}.{js,jsx}`
   - Search frontend: `montessori-os/src/**/*.test.js`
   - Search functions: `functions/**/*.test.{js,mjs}`

2. Run baseline tests:
   - Frontend tests: `cd montessori-os && npm run test -- {test-file-pattern}`
   - Capture baseline results (pass/fail counts, timing)
   - Report any existing test failures

3. Identify test gaps:
   - Compare acceptance criteria against existing test coverage
   - Highlight which criteria lack tests
   - List test files to create

4. Update plan with test discovery results:
   - Add "Existing Tests" section listing detected files and results
   - Confirm test file paths in "Test Specification" section
   - Flag if no tests exist (requires creating new test files)

**Output:** Test discovery report with baseline results and identified gaps

## Phase 5: Plan Approval

Get explicit user approval before making any code changes.

**Steps:**
1. Present complete execution plan (all sections above)
2. Explain inferred area tags and loaded context
3. Show implementation path options and discuss tradeoffs with user:
   - Why the recommended option was chosen
   - What is gained/lost vs alternatives
   - Risks, rollout concerns, and testing implications
4. Show test discovery results and baseline
5. Ask user to confirm the implementation path (approve/edit/switch option)
6. If "edit": Ask what needs changing, iterate on plan and tradeoff analysis
7. If "switch option": Revise plan for selected path, then re-review
8. If "no": Ask what needs revision, go back to Phase 3
9. If "yes": Proceed to Phase 6 with finalized path

**GUARDRAIL:** Do not modify any files until plan is approved, the implementation path is explicitly finalized with the user, and a new feature branch has been created for the issue.

## Phase 6: Implementation (TDD Approach)

Execute the approved plan using Test-Driven Development.

**Steps:**
1. Create a new git feature branch (mandatory) before any file edits:
   - Branch name: `{issue-id}-{slug}` (e.g., `PEP-123-fix-voice-upload`)
   - Check current branch: `git branch --show-current`
   - Do NOT make any file edits on `dev`, `main`, or a reused branch from another task
   - Stash uncommitted changes if needed

2. **Write tests FIRST** (for each acceptance criterion):
   - Create/modify test files as specified in Test Specification
   - Write test cases capturing expected behavior + edge cases
   - Run tests to confirm FAIL (Red phase: `npm run test -- {test-file}`)
   - Do NOT skip this step—all acceptance criteria must have tests

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

6. Create commits:
   - Commit tests separately: `test: add tests for [feature/fix] (PEP-123)`
   - Commit implementation: `feat/fix: [description] (PEP-123)`
   - Co-authored-by: Claude

**TDD Cycle Summary:**
```
For each acceptance criterion:
  1. RED: Write failing test (captures requirement)
  2. GREEN: Implement code to pass test (minimal implementation)
  3. REFACTOR: Clean up code while keeping tests green
```

**Verification Requirements:**
- ✅ All acceptance criteria have test coverage
- ✅ All tests passing (new + existing)
- ✅ No test regressions
- ❌ BLOCK if any criterion lacks tests

## Phase 7: Linear Sync

Update Linear issue with implementation progress and test results.

**Steps:**
1. Gather implementation details:
   - Git branch name
   - Commit hashes (test commits + implementation commits)
   - Files modified
   - Test results (pass/fail counts)

2. Compose Linear comment:

```markdown
## Implementation Completed

**Branch:** `{branch-name}`

**Commits:**
- {commit-hash}: test: add tests for [feature] (PEP-123)
- {commit-hash}: feat/fix: [implementation] (PEP-123)

**Files Modified:**
- {file1}
- {file2}

**Test Coverage:**
- ✅ Acceptance Criterion 1: Covered by {test-name}
- ✅ Acceptance Criterion 2: Covered by {test-name}
- ✅ All {N} tests passing
- ✅ No regressions in existing tests

**Ready for independent review**
```

3. Call `create_comment` with composed comment

4. Do NOT change the issue state — `/review-issue` will move it to "In Review" after independent audit passes.

**Output:** Linear issue updated with implementation progress. Issue stays in current state.

## Phase 8: Manual Verification Gate

Require the user to manually verify the implementation before moving to review.

**Steps:**
1. Present a verification prompt that strongly encourages manual testing:
   - Start the dev server if not running (`npm run dev` in `montessori-os/`)
   - Walk through the feature/fix end-to-end in the browser
   - Check both the happy path and edge cases

2. Provide a tailored checklist based on the change type:
   - **UI changes:** Visual appearance, responsiveness, interaction states, loading/error states
   - **Data changes:** Data persists correctly, Firestore documents created/updated as expected
   - **Role/permission changes:** Test with different roles (teacher, classroomadmin, superadmin)
   - **API/Cloud Function changes:** Verify function triggers correctly, check Firebase console logs
   - **Bug fixes:** Confirm the original bug no longer reproduces

3. Ask user to confirm verification using AskUserQuestion:
   - Question: "Have you manually verified the e2e flow of this feature?"
   - Options: "Yes, verified and working" / "Found issues (describe)"
   - If "Found issues": Address the issues, re-run tests, then ask again
   - If "Yes": Proceed to Next Step

**GUARDRAIL:** Do NOT suggest `/clear` + `/review-issue` until the user explicitly confirms manual verification is complete.

## Edge Cases & Guardrails

**Edge Case: Issue has no labels**
- Use keyword matching on title/description to infer area tags
- If ambiguous, ask user to specify relevant area(s)

**Edge Case: Plan seems too broad**
- Suggest splitting into multiple issues
- Ask user if they want to proceed with full scope or narrow focus

**Edge Case: Multiple viable implementation paths**
- Present at least 2 options with explicit tradeoffs
- Recommend one option, but ask the user to confirm priorities (speed vs maintainability vs risk)
- Iterate on the plan until a single path is selected

**Edge Case: Issue already "In Progress"**
- Warn user, ask if they want to take ownership and proceed

**Edge Case: No existing tests found**
- Create new test files following project conventions
- Ensure first test is written (red phase) before implementation

**Edge Case: Baseline tests failing**
- Warn user about existing failures
- Ask if they should be fixed first or if implementation should proceed
- Do NOT proceed if failures are in areas being modified (risk of hidden bugs)

**GUARDRAIL: Test Coverage Blocking**
- Do NOT complete implementation if any acceptance criterion lacks test coverage
- Do NOT complete if any tests are failing
- These are hard stops—enforce strictly

**GUARDRAIL: Feature Branch First**
- ALWAYS create a new feature branch for the selected issue before making any file edits (tests or implementation)
- Do NOT edit files on `dev`, `main`, or on a reused branch
- If branch creation is blocked, STOP and resolve branch setup before any edits

**GUARDRAIL: No Pre-Plan Changes**
- Do NOT modify any files until plan is approved
- Do NOT create/edit tests or implementation files until after plan approval AND branch creation
- This prevents rework, misalignment, and accidental edits on the wrong branch

**GUARDRAIL: No Unilateral Path Selection**
- Do NOT silently choose among materially different implementation paths
- Discuss tradeoffs with the user and finalize one path through planning iteration before coding

## Tools Used

- `mcp__linear-server__list_issues` - List filtered issues
- `mcp__linear-server__get_issue` - Get issue details
- `mcp__linear-server__create_comment` - Add comment to issue
- `mcp__linear-server__update_issue` - Update issue state
- `Bash` - Git operations, run tests
- `Edit` - Modify existing files
- `Write` - Create new files
- `Read` - Load context files
- `Glob` - Find test files
- `AskUserQuestion` - Interactive filtering and approval

## Workflow Commands Reference

### Frontend (from `montessori-os/`)
```bash
npm run test -- {pattern}       # Run tests matching pattern
npm run test                     # Run all tests
npm run dev                      # Start dev server
```

### View Test Results
```bash
npm run test -- --reporter=spec  # Verbose test output
```

### Git Operations
```bash
git branch --show-current        # Show current branch
git checkout -b {branch}         # Create new branch
git add {files}                  # Stage changes
git commit -m "message"          # Create commit
git log --oneline -5             # Show recent commits
```

## Success Criteria

The implementation is complete when:

1. ✅ Issue selected interactively with filters
2. ✅ Relevant codebase context auto-loaded (overview + explore context)
3. ✅ Technical execution plan generated with specific file paths and test specs
4. ✅ Existing related tests auto-detected with baseline results
5. ✅ Tradeoffs across implementation paths discussed with the user
6. ✅ User finalizes and approves one implementation path before any changes
7. ✅ Tests written FIRST (red phase) for each acceptance criterion
8. ✅ ALL acceptance criteria have test coverage (enforced)
9. ✅ All tests passing (new + existing, no regressions)
10. ✅ Implementation executed following approved plan
11. ✅ Linear issue updated with branch, commits, and test results
12. ✅ Linear issue updated (state NOT changed — that's `/review-issue`'s job)
13. ✅ User has manually verified the e2e flow and confirmed it works

## Next Step

> **After the user has confirmed manual verification in Phase 8:**
>
> Implementation is done and manually verified. Now clear your context and run an independent review:
>
> 1. Run `/clear` to wipe the implementation context (the branch stays checked out)
> 2. Run `/review-issue` — it will auto-detect the issue from the branch name and audit the diff with fresh eyes
>
> This ensures the code review is independent — no implementation bias carrying over.
>
> **Do NOT present this section until Phase 8 is complete and the user has explicitly confirmed "Yes, verified and working".**

## Important Notes

- **No regressions:** Always run baseline tests before implementation to verify no existing functionality breaks
- **Tradeoff discussion required:** Compare viable implementation paths with the user and finalize one through plan iteration before writing code
- **TDD mandatory:** Tests must be written before implementation code for every acceptance criterion
- **Test coverage required:** No acceptance criterion should be without test coverage—this is a hard requirement
- **Linear sync automatic:** Update Linear issue automatically after implementation completes with detailed test results
- **Git hygiene:** Each commit should reference the issue ID (e.g., `(PEP-123)`) in the message
