# Claude Skill Onboarding

This repo shares Claude skills for GitHub issue management:

- `/draft-linear-issues` — Batch-triage meeting notes into lightweight Backlog issues
  - Skill file: `.claude/skills/draft-linear-issues/SKILL.md`
  - Goal: paste notes -> extract items -> walk through one-at-a-time -> create Backlog issues
- `/spec-issue` — Spec an existing issue with full context, clarifying questions, and polished descriptions
  - Skill file: `.claude/skills/spec-issue/SKILL.md`
  - Goal: fetch issue -> load context -> clarify -> draft spec -> review -> update issue

## What Is Shared vs Local

Shared in git:

- `.claude/skills/spec-issue/SKILL.md`
- `.claude/skills/draft-linear-issues/SKILL.md`
- `.claude/settings.json` (non-sensitive project defaults)
- `.claude/README.md` (this guide)

Kept local only (gitignored):

- `.claude/settings.local.json` (machine/user-specific permissions)
- Any other `*.local.json` inside `.claude/`

Shared template:

- `.claude/settings.local.example.json` (optional starter for local permissions)

## Founder Setup (5-10 Minutes)

1. Clone or pull latest `main`.
2. Open the repo in Claude from this folder root.
3. Connect GitHub in Claude (or sign in again if already connected).
4. Optional: bootstrap local permissions:
   - `cp .claude/settings.local.example.json .claude/settings.local.json`
5. Confirm GitHub access:
   - Repository access is active.
6. Run a smoke test prompt in Claude:
   - `Use /draft-linear-issues to triage meeting notes into Backlog issues.`
7. Verify behavior:
   - Claude extracts action items from the notes.
   - Claude walks through each item one-at-a-time.
   - Claude asks for explicit approval before creating each issue.

## Spec Demo Flow

1. Create some Backlog issues via `/draft-linear-issues`.
2. Pick one to spec: `/spec-issue #42`.
3. Answer clarifying questions.
4. Review the spec draft together.
5. Approve the update and confirm:
   - title is concise
   - priority is correct
   - labels/state are correct
   - state moved from Backlog to Todo
6. Open the updated issue link and confirm quality.

## Expected Output Quality

Each specced issue should include:

- Summary (what and why)
- Feature details or bug details (whichever applies)
- Context
- Out of scope
- Clear, testable acceptance criteria

If acceptance criteria grows too large (more than 3 major checks), split into multiple issues.

## Troubleshooting

- `/spec-issue` not available:
  - Re-open Claude in the repo root.
  - Check that `.claude/skills/spec-issue/SKILL.md` exists.
- `/draft-linear-issues` not available:
  - Re-open Claude in the repo root.
  - Check that `.claude/skills/draft-linear-issues/SKILL.md` exists.
- Claude cannot create/update issues:
  - Reconnect GitHub integration.
  - Confirm repository access and issue creation permissions.
- Wrong labels or status in draft:
  - Correct it before approval; updates should happen only after explicit confirmation.
