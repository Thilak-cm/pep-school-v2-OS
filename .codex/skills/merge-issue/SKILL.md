---
name: merge-issue
description: "Merge a reviewed PR into dev via gh pr merge, clean up local and remote branches, and move Linear issue to Done. Use after PR review is complete and you're ready to land the change."
---

# Merge Issue

## Goal

Handle the post-review landing workflow: merge the PR, clean up branches, and close out the Linear issue. This is the counterpart to `wrapup-issue` which handles everything up to opening the PR.

This skill covers:

1. Pre-merge checks (PR status, CI, review comments)
2. Merge the PR via `gh pr merge`
3. Local branch cleanup (checkout dev, pull, delete feature branch)
4. Update the Linear issue and move it to `Done`

## When to Use

- A PR opened by `wrapup-issue` has been reviewed and approved
- You want to land the change into `dev` with proper cleanup
- You want Linear to reflect the completed state

## Prerequisites

- An open PR exists for the current feature branch targeting `dev`
- The PR has been reviewed (or the user is ready to merge without review)
- You know which Linear issue this work belongs to (from session context, branch name, or PR description)

## Workflow

### Phase 1: Pre-Merge Checks (Required)

1. Identify the PR to merge
- Prefer the current branch's open PR via `gh pr list --head <branch>`
- If multiple PRs or unclear, ask the user which PR to merge

2. Check PR status via `gh pr view`
- **Block** if there are unresolved review comments — report them and stop
- **Block** if CI checks are failing — report which checks failed and stop
- Report status to user before proceeding

### Phase 2: Merge PR (High Risk — Approval Gate)

1. Confirm merge target
- Verify the PR targets `dev`
- If targeting a different branch, stop and ask the user

2. Merge via `gh pr merge`
- Use the repo's default merge strategy (do not override unless user requests it)
- If merge fails (conflicts, branch protection, etc.), stop and report the error

3. Post-merge check
- Confirm the merge succeeded via `gh pr view` (should show merged state)

### Phase 3: Local Cleanup (Required)

1. Switch to dev
- `git checkout dev`

2. Pull merged changes
- `git pull origin dev` (fast-forward)
- If pull fails, stop and report

3. Delete local feature branch
- `git branch -d <branch>` (safe delete — will fail if not fully merged)
- If delete fails, report the reason and ask user

4. Confirm clean state
- `git status --short` should be clean
- `git branch` should not show the feature branch

### Phase 4: Linear Sync + Move to `Done` (Required)

1. Resolve the Linear issue
- Prefer the issue from session context or branch name
- If unclear, check the PR description for issue references
- Ask before updating if still ambiguous

2. Comment on Linear
- Include:
  - merge confirmation
  - final commit range on `dev`
  - PR URL

3. Move issue state
- Move the issue to `Done`
- Do not change assignee unless the user asks

## Human Approval Gates (Do Not Skip)

Ask for explicit approval at these points:

1. Before merging the PR (Phase 2) — always confirm, this changes shared history
2. Before deleting local branch if there are uncommitted stashes or local-only commits not in the PR

## Guardrails

- Do not merge if PR has unresolved review comments or failing CI checks
- Do not delete local branch until merge + pull are confirmed successful
- Do not update the wrong Linear issue
- Do not move to `Done` if merge actually failed
- Do not force-delete branches (`-D`) — use safe delete (`-d`) only

## Success Criteria

1. PR was merged into `dev` via `gh pr merge`
2. Local dev branch is up to date with the merged changes
3. Local feature branch was deleted
4. Linear issue was commented and moved to `Done`
