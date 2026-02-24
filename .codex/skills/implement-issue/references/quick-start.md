# Quick Start: Using the Implement Issue Skill

## What This Skill Does

The `implement-issue` skill bridges the gap from Linear issue creation to implementation by:
1. Helping you select which Linear issue to work on
2. Auto-loading relevant codebase context and deep-dives
3. Generating a technical execution plan with specific file paths
4. Discovering existing tests and establishing baseline
5. Getting your approval before any code changes
6. Implementing the changes using Test-Driven Development (TDD)
7. Syncing your progress back to Linear with test results

## When to Use It

- ✅ You want to start work on a Linear issue
- ✅ You need a structured plan before writing code
- ✅ You want to enforce comprehensive test coverage
- ✅ You want to track implementation progress in Linear
- ✅ You're working on an issue from the "Pep school v2 os" Linear workspace

## Quick Start: Two Ways

### Option 1: Direct Skill Invocation
```
/implement-issue
```

The skill will interactively guide you through all 7 phases.

### Option 2: Ask to Start Implementation
```
"Start implementing that voice transcription timeout fix"
"I need to work on a voice recording issue"
"Start implementation of a Linear issue"
```

## What Happens Next

### Phase 1: Issue Selection
The skill asks you to specify filters:
- **Assignee** (default: you)
- **State** (default: Todo)
- **Team** (default: Pep school v2 os)
- **Labels** (optional: observation-capture, voice-processing, etc.)
- **Priority** (optional)

You then select which issue to work on from the filtered results.

### Phase 2: Context Loading
The skill automatically:
- ✅ Reads the Pep OS codebase overview
- ✅ Infers relevant area tags from your issue's labels
- ✅ Loads area-specific deep-dive reports
- ✅ Extracts requirements and acceptance criteria from Linear

No action needed—this happens automatically.

### Phase 3: Plan Generation
The skill creates a technical execution plan including:
- Summary of the implementation approach
- Specific files to modify and files to create
- **Test specification for each acceptance criterion** (critical)
- Step-by-step implementation approach

This plan is comprehensive and ready for review.

### Phase 4: Test Discovery
The skill:
- 🔍 Finds existing test files for affected code
- ▶️ Runs baseline tests to check current status
- 📊 Identifies gaps in test coverage
- ⚠️ Reports any existing test failures

You see the baseline results before implementation starts.

### Phase 5: Plan Approval
The skill presents the complete plan and asks: **"Approve this plan? (yes/no/edit)"**

- **yes**: Proceed to implementation
- **no**: Go back to re-planning
- **edit**: Request specific changes to the plan

**Important:** No files will be modified until you approve.

### Phase 6: Implementation (TDD)
The skill:
1. Creates a git branch named like `PEP-123-fix-voice-timeout`
2. Writes failing tests (RED phase) for each acceptance criterion
3. Implements code to pass tests (GREEN phase)
4. Refactors code for quality (REFACTOR phase)
5. Creates separate commits for tests and implementation
6. Verifies all tests pass with no regressions

**Key: Tests are written BEFORE implementation code**

### Phase 7: Linear Sync
The skill:
- 📝 Creates a comment on the Linear issue with:
  - Git branch name
  - All commit hashes
  - Files modified
  - Test coverage summary (which criteria are tested)
  - Test results (all passing, no regressions)
- 🔄 Updates issue state to "In Review"
- ✅ Marks implementation as complete and ready for review

## Example Flow

```
You: "Let me work on that voice transcription bug"

Skill: [Shows filtered issues]
  [1] PEP-156 Fix voice note timeout [High] [bug, voice-processing]
  [2] PEP-145 Add voice duration limit [Normal] [feature]

You: 1

Skill: [Auto-loads context, generates plan]
  Files to Modify: 4
  Acceptance Criteria: 4
  New Tests Required: 8

  Approve this plan? (yes/no/edit)

You: yes

Skill: [Creates branch PEP-156-fix-voice-timeout]
       [Writes 4 failing tests]
       [RED] 4 tests failing (expected)

       [Implements timeout logic]
       [GREEN] 4 tests passing

       [Refactors code for clarity]
       [REFACTOR] All tests still passing

       [Creates commits with issue reference]

       [Updates Linear with test results]
       [Issue state → "In Review"]

Skill: ✅ Implementation complete! Check Linear for progress details.
```

## Key Guarantees

### ✅ Test Coverage Enforced
- Every acceptance criterion MUST have at least one test
- No exceptions—this is a hard requirement
- Implementation is blocked if test coverage is incomplete

### ✅ No Regressions
- All existing tests continue passing
- Baseline tests run before implementation
- Implementation is blocked if existing tests fail

### ✅ TDD Process Enforced
- Tests written BEFORE implementation code
- RED phase: Test fails (captures requirement)
- GREEN phase: Code passes test
- REFACTOR phase: Code improved while tests stay green

### ✅ Linear Always Updated
- Branch name linked to issue
- All commits reference issue ID
- Test results clearly documented
- Issue moved to "In Review" when complete

## Test Specification Section

When the skill generates the plan, you'll see a **Test Specification** section like this:

```
### Acceptance Criterion 1: Voice notes under 60s should transcribe within 10s
- **Test Type:** Integration
- **Test File:** `montessori-os/src/services/voiceTranscription.test.js`
- **Test Description:** Should transcribe audio under 60 seconds within 10 seconds
- **Edge Cases:**
  - Very short audio (< 5s) should still work
  - Exact 60s boundary
  - Network latency variations
```

This specification tells you:
- **What to test** (the acceptance criterion)
- **Where to put the test** (which file)
- **What behavior to verify** (test description)
- **What edge cases to cover** (edge cases)

You'll implement tests based on these specs before writing any implementation code.

## File Structure Created

The skill is organized in `.codex/skills/implement-issue/`:

```
implement-issue/
├── SKILL.md                    # Main workflow definition (7 phases)
├── agents/openai.yaml          # Agent configuration
└── references/
    ├── quick-start.md          # This file!
    ├── workflow-example.md     # Complete walkthrough of a real scenario
    └── tdd-testing-guide.md    # Detailed TDD philosophy and patterns
```

**SKILL.md** contains:
- Complete 7-phase workflow description
- Details on each phase including steps and tools used
- Edge case handling
- Guardrails and blocking conditions
- Success criteria

**references/workflow-example.md** shows:
- Real-world example from issue selection through Linear sync
- Actual test code and implementation examples
- Complete output at each phase
- What success looks like

**references/tdd-testing-guide.md** explains:
- Why TDD is used in this skill
- Red-Green-Refactor cycle details
- Test types (Unit, Integration, E2E) and when to use each
- Best practices for writing tests
- Common testing patterns in Pep OS

## FAQ

### Q: What if I don't agree with the generated plan?
**A:** During Phase 5 (Plan Approval), select "edit" and request changes. The skill will regenerate the plan with your adjustments.

### Q: Can I skip writing tests?
**A:** No. Tests are mandatory for every acceptance criterion. This is a hard requirement of the skill. It prevents regressions and ensures quality.

### Q: What if baseline tests are failing?
**A:** The skill warns you during Phase 4 (Test Discovery). You can choose to fix those first or proceed. If failures are in code you're modifying, it's recommended to fix first.

### Q: Do I have to accept the suggested test locations?
**A:** No. You can modify the test specifications during Phase 5 (Plan Approval) to put tests in different files if that makes more sense.

### Q: What if the generated plan seems incomplete?
**A:** You can request edits during Phase 5. Common requests: "Split this into 2 acceptance criteria", "Add more edge cases to test", "Modify which files to change".

### Q: Does the skill create a PR automatically?
**A:** No, but it updates the Linear issue with branch and commits so you can easily create a PR. The issue moves to "In Review" to signal it's ready.

### Q: Can I use this for bug fixes?
**A:** Yes! Bug fixes follow the same workflow:
1. Test captures the bug (currently failing)
2. Implementation fixes the bug
3. Test now passes and regression is prevented

### Q: What if I'm in the middle of implementation and need to pause?
**A:** Just commit your work to git. The next time you invoke the skill, you can continue from where you left off by updating the Linear issue state.

## Getting Help

For detailed information:
- **7-Phase Workflow Details**: See SKILL.md
- **Real Example Walk-through**: See references/workflow-example.md
- **TDD Philosophy & Patterns**: See references/tdd-testing-guide.md

For issues with the skill:
- Report at https://github.com/anthropics/claude-code/issues
- Include which phase you're in and what went wrong

## Next Steps

Ready to start? Just say:

```
/implement-issue
```

Or simply:

```
Help me start implementing a Linear issue
```

The skill will guide you through the rest! 🚀
