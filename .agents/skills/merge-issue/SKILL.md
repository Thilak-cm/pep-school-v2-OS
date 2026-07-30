---
name: merge-issue
description: "Drive a reviewed GitHub PR through CI, automated review feedback, conflict resolution, merge into dev, cleanup, and GitHub Issue completion. Use after /review-issue opens the PR."
---

# Merge Issue

## Goal

Drive a reviewed PR from open to safely merged. This skill owns the remote PR lifecycle: CI monitoring and fixes, automated review feedback, merge-conflict resolution, final human approval, merge into `dev`, branch cleanup, GitHub Issue completion, and codebase overview refresh.

This skill covers:

1. PR readiness and risk checks
2. Remote CI and automated review loops
3. Merge-conflict resolution and re-verification
4. Merge approval and merge into `dev`
5. Branch cleanup and GitHub Issue completion
6. Codebase overview refresh

## When to Use

- A PR opened by `/review-issue` exists
- You want to land the change into `dev` with proper cleanup
- You want GitHub to reflect the completed state

## Prerequisites

- An open PR exists for the current feature branch targeting `dev`
- You know which GitHub issue this work belongs to (from session context, branch name, or PR description)

## Workflow

### Phase 1: Identify PR and Readiness (Required)

1. Identify the PR to merge
- Prefer the current branch's open PR via `gh pr list --head <branch>`
- If multiple PRs or unclear, ask the user which PR to merge

2. Read the PR's human-review risk assessment. If it is High or Critical, explicitly call out the required oversight and review focus. If it is Critical, require explicit human approval before merge.

3. Confirm the PR target branch is the intended merge target (`dev` by default).

4. Report full status to user before proceeding:
   ```
   PR #42: feat: add report generation (#60)
   Risk: High — close human review required
   CI: ⏳ being checked
   Comments: ⏳ being checked
   Target: dev
   Ready for merge checks.
   ```

### Phase 2: Remote CI and Automated Review (Required)

1. Check CI status via `gh pr checks`.
2. If checks are pending, report them and monitor until completion. Do not merge while required checks are pending.
3. If checks fail, fetch failure logs, diagnose the failure, apply the smallest safe fix, run local verification, commit, push, and re-monitor. Limit automated CI fix attempts to three before escalating.
4. Check automated and human PR reviews via `gh pr view`, `gh pr reviews`, and inline comments.
5. Block on unresolved actionable review comments. Show them to the user, get approval to fix, then fix, test, commit, push, and repeat the CI/review checks.
6. Do not silently dismiss review findings. Record accepted non-blocking findings in the final merge summary.

### Phase 3: Resolve Merge Conflicts (When Needed)

1. If GitHub reports that the branch is behind `dev` or has conflicts, stop and explain the conflict state.
2. Update the feature branch from `dev` using the repository's agreed strategy.
3. Resolve conflicts deliberately, preserving the issue's intended behavior and documenting non-obvious choices.
4. Run relevant tests, lint, and build locally.
5. Push the conflict-resolution commit and return to Phase 2. CI and review checks must run again after conflict resolution.

### Phase 4: Merge PR (High Risk — Approval Gate)

1. Confirm merge target
- Verify the PR targets `dev`
- If targeting a different branch, stop and ask the user

2. Merge via `gh pr merge`
- Use the repo's default merge strategy (do not override unless user requests it)
- If merge fails (conflicts, branch protection, etc.), stop and report the error

3. Post-merge check
- Confirm the merge succeeded via `gh pr view` (should show merged state)

### Phase 5: Local Cleanup (Required)

1. Switch to dev
- `git checkout dev`

2. Pull merged changes
- `git pull origin dev` (fast-forward)
- If pull fails, stop and report

3. Delete feature branch (local + remote)
- Local: `git branch -d <branch>` (safe delete — will fail if not fully merged)
- Remote: `git push origin --delete <branch>`
- If either delete fails, report the reason and ask user

4. Confirm clean state
- `git status --short` should be clean
- `git branch` should not show the feature branch
- `git branch -r` should not show the remote feature branch

### Phase 6: GitHub Sync + Move to `Done` (Required)

1. Resolve the GitHub issue
- Prefer the issue from session context or branch name
- If unclear, check the PR description for issue references
- Ask before updating if still ambiguous

2. Comment on GitHub
- Include:
  - merge confirmation
  - final commit range on `dev`
  - PR URL
  - version number (if version was bumped in the PR)

3. Move issue state
- Move the issue to `Done`
- Do not change assignee unless the user asks

### Phase 7: Cleanup Artifacts

Remove ephemeral artifacts that accumulate during development and testing:

1. Delete `.playwright-mcp/` directory if it exists — `rm -rf .playwright-mcp/`

### Phase 8: Codebase Overview Refresh (Automatic)

The codebase just changed. Automatically invoke the `codebase-context-scan` skill to keep the overview fresh. No user prompt needed.

## Human Approval Gates (Do Not Skip)

Ask for explicit approval at these points:

1. Before fixing CI failures or actionable review comments when the fix changes behavior or scope
2. Before merging the PR (Phase 4) — always confirm, this changes shared history
3. Before deleting local branch if there are uncommitted stashes or local-only commits not in the PR

## Guardrails

- **Do not merge if required CI checks are failing or pending** — this is the primary safety gate
- Do not merge if actionable review comments remain unresolved
- Re-run CI and review checks after conflict resolution or any post-review push
- Do not delete branches (local or remote) until merge + pull are confirmed successful
- Do not update the wrong GitHub issue
- Do not move to `Done` if merge actually failed
- Do not force-delete branches (`-D`) — use safe delete (`-d`) only

## Success Criteria

1. CI checks confirmed passing before merge
2. Automated and human review comments resolved or explicitly accepted
3. Merge conflicts resolved and re-verified if any occurred
4. PR was merged into `dev` via `gh pr merge`
5. Local dev branch is up to date with the merged changes
6. Feature branch was deleted (local + remote)
7. GitHub Issue was commented and moved to `Done`
8. `.playwright-mcp/` cleaned up if present
9. Codebase overview refreshed automatically
