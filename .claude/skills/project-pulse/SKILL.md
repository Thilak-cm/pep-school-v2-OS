---
name: project-pulse
description: Get a quick overview of a Linear project — stats, state breakdown, recent activity, and suggested next issues. Use when the user wants to catch up on a project, check project status, or says "/project-pulse".
user_invocable: true
---

# Project Pulse — Linear Project Overview

## Goal

Give the user a fast, opinionated catch-up on a Linear project: what's the current state, what happened recently, and what should they pick up next.

## Argument

Requires a Linear project name or identifier as argument (e.g., `AI Interview System` or a project slug). If not provided, list recent projects via `list_projects(team: "Pep school v2 os", limit: 10)` and ask the user to pick one.

## Workflow

### Phase 1 — Load Project & Issues

1. **Find the project.** Call `get_project(query: "<argument>", includeMilestones: true, includeMembers: true)`.
   - If no match, try `list_projects(team: "Pep school v2 os", query: "<argument>")` for fuzzy match.
   - If still no match, show available projects and ask the user to pick.

2. **Fetch all issues in the project.** Call `list_issues(project: "<project name>", limit: 250, includeArchived: false)`.
   - If there's a cursor (>250 issues), fetch the next page too.

3. **Fetch issue statuses.** Call `list_issue_statuses(team: "Pep school v2 os")` to map state IDs to names and categories.

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

Show each as a compact line: `PEP-42  Title here  (Priority, Assignee)`

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
  1. PEP-42  Title here
     Why: High priority, in Todo, blocks PEP-45
```

### Phase 4 — Present the Report

Render the report as an **HTML artifact** (see `.claude/shared/html-artifacts.md`).

**What goes in the HTML file (`pulse-{project-slug}.html`):**
- Header: project name, description, generation date
- **Stat cards** (use the Stat Cards pattern): one card per status category (Done, In Progress, Todo, Backlog) with count and color-coded left border
- **Progress bar**: visual fill bar showing % complete, with label below
- **Priority distribution** (only if interesting): simple horizontal stacked bar or pills
- **Recent Activity table** (use activity-table pattern): rows with status dots (green=done, blue=in progress, amber=todo), issue ID, title, assignee — grouped by activity type (Completed, In Flight, Newly Created)
- **Stale Work** section: flagged issues with red status dots, or "None" message
- **Suggested Next** section (use suggestion-card pattern): ranked cards with number badge, issue title, and "Why" reasoning

**What goes in the terminal:**
- 1-line summary: "{Project Name} — {progress}% complete, {in-flight} in flight, {stale} stale."
- File path: "Dashboard: `.claude/artifacts/pulse-{project-slug}.html`"
- `open .claude/artifacts/pulse-{project-slug}.html`

**Small project exception:** If the project has fewer than 8 issues total, skip the HTML artifact and output the report as terminal markdown instead — it's not data-dense enough to justify a separate file.

## Guardrails

- This is read-only — never modify issues, states, or assignments.
- Keep the output concise and scannable. No walls of text.
- If a project has 0 issues, say so and suggest the user may want `/draft-linear-issues` to populate it.
- If a project is 100% done, congratulate and note it. No suggestions needed.
- Don't speculate about issue content — only report what's in Linear.
