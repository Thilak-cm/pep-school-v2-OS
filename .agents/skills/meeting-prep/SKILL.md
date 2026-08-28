---
name: meeting-prep
description: Prepare a terse, evidence-backed Pep OS meeting brief with accumulated takeaway completion, Done, Being done, Next, and Talk points. Use when the user asks for meeting prep, a work update for a manager or teammate, or progress against commitments from prior meetings. Default recent-work research to the rolling past 10 days, but carry unfinished meeting takeaways forward across the full archive.
---

# Meeting Prep

Turn recent repository activity and prior meeting commitments into a compact, Rahul-facing brief the user can carry into a meeting. Gather enough evidence to distinguish shipped work from active work, calculate honest progress for every carried takeaway, make `Done` the user's main talking points, and focus the forward-looking section on explicit commitments and the user's P1-first operating priority.

## Scope

- Default time window: rolling 10 calendar days ending now. State exact dates internally while researching; do not add a scope section to the final brief.
- If the user gives dates or a relative window, use that instead and preserve the user's intended interpretation.
- Include work completed in the window and work still active now, even if it started earlier.
- The time window does **not** limit takeaway carry-forward. Scan the full meeting archive and retain every incomplete takeaway until evidence supports 100% or the user explicitly cancels/supersedes it.
- Treat the repository's canonical priority labels/fields as authoritative. For Pep OS, sort P1, P2, P3, P4, then unprioritized.

## Evidence workflow

Use the smallest authoritative source set that answers the request:

- GitHub issues, pull requests, comments, labels, and project metadata: prefer the connected GitHub app; use `gh` when needed.
- Branches, commits, divergence, and working-tree state: use local `git`.
- Current implementation and release context: use `rg`, relevant files, `CHANGELOG.md`, and version files.
- Meeting commitments: scan `meeting-docs/**/*.md` and `meeting-notes/**/*.md`, prioritizing structured `## Post-Meeting Reflection` / `### Takeaway` blocks.
- Production or run evidence: use the relevant Firebase/Cloud Function logs, run ledgers, Langfuse traces, deployed version, or other connected source when the takeaway's completion definition requires it.

Trace issue/PR → commit → current branch/code only when it changes the Done, Being done, or Next conclusion. Do not mechanically inventory every file or test result.

Separate facts from inference. Do not claim a PR is merged, an issue is closed, or a deployment happened without evidence. If a source is unavailable, use the best read-only fallback and mention the limitation only if it affects the brief.

## Takeaway carry-forward workflow

Treat the meeting archive as a commitment ledger, not another issue backlog.

1. Discover every structured takeaway across both meeting archive roots, regardless of the requested recent-work window. For legacy documents without `Post-Meeting Reflection`, only recover a takeaway when the closing recap or Next Steps explicitly records a personal commitment; do not promote every discussed idea or drafted issue.
2. Deduplicate repeated commitments across meetings. Match shared issue/PR/run/document references first, then the same normalized outcome and owner. Preserve the earliest origin date and use later meetings to refine—not duplicate—the commitment.
3. Respect additive lifecycle markers. Stop carrying a takeaway only when current evidence supports `100%`, or a meeting addition explicitly marks it cancelled, superseded, or `Carry forward: No`.
4. Recalculate the current score from live evidence on every Meeting Prep run. The archived baseline is historical context, not the current answer.
5. Inspect the evidence named by the takeaway's completion definition. A GitHub issue, priority label, or optimistic status statement alone is not proof that work is implemented or deployed.

### Completion scale

Use only these per-takeaway scores; do not invent intermediate values:

- **0% — Not started:** only the commitment exists; no substantive work evidence.
- **20% — Started:** investigation, working notes, draft specification, implementation branch, or other concrete work has begun. A title-only/triaged issue remains 0%; a substantive draft issue or partial spec may support 20%.
- **50% — Specified:** an implementation-ready plan/spec with scope, acceptance criteria, and verification approach is complete or approved, but implementation is not complete.
- **80% — Implemented, not reviewed:** the code or deliverable is substantially complete, but independent review, merge, acceptance, or equivalent gate is missing.
- **90% — Reviewed and merged, not production-verified:** implementation is reviewed and merged/accepted, but deployment, delivery, scheduled execution, or production verification is still missing.
- **100% — Complete:** specified, implemented, reviewed, merged, deployed, and verified in production. For non-code work, use the equivalent final gate: reviewed, delivered to the intended stakeholder, accepted, and usable for its stated decision.

For a composite takeaway, use the stage reached by the complete committed outcome and name unfinished subparts; do not average subtask percentages into an invented score. Score conservatively when evidence conflicts or a required source is unavailable. A closed issue or merged PR does not by itself prove 100%.

### Rollup and presentation

- Calculate an overall percentage as the arithmetic mean of the current scores for deduplicated active takeaways, rounded to the nearest whole percent.
- Show every active takeaway below 100%, even if its GitHub issue was downgraded to P2/P3/P4 or has fallen out of the recent-work window.
- Show a takeaway that newly reached 100% in the current window once, then omit it from future carry-forward unless it regresses or creates an explicit follow-up.
- Exclude cancelled or superseded takeaways from the denominator and briefly identify the replacement when relevant.
- For each score, cite one compact proof point and state the next missing gate. If evidence is unavailable, say what could not be verified and score to the highest proven gate.

## Audience filter

- Optimize for information the user can tell Rahul or use to make a meaningful product/engineering decision.
- Drop internal housekeeping that does not affect Rahul's understanding or decisions: local unpushed documentation commits, branch cleanup, routine file refreshes, and process details.
- Keep small details when they may be even slightly useful to Rahul, especially user impact, operational leverage, measurable evidence, risks, dependencies, or decisions that need alignment.
- Treat `Done` as the primary narrative, not a changelog dump. Each bullet must state the outcome and add useful supporting information: what changed, why it matters, and a concrete proof point such as release/version, user-visible behavior, operational capability, or relevant validation.
- Supporting information should remain compact—usually one sentence or a short second clause per bullet.

## P1-first Next logic

- Find open P1 issues first, then active P2/P3/P4 work that should be escalated or that blocks P1 work.
- Treat explicit incomplete takeaways as commitments above ordinary backlog sorting. They remain visible in `Next` regardless of issue priority; when a committed takeaway sits at P2/P3/P4, call out the mismatch instead of letting it disappear beneath newer issues.
- Explicitly state the priority whenever mentioning an issue or PR number, using the repository's canonical label (for example, `P1`, `P1-urgent`, `P2-high`, `P3-normal`, or `P4-low`). Never drop an issue number without its priority.
- Make the P1 basis visible in `Next`: identify which recommendations are P1 items, and describe any lower-priority item as a dependency, escalation candidate, or deferred follow-up rather than presenting it as equivalent to P1 work.
- Apply the user's operating strategy: P4 → P3, P3 → P2, P2 → P1 over time. Treat this as a recommendation framework, not permission to edit labels.
- Recommend a priority promotion only when evidence supports urgency, impact, dependency, or staleness. Keep the existing priority visible when recommending a change.
- Never change GitHub labels, project fields, issue state, branches, or code during this skill. If the user later explicitly asks to promote or update an issue, hand off to the appropriate workflow.
- On later turns, incorporate the user's choices: remove rejected items, sharpen accepted next steps, and update Talk points. Do not restart the research unless the time window or scope changed.

## Required output

Return only these five sections, in this order:

### Takeaway progress

- Start with `Overall: {N}% across {count} active takeaways`.
- List every carried incomplete takeaway compactly with its current discrete percentage, origin meeting date, strongest evidence, and next missing gate.
- Include takeaways newly completed in the current window at `100%` once.
- Keep this a progress ledger, not a second issue inventory. Link relevant issues/PRs when useful, but lead with the promised outcome.

### Done

- The user's main talking points. Group completed, merged, or released work from the window into a few outcome-focused bullets.
- Every bullet includes useful supporting information and, where available, a concrete proof point or implication for users, operations, reliability, cost, or future decisions.

### Being done

- Current work Rahul may care about: open PRs, in-progress issues, active implementation, meaningful risks, or dependencies. Include concrete status and immediate state, not a chronology. State the priority beside every issue or PR reference. Omit purely local housekeeping.

### Next

- The smallest set of Rahul-relevant recommended next actions, led by incomplete explicit takeaways and P1 issues/dependencies. Explicitly identify each issue's priority beside its link; make clear whether it is a committed takeaway, P1 work, a dependency for P1 work, or a lower-priority recommendation. Omit routine implementation/admin steps unless they require Rahul's awareness or decision.

### Talk points

- Extremely brief, terse bullets phrased as what the user can say or raise with Rahul. Derive them primarily from `Done`; do not repeat irrelevant operational housekeeping already filtered out of the brief.

Keep the final response short while listing every active takeaway. Do not add Scope, What happened, Current state, Tests, Evidence, Risks, Suggested questions, or a separate meeting summary. Do not narrate the research process. Inline links are allowed, but avoid citation-heavy prose.

## Iterative conversation

When the user gives feedback such as “drop this,” “make this the priority,” or “I’ll say this,” preserve that decision for the current conversation and regenerate only the affected sections. Keep Talk points terse enough to read aloud.
