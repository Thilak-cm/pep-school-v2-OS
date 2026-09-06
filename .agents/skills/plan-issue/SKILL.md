---
name: plan-issue
description: Plan implementation of a GitHub issue — context loading, technical plan with test discovery, and user approval. Read-only planning only; no code changes. Produces an approved plan in conversation context for /implement-issue to execute.
---

# Plan Issue

Bridge the gap between a refined GitHub issue and a ready-to-execute plan. Loads codebase context, generates a technical execution plan with test specifications, and gets user approval. **Planning only — no file modifications.**

Well-refined issues (via `/spec-issue`) should converge on a single implementation path. If multiple paths emerge, that's a refinement gap — flag it, but proceed by discussing the fork with the user.

The approved plan stays in conversation context. Run `/implement-issue` in the **same session** to execute it.

## Phase 1: Issue Selection

- If the issue is already in context (user just ran `/spec-issue` or says "plan #301"), fetch it directly via `gh issue view`.
- If no issue is specified, ask for filters (assignee/state/labels/priority), list matching issues via `gh issue list`, and let the user pick.

**Output:** issue title, description, acceptance criteria, labels, state.

## Phase 2: Context Loading

1. Read `.agents/skills/codebase-context-scan/references/pep-os-overview.md` and extract the Area Map.
2. **Staleness check:** read the `Generated:` timestamp. If 5+ commits since or 7+ days old, ask the user whether to refresh via `/codebase-context-scan` or proceed with the stale overview. Otherwise proceed silently.
3. Infer area tags from issue labels first, then keyword matching on title/description (e.g., "voice" -> observation-capture, "role/admin" -> auth-and-access, "report/PDF" -> reporting-and-export).
4. If the overview is insufficient for the inferred areas, spawn the `codebase-explorer` subagent (focus: `"implementation"`) with the overview, target areas, issue context, and any files mentioned in the issue. Wait for its structured result.
5. Parse requirements: user story and acceptance criteria for features; steps to reproduce and expected vs actual for bugs.

## Phase 3: Plan Generation

Map each acceptance criterion to code changes. Identify files to modify, constraints (storage rules budget, role-based access), and check the issue's "Decisions Made" section — those are resolved constraints that eliminate alternative paths.

**Path convergence check:** determine the implementation approach. If you find yourself wanting to present "Option A vs Option B", the issue has a refinement gap — flag it ("Consider running `/spec-issue` to resolve this, or I can discuss the options here") and add a `## Refinement Gap` section describing the fork, the options with pros/cons, and a recommendation. Otherwise generate the plan directly with no hedging.

Plan structure:

```markdown
## Summary
[1-2 sentences]

## Implementation Approach
[Step-by-step, TDD style: tests first, then implementation. THE approach, not one of several.]

## Files to Modify / Create
- `path/file.js` - [what changes]

## Test Specification
[Per acceptance criterion: test type (unit/integration/e2e), test file (new or existing),
 test description, edge cases]

## Risk Profile
[Low/Medium/High + key risks and mitigations]

## Related Context
[Overview/explore findings, constraints, decisions that constrained this to one path]

## Verification Checklist
- [ ] All acceptance criteria have test coverage
- [ ] All new tests written and passing
- [ ] Existing related tests still passing
- [ ] Manual testing completed (if UI changes)
```

**CRITICAL: Every acceptance criterion MUST map to at least one test.**

## Phase 4: Test Discovery & Baseline

1. For each file to modify, find related test files (`{filename}.test.{js,jsx,mjs}`, `__tests__/`) across `montessori-os/src/` and `functions/`.
2. Run baseline tests (`cd montessori-os && npm run test -- {pattern}`) and capture results. Report existing failures.
3. Compare acceptance criteria against existing coverage; list gaps and test files to create.
4. Update the plan with an "Existing Tests" section and confirmed test file paths.

## Phase 5: Plan Approval

Present the complete plan, area tags, risk profile, and test baseline. Iterate on user feedback until approved. If a refinement gap was flagged, resolve the fork with the user and collapse to a single path before finalizing.

On approval: instruct the user to run `/implement-issue` in this same session.

## Guardrails

- **Read-only.** No file edits, branches, or commits during this skill. The only output is the approved plan in conversation context.
- If the plan seems too broad, suggest splitting into multiple issues.
- If the issue is already "In Progress", warn and ask before proceeding.
- If refinement gaps happen frequently, note that `/spec-issue` grilling may need improvement.

## Next Step

> After approval, run `/implement-issue` in this same session. It reads the plan from context and proceeds directly to branch creation, TDD implementation, and verification — no replanning.
