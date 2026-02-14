---
name: create-linear-issue
description: Draft and create context-aware Linear issues for the Pep school v2 os workspace. Use when the user wants to track a bug, feature, task, or improvement, including requests like "create an issue", "track this", "file a bug", "add a feature request", or "/create-linear-issue".
---

# Create Linear Issue

## Goal

Create issues that a developer or agent can implement without follow-up clarifying questions. Focus on what should happen and why it matters, not how to implement it.

## Principles

- Describe intent, not implementation details
- Be concrete about outcomes and boundaries
- Keep scope tight; split work if acceptance criteria exceed three items
- Use plain language for technical and non-technical stakeholders
- Ask context-aware questions that align with existing app surfaces and role constraints

## Context Loading (Required Before Clarifying Questions)

1. Load the high-level overview without asking for permission:
   - `.codex/skills/codebase-context-scan/references/pep-os-overview.md`
2. Infer likely `area_tag` values from the request using the overview `## Area Map`.
3. Auto-load matching deep-dive report(s) if they exist:
   - `.codex/skills/codebase-context-deep-dive/references/deep-dives/<area_tag>.md`
4. If context is still insufficient, ask the user for permission to generate/update deep-dive report(s) via the deep-dive skill.
   - Max deep-dive refinement rounds per issue: 2.
5. Do not ask generic questions that ignore known app context (existing pages, roles, patterns, and current behavior).

## Workflow

1. Clarify the request
- Ask focused follow-up questions until ambiguity is low.
- Always confirm priority: Urgent, High, Normal, or Low.
- For bugs: capture reproducible steps, expected behavior, actual behavior, and environment details.
- For features: capture who benefits, desired behavior, constraints, and edge cases.

2. Draft the issue
- Build a concise title and complete description using the template below.
- Include only relevant sections (feature or bug specific).
- If scope is too broad, propose splitting into smaller issues.

3. Review with the user
- Present the draft before writing anything to Linear.
- Apply user edits until approved.

4. Create in Linear
- Create the issue only after explicit user approval.
- Set team, priority, labels, and state as confirmed with the user.
- Return the created issue identifier and URL.

## Issue Template

```markdown
## Summary
[1-2 sentences: what this accomplishes and why it matters]

### Feature Details
- User Story: As a [role], I want [capability] so that [benefit]
- Acceptance Criteria
  - [ ] [Measurable requirement]

### Bug Details
- Steps to Reproduce
- Expected Behavior
- Actual Behavior

### Context
[Background, screenshots, links, and current workarounds]

### Out of Scope
[What this issue does not cover]
```

## Defaults

- Team: Pep school v2 os
- Title: imperative and concise, ideally under 60 characters
- State: Todo by default; use Backlog when the work is not ready to start
- Labels: Bug, Feature, Improvement based on issue type
- Priority: always ask and confirm before creation
- Context source: always start from `pep-os-overview.md`, then matching deep dives when available

## Guardrails

- Do not create the Linear issue before showing a draft and receiving explicit approval.
- Confirm state and label if the issue type is ambiguous.
- If related issues exist, call them out and suggest linking.
- Ask permission only for generating/updating deep dives, not for reading existing overview/deep-dive files.
