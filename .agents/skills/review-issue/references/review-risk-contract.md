# Human Review Risk Contract

The independent review must produce this assessment after the final diff and fix loop are complete. The assessment is copied into the PR body and is the merge skill's human-oversight gate.

## Required fields

```markdown
## Human Review Required

**Risk:** Low | Medium | High | Critical
**Required Oversight:** Normal review | Focused review | Close human review | Explicit approval
**Confidence:** Low | Medium | High
**Risk Drivers:** [Changed surfaces and why they matter]
**Review Focus:** [Files, flows, permissions, data contracts, or failure modes to inspect first]
**Required Evidence Before Merge:** [Tests, named human review, manual verification, rollback/migration checks]
**Rollback Difficulty:** Easy | Moderate | Difficult
```

## Levels

- **Low:** Isolated UI, copy, styling, or localized refactor. Normal review is sufficient.
- **Medium:** Feature behavior, several related files, or local data-flow changes. A focused human review is required.
- **High:** Security rules, roles, shared infrastructure, Firestore schema, Cloud Functions, AI model/prompt behavior, migrations, or broad cross-area changes. A named human must review the PR's stated focus before merge.
- **Critical:** Authentication/authorization, destructive data operations, production migrations, secrets, billing, or changes with difficult rollback. A designated human approver must explicitly approve the merge.

## Assessment rules

- Score the changed surfaces and downstream reach, not line count.
- Use the highest applicable level; risks do not average down.
- If evidence is missing, lower confidence rather than lowering the risk level.
- A review fix that introduces a new sensitive surface requires re-scoring the assessment.
