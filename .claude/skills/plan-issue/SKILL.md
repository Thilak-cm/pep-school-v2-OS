---
name: plan-issue
description: Plan implementation of a Linear issue — context loading, technical plan with tradeoff discussion, test discovery, and user approval. Read-only planning only; no code changes. Produces an approved plan in conversation context for /implement-issue to execute.
---

# Plan Issue

Bridge the gap between a Linear issue and a ready-to-execute plan. This skill automates selecting an issue, loading codebase context, generating a technical execution plan with test specifications, discussing tradeoffs between viable implementation paths, and iterating until the user approves one path. **Planning only — no file modifications.**

The approved plan stays in conversation context. Run `/implement-issue` in the **same session** to execute it.

## When to Use This Skill

- You want to plan work on a Linear issue from the `pep-os` workspace
- You need to compare multiple implementation paths with the user before coding
- You want a structured execution plan with test specs before writing code
- You want to discuss tradeoffs and get explicit user buy-in before any changes

## Workflow Overview

5-phase, read-only workflow:

1. **Issue Selection** — Interactively filter and select a Linear issue
2. **Context Loading** — Auto-load codebase overview, staleness check, optional codebase-explorer
3. **Plan Generation** — Technical execution plan with file paths, test specs, and implementation path options
4. **Test Discovery & Baseline** — Auto-detect related tests, run baseline, identify coverage gaps
5. **Plan Approval** — User reviews tradeoffs, iterates on plan, approves a final implementation path

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
   - Use issue labels first (e.g., "observation-capture" -> "observation-capture" area)
   - Fall back to keyword matching on title/description
   - Area mapping examples:
     - "voice note", "voice transcription" -> "observation-capture"
     - "timeline", "student timeline" -> "timelines-and-media"
     - "permission", "role", "admin" -> "auth-and-access"
     - "firebase", "rules", "security" -> "firebase-infrastructure"
     - "report", "export", "PDF" -> "reporting-and-export"

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

Get explicit user approval before any code changes happen.

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
9. If "yes": Plan is finalized. Instruct user to run `/implement-issue` in this same session to execute it.

**GUARDRAIL:** Do not modify any files during this entire skill. Planning is read-only.

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

**GUARDRAIL: Read-Only**
- Do NOT create, edit, or write any project files during this skill
- Do NOT create branches, make commits, or modify code
- The ONLY output is the approved plan in conversation context

**GUARDRAIL: No Unilateral Path Selection**
- Do NOT silently choose among materially different implementation paths
- Discuss tradeoffs with the user and finalize one path through planning iteration

## Tools Used

- `mcp__linear-server__list_issues` - List filtered issues
- `mcp__linear-server__get_issue` - Get issue details
- `Bash` - Git log (read-only), run baseline tests
- `Read` - Load context files
- `Glob` - Find test files
- `Grep` - Search codebase for patterns
- `Agent` (codebase-explorer) - Deep context loading
- `AskUserQuestion` - Interactive filtering and approval

## Success Criteria

Planning is complete when:

1. Issue selected interactively with filters
2. Relevant codebase context auto-loaded (overview + explore context)
3. Technical execution plan generated with specific file paths and test specs
4. Existing related tests auto-detected with baseline results
5. Tradeoffs across implementation paths discussed with the user
6. User finalizes and approves one implementation path
7. User instructed to run `/implement-issue` in the same session to execute

## Next Step

> **After the user approves the plan in Phase 5:**
>
> The plan is finalized and lives in this conversation's context. Run `/implement-issue` in this same session to execute it.
>
> `/implement-issue` will read the approved plan from context and proceed directly to branch creation, TDD implementation, CI verification, and Linear sync — no replanning needed.
