# Current Issue Workflow

This file replaces the historical pipeline redesign notes. The canonical workflow is:

```text
/draft-github-issues → /spec-issue → /plan-issue → /implement-issue
                                             ↓
                                      /review-issue
                                             ↓
                                      /merge-issue
```

## Ownership

- `/draft-github-issues`: Extract and create lightweight GitHub Issues from meeting transcripts.
- `/spec-issue`: Resolve product intent, acceptance criteria, decisions, and scope.
- `/plan-issue`: Produce and get approval for one technical implementation path.
- `/implement-issue`: Implement with TDD, run local verification, and perform manual verification.
- `/review-issue`: Independently audit the diff, assess human-review risk, fix findings, and open the PR.
- `/merge-issue`: Monitor PR CI and review feedback, resolve conflicts, obtain merge approval, merge into `dev`, and clean up.

## Repository conventions

- Skills live under `.agents/skills/`.
- Agent definitions currently live under `.claude/agents/` for compatibility with the configured agent loader.
- GitHub Issues and GitHub Projects are the system of record for new work.
- Remote CI begins with the PR lifecycle; implementation performs local verification first.
