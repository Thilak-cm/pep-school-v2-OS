# Implement Issue Quick Start

`/implement-issue` executes an approved `/plan-issue` plan in the same session.

## Workflow

1. Confirm the approved plan is present.
2. Create a new feature branch before editing.
3. Write tests first, implement the plan, and keep all related tests green.
4. Run local tests, lint, and build.
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
