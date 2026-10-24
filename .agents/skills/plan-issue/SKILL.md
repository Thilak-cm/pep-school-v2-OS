---
name: plan-issue
description: Plan implementation of a GitHub issue — context loading, technical plan with test discovery, user approval, then scaffold committed types, stubs, and test cases for /implement-issue to execute in a separate session.
---

# Plan Issue

Bridge the gap between a refined GitHub issue and a ready-to-execute implementation. Loads codebase context, generates a technical execution plan with test specifications, gets user approval, then scaffolds the contract (types, stubs, tests) and commits it to a feature branch.

Well-refined issues (via `/spec-issue`) should converge on a single implementation path. If multiple paths emerge, that's a refinement gap — flag it, but proceed by discussing the fork with the user.

After approval, the scaffold is committed to a feature branch. The user reviews the committed artifacts at their own pace, then runs `/implement-issue` in a **new session**.

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

**Path convergence check:** determine the implementation approach. If you find yourself wanting to present "Option A vs Option B", the issue has a refinement gap — flag it ("Consider running `/spec-issue` to resolve this, or I can discuss the options here") and add a `## Refinement Gap` section describing the fork and the facts/constraints of each option. **Do not include a recommendation for consequential forks** (trade-offs, shared contracts, data shapes, security, anything trunk — the leaf/trunk rule applied to decisions): the user proposes a resolution first, then stress-test it (strongest objection, edge cases, steelmanned alternative, industry comparison) before converging. Offer your own view only after their proposal has been examined or they're stuck/ask. Trivial forks (naming, copying an established pattern) may carry a recommendation. Why: recommend-then-confirm anchors the user and invites rubber-stamping. Otherwise generate the plan directly with no hedging.

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
- [ ] All contract tests written and correctly failing (red)
- [ ] Existing related tests still passing (no regressions from stubs)
- [ ] Manual testing completed (if UI changes)
```

**CRITICAL: Every acceptance criterion MUST map to at least one test.**

## Phase 4: Test Discovery & Baseline

1. For each file to modify, find related test files (`{filename}.test.{js,jsx,mjs}`, `__tests__/`) across `montessori-os/src/` and `functions/`.
2. Run baseline tests (`cd montessori-os && npm run test -- {pattern}`) and capture results. Report existing failures.
3. Compare acceptance criteria against existing coverage; list gaps and test files to create.
4. Update the plan with an "Existing Tests" section and confirmed test file paths.

## Phase 5: Plan Approval

Present the complete plan, area tags, risk profile, and test baseline. Iterate on user feedback until approved. If a refinement gap was flagged, resolve the fork with the user using the propose-first protocol from Phase 3 (user proposes, you stress-test) and collapse to a single path before finalizing.

On approval: proceed to Phase 6 (Scaffold & Commit).

## Phase 6: Scaffold & Commit

After the user approves the plan, write the contract artifacts and commit them.

1. **Create a feature branch** — `{issue-id}-{slug}` (e.g., `gh-123-fix-voice-upload`). Never scaffold on `dev`, `main`, `alt-dev`, or a reused branch.

2. **Write type definitions and interfaces** — define the data shapes, function signatures, and contracts specified in the plan. Place them where the plan's "Files to Modify / Create" section indicates.

3. **Write stub functions** — implement every function signature with a body that throws `new Error('Not implemented')`. Stubs must export the correct interface so test files can import them.

4. **Write test cases** — per the plan's Test Specification, write complete test files covering every acceptance criterion. Tests should import from the stubs and assert the expected behavior.

5. **Run tests to confirm they fail (red)** — every test must fail with "Not implemented" or an assertion error, not an import/syntax error. If tests fail for the wrong reason, fix the scaffold until the failure mode is correct.

6. **Commit the scaffold:**
   - `chore: add type stubs for [feature] (#123)`
   - `test: add contract tests for [feature] (#123)`

7. **Update the GitHub issue** via `gh issue comment` with: branch name, list of committed files (types, stubs, tests), and "Contract committed - ready for implementation review."

## Guardrails

- Phases 1-5 are read-only (planning). Phase 6 writes code, but ONLY types, stubs, and tests - no implementation logic.
- If the plan seems too broad, suggest splitting into multiple issues.
- If the issue is already "In Progress", warn and ask before proceeding.
- If refinement gaps happen frequently, note that `/spec-issue` grilling may need improvement.

## Next Step

> Review the committed types, stubs, and test cases on the feature branch. When satisfied that the contract is correct, start a **new Claude session** and run `/implement-issue #N`. The fresh session ensures the implementation agent treats the tests as an external contract, not something it authored.
