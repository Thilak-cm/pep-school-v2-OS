# Agentic SDLC Pipeline Inventory

Generated: 2026-09-06
Source: literal extraction from all files under `.agents/`, `.claude/`, and `CLAUDE.md`

---

## 1. Pipeline Stages, As Built

### Stage 0: /draft-github-issues
**Skill file:** `.agents/skills/draft-linear-issues/SKILL.md` (directory name is a legacy alias; frontmatter name is `draft-github-issues`)

| Input artifacts | Output artifacts |
|---|---|
| Full meeting transcript (pasted by user) | Meeting archive at `meeting-notes/{YYYY}/{YYYY-MM-DD}-{slug}.md` |
| `pep-os-overview.md` (Area Map, read silently) | GitHub Issues on `Thilak-cm/pep-school-v2-OS` with `## Summary`, `### Context from Discussion`, `Source: Meeting Transcript` footer |
| Existing GitHub issues (dedup search via `gh issue list --search`) | Issues added to GitHub Project #3, Status = `Backlog` |

**Subagents invoked:** None.

---

### Stage 1: /spec-issue
**Skill file:** `.agents/skills/spec-issue/SKILL.md`

| Input artifacts | Output artifacts |
|---|---|
| GitHub issue identifier (`#42`) | Updated GitHub Issue: title, description (with ACs, Decisions Made, Out of Scope), priority, labels, assignee |
| `pep-os-overview.md` (read without asking) | Status change: Backlog -> Todo (if not already Todo or later) |
| codebase-explorer results (conditional) | No files written to disk |
| convergence-checker result (mandatory) | |

**Subagents invoked:**
1. **codebase-explorer** - conditional by complexity tier:
   - Simple: none. Moderate: 1 explorer, depth `overview`. Complex: 1 per area in parallel, depth `deep`. Cross-cutting: 2 parallel `deep`.
   - Focus: `"refinement"`. Merged before grilling.
2. **convergence-checker** - mandatory exit gate after grilling. Returns `SINGLE_PATH` or `MULTIPLE_PATHS`. On `MULTIPLE_PATHS`, forks become grilling questions, checker re-runs until `SINGLE_PATH`.

---

### Stage 2: /plan-issue
**Skill file:** `.agents/skills/plan-issue/SKILL.md`

| Input artifacts | Output artifacts |
|---|---|
| GitHub Issue (via `gh issue view` or session context) | Approved plan in **conversation context only** (no disk artifact) |
| `pep-os-overview.md` | Baseline test results |
| codebase-explorer results (conditional) | Instruction to run `/implement-issue` in same session |
| Baseline test run (`npm run test`) | |

**Subagents invoked:**
1. **codebase-explorer** - conditional: "If the overview is insufficient for the inferred areas." Focus: `"implementation"`.

---

### Stage 3: /implement-issue
**Skill file:** `.agents/skills/implement-issue/SKILL.md`

| Input artifacts | Output artifacts |
|---|---|
| Approved plan from conversation context (same session) | Feature branch: `{issue-id}-{slug}` |
| GitHub Issue (from plan context) | Commits: `test: ...` then `feat/fix: ... (#NNN)` |
| | GitHub Issue comment (branch, commits, files, AC test coverage, "Ready for independent review") |

**Subagents invoked:** None.
**Reference docs consumed:** `tdd-testing-guide.md`, `quick-start.md`

---

### Stage 4: /review-issue
**Skill file:** `.agents/skills/review-issue/SKILL.md`

| Input artifacts | Output artifacts |
|---|---|
| Feature branch (checked out) | Merged Audit Report |
| GitHub Issue (via `gh issue view`) | Code fixes applied to branch |
| Diff (`git diff dev...HEAD`) | Version bump + CHANGELOG update |
| `pep-os-overview.md` | `DATA_STRUCTURE.md` update (if Firestore changes) |
| | Branch pushed to remote |
| | PR via `gh pr create` targeting `dev`, body includes `Closes #NNN` + Human Review Risk Assessment |
| | GitHub Issue comment (branch, PR URL, version, audit summary, test results) |

**Subagents invoked:**
1. **codebase-explorer** - conditional (4+ files across areas, shared infrastructure, security rules). Focus: `"review"`.
2. **code-auditor** (quick scope) - parallel with deep. Input: diff only.
3. **code-auditor** (deep scope) - parallel with quick. Input: diff + issue + overview + explore summary. Adversarial stance.
4. **code-fixer** - after audits. Overlapped: starts on quick findings immediately, serializes or parallelizes with deep findings based on file overlap.
5. **impact-checker** - Phase 3, parallel with fix loop. Input: diff, stat, issue, overview.
6. **code-auditor** (full scope) - re-audit loop. Fresh agent per iteration, no memory of prior audits.
7. **code-fixer** - after impact findings if any.

**Reference docs consumed:** `audit-report-contract.md`, `review-risk-contract.md`

---

### Stage 5: /merge-issue
**Skill file:** `.agents/skills/merge-issue/SKILL.md`

| Input artifacts | Output artifacts |
|---|---|
| PR (via `gh pr list --head <branch>`) | Merge via `gh pr merge` (repo default strategy) |
| Human Review Risk Assessment from PR body | Branch deleted (local `-d` + remote `--delete`) |
| CI check results (`gh pr checks`) | GitHub Issue closed |
| Review comments | Project Status = `Done` |
| | GitHub Issue comment (merge confirmation, commit range, PR URL, version) |
| | Refreshed `pep-os-overview.md` (auto-invokes `/codebase-context-scan`) |

**Subagents invoked:** None. Invokes `/codebase-context-scan` skill automatically.

---

### Side Rails

| Skill | Purpose | Subagents | Read/Write |
|---|---|---|---|
| `/rca` | Root-cause-first bug fixing | codebase-explorer, code-fixer | Read-only until Phase 5 (fix) |
| `/meeting-prep` | Evidence-backed meeting brief | None | Read-only |
| `/impact-check` | On-demand blast-radius analysis | impact-checker | Read-only |
| `/codebase-context-scan` | Refresh `pep-os-overview.md` | None | Writes overview file |
| `/catch-me-up` | Briefing on any work slice | None | Read-only |
| `/check-schema-sync` | Firestore vs DATA_STRUCTURE.md vs MCP | None | Writes after approval |
| `/explain-this` | Socratic concept teaching | None | Read-only |
| `/handoff` | Session handoff document | None | Writes to `$TMPDIR` only |

---

## 2. Human Gates

### (a) No-cheap-verifier gates (requires human judgment)

| Stage | Gate | Instruction text |
|---|---|---|
| spec-issue | Every grilling question | "One question per message. Wait for each answer before continuing." |
| spec-issue | Draft approval | "Never update GitHub before explicit approval." |
| plan-issue | Plan approval | "Present the complete plan, area tags, risk profile, and test baseline. Iterate on user feedback until approved." |
| plan-issue | Staleness decision | "If 5+ commits since or 7+ days old, ask the user whether to refresh via `/codebase-context-scan` or proceed with the stale overview." |
| review-issue | User decisions | "Resolve 'Needs User Decision' items first - user decisions reclassify items." |
| review-issue | Version bump type | "Always ask the user which bump type to apply. Present your recommendation." |
| draft-github-issues | Item walkthrough | User picks Create, Skip, or Edit per item. |

### (b) Shared/irreversible-write gates

| Stage | Gate | Instruction text |
|---|---|---|
| implement-issue | Manual verification before commit | "Present the tailored checklist (Phase 3) and wait for user confirmation." |
| implement-issue | E2E confirmation | "Ask: 'Have you manually verified the e2e flow?' ... Do NOT present the next step until the user explicitly confirms it works." |
| review-issue | UI smoke check | "If the diff touches `.jsx` component files, present a manual verification checklist before proceeding." |
| merge-issue | Merge approval | "Always confirm with the user before merging - this changes shared history." |
| merge-issue | High/Critical risk | "require evidence of the named human review before merge; Critical also requires explicit approval from the designated approver." |
| rca | Fix approval | "Present the proof and get explicit user agreement before Phase 5." |
| rca | Post-fix verification | "Ask 'Have you verified the fix?'" |
| check-schema-sync | Layer 1 approval | "Wait for user response. Do NOT proceed without explicit approval." |
| check-schema-sync | Layer 2 approval | "Wait for user response. Do NOT proceed without explicit approval." |

### (c) Neither (flagged)

| Stage | Gate | Note |
|---|---|---|
| draft-github-issues | Summary Preview | "Ask the user to correct takeaways, remove items, adjust groupings, or proceed." - This is a courtesy checkpoint, not a safety gate. No irreversible write has happened and no judgment is required. |

---

## 3. Verification Machinery

### Where tests are authored

**plan-issue** creates the test specification:
> "**CRITICAL: Every acceptance criterion MUST map to at least one test.**"
> "Test Specification: [Per acceptance criterion: test type (unit/integration/e2e), test file (new or existing), test description, edge cases]"

Context available: issue ACs + codebase exploration + baseline test discovery. No implementation code exists yet.

**implement-issue** writes the actual tests (TDD):
> "**Write tests FIRST** for each acceptance criterion, per the plan's Test Specification. Run them to confirm they FAIL (red). Do not skip this."

### AC-to-test mapping: where checked, by whom

| Where | Who | Instruction |
|---|---|---|
| plan-issue Phase 3 | Main agent | "Every acceptance criterion MUST map to at least one test." |
| implement-issue Phase 1 | Main agent | "Every acceptance criterion must have a passing test, with no regressions. **These are hard blocks.**" |
| tdd-testing-guide.md | Reference doc | "**Requirement 3: No Acceptance Criterion Without Test Coverage - This is a hard stop.**" |
| review-issue / code-auditor (deep) | code-auditor subagent | Checklist item 7: "Test coverage: Does every acceptance criterion have test coverage?" Missing = Blocker. |

### Review loop termination

**CLEAN definition** (from `audit-report-contract.md`):
> "**CLEAN** - zero blockers AND zero warnings. Nits and user-decisions may exist."

**Iteration cap:** 3 re-audit iterations.
> "**Max 3 re-audit iterations.** After 3, stop and escalate to user."

Cap-out behavior: "stop and escalate to user." No automated fallback, no further detail on escalation shape.

**Fresh auditor per iteration:**
> "After initial fixes, spawn a fresh `code-auditor` (scope: `full`) on the updated diff. **Fresh agent, no memory of prior audits.**"

Mechanism: new Agent invocation each time. `code-auditor`'s `agent.json` has no `memory` field (unlike `codebase-explorer` and `impact-checker` which have `memory: "project"`). Each spawn receives only the current diff, not prior audit reports.

---

## 4. Spec-Stage Testability Requirements

**ABSENT.** The spec-issue SKILL.md contains no instruction text about:
- Testability of acceptance criteria
- Sub-function decomposition for testability
- Emulator data provisioning
- v1 instrumentation requirements

The only testability-adjacent text is the template placeholder:
> `- Acceptance Criteria: [ ] [Measurable, testable requirements]`

This is a gap. Testing specificity lives downstream in plan-issue ("Every acceptance criterion MUST map to at least one test") and implement-issue (TDD enforcement). Spec-issue does not constrain AC authoring to be test-friendly.

---

## 5. State Carriers

| Transition | Carrier | Format | Conversation-only? |
|---|---|---|---|
| draft-github-issues -> spec-issue | GitHub Issue body | `Source: Meeting Transcript` footer detected by spec-issue | No |
| spec-issue -> plan-issue | GitHub Issue body | `Decisions Made` section carries resolved constraints | No |
| plan-issue -> implement-issue | **Conversation context** | "The approved plan stays in conversation context. Run `/implement-issue` in the **same session** to execute it." | **YES** |
| implement-issue -> review-issue | Feature branch + GitHub Issue comment | `/clear` wipes plan context; branch + comment are durable | No |
| review-issue -> merge-issue | PR body + PR state on GitHub | `Closes #NNN` + Human Review Risk Assessment | No |

**Flagged:** plan-issue -> implement-issue is the only conversation-only transition. If the session is lost, the plan is lost and `/plan-issue` must be re-run. This is by design (plan-issue instruction: "The approved plan stays in conversation context") but is the single fragile handoff in the pipeline.

---

## 6. Guardrails and Their Enforcement

### Branch rules

| Rule | Source | Enforcement |
|---|---|---|
| Never push to master/main without approval | CLAUDE.md + memory | **Hook:** `PreToolUse` on `Bash(git push*)`, script `.claude/hooks/block-master-push.sh`, exit 2 to block |
| Never merge feature PRs to master | Memory (`feedback_never_merge_to_master.md`) | Instruction text only |
| PRs from alt-pepos target alt-dev | Memory (`feedback_alt_dev_pr_target.md`) | Instruction text only |
| Create feature branch first, never edit on dev/main | implement-issue | Instruction text: "Never edit files on `dev`, `main`, or a reused branch." |
| Delete with safe `-d`, never `-D` | merge-issue | Instruction text: "local with safe `-d` (never `-D`)" |
| No rebase or force-push by default | merge-issue | Instruction text: "ask for explicit approval if either would materially simplify resolution" |

### Iteration caps

| Rule | Source | Enforcement |
|---|---|---|
| Max 3 re-audit iterations | review-issue | Instruction text only |
| Max 3 CI fix attempts | merge-issue | Instruction text only |
| Max 3 fix iterations | rca | Instruction text only |
| Max 3 edit rounds per draft item | draft-github-issues | Instruction text: "max 3 edit rounds, then force Create or Skip" |

### Merge conditions

| Rule | Source | Enforcement |
|---|---|---|
| Never merge with failing/pending checks | merge-issue | Instruction text: "the primary safety gate" |
| Never merge with unresolved review comments | merge-issue | Instruction text only |
| Re-run checks after post-review push | merge-issue | Instruction text only |
| High/Critical risk requires named human review | merge-issue + review-risk-contract.md | Instruction text only |

### Read-only constraints

| Rule | Source | Enforcement |
|---|---|---|
| plan-issue is read-only | plan-issue | Instruction text: "No file edits, branches, or commits during this skill." |
| code-auditor is read-only | code-auditor instructions.md | Instruction text: "You are read-only - never modify files." |
| impact-checker is read-only | impact-checker instructions.md | Instruction text only |
| codebase-explorer is read-only | codebase-explorer instructions.md | Instruction text only |
| convergence-checker is read-only | convergence-checker instructions.md | Instruction text only |
| rca is read-only until Phase 5 | rca SKILL.md | Instruction text: "Read-only until Phase 5. Phases 1-4 are investigation only." |

### Other guardrails

| Rule | Source | Enforcement |
|---|---|---|
| Firestore scripts dry-run by default | CLAUDE.md | Instruction text: "require an explicit `--yes` flag before applying writes" |
| Storage rules max 2 `firestore.get()` | CLAUDE.md | Instruction text only |
| Every LLM call must include Langfuse tracing | CLAUDE.md | Instruction text only |
| Commit message format: `type: subject (#NNN)` | CLAUDE.md + implement-issue | Instruction text only |
| RCA before any code fix | CLAUDE.md (global) | Instruction text only |
| No code changes without user approval after RCA | CLAUDE.md (global) | Instruction text only |
| Trunk code requires human approval of proposed review | CLAUDE.md | Instruction text only |
| Do not close issue during implement-issue | implement-issue | Instruction text: "Do NOT close the issue or move it to Done" |
| Do not merge during review-issue | review-issue | Instruction text: "Do not merge." |
| handoff writes only to temp dir | handoff | Instruction text: "Temp dir only. Never write handoff files into the workspace/repo." |

### All hooks (exhaustive)

| # | Event | Matcher | Condition | Type | Script | Status |
|---|---|---|---|---|---|---|
| 1 | PreToolUse | Bash | `Bash(git push*)` | command | `.claude/hooks/block-master-push.sh` | Active |

No inactive hooks. No other hook configurations found in any settings file.

---

## 7. Debug/Bypass Affordances

### Dry-run flags

| Affordance | Where defined | What it does | Logging |
|---|---|---|---|
| `--yes` flag on Firestore scripts | CLAUDE.md | Scripts are dry-run by default; `--yes` enables writes | Dry-run output shows documents and fields (not values) |
| `--no-drive-probe` on audit script | `scripts/ops/audit-monthly-plan-drive.mjs` | Skips Drive API probes, Firestore-only | Reports "probe skipped" in output |

### Skip/bypass affordances

| Affordance | Where defined | What it does | Logging |
|---|---|---|---|
| plan-issue staleness bypass | plan-issue SKILL.md | User can proceed with stale overview (5+ commits or 7+ days old) | No logging |
| `/clear` between implement and review | implement-issue SKILL.md | Intentional context wipe for review independence | No logging - by design |
| `--skip-drive-verify` | ABSENT | Not found in any skill or script | N/A |

### Idempotency gates

| Gate | Where | Bypass |
|---|---|---|
| implement-issue plan check | implement-issue | None - hard stop: "If not found, stop." |
| merge-issue CI check | merge-issue | None - "Never merge with failing or pending required checks" |
| codebase-context-scan auto-refresh | merge-issue Phase 7 | Unconditional, no bypass: "Automatically invoke... no prompt needed." |

No skill has a `--dry-run`, `--skip`, or `--force` flag. All gates are interactive approval via conversation.

---

## 8. Counts and Residue

### Exact counts

| Category | Count | Items |
|---|---|---|
| Pipeline stage skills | 6 | draft-github-issues, spec-issue, plan-issue, implement-issue, review-issue, merge-issue |
| Side rail skills | 8 | rca, meeting-prep, impact-check, codebase-context-scan, catch-me-up, check-schema-sync, explain-this, handoff |
| **Total skills** | **14** | |
| Subagents (with definitions) | 5 | code-auditor, code-fixer, codebase-explorer, convergence-checker, impact-checker |
| Subagents (adapter-only, no definition) | 1 | access-control-divergence-checker |
| **Total subagents** | **6** | |
| Hooks | 1 | block-master-push (PreToolUse/Bash) |
| Reference docs | 4 | audit-report-contract.md, review-risk-contract.md, tdd-testing-guide.md, quick-start.md |

### Orphaned / unreferenced files

| File | Issue |
|---|---|
| `.claude/agents/access-control-divergence-checker.md` | No matching definition in `.agents/subagents/definitions/`. Not generated by `generate-adapters.mjs`. Not explicitly invoked by name in any pipeline skill. Available for manual use. |
| `.agents/skills/PIPELINE-REDESIGN-PLAN.md` | Not a skill. Contains the canonical workflow diagram and ownership table. Redirect document. |
| `.agents/skills/draft-linear-issues/agents/openai.yaml` | Legacy Codex agent file under the old directory name. |

### Naming inconsistencies

| Inconsistency | Detail |
|---|---|
| Directory name vs skill name | `.agents/skills/draft-linear-issues/` vs frontmatter `name: draft-github-issues`. Documented as "retained temporarily as a compatibility alias." |
| Branch name format | implement-issue says `{issue-id}-{slug}` (e.g., `gh-123-fix-voice-upload`). Issue comments show `256-paginated-delta-stats-refresh` and `264-targetmonth-soul-gen` - no `gh-` prefix in practice. Convention is soft. |
| `access-control-divergence-checker` | Lives only in `.claude/agents/`, not in the generator-managed `.agents/subagents/definitions/`. Exists outside the adapter generation system. |

### Linear residue

| Artifact | Detail |
|---|---|
| `draft-linear-issues` directory name | Retained from Linear era. Skill was renamed to `draft-github-issues` in frontmatter after migration. |
| `catch-me-up` sources | SKILL.md mentions "Linear (pre-migration history)" as a data source. |
| Memory file | `project_github_migration.md`: "Migrated Linear->GitHub Issues+Projects on 2026-06-25; project #3, `#123` format" |

---

## 9. Cap-Out Evidence

Searched all GitHub issue comments (200 most recent issues) for re-audit loops hitting the 3-iteration cap without reaching CLEAN.

**Result: No cap-outs found.**

All review loops that left audit trail in issue comments converged to CLEAN within 1-2 iterations:

| Issue | Iterations to CLEAN | Quote |
|---|---|---|
| #264 | 2 | "Re-audit loop converged in 2 iterations; final verdict: CLEAN" |
| #256 | 1 | "9 findings found, 9 fixed across 1 iteration... Final verdict: CLEAN" |
| #233 | 2 | "8 findings found and fixed across 2 fix iterations, followed by clean re-audits" |
| #229 | 2 | "13 findings found (4 blockers, 9 warnings), all fixed across 2 audit iterations... Final verdict: CLEAN" |

No evidence of the 3-iteration cap being hit. Either: (a) the cap has never been reached, (b) cap-out events were resolved in conversation without being posted to GitHub, or (c) the trail doesn't exist in issue comments. **Classification: NOT DETERMINABLE from issue comments alone** - but no positive evidence of cap-out exists.

---

## Appendix: Subagent Configuration Details

| Subagent | Model | Tools | Color | Memory | Invoked by |
|---|---|---|---|---|---|
| code-auditor | sonnet | Bash, Glob, Grep, Read, WebFetch, WebSearch | pink | none | review-issue |
| code-fixer | opus | Bash, Glob, Grep, Read, Edit, Write, NotebookEdit, WebFetch, WebSearch, Skill | purple | none | review-issue, rca |
| codebase-explorer | sonnet | Bash, Glob, Grep, Read | purple | project | spec-issue, plan-issue, review-issue, rca, impact-check |
| convergence-checker | sonnet | Bash, Glob, Grep, Read | cyan | none | spec-issue |
| impact-checker | sonnet | Bash, Glob, Grep, Read | orange | project | review-issue, impact-check |
| access-control-divergence-checker | sonnet | Bash, Glob, Grep, Read | purple | project | Not explicitly invoked by any skill |
