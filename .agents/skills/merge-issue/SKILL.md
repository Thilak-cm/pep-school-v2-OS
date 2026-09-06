---
name: merge-issue
description: "Drive a reviewed GitHub PR through CI, automated review feedback, conflict resolution, merge into dev, cleanup, and GitHub Issue completion. Use after /review-issue opens the PR."
---

# Merge Issue

## Goal

Drive a reviewed PR from open to safely merged. Owns the remote PR lifecycle: CI monitoring and fixes, review feedback, conflict resolution, merge approval, merge into `dev`, branch cleanup, GitHub Issue completion, and overview refresh.

## Workflow

### Phase 1: Identify PR and Readiness

1. Find the current branch's open PR via `gh pr list --head <branch>`; ask if unclear.
2. Read the PR's human-review risk assessment per `review-issue/references/review-risk-contract.md`. If **High** or **Critical**, call out the required oversight and require evidence of the named human review before merge; Critical also requires explicit approval from the designated approver.
3. Confirm the target branch is the intended merge target (`dev` by default).
4. Report full status (PR, risk, CI, comments, target) before proceeding.

### Phase 2: Remote CI and Reviews

1. Check `gh pr checks`. Monitor pending checks; never merge while required checks are pending or failing.
2. If checks fail: fetch logs, diagnose, apply the smallest safe fix, verify locally, commit, push, re-monitor. **Max 3 automated CI fix attempts**, then escalate.
3. Check automated and human reviews (`gh pr view`, inline comments). Block on unresolved actionable comments: show them, get approval to fix, then fix/test/push and repeat the checks.
4. Never silently dismiss review findings. Record accepted non-blocking findings in the final merge summary.

### Phase 3: Merge Conflicts (When Needed)

1. If behind `dev` or conflicted, stop and explain the state.
2. `git fetch origin dev` + `git merge origin/dev`. **No rebase or force-push by default** — ask for explicit approval if either would materially simplify resolution.
3. Resolve deliberately, preserving the issue's intended behavior; document non-obvious choices.
4. Run tests/lint/build locally, commit, push, and return to Phase 2 — CI and review checks must run again.

### Phase 4: Merge (Approval Gate)

1. Verify the PR targets `dev`; stop and ask if not.
2. **Always confirm with the user before merging** — this changes shared history.
3. Merge via `gh pr merge` with the repo's default strategy (don't override unless asked). If it fails, stop and report.
4. Confirm merged state via `gh pr view`.

### Phase 5: Local Cleanup

1. `git checkout dev` and `git pull origin dev`.
2. Delete the feature branch: local with safe `-d` (never `-D`), remote with `git push origin --delete <branch>`. Ask before deleting if there are uncommitted stashes or local-only commits not in the PR. Report any failure.
3. Confirm clean state (`git status`, no lingering local/remote branch).

### Phase 6: GitHub Sync + Done

1. Resolve the GitHub issue (session context, branch name, or PR description); ask if ambiguous — never update the wrong issue.
2. Comment with: merge confirmation, final commit range on `dev`, PR URL, version (if bumped).
3. Close the issue (`gh issue close`). If it belongs to a GitHub Project, update the Status field to `Done` via `gh project item-edit` — a closed issue does NOT prove the project field changed. If the field can't be updated, report that limitation rather than claiming it changed.
4. Don't change assignee unless asked.

### Phase 7: Cleanup + Refresh

1. Delete `.playwright-mcp/` if it exists.
2. Automatically invoke `/codebase-context-scan` to refresh the overview — no prompt needed.

## Approval Gates

1. Before fixing CI failures or review comments when the fix changes behavior or scope
2. Before merging (always)
3. Before deleting branches with unmerged local work
4. Before any rebase or force-push

## Guardrails

- Never merge with failing or pending required checks — the primary safety gate.
- Never merge with unresolved actionable review comments.
- Re-run CI/review checks after any post-review push.
- Don't delete branches until merge + pull are confirmed.
- Don't move to `Done` if the merge actually failed.
