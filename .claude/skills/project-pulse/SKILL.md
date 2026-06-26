---
name: project-pulse
description: Get a quick overview of a GitHub Project — stats, state breakdown, recent activity, and suggested next issues. Use when the user wants to catch up on a project, check project status, or says "/project-pulse".
user_invocable: true
---

# Project Pulse — GitHub Project Overview

## Goal

Give the user a fast, opinionated catch-up on a GitHub Project: what's the current state, what happened recently, and what should they pick up next.

## Argument

Requires a GitHub Project name or identifier as argument (e.g., `AI Interview System` or a project slug). If not provided, list recent projects via ``gh project list --owner Thilak-cm`` and ask the user to pick one.

## Workflow

### Phase 1 — Load Project & Issues

1. **Find the project.** Run `gh project list --owner Thilak-cm --format json` and match by name.
   - If no match, show available projects and ask the user to pick.

2. **Fetch all issues in the project.** Run `gh project item-list <number> --owner Thilak-cm --limit 500 --format json`.

3. **Fetch issue details.** For each item, run `gh issue view <number> --repo Thilak-cm/pep-school-v2-OS --json state,labels,assignees,updatedAt,createdAt,title,number,milestone` as needed.

### Phase 2 — Analyse & Compute Stats

From the fetched issues, compute:

#### Status Breakdown
Count issues by status category (Backlog, Todo, In Progress, In Review, Done, Cancelled). Show as a simple table:

```
Status        Count   (%)
─────────────────────────
Backlog         12   (40%)
Todo             5   (17%)
In Progress      2    (7%)
In Review        1    (3%)
Done             8   (27%)
Cancelled        2    (7%)
─────────────────────────
Total           30
```

#### Priority Distribution
Count by priority (Urgent / High / Normal / Low / None). Only show if there's meaningful variance — skip if everything is Normal.

#### Progress Score
Calculate: `Done / (Total - Cancelled) * 100`. Show as a one-liner like:
```
Progress: 29% complete (8/28 non-cancelled issues done)
```

#### Recent Activity (last 14 days)
List issues updated in the last 14 days, grouped by what happened:
- **Completed recently:** issues moved to Done
- **In flight:** issues currently In Progress or In Review
- **Newly created:** issues created in the last 14 days

Show each as a compact line: `#42  Title here  (Priority, Assignee)`

#### Stale Work
Flag any issues that are In Progress or In Review but haven't been updated in >7 days. These are potential blockers or abandoned work.

### Phase 3 — Suggest Next Issues

Recommend 3-5 issues the user should tackle next, using this priority logic:

1. **Unblock first:** Issues In Review (need merging/feedback) or stale In Progress (need attention)
2. **High priority Todo:** Urgent/High priority issues in Todo state
3. **Natural sequence:** Todo issues that other issues depend on, or that logically come next based on the project's flow
4. **Quick wins:** Low-effort Backlog items that could move the progress bar

For each suggestion, show:
```
  1. #42  Title here
     Why: High priority, in Todo, blocks #45
```

### Phase 4 — Present the Report

Output everything in a single, scannable report:

```
# Project Pulse: {Project Name}

{1-2 sentence project description if available}

## Stats
{status breakdown table}
{progress score}
{priority distribution — only if interesting}

## Recent Activity (last 14 days)
{grouped activity}

## Stale Work
{flagged items, or "None — all in-flight work is active"}

## Suggested Next
{3-5 recommended issues with reasoning}
```

## Guardrails

- This is read-only — never modify issues, states, or assignments.
- Keep the output concise and scannable. No walls of text.
- If a project has 0 issues, say so and suggest the user may want `/draft-linear-issues` to populate it.
- If a project is 100% done, congratulate and note it. No suggestions needed.
- Don't speculate about issue content — only report what's in GitHub.
