---
name: meeting-prep
description: Prepare a terse, evidence-backed Pep OS meeting brief with accumulated takeaway completion, Done, Being done, Next, and Talk points. Use when the user asks for meeting prep, a work update for a manager or teammate, or progress against commitments from prior meetings. Default recent-work research to the rolling past 10 days, but carry unfinished meeting takeaways forward across the full archive.
---

# Meeting Prep

Turn recent repository activity and prior meeting commitments into a compact, Rahul-facing brief the user can carry into a meeting. Gather enough evidence to distinguish shipped work from active work, calculate honest progress for every carried takeaway, track Rahul's promised handoffs separately from the user's obligations, make `Done` the user's main talking points, and focus the forward-looking section on explicit commitments and the user's P1-first operating priority.

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
- Meeting commitments: scan `meeting-docs/**/*.md` and `meeting-notes/**/*.md`, prioritizing structured `## Post-Meeting Reflection`, owner headings such as `### Thilak's Explicit Takeaways`, and `#### Takeaway` blocks.
- Production or run evidence: use the relevant Firebase/Cloud Function logs, run ledgers, Langfuse traces, deployed version, or other connected source when the takeaway's completion definition requires it.

Trace issue/PR → commit → current branch/code only when it changes the Done, Being done, or Next conclusion. Do not mechanically inventory every file or test result.

Separate facts from inference. Do not claim a PR is merged, an issue is closed, or a deployment happened without evidence. If a source is unavailable, use the best read-only fallback and mention the limitation only if it affects the brief.

## Takeaway carry-forward workflow

Treat the meeting archive as a commitment ledger, not another issue backlog.

When a structured reflection exists, treat its owner, commitment, responsibility boundary, completion evidence, dependency, and next-meeting follow-up fields as authoritative. Use the raw transcript only to resolve a missing field or a genuine contradiction; do not silently reassign or broaden a commitment by reinterpreting the conversation.

1. Discover every structured takeaway across both meeting archive roots, regardless of the requested recent-work window. Preserve its named owner. For legacy documents without `Post-Meeting Reflection`, only recover a takeaway when the closing recap or transcript explicitly records that participant accepting the work; do not promote every discussed idea or drafted issue.
2. Deduplicate repeated commitments across meetings. Match owner plus shared issue/PR/run/document references first, then the same normalized outcome and owner. Preserve the earliest origin date and use later meetings to refine—not duplicate—the commitment. Similar outcomes with different owners may be linked dependencies, not duplicates.
3. Respect additive lifecycle markers. Stop carrying a takeaway only when current evidence supports `100%`, or a meeting addition explicitly marks it cancelled, superseded, or `Carry forward: No`.
4. Recalculate the current score from live evidence on every Meeting Prep run. Derive the estimate independently before comparing it with the archived baseline; use the baseline only to explain movement afterward, never as an anchor or default current score.
5. Inspect the evidence named by the takeaway's completion definition. A GitHub issue, priority label, or optimistic status statement alone is not proof that work is implemented or deployed.
6. For Rahul-owned commitments, inspect whether the promised artifact or handoff exists in the repository, GitHub, Brain, Langfuse, meeting additions, or other named evidence source. Do not infer delivery from Thilak beginning dependent engineering work. Keep an unverified promise active and formulate the exact follow-up from the archived `Next-meeting follow-up` field.

### Completion estimation

Estimate progress dynamically. Any whole percentage from `0%` through `99%` is valid when it best represents the verified work completed versus the real work remaining. Do not map workflow stages to fixed percentages or anchor scores to a small set of round numbers.

Build a task-specific estimate from the takeaway's own completion definition:

- identify its meaningful components, dependencies, and final verification condition;
- determine which components are complete, partial, blocked, or untouched from current evidence;
- weight components by their actual scope, difficulty, and importance rather than counting each one equally;
- account for remaining implementation, review, integration, delivery/deployment, and verification work only to the extent each applies to this task;
- use a specific percentage that communicates the best current estimate, then state the strongest proof point and the largest remaining gap.

Specification, implementation, review, merge, deployment, run execution, and stakeholder delivery are evidence inputs—not fixed scoring bands. A substantial spec for a small task may represent more progress than the same spec for a large system. Likewise, a merged change may still have meaningful production work remaining.

`100%` is the only hard gate. Assign it only when every completion condition recorded for the takeaway—the user's definition of done—has been satisfied and verified. If any defined condition is missing or cannot be verified, score below `100%` and identify the gap. A closed issue, merged PR, deployment, or optimistic status statement alone never overrides the recorded definition of done.

For composite takeaways, estimate the weighted progress of the whole committed outcome and name unfinished subparts. When evidence is incomplete or conflicting, state the uncertainty and make the most defensible estimate below `100%`; do not fall back to a canned stage percentage.

### Rollup and presentation

- Calculate separate owner rollups so Rahul's work never inflates or reduces Thilak's completion percentage. For each owner, use the arithmetic mean of that owner's deduplicated active takeaway scores, rounded to the nearest whole percent.
- Show every active takeaway below 100%, even if its GitHub issue was downgraded to P2/P3/P4 or has fallen out of the recent-work window.
- Show a takeaway that newly reached 100% in the current window once, then omit it from future carry-forward unless it regresses or creates an explicit follow-up.
- Exclude cancelled or superseded takeaways from the denominator and briefly identify the replacement when relevant.
- For each score, cite one compact proof point and state the next missing gate. If evidence is unavailable, say what could not be verified and score to the highest proven gate.
- For Rahul-owned takeaways, also state the promised handoff, whether Thilak has received it, and the archived next-meeting question. Carry every unfinished Rahul item into `Talk points` as an explicit follow-up until it is delivered, cancelled, or superseded.

## Audience filter

- Optimize for information the user can tell Rahul or use to make a meaningful product/engineering decision.
- Drop internal housekeeping that does not affect Rahul's understanding or decisions: local unpushed documentation commits, branch cleanup, routine file refreshes, and process details.
- Keep small details when they may be even slightly useful to Rahul, especially user impact, operational leverage, measurable evidence, risks, dependencies, or decisions that need alignment.
- Treat `Done` as the primary narrative, not a changelog dump. Each bullet must state the outcome and add useful supporting information: what changed, why it matters, and a concrete proof point such as release/version, user-visible behavior, operational capability, or relevant validation.
- Supporting information should remain compact—usually one sentence or a short second clause per bullet.

## P1-first Next logic

- Find open P1 issues first, then active P2/P3/P4 work that should be escalated or that blocks P1 work.
- Treat explicit incomplete takeaways as commitments above ordinary backlog sorting. They remain visible in `Next` regardless of issue priority; when a committed takeaway sits at P2/P3/P4, call out the mismatch instead of letting it disappear beneath newer issues.
- Put implementation actions owned by Thilak in `Next`. Put Rahul-owned deliverables in the Rahul subsection of `Takeaway progress` and as direct asks in `Talk points`; do not disguise another person's obligation as Thilak's next engineering task.
- Explicitly state the priority whenever mentioning an issue or PR number, using the repository's canonical label (for example, `P1`, `P1-urgent`, `P2-high`, `P3-normal`, or `P4-low`). Never drop an issue number without its priority.
- Make the P1 basis visible in `Next`: identify which recommendations are P1 items, and describe any lower-priority item as a dependency, escalation candidate, or deferred follow-up rather than presenting it as equivalent to P1 work.
- Apply the user's operating strategy: P4 → P3, P3 → P2, P2 → P1 over time. Treat this as a recommendation framework, not permission to edit labels.
- Recommend a priority promotion only when evidence supports urgency, impact, dependency, or staleness. Keep the existing priority visible when recommending a change.
- Never change GitHub labels, project fields, issue state, branches, or code during this skill. If the user later explicitly asks to promote or update an issue, hand off to the appropriate workflow.
- On later turns, incorporate the user's choices: remove rejected items, sharpen accepted next steps, and update Talk points. Do not restart the research unless the time window or scope changed.

## Required output

Return only these five sections, in this order:

### Takeaway progress

- Start with `Thilak: {N}% across {count} active takeaways`.
- If Rahul has active or newly completed commitments, follow with `Rahul: {N}% across {count} active takeaways`.
- Under compact owner subgroups, list every carried incomplete takeaway with its current dynamically estimated percentage, origin meeting date, strongest evidence, promised handoff, and largest remaining gap.
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

- Extremely brief, terse bullets phrased as what the user can say or raise with Rahul. Derive them primarily from `Done`, then append one direct follow-up for every unfinished Rahul-owned commitment using the archived next-meeting question. Do not repeat irrelevant operational housekeeping already filtered out of the brief.

Keep the final response short while listing every active takeaway. Do not add Scope, What happened, Current state, Tests, Evidence, Risks, Suggested questions, or a separate meeting summary. Do not narrate the research process. Inline links are allowed, but avoid citation-heavy prose.

## Iterative conversation

When the user gives feedback such as “drop this,” “make this the priority,” or “I’ll say this,” preserve that decision for the current conversation and regenerate only the affected sections. Keep Talk points terse enough to read aloud.
