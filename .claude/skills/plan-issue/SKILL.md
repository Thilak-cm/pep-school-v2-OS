---
name: plan-issue
description: Plan a Pep OS Linear issue without editing product code. Use before /implement-issue to select an issue, load project context, compare viable implementation paths, map every acceptance criterion to tests, run baseline discovery, and write an approved plan artifact into .context/issue-plans/.
---

# Plan Issue

## Goal

Turn a Linear issue into an implementation-ready Pep OS plan without making product code changes. This command is the planning half of the old `/implement-issue` workflow.

The output is a durable plan artifact in `.context/issue-plans/PEP-{id}.md` that `/implement-issue` can consume in a separate session in the same workspace. `.context` is intentionally gitignored and shared between agents working in the same Conductor workspace.

## When to Use

- Before implementing a Linear issue.
- When the issue needs codebase context, tradeoff discussion, or test design.
- When implementation should happen in a separate session after the plan is approved.
- When a user asks for planning only and does not want file edits.

## Hard Boundary

Do not edit product code, tests, config, rules, version files, or docs outside `.context/issue-plans/`. The only file this skill may create or update is the plan artifact.

## Workflow

### Phase 1: Issue Selection

1. If the user provided an issue ID, load it directly.
2. Otherwise ask for filters:
   - assignee: default `me`
   - state: default `Todo`
   - team: default `Pep school v2 os`
   - labels and priority: optional
3. List candidate issues and let the user choose.
4. Fetch the selected issue with relations.

Output:
- Linear issue ID, title, URL, description, labels, state, and acceptance criteria.

### Phase 2: Project Context

1. Read `.claude/skills/codebase-context-scan/references/pep-os-overview.md`.
2. Check overview staleness:
   - Read the `Generated:` timestamp near the top of the overview.
   - Count commits since that date with `git log --oneline --after="{date}" | wc -l`.
   - If the overview is 5+ commits or 7+ days old, warn the user and ask whether to refresh with `/codebase-context-scan`.
3. Infer relevant area tags from Linear labels and issue text:
   - voice notes, transcription, observations -> `observation-capture`
   - timeline, media, student history -> `timelines-and-media`
   - permissions, roles, users, classroom scopes -> `admin-and-access`
   - Firebase, rules, Storage, Firestore -> `firebase-infrastructure`
   - AI coach, nudges, prompts -> `ai-coach`
   - reports, export, CSV, digest -> `reporting-and-export`
4. Spawn the `codebase-explorer` agent only if the overview is insufficient, the issue crosses multiple areas, or specific files/patterns need tracing.

Pass this data to `codebase-explorer`:
- full overview content
- inferred area tags
- Linear issue title and acceptance criteria
- exploration focus: `implementation`
- files explicitly mentioned in the issue

### Phase 3: Requirements Extraction

Parse the issue into:
- user-visible goal
- acceptance criteria
- out-of-scope notes
- bug reproduction details, if this is a bug
- data/security/role constraints
- manual verification needs

Every acceptance criterion must get a stable label: `AC-1`, `AC-2`, etc.

### Phase 4: Implementation Options

Generate 2-3 viable implementation paths when the problem has real design choices. If only one path is sensible, say why.

For each option include:
- what changes
- files likely touched
- pros
- cons
- risk profile: low, medium, or high
- test impact

Recommend one option, but do not finalize it until the user confirms.

### Phase 5: Test Discovery And Baseline

1. Identify likely files to modify.
2. Discover related tests:
   - `montessori-os/src/**/*.test.js`
   - `montessori-os/src/**/*.test.jsx`
   - `tests/security/*.test.js`
   - `mcp-server/*.test.mjs`
   - `functions/**/*.test.{js,mjs}` if present
3. Run the narrowest useful baseline checks when practical:
   - frontend unit tests: `cd montessori-os && npm run test -- {test-pattern}`
   - security rules tests: follow `tests/security/README.md`
   - lint only when the touched area makes it relevant
4. Record baseline failures honestly. Do not proceed silently if failures are in the area being planned.

### Phase 6: Plan Artifact

Write or update `.context/issue-plans/PEP-{id}.md` with this exact structure:

```markdown
# PEP-{id}: {title}

## Issue
- Linear: {url}
- State: {state}
- Labels: {labels}

## Summary
{1-2 sentence implementation summary}

## Requirements
- [AC-1] {criterion}
- [AC-2] {criterion}

## Context Loaded
- Overview: `.claude/skills/codebase-context-scan/references/pep-os-overview.md`
- Area tags: {tags}
- Explorer used: yes/no
- Key patterns/constraints:
  - {pattern}

## Implementation Options
### Option A (Recommended): {name}
- What it changes:
- Pros:
- Cons:
- Risk profile:
- Test impact:

### Option B: {name}
- What it changes:
- Pros:
- Cons:
- Risk profile:
- Test impact:

## Final Decision
- Selected option: {A/B/C}
- Rationale:
- User confirmations:

## Files To Modify
- `{path}` - {expected change}

## Files To Create
- `{path}` - {purpose}

## Test Plan
### [AC-1] {criterion}
- Test type:
- Test file:
- Test description:
- Edge cases:

### [AC-2] {criterion}
- Test type:
- Test file:
- Test description:
- Edge cases:

## Baseline Results
- {command}: {result}

## Implementation Steps
1. {TDD step}
2. {TDD step}

## Manual Verification Checklist
- [ ] {flow or state to verify}

## Guardrails
- Do not change unrelated behavior.
- Do not ship with failing related tests.
- Do not mark implementation complete until every acceptance criterion has passing test coverage or an explicit user-approved exception.
```

### Phase 7: Approval

Show the plan to the user and ask them to approve, edit, or switch implementation option.

If the user requests changes, update `.context/issue-plans/PEP-{id}.md` and re-present the changed sections. The skill is complete only when the plan artifact has a finalized `Final Decision` section.

## Success Criteria

1. A Linear issue is selected and loaded.
2. Pep OS context is loaded and relevant area tags are identified.
3. Any needed `codebase-explorer` pass is complete.
4. Implementation options and tradeoffs are documented.
5. Every acceptance criterion maps to at least one test or an explicit user-approved exception.
6. Baseline tests/checks are recorded when practical.
7. `.context/issue-plans/PEP-{id}.md` exists and contains the approved final decision.

## Next Step

After the plan is approved, run:

```text
/implement-issue PEP-{id}
```
