---
name: merge-issue
description: "Merge a reviewed PR into dev via gh pr merge, clean up local and remote branches, move Linear issue to Done, and prompt for codebase overview refresh. Use after CI passes on a PR opened by /review-issue."
---

# Merge Issue

## Goal

Land a reviewed PR into `dev`, clean up branches, close out the Linear issue, and keep the codebase overview fresh. This is the final step after `/review-issue` opens a PR and CI passes.

This skill covers:

1. Pre-merge checks (CI status, unresolved comments)
2. Merge the PR via `gh pr merge`
3. Local branch cleanup (checkout dev, pull, delete feature branch)
4. Update the Linear issue and move it to `Done`
5. Prompt to refresh the codebase overview

## When to Use

- A PR opened by `/review-issue` has passed CI
- You want to land the change into `dev` with proper cleanup
- You want Linear to reflect the completed state

## Prerequisites

- An open PR exists for the current feature branch targeting `dev`
- CI checks have passed (this skill enforces this)
- You know which Linear issue this work belongs to (from session context, branch name, or PR description)

## Workflow

### Phase 1: Pre-Merge Checks (Required)

1. Identify the PR to merge
- Prefer the current branch's open PR via `gh pr list --head <branch>`
- If multiple PRs or unclear, ask the user which PR to merge

2. **Check CI status via `gh pr checks`**
- **Block** if any checks are **failing** — report which checks failed and stop
- **Block** if any checks are **pending** — report and ask user whether to wait or proceed
- Only proceed when all checks are passing

3. Check for unresolved review comments via `gh pr view`
- **Block** if there are unresolved review comments — report them and stop

4. Report full status to user before proceeding:
   ```
   PR #42: feat: add report generation (PEP-60)
   CI: ✅ all checks passing
   Comments: ✅ none unresolved
   Target: dev
   Ready to merge.
   ```

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

3. Delete feature branch (local + remote)
- Local: `git branch -d <branch>` (safe delete — will fail if not fully merged)
- Remote: `git push origin --delete <branch>`
- If either delete fails, report the reason and ask user

4. Confirm clean state
- `git status --short` should be clean
- `git branch` should not show the feature branch
- `git branch -r` should not show the remote feature branch

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
  - version number (if version was bumped in the PR)

3. Move issue state
- Move the issue to `Done`
- Do not change assignee unless the user asks

### Phase 5: Cleanup Artifacts

Remove ephemeral artifacts that accumulate during development and testing:

1. Delete `.playwright-mcp/` directory if it exists — `rm -rf .playwright-mcp/`

### Phase 6: Codebase Overview Refresh (Automatic)

The codebase just changed. Automatically invoke the `codebase-context-scan` skill to keep the overview fresh. No user prompt needed.

## Human Approval Gates (Do Not Skip)

Ask for explicit approval at these points:

1. Before merging the PR (Phase 2) — always confirm, this changes shared history
2. Before deleting local branch if there are uncommitted stashes or local-only commits not in the PR

## Guardrails

- **Do not merge if CI checks are failing or pending** — this is the primary safety gate
- Do not merge if PR has unresolved review comments
- Do not delete branches (local or remote) until merge + pull are confirmed successful
- Do not update the wrong Linear issue
- Do not move to `Done` if merge actually failed
- Do not force-delete branches (`-D`) — use safe delete (`-d`) only

## Success Criteria

1. CI checks confirmed passing before merge
2. PR was merged into `dev` via `gh pr merge`
3. Local dev branch is up to date with the merged changes
4. Feature branch was deleted (local + remote)
5. Linear issue was commented and moved to `Done`
6. `.playwright-mcp/` cleaned up if present
7. Codebase overview refreshed automatically
