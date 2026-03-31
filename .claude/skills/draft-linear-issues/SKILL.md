---
name: draft-linear-issues
description: Parse meeting notes and batch-create lightweight Linear Backlog issues. Use when the user pastes meeting notes, action items, or says "/draft-linear-issues".
user_invocable: true
---

# Draft Linear Issues from Meeting Transcripts

## Goal

Batch-triage meeting transcripts into lightweight Backlog issues **grouped under Linear Projects**. The input is a **full meeting transcript** (copy-pasted from Granola or similar tools) — not a summarized MOM. This means you have access to the complete conversation: every point discussed, nuance, context, reasoning, and back-and-forth. Extract action items, decisions, bugs, and follow-ups with **rich context** from the full conversation, group them into projects, then walk through each one for quick Create/Skip/Edit before writing to Linear. Any issue can later be refined via `/refine-linear-issue`.

## Principles

- Speed over depth — this is triage, not refinement
- **Mine the transcript deeply** — the full transcript contains far more context than a summary. Pull in reasoning, constraints, edge cases, and decisions discussed. Issue descriptions should reflect this richness.
- Never create without showing the item first
- Always one-at-a-time (no batch-create)
- Always Backlog state (not Todo — these are unrefined)
- Max 30 items per session

## Context Loading

Silently read `.claude/skills/codebase-context-scan/references/pep-os-overview.md` for Area Map inference.

## Workflow

### Phase 1 — Acquire Transcript

Accept a pasted **full meeting transcript**. The user will copy-paste the entire transcript from Granola or a similar meeting tool. This includes raw conversation, speaker turns, tangents, and all discussion — not just a cleaned-up summary. Handle any format: timestamped transcripts, speaker-labeled turns, raw text dumps, or mixed formats.

### Phase 2 — Extract Meeting Metadata

Pull from the transcript (best-effort):
- **Meeting title** (heading, subject line, or first prominent phrase)
- **Date** (any date found in the text)
- **Participants** (speaker names from the transcript)

Fallback: `"Untitled Meeting — {today's date}"`.

### Phase 3 — Extract Action Items

Read the **entire transcript** carefully. Because you have the full conversation (not a summary), you can extract items that a MOM would miss — things mentioned in passing, constraints discussed but not concluded, ideas that got verbal agreement but weren't written as action items.

Parse for actionable items using these signal patterns:

- **Explicit action items:** "Action:", "TODO:", "[ ]", "will do", "needs to", "should", "must"
- **Decisions with implied work:** "We decided to...", "Agreed to...", "Going to..."
- **Bugs:** "broken", "not working", "regression", "fix needed", "bug"
- **Follow-ups:** "Follow up on...", "Circle back to...", "Revisit...", "Check with..."
- **Next steps:** numbered lists under "Next steps:" sections, "plan to..."
- **Implicit action items from discussion:** Ideas that got positive reception ("yeah let's do that", "that makes sense"), problems identified without explicit next-step assignment, features described in detail during brainstorming

For each item, infer:
- **title**: imperative voice, under 60 characters
- **type**: `Feature` / `Bug` / `Improvement` / `Task` (maps to Linear labels)
- **priority**: default Normal (3) unless language suggests urgency
- **label**: matching Linear label name
- **area_tag(s)**: inferred from the overview Area Map
- **context_snippet**: **3-5 sentences** of context pulled from the transcript — include the reasoning, constraints, and decisions discussed around this item. This is the key advantage of having the full transcript: capture the *why* and *how*, not just the *what*.

Deduplicate similar items. Mark ambiguous items with `[?]`.

### Phase 4 — Group into Projects

Analyze the extracted items and group them into **projects** — coherent themes or initiatives that emerged from the meeting. A project groups related issues that belong to the same body of work.

**How to identify projects:**
- Major topics or themes discussed at length in the transcript
- Initiatives or feature areas that have multiple related action items
- Standalone items that don't fit a group get placed under a catch-all project named after the meeting (e.g., `"{meeting_title} — Follow-ups"`)

For each project, infer:
- **project_name**: concise, descriptive name (e.g., "AI Interview System", "Student Profile Overhaul")
- **project_description**: 2-3 sentences summarizing the initiative based on transcript context
- **items**: list of extracted items that belong to this project

**Check for existing projects:** Call `list_projects(team: "Pep school v2 os", query: "<project name keywords>")` for each proposed project. If a matching project already exists, reuse it instead of creating a new one.

### Phase 5 — Summary Preview

Present items grouped by project:

```
Found {N} items across {P} projects from "{meeting_title}" ({meeting_date}):

Project: AI Interview System (NEW)
 #  Title                                    Type         Priority
 1  Build interview inbox for teachers       Feature      Normal
 2  Add AI question generation from model    Feature      High

Project: Observation Capture (EXISTING — PEP-PRJ-12)
 3  Fix broken voice recording on Android    Bug          High
 4  Revisit coach prompt wording             Improvement  Normal

Project: {meeting_title} — Follow-ups
 5  Check with design team on mockups        Task         Normal
    ...
```

Ask the user: "Remove any items by number, adjust project groupings, or proceed to walk-through?"

Handle edge cases:
- **No items found:** Offer to retry with different parsing, or suggest creating a single issue manually in Linear.
- **15+ items:** Offer to show top 10 by priority or group by project first.
- **Non-meeting text detected** (no actionable signals found): Flag it and suggest the user paste actual meeting notes.
- **All items in one project:** That's fine — don't force artificial splits.

### Phase 6 — One-at-a-Time Walk

Walk through items **grouped by project**. Before the first item in each project group, show a project header. For each item, present:

```
Project: {project_name} ({NEW or EXISTING})
Item {n}/{total}

  Title:    {title}
  Type:     {type}
  Priority: {priority}
  Area:     {area_tag}
  Project:  {project_name}
  Raw text: "{original excerpt}"
  Context:  {context_snippet}
```

User picks one of:
- **Create** — make the issue immediately (proceed to Phase 7)
- **Skip** — move to the next item
- **Edit** — adjust title, type, priority, area, project, or context (max 3 edit rounds per item, then force Create or Skip)

### Phase 7 — Create Project (if needed) & Create Linear Issue

**7a — Ensure project exists.** Before creating the first issue in a NEW project group:

1. Call `save_project` with:
   - **name:** the confirmed project name
   - **addTeams:** `["Pep school v2 os"]`
   - **description:** project description inferred from transcript
   - **lead:** `me`
2. Store the returned project ID/name for use when creating issues in this group.

For EXISTING projects, just use the project name/ID found during Phase 4.

**7b — Create issue.** For each approved item:

1. **Duplicate check:** Call `list_issues(query: "<key terms from title>")` and scan recent results. If a likely duplicate exists, warn the user and let them decide to proceed or skip.

2. **Create the issue** with:
   - **Team:** Pep school v2 os
   - **State:** Backlog
   - **Assignee:** `me`
   - **Project:** the project name/ID for this item's group
   - **Priority:** as confirmed (1=Urgent, 2=High, 3=Normal, 4=Low)
   - **Labels:** as confirmed (Feature, Bug, Improvement, or Task)
   - **Title:** as confirmed
   - **Description:**
     ```markdown
     ## Summary
     {2-3 sentences expanding the title with meeting context, including the reasoning and constraints discussed}

     ### Context from Discussion
     {context extracted from the transcript — include relevant quotes, decisions made, constraints mentioned, edge cases discussed, and any back-and-forth that shaped this item. 3-5 sentences minimum.}

     ---
     Source: Meeting Transcript — {meeting_title} ({meeting_date})
     ```

3. Confirm creation and show the issue identifier.

### Phase 8 — Final Summary

After all items are processed, show a summary table grouped by project:

```
Projects:
  AI Interview System (NEW) — 3 issues created
  Observation Capture (EXISTING) — 2 issues added

Created Issues:
  ID       Title                                    Priority   Label        Project
  PEP-42   Build interview inbox for teachers       Normal     Feature      AI Interview System
  PEP-43   Add AI question generation from model    High       Feature      AI Interview System
  PEP-44   Fix broken voice recording on Android    High       Bug          Observation Capture

Skipped:
  - Revisit coach prompt wording
  - ...

Tip: Run /refine-linear-issue on any of these to add full detail.
```

## Guardrails

- Never create an issue without showing the item to the user first.
- Always walk through items one-at-a-time — no batch-create.
- Always use Backlog state — never Todo (these are unrefined).
- Max 30 items per session. If more are extracted, warn and truncate.
- Preserve the `Source: Meeting Transcript — ...` marker in every description for downstream detection by `/refine-linear-issue`.
- When refining an existing draft-sourced issue, direct the user to `/refine-linear-issue` instead.
