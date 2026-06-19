---
name: implement-issue
description: Implement an approved Pep OS issue plan with TDD, commit and push the current Conductor workspace branch, open a PR against master, monitor CI, and run a CI diagnose/fix loop on failures. Use after /plan-issue has created .context/issue-plans/PEP-{id}.md.
---

# Implement Issue

## Goal

Execute an approved `/plan-issue` artifact for Pep OS, then ship the branch far enough that CI has proven it or produced actionable failures.

This command is the implementation half of the old `/implement-issue` workflow. It assumes planning has already happened and keeps the main session focused on execution, verification, PR creation, and CI recovery.

## When to Use

- After `/plan-issue PEP-{id}` has produced `.context/issue-plans/PEP-{id}.md`.
- When the user wants code written from an approved plan.
- When the branch should be pushed to remote and checked by GitHub Actions.
- When CI failures should trigger a diagnosis subagent followed by a code-fixer subagent.

## Prerequisites

- An approved plan artifact exists at `.context/issue-plans/PEP-{id}.md`.
- The Linear issue ID is known from the user, branch name, or plan artifact.
- The workspace is on a task branch or can safely create one from `origin/master`.
- `gh` is authenticated for this repository.

## Workflow

### Phase 1: Load Plan And Confirm Scope

1. Resolve the issue ID:
   - prefer explicit user input
   - else infer `PEP-{id}` from the current branch
   - else ask the user
2. Read `.context/issue-plans/PEP-{id}.md`.
3. Confirm the plan has:
   - `Final Decision`
   - `Files To Modify`
   - `Test Plan`
   - `Implementation Steps`
4. Fetch the Linear issue and verify the title/acceptance criteria still match the plan.
5. If the plan is missing, stale, or materially mismatched, stop and ask the user to run `/plan-issue` again.

### Phase 2: Branch And Worktree Safety

1. Check status with `git status --short --branch`.
2. Determine the base branch for comparisons and PRs:
   - Use `origin/master` for diffs.
   - Open PRs against `master`.
3. Branch handling in Conductor:
   - Do not rename the current branch.
   - If already on a Conductor workspace/task branch, use it.
   - If on `master`, `main`, or `dev`, create a new branch named `PEP-{id}-{short-slug}` from `origin/master`.
4. If unrelated uncommitted changes exist, stop and ask whether to exclude, stash, or move them.

### Phase 3: TDD Implementation

Follow the approved plan exactly unless implementation reveals a blocker.

1. Write tests first for each acceptance criterion.
2. Run the new/changed tests and confirm they fail for the expected reason.
3. Implement the smallest code change that satisfies the tests.
4. Re-run the related tests until green.
5. Refactor only while tests remain green.
6. If the plan needs a material change, pause and get user approval before continuing.

Pep OS command hints:
- Frontend tests: `cd montessori-os && npm run test -- {pattern}`
- Frontend lint: `cd montessori-os && npm run lint`
- Frontend build: `cd montessori-os && npm run build`
- Security rules tests: follow `tests/security/README.md`
- Functions lint: `cd functions && npm run lint`

### Phase 4: Local Verification

Run the narrowest meaningful checks from the plan, then broaden based on touched files:

- React component or utility changes: related `npm run test -- {pattern}`.
- Shared frontend behavior: `cd montessori-os && npm run test`.
- UI or build-sensitive changes: `cd montessori-os && npm run build`.
- Firestore/Storage rules: security rules test suite.
- Functions: functions lint and any targeted callable tests available.

Do not invent test results. If a command cannot run, record why.

### Phase 5: Commit

1. Review `git diff origin/master...HEAD` and `git diff`.
2. Confirm changed files match the approved plan.
3. Stage only issue-related files.
4. Commit with issue reference:
   - `test: add coverage for {scope} (PEP-{id})`
   - `feat: {description} (PEP-{id})`
   - `fix: {description} (PEP-{id})`
5. Include the Claude co-author footer if that is the local convention.

### Phase 6: Push And Open PR

1. Push the branch:
   - `git push -u origin {branch}`
2. Create or update a PR:
   - If a PR already exists for the branch, update its body if needed.
   - Otherwise run `gh pr create --base master --head {branch}`.
3. PR title:
   - concise, under 70 characters, includes `PEP-{id}`
4. PR body:

```markdown
## Summary
- {what changed}

## Plan
- Source: `.context/issue-plans/PEP-{id}.md`
- Selected option: {option}

## Tests
- {local command}: {result}

## Linear
- Issue: PEP-{id}
- Branch: `{branch}`

Generated with Claude Code.
```

### Phase 7: CI Monitor

After the PR is opened or updated, monitor GitHub Actions.

1. Get the PR number:
   - `gh pr view --json number,url,headRefName,baseRefName`
2. Poll checks:
   - `gh pr checks {pr_number} --watch`
   - If `--watch` is not suitable, use `gh pr checks {pr_number}` and ask the user before waiting again.
3. Outcomes:
   - All checks passing: proceed to Phase 9.
   - Pending after a long wait: summarize pending checks and ask whether to keep waiting.
   - Any check failing: proceed to Phase 8.

### Phase 8: CI Failure Diagnose/Fix Loop

Run at most 3 CI repair iterations.

For each iteration:

1. Spawn the `ci-diagnostician` agent (`.claude/agents/ci-diagnostician.md`) with:
   - PR number and URL
   - branch name
   - failing check names from `gh pr checks`
   - relevant workflow/job logs, fetched with `gh run view`, `gh run list`, or `gh api` as needed
   - local diff against `origin/master`
   - approved plan artifact
2. The diagnostician returns a structured CI Failure Report with root cause, suspect files, and suggested fix.
3. Spawn the `code-fixer` agent (`.claude/agents/code-fixer.md`) with:
   - the CI Failure Report converted into blocker/warning findings
   - the approved plan artifact
   - Linear issue context
4. After fixes:
   - run the relevant local failing command if it can be reproduced
   - commit with `fix: address CI failure (PEP-{id})`
   - push to the same branch
   - return to Phase 7

Stop and escalate to the user if:
- 3 repair iterations fail to produce green CI
- the diagnosis points to infrastructure/secrets/flakiness outside the code change
- the fix would materially change the approved product behavior

### Phase 9: Linear Sync And Handoff

Comment on the Linear issue:

```markdown
## Implementation Ready

**Branch:** `{branch}`
**PR:** {pr_url}
**Base:** `master`

**Plan:** `.context/issue-plans/PEP-{id}.md`

**Local verification:**
- {command}: {result}

**CI:**
- {passing checks summary}
- {CI repair iterations, if any}

**Status:** Ready for review/merge.
```

Move the Linear issue to `In Review` only after the PR exists and CI is passing, unless the user asks to leave state unchanged.

## Guardrails

- Do not proceed without an approved `.context/issue-plans/PEP-{id}.md`.
- Do not rename the current Conductor workspace branch.
- Use `origin/master` for diffs and `master` as the PR base.
- Do not edit unrelated files.
- Do not skip test coverage for acceptance criteria unless the plan has an explicit user-approved exception.
- Do not push if local related tests are failing, unless the user explicitly accepts the risk.
- Do not mark Linear `In Review` until CI passes.
- Do not merge the PR. Merging is a separate user decision.

## Success Criteria

1. Approved plan loaded and followed.
2. Every acceptance criterion has passing test coverage or an explicit approved exception.
3. Related local verification completed and reported.
4. Issue-related commits created.
5. Branch pushed to origin.
6. PR opened against `master`.
7. CI monitored to a passing state, or failures diagnosed/fixed for up to 3 iterations before escalation.
8. Linear updated with branch, PR, local verification, and CI status.
