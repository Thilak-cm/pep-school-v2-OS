---
name: create-linear-issue
description: Create well-structured Linear issues for the Pep school v2 os team. Use when someone wants to create a new feature request, bug report, task, or improvement. Guides the user through clarifying questions, drafts a structured issue, reviews it with the user, then creates it in Linear via MCP. Invoke with /create-linear-issue or when the user says things like "create an issue", "file a bug", "add a feature request", "there's a bug", or "let's track this".
user_invocable: true
---

# Create Linear Issue

## Goal

Create issues that a developer or an agent can pick up and implement without needing to ask clarifying questions. Focus on **what** needs to be done and **why**, not **how** to implement it.

## Principles

- **Describe intent, not implementation** — Let the implementing developer figure out which files to modify
- **Be specific about outcomes** — Vague requirements lead to misaligned implementations
- **Define boundaries clearly** — What's in scope matters as much as what's out of scope
- **Keep issues small** — If it has >3 acceptance criteria, it should probably be split

## Workflow

1. **Understand what the user wants** — Ask clarifying questions about the problem, desired behavior, and priority (sometimes recursively so that there is little to no ambiguity)
   - If the issue is a bug:
     - Ask about the steps to reproduce
     - Ask what the expected vs actual behavior is
   - If the issue is a feature:
     - Ask who benefits and how
     - Ask about edge cases and constraints
   - Always ask about priority (Urgent / High / Normal / Low)
2. **Draft the issue** — Write it up using the template below
3. **Review with user** — Present the draft and adjust based on feedback
4. **Create in Linear** — Use the MCP tool to create the issue

## Issue Template

```markdown
## Summary
[1-2 sentences: what this accomplishes and why it matters]

### Issue-Specific Sections

For features:
- User Story: As a [role], I want [capability] so that [benefit]
- Acceptance Criteria (checkboxes)

For bugs:
- Steps to Reproduce
- Expected Behavior
- Actual Behavior

### Context
[Background, screenshots, links, current workarounds — anything that helps the implementer]

### Out of Scope
[What this issue does NOT cover]
```

## Defaults

- **Team**: Pep school v2 os
- **Title**: Concise, imperative, under 60 characters (e.g., "Add upcoming birthdays page")
- **Status**: Todo by default; use Backlog when work is intentionally parked
- **Labels**: Bug, Feature, Improvement based on issue type
- **Priority**: Ask the user (1=Urgent, 2=High, 3=Normal, 4=Low)

## Guidelines

- Always ask clarifying questions before drafting — even if the request seems clear
- **Never** create in Linear without showing the draft and getting approval first
- Confirm status and label if issue type is unclear
- Use plain language — both technical and non-technical team members should find it clear
- Flag connections to existing issues when spotted
