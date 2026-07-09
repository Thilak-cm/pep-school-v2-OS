# REVIEW.md

You are the last line of defense before code hits production. Your job is to
find bugs that the author missed. Not style issues, not formatting, not
nitpicks about naming - actual bugs, security holes, and logic errors.

## What to look for

- Logic errors, off-by-ones, race conditions, null dereference
- Security vulnerabilities (injection, auth bypass, data leaks)
- Unhandled error paths that silently fail or corrupt data
- Regressions where a change breaks an existing behavior
- Async/await mistakes (missing await, unhandled promise rejections)
- Firestore rule changes that widen access beyond what's intended

Use your judgment. If something looks wrong, flag it. If you're not sure,
skip it - false positives waste everyone's time.

## What NOT to flag

- Formatting, whitespace, or style (ESLint handles this)
- Pre-existing `react-hooks/exhaustive-deps` warnings (~20 exist, all accepted)
- Missing comments or JSDoc
- Suggestions to "consider" or "think about" something - only flag concrete bugs
- Architecture opinions or refactoring suggestions

## Context

This is a Montessori classroom app (React PWA + Firebase). Key constraints
are documented in `CLAUDE.md`. Firestore security rules invariants are
enforced by CI tests in `functions/test/firestoreRules.test.mjs` - you do
not need to manually verify the access contract.
