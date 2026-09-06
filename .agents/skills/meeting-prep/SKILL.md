---
name: meeting-prep
description: Prepare a terse, evidence-backed Pep OS meeting brief with accumulated takeaway completion, Done, Being done, Next, and Talk points. Use when the user asks for meeting prep, a work update for a manager or teammate, or progress against commitments from prior meetings. Default recent-work research to the rolling past 10 days, but carry unfinished meeting takeaways forward across the full archive.
---

# Meeting Prep

Turn recent repository activity and prior meeting commitments into a compact, Rahul-facing brief. Distinguish shipped from active work, calculate honest progress for every carried takeaway, track Rahul's promised handoffs separately from Thilak's obligations, make `Done` the main talking points, and focus the forward view on explicit commitments and the P1-first operating priority.

## Scope

- Default window: rolling 10 calendar days ending now (use the user's dates if given). Include work completed in the window and work still active now, even if started earlier. Don't add a scope section to the brief.
- The window does NOT limit takeaway carry-forward: scan the full meeting archive and retain every incomplete takeaway until evidence supports 100% or the user cancels/supersedes it.
- Priority labels are authoritative: P1, P2, P3, P4, then unprioritized.

## Evidence

Use the smallest authoritative source set: GitHub (issues/PRs/labels/projects via app or `gh`), local `git`, current code/CHANGELOG/version files, meeting archives (`meeting-docs/**/*.md` and `meeting-notes/**/*.md` - prioritize `## Post-Meeting Reflection`, owner headings, `#### Takeaway` blocks), and production evidence (Firebase logs, Langfuse, deployed version) when a takeaway's completion definition requires it.

Separate facts from inference. Never claim merged/closed/deployed without evidence. If a source is unavailable, use the best read-only fallback and mention the limitation only if it affects the brief.

## Takeaway Carry-Forward

The meeting archive is a commitment ledger, not another backlog. Structured reflection fields (owner, commitment, boundary, completion evidence, dependency, follow-up) are authoritative - use the raw transcript only for missing fields or genuine contradictions. Never silently reassign or broaden a commitment.

1. Discover every structured takeaway across both archive roots regardless of the time window, preserving named owners. For legacy docs without reflections, recover a takeaway only when the transcript explicitly records that participant accepting the work.
2. Deduplicate across meetings: match owner + shared refs first, then owner + normalized outcome. Keep the earliest origin date; later meetings refine, not duplicate. Same outcome with different owners may be linked dependencies, not duplicates.
3. Stop carrying only at verified 100%, or an explicit cancellation/supersession/`Carry forward: No` marker.
4. **Recalculate scores from live evidence on every run.** Derive the estimate independently before comparing with the archived baseline - the baseline explains movement, never anchors the score.
5. Inspect the evidence named by the completion definition. An issue, label, or optimistic status statement is not proof of implementation or deployment.
6. For Rahul-owned commitments, check whether the promised artifact/handoff actually exists in the named evidence source. Don't infer delivery from Thilak starting dependent work. Keep unverified promises active with the archived next-meeting follow-up.

### Completion estimation

Estimate dynamically: any whole 0-99% that best represents verified work done vs real work remaining. No fixed stage-to-percentage bands, no anchoring to round numbers. Build a task-specific estimate from the takeaway's own completion definition: identify components and the final verification condition, determine what's complete/partial/blocked/untouched from evidence, and weight by actual scope and importance.

**100% is the only hard gate:** every recorded completion condition satisfied and verified. A closed issue, merged PR, or deployment alone never overrides the recorded definition of done. For composite takeaways, estimate weighted progress and name unfinished subparts. When evidence conflicts, state the uncertainty and score defensibly below 100%.

### Rollup and presentation

- Separate owner rollups (arithmetic mean of that owner's deduplicated active takeaway scores, rounded) - Rahul's work never affects Thilak's percentage.
- Show every active takeaway below 100% even if its issue was downgraded or fell out of the window. Show newly-completed takeaways at 100% once, then drop them.
- Exclude cancelled/superseded from the denominator; briefly note replacements.
- Per score: one compact proof point and the next missing gate. If evidence is unavailable, say what couldn't be verified and score to the highest proven gate.
- For Rahul-owned items: state the promised handoff, whether Thilak received it, and the archived follow-up question. Carry every unfinished Rahul item into `Talk points` until delivered, cancelled, or superseded.

## Audience Filter

Optimize for what the user can tell Rahul or use for a product/engineering decision. Drop internal housekeeping (local doc commits, branch cleanup, process details). Keep small details with any Rahul-relevance: user impact, operational leverage, evidence, risks, dependencies, decisions needing alignment. `Done` is the primary narrative, not a changelog dump - each bullet states the outcome plus one compact proof point (release/version, user-visible behavior, validation).

## P1-first Next Logic

- Lead with open P1 issues, then lower-priority work that blocks P1 or should be escalated.
- Explicit incomplete takeaways rank above ordinary backlog sorting - they stay visible in `Next` regardless of issue priority; call out priority mismatches instead of letting commitments disappear.
- Thilak-owned actions go in `Next`; Rahul-owned deliverables go in the Rahul subsection of `Takeaway progress` and as direct asks in `Talk points`.
- **Always state the priority label beside every issue/PR number.** Identify whether each recommendation is a committed takeaway, P1 work, a P1 dependency, or a lower-priority item.
- Apply the escalation strategy (P4->P3->P2->P1 over time) as a recommendation framework only - recommend promotions only with evidence of urgency/impact/dependency/staleness, keeping the existing priority visible. **Never change labels, fields, state, branches, or code during this skill.**

## Required Output

Only these five sections, in order:

1. **Takeaway progress** - `Thilak: {N}% across {count} active takeaways` (and Rahul's line if applicable), then per-owner subgroups listing every carried takeaway: current %, origin date, strongest evidence, promised handoff, largest gap. A progress ledger, not an issue inventory.
2. **Done** - the main talking points: outcome-focused bullets with proof points.
3. **Being done** - current work Rahul may care about: open PRs, in-progress issues, risks, dependencies, with priorities. No chronology, no housekeeping.
4. **Next** - the smallest set of recommended actions, led by incomplete takeaways and P1 items, each labeled by type and priority.
5. **Talk points** - terse bullets the user can say aloud, derived from `Done`, plus one direct follow-up per unfinished Rahul commitment.

Keep it short while listing every active takeaway. No Scope/Evidence/Risks/Tests sections, no research narration, no citation-heavy prose.

## Iteration

On feedback ("drop this", "make this the priority", "I'll say this"), preserve the decision and regenerate only affected sections. Don't restart research unless the window or scope changed.
