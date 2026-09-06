---
name: review-issue
description: "Independent code review in a fresh session: audit diff against GitHub issue, fix-loop until clean, version bump, commit, push, open PR against dev, and update GitHub issue status. Use after /implement-issue completes, in a NEW Claude session."
---

# Review Issue

## Goal

Attack the implementation. This skill proves the code is wrong, incomplete, or out of spec - and only ships it when it genuinely can't find anything to challenge. Runs in a **fresh Claude session** with zero sympathy for the implementer's intent.

The posture is adversarial: assume gaps, misunderstood requirements, missed edge cases, and scope deviation. The burden of proof is on the code. A "looks reasonable" pass is a failure. If the first audit comes back clean, that's suspicious - push harder.

The orchestrator stays thin. Heavy work is delegated to subagents so the main context is protected.

## Adversarial Stance

- **Challenge every AC.** Don't check "is AC1 covered?" - check "what would make AC1 fail?"
- **Distrust tests.** What paths aren't tested? What inputs break the test's assumptions?
- **Question scope.** Did it add, reinterpret, or "improve" anything beyond the spec?
- **Assume blast radius.** The impact checker exists because the reviewer should be paranoid about downstream effects.
- **Hold verification strategy accountable.** If the spec included verifier artifacts or instrumentation, check they were built. Missing verification infrastructure is a blocker.

## Workflow

### Phase 1: Context Load

1. **Identify the GitHub issue** - infer from branch name or ask the user. Fetch via `gh issue view`.
2. **Capture the diff** - `git diff dev...HEAD`, `git diff` (uncommitted), `git diff --stat dev...HEAD`, `git log --oneline dev..HEAD`.
3. **Load overview** - read `.agents/skills/codebase-context-scan/references/pep-os-overview.md`.
4. **Conditional exploration** - spawn `codebase-explorer` (focus: `"review"`) only if the diff touches 4+ files across areas, shared infrastructure (firebase.js, App.jsx, saveQueue.js, roleUtils.js, firestore.rules, storage.rules, functions/index.js), new components/services, or security rules/Cloud Functions. Otherwise the overview is sufficient.

### Phase 2: Parallel Audit

Spawn two `code-auditor` agents in parallel:

| Agent | Scope | Input |
|-------|-------|-------|
| Quick auditor | `quick` | Diff only |
| Deep auditor | `deep` | Diff + issue + overview + explore summary |

Brief the deep auditor with the adversarial stance: attack the implementation, find what would make each AC fail, identify untested paths, check scope compliance, verify that any spec'd verification infrastructure was built.

Both produce reports in the audit report contract format (`references/audit-report-contract.md`). Merge them: use the deep report's Scope Alignment, combine findings, deduplicate (same file + line range = duplicate, keep higher severity).

**Overlapped fixing:** Start fixing quick findings as soon as the quick audit returns. When the deep audit returns, run a second fixer in parallel if it touches different files, otherwise serialize after the first fixer completes.

### Phase 3: Impact Check

Spawn `impact-checker` with the diff, diff stat, issue context, and overview. It traces transitive consumers, cross-boundary contracts, security rule cascades, and behavioral side effects.

Merge impact findings (category: `impact`) into the main audit report by severity. The impact checker already classifies severity.

### Phase 4: Process Results

1. Display the full merged report to the user.
2. Resolve "Needs User Decision" items first - user decisions reclassify items.
3. If all clean, skip to Phase 6. If impact findings need fixing, spawn a fixer now.

### Phase 5: Re-audit Loop

After initial fixes, spawn a fresh `code-auditor` (scope: `full`) on the updated diff. Fresh agent, no memory of prior audits.

- Clean -> Phase 6
- Findings remain -> single fixer, then re-audit
- **Max 3 re-audit iterations.** After 3, stop and escalate to user.

**UI smoke check:** If the diff touches `.jsx` component files, present a manual verification checklist before proceeding. Skip for non-UI changes.

### Phase 6: Version Bump

**Always ask the user** which bump type to apply. Present your recommendation:

- **patch** (default): bugfixes, refactors, config changes, anything modifying existing behavior without adding a new user-facing capability
- **minor**: new UI screen/component/feature, new CF endpoint, new integration
- **major**: new top-level subsystem introducing a new noun (new collections, new CFs, new UI surface). ~1 per 10-15 minors. Pattern: baseball cards, chats, media, reports, telegram bot.
- **Edge case**: mixed `fix:` and `feat:` commits - go by the primary intent of the GitHub issue.

Apply: `node scripts/version.mjs <type>`, update `CHANGELOG.md` with a Keep a Changelog entry (Added/Changed/Fixed sections as applicable).

**DATA_STRUCTURE.md update:** If the diff touches Firestore operations (new collections, new/removed/renamed fields, rule changes), update `DATA_STRUCTURE.md` to reflect changes. Show the diff to the user before committing. Skip if no schema changes.

### Phase 7: Commit + Push + PR

1. **Commit** - confirm only issue-related changes are staged. Include version files (`VERSION`, `montessori-os/package.json`, `montessori-os/src/components/VersionBadge.jsx`, `CHANGELOG.md`) and DATA_STRUCTURE.md as appropriate. Commit messages: `feat/fix: {description} (#issue)` for implementation, `chore: bump version to v{X.Y.Z}` for version.
2. **Push** - `git push origin {branch} -u`. Do NOT merge into `dev`.
3. **Open PR** via `gh pr create` targeting `dev`. Body must include `Closes #<issue-number>` and sections: Summary (1-3 bullets), Review (audit + impact verdicts with counts), Test Results, Version, Issue/Branch.

### Phase 8: GitHub Issue Sync

Comment on the issue with: branch, PR URL, version, audit summary (findings found/fixed, iterations, impact verdict), test results. The issue auto-closes on PR merge via the `Closes` link.

## Human Approval Gates

1. **Before fixing** - after showing the audit report
2. **After 3 failed fix loops** - escalate to user
3. **All version bumps** - confirm bump type

## Guardrails

- **Adversarial posture is non-negotiable.** The reviewer works against the implementation.
- **Fresh session required.** The audit's value comes from independence.
- **Subagents do heavy lifting.** The orchestrator does not read the full diff itself.
- **Each re-audit is fresh.** New agent, no memory of prior audits.
- **If the spec included a Verification Strategy,** the audit checks every item was built. Missing items are blockers.
- **Max 3 fix iterations.** Then escalate.
- **Do not merge.** This skill opens a PR. `/merge-issue` handles merging.
- **Do not invent test results.** Report actual output.

## Next Step

> After CI passes on the PR, run `/merge-issue` to land the change.
