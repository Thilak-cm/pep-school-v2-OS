---
name: plan-issue
description: Plan implementation of a Linear issue — context loading, technical plan with test discovery, and user approval. Read-only planning only; no code changes. Produces an approved plan in conversation context for /implement-issue to execute.
---

# Plan Issue

Bridge the gap between a refined Linear issue and a ready-to-execute plan. This skill loads codebase context, generates a technical execution plan with test specifications, and gets user approval. **Planning only — no file modifications.**

Well-refined issues (via `/refine-linear-issue`) should converge on a single implementation path. If the issue is well-refined, this skill produces one plan directly. If multiple paths emerge, that's a signal the issue may need further refinement — flag it but proceed by discussing the fork with the user.

The approved plan stays in conversation context. Run `/implement-issue` in the **same session** to execute it.

## When to Use This Skill

- You want to plan work on a Linear issue from the `pep-os` workspace
- You want a structured execution plan with test specs before writing code
- You want explicit user approval before any code changes

## Workflow Overview

5-phase, read-only workflow:

1. **Issue Selection** — Select a Linear issue (streamlined when coming from `/refine-linear-issue`)
2. **Context Loading** — Auto-load codebase overview, staleness check, optional codebase-explorer
3. **Plan Generation** — Technical execution plan with file paths and test specs (single path expected)
4. **Test Discovery & Baseline** — Auto-detect related tests, run baseline, identify coverage gaps
5. **Plan Approval** — User reviews plan, iterates, approves

## Phase 1: Issue Selection

Select which Linear issue to plan. This phase is streamlined when the issue was just refined in the same session.

**If the issue is already in conversation context** (e.g., user just ran `/refine-linear-issue` or says "plan PEP-301"):
- Skip filtering UI — use the issue already in context or fetch it directly by ID.
- Call `get_issue` with `includeRelations=true` to get the latest description.

**If no issue is specified:**
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

Create a technical execution plan with specific file paths and test specifications. Well-refined issues should converge on a single implementation path.

**Steps:**
1. Analyze requirements + context:
   - Map each acceptance criterion to code changes
   - Identify files to modify (from overview and explore context)
   - Consider constraints (e.g., Firebase Storage rules, role-based access)
   - Review related/blocking issues for additional context
   - Check the issue's "Decisions Made" section (added by `/refine-linear-issue`) — these are resolved constraints that eliminate alternative paths

2. **Path convergence check:**
   - With the acceptance criteria, decisions, and constraints from the issue, determine the implementation approach.
   - **Single path (expected for refined issues):** Generate the plan directly. No options section needed.
   - **Multiple paths (refinement gap):** If you find yourself wanting to present "Option A vs Option B", the issue likely needs further refinement. Flag this: *"This issue has an unresolved decision that creates a fork: [describe the fork]. Consider running `/refine-linear-issue` to resolve this, or I can discuss the options here."* Then proceed with options if the user wants to resolve it inline.

3. Generate execution plan:

```markdown
## Summary
[1-2 sentence description of implementation approach]

## Implementation Approach
[Step-by-step technical approach — TDD style: write tests first, then implementation.
 This is THE approach, not one of several options. If the issue was well-refined,
 there should be no "alternatively" or "we could also" hedging here.]

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

## Risk Profile
- **Risk:** Low | Medium | High
- **Key risks:** [What could go wrong and how to mitigate]

## Related Context
- [Reference overview sections or explore findings that informed this plan]
- [Any architectural constraints or patterns to follow]
- [Decisions from issue refinement that constrained this to one path]

## Verification Checklist
- [ ] All acceptance criteria have test coverage
- [ ] All new tests written and passing
- [ ] Existing related tests still passing (no regressions)
- [ ] Manual testing completed (if UI changes)
```

**Fallback — Multiple paths (unresolved fork):**

If the issue has an unresolved decision creating multiple viable paths, add this section before "Implementation Approach":

```markdown
## Refinement Gap

This issue has an unresolved decision:
[Describe the specific ambiguity]

### Option A: [Approach name]
- **What it changes:** [Short summary]
- **Pros/Cons:** [...]

### Option B: [Approach name]
- **What it changes:** [Short summary]
- **Pros/Cons:** [...]

**Recommendation:** [Which option and why]
**To avoid this in future:** This decision should be resolved during `/refine-linear-issue`.
```

**CRITICAL REQUIREMENT:** Every acceptance criterion MUST map to at least one test.

**Output:** Complete technical execution plan with test specifications (single path for refined issues, fallback options if refinement gap detected)

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
3. Show risk profile and key risks
4. Show test discovery results and baseline
5. Ask user to approve (approve/edit)
6. If "edit": Ask what needs changing, iterate on plan
7. If "no": Ask what needs revision, go back to Phase 3
8. If "yes": Plan is finalized. Instruct user to run `/implement-issue` in this same session to execute it.

**If a refinement gap was flagged (multiple paths):**
- Discuss the fork with the user and resolve it before finalizing
- Once resolved, collapse the plan back to a single path
- Note: if this happens frequently, the `/refine-linear-issue` grilling process may need improvement

**GUARDRAIL:** Do not modify any files during this entire skill. Planning is read-only.

## Edge Cases & Guardrails

**Edge Case: Issue has no labels**
- Use keyword matching on title/description to infer area tags
- If ambiguous, ask user to specify relevant area(s)

**Edge Case: Plan seems too broad**
- Suggest splitting into multiple issues
- Ask user if they want to proceed with full scope or narrow focus

**Edge Case: Multiple viable implementation paths (refinement gap)**
- Flag that this issue may not have been fully refined
- Suggest running `/refine-linear-issue` to resolve the fork, OR resolve it inline during planning
- Present the options with tradeoffs, get user decision, then collapse to a single-path plan

**Edge Case: Issue already "In Progress"**
- Warn user, ask if they want to take ownership and proceed

**GUARDRAIL: Read-Only**
- Do NOT create, edit, or write any project files during this skill
- Do NOT create branches, make commits, or modify code
- The ONLY output is the approved plan in conversation context

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

1. Issue selected (streamlined if coming from `/refine-linear-issue`)
2. Relevant codebase context auto-loaded (overview + explore context)
3. Technical execution plan generated with specific file paths and test specs
4. **Single implementation path** — no unresolved forks (refinement gaps flagged and resolved if found)
5. Existing related tests auto-detected with baseline results
6. User approves the plan
7. User instructed to run `/implement-issue` in the same session to execute

## Next Step

> **After the user approves the plan in Phase 5:**
>
> The plan is finalized and lives in this conversation's context. Run `/implement-issue` in this same session to execute it.
>
> `/implement-issue` will read the approved plan from context and proceed directly to branch creation, TDD implementation, CI verification, and Linear sync — no replanning needed.
