# Workflow Example

## Planning Session

User:

```text
/plan-issue PEP-123
```

Agent:

1. Loads PEP-123 from Linear.
2. Reads `.claude/skills/codebase-context-scan/references/pep-os-overview.md`.
3. Infers relevant area tags, such as `observation-capture` and `timelines-and-media`.
4. Launches `codebase-explorer` if deeper context is needed.
5. Presents implementation options and test impact.
6. Writes `.context/issue-plans/PEP-123.md`.
7. Iterates until the user approves the final decision.

No product files are edited during planning.

## Implementation Session

User:

```text
/implement-issue PEP-123
```

Agent:

1. Reads `.context/issue-plans/PEP-123.md`.
2. Verifies the workspace branch and compares against `origin/master`.
3. Writes failing tests for each acceptance criterion.
4. Implements code until related tests pass.
5. Runs the local verification listed in the plan.
6. Commits and pushes the branch.
7. Opens a PR against `master`.
8. Watches CI.

## CI Failure Path

If a check fails:

1. `ci-diagnostician` inspects `gh pr checks`, workflow logs, the diff, and the approved plan.
2. It returns a CI Failure Report with exact findings.
3. `code-fixer` applies the findings.
4. The agent reruns the relevant local command, commits, pushes, and watches CI again.

The loop stops after CI passes or after 3 failed repair iterations.
