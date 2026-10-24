---
name: spec-tpd
description: "TPD pass: grill the user on the technical approach for a PRD-complete issue. The user proposes how to build it; this skill stress-tests their proposal against the codebase, then scaffolds types, stubs, and tests. Run after /spec-prd, in a new session."
user_invocable: true
---

# Spec TPD - Technical Product Document

## Goal

Force the user to design the technical approach for a PRD-complete issue.
The user proposes; this skill challenges. After the approach converges, scaffold
the contract (types, stubs, tests) and commit it to a feature branch.

**Core constraint: never propose the approach. The user proposes, you
stress-test. If they're stuck, narrow the question - don't answer it.**

Requires a GitHub issue identifier (e.g., `#42`); ask if not provided.

## Precondition

The issue must have a completed PRD (acceptance criteria, decisions,
out-of-scope). If the issue body is vague or missing ACs, stop: "This
issue doesn't look PRD-complete. Run `/spec-prd #<issue>` first."

## Phase 1: Context Loading (Silent)

1. Fetch the issue: title, full description, ACs, decisions, out-of-scope.
2. Read `.agents/skills/codebase-context-scan/references/pep-os-overview.md`
   and extract the Area Map. **Staleness check:** if 5+ commits since or
   7+ days old, ask whether to refresh via `/codebase-context-scan` or
   proceed stale.
3. Explore the areas the ACs touch - read the actual files, not just docs.
   If the overview is insufficient, spawn the `codebase-explorer` subagent
   (focus: `"implementation"`) with the overview, target areas, issue
   context, and any files mentioned in the issue.
4. Identify the 3-5 key technical decisions this change requires (e.g.,
   where to put new logic, which existing function to extend vs. create
   new, what types to add/change, what the test surface is).
5. Find related test files (`{filename}.test.{js,jsx,mjs}`, `__tests__/`)
   for each area that will be affected. Run baseline tests and capture
   results.

**Do not share your analysis.** You need it to evaluate the user's
proposals, not to hand them the answer.

## Phase 2: The Grill - One Question at a Time

Start with a brief orientation: restate the PRD scope in one line, name the
codebase areas involved (with file paths), and ask the first question.

### Sequence

Follow this progression. Adapt based on answers - skip what they
pre-empt well, dig deeper where they're vague.

**1. "Where does this change live?"**

Ask which files/modules they think need to change. Don't name the files.
If they're wrong or incomplete, point them at the actual code: "You said
X, but the data for this actually flows through `path/file.js:42`.
How does that change your answer?"

**2. "What types or interfaces change?"**

Ask what they'd add to or change in the data shapes. Push for specifics:
field names, whether fields are optional or required, whether an existing
shape is extended or a new one is created. If a shape change ripples
(callers, validators, Firestore rules, mock data), ask if they've
accounted for each.

**3. "What does the function signature look like?"**

For each new or changed function: inputs, output, where it's called from.
Not the implementation - just the contract. Push back if the signature
doesn't match the data flow you've seen in the codebase.

**4. "What reads this data? What writes it?"**

For any data shape change: trace the read path and write path. Where is
it stored, who queries it, what format, what indexes/keys. If they miss a
consumer, name it: "There's also `path/consumer.js:87` that reads this
field. What happens to it?"

**5. "What's the test surface?"**

Ask which acceptance criteria map to which kind of test (unit, integration,
e2e). Ask what assertions would prove each AC. Don't accept "a test
that checks it works" - demand the specific assertion. "What does the
test assert? What input? What expected output?"

**6. "What are you NOT changing?"**

Force them to name what stays untouched and why. This catches scope creep
and also reveals whether they understand the blast radius. If they say
"nothing else changes" and you can see downstream consumers, challenge it.

### Grill Rules

- **One question per turn.** Inviolable.
- **Never propose the approach.** The user must propose first. If they
  say "I don't know," narrow the question: "Let me make it more specific:
  the current data for this lives in `path/file.js`. It's fetched
  by `getFoo()`. Where in that flow would your change go?" If they still
  can't answer after narrowing twice, mark it as a gap and move on.
- **Stress-test every proposal.** When the user proposes something, check
  it against what you know about the codebase. If it contradicts the
  actual code, quote the code: "You said you'd add the field to
  `StudentDoc`, but that shape is read by `buildBaseballCard()` at
  `functions/ai/baseball-card.mjs:34`. Did you account for that?"
- **Acknowledge correct answers tersely.** "That's right." Then next
  question. No praise padding.
- **Track gaps silently.** You'll need them for the summary.

## Phase 3: Summary & Approval

After working through the sequence, present the Technical Approach for
the user to review. **Frame it as their work, not yours** - you're
reflecting what they said back to them, organized:

```markdown
## Technical Approach (author: <user>)

### Files to change
- `path/file.js` - [what changes, per the user's description]

### Types / data shapes
- [New or changed types, with field-level detail]

### Function contracts
- `functionName(input) -> output` - [where called from]

### Data flow
- Read: [where data comes from]
- Write: [where data goes]

### Test surface
- [AC #N]: [test type] - [specific assertion]

### Not changing
- [Explicit list of what's untouched and why]

### Gaps
- [Anything the user couldn't answer - marked honestly]
```

Present it. Ask: "Is this what you meant? Edit anything that's wrong."
After the user approves, post it as a comment on the GitHub issue via
`gh issue comment` (not replacing the PRD body).

## Phase 4: Scaffold & Commit

After the user approves the Technical Approach, write the contract
artifacts and commit them.

1. **Create a feature branch** - `{issue-id}-{slug}` (e.g.,
   `gh-123-fix-voice-upload`). Never scaffold on `dev`, `main`, `alt-dev`,
   or a reused branch.

2. **Write type definitions and interfaces** - define the data shapes,
   function signatures, and contracts from the user's Technical Approach.
   Place them where the "Files to change" section indicates.

3. **Write stub functions** - implement every function signature with a
   body that throws `new Error('Not implemented')`. Stubs must export the
   correct interface so test files can import them.

4. **Write test cases** - per the user's Test Surface, write complete test
   files covering every acceptance criterion. Tests should import from the
   stubs and assert the expected behavior using the specific assertions
   the user defined.

5. **Run tests to confirm they fail (red)** - every test must fail with
   "Not implemented" or an assertion error, not an import/syntax error.
   If tests fail for the wrong reason, fix the scaffold until the failure
   mode is correct.

6. **Commit the scaffold:**
   - `chore: add type stubs for [feature] (#123)`
   - `test: add contract tests for [feature] (#123)`

7. **Update the GitHub issue** via `gh issue comment` with: branch name,
   list of committed files (types, stubs, tests), and "Contract committed
   - ready for implementation review."

## Next Step

> Review the committed types, stubs, and test cases on the feature branch.
> When satisfied that the contract is correct, start a **new Claude session**
> and run `/implement-issue #N`. The fresh session ensures the
> implementation agent treats the tests as an external contract, not
> something it authored.

## Guardrails

- **Never generate the approach yourself.** If the user asks "just tell
  me what to do," refuse: "The point of this step is that YOU design it.
  I'll narrow the question if you're stuck, but I won't hand you the
  answer."
- **Never skip gaps.** If the user couldn't answer something, it goes in
  the Gaps section. Don't paper over it. Those gaps are exactly what they
  need to learn before the next PR.
- **Codebase-first.** Every challenge must cite a real file and line. No
  hypothetical objections.
- **No implementation detail.** Don't ask about loop structures, variable
  names, or algorithm choice. Stay at the contract/interface level. The
  implementation is the LLM's job; the design is the user's.
- Phase 2-3 are read-only (grilling). Phase 4 writes code, but ONLY
  types, stubs, and tests - no implementation logic.
- If the approach seems too broad, suggest splitting into multiple issues.
- If the issue is already "In Progress", warn and ask before proceeding.
- If refinement gaps happen frequently, note that `/spec-prd` grilling
  may need improvement.
