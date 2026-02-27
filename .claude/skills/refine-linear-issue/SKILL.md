---
name: refine-linear-issue
description: Refine an existing Linear issue with full context, clarifying questions, and a polished description. Use when the user wants to flesh out, refine, or add detail to an existing issue, including requests like "refine PEP-42", "add detail to PEP-42", or "/refine-linear-issue PEP-42".
user_invocable: true
---

# Refine Linear Issue

## Goal

Take an existing Linear issue and refine it until a developer or agent can implement it without follow-up clarifying questions. Focus on what should happen and why it matters, not how to implement it.

## Argument

Requires a Linear issue identifier as argument (e.g., `PEP-42`). If not provided, ask the user for one.

## Principles

- Describe intent, not implementation details
- Be concrete about outcomes and boundaries
- Keep scope tight; split work if acceptance criteria exceed three items
- Use plain language for technical and non-technical stakeholders
- Ask context-aware questions that align with existing app surfaces and role constraints
- Preserve any existing context from the original issue (especially MoM sources)

## Context Loading (Required Before Clarifying Questions)

1. Fetch the issue via `get_issue` using the provided identifier.
2. Load the high-level overview without asking for permission:
   - `.claude/skills/codebase-context-scan/references/pep-os-overview.md`
3. Infer likely `area_tag` values from the issue using the overview `## Area Map`.
4. Auto-load matching deep-dive report(s) if they exist:
   - `.claude/skills/codebase-context-deep-dive/references/deep-dives/<area_tag>.md`
5. If context is still insufficient, ask the user for permission to generate/update deep-dive report(s) via the deep-dive skill.
   - Max deep-dive refinement rounds per issue: 2.
6. Do not ask generic questions that ignore known app context (existing pages, roles, patterns, and current behavior).

## Workflow

### 1. Fetch & Understand

- Fetch the issue from Linear using the provided identifier.
- Read the current title, description, priority, labels, state, and assignee.
- Check the description for a `Source: Meeting Notes —` marker (created by `/draft-linear-issues`).
- Summarize the current state of the issue to the user before asking questions.

### 2. Clarify & Extract Intent

- Ask focused follow-up questions until ambiguity is low.
- Leverage loaded context (overview + deep dives) to ask smart, specific questions — not generic ones.
- For bugs: capture reproducible steps, expected behavior, actual behavior, and environment details.
- For features: capture who benefits, desired behavior, constraints, and edge cases.
- Confirm or adjust priority: Urgent, High, Normal, or Low.
- Confirm or adjust labels if the issue type is ambiguous.

### 3. Draft the Refined Description

- Build a refined title (if the current one is vague) and complete description using the template below.
- Include only relevant sections (feature or bug specific).
- If scope is too broad, propose splitting into smaller issues.
- If the issue has a MoM source marker, preserve the original context snippet under a **"### MoM Reference"** subsection.

### 4. Review with the User

- Present the full refined draft (title, description, priority, labels, state) before updating anything in Linear.
- Apply user edits until approved.

### 5. Update in Linear

- Update the issue only after explicit user approval.
- Update description, title, priority, labels, and assignee as confirmed.
- Move state from **Backlog to Todo** (unless the user specifies otherwise).
- If the issue was already in Todo or a later state, keep the current state.
- Return the updated issue identifier and confirm the changes.

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

### MoM Reference
[Original meeting notes context — only if issue was created by /draft-linear-issues]
```

## Defaults

- Title: imperative and concise, ideally under 60 characters
- State: promote Backlog → Todo after refinement; keep current state if already Todo or later
- Assignee: keep existing assignee; set to `me` if currently unassigned
- Labels: Bug, Feature, Improvement based on issue type
- Priority: always confirm before updating
- Context source: always start from `pep-os-overview.md`, then matching deep dives when available

## Guardrails

- Do not update the Linear issue before showing a draft and receiving explicit approval.
- Confirm state and label if the issue type is ambiguous.
- If related issues exist, call them out and suggest linking.
- Ask permission only for generating/updating deep dives, not for reading existing overview/deep-dive files.
- Keep existing assignee unless the user explicitly requests a change; set to `me` if unassigned.
- Never discard the original MoM context snippet from draft-sourced issues.
- If the issue identifier is invalid or not found, inform the user and ask for a correct one.
