---
name: codebase-context-deep-dive
description: Generate scoped deep-dive markdown reports for one or more Pep OS area tags using the high-level overview as the scope map.
user_invocable: true
---

# Codebase Context Deep Dive

## Goal

Generate focused, reusable deep-dive reports for specific product areas without rescanning the whole codebase during issue drafting.

## Required Input

- Overview file: `.claude/skills/codebase-context-scan/references/pep-os-overview.md`
- One or more `area_tag` values from the overview's `## Area Map`

## Workflow

1. Read the overview file and extract candidate `area_tag` values.
2. Select the smallest area set that answers the issue context gap.
3. Generate reports:
   - Single area: `node .claude/skills/codebase-context-deep-dive/scripts/generate-deep-dive.mjs --area <area_tag>`
   - Multiple areas: repeat `--area <area_tag>` for each one
4. Review generated sections for concrete architecture/data-flow signals.
5. Reuse these reports in later issue drafting when area tags match.

## Output Contract

- Output directory: `.claude/skills/codebase-context-deep-dive/references/deep-dives/`
- Filename: `<area_tag>.md`
- Update mode: replace in-place for the same area tag
- Stable heading schema to keep downstream usage predictable

## Usage Rules for Issue Drafting

- Auto-load existing deep-dive report(s) when area tags match.
- If context is still insufficient, ask user confirmation before generating/updating deep dives.
- Maximum refinement rounds per issue: 2.

## Guardrails

- Do not regenerate the high-level overview here.
- Do not expand scope beyond requested/matched area tags.
- Keep reports oriented toward issue clarification, constraints, and boundaries.
