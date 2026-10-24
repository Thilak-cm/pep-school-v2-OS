---
name: spec-prd
description: "PRD pass: grill an existing issue until it converges on exactly one product requirement - what to build, for whom, and what's out of scope. Non-technical; the HOW lives in /spec-tpd. Use when the user says /spec-prd or wants to refine an issue's requirements."
user_invocable: true
---

# Spec PRD - Product Requirements

## Goal

Take an existing issue and grill it relentlessly until the WHAT converges on exactly one product requirement. Speccing is done when the acceptance criteria, constraints, decisions, and out-of-scope are specific enough that a separate technical planning step (`/spec-tpd`) can determine HOW without re-opening any product question.

This skill owns requirements, scope, and user-facing behavior. It does NOT own implementation approach, file changes, type shapes, or function signatures - those belong to `/spec-tpd`.

Requires a GitHub issue identifier (e.g., `#42`); ask if not provided.

## Context Loading (Before Grilling)

1. Fetch the issue from GitHub: title, description, priority, labels, state, assignee. Check for a `Source: Meeting Transcript —` marker (from `/draft-github-issues`).
2. Read `.agents/skills/codebase-context-scan/references/pep-os-overview.md` without asking. Infer `area_tag` values from the Area Map.
3. **Spawn codebase-explorer agents by complexity:**
   - **Simple** (1 area, clear bugfix/tweak): no explorer — overview suffices.
   - **Moderate** (1-2 areas, need current behavior/data shapes for precise ACs): 1 explorer, depth `overview`.
   - **Complex** (2+ areas, cross-area data flows, unclear constraints): 1 explorer per area **in parallel**, depth `deep`.
   - **Cross-cutting** (shared infrastructure + a feature area): 2 parallel `deep` explorers.

   Pass each explorer: the overview text, its 1-2 target areas, issue context, focus `"refinement"`, depth, and any files mentioned in the issue. Merge results before grilling.
4. **Draw a rough system diagram** for this issue before the first question: relevant entry points, components, services, Cloud Functions, Firestore/Storage data, security boundaries, downstream consumers. Compact Mermaid or ASCII. Label uncertain boundaries `needs clarity` rather than inventing connections. Identify which blocks are understood and which need user decisions.
5. Track the grill as a rough sequence of information blocks adapted to the issue (typical: current behavior, desired outcome, primary flow, edge/error states, roles and data, constraints, scope/priority, convergence). Show a rough progress bar only at block transitions (e.g., `Spec progress: [####------] 3/8 blocks — Current behavior complete; moving to desired outcome.`), not after every answer. Never imply completeness just because the bar is full.

## Grill — One Question at a Time

Summarize the issue's current state and show the system diagram, then begin with exactly one question.

**Rules:**
- **One question per message.** Wait for each answer before continuing.
- **Stay at the product level.** Ask about behavior, user expectations, edge cases, scope, and constraints. Do NOT ask which files to change, which functions to call, or how to structure the code - that's `/spec-tpd`'s job. If a codebase finding is relevant to a product decision (e.g., "the system currently does X, should it change?"), state the finding and ask the product question, not the technical one.
- **Tier every question before asking it.** Trivial/mechanical decisions (naming, copying an established pattern, obvious defaults): recommend-confirm is fine - state your recommendation with reasoning. Consequential decisions (trade-offs, user-facing behavior, data semantics, scope boundaries): **never lead with a recommendation.** Present only the facts - current behavior, constraints, what's in scope - then ask the user to propose an answer with their reasoning.
- **Stress-test user proposals, don't rubber-stamp them.** After the user proposes on a consequential decision: raise the strongest objection, the edge cases it breaks, a steelmanned alternative, and how industry handles it. Never accept a proposal without first naming its strongest objection. Offer your own view only after their proposal has been examined, or when the user is stuck or explicitly asks.
- **Codebase-first for facts.** Never ask factual questions about the current system - read the code and state what you found. Only ask for *decisions*: intent, priorities, constraints, tradeoffs. Ground questions in findings: "Currently X does Y (`file.js:42`). Should this change?"
- **Follow the decision tree.** Each answer may open new branches - follow them, don't skip ahead.
- **For bugs:** reproducible steps, expected vs actual, environment, fix constraints. **For features:** who benefits, desired behavior, edge cases, error states, constraints, what explicitly should NOT change.
- Confirm priority and labels if they seem misaligned.

Grill on (adapt to the issue): happy path and edge cases, error surfacing, data shape changes and migrations, roles and access control, interaction with existing features, performance/compatibility constraints, explicit out-of-scope, and which concern wins when two compete.

## Pre-Mortem

Before the convergence gate, run one pre-mortem question: "This spec shipped and caused an incident or missed its goal — what went wrong?" **The user answers first.** Then add failure modes they missed. Fold any real risks back into ACs, decisions, or out-of-scope before proceeding.

## Convergence Gate

After gathering enough information, spawn the **convergence-checker** subagent. Pass it:
- `issue_context`: the issue title, draft ACs, decisions made so far, and constraints gathered during grilling
- `overview_content`: the codebase overview already loaded in Phase 1
- `target_areas`: the area tags inferred during context loading
- `specific_files`: any files surfaced during grilling

**On `SINGLE_PATH`:** proceed to drafting. The implementation trace from the checker confirms convergence.

**On `MULTIPLE_PATHS`:** read the forks identified by the checker. Turn each fork into a grilling question - "I want to nail down one more thing: [the fork's 'What would resolve it']." Return to grilling. Re-run the convergence-checker after resolving the forks. Repeat until `SINGLE_PATH`.

Do not skip this step. Do not self-assess convergence. The subagent call is the exit gate.

## Draft, Review, Update

1. Build a refined title (if vague) and description using the template. Include only relevant sections. Propose splitting if scope is too broad. If you find yourself hedging ("either X or Y could work"), you haven't grilled enough — go back.
2. Present the full draft (title, description, priority, labels, state) and apply edits until approved. **Never update GitHub before explicit approval.**
3. Update the issue: description, title, priority, labels, assignee as confirmed. Move **Backlog → Todo** (keep current state if already Todo or later). Confirm the changes.

## Issue Template

```markdown
## Summary
[1-2 sentences: what this accomplishes and why]

### Feature Details
- User Story: As a [role], I want [capability] so that [benefit]
- Acceptance Criteria: [ ] [Measurable, testable requirements]

### Bug Details
- Steps to Reproduce / Expected Behavior / Actual Behavior

### Root Cause
[From codebase exploration, not guesswork]

### Decisions Made
[Decisions resolved during speccing that constrain implementation to one path.
 "Decision: [what]. Alternatives considered: [what lost, and why]. Why: [rationale]."
 These prevent re-opening resolved questions and preserve the reasoning trail.]

### Context
[Background, screenshots, links, workarounds]

### Out of Scope
[Explicit]

### MoM Reference
[Original meeting context — only if draft-sourced; never discard it]
```

## Next Step

> After the user approves the updated issue:
>
> "PRD is locked. Open a new session and run `/spec-tpd #<issue>` to work
> out the technical approach before implementation."

## Defaults & Guardrails

- Title: imperative, ideally under 60 characters. Labels: Bug/Feature/Improvement by type. Priority: always confirm before updating. Assignee: keep existing; set to `me` if unassigned.
- Keep scope tight - split if ACs exceed five items or the issue spans unrelated concerns.
- Call out related issues and suggest linking.
- Explore without asking permission; never ask multiple questions in one message; never ask the user codebase facts.
- Do not draft the description until the convergence-checker subagent returns `SINGLE_PATH`.
- If the issue identifier is invalid, ask for a correct one.
