---
name: spec-issue
description: Spec an existing GitHub issue with full context, clarifying questions, and a polished description. Use when the user wants to flesh out, refine, or add detail to an existing issue, including requests like "spec #42", "add detail to #42", or "/spec-issue #42".
user_invocable: true
---

# Spec Issue

## Goal

Take an existing issue and grill it relentlessly until it converges on exactly one implementation path. Speccing is not done until a developer or agent could plan the implementation and arrive at a single approach — no forks, no "Option A vs Option B", no architectural judgment calls left to the implementer.

Focus on what should happen and why it matters. Extract enough constraints and decisions that *how* becomes obvious.

## Argument

Requires a GitHub issue identifier as argument (e.g., `#42`). If not provided, ask the user for one.

## Principles

- **Grill relentlessly.** Walk down every branch of the decision tree. Resolve dependencies between decisions one by one. Do not batch questions — ask one at a time.
- **Provide a recommended answer for each question.** Don't just ask "what should X do?" — say "I'd recommend X does Y because Z. Does that match your intent?"
- **If the codebase can answer it, explore instead of asking.** Don't ask the user what a function does or how a component works — read the code and state what you found. Only ask the user for *intent* and *decisions*, not facts.
- **Be concrete about outcomes and boundaries.** Vague acceptance criteria = ambiguous implementation paths. Every AC should be specific enough to test.
- **Keep scope tight.** Split work if acceptance criteria exceed five items or the issue spans unrelated concerns.
- **Preserve existing context** from the original issue (especially MoM sources).

## Context Loading (Required Before Grilling)

1. Fetch the issue via GitHub using the provided identifier.
2. Load the high-level overview without asking for permission:
   - `.claude/skills/codebase-context-scan/references/pep-os-overview.md`
3. Infer likely `area_tag` values from the issue using the overview `## Area Map`.
   - Area mapping examples:
     - "voice note", "voice transcription" → "observation-capture"
     - "timeline", "student timeline" → "timelines-and-media"
     - "permission", "role", "admin" → "auth-and-access"
     - "firebase", "rules", "security" → "firebase-infrastructure"
     - "export", "report", "PDF" → "reporting-and-export"
     - "coach", "AI", "nudge" → "ai-coach"

4. **Assess complexity and spawn codebase-explorer agents accordingly.**

   The codebase-explorer agent supports two depth modes: `overview` (fast skim of key files + data structure) and `deep` (full import tracing, data flow mapping, test/security rule checking). Use this matrix to decide:

   | Complexity | Signal | What to spawn |
   |-----------|--------|---------------|
   | **Simple** | 1 area, issue is a clear bugfix or small tweak, overview gives enough context | No explorer needed — overview alone is sufficient |
   | **Moderate** | 1-2 areas, need to understand current behavior or data shapes to write precise ACs | 1 explorer with `exploration_depth: "overview"` |
   | **Complex** | 2+ areas, issue involves data flows across areas, new feature touching existing patterns, or unclear constraints | 1 explorer per area, **in parallel**, with `exploration_depth: "deep"` |
   | **Cross-cutting** | Issue affects shared infrastructure (auth, navigation, saveQueue, Cloud Functions) plus a feature area | 2 explorers in parallel: one `deep` on the infrastructure area, one `deep` on the feature area |

   **Data to pass to each codebase-explorer agent:**
   - `overview_content`: The full text of `pep-os-overview.md` (already loaded in step 2)
   - `target_areas`: The area tag(s) this explorer is responsible for (1-2 per agent, not all areas dumped into one)
   - `issue_context`: Issue title + current description + any labels
   - `exploration_focus`: `"refinement"`
   - `exploration_depth`: `"overview"` or `"deep"` per the matrix above
   - `specific_files`: Any files explicitly mentioned in the issue description

   **Parallel dispatch:** When spawning multiple explorers, launch them all in the same tool-call message so they run concurrently. Each explorer handles its own area(s) independently and returns a focused summary. The orchestrator merges their outputs for the grilling phase.

5. Do not ask generic questions that ignore known app context (existing pages, roles, patterns, and current behavior).

## Workflow

### 1. Fetch & Understand

- Fetch the issue from GitHub using the provided identifier.
- Read the current title, description, priority, labels, state, and assignee.
- Check the description for a `Source: Meeting Notes —` marker (created by `/draft-linear-issues`).
- Summarize the current state of the issue to the user before starting the grill.

### 2. Grill — One Question at a Time

Interview the user relentlessly about every aspect of this issue. Walk down each branch of the decision tree, resolving dependencies between decisions one by one.

**Rules:**
- **One question per message.** Asking multiple questions at once is bewildering. Wait for feedback on each question before continuing.
- **Provide your recommended answer.** For every question, state what you'd recommend and why. The user can accept, reject, or modify. This keeps the conversation efficient — the user often just confirms.
- **Codebase-first.** Before asking the user anything factual about the current system, check the code. Only ask the user for *decisions* — intent, priorities, constraints, preferences, and tradeoffs. Never ask "how does X work?" — read X and state what you found.
- **Ground questions in exploration findings.** Instead of "What should happen when X?", say "Currently X does Y (found in `path/to/file.js:42`). Should this change, and if so, how?"
- **Follow the decision tree.** Each answer may open new branches. Follow them. Don't skip ahead.
- **For bugs:** Nail down reproducible steps, expected vs actual behavior, environment details, and fix constraints.
- **For features:** Nail down who benefits, desired behavior, edge cases, error states, constraints, and what explicitly should NOT change.
- **Confirm priority and labels** during the grill if they seem misaligned.

**What to grill on (non-exhaustive — adapt to the issue):**
- Exact behavior in happy path and edge cases
- Error states and how they surface to the user
- Data shape changes and migration concerns
- Which roles are affected and how access control applies
- Interaction with existing features (does this change anything else?)
- Constraints: performance, backwards compatibility, platform limits
- What is explicitly out of scope
- Ordering and priority of competing concerns (e.g., "if we can't have both X and Y, which wins?")

### 3. Planning Probe — Convergence Check

After gathering enough information, mentally run through implementation. This is an internal check, not shown to the user as a formal plan.

**Steps:**
1. Given the current requirements, identify the files and approach needed.
2. Ask yourself: **"Is there more than one reasonable way to implement this?"**
3. If YES — there are multiple viable paths:
   - Identify the **specific ambiguous decisions** that cause the fork. What piece of missing information or unresolved preference creates the branching?
   - Go back to Step 2 (Grill) and ask about those specific decisions. Tell the user: "I want to nail down one more thing — [specific question about the fork]."
   - Repeat until convergence.
4. If NO — there is one clear path:
   - Proceed to drafting the refined description.

**Convergence means:** The acceptance criteria, constraints, and decisions captured are specific enough that implementation planning would produce exactly one approach — not "Option A vs Option B", but a single clear path.

**Important:** The planning probe is a mental exercise during refinement. Do NOT output a full technical plan — that's `/plan-issue`'s job. The probe just validates that enough information has been extracted.

### 4. Draft the Spec

- Build a refined title (if the current one is vague) and complete description using the template below.
- Include only relevant sections (feature or bug specific).
- If scope is too broad, propose splitting into smaller issues.
- If the issue has a MoM source marker, preserve the original context snippet under a **"### MoM Reference"** subsection.
- **The description should be specific enough that `/plan-issue` produces one path.** If you find yourself hedging ("either X or Y could work"), you haven't grilled enough — go back.

### 5. Review with the User

- Present the full refined draft (title, description, priority, labels, state) before updating anything in GitHub.
- Apply user edits until approved.

### 6. Update in GitHub

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
  - [ ] [Measurable requirement — specific enough to test]

### Bug Details
- Steps to Reproduce
- Expected Behavior
- Actual Behavior

### Root Cause
[What's actually wrong and why — from codebase exploration, not guesswork]

### Decisions Made
[Key decisions resolved during speccing that constrain implementation to one path.
 Format: "Decision: [what was decided]. Why: [rationale]."
 These prevent the implementer from re-opening resolved questions.]

### Context
[Background, screenshots, links, and current workarounds]

### Out of Scope
[What this issue does not cover — be explicit]

### MoM Reference
[Original meeting notes context — only if issue was created by /draft-linear-issues]
```

## Defaults

- Title: imperative and concise, ideally under 60 characters
- State: promote Backlog → Todo after speccing; keep current state if already Todo or later
- Assignee: keep existing assignee; set to `me` if currently unassigned
- Labels: Bug, Feature, Improvement based on issue type
- Priority: always confirm before updating
- Context source: always start from `pep-os-overview.md`, then codebase-explorer agent(s) at `overview` or `deep` depth based on complexity — parallel explorers for multi-area issues

## Guardrails

- Do not update the GitHub issue before showing a draft and receiving explicit approval.
- Confirm state and label if the issue type is ambiguous.
- If related issues exist, call them out and suggest linking.
- Auto-read overview without asking; spawn codebase-explorer agent when deeper context is needed — don't ask the user for permission to explore, just do it.
- Keep existing assignee unless the user explicitly requests a change; set to `me` if unassigned.
- Never discard the original MoM context snippet from draft-sourced issues.
- If the issue identifier is invalid or not found, inform the user and ask for a correct one.
- **Never ask multiple questions in one message.** One question, one recommended answer, wait for response.
- **Never ask the user factual questions about the codebase.** Read the code yourself. Only ask for intent and decisions.
- **Do not draft the description until the planning probe confirms single-path convergence.**
