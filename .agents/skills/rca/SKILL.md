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

Optional. The user may invoke this skill in several ways:

- `/rca` bare - pick up the bug from conversation context (e.g., something just failed during implementation)
- `/rca <issue-id>` - fetch a bug report from the issue tracker
- `/rca <symptom>` - user describes or pastes an error, stack trace, or unexpected behavior
- `/rca` after a failed implementation - something didn't work as expected, need to figure out why

## Workflow

### Phase 1: Symptom Intake

Normalize whatever input you received into a structured symptom statement. This is the anchor for everything that follows.

**Steps:**

1. **Gather raw input from the available source:**

   - **Conversation context:** If the user just hit a problem (failed test, unexpected behavior during implementation), extract what happened from the conversation.
   - **Issue tracker:** If an issue ID is provided, fetch the issue description, steps to reproduce, expected vs actual behavior.
     # [WORKSPACE] Issue tracker tool for fetching issues - configure in workspace/config.md
   - **User description:** If the user described a symptom or pasted an error, use that directly.
   - **Bare invocation:** If no context is obvious, ask the user: "What broke?"

2. **Build the symptom statement:**

   ```
   ## Symptom Statement

   **What should happen:** {expected behavior}
   **What actually happens:** {actual behavior - error message, wrong output, crash, silent failure}
   **Where it surfaces:** {UI, test, console, logs, build, deploy}
   **When it started:** {if known - after a specific commit, deploy, dependency update, or unknown}
   **Frequency:** {always, intermittent, environment-specific}
   ```

3. **Fill gaps by reading code, not asking the user.** If the symptom mentions a file, function, or component - read it. Only ask the user for information you genuinely cannot get from the codebase (e.g., "Does this happen in production or just locally?").

4. **Present the symptom statement to the user** for confirmation before proceeding. If anything is wrong or missing, correct it now.

### Phase 2: Reproduction

Prove the bug exists independently. A bug you can't reproduce is a bug you can't confidently fix.

**Steps:**

1. **Determine the reproduction method** based on where the bug surfaces:

   | Surface | Reproduction approach |
   |---------|----------------------|
   | Failing test | Run the specific test and confirm the failure |
   | Console/runtime error | Run the app or function and trigger the code path |
   | Build/lint error | Run the build/lint command |
   | UI behavior | Ask user to reproduce manually via a checklist, or use Playwright if available |
   | Data issue | Query or inspect the data directly |
   | Intermittent | Identify conditions, attempt to reproduce with those conditions isolated |

2. **Reproduce in a setup closest to the user's real environment.** Don't simplify the reproduction environment unless forced to - simplified setups mask real interactions.

3. **Capture the reproduction evidence:**
   - Exact command or steps that trigger the bug
   - Full error output (stack trace, assertion failure, wrong value)
   - Relevant log lines

4. **If you cannot reproduce independently:**
   - State what you tried and what happened instead
   - Ask the user to verify manually using a specific checklist
   - Wait for confirmation before proceeding
   - If the user confirms it reproduces for them but not for you, investigate environment differences

5. **If the reported bug does not reproduce:**
   - Report this finding clearly: "I cannot reproduce this bug. Here's what I tried: {steps}. The result was: {actual result, which matches expected behavior}."
   - Ask the user whether to dig deeper or close it out
   - Do NOT proceed to root cause tracing on a bug you haven't proven exists

**Output:** Confirmed reproduction with evidence, or a clear statement that it doesn't reproduce.

### Phase 3: Root Cause Tracing

Trace from the symptom back to the actual defect. The root cause is the specific code (or configuration, or data) that is wrong - not the symptom it produces.

**Steps:**

1. **Start from the failure point and trace backwards.**
   - Read the stack trace or error location
   - Follow the call chain upstream: what called the failing code? What inputs did it receive? Where did those inputs come from?
   - Use Grep to trace references, imports, and call sites

2. **Use elimination, not guessing.**
   - Form a hypothesis about what's wrong
   - Find evidence that confirms or eliminates it
   - If eliminated, form the next hypothesis
   - Do NOT stop at the first plausible explanation - verify it

3. **Distinguish symptom from cause.**
   - The error message is the symptom. The root cause is WHY that error happens.
   - A null reference error is a symptom. The root cause might be: a missing null check, an upstream function returning null when it shouldn't, a race condition, a schema mismatch, etc.
   - Keep asking "but WHY?" until you reach the actual defect.

4. **Check for scope of impact.**
   - Does this same root cause affect other code paths?
   - Are there other callers of the broken function that are silently affected?
   - Is this a single-site bug or a systemic issue?

5. **If the codebase is complex, spawn a codebase-explorer agent** to trace the data flow or call chain through the relevant area. Pass:
   - `exploration_focus`: `"integration"` (trace how the broken code connects to its callers/consumers)
   - `issue_context`: The symptom statement + your current hypothesis
   - `target_areas`: Inferred from the files involved

**Output:** A specific root cause statement pointing to exact file(s) and line(s).

### Phase 4: Proof

Prove that the identified root cause actually causes the symptom. This is the gate that prevents premature fixes.

**Steps:**

1. **Construct a causal argument:**

   ```
   ## Root Cause Proof

   **Root cause:** {what is actually wrong - specific code, logic, config}
   **Location:** `{file_path}:{line_range}`
   **Causal chain:** {step-by-step: how the defect at the root cause location produces the observed symptom}
   **Why this is the root cause and not just a symptom:** {what distinguishes this from a downstream effect}
   ```

2. **Validate the causal chain with at least one of these methods:**

   | Method | When to use |
   |--------|-------------|
   | **Test isolation** | Write or modify a test that targets the root cause directly - if the test fails in the same way as the bug, causation is confirmed |
   | **Code trace** | Walk through the code path step by step showing how the defect at the root cause propagates to the symptom |
   | **Elimination** | Show that changing only the root cause (mentally or via a minimal edit) would eliminate the symptom |
   | **Bisection** | If the bug is a regression, use git log/bisect to find the commit that introduced it - then show what that commit changed at the root cause location |

3. **Present the proof to the user** before proceeding to the fix. The user must agree this is the root cause.

4. **If the user disagrees or has additional information:**
   - Incorporate their feedback
   - Return to Phase 3 with the new information
   - Do NOT proceed to fixing until the root cause is agreed upon

**GUARDRAIL:** Do not proceed to Phase 5 without explicit user agreement on the root cause.

### Phase 5: Fix

Apply the minimal correct fix for the proven root cause. Delegate the actual code changes to the code-fixer agent.

**Steps:**

1. **Determine fix scope:**

   - **Single-site fix:** The root cause is in one location, fix is contained
   - **Multi-site fix:** The root cause affects multiple callers or has cascading effects (identified in Phase 3 step 4)
   - **Systemic fix:** The root cause is a pattern applied incorrectly across the codebase

2. **Prepare the fix specification for the code-fixer agent:**

   Build a structured fix report in the code-auditor's finding format so the code-fixer can consume it directly:

   ```markdown
   # Fix Report - RCA Finding

   ## Metadata
   - **Issue:** {symptom summary}
   - **Root cause:** {root cause statement}
   - **Audit verdict:** HAS_FINDINGS

   ## Findings

   ### Blockers

   #### {Root cause title}
   - **File:** `{file_path}:{start_line}-{end_line}`
   - **Category:** correctness
   - **What's wrong:** {root cause description}
   - **Why it matters:** {how it produces the observed symptom}
   - **Suggested fix:** {specific, actionable fix instruction}
   - **Reference pattern:** `{file_path}:{line}` - {if a correct pattern exists elsewhere in the codebase}
   ```

   If the root cause has multiple fix sites, add each as a separate finding.

3. **Spawn the code-fixer agent** with the fix report.

4. **After the fixer completes, verify the fix:**

   a. **Re-run the reproduction steps from Phase 2.** The bug must no longer reproduce.
   b. **Run related tests** to check for regressions.
   c. **If the proof method was a test (Phase 4):** Run that test - it should now pass.

5. **If verification fails:**
   - Read what the fixer changed
   - Determine if the fix was incorrect or incomplete
   - Either adjust the fix specification and re-run the fixer, or apply a targeted correction directly
   - Re-verify
   - Max 3 fix iterations. If still failing, escalate to user.

6. **Manual verification gate:**
   - Present a tailored verification checklist to the user based on the bug type:
     - For UI bugs: specific screens to check, interactions to try
     - For data bugs: specific records/queries to verify
     - For logic bugs: specific inputs to test and expected outputs
     - For the original reproduction steps: confirm the bug no longer occurs
   - Ask the user: "Have you verified the fix?" (Yes / Found issues)
   - If "Found issues": investigate, adjust, re-verify
   - If "Yes": proceed to wrap-up

### Phase 6: Wrap-up

Document what happened and leave the codebase clean.

**Steps:**

1. **Summarize the RCA** for the user (not for a file - just in conversation):

   ```
   ## RCA Summary

   **Symptom:** {what was observed}
   **Root cause:** {what was actually wrong}
   **Fix:** {what was changed}
   **Files modified:** {list}
   **Verification:** {how the fix was verified - test, manual, both}
   ```

2. **If an issue ID was provided:** Ask the user if they want a comment posted to the issue with the RCA summary.
   # [WORKSPACE] Issue comment tool - configure in workspace/config.md

3. **If the fix is on a feature branch:** The changes are ready to commit. Remind the user but do NOT commit automatically - follow the trunk/leaf rules from the user's workflow.

4. **If the root cause revealed a systemic issue** (Phase 3 step 4 found multiple affected sites): Flag this clearly. Recommend creating a separate issue for the broader fix if it's beyond the scope of the immediate bug.

## Style Rules

- **Investigator tone.** You're debugging, not lecturing. Short, factual statements. Show your work.
- **Evidence over opinion.** Every claim about the root cause must point to specific code. "I think the problem is..." is not acceptable. "The problem is at `file.js:42` because..." is.
- **No speculative fixes.** If you're not sure, keep tracing. A wrong fix is worse than no fix.
- **Concise updates.** Keep the user informed at phase transitions, not during every grep. Don't narrate your investigation step-by-step unless stuck.

## Guardrails

- **No fix without reproduction.** If you can't reproduce, you can't fix. Phase 2 is mandatory.
- **No fix without proof.** Phase 4 is mandatory. The user must agree on the root cause.
- **No fix without verification.** Phase 5 step 4-6 is mandatory. The fix must be proven to resolve the symptom.
- **Read-only until Phase 5.** Phases 1-4 are investigation only. No file modifications until the fix phase.
- **Minimal fix scope.** Fix the root cause. Don't refactor surrounding code, add "while we're here" improvements, or clean up unrelated issues.
- **Max 3 fix iterations.** If the fix doesn't stick after 3 attempts, escalate to the user with full context.
- **Trunk code requires user approval before commit.** Always. No exceptions.

## Edge Cases

**Bug doesn't reproduce:**
- Report clearly, ask user for more context or environment details
- Do NOT guess at a fix based on code reading alone

**Multiple potential root causes:**
- Trace each one. Eliminate until one remains.
- If two genuine root causes contribute to the same symptom, fix both (separate findings for the fixer)

**Root cause is in a dependency / third-party code:**
- Identify the root cause clearly
- The fix becomes a workaround in your code - document why
- Flag the upstream issue for the user to report

**Root cause is a data issue, not a code issue:**
- Identify the bad data and how it got there
- The code fix is adding validation/handling for the bad data state
- Flag the data cleanup as a separate action for the user

**User disagrees with the root cause:**
- Don't argue. Ask what they think the root cause is.
- Investigate their hypothesis with the same rigor
- Present evidence for both and let the user decide

## Customization Points

When pulling this skill into a project, consider adapting:

- **Reproduction tooling.** Add project-specific reproduction commands (e.g., seed scripts, emulator setup, test harness commands).
- **Common root cause patterns.** Pre-populate patterns the project frequently encounters (e.g., "race conditions in the save queue", "stale cache after role change").
- **Fix verification commands.** Add project-specific test and lint commands for Phase 5 verification.
- **Environment checklist.** Add project-specific environment checks for intermittent bugs (e.g., "check emulator vs production Firestore", "check feature flag state").
