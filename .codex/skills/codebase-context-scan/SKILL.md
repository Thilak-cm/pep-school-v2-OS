---
name: codebase-context-scan
description: Generate and refresh a curated high-level Pep OS codebase overview markdown file. Use at minor/major releases or when the app context reference is stale.
user_invocable: true
---

# Codebase Context Scan

## Goal

Produce a deterministic, compact codebase overview that other skills can read without scanning the full repository.

## When to use

- Minor or major version release
- The context reference is stale or missing
- A user asks for high-level orientation to Pep OS

## Workflow

1. Generate the overview artifact.
   - Run: `node .codex/skills/codebase-context-scan/scripts/generate-overview.mjs`
2. Validate required sections exist.
   - Run: `rg "^## " .codex/skills/codebase-context-scan/references/pep-os-overview.md`
3. Review for obvious drift (roles, area tags, key paths, recent changes).
4. Keep this artifact committed so other agents can reuse the same context.

## Output Contract

The generated file must be:

- Path: `.codex/skills/codebase-context-scan/references/pep-os-overview.md`
- Deterministic section order
- Optimized for issue drafting context (not implementation roadmaps)
- The source of truth for `area_tag` values used by deep dives

## Guardrails

- Do not do deep file-level analysis in this skill.
- Keep headings and table schemas stable to avoid breaking downstream parsers.
- Prefer concise summaries over exhaustive inventories.
