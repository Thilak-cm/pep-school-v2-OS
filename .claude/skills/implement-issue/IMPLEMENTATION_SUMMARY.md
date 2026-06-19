# Implement Issue Split Summary

`/implement-issue` has been split into two commands:

- `/plan-issue` selects or loads a Linear issue, gathers Pep OS context, compares implementation options, maps acceptance criteria to tests, runs baseline discovery, and writes an approved plan to `.context/issue-plans/PEP-{id}.md`.
- `/implement-issue` consumes that approved plan, implements with TDD, commits, pushes the branch, opens a PR against `master`, monitors CI, and runs a CI diagnose/fix loop when checks fail.

## Files Added

- `.claude/skills/plan-issue/SKILL.md`
- `.claude/skills/plan-issue/agents/openai.yaml`
- `.claude/agents/ci-diagnostician.md`

## Files Updated

- `.claude/skills/implement-issue/SKILL.md`
- `.claude/skills/implement-issue/agents/openai.yaml`
- `.claude/README.md`

## Workflow

```text
/plan-issue PEP-123
  -> .context/issue-plans/PEP-123.md

/implement-issue PEP-123
  -> TDD implementation
  -> local verification
  -> commit + push
  -> PR against master
  -> CI monitor
  -> if CI fails:
       ci-diagnostician subagent
       code-fixer subagent
       commit + push
       repeat up to 3 repair iterations
```

## Branching

Conductor workspaces already provide task branches. The implementation workflow does not rename the current branch. It uses the current workspace branch when appropriate, and only creates a `PEP-{id}-{slug}` branch when the agent is accidentally on `master`, `main`, or `dev`.

## Target Branch

This project workflow opens PRs against `master` and uses `origin/master` for diffs.
