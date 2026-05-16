---
name: check-schema-sync
description: Two-layer schema sync check. Layer 1 diffs live Firestore against DATA_STRUCTURE.md. Layer 2 diffs DATA_STRUCTURE.md against MCP tool definitions. HITL approval before any edits.
user_invocable: true
---

# Check Schema Sync

## Goal

Ensure the local schema documentation (`DATA_STRUCTURE.md`) matches production Firestore, and that MCP tool definitions (`mcp-server/tools.js`) cover everything documented. Two sequential layers, each with a human-in-the-loop gate before changes.

## When to use

- Weekly maintenance check (ideally Monday morning)
- After deploying Cloud Functions that add/change Firestore fields
- After adding new collections or subcollections
- Before updating MCP tool definitions

## Layer 1: Firestore (live) vs DATA_STRUCTURE.md

### Step 1 — Sample production Firestore

Run the sampling script:

```bash
node .claude/skills/check-schema-sync/scripts/sample-firestore-schema.mjs > /tmp/firestore-schema-sample.json
```

This connects to production Firestore, samples documents from all collections and subcollections (using 3 students from different classrooms), and outputs a JSON schema with field names, types, and optionality.

### Step 2 — Read both sources

1. Read the sampling output: `/tmp/firestore-schema-sample.json`
2. Read the local schema doc: `DATA_STRUCTURE.md` (in the repo root)

### Step 3 — Diff and report

For each collection/subcollection, compare:

- **Undocumented fields**: fields present in Firestore samples but not described in `DATA_STRUCTURE.md`
- **Stale documented fields**: fields described in `DATA_STRUCTURE.md` but absent from ALL sampled docs (flag as potentially stale, but note they could be rare/optional — use judgment)
- **Type mismatches**: documented type doesn't match observed type
- **Missing collections**: collections found in Firestore not mentioned in `DATA_STRUCTURE.md`

**Important nuance for "stale" fields:**
- Fields like `isPending`, `migratedAt`, `migratedFrom` may appear in 0 sampled docs but are valid (only set during specific flows). Don't flag well-documented optional fields as stale.
- Fields explicitly marked with `?` (optional) in the TypeScript interfaces are expected to be absent from many docs.
- Focus stale warnings on fields that appear to be completely removed or renamed.

Format the report as a markdown table per collection:

```
## Layer 1: Firestore vs DATA_STRUCTURE.md

### students (5 docs sampled)
| Field | Status | Detail |
|-------|--------|--------|
| newField | UNDOCUMENTED | Found in 3/5 docs, type: string |
| oldField | POSSIBLY STALE | Documented but absent from all samples |

### students/{id}/observations (15 docs sampled)
... etc
```

If no drift is found for a collection, show: `No drift detected.`

End with a summary: total undocumented fields, total possibly stale fields, total type mismatches.

### Step 4 — HITL gate

Present the full report to the user and ask:

> "Here's the Layer 1 drift report. Would you like me to update DATA_STRUCTURE.md with these findings? I can:
> 1. Add undocumented fields to the relevant TypeScript interfaces
> 2. Mark stale fields with a deprecation comment
> 3. Skip specific items you flag
>
> Which changes should I apply? (or 'skip' to move to Layer 2 without changes)"

**Wait for user response.** Do NOT proceed without explicit approval.

### Step 5 — Apply changes (if approved)

- Edit `DATA_STRUCTURE.md` to add/update/deprecate fields as approved
- Do NOT commit yet — changes will be committed at the end if both layers are done

## Layer 2: DATA_STRUCTURE.md vs MCP tools

### Step 6 — Inventory MCP tool coverage

Read `mcp-server/tools.js` and map each tool to the Firestore collection(s) it reads:

| MCP Tool | Collections Covered |
|----------|-------------------|
| get_student | students |
| list_students | students, classrooms |
| get_observations | students/{id}/observations |
| ... | ... |

Then compare against all collections in `DATA_STRUCTURE.md`:

- **No MCP tool**: collection exists in docs but has no read tool
- **Partial coverage**: tool exists but doesn't expose all documented fields (e.g., handler filters out fields that might be useful)
- **Stale tool references**: tool references collections or fields not in docs

### Step 7 — Report

```
## Layer 2: DATA_STRUCTURE.md vs MCP Tools

### Coverage Summary
| Collection | MCP Tool | Status |
|-----------|----------|--------|
| branches | list_branches, get_branch | COVERED |
| students/{id}/ai_summaries/report_{ts} | get_ai_summary | COVERED (via generic docId param) |
| students/{id}/ai_summaries/signals | (none) | NO TOOL (but deprecated per PEP-229) |

### Missing Tools
- `testbench_access` — no read tool exists. Suggested: add `get_testbench_access` tool.

### Partial Coverage
- `list_classrooms` — handler omits `createdAt`, `updatedAt`, `createdBy` fields (intentional for list view, but full doc read not available).
```

### Step 8 — HITL gate

Present the Layer 2 report and ask:

> "Here's the MCP tool coverage report. Would you like me to:
> 1. Add new tool definitions for uncovered collections
> 2. Extend existing handlers to return additional fields
> 3. Skip specific items
>
> Which changes should I apply? (or 'skip' to finish without changes)"

**Wait for user response.** Do NOT proceed without explicit approval.

### Step 9 — Apply changes (if approved)

- Edit `mcp-server/tools.js` to add/modify tool definitions and handlers
- Follow existing patterns in the file (same `serializeTimestamps` usage, same handler signature, etc.)
- Add new tools to the `HANDLERS` map in `mcp-server/index.js`
- Add new tool names to `.claude/settings.local.json` allowlist

### Step 10 — Commit

If any changes were made in either layer:

- Stage only the files that were modified (`DATA_STRUCTURE.md`, `mcp-server/tools.js`, `mcp-server/index.js`, `.claude/settings.local.json`)
- Commit with message: `chore: sync schema docs and MCP tools with production Firestore`
- Do NOT push — let the user decide when to push

## Important constraints

- **Read-only Firestore access**: the sampling script only reads, never writes
- **No destructive changes**: never remove documented fields without user approval — mark as deprecated instead
- **Preserve formatting**: when editing `DATA_STRUCTURE.md`, match existing TypeScript interface style and markdown conventions
- **MCP tools are read-only**: only add/modify read tools, never create write tools
- **Service account required**: the sampling script needs ADC or service account credentials configured (same as other admin scripts)
