---
name: draft-github-issues
description: Archive meeting transcripts, capture explicit carry-forward takeaways, and batch-create lightweight GitHub Issues in Backlog status. Use when the user pastes meeting notes, action items, or says "/draft-github-issues". The directory name is retained temporarily as a compatibility alias.
user_invocable: true
---

# Draft GitHub Issues from Meeting Transcripts

## Goal

Batch-triage a **full meeting transcript** (pasted from Granola or similar - not a summarized MOM) into lightweight Backlog issues. Because you have the complete conversation, extract action items, decisions, bugs, and follow-ups with rich context. Archive the transcript, capture explicit carry-forward takeaways, then walk each issue candidate through Create/Skip/Edit before writing to GitHub. Issues can later be refined via `/spec-issue`.

## Principles

- **Speed over depth** - this is triage, not refinement.
- **Very high recall** - extract every possible actionable item, even tiny ones mentioned in passing or buried in tangents. Missing an item is worse than creating one that gets skipped. When in doubt, extract it.
- **Smart aggregation** - after high-recall extraction, bundle small items that don't deserve their own issue (multiple tiny UI tweaks = one issue with a checklist). Merge clear sub-tasks into their parent feature issue.
- **Takeaways are commitments, not the issue inventory** - separately capture only tasks explicitly accepted by the user or named counterparts. These are the durable input for future `/meeting-prep` sessions.
- **Duplicate detection** - before presenting items, search existing GitHub issues (`gh issue list --search`). If a match exists, suggest augmenting it instead of creating a new one.
- **Selective with projects** - default all issues into the "Pep OS" project (#3). Only suggest a NEW project if the initiative has 5+ issues from this meeting, clear future scope, and a distinct lifecycle. Most meetings result in 0 new projects.
- Never create without showing the item first. Always one-at-a-time. Always Backlog status (not Todo - these are unrefined). Max 30 items per session.

## Context Loading

Silently read `.agents/skills/codebase-context-scan/references/pep-os-overview.md` for Area Map inference.

## Workflow

### Phase 1 - Extract Metadata

Pull best-effort from the transcript: meeting title, date, participants, source tool. Fallback: `"Untitled Meeting — {today's date}"`.

### Phase 2 - Extract Action Items

Read the entire transcript. Extract explicit action items, decisions with implied work, bugs, follow-ups, and implicit items (ideas with positive reception, problems identified without assigned next steps). Scan broadly: UI tweaks, data fixes, new pages/graphs/fields, pipeline changes, prompt updates, architecture decisions, investigation and verification tasks.

For each item, infer: **title** (imperative, <60 chars), **type/label** (`Feature`/`Bug`/`Improvement`/`Task` + priority label, default `P3-normal`), **area_tag** (from the Area Map), and a **context_snippet** (3-5 sentences capturing the reasoning, constraints, and decisions discussed - the *why*, not just the *what*).

Deduplicate. Mark ambiguous items `[?]`.

### Phase 3 - Extract Carry-Forward Takeaways

Separately identify explicit commitments by owner: concrete takeaways, promised handoffs, work a participant personally agreed to complete ("I will", "I'll send", "leave that to me"). A counterpart's request, preference, or general intent is NOT a commitment. Prefer the end-of-meeting recap for the user's commitments; scan the whole transcript for counterpart commitments.

For each takeaway capture: outcome-focused title, owner, one-sentence commitment, why it matters, expected deliverable/handoff (and recipient), tracking refs, observable completion evidence, baseline completion estimate at meeting close, exact next-meeting follow-up, and `Carry forward: Yes`.

Baseline estimates are dynamic (any whole 0-99%) based on work actually completed vs remaining. `100%` is reserved for verified completion evidence. A title-only issue is not implementation evidence.

If an owner has no explicit commitments, omit their section. If none exist at all, write `None captured.` - do not promote ordinary issue candidates into takeaways.

### Phase 4 - Seed Meeting Archive

**Before the issue walkthrough**, write the archive to `meeting-notes/{YYYY}/{YYYY-MM-DD}-{slug}.md` (kebab-case slug from title; append `-2` if the path exists).

Light redaction first: strip API keys, credentials, phone numbers, email addresses, and anything marked off-record. Do NOT redact student names, classroom names, or product context - those are needed for future issue archaeology.

Frontmatter (the retrieval surface for future agents - keep compact and complete):

```yaml
type: meeting_record
title, date (YYYY-MM-DD), participants, source
areas: [known Pep OS area tags only]
topics: [freeform kebab-case tags]
status: drafting
issue_refs: []
takeaway_count: {N}
{owner_slug}_takeaway_count: {N per owner}
```

Body sections: `## Meeting Notes / MOM`, `## Decisions`, `## Post-Meeting Reflection` (one `### {Owner}'s Explicit Takeaways` section per owner with `#### Takeaway {X}1` blocks containing the fields from Phase 3, or `None captured.`), `## Drafted Issues` (Created/Augmented/Skipped, initially "None yet."), `## Open Questions`, `## Raw Transcript` (full lightly-redacted transcript).

The transcript and reflection are the original source record. All later updates are additive (`Post-Meeting Additions`, `Clarifications`, metadata edits) - never rewrite history. Counterpart commitments remain visible until delivered and verified, cancelled, or superseded.

### Phase 5 - Summary Preview

Present takeaways first (grouped by owner, with baselines), then issue candidates grouped by project. Ask the user to correct takeaways, remove items, adjust groupings, or proceed.

Edge cases: no items found -> offer retry or manual creation; 15+ items -> offer top-10-by-priority view; non-meeting text -> flag it; all items in one project -> fine, don't force splits.

### Phase 6 - One-at-a-Time Walk

For each item show: title, type, priority, area, project, raw transcript excerpt, and context snippet. User picks **Create**, **Skip**, or **Edit** (max 3 edit rounds, then force Create or Skip).

### Phase 7 - Create Issues

For each approved item:

1. Duplicate-check via `gh issue list --search`; warn if a likely match exists.
2. Create via `gh issue create` on `Thilak-cm/pep-school-v2-OS`, assignee `@me`, type + priority labels. Body: `## Summary` (2-3 sentences with meeting context), `### Context from Discussion` (quotes, decisions, constraints, edge cases - 3-5 sentences minimum), and the footer `Source: Meeting Transcript — {meeting_title} ({meeting_date})`.
3. Add to the GitHub Project (`gh project item-add`) and set board Status to **Backlog** (`gh project item-edit`).
4. If a NEW project was approved, create it first with `gh project create` and reuse its number.
5. Confirm the created issue number.

### Phase 8 - Update Meeting Archive

After the walk, update metadata and `## Drafted Issues` only:

- `status`: `issues-drafted` if anything was created/augmented, else `archived`.
- Add issue numbers to `issue_refs`; fill Created/Augmented/Skipped bullets.
- Add walkthrough clarifications under `## Post-Meeting Additions` or `## Clarifications`.
- Add new tracking refs to takeaways without replacing original commitments or baselines. Record cancellations additively with `Carry forward: No` - never silently delete.
- Do not rewrite the raw transcript.

### Phase 9 - Final Summary

Show a summary grouped by project: issues created (number, title, priority, label, project) and skipped items. Tip: `/spec-issue` adds full detail.

## Guardrails

- Never create an issue without showing it first; always one-at-a-time; always Backlog; max 30 items.
- Seed the archive before the walkthrough; update it after.
- Preserve the `Source: Meeting Transcript — ...` marker for `/spec-issue` detection.
- Keep explicit takeaways separate from high-recall issue extraction - takeaways reflect actual commitments, not backlog volume.
- Every archive must contain `## Post-Meeting Reflection`, even if `None captured.`
- When refining an existing draft-sourced issue, direct the user to `/spec-issue`.
