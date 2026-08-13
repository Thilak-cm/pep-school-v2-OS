---
name: meeting-prep
description: Prepare a terse, evidence-backed meeting brief about recent Pep OS work. Use when the user asks for meeting prep, a work update for a manager or teammate, or a concise Done/Being done/Next/Talk points summary. Default to the rolling past 10 days; accept an explicit time window. Inspect Git history, branches, current code, changelog, GitHub issues, pull requests, and related metadata. Keep next steps P1-led and refine them through user back-and-forth.
---

# Meeting Prep

Turn recent repository activity into a compact brief the user can carry into a meeting. This is a meeting-oriented variant of `catch-me-up`: gather enough evidence to distinguish shipped work from active work, then focus the forward-looking section on the user's P1-first operating priority.

## Scope

- Default time window: rolling 10 calendar days ending now. State exact dates internally while researching; do not add a scope section to the final brief.
- If the user gives dates or a relative window, use that instead and preserve the user's intended interpretation.
- Include work completed in the window and work still active now, even if it started earlier.
- Treat the repository's canonical priority labels/fields as authoritative. For Pep OS, sort P1, P2, P3, P4, then unprioritized.

## Evidence workflow

Use the smallest authoritative source set that answers the request:

- GitHub issues, pull requests, comments, labels, and project metadata: prefer the connected GitHub app; use `gh` when needed.
- Branches, commits, divergence, and working-tree state: use local `git`.
- Current implementation and release context: use `rg`, relevant files, `CHANGELOG.md`, and version files.

Trace issue/PR → commit → current branch/code only when it changes the Done, Being done, or Next conclusion. Do not mechanically inventory every file or test result.

Separate facts from inference. Do not claim a PR is merged, an issue is closed, or a deployment happened without evidence. If a source is unavailable, use the best read-only fallback and mention the limitation only if it affects the brief.

## P1-first Next logic

- Find open P1 issues first, then active P2/P3/P4 work that should be escalated or that blocks P1 work.
- Apply the user's operating strategy: P4 → P3, P3 → P2, P2 → P1 over time. Treat this as a recommendation framework, not permission to edit labels.
- Recommend a priority promotion only when evidence supports urgency, impact, dependency, or staleness. Keep the existing priority visible when recommending a change.
- Never change GitHub labels, project fields, issue state, branches, or code during this skill. If the user later explicitly asks to promote or update an issue, hand off to the appropriate workflow.
- On later turns, incorporate the user's choices: remove rejected items, sharpen accepted next steps, and update Talk points. Do not restart the research unless the time window or scope changed.

## Required output

Return only these four sections, in this order:

### Done

- Completed, merged, or released work from the window, grouped into a few outcome-focused bullets.

### Being done

- Current branches, open PRs, in-progress issues, or active implementation. Include concrete status and immediate state, not a chronology.

### Next

- The smallest set of recommended next actions, led by P1 issues and dependencies. Include issue/PR links inline when useful.

### Talk points

- Extremely brief, terse bullets phrased as what the user can say or raise in the meeting, especially with Rahul.

Keep the final response short. Do not add Scope, What happened, Current state, Tests, Evidence, Risks, Suggested questions, or a separate meeting summary. Do not narrate the research process. Inline links are allowed, but avoid citation-heavy prose.

## Iterative conversation

When the user gives feedback such as “drop this,” “make this the priority,” or “I’ll say this,” preserve that decision for the current conversation and regenerate only the affected sections. Keep Talk points terse enough to read aloud.
