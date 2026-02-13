# Claude Skill Onboarding (Linear Issue Creation)

This repo shares a Claude skill for creating Linear issues:

- Skill command: `/create-linear-issue`
- Skill file: `.claude/skills/create-linear-issue/SKILL.md`
- Goal: clarify -> draft -> review -> create in Linear

## What Is Shared vs Local

Shared in git:

- `.claude/skills/create-linear-issue/SKILL.md`
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
3. Connect Linear in Claude (or sign in again if already connected).
4. Optional: bootstrap local permissions:
   - `cp .claude/settings.local.example.json .claude/settings.local.json`
5. Confirm Linear access:
   - Workspace access is active.
   - Team access includes `Pep school v2 os`.
6. Run a smoke test prompt in Claude:
   - `Use /create-linear-issue to create a feature request draft for adding a parent monthly summary page.`
7. Verify behavior:
   - Claude asks clarifying questions first.
   - Claude shows a draft before creating anything.
   - Claude asks for explicit approval before issue creation.

## Meeting Demo Flow

1. Start with a real request from the founder.
2. Trigger `/create-linear-issue`.
3. Answer clarifying questions.
4. Review the generated draft together.
5. Approve creation and confirm:
   - title is concise
   - priority is correct
   - team is `Pep school v2 os`
   - labels/state are correct
6. Open the created Linear issue link and confirm quality.

## Expected Output Quality

Each issue should include:

- Summary (what and why)
- Feature details or bug details (whichever applies)
- Context
- Out of scope
- Clear, testable acceptance criteria

If acceptance criteria grows too large (more than 3 major checks), split into multiple issues.

## Troubleshooting

- `/create-linear-issue` not available:
  - Re-open Claude in the repo root.
  - Check that `.claude/skills/create-linear-issue/SKILL.md` exists.
- Claude cannot create Linear issues:
  - Reconnect Linear integration.
  - Confirm team membership and issue creation permissions.
- Wrong team or status in draft:
  - Correct it before approval; creation should happen only after explicit confirmation.
