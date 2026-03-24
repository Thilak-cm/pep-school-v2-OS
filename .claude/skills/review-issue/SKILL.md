---
name: review-issue
description: "Independent code review in a fresh session: audit diff against Linear issue, fix-loop until clean, version bump, commit, push, open PR against dev, and move Linear to In Review. Use after /implement-issue completes, in a NEW Claude session."
---

# Review Issue

## Goal

Provide an independent quality gate between implementation and production. This skill runs in a **fresh Claude session** (not the one that wrote the code) and orchestrates subagents to audit the diff, fix issues, and re-audit in a loop until the code is clean — then ships it.

The orchestrator itself stays thin. Heavy work (reading diffs, auditing code, making fixes) is delegated to subagents so the main context is protected and the audit loop can run as many times as needed without degradation.

## When to Use

- After `/implement-issue` completes in a separate session
- You are in a **new Claude session** (fresh context, no implementation bias)
- The feature branch has committed or uncommitted changes ready for review
- You want the only quality gate before prod to be rigorous

## Prerequisites

- Implementation is done (code written, tests passing locally)
- A feature branch exists with the changes (committed or uncommitted)
- The Linear issue is identifiable (from branch name, session context, or user input)

## Architecture

```
Orchestrator (this skill — thin, stays in main context)
    │
    ├── Explore subagent (Task/Explore)              — only if diff is complex
    ├── Audit subagent (.claude/agents/code-auditor)  — produces structured review report
    └── Fix subagent (.claude/agents/code-fixer)      — consumes report, makes fixes
```

The audit report contract at `references/audit-report-contract.md` defines the exact format the audit agent outputs and the fix agent consumes.

## Workflow

### Phase 1: Context Load (Orchestrator)

Gather everything the audit agent will need. The orchestrator does this directly — it's lightweight.

1. **Identify the Linear issue**
   - Infer from branch name (e.g., `pep-60-report-generation-ui` → `PEP-60`)
   - Or ask the user
   - Call `get_issue` with `includeRelations=true`
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

### Phase 2: Audit Subagent

This is the core quality gate. Use the `code-auditor` agent (`.claude/agents/code-auditor.md`).

**Data to pass to the audit agent:**
- Linear issue: full title, description, acceptance criteria
- Diff: output of `git diff dev...HEAD` (committed) + `git diff` (uncommitted)
- Commit log: `git log --oneline dev..HEAD`
- Codebase overview: contents of `pep-os-overview.md`
- Explore summary (if Phase 1b ran)

The agent has the full audit report contract and review checklist baked into its system prompt — no need to repeat them.

**Output:** A structured audit report. The orchestrator parses the `Audit verdict` field.

### Phase 3: Process Audit Results (Orchestrator)

The orchestrator reads the audit report and decides next steps.

1. **Display the full audit report to the user**

2. **Handle "Needs User Decision" items first**
   - If any exist, present them to the user via `AskUserQuestion`
   - User decisions may convert items into blockers, warnings, or dismissals
   - Rewrite those items into the appropriate category before proceeding

3. **Check the verdict**
   - If `CLEAN` → proceed to Phase 5 (Version Bump)
   - If `HAS_FINDINGS` → proceed to Phase 4 (Fix Loop)

### Phase 4: Fix Loop

Loop: fix → re-audit → repeat until clean.

**4a. Spawn Fix Subagent**

Use the `code-fixer` agent (`.claude/agents/code-fixer.md`).

**Data to pass to the fix agent:**
- Blockers and warnings from the audit report (in Finding Format)
- Linear issue context: `{issue_id}: {issue_title}` + description

The agent has fix rules, test commands, and output format baked into its system prompt.

**4b. Re-Audit**

After the fix agent completes, spawn the **`code-auditor` agent again** (Phase 2) with the updated diff.

This is a fresh audit — the new audit agent has no memory of the previous audit or fixes. It reads the full diff cold. This catches cases where a fix introduced a new problem.

**4c. Loop Control**

```
max_iterations = 3

for i in 1..max_iterations:
    if verdict == CLEAN:
        break → proceed to Phase 5
    if i == max_iterations:
        STOP — surface remaining findings to user
        ask: "3 fix attempts haven't resolved all issues. Review manually?"
    else:
        spawn fix agent → spawn audit agent → continue loop
```

### Phase 5: Version Bump (Orchestrator)

Absorbed from the former `/version-update` skill. Runs inline before committing.

1. **Infer bump type** from the Linear issue and diff:
   - **patch** — bugfix, hotfix, small tweak, rule fix. Labels like `Bug`, `Fix`
   - **minor** — new feature, enhancement, new UI component, new endpoint. Labels like `Feature`, `Enhancement`
   - **major** — breaking change, major refactor (rare, always confirm)

2. **Ask user** via `AskUserQuestion`:
   ```
   Based on "{issue_title}" [{labels}]:
   Suggested bump: **minor** (new feature)
   Options: patch | minor | major | skip
   ```

3. **If not skip:**
   - Run `node scripts/version.mjs <type>` from repo root
   - Read new version from `VERSION` file
   - Read `CHANGELOG.md`, generate a new entry at the top using Keep a Changelog format:
     ```markdown
     # {version} — {YYYY-MM-DD}

     ### Added / Changed / Fixed
     - {concise, user-facing description of changes from the diff and issue}
     ```
   - Only include sections (Added, Changed, Fixed) that apply
   - Show changelog entry to user for review before proceeding
   - Apply any requested edits

### Phase 6: Commit + Push + PR (Orchestrator)

1. **Stage and commit**
   - Confirm working tree only contains issue-related changes
   - If unrelated changes exist, ask whether to split/stash/exclude
   - Stage intended files
   - If version was bumped, include version files (`VERSION`, `montessori-os/package.json`, `montessori-os/src/components/VersionBadge.jsx`, `CHANGELOG.md`) in the same or separate commit
   - Write clear commit messages:
     - Implementation: `feat: {description} (PEP-{id})` or `fix: {description} (PEP-{id})`
     - Version bump (if separate): `chore: bump version to v{X.Y.Z}`
   - Include `Co-Authored-By: Claude` signoff
   - Show commit hashes and subjects

2. **Push feature branch**
   - `git push origin {branch} -u`
   - Do NOT checkout or merge into `dev`

3. **Open PR via `gh pr create`**
   - Target branch: `dev`
   - PR title: concise, under 70 characters, references issue ID
   - PR body (use HEREDOC):
     ```markdown
     ## Summary
     {1-3 bullet points from the issue + what was implemented}

     ## Review
     - Independent audit: **passed** ({N} findings fixed in {N} iterations)
     - {if user decisions were made, note them}

     ## Test Results
     - {test pass/fail counts — truthful}
     - {lint results}

     ## Version
     - {new version if bumped, or "no version bump"}

     ## Linear
     - Issue: PEP-{id}
     - Branch: `{branch-name}`

     🤖 Generated with [Claude Code](https://claude.com/claude-code)
     ```
   - Report PR URL to user

### Phase 7: Devin Review Loop (Orchestrator)

After the PR is opened, Devin (AI code reviewer) will automatically review it. This phase waits for that review and fixes any findings before proceeding.

**7a. Wait for Devin's review**
- Poll for Devin's review using `gh pr reviews <pr_number> --json author,state,body`
- Look for a review from Devin (author login contains `devin` or similar)
- If no review yet, inform the user and ask whether to:
  - Wait and check again (re-poll)
  - Skip Devin review and proceed to Linear sync
- Do NOT auto-poll in a loop — always ask the user before re-checking

**7b. Parse Devin's findings**
- If Devin's review state is `APPROVED` → all green, proceed to Phase 8
- If Devin's review state is `CHANGES_REQUESTED` or `COMMENTED`:
  - Fetch review comments via `gh api repos/{owner}/{repo}/pulls/{pr_number}/comments --jq '.[] | select(.user.login | contains("devin"))'`
  - Also fetch general review body from the review itself
  - Display Devin's findings to the user in a clear summary

**7c. Fix Devin's findings**
- Ask user for confirmation before fixing (Human Approval Gate)
- Spawn the **`code-fixer` agent** (`.claude/agents/code-fixer.md`) with:
  - Devin's review comments (formatted as findings)
  - Linear issue context
- After fixes are applied, commit and push to the same branch:
  - `git add` changed files
  - `git commit -m "fix: address Devin review feedback (PEP-{id})"`
  - `git push origin {branch}`
- The new push will trigger Devin to re-review the PR

**7d. Re-check loop**
- After pushing fixes, return to step 7a (wait for new Devin review)
- Loop control:
  ```
  max_devin_iterations = 3

  for i in 1..max_devin_iterations:
      wait for Devin review
      if APPROVED:
          break → proceed to Phase 8
      if i == max_devin_iterations:
          STOP — surface remaining Devin findings to user
          ask: "3 rounds of Devin fixes haven't resolved all issues. Proceed anyway or review manually?"
      else:
          fix findings → push → continue loop
  ```

### Phase 8: Linear Sync (Orchestrator)

*(Renumbered from Phase 7)*

1. **Create comment on Linear issue:**
   ```markdown
   ## Review & Ship Complete

   **Branch:** `{branch-name}`
   **PR:** {pr_url}
   **Version:** {version or "no bump"}

   **Audit Summary:**
   - {N} findings found, {N} fixed across {N} iterations
   - Final verdict: CLEAN
   - {any user decisions made}

   **Test Results:**
   - {pass/fail counts}
   - {lint results}

   **Ready for CI → merge**
   ```

2. **Move issue to `In Review`**
   - Call `save_issue` with `state: "In Review"`

## Human Approval Gates (Do Not Skip)

1. **Before fixing** — after showing the audit report, confirm user wants to proceed with fixes (or review manually)
2. **After 3 failed fix loops** — surface remaining findings, ask user to intervene
3. **Version bump type** — always confirm patch/minor/major/skip
4. **Changelog entry** — show for review before committing
5. **Before pushing + opening PR** — confirm user is ready to ship
6. **Before fixing Devin's findings** — show Devin's review summary, confirm user wants auto-fix (or handle manually)
7. **After 3 failed Devin review loops** — surface remaining findings, ask user whether to proceed or review manually

## Guardrails

- **Fresh session required:** This skill assumes it's running in a session that did NOT implement the code. The audit's value comes from independence.
- **Subagents do the heavy lifting:** The orchestrator does NOT read the full diff itself. It passes the diff to the audit agent. This protects main context.
- **Each audit is fresh:** Re-audits spawn a new audit agent. No memory of previous audits. This prevents the audit from becoming lenient after seeing fixes.
- **Max 3 fix iterations:** If 3 rounds of fix+audit don't resolve everything, stop and escalate to the user. Don't loop forever.
- **Do not merge:** This skill opens a PR. It does NOT merge into `dev`. That's `/merge-issue`'s job.
- **Do not invent test results:** Report actual test output. If tests weren't run, say so.
- **Do not push if tests fail:** Unless user explicitly accepts the risk.
- **Do not update the wrong Linear issue:** Confirm issue ID before updating.

## Success Criteria

1. Linear issue fetched and used as source of truth for the audit
2. Audit subagent produced a structured report following the contract format
3. All blockers and warnings were fixed (or user accepted remaining items)
4. Final audit verdict is CLEAN
5. Version bumped (or user chose skip) with changelog updated
6. Clean commit(s) created with issue references
7. Feature branch pushed to origin
8. PR opened against `dev` with audit summary in body
9. Devin review is APPROVED (or user chose to skip/proceed)
10. Linear issue commented and moved to `In Review`

## Next Step

> After CI passes on the PR, run `/merge-issue` to land the change.
