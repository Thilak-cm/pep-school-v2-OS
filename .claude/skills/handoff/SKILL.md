---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up. Use when ending a session, switching context, or preparing for someone else to continue the work.
user_invocable: true
argument-hint: "What will the next session focus on?"
---

# Handoff — Session Continuity Document

## Goal

Write a handoff document summarising the current conversation so a fresh agent (or a future you) can continue the work without losing context. Save to the OS temp directory — not the workspace.

## Argument

Optional. If the user passes an argument, treat it as a description of what the next session will focus on and tailor the document accordingly.

## Workflow

### Step 1 — Gather Context

Collect from the current conversation:

1. **What was the goal?** The task or problem the user was working on.
2. **What was accomplished?** Decisions made, code written, files changed, PRs opened, issues updated.
3. **What's left?** Remaining work, known blockers, open questions.
4. **Key discoveries.** Non-obvious findings — things the next agent would waste time rediscovering.
5. **Artifacts produced.** File paths, branch names, PR URLs, issue IDs, commit hashes.

### Step 2 — Gather Project State

Also capture Pep OS-specific state that a fresh agent needs:

- **Linear issue ID** (e.g., PEP-297) and current status.
- **Which worktree/workspace** — current Conductor workspace name, port, and PR target. For this project workflow, PRs target `master` unless the user explicitly says otherwise.
- **Firebase deploy state** — were functions deployed? Any pending deploys?
- **Firestore schema changes** — did `DATA_STRUCTURE.md` need updating? Was `/check-schema-sync` run?
- **Cloud Function changes** — note that `functions/index.js` is a single ~3800-line file; mention line ranges if relevant.
- **Security rules changes** — if `firestore.rules` or `storage.rules` were touched, note the 2-get budget constraint for storage rules.

### Step 3 — Write the Document

Save to `$TMPDIR/handoff-YYYY-MM-DD-HHMMSS.md` (or platform equivalent temp dir).

Structure:

```markdown
# Handoff — {Brief Title}

**Date:** {date}
**Branch:** {current branch}
**Working directory:** {cwd}
**Linear issue:** {PEP-XXX if applicable}
**PR target:** {master}

## Context
{1-3 sentences: what the user was doing and why}

## What Was Done
{Bulleted list of concrete accomplishments — commits, file changes, decisions}

## What's Left
{Bulleted list of remaining work, in priority order}

## Key Discoveries
{Non-obvious things the next agent needs to know — gotchas, constraints, failed approaches}

## Pep OS Specifics
{Any project-specific state: schema changes, deploy status, config collection updates, security rule impacts}

## Artifacts
{Links/paths to PRs, issues, branches, files, commits — anything the next session needs to reference}

## Suggested Skills
{Skills the next agent should invoke to continue, e.g. `/implement-issue PEP-XXX`, `/review-issue`, `/merge-issue`, `/check-schema-sync`}
```

### Step 4 — Report

Tell the user the file path and give a 1-2 sentence summary of what's in it.

## Rules

- **Don't duplicate.** If something is already captured in a commit message, PR description, plan file, or issue — reference it by path/URL, don't copy the content.
- **Redact secrets.** Strip API keys, passwords, tokens, PII. Replace with `[REDACTED]`.
- **Be concise.** The handoff should be skimmable in under 60 seconds. No prose paragraphs — bullets and short sentences.
- **Temp dir only.** Never write handoff files into the workspace/repo.
- **Include branch state.** Always note if there are uncommitted changes, unpushed commits, or open PRs.
- **Use the correct PR target.** If the handoff suggests next steps involving PRs, specify the target branch explicitly. For this workflow, use `master` unless the user says otherwise.
- **No secrets in handoff.** Even though it's in temp dir, never include Firebase config values, API keys, or `.env` contents.
