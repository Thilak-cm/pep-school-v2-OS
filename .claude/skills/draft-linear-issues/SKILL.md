---
name: draft-github-issues
description: Parse meeting notes and batch-create lightweight GitHub Issues in Backlog status. Use when the user pastes meeting notes, action items, or says "/draft-linear-issues".
user_invocable: true
---

# Draft GitHub Issues from Meeting Transcripts

## Goal

Batch-triage meeting transcripts into lightweight Backlog issues, optionally grouped under GitHub Projects. The input is a **full meeting transcript** (copy-pasted from Granola or similar tools) — not a summarized MOM. This means you have access to the complete conversation: every point discussed, nuance, context, reasoning, and back-and-forth. Extract action items, decisions, bugs, and follow-ups with **rich context** from the full conversation, then walk through each one for quick Create/Skip/Edit before writing to GitHub. Any issue can later be refined via `/spec-issue`.

## Principles

- Speed over depth — this is triage, not refinement
- **Mine the transcript deeply** — the full transcript contains far more context than a summary. Pull in reasoning, constraints, edge cases, and decisions discussed. Issue descriptions should reflect this richness.
- **Very high recall** — extract every possible actionable item, even tiny ones mentioned in passing, side comments, or verbal agreements buried in tangents. Missing an item is worse than creating one that gets skipped. When in doubt, extract it — the user can always Skip during the walk-through. Scan for: UI tweaks, number corrections, format changes, label renames, layout adjustments, data fixes, new pages, new graphs, new fields, pipeline changes, scheduled jobs, prompt updates, folder/architecture decisions, investigation tasks, and verification/testing tasks.
- **Smart aggregation** — after extracting with high recall, intelligently group small items that don't deserve their own issue. Multiple tiny UI tweaks (label changes, spacing, layout adjustments) should be bundled into a single issue even if seemingly unrelated — the point is they can all be done at once. Don't create ten small issues for ten small things. Present aggregated items as a single issue with a checklist body. Larger items that are clearly sub-tasks of a parent feature should be merged into that parent issue rather than standing alone.
- **Duplicate detection before presenting** — before presenting extracted items to the user, check GitHub issues (`gh issue list --repo Thilak-cm/pep-school-v2-OS --search "<key terms>" --json number,title,state`) for existing issues that overlap. If a match is found, suggest augmenting the existing issue (adding context/checklist items) instead of creating a new one. Present this as: `"Found existing #123: {title} — suggest augmenting instead of creating new."`
- Never create without showing the item first
- Always one-at-a-time (no batch-create)
- Always Backlog status in the project board (not Todo — these are unrefined)
- Max 30 items per session
- **Be deliberate and selective with projects** — do NOT eagerly create new projects for every cluster of issues. Only suggest a new project if there is genuine future scope for more issues in that space. Most issues should go into the existing "Pep OS" project (project #3) without sub-grouping. Projects are for major multi-issue initiatives, not for categorizing a handful of related items.

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
- **type**: `Feature` / `Bug` / `Improvement` / `Task` (maps to GitHub issue labels)
- **priority**: default Normal (P3) unless language suggests urgency
- **label**: matching GitHub label name (e.g., `Feature`, `Bug`, `Improvement`, `Task`, `P1-urgent`, `P2-high`, `P3-normal`, `P4-low`)
- **area_tag(s)**: inferred from the overview Area Map
- **context_snippet**: **3-5 sentences** of context pulled from the transcript — include the reasoning, constraints, and decisions discussed around this item. This is the key advantage of having the full transcript: capture the *why* and *how*, not just the *what*.

Deduplicate similar items. Mark ambiguous items with `[?]`.

### Phase 4 — Assign to Projects (Selective)

**Default: all issues go into the "Pep OS" project (project #3).** Do NOT create new projects unless there is clear, sustained future scope.

Only suggest a NEW project if ALL of these are true:
- The initiative has **5+ issues** from this meeting alone
- There is **clear future scope** — more issues will be added to this project in coming weeks/months
- It represents a **distinct body of work** with its own lifecycle (not just a cluster of related fixes)

**Check for existing projects first:** Run `gh project list --owner Thilak-cm --format json`. Reuse existing projects when they match.

For the rare case a new project is warranted, infer:
- **project_name**: concise, descriptive name (e.g., "AI Interview System")
- **project_description**: 2-3 sentences summarizing the initiative
- **items**: list of extracted items that belong to this project

Most meetings will result in 0 new projects — all items go into the main "Pep OS" project. This is expected and correct.

### Phase 5 — Summary Preview

Present items grouped by project:

```
Found {N} items across {P} projects from "{meeting_title}" ({meeting_date}):

Project: AI Interview System (NEW)
 #  Title                                    Type         Priority
 1  Build interview inbox for teachers       Feature      P3-normal
 2  Add AI question generation from model    Feature      P2-high

Project: Observation Capture (EXISTING — Project #3)
 3  Fix broken voice recording on Android    Bug          P2-high
 4  Revisit coach prompt wording             Improvement  P3-normal

Project: {meeting_title} — Follow-ups
 5  Check with design team on mockups        Task         P3-normal
    ...
```

Ask the user: "Remove any items by number, adjust project groupings, or proceed to walk-through?"

Handle edge cases:
- **No items found:** Offer to retry with different parsing, or suggest creating a single issue manually via `gh issue create`.
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

### Phase 7 — Create Project (if needed) & Create GitHub Issue

**7a — Ensure project exists.** Before creating the first issue in a NEW project group:

1. Run `gh project create --owner Thilak-cm --title "{project_name}" --format json` to create the project.
2. Store the returned project number for use when adding issues to this project.

For EXISTING projects, just use the project number found during Phase 4.

**7b — Create issue.** For each approved item:

1. **Duplicate check:** Run `gh issue list --repo Thilak-cm/pep-school-v2-OS --search "<key terms from title>" --json number,title` and scan recent results. If a likely duplicate exists, warn the user and let them decide to proceed or skip.

2. **Create the issue** via `gh issue create` with:
   - **Repo:** `Thilak-cm/pep-school-v2-OS`
   - **Assignee:** `@me`
   - **Labels:** type label + priority label (e.g., `Feature,P3-normal`)
   - **Title:** as confirmed
   - **Body:**
     ```markdown
     ## Summary
     {2-3 sentences expanding the title with meeting context, including the reasoning and constraints discussed}

     ### Context from Discussion
     {context extracted from the transcript — include relevant quotes, decisions made, constraints mentioned, edge cases discussed, and any back-and-forth that shaped this item. 3-5 sentences minimum.}

     ---
     Source: Meeting Transcript — {meeting_title} ({meeting_date})
     ```

   Command pattern:
   ```bash
   gh issue create --repo Thilak-cm/pep-school-v2-OS \
     --title "{title}" \
     --body "$(cat <<'EOF'
   {body content}
   EOF
   )" \
     --label "{type},{priority}" \
     --assignee "@me"
   ```

3. After creation, add the issue to the GitHub Project:
   ```bash
   gh project item-add {project_number} --owner Thilak-cm --url {issue_url}
   ```

4. Set the status field to "Backlog" on the project board:
   ```bash
   # Get the item ID and status field ID, then set status to Backlog
   gh project item-edit --project-id {project_id} --id {item_id} --field-id {status_field_id} --single-select-option-id {backlog_option_id}
   ```

5. Confirm creation and show the issue number (e.g., `#42`).

### Phase 8 — Final Summary

After all items are processed, show a summary table grouped by project:

```
Projects:
  AI Interview System (NEW) — 3 issues created
  Observation Capture (EXISTING) — 2 issues added

Created Issues:
  #       Title                                    Priority     Label        Project
  #42     Build interview inbox for teachers       P3-normal    Feature      AI Interview System
  #43     Add AI question generation from model    P2-high      Feature      AI Interview System
  #44     Fix broken voice recording on Android    P2-high      Bug          Observation Capture

Skipped:
  - Revisit coach prompt wording
  - ...

Tip: Run /spec-issue on any of these to add full detail.
```

## Guardrails

- Never create an issue without showing the item to the user first.
- Always walk through items one-at-a-time — no batch-create.
- Always use Backlog status on the project board — never Todo (these are unrefined).
- Max 30 items per session. If more are extracted, warn and truncate.
- Preserve the `Source: Meeting Transcript — ...` marker in every description for downstream detection by `/spec-issue`.
- When refining an existing draft-sourced issue, direct the user to `/spec-issue` instead.
