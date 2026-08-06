# Post-Implementation Pipeline Redesign — Continuation Plan

Session date: 2026-02-27
Status: Partially complete, pick up remaining tasks in a fresh session.

## Context

Redesigning the post-implementation pipeline. The old flow (`/implement-issue` → `/wrapup-issue` → `/version-update` → `/merge-issue`) had a self-audit problem: the same session that wrote code also reviewed it. The new flow uses independent subagents for review with a fix loop.

### New Pipeline
```
/draft-linear-issues → /spec-issue → /plan-issue → /implement-issue
                                                    ↓
                                               /clear
                                                    ↓
                                               /review-issue  (NEW)
                                                    ↓
                                                 [CI runs]
                                                    ↓
                                               /merge-issue  (updated)
```

### Architecture of /review-issue
```
Orchestrator (thin, protects main context)
    ├── Explore subagent (built-in, conditional)
    ├── code-auditor subagent (custom, .claude/agents/)
    └── code-fixer subagent (custom, .claude/agents/)
```

## What's DONE

### 1. Audit report contract ✅
- File: `.claude/skills/review-issue/references/audit-report-contract.md`
- Defines structured format between audit and fix agents
- Severity levels, finding format, verdict rules, anti-patterns

### 2. /review-issue skill ✅
- File: `.claude/skills/review-issue/SKILL.md`
- File: `.claude/skills/review-issue/agents/openai.yaml`
- 7-phase orchestrator: context load → explore (conditional) → audit → fix loop → version bump → commit/PR → Linear sync
- Max 3 fix-loop iterations
- Version bump absorbed from old /version-update

### 3. /merge-issue updated ✅
- File: `.claude/skills/merge-issue/SKILL.md`
- Added CI enforcement (blocks on failing/pending checks)
- Added Phase 5: prompt to run /codebase-context-scan after merge

### 4. /implement-issue updated ✅
- File: `.claude/skills/implement-issue/SKILL.md`
- Phase 7 no longer moves issue to "In Review" (that's /review-issue's job)
- Added "Next Step" section: /clear → /review-issue

## What's LEFT TO DO

### Task A: Create custom subagents in `.claude/agents/`

Create two files. Format: Markdown with YAML frontmatter.

**`.claude/agents/code-auditor.md`**
- Read-only agent (tools: Read, Grep, Glob, Bash)
- System prompt should bake in the FULL audit report contract from `references/audit-report-contract.md`
- Purpose: receives diff + Linear issue + overview, produces structured audit report
- Model: inherit (use parent model for thoroughness)
- Key: the agent must follow the contract format EXACTLY — this is the interface the fix agent consumes

**`.claude/agents/code-fixer.md`**
- Edit-capable agent (tools: Read, Edit, Write, Bash, Grep, Glob)
- Purpose: receives audit report findings (blockers + warnings only), reads referenced files, applies fixes, runs tests
- Rules: ignore nits, do NOT address "Needs User Decision" items
- Must run tests after fixing: `npm run test` in montessori-os/, `npm run lint` in functions/
- Reports: what was fixed, test results, anything it couldn't fix

### Task B: Update /review-issue to reference custom subagents

Currently the SKILL.md has full prompt templates for the audit and fix subagents. Once custom agents exist in `.claude/agents/`, update the skill to reference them by name instead:
- "Use the code-auditor subagent to audit the diff" (pass: diff, issue, overview as data)
- "Use the code-fixer subagent to fix the findings" (pass: audit report, issue as data)

This makes the SKILL.md lighter and the agent prompts maintainable in one place.

### Task C: Retire /codebase-context-deep-dive

The Explore subagent replaces static deep-dives. Changes needed:

1. **Delete** `.claude/skills/codebase-context-deep-dive/` directory (skill, scripts, agents yaml, and the static deep-dive files in references/deep-dives/)

2. **Update `/implement-issue` Phase 2** — replace deep-dive loading with:
   - Load high-level overview (keep as-is)
   - Check overview staleness (see Task D)
   - If the issue touches complex/unfamiliar areas → spawn Explore subagent (same pattern as /review-issue Phase 1b)
   - Remove all references to "deep-dives", "deep-dive reports", generating deep-dives
   - Update edge case "No deep-dives exist" → remove it
   - Update success criteria line about "overview + deep-dives" → "overview + explore context"

3. **Update `/spec-issue`** — Context Loading section:
   - Remove steps 4-5 (loading deep-dives, generating deep-dives)
   - Replace with: "If context is insufficient from overview alone, spawn an Explore subagent to understand the relevant codebase area"
   - Update guardrails to remove deep-dive permission references
   - Update defaults to remove "then matching deep dives when available"

4. **Update `/codebase-context-scan`**:
   - Remove "Deep Dive Pointers" section from the SKILL.md output contract
   - Update `scripts/generate-overview.mjs`:
     - Remove `deepDiveRoot` constant
     - Remove the deep-dive pointer generation loop (lines ~364-373)
     - Remove the "Deep Dive Pointers" table from the output (lines ~447-454)
   - Remove the deep-dive reference from the overview output contract in SKILL.md

5. **Update `/draft-linear-issues`** — remove the line "Do not load deep-dives — that is /spec-issue's job during refinement" (since deep-dives no longer exist)

6. **Stale `.codex/` directory** — optionally delete `.codex/skills/` entirely (old copies of skills from a previous tool, not used by Claude Code)

### Task D: Add overview staleness check to /implement-issue

In Phase 2, before loading the overview:
- Read the `Generated:` timestamp from `pep-os-overview.md` (line 3)
- Count commits since that date: `git log --oneline --after="{date}" | wc -l`
- If 5+ commits or 7+ days old, warn user:
  "Overview was generated on {date}, {N} commits ago. Refresh with /codebase-context-scan before continuing?"
- If user says yes, invoke the codebase-context-scan skill
- If user says skip, proceed with stale overview

### Task E: Manual cleanup (user action)

These directories need manual deletion:
- `.claude/skills/wrapup-issue/` — replaced by /review-issue
- `.claude/skills/version-update/` — absorbed into /review-issue Phase 5

## Recommended Execution Order

```
A (create agents) → B (update review-issue refs)
                ↘
C (retire deep-dives) + D (staleness check)  — can run in parallel with A→B
                ↘
E (manual cleanup)
```

## Files Reference

| File | Status | Notes |
|---|---|---|
| `.claude/skills/review-issue/SKILL.md` | ✅ Created | Orchestrator skill |
| `.claude/skills/review-issue/agents/openai.yaml` | ✅ Created | Agent metadata |
| `.claude/skills/review-issue/references/audit-report-contract.md` | ✅ Created | Interface contract |
| `.claude/skills/merge-issue/SKILL.md` | ✅ Updated | CI enforcement + overview refresh |
| `.claude/skills/implement-issue/SKILL.md` | ✅ Updated | No state change in Phase 7, /clear next step |
| `.claude/agents/code-auditor.md` | ❌ TODO | Task A |
| `.claude/agents/code-fixer.md` | ❌ TODO | Task A |
| `.claude/skills/codebase-context-deep-dive/` | ❌ TODO delete | Task C |
| `.claude/skills/wrapup-issue/` | ❌ TODO delete | Task E (manual) |
| `.claude/skills/version-update/` | ❌ TODO delete | Task E (manual) |

## Key Design Decisions (for context)

- **Subagent approach (Option B):** Audit + fix as separate subagents, orchestrator stays thin. Chosen over monolithic (context bloat) and hybrid (defeats purpose if many fixes).
- **Audit report contract is the linchpin:** Precision in the report determines fix quality. Rigid format with file:line refs, categories, severity rules.
- **Max 3 fix loops:** Hard cap to prevent infinite loops. Escalates to user after 3.
- **Version bump inline:** Absorbed into /review-issue Phase 5. No separate skill, no CI rerun.
- **Overview refresh at merge:** /merge-issue Phase 5 prompts after landing a PR. Staleness check in /implement-issue Phase 2 as safety net.
- **Explore replaces deep-dives:** Dynamic, always fresh, scoped to the actual issue. No maintenance burden.
- **/clear for session transition:** /implement-issue suggests /clear → /review-issue for seamless handoff. Branch stays checked out, review-issue auto-detects issue from branch name.
