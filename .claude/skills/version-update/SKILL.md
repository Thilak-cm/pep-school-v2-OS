---
name: version-update
description: "Bump app version, update CHANGELOG.md, commit, and push. Use after /wrapup-issue to finalize a release with a version bump and changelog entry."
---

# Version Update

## Goal

Automate the version bump + changelog workflow so it never gets forgotten after shipping a PR. Handles bump type inference, version file updates, changelog generation, and the version commit + push.

## When to Use

- After `/wrapup-issue` completes and the PR is open
- Whenever the user wants to bump the version and update the changelog
- Before a deploy when version tracking matters

## Prerequisites

- A feature branch with committed work (typically after `/wrapup-issue`)
- The Linear issue context should be available (from session context, branch name, or user input)

## Workflow

### Phase 1: Infer Bump Type

1. Gather context to determine the right bump type:
   - Read the Linear issue (title, description, labels) from session context or branch name
   - Run `git diff dev...HEAD --stat` to understand the scope of changes
   - Check recent commit messages on the branch

2. Apply these heuristics:
   - **patch** — bugfix, hotfix, small tweak, typo fix, rule fix. Labels like `Bug`, `Fix`, `Hotfix`
   - **minor** — new feature, enhancement, new UI component, new endpoint. Labels like `Feature`, `Enhancement`, `Improvement`
   - **major** — breaking change, major refactor that changes APIs or data models (rare, always confirm)

3. Present the suggestion to the user:
   ```
   Based on [issue title / labels / diff summary]:
   Suggested bump: **minor** (new feature)

   Options: patch | minor | major
   ```

### Phase 2: Human Approval Gate (Do Not Skip)

- Always present the bump type suggestion and wait for user confirmation or override
- For `major` bumps, add an extra warning that this is a breaking change bump

### Phase 3: Run Version Script

1. Run `node scripts/version.mjs <type>` from the repo root
   - This updates: `montessori-os/package.json`, `montessori-os/src/components/VersionBadge.jsx`, `VERSION`
2. Verify the script succeeded by reading the new version from `VERSION`

### Phase 4: Update CHANGELOG.md

1. Read the current `CHANGELOG.md` to understand the existing format
2. Read the current version from `VERSION` (just written by the script)
3. Generate a new entry at the top of the file, below the `# Changelog` heading, using Keep a Changelog format:

   ```markdown
   # {version} — {YYYY-MM-DD}

   ### Added
   - {new features, capabilities}

   ### Changed
   - {modifications to existing behavior}

   ### Fixed
   - {bug fixes}
   ```

4. Populate the entry from session context:
   - Linear issue title and description for the summary
   - The actual diff (`git diff dev...HEAD`) for what was implemented
   - Only include sections (`Added`, `Changed`, `Fixed`) that apply — omit empty sections
5. Each bullet should be a concise, user-facing description of the change (not internal implementation details)

### Phase 5: Show Changelog for Review

- Display the generated changelog entry to the user
- Let them tweak wording, add/remove bullets, or adjust sections before committing
- Apply any requested edits

### Phase 6: Commit + Push

1. Stage the version-bumped files:
   - `montessori-os/package.json`
   - `montessori-os/src/components/VersionBadge.jsx`
   - `VERSION`
   - `CHANGELOG.md`

2. Create a single commit:
   ```
   chore: bump version to v{X.Y.Z}
   ```
   Include `Co-Authored-By: Claude` signoff.

3. Push to the current branch (`git push`)
   - This amends the open PR with the version bump commit

4. Report success with the new version number and commit hash

## Guardrails

- Never skip the human approval gate for bump type
- Never run the version script without user-confirmed bump type
- Do not modify CHANGELOG.md entries for previous versions
- Do not merge, rebase, or switch branches — only commit and push to the current branch
- If `scripts/version.mjs` fails, report the error and stop

## Success Criteria

1. User confirmed the bump type
2. `scripts/version.mjs` ran successfully, updating all 3 version files
3. CHANGELOG.md has a new entry at the top with correct version, date, and categorized changes
4. User reviewed and approved the changelog entry
5. A single version bump commit was created and pushed to the current branch
