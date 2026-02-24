---
name: git-commit-writer
description: Create and write detailed, industry-standard Git commits for the current task using staged changes and session context. Use when the user asks to commit work, draft a commit message, or avoid terse one-line commits; produces multi-line conventional-style messages that mention touched files and include a Codex signoff trailer.
---

# Git Commit Writer

## Goal

Write a real Git commit (not just a draft, unless the user asks for draft-only) for the current chat/task with a clear, multi-line commit message that explains what changed, why it changed, and which files were touched.

## Why This Skill Exists

Codex often defaults to short one-line commits. This skill standardizes a higher-signal workflow so commits are readable in history, review, and release notes without extra follow-up.

## Default Behavior

- Use current chat/session context plus the staged diff to decide the commit intent.
- Prefer Conventional Commit style (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, etc.) unless the repo uses a different convention.
- Write a multi-line message with file-level change notes.
- Add a Codex signoff trailer so AI-authored commits are obvious.
- Execute the commit non-interactively after previewing the message (unless the user explicitly asks to skip preview).

## Workflow

1. Gather commit context
- Read the current chat/task intent and recent agreed plan from session context.
- Inspect Git state:
  - `git status --short`
  - `git diff --staged --name-status`
  - `git diff --staged --stat`
  - `git diff --staged` (as needed for accurate summary)
- Prefer committing staged changes only.
- If nothing is staged:
  - Ask whether to stage files or draft-only.
  - Do not auto-stage everything unless the user asks.

2. Classify the commit
- Choose commit type and optional scope based on the session goal and staged diff.
- Write an imperative subject line, ideally <= 72 characters.
- Make the subject reflect the user-visible outcome, not just the mechanism.

3. Draft an industry-standard commit message (minimum detail requirements)
- Never write a one-line commit unless the user explicitly requests it.
- Include a body with at least 3 non-empty lines (excluding trailers).
- Mention touched files explicitly in the body.
- If many files changed, list the most important files and summarize the rest with a count.
- Wrap lines to roughly 72-100 characters for readability.

4. Required commit structure

```text
<type>(<scope>): <short imperative summary>

<Why/Outcome paragraph tied to the current chat task>

Files touched:
- path/to/file1.ext: what changed and why
- path/to/file2.ext: what changed and why
- path/to/file3.ext: what changed and why (or "+N more")

Validation:
- tests run / not run (truthful)

Co-authored-by: Codex <codex@openai>
```

Notes:
- `Files touched:` and `Validation:` may be adapted for repo conventions, but file mentions are mandatory.
- If no tests were run, say so explicitly (for example: `- not run (not requested)`).
- If the commit is a follow-up/refactor, mention what behavior is intentionally unchanged.

5. Preview, then commit
- Show the commit message to the user briefly before committing when the request is ambiguous or high-risk.
- If the user has already asked to "commit this" or equivalent, proceed after a concise preview.
- Use non-interactive commit commands (no editor prompts).
- Prefer multiple `-m` flags or a temporary file to preserve formatting.

6. Report result
- Return the commit hash and final subject line.
- Summarize the staged files included in the commit.
- Mention if any files remain unstaged/uncommitted.

## Guardrails

- Do not commit unrelated changes just because they are present in the worktree.
- If staged changes mix unrelated concerns, propose splitting into multiple commits.
- Do not claim tests were run if they were not.
- If the session context and diff conflict, ask a clarifying question before committing.
- Preserve repo commit conventions when obvious (prefix style, scope format, ticket IDs).

## Commit Type Heuristics

- `feat`: user-facing feature or behavior addition
- `fix`: bug fix or behavior correction
- `refactor`: internal code change with no intended behavior change
- `docs`: documentation-only changes
- `test`: adding/updating tests without production behavior changes
- `chore`: maintenance, tooling, config, housekeeping
- `perf`: performance improvements
- `build` / `ci`: build pipeline or CI configuration updates

## Command Reference

```bash
git status --short
git diff --staged --name-status
git diff --staged --stat
git diff --staged
git commit -m "type(scope): summary" -m "body..." -m "Co-authored-by: Codex <codex@openai>"
```

## Success Criteria

1. Commit message is multi-line (not one-line only)
2. Body explains the change in the context of the current chat/task
3. Body explicitly mentions touched files
4. Message follows repo conventions (or Conventional Commit style by default)
5. Commit is written to Git (unless user requested draft-only)
6. Commit includes Codex signoff trailer

