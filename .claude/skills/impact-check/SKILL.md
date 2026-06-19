---
name: impact-check
description: "Trace the full blast radius of current code changes — transitive dependency chains, cross-boundary contracts (frontend/functions/rules), security rule cascades, navigation effects, config ripples, and data shape propagation. Use on-demand to check downstream effects before committing, or automatically as part of /review-issue."
---

# Impact Check

## Goal

Surface every downstream effect of the current code changes — intended or not. This skill answers: "What else in the codebase is affected by what I just changed, and is that effect accounted for?"

## When to Use

- **On-demand:** Before committing, when you want to check the blast radius of your changes
- **Automatic:** Runs as Phase 3 of `/review-issue` — you don't need to invoke it separately during that flow

## Workflow

### Step 1: Determine the Diff

Auto-detect what to analyze, in this priority order:

1. If there are **uncommitted changes** (`git diff` is non-empty) — analyze those
2. If the current branch has **commits ahead of master** (`git diff origin/master...HEAD` is non-empty) — analyze the branch diff
3. If neither — ask the user what to analyze

Also capture:
- `git diff --stat` (or `git diff origin/master...HEAD --stat`) for the file-level summary
- `git branch --show-current` for context

### Step 2: Load Context

1. **Infer the Linear issue** from the branch name (e.g., `pep-296-alert-bus` → `PEP-296`)
   - If found, call `get_issue` with `includeRelations=true`
   - If not found, proceed without it (impact analysis doesn't strictly require issue context, but it helps distinguish intended from unintended effects)
2. **Read the codebase overview** at `.claude/skills/codebase-context-scan/references/pep-os-overview.md`

### Step 3: Launch Impact Checker Agent

Spawn the **`impact-checker` agent** (`.claude/agents/impact-checker.md`) with:

- **Diff:** The full diff content from Step 1
- **Diff stat:** The file-level summary
- **Linear issue context:** Title + acceptance criteria (or "no issue context" if not found)
- **Codebase overview:** The full overview text

### Step 4: Display Results

When the impact-checker agent returns:

1. **Display the full Impact Analysis Report** to the user
2. **Summarize the verdict:**
   - `NO_IMPACT` → "No downstream effects detected. Your changes are self-contained."
   - `CONTAINED` → "Downstream consumers were traced and all are compatible. No action needed."
   - `HAS_IMPACT` → "Found {N} downstream effects that need attention." + display findings by severity

3. **For HAS_IMPACT findings:**
   - **Blockers:** "These will break other parts of the app. Fix before committing."
   - **Warnings:** "These might cause issues. Review and decide."
   - **Needs User Decision:** Present the decision needed and ask the user.

### Step 5: Next Steps (On-Demand Only)

If running on-demand (not as part of review-issue):

- If blockers exist, suggest specific files to update
- If the user wants to fix, they can proceed manually or ask Claude to help
- The skill does NOT auto-fix — it's diagnostic only when run standalone

## What It Checks

| Category | Example |
|---|---|
| **Import chain breakage** | You renamed a function — 8 files import it |
| **Behavioral side effects** | You changed saveQueue retry logic — every component using it now retries differently |
| **Data shape ripple** | You added a required field to observations — timeline, export, baseball card, AI coach all read observations |
| **Security rule cascades** | You tightened a rule on alerts — the same `match` block also gates teacher timeline reads |
| **Config/flag dependencies** | You changed a config key — three features read that same key |
| **Navigation effects** | You changed a setScreen call — a "back" flow from another screen now lands wrong |
| **Cloud Function contracts** | You changed a callable's response shape — the frontend reads the old field names |
| **Shared utility changes** | You modified roleUtils — every role check in the app is affected |

## How It Traces (Transitive)

Unlike a simple "find references," this skill follows the full dependency chain:

```
You changed: roleUtils.isPrivilegedAdmin()
  → Level 1: 12 components import roleUtils
    → Level 2: 3 of those pass the result to child components as props
      → Level 3: Those children conditionally render based on the prop
        → Leaf: A teacher sees/doesn't see a button that previously worked
  → Cross-boundary: firestore.rules also checks the same role field
    → 4 collection paths use role-based access
      → Frontend code that reads from those collections
```

## Output Format

The impact-checker agent produces findings in the standard audit report contract format (same as code-auditor). Findings have:
- **Category:** `impact`
- **Impact chain:** Shows the dependency path from the change to the affected code

When run inside review-issue, these findings merge into the main audit report and flow through the fix loop.

## Guardrails

- **Read-only:** This skill never modifies code. It's purely diagnostic.
- **No false negatives over false positives:** It flags everything that *could* be affected. You triage.
- **Security rules get special treatment:** Rule changes are the highest-risk surface in this codebase (past incidents). Every rule change is traced to all affected code paths.
- **Cross-boundary is mandatory:** Frontend ↔ Functions ↔ Rules have no shared type system. Changes in one can silently break another. The skill always checks across all three.
