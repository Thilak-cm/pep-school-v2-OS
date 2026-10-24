# Current Issue Workflow

This file replaces the historical pipeline redesign notes. The canonical workflow is:

```text
/draft-github-issues -> /spec-prd -> /spec-tpd -> /implement-issue
                                           |
                                    /review-issue
                                           |
                                    /merge-issue
```

## Ownership

- `/draft-github-issues`: Extract and create lightweight GitHub Issues from meeting transcripts.
- `/spec-prd`: Resolve product intent, acceptance criteria, decisions, and scope. Non-technical.
- `/spec-tpd`: User designs the technical approach (AI stress-tests), then scaffold types, stubs, and contract tests.
- `/implement-issue`: Fill frozen stubs against committed contract tests. Separate session from `/spec-tpd`.
- `/review-issue`: Independently audit the diff, assess human-review risk, fix findings, and open the PR.
- `/merge-issue`: Monitor PR CI and review feedback, resolve conflicts, obtain merge approval, merge into `dev`, and clean up.

## Session boundaries

- `/spec-prd` -> `/spec-tpd`: new session (PRD locked, technical design begins fresh)
- `/spec-tpd` -> `/implement-issue`: new session (contract frozen, implementation agent treats tests as external)
- `/implement-issue` -> `/review-issue`: new session (no implementation bias in review)

## Repository conventions

- Skills live under `.agents/skills/`.
- Agent definitions currently live under `.claude/agents/` for compatibility with the configured agent loader.
- GitHub Issues and GitHub Projects are the system of record for new work.
- Remote CI begins with the PR lifecycle; implementation performs local verification first.
