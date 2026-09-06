---
name: rca
description: "Root-cause-first bug fixing. Reproduces the bug, traces to root cause, proves the defect, then fixes it. Use when something broke or didn't work as expected - ad-hoc, not tied to the issue pipeline. Invoke with /rca, /rca <issue-id>, or /rca <symptom>."
allowed-tools: [Bash, Read, Grep, Glob, Agent, AskUserQuestion]
user_invocable: true
---

# RCA - Root Cause Analysis & Fix

## Goal

Prove a bug is real, find exactly why it happens, and fix it. Never patch symptoms - trace to the actual defect, prove causation, then apply the minimal correct fix.

**Core constraint: No fix without proof. Reproduce first, trace second, fix last.**

## Argument

Optional: bare (pick up the bug from conversation context), an issue ID (fetch the bug report), or a symptom description/pasted error. If no context is obvious, ask: "What broke?"

## Workflow

### Phase 1: Symptom Intake

Normalize the input into a structured symptom statement:

```
**What should happen:** {expected}
**What actually happens:** {error, wrong output, crash, silent failure}
**Where it surfaces:** {UI, test, console, logs, build, deploy}
**When it started:** {commit/deploy/unknown}
**Frequency:** {always, intermittent, environment-specific}
```

Fill gaps by reading code, not asking the user - only ask for information you genuinely cannot get from the codebase (e.g., "prod or local?"). Present the statement for confirmation before proceeding.

### Phase 2: Reproduction

Prove the bug exists independently. Pick the reproduction method that matches the surface: run the failing test, trigger the code path, run the build, ask the user to reproduce UI behavior via a checklist, or inspect the data directly. Reproduce in a setup closest to the real environment - simplified setups mask real interactions.

Capture the evidence: exact trigger, full error output, relevant logs.

- **Can't reproduce independently:** state what you tried, ask the user to verify with a specific checklist, and investigate environment differences if it reproduces only for them.
- **Doesn't reproduce at all:** report clearly what you tried and that the result matched expected behavior. Ask whether to dig deeper or close. Do NOT proceed to tracing a bug you haven't proven exists, and do NOT guess at a fix from code reading alone.

### Phase 3: Root Cause Tracing

Trace from the symptom back to the actual defect - the specific code, configuration, or data that is wrong, not the symptom it produces.

- Start at the failure point and follow the call chain upstream: what called it, what inputs, where did those come from.
- Use elimination, not guessing: form a hypothesis, find evidence that confirms or eliminates it, repeat. Do not stop at the first plausible explanation.
- Distinguish symptom from cause. A null reference error is a symptom; keep asking "but WHY?" until you reach the defect.
- Check scope of impact: does the same root cause affect other callers or code paths? Single-site or systemic?
- For complex areas, spawn a `codebase-explorer` agent (focus: `"integration"`) with the symptom statement and your current hypothesis to trace the data flow.

**Output:** a root cause statement pointing to exact file(s) and line(s).

### Phase 4: Proof

Prove the identified cause actually produces the symptom. This gate prevents premature fixes.

```
**Root cause:** {what is actually wrong}
**Location:** `{file}:{lines}`
**Causal chain:** {step-by-step from defect to observed symptom}
**Why this is the cause and not a symptom:** {what distinguishes it from a downstream effect}
```

Validate with at least one of: a test that targets the root cause and fails the same way, a step-by-step code trace, elimination (changing only the cause removes the symptom), or git bisection for regressions.

**GUARDRAIL: Present the proof and get explicit user agreement before Phase 5.** If the user disagrees or has more information, return to Phase 3. If they have their own hypothesis, investigate it with the same rigor and present evidence for both.

### Phase 5: Fix

1. Determine scope: single-site, multi-site (cascading effects from Phase 3), or systemic.
2. Build a fix report in the code-auditor finding format (File, Category: correctness, What's wrong, Why it matters, Suggested fix, Reference pattern) - one finding per fix site - and spawn the `code-fixer` agent with it.
3. Verify: re-run the Phase 2 reproduction (bug must no longer reproduce), run related tests for regressions, and run the Phase 4 proof test if one was written.
4. If verification fails: read what changed, adjust the fix spec or apply a targeted correction, re-verify. **Max 3 fix iterations**, then escalate.
5. **Manual verification gate:** present a checklist tailored to the bug type (screens/interactions for UI, records/queries for data, inputs/outputs for logic, plus the original reproduction steps). Ask "Have you verified the fix?" - if issues found, investigate and re-verify.

### Phase 6: Wrap-up

Summarize in conversation: symptom, root cause, fix, files modified, how verified.

- If an issue ID was provided, offer to post the summary as a comment.
- Changes are ready to commit but do NOT commit automatically - follow the trunk/leaf approval rules.
- If a systemic issue was revealed, flag it and recommend a separate issue for the broader fix.

## Special Cases

- **Root cause in a dependency:** fix becomes a documented workaround; flag the upstream issue for the user to report.
- **Root cause is bad data:** identify the data and how it got there; the code fix adds validation/handling, and the data cleanup is a separate user action.
- **Two genuine root causes:** fix both (separate findings for the fixer).

## Guardrails

- **No fix without reproduction. No fix without proof. No fix without verification.** All three phases are mandatory.
- **Read-only until Phase 5.** Phases 1-4 are investigation only.
- **Minimal fix scope.** Fix the root cause - no refactors, no "while we're here" improvements.
- **Evidence over opinion.** Every claim points to specific code: "The problem is at `file.js:42` because..." - never "I think the problem is...".
- **Concise updates.** Report at phase transitions, don't narrate every grep.
