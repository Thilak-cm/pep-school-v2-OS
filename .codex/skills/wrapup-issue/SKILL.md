---
name: wrapup-issue
description: "Bundle post-implementation work after `implement-issue`: diff-based audit, detailed commit creation via `git-commit-writer`, Linear issue sync to In Review, and branch merge/cleanup into `dev`. Use when coding is done and you want a structured ship/hand-off workflow with explicit human approval gates for risky steps."
---

# Wrap Up Issue

## Goal

Standardize the workflow after coding is complete so Codex does not stop at "code works locally" and does not write low-signal commits or forget Linear / branch cleanup steps.

This skill bundles the `wrapup-issue` flow after `implement-issue` in this order:

1. Audit the code diff using session context (review mindset)
2. Write commit(s) using `git-commit-writer`
3. Update the Linear issue and move it to `In Review`
4. Merge the feature branch into `dev` and clean up the feature branch
5. Push `dev` to `origin`

## When to Use

- You already finished implementation and validation for a Linear issue
- You want a consistent wrap-up workflow (audit -> commit -> Linear -> merge -> push)
- You want to avoid terse or low-context commit messages
- You are working in the Pep OS repo with a feature branch targeting `dev`

## Prerequisites

- Code changes are implemented and locally verified enough to review
- You know which Linear issue this work belongs to (from session context, branch name, or user input)
- You are not intentionally leaving the branch open for more work

## Default Behavior

- Use session context to understand issue scope, expected behavior, and verification already performed
- Review the diff with a code-review mindset before committing (find bugs/regressions, not just style)
- Prefer committing only the changes related to the current issue
- Use `git-commit-writer` for commit creation (do not hand-write a one-line commit)
- Update Linear with truthful test/manual verification status, then move issue to `In Review`
- Merge to `dev` safely (prefer fast-forward), then push `dev`, then delete the feature branch

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

### Phase 2: Commit Using `git-commit-writer` (Required)

Use the `git-commit-writer` skill for all commits in this phase.

1. Prepare commit scope
- Confirm the working tree only contains issue-related changes
- If unrelated changes exist, ask whether to split/stash/leave them out
- Stage the intended files

2. Invoke `git-commit-writer`
- Use session context + staged diff
- Require a multi-line commit message with touched-file notes and Codex signoff
- If changes naturally split into multiple commits, create multiple commits

3. Post-commit check
- Show commit hashes and subjects
- Confirm working tree status before moving on

### Phase 3: Linear Sync + Move to `In Review` (Required)

1. Resolve the Linear issue
- Prefer the issue selected earlier in the session (`implement-issue`)
- If unclear, infer from branch/commit references and ask before updating

2. Create/update Linear comment
- Include:
  - summary of implemented behavior
  - test results (truthful)
  - manual verification notes (truthful)
  - branch name and commit hashes
  - any known follow-up risks or TODOs

3. Move issue state
- Move the issue to `In Review`
- Do not change assignee unless the user asks

### Phase 4: Merge + Branch Cleanup (High Risk)

This phase changes shared history state and should always have an explicit approval gate.

1. Pre-merge checks
- Working tree is clean
- Current branch is the feature branch
- `dev` exists locally
- No unresolved conflicts
- Confirm merge target is `dev` (do not assume another target)

2. Merge locally
- Update local `dev` from `origin/dev` (fast-forward only)
- Merge feature branch into `dev` (prefer fast-forward; if not possible, stop and ask)

3. Branch cleanup
- Delete the local feature branch after successful merge
- Delete the remote feature branch only after `dev` push succeeds

### Phase 5: Push `dev` to `origin` (High Risk)

1. Push `dev`
- Push merged `dev` to `origin`
- If push fails, do not delete the remote feature branch

2. Final report
- Share pushed branch, resulting commit range, and cleanup status
- Confirm Linear is in `In Review`

## Human Approval Gates (Do Not Skip)

Ask for explicit approval at these points unless the user has already clearly requested the full sequence in the current turn:

1. Before committing, if the audit found issues and fixes were applied
2. Before moving the Linear issue to `In Review` when manual verification status is unclear
3. Before merging into `dev`
4. Before deleting the remote feature branch

## Recommended Improvements (for future versions)

- Add execution modes:
  - `draft-only`: audit + commit draft + Linear draft comment, no writes
  - `local-only`: commit + local merge, no remote push / Linear updates
  - `full-ship`: full workflow with explicit approvals
- Add branch-policy checks:
  - detect if repo expects PRs instead of direct merges to `dev`
  - stop if `dev` is protected / push is disallowed
- Add CI gate integration:
  - check PR status or required checks before merge/push when available
- Add a rollback playbook:
  - what to do if merge/push succeeds but Linear update fails (or vice versa)
- Add commit-splitting heuristics:
  - detect test + production changes that should be split

## Guardrails

- Do not merge to `dev` if tests/manual verification are unknown and the user has not accepted that risk
- Do not push `dev` if merge conflicts were resolved ad hoc without user awareness
- Do not delete branches before confirming the merge and push succeeded
- Do not update the wrong Linear issue when multiple issue IDs appear in session context
- Do not invent validation results

## Success Criteria

1. Diff was audited against the current task/issue context
2. Commit(s) were created via `git-commit-writer` with detailed multi-line messages
3. Linear issue was commented and moved to `In Review`
4. Feature branch was merged into `dev` safely
5. `dev` was pushed to `origin`
6. Feature branch cleanup completed (local and remote) or clearly reported if skipped
