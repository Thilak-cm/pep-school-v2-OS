# Implement Issue Quick Start

`/implement-issue` fills frozen stubs against contract tests committed by `/spec-tpd`. Must run in a separate session.

## Workflow

1. Identify the issue and verify frozen artifacts exist on the branch (types, stubs, tests).
2. Run frozen tests to confirm they fail (red baseline).
3. Fill stub implementations to make tests pass (green). Do not modify frozen tests.
4. Run local tests, lint, and build. Verify no regressions.
5. Commit only after the user completes the tailored manual verification checklist.
6. Comment on the GitHub Issue with the branch, commits, files, and local verification results.

Remote CI, PR review feedback, conflict resolution, and merging belong to `/merge-issue` after `/review-issue` opens the PR.

## GitHub Issue update

The implementation comment should report:

- Branch and commit hashes
- Files modified
- Test coverage for each acceptance criterion
- Local test, lint, and build results
- Manual verification status

The implementation skill does not close the issue or change it to Done.
