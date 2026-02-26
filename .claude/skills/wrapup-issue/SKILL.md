---
name: wrapup-issue
description: "Audit diffs, run tests, commit, push feature branch, open PR against dev, and move Linear issue to In Review. Use when coding is done and you want to ship a PR for review."
---

# Wrap Up Issue

## Goal

Standardize the workflow after coding is complete so Claude does not stop at "code works locally" and does not write low-signal commits or forget Linear / test / PR steps.

This skill bundles the `wrapup-issue` flow after `implement-issue` in this order:

1. Audit the code diff using session context (review mindset)
2. Run available tests and linting
3. Commit changes
4. Push the feature branch and open a PR against `dev`
5. Update the Linear issue and move it to `In Review`

## When to Use

- You already finished implementation and validation for a Linear issue
- You want a consistent wrap-up workflow (audit -> test -> commit -> PR -> Linear)
- You are working in the Pep OS repo with a feature branch targeting `dev`

## Prerequisites

- Code changes are implemented and locally verified enough to review
- You know which Linear issue this work belongs to (from session context, branch name, or user input)
- You are not intentionally leaving the branch open for more work

## Default Behavior

- Use session context to understand issue scope, expected behavior, and verification already performed
- Review the diff with a code-review mindset before committing (find bugs/regressions, not just style)
- Prefer committing only the changes related to the current issue
- Run available tests/linting and do not proceed with failing tests unless user accepts the risk
- Push the feature branch and open a PR against `dev` (do NOT merge or touch `dev`)
- Update Linear with truthful test/manual verification status, then move issue to `In Review`

## Workflow

### Phase 1: Diff-Based Audit (Required)

Audit the current work before any new commit.

1. Gather audit context
- Read the session context for:
  - selected issue ID / title
  - intended behavior and tradeoffs
  - tests run / manual verification done
  - known limitations or follow-up items
- Inspect git state and branch:
  - `git branch --show-current`
  - `git status --short`
  - `git log --oneline --decorate --max-count=10`

2. Audit the change set (diff-based)
- Review the uncommitted diff and/or branch commits against `dev`
- Focus on:
  - correctness bugs
  - regression risk
  - missing tests for changed behavior
  - unsafe error handling / silent failures
  - accidental debug code
  - performance regressions
- If issues are found, fix them before proceeding

3. Audit output
- Report findings first (severity ordered), then brief summary
- If no findings, state that explicitly and note residual risk / test gaps

### Phase 2: Run Tests (Required)

1. Auto-detect test scripts
- Check `montessori-os/package.json` for `test` and `lint` scripts
- Check `functions/package.json` for `lint` script
- Check root `package.json` for any test/lint scripts

2. Run available scripts
- Run whatever test/lint scripts exist (e.g. `npm run test` in `montessori-os/`, `npm run lint` in `functions/`)
- Skip gracefully if no test scripts are configured for a given package

3. Handle failures
- If tests fail: report failures, fix if possible, re-run
- Do not proceed past this phase with failing tests unless user explicitly accepts the risk

### Phase 3: Commit (Required)

1. Prepare commit scope
- Confirm the working tree only contains issue-related changes
- If unrelated changes exist, ask whether to split/stash/leave them out
- Stage the intended files

2. Create commit(s)
- Write a clear commit message referencing the issue ID (e.g., `feat: add voice upload retry (PEP-123)`)
- If changes naturally split into multiple commits, create multiple commits
- Include `Co-Authored-By: Claude` signoff

3. Post-commit check
- Show commit hashes and subjects
- Confirm working tree status before moving on

### Phase 4: Push Feature Branch + Open PR (Required)

1. Push feature branch
- Push to `origin` with `-u` flag to set upstream tracking
- Do NOT checkout or merge into `dev`

2. Open PR via `gh pr create`
- Target branch: `dev`
- PR body should include:
  - summary of implemented behavior
  - test results (truthful)
  - manual verification notes (truthful)
  - branch name and commit hashes
  - any known follow-up risks or TODOs
- Use the same format as Linear comments for consistency

3. Report
- Share the PR URL with the user

### Phase 5: Linear Sync + Move to `In Review` (Required)

1. Resolve the Linear issue
- Prefer the issue selected earlier in the session (`implement-issue`)
- If unclear, infer from branch/commit references and ask before updating

2. Create/update Linear comment
- Include:
  - summary of implemented behavior
  - test results (truthful)
  - manual verification notes (truthful)
  - branch name and commit hashes
  - PR URL
  - any known follow-up risks or TODOs

3. Move issue state
- Move the issue to `In Review`
- Do not change assignee unless the user asks

## Human Approval Gates (Do Not Skip)

Ask for explicit approval at these points unless the user has already clearly requested the full sequence in the current turn:

1. Before committing, if the audit found issues and fixes were applied
2. Before moving the Linear issue to `In Review` when manual verification status is unclear

## Guardrails

- Do not push if tests failed and user hasn't accepted the risk
- Do not open PR if working tree is dirty after commits
- Do not update the wrong Linear issue when multiple issue IDs appear in session context
- Do not invent test/validation results
- Do NOT merge into `dev` or delete any branches — that is the `merge-issue` skill's job

## Success Criteria

1. Diff was audited against the current task/issue context
2. Available tests/linting passed (or user accepted the risk)
3. Commit(s) were created with clear messages referencing the issue ID
4. Feature branch was pushed to `origin`
5. PR was opened against `dev` with a detailed body
6. Linear issue was commented and moved to `In Review`
