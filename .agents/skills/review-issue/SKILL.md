---
name: review-issue
description: "Independent code review in a fresh session: audit diff against GitHub issue, fix-loop until clean, version bump, commit, push, open PR against dev, and update GitHub issue status. Use after /implement-issue completes, in a NEW Claude session."
---

# Review Issue

## Goal

Provide an independent quality gate between implementation and production. This skill runs in a **fresh Claude session** (not the one that wrote the code) and orchestrates subagents to audit the diff, fix issues, and re-audit in a loop until the code is clean — then ships it.

The orchestrator itself stays thin. Heavy work (reading diffs, auditing code, making fixes) is delegated to subagents so the main context is protected and the audit loop can run as many times as needed without degradation.

## When to Use

- After `/plan-issue` + `/implement-issue` completes in a separate session
- You are in a **new Claude session** (fresh context, no implementation bias)
- The feature branch has committed or uncommitted changes ready for review
- You want the only quality gate before prod to be rigorous

## Prerequisites

- Implementation is done (code written, tests passing locally)
- A feature branch exists with the changes (committed or uncommitted)
- The GitHub issue is identifiable (from branch name, session context, or user input)

## Architecture

```
Orchestrator (this skill — thin, stays in main context)
    │
    ├── Explore subagent (Task/Explore)                — only if diff is complex
    │
    ├── PARALLEL AUDIT ────────────────────────────────
    │   ├── Quick auditor (.claude/agents/code-auditor, scope=quick)  — fast mechanical checks
    │   └── Deep auditor  (.claude/agents/code-auditor, scope=deep)   — reasoning-heavy checks
    │
    ├── IMPACT CHECK ──────────────────────────────────
    │   └── Impact checker (.claude/agents/impact-checker)
    │       → transitive consumer tracing (not just 1-hop)
    │       → cross-boundary contracts (frontend ↔ functions ↔ rules)
    │       → security rule cascade analysis
    │       → navigation graph integrity
    │       → config/flag dependency check
    │       → data shape ripple check
    │       → behavioral side effect detection
    │
    ├── OVERLAPPED FIX ────────────────────────────────
    │   ├── Fixer-A (.claude/agents/code-fixer)  — fixes quick findings (starts as soon as quick audit returns)
    │   └── Fixer-B (.claude/agents/code-fixer)  — fixes deep + integration findings (parallel if no file overlap, else after A)
    │
    └── RE-AUDIT LOOP ────────────────────────────────
        ├── Full auditor (.claude/agents/code-auditor, scope=full)  — fresh, complete re-audit
        └── Fixer (.claude/agents/code-fixer)                       — single fixer for remaining findings
```

The audit report contract at `references/audit-report-contract.md` defines the exact format the audit agent outputs and the fix agent consumes. Both quick and deep auditors produce reports in the same format — the orchestrator merges them before displaying to the user.

## Workflow

### Phase 1: Context Load (Orchestrator)

Gather everything the audit agent will need. The orchestrator does this directly — it's lightweight.

1. **Identify the GitHub issue**
   - Infer from branch name (e.g., `60-report-generation-ui` → `#60`)
   - Or ask the user
   - Run `gh issue view <number> --repo Thilak-cm/pep-school-v2-OS --json title,body,labels,assignees,state`
   - Extract: title, description, acceptance criteria, labels

2. **Capture the diff**
   - `git branch --show-current` — confirm on feature branch
   - `git diff dev...HEAD` — committed changes vs dev
   - `git diff` — any uncommitted changes
   - `git diff --stat dev...HEAD` — file-level summary for complexity assessment
   - `git log --oneline dev..HEAD` — commits on the branch

3. **Load the high-level overview**
   - Read `.claude/skills/codebase-context-scan/references/pep-os-overview.md`
   - This gives the audit agent enough orientation for most issues

4. **Assess whether an Explore agent is needed**

   Spawn an Explore subagent ONLY if any of these are true:
   - The diff touches **4+ files** across different areas of the codebase
   - The diff modifies **shared infrastructure** (firebase.js, App.jsx, saveQueue.js, roleUtils.js, firestore.rules, storage.rules, functions/index.js)
   - The diff introduces a **new component or service** not covered by the overview
   - The diff touches **security rules or Cloud Functions** (these have non-obvious constraints)

   If none apply, skip the Explore agent — the overview + diff is sufficient context.

### Phase 1b: Codebase Explorer Agent (Conditional)

Only if Phase 1 determined exploration is needed.

**Spawn the `codebase-explorer` agent (`.claude/agents/codebase-explorer.md`).**

**Data to pass to the codebase-explorer agent:**
- `overview_content`: The full text of `pep-os-overview.md` (already loaded in Phase 1)
- `target_areas`: Inferred from the diff — map modified files back to area tags using the Area Map
- `issue_context`: Issue title + acceptance criteria from Phase 1
- `exploration_focus`: `"review"` (find conventions to check against, constraints to verify, neighboring code for pattern comparison)
- `specific_files`: The file paths from `git diff --stat` output

**Output:** A structured exploration summary to pass to the audit agent alongside the overview.

### Phase 2: Parallel Audit

The audit is split into two parallel agents with different scopes to enable overlapped fixing.

**2a. Spawn both auditors in parallel (same moment):**

| Agent | Scope | Input | Why |
|-------|-------|-------|-----|
| **Quick auditor** (Sonnet) | `quick` | Diff only | Fast mechanical checks — dead code, debug artifacts, unused imports, obvious async errors |
| **Deep auditor** (Sonnet) | `deep` | Diff + GitHub issue + overview + explore summary | Reasoning-heavy checks — scope alignment, correctness, security, patterns, test coverage |

Both agents output structured reports in the audit report contract format. The quick auditor omits the `Scope Alignment` section.

**2b. As each auditor returns, act immediately:**

```
spawn quick-audit + deep-audit in parallel

when quick-audit returns:
    quick_report = result
    quick_files = set of file paths from quick findings
    if quick_report has findings:
        spawn fixer-A in background with quick_report findings

when deep-audit returns:
    deep_report = result
    deep_files = set of file paths from deep findings
    if deep_report has findings:
        overlap = quick_files ∩ deep_files
        if overlap is empty OR fixer-A is already done:
            spawn fixer-B immediately
        else:
            wait for fixer-A to finish, then spawn fixer-B

wait for all fixers to complete
```

The orchestrator determines file overlap by extracting the `File:` field from each finding. If fixer-A and fixer-B would touch different files, they can run concurrently. If they share any file, serialize them to avoid conflicts.

**2c. Merge reports for display:**

Concatenate both reports into a single merged report for the user. Use the deep report's Scope Alignment section. Combine findings from both reports under the standard Blockers/Warnings/Nits/User Decision sections. Deduplicate any findings that appear in both (same file + same line range = duplicate; keep the higher-severity version).

### Phase 3: Impact Check

**Purpose:** Trace the full blast radius of the diff — every downstream effect, intended or not. The spec audit checks "is the diff correct?" The impact check asks "does the diff break or change anything beyond its immediate scope?" This catches the things that slip through code review: security rule cascades that gate unrelated features, shared utility behavior changes that ripple through 12 consumers, config keys that three features depend on.

**3a. Launch impact checker**

Spawn the **`impact-checker` agent** (`.claude/agents/impact-checker.md`) with:
- **Diff:** The full diff from Phase 1 (`git diff dev...HEAD` + any uncommitted changes)
- **Diff stat:** The file-level summary from Phase 1
- **GitHub issue context:** Title + acceptance criteria (so it can distinguish intended from unintended effects)
- **Codebase overview:** The full text of `pep-os-overview.md` (already loaded in Phase 1)

The impact checker runs 7 analysis phases internally:
1. **Change classification** — categorizes every change by type (exports, props, data shapes, rules, config, navigation, CF contracts, utilities, hooks, services, styles)
2. **Transitive consumer tracing** — follows dependency chains to leaf nodes, not just 1-hop
3. **Security rule cascade analysis** — parses changed `match` blocks, maps ALL code paths hitting those paths, cross-references role/auth conditions
4. **Navigation graph analysis** — builds screen transition graph, checks for broken edges and unreachable screens
5. **Config/flag dependency check** — traces all usages of changed config keys across frontend, functions, and scripts
6. **Data shape ripple check** — finds all readers of changed Firestore collections, checks field compatibility
7. **Behavioral side effect detection** — identifies shared service/utility behavior changes where the interface is the same but the behavior is different

**3b. Process impact results**

The impact checker returns an Impact Analysis Report with findings in the standard audit report contract format (category: `impact`). Each finding includes an `Impact chain` field showing the dependency path from the change to the affected code.

Handle the verdict:
- **NO_IMPACT** — no downstream effects. Skip to Phase 4.
- **CONTAINED** — consumers traced, all compatible. Note in the PR body. Skip to Phase 4.
- **HAS_IMPACT** — findings exist. Merge into the main audit report and proceed to Phase 4.

**3c. Merge into findings**

Impact findings are added to the merged audit report under the same Blockers/Warnings/Nits structure with category `impact`. They flow into the fix loop alongside audit findings. The orchestrator does NOT need to re-classify severity — the impact checker already applies the severity rules from the audit report contract.

### Phase 4: Process Results (Orchestrator)

The orchestrator reads the merged audit report (now including impact findings) and decides next steps.

1. **Display the full merged report to the user** (audit + integration findings combined)

2. **Handle "Needs User Decision" items first**
   - If any exist, present them to the user via `AskUserQuestion`
   - User decisions may convert items into blockers, warnings, or dismissals
   - Rewrite those items into the appropriate category before proceeding

3. **Check the merged verdict**
   - If all clean → proceed to Phase 6 (Version Bump)
   - If findings exist → the fixers already started in Phase 2b for audit findings. For impact findings, spawn a fixer now. Then proceed to Phase 5 (Re-audit).

### Phase 5: Re-audit Loop

After the initial parallel fix pass from Phase 2b, a fresh re-audit validates the fixes.

**5a. Re-Audit (full scope)**

Spawn a single `code-auditor` agent with scope `full` and the updated diff. This is a fresh, complete audit — it has no memory of the previous audits or fixes. It reads the full diff cold. This catches cases where a fix introduced a new problem.

**5b. If clean → Phase 6**

**5c. If findings remain → single fix agent**

Subsequent iterations use a single fixer (no more parallel split — the remaining findings are typically few and may be interrelated).

**5d. Loop Control**

```
max_iterations = 3  (counts from the first re-audit, NOT the initial parallel fix)

for i in 1..max_iterations:
    spawn full re-audit
    if verdict == CLEAN:
        break → proceed to Phase 6
    if i == max_iterations:
        STOP — surface remaining findings to user
        ask: "3 re-audit attempts haven't resolved all issues. Review manually?"
    else:
        spawn fix agent → continue loop
```

### Phase 5e: Manual Smoke Check (User)

After the audit loop passes, present the user with a manual smoke-check checklist for UI changes before proceeding to version bump.

**When to present:** If the diff touches `.jsx` files in `montessori-os/src/components/`.

**Steps:**
1. Build a checklist of screens/flows affected by the diff based on the issue context and modified file paths
2. Present the checklist to the user and ask them to verify each item manually on the dev server
3. Wait for user confirmation before proceeding to Phase 6

**Skip conditions:** Non-UI changes (Cloud Functions only, security rules, scripts, config).

### Phase 6: Version Bump (Orchestrator)

Absorbed from the former `/version-update` skill. Runs inline before committing.

1. **Decide bump type** from the commit prefix, GitHub issue labels, and diff scope. **Always ask the user** which bump type to apply (patch, minor, or major). Present your recommendation with reasoning, but wait for explicit confirmation before proceeding. Use these rules to inform your recommendation:

   **patch** (default) — the vast majority of changes:
   - Bugfixes (`fix:` commits, labels like `Bug`, `Fix`)
   - Small tweaks, refactors, dead code removal, rule fixes
   - Audit-driven fixes, error handling improvements
   - Config changes, lint fixes, dependency updates
   - Any change that modifies existing behavior without adding a new user-facing capability

   **minor** — new user-facing capability:
   - A new UI screen, component, or feature the user can interact with (`feat:` commits adding visible functionality)
   - A new Cloud Function endpoint that serves a new use case
   - A new integration (e.g., new API, new external service)
   - Multiple `feat:` commits in the same PR that together deliver a cohesive new feature

   **major** — a new top-level capability that introduces a new subsystem, data model, or integration surface (~1 major per 10-15 minor releases). **Always ask the user before applying a major bump.** Examples from history:
   - v6.0.0: Baseball Card AI summaries (new `ai_summaries` subcollection, new Cloud Function, new config UI)
   - v7.0.0: Multi-chat support (new `chats/{chatId}/messages` subcollection, chat management UI, chat command centre)
   - v8.0.0: Media notes end-to-end (photo/video/PDF observations, Storage finalize trigger, media timeline tab)
   - v9.0.0: AI report generation pipeline (new Cloud Functions, report prompts, writing snapshots)
   - v10.0.0: Telegram bot foundation (webhook Cloud Function, grammy integration, setup script)

   The pattern: major = introduces a **new noun** to the system (baseball cards, chats, media, reports, telegram bot) with new Firestore collections/subcollections, new Cloud Functions, and a new UI surface. It is NOT about the amount of code changed — a large refactor is still patch.

   **Deciding edge cases:** If the PR has both `fix:` and `feat:` commits, go by the primary intent of the GitHub issue. A `feat:` that adds a small helper to support a bugfix is still patch. A `fix:` that addresses audit feedback on a new feature is still minor (the feature itself drives the bump).

2. **Apply the bump:**
   - Run `node scripts/version.mjs <type>` from repo root
   - Read new version from `VERSION` file
   - Read `CHANGELOG.md`, generate a new entry at the top using Keep a Changelog format:
     ```markdown
     # {version} — {YYYY-MM-DD}

     ### Added / Changed / Fixed
     - {concise, user-facing description of changes from the diff and issue}
     ```
   - Only include sections (Added, Changed, Fixed) that apply
   - Apply the changelog entry directly — no user review needed

### Phase 6b: Update DATA_STRUCTURE.md (Conditional)

Check whether the diff involves Firestore schema changes. Run this check automatically — do not ask the user.

**Detection — any of these in the diff triggers an update:**
- New collection or subcollection paths in Firestore reads/writes (e.g., `collection("foo")`, `doc("students/{id}/newThing/{id}")`)
- New fields being written to existing documents (e.g., `{ ...existingFields, newField: value }`)
- Removed or renamed fields
- New or changed Firestore security rules for collections in `firestore.rules`
- Changes to `DATA_STRUCTURE.md` itself (already modified by the implementation)
- New `ai_prompts` or `config` document patterns

**If schema changes detected:**

1. Read `DATA_STRUCTURE.md` in full
2. Read the relevant sections of the diff that touch Firestore operations (frontend writes, Cloud Function writes, security rules)
3. Update `DATA_STRUCTURE.md` to reflect the changes:
   - **New collections/subcollections:** Add a new section with the TypeScript interface, following the existing format (emoji header, purpose line, interface block, guidance notes)
   - **New fields on existing collections:** Add the field to the existing interface with a comment explaining its purpose
   - **Removed fields:** Remove from the interface. If the field was recently added and might still exist in old docs, add a migration note instead
   - **Collections Overview:** Update the overview list at the top if new collections were added
   - **Renamed fields:** Update the interface and add a migration note if old docs may still have the old name
4. Show the DATA_STRUCTURE.md diff to the user for review before committing
5. Include `DATA_STRUCTURE.md` in the commit

**If no schema changes detected:** Skip this phase entirely.

### Phase 7: Commit + Push + PR (Orchestrator)

1. **Stage and commit**
   - Confirm working tree only contains issue-related changes
   - If unrelated changes exist, ask whether to split/stash/exclude
   - Stage intended files
   - If version was bumped, include version files (`VERSION`, `montessori-os/package.json`, `montessori-os/src/components/VersionBadge.jsx`, `CHANGELOG.md`) in the same or separate commit
   - If `DATA_STRUCTURE.md` was updated in Phase 6b, include it in the implementation commit (not the version bump commit)
   - Write clear commit messages:
     - Implementation: `feat: {description} (#<issue-number>)` or `fix: {description} (#<issue-number>)`
     - Version bump (if separate): `chore: bump version to v{X.Y.Z}`
   - Include `Co-Authored-By: Claude` signoff
   - Show commit hashes and subjects

2. **Push feature branch**
   - `git push origin {branch} -u`
   - Do NOT checkout or merge into `dev`

3. **Open PR via `gh pr create`**
   - Target branch: `dev`
   - PR title: concise, under 70 characters, references issue number
   - PR body must include `Closes #<issue-number>` so GitHub auto-links and closes the issue on merge
   - PR body (use HEREDOC):
     ```markdown
     Closes #<issue-number>

     ## Summary
     {1-3 bullet points from the issue + what was implemented}

     ## Review
     - Independent audit: **passed** ({N} findings fixed in {N} iterations)
     - Impact check: **{verdict}** ({N} downstream effects traced, {N} findings fixed)
     - {if user decisions were made, note them}

     ## Test Results
     - {test pass/fail counts — truthful}
     - {lint results}

     ## Version
     - {new version if bumped, or "no version bump"}

     ## Issue
     - Issue: #<issue-number>
     - Branch: `{branch-name}`

     🤖 Generated with [Claude Code](https://claude.com/claude-code)
     ```
   - Report PR URL to user

### Phase 8: GitHub Claude CI Review Loop (Orchestrator)

After the PR is opened, the GitHub Claude CI reviewer (`claude-code-action` with `code-review` plugin) will automatically review it. This phase waits for that review and fixes any findings before proceeding.

**7a. Wait for the CI review**
- Poll for the review using `gh pr checks <pr_number>` — look for the `claude-review` check
- Also check `gh pr reviews <pr_number> --json author,state,body` for review comments
- If no review yet, inform the user and ask whether to:
  - Wait and check again (re-poll)
  - Skip the CI review and proceed to Phase 9 (GitHub issue sync)
- Do NOT auto-poll in a loop — always ask the user before re-checking

**7b. Parse the CI reviewer's findings**
- If the review state is `APPROVED` → all green, proceed to Phase 9
- If the review state is `CHANGES_REQUESTED` or `COMMENTED`:
  - Fetch review comments via `gh api repos/Thilak-cm/pep-school-v2-OS/pulls/{pr_number}/comments`
  - Also fetch general review body from the review itself
  - Display the CI reviewer's findings to the user in a clear summary

**7c. Fix the CI reviewer's findings**
- Ask user for confirmation before fixing (Human Approval Gate)
- Spawn the **`code-fixer` agent** (`.claude/agents/code-fixer.md`) with:
  - The CI reviewer's comments (formatted as findings)
  - GitHub issue context
- After fixes are applied, commit and push to the same branch:
  - `git add` changed files
  - `git commit -m "fix: address CI review feedback (#<issue-number>)"`
  - `git push origin {branch}`
- The new push will trigger the CI reviewer to re-review the PR

**7d. Re-check loop**
- After pushing fixes, return to step 7a (wait for new CI review)
- Loop control:
  ```
  max_ci_review_iterations = 3

  for i in 1..max_ci_review_iterations:
      wait for CI review
      if APPROVED:
          break → proceed to Phase 9
      if i == max_ci_review_iterations:
          STOP — surface remaining CI review findings to user
          ask: "3 rounds of CI review fixes haven't resolved all issues. Proceed anyway or review manually?"
      else:
          fix findings → push → continue loop
  ```

### Phase 9: GitHub Issue Sync (Orchestrator)

1. **Add a comment on the GitHub issue:**
   ```bash
   gh issue comment <issue-number> --repo Thilak-cm/pep-school-v2-OS --body "## Review & Ship Complete
   
   **Branch:** \`{branch-name}\`
   **PR:** {pr_url}
   **Version:** {version or \"no bump\"}
   
   **Audit Summary:**
   - {N} findings found, {N} fixed across {N} iterations
   - Impact check: {verdict} — {N} downstream effects traced, {N} findings fixed
   - Final verdict: CLEAN
   - {any user decisions made}
   
   **Test Results:**
   - {pass/fail counts}
   - {lint results}
   
   **Ready for CI → merge**"
   ```

2. **The issue will be closed automatically** when the PR merges (via the `Closes #<issue-number>` link in the PR body). No manual state change needed.

## Human Approval Gates (Do Not Skip)

1. **Before fixing** — after showing the audit report, confirm user wants to proceed with fixes (or review manually)
2. **After 3 failed fix loops** — surface remaining findings, ask user to intervene
3. **All version bumps** — present recommendation with reasoning, wait for user to confirm bump type (patch/minor/major)
4. **Before fixing CI reviewer's findings** — show the CI review summary, confirm user wants auto-fix (or handle manually)
5. **After 3 failed CI review loops** — surface remaining findings, ask user whether to proceed or review manually

## Guardrails

- **Fresh session required:** This skill assumes it's running in a session that did NOT implement the code. The audit's value comes from independence.
- **Subagents do the heavy lifting:** The orchestrator does NOT read the full diff itself. It passes the diff to the audit agent. This protects main context.
- **Each audit is fresh:** Re-audits spawn a new audit agent. No memory of previous audits. This prevents the audit from becoming lenient after seeing fixes.
- **Impact check always runs:** The impact checker runs on every diff. It conditionally skips internal phases (e.g., rule cascade analysis only runs if rules changed), but Phase 1 (change classification) and Phase 2 (transitive consumer tracing) always execute. If Phase 1 finds NO external-facing changes, the agent returns NO_IMPACT quickly.
- **Max 3 fix iterations:** If 3 rounds of fix+audit don't resolve everything, stop and escalate to the user. Don't loop forever.
- **Do not merge:** This skill opens a PR. It does NOT merge into `dev`. That's `/merge-issue`'s job.
- **Do not invent test results:** Report actual test output. If tests weren't run, say so.
- **Do not push if tests fail:** Unless user explicitly accepts the risk.
- **Do not update the wrong GitHub issue:** Confirm issue number before updating.

## Success Criteria

1. GitHub issue fetched and used as source of truth for the audit
2. Audit subagent produced a structured report following the contract format
3. Impact check traced all downstream effects (transitive consumers, cross-boundary contracts, rule cascades)
4. All blockers and warnings were fixed (or user accepted remaining items)
5. Final audit verdict is CLEAN
6. Version bumped (or user chose skip) with changelog updated
7. Clean commit(s) created with issue references
8. Feature branch pushed to origin
9. PR opened against `dev` with audit + integration summary in body, and `Closes #<issue-number>` for auto-linking
10. GitHub Claude CI review is APPROVED (or user chose to skip/proceed)
11. GitHub issue commented with review summary (auto-closed on PR merge)

## Next Step

> After CI passes on the PR, run `/merge-issue` to land the change.
