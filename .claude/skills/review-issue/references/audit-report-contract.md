# Audit Report Contract

This document defines the structured format that the **audit subagent** must output and the **fix subagent** consumes. It is the interface contract between the two agents — precision here determines fix quality.

## Report Format

The audit agent MUST output a report in exactly this structure:

```markdown
# Audit Report

## Metadata
- **Issue:** PEP-{id} — {title}
- **Branch:** {branch-name}
- **Diff scope:** {N} files changed, {+additions} / {-deletions}
- **Audit verdict:** CLEAN | HAS_FINDINGS
- **Blocker count:** {N}
- **Warning count:** {N}
- **Nit count:** {N}
- **User decision count:** {N}

## Scope Alignment

### Covered
{For each acceptance criterion from the Linear issue that IS addressed by the diff:}
- [AC-1] "{criterion text}" — addressed in `{file}:{line-range}`

### Missing (Under-delivery)
{For each acceptance criterion NOT addressed by the diff:}
- [AC-{N}] "{criterion text}" — not found in diff. Expected in `{likely file}`.

### Extra (Scope Creep)
{For each change in the diff NOT justified by any acceptance criterion:}
- `{file}:{line-range}` — {description of what changed}. Not tied to any acceptance criterion.

{If none: "No scope creep detected."}

## Findings

### Blockers
{Issues that MUST be fixed before shipping. Each blocker follows the Finding Format below.}

### Warnings
{Issues that SHOULD be fixed — real problems but not showstoppers. Same Finding Format.}

### Nits
{Style, naming, minor improvements. Fix agent IGNORES these — they exist only for the orchestrator to optionally surface to the user. Same Finding Format.}

### Needs User Decision
{Ambiguous or architectural issues the fix agent cannot resolve autonomously. The orchestrator must surface these to the user before proceeding. Same Finding Format, but the `suggested_fix` field describes the decision needed instead of a code fix.}

## Summary
{1-3 sentence summary of overall diff quality and key risks.}
```

## Finding Format

Every individual finding (blocker, warning, nit, or user-decision) MUST use this exact structure:

```markdown
#### {SHORT_TITLE}
- **File:** `{file_path}:{start_line}-{end_line}`
- **Category:** correctness | security | error-handling | dead-code | pattern-violation | test-gap | scope
- **What's wrong:** {1-2 sentence description of the actual problem}
- **Why it matters:** {1 sentence on impact — what breaks, what's exposed, what regresses}
- **Suggested fix:** {Concrete, actionable instruction. NOT vague. Include the specific change needed.}
- **Reference pattern:** `{file_path}:{line}` — {brief description of existing code that shows the correct pattern}
```

### Field Rules

| Field | Required | Notes |
|---|---|---|
| File | Always | Must be exact path + line range. The fix agent will `Read` this file. |
| Category | Always | One of the fixed set. Helps fix agent prioritize. |
| What's wrong | Always | Factual. No hedging ("might be", "could potentially"). State the problem. |
| Why it matters | Always | Explains severity. Helps the orchestrator validate severity classification. |
| Suggested fix | Always | For blockers/warnings: a specific code-level instruction. For user-decisions: describe the tradeoff. |
| Reference pattern | If exists | Point to existing code in the repo that demonstrates the correct approach. Massively helps the fix agent. Omit only if no reference exists. |

## Categories Explained

| Category | What to look for |
|---|---|
| **correctness** | Logic bugs, wrong conditions, off-by-ones, race conditions, null/undefined access, wrong variable, missing return |
| **security** | XSS, injection, missing auth checks, exposed secrets, OWASP top 10 patterns, Firestore rule implications |
| **error-handling** | Silent catches, swallowed errors, missing try/catch around async ops, unhandled promise rejections, missing user feedback on failure |
| **dead-code** | Console.logs left in, commented-out code, unused imports/variables, debug artifacts |
| **pattern-violation** | Deviates from established codebase patterns (e.g., uses local state where codebase uses context, skips SaveQueue, inconsistent naming) |
| **test-gap** | Acceptance criterion lacks test coverage, edge case not tested, test assertions too weak |
| **scope** | Under-delivery (missing AC) or scope creep (unjustified change). These go in Scope Alignment, not Findings. |

## Severity Classification Rules

The audit agent MUST classify each finding using these rules:

**Blocker** — ship-blocking, must fix:
- Any `correctness` bug that affects core functionality
- Any `security` issue
- Any `scope` finding where an acceptance criterion is missing (under-delivery)
- Any `test-gap` where an acceptance criterion has zero test coverage
- Any `error-handling` issue that causes silent data loss

**Warning** — should fix, real problem:
- `correctness` bugs in edge cases (non-happy-path)
- `error-handling` issues that degrade UX but don't lose data
- `pattern-violation` that makes the code inconsistent with surrounding code
- `dead-code` that's clearly debug artifacts (console.log, commented blocks)
- `test-gap` where edge cases aren't covered (but happy path is)

**Nit** — optional, cosmetic:
- Minor naming inconsistencies
- Slightly verbose code that could be cleaner
- Style preferences not enforced by linter

**Needs User Decision** — cannot be resolved by the fix agent:
- Scope creep that might be intentional (the user may want the extra change)
- Architectural choices with genuine tradeoffs (e.g., "this works but doesn't follow the pattern used elsewhere — intentional?")
- Missing acceptance criteria that suggest the issue description is incomplete
- Performance tradeoffs (e.g., "this adds a Firestore read per render — acceptable?")

## Verdict Rules

The audit agent sets the verdict based on findings:

- **CLEAN** — zero blockers AND zero warnings. Nits and user-decisions may exist.
- **HAS_FINDINGS** — one or more blockers OR warnings exist.

The orchestrator uses the verdict to decide whether to loop:
- `CLEAN` → proceed to ship
- `HAS_FINDINGS` → spawn fix agent → re-audit

## What the Audit Agent Receives

The orchestrator provides the audit agent with:

1. **Linear issue** — full title, description, acceptance criteria (the source of truth)
2. **Diff** — output of `git diff dev...HEAD` (or `git diff` for uncommitted changes)
3. **High-level overview** — the codebase overview file for orientation
4. **Explore summary** — (only if the orchestrator spawned an Explore agent) contextual summary of areas touched by the diff

## What the Fix Agent Receives

The orchestrator provides the fix agent with:

1. **Audit report** — the full report in the format above
2. **Linear issue** — title, description, acceptance criteria (so it understands the goal)
3. **Instructions** — fix all blockers and warnings. Ignore nits. Do not resolve user-decision items. Run tests after fixing.

The fix agent:
- Reads the files referenced in each finding
- Reads the reference pattern files when provided
- Applies the suggested fixes
- Runs available tests (`npm run test` in `montessori-os/`, `npm run lint` in `functions/`)
- Reports what it fixed and test results

## Anti-Patterns (Audit Agent Must Avoid)

- **Vague findings:** "The error handling seems incomplete" — WHERE? WHICH error? WHAT's missing?
- **Missing line numbers:** Every finding MUST reference specific lines. If you can't point to a line, it's not a real finding.
- **Hallucinated issues:** Only report problems you can see in the actual diff. Do not invent hypothetical issues.
- **Reviewing unchanged code:** Only audit the diff. Existing code outside the diff is out of scope (unless the diff breaks it).
- **False positives on patterns:** If you're unsure whether something is a pattern violation, classify it as a nit, not a warning. When in doubt, downgrade.
- **Scope-policing valid work:** If a change is small and clearly supports the acceptance criteria (e.g., a helper function, an import), don't flag it as scope creep.
