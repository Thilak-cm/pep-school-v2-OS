---
name: draft-linear-issues
description: Parse meeting notes and batch-create lightweight Linear Backlog issues. Use when the user pastes meeting notes, action items, or says "/draft-linear-issues".
user_invocable: true
---

# Draft Linear Issues from Meeting Notes

## Goal

Batch-triage meeting notes into lightweight Backlog issues. Extract action items, decisions, bugs, and follow-ups, then walk through each one for quick Create/Skip/Edit before writing to Linear. Any issue can later be promoted via `/create-linear-issue`.

## Principles

- Speed over depth — this is triage, not refinement
- Never create without showing the item first
- Always one-at-a-time (no batch-create)
- Always Backlog state (not Todo — these are unrefined)
- Max 30 items per session

## Context Loading

Silently read `.claude/skills/codebase-context-scan/references/pep-os-overview.md` for Area Map inference. Do **not** load deep-dives — that is `/create-linear-issue`'s job during refinement.

## Workflow

### Phase 1 — Acquire Notes

Accept pasted meeting notes text. The user may pass it as an argument or in a follow-up message. No specific format is required — handle bullet lists, numbered lists, free-form prose, app exports (e.g. Granola, Otter), or any meeting notes format.

### Phase 2 — Extract Meeting Metadata

Pull from the notes (best-effort):
- **Meeting title** (heading, subject line, or first prominent phrase)
- **Date** (any date found in the text)
- **Participants** (names mentioned as attendees)

Fallback: `"Untitled Meeting — {today's date}"`.

### Phase 3 — Extract Action Items

Parse the notes for actionable items using these signal patterns:

- **Explicit action items:** "Action:", "TODO:", "[ ]", "will do", "needs to", "should", "must"
- **Decisions with implied work:** "We decided to...", "Agreed to...", "Going to..."
- **Bugs:** "broken", "not working", "regression", "fix needed", "bug"
- **Follow-ups:** "Follow up on...", "Circle back to...", "Revisit...", "Check with..."
- **Next steps:** numbered lists under "Next steps:" sections, "plan to..."

For each item, infer:
- **title**: imperative voice, under 60 characters
- **type**: `Feature` / `Bug` / `Improvement` / `Task` (maps to Linear labels)
- **priority**: default Normal (3) unless language suggests urgency
- **label**: matching Linear label name
- **area_tag(s)**: inferred from the overview Area Map
- **context_snippet**: 1-3 sentences of surrounding text that explains the item

Deduplicate similar items. Mark ambiguous items with `[?]`.

### Phase 4 — Summary Preview

Present a numbered list of all extracted items:

```
Found {N} items from "{meeting_title}" ({meeting_date}):

 #  Title                                    Type         Priority
 1  Add parent monthly summary page          Feature      Normal
 2  Fix broken voice recording on Android    Bug          High
 3  Revisit coach prompt wording             Improvement  Normal
    ...
```

Ask the user: "Remove any items by number, or proceed to walk-through?"

Handle edge cases:
- **No items found:** Offer to retry with different parsing, or suggest `/create-linear-issue` for a single issue.
- **15+ items:** Offer to show top 10 by priority or group by area first.
- **Non-meeting text detected** (no actionable signals found): Flag it and suggest the user paste actual meeting notes or use `/create-linear-issue` instead.

### Phase 5 — One-at-a-Time Walk

For each remaining item, present:

```
Item {n}/{total}

  Title:    {title}
  Type:     {type}
  Priority: {priority}
  Area:     {area_tag}
  Raw text: "{original excerpt}"
  Context:  {context_snippet}
```

User picks one of:
- **Create** — make the issue immediately (proceed to Phase 6)
- **Skip** — move to the next item
- **Edit** — adjust title, type, priority, area, or context (max 3 edit rounds per item, then force Create or Skip)

### Phase 6 — Create Linear Issue

For each approved item:

1. **Duplicate check:** Call `list_issues(query: "<key terms from title>")` and scan recent results. If a likely duplicate exists, warn the user and let them decide to proceed or skip.

2. **Create the issue** with:
   - **Team:** Pep school v2 os
   - **State:** Backlog
   - **Assignee:** `me`
   - **Priority:** as confirmed (1=Urgent, 2=High, 3=Normal, 4=Low)
   - **Labels:** as confirmed (Feature, Bug, Improvement, or Task)
   - **Title:** as confirmed
   - **Description:**
     ```markdown
     ## Summary
     {1-2 sentences expanding the title with meeting context}

     ### Context
     {context snippet from meeting notes}

     ---
     Source: Meeting Notes — {meeting_title} ({meeting_date})
     ```

3. Confirm creation and show the issue identifier.

### Phase 7 — Final Summary

After all items are processed, show a summary table:

```
Created Issues:
  ID       Title                                    Priority   Label
  PEP-42   Add parent monthly summary page          Normal     Feature
  PEP-43   Fix broken voice recording on Android    High       Bug

Skipped:
  - Revisit coach prompt wording
  - ...

Tip: Run /create-linear-issue on any of these to add full detail.
```

## Guardrails

- Never create an issue without showing the item to the user first.
- Always walk through items one-at-a-time — no batch-create.
- Always use Backlog state — never Todo (these are unrefined).
- Do not load deep-dive references — speed is the priority.
- Max 30 items per session. If more are extracted, warn and truncate.
- Preserve the `Source: Meeting Notes — ...` marker in every description for downstream detection by `/create-linear-issue`.
- When refining an existing draft-sourced issue, direct the user to `/create-linear-issue` instead.
