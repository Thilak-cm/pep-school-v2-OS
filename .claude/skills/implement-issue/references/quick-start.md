# Quick Start

Use `/plan-issue` first, then `/implement-issue`.

## 1. Plan

```text
/plan-issue PEP-123
```

The planning command:

- loads the Linear issue
- reads the Pep OS codebase overview
- optionally launches `codebase-explorer`
- compares implementation options
- maps every acceptance criterion to tests
- records baseline results
- writes `.context/issue-plans/PEP-123.md`

It must not edit product code.

## 2. Implement

```text
/implement-issue PEP-123
```

The implementation command:

- reads `.context/issue-plans/PEP-123.md`
- uses the current Conductor workspace branch when safe
- implements with TDD
- runs local verification
- commits issue-related changes
- pushes to origin
- opens a PR against `master`
- monitors GitHub Actions

If CI fails, `/implement-issue` launches:

1. `ci-diagnostician` to inspect check status and logs.
2. `code-fixer` to patch the diagnosed blockers/warnings.

It repeats the CI repair loop up to 3 times, then escalates to the user.

## Plan Artifact

Plans live in:

```text
.context/issue-plans/PEP-{id}.md
```

`.context` is gitignored and is intended for workspace-local collaboration between agents.
