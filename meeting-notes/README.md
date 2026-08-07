# Meeting Notes Archive

This folder stores source records for meetings that feed `/draft-github-issues`.
Each meeting gets one Markdown file, grouped by year:

```text
meeting-notes/
  2026/
    2026-07-30-coach-pepper-rebuild.md
```

## Retrieval Contract

The first 10-15 lines of every meeting file contain YAML frontmatter metadata.
When skimming for relevance, read only that metadata first. Only open the full
file when the metadata indicates the meeting is relevant. This keeps future
agent retrieval cheap while preserving the full transcript for deep dives.

Required frontmatter:

```yaml
---
type: meeting_record
title: "Meeting title"
date: "YYYY-MM-DD"
participants: ["Name"]
areas: ["ai-tools-and-chat"]
topics: ["coach-pepper"]
status: "drafting"
issue_refs: []
source: "Granola"
---
```

- `areas` must use the controlled Pep OS area tags from
  `.agents/skills/codebase-context-scan/references/pep-os-overview.md`.
- `topics` are freeform kebab-case tags.
- `issue_refs` contains GitHub issue numbers created or augmented from the
  meeting.
- `status` should usually be `drafting`, `issues-drafted`, or `archived`.

## File Body

Keep the raw transcript in the file by default. Do a light redaction pass before
writing for obvious secrets, credentials, private tokens, phone numbers, email
addresses, and anything explicitly said to be off-record. Do not redact normal
student, classroom, or product context unless the user asks.

Use these sections:

```markdown
## Meeting Notes / MOM

## Decisions

## Drafted Issues
### Created
### Augmented
### Skipped

## Open Questions

## Post-Meeting Additions

## Raw Transcript
```

Treat the raw transcript as the original source record. Prefer additive updates
under `Post-Meeting Additions`, `Clarifications`, or metadata edits over
rewriting the transcript.
